# DeathshotArsenal - DS Generation Hub Backend
import os
import re
import json
import logging
import folder_paths
import comfy.sd
import comfy.utils

logger = logging.getLogger("DeathshotArsenal.GenerationHub")

_CACHED_MODELS = {}

def _clean_str(val):
    if val is None:
        return ""
    return str(val).strip()

def _get_or_load_checkpoint(ckpt_name):
    if not ckpt_name or ckpt_name == "None" or ckpt_name == "[None]":
        return None, None, None
    cache_key = f"ckpt_{ckpt_name}"
    if cache_key in _CACHED_MODELS:
        return _CACHED_MODELS[cache_key]

    ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
    if not ckpt_path:
        ckpt_path = folder_paths.get_full_path("diffusion_models", ckpt_name)
    if not ckpt_path:
        return None, None, None

    # Standard checkpoint loader
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

    # Diffusion model loader fallback (Wan, Hunyuan, FLUX unet, etc.)
    try:
        if hasattr(comfy.sd, "load_diffusion_model"):
            model = comfy.sd.load_diffusion_model(ckpt_path)
            if len(_CACHED_MODELS) > 4:
                _CACHED_MODELS.clear()
            _CACHED_MODELS[cache_key] = (model, None, None)
            return model, None, None
    except Exception as e:
        logger.warning(f"[DS Generation Hub] Could not load model '{ckpt_name}': {e}")

    return None, None, None

def _detect_clip_type(clip_name, model_name=None):
    low = (clip_name or "").lower()
    m_low = (model_name or "").lower()
    if "krea" in m_low or "krea" in low:
        return getattr(comfy.sd.CLIPType, "KREA2", None)
    if "wan" in low or "umt5" in low or "wan" in m_low:
        return getattr(comfy.sd.CLIPType, "WAN", None)
    if "ltx" in low or "ltx" in m_low:
        return getattr(comfy.sd.CLIPType, "LTXV", None)
    if "hunyuan" in low or "hunyuan" in m_low:
        return getattr(comfy.sd.CLIPType, "HUNYUAN_VIDEO", None)
    if "cogvideo" in low or "cogvideo" in m_low:
        return getattr(comfy.sd.CLIPType, "COGVIDEOX", None)
    if "mochi" in low or "mochi" in m_low:
        return getattr(comfy.sd.CLIPType, "MOCHI", None)
    if "flux" in low or "flux" in m_low:
        return getattr(comfy.sd.CLIPType, "FLUX", None)
    if "sd3" in low or "sd3" in m_low:
        return getattr(comfy.sd.CLIPType, "SD3", None)
    if "qwen" in low:
        if "krea" in m_low:
            return getattr(comfy.sd.CLIPType, "KREA2", None)
        return getattr(comfy.sd.CLIPType, "QWEN_IMAGE", None)
    if "gemma" in low or "lumina" in low:
        return getattr(comfy.sd.CLIPType, "LUMINA2", None)
    return getattr(comfy.sd.CLIPType, "STABLE_DIFFUSION", None)

def _get_or_load_clip(clip_name, model_name=None):
    if not clip_name or clip_name == "None" or clip_name == "[None]":
        return None
    cache_key = f"clip_{clip_name}_{model_name}"
    if cache_key in _CACHED_MODELS:
        return _CACHED_MODELS[cache_key]

    clip_path = folder_paths.get_full_path("clip", clip_name)
    if not clip_path:
        clip_path = folder_paths.get_full_path("text_encoders", clip_name)
    if not clip_path:
        return None

    preferred_type = _detect_clip_type(clip_name, model_name)
    candidate_types = [preferred_type] if preferred_type else []
    for t in [
        getattr(comfy.sd.CLIPType, "KREA2", None),
        getattr(comfy.sd.CLIPType, "FLUX", None),
        getattr(comfy.sd.CLIPType, "SD3", None),
        getattr(comfy.sd.CLIPType, "WAN", None),
        getattr(comfy.sd.CLIPType, "LTXV", None),
        getattr(comfy.sd.CLIPType, "HUNYUAN_VIDEO", None),
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

    logger.warning(f"[DS Generation Hub] Could not load Text Encoder '{clip_name}'")
    return None

def _get_or_load_vae(vae_name):
    if not vae_name or vae_name == "None" or vae_name == "[None]":
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
        logger.warning(f"[DS Generation Hub] Could not load VAE '{vae_name}': {e}")
        return None

def _apply_loras(model, clip, loras_list):
    """Sequentially apply ordered LoRAs to model and clip."""
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
            lora_data, lora_meta = comfy.utils.load_torch_file(lora_path, safe_load=True, return_metadata=True)
            current_model, current_clip = comfy.sd.load_lora_for_models(
                current_model, current_clip, lora_data, strength_m, strength_c, lora_metadata=lora_meta
            )
        except Exception as e:
            logger.warning(f"[DS Generation Hub] Failed to apply LoRA '{name}': {e}")

    return current_model, current_clip

def compose_final_prompt(manual_prompt, loras_list):
    """Combine manual prompt with selected active LoRA trigger words cleanly at the beginning."""
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

    # Avoid duplicate trigger inclusions if already in manual prompt
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

class DS_GenerationHub:
    """
    DS Generation Hub — Compact all-in-one generation configuration node.
    Consolidates Model, CLIP, VAE, LoRA chaining, Resolution, and Prompt.
    Outputs:
      MODEL  — Post-LoRA model
      CLIP   — Selected / auto-detected CLIP
      VAE    — Selected VAE
      WIDTH  — Calculated width (INT)
      HEIGHT — Calculated height (INT)
      PROMPT — Final composed prompt (STRING)
    """

    DESCRIPTION = (
        "Deathshot Arsenal Generation Hub: All-in-one generation configuration node. "
        "Configures model, CLIP, VAE, sequential LoRA chain with CivitAI triggers, "
        "aspect-ratio / resolution presets, and prompt with custom row-aligned sockets."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "HubState": (
                    "STRING",
                    {"default": "{}", "multiline": False},
                ),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "INT", "INT", "STRING")
    RETURN_NAMES = ("model", "clip", "vae", "width", "height", "prompt")
    FUNCTION = "execute"
    CATEGORY = "☠️ Deathshot Arsenal/⚡ Generation"

    def execute(self, HubState="{}", **kwargs):
        state = {}
        if isinstance(HubState, str):
            try:
                state = json.loads(HubState or "{}")
            except Exception:
                state = {}
        elif isinstance(HubState, dict):
            state = HubState

        model_name = _clean_str(state.get("model"))
        clip_name = _clean_str(state.get("clip"))
        vae_name = _clean_str(state.get("vae"))
        loras = state.get("loras", [])
        manual_prompt = state.get("prompt", "")

        # Resolution
        try:
            width = int(state.get("width", 1024))
        except (ValueError, TypeError):
            width = 1024
        try:
            height = int(state.get("height", 1024))
        except (ValueError, TypeError):
            height = 1024

        width = max(64, min(16384, width))
        height = max(64, min(16384, height))

        # 1. Base Model & embedded loaders
        ckpt_model, ckpt_clip, ckpt_vae = _get_or_load_checkpoint(model_name)

        # 2. Standalone CLIP or fallback to checkpoint CLIP
        final_clip = None
        if clip_name and clip_name not in ("None", "[None]", "Auto", "Auto-Detect"):
            final_clip = _get_or_load_clip(clip_name, model_name=model_name)
        elif clip_name in ("Auto", "Auto-Detect", None, ""):
            if "krea" in (model_name or "").lower():
                all_clips = folder_paths.get_filename_list("text_encoders") or folder_paths.get_filename_list("clip") or []
                krea_clips = [c for c in all_clips if "krea" in c.lower() or "qwen3vl" in c.lower()]
                if krea_clips:
                    final_clip = _get_or_load_clip(krea_clips[0], model_name=model_name)
        if final_clip is None:
            final_clip = ckpt_clip

        # 3. Standalone VAE or fallback to checkpoint VAE
        final_vae = None
        if vae_name and vae_name not in ("None", "[None]", "Auto"):
            final_vae = _get_or_load_vae(vae_name)
        if final_vae is None:
            final_vae = ckpt_vae

        # 4. LoRA Chain
        final_model = ckpt_model
        if final_model is not None and loras:
            final_model, final_clip = _apply_loras(final_model, final_clip, loras)

        # 5. Final Prompt
        final_prompt = compose_final_prompt(manual_prompt, loras)

        return (final_model, final_clip, final_vae, width, height, final_prompt)


def register_generation_hub_routes():
    try:
        import server
        from aiohttp import web
        routes = server.PromptServer.instance.routes

        @routes.get("/ds/generation_hub/catalog")
        async def _ds_hub_catalog(request):
            try:
                # Checkpoints & diffusion models
                ckpts = folder_paths.get_filename_list("checkpoints") or []
                diff_models = folder_paths.get_filename_list("diffusion_models") or []
                all_models = sorted(list(set(ckpts + diff_models)))

                # Clips & text encoders
                clips = folder_paths.get_filename_list("clip") or []
                text_encs = folder_paths.get_filename_list("text_encoders") or []
                all_clips = sorted(list(set(clips + text_encs)))

                # VAEs
                vaes = folder_paths.get_filename_list("vae") or []
                vae_approx = folder_paths.get_filename_list("vae_approx") or []
                all_vaes = sorted(list(set(vaes + vae_approx)))

                # LoRAs
                all_loras = folder_paths.get_filename_list("loras") or []

                # Attention implementations
                attentions = ["Default", "SDPA (PyTorch Native)"]
                try:
                    import comfy_kitchen
                    if hasattr(comfy_kitchen, "int8_attention_is_available") and comfy_kitchen.int8_attention_is_available():
                        attentions.append("Kitchen Attention")
                except Exception:
                    pass
                try:
                    import sageattention
                    attentions.append("SageAttention")
                except Exception:
                    pass
                try:
                    import flash_attn
                    attentions.append("FlashAttention-2")
                except Exception:
                    pass
                try:
                    import xformers
                    attentions.append("xFormers")
                except Exception:
                    pass

                return web.json_response({
                    "models": all_models,
                    "clips": all_clips,
                    "vaes": all_vaes,
                    "loras": all_loras,
                    "attentions": attentions,
                })
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        return True
    except Exception as exc:
        print(f"[DS Generation Hub] catalog route registration failed: {exc}")
        return False
