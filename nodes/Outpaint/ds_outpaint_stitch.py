import traceback
import torch
import torch.nn.functional as F

LOG = "[DS Outpaint Stitch]"


class OutpaintInfoType(str):
    """Wildcard type that compares as compatible with DS_OUTPAINT_INFO and OUTPAINT_INFO."""

    def __ne__(self, other):
        if str(other).upper() in ("DS_OUTPAINT_INFO", "OUTPAINT_INFO", "*"):
            return False
        return super().__ne__(other)

    def __eq__(self, other):
        if str(other).upper() in ("DS_OUTPAINT_INFO", "OUTPAINT_INFO", "*"):
            return True
        return super().__eq__(other)


outpaint_info_type = OutpaintInfoType("DS_OUTPAINT_INFO")


class DS_OutpaintStitch:
    """Restores the pristine original image into the model-generated outpaint canvas using authoritative geometry from DS Outpaint."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "outpaint_info": (outpaint_info_type,),
            },
            "optional": {
                "feather": ("INT", {"default": 64, "min": 0, "max": 2048, "step": 1}),
                "color_match": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "stitch"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"

    def stitch(self, image=None, outpaint_info=None, feather=64, color_match=1.0, **kwargs):
        try:
            if image is None:
                raise ValueError("No image input was provided")
            if not torch.is_tensor(image) or image.ndim != 4:
                raise ValueError("Expected IMAGE tensor with shape [B, H, W, C]")
            if outpaint_info is None or not isinstance(outpaint_info, dict):
                raise ValueError("outpaint_info must be a valid dictionary from DS Outpaint")

            pristine = outpaint_info.get("reference_image")
            if pristine is None:
                pristine = outpaint_info.get("original_image")
            if pristine is None or not torch.is_tensor(pristine):
                raise ValueError("outpaint_info does not contain a valid 'reference_image'")

            batch, h, w, channels = image.shape
            pristine = pristine.to(device=image.device, dtype=image.dtype)

            # Match batch size
            if pristine.shape[0] != batch:
                if pristine.shape[0] == 1:
                    pristine = pristine.repeat(batch, 1, 1, 1)
                elif pristine.shape[0] < batch:
                    reps = (batch + pristine.shape[0] - 1) // pristine.shape[0]
                    pristine = pristine.repeat(reps, 1, 1, 1)[:batch]
                else:
                    pristine = pristine[:batch]

            # Match channel count
            if pristine.shape[-1] != channels:
                if pristine.shape[-1] == 1 and channels in (3, 4):
                    pristine = pristine.repeat(1, 1, 1, channels)
                elif pristine.shape[-1] == 4 and channels == 3:
                    pristine = pristine[..., :3]
                elif pristine.shape[-1] == 3 and channels == 4:
                    alpha = torch.ones((*pristine.shape[:-1], 1), device=image.device, dtype=image.dtype)
                    pristine = torch.cat([pristine, alpha], dim=-1)

            # Extract authoritative geometry
            canvas_w = int(outpaint_info.get("canvas_width", w) or w)
            canvas_h = int(outpaint_info.get("canvas_height", h) or h)
            left = int(outpaint_info.get("left", 0) or 0)
            top = int(outpaint_info.get("top", 0) or 0)
            right = int(outpaint_info.get("right", 0) or 0)
            bottom = int(outpaint_info.get("bottom", 0) or 0)
            src_w = int(outpaint_info.get("source_width", pristine.shape[2]) or pristine.shape[2])
            src_h = int(outpaint_info.get("source_height", pristine.shape[1]) or pristine.shape[1])

            # Scale geometry proportionally if processed image was resized/upscaled relative to canvas
            sx = w / float(canvas_w) if canvas_w > 0 else 1.0
            sy = h / float(canvas_h) if canvas_h > 0 else 1.0

            x0 = max(0, min(w, int(round(left * sx))))
            y0 = max(0, min(h, int(round(top * sy))))
            x1 = max(x0, min(w, int(round((left + src_w) * sx))))
            y1 = max(y0, min(h, int(round((top + src_h) * sy))))

            target_w = x1 - x0
            target_h = y1 - y0

            if target_w <= 0 or target_h <= 0:
                raise ValueError(f"Calculated placement rectangle has invalid size {target_w}x{target_h}")

            # Interpolate pristine source to target destination size if needed
            if pristine.shape[1] != target_h or pristine.shape[2] != target_w:
                pristine = F.interpolate(
                    pristine.permute(0, 3, 1, 2),
                    size=(target_h, target_w),
                    mode="bilinear",
                    align_corners=False,
                ).permute(0, 2, 3, 1)

            # Read parameters with fallbacks from kwargs
            feather_val = int(kwargs.get("feather", feather))
            color_match_val = float(kwargs.get("color_match", color_match))
            if color_match_val > 2.0:
                color_match_val /= 100.0
            color_match_val = max(0.0, min(2.0, color_match_val))

            # Apply Color Match to the generated outpaint
            image_working = image
            if color_match_val > 0.0:
                orig_mean = pristine.mean(dim=(1, 2), keepdim=True)
                orig_std = pristine.std(dim=(1, 2), keepdim=True)
                gen_mean = image.mean(dim=(1, 2), keepdim=True)
                gen_std = image.std(dim=(1, 2), keepdim=True)

                matched = (image - gen_mean) * (orig_std / (gen_std + 1e-5)) + orig_mean
                matched = torch.clamp(matched, 0.0, 1.0)
                image_working = torch.clamp(
                    (1.0 - color_match_val) * image + color_match_val * matched,
                    0.0, 1.0,
                )

            # Compute Feathering Mask
            has_left = (left > 0)
            has_right = (right > 0) or (x1 < w)
            has_top = (top > 0)
            has_bottom = (bottom > 0) or (y1 < h)
            feather_px = max(0, feather_val)

            if feather_px <= 0 or not (has_left or has_right or has_top or has_bottom):
                weight = torch.ones((target_h, target_w), device=image.device, dtype=image.dtype)
            else:
                dx = torch.full((target_w,), float(target_w), device=image.device, dtype=torch.float32)
                if has_left:
                    dx = torch.minimum(dx, torch.arange(target_w, device=image.device, dtype=torch.float32))
                if has_right:
                    dx = torch.minimum(dx, torch.arange(target_w - 1, -1, -1, device=image.device, dtype=torch.float32))

                dy = torch.full((target_h,), float(target_h), device=image.device, dtype=torch.float32)
                if has_top:
                    dy = torch.minimum(dy, torch.arange(target_h, device=image.device, dtype=torch.float32))
                if has_bottom:
                    dy = torch.minimum(dy, torch.arange(target_h - 1, -1, -1, device=image.device, dtype=torch.float32))

                dist_2d = torch.minimum(dy.unsqueeze(1), dx.unsqueeze(0))
                norm_dist = torch.clamp(dist_2d / float(feather_px), 0.0, 1.0)
                # Hermite smoothstep for smooth boundary
                weight = (norm_dist * norm_dist * (3.0 - 2.0 * norm_dist)).to(dtype=image.dtype)

            # Stitch pristine original into canvas
            result_image = image_working.clone()
            w_expanded = weight.unsqueeze(0).unsqueeze(-1)  # [1, target_h, target_w, 1]
            result_image[:, y0:y1, x0:x1, :] = (
                pristine * w_expanded +
                image_working[:, y0:y1, x0:x1, :] * (1.0 - w_expanded)
            )

            # Mask output: 0.0 = restored pristine original, 1.0 = generated outpaint
            mask = torch.ones((batch, h, w), device=image.device, dtype=image.dtype)
            mask[:, y0:y1, x0:x1] = (1.0 - weight).unsqueeze(0).repeat(batch, 1, 1)

            print(
                f"{LOG} Stitched [{target_w}x{target_h} at ({x0}, {y0})] into [{w}x{h}] "
                f"(Feather: {feather_px}px, Color match: {color_match_val * 100:.0f}%)",
                flush=True,
            )

            return (result_image, mask)

        except Exception as exc:
            print(f"{LOG} ERROR: {exc.__class__.__name__}: {exc}", flush=True)
            print(traceback.format_exc().rstrip(), flush=True)
            raise
