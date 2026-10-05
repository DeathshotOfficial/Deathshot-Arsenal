# DeathshotArsenal - Safe, lightweight LoRA weight tensor cache
import os
import logging
from typing import Any, Dict, Optional, Tuple

import comfy.utils

logger = logging.getLogger("DeathshotArsenal.LoraWeightCache")

# Cache mapping: (normalized_path, mtime) -> (lora_data_dict, lora_metadata)
_LORA_WEIGHT_CACHE: Dict[Tuple[str, float], Tuple[Any, Any]] = {}
_MAX_CACHED_LORAS = 8


def load_cached_lora_weights(path: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Loads LoRA weight tensors from disk, reusing previously loaded CPU tensors if
    the file on disk has not changed (verified via mtime).

    Does NOT cache patched MODEL or CLIP graphs - only the raw weight state dict.
    Evicts the oldest entry when the cache exceeds _MAX_CACHED_LORAS.
    """
    if not path or not os.path.isfile(path):
        return None, None

    try:
        norm_path = os.path.normpath(os.path.abspath(path))
        mtime = os.path.getmtime(norm_path)
        cache_key = (norm_path, mtime)

        if cache_key in _LORA_WEIGHT_CACHE:
            return _LORA_WEIGHT_CACHE[cache_key]

        data, meta = comfy.utils.load_torch_file(norm_path, safe_load=True, return_metadata=True)

        # LRU-style eviction of oldest entry
        if len(_LORA_WEIGHT_CACHE) >= _MAX_CACHED_LORAS:
            oldest_key = next(iter(_LORA_WEIGHT_CACHE))
            _LORA_WEIGHT_CACHE.pop(oldest_key, None)

        _LORA_WEIGHT_CACHE[cache_key] = (data, meta)
        return data, meta
    except Exception as e:
        logger.warning(f"[DeathshotArsenal] Failed to load LoRA weights from '{path}': {e}")
        try:
            return comfy.utils.load_torch_file(path, safe_load=True, return_metadata=True)
        except Exception:
            return None, None


def clear_cached_lora_weights() -> None:
    """Explicitly releases all cached LoRA weight state dicts."""
    _LORA_WEIGHT_CACHE.clear()
