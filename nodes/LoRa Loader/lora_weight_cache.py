# DeathshotArsenal - Safe, lightweight LoRA weight tensor cache
import os
import logging
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple

import comfy.utils

logger = logging.getLogger("DeathshotArsenal.LoraWeightCache")

DEFAULT_MAX_CACHED_LORAS = 8

# Cache mapping: (normalized_path, mtime) -> (lora_data_dict, lora_metadata)
# Ordered from least to most recently used.
_LORA_WEIGHT_CACHE: "OrderedDict[Tuple[str, float], Tuple[Any, Any]]" = OrderedDict()


def _trim_cache(max_entries: int) -> None:
    """Evicts least recently used entries until the cache fits max_entries."""
    while len(_LORA_WEIGHT_CACHE) > max(0, max_entries):
        _LORA_WEIGHT_CACHE.popitem(last=False)


def load_cached_lora_weights(
    path: str, max_entries: int = DEFAULT_MAX_CACHED_LORAS
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Loads LoRA weight tensors from disk, reusing previously loaded CPU tensors if
    the file on disk has not changed (verified via mtime).

    max_entries controls how many LoRA state dicts may stay cached (LRU eviction).
    A value of 0 disables caching: the file is loaded and nothing is retained.

    Does NOT cache patched MODEL or CLIP graphs - only the raw weight state dict.
    """
    if not path or not os.path.isfile(path):
        return None, None

    try:
        norm_path = os.path.normpath(os.path.abspath(path))

        if max_entries <= 0:
            _LORA_WEIGHT_CACHE.clear()
            return comfy.utils.load_torch_file(norm_path, safe_load=True, return_metadata=True)

        mtime = os.path.getmtime(norm_path)
        cache_key = (norm_path, mtime)

        if cache_key in _LORA_WEIGHT_CACHE:
            _LORA_WEIGHT_CACHE.move_to_end(cache_key)
            _trim_cache(max_entries)
            return _LORA_WEIGHT_CACHE[cache_key]

        data, meta = comfy.utils.load_torch_file(norm_path, safe_load=True, return_metadata=True)

        # Drop stale entries for the same file (older mtime)
        for key in [k for k in _LORA_WEIGHT_CACHE if k[0] == norm_path]:
            _LORA_WEIGHT_CACHE.pop(key, None)

        _LORA_WEIGHT_CACHE[cache_key] = (data, meta)
        _trim_cache(max_entries)
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
