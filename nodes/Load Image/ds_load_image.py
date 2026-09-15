"""DS Load Image node.

PRD implementation for the DeathshotArsenal image loader:
- IMAGE + W/H + Original W/H outputs
- Max Megapixels / Longest Side / Scale by X
- snapping, selectable resampling, upscale guard
- persisted frontend state
"""

import hashlib
import json
import math
import os

import numpy as np
from PIL import Image, ImageOps, ImageSequence
import torch

import folder_paths
import node_helpers


DEFAULT_STATE = {
    "version": 1,
    "mode": "off",
    "max_mp": 2.0,
    "longest_side": 1536,
    "scale_factor": 2.0,
    "snap": 0,
    "resample": "auto",
    "allow_upscale": True,
}

_ALLOWED_RESAMPLE = {"auto", "nearest", "bilinear", "bicubic", "lanczos"}


def _parse_state(value):
    merged = dict(DEFAULT_STATE)
    if not value:
        return merged
    try:
        data = json.loads(value)
    except Exception:
        return merged
    if isinstance(data, dict):
        for key in merged:
            if key in data:
                merged[key] = data[key]
    return merged


def _round_half_up(value):
    return int(math.floor(float(value) + 0.5))


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _clamp_dims(w, h):
    return _clamp(int(w), 8, 16384), _clamp(int(h), 8, 16384)


def _snap_dimensions(w, h, divisor):
    divisor = int(divisor or 0)
    if divisor <= 0:
        return int(w), int(h)
    # Apply one common scale factor so the source aspect ratio is preserved.
    w = max(1, int(w)); h = max(1, int(h))
    rw = max(divisor, _round_half_up(w / divisor) * divisor)
    rh = max(divisor, _round_half_up(h / divisor) * divisor)
    candidates = []
    for cw in (rw - divisor, rw, rw + divisor):
        if cw < divisor:
            continue
        ch = max(divisor, _round_half_up((cw * h / w) / divisor) * divisor)
        candidates.append((abs(cw - w) + abs(ch - h), cw, ch))
    for ch in (rh - divisor, rh, rh + divisor):
        if ch < divisor:
            continue
        cw = max(divisor, _round_half_up((ch * w / h) / divisor) * divisor)
        candidates.append((abs(cw - w) + abs(ch - h), cw, ch))
    _, sw, sh = min(candidates, key=lambda item: item[0])
    return sw, sh


def _pick_resample(name, scale):
    table = {
        "nearest": Image.Resampling.NEAREST,
        "bilinear": Image.Resampling.BILINEAR,
        "bicubic": Image.Resampling.BICUBIC,
        "lanczos": Image.Resampling.LANCZOS,
    }
    if name in table:
        return table[name]
    return Image.Resampling.LANCZOS if scale < 1.0 else Image.Resampling.BILINEAR


def _target_dimensions(orig_w, orig_h, state):
    mode = str(state.get("mode", "off"))
    allow_upscale = bool(state.get("allow_upscale", True))
    snap = int(state.get("snap", 0) or 0)

    if orig_w <= 0 or orig_h <= 0:
        return 8, 8

    scale = 1.0
    if mode == "max_mp":
        mp = _clamp(float(state.get("max_mp", 2.0)), 0.01, 64.0)
        scale = math.sqrt((mp * 1024.0 * 1024.0) / float(orig_w * orig_h))
    elif mode == "longest_side":
        target = _clamp(int(state.get("longest_side", 1536)), 8, 16384)
        scale = target / float(max(orig_w, orig_h))
    elif mode == "scale_factor":
        scale = _clamp(float(state.get("scale_factor", 2.0)), 0.01, 8.0)

    if not allow_upscale:
        scale = min(scale, 1.0)

    w = _round_half_up(orig_w * scale)
    h = _round_half_up(orig_h * scale)
    w, h = _snap_dimensions(w, h, snap)
    return _clamp_dims(w, h)


def _load_frame(frame):
    frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
    # Normalize integer image modes before converting to RGB.
    if frame.mode == "I":
        frame = frame.point(lambda px: px * (1.0 / 255.0))
    elif frame.mode in ("I;16", "I;16B", "I;16L", "I;16N"):
        frame = frame.convert("I").point(lambda px: px * (1.0 / 257.0))
    return frame.convert("RGB")


class DS_LoadImage:
    DESCRIPTION = (
        "DeathshotArsenal DS Load Image: image loader, pre-scaler, "
        "desktop/browser drag-and-drop, thumbnails and inline scaling controls."
    )

    @classmethod
    def _input_images(cls):
        input_dir = folder_paths.get_input_directory()
        valid_exts = {ext.lower() for ext in Image.registered_extensions()}
        items = []
        if os.path.isdir(input_dir):
            for root, _, names in os.walk(input_dir):
                for name in names:
                    if os.path.splitext(name)[1].lower() in valid_exts:
                        rel = os.path.relpath(os.path.join(root, name), input_dir)
                        items.append(rel.replace("\\", "/"))
        return sorted(items, key=str.lower)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": (
                    cls._input_images(),
                    {"tooltip": "Select an image. Upload or drag-and-drop directly onto the node."},
                ),
            },
            "hidden": {
                "ds_load_image_state": (
                    "STRING",
                    {"default": json.dumps(DEFAULT_STATE, separators=(",", ":"))},
                ),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("image", "W", "H", "Original W", "Original H")
    FUNCTION = "load_image"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"

    @classmethod
    def VALIDATE_INPUTS(cls, image, ds_load_image_state=""):
        if not image or not folder_paths.exists_annotated_filepath(image):
            return f"Invalid image file: {image}"
        return True

    @classmethod
    def IS_CHANGED(cls, image, ds_load_image_state=""):
        path = folder_paths.get_annotated_filepath(image)
        if not os.path.exists(path):
            return float("nan")
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            digest.update(handle.read())
        digest.update((ds_load_image_state or "").encode("utf-8"))
        return digest.hexdigest()

    def load_image(self, image, ds_load_image_state=""):
        path = folder_paths.get_annotated_filepath(image)
        state = _parse_state(ds_load_image_state)

        try:
            import comfy.model_management as mm
            tensor_dtype = mm.intermediate_dtype()
        except Exception:
            tensor_dtype = torch.float32

        frames = []
        original_w = original_h = final_w = final_h = 0
        pil = node_helpers.pillow(Image.open, path)

        first_size = None
        try:
            for frame in ImageSequence.Iterator(pil):
                rgb = _load_frame(frame)
                if first_size is None:
                    first_size = rgb.size
                    original_w, original_h = rgb.size
                if rgb.size != first_size:
                    continue

                target_w, target_h = _target_dimensions(original_w, original_h, state)
                scale = target_w / max(1, original_w)
                if rgb.size != (target_w, target_h):
                    rgb = rgb.resize(
                        (target_w, target_h),
                        _pick_resample(str(state.get("resample", "auto")), scale),
                    )

                arr = np.asarray(rgb, dtype=np.float32) / 255.0
                frames.append(torch.from_numpy(arr)[None].to(dtype=tensor_dtype))
                final_w, final_h = target_w, target_h

                if pil.format == "MPO":
                    break
        finally:
            try:
                pil.close()
            except Exception:
                pass

        if not frames:
            blank = torch.zeros((1, 64, 64, 3), dtype=tensor_dtype)
            return blank, 64, 64, 64, 64

        batch = torch.cat(frames, dim=0) if len(frames) > 1 else frames[0]
        return batch, int(final_w), int(final_h), int(original_w), int(original_h)


NODE_CLASS_MAPPINGS = {"DS_LoadImage": DS_LoadImage}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_LoadImage": "DS Load Image"}
