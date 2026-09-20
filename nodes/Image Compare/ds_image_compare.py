"""DS Image Compare - In-canvas visual comparison with split slider and resolution metrics."""

import logging
import os
import random
import numpy as np
from PIL import Image
import torch

import folder_paths


class DS_ImageCompare:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "generate_preview"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    def _save_temp_image(self, tensor, prefix="cmp_"):
        if tensor is None:
            return None
        try:
            if tensor.ndim == 4:
                tensor = tensor[0]

            i = 255. * tensor.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

            temp_dir = folder_paths.get_temp_directory()
            rand_id = random.randint(100000, 999999)
            filename = f"{prefix}{rand_id}.webp"
            filepath = os.path.join(temp_dir, filename)

            # Fast native WebP encoding (< 15ms)
            img.save(filepath, format="WEBP", quality=92, method=2)

            return {
                "filename": filename,
                "subfolder": "",
                "type": "temp"
            }
        except Exception as e:
            logging.error(f"[DeathshotArsenal|ImageCompare] Fast temp save failed: {e}")
            return None

    def generate_preview(self, image_a=None, image_b=None, unique_id=None):
        safe_id = "".join(c for c in str(unique_id or "") if c.isalnum() or c in "_-")
        prefix_a = f"cmp_{safe_id}_a_" if safe_id else "cmp_a_"
        prefix_b = f"cmp_{safe_id}_b_" if safe_id else "cmp_b_"
        img_a_info = self._save_temp_image(image_a, prefix_a)
        img_b_info = self._save_temp_image(image_b, prefix_b)

        dims_a = None
        if image_a is not None and torch.is_tensor(image_a) and image_a.ndim == 4:
            dims_a = [int(image_a.shape[2]), int(image_a.shape[1])]

        dims_b = None
        if image_b is not None and torch.is_tensor(image_b) and image_b.ndim == 4:
            dims_b = [int(image_b.shape[2]), int(image_b.shape[1])]

        # Use "compare_images" instead of "images" to prevent ComfyUI core
        # from attaching its native image gallery previewer on top of the node
        ui_data = {
            "compare_images": [
                img_a_info or {"filename": "", "type": "temp", "subfolder": ""},
                img_b_info or {"filename": "", "type": "temp", "subfolder": ""}
            ],
            "dims": {
                "a": dims_a,
                "b": dims_b,
            }
        }

        return {"ui": ui_data}