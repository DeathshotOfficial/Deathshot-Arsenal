"""
Deathshot Arsenal - DS Randomizer: AI Variation Cache
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
    v = re.sub(r"[^\w\s]", " ", v)
    v = re.sub(r"\s+", " ", v).strip()
    return v


# ---------------------------------------------------------------------------
# Semantic Clusters for cross-synonym diversity enforcement
# ---------------------------------------------------------------------------

SEMANTIC_CLUSTERS = {
    "hair_color": {
        "black_dark": {"black", "raven", "jet", "charcoal", "obsidian", "ebony", "dark", "noir", "soot", "pitch", "ink", "onyx"},
        "blonde": {"blonde", "blond", "golden", "honey", "champagne", "flaxen", "platinum", "bleached", "sand", "wheat", "strawberry", "dirty"},
        "red_ginger": {"red", "ginger", "copper", "auburn", "crimson", "scarlet", "ruby", "fiery", "rust", "cinnamon", "burgundy", "wine", "claret"},
        "brown_brunette": {"brown", "brunette", "chestnut", "chocolate", "hazel", "caramel", "espresso", "mocha", "mahogany", "warm", "tawny", "amber"},
        "silver_white": {"silver", "white", "gray", "grey", "ash", "titanium", "frost", "ice", "pearl", "steel", "smoke", "metallic"},
        "vivid_green": {"green", "emerald", "mint", "olive", "lime", "jade", "forest", "teal", "sage"},
        "vivid_blue": {"blue", "cyan", "azure", "navy", "turquoise", "sapphire", "indigo", "cobalt", "cerulean", "aqua", "electric", "arctic"},
        "vivid_purple": {"purple", "violet", "lavender", "lilac", "plum", "magenta", "amethyst", "mauve", "orchid"},
        "vivid_pink": {"pink", "rose", "fuchsia", "bubblegum", "coral", "blush", "hot pink", "neon pink"},
        "vivid_warm": {"orange", "yellow", "amber", "tangerine", "peach", "gold", "saffron", "neon", "coral"},
    },
    "hair_style": {
        "short_cropped": {"pixie", "buzzed", "cropped", "shaved", "undercut", "caesar", "tapered"},
        "bob": {"bob", "lob", "blunt", "chin-length", "jaw-length"},
        "ponytail_updo": {"ponytail", "bun", "updo", "chignon", "topknot", "french twist"},
        "braided": {"braid", "braids", "cornrows", "box braids", "dutch braid", "french braid", "plait", "pigtails", "fishtail"},
        "locs": {"locs", "dreadlocks", "dreads", "locks", "sisterlocks"},
        "curly_natural": {"afro", "coily", "kinky", "natural", "curly", "ringlets", "coils"},
        "wavy": {"wavy", "waves", "beach waves", "loose waves", "tousled", "undone"},
        "straight_long": {"straight", "sleek", "flowing", "long", "waist-length", "hip-length"},
        "layered": {"layered", "wolf cut", "shag", "curtain bangs", "bangs", "wispy"},
    },
    "hair_length": {
        "short": {"short", "pixie", "bob", "buzz", "cropped", "undercut", "jaw", "chin"},
        "medium": {"shoulder", "collarbone", "medium", "mid-length", "lob"},
        "long": {"long", "waist", "mid-back", "flowing", "elbow", "cascading", "hip", "floor"},
    },
    "clothing": {
        "formal": {"suit", "tuxedo", "blazer", "evening", "gown", "cocktail", "formal", "tie", "waistcoat", "brocade", "opera", "ballgown"},
        "casual_street": {"hoodie", "tshirt", "t-shirt", "jeans", "sweater", "denim", "jacket", "bomber", "cargo", "streetwear", "sweatshirt", "joggers", "sneakers", "puffer"},
        "intimate": {"lingerie", "bikini", "swimsuit", "panties", "bra", "underwear", "nightgown", "babydoll", "robe", "thong", "bodysuit", "lace", "satin", "slip"},
        "fantasy_dramatic": {"kimono", "corset", "armor", "robes", "gothic", "victorian", "medieval", "steampunk", "cloak", "cape", "fantasy", "latex", "leather", "velvet"},
        "sporty": {"athletic", "leggings", "sports", "track", "shorts", "spandex", "cycling", "compression"},
        "cultural_historical": {"hanfu", "qipao", "kimono", "dashiki", "kente", "sari", "yukata", "vintage", "historical", "traditional", "folk", "ethnic"},
        "bohemian": {"boho", "bohemian", "floral", "maxi", "peasant", "hippie", "fringe", "wrap"},
        "minimal": {"minimal", "linen", "cotton", "simple", "clean", "monochrome", "basic"},
    },
    "female_clothing": {
        "formal_luxury": {"gown", "ballgown", "evening", "cocktail", "brocade", "silk", "satin", "velvet"},
        "casual": {"jeans", "sweater", "hoodie", "t-shirt", "shorts", "sneakers", "denim"},
        "intimate": {"lingerie", "bikini", "bra", "panties", "babydoll", "slip", "lace", "bodysuit"},
        "fantasy": {"corset", "armor", "gothic", "latex", "leather", "cape", "robes"},
        "cultural": {"hanfu", "qipao", "sari", "kimono", "wrap", "kente", "traditional"},
    },
    "male_clothing": {
        "formal": {"suit", "tuxedo", "blazer", "waistcoat", "shirt", "tie", "formal"},
        "casual": {"jeans", "tshirt", "hoodie", "sweater", "shorts", "sneakers"},
        "fantasy": {"armor", "cloak", "robes", "medieval", "fantasy"},
        "cultural": {"dashiki", "kimono", "nehru", "traditional", "ethnic"},
        "sport": {"athletic", "track", "compression", "shorts", "cycling"},
    },
    "location": {
        "luxury_interior": {"boudoir", "penthouse", "hotel", "suite", "mansion", "library", "lounge", "opera", "gallery", "spa", "hammam"},
        "urban_street": {"alleyway", "street", "rooftop", "subway", "warehouse", "market", "cafe", "bar", "souk", "bazaar"},
        "nature_landscape": {"forest", "beach", "mountain", "field", "lake", "cliff", "bamboo", "desert", "jungle", "meadow", "glacier"},
        "industrial_dystopian": {"factory", "bunker", "server", "abandoned", "concrete", "brutalist", "vault", "dystopian"},
        "fantasy_surreal": {"crystal cave", "floating island", "ethereal", "dreamscape", "mythological", "surreal", "cherry blossom", "magical"},
    },
    "skin_complexion": {
        "pale_fair": {"porcelain", "alabaster", "ivory", "pale", "fair", "cool", "peach", "pink", "light"},
        "olive_medium": {"olive", "mediterranean", "tan", "golden", "warm", "honey", "beige", "caramel", "wheat"},
        "brown_darker": {"brown", "caramel", "tawny", "bronze", "amber", "terracotta", "mocha", "warm brown"},
        "deep_dark": {"ebony", "mahogany", "deep", "dark", "rich", "obsidian", "blue-black"},
        "bronzed": {"bronzed", "sun-bronzed", "tanned", "sunkissed", "copper"},
    },
    "body_figure": {
        "slender": {"slender", "slim", "lean", "willowy", "petite", "slight", "thin", "narrow"},
        "athletic": {"athletic", "toned", "muscular", "fit", "defined", "strong", "powerful"},
        "curvy": {"curvy", "hourglass", "voluptuous", "curvaceous", "full", "thick", "busty", "buxom"},
        "plus": {"plus", "full-figured", "bbw", "soft", "plush"},
        "tall_statuesque": {"statuesque", "tall", "long", "leggy"},
    },
    "lighting": {
        "golden_warm": {"golden hour", "golden", "warm", "sunset", "sunrise", "amber", "candlelight", "fire"},
        "dark_dramatic": {"chiaroscuro", "noir", "shadow", "dark", "moody", "low-key", "dramatic"},
        "neon_vivid": {"neon", "cyberpunk", "vivid", "colorful", "electric", "rgb", "ultraviolet", "blacklight"},
        "clean_studio": {"studio", "softbox", "white", "clean", "neutral", "high-key", "beauty dish"},
        "natural": {"natural", "window", "overcast", "diffused", "daylight", "soft", "organic"},
        "surreal": {"bioluminescent", "underwater", "moonlight", "ethereal", "magical", "iridescent"},
    },
    "camera_angle": {
        "low": {"low-angle", "worm's eye", "looking up", "upward", "below"},
        "high": {"high-angle", "bird's-eye", "overhead", "top-down", "aerial", "above"},
        "close": {"close-up", "closeup", "macro", "extreme close", "detail", "tight"},
        "wide": {"wide", "establishing", "full body", "full shot", "long shot"},
        "profile": {"profile", "side", "silhouette", "three-quarter"},
        "eye_level": {"eye-level", "straight-on", "direct", "front-facing", "dutch"},
    },
    "clothing_color": {
        "dark_cool": {"black", "jet", "charcoal", "onyx", "midnight", "navy", "dark", "ebony", "noir"},
        "dark_warm": {"burgundy", "wine", "maroon", "oxblood", "plum", "deep red", "mahogany", "chocolate"},
        "neutral": {"grey", "gray", "beige", "tan", "taupe", "nude", "oatmeal", "cream", "ivory", "white", "camel", "khaki", "ecru"},
        "warm_vivid": {"red", "orange", "coral", "terracotta", "rust", "sienna", "amber", "mustard", "gold", "yellow", "copper", "bronze"},
        "cool_vivid": {"blue", "cobalt", "teal", "indigo", "sapphire", "navy", "azure", "cerulean", "denim"},
        "green": {"green", "emerald", "olive", "sage", "forest", "mint", "jade", "moss", "lime"},
        "pink_purple": {"pink", "rose", "blush", "fuchsia", "lavender", "lilac", "purple", "violet", "mauve", "magenta"},
        "metallic": {"silver", "gold", "bronze", "copper", "metallic", "chrome", "iridescent", "holographic"},
        "pastel": {"pastel", "powder", "baby", "soft", "pale", "light", "champagne", "peach", "apricot"},
    },
}

def get_cluster(text: str, category: Optional[str] = None) -> Optional[str]:
    """Identifies semantic aesthetic cluster for a given text and category."""
    if not text or not category:
        return None
    clusters = SEMANTIC_CLUSTERS.get(category, {})
    if not clusters:
        # Check all clusters if category not directly mapped
        for cat_clusters in SEMANTIC_CLUSTERS.values():
            words = set(re.findall(r"\b\w+\b", text.lower()))
            for cname, cwords in cat_clusters.items():
                if words & cwords:
                    return cname
        return None
    words = set(re.findall(r"\b\w+\b", text.lower()))
    for cname, cwords in clusters.items():
        if words & cwords:
            return cname
    return None


def _is_near_duplicate(a: str, b: str, category: Optional[str] = None, check_cluster: bool = False) -> bool:
    """
    True when two category values are near-duplicates.
    Strategies:
      1. Exact normalised match
      2. Semantic cluster match ONLY for immediate consecutive run contrast (check_cluster=True)
      3. Multi-word phrase containment (min 10 chars, min 2 words each)
      4. Shared significant word ratio >= 0.70 (ignoring common stopwords)
    """
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return False
    if na == nb:
        return True

    # Semantic cluster detection: ONLY for consecutive run contrast.
    # Across a 10-batch history, forbidding all clusters starves every option and forces false repeats.
    if check_cluster and category:
        ca = get_cluster(na, category)
        cb = get_cluster(nb, category)
        if ca and cb and ca == cb:
            return True

    wa = set(na.split())
    wb = set(nb.split())
    if not wa or not wb:
        return False

    # Stopwords to ignore in word-overlap ratio
    stopwords = {
        "and", "with", "the", "a", "an", "of", "in", "on", "at", "to", "for",
        "hair", "cut", "style", "skin", "tone", "color", "eyes", "eye", "look", "type", "wearing"
    }
    sig_wa = wa - stopwords
    sig_wb = wb - stopwords

    # If all significant words match exactly
    if sig_wa and sig_wb and sig_wa == sig_wb:
        return True

    # Multi-word phrase containment
    if len(wa) >= 2 and len(wb) >= 2 and min(len(na), len(nb)) >= 10:
        if na in nb or nb in na:
            return True

    if not sig_wa or not sig_wb:
        return False

    overlap = len(sig_wa & sig_wb)
    ratio = overlap / max(len(sig_wa), len(sig_wb))
    return ratio >= 0.70


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
                # Sanitize and deduplicate on load
                cleaned: Dict[str, Dict[str, List[str]]] = {}
                for nid, cats in data.items():
                    if isinstance(cats, dict):
                        cleaned[nid] = {}
                        for cid, vals in cats.items():
                            if isinstance(vals, list):
                                seen = set()
                                uvals = []
                                for v in vals:
                                    nv = _normalize(str(v))
                                    if nv and nv not in seen:
                                        seen.add(nv)
                                        uvals.append(str(v).strip())
                                cleaned[nid][cid] = uvals[-_DEFAULT_BATCH_SIZE:]
                _cache = cleaned
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
    Uses a sliding window of batch_size entries with deduplication.
    """
    if not chosen_values:
        return
    # Contamination patterns that should never be recorded
    _CONTAM_PATTERNS = [
        "replaces:", "##CATVAL##", "value:", "replaced with",
        "\n", "\t", "NONE", "N/A",
    ]
    with _lock:
        _ensure_loaded()
        node_cache = _cache.setdefault(node_id, {})
        for cat, val in chosen_values.items():
            if not val or not isinstance(val, str):
                continue
            clean_val = val.strip().strip('"\'')
            if not clean_val or len(clean_val) < 3:
                continue
            # Skip contaminated values
            val_lower = clean_val.lower()
            if any(p.lower() in val_lower for p in _CONTAM_PATTERNS):
                logger.warning(f"[VariationCache] Skipping contaminated value for {cat}: {clean_val[:80]}...")
                continue
            # Truncate excessively long values (>120 chars = LLM prose leakage)
            if len(clean_val) > 120:
                for delim in [',', '.', ' — ', ' - ']:
                    cut = clean_val.rfind(delim, 0, 120)
                    if cut > 30:
                        clean_val = clean_val[:cut].strip(' ,.-—')
                        break
                else:
                    clean_val = clean_val[:120].strip()
            history = node_cache.setdefault(cat, [])
            # Deduplicate against existing entries in history
            history = [h for h in history if _normalize(h) != _normalize(clean_val)]
            history.append(clean_val)
            if len(history) > batch_size:
                history = history[-batch_size:]
            node_cache[cat] = history
        _save_to_disk()


def check_repeats(
    node_id: str,
    chosen_values: Dict[str, str],
) -> Dict[str, str]:
    """
    Return {category: chosen_value} for every category whose value
    is a near-duplicate or immediate same-family repeat of something in its history.
    """
    with _lock:
        _ensure_loaded()
        node_cache = _cache.get(node_id, {})
        repeats: Dict[str, str] = {}
        for cat, val in chosen_values.items():
            if not val:
                continue
            history = node_cache.get(cat, [])
            for idx, past in enumerate(reversed(history)):
                is_immediate = (idx == 0)
                if _is_near_duplicate(val, past, category=cat, check_cluster=is_immediate):
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
