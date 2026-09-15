import traceback

import torch
import torch.nn.functional as F

from .outpaint_math import build_canvas

LOG = "[DS Outpaint]"
MAX_OUTPUT_DIMENSION = 16384
MAX_OUTPUT_PIXELS = 64_000_000
MAX_ESTIMATED_PEAK_BYTES = 3 * 1024 ** 3


class DS_Outpaint:
    """Interactive image outpainting canvas extender with telemetry HUD."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"image": ("IMAGE",)},
            "hidden": {
                "mode": ("STRING", {"default": "To ratio"}),
                "ratio": ("STRING", {"default": "3:2"}),
                "direction": ("STRING", {"default": "Both"}),
                "pad_left": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1}),
                "pad_top": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1}),
                "pad_right": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1}),
                "pad_bottom": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1}),
                "snap_enabled": ("BOOLEAN", {"default": True}),
                "snap_multiple": ("INT", {"default": 8, "min": 1, "max": 1024, "step": 1}),
                "target_mp": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "fill_color": ("STRING", {"default": "#808080"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "DS_OUTPAINT_INFO")
    RETURN_NAMES = ("image", "width", "height", "outpaint_info")
    FUNCTION = "outpaint"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"

    @staticmethod
    def _parse_color(value):
        text = str(value or "#808080").strip().lstrip("#")
        if len(text) == 3:
            text = "".join(ch * 2 for ch in text)
        if len(text) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in text):
            raise ValueError(f"Invalid fill color '{value}'")
        rgb = tuple(int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
        return rgb, f"#{text.upper()}"

    def outpaint(self, image=None, mode="To ratio", ratio="3:2", direction="Both",
                 pad_left=0, pad_top=0, pad_right=0, pad_bottom=0,
                 snap_enabled=True, snap_multiple=8, target_mp=0.0,
                 fill_color="#808080", **kwargs):
        try:
            if image is None:
                raise ValueError("No image input was provided")
            if not torch.is_tensor(image) or image.ndim != 4:
                raise ValueError("Expected IMAGE tensor with shape [B, H, W, C]")
            batch, in_h, in_w, channels = image.shape
            if channels not in (1, 3, 4):
                raise ValueError(f"Unsupported channel count: {channels}")

            rgb, fill_hex = self._parse_color(fill_color)
            result = build_canvas(
                in_w, in_h,
                mode=mode,
                ratio=ratio,
                direction=direction,
                pad_left=pad_left,
                pad_top=pad_top,
                pad_right=pad_right,
                pad_bottom=pad_bottom,
                target_mp=target_mp,
                snap_enabled=bool(snap_enabled),
                snap_multiple=max(1, int(snap_multiple or 1)),
            )

            final_w, final_h = result.width, result.height
            left, top = result.left, result.top
            right, bottom = result.right, result.bottom

            if final_w > MAX_OUTPUT_DIMENSION or final_h > MAX_OUTPUT_DIMENSION:
                raise ValueError(
                    f"Requested canvas {final_w}x{final_h} exceeds the safe maximum "
                    f"of {MAX_OUTPUT_DIMENSION}px per dimension"
                )
            if final_w * final_h > MAX_OUTPUT_PIXELS:
                raise ValueError(
                    f"Requested canvas {final_w}x{final_h} is {final_w * final_h:,} pixels; "
                    f"the safe limit is {MAX_OUTPUT_PIXELS:,} pixels"
                )

            # The math returns a single final scale for the original image.
            scaled_w = max(1, final_w - left - right)
            scaled_h = max(1, final_h - top - bottom)
            bytes_per_sample = int(image.element_size())
            estimated_canvas_bytes = batch * final_w * final_h * channels * bytes_per_sample
            estimated_peak = estimated_canvas_bytes * (2.5 if (scaled_w != in_w or scaled_h != in_h) else 1.5)
            if estimated_peak > MAX_ESTIMATED_PEAK_BYTES:
                gib = estimated_peak / (1024 ** 3)
                raise MemoryError(
                    f"Requested canvas {final_w}x{final_h} may require about {gib:.2f} GiB peak tensor memory; "
                    f"safe limit is {MAX_ESTIMATED_PEAK_BYTES / (1024 ** 3):.2f} GiB"
                )

            reference_image = image
            if scaled_w != in_w or scaled_h != in_h:
                reference_image = F.interpolate(
                    image.permute(0, 3, 1, 2),
                    size=(scaled_h, scaled_w),
                    mode="bilinear",
                    align_corners=False,
                ).permute(0, 2, 3, 1)
                image = reference_image

            dtype, device = image.dtype, image.device
            if channels == 1:
                fill = torch.tensor([sum(rgb) / 3.0], dtype=dtype, device=device)
            elif channels == 3:
                fill = torch.tensor(rgb, dtype=dtype, device=device)
            else:
                fill = torch.tensor((*rgb, 1.0), dtype=dtype, device=device)

            canvas = torch.empty((batch, final_h, final_w, channels), dtype=dtype, device=device)
            canvas[:] = fill
            canvas[:, top:top + scaled_h, left:left + scaled_w, :] = image

            info = {
                "version": 1,
                "mode": str(mode or "To ratio"),
                "ratio": str(ratio or "3:2"),
                "direction": str(direction or "Both"),
                "original_width": int(in_w),
                "original_height": int(in_h),
                "canvas_width": int(final_w),
                "canvas_height": int(final_h),
                "base_width": int(result.base_width),
                "base_height": int(result.base_height),
                "left": int(left),
                "top": int(top),
                "right": int(right),
                "bottom": int(bottom),
                "source_width": int(scaled_w),
                "source_height": int(scaled_h),
                "scale": float(getattr(result, "scale", 1.0)),
                "snap_enabled": bool(snap_enabled),
                "snap_multiple": int(max(1, int(snap_multiple or 1))),
                "target_mp": float(target_mp or 0.0),
                "fill_color": fill_hex,
                "reference_image": reference_image,
            }

            print(
                f"{LOG} Padded [{in_w}x{in_h}] -> [{final_w}x{final_h}] "
                f"(Mode: {mode}, Ratio: {ratio}, Added L:{left} T:{top} R:{right} B:{bottom}, Color: {fill_hex})",
                flush=True,
            )

            # Return standard tuple wrapped with ComfyUI UI telemetry dictionary
            return {
                "ui": {
                    "input_size": [int(in_w), int(in_h)],
                    "output_size": [int(final_w), int(final_h)],
                    "pads": [int(left), int(top), int(right), int(bottom)],
                },
                "result": (canvas, final_w, final_h, info),
            }
        except Exception as exc:
            print(f"{LOG} ERROR: {exc.__class__.__name__}: {exc}", flush=True)
            print(traceback.format_exc().rstrip(), flush=True)
            raise