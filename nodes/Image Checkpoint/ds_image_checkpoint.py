# DeathshotArsenal/ds_image_checkpoint.py
"""DS Image Checkpoint - IMAGE gate using Pixaroma-style prompt pruning.

This is a normal ComfyUI IMAGE -> IMAGE node. The frontend decides whether a
submitted prompt is paused, passed, or continued; the backend never blocks a
worker thread. In Pause mode downstream nodes are removed from the submitted
prompt. Continue submits a second prompt with the upstream generation pruned
away and this node reloads its saved snapshot. Pass leaves the prompt intact.
"""
import json
import os
import shutil
import time
import uuid

import numpy as np
import torch
from PIL import Image
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


def _write_snapshot(image, node_id):
    path = _snapshot_path(node_id)
    pil = _tensor_to_pil(image[0])
    tmp = f"{path}.{uuid.uuid4().hex}.tmp"
    pil.save(tmp, "PNG")
    os.replace(tmp, path)
    return path, pil.width, pil.height


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
        return web.json_response({"ok": False, "error": "preview not available"}, status=404)

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
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                # Optional is intentional. Continue removes this link from the
                # submitted prompt so the expensive upstream graph is skipped.
                "image": ("IMAGE", {"tooltip": "Image to inspect. In Continue mode the saved checkpoint image is used instead of this live input."}),
            },
            "hidden": {
                "PauseState": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
            },
        }

    def run(self, image=None, PauseState="", unique_id=None):
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
            return {"ui": {"ds_image_checkpoint": [{"filename": os.path.basename(path), "subfolder": "", "type": "temp"}]}, "result": (output,)}

        if image is None:
            raise RuntimeError("DS Image Checkpoint: no IMAGE is connected to the input.")

        path, width, height = _write_snapshot(image, node_id)
        _log(f"{mode.upper()} node={node_id} captured {width}x{height}")
        return {
            "ui": {"ds_image_checkpoint": [{"filename": os.path.basename(path), "subfolder": "", "type": "temp", "width": width, "height": height, "mode": mode}]},
            "result": (image,),
        }


NODE_CLASS_MAPPINGS = {"DS_ImageCheckpoint": DS_ImageCheckpoint}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ImageCheckpoint": "DS Image Checkpoint"}
