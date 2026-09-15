"""Deterministic canvas math for DS Outpaint."""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class CanvasResult:
    base_width: int
    base_height: int
    width: int
    height: int
    left: int
    top: int
    right: int
    bottom: int
    scale: float


def _split(delta: int, direction: str, horizontal: bool):
    delta = max(0, int(delta))
    d = str(direction or "Both").strip().lower()
    if horizontal and d == "left":
        return delta, 0
    if horizontal and d == "right":
        return 0, delta
    if not horizontal and d == "top":
        return delta, 0
    if not horizontal and d == "bottom":
        return 0, delta
    a = delta // 2
    return a, delta - a


def _ratio_expand(in_w: int, in_h: int, ratio: float, direction: str):
    current = in_w / in_h
    if abs(ratio - current) < 1e-12:
        return in_w, in_h, 0, 0, 0, 0
    if ratio > current:
        target_w = max(in_w, int(math.ceil(in_h * ratio)))
        dl, dr = _split(target_w - in_w, direction, True)
        return target_w, in_h, dl, 0, dr, 0
    target_h = max(in_h, int(math.ceil(in_w / ratio)))
    dt, db = _split(target_h - in_h, direction, False)
    return in_w, target_h, 0, dt, 0, db


def _snap_up(value: float, multiple: int) -> int:
    m = max(1, int(multiple))
    return max(m, int(math.ceil(float(value) / m)) * m)


def _distribute(delta: int, direction: str, horizontal: bool):
    return _split(delta, direction, horizontal)


def build_canvas(
    in_w,
    in_h,
    *,
    mode,
    ratio,
    direction,
    pad_left,
    pad_top,
    pad_right,
    pad_bottom,
    target_mp,
    snap_enabled,
    snap_multiple,
):
    in_w = max(1, int(in_w))
    in_h = max(1, int(in_h))
    mode_text = str(mode or "To ratio")

    if mode_text.lower() == "by side":
        left = max(0, int(pad_left))
        top = max(0, int(pad_top))
        right = max(0, int(pad_right))
        bottom = max(0, int(pad_bottom))
        base_w = in_w + left + right
        base_h = in_h + top + bottom
        anchor = "Both"
    else:
        try:
            a, b = str(ratio).split(":", 1)
            ratio_value = float(a) / float(b)
        except Exception as exc:
            raise ValueError(f"Invalid aspect ratio '{ratio}'") from exc
        if ratio_value <= 0:
            raise ValueError("Aspect ratio must be greater than zero")
        base_w, base_h, left, top, right, bottom = _ratio_expand(in_w, in_h, ratio_value, direction)
        anchor = str(direction or "Both")

    # Start from the exact base canvas. Target MP applies one uniform scale to
    # the entire canvas, including the original image and every pad.
    scale = 1.0
    mp = float(target_mp or 0.0)
    if mp > 0:
        scale = math.sqrt((mp * 1_000_000.0) / max(1, base_w * base_h))

    image_w = max(1, int(round(in_w * scale)))
    image_h = max(1, int(round(in_h * scale)))
    left = max(0, int(round(left * scale)))
    top = max(0, int(round(top * scale)))
    right = max(0, int(round(right * scale)))
    bottom = max(0, int(round(bottom * scale)))

    width = image_w + left + right
    height = image_h + top + bottom

    if snap_enabled:
        width = _snap_up(width, snap_multiple)
        height = _snap_up(height, snap_multiple)

        dw = width - (image_w + left + right)
        if dw:
            dl, dr = _distribute(dw, anchor, True)
            left += dl
            right += dr

        dh = height - (image_h + top + bottom)
        if dh:
            dt, db = _distribute(dh, anchor, False)
            top += dt
            bottom += db

    return CanvasResult(
        base_width=base_w,
        base_height=base_h,
        width=width,
        height=height,
        left=left,
        top=top,
        right=right,
        bottom=bottom,
        scale=float(scale),
    )
