"""
DS Interpolation - Video Frame Interpolation Engine
Deathshot Arsenal / DS Node Pack
"""

import os
import gc
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


class DS_Interpolation:
    """
    DS Interpolation Node
    High-performance video frame interpolation powered by RIFE.
    Accepts standard IMAGES, passes audio through unchanged, supports external states,
    and runs chunked memory-safe inference on CPU/CUDA/MPS accelerators.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "frames": ("IMAGE",),
                "ckpt_name": (MODEL_NAMES, {"default": DEFAULT_MODEL}),
                "clear_cache_after_n_frames": ("INT", {"default": 10, "min": 1, "max": 10000, "step": 1}),
                "multiplier": ("INT", {"default": 2, "min": 1, "max": 100, "step": 1}),
                "fast_mode": ("BOOLEAN", {"default": True}),
                "ensemble": ("BOOLEAN", {"default": True}),
                "scale_factor": (["0.25", "0.5", "1x", "2", "4"], {"default": "1x"}),
                "dtype": (["float32", "float16", "bfloat16"], {"default": "float32"}),
                "torch_compile": ("BOOLEAN", {"default": False}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64, "step": 1}),
            },
            "optional": {
                "audio": ("AUDIO",),
                "optional_interpolation_states": ("*",),
            },
            "hidden": {
                "ds_interpolation_state": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("IMAGES", "Audio Pass Through")
    FUNCTION = "vfi"
    CATEGORY = "☠️ Deathshot Arsenal/🎬 Video"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def vfi(
        self,
        frames: torch.Tensor,
        ckpt_name: str = DEFAULT_MODEL,
        clear_cache_after_n_frames: int = 10,
        multiplier: int = 2,
        fast_mode: bool = True,
        ensemble: bool = True,
        scale_factor: Union[str, float] = "1x",
        dtype: str = "float32",
        torch_compile: bool = False,
        batch_size: int = 1,
        audio: Optional[Dict[str, Any]] = None,
        optional_interpolation_states: Any = None,
        **kwargs
    ) -> Tuple[torch.Tensor, Optional[Dict[str, Any]]]:

        # -------------------------------------------------------------
        # 1. Input Validation & Edge Cases
        # -------------------------------------------------------------
        if frames is None or not isinstance(frames, torch.Tensor) or frames.numel() == 0:
            raise ValueError("[DS Interpolation] Received empty or invalid 'frames' tensor input.")

        frames = frames[..., :3]
        n_frames = len(frames)
        if n_frames <= 1 or multiplier <= 1:
            logger.info(f"[DS Interpolation] Passthrough without interpolation (frames={n_frames}, multiplier={multiplier}).")
            return (frames, audio)

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
        # 4.26 does not support ensemble
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

            # Strip any legacy prefixes if present
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
        # 4. Scale List & Multiplier Calculation
        # -------------------------------------------------------------
        numeric_scale = SCALE_FACTOR_MAP.get(str(scale_factor), 1.0)
        numeric_scale = max(0.1, float(numeric_scale))

        if arch_ver == "4.26":
            scale_list = [16.0 / numeric_scale, 8.0 / numeric_scale, 4.0 / numeric_scale, 2.0 / numeric_scale, 1.0 / numeric_scale]
        else:
            scale_list = [8.0 / numeric_scale, 4.0 / numeric_scale, 2.0 / numeric_scale, 1.0 / numeric_scale]

        n_pairs = n_frames - 1

        # -------------------------------------------------------------
        # 5. Build Interpolation Tasks
        # -------------------------------------------------------------
        # Each task is: (pair_idx, timestep)
        tasks: List[Tuple[int, float]] = []
        for pair_idx in range(n_pairs):
            # Check external interpolation states
            if optional_interpolation_states is not None:
                if hasattr(optional_interpolation_states, "is_frame_skipped"):
                    if optional_interpolation_states.is_frame_skipped(pair_idx):
                        continue
                elif isinstance(optional_interpolation_states, (list, tuple, set)):
                    if pair_idx in optional_interpolation_states:
                        continue

            for step in range(1, multiplier):
                tasks.append((pair_idx, step / float(multiplier)))

        total_tasks = len(tasks)
        pbar = comfy.utils.ProgressBar(total_tasks) if total_tasks > 0 else None

        # Storage for generated frames on CPU: pair_idx -> list of [H, W, C] tensors
        results: Dict[int, List[torch.Tensor]] = {i: [] for i in range(n_pairs)}
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

                    # Gather frame pairs directly from CPU frames
                    f0_list, f1_list, ts_list = [], [], []
                    for pair_idx, dt in batch_tasks:
                        # frames[idx] is [H, W, C] -> permute to [C, H, W]
                        f0 = frames[pair_idx, ..., :3].permute(2, 0, 1).unsqueeze(0)
                        f1 = frames[pair_idx + 1, ..., :3].permute(2, 0, 1).unsqueeze(0)
                        f0_list.append(f0)
                        f1_list.append(f1)
                        ts_list.append(dt)

                    frame0_batch = torch.cat(f0_list, dim=0).to(device=device, dtype=torch_dtype, non_blocking=True)
                    frame1_batch = torch.cat(f1_list, dim=0).to(device=device, dtype=torch_dtype, non_blocking=True)
                    timestep_tensor = torch.tensor(ts_list, dtype=torch_dtype, device=device).view(-1, 1, 1, 1)

                    # Run model using exact calling convention from comfyui-frame-interpolation / Practical-RIFE
                    middle_frames = model(
                        frame0_batch,
                        frame1_batch,
                        timestep_tensor,
                        scale_list,
                        fast_mode,
                        ensemble,
                    ).clamp(0.0, 1.0)

                    # Transfer outputs back to CPU float32 immediately to release GPU VRAM
                    # [B, C, H, W] -> [B, H, W, C]
                    middle_frames_cpu = middle_frames.detach().to(device="cpu", dtype=torch.float32).permute(0, 2, 3, 1)

                    del frame0_batch, frame1_batch, timestep_tensor, middle_frames

                    for b_idx, (pair_idx, _) in enumerate(batch_tasks):
                        results[pair_idx].append(middle_frames_cpu[b_idx])

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
        # 7. Assemble Output Sequence (Preserving Temporal Order)
        # -------------------------------------------------------------
        output_frames: List[torch.Tensor] = []
        for pair_idx in range(n_pairs):
            # 1. Original frame
            output_frames.append(frames[pair_idx : pair_idx + 1].to(device="cpu", dtype=torch.float32))
            # 2. Intermediate frames for this pair
            for mid in results[pair_idx]:
                output_frames.append(mid.unsqueeze(0))

        # 3. Final original frame
        output_frames.append(frames[-1:].to(device="cpu", dtype=torch.float32))

        # Release temporary states
        comfy.model_management.soft_empty_cache()
        clear_warp_cache()
        gc.collect()

        final_images = torch.cat(output_frames, dim=0)
        logger.info(f"[DS Interpolation] Finished: {n_frames} input frames -> {len(final_images)} output frames (multiplier={multiplier}).")

        # Audio passthrough unchanged
        return (final_images, audio)
