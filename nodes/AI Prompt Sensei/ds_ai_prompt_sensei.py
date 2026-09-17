"""
DS AI Prompt Sensei
Deathshot Arsenal
AI-assisted prompt generation / multimodal video-prompt configuration hub.

Core responsibilities:
  1. Understand the supplied image and generate a prompt using the built-in Sensei engine.
  2. Prepare the supplied image at the selected LTX aspect-ratio / resolution.
  3. Build and expose the final model pipeline (model → LoRAs → model output).
"""

import hashlib
import json
import logging
import os
import numpy as np
from PIL import Image, ImageOps
import torch

import comfy.model_management as mm
import comfy.sd
import comfy.utils
import folder_paths

try:
    from .llm_engine import (
        kill_active_generation,
        generate_prompt_sync,
        generate_prompt_lm_studio,
        unload_llm_memory,
    )
except (ImportError, ValueError):
    import sys
    cur_dir = os.path.dirname(__file__)
    if cur_dir not in sys.path:
        sys.path.insert(0, cur_dir)
    from llm_engine import (
        kill_active_generation,
        generate_prompt_sync,
        generate_prompt_lm_studio,
        unload_llm_memory,
    )

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei")

_CACHED_MODELS = {}


# ---------------------------------------------------------------------------
# Model loading helpers
# ---------------------------------------------------------------------------

def _get_or_load_checkpoint(ckpt_name):
    if not ckpt_name or ckpt_name == "None":
        return None, None, None
    cache_key = f"ckpt_{ckpt_name}"
    if cache_key in _CACHED_MODELS:
        return _CACHED_MODELS[cache_key]

    ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
    if not ckpt_path:
        ckpt_path = folder_paths.get_full_path("diffusion_models", ckpt_name)
    if not ckpt_path:
        return None, None, None

    # 1. Try standard checkpoint loader
    try:
        out = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )
        model, clip, vae = out[:3]
        if len(_CACHED_MODELS) > 4:
            _CACHED_MODELS.clear()
        _CACHED_MODELS[cache_key] = (model, clip, vae)
        return model, clip, vae
    except Exception:
        pass

    # 2. Try diffusion model loader (Wan 2.1, Hunyuan, CogVideo, LTX-Video, …)
    try:
        model = comfy.sd.load_diffusion_model(ckpt_path)
        if len(_CACHED_MODELS) > 4:
            _CACHED_MODELS.clear()
        _CACHED_MODELS[cache_key] = (model, None, None)
        return model, None, None
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Could not load model '{ckpt_name}': {e}")
        return None, None, None


def _get_or_load_vae(vae_name):
    if not vae_name or vae_name == "None":
        return None
    cache_key = f"vae_{vae_name}"
    if cache_key in _CACHED_MODELS:
        return _CACHED_MODELS[cache_key]

    vae_path = folder_paths.get_full_path("vae", vae_name)
    if not vae_path:
        vae_path = folder_paths.get_full_path("vae_approx", vae_name)
    if not vae_path:
        return None

    try:
        sd, metadata = comfy.utils.load_torch_file(vae_path, return_metadata=True)
        if vae_name == "taef2":
            if metadata is None:
                metadata = {"tae_latent_channels": 128}
            else:
                metadata["tae_latent_channels"] = 128
        vae = comfy.sd.VAE(sd=sd, metadata=metadata)
        vae.throw_exception_if_invalid()
        if hasattr(vae, "patcher") and hasattr(comfy.sd, "load_vae_patcher"):
            try:
                vae.patcher.cached_patcher_init = (comfy.sd.load_vae_patcher, (vae_path, metadata, None))
            except Exception:
                pass
        _CACHED_MODELS[cache_key] = vae
        return vae
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Could not load VAE '{vae_name}': {e}")
        return None


def _detect_clip_type(clip_name):
    low = (clip_name or "").lower()
    if "wan" in low or "umt5" in low:
        return getattr(comfy.sd.CLIPType, "WAN", None)
    if "ltx" in low:
        return getattr(comfy.sd.CLIPType, "LTXV", None)
    if "hunyuan" in low:
        return getattr(comfy.sd.CLIPType, "HUNYUAN_VIDEO", None)
    if "cogvideo" in low:
        return getattr(comfy.sd.CLIPType, "COGVIDEOX", None)
    if "mochi" in low:
        return getattr(comfy.sd.CLIPType, "MOCHI", None)
    if "qwen" in low:
        return getattr(comfy.sd.CLIPType, "QWEN_IMAGE", None)
    if "gemma" in low or "lumina" in low:
        return getattr(comfy.sd.CLIPType, "LUMINA2", None)
    if "flux" in low:
        return getattr(comfy.sd.CLIPType, "FLUX", None)
    if "sd3" in low or "t5" in low:
        return getattr(comfy.sd.CLIPType, "SD3", None)
    return getattr(comfy.sd.CLIPType, "STABLE_DIFFUSION", None)


def _get_or_load_clip(clip_name):
    if not clip_name or clip_name == "None":
        return None
    cache_key = f"clip_{clip_name}"
    if cache_key in _CACHED_MODELS:
        return _CACHED_MODELS[cache_key]

    clip_path = folder_paths.get_full_path("clip", clip_name)
    if not clip_path:
        clip_path = folder_paths.get_full_path("text_encoders", clip_name)
    if not clip_path:
        return None

    preferred_type = _detect_clip_type(clip_name)
    candidate_types = [preferred_type] if preferred_type else []
    for t in [
        getattr(comfy.sd.CLIPType, "WAN", None),
        getattr(comfy.sd.CLIPType, "SD3", None),
        getattr(comfy.sd.CLIPType, "LTXV", None),
        getattr(comfy.sd.CLIPType, "HUNYUAN_VIDEO", None),
        getattr(comfy.sd.CLIPType, "FLUX", None),
        getattr(comfy.sd.CLIPType, "LUMINA2", None),
        getattr(comfy.sd.CLIPType, "STABLE_DIFFUSION", None),
    ]:
        if t and t not in candidate_types:
            candidate_types.append(t)

    for ctype in candidate_types:
        try:
            clip = comfy.sd.load_clip(
                ckpt_paths=[clip_path],
                embedding_directory=folder_paths.get_folder_paths("embeddings"),
                clip_type=ctype,
            )
            _CACHED_MODELS[cache_key] = clip
            return clip
        except Exception:
            continue

    logger.warning(f"[Prompt Sensei] Could not load Text Encoder '{clip_name}'")
    return None


def _apply_loras(model, clip, loras_list):
    """Apply the ordered LoRA list to model (and optionally clip)."""
    if not loras_list or not isinstance(loras_list, list):
        return model, clip

    current_model = model
    current_clip = clip

    for row in loras_list:
        if not isinstance(row, dict):
            continue
        if row.get("enabled", True) is False:
            continue

        name = str(row.get("name") or "").strip()
        if not name or name == "None":
            continue

        lora_path = folder_paths.get_full_path("loras", name)
        if not lora_path and not os.path.isabs(name):
            try:
                available = folder_paths.get_filename_list("loras")
                for item in available:
                    if os.path.basename(item) == os.path.basename(name) or item.startswith(name):
                        lora_path = folder_paths.get_full_path("loras", item)
                        break
            except Exception:
                pass

        if not lora_path or not os.path.isfile(lora_path):
            continue

        try:
            strength = float(row.get("strength", 1.0))
        except (ValueError, TypeError):
            strength = 1.0

        if strength == 0.0 or current_model is None:
            continue

        try:
            lora_data = comfy.utils.load_torch_file(lora_path, safe_load=True)
            current_model, current_clip = comfy.sd.load_lora_for_models(
                current_model, current_clip, lora_data, strength, strength
            )
        except Exception as e:
            logger.warning(f"[Prompt Sensei] Failed to apply LoRA '{name}': {e}")

    return current_model, current_clip


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _resolve_image_path(image_path):
    """Resolve an image_path string to an absolute filesystem path."""
    if not image_path:
        return None

    resolved = None
    try:
        resolved = folder_paths.get_annotated_filepath(image_path)
    except Exception:
        pass

    if not resolved or not os.path.isfile(resolved):
        input_dir = folder_paths.get_input_directory()
        cand = os.path.join(input_dir, image_path)
        if os.path.isfile(cand):
            resolved = cand
        elif os.path.isfile(image_path):
            resolved = image_path
        else:
            resolved = None

    return resolved if (resolved and os.path.isfile(resolved)) else None


def _load_original_image(image_path):
    """
    Load the source image at its original native resolution (equivalent to ComfyUI LoadImage).
    Returns a float32 torch tensor of shape [1, H, W, 3] in range [0, 1].
    Falls back to a 1x64x64 black frame if the image cannot be loaded.
    """
    resolved = _resolve_image_path(image_path)
    if not resolved:
        return torch.zeros((1, 64, 64, 3), dtype=torch.float32)

    try:
        with Image.open(resolved) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode != "RGB":
                img = img.convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0
            return torch.from_numpy(arr)[None,]
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Error loading original image '{image_path}': {e}")
        return torch.zeros((1, 64, 64, 3), dtype=torch.float32)


# ---------------------------------------------------------------------------
# Node definition
# ---------------------------------------------------------------------------

class DS_AIPromptSensei:
    """
    DS AI Prompt Sensei — AI-assisted prompt generation / multimodal video-prompt
    configuration hub for LTX and other video workflows.

    No input sockets.  Output sockets are positioned beside their respective UI rows.

    Outputs:
      image       — Uploaded image in native original resolution
      model       — Selected model after LoRA processing
      video_vae   — Selected Video VAE
      audio_vae   — Selected Audio VAE
      text_enc    — Selected Text Encoder (CLIP)
      width       — Output video width (INT)
      height      — Output video height (INT)
      duration    — Video duration in seconds (FLOAT)
      fps         — Frames per second (FLOAT)
      prompt      — Generated / user-edited prompt string
    """

    DESCRIPTION = (
        "AI-assisted prompt generation and multimodal video-prompt configuration hub. "
        "Configures models, LoRAs, LTX-compatible video dimensions, timing, and uses "
        "the built-in Sensei engine to expand image and scene context into rich prompts. "
        "No external LLM application required."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "SenseiState": (
                    "STRING",
                    {"default": "{}", "multiline": False},
                ),
            },
        }

    RETURN_TYPES = (
        "IMAGE",
        "MODEL",
        "VAE",
        "VAE",
        "CLIP",
        "INT",
        "INT",
        "FLOAT",
        "FLOAT",
        "STRING",
    )
    RETURN_NAMES = (
        "image",
        "model",
        "video_vae",
        "audio_vae",
        "text_enc",
        "width",
        "height",
        "duration",
        "fps",
        "prompt",
    )
    FUNCTION = "execute"
    CATEGORY = "☠️ Deathshot Arsenal/🧠 AI"

    @classmethod
    def IS_CHANGED(cls, SenseiState="{}"):
        try:
            return hashlib.sha256((SenseiState or "").encode("utf-8")).hexdigest()
        except Exception:
            return float("nan")

    def execute(self, SenseiState="{}"):
        try:
            state = json.loads(SenseiState) if isinstance(SenseiState, str) else SenseiState
            if not isinstance(state, dict):
                state = {}
        except Exception:
            state = {}

        # ------------------------------------------------------------------
        # 1. Video settings (read first so we know the target resolution)
        # ------------------------------------------------------------------
        video_cfg = state.get("video") or {}
        try:
            width = int(video_cfg.get("width") or 768)
        except (ValueError, TypeError):
            width = 768
        try:
            height = int(video_cfg.get("height") or 512)
        except (ValueError, TypeError):
            height = 512
        try:
            duration = float(video_cfg.get("duration") or 5.0)
        except (ValueError, TypeError):
            duration = 5.0
        try:
            fps = float(video_cfg.get("fps") or 24.0)
        except (ValueError, TypeError):
            fps = 24.0

        width = max(64, min(16384, width))
        height = max(64, min(16384, height))
        duration = max(0.1, min(3600.0, duration))
        fps = max(1.0, min(240.0, fps))

        # ------------------------------------------------------------------
        # 2. Image — original native resolution (workflow resizes based on width/height)
        # ------------------------------------------------------------------
        img_path = state.get("image_path") or state.get("image") or ""
        image_tensor = _load_original_image(img_path)

        # ------------------------------------------------------------------
        # 3. Models
        # ------------------------------------------------------------------
        models_cfg = state.get("models") or {}
        model_name = models_cfg.get("model") or ""
        video_vae_name = models_cfg.get("video_vae") or ""
        audio_vae_name = models_cfg.get("audio_vae") or ""
        text_enc_name = models_cfg.get("text_enc") or ""
        attention_mode = models_cfg.get("attention") or "default"

        model, loaded_clip, loaded_vae = _get_or_load_checkpoint(model_name)
        video_vae = _get_or_load_vae(video_vae_name) or loaded_vae
        audio_vae = _get_or_load_vae(audio_vae_name) or loaded_vae
        clip = _get_or_load_clip(text_enc_name) or loaded_clip

        # ------------------------------------------------------------------
        # 4. LoRAs — applied in order to produce the final model output
        # ------------------------------------------------------------------
        loras = state.get("loras") or []
        model, clip = _apply_loras(model, clip, loras)

        # ------------------------------------------------------------------
        # 4.1 Attention Mode
        # ------------------------------------------------------------------
        if model is not None and attention_mode and attention_mode != "default":
            try:
                attn_map = {
                    "kitchen": "comfy_kitchen_int8",
                    "comfy_kitchen": "comfy_kitchen_int8",
                    "comfy kitchen attention": "comfy_kitchen_int8",
                    "sage_attn": "sage",
                    "sage": "sage",
                    "sdpa": "pytorch",
                }
                func_name = attn_map.get(attention_mode, attention_mode)
                try:
                    import comfy.ldm.modules.attention as comfy_attn
                    attn_fn = comfy_attn.get_attention_function(func_name, None)
                    if attn_fn is not None and hasattr(model, "set_model_optimized_attention"):
                        model.set_model_optimized_attention(attn_fn)
                except Exception:
                    pass

                if hasattr(model, "model_options"):
                    model.model_options = dict(model.model_options or {})
                    model.model_options["attention_mechanism"] = attention_mode
            except Exception:
                pass

        # ------------------------------------------------------------------
        # 5. Generated Prompt (use whatever is currently in the display area)
        # ------------------------------------------------------------------
        prompt_text = str(
            state.get("generated_prompt")
            or state.get("prompt")
            or ""
        ).strip()

        if not prompt_text and (state.get("scene_notes") or img_path):
            lm_cfg = state.get("lm_studio") or {}
            if lm_cfg.get("model"):
                try:
                    res = generate_prompt_lm_studio(
                        scene_notes=state.get("scene_notes", ""),
                        system_prompt=state.get("system_prompt", ""),
                        image_path=img_path,
                        lm_studio_config=lm_cfg,
                        context=video_cfg,
                    )
                    if res.get("status") == "completed" and res.get("prompt"):
                        prompt_text = res["prompt"].strip()
                except Exception as e:
                    logger.warning(f"[Prompt Sensei] Generation during execute fallback: {e}")

        if not prompt_text:
            prompt_text = str(state.get("scene_notes") or "").strip()

        ui_data = {"prompt": [prompt_text]}
        if "res" in locals() and isinstance(res, dict) and res.get("status") == "completed":
            tokens_count = int(res.get("tokens", 0))
            speed_val = float(res.get("speed", 0.0))
            elapsed_val = float(res.get("elapsed", 0.0))
            model_name = str(res.get("model") or lm_cfg.get("model") or "")

            ui_data["tokens"] = [tokens_count]
            ui_data["speed"] = [speed_val]
            ui_data["elapsed"] = [elapsed_val]
            ui_data["model"] = [model_name]

            try:
                import server
                server.PromptServer.instance.send_sync(
                    "ds_sensei_executed",
                    {
                        "prompt": prompt_text,
                        "tokens": tokens_count,
                        "speed": speed_val,
                        "elapsed": elapsed_val,
                        "model": model_name,
                    },
                )
            except Exception:
                pass

        return {
            "ui": ui_data,
            "result": (
                image_tensor,   # IMAGE  — prepared at target resolution
                model,          # MODEL  — after LoRA processing
                video_vae,      # VAE    — video VAE
                audio_vae,      # VAE    — audio VAE
                clip,           # CLIP   — text encoder
                width,          # INT    — output width
                height,         # INT    — output height
                duration,       # FLOAT  — duration in seconds
                fps,            # FLOAT  — frames per second
                prompt_text,    # STRING — generated / edited prompt
            ),
        }


NODE_CLASS_MAPPINGS = {
    "DS_AIPromptSensei": DS_AIPromptSensei,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_AIPromptSensei": "DS AI Prompt Sensei",
}
