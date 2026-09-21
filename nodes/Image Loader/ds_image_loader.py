# DeathshotArsenal/ds_image_loader.py
"""DS Image Loader.

Native-style image loader with inline resize controls.
The resize state is stored in a hidden STRING input so it survives workflow
save/load and is included in ComfyUI execution without depending on another
custom node pack.
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
    "max_mp": 1.0,
    "longest_side": 1024,
    "scale_factor": 1.0,
    "fit_w": 1024, "fit_h": 1024,
    "cover_w": 1024, "cover_h": 1024,
    "ratio_preset": "1:1",
    "ratio_w": 1, "ratio_h": 1,
    "ratio_action": "crop",
    "pad_color": "#808080",
    "pad_top": 0, "pad_bottom": 0, "pad_left": 0, "pad_right": 0,
    "crop_anchor": "center", "crop_scale": True,
    "snap": 0,
    "resample": "auto",
    "allow_upscale": True,
}

_I16_MODES = ("I;16", "I;16B", "I;16L", "I;16N")


def _parse_state(state_json):
    if not state_json:
        return dict(DEFAULT_STATE)
    try:
        parsed = json.loads(state_json)
        merged = dict(DEFAULT_STATE)
        if isinstance(parsed, dict):
            merged.update({k: v for k, v in parsed.items() if k in DEFAULT_STATE})
        return merged
    except Exception:
        return dict(DEFAULT_STATE)


def _hex_to_rgb(value):
    s = str(value or "").lstrip("#")
    try:
        if len(s) == 3:
            return tuple(int(c * 2, 16) for c in s)
        if len(s) == 6:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except Exception:
        pass
    return (128, 128, 128)


def _pick_resample(mode, factor):
    table = {
        "nearest": Image.Resampling.NEAREST,
        "bilinear": Image.Resampling.BILINEAR,
        "bicubic": Image.Resampling.BICUBIC,
        "lanczos": Image.Resampling.LANCZOS,
    }
    if mode in table:
        return table[mode]
    return Image.Resampling.LANCZOS if factor < 1.0 else Image.Resampling.BILINEAR


def _round_half_up(x):
    return int(math.floor(float(x) + 0.5))


def _clamp_dims(w, h):
    return max(8, min(int(w), 16384)), max(8, min(int(h), 16384))


def _snap_dims(w, h, snap):
    snap = int(snap or 0)
    if snap <= 0:
        return w, h
    return max(8, (int(w) // snap) * snap), max(8, (int(h) // snap) * snap)


def _anchor_offsets(anchor, outer_w, inner_w, outer_h, inner_h):
    a = str(anchor or "center").lower()
    if "left" in a:
        x = 0
    elif "right" in a:
        x = outer_w - inner_w
    else:
        x = (outer_w - inner_w) // 2
    if "top" in a:
        y = 0
    elif "bottom" in a:
        y = outer_h - inner_h
    else:
        y = (outer_h - inner_h) // 2
    return max(0, x), max(0, y)


def _resize_simple(img, nw, nh, state, factor=None):
    if img.size == (nw, nh):
        return img
    if factor is None:
        factor = nw / max(1, img.width)
    return img.resize((nw, nh), _pick_resample(state.get("resample", "auto"), factor))


def _resize_frame(img, state, orig_w, orig_h):
    """Return (rgb PIL image, final_w, final_h). JS preview mirrors this."""
    mode = state.get("mode", "off")
    allow_up = bool(state.get("allow_upscale", True))
    snap = int(state.get("snap", 0) or 0)
    w, h = orig_w, orig_h

    def factor_dims(f):
        f = float(f)
        if not allow_up:
            f = min(f, 1.0)
        f = min(f, 8.0)
        return _round_half_up(orig_w * f), _round_half_up(orig_h * f), f

    if mode == "max_mp":
        target = max(0.01, min(float(state.get("max_mp", 1.0)), 64.0))
        f = math.sqrt((target * 1024.0 * 1024.0) / max(1.0, orig_w * orig_h))
        w, h, f = factor_dims(f)
        w, h = _snap_dims(w, h, snap)
        w, h = _clamp_dims(w, h)
        return _resize_simple(img, w, h, state, f), w, h

    if mode == "longest_side":
        target = max(8, min(int(state.get("longest_side", 1024)), 16384))
        f = target / max(orig_w, orig_h)
        w, h, f = factor_dims(f)
        w, h = _snap_dims(w, h, snap)
        w, h = _clamp_dims(w, h)
        return _resize_simple(img, w, h, state, f), w, h

    if mode == "scale_factor":
        f = max(0.01, float(state.get("scale_factor", 1.0)))
        w, h, f = factor_dims(f)
        w, h = _snap_dims(w, h, snap)
        w, h = _clamp_dims(w, h)
        return _resize_simple(img, w, h, state, f), w, h

    if mode == "fit_inside":
        tw = max(8, min(int(state.get("fit_w", 1024)), 16384))
        th = max(8, min(int(state.get("fit_h", 1024)), 16384))
        f = min(tw / orig_w, th / orig_h)
        w, h, f = factor_dims(f)
        w, h = _snap_dims(w, h, snap)
        w, h = _clamp_dims(w, h)
        return _resize_simple(img, w, h, state, f), w, h

    if mode == "cover":
        tw = max(8, min(int(state.get("cover_w", 1024)), 16384))
        th = max(8, min(int(state.get("cover_h", 1024)), 16384))
        anchor = state.get("crop_anchor", "center")
        if not bool(state.get("crop_scale", True)):
            cw, ch = min(tw, orig_w), min(th, orig_h)
            cw, ch = _snap_dims(cw, ch, snap)
            cw, ch = max(1, min(cw, orig_w)), max(1, min(ch, orig_h))
            x, y = _anchor_offsets(anchor, orig_w, cw, orig_h, ch)
            out = img.crop((x, y, x + cw, y + ch))
            return out, *_clamp_dims(cw, ch)
        f = max(tw / orig_w, th / orig_h)
        if not allow_up and f > 1:
            # Fallback: fit inside target when upscaling is disabled.
            f = min(tw / orig_w, th / orig_h)
        f = min(f, 8.0)
        sw, sh = _round_half_up(orig_w * f), _round_half_up(orig_h * f)
        scaled = _resize_simple(img, sw, sh, state, f)
        x, y = _anchor_offsets(anchor, sw, tw, sh, th)
        out = scaled.crop((x, y, x + min(tw, sw), y + min(th, sh)))
        fw, fh = _snap_dims(min(tw, sw), min(th, sh), snap)
        fw, fh = _clamp_dims(fw, fh)
        if out.size != (fw, fh):
            out = _resize_simple(out, fw, fh, state, fw / max(1, out.width))
        return out, fw, fh

    if mode == "match_ratio":
        rw = max(1, int(state.get("ratio_w", 1)))
        rh = max(1, int(state.get("ratio_h", 1)))
        target = rw / rh
        cur = orig_w / orig_h
        if cur > target:
            nw = max(1, _round_half_up(orig_h * target))
            nh = orig_h
        else:
            nw = orig_w
            nh = max(1, _round_half_up(orig_w / target))
        if state.get("ratio_action", "crop") == "crop":
            x = (orig_w - nw) // 2
            y = (orig_h - nh) // 2
            out = img.crop((x, y, x + nw, y + nh))
        else:
            color = _hex_to_rgb(state.get("pad_color", "#808080"))
            out = Image.new("RGB", (nw, nh), color)
            out.paste(img, ((nw - orig_w) // 2, (nh - orig_h) // 2))
        fw, fh = _snap_dims(nw, nh, snap)
        fw, fh = _clamp_dims(fw, fh)
        if out.size != (fw, fh):
            out = _resize_simple(out, fw, fh, state, fw / max(1, out.width))
        return out, fw, fh

    if mode == "pad":
        pt = max(0, int(state.get("pad_top", 0)))
        pb = max(0, int(state.get("pad_bottom", 0)))
        pl = max(0, int(state.get("pad_left", 0)))
        pr = max(0, int(state.get("pad_right", 0)))
        nw, nh = orig_w + pl + pr, orig_h + pt + pb
        if nw == orig_w and nh == orig_h:
            nw, nh = _snap_dims(orig_w, orig_h, snap)
            nw, nh = _clamp_dims(nw, nh)
            return _resize_simple(img, nw, nh, state), nw, nh
        out = Image.new("RGB", (nw, nh), _hex_to_rgb(state.get("pad_color", "#808080")))
        out.paste(img, (pl, pt))
        fw, fh = _snap_dims(nw, nh, snap)
        fw, fh = _clamp_dims(fw, fh)
        if out.size != (fw, fh):
            out = _resize_simple(out, fw, fh, state, fw / max(1, out.width))
        return out, fw, fh

    # Off still honors snap.
    w, h = _snap_dims(orig_w, orig_h, snap)
    w, h = _clamp_dims(w, h)
    return _resize_simple(img, w, h, state), w, h


class DS_ImageLoader:
    DESCRIPTION = (
        "DS Image Loader - upload, drag/drop, clipboard paste, image browsing, "
        "multi-frame loading and inline resize controls."
    )

    @classmethod
    def _input_images(cls):
        input_dir = folder_paths.get_input_directory()
        extensions = set(Image.registered_extensions())
        images = []
        if os.path.isdir(input_dir):
            for root, _, filenames in os.walk(input_dir):
                for filename in filenames:
                    if os.path.splitext(filename)[1].lower() not in extensions:
                        continue
                    images.append(os.path.relpath(os.path.join(root, filename), input_dir).replace("\\", "/"))
        return sorted(images, key=str.lower)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": (cls._input_images(), {"tooltip": "Choose an image. Upload, drag/drop, or paste from the clipboard."}),
            },
            "hidden": {
                "ds_image_loader_state": ("STRING", {"default": json.dumps(DEFAULT_STATE)}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("image", "width (W)", "height (H)")
    FUNCTION = "load_image"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"

    @classmethod
    def VALIDATE_INPUTS(cls, image, ds_image_loader_state=""):
        if not folder_paths.exists_annotated_filepath(image):
            return f"Invalid image file: {image}"
        return True

    @classmethod
    def IS_CHANGED(cls, image, ds_image_loader_state=""):
        image_path = folder_paths.get_annotated_filepath(image)
        if not os.path.exists(image_path):
            return float("nan")
        h = hashlib.sha256()
        with open(image_path, "rb") as f:
            h.update(f.read())
        h.update((ds_image_loader_state or "").encode("utf-8"))
        return h.hexdigest()

    def load_image(self, image, ds_image_loader_state=""):
        image_path = folder_paths.get_annotated_filepath(image)
        img = node_helpers.pillow(Image.open, image_path)
        state = _parse_state(ds_image_loader_state)

        frames = []
        first_dims = None
        final_w = final_h = None
        tensor_dtype = torch.float32
        try:
            import comfy.model_management as mm
            tensor_dtype = mm.intermediate_dtype()
        except Exception:
            pass

        for frame in ImageSequence.Iterator(img):
            frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
            if frame.mode == "I":
                frame = frame.point(lambda px: px * (1 / 255))
            elif frame.mode in _I16_MODES:
                frame = frame.convert("I").point(lambda px: px * (1 / 257))
            rgb = frame.convert("RGB")
            if first_dims is None:
                first_dims = rgb.size
            if rgb.size != first_dims:
                continue
            orig_w, orig_h = rgb.size
            resized, final_w, final_h = _resize_frame(rgb, state, orig_w, orig_h)
            arr = np.asarray(resized).astype(np.float32) / 255.0
            frames.append(torch.from_numpy(arr)[None,].to(dtype=tensor_dtype))
            if img.format == "MPO":
                break

        if not frames:
            zeros = torch.zeros((1, 64, 64, 3), dtype=tensor_dtype)
            return zeros, 64, 64

        out = torch.cat(frames, dim=0) if len(frames) > 1 else frames[0]
        return out, int(final_w), int(final_h)


NODE_CLASS_MAPPINGS = {"DS_ImageLoader": DS_ImageLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ImageLoader": "DS Load Image"}
