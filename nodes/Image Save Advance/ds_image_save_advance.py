"""Deathshot Arsenal - DS Image Save Advance backend."""

import json
import os
import re
import subprocess
import threading
from datetime import datetime

import numpy as np
from PIL import Image, PngImagePlugin

import folder_paths
import server
from aiohttp import web

STATE_FILE = os.path.join(os.path.dirname(__file__), ".image_save_advance_state.json")
STATE_LOCK = threading.Lock()
LAST_STATE = {}

DEFAULT_CONFIG = {
    "save_dir": "",
    "template": "{input_name}_{date}_{time}_{counter}",
    "date_style": "dd-MM-yyyy",
    "counter_digits": 3,
    "quality": 100,
    "webp_lossless": False,
    "embed_workflow": True,
    "civitai": False,
    "keep_input_folders": False,
    "hide_toolbar": False,
    "format": "png",
    "counter": 1,
    "input_name": "image",
}


def _load_state():
    global LAST_STATE
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            LAST_STATE = data
    except Exception:
        LAST_STATE = {}


_load_state()


def _save_state():
    try:
        tmp = STATE_FILE + ".tmp"
        with STATE_LOCK:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(LAST_STATE, f, indent=2)
            os.replace(tmp, STATE_FILE)
    except Exception as e:
        print(f"[DS Image Save Advance] state persist failed: {e}", flush=True)


def _clean_path(value):
    value = str(value or "").strip().strip('"').strip("'")
    return os.path.normpath(os.path.expanduser(value)) if value else ""


def _resolve_save_dir(value):
    value = _clean_path(value)
    output = os.path.abspath(folder_paths.get_output_directory())
    if not value or value.lower() in {"output", ".", "default"}:
        return output
    if os.path.isabs(value) or (len(value) >= 2 and value[1] == ":"):
        return os.path.abspath(value)
    return os.path.abspath(os.path.join(output, value))


def _safe_component(value, fallback="untitled"):
    value = str(value or "").strip()
    value = re.sub(r'[<>:"|?*\\/]+', "_", value)
    value = value.replace("\x00", "_")
    value = re.sub(r"\.{2,}", ".", value)
    value = value.strip(" .")
    return value or fallback


def _safe_relative(value):
    value = str(value or "").replace("\\", "/")
    parts = []
    for part in value.split("/"):
        part = _safe_component(part, "")
        if part and part not in {".", ".."}:
            parts.append(part)
    return os.path.join(*parts) if parts else ""


def _date_format(style):
    return {
        "yyyy-MM-dd": "%Y-%m-%d",
        "dd-MM-yyyy": "%d-%m-%Y",
        "MM-dd-yyyy": "%m-%d-%Y",
    }.get(style, "%d-%m-%Y")


def _unwrap_text(value):
    if isinstance(value, (list, tuple)):
        return "".join(str(x) for x in value)
    return str(value or "")


def _unwrap_config(config_json, save_dir="", suffix="", prefix=""):
    cfg = dict(DEFAULT_CONFIG)
    raw = _unwrap_text(config_json).strip()
    try:
        if raw:
            loaded = json.loads(raw)
            if isinstance(loaded, dict):
                cfg.update(loaded)
    except Exception as e:
        print(f"[DS Image Save Advance] config parse fallback: {e}", flush=True)

    if not cfg.get("save_dir"):
        cfg["save_dir"] = save_dir or ""
    legacy = (suffix or prefix or "").strip()
    if legacy and (not cfg.get("template") or cfg.get("template") == DEFAULT_CONFIG["template"]):
        cfg["template"] = DEFAULT_CONFIG["template"] + "_" + legacy.lstrip("-_")

    if cfg.get("date_style") not in {"yyyy-MM-dd", "dd-MM-yyyy", "MM-dd-yyyy"}:
        cfg["date_style"] = "dd-MM-yyyy"
    try:
        cfg["counter_digits"] = max(1, min(8, int(cfg.get("counter_digits", 3))))
    except Exception:
        cfg["counter_digits"] = 3
    try:
        cfg["quality"] = max(1, min(100, int(cfg.get("quality", 100))))
    except Exception:
        cfg["quality"] = 100
    cfg["format"] = str(cfg.get("format", "png")).lower()
    if cfg["format"] not in {"png", "jpg", "webp"}:
        cfg["format"] = "png"
    for key in ("webp_lossless", "embed_workflow", "civitai", "keep_input_folders", "hide_toolbar"):
        cfg[key] = bool(cfg.get(key, DEFAULT_CONFIG[key]))
    try:
        cfg["counter"] = max(1, int(cfg.get("counter", 1)))
    except Exception:
        cfg["counter"] = 1
    return cfg


def _link_id(value):
    if isinstance(value, (list, tuple)) and value:
        try:
            return str(int(value[0]))
        except Exception:
            return str(value[0])
    return None


def _is_link(value):
    return isinstance(value, (list, tuple)) and len(value) >= 1 and isinstance(value[0], (str, int))


def _find_start_node(prompt, node_id):
    if not isinstance(prompt, dict):
        return None
    sid = str(node_id) if node_id is not None else ""
    if sid in prompt:
        return sid
    matches = [str(k) for k, v in prompt.items() if isinstance(v, dict) and str(v.get("class_type", "")) == "DS_ImageSaveAdvance"]
    return matches[0] if len(matches) == 1 else None


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
    # Same-named upstream widget is the most faithful primitive/value-node case.
    same = src_inputs.get(input_name)
    if same is not None and not _is_link(same):
        return same
    for key in ("value", "Value", "int", "float", "number", "seed", "noise_seed", "text"):
        candidate = src_inputs.get(key)
        if candidate is not None and not _is_link(candidate):
            return candidate
    return _resolve_input_value(prompt, src, input_name, depth + 1)


def _model_from_loader(info):
    inputs = info.get("inputs") if isinstance(info, dict) else None
    if not isinstance(inputs, dict):
        return None, None
    keys = ("ckpt_name", "unet_name", "model_name", "model_path", "checkpoint", "checkpoint_name")
    for key in keys:
        value = inputs.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip(), key
    return None, None


def _find_checkpoint(prompt, sampler_id, all_nodes):
    # Follow ONLY model-carrying inputs from the sampler, matching Pixaroma's
    # approach. This avoids accidentally selecting a checkpoint that exists only
    # on a separate CLIP/VAE branch.
    if sampler_id and isinstance(prompt, dict):
        queue = [str(sampler_id)]
        seen = set()
        while queue and len(seen) < 500:
            nid = queue.pop(0)
            if nid in seen or nid not in prompt:
                continue
            seen.add(nid)
            info = prompt.get(nid) or {}
            ct = str(info.get("class_type", "")).lower()
            model, key = _model_from_loader(info)
            if model and ("checkpoint" in ct or "unet" in ct or "diffusion" in ct or key in ("ckpt_name", "unet_name", "model_name", "model_path")):
                return model, key
            inputs = info.get("inputs") or {}
            if isinstance(inputs, dict):
                for name, value in inputs.items():
                    if name in ("model", "unet", "base_model", "guider", "diffusion_model"):
                        src = _link_id(value)
                        if src and src not in seen:
                            queue.append(src)
    # Safe fallback: search the reachable graph for a recognizable model loader.
    for nid, info, _depth in all_nodes:
        model, key = _model_from_loader(info)
        if not model:
            continue
        ct = str(info.get("class_type", "")).lower()
        if "checkpoint" in ct or "unet" in ct or "diffusion" in ct or key in ("ckpt_name", "unet_name", "model_name", "model_path"):
            return model, key
    return "", ""


def _sampler_info(prompt, start_id, all_nodes):
    # Nearest upstream sampler is the one that actually produced the saved image.
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


def _prompt_text(prompt, sampler_id):
    positive = negative = ""
    if not isinstance(prompt, dict):
        return positive, negative
    sampler = prompt.get(str(sampler_id)) if sampler_id else None
    inputs = sampler.get("inputs", {}) if isinstance(sampler, dict) else {}
    pos_id = _link_id(inputs.get("positive")) if isinstance(inputs, dict) else None
    neg_id = _link_id(inputs.get("negative")) if isinstance(inputs, dict) else None

    def read_text(nid, avoid=()):
        seen = set()
        queue = [nid] if nid else []
        while queue and len(seen) < 30:
            cur = queue.pop(0)
            if cur in seen or cur not in prompt:
                continue
            seen.add(cur)
            info = prompt.get(cur) or {}
            inp = info.get("inputs") or {}
            if isinstance(inp, dict):
                val = inp.get("text")
                if isinstance(val, str) and val.strip():
                    return val
                for k in ("prompt", "string", "value"):
                    val = inp.get(k)
                    if isinstance(val, str) and val.strip():
                        return val
                for v in inp.values():
                    src = _link_id(v)
                    if src and src not in seen:
                        ct = str((prompt.get(src) or {}).get("class_type", "")).lower()
                        if not any(a in ct for a in avoid):
                            queue.append(src)
        return ""
    positive = read_text(pos_id, ("negative",))
    negative = read_text(neg_id, ("positive",))
    if not positive and not negative:
        # Fallback for custom sampler layouts: inspect text encoders but do not
        # invent a negative prompt.
        texts = []
        for _nid, info, _depth in all_nodes:
            inp = info.get("inputs") or {}
            ct = str(info.get("class_type", "")).lower()
            val = inp.get("text") if isinstance(inp, dict) else None
            if isinstance(val, str) and val.strip() and "textencode" in ct:
                texts.append(("negative" in ct, val))
        for is_neg, val in texts:
            if is_neg and not negative:
                negative = val
            elif not positive:
                positive = val
    return positive, negative


def _workflow_fallback(extra_pnginfo):
    """Extract basic loader/sampler values from the embedded workflow JSON.

    Normally the API PROMPT is authoritative. This fallback exists because some
    ComfyUI execution paths/extensions can omit the save node from the hidden
    prompt payload while still providing EXTRA_PNGINFO.workflow. It lets the
    saver remain useful with ordinary stock loaders instead of requiring DS
    forwarding nodes.
    """
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
        # Stock CheckpointLoaderSimple / CheckpointLoader / UNETLoader and
        # common model-loader extensions put their model filename in the first
        # widget. Prefer nodes whose type explicitly identifies the loader.
        if not out["model"] and any(x in low for x in ("checkpointloader", "unetloader", "diffusionmodelload")):
            for v in vals:
                if isinstance(v, str) and v.strip():
                    if any(ext in v.lower() for ext in (".safetensors", ".ckpt", ".pt", ".pth", ".bin")):
                        out["model"] = os.path.splitext(os.path.basename(v.replace("\\", "/")))[0]
                        out["model_key"] = "ckpt_name"
                        break
        if "ksampler" in low and not out["seed"]:
            # KSampler widget order in ComfyUI: seed, steps, cfg, sampler_name,
            # scheduler, denoise, ...
            if len(vals) > 0 and isinstance(vals[0], (int, float, str)):
                out["seed"] = str(vals[0])
            if len(vals) > 1: out["steps"] = str(vals[1])
            if len(vals) > 2: out["cfg"] = str(vals[2])
            if len(vals) > 3: out["sampler_name"] = str(vals[3])
            if len(vals) > 4: out["scheduler"] = str(vals[4])
        if not out["positive_prompt"] and "cliptextencode" in low and isinstance(vals[0] if vals else None, str):
            text = vals[0].strip()
            if text:
                if "negative" in low:
                    out["negative_prompt"] = text
                else:
                    out["positive_prompt"] = text
    return out


def _graph_context(prompt, node_id, extra_pnginfo=None):
    result = {"input_name": "image", "input_folder": "", "seed": "", "model": "", "model_key": "", "steps": "", "cfg": "", "sampler_name": "", "scheduler": "", "denoise": "", "positive_prompt": "", "negative_prompt": ""}
    start = _find_start_node(prompt, node_id)
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
        positive, negative = _prompt_text(prompt, sampler_id)
        result["positive_prompt"] = positive
        result["negative_prompt"] = negative
    # If the normal API prompt did not expose the save node/needed loader values,
    # fall back to workflow metadata. Only missing values are filled.
    wf = _workflow_fallback(extra_pnginfo)
    for key in ("seed", "model", "model_key", "steps", "cfg", "sampler_name", "scheduler", "denoise", "positive_prompt", "negative_prompt"):
        if not result.get(key) and wf.get(key):
            result[key] = wf[key]
    return result

def _civitai_info(prompt, context, width, height):
    positive = negative = steps = cfg_scale = sampler = scheduler = ""
    if isinstance(prompt, dict):
        for info in prompt.values():
            if not isinstance(info, dict):
                continue
            ctype = str(info.get("class_type", "")).lower()
            inputs = info.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            text = inputs.get("text")
            if isinstance(text, str) and text.strip():
                if "negative" in ctype and not negative:
                    negative = text
                elif not positive:
                    positive = text
            if not steps and "steps" in inputs:
                steps = str(inputs["steps"])
            if not cfg_scale and "cfg" in inputs:
                cfg_scale = str(inputs["cfg"])
            if not sampler and "sampler_name" in inputs:
                sampler = str(inputs["sampler_name"])
            if not scheduler and "scheduler" in inputs:
                scheduler = str(inputs["scheduler"])
    return json.dumps({
        "prompt": positive,
        "negativePrompt": negative,
        "seed": context.get("seed", ""),
        "model": context.get("model", ""),
        "steps": steps,
        "cfgScale": cfg_scale,
        "sampler": sampler,
        "scheduler": scheduler,
        "width": width,
        "height": height,
    }, ensure_ascii=False, separators=(",", ":"))


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
    pairs.append(f"Size: {width}x{height}")
    text = positive
    if negative:
        text += ("\n" if text else "") + "Negative prompt: " + negative
    if pairs:
        text += ("\n" if text else "") + ", ".join(pairs)
    return text or None


def _metadata(prompt, extra_pnginfo, context, width, height, cfg):
    data = {"width": width, "height": height, "seed": context.get("seed", ""), "model": context.get("model", "")}
    if cfg.get("embed_workflow"):
        data["prompt"] = prompt
        data["extra_pnginfo"] = extra_pnginfo or {}
    if cfg.get("civitai"):
        data["civitai"] = _civitai_info(prompt, context, width, height)
    return data


def _add_png_text(pnginfo, key, value):
    try:
        if isinstance(value, str):
            pnginfo.add_text(str(key), value)
        else:
            pnginfo.add_text(str(key), json.dumps(value, ensure_ascii=False))
    except Exception:
        pass


def _save_image(pil, path, fmt, quality, webp_lossless, metadata):
    fmt = fmt.lower()
    prompt = metadata.get("prompt")
    extra = metadata.get("extra_pnginfo") or {}
    parameters = metadata.get("parameters")
    if fmt == "jpg":
        out = pil.convert("RGB")
        exif = Image.Exif()
        try:
            if prompt is not None:
                exif[0x010F] = "Prompt:" + json.dumps(prompt, ensure_ascii=False)
            wf = extra.get("workflow") if isinstance(extra, dict) else None
            if wf is not None:
                exif[0x010E] = "Workflow:" + json.dumps(wf, ensure_ascii=False)
            if parameters:
                exif.get_ifd(0x8769)[0x9286] = b"UNICODE\x00" + str(parameters).encode("utf-16-be")
            out.save(path, "JPEG", quality=quality, subsampling=0, exif=exif)
        except Exception:
            out.save(path, "JPEG", quality=quality, subsampling=0)
    elif fmt == "webp":
        exif = Image.Exif()
        try:
            if prompt is not None:
                exif[0x010F] = "Prompt:" + json.dumps(prompt, ensure_ascii=False)
            wf = extra.get("workflow") if isinstance(extra, dict) else None
            if wf is not None:
                exif[0x010E] = "Workflow:" + json.dumps(wf, ensure_ascii=False)
            if parameters:
                exif.get_ifd(0x8769)[0x9286] = b"UNICODE\x00" + str(parameters).encode("utf-16-be")
            pil.save(path, "WEBP", quality=quality, lossless=bool(webp_lossless), exif=exif.tobytes())
        except Exception:
            pil.save(path, "WEBP", quality=quality, lossless=bool(webp_lossless))
    else:
        pnginfo = PngImagePlugin.PngInfo()
        # Match ComfyUI/Pixaroma convention: the workflow and prompt are stored
        # as their own metadata chunks, not buried inside a custom JSON blob.
        if prompt is not None:
            _add_png_text(pnginfo, "prompt", prompt)
        if isinstance(extra, dict):
            for key, value in extra.items():
                _add_png_text(pnginfo, key, value)
        if parameters:
            _add_png_text(pnginfo, "parameters", parameters)
        _add_png_text(pnginfo, "DS_ImageSaveAdvance", {
            "seed": metadata.get("seed", ""), "model": metadata.get("model", ""),
            "width": metadata.get("width", 0), "height": metadata.get("height", 0),
        })
        pil.save(path, "PNG", compress_level=1, pnginfo=pnginfo)

def _unique_path(directory, stem, ext):
    stem = _safe_component(stem, "image")
    candidate = os.path.join(directory, stem + ext)
    if not os.path.exists(candidate):
        return candidate
    n = 1
    while True:
        candidate = os.path.join(directory, f"{stem}_{n:03d}{ext}")
        if not os.path.exists(candidate):
            return candidate
        n += 1


def _tokenize(template, now, counter, batch_index, context, width, height, cfg):
    date = now.strftime(_date_format(cfg["date_style"]))
    values = {
        "input_name": _safe_component(context.get("input_name", "image"), "image"),
        "date": date,
        "time": now.strftime("%H-%M-%S"),
        "counter": str(counter).zfill(cfg["counter_digits"]),
        "seed": _safe_component(context.get("seed", ""), "0"),
        "width": str(width),
        "height": str(height),
        "batch": str(batch_index + 1),
        "model": _safe_component(os.path.splitext(context.get("model", ""))[0], "model"),
        "date_folder": date,
        "input_folder": _safe_relative(context.get("input_folder", "")),
    }
    result = str(template or DEFAULT_CONFIG["template"])
    for key, value in values.items():
        result = result.replace("{" + key + "}", value)
    result = re.sub(r"\{[^{}]+\}", "", result)
    return result.strip(" /\\.") or "image"


def _format_ext(fmt):
    return {"png": ".png", "jpg": ".jpg", "webp": ".webp"}.get(fmt, ".png")


@server.PromptServer.instance.routes.post("/ds/image_save_advance/list_dir")
async def image_save_advance_list_dir(request):
    try:
        data = await request.json()
        path = _resolve_save_dir(data.get("path", ""))
        if not os.path.isdir(path):
            path = os.path.abspath(folder_paths.get_output_directory())
        dirs = []
        try:
            dirs = [x for x in sorted(os.listdir(path)) if os.path.isdir(os.path.join(path, x))]
        except Exception:
            pass
        return web.json_response({"current": path, "dirs": dirs})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/ds/image_save_advance/open")
async def image_save_advance_open(request):
    try:
        data = await request.json()
        path = _clean_path(data.get("path", ""))
        if not path or not os.path.isfile(path):
            return web.json_response({"success": False, "error": "File not found"}, status=404)
        if os.name == "nt":
            os.startfile(path)
        elif os.uname().sysname == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/ds/image_save_advance/folder")
async def image_save_advance_folder(request):
    try:
        data = await request.json()
        path = _clean_path(data.get("path", ""))
        if not path or not os.path.exists(path):
            return web.json_response({"success": False, "error": "Folder not found"}, status=404)
        folder = path if os.path.isdir(path) else os.path.dirname(path)
        if os.name == "nt":
            os.startfile(folder)
        elif os.uname().sysname == "Darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/ds/image_save_advance/state")
async def image_save_advance_state(request):
    return web.json_response({"nodes": LAST_STATE, "default_dir": os.path.abspath(folder_paths.get_output_directory())})


@server.PromptServer.instance.routes.get("/ds/image_save_advance/preview")
async def image_save_advance_preview(request):
    path = request.query.get("path", "")
    path = _clean_path(path)
    if not path or not os.path.isfile(path):
        return web.Response(status=404)
    try:
        return web.FileResponse(path)
    except Exception as e:
        print(f"[DS Image Save Advance] preview failed: {e}", flush=True)
        return web.Response(status=500)

@server.PromptServer.instance.routes.post("/ds/image_save_advance/convert")
async def image_save_advance_convert(request):
    try:
        data = await request.json()
        path = _clean_path(data.get("path", ""))
        fmt = str(data.get("format", "png")).lower()
        quality = max(1, min(100, int(data.get("quality", 100))))
        lossless = bool(data.get("webp_lossless", False))
        if fmt not in {"png", "jpg", "webp"}:
            return web.json_response({"success": False, "error": "Unsupported format"}, status=400)
        if not path or not os.path.isfile(path):
            return web.json_response({"success": False, "error": "File not found"}, status=404)
        with Image.open(path) as source:
            image = source.convert("RGBA") if source.mode in {"RGBA", "LA", "P"} else source.convert("RGB")
            stem = os.path.splitext(os.path.basename(path))[0]
            target = _unique_path(os.path.dirname(path), stem, _format_ext(fmt))
            _save_image(image, target, fmt, quality, lossless, {"converted_from": path})
        print(f"[DS Image Save Advance] manual save {target}", flush=True)
        return web.json_response({"success": True, "path": target})
    except Exception as e:
        print(f"[DS Image Save Advance] manual conversion failed: {e}", flush=True)
        return web.json_response({"success": False, "error": str(e)}, status=500)


class DS_ImageSaveAdvance:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"image": ("IMAGE",)},
            "hidden": {
                "save_dir": ("STRING", {"default": ""}),
                "suffix": ("STRING", {"default": ""}),
                "prefix": ("STRING", {"default": ""}),
                "config_json": ("STRING", {"default": ""}),
                "prompt": ("PROMPT",),
                "extra_pnginfo": ("EXTRA_PNGINFO",),
                "unique_id": ("UNIQUE_ID",),
                "name": ("STRING", {"default": "image"}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "image_save_advance"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Saving is an explicit side effect. Always execute so a second queue
        # with the same image still produces a new file/counter value.
        return float("nan")

    def image_save_advance(self, image, save_dir="", suffix="", prefix="", config_json="", prompt=None, extra_pnginfo=None, unique_id=None, name="image"):
        if image is None or getattr(image, "shape", None) is None or image.shape[0] == 0:
            print("[DS Image Save Advance] no image received", flush=True)
            return {}

        cfg = _unwrap_config(config_json, save_dir, suffix, prefix)
        directory = _resolve_save_dir(cfg.get("save_dir", ""))
        os.makedirs(directory, exist_ok=True)
        node_id = str(unique_id or "0")
        context = _graph_context(prompt, node_id, extra_pnginfo)
        runtime = cfg.get("_runtime") if isinstance(cfg.get("_runtime"), dict) else {}
        if runtime.get("model"):
            context["model"] = str(runtime.get("model"))
        if runtime.get("seed"):
            context["seed"] = str(runtime.get("seed"))
        user_name = str(name or cfg.get("input_name") or "image").strip()
        if user_name:
            context["input_name"] = user_name
        else:
            context["input_name"] = "image"
        width = int(image.shape[2]) if len(image.shape) > 2 else 0
        height = int(image.shape[1]) if len(image.shape) > 1 else 0
        batch_size = int(image.shape[0])
        ext = _format_ext(cfg["format"])

        with STATE_LOCK:
            old = LAST_STATE.get(node_id, {}) if isinstance(LAST_STATE.get(node_id), dict) else {}
            counter = max(1, int(old.get("counter", cfg.get("counter", 1))))

        saved = []
        now = datetime.now()
        for batch_index in range(batch_size):
            arr = np.clip(image[batch_index].detach().cpu().numpy() * 255.0, 0, 255).astype(np.uint8)
            pil = Image.fromarray(arr)
            stem = _tokenize(cfg["template"], now, counter, batch_index, context, width, height, cfg)
            if cfg.get("keep_input_folders") and context.get("input_folder") and "{input_folder}" not in str(cfg["template"]):
                stem = os.path.join(_safe_relative(context["input_folder"]), stem)
            stem_dir = os.path.dirname(stem)
            leaf = os.path.basename(stem)
            target_dir = os.path.join(directory, _safe_relative(stem_dir)) if stem_dir else directory
            os.makedirs(target_dir, exist_ok=True)
            path = _unique_path(target_dir, leaf, ext)
            metadata = _metadata(prompt, extra_pnginfo, context, width, height, cfg)
            metadata["parameters"] = _a1111_parameters(context, width, height) if cfg.get("civitai") else None
            _save_image(pil, path, cfg["format"], cfg["quality"], cfg["webp_lossless"], metadata)
            saved.append(path)

        counter += 1
        LAST_STATE[node_id] = {
            "counter": counter,
            "last_path": saved[-1] if saved else "",
            "last_paths": saved,
            "format": cfg["format"],
            "save_dir": directory,
        }
        _save_state()
        print(
            f"[DS Image Save Advance] node={node_id} saved={len(saved)} format={cfg['format'].upper()} "
            f"dir={directory} template={cfg['template']!r} next_counter={counter}",
            flush=True,
        )
        return {"ui": {"last_path": [saved[-1] if saved else ""], "paths": [saved], "dir": [directory], "format": [cfg["format"]], "next_counter": [counter], "saved_count": [str(len(saved))]}}
