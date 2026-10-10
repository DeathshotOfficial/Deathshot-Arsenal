"""DS Image Checkpoint - IMAGE gate using frontend-coordinated prompt pruning.

This is a normal ComfyUI IMAGE -> IMAGE node. The frontend decides whether a
submitted prompt is paused, passed, or continued; the backend never blocks a
worker thread. In Pause mode downstream nodes are removed from the submitted
prompt. Continue submits a second prompt with the upstream generation pruned
away and this node reloads its saved snapshot. Pass leaves the prompt intact.
"""
import json
import os
import re
import shutil
import time
import uuid

import numpy as np
import torch
from PIL import Image, PngImagePlugin
from aiohttp import web

import folder_paths
import server

LOG = "[DS Image Checkpoint]"


def _log(message):
    print(f"{LOG} {message}", flush=True)


def _safe_id(node_id):
    value = "".join(c for c in str(node_id) if c.isalnum() or c in "_-")
    return value or "node"


def _snapshot_path(node_id):
    temp = folder_paths.get_temp_directory()
    os.makedirs(temp, exist_ok=True)
    return os.path.join(temp, f"ds_image_checkpoint_{_safe_id(node_id)}.png")


def _tensor_to_pil(frame):
    arr = frame.detach().cpu().numpy()
    if arr.ndim == 3 and arr.shape[-1] > 3:
        arr = arr[..., :3]
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def _pil_to_tensor(path):
    with Image.open(path) as img:
        arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return torch.from_numpy(arr)[None, ...]


def _link_id(value):
    if isinstance(value, (list, tuple)) and value:
        try:
            return str(int(value[0]))
        except Exception:
            return str(value[0])
    return None


def _is_link(value):
    return isinstance(value, (list, tuple)) and len(value) >= 1 and isinstance(value[0], (str, int))


def _find_start_node(prompt, node_id, class_name="DS_ImageCheckpoint"):
    if not isinstance(prompt, dict):
        return None
    sid = str(node_id) if node_id is not None else ""
    if sid in prompt:
        return sid
    if class_name:
        matches = [str(k) for k, v in prompt.items() if isinstance(v, dict) and str(v.get("class_type", "")) == class_name]
        return matches[0] if len(matches) == 1 else None
    return None


def _upstream_nodes(prompt, start_id, max_nodes=1000):
    if not isinstance(prompt, dict) or start_id is None or str(start_id) not in prompt:
        return []
    queue = [(str(start_id), 0)]
    seen = set()
    out = []
    while queue and len(seen) < max_nodes:
        nid, depth = queue.pop(0)
        if nid in seen or nid not in prompt:
            continue
        seen.add(nid)
        info = prompt.get(nid)
        if not isinstance(info, dict):
            continue
        out.append((nid, info, depth))
        inputs = info.get("inputs") or {}
        if isinstance(inputs, dict):
            for value in inputs.values():
                src = _link_id(value)
                if src is not None and src not in seen:
                    queue.append((src, depth + 1))
    return out


def _resolve_input_value(prompt, node_id, input_name, depth=0):
    if depth > 10 or not isinstance(prompt, dict):
        return None
    node = prompt.get(str(node_id))
    if not isinstance(node, dict):
        return None
    inputs = node.get("inputs") or {}
    value = inputs.get(input_name)
    if value is None:
        return None
    if not _is_link(value):
        return value
    src = _link_id(value)
    if src is None:
        return None
    src_node = prompt.get(src) or {}
    src_inputs = src_node.get("inputs") or {}
    same = src_inputs.get(input_name)
    if same is not None and not _is_link(same):
        return same
    for key in ("value", "Value", "int", "float", "number", "seed", "noise_seed", "text"):
        candidate = src_inputs.get(key)
        if candidate is not None and not _is_link(candidate):
            return candidate
    return _resolve_input_value(prompt, src, input_name, depth + 1)


def _model_from_loader(info):
    if not isinstance(info, dict):
        return None, None
    inputs = info.get("inputs") or {}
    ct = str(info.get("class_type", "")).lower()
    if "sensei" in ct:
        try:
            state = json.loads(inputs.get("SenseiState", "{}"))
            models = state.get("models", {})
            if isinstance(models, dict) and models.get("model"):
                return models.get("model"), "model"
            if state.get("ckpt_name"):
                return state.get("ckpt_name"), "ckpt_name"
        except Exception:
            pass
    keys = ("ckpt_name", "unet_name", "model_name", "model_path", "checkpoint", "checkpoint_name", "model")
    for key in keys:
        value = inputs.get(key)
        if isinstance(value, str) and value.strip() and not _is_link(value):
            if any(ext in value.lower() for ext in (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf")):
                return value.strip(), key
    return None, None


def _find_checkpoint(prompt, sampler_id, all_nodes):
    if sampler_id and isinstance(prompt, dict):
        queue = [str(sampler_id)]
        seen = set()
        while queue and len(seen) < 500:
            nid = queue.pop(0)
            if nid in seen or nid not in prompt:
                continue
            seen.add(nid)
            info = prompt.get(nid) or {}
            model, key = _model_from_loader(info)
            if model:
                return model, key
            inputs = info.get("inputs") or {}
            if isinstance(inputs, dict):
                for name, value in inputs.items():
                    if name in ("model", "unet", "base_model", "guider", "diffusion_model", "pipe"):
                        src = _link_id(value)
                        if src and src not in seen:
                            queue.append(src)
    for nid, info, _depth in all_nodes:
        model, key = _model_from_loader(info)
        if model:
            return model, key
    return "", ""


def _sampler_info(prompt, start_id, all_nodes):
    sampler = None
    for nid, info, depth in all_nodes:
        if depth == 0:
            continue
        ct = str(info.get("class_type", ""))
        if "sampler" in ct.lower() and "samplerselect" not in ct.lower():
            sampler = nid
            break
    if not sampler:
        return None, {}
    info = prompt.get(sampler) or {}
    out = {}
    for key in ("seed", "noise_seed", "random_seed", "variation_seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"):
        value = _resolve_input_value(prompt, sampler, key)
        if value is not None:
            out[key] = value
    if "seed" not in out:
        out["seed"] = out.get("noise_seed")
    return sampler, out


def _extract_text_from_node(nid, prompt, seen=None):
    if seen is None:
        seen = set()
    nid = str(nid)
    if nid in seen or nid not in prompt:
        return ""
    seen.add(nid)
    info = prompt.get(nid) or {}
    inp = info.get("inputs") or {}
    ct = str(info.get("class_type", "")).lower()

    if "zeroout" in ct:
        return ""

    if "sensei" in ct:
        try:
            state = json.loads(inp.get("SenseiState", "{}"))
            for k in ("generated_prompt", "positive_prompt", "prompt", "user_prompt"):
                val = state.get(k)
                if isinstance(val, str) and val.strip() and val.strip().lower() != "randomize":
                    return val.strip()
        except Exception:
            pass

    if "randomizer" in ct:
        try:
            import sys
            for mod_name in ("nodes.Randomizer.ds_randomizer", "DeathshotArsenal.nodes.Randomizer.ds_randomizer", "custom_nodes.DeathshotArsenal.nodes.Randomizer.ds_randomizer"):
                mod = sys.modules.get(mod_name)
                if mod and hasattr(mod, "_NODE_PROMPT_CACHE"):
                    cache = getattr(mod, "_NODE_PROMPT_CACHE")
                    if nid in cache and cache[nid].get("prompt"):
                        return cache[nid]["prompt"]
            from ..Randomizer.ds_randomizer import _NODE_PROMPT_CACHE
            if nid in _NODE_PROMPT_CACHE and _NODE_PROMPT_CACHE[nid].get("prompt"):
                return _NODE_PROMPT_CACHE[nid]["prompt"]
        except Exception:
            pass
        try:
            state = json.loads(inp.get("randomizer_state", "{}"))
            preview = state.get("preview_prompt")
            if isinstance(preview, str) and preview.strip() and preview.strip().lower() != "randomize":
                return preview.strip()
        except Exception:
            pass

    for k in ("text", "prompt", "string", "value", "positive", "conditioning", "pipe"):
        if k in inp and _is_link(inp[k]):
            found = _extract_text_from_node(_link_id(inp[k]), prompt, seen)
            if found:
                return found

    for k in ("text", "prompt", "string", "value"):
        val = inp.get(k)
        if isinstance(val, str) and val.strip() and val.strip().lower() not in ("randomize", "none", "undefined"):
            return val.strip()

    for name, val in inp.items():
        if _is_link(val):
            found = _extract_text_from_node(_link_id(val), prompt, seen)
            if found:
                return found

    return ""


def _prompt_text(prompt, sampler_id, all_nodes):
    positive = negative = ""
    if not isinstance(prompt, dict):
        return positive, negative
    sampler = prompt.get(str(sampler_id)) if sampler_id else None
    inputs = sampler.get("inputs", {}) if isinstance(sampler, dict) else {}
    pos_id = _link_id(inputs.get("positive")) if isinstance(inputs, dict) else None
    neg_id = _link_id(inputs.get("negative")) if isinstance(inputs, dict) else None

    if pos_id:
        positive = _extract_text_from_node(pos_id, prompt)
    if neg_id:
        neg_node = prompt.get(str(neg_id)) or {}
        ct_neg = str(neg_node.get("class_type", "")).lower()
        if "zeroout" not in ct_neg:
            negative = _extract_text_from_node(neg_id, prompt)

    return positive, negative


def _workflow_fallback(extra_pnginfo):
    out = {"seed": "", "model": "", "model_key": "", "steps": "", "cfg": "", "sampler_name": "", "scheduler": "", "positive_prompt": "", "negative_prompt": ""}
    wf = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
    nodes = wf.get("nodes") if isinstance(wf, dict) else None
    if not isinstance(nodes, list):
        return out
    for n in nodes:
        if not isinstance(n, dict):
            continue
        ct = str(n.get("type") or n.get("class_type") or "")
        vals = n.get("widgets_values")
        if not isinstance(vals, list):
            continue
        low = ct.lower()
        if "sensei" in low and not out["positive_prompt"]:
            for v in vals:
                if isinstance(v, str) and len(v) > 20:
                    try:
                        state = json.loads(v)
                        for sk in ("generated_prompt", "positive_prompt", "prompt"):
                            if state.get(sk) and len(state[sk]) > 10:
                                out["positive_prompt"] = state[sk]
                                break
                    except Exception:
                        pass
        if not out["model"] and any(x in low for x in ("checkpointloader", "unetloader", "diffusionmodelload", "sensei")):
            for v in vals:
                if isinstance(v, str) and v.strip():
                    if any(ext in v.lower() for ext in (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf")):
                        out["model"] = os.path.splitext(os.path.basename(v.replace("\\", "/")))[0]
                        out["model_key"] = "ckpt_name"
                        break
        if "ksampler" in low and not out["seed"]:
            if len(vals) > 0 and isinstance(vals[0], (int, float, str)):
                out["seed"] = str(vals[0])
            if len(vals) > 1: out["steps"] = str(vals[1])
            if len(vals) > 2: out["cfg"] = str(vals[2])
            if len(vals) > 3: out["sampler_name"] = str(vals[3])
            if len(vals) > 4: out["scheduler"] = str(vals[4])
        if not out["positive_prompt"] and "cliptextencode" in low and isinstance(vals[0] if vals else None, str):
            text = vals[0].strip()
            if text and text.lower() != "randomize":
                if "negative" in low:
                    out["negative_prompt"] = text
                else:
                    out["positive_prompt"] = text
    return out


def _graph_context(prompt, node_id, extra_pnginfo=None):
    result = {"seed": "", "model": "", "model_key": "", "steps": "", "cfg": "", "sampler_name": "", "scheduler": "", "denoise": "", "positive_prompt": "", "negative_prompt": ""}
    start = _find_start_node(prompt, node_id, "DS_ImageCheckpoint")
    nodes = _upstream_nodes(prompt, start) if start is not None else []
    if nodes:
        sampler_id, sampler = _sampler_info(prompt, start, nodes)
        if sampler:
            result["seed"] = str(sampler.get("seed", "") or "")
            for k in ("steps", "cfg", "sampler_name", "scheduler", "denoise"):
                if sampler.get(k) is not None:
                    result[k] = str(sampler[k])
        model, model_key = _find_checkpoint(prompt, sampler_id, nodes)
        if model:
            result["model"] = os.path.splitext(os.path.basename(model.replace("\\", "/")))[0]
            result["model_key"] = model_key
        positive, negative = _prompt_text(prompt, sampler_id, nodes)
        result["positive_prompt"] = positive
        result["negative_prompt"] = negative

    wf = _workflow_fallback(extra_pnginfo)
    for key in ("seed", "model", "model_key", "steps", "cfg", "sampler_name", "scheduler", "denoise", "positive_prompt", "negative_prompt"):
        if not result.get(key) and wf.get(key):
            result[key] = wf[key]
    return result


def _a1111_parameters(context, width, height):
    positive = str(context.get("positive_prompt", "") or "").strip()
    negative = str(context.get("negative_prompt", "") or "").strip()
    pairs = []
    for label, key in (("Steps", "steps"), ("Sampler", "sampler_name"), ("CFG scale", "cfg"), ("Seed", "seed")):
        value = str(context.get(key, "") or "").strip()
        if value:
            pairs.append(f"{label}: {value}")
    model = str(context.get("model", "") or "").strip()
    if model:
        pairs.append(f"Model: {model}")
    if width and height:
        pairs.append(f"Size: {width}x{height}")
    text = positive
    if negative:
        text += ("\n" if text else "") + "Negative prompt: " + negative
    if pairs:
        text += ("\n" if text else "") + ", ".join(pairs)
    return text or None


def _add_png_text(pnginfo, key, value):
    try:
        if isinstance(value, str):
            pnginfo.add_text(str(key), value)
        else:
            pnginfo.add_text(str(key), json.dumps(value, ensure_ascii=False))
    except Exception:
        pass


def _build_pnginfo(prompt, extra_pnginfo, context, width, height):
    pnginfo = PngImagePlugin.PngInfo()
    if prompt is not None:
        _add_png_text(pnginfo, "prompt", prompt)
    if isinstance(extra_pnginfo, dict):
        for key, value in extra_pnginfo.items():
            _add_png_text(pnginfo, key, value)
    parameters = _a1111_parameters(context, width, height)
    if parameters:
        _add_png_text(pnginfo, "parameters", parameters)
    _add_png_text(pnginfo, "DS_ImageCheckpoint", {
        "seed": context.get("seed", ""),
        "model": context.get("model", ""),
        "steps": context.get("steps", ""),
        "cfg": context.get("cfg", ""),
        "sampler_name": context.get("sampler_name", ""),
        "scheduler": context.get("scheduler", ""),
        "width": width,
        "height": height,
    })
    return pnginfo


def _write_snapshot(image, node_id, prompt=None, extra_pnginfo=None):
    path = _snapshot_path(node_id)
    pil = _tensor_to_pil(image[0])
    width, height = pil.width, pil.height
    context = _graph_context(prompt, node_id, extra_pnginfo)
    pnginfo = _build_pnginfo(prompt, extra_pnginfo, context, width, height)
    tmp = f"{path}.{uuid.uuid4().hex}.tmp"
    pil.save(tmp, "PNG", pnginfo=pnginfo)
    os.replace(tmp, path)
    return path, width, height


async def _preview(request):
    node_id = request.query.get("node", "")
    path = _snapshot_path(node_id)
    if not os.path.isfile(path):
        return web.Response(status=404)
    return web.FileResponse(path, headers={"Cache-Control": "no-store"})


async def _save(request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    node_id = data.get("node_id", "")
    requested = str(data.get("filename", "DS_ImageCheckpoint")).strip()
    source = _snapshot_path(node_id)
    if not os.path.isfile(source):
        return web.json_response({"ok": False, "error": "preview not available", "filename": requested}, status=404)

    try:
        output_dir = folder_paths.get_output_directory()
        os.makedirs(output_dir, exist_ok=True)
        safe = os.path.basename(requested) or "DS_ImageCheckpoint"
        safe = os.path.splitext(safe)[0]
        safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in safe).strip() or "DS_ImageCheckpoint"
        stamp = time.strftime("%Y%m%d_%H%M%S")
        path = os.path.join(output_dir, f"{safe}_{stamp}_{uuid.uuid4().hex[:6]}.png")
        shutil.copy2(source, path)
        _log(f"saved node={node_id} path={path}")
        return web.json_response({"ok": True, "filename": os.path.basename(path), "path": path})
    except Exception as exc:
        _log(f"save error: {exc}")
        return web.json_response({"ok": False, "error": str(exc), "filename": requested}, status=500)


try:
    server.PromptServer.instance.routes.get("/ds/image_checkpoint/preview")(_preview)
    server.PromptServer.instance.routes.post("/ds/image_checkpoint/save")(_save)
except Exception as exc:
    _log(f"route registration warning: {exc}")


class DS_ImageCheckpoint:
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "run"
    OUTPUT_NODE = True
    DESCRIPTION = "IMAGE checkpoint: pause, inspect, regenerate, or pass through a workflow."

    @classmethod
    def IS_CHANGED(cls, image=None, PauseState="", unique_id=None, **kwargs):
        path = _snapshot_path(unique_id)
        mtime = os.path.getmtime(path) if os.path.isfile(path) else 0
        return f"{mtime}_{PauseState}"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE", {"tooltip": "Image to inspect. In Continue mode the saved checkpoint image is used instead of this live input."}),
            },
            "hidden": {
                "PauseState": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    def run(self, image=None, PauseState="", unique_id=None, prompt=None, extra_pnginfo=None):
        node_id = str(unique_id)
        try:
            state = json.loads(PauseState) if PauseState else {}
        except Exception:
            state = {}
        mode = state.get("mode", "pause")
        if mode not in ("pause", "continue", "pass"):
            mode = "pause"

        if mode == "continue":
            path = _snapshot_path(node_id)
            if not os.path.isfile(path):
                raise RuntimeError(
                    "DS Image Checkpoint: snapshot expired or is missing. Run the workflow again in Pause mode."
                )
            try:
                output = _pil_to_tensor(path)
            except Exception as exc:
                raise RuntimeError(
                    "DS Image Checkpoint: snapshot could not be read. Run the workflow again in Pause mode."
                ) from exc
            height, width = output.shape[1], output.shape[2]
            _log(f"CONTINUE node={node_id} using snapshot {width}x{height}; upstream pruned")
            return {
                "ui": {
                    "ds_image_checkpoint": [{
                        "filename": os.path.basename(path),
                        "subfolder": "",
                        "type": "temp",
                        "width": width,
                        "height": height,
                        "mode": "continue",
                    }]
                },
                "result": (output,),
            }

        if image is None:
            raise RuntimeError("DS Image Checkpoint: no IMAGE is connected to the input.")

        path, width, height = _write_snapshot(image, node_id, prompt=prompt, extra_pnginfo=extra_pnginfo)
        _log(f"{mode.upper()} node={node_id} captured {width}x{height} with embedded metadata")
        return {
            "ui": {"ds_image_checkpoint": [{"filename": os.path.basename(path), "subfolder": "", "type": "temp", "width": width, "height": height, "mode": mode}]},
            "result": (image,),
        }


NODE_CLASS_MAPPINGS = {"DS_ImageCheckpoint": DS_ImageCheckpoint}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ImageCheckpoint": "DS Image Checkpoint"}
