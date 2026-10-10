"""DeathshotArsenal Prompt Scanner."""
from __future__ import annotations
import json, os, re, logging
from pathlib import Path
from typing import Any
from PIL import Image
try:
    import folder_paths
    INPUT_ROOT = Path(folder_paths.get_input_directory()).resolve()
except Exception:
    folder_paths = None
    INPUT_ROOT = Path(".").resolve()

try:
    import server
except Exception:
    server = None

try:
    from aiohttp import web
except Exception:
    web = None

SUPPORTED_EXTENSIONS = {".png", ".webp", ".jpg", ".jpeg"}
LOGGER = logging.getLogger("DeathshotArsenal.PromptScanner")
if not LOGGER.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("[DeathshotArsenal][Prompt Scanner] %(levelname)s: %(message)s"))
    LOGGER.addHandler(h)
LOGGER.setLevel(logging.INFO)
LOGGER.propagate = False


def _log(event, **data):
    LOGGER.info("%s | %s", event, " ".join(f"{k}={v!r}" for k, v in data.items()))


def _safe_input_path(value: str) -> Path:
    value = str(value or "").replace("\\", "/").lstrip("/")
    p = (INPUT_ROOT / value).resolve()
    try:
        p.relative_to(INPUT_ROOT)
    except ValueError:
        raise ValueError("Path is outside the ComfyUI input directory")
    return p


def _json(value):
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return None
    return None


def _ref(value):
    if isinstance(value, (list, tuple)) and len(value) >= 1 and str(value[0]).strip().isdigit():
        return str(value[0])
    if isinstance(value, str):
        m = re.match(r"^\s*\\?\[\s*[\"']?(\d+)[\"']?\s*,", value)
        if m:
            return m.group(1)
    return None


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else ""


def _graph_prompt(graph: dict) -> str:
    nodes = {str(k): v for k, v in graph.items() if isinstance(v, dict)}

    def walk(nid, seen):
        nid = str(nid)
        if nid in seen:
            return ""
        seen.add(nid)
        node = nodes.get(nid, {})
        inp = node.get("inputs") or {}
        typ = str(node.get("class_type", "")).lower()

        # Check AI Prompt Sensei state
        if "sensei" in typ:
            try:
                state = json.loads(inp.get("SenseiState", "{}"))
                for k in ("generated_prompt", "positive_prompt", "prompt", "user_prompt"):
                    val = state.get(k)
                    if isinstance(val, str) and val.strip() and val.strip().lower() != "randomize":
                        return val.strip()
            except Exception:
                pass

        # Follow input links first
        for key in ("text", "prompt", "string", "value", "positive", "conditioning", "pipe"):
            if key in inp:
                r = _ref(inp[key])
                if r and r in nodes:
                    found = walk(r, seen)
                    if found:
                        return found

        # Direct text widget values (skip dummy placeholders)
        for key in ("text", "prompt", "string", "value"):
            val = inp.get(key)
            if isinstance(val, str) and val.strip() and val.strip().lower() not in ("randomize", "none", "undefined"):
                return val.strip()

        for val in inp.values():
            r = _ref(val)
            if r and r in nodes:
                found = walk(r, seen)
                if found:
                    return found
        return ""

    # 1. Walk from sampler positive conditioning
    sampler_ids = []
    for nid, node in nodes.items():
        typ = str(node.get("class_type", "")).lower()
        if "ksampler" in typ or "samplercustom" in typ or typ.endswith("sampler"):
            sampler_ids.append(nid)

    for nid in sampler_ids:
        r = _ref((nodes[nid].get("inputs") or {}).get("positive"))
        if r and r in nodes:
            found = walk(r, set())
            if found:
                return found

    # 2. Prefer positive text encoders
    for nid, node in nodes.items():
        meta = node.get("_meta") or {}
        title = str(meta.get("title", "")).lower()
        typ = str(node.get("class_type", "")).lower()
        if ("cliptextencode" in typ or "textencode" in typ or "sensei" in typ) and "negative" not in title:
            found = walk(nid, set())
            if found:
                return found

    for nid in nodes:
        found = walk(nid, set())
        if found:
            return found
    return ""


def _a1111(value):
    t = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not t:
        return ""
    t = re.split(r"\n\s*Negative prompt\s*:\s*", t, maxsplit=1, flags=re.I)[0].strip()
    t = re.split(r"\n\s*Steps\s*:\s*", t, maxsplit=1, flags=re.I)[0].strip()
    return t


def extract_prompt(path: Path):
    _log("extract_start", path=str(path))
    with Image.open(path) as im:
        meta = dict(im.info or {})
    for k, v in list(meta.items()):
        if isinstance(v, bytes):
            meta[k] = v.decode("utf-8", errors="ignore")

    # 1. Check ComfyUI API prompt execution graph
    raw = meta.get("prompt")
    graph = _json(raw)
    if isinstance(graph, dict):
        found = _graph_prompt(graph)
        if found and found.lower() != "randomize":
            _log("prompt_found", source="comfy_prompt_graph", length=len(found))
            return found, meta

    # 2. Check parameters chunk (A1111/Civitai/SaveAdvance)
    for key in ("parameters", "Parameters", "Description", "description"):
        if isinstance(meta.get(key), str):
            found = _a1111(meta[key])
            if found and found.lower() != "randomize":
                _log("prompt_found", source=key, length=len(found))
                return found, meta

    # 3. Check workflow metadata
    for key in ("workflow", "Workflow"):
        wf = _json(meta.get(key))
        if isinstance(wf, dict) and isinstance(wf.get("nodes"), list):
            candidates = []
            for node in wf["nodes"]:
                if not isinstance(node, dict):
                    continue
                typ = str(node.get("type", "")).lower()
                title = str((node.get("properties") or {}).get("title", "")).lower()
                if "negative" in title or "negative" in typ:
                    continue
                # Sensei node in workflow
                if "sensei" in typ:
                    widgets = node.get("widgets_values") or []
                    for w in widgets:
                        if isinstance(w, str) and len(w.strip()) > 15:
                            try:
                                state = json.loads(w)
                                for sk in ("generated_prompt", "positive_prompt", "prompt"):
                                    if state.get(sk) and len(state[sk]) > 10:
                                        candidates.append(state[sk])
                            except Exception:
                                pass
                if "cliptextencode" in typ or "prompt" in typ:
                    vals = node.get("widgets_values") or []
                    for v in vals:
                        if isinstance(v, str) and len(v.strip()) > 3 and v.strip().lower() != "randomize":
                            candidates.append(v.strip())
            if candidates:
                found = max(candidates, key=len)
                _log("prompt_found", source=key, length=len(found))
                return found, meta

    _log("prompt_not_found", metadata_keys=list(meta.keys()))
    return "", meta


async def prompt_scanner_image(request):
    try:
        p = _safe_input_path(request.query.get("path", ""))
        _log("image_request", path=str(p))
        if not p.is_file():
            return web.Response(status=404, text="Image not found")
        return web.FileResponse(p)
    except Exception as e:
        LOGGER.exception("image_error: %s", e)
        return web.Response(status=400, text=str(e))


def _list_images(directory):
    if not directory.is_dir():
        return []
    out = []
    for p in directory.iterdir():
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS:
            try:
                out.append(p.relative_to(INPUT_ROOT).as_posix())
            except ValueError:
                pass
    return sorted(out, key=str.casefold)


async def prompt_scanner_list(request):
    rel = request.query.get("path", "")
    _log("list_request", path=rel)
    try:
        selected = _safe_input_path(rel) if rel else INPUT_ROOT
        directory = selected.parent if selected.is_file() else selected
        if not directory.is_dir():
            directory = INPUT_ROOT
        files = _list_images(directory)
        sel = selected.relative_to(INPUT_ROOT).as_posix() if selected.is_file() and selected.exists() else ""
        _log("list_done", directory=str(directory), count=len(files), selected=sel)
        return web.json_response({"files": files, "selected": sel})
    except Exception as e:
        LOGGER.exception("list_error: %s", e)
        return web.json_response({"error": str(e), "files": []}, status=400)


async def prompt_scanner_scan(request):
    rel = request.query.get("path", "")
    _log("scan_request", path=rel)
    try:
        p = _safe_input_path(rel)
        if not p.is_file():
            return web.json_response({"error": "Image not found"}, status=404)
        if p.suffix.lower() not in SUPPORTED_EXTENSIONS:
            return web.json_response({"error": "Unsupported image format"}, status=400)
        prompt, meta = extract_prompt(p)
        return web.json_response({
            "prompt": prompt,
            "filename": p.name,
            "path": p.relative_to(INPUT_ROOT).as_posix(),
            "has_metadata": bool(meta),
        })
    except Exception as e:
        LOGGER.exception("scan_error: %s", e)
        return web.json_response({"error": str(e)}, status=400)


try:
    server.PromptServer.instance.routes.get("/ds/prompt_scanner/image")(prompt_scanner_image)
    server.PromptServer.instance.routes.get("/ds/prompt_scanner/list")(prompt_scanner_list)
    server.PromptServer.instance.routes.get("/ds/prompt_scanner/scan")(prompt_scanner_scan)
except Exception as exc:
    LOGGER.warning(f"Route registration deferred: {exc}")


class DS_PromptScanner:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("STRING", {"default": "", "multiline": False})}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "scan"
    CATEGORY = "☠️ Deathshot Arsenal/✍️ Prompt"

    def scan(self, image):
        try:
            if not image:
                return ("",)
            return (extract_prompt(_safe_input_path(image))[0],)
        except Exception as e:
            _log("node_scan_error", error=str(e))
            return ("",)


NODE_CLASS_MAPPINGS = {"DS_PromptScanner": DS_PromptScanner}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_PromptScanner": "DS Prompt Scanner"}
