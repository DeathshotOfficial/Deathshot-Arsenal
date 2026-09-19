"""
DeathshotArsenal - DS Randomizer Engine
Semantic prompt variation and randomization engine.

Responsibilities:
1. DatabaseLoader: Loads, validates, and indexes modular JSON category files.
2. CategoryDetector: Detects existing semantic categories in input prompts.
3. VariationSelector: Stateful shuffle-bag selection with non-repetition and constraint filtering.
4. PromptRewriter: Replaces existing semantic spans or contextually inserts missing attributes.
5. CompatibilityResolver: Resolves conflicting descriptors (e.g., night vs sunny daytime).
"""

import os
import re
import json
import random
import logging
import threading
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
        if not patterns:
            return None

        best_match = None
        best_len = 0

        for pat in patterns:
            for match in pat.finditer(text):
                m_len = match.end() - match.start()
                if m_len > best_len:
                    best_len = m_len
                    best_match = DetectedSpan(
                        category_id=category_id,
                        start=match.start(),
                        end=match.end(),
                        matched_text=match.group(0),
                    )

        return best_match


# Contradiction / Conflict Mapping
CONFLICTING_TAGS: Dict[str, Set[str]] = {
    "day": {"night", "midnight", "dusk", "evening", "darkness", "neon_night"},
    "night": {"day", "daytime", "sunlight", "golden_hour", "morning", "bright_day", "midday", "sunbeam", "bright_sun"},
    "indoor": {"outdoor", "street", "forest", "beach", "sky", "exterior", "rooftop", "park", "garden", "mountains", "nature"},
    "outdoor": {"indoor", "bedroom", "living_room", "bathroom", "kitchen", "studio"},
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
    if re.search(r"\b(bedroom|living room|indoor|inside|room|kitchen|bathroom|studio|bed|couch)\b", t):
        tags.add("indoor")
    if re.search(r"\b(outdoor|outside|street|beach|forest|park|rooftop|garden|sky)\b", t):
        tags.add("outdoor")
    return tags


# =====================================================================
# 3. VARIATION SELECTOR (SHUFFLE-BAG & CONSTRAINTS)
# =====================================================================

class VariationSelector:
    def __init__(self, db: DatabaseLoader):
        self.db = db
        # Bags keyed by (node_id, category_id, constraint_key)
        self._bags: Dict[str, List[Dict[str, Any]]] = {}
        # History of recent combinations per node
        self._history: Dict[str, List[Set[str]]] = {}
        self._lock = threading.Lock()

    def reset(self, node_id: Optional[str] = None):
        """Clears shuffle bag state for a node, or all nodes if None."""
        with self._lock:
            if node_id is None:
                self._bags.clear()
                self._history.clear()
            else:
                prefix = f"{node_id}:"
                keys_to_remove = [k for k in self._bags if k.startswith(prefix)]
                for k in keys_to_remove:
                    del self._bags[k]
                self._history.pop(node_id, None)

    def select(
        self,
        node_id: str,
        category_id: str,
        options: Optional[Dict[str, Any]] = None,
        rng: Optional[random.Random] = None,
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

        bag_key = f"{node_id}:{category_id}:{selected_preset or 'default'}"

        with self._lock:
            bag = self._bags.get(bag_key)
            if not bag:
                # Refill bag with all eligible entries and shuffle
                bag = list(filtered_entries)
                if rng:
                    rng.shuffle(bag)
                else:
                    random.shuffle(bag)
                self._bags[bag_key] = bag

            # Filter remaining items in bag to eliminate any entry conflicting with current active tags
            if active_tags and bag:
                forbidden_tags = set()
                for t in active_tags:
                    forbidden_tags.update(CONFLICTING_TAGS.get(t, set()))
                if forbidden_tags:
                    found_idx = None
                    for idx, item in enumerate(bag):
                        if not (set(item.get("tags", [])) & forbidden_tags):
                            found_idx = idx
                            break
                    if found_idx is not None:
                        return bag.pop(found_idx)

            chosen = bag.pop(0) if bag else random.choice(filtered_entries)
            return chosen


# Global selector instance
_VARIATION_SELECTOR = VariationSelector(_DB_LOADER)

def get_variation_selector() -> VariationSelector:
    return _VARIATION_SELECTOR


# =====================================================================
# 4. PROMPT REWRITER & CONTEXTUAL INSERTION
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
        t = re.sub(r"\.\s*,+", ", ", t)
        t = re.sub(r",\s*\.+", ".", t)
        t = re.sub(r",\s*;", ";", t)
        t = re.sub(r";\s*,", ";", t)
        # Normalize spacing around punctuation
        t = re.sub(r"\s+([,.;])", r"\1", t)
        t = re.sub(r"([,.;])([^\s\d])", r"\1 \2", t)
        # Collapse multiple spaces
        t = re.sub(r"[ \t]+", " ", t)
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

        # Clean up obsolete adjective remnants from old description if patterns exist
        for cleanup_pat in db._compiled_cleanups.get(category_id, []):
            def _remove_stale(m):
                if m.group(0).strip().lower() in rep.lower():
                    return m.group(0)
                return ""
            result = cleanup_pat.sub(_remove_stale, result)

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

        # Specific person noun matcher (NEVER matches 'photo of' or 'shot of')
        person_pat = re.compile(
            r"\b(woman|man|person|girl|guy|lady|gentleman|model|figure|female|male)\b",
            re.IGNORECASE,
        )
        # Pose / action matcher
        pose_pat = re.compile(
            r"\b(lying on|sitting on|standing on|kneeling on|leaning against|walking|posing|reclining|laying on|resting on)\b[^\,;\.]*",
            re.IGNORECASE,
        )
        # Environment preposition matcher
        env_prep_pat = re.compile(
            r"\b(in a|in an|in the|inside a|inside an|inside the|at a|at an|at the|on a|on the)\b",
            re.IGNORECASE,
        )
        # Camera / technical shot matcher
        cam_pat = re.compile(
            r"\b(shot on|close-up|pov|top-down|wide angle|portrait shot|cinematic shot|35mm|50mm|85mm|f/\d\.\d)\b",
            re.IGNORECASE,
        )

        if zone == "subject":
            # Target: adjacent to person noun or right after pose clause
            person_match = person_pat.search(text)
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

        elif zone == "clothing":
            # Target: after subject/pose, before environment setting
            env_match = env_prep_pat.search(text)
            if env_match and env_match.start() > 10:
                prev_comma = text.rfind(",", 0, env_match.start())
                insert_pos = (prev_comma + 1) if prev_comma != -1 else env_match.start()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")

            person_match = person_pat.search(text)
            if person_match:
                pose_match = pose_pat.search(text, person_match.end())
                insert_pos = pose_match.end() if (pose_match and pose_match.start() - person_match.end() < 25) else person_match.end()
                return cls.clean_text(f"{text[:insert_pos]}, {ins},{text[insert_pos:]}")

            return cls.clean_text(f"{clean_base}, {ins}")

        elif zone == "environment":
            # Target: environment section (after subject/clothing, before lighting or camera)
            cam_match = cam_pat.search(text)
            if cam_match and cam_match.start() > 15:
                prev_comma = text.rfind(",", 0, cam_match.start())
                insert_pos = (prev_comma + 1) if prev_comma != -1 else cam_match.start()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
            return cls.clean_text(f"{clean_base}, {ins}")

        elif zone in ("lighting", "atmosphere"):
            # Target: near the end of prompt, right before camera specs or at the very end
            cam_match = cam_pat.search(text)
            if cam_match and cam_match.start() > 20:
                prev_comma = text.rfind(",", 0, cam_match.start())
                insert_pos = (prev_comma + 1) if prev_comma != -1 else cam_match.start()
                return cls.clean_text(f"{text[:insert_pos]} {ins},{text[insert_pos:]}")
            return cls.clean_text(f"{clean_base}, {ins}")

        elif zone == "camera":
            # Append camera descriptions cleanly at the end
            return cls.clean_text(f"{clean_base}, {ins}")

        # Fallback: append cleanly
        return cls.clean_text(f"{clean_base}, {ins}")


# =====================================================================
# 5. RANDOMIZER PIPELINE (ORCHESTRATOR)
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
        4. Cleans up formatting and avoids contradictions.
        """
        if not prompt or not isinstance(prompt, str):
            prompt = ""
        if not enabled_categories:
            return prompt

        rng = random.Random(seed) if seed is not None and seed != 0 else None
        category_options = category_options or {}
        working_prompt = prompt.strip()
        active_tags = extract_context_tags(working_prompt)

        # Separate into replace vs insert categories
        to_replace: List[Tuple[str, DetectedSpan]] = []
        to_insert: List[str] = []

        for cat_id in enabled_categories:
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
                    to_insert.append(cat_id)
                    continue

                chosen_entry = self.selector.select(
                    node_id=node_id,
                    category_id=cat_id,
                    options=category_options.get(cat_id) or category_options,
                    rng=rng,
                    active_tags=active_tags,
                )
                if not chosen_entry or "text" not in chosen_entry:
                    continue

                active_tags.update(chosen_entry.get("tags", []))

                working_prompt = PromptRewriter.replace_span(
                    working_prompt,
                    current_span,
                    chosen_entry["text"],
                    cat_id,
                    self.db,
                )
            except Exception as e:
                logger.error(f"[DS Randomizer] Failed replacement for '{cat_id}': {e}")

        # 2. Perform insertions
        for cat_id in to_insert:
            try:
                chosen_entry = self.selector.select(
                    node_id=node_id,
                    category_id=cat_id,
                    options=category_options.get(cat_id) or category_options,
                    rng=rng,
                    active_tags=active_tags,
                )
                if not chosen_entry or "text" not in chosen_entry:
                    continue

                active_tags.update(chosen_entry.get("tags", []))

                working_prompt = PromptRewriter.insert_category(
                    working_prompt,
                    cat_id,
                    chosen_entry["text"],
                    self.db,
                )
            except Exception as e:
                logger.error(f"[DS Randomizer] Failed insertion for '{cat_id}': {e}")

        return PromptRewriter.clean_text(working_prompt)


# Global pipeline instance
_PIPELINE = DSRandomizerPipeline()

def get_randomizer_pipeline() -> DSRandomizerPipeline:
    return _PIPELINE
