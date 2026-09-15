"""DS Image Preview - IMAGE passthrough with optional automatic lossless PNG saving."""
import json
import os
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


def _write_preview(image, node_id):
    """Write the first image losslessly to temp for browser preview."""
    pil = _tensor_to_pil(image[0])
    name = f"{TEMP_PREFIX}{_safe_id(node_id)}_{uuid.uuid4().hex}.png"
    path = os.path.join(_temp_dir(), name)
    pil.save(path, format="PNG", compress_level=4)
    return path, pil.width, pil.height


def _save_batch(image, node_id):
    """Save every image in the batch as its own lossless PNG."""
    saved = []
    for index, frame in enumerate(image):
        pil = _tensor_to_pil(frame)
        path = _unique_output_path(node_id, index)
        tmp = f"{path}.{uuid.uuid4().hex}.tmp"
        # PNG is lossless. Compression changes file size, not image quality.
        pil.save(tmp, format="PNG", compress_level=4)
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
        return web.json_response({"ok": False, "error": "invalid preview file"}, status=400)
    source = os.path.join(_temp_dir(), name)
    if not os.path.isfile(source):
        return web.json_response({"ok": False, "error": "preview expired"}, status=404)

    node_id = _safe_id(data.get("node_id", "node"))
    stamp = time.strftime("%Y%m%d_%H%M%S")
    millis = int(time.time() * 1000) % 1000
    out = os.path.join(_output_dir(), f"DS_ImagePreview_{stamp}_{millis:03d}_{node_id}_manual_{uuid.uuid4().hex[:10]}.png")
    # Copying the already-lossless PNG preserves the exact preview pixels.
    with open(source, "rb") as src, open(out, "wb") as dst:
        while True:
            chunk = src.read(1024 * 1024)
            if not chunk:
                break
            dst.write(chunk)
    _log(f"manual save node={node_id} path={out}")
    return web.json_response({"ok": True, "filename": os.path.basename(out), "path": out})


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
                # Kept as a real serialized ComfyUI widget so the custom UI can
                # control it while the backend receives the selected mode.
                "SaveMode": (["preview", "save"], {"default": "preview"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    def preview(self, image, SaveMode="preview", unique_id=None):
        node_id = str(unique_id or "node")
        mode = "save" if str(SaveMode).lower() == "save" else "preview"
        _log(f"execute node={node_id} mode={mode} batch={int(image.shape[0])}")

        preview_path, width, height = _write_preview(image, node_id)
        preview_name = os.path.basename(preview_path)
        saved = []
        if mode == "save":
            saved = _save_batch(image, node_id)
            _log(f"SAVE mode node={node_id}: saved {len(saved)} PNG(s), preview={width}x{height}")
        else:
            _log(f"PREVIEW mode node={node_id}: captured {width}x{height}; no output file saved")

        return {
            "ui": {
                "ds_image_preview": [{
                    "file": preview_name,
                    "width": width,
                    "height": height,
                    "count": int(image.shape[0]),
                    "mode": mode,
                    "saved": [os.path.basename(p) for p in saved],
                }]
            },
            "result": (image,),
        }


NODE_CLASS_MAPPINGS = {"DS_ImagePreview": DS_ImagePreview}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ImagePreview": "DS Image Preview"}
