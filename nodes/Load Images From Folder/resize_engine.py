# DeathshotArsenal/nodes/Load Images From Folder/resize_engine.py
import math
import numpy as np
from PIL import Image, ImageOps, ImageSequence
import torch

_I16_MODES = ("I;16", "I;16B", "I;16L", "I;16N")

DEFAULT_RESIZE_CONFIG = {
    "mode": "off",
    "max_mp": 1.0,
    "longest_side": 1024,
    "scale_factor": 1.0,
    "fit_w": 1024,
    "fit_h": 1024,
    "cover_w": 1024,
    "cover_h": 1024,
    "ratio_preset": "1:1",
    "ratio_w": 1,
    "ratio_h": 1,
    "ratio_action": "crop",
    "pad_color": "#808080",
    "pad_top": 0,
    "pad_bottom": 0,
    "pad_left": 0,
    "pad_right": 0,
    "crop_anchor": "center",
    "crop_scale": True,
    "snap": 0,
    "resample": "auto",
    "allow_upscale": True,
}


def hex_to_rgb(value: str):
    s = str(value or "").lstrip("#")
    try:
        if len(s) == 3:
            return tuple(int(c * 2, 16) for c in s)
        if len(s) == 6:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except Exception:
        pass
    return (128, 128, 128)


def pick_resample(mode: str, factor: float):
    table = {
        "nearest": Image.Resampling.NEAREST,
        "bilinear": Image.Resampling.BILINEAR,
        "bicubic": Image.Resampling.BICUBIC,
        "lanczos": Image.Resampling.LANCZOS,
    }
    if mode in table:
        return table[mode]
    return Image.Resampling.LANCZOS if factor < 1.0 else Image.Resampling.BILINEAR


def round_half_up(x: float) -> int:
    return int(math.floor(float(x) + 0.5))


def clamp_dims(w: int, h: int):
    return max(8, min(int(w), 16384)), max(8, min(int(h), 16384))


def snap_dims(w: int, h: int, snap: int):
    snap = int(snap or 0)
    if snap <= 0:
        return w, h
    return max(8, (int(w) // snap) * snap), max(8, (int(h) // snap) * snap)


def anchor_offsets(anchor: str, outer_w: int, inner_w: int, outer_h: int, inner_h: int):
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


def resize_simple(img: Image.Image, nw: int, nh: int, config: dict, factor: float = None) -> Image.Image:
    if img.size == (nw, nh):
        return img
    if factor is None:
        factor = nw / max(1, img.width)
    return img.resize((nw, nh), pick_resample(config.get("resample", "auto"), factor))


def apply_resize(img: Image.Image, config: dict) -> tuple[Image.Image, int, int]:
    """
    Applies the configured resize transformation to a PIL Image.
    Returns (processed_pil_image, final_w, final_h).
    """
    mode = config.get("mode", "off")
    allow_up = bool(config.get("allow_upscale", True))
    snap = int(config.get("snap", 0) or 0)
    orig_w, orig_h = img.size

    def factor_dims(f: float):
        f = float(f)
        if not allow_up:
            f = min(f, 1.0)
        f = min(f, 8.0)
        return round_half_up(orig_w * f), round_half_up(orig_h * f), f

    # Mode 1: Off
    if mode == "off":
        w, h = snap_dims(orig_w, orig_h, snap)
        w, h = clamp_dims(w, h)
        return resize_simple(img, w, h, config), w, h

    # Mode 2: Max megapixels
    if mode == "max_mp":
        target_mp = max(0.01, min(float(config.get("max_mp", 1.0)), 64.0))
        target_pixels = target_mp * 1000000.0
        f = math.sqrt(target_pixels / max(1.0, orig_w * orig_h))
        w, h, f = factor_dims(f)
        w, h = snap_dims(w, h, snap)
        w, h = clamp_dims(w, h)
        return resize_simple(img, w, h, config, f), w, h

    # Mode 3: Longest side
    if mode == "longest_side":
        target = max(8, min(int(config.get("longest_side", 1024)), 16384))
        f = target / max(orig_w, orig_h)
        w, h, f = factor_dims(f)
        w, h = snap_dims(w, h, snap)
        w, h = clamp_dims(w, h)
        return resize_simple(img, w, h, config, f), w, h

    # Mode 4: Scale by
    if mode == "scale_by":
        f = max(0.01, float(config.get("scale_factor", 1.0)))
        w, h, f = factor_dims(f)
        w, h = snap_dims(w, h, snap)
        w, h = clamp_dims(w, h)
        return resize_simple(img, w, h, config, f), w, h

    # Mode 5: Fit inside
    if mode == "fit_inside":
        tw = max(8, min(int(config.get("fit_w", 1024)), 16384))
        th = max(8, min(int(config.get("fit_h", 1024)), 16384))
        f = min(tw / orig_w, th / orig_h)
        w, h, f = factor_dims(f)
        w, h = snap_dims(w, h, snap)
        w, h = clamp_dims(w, h)
        return resize_simple(img, w, h, config, f), w, h

    # Mode 6: Crop to fill
    if mode == "crop_to_fill" or mode == "cover":
        tw = max(8, min(int(config.get("cover_w", 1024)), 16384))
        th = max(8, min(int(config.get("cover_h", 1024)), 16384))
        anchor = config.get("crop_anchor", "center")
        if not bool(config.get("crop_scale", True)):
            cw, ch = min(tw, orig_w), min(th, orig_h)
            cw, ch = snap_dims(cw, ch, snap)
            cw, ch = max(1, min(cw, orig_w)), max(1, min(ch, orig_h))
            x, y = anchor_offsets(anchor, orig_w, cw, orig_h, ch)
            out = img.crop((x, y, x + cw, y + ch))
            return out, *clamp_dims(cw, ch)

        f = max(tw / orig_w, th / orig_h)
        if not allow_up and f > 1.0:
            f = min(tw / orig_w, th / orig_h)
        f = min(f, 8.0)
        sw, sh = round_half_up(orig_w * f), round_half_up(orig_h * f)
        scaled = resize_simple(img, sw, sh, config, f)
        x, y = anchor_offsets(anchor, sw, tw, sh, th)
        out = scaled.crop((x, y, x + min(tw, sw), y + min(th, sh)))
        fw, fh = snap_dims(min(tw, sw), min(th, sh), snap)
        fw, fh = clamp_dims(fw, fh)
        if out.size != (fw, fh):
            out = resize_simple(out, fw, fh, config, fw / max(1, out.width))
        return out, fw, fh

    # Mode 7: Match aspect ratio
    if mode == "match_aspect_ratio" or mode == "match_ratio":
        rw = max(1, int(config.get("ratio_w", 1)))
        rh = max(1, int(config.get("ratio_h", 1)))
        target_ratio = rw / rh
        cur_ratio = orig_w / orig_h
        if cur_ratio > target_ratio:
            nw = max(1, round_half_up(orig_h * target_ratio))
            nh = orig_h
        else:
            nw = orig_w
            nh = max(1, round_half_up(orig_w / target_ratio))

        action = str(config.get("ratio_action", "crop")).lower()
        if action == "crop":
            x = (orig_w - nw) // 2
            y = (orig_h - nh) // 2
            out = img.crop((x, y, x + nw, y + nh))
        else:  # pad
            color = hex_to_rgb(config.get("pad_color", "#808080"))
            out = Image.new("RGB", (nw, nh), color)
            out.paste(img, ((nw - orig_w) // 2, (nh - orig_h) // 2))

        fw, fh = snap_dims(nw, nh, snap)
        fw, fh = clamp_dims(fw, fh)
        if out.size != (fw, fh):
            out = resize_simple(out, fw, fh, config, fw / max(1, out.width))
        return out, fw, fh

    # Mode 8: Pad
    if mode == "pad":
        pt = max(0, int(config.get("pad_top", 0)))
        pb = max(0, int(config.get("pad_bottom", 0)))
        pl = max(0, int(config.get("pad_left", 0)))
        pr = max(0, int(config.get("pad_right", 0)))
        nw, nh = orig_w + pl + pr, orig_h + pt + pb
        if nw == orig_w and nh == orig_h:
            nw, nh = snap_dims(orig_w, orig_h, snap)
            nw, nh = clamp_dims(nw, nh)
            return resize_simple(img, nw, nh, config), nw, nh

        out = Image.new("RGB", (nw, nh), hex_to_rgb(config.get("pad_color", "#808080")))
        out.paste(img, (pl, pt))
        fw, fh = snap_dims(nw, nh, snap)
        fw, fh = clamp_dims(fw, fh)
        if out.size != (fw, fh):
            out = resize_simple(out, fw, fh, config, fw / max(1, out.width))
        return out, fw, fh

    # Fallback to off
    w, h = snap_dims(orig_w, orig_h, snap)
    w, h = clamp_dims(w, h)
    return resize_simple(img, w, h, config), w, h


def pil_to_tensor(img: Image.Image, dtype=torch.float32) -> torch.Tensor:
    """Convert PIL RGB image to [1, H, W, 3] PyTorch tensor normalized to [0.0, 1.0]."""
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr)[None,].to(dtype=dtype)


def load_and_process_image(file_path: str, resize_config: dict, dtype=torch.float32):
    """
    Opens single image file, handles orientation and bit-depth, applies resize_engine,
    and returns (tensor[1, H, W, 3], out_w, out_h).
    """
    with Image.open(file_path) as raw_img:
        frame = ImageOps.exif_transpose(next(ImageSequence.Iterator(raw_img)))
        if frame.mode == "I":
            frame = frame.point(lambda px: px * (1 / 255))
        elif frame.mode in _I16_MODES:
            frame = frame.convert("I").point(lambda px: px * (1 / 257))
        rgb = frame.convert("RGB")

    resized_pil, final_w, final_h = apply_resize(rgb, resize_config)
    tensor = pil_to_tensor(resized_pil, dtype=dtype)
    return tensor, final_w, final_h
