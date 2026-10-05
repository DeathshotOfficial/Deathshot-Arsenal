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
import re
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


def _get_lora_cache_loader():
    try:
        import sys
        lora_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "LoRa Loader"))
        if lora_dir not in sys.path:
            sys.path.append(lora_dir)
        import lora_weight_cache
        return lora_weight_cache.load_cached_lora_weights
    except Exception:
        return lambda path: (comfy.utils.load_torch_file(path, safe_load=True), None)


# ---------------------------------------------------------------------------
# Model loading helpers
# ---------------------------------------------------------------------------

def _get_or_load_checkpoint(ckpt_name, need_clip=True, need_vae=True):
    if not ckpt_name or ckpt_name == "None":
        return None, None, None

    ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
    if not ckpt_path:
        ckpt_path = folder_paths.get_full_path("diffusion_models", ckpt_name)
    if not ckpt_path:
        return None, None, None

    # 1. Try standard checkpoint loader
    try:
        out = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=need_vae,
            output_clip=need_clip,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )
        model = out[0] if len(out) > 0 else None
        clip = out[1] if (len(out) > 1 and need_clip) else None
        vae = out[2] if (len(out) > 2 and need_vae) else None
        return model, clip, vae
    except Exception:
        pass

    # 2. Try diffusion model loader (Wan 2.1, Hunyuan, CogVideo, LTX-Video, …)
    try:
        model = comfy.sd.load_diffusion_model(ckpt_path)
        return model, None, None
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Could not load model '{ckpt_name}': {e}")
        return None, None, None


def _get_or_load_vae(vae_name):
    if not vae_name or vae_name == "None":
        return None

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
        return vae
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Could not load VAE '{vae_name}': {e}")
        return None


def _detect_clip_type(clip_name, model_name=None, user_clip_type=None):
    if user_clip_type and str(user_clip_type).lower() != "auto":
        key = str(user_clip_type).strip().upper()
        if hasattr(comfy.sd.CLIPType, key):
            return getattr(comfy.sd.CLIPType, key)

    low = (clip_name or "").lower()
    mod_low = (model_name or "").lower()

    # Krea 2 (12-layer Qwen3-VL stack with 12x2560=30720 features)
    if "krea" in low or "krea" in mod_low or "qwen3" in low or "qwen3_vl" in low or "qwen3-vl" in low:
        return getattr(comfy.sd.CLIPType, "KREA2", None)

    if "wan" in low or "umt5" in low or "wan" in mod_low:
        return getattr(comfy.sd.CLIPType, "WAN", None)
    if "ltx" in low or "ltx" in mod_low:
        return getattr(comfy.sd.CLIPType, "LTXV", None)
    if "hunyuan" in low or "hunyuan" in mod_low:
        if "video" in low or "video" in mod_low:
            return getattr(comfy.sd.CLIPType, "HUNYUAN_VIDEO", None)
        return getattr(comfy.sd.CLIPType, "HUNYUAN_IMAGE", None) or getattr(comfy.sd.CLIPType, "HUNYUAN_VIDEO", None)
    if "cogvideo" in low or "cogvideo" in mod_low:
        return getattr(comfy.sd.CLIPType, "COGVIDEOX", None)
    if "mochi" in low or "mochi" in mod_low:
        return getattr(comfy.sd.CLIPType, "MOCHI", None)
    if "qwen" in low:
        if "krea" in mod_low:
            return getattr(comfy.sd.CLIPType, "KREA2", None)
        return getattr(comfy.sd.CLIPType, "QWEN_IMAGE", None)
    if "gemma" in low or "lumina" in low or "lumina" in mod_low:
        return getattr(comfy.sd.CLIPType, "LUMINA2", None)
    if "flux" in low or "flux" in mod_low:
        return getattr(comfy.sd.CLIPType, "FLUX", None)
    if "sd3" in low or "t5" in low or "sd3" in mod_low:
        return getattr(comfy.sd.CLIPType, "SD3", None)
    if "pixart" in low or "pixart" in mod_low:
        return getattr(comfy.sd.CLIPType, "PIXART", None)
    if "cosmos" in low or "cosmos" in mod_low:
        return getattr(comfy.sd.CLIPType, "COSMOS", None)
    if "chroma" in low or "chroma" in mod_low:
        return getattr(comfy.sd.CLIPType, "CHROMA", None)
    if "hidream" in low or "hidream" in mod_low:
        return getattr(comfy.sd.CLIPType, "HIDREAM", None)
    if "kandinsky" in low or "kandinsky" in mod_low:
        return getattr(comfy.sd.CLIPType, "KANDINSKY5", None)
    if "ovis" in low or "ovis" in mod_low:
        return getattr(comfy.sd.CLIPType, "OVIS", None)
    return getattr(comfy.sd.CLIPType, "STABLE_DIFFUSION", None)


def _get_or_load_clip(clip_name, clip_type="auto", model_name=""):
    if not clip_name or clip_name == "None":
        return None

    clip_path = folder_paths.get_full_path("clip", clip_name)
    if not clip_path:
        clip_path = folder_paths.get_full_path("text_encoders", clip_name)
    if not clip_path:
        return None

    preferred_type = _detect_clip_type(clip_name, model_name=model_name, user_clip_type=clip_type)
    candidate_types = [preferred_type] if preferred_type else []
    for t_name in [
        "KREA2", "WAN", "SD3", "LTXV", "HUNYUAN_VIDEO", "FLUX", "LUMINA2",
        "QWEN_IMAGE", "COGVIDEOX", "MOCHI", "STABLE_DIFFUSION"
    ]:
        t = getattr(comfy.sd.CLIPType, t_name, None)
        if t and t not in candidate_types:
            candidate_types.append(t)

    for ctype in candidate_types:
        try:
            clip = comfy.sd.load_clip(
                ckpt_paths=[clip_path],
                embedding_directory=folder_paths.get_folder_paths("embeddings"),
                clip_type=ctype,
            )
            return clip
        except Exception:
            continue

    logger.warning(f"[Prompt Sensei] Could not load Text Encoder '{clip_name}'")
    return None


def _clean_str(val):
    if val is None:
        return ""
    return str(val).strip()


def compose_final_prompt(manual_prompt, loras_list):
    """Combine prompt with selected active LoRA trigger words cleanly at the beginning (Trigger + prompt)."""
    text = _clean_str(manual_prompt)
    triggers = []
    if isinstance(loras_list, list):
        for row in loras_list:
            if not isinstance(row, dict) or row.get("enabled", True) is False:
                continue
            for t in row.get("selectedTriggers", []):
                t_clean = _clean_str(t)
                if t_clean and t_clean.lower() not in [x.lower() for x in triggers]:
                    triggers.append(t_clean)

    if not triggers:
        return text
    trigger_str = ", ".join(triggers)
    if not text:
        return trigger_str

    # Avoid duplicate trigger inclusions if already in prompt text
    filtered_triggers = []
    for t in triggers:
        pattern = r'(?:\b|_)' + re.escape(t.strip()) + r'(?:\b|_)'
        if not re.search(pattern, text, re.IGNORECASE):
            filtered_triggers.append(t)

    if not filtered_triggers:
        return text
    triggers_prefix = ", ".join(filtered_triggers).strip().rstrip(",")
    clean_text = text.strip().lstrip(",").strip()
    return f"{triggers_prefix}, {clean_text}" if clean_text else triggers_prefix


def _apply_loras(model, clip, loras_list):
    """Apply the ordered LoRA list to model (and optionally clip) using cached weights."""
    if not loras_list or not isinstance(loras_list, list):
        return model, clip

    current_model = model
    current_clip = clip

    for row in loras_list:
        if not isinstance(row, dict):
            continue
        if row.get("enabled", True) is False:
            continue

        name = _clean_str(row.get("name"))
        if not name or name == "None" or name == "[None]":
            continue

        lora_path = folder_paths.get_full_path("loras", name)
        if not lora_path:
            norm_name = name.replace("/", os.sep).replace("\\", os.sep)
            lora_path = folder_paths.get_full_path("loras", norm_name)
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
            logger.warning(f"[Prompt Sensei] LoRA file not found: '{name}'")
            continue

        try:
            strength_m = float(row.get("strength", row.get("modelStrength", 1.0)))
        except (ValueError, TypeError):
            strength_m = 1.0

        try:
            strength_c = float(row.get("clipStrength", strength_m))
        except (ValueError, TypeError):
            strength_c = strength_m

        if strength_m == 0.0 and strength_c == 0.0:
            continue

        if current_model is None and current_clip is None:
            continue

        try:
            lora_loader_fn = _get_lora_cache_loader()
            lora_data, lora_meta = lora_loader_fn(lora_path)
            if lora_data is not None:
                has_audio = any("audio" in str(k).lower() for k in lora_data.keys())
                if has_audio:
                    video_weights = {k: v for k, v in lora_data.items() if "audio" not in str(k).lower()}
                    audio_weights = {k: v for k, v in lora_data.items() if "audio" in str(k).lower()}
                    if video_weights and (strength_m != 0.0 or strength_c != 0.0):
                        try:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model, current_clip, video_weights, strength_m, strength_c, lora_metadata=lora_meta
                            )
                        except TypeError:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model, current_clip, video_weights, strength_m, strength_c
                            )
                    if audio_weights and current_model is not None and strength_m != 0.0:
                        try:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model, current_clip, audio_weights, strength_m, strength_c, lora_metadata=lora_meta
                            )
                        except TypeError:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model, current_clip, audio_weights, strength_m, strength_c
                            )
                else:
                    try:
                        current_model, current_clip = comfy.sd.load_lora_for_models(
                            current_model, current_clip, lora_data, strength_m, strength_c, lora_metadata=lora_meta
                        )
                    except TypeError:
                        current_model, current_clip = comfy.sd.load_lora_for_models(
                            current_model, current_clip, lora_data, strength_m, strength_c
                        )
                logger.info(f"[Prompt Sensei] Successfully applied LoRA '{name}' (model={strength_m}, clip={strength_c})")
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

# State keys that never influence what execute() outputs (status/UI/telemetry only).
_SENSEI_VOLATILE_KEYS = frozenset({
    "status", "error_msg", "telemetry", "hardware",
    "prompt_height", "notes_height",
    "sys_prompt_expanded", "img_expanded", "lora_expanded",
    "gear_tab", "section_order",
    "collapsed", "livePromptStatus", "active_section", "active_tab", "show_settings",
})

# Maps node_id -> prompt_text auto-generated by the LLM during execute() fallback.
_AUTO_GENERATED_PROMPTS = {}


def _sensei_stable_state(state, node_id=None):
    """Return a copy of the Sensei state with non-execution fields removed."""
    stable = {k: v for k, v in state.items() if k not in _SENSEI_VOLATILE_KEYS}
    current_prompt = str(stable.get("generated_prompt") or stable.get("prompt") or "").strip()
    if node_id:
        auto_gen = _AUTO_GENERATED_PROMPTS.get(str(node_id), "")
        # If the state prompt matches the prompt auto-generated during the last run,
        # normalize to empty string so that the post-execution sync does not invalidate the cache!
        if auto_gen and current_prompt == auto_gen:
            current_prompt = ""
            stable["generated_prompt"] = ""
            if "prompt" in stable:
                stable["prompt"] = ""

    has_prompt = bool(current_prompt)
    for key in ("lm_studio", "built_in"):
        cfg = stable.get(key)
        if not isinstance(cfg, dict):
            continue
        drop = {"pause_to_edit"}
        if has_prompt:
            # A stored prompt skips the LLM call, so the seed cannot change the output.
            drop |= {"seed", "randomize_seed"}
        stable[key] = {k: v for k, v in cfg.items() if k not in drop}
    return stable


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
            "optional": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "SenseiState": (
                    "STRING",
                    {"default": "{}", "multiline": False},
                ),
                "unique_id": "UNIQUE_ID",
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
    # Normal workflow provider node. Downstream terminal nodes (SaveImage, Image Checkpoint) drive execution.
    OUTPUT_NODE = False

    @classmethod
    def IS_CHANGED(cls, SenseiState="{}", unique_id=None, **kwargs):
        # Hash only what affects execution. The raw state also holds values that change
        # on their own (status, telemetry, hardware stats, randomized seeds, UI sizes).
        # Hashing those made ComfyUI treat Sensei as "changed" on every submit, so it and
        # everything fed by it (model, clip, text encode) re-ran, e.g. on Checkpoint Continue.
        try:
            state = json.loads(SenseiState) if isinstance(SenseiState, str) else SenseiState
            if isinstance(state, dict):
                node_id = str(unique_id) if unique_id is not None else None
                payload = json.dumps(_sensei_stable_state(state, node_id=node_id), sort_keys=True, default=str)
            else:
                payload = SenseiState or ""
            return hashlib.sha256(payload.encode("utf-8")).hexdigest()
        except Exception:
            return float("nan")

    def execute(self, SenseiState="{}", image=None, unique_id=None):
        try:
            state = json.loads(SenseiState) if isinstance(SenseiState, str) else SenseiState
            if not isinstance(state, dict):
                state = {}
        except Exception:
            state = {}

        mode = str(state.get("mode") or "i2v").lower()
        provider = str(state.get("provider") or "lm_studio").lower()

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
        if mode in ("t2i", "t2v"):
            # Image is disabled / ignored in text-only modes
            image_tensor = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        elif image is not None:
            # Connected optional image socket takes precedence
            image_tensor = image
        else:
            image_tensor = _load_original_image(img_path)

        # ------------------------------------------------------------------
        # 3. Models
        # ------------------------------------------------------------------
        models_cfg = state.get("models") or {}
        model_name = models_cfg.get("model") or ""
        video_vae_name = models_cfg.get("video_vae") or ""
        audio_vae_name = models_cfg.get("audio_vae") or ""
        text_enc_name = models_cfg.get("text_enc") or ""
        clip_type_setting = models_cfg.get("clip_type") or "auto"
        attention_mode = models_cfg.get("attention") or "default"

        # 1. Resolve external text encoder and VAEs first
        clip = _get_or_load_clip(text_enc_name, clip_type=clip_type_setting, model_name=model_name) if text_enc_name and text_enc_name != "None" else None
        video_vae = _get_or_load_vae(video_vae_name) if video_vae_name and video_vae_name != "None" else None
        audio_vae = _get_or_load_vae(audio_vae_name) if audio_vae_name and audio_vae_name != "None" else None

        need_ckpt_clip = (clip is None)
        need_ckpt_vae = (video_vae is None or audio_vae is None)

        # 2. Load checkpoint only requesting components not supplied externally
        model, loaded_clip, loaded_vae = _get_or_load_checkpoint(
            model_name, need_clip=need_ckpt_clip, need_vae=need_ckpt_vae
        )

        if video_vae is None:
            video_vae = loaded_vae
        if audio_vae is None:
            audio_vae = loaded_vae
        if clip is None:
            clip = loaded_clip

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
        # 5. Generated Prompt & Trigger Composition (Trigger + prompt)
        # ------------------------------------------------------------------
        if mode == "custom":
            # Custom mode: pass-through without any LLM call or provider
            prompt_text = str(
                state.get("custom_text")
                or state.get("generated_prompt")
                or state.get("scene_notes")
                or ""
            ).strip()
            final_prompt = compose_final_prompt(prompt_text, loras)
            return {
                "ui": {"prompt": [final_prompt]},
                "result": (
                    image_tensor,
                    model,
                    video_vae,
                    audio_vae,
                    clip,
                    width,
                    height,
                    duration,
                    fps,
                    final_prompt,
                ),
            }

        prompt_in_state = str(
            state.get("generated_prompt")
            or state.get("prompt")
            or ""
        ).strip()
        prompt_text = prompt_in_state

        notes_per_mode = state.get("notes_per_mode") or {}
        active_notes = notes_per_mode.get(mode) or state.get("scene_notes") or ""

        if not prompt_text and (active_notes or (img_path and mode == "i2v")):
            system_prompts = state.get("system_prompts") or {}
            sys_prompt = system_prompts.get(mode) or state.get("system_prompt", "")
            target_img_path = img_path if mode == "i2v" else None
            target_img_tensor = image_tensor if (mode == "i2v" and image is not None) else None

            if provider == "built_in":
                bi_cfg = dict(state.get("built_in") or {})
                if "auto_unload" not in bi_cfg:
                    bi_cfg["auto_unload"] = bool(state.get("auto_unload", True))
                try:
                    from .builtin_llm import generate_prompt_builtin
                    res = generate_prompt_builtin(
                        scene_notes=active_notes,
                        system_prompt=sys_prompt,
                        image_path=target_img_path,
                        image_tensor=target_img_tensor,
                        builtin_config=bi_cfg,
                        context=video_cfg,
                    )
                    if res.get("status") == "completed" and res.get("prompt"):
                        prompt_text = res["prompt"].strip()
                except Exception as e:
                    logger.warning(f"[Prompt Sensei] Built-In generation during execute fallback: {e}")
            else:
                lm_cfg = state.get("lm_studio") or {}
                if lm_cfg.get("model"):
                    try:
                        res = generate_prompt_lm_studio(
                            scene_notes=active_notes,
                            system_prompt=sys_prompt,
                            image_path=target_img_path,
                            lm_studio_config=lm_cfg,
                            context=video_cfg,
                        )
                        if res.get("status") == "completed" and res.get("prompt"):
                            prompt_text = res["prompt"].strip()
                    except Exception as e:
                        logger.warning(f"[Prompt Sensei] Generation during execute fallback: {e}")

        if not prompt_text:
            prompt_text = str(active_notes).strip()

        final_prompt = compose_final_prompt(prompt_text, loras)

        if unique_id is not None:
            node_id_str = str(unique_id)
            if not prompt_in_state and prompt_text:
                _AUTO_GENERATED_PROMPTS[node_id_str] = final_prompt
            else:
                _AUTO_GENERATED_PROMPTS[node_id_str] = ""

        ui_data = {"prompt": [final_prompt]}
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
                        "prompt": final_prompt,
                        "tokens": tokens_count,
                        "speed": speed_val,
                        "elapsed": elapsed_val,
                        "model": model_name,
                    },
                )
            except Exception:
                pass

        try:
            import comfy.model_management as mm
            mm.soft_empty_cache()
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
                final_prompt,   # STRING — generated / edited prompt with LoRA triggers prepended
            ),
        }


NODE_CLASS_MAPPINGS = {
    "DS_AIPromptSensei": DS_AIPromptSensei,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_AIPromptSensei": "DS AI Prompt Sensei",
}
