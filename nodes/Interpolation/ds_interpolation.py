"""
DS Interpolation - Video Frame Interpolation Engine
Deathshot Arsenal / DS Node Pack
"""

import os
import gc
import math
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import torch
import torch.nn.functional as F

import comfy.model_management
import comfy.utils
import server
from aiohttp import web

from .model_downloader import (
    MODEL_NAMES,
    DEFAULT_MODEL,
    SUPPORTED_MODELS,
    get_all_models_status,
    ensure_model,
    is_model_installed,
)
from .rife_arch import IFNet, clear_warp_cache

logger = logging.getLogger("DeathshotArsenal.Interpolation")

# Module-level model cache: (ckpt_name, dtype_str, torch_compile) -> IFNet instance
_MODEL_CACHE: Dict[Tuple[str, str, bool], torch.nn.Module] = {}

DTYPE_MAP = {
    "float32": torch.float32,
    "f32": torch.float32,
    "float16": torch.float16,
    "f16": torch.float16,
    "bfloat16": torch.bfloat16,
    "bf16": torch.bfloat16,
}

SCALE_FACTOR_MAP = {
    "0.25": 0.25,
    "0.5": 0.5,
    "1x": 1.0,
    "1.0": 1.0,
    "1": 1.0,
    "2": 2.0,
    "2.0": 2.0,
    "4": 4.0,
    "4.0": 4.0,
}


def register_interpolation_routes():
    """Registers API routes for DS Interpolation model status and downloads."""
    prompt_server = getattr(server.PromptServer, "instance", None)
    if prompt_server is None or getattr(prompt_server, "routes", None) is None:
        return
    routes = prompt_server.routes

    def _is_registered(method: str, path: str) -> bool:
        for r in routes:
            if getattr(r, "method", None) == method and getattr(r, "path", None) == path:
                return True
        return False

    if not _is_registered("GET", "/ds/interpolation/models"):
        @routes.get("/ds/interpolation/models")
        async def get_models_handler(request):
            try:
                models = get_all_models_status()
                return web.json_response({"success": True, "models": models})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

    if not _is_registered("POST", "/ds/interpolation/download"):
        @routes.post("/ds/interpolation/download")
        async def download_model_handler(request):
            try:
                data = await request.json()
                ckpt_name = data.get("ckpt_name", "").strip()
                if not ckpt_name:
                    return web.json_response({"success": False, "error": "Missing ckpt_name"}, status=400)
                if ckpt_name not in SUPPORTED_MODELS:
                    return web.json_response({"success": False, "error": f"Invalid model '{ckpt_name}'"}, status=400)

                # Trigger download synchronously or return immediately if already installed
                if is_model_installed(ckpt_name):
                    return web.json_response({"success": True, "status": "already_installed", "ckpt_name": ckpt_name})

                path = ensure_model(ckpt_name)
                return web.json_response({"success": True, "status": "downloaded", "path": path, "ckpt_name": ckpt_name})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)


class AnyType(str):
    def __ne__(self, other):
        return False

    def __eq__(self, other):
        return True


ANY = AnyType("*")


def extract_fps(fps_input: Any, fallback: float = 24.0) -> float:
    """Extracts numeric frame rate from float, int, tuple, or VHS_VIDEOINFO dict."""
    if fps_input is None:
        return fallback
    if isinstance(fps_input, dict):
        for k in ("loaded_fps", "source_fps", "fps", "frame_rate"):
            if k in fps_input and fps_input[k] is not None:
                try:
                    val = float(fps_input[k])
                    if val > 0:
                        return val
                except (ValueError, TypeError):
                    pass
        return fallback
    if isinstance(fps_input, (list, tuple)):
        if len(fps_input) > 0:
            return extract_fps(fps_input[0], fallback)
        return fallback
    if hasattr(fps_input, "item"):
        try:
            val = float(fps_input.item())
            if val > 0:
                return val
        except Exception:
            pass
    try:
        val = float(fps_input)
        if val > 0 and not (math.isnan(val) or math.isinf(val)):
            return val
    except (ValueError, TypeError):
        pass
    return fallback


class DS_Interpolation:
    """
    DS Interpolation Node
    High-performance video frame interpolation engine.
    Accepts standard IMAGES, passes audio through unchanged, supports external states,
    and runs chunked memory-safe inference on CPU/CUDA/MPS accelerators.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Frames": ("IMAGE",),
                "ckpt_name": (MODEL_NAMES, {"default": DEFAULT_MODEL}),
                "clear_cache_after_n_frames": ("INT", {"default": 10, "min": 1, "max": 10000, "step": 1}),
                "multiplier": ("INT", {"default": 2, "min": 1, "max": 100, "step": 1}),
                "fast_mode": ("BOOLEAN", {"default": True}),
                "ensemble": ("BOOLEAN", {"default": True}),
                "scale_factor": (["0.25", "0.5", "1x", "2", "4"], {"default": "1x"}),
                "dtype": (["float32", "float16", "bfloat16"], {"default": "float32"}),
                "torch_compile": ("BOOLEAN", {"default": False}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "step": 1}),
                "mode": (["Target FPS", "Multiplier"], {"default": "Target FPS"}),
                "target_fps": ("FLOAT", {"default": 60.0, "min": 1.0, "max": 240.0, "step": 1.0}),
                "source_fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01}),
            },
            "optional": {
                "Audio": ("AUDIO",),
                "FPS": (ANY,),
                "Optional_Interpolation_States": ("*",),
            },
            "hidden": {
                "ds_interpolation_state": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT")
    RETURN_NAMES = ("IMAGES", "Audio Pass Through", "FPS")
    FUNCTION = "vfi"
    CATEGORY = "☠️ Deathshot Arsenal/🎬 Video"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def vfi(
        self,
        Frames: Optional[torch.Tensor] = None,
        Audio: Optional[Dict[str, Any]] = None,
        FPS: Optional[Any] = None,
        Optional_Interpolation_States: Any = None,
        ckpt_name: str = DEFAULT_MODEL,
        clear_cache_after_n_frames: int = 10,
        multiplier: int = 2,
        fast_mode: bool = True,
        ensemble: bool = True,
        scale_factor: Union[str, float] = "1x",
        dtype: str = "float32",
        torch_compile: bool = False,
        batch_size: int = 1,
        mode: str = "Target FPS",
        target_fps: float = 60.0,
        source_fps: float = 24.0,
        **kwargs
    ) -> Tuple[torch.Tensor, Optional[Dict[str, Any]], float]:

        # Resolve inputs supporting both new capitalized and legacy keys
        frames = Frames if Frames is not None else kwargs.get("frames", None)
        audio = Audio if Audio is not None else kwargs.get("audio", None)
        fps = FPS if FPS is not None else kwargs.get("fps", None)
        optional_interpolation_states = (
            Optional_Interpolation_States
            if Optional_Interpolation_States is not None
            else kwargs.get("optional_interpolation_states", None)
        )

        # -------------------------------------------------------------
        # 1. Input Validation, State Sync & FPS Resolution
        # -------------------------------------------------------------
        if frames is None or not isinstance(frames, torch.Tensor) or frames.numel() == 0:
            raise ValueError("[DS Interpolation] Received empty or invalid 'Frames' tensor input.")

        frames = frames[..., :3]
        n_frames = len(frames)

        # Synchronize parameters from frontend state if serialized in widget/hidden
        state_raw = kwargs.get("ds_interpolation_state", "")
        if state_raw:
            try:
                import json
                sd = json.loads(state_raw) if isinstance(state_raw, str) else state_raw
                if isinstance(sd, dict):
                    if "mode" in sd:
                        mode = str(sd["mode"])
                    if "target_fps" in sd:
                        target_fps = float(sd["target_fps"])
                    if "source_fps" in sd:
                        source_fps = float(sd["source_fps"])
                    if "multiplier" in sd:
                        multiplier = int(sd["multiplier"])
            except Exception:
                pass

        effective_source_fps = extract_fps(fps, fallback=float(source_fps or 24.0))
        if effective_source_fps <= 0:
            effective_source_fps = 24.0

        is_target_fps_mode = (str(mode).lower().replace(" ", "_") == "target_fps")
        if is_target_fps_mode:
            target_fps = max(1.0, float(target_fps or 60.0))
            out_fps = target_fps
            if n_frames <= 1 or abs(effective_source_fps - target_fps) < 0.001:
                logger.info(f"[DS Interpolation] Passthrough without interpolation (frames={n_frames}, source_fps={effective_source_fps}, target_fps={target_fps}).")
                return (frames, audio, float(out_fps))
            total_target_frames = max(2, int(round((n_frames - 1) * (target_fps / effective_source_fps))) + 1)
        else:
            multiplier = max(1, int(multiplier))
            out_fps = effective_source_fps * float(multiplier)
            if n_frames <= 1 or multiplier <= 1:
                logger.info(f"[DS Interpolation] Passthrough without interpolation (frames={n_frames}, multiplier={multiplier}).")
                return (frames, audio, float(out_fps))
            total_target_frames = (n_frames - 1) * multiplier + 1

        # -------------------------------------------------------------
        # 2. Device & Dtype Selection
        # -------------------------------------------------------------
        device = comfy.model_management.get_torch_device()
        torch_dtype = DTYPE_MAP.get(str(dtype).lower(), torch.float32)

        if torch_dtype == torch.bfloat16 and device.type == "cuda":
            if not torch.cuda.is_bf16_supported():
                logger.warning("[DS Interpolation] bfloat16 is not supported on this CUDA GPU. Falling back to float16.")
                torch_dtype = torch.float16
        elif torch_dtype in (torch.float16, torch.bfloat16) and device.type == "cpu":
            logger.warning("[DS Interpolation] Half-precision on CPU is slow/unsupported for conv2d. Using float32.")
            torch_dtype = torch.float32

        # -------------------------------------------------------------
        # 3. Model Retrieval & Caching
        # -------------------------------------------------------------
        arch_ver = SUPPORTED_MODELS.get(ckpt_name, "4.7")
        if arch_ver == "4.26":
            ensemble = False

        model_path = ensure_model(ckpt_name)

        cache_key = (ckpt_name, str(torch_dtype), bool(torch_compile))
        if cache_key in _MODEL_CACHE:
            model = _MODEL_CACHE[cache_key]
        else:
            logger.info(f"[DS Interpolation] Loading model '{ckpt_name}' (arch={arch_ver}, dtype={torch_dtype}, compile={torch_compile})...")
            model = IFNet(arch_ver=arch_ver)
            sd = torch.load(model_path, map_location="cpu", weights_only=False)

            clean_sd = {}
            for k, v in sd.items():
                clean_k = k.replace("module.", "").replace("flownet.", "")
                clean_sd[clean_k] = v

            model.load_state_dict(clean_sd, strict=False)

            if torch_dtype != torch.float32:
                model = model.to(dtype=torch_dtype)
            model = model.eval().to(device=device)

            if torch_compile:
                try:
                    logger.info("[DS Interpolation] Applying torch.compile() to model graph...")
                    model = torch.compile(model)
                except Exception as comp_err:
                    logger.warning(f"[DS Interpolation] torch.compile() failed: {comp_err}. Falling back to standard execution.")

            _MODEL_CACHE[cache_key] = model

        # -------------------------------------------------------------
        # 4. Scale List Calculation
        # -------------------------------------------------------------
        numeric_scale = SCALE_FACTOR_MAP.get(str(scale_factor), 1.0)
        numeric_scale = max(0.1, float(numeric_scale))

        if arch_ver == "4.26":
            scale_list = [16.0 / numeric_scale, 8.0 / numeric_scale, 4.0 / numeric_scale, 2.0 / numeric_scale, 1.0 / numeric_scale]
        else:
            scale_list = [8.0 / numeric_scale, 4.0 / numeric_scale, 2.0 / numeric_scale, 1.0 / numeric_scale]

        # -------------------------------------------------------------
        # 5. Build Interpolation Tasks & Target Frame Mapping
        # -------------------------------------------------------------
        output_slots: List[Optional[torch.Tensor]] = [None] * total_target_frames
        tasks: List[Tuple[int, int, int, float]] = []

        if is_target_fps_mode:
            step_ratio = effective_source_fps / target_fps
            for k in range(total_target_frames):
                pos = k * step_ratio
                pos = max(0.0, min(float(n_frames - 1), pos))
                p0 = int(pos)
                dt = pos - p0

                if abs(dt) < 1e-5:
                    output_slots[k] = frames[p0:p0 + 1].to(device="cpu", dtype=torch.float32)
                elif abs(dt - 1.0) < 1e-5:
                    p1 = min(p0 + 1, n_frames - 1)
                    output_slots[k] = frames[p1:p1 + 1].to(device="cpu", dtype=torch.float32)
                else:
                    p1 = min(p0 + 1, n_frames - 1)
                    if p0 == p1:
                        output_slots[k] = frames[p0:p0 + 1].to(device="cpu", dtype=torch.float32)
                    else:
                        skip = False
                        if optional_interpolation_states is not None:
                            if hasattr(optional_interpolation_states, "is_frame_skipped"):
                                skip = optional_interpolation_states.is_frame_skipped(p0)
                            elif isinstance(optional_interpolation_states, (list, tuple, set)):
                                skip = (p0 in optional_interpolation_states)
                        if skip:
                            chosen = p0 if dt < 0.5 else p1
                            output_slots[k] = frames[chosen:chosen + 1].to(device="cpu", dtype=torch.float32)
                        else:
                            tasks.append((k, p0, p1, dt))
        else:
            for p0 in range(n_frames - 1):
                out_idx = p0 * multiplier
                output_slots[out_idx] = frames[p0:p0 + 1].to(device="cpu", dtype=torch.float32)

                skip = False
                if optional_interpolation_states is not None:
                    if hasattr(optional_interpolation_states, "is_frame_skipped"):
                        skip = optional_interpolation_states.is_frame_skipped(p0)
                    elif isinstance(optional_interpolation_states, (list, tuple, set)):
                        skip = (p0 in optional_interpolation_states)

                for step in range(1, multiplier):
                    k = out_idx + step
                    if skip:
                        chosen = p0 if step <= multiplier // 2 else p0 + 1
                        output_slots[k] = frames[chosen:chosen + 1].to(device="cpu", dtype=torch.float32)
                    else:
                        tasks.append((k, p0, p0 + 1, step / float(multiplier)))

            output_slots[-1] = frames[-1:].to(device="cpu", dtype=torch.float32)

        total_tasks = len(tasks)
        pbar = comfy.utils.ProgressBar(total_tasks) if total_tasks > 0 else None
        frames_processed_since_cache_clear = 0
        batch_size = max(1, min(64, int(batch_size)))

        # -------------------------------------------------------------
        # 6. Chunked Inference Loop
        # -------------------------------------------------------------
        pos = 0
        try:
            with torch.inference_mode():
                while pos < total_tasks:
                    batch_tasks = tasks[pos : pos + batch_size]
                    current_bs = len(batch_tasks)

                    f0_list, f1_list, ts_list = [], [], []
                    for _, p0, p1, dt in batch_tasks:
                        # frames[idx] is [H, W, C] -> permute to [C, H, W]
                        f0 = frames[p0, ..., :3].permute(2, 0, 1).unsqueeze(0)
                        f1 = frames[p1, ..., :3].permute(2, 0, 1).unsqueeze(0)
                        f0_list.append(f0)
                        f1_list.append(f1)
                        ts_list.append(dt)

                    frame0_batch = torch.cat(f0_list, dim=0).to(device=device, dtype=torch_dtype, non_blocking=True)
                    frame1_batch = torch.cat(f1_list, dim=0).to(device=device, dtype=torch_dtype, non_blocking=True)
                    timestep_tensor = torch.tensor(ts_list, dtype=torch_dtype, device=device).view(-1, 1, 1, 1)

                    middle_frames = model(
                        frame0_batch,
                        frame1_batch,
                        timestep_tensor,
                        scale_list,
                        fast_mode,
                        ensemble,
                    ).clamp(0.0, 1.0)

                    # Transfer outputs back to CPU float32 immediately to release GPU VRAM: [B, C, H, W] -> [B, H, W, C]
                    middle_frames_cpu = middle_frames.detach().to(device="cpu", dtype=torch.float32).permute(0, 2, 3, 1)
                    del frame0_batch, frame1_batch, timestep_tensor, middle_frames

                    for b_idx, (out_idx, _, _, _) in enumerate(batch_tasks):
                        output_slots[out_idx] = middle_frames_cpu[b_idx : b_idx + 1]

                    if pbar:
                        pbar.update(current_bs)

                    frames_processed_since_cache_clear += current_bs
                    if frames_processed_since_cache_clear >= clear_cache_after_n_frames:
                        comfy.model_management.soft_empty_cache()
                        clear_warp_cache()
                        gc.collect()
                        frames_processed_since_cache_clear = 0

                    pos += current_bs

        except (torch.cuda.OutOfMemoryError, RuntimeError) as err:
            err_str = str(err).lower()
            if "out of memory" in err_str or isinstance(err, torch.cuda.OutOfMemoryError):
                comfy.model_management.soft_empty_cache()
                clear_warp_cache()
                gc.collect()
                h, w = frames.shape[1:3]
                raise RuntimeError(
                    f"[DS Interpolation] GPU Out Of Memory error during interpolation of {w}x{h} frames. "
                    f"Current settings: batch_size={batch_size}, scale_factor={scale_factor}, dtype={dtype}. "
                    f"Recommendation: Reduce batch_size to 1, set dtype to 'float16', or lower scale_factor."
                ) from err
            raise err

        # -------------------------------------------------------------
        # 7. Assemble Output Sequence & Maintain Temporal Duration
        # -------------------------------------------------------------
        for idx in range(total_target_frames):
            if output_slots[idx] is None:
                output_slots[idx] = frames[-1:].to(device="cpu", dtype=torch.float32)

        comfy.model_management.soft_empty_cache()
        clear_warp_cache()
        gc.collect()

        final_images = torch.cat(output_slots, dim=0)

        in_duration = (n_frames - 1) / effective_source_fps
        out_duration = (len(final_images) - 1) / out_fps
        logger.info(
            f"[DS Interpolation] Finished ({mode}): {n_frames} input frames @ {effective_source_fps:.2f} FPS "
            f"-> {len(final_images)} output frames @ {out_fps:.2f} FPS. "
            f"Duration: in={in_duration:.3f}s -> out={out_duration:.3f}s (preserved)."
        )

        # Audio passthrough unchanged
        return (final_images, audio, float(out_fps))
