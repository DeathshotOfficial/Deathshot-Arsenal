"""
DS QuickSave - Fast PNG saver with inline UI + quick delete last
DeathshotArsenal

Features:
- IMAGE input
- Custom path + nice folder browser button (server side dir list modal)
- Filename suffix (appended after timestamp)
- Always saves as high-quality PNG (low compression for speed + quality)
- Image preview of last saved
- "Delete Last Saved" button (for removing AI artifacts immediately)
"""

import os
import json
import base64
import io
from datetime import datetime

import numpy as np
from PIL import Image

import folder_paths
import server
from aiohttp import web

# ------------------------------------------------------------------
# GLOBAL STATE (shared, simple "last saved" for quick delete use-case)
# ------------------------------------------------------------------
LAST_SAVED_PATH = None
LAST_IMAGE_INFO = None   # { "filename": , "subfolder": , "type": "output" }
LAST_PREVIEW_B64 = None  # fallback base64 if needed

_STATE_FILE = os.path.join(os.path.dirname(__file__), ".quicksave_state.json")


def _persist_state():
    try:
        with open(_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "path": LAST_SAVED_PATH,
                    "preview": LAST_PREVIEW_B64,
                    "last_image": LAST_IMAGE_INFO,
                },
                f,
            )
    except Exception:
        pass


def _load_persisted_state():
    global LAST_SAVED_PATH, LAST_PREVIEW_B64, LAST_IMAGE_INFO
    try:
        if not os.path.isfile(_STATE_FILE):
            return
        with open(_STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        LAST_SAVED_PATH = data.get("path") or None
        LAST_PREVIEW_B64 = data.get("preview") or None
        LAST_IMAGE_INFO = data.get("last_image") or None
    except Exception:
        pass


_load_persisted_state()


# ------------------------------------------------------------------
# SERVER ROUTES
# ------------------------------------------------------------------
@server.PromptServer.instance.routes.post("/ds/quicksave/list_dir")
async def quicksave_list_dir(request):
    try:
        data = await request.json()
        path = data.get("path", "").strip()

        if not path:
            path = folder_paths.get_output_directory()

        path = os.path.abspath(path)

        # Safety: fall back if not exist
        if not os.path.isdir(path):
            path = folder_paths.get_output_directory()

        subdirs = []
        try:
            for entry in sorted(os.listdir(path)):
                full = os.path.join(path, entry)
                if os.path.isdir(full):
                    subdirs.append(entry)
        except Exception:
            pass

        return web.json_response({
            "current": path,
            "dirs": subdirs
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/ds/quicksave/last")
async def quicksave_get_last(request):
    return web.json_response({
        "path": LAST_SAVED_PATH,
        "preview": LAST_PREVIEW_B64,
        "last_image": LAST_IMAGE_INFO,
    })


@server.PromptServer.instance.routes.get("/ds/quicksave/preview")
async def quicksave_get_preview(request):
    """Serve last-saved image bytes (works for any save path)."""
    global LAST_SAVED_PATH, LAST_PREVIEW_B64

    path = (request.query.get("path") or "").strip() or LAST_SAVED_PATH
    if not path or not os.path.exists(path):
        if LAST_PREVIEW_B64 and LAST_PREVIEW_B64.startswith("data:image"):
            try:
                b64 = LAST_PREVIEW_B64.split(",", 1)[1]
                return web.Response(
                    body=base64.b64decode(b64),
                    content_type="image/png",
                )
            except Exception:
                pass
        return web.Response(status=404, text="No preview")
    try:
        with open(path, "rb") as f:
            data = f.read()
        return web.Response(body=data, content_type="image/png")
    except Exception as e:
        return web.Response(status=500, text=str(e))


def _resolve_delete_path(requested_path: str = "") -> str:
    """Pick the file to delete: explicit path from client, else tracked last save."""
    path = _clean_path(requested_path)
    if path and os.path.isfile(path):
        return path
    if LAST_SAVED_PATH and os.path.isfile(LAST_SAVED_PATH):
        return LAST_SAVED_PATH
    _load_persisted_state()
    if LAST_SAVED_PATH and os.path.isfile(LAST_SAVED_PATH):
        return LAST_SAVED_PATH
    return ""


@server.PromptServer.instance.routes.post("/ds/quicksave/delete_last")
async def quicksave_delete_last(request):
    global LAST_SAVED_PATH, LAST_PREVIEW_B64, LAST_IMAGE_INFO

    requested = ""
    try:
        data = await request.json()
        requested = (data.get("path") or "").strip()
    except Exception:
        pass

    target = _resolve_delete_path(requested)
    if not target:
        return web.json_response({"success": False, "error": "No file to delete"})

    try:
        os.remove(target)
        if LAST_SAVED_PATH == target:
            LAST_SAVED_PATH = None
            LAST_PREVIEW_B64 = None
            LAST_IMAGE_INFO = None
            _persist_state()
        return web.json_response({"success": True, "deleted": target})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------
def _suffix_fragment(suffix: str) -> str:
    """Return '_suffix' or '-suffix' fragment; empty if no suffix."""
    suffix = (suffix or "").strip()
    if not suffix:
        return ""
    if suffix[0] in "-_":
        return suffix
    return f"_{suffix}"


def _resolve_suffix(suffix="", prefix="") -> str:
    """suffix wins; legacy workflows may still send prefix."""
    s = (suffix or "").strip()
    if s:
        return s
    p = (prefix or "").strip()
    if not p:
        return ""
    # Old prefix-style values like "quick_" become a suffix without trailing sep
    return p.rstrip("-_")


def _clean_path(path: str) -> str:
    path = (path or "").strip()
    if path.startswith('"') and path.endswith('"'):
        path = path[1:-1].strip()
    if path.startswith("'") and path.endswith("'"):
        path = path[1:-1].strip()
    return path


def _resolve_save_dir(save_dir: str) -> str:
    """Resolve user path: absolute paths are used as-is; relative paths live under Comfy output."""
    save_dir = _clean_path(save_dir)

    if not save_dir or save_dir.lower() in ("output", "default", "."):
        return folder_paths.get_output_directory()

    save_dir = os.path.expanduser(save_dir)
    save_dir = os.path.normpath(save_dir)

    # Windows drive-letter paths and UNC paths
    if os.path.isabs(save_dir):
        return save_dir

    # Forward-slash absolute paths on Windows (e.g. D:/Photos)
    if len(save_dir) >= 2 and save_dir[1] == ":":
        return os.path.abspath(save_dir)

    return os.path.abspath(os.path.join(folder_paths.get_output_directory(), save_dir))


# ------------------------------------------------------------------
# NODE
# ------------------------------------------------------------------
class DS_QuickSave:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "save_dir": ("STRING", {"default": "output"}),
                "suffix": ("STRING", {"default": ""}),
                "prefix": ("STRING", {"default": ""}),  # legacy workflows
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "quick_save"
    CATEGORY = "☠️ Deathshot Arsenal/💾 Utilities"
    OUTPUT_NODE = True

    def quick_save(self, image, save_dir="output", suffix="", prefix=""):
        global LAST_SAVED_PATH, LAST_PREVIEW_B64, LAST_IMAGE_INFO

        if image is None or getattr(image, "shape", None) is None or image.shape[0] == 0:
            return {}

        save_dir = _resolve_save_dir(save_dir)
        os.makedirs(save_dir, exist_ok=True)

        # Compute subfolder relative to Comfy's output dir so the standard /view endpoint can serve the preview
        output_dir = folder_paths.get_output_directory()
        subfolder = ""
        try:
            if save_dir.startswith(output_dir):
                rel = os.path.relpath(save_dir, output_dir)
                subfolder = rel.replace("\\", "/")
        except Exception:
            subfolder = ""

        saved_paths = []
        batch_size = image.shape[0]
        suffix = _resolve_suffix(suffix, prefix)
        suffix_part = _suffix_fragment(suffix)

        last_image_info = None
        for idx in range(batch_size):
            # Convert to PIL
            img_np = (255.0 * image[idx].cpu().numpy()).astype(np.uint8)
            pil = Image.fromarray(img_np)

            # Filename: {timestamp}{_|-suffix}.png  (suffix after name, not before)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            if batch_size > 1:
                filename = f"{ts}{suffix_part}_{idx:04d}.png"
            else:
                filename = f"{ts}{suffix_part}.png"

            full_path = os.path.join(save_dir, filename)

            # Always PNG, high quality (low compress)
            pil.save(full_path, "PNG", compress_level=1)

            saved_paths.append(full_path)
            LAST_SAVED_PATH = full_path

            last_image_info = {
                "filename": filename,
                "subfolder": subfolder,
                "type": "output"
            }

            # Compact thumbnail for UI preview (reliable over websocket, any save path)
            thumb = pil.copy()
            thumb.thumbnail((512, 512), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            thumb.save(buf, format="PNG", compress_level=4)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            LAST_PREVIEW_B64 = f"data:image/png;base64,{b64}"

        if last_image_info:
            LAST_IMAGE_INFO = last_image_info

        _persist_state()

        # UI over websocket: use last_image (/view URL) only — never ship huge base64
        # strings (ComfyUI splits them into char arrays and breaks the preview).
        # Base64 thumbnail is served via GET /ds/quicksave/last for reload/persist.
        ui = {
            "last_path": LAST_SAVED_PATH,
            "dir": save_dir,
            "suffix": suffix,
        }
        if LAST_IMAGE_INFO:
            ui["last_image"] = LAST_IMAGE_INFO

        print(
            "[DS QuickSave] quick_save ui:",
            {
                "last_path": LAST_SAVED_PATH,
                "dir": save_dir,
                "suffix": suffix,
                "last_image": LAST_IMAGE_INFO,
                "has_b64_preview": bool(LAST_PREVIEW_B64),
                "saved_count": len(saved_paths),
            },
            flush=True,
        )

        return {"ui": ui}


# ------------------------------------------------------------------
# REGISTRATION (done in __init__.py)
# ------------------------------------------------------------------