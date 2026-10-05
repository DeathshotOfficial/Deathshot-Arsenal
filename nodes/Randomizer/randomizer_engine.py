"""
DeathshotArsenal - DS Randomizer Engine
Semantic prompt variation and randomization engine.

Responsibilities:
1. DatabaseLoader: Loads, validates, and indexes modular JSON category files.
2. CategoryDetector: Detects existing semantic categories in input prompts with free-form fuzzy matching.
3. VariationSelector: Stateful shuffle-bag selection with non-repetition and constraint filtering.
4. PromptRewriter: Replaces existing semantic spans or contextually inserts missing attributes.
5. Intimacy/Sex Logic: Adapts clothing to avoid AI genitalia clipping (e.g. unzipped, pulled down, hitched up).
6. Contradiction Resolver: Cleanly replaces setting clauses and eliminates environmental bleeding (e.g. beach in library).
"""

import os
import re
import json
import random
import logging
import threading
import hashlib
from typing import Dict, List, Any, Optional, Tuple, Set

logger = logging.getLogger("DeathshotArsenal.Randomizer")

# Default database directory
_HERE = os.path.dirname(os.path.abspath(__file__))
_PACK_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
DATABASE_DIR = os.path.join(_PACK_ROOT, "database", "randomizer")


# =====================================================================
# 1. DATABASE LOADER & SCHEMA VALIDATION
# =====================================================================

class DatabaseLoader:
    def __init__(self, db_dir: str = DATABASE_DIR):
        self.db_dir = db_dir
        self.categories: Dict[str, Dict[str, Any]] = {}
        self.groups: Dict[str, Dict[str, Any]] = {}
        self._compiled_detectors: Dict[str, List[re.Pattern]] = {}
        self._compiled_cleanups: Dict[str, List[re.Pattern]] = {}
        self._lock = threading.Lock()
        self.load()

    def load(self):
        """Loads and indexes all JSON category files in the database directory."""
        with self._lock:
            self.categories.clear()
            self.groups.clear()
            self._compiled_detectors.clear()
            self._compiled_cleanups.clear()

            if not os.path.isdir(self.db_dir):
                logger.warning(f"[DS Randomizer] Database directory not found: {self.db_dir}")
                return

            json_files = sorted([
                os.path.join(self.db_dir, f)
                for f in os.listdir(self.db_dir)
                if f.lower().endswith(".json")
            ])

            for filepath in json_files:
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self._ingest_file(data, filepath)
                except Exception as e:
                    logger.error(f"[DS Randomizer] Failed to load {filepath}: {e}")

            logger.info(
                f"[DS Randomizer] Loaded {len(self.categories)} categories "
                f"across {len(self.groups)} groups from {len(json_files)} files."
            )

    def _ingest_file(self, data: Any, filepath: str):
        if not isinstance(data, dict):
            return

        group_id = str(data.get("group") or os.path.splitext(os.path.basename(filepath))[0])
        group_name = str(data.get("name") or group_id.replace("_", " ").title())
        cats = data.get("categories", [])

        if group_id not in self.groups:
            self.groups[group_id] = {
                "id": group_id,
                "name": group_name,
                "category_ids": [],
            }

        if not isinstance(cats, list):
            return

        for cat in cats:
            if not isinstance(cat, dict) or "id" not in cat:
                continue
            cat_id = str(cat["id"])
            cat["group"] = group_id
            cat["name"] = str(cat.get("name") or cat_id.replace("_", " ").title())
            cat["insertion_zone"] = str(cat.get("insertion_zone") or "subject")
            cat["options"] = cat.get("options", [])

            # Entries validation
            entries = []
            for item in cat.get("entries", []):
                if isinstance(item, str):
                    entries.append({"text": item, "tags": [], "constraints": {}})
                elif isinstance(item, dict) and "text" in item:
                    entries.append(item)
            cat["entries"] = entries

            # Compile detection patterns
            detect_patterns = []
            for p in cat.get("detection_terms", []):
                try:
                    detect_patterns.append(re.compile(p, re.IGNORECASE))
                except re.error as err:
                    logger.warning(f"[DS Randomizer] Invalid regex '{p}' in category '{cat_id}': {err}")
            self._compiled_detectors[cat_id] = detect_patterns

            # Compile cleanup patterns
            cleanup_patterns = []
            for p in cat.get("cleanup_patterns", []):
                try:
                    cleanup_patterns.append(re.compile(p, re.IGNORECASE))
                except re.error as err:
                    logger.warning(f"[DS Randomizer] Invalid cleanup regex '{p}' in category '{cat_id}': {err}")
            self._compiled_cleanups[cat_id] = cleanup_patterns

            self.categories[cat_id] = cat
            if cat_id not in self.groups[group_id]["category_ids"]:
                self.groups[group_id]["category_ids"].append(cat_id)

    def get_category(self, cat_id: str) -> Optional[Dict[str, Any]]:
        return self.categories.get(cat_id)

    def get_catalog(self) -> Dict[str, Any]:
        """Returns metadata for frontend UI."""
        return {
            "groups": list(self.groups.values()),
            "categories": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "group": c["group"],
                    "insertion_zone": c.get("insertion_zone", "subject"),
                    "options": c.get("options", []),
                    "entries_count": len(c.get("entries", [])),
                }
                for c in self.categories.values()
            ],
        }


# Global database loader instance
_DB_LOADER = DatabaseLoader()

def get_db_loader() -> DatabaseLoader:
    return _DB_LOADER


# =====================================================================
# 2. CATEGORY DETECTOR & SEMANTIC SPAN MATCHING
# =====================================================================

class DetectedSpan:
    def __init__(self, category_id: str, start: int, end: int, matched_text: str):
        self.category_id = category_id
        self.start = start
        self.end = end
        self.matched_text = matched_text

    def __repr__(self):
        return f"<DetectedSpan {self.category_id}: '{self.matched_text}' [{self.start}:{self.end}]>"


class CategoryDetector:
    @staticmethod
    def detect_category(text: str, category_id: str, db: DatabaseLoader) -> Optional[DetectedSpan]:
        """Finds whether category_id is expressed in text, returning the best semantic span."""
        patterns = db._compiled_detectors.get(category_id, [])
        best_match = None
        best_len = 0

        # 1. Primary: Match against category compiled regexes
        for pat in patterns:
            for match in pat.finditer(text):
                m_start = match.start()
                m_end = match.end()
                m_text = match.group(0)
                if match.lastindex is not None:
                    for g in range(1, match.lastindex + 1):
                        if match.group(g):
                            m_start = match.start(g)
                            m_end = match.end(g)
                            m_text = match.group(g)
                            break
                m_len = m_end - m_start
                if m_len > best_len:
                    best_len = m_len
                    best_match = DetectedSpan(
                        category_id=category_id,
                        start=m_start,
                        end=m_end,
                        matched_text=m_text,
                    )

        if best_match:
            # Setting phrase / clause expansion for location and environment
            if category_id in ("location", "room_environment"):
                m_start = best_match.start
                m_end = best_match.end
                sent_start = text.rfind("\n", 0, m_start)
                if sent_start == -1:
                    sent_start = text.rfind(".", 0, m_start)
                sent_start = 0 if sent_start == -1 else sent_start + 1
                while sent_start < m_start and text[sent_start] in " \t\r\n.,;":
                    sent_start += 1

                sent_end = text.find(".", m_end)
                if sent_end != -1 and sent_end - m_end < 200:
                    clause = text[sent_start:sent_end]
                    if any(w in clause.lower() for w in ("setting", "water", "sand", "background", "view", "trees", "sky", "interior", "atmosphere")):
                        return DetectedSpan(
                            category_id=category_id,
                            start=sent_start,
                            end=sent_end + 1,
                            matched_text=text[sent_start:sent_end + 1].strip(),
                        )
            return best_match

        # 2. Secondary: Robust Semantic Fallback patterns for free-form prompts
        fallback_patterns = {
            "age_range": r"\b\d{1,2}\s*(?:yo|y/o|years?\s*old|-year-old)\b|\b(?:early|mid|late)\s*(?:twenties|thirties|forties|fifties|sixties|20s|30s|40s|50s)\b",
            "body_figure": r"\b(?:curvy\s+thick|thick\s+curves?|curvaceous|voluptuous|hourglass|athletic|slender|slim|muscular|petite|statuesque|toned|chubby|plus-size|bbw)\b(?:\s*(?:build|figure|physique|frame|body|curves?|silhouette))?",
            "bust_size": r"\b(?:large\s+hanging\s+breasts|heavy\s+breasts|voluptuous\s+bust|busty|large\s+breasts|perky\s+breasts|ample\s+cleavage)\b",
            "female_clothing": r"\b(?:wearing\s+only|wearing|dressed\s+in|clad\s+in)\s+(?:only\s+)?(?:[\w\s-]+ )?(?:high heels|heels|dress|skirt|babydoll|lingerie|bikini|swimsuit|robe|pumps)\b|\b(?:completely naked|fully nude)\b",
            "male_clothing": r"\b(?:wearing|dressed\s+in|clad\s+in)\s+(?:a |an )?(?:[\w\s-]+ )?(?:jeans|pants|trousers|suit|shirt|jacket|boxers|sweatpants)\b|\bshirtless\b",
            "clothing": r"\b(?:wearing|dressed\s+in|clad\s+in)\s+(?:only\s+)?(?:[\w\s-]+ )?(?:blazer|sweater|jacket|dress|shirt|suit|hoodie|coat|panties|lingerie|bra|underwear|top|pants|trousers|skirt|jeans|swimsuit|bikini|heels|boots)\b",
            "location": r"\b(?:[\w-]+\s+){0,3}(?:beach|coastline|shore|bedroom|living room|apartment|hotel room|hotel suite|loft|penthouse|cabin|cottage|library|study|art gallery|gallery|studio|greenhouse|terrace|balcony|rooftop|alleyway|street|cafe|restaurant|bar|speakeasy|dungeon|sauna|bathhouse|onsen|pool|poolside|garden|forest|woods|courtyard|kitchen|bathroom)(?:\s+(?:setting|scene|interior|atmosphere|environment))?(?:\s+with\s+[^,.;\n]+)?\b",
            "camera_angle": r"\b(?:strict front-facing|front-facing|straight angle shot|straight-on angle|low-angle|high-angle|eye-level|dutch angle|top-down|overhead)\b(?:\s*(?:shot|angle|view))?",
            "lens_focal": r"\b(?:Photo shot on\s+)?(?:ultra-wide-angle\s+)?(?:\d{2,3}mm\s+(?:f/[\d.]+\s+)?(?:GM|prime|lens)?|16mm lens|24mm lens|35mm lens|50mm lens|85mm lens|105mm lens|135mm lens)\b",
            "hair_color": r"\b(?:platinum blonde|golden honey-blonde|golden blonde|honey blonde|sun-bleached blonde|dirty blonde|strawberry blonde|champagne blonde|ice blonde|bleached blonde|Swedish ice-blonde|bleached white-blonde|blonde|dark brunette|chestnut brown|chocolate brown|copper red|fiery copper-red|vibrant Irish ginger|ginger|auburn|crimson auburn|bright fiery red|ash-brown|ash brown|silver-white|silver-gray|silver gray|icy titanium silver|deep raven-black|jet-black|jet black|raven black|brunette|redhead)\b|\b(black|brown|dark brown|red|white|gray|silver)\b(?=(?:[\s,]+(?:waist-length|shoulder-length|medium-length|mid-back|short|long|cropped|flowing|voluminous|buzzcut|pixie|bob|layered|messy|tousled|wavy|straight|curly|coily|silky|textured|loose|natural))*[\s,]+(?:hair|curls|locks|tresses|ponytail|braid|bangs|updo|cut|bob)\b)|\b(?:with|has|hair is)\s+(black|brown|dark brown|red|white|gray|silver)\b(?=[\s,]+(?:short|long|wavy|straight|curly)\b)|\b(black|brown|dark brown|red|white|gray|silver)\s+(?:hair|curls|locks|tresses)\b|\b(black|brown|dark brown|red|white|gray|silver)\b(?=[\s,]+(?:short|long|wavy|straight|curly)\b)",
            "hair_length": r"\b(waist-length|elbow-length|shoulder-length|chin-length|mid-back length|mid-back|knee-length|pixie-length|buzz-cut|closely cropped short|short cropped|medium-length|medium length|very long)\b|\b(long|short|cropped)\b(?=(?:[\s,]+(?:platinum blonde|golden honey-blonde|golden blonde|honey blonde|strawberry blonde|dirty blonde|blonde|dark brunette|chestnut brown|chocolate brown|copper red|ginger|auburn|ash brown|silver gray|black|brown|red|white|gray|silver|brunette|redhead|wavy|straight|curly|coily|silky|textured|loose|natural|messy|tousled))*[\s,]+(?:hair|curls|locks|tresses|ponytail|braid|bangs|updo|cut|bob)\b)|\b(?:platinum blonde|golden blonde|honey blonde|blonde|brunette|black|brown|red|ginger|silver|gray|white)[\s,]+(long|short|cropped)\b|\b(long|short|cropped)\b(?=[\s,]+(?:wavy|straight|curly|coily|silky|textured|blonde|brunette|black|brown|red|ginger)\b)|\b(long|short|cropped)\s+hair\b",
            "hair_type": r"\b(sleek straight|straight|beach waves|loose waves|gentle waves|wavy|bouncy curls|ringlets|curly|coily|kinky|afro-textured|afro|tousled|messy|silky|textured)\b",
            "hair_style": r"\b(pixie cut|pixie|blunt bob|french bob|bob cut|bob|high ponytail|ponytail|messy bun|topknot|chignon|bun|french braid|dutch braid|box braids|cornrows|dreadlocks|dreads|braids|braid|curtain bangs|blunt bangs|bangs|layered cut|wolf cut|shag cut|layered hair|undercut|buzz cut|updo)\b",
            "hair": r"\b(?:(?:waist-length|shoulder-length|medium-length|mid-back length|mid-back|elbow-length|chin-length|pixie-length|buzz-cut|very long|medium length|closely cropped short|short cropped|long|short|cropped|flowing|voluminous|layered|messy|tousled|wavy|straight|curly|coily|silky|textured|loose|natural|sleek straight|beach waves|platinum blonde|golden honey-blonde|golden blonde|honey blonde|sun-bleached blonde|dirty blonde|strawberry blonde|champagne blonde|ice blonde|bleached blonde|Swedish ice-blonde|bleached white-blonde|blonde|dark brunette|chestnut brown|chocolate brown|copper red|fiery copper-red|vibrant Irish ginger|ginger|auburn|crimson auburn|bright fiery red|ash-brown|ash brown|silver-white|silver-gray|silver gray|icy titanium silver|deep raven-black|jet-black|jet black|raven black|brunette|redhead|black|dark brown|brown|red|silver|gray|white)[\s,]+)*(?:hair|curls|locks|tresses|ponytail|braid|bangs|updo|cut|bob)\b|\b(?:hair|curls|locks|tresses)\b",
            "skin_complexion": r"\b(?:natural skin sheen|fabric-free skin textures?|porcelain skin|bronze skin|tanned skin|pale skin|olive skin|dewy skin)\b",
            "makeup": r"\b(?:full makeup|no-makeup look|natural makeup|smoky eye|bold red lip|winged eyeliner|glam makeup)\b",
            "expression": r"\b(?:moaning expression|parted lips, eyes half-closed|seductive look|ecstatic expression|alluring gaze|sensual smile)\b",
        }

        fb_regex = fallback_patterns.get(category_id)
        if fb_regex:
            pat = re.compile(fb_regex, re.IGNORECASE)
            for match in pat.finditer(text):
                m_start = match.start()
                m_end = match.end()
                m_text = match.group(0)
                if match.lastindex is not None:
                    for g in range(1, match.lastindex + 1):
                        if match.group(g):
                            m_start = match.start(g)
                            m_end = match.end(g)
                            m_text = match.group(g)
                            break
                m_len = m_end - m_start
                if m_len > best_len:
                    best_len = m_len
                    best_match = DetectedSpan(
                        category_id=category_id,
                        start=m_start,
                        end=m_end,
                        matched_text=m_text,
                    )

        return best_match


# Contradiction / Conflict Mapping
CONFLICTING_TAGS: Dict[str, Set[str]] = {
    "day": {"night", "midnight", "dusk", "evening", "darkness", "neon_night"},
    "night": {"day", "daytime", "sunlight", "golden_hour", "morning", "bright_day", "midday", "sunbeam", "bright_sun"},
    "indoor": {"outdoor", "street", "forest", "beach", "sky", "exterior", "rooftop", "park", "garden", "mountains", "nature", "coastal"},
    "outdoor": {"indoor", "bedroom", "living_room", "bathroom", "kitchen", "studio", "library", "loft", "sauna"},
    "beach": {"indoor", "bedroom", "living_room", "bathroom", "kitchen", "studio", "library", "loft", "sauna"},
    "dark": {"bright_day", "sunlight", "golden_hour", "bright_sun"},
    "bright": {"dark", "night", "midnight", "moody_dark"},
}


def extract_context_tags(text: str) -> Set[str]:
    """Scans prompt text to identify active environmental and lighting conditions."""
    tags = set()
    t = text.lower()
    if re.search(r"\b(night|midnight|evening|darkness|late night)\b", t):
        tags.add("night")
    if re.search(r"\b(day|daytime|sunlight|sun|morning|midday|afternoon|golden hour)\b", t):
        tags.add("day")
    if re.search(r"\b(bedroom|living room|indoor|inside|room|kitchen|bathroom|studio|bed|couch|library|sauna|loft|penthouse)\b", t):
        tags.add("indoor")
    if re.search(r"\b(outdoor|outside|street|beach|forest|park|rooftop|garden|sky|coastline|waves|ocean)\b", t):
        tags.add("outdoor")
    if re.search(r"\b(beach|sand|coastline|waves|ocean|seashore)\b", t):
        tags.add("beach")
    return tags


# =====================================================================
# 3. INTIMACY & SMART CLOTHING ADAPTATION
# =====================================================================

def is_intimate_prompt(text: str) -> bool:
    """Detects whether prompt involves active sexual contact, penetration, or exposed intimate anatomy."""
    t = text.lower()
    return bool(re.search(
        r"\b(penis|vagina|penetrat\w*|buried deep|spread legs|clitoris|testicles|cock|dick|pussy|thrust\w*|intercourse|creampie|fellatio|cunnilingus|oral sex|doggystyle|missionary|fabric-free|unclothed|bare skin)\b",
        t
    ))


def adapt_clothing_for_intimacy(text: str, is_female: bool = False, is_male: bool = False) -> str:
    """Adapts clothing descriptions so lower body garments do not visually conflict/clip with exposed genitalia."""
    t_lower = text.lower()
    if any(k in t_lower for k in ("unzipped", "unbuttoned", "hitched up", "pulled up", "pulled down", "nude", "naked", "only heels", "only shoes", "barefoot", "topless")):
        return text

    if re.search(r"\b(jeans|pants|trousers|shorts|boxers|sweatpants)\b", t_lower):
        if is_male:
            return re.sub(r"\b(jeans|pants|trousers|shorts|sweatpants)\b", r"\1 unbuttoned and pushed down past his thighs", text, count=1, flags=re.IGNORECASE)
        elif is_female:
            return re.sub(r"\b(jeans|pants|trousers|shorts)\b", r"\1 unbuttoned and pulled down to the knees", text, count=1, flags=re.IGNORECASE)
        else:
            return re.sub(r"\b(jeans|pants|trousers|shorts)\b", r"\1 unfastened and pulled down low", text, count=1, flags=re.IGNORECASE)

    if re.search(r"\b(dress|skirt|robe|gown|sundress)\b", t_lower):
        return re.sub(r"\b(dress|skirt|robe|gown|sundress)\b", r"\1 hitched up high around the waist", text, count=1, flags=re.IGNORECASE)

    if re.search(r"\b(panties|underwear|thong|lingerie(?:\s+set)?)\b", t_lower):
        return re.sub(r"\b(panties|underwear|thong|lingerie(?:\s+set)?)\b", r"\1 pulled to the side", text, count=1, flags=re.IGNORECASE)

    return text


def clean_environmental_contradictions(text: str, active_tags: Set[str]) -> str:
    """Removes or adapts environmental remnants (e.g. sand, waves, palm trees, bathtubs) when switching environments."""
    res = text
    # If current scene is indoor:
    if "indoor" in active_tags:
        # Strip residual outdoor ocean / beach background sentences or clauses if any remain
        res = re.sub(r",?\s*(?:with\s+)?clear turquoise water in the background(?:, white sand, gentle waves, distant palm trees and blue sky)?", "", res, flags=re.IGNORECASE)
        res = re.sub(r",?\s*(?:with\s+)?soft golden sunlight, clear turquoise water[^\.,;\n]*", "", res, flags=re.IGNORECASE)
        res = re.sub(r",?\s*(?:distant palm trees and blue sky|gentle waves|white sand)", "", res, flags=re.IGNORECASE)
        # Adapt pose/action references to sand
        res = re.sub(r"\b(?:in|on|into)\s+the\s+sand\b", "on the floor", res, flags=re.IGNORECASE)
        res = re.sub(r"\btouching\s+the\s+sand\b", "touching the floor", res, flags=re.IGNORECASE)
        res = re.sub(r"\bplanted\s+wide\s+(?:in|on)\s+the\s+sand\b", "planted wide on the floor", res, flags=re.IGNORECASE)
    # If current scene is beach/outdoor:
    elif "beach" in active_tags or "outdoor" in active_tags:
        # Adapt floor references to sand
        res = re.sub(r"\b(in|on|into)\s+the\s+floor\b", r"\1 the sand", res, flags=re.IGNORECASE)
        res = re.sub(r"\btouching\s+the\s+floor\b", "touching the sand", res, flags=re.IGNORECASE)
        res = re.sub(r"\bplanted\s+wide\s+on\s+the\s+floor\b", "planted wide in the sand", res, flags=re.IGNORECASE)
        # Strip indoor fixtures
        res = re.sub(r",?\s*(?:freestanding soaking tub|mahogany bookshelves|plush leather armchairs)", "", res, flags=re.IGNORECASE)

    return res


# =====================================================================
# 4. VARIATION SELECTOR (SHUFFLE-BAG & CONSTRAINTS)
# =====================================================================

class VariationSelector:
    def __init__(self, db: DatabaseLoader):
        self.db = db
        # Bags keyed by (node_id, category_id, constraint_key)
        self._bags: Dict[str, List[Dict[str, Any]]] = {}
        # History of recent combinations per node
        self._history: Dict[str, List[Set[str]]] = {}
        # Track last chosen item per bag key to prevent consecutive repeats across bag refills
        self._last_chosen: Dict[str, str] = {}
        self._lock = threading.Lock()

    def reset(self, node_id: Optional[str] = None):
        """Clears shuffle bag state for a node, or all nodes if None."""
        with self._lock:
            if node_id is None:
                self._bags.clear()
                self._history.clear()
                self._last_chosen.clear()
            else:
                prefix = f"{node_id}:"
                keys_to_remove = [k for k in self._bags if k.startswith(prefix)]
                for k in keys_to_remove:
                    del self._bags[k]
                keys_to_remove_last = [k for k in self._last_chosen if k.startswith(prefix)]
                for k in keys_to_remove_last:
                    del self._last_chosen[k]
                self._history.pop(node_id, None)

    def select(
        self,
        node_id: str,
        category_id: str,
        options: Optional[Dict[str, Any]] = None,
        rng: Optional[random.Random] = None,
        seed: Optional[int] = None,
        active_tags: Optional[Set[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Picks a variation using a non-repeating shuffle-bag strategy with contradiction prevention."""
        cat = self.db.get_category(category_id)
        if not cat:
            return None

        entries = cat.get("entries", [])
        if not entries:
            return None

        # Filter by options/constraints (e.g., age preset)
        selected_preset = None
        if options and isinstance(options, dict):
            selected_preset = options.get("preset") or options.get(category_id)

        filtered_entries = entries
        if selected_preset and selected_preset != "any":
            matched = [
                e for e in entries
                if e.get("constraints", {}).get("preset") == selected_preset
                or selected_preset in e.get("tags", [])
            ]
            if matched:
                filtered_entries = matched

        # Filter out entries that conflict with active context tags (e.g. night vs bright daytime sun)
        if active_tags:
            forbidden_tags = set()
            for t in active_tags:
                forbidden_tags.update(CONFLICTING_TAGS.get(t, set()))

            if forbidden_tags:
                compatible = [
                    e for e in filtered_entries
                    if not (set(e.get("tags", [])) & forbidden_tags)
                ]
                if compatible:
                    filtered_entries = compatible

        # 1. Deterministic mode: When seed is provided (non-zero), select independently per category
        if seed is not None and seed != 0:
            h = hashlib.sha256(f"{seed}:{node_id}:{category_id}:{selected_preset or 'default'}".encode("utf-8")).digest()
            cat_seed = int.from_bytes(h[:8], "big")
            cat_rng = random.Random(cat_seed)
            return cat_rng.choice(filtered_entries)

        # 2. Explicit RNG passed (e.g., frontend preview)
        if rng is not None:
            return rng.choice(filtered_entries)

        # 3. Unseeded / seed=0: Stateful non-repeating shuffle-bag
        bag_key = f"{node_id}:{category_id}:{selected_preset or 'default'}"

        with self._lock:
            bag = self._bags.get(bag_key)
            if not bag:
                bag = list(filtered_entries)
                random.shuffle(bag)
                # Avoid consecutive repeat with previous item when refilling
                last = self._last_chosen.get(bag_key)
                if last and len(bag) > 1 and bag[0].get("text") == last:
                    bag[0], bag[1] = bag[1], bag[0]
                self._bags[bag_key] = bag

            chosen = bag.pop(0) if bag else random.choice(filtered_entries)
            if chosen and isinstance(chosen, dict):
                self._last_chosen[bag_key] = chosen.get("text", "")
            return chosen


# Global selector instance
_VARIATION_SELECTOR = VariationSelector(_DB_LOADER)

def get_variation_selector() -> VariationSelector:
    return _VARIATION_SELECTOR


# =====================================================================
# 5. PROMPT REWRITER & CONTEXTUAL INSERTION
# =====================================================================

class PromptRewriter:
    @staticmethod
    def clean_text(text: str) -> str:
        """Cleans duplicate commas, extra whitespace, and dangling punctuation."""
        if not text:
            return ""
        # Remove repeated commas
        t = re.sub(r",\s*,+", ", ", text)
        # Normalize mixed punctuation (period followed by comma -> comma or single period)
        t = re.sub(r"\.\s*,+", ". ", t)
        t = re.sub(r",\s*\.+", ".", t)
        t = re.sub(r",\s*;", ";", t)
        t = re.sub(r";\s*,", ";", t)
        # Normalize spacing around punctuation
        t = re.sub(r"\s+([,.;])", r"\1", t)
        t = re.sub(r"([,.;])([^\s\d\n])", r"\1 \2", t)
        # Collapse multiple spaces (preserve single newlines)
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n\s+", "\n", t)
        # Strip leading/trailing commas and whitespace
        t = t.strip(" \t\n\r,")
        return t

    @classmethod
    def replace_span(
        cls,
        text: str,
        span: DetectedSpan,
        replacement: str,
        category_id: str,
        db: DatabaseLoader,
    ) -> str:
        """Replaces a detected semantic span and runs cleanup regexes."""
        before = text[:span.start]
        after = text[span.end:]
        rep = replacement.strip()

        # Ensure proper spacing around replacement if adjacent to words
        if before and before[-1].isalnum() and rep and rep[0].isalnum():
            rep = " " + rep
        if after and after[0].isalnum() and rep and rep[-1].isalnum():
            rep = rep + " "

        result = f"{before}{rep}{after}"
        return cls.clean_text(result)

    @classmethod
    def insert_category(
        cls,
        text: str,
        category_id: str,
        insertion_text: str,
        db: DatabaseLoader,
    ) -> str:
        """Intelligently weaves an attribute into the prompt based on semantic zone."""
        cat = db.get_category(category_id)
        zone = cat.get("insertion_zone", "subject") if cat else "subject"

        if not text.strip():
            return insertion_text

        clean_base = text.rstrip(" .;,")
        ins = insertion_text.strip()

        female_person_pat = re.compile(r"\b(woman|girl|lady|female)\b", re.IGNORECASE)
        male_person_pat = re.compile(r"\b(man|guy|gentleman|male)\b", re.IGNORECASE)
        general_person_pat = re.compile(r"\b(woman|man|person|girl|guy|lady|gentleman|model|figure|female|male)\b", re.IGNORECASE)
        pose_pat = re.compile(r"\b(lying on|sitting on|standing on|kneeling on|leaning against|walking|posing|reclining|laying on|resting on)\b[^\,;\.]*", re.IGNORECASE)
        env_prep_pat = re.compile(r"\b(in a|in an|in the|inside a|inside an|inside the|at a|at an|at the|on a|on the)\b", re.IGNORECASE)
        cam_pat = re.compile(r"\b(shot on|close-up|pov|top-down|wide angle|portrait shot|cinematic shot|35mm|50mm|85mm|f/\d\.\d)\b", re.IGNORECASE)

        # 1. Subject-specific female clothing
        if zone == "female_clothing":
            fm = re.search(r"\b(?:a\s+woman|the\s+woman|she)\s+(?:is|stands|wearing|looks)?\b|\b(?:woman|girl|lady|female)\b(?!'s)", text, re.IGNORECASE)
            if fm:
                comma_idx = text.find(",", fm.end())
                insert_pos = (comma_idx + 1) if (comma_idx != -1 and comma_idx - fm.end() < 40) else fm.end()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
            return cls.clean_text(f"{clean_base}, {ins}")

        # 2. Subject-specific male clothing
        if zone == "male_clothing":
            mm = re.search(r"\b(?:a\s+man|the\s+man|he)\s+(?:stands|is|holds|firmly|wearing|looks)?\b|\b(?:man|guy|gentleman)\b(?!'s)", text, re.IGNORECASE)
            if mm:
                comma_idx = text.find(",", mm.end())
                insert_pos = (comma_idx + 1) if (comma_idx != -1 and comma_idx - mm.end() < 40) else mm.end()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
            return cls.clean_text(f"{clean_base}, {ins}")

        # 3. General Subject Traits (hair, skin, age, body figure)
        if zone == "subject":
            person_match = general_person_pat.search(text)
            if person_match:
                pose_match = pose_pat.search(text, person_match.end())
                if pose_match and pose_match.start() - person_match.end() < 25:
                    insert_pos = pose_match.end()
                    return cls.clean_text(f"{text[:insert_pos]}, {ins},{text[insert_pos:]}")
                else:
                    comma_idx = text.find(",", person_match.end())
                    if comma_idx != -1 and comma_idx - person_match.end() < 30:
                        insert_pos = comma_idx + 1
                        return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
                    else:
                        insert_pos = person_match.end()
                        return cls.clean_text(f"{text[:insert_pos]}, {ins},{text[insert_pos:]}")
            else:
                env_match = env_prep_pat.search(text)
                if env_match and env_match.start() > 10:
                    prev_comma = text.rfind(",", 0, env_match.start())
                    insert_pos = (prev_comma + 1) if prev_comma != -1 else env_match.start()
                    return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
                return cls.clean_text(f"{clean_base}, {ins}")

        # 4. General Clothing
        elif zone == "clothing":
            env_match = env_prep_pat.search(text)
            if env_match and env_match.start() > 10:
                prev_comma = text.rfind(",", 0, env_match.start())
                insert_pos = (prev_comma + 1) if prev_comma != -1 else env_match.start()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")

            person_match = general_person_pat.search(text)
            if person_match:
                pose_match = pose_pat.search(text, person_match.end())
                insert_pos = pose_match.end() if (pose_match and pose_match.start() - person_match.end() < 25) else person_match.end()
                return cls.clean_text(f"{text[:insert_pos]}, {ins},{text[insert_pos:]}")

            return cls.clean_text(f"{clean_base}, {ins}")

        # 5. Environment & Location
        elif zone == "environment":
            cam_match = cam_pat.search(text)
            if cam_match and cam_match.start() > 15:
                prev_comma = text.rfind(",", 0, cam_match.start())
                insert_pos = (prev_comma + 1) if prev_comma != -1 else cam_match.start()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
            return cls.clean_text(f"{clean_base}, {ins}")

        # 6. Lighting & Atmosphere
        elif zone in ("lighting", "atmosphere"):
            cam_match = cam_pat.search(text)
            if cam_match and cam_match.start() > 20:
                prev_comma = text.rfind(",", 0, cam_match.start())
                insert_pos = (prev_comma + 1) if prev_comma != -1 else cam_match.start()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
            return cls.clean_text(f"{clean_base}, {ins}")

        # 7. Camera Optics
        elif zone == "camera":
            return cls.clean_text(f"{clean_base}, {ins}")

        # Fallback
        return cls.clean_text(f"{clean_base}, {ins}")


# =====================================================================
# 6. RANDOMIZER PIPELINE (ORCHESTRATOR)
# =====================================================================

class DSRandomizerPipeline:
    def __init__(self, db: Optional[DatabaseLoader] = None, selector: Optional[VariationSelector] = None):
        self.db = db or get_db_loader()
        self.selector = selector or get_variation_selector()

    def process(
        self,
        prompt: str,
        enabled_categories: List[str],
        category_options: Optional[Dict[str, Any]] = None,
        node_id: str = "default_node",
        seed: Optional[int] = None,
    ) -> str:
        """
        Executes the full semantic prompt variation process:
        1. Analyzes prompt for enabled categories.
        2. Detects existing attributes to replace.
        3. Intelligently inserts missing attributes into natural semantic zones.
        4. Adapts clothing to prevent genitalia clipping in intimate scenes.
        5. Eliminates environmental contradictions (e.g. beach sand in a library).
        """
        if not prompt or not isinstance(prompt, str):
            prompt = ""
        if not enabled_categories:
            return prompt

        rng = random.Random(seed) if seed is not None and seed != 0 else None
        category_options = category_options or {}
        working_prompt = prompt.strip()
        active_tags = extract_context_tags(working_prompt)
        intimate_scene = is_intimate_prompt(working_prompt)

        # Separate into replace vs insert categories, prioritizing granular attributes
        GRANULAR_PRIORITY = {
            "hair_color": 1,
            "hair_length": 2,
            "hair_type": 3,
            "hair_style": 4,
            "clothing_color": 5,
            "top": 6,
            "bottom": 7,
            "footwear": 8,
            "clothing_accessories": 9,
            "hair": 20,
            "clothing": 21,
            "female_clothing": 22,
            "male_clothing": 23,
        }

        # Suppress composite 'hair' when granular hair attributes are active to prevent clashing/overwriting traits
        granular_hair = {"hair_color", "hair_length", "hair_type", "hair_style"}
        active_cats = list(enabled_categories)
        if any(c in active_cats for c in granular_hair) and "hair" in active_cats:
            active_cats = [c for c in active_cats if c != "hair"]

        # Suppress generic 'clothing' when specific clothing categories are active
        granular_clothing = {"female_clothing", "male_clothing", "top", "bottom"}
        if any(c in active_cats for c in granular_clothing) and "clothing" in active_cats:
            active_cats = [c for c in active_cats if c != "clothing"]

        sorted_categories = sorted(active_cats, key=lambda c: GRANULAR_PRIORITY.get(c, 50))

        to_replace: List[Tuple[str, DetectedSpan]] = []
        to_insert: List[str] = []

        for cat_id in sorted_categories:
            cat = self.db.get_category(cat_id)
            if not cat:
                continue

            span = CategoryDetector.detect_category(working_prompt, cat_id, self.db)
            if span:
                to_replace.append((cat_id, span))
            else:
                to_insert.append(cat_id)

        # 1. Perform replacements
        for cat_id, initial_span in to_replace:
            try:
                current_span = CategoryDetector.detect_category(working_prompt, cat_id, self.db)
                if not current_span:
                    continue

                # Decouple location selection from stale scene environment tags being replaced
                tags_for_sel = set(active_tags)
                if cat_id in ("location", "room_environment"):
                    tags_for_sel.difference_update({"indoor", "outdoor", "beach", "coastal", "nature"})

                chosen_entry = self.selector.select(
                    node_id=node_id,
                    category_id=cat_id,
                    options=category_options.get(cat_id) or category_options,
                    rng=rng,
                    seed=seed,
                    active_tags=tags_for_sel,
                )
                if not chosen_entry or "text" not in chosen_entry:
                    continue

                chosen_text = chosen_entry["text"]
                # Adapt clothing if intimate scene to avoid clipping through genitals
                if intimate_scene and cat_id in ("clothing", "female_clothing", "male_clothing", "footwear", "top", "bottom"):
                    is_f = cat_id == "female_clothing"
                    is_m = cat_id == "male_clothing"
                    chosen_text = adapt_clothing_for_intimacy(chosen_text, is_female=is_f, is_male=is_m)

                new_tags = set(chosen_entry.get("tags", []))
                if cat_id in ("location", "room_environment"):
                    if "indoor" in new_tags:
                        active_tags.difference_update({"outdoor", "beach", "coastal", "nature"})
                    elif "outdoor" in new_tags:
                        active_tags.difference_update({"indoor"})
                active_tags.update(new_tags)

                working_prompt = PromptRewriter.replace_span(
                    working_prompt,
                    current_span,
                    chosen_text,
                    cat_id,
                    self.db,
                )
            except Exception as e:
                logger.error(f"[DS Randomizer] Failed replacement for '{cat_id}': {e}")

        # 2. Perform insertions
        for cat_id in to_insert:
            try:
                tags_for_sel = set(active_tags)
                if cat_id in ("location", "room_environment"):
                    tags_for_sel.difference_update({"indoor", "outdoor", "beach", "coastal", "nature"})

                chosen_entry = self.selector.select(
                    node_id=node_id,
                    category_id=cat_id,
                    options=category_options.get(cat_id) or category_options,
                    rng=rng,
                    seed=seed,
                    active_tags=tags_for_sel,
                )
                if not chosen_entry or "text" not in chosen_entry:
                    continue

                chosen_text = chosen_entry["text"]
                # Adapt clothing if intimate scene to avoid clipping through genitals
                if intimate_scene and cat_id in ("clothing", "female_clothing", "male_clothing", "footwear", "top", "bottom"):
                    is_f = cat_id == "female_clothing"
                    is_m = cat_id == "male_clothing"
                    chosen_text = adapt_clothing_for_intimacy(chosen_text, is_female=is_f, is_male=is_m)

                # Format hair traits naturally when inserted into prompts lacking "hair"
                if cat_id in ("hair_color", "hair_length", "hair_type") and "hair" not in working_prompt.lower() and "hair" not in chosen_text.lower():
                    chosen_text = f"{chosen_text} hair"

                new_tags = set(chosen_entry.get("tags", []))
                if cat_id in ("location", "room_environment"):
                    if "indoor" in new_tags:
                        active_tags.difference_update({"outdoor", "beach", "coastal", "nature"})
                    elif "outdoor" in new_tags:
                        active_tags.difference_update({"indoor"})
                active_tags.update(new_tags)

                working_prompt = PromptRewriter.insert_category(
                    working_prompt,
                    cat_id,
                    chosen_text,
                    self.db,
                )
            except Exception as e:
                logger.error(f"[DS Randomizer] Failed insertion for '{cat_id}': {e}")

        # 3. Clean up environmental contradictions (e.g. beach sand on library floor)
        working_prompt = clean_environmental_contradictions(working_prompt, active_tags)

        return PromptRewriter.clean_text(working_prompt)


# Global pipeline instance
_PIPELINE = DSRandomizerPipeline()

def get_randomizer_pipeline() -> DSRandomizerPipeline:
    return _PIPELINE
