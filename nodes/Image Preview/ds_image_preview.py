"""DS Image Preview - IMAGE passthrough with optional automatic lossless PNG saving."""
import json
import os
import re
import time
import uuid

import numpy as np
import torch
from PIL import Image, PngImagePlugin
from aiohttp import web

import folder_paths
import server

LOG = "[DS Image Preview]"
TEMP_PREFIX = "ds_image_preview_"


def _log(message):
    print(f"{LOG} {message}", flush=True)


def _safe_id(value):
    text = "".join(c for c in str(value) if c.isalnum() or c in "_-.")
    return text or "node"


def _temp_dir():
    path = folder_paths.get_temp_directory()
    os.makedirs(path, exist_ok=True)
    return path


def _output_dir():
    path = folder_paths.get_output_directory()
    os.makedirs(path, exist_ok=True)
    return path


def _tensor_to_pil(tensor):
    arr = tensor.detach().cpu().numpy()
    if arr.ndim == 3 and arr.shape[-1] > 3:
        arr = arr[..., :3]
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def _unique_output_path(node_id, batch_index):
    stamp = time.strftime("%Y%m%d_%H%M%S")
    millis = int(time.time() * 1000) % 1000
    unique = uuid.uuid4().hex[:10]
    name = f"DS_ImagePreview_{stamp}_{millis:03d}_{_safe_id(node_id)}_{batch_index + 1:03d}_{unique}.png"
    return os.path.join(_output_dir(), name)


def _link_id(value):
    if isinstance(value, (list, tuple)) and value:
        try:
            return str(int(value[0]))
        except Exception:
            return str(value[0])
    return None


def _is_link(value):
    return isinstance(value, (list, tuple)) and len(value) >= 1 and isinstance(value[0], (str, int))


def _find_start_node(prompt, node_id, class_name="DS_ImagePreview"):
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
    start = _find_start_node(prompt, node_id, "DS_ImagePreview")
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
    _add_png_text(pnginfo, "DS_ImagePreview", {
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


def _write_preview(image, node_id, pnginfo=None):
    """Write the first image losslessly to temp for browser preview with embedded metadata."""
    pil = _tensor_to_pil(image[0])
    name = f"{TEMP_PREFIX}{_safe_id(node_id)}_{uuid.uuid4().hex}.png"
    path = os.path.join(_temp_dir(), name)
    pil.save(path, format="PNG", compress_level=4, pnginfo=pnginfo)
    return path, pil.width, pil.height


def _save_batch(image, node_id, pnginfo=None):
    """Save every image in the batch as its own lossless PNG with embedded metadata."""
    saved = []
    for index, frame in enumerate(image):
        pil = _tensor_to_pil(frame)
        path = _unique_output_path(node_id, index)
        tmp = f"{path}.{uuid.uuid4().hex}.tmp"
        pil.save(tmp, format="PNG", compress_level=4, pnginfo=pnginfo)
        os.replace(tmp, path)
        saved.append(path)
    return saved


async def _preview(request):
    name = os.path.basename(request.query.get("file", ""))
    if not name or not name.startswith(TEMP_PREFIX):
        return web.Response(status=400)
    path = os.path.join(_temp_dir(), name)
    if not os.path.isfile(path):
        return web.Response(status=404)
    return web.FileResponse(path, headers={"Cache-Control": "no-store"})


async def _manual_save(request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    name = os.path.basename(str(data.get("file", "")))
    if not name or not name.startswith(TEMP_PREFIX):
        return web.json_response({"ok": False, "error": "invalid preview file", "filename": name}, status=400)
    source = os.path.join(_temp_dir(), name)
    if not os.path.isfile(source):
        return web.json_response({"ok": False, "error": "preview expired", "filename": name}, status=404)

    node_id = _safe_id(data.get("node_id", "node"))
    stamp = time.strftime("%Y%m%d_%H%M%S")
    millis = int(time.time() * 1000) % 1000
    out_name = f"DS_ImagePreview_{stamp}_{millis:03d}_{node_id}_manual_{uuid.uuid4().hex[:10]}.png"
    try:
        out_dir = _output_dir()
        os.makedirs(out_dir, exist_ok=True)
        out = os.path.join(out_dir, out_name)
        with open(source, "rb") as src, open(out, "wb") as dst:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                dst.write(chunk)
        _log(f"manual save node={node_id} path={out}")
        return web.json_response({"ok": True, "filename": os.path.basename(out), "path": out})
    except Exception as exc:
        _log(f"save error: {exc}")
        return web.json_response({"ok": False, "error": str(exc), "filename": out_name}, status=500)


try:
    server.PromptServer.instance.routes.get("/ds/image_preview/preview")(_preview)
    server.PromptServer.instance.routes.post("/ds/image_preview/save")(_manual_save)
except Exception as exc:
    _log(f"route registration warning: {exc}")


class DS_ImagePreview:
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "preview"
    OUTPUT_NODE = True
    DESCRIPTION = "IMAGE passthrough with preview and optional lossless PNG output saving."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "SaveMode": ("STRING", {"default": "preview"}),
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    def preview(self, image, SaveMode="preview", unique_id=None, prompt=None, extra_pnginfo=None):
        node_id = str(unique_id or "node")
        mode = "save" if str(SaveMode).lower() == "save" else "preview"
        _log(f"execute node={node_id} mode={mode} batch={int(image.shape[0])}")

        width = int(image.shape[2]) if len(image.shape) > 2 else 0
        height = int(image.shape[1]) if len(image.shape) > 1 else 0
        context = _graph_context(prompt, node_id, extra_pnginfo)
        pnginfo = _build_pnginfo(prompt, extra_pnginfo, context, width, height)

        preview_path, p_width, p_height = _write_preview(image, node_id, pnginfo=pnginfo)
        preview_name = os.path.basename(preview_path)
        saved = []
        if mode == "save":
            saved = _save_batch(image, node_id, pnginfo=pnginfo)
            _log(f"SAVE mode node={node_id}: saved {len(saved)} PNG(s) with metadata, preview={p_width}x{p_height}")
        else:
            _log(f"PREVIEW mode node={node_id}: captured {p_width}x{p_height} with metadata; no output file saved")

        return {
            "ui": {
                "ds_image_preview": [{
                    "file": preview_name,
                    "width": p_width,
                    "height": p_height,
                    "count": int(image.shape[0]),
                    "mode": mode,
                    "saved": [os.path.basename(p) for p in saved],
                    "saved_paths": saved,
                }]
            },
            "result": (image,),
        }


NODE_CLASS_MAPPINGS = {"DS_ImagePreview": DS_ImagePreview}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ImagePreview": "DS Image Preview"}
