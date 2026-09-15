# DeathshotArsenal/nodes/Load Images From Folder/ds_load_images_from_folder.py
import hashlib
import json
import os
import torch
import torch.nn.functional as F
from PIL import Image

from .folder_scanner import is_safe_subpath
from .resize_engine import (
    DEFAULT_RESIZE_CONFIG,
    load_and_process_image,
    pil_to_tensor,
)
from .auto_queue_runner import AutoQueueRunner


def parse_state(raw_state: str) -> dict:
    default_state = {
        "folder_path": "",
        "selected_files": [],
        "current_index": 1,
        "batch_size": 1,
        "execution_mode": "sequential",
        "include_subfolders": True,
        "keep_folder_structure": False,
        "sort_by": "name",
        "sort_dir": "asc",
        "resize_config": dict(DEFAULT_RESIZE_CONFIG),
    }
    if not raw_state:
        return default_state
    try:
        parsed = json.loads(raw_state)
        if isinstance(parsed, dict):
            for k, v in parsed.items():
                if k == "resize_config" and isinstance(v, dict):
                    cfg = dict(DEFAULT_RESIZE_CONFIG)
                    cfg.update(v)
                    default_state["resize_config"] = cfg
                else:
                    default_state[k] = v
        return default_state
    except Exception:
        return default_state


class DS_LoadImagesFromFolder:
    """
    DS Load Images From Folder - High-throughput batch image loader designed to process
    entire image folders or curated selections without requiring manual prompt queuing.
    Features OS directory browser, thumbnail gallery modal, auto-execution loop, and
    advanced 8-mode resize engine.
    """
    DESCRIPTION = (
        "DS Load Images From Folder: Load images from any disk folder sequentially or in batches. "
        "Features native OS folder picker, fast thumbnail gallery modal with multi-selection, "
        "automated sequential execution loop (auto-feeder), and an 8-mode image resizing engine."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "ds_folder_loader_state": ("STRING", {"default": "{}"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "STRING", "INT", "INT")
    RETURN_NAMES = ("image", "W", "H", "filename", "index", "total")
    OUTPUT_TOOLTIPS = (
        "Output image tensor [B, H, W, 3].",
        "Output width in pixels.",
        "Output height in pixels.",
        "Name of the image file (or relative path if folder structure retained).",
        "1-based execution index in the selected sequence.",
        "Total number of selected images.",
    )
    FUNCTION = "load_images"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"

    @classmethod
    def IS_CHANGED(cls, ds_folder_loader_state="", unique_id=None, prompt=None):
        state = parse_state(ds_folder_loader_state)
        folder = state.get("folder_path", "")
        selected = state.get("selected_files", []) or []
        current_idx = max(1, int(state.get("current_index", 1) or 1))
        batch_size = max(1, int(state.get("batch_size", 1) or 1))

        parts = [
            folder,
            str(current_idx),
            str(batch_size),
            str(state.get("execution_mode", "sequential")),
            str(state.get("keep_folder_structure", False)),
            json.dumps(state.get("resize_config", {}), sort_keys=True),
            str(len(selected)),
        ]

        # Hash mtimes of current slice of files
        if folder and os.path.isdir(folder) and selected:
            start_idx = current_idx - 1
            mode = state.get("execution_mode", "sequential")
            count = batch_size if mode == "batch" else 1
            active_files = selected[start_idx : start_idx + count]
            for rel in active_files:
                p = os.path.join(folder, rel)
                try:
                    parts.append(f"{rel}:{os.stat(p).st_mtime_ns}")
                except OSError:
                    parts.append(f"{rel}:missing")

        return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()

    def load_images(self, ds_folder_loader_state="", unique_id=None, prompt=None):
        state = parse_state(ds_folder_loader_state)
        folder = state.get("folder_path", "")
        selected = state.get("selected_files", []) or []
        current_idx = max(1, int(state.get("current_index", 1) or 1))
        batch_size = max(1, int(state.get("batch_size", 1) or 1))
        mode = state.get("execution_mode", "sequential")
        keep_folder_structure = bool(state.get("keep_folder_structure", False))
        resize_config = state.get("resize_config", DEFAULT_RESIZE_CONFIG)

        # Intermediate dtype from ComfyUI model management if available
        try:
            import comfy.model_management as mm
            dtype = mm.intermediate_dtype()
        except Exception:
            dtype = torch.float32

        # Handle empty or invalid folder / selection
        if not folder or not os.path.isdir(folder) or not selected:
            if not folder or not os.path.isdir(folder):
                print(f"[DS Load Images From Folder] Folder not specified or directory not found: '{folder}'")
            elif not selected:
                print(f"[DS Load Images From Folder] No images selected in folder: '{folder}'")
            # Return safe placeholder tensor
            blank = Image.new("RGB", (512, 512), (32, 32, 36))
            t = pil_to_tensor(blank, dtype=dtype)
            return (t, 512, 512, "", 0, 0)

        total = len(selected)
        # Clamp index
        if current_idx > total:
            current_idx = total
        if current_idx < 1:
            current_idx = 1

        start_idx = current_idx - 1
        num_to_load = batch_size if mode == "batch" else 1
        num_to_load = min(num_to_load, total - start_idx)
        if num_to_load < 1:
            num_to_load = 1
        target_rels = selected[start_idx : start_idx + num_to_load]

        loaded_tensors = []
        loaded_names = []
        final_w = 0
        final_h = 0

        for rel in target_rels:
            full_path = os.path.join(folder, rel)
            if not is_safe_subpath(folder, full_path):
                print(f"[DS Load Images From Folder] Security warning: path traversal attempt rejected: {rel}")
                continue
            if not os.path.isfile(full_path):
                print(f"[DS Load Images From Folder] File not found or unreadable: {rel}")
                continue

            try:
                t, fw, fh = load_and_process_image(full_path, resize_config, dtype=dtype)
                loaded_tensors.append(t)
                final_w, final_h = fw, fh

                # Format filename output
                if keep_folder_structure:
                    rel_norm = rel.replace("\\", "/")
                    loaded_names.append(rel_norm)
                else:
                    loaded_names.append(os.path.basename(rel))
            except Exception as e:
                print(f"[DS Load Images From Folder] Failed loading image '{rel}': {e}")

        # If all target files failed to load, output fallback
        if not loaded_tensors:
            print("[DS Load Images From Folder] All images in the current batch failed to load. Emitting blank tensor.")
            blank = Image.new("RGB", (512, 512), (32, 32, 36))
            t = pil_to_tensor(blank, dtype=dtype)
            return (t, 512, 512, "", int(current_idx), int(total))

        # Ensure all tensors in batch match the dimensions of the first tensor
        base_h, base_w = loaded_tensors[0].shape[1], loaded_tensors[0].shape[2]
        aligned_tensors = []
        for t in loaded_tensors:
            if t.shape[1] != base_h or t.shape[2] != base_w:
                # Permute to [1, C, H, W] for interpolation
                t_perm = t.permute(0, 3, 1, 2)
                t_resized = F.interpolate(t_perm, size=(base_h, base_w), mode="bilinear", align_corners=False)
                t_aligned = t_resized.permute(0, 2, 3, 1)
                aligned_tensors.append(t_aligned)
            else:
                aligned_tensors.append(t)

        batched_tensor = torch.cat(aligned_tensors, dim=0)
        final_w, final_h = base_w, base_h
        out_filename = ", ".join(loaded_names) if len(loaded_names) > 1 else loaded_names[0]

        # Broadcast execution loop progress event to frontend
        if unique_id:
            AutoQueueRunner.notify_progress(unique_id, current_idx, total, out_filename)

        return (batched_tensor, int(final_w), int(final_h), out_filename, int(current_idx), int(total))
