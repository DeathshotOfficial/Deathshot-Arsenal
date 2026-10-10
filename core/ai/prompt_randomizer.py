"""
Deathshot Arsenal - Centralized AI Core: Prompt Randomizer
Semantic, LLM-powered prompt variation engine.
Randomizes specifically targeted semantic categories using deep contextual
understanding rather than static dictionary lookups.

Updated with:
  Feature A - Variation Cache (10-batch, no repeats)
  Feature B - Contextual Coherence rules
"""

import logging
import re
from typing import Dict, Any, List, Optional, Tuple

from .llama_service import generate_text_completion, unload_model, kill_active_generation
from .model_scanner import list_builtin_models

logger = logging.getLogger("DeathshotArsenal.Core.AI.Randomizer")

# ---------------------------------------------------------------------------
# Base system prompt (unchanged from original)
# ---------------------------------------------------------------------------
RANDOMIZER_SYSTEM_PROMPT = """You are an elite prompt refinement and variation engine for advanced image/video generation models.
Your task is to rewrite a given prompt by randomizing ONLY the specifically requested semantic categories, while preserving all other elements of the prompt intact.

CRITICAL RULES:
0. ABSOLUTE MANDATORY DIRECTIVE - NO THINKING / NO CHAIN-OF-THOUGHT:
   - Thinking mode is STRICTLY DISABLED for all models.
   - DO NOT output "Thinking Process:", do NOT output <think> tags, and do NOT output analysis, planning, breakdowns, or internal reasoning steps.
   - Output ONLY the final edited prompt text directly. The very first character of your response MUST be the first character of the prompt.
1. SEMANTIC PHRASE RECOGNITION:
   - Understand complete descriptive phrases as single attributes. For example, if "hair" or "hair_color" is selected, the phrase "long wavy natural red hair" must be recognized in its entirety and replaced with a cohesive new hair description (e.g., "short messy lavender-tinted curls", "sleek raven-black straight bob", "waist-length braided neon turquoise hair").
2. TARGETED RANDOMIZATION ONLY:
   - Only modify, replace, or enhance parts of the prompt that directly belong to the SELECTED TARGET CATEGORIES.
   - Do NOT alter unselected elements (e.g., if "clothing" is NOT selected, keep "blue summer dress" exactly as-is; if "camera" is NOT selected, keep "cinematic 35mm photograph" exactly as-is).
3. CONTEXTUAL WEAVING OF MISSING ATTRIBUTES:
   - If a selected category is NOT present in the source prompt, naturally and seamlessly weave a vivid, fitting detail for that category into the prompt without disrupting the grammar or flow.
4. MAXIMUM CREATIVE DIVERSITY:
   - Use your extensive knowledge to introduce diverse, vivid, high-fidelity styles, materials, palettes, lighting scenarios, and environments beyond standard basic dictionaries.
5. CLEAN, RAW OUTPUT:
   - Return ONLY the final modified prompt text.
   - Absolutely NO conversational filler, NO intros ("Here is your prompt:"), NO explanations, NO quotes, and NO markdown code fences (```)."""

# ---------------------------------------------------------------------------
# Feature B: Contextual Coherence block (appended to system prompt when enabled)
# ---------------------------------------------------------------------------
_COHERENCE_BLOCK = """
COHERENCE RULES (apply silently - analysis must NOT appear in output):
Before choosing any value, mentally note what the base prompt implies: poses, relative heights, supporting surfaces, which body parts must be visible, camera angle, indoor/outdoor, time of day. Then make every chosen attribute fit that context.
- Location/surface: reason about height and support physics. If someone is lying on a raised surface and another person is standing beside them, the location must provide a surface at roughly hip height (bench, table, counter, stage, platform) - never the bare floor. Match the stated setting (airport = terminal furniture, gym = equipment, etc.).
- Clothing must form a plausible outfit: matching style, layers, and season. When the prompt requires something exposed or accessible, describe each garment's physical position (pulled aside, pushed up, unbuttoned, hiked up) so the action is visible with clothes on - never describe anatomy appearing through or over fabric. For SFW prompts use natural everyday clothing.
- Hairstyle should suit the pose and camera angle (e.g. loose hair on someone lying back tends to spread or pool).
- Footwear matches clothing, location, and activity. Accessories don't conflict with visible body parts or clothing.
- Lighting matches time of day and indoor/outdoor setting.
- If the prompt gives no setting for a category, choose freely. Never invent constraints that aren't implied.
- If cache avoidance and coherence conflict, prefer a different fitting value over an incoherent one."""

# ---------------------------------------------------------------------------
# Feature A: Trailer block that asks the LLM to report chosen values
# ---------------------------------------------------------------------------
_REPORT_BLOCK = """

CATEGORY REPORT (append after the prompt, on a new line, exactly as shown):
After writing the final prompt, output one blank line, then output a line for each randomized category in this exact format:
##CATVAL## category_id: chosen value
Example:
##CATVAL## hair_color: deep auburn
##CATVAL## location: marble counter
Do NOT include ##CATVAL## lines for categories you did not change. Keep each value short (2-6 words)."""

# ---------------------------------------------------------------------------
# Delimiter used to split the report block from the prompt
# ---------------------------------------------------------------------------
_CATVAL_PATTERN = re.compile(
    r"##CATVAL##\s*([a-z_]+)\s*:\s*(.+)", re.IGNORECASE
)


# ---------------------------------------------------------------------------
# Output cleaner (original logic, extended to strip the ##CATVAL## block)
# ---------------------------------------------------------------------------

def _clean_output_text(raw_text: str, system_prompt: str = "") -> str:
    """Cleans up conversational cruft, thinking processes, and formatting artifacts from LLM responses."""
    if not raw_text:
        return ""

    text = str(raw_text).strip()

    # 1. XML / HTML style thinking and thought tags
    text = re.sub(r"<think>[\s\S]*?(?:</think>|$)", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<thought>[\s\S]*?(?:</thought>|$)", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<reasoning>[\s\S]*?(?:</reasoning>|$)", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<analysis>[\s\S]*?(?:</analysis>|$)", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<\|channel\>thought[\s\S]*?(?:<channel\|>|$)", "", text, flags=re.IGNORECASE).strip()

    # 1a. Strip any stray or orphan open/close think tags
    text = re.sub(r"</?(?:think|thought|reasoning|analysis)>", "", text, flags=re.IGNORECASE).strip()

    # 2. If output has a transition from Thinking Process to Final Prompt, extract the final prompt
    final_prompt_match = re.search(
        r"(?mi)^\s*(?:(?:\*+|_+)|\#+\s*)?(?:Drafting the Final Prompt|Final Prompt|Rewritten Prompt|Modified Prompt|Generated Prompt|Final Output|Prompt|Output)\s*:?(?:(?:\*+|_+)|\#*)?:?\s*\n*",
        text,
    )
    if final_prompt_match:
        pre_text = text[:final_prompt_match.start()]
        if re.search(r"(?i)(thinking|thought|analyze|analysis|breakdown|refinement plan|drafting|constraint)", pre_text):
            text = text[final_prompt_match.end():].strip()

    # 3. Block-level extraction: if text begins with Thinking/Thought/Reasoning Process or CoT analysis
    if re.match(r"(?i)^\s*(?:#+\s*)?(?:\*{0,2})?(?:Thinking|Thought|Reasoning)(?:\s+Process)?:?", text) or re.match(r"(?is)^\s*(?:\d+[\.]\s*)?(?:\*{0,2})?Analyze\s+(?:the\s+)?Request", text):
        blocks = re.split(r"\n\s*\n", text)
        non_cot_blocks = []
        in_cot = True
        for b in blocks:
            b_str = b.strip()
            if in_cot:
                if (
                    re.match(r"^(?:#+\s*)?(?:\*{0,2})?(?:Thinking|Thought|Reasoning)(?:\s+Process)?:?", b_str, re.IGNORECASE)
                    or re.match(r"^(?:\d+[\.)]|\*)?\s*\*\*(?:Analyze|Task|Role|Constraint|Drafting|Refinement|Step)", b_str, re.IGNORECASE)
                    or re.match(r"^(?:\d+[\.)]|\*)?\s*(?:Analyze|Task|Role|Constraint|Drafting|Refinement|Plan)", b_str, re.IGNORECASE)
                    or re.match(r"^\*{1,2}(?:Hair|Skin|Nationality|Eye|Paragraph|Section|Refinement|Drafting)", b_str, re.IGNORECASE)
                    or re.match(r"^\*\*(?:Analyze|Task|Constraint|Role|Refinement|Drafting)[\s\S]*\*\*:?", b_str, re.IGNORECASE)
                ):
                    continue
                in_cot = False
            non_cot_blocks.append(b_str)
        if non_cot_blocks:
            text = "\n\n".join(non_cot_blocks).strip()

    # 5. Line-by-line filter for remaining CoT steps or drafting bullets
    lines = text.splitlines()
    clean_lines = []
    skipping_cot = True
    for line in lines:
        s = line.strip()
        if skipping_cot:
            if (
                re.match(r"^(?:#+\s*)?(?:\*{0,2})?(?:Thinking Process|Thought Process|Reasoning Process|Refinement Plan|Source Text Breakdown|Drafting Replacements|Drafting the Final Prompt):?", s, re.IGNORECASE)
                or re.match(r"^\d+[\.]\s*\*\*(?:Analyze|Task|Role|Constraint|Drafting|Refinement|Step)[\s\S]*", s, re.IGNORECASE)
                or re.match(r"^\*\s*\*(?:Hair|Skin|Nationality|Eye|Paragraph|Section|Refinement|Drafting)[\s\S]*", s, re.IGNORECASE)
                or re.match(r"^\*\*(?:Analyze|Task|Constraint|Role|Refinement|Drafting)[\s\S]*\*\*:?", s, re.IGNORECASE)
                or re.match(r"^Here(?:'s| is) (?:a |the )?(?:thinking process|generated prompt|prompt)[\s\S]*?:?$", s, re.IGNORECASE)
                or re.match(r"^(?:Sure|Certainly|Here is the prompt)[^:\n]*:?$", s, re.IGNORECASE)
            ):
                continue
            p_draft_match = re.match(r"^\*Paragraph\s*\d+[^:]*:\*\s*[\"'](.*?)[\"'](?:\s*->\s*[\"']?(.*?)[\"']?)?$", s, re.IGNORECASE)
            if p_draft_match:
                clean_lines.append(p_draft_match.group(2) or p_draft_match.group(1))
                continue
            skipping_cot = False
        clean_lines.append(line)

    text = "\n".join(clean_lines).strip()

    # 6. Remove markdown code blocks if the model generated them
    text = re.sub(r"^`{3,}[a-zA-Z0-9_-]*\s*\n?", "", text).strip()
    text = re.sub(r"\n?`{3,}\s*$", "", text).strip()

    # 7. Remove conversational prefixes
    prefixes = [
        r"^here(?:'s| is) (?:your|the) (?:randomized |modified |new )?prompt:?\s*",
        r"^(?:randomized|modified) prompt:?\s*",
        r"^prompt:?\s*",
        r"^output:?\s*",
        r"^result:?\s*",
        r"^(?:note:?|summary:?)[^\n]*\n",
    ]
    for pattern in prefixes:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()

    # 8. Strip surrounding quotes
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        if len(text) > 2:
            text = text[1:-1].strip()

    # 9. Normalize double spaces or double commas
    text = re.sub(r"\s*,\s*,+", ",", text)
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text


def _split_prompt_and_report(raw_text: str) -> Tuple[str, Dict[str, str]]:
    """
    Extract and strip the ##CATVAL## report block from the raw LLM output.
    Returns (prompt_text, {category_id: chosen_value}).
    """
    chosen: Dict[str, str] = {}
    lines = raw_text.splitlines()
    prompt_lines = []
    for line in lines:
        m = _CATVAL_PATTERN.match(line.strip())
        if m:
            cat_id = m.group(1).strip().lower()
            val = m.group(2).strip()
            if cat_id and val:
                chosen[cat_id] = val
        else:
            prompt_lines.append(line)
    # Trim trailing blank lines from prompt
    while prompt_lines and not prompt_lines[-1].strip():
        prompt_lines.pop()
    return "\n".join(prompt_lines), chosen


def _parse_chosen_from_follow_up(raw_text: str) -> Dict[str, str]:
    """
    Parse chosen values from a follow-up extraction call.
    Accepts both ##CATVAL## format and plain 'category_id: value' lines.
    """
    chosen: Dict[str, str] = {}
    for line in raw_text.splitlines():
        s = line.strip()
        m = _CATVAL_PATTERN.match(s)
        if m:
            chosen[m.group(1).strip().lower()] = m.group(2).strip()
            continue
        plain = re.match(r"^([a-z_]{3,30})\s*:\s*(.+)$", s, re.IGNORECASE)
        if plain:
            chosen[plain.group(1).strip().lower()] = plain.group(2).strip()
    return chosen


# ---------------------------------------------------------------------------
# User instruction builder (original logic, extended with avoidance list and
# variety instruction from Feature A)
# ---------------------------------------------------------------------------

def build_user_instruction(
    prompt: str,
    enabled_categories: List[str],
    options: Optional[Dict[str, Any]] = None,
    avoidance: Optional[Dict[str, List[str]]] = None,
    use_cache: bool = True,
    use_report: bool = True,
) -> str:
    """Builds a structured prompt instructing the model what to randomize."""
    options = options or {}
    avoidance = avoidance or {}
    cats_str = ", ".join(enabled_categories) if enabled_categories else "general visual attributes"

    # Category hints / option constraints
    constraints = []
    if "age_range" in enabled_categories and options.get("age_range", {}).get("preset"):
        preset = options["age_range"]["preset"]
        if preset != "any":
            constraints.append(f"- Age range target: {preset.replace('_', ' ')}")

    # Feature A: inject avoidance list
    if use_cache and avoidance:
        avoid_lines = []
        for cat, vals in avoidance.items():
            if cat in enabled_categories and vals:
                val_list = ", ".join(f'"{v}"' for v in vals[:10])
                avoid_lines.append(f"  {cat}: already used - do NOT use: {val_list}")
        if avoid_lines:
            constraints.append(
                "VARIETY - These values were already used recently, choose something clearly different:\n"
                + "\n".join(avoid_lines)
            )
        constraints.append(
            "Deliberately spread across the full range of possibilities. "
            "Avoid defaulting to the most common or generic choices."
        )

    constraint_text = ("\nAdditional Constraints:\n" + "\n".join(constraints)) if constraints else ""

    # Report trailer (Feature A)
    report_suffix = _REPORT_BLOCK if use_report else ""

    if not prompt or not prompt.strip():
        return (
            f"Generate a creative, detailed image generation prompt focusing on: {cats_str}.\n"
            f"{constraint_text}\n"
            f"STRICT INSTRUCTION: Output the final raw prompt text directly. Do NOT think, analyze, or write 'Thinking Process:'."
            f"{report_suffix}"
        )

    return (
        f"SOURCE PROMPT:\n{prompt.strip()}\n\n"
        f"SELECTED CATEGORIES TO RANDOMIZE:\n{cats_str}\n"
        f"{constraint_text}\n"
        f"INSTRUCTION:\n"
        f"Rewrite the prompt by replacing descriptions belonging to [{cats_str}] in-place with fresh, creative alternatives. "
        f"Preserve all other parts of the source prompt exactly as they are.\n"
        f"CRITICAL: DO NOT OUTPUT ANY THINKING PROCESS OR ANALYSIS. Output ONLY the raw final rewritten prompt text directly with zero preamble."
        f"{report_suffix}"
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def randomize_prompt(
    prompt: str,
    enabled_categories: List[str],
    options: Optional[Dict[str, Any]] = None,
    ai_settings: Optional[Dict[str, Any]] = None,
    seed: Optional[int] = None,
    node_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Randomizes the requested prompt attributes using the centralized LLM engine.

    Extended with:
      Feature A - Variation Cache: inject avoidance lists, parse report block,
                  check for repeats with up to 2 retries, record successful run.
      Feature B - Contextual Coherence: append coherence rules to system prompt.
    """
    ai_settings = ai_settings or {}
    model_id = ai_settings.get("model") or ""

    if not model_id or model_id == "None":
        available = list_builtin_models()
        if not available:
            raise RuntimeError(
                "No GGUF models found! Place a GGUF model in ComfyUI/models/LLM or LM Studio."
            )
        model_id = available[0]["id"]

    temp = float(ai_settings.get("temperature", 0.80))
    max_tokens = int(ai_settings.get("max_tokens", 2048))
    context_length = int(ai_settings.get("context_length", 4096))
    n_gpu_layers = int(ai_settings.get("n_gpu_layers", -1))
    top_p = float(ai_settings.get("top_p", 0.90))
    top_k = int(ai_settings.get("top_k", 40))
    rep_penalty = float(ai_settings.get("repetition_penalty", 1.10))
    auto_unload = bool(ai_settings.get("auto_unload", True))

    # Seed handling
    should_randomize = bool(ai_settings.get("randomize_seed", True))
    if should_randomize:
        import random
        run_seed = random.randint(1, 2147483647)
    elif seed is not None and seed > 0:
        run_seed = seed
    elif int(ai_settings.get("seed", -1)) > 0:
        run_seed = int(ai_settings.get("seed", -1))
    else:
        import random
        run_seed = random.randint(1, 2147483647)

    # Feature A: variation cache settings
    use_variation_cache = bool(ai_settings.get("variation_cache", True))
    cache_size = int(ai_settings.get("cache_size", 10))

    # Feature B: contextual coherence toggle
    use_coherence = bool(ai_settings.get("contextual_coherence", True))

    # ---------------------------------------------------------------------------
    # Build system prompt
    # ---------------------------------------------------------------------------
    custom_sys = str(ai_settings.get("system_prompt") or "").strip()
    system_prompt = custom_sys if custom_sys else RANDOMIZER_SYSTEM_PROMPT

    # Feature B: append coherence block
    if use_coherence:
        system_prompt = system_prompt + _COHERENCE_BLOCK

    # ---------------------------------------------------------------------------
    # Feature A: fetch avoidance list for this node
    # ---------------------------------------------------------------------------
    avoidance: Dict[str, List[str]] = {}
    if use_variation_cache and node_id:
        try:
            from .variation_cache import get_avoidance_lists
            avoidance = get_avoidance_lists(node_id, enabled_categories)
        except Exception as ve:
            logger.warning(f"[Prompt Randomizer] Could not fetch avoidance list: {ve}")

    # ---------------------------------------------------------------------------
    # Generation loop (up to 3 attempts: 1 initial + 2 repeat retries)
    # ---------------------------------------------------------------------------
    chosen_values: Dict[str, str] = {}
    raw_output = ""
    cleaned_prompt = ""
    status_note = ""

    for attempt in range(3):
        # On retry, add explicit rejection of repeated values
        retry_avoidance = dict(avoidance)
        if attempt > 0 and chosen_values:
            # Add the repeated values from last attempt to avoidance so the
            # LLM is told explicitly what was rejected
            for cat, val in chosen_values.items():
                existing = retry_avoidance.get(cat, [])
                if val not in existing:
                    existing = existing + [val]
                retry_avoidance[cat] = existing

        user_msg = build_user_instruction(
            prompt,
            enabled_categories,
            options,
            avoidance=retry_avoidance if use_variation_cache else {},
            use_cache=use_variation_cache,
            use_report=use_variation_cache,  # report block only needed when cache is on
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ]

        logger.info(
            f"[Prompt Randomizer] Attempt {attempt + 1}/3 — model '{model_id}' "
            f"(require_vision=False, node_id={node_id!r})."
        )
        raw_output, meta = generate_text_completion(
            messages=messages,
            model_id=model_id,
            temperature=temp,
            max_tokens=max_tokens,
            context_length=context_length,
            n_gpu_layers=n_gpu_layers,
            top_p=top_p,
            top_k=top_k,
            repetition_penalty=rep_penalty,
            seed=run_seed,
            auto_unload=auto_unload,
            require_vision=False,
        )

        # ---------------------------------------------------------------------------
        # Feature A: split report block from prompt text
        # ---------------------------------------------------------------------------
        if use_variation_cache:
            prompt_part, chosen_values = _split_prompt_and_report(raw_output)

            # If the report was missing, try a follow-up extraction call
            if not chosen_values and enabled_categories:
                chosen_values = _do_follow_up_extraction(
                    prompt_text=prompt_part,
                    enabled_categories=enabled_categories,
                    ai_settings=ai_settings,
                    model_id=model_id,
                    run_seed=run_seed,
                )

            cleaned_prompt = _clean_output_text(prompt_part)
        else:
            cleaned_prompt = _clean_output_text(raw_output)
            chosen_values = {}

        # ---------------------------------------------------------------------------
        # Feature A: repeat check — only retry when variation cache is on
        # ---------------------------------------------------------------------------
        if use_variation_cache and node_id and chosen_values:
            try:
                from .variation_cache import check_repeats
                repeats = check_repeats(node_id, chosen_values)
            except Exception:
                repeats = {}

            if repeats and attempt < 2:
                logger.info(
                    f"[Prompt Randomizer] Repeat detected in categories "
                    f"{list(repeats.keys())} — retrying (attempt {attempt + 2}/3)."
                )
                continue  # retry with rejected values added to avoidance

            if repeats:
                # Last attempt still repeated — accept and note it
                cats_str = ", ".join(repeats.keys())
                status_note = f" (repeated: {cats_str})"
                logger.warning(
                    f"[Prompt Randomizer] Max retries reached; accepting repeated "
                    f"values for: {cats_str}."
                )

        # No repeats (or cache disabled) — done
        break

    # ---------------------------------------------------------------------------
    # Feature A: record chosen values to cache
    # ---------------------------------------------------------------------------
    cache_stats = {}
    if use_variation_cache and node_id and chosen_values:
        try:
            from .variation_cache import record_run, get_cache_stats
            record_run(node_id, chosen_values, batch_size=cache_size)
            cache_stats = get_cache_stats(node_id, batch_size=cache_size)
        except Exception as ce:
            logger.warning(f"[Prompt Randomizer] Cache record failed: {ce}")

    return {
        "status": "completed",
        "prompt": cleaned_prompt,
        "raw": raw_output,
        "model": model_id,
        "seed": run_seed,
        "chosen_values": chosen_values,
        "cache_stats": cache_stats,
        "status_note": status_note,
        **meta,
    }


# ---------------------------------------------------------------------------
# Follow-up extraction helper
# ---------------------------------------------------------------------------

def _do_follow_up_extraction(
    prompt_text: str,
    enabled_categories: List[str],
    ai_settings: Dict[str, Any],
    model_id: str,
    run_seed: int,
) -> Dict[str, str]:
    """
    One-shot follow-up call to extract category values when the main call
    did not include the report block. Kept minimal to save VRAM time.
    """
    try:
        cats_str = ", ".join(enabled_categories)
        extract_msg = (
            f"Given this image prompt:\n{prompt_text}\n\n"
            f"List the value chosen for each of these categories: {cats_str}.\n"
            f"Output only lines in this exact format (one per category):\n"
            f"##CATVAL## category_id: chosen value\n"
            f"If a category is not present in the prompt, skip it."
        )
        messages = [
            {"role": "system", "content": "Extract category values. Output only ##CATVAL## lines, nothing else."},
            {"role": "user", "content": extract_msg},
        ]
        raw, _ = generate_text_completion(
            messages=messages,
            model_id=model_id,
            temperature=0.1,
            max_tokens=256,
            context_length=int(ai_settings.get("context_length", 4096)),
            n_gpu_layers=int(ai_settings.get("n_gpu_layers", -1)),
            top_p=0.9,
            top_k=40,
            repetition_penalty=1.0,
            seed=run_seed,
            auto_unload=False,  # don't unload between main and follow-up
            require_vision=False,
        )
        return _parse_chosen_from_follow_up(raw)
    except Exception as e:
        logger.warning(f"[Prompt Randomizer] Follow-up extraction failed: {e}")
        return {}
