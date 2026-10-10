"""
Deathshot Arsenal - AI Variation Cache
Feature A: Per-node, per-category LRU history that prevents the LLM from
repeating the same value within a configurable batch window (default 10).

Design constraints
------------------
* Server-side only - never stored in frontend state, so batch queues stay fresh.
* Persisted to JSON in the pack's config folder so it survives ComfyUI restarts.
* All reads/writes protected by a threading.Lock because the preview endpoint
  runs in asyncio.to_thread() while queue runs execute from the main thread.
* Cache misses or parse failures must NEVER crash a run.
"""

import json
import logging
import os
import threading
import re
from typing import Dict, List, Any, Optional

logger = logging.getLogger("DeathshotArsenal.Core.AI.VariationCache")

# ---------------------------------------------------------------------------
# Persistence path - lives in DeathshotArsenal/config/
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_PACK_ROOT = os.path.dirname(os.path.dirname(_HERE))  # DeathshotArsenal root
_CACHE_PATH = os.path.join(_PACK_ROOT, "config", "randomizer_variation_cache.json")

_DEFAULT_BATCH_SIZE = 10

# In-memory store: {node_id: {category_id: [value, value, ...]}}
_cache: Dict[str, Dict[str, List[str]]] = {}
_lock = threading.Lock()
_loaded = False


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _normalize(value: str) -> str:
    """Lowercase, strip punctuation/extra spaces - used for duplicate detection."""
    v = value.lower().strip()
    v = re.sub(r"[^\w\s]", "", v)
    v = re.sub(r"\s+", " ", v).strip()
    return v


def _is_near_duplicate(a: str, b: str) -> bool:
    """
    True when two category values are near-duplicates.
    Strategies:
      1. Exact normalised match
      2. One is a substring of the other (e.g. 'ponytail' in 'high ponytail')
      3. Shared word ratio > 0.6 (catches colour adjective swaps)
    """
    na, nb = _normalize(a), _normalize(b)
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    wa = set(na.split())
    wb = set(nb.split())
    if not wa or not wb:
        return False
    overlap = len(wa & wb)
    ratio = overlap / max(len(wa), len(wb))
    return ratio >= 0.60


# ---------------------------------------------------------------------------
# Load / Save
# ---------------------------------------------------------------------------

def _ensure_loaded():
    """Load cache from disk once, on first access."""
    global _cache, _loaded
    if _loaded:
        return
    _load_from_disk()
    _loaded = True


def _load_from_disk():
    global _cache
    try:
        if os.path.isfile(_CACHE_PATH):
            with open(_CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                _cache = data
                logger.debug(f"[VariationCache] Loaded from disk ({len(_cache)} node(s)).")
                return
    except Exception as e:
        logger.warning(f"[VariationCache] Failed to load cache from disk: {e}. Starting fresh.")
    _cache = {}


def _save_to_disk():
    """Write current cache state to disk. Called inside the lock."""
    try:
        os.makedirs(os.path.dirname(_CACHE_PATH), exist_ok=True)
        tmp = _CACHE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_cache, f, ensure_ascii=False, indent=2)
        os.replace(tmp, _CACHE_PATH)
    except Exception as e:
        logger.warning(f"[VariationCache] Failed to persist cache to disk: {e}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_avoidance_lists(
    node_id: str,
    categories: List[str],
) -> Dict[str, List[str]]:
    """
    Return {category_id: [already-used values]} for the given node.
    Used to build the "do not reuse" instructions for the LLM.
    """
    with _lock:
        _ensure_loaded()
        node_cache = _cache.get(node_id, {})
        result: Dict[str, List[str]] = {}
        for cat in categories:
            vals = node_cache.get(cat, [])
            if vals:
                result[cat] = list(vals)
        return result


def record_run(
    node_id: str,
    chosen_values: Dict[str, str],
    batch_size: int = _DEFAULT_BATCH_SIZE,
):
    """
    Record the LLM's chosen value for each category after a successful run.

    Batch rule: when a category's history reaches batch_size, keep only the
    last entry (the most recent), then begin a new batch from there.
    """
    if not chosen_values:
        return
    with _lock:
        _ensure_loaded()
        node_cache = _cache.setdefault(node_id, {})
        for cat, val in chosen_values.items():
            if not val or not isinstance(val, str):
                continue
            history = node_cache.setdefault(cat, [])
            history.append(val.strip())
            if len(history) >= batch_size:
                node_cache[cat] = [history[-1]]
        _save_to_disk()


def check_repeats(
    node_id: str,
    chosen_values: Dict[str, str],
) -> Dict[str, str]:
    """
    Return {category: chosen_value} for every category whose value
    is a near-duplicate of something in its history. Empty -> no repeats.
    """
    with _lock:
        _ensure_loaded()
        node_cache = _cache.get(node_id, {})
        repeats: Dict[str, str] = {}
        for cat, val in chosen_values.items():
            if not val:
                continue
            history = node_cache.get(cat, [])
            for past in history:
                if _is_near_duplicate(val, past):
                    repeats[cat] = val
                    break
        return repeats


def clear_node_cache(node_id: str):
    """Clear variation history for a specific node (UI 'Clear cache' button)."""
    with _lock:
        _ensure_loaded()
        _cache.pop(node_id, None)
        _save_to_disk()
    logger.info(f"[VariationCache] Cleared cache for node '{node_id}'.")


def clear_all_cache():
    """Clear variation history for all nodes."""
    global _cache
    with _lock:
        _cache = {}
        _save_to_disk()
    logger.info("[VariationCache] Cleared ALL node caches.")


def get_cache_stats(node_id: str, batch_size: int = _DEFAULT_BATCH_SIZE) -> Dict[str, Any]:
    """
    Lightweight stats for the status-line badge.
    Returns {"total_entries": N, "batch_size": M}.
    """
    with _lock:
        _ensure_loaded()
        node_cache = _cache.get(node_id, {})
        total = sum(len(v) for v in node_cache.values())
        return {"total_entries": total, "batch_size": batch_size}
