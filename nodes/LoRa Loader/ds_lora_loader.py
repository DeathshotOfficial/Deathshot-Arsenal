# DS LoRa Loader
import json
import copy
import folder_paths
import comfy.utils
import comfy.sd
from .civitai_client import inspect_lora_metadata, get_lora_full_path
from .memory_manager import clear_lora_caches

MAX_LORAS = 32

_LORA_CACHE = {}

def _load_lora_file(path):
    global _LORA_CACHE
    if path in _LORA_CACHE:
        return _LORA_CACHE[path]
    lora = comfy.utils.load_torch_file(path, safe_load=True)
    if len(_LORA_CACHE) > 8:
        _LORA_CACHE.pop(next(iter(_LORA_CACHE)))
    _LORA_CACHE[path] = lora
    return lora

def clear_local_cache():
    global _LORA_CACHE
    _LORA_CACHE.clear()

def _as_bool(v, default=True):
    return bool(default if v is None else v)

def _clean_row(row, idx=0):
    row = row if isinstance(row, dict) else {}
    model_strength = row.get("modelStrength", row.get("strength", 0.5))
    clip_strength = row.get("clipStrength", row.get("strength", 0.5))
    video_strength = row.get("videoStrength", 1.0)
    audio_strength = row.get("audioStrength", 1.0)
    try:
        model_strength = float(model_strength)
    except Exception:
        model_strength = 0.5
    try:
        clip_strength = float(clip_strength)
    except Exception:
        clip_strength = model_strength
    try:
        video_strength = float(video_strength)
    except Exception:
        video_strength = 1.0
    try:
        audio_strength = float(audio_strength)
    except Exception:
        audio_strength = 1.0
    triggers = row.get("selectedTriggers", [])
    if not isinstance(triggers, list):
        triggers = []
    return {
        "id": str(row.get("id") or f"lora-{idx+1}"),
        "name": str(row.get("name") or ""),
        "modelStrength": model_strength,
        "clipStrength": clip_strength,
        "videoStrength": video_strength,
        "audioStrength": audio_strength,
        "enabled": _as_bool(row.get("enabled"), True),
        "selectedTriggers": [str(x) for x in triggers if str(x).strip()],
    }

def _parse_state(raw):
    if not raw:
        return {"version": 1, "mode": "image", "masterEnabled": True, "rows": [], "settings": {}}
    try:
        state = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        state = {}
    if not isinstance(state, dict):
        state = {}
    rows = state.get("rows", [])
    if not isinstance(rows, list):
        rows = []
    rows = [_clean_row(r, i) for i, r in enumerate(rows[:MAX_LORAS])]
    return {
        "version": int(state.get("version", 1) or 1),
        "mode": str(state.get("mode", "image")).lower(),
        "masterEnabled": _as_bool(state.get("masterEnabled"), True),
        "rows": rows,
        "settings": state.get("settings", {}) if isinstance(state.get("settings"), dict) else {},
    }

class DS_LoRaLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
            },
            "optional": {
                "LoaderState": ("STRING", {"default": "{}", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "triggers")
    FUNCTION = "load"
    CATEGORY = "☠️ Deathshot Arsenal/💾 Utilities"
    DESCRIPTION = "Modular LoRA loader with per-LoRA strength, toggles, ordering, trigger selection and cached Civitai metadata."

    def load(self, model, clip, LoaderState="{}", unique_id=None, prompt=None, extra_pnginfo=None):
        state_raw = LoaderState

        # Fallback to prompt graph if LoaderState was not directly passed
        if (not state_raw or state_raw == "{}") and prompt and unique_id:
            try:
                node_inputs = prompt.get(str(unique_id), {}).get("inputs", {})
                state_raw = node_inputs.get("LoaderState", state_raw)
            except Exception:
                pass

        # Fallback to workflow extra_pnginfo
        if (not state_raw or state_raw == "{}") and extra_pnginfo:
            try:
                workflow = extra_pnginfo.get("workflow", {})
                for node in workflow.get("nodes", []):
                    if str(node.get("id")) == str(unique_id):
                        prop_state = node.get("properties", {}).get("ds_lora_state")
                        if prop_state:
                            state_raw = json.dumps(prop_state) if isinstance(prop_state, dict) else str(prop_state)
                            break
            except Exception:
                pass

        state = _parse_state(state_raw)
        mode = state.get("mode", "image")
        settings = state.get("settings") or {}
        separator = str(settings.get("triggerSeparator", ", "))

        current_model = model
        current_clip = clip
        trigger_parts = []

        for row in state["rows"]:
            if not row.get("enabled", True) or not state.get("masterEnabled", True):
                continue
            name = row.get("name", "").strip()
            if not name:
                continue

            # 1. Collect triggers for enabled rows
            for tag in row.get("selectedTriggers", []):
                tag = str(tag).strip()
                if tag:
                    trigger_parts.append(tag)

            lora_path = get_lora_full_path(name)
            if not lora_path:
                print(f"[DS LoRa Loader] LoRA not found: {name}")
                continue

            if mode == "video":
                try:
                    s = float(row.get("modelStrength", 1.0))
                except Exception:
                    s = 1.0
                try:
                    vs = float(row.get("videoStrength", 1.0))
                except Exception:
                    vs = 1.0
                try:
                    as_ = float(row.get("audioStrength", 1.0))
                except Exception:
                    as_ = 1.0

                eff_v = s * vs
                eff_a = s * as_

                if eff_v == 0.0 and eff_a == 0.0:
                    continue

                try:
                    lora_data = _load_lora_file(lora_path)
                    has_audio = any("audio" in str(k).lower() for k in lora_data.keys())
                    if has_audio:
                        video_weights = {k: v for k, v in lora_data.items() if "audio" not in str(k).lower()}
                        audio_weights = {k: v for k, v in lora_data.items() if "audio" in str(k).lower()}
                        if video_weights and eff_v != 0.0:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model,
                                current_clip,
                                video_weights,
                                eff_v,
                                eff_v,
                            )
                        if audio_weights and eff_a != 0.0:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model,
                                current_clip,
                                audio_weights,
                                eff_a,
                                eff_a,
                            )
                        print(f"[DS LoRa Loader] Applied Video LoRA '{name}' (overall={s}, eff_video={eff_v:.2f}, eff_audio={eff_a:.2f})")
                    else:
                        if eff_v != 0.0:
                            current_model, current_clip = comfy.sd.load_lora_for_models(
                                current_model,
                                current_clip,
                                lora_data,
                                eff_v,
                                eff_v,
                            )
                            print(f"[DS LoRa Loader] Applied Video LoRA '{name}' (overall={s}, eff_video={eff_v:.2f})")
                except Exception as exc:
                    print(f"[DS LoRa Loader] Failed to apply Video LoRA '{name}': {exc}")
                    continue
            else:
                try:
                    lm = float(row.get("modelStrength", 0.5))
                except Exception:
                    lm = 0.5
                try:
                    lc = float(row.get("clipStrength", lm))
                except Exception:
                    lc = lm

                # 2. Apply LoRA weights to model and clip
                if lm != 0.0 or lc != 0.0:
                    try:
                        lora_data = _load_lora_file(lora_path)
                        current_model, current_clip = comfy.sd.load_lora_for_models(
                            current_model,
                            current_clip,
                            lora_data,
                            lm,
                            lc,
                        )
                        print(f"[DS LoRa Loader] Successfully applied LoRA '{name}' (model={lm}, clip={lc})")
                    except Exception as exc:
                        print(f"[DS LoRa Loader] Failed to apply '{name}': {exc}")
                        continue

        if str(settings.get("memoryMode", "Standard")) == "Lowest":
            try:
                clear_local_cache()
                clear_lora_caches()
            except Exception as exc:
                print(f"[DS LoRa Loader] cache cleanup warning: {exc}")

        # Preserve order and remove duplicate trigger words
        seen = set()
        unique = []
        for tag in trigger_parts:
            key = tag.casefold()
            if key not in seen:
                seen.add(key)
                unique.append(tag)

        compiled_triggers = separator.join(unique)
        print(f"[DS LoRa Loader] Output triggers: '{compiled_triggers}'")

        return (current_model, current_clip, compiled_triggers)


NODE_CLASS_MAPPINGS = {"DS_LoRaLoader": DS_LoRaLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_LoRaLoader": "DS LoRa Loader"}