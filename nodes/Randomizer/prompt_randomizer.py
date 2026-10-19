"""
Deathshot Arsenal - DS Randomizer: AI Prompt Randomizer
Semantic, LLM-powered prompt variation engine running on the shared core.ai Built-In LLM.
Randomizes specifically targeted semantic categories using deep contextual
understanding rather than static dictionary lookups.

  Feature A - Variation Cache (10-batch, no repeats)
  Feature B - Contextual Coherence rules
  Feature C - Seeded directions: the aesthetic family for each category is drawn in Python
              from the run seed, so variety does not depend on the LLM's most likely answer.
"""

import hashlib
import json
import logging
import random
import re
from typing import Dict, Any, List, Optional, Tuple

from core.ai import GenerationCancelled, generate_text_completion, list_builtin_models, unload_model

from .randomizer_engine import PromptRewriter, get_db_loader, get_randomizer_pipeline
from .variation_cache import (
    SEMANTIC_CLUSTERS,
    _normalize,
    check_repeats,
    get_avoidance_lists,
    get_cache_stats,
    get_cluster,
    record_run,
)

logger = logging.getLogger("DeathshotArsenal.Randomizer.AI")


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
4. ASSIGNED DIRECTIONS AND CREATIVE DIVERSITY:
   - When the request lists an ASSIGNED DIRECTION for a category, the new value MUST belong to that direction. It was drawn at random for this run; do not drift back to a more typical choice.
   - Within the direction, use your own knowledge to invent a specific, vivid, concrete value (exact shade, cut, garment, material, place, light source). Never copy the family name or the example words into the value.
   - Never reuse a recently used value or a minor synonym of it, and never keep the value the source prompt already has.
5. CLEAN, RAW OUTPUT:
   - Return ONLY the final modified prompt text.
   - Absolutely NO conversational filler, NO intros ("Here is your prompt:"), NO explanations, NO quotes, and NO markdown code fences (```)."""

# ---------------------------------------------------------------------------
# Feature B: Contextual Coherence block (appended to system prompt when enabled)
# ---------------------------------------------------------------------------
_COHERENCE_BLOCK = """
PHYSICAL PLAUSIBILITY & COHERENCE RULES (apply silently - analysis must NOT appear in output):
- Physical Realism: Ensure physical poses match the supporting surface (e.g. sitting on a bench or counter, leaning on a wall, lying on a sofa). When intimate anatomy is exposed, describe garments as unbuttoned, pulled down, or hitched up rather than clipping through solid fabric.
- Scene Fit: A new location must physically support the existing pose and action; new clothing must suit the action and body parts already described; new lighting must be possible in the chosen location.
- Grammatical Flow: New attributes must weave into the sentence naturally without conflicting with existing actions or visible body parts.
- Coherence never overrides an ASSIGNED DIRECTION: pick the most plausible value inside that direction."""

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
# Attribute-Only Randomizer Prompts & Builders (Fast, In-Place Replacement)
# ---------------------------------------------------------------------------

ATTRIBUTE_RANDOMIZER_SYSTEM_PROMPT = """You are an elite visual prompt attribute randomizer for image and video generation models.
Your task is to analyze the source prompt, detect existing attribute descriptions for the target categories, and generate bold, distinct, creative replacements using your rich visual knowledge.

CRITICAL DIRECTIVES:
0. MANDATORY DIRECTIVE - ZERO UNNECESSARY CHAT / NO THINKING HEADERS:
   - Output ONLY the target replacement lines. No introduction, no summary, no conversational filler.
1. PROMPT ANALYSIS & SCANNING:
   - Carefully inspect the SOURCE PROMPT for each requested target category.
   - If an attribute for that category exists in the prompt, identify the EXACT phrase describing it so it can be cleanly replaced.
   - If the category is NOT present in the source prompt, mark replaces: NONE.
2. ASSIGNED DIRECTIONS & NON-REPETITION - THIS IS YOUR PRIMARY DIRECTIVE:
   - Each category may come with an ASSIGNED DIRECTION drawn at random for this run. The new value MUST belong to it; do not fall back to a more typical or popular choice.
   - Within the direction, use your deep knowledge of fashion, art, cinema, cultures and photography to invent a specific, vivid, concrete value (exact shade, cut, garment, material, place, light source). Never copy the family name or the example words into the value.
   - The new value must differ clearly from the phrase currently in the prompt and from every recently used value. Minor synonyms and adjacent variations count as repeats.
   - Each value describes ONLY its own category in 3-12 words: no lighting, pose, or setting inside a hair or clothing value.
3. OUTPUT FORMAT:
   - Output one line per requested category in this exact format:
     ##CATVAL## <category_id> | replaces: "<exact phrase in prompt to replace, or NONE>" | value: "<new replacement description>"
"""


# ---------------------------------------------------------------------------
# Semantic Locators & Pure-AI In-Place Replacement Engine
# ---------------------------------------------------------------------------

_HAIR_ADJ = r"(?!\b(?:in|on|with|and|or|of|to|for|at|by|from|a|an|the|is|has|wearing|dressed|clad|sporting|standing|sitting|walking|holding|looking|woman|man|girl|guy|person|model|lady)\b)[a-zA-Z\-]+"

AI_SMART_LOCATORS = {
    "hair_color": re.compile(
        rf"(?:\b(?:with|has|hair\s+is)\s+)?\b({_HAIR_ADJ}(?:\s+{_HAIR_ADJ}){{0,2}}\s+(?:hair|curls|locks|tresses|ponytail|braids?|bangs|updo|cut|bob))\b"
        r"|\b(?:platinum blonde|golden honey-blonde|golden blonde|honey blonde|sun-bleached blonde|dirty blonde|strawberry blonde|champagne blonde|ice blonde|bleached blonde|Swedish ice-blonde|bleached white-blonde|blonde|blond|dark brunette|brunette|redhead)\b(?:\s+(?:hair|curls|locks|tresses))?"
        r"|\b(?:chestnut brown|chocolate brown|copper red|fiery copper-red|vibrant Irish ginger|ginger|auburn|crimson auburn|bright fiery red|ash-brown|ash brown|silver-white|silver-gray|silver gray|icy titanium silver|deep raven-black|jet-black|jet black|raven black|black|brown|dark brown|red|green|emerald|blue|teal|cyan|purple|violet|lavender|pink|rose|white|gray|silver|yellow|orange|golden|dark|light|neon|pastel|dyed)\s+(?:hair|curls|locks|tresses|ponytail|braids?|bangs|updo|cut|bob)\b",
        re.I
    ),
    "hair": re.compile(
        rf"(?:\b(?:with|has|hair\s+is)\s+)?\b({_HAIR_ADJ}(?:\s+{_HAIR_ADJ}){{0,4}}\s+(?:hair|curls|locks|tresses|ponytail|braids?|bangs|updo|cut|bob))\b|\b(?:hair|curls|locks|tresses)\b",
        re.I
    ),
    "hair_length": re.compile(
        r"\b(?:waist-length|shoulder-length|medium-length|mid-back(?:\s+length)?|elbow-length|chin-length|pixie-length|buzz-cut|very long|medium length|closely cropped short|short cropped|long|short|cropped)\b(?:\s+hair)?",
        re.I
    ),
    "clothing": re.compile(
        r"(?:,\s*|\band\s*)?(?:\b(?:wearing\s+only|wearing|dressed\s+in|clad\s+in|in\s+a|in\s+an|in|sporting|outfitted\s+in)\s+)?\b(?:[\w\-]+\s+){0,3}(?:dress|skirt|blazer|sweater|cardigan|hoodie|jacket|coat|trench\s+coat|shirt|t-shirt|blouse|top|crop\s+top|pants|trousers|jeans|shorts|suit|tuxedo|lingerie|bra|panties|underwear|swimsuit|bikini|bodysuit|gown|robe|robes|kimono|armor|outfit|attire|uniform|costume)\b(?:\s+and\s+[\w\-\s]+)?",
        re.I
    ),
    "female_clothing": re.compile(
        r"(?:,\s*|\band\s*)?(?:\b(?:wearing\s+only|wearing|dressed\s+in|clad\s+in|in\s+a|in\s+an|in|sporting|outfitted\s+in)\s+)?\b(?:[\w\-]+\s+){0,3}(?:dress|skirt|blazer|sweater|hoodie|jacket|coat|shirt|blouse|crop\s+top|pants|jeans|shorts|high heels|heels|pumps|lingerie|bra|panties|underwear|swimsuit|bikini|babydoll|robe|gown|kimono|costume|attire|outfit)\b|\b(?:completely naked|fully nude)\b",
        re.I
    ),
    "male_clothing": re.compile(
        r"(?:,\s*|\band\s*)?(?:\b(?:wearing|dressed\s+in|clad\s+in|in\s+a|in\s+an|in)\s+)?\b(?:[\w\-]+\s+){0,3}(?:suit|tuxedo|jacket|blazer|coat|shirt|t-shirt|sweater|hoodie|jeans|pants|trousers|boxers|sweatpants|shorts)\b|\bshirtless\b",
        re.I
    ),
    "location": re.compile(
        r"(?:,\s*|\band\s*)?(?:\b(?:in\s+a|in\s+an|in\s+the|at\s+a|at\s+an|at\s+the|inside\s+a|inside\s+an|inside\s+the|on\s+a|on\s+the)\s+)?\b(?:[\w\-]+\s+){0,3}(?:beach|coastline|shore|bedroom|living room|apartment|hotel room|hotel suite|loft|penthouse|cabin|cottage|library|study|art gallery|gallery|studio|greenhouse|terrace|balcony|rooftop|alleyway|alley|street|cafe|coffee shop|restaurant|bar|speakeasy|dungeon|sauna|bathhouse|onsen|pool|poolside|garden|forest|woods|courtyard|kitchen|bathroom|cathedral|temple|sanctuary)\b(?:\s+(?:setting|scene|interior|atmosphere|environment))?(?:\s+with\s+[^,.;\n]+)?",
        re.I
    ),
    "clothing_color": re.compile(
        r"(?:\b(?:in|wearing|dressed\s+in|clad\s+in)\s+)?"
        r"\b(?:muted|rich|opulent|pristine|crisp|warm|cool|neutral|sophisticated|deep|pale|soft|faded|worn|charcoal|bright|vibrant|pastel|dark|light|neon)"
        r"(?:[\s\-]+(?:earthy|midnight|navy|olive|cherry|wine|drab|toned|golden|silver|pearl|blush|champagne|cream|ivory|slate|steel|powder|burnt|dusty|electric|acid|icy|royal|forest|oxblood|burgundy|emerald|ruby|sapphire|amber|cobalt|coral|lavender|rose|mauve|mint|sage|rust|cognac|caramel|mustard|teal|indigo|plum|peach|apricot|vermillion|copper|bronze|terracotta|sienna|umber))?"
        r"(?:[\s\-]+(?:pink|red|blue|green|yellow|orange|purple|violet|black|white|grey|gray|brown|tan|beige|gold|silver|cream|ivory|taupe|nude|tones?|hue|sheen))?"
        r"\b",
        re.I
    ),
}

AI_CREATIVE_POOLS = {
    "hair_color": [
        # Vivid / Fantasy spectrum
        "vibrant emerald green hair",
        "electric cobalt blue hair with metallic sheen",
        "neon fuchsia-pink hair",
        "pastel lavender-lilac waves",
        "vivid tangerine orange hair",
        "deep amethyst violet hair",
        "icy arctic turquoise hair",
        "holographic rainbow-tinted silver hair",
        "rich jade-green locs",
        "glowing crimson-red hair",
        "burning neon coral hair",
        "toxic lime-green hair",
        # Natural / Editorial
        "fiery copper-red locks with golden tips",
        "cool-toned platinum blonde curls",
        "deep raven-black hair with violet sheen",
        "rich chestnut-brown curls with caramel highlights",
        "icy silver-white hair",
        "sun-bleached honey blonde beach waves",
        "warm rose-gold tresses",
        "dark espresso brunette with subtle auburn undertones",
        "strawberry blonde with freckle-warm golden highlights",
        "ash grey hair with pearl-white highlights",
        # High-contrast
        "jet-black razor-cut bob",
        "bleached platinum with pastel pink roots",
        "deep burgundy wine-red hair",
        "warm golden amber hair",
        "ombre black-to-electric-blue hair",
        "cool steel blue highlights over deep brunette",
    ],
    "hair_style": [
        "sleek blunt bob cut",
        "voluminous natural afro",
        "waist-length flowing straight hair",
        "high tight ponytail",
        "elaborate French braid updo",
        "messy undone bun with face-framing tendrils",
        "curtain bangs with loose waves",
        "pixie cut with shaved sides",
        "box braids with golden cuffs",
        "long layered beach waves",
        "cornrows leading into a low bun",
        "wolf cut with wispy layers",
        "coily spring curls",
        "sleek slicked-back low bun",
        "twisted locs half-updo",
        "shaggy 70s-inspired layers",
        "structured 1920s finger waves",
        "Dutch braid crown",
        "space buns with loose face-framing strands",
        "micro braids with beaded ends",
    ],
    "hair_length": [
        "jaw-length bob",
        "chin-length",
        "shoulder-length",
        "collarbone-length",
        "mid-back length",
        "waist-length",
        "hip-length",
        "pixie-short cropped",
        "buzzed close-cropped",
        "below-the-knee ultra-long",
        "asymmetric one-sided short",
    ],
    "clothing": [
        # Formal / Luxury
        "tailored ivory double-breasted power blazer and wide-leg trousers",
        "floor-length emerald satin column gown with plunging back",
        "sculptural black organza avant-garde couture dress",
        "wine-red velvet tuxedo with peaked lapels",
        "structured rose-gold brocade opera coat",
        # Streetwear / Urban
        "oversized graphic hoodie, baggy cargo pants, chunky platform sneakers",
        "cropped leather bomber jacket over mesh top and wide-leg jeans",
        "Y2K butterfly print bandeau and low-rise flared jeans",
        "technical gore-tex utility vest over ribbed crop top and track pants",
        "oversized vintage band tee knotted at waist, torn black skinny jeans",
        "colorblock oversized puffer jacket with fitted joggers",
        # Fantasy / Dramatic
        "ornate medieval-fantasy plate armor with crimson velvet cape",
        "ethereal sheer white elven robe with golden embroidery",
        "dark gothic velvet corset-dress with lace-up back and floor-length skirt",
        "futuristic silver latex bodysuit with holographic circuit panels",
        "iridescent dragonscale armor with flowing silk underlayer",
        # Intimate / Minimal
        "delicate ivory lace bodysuit",
        "sheer champagne silk slip dress",
        "strappy black satin lingerie set",
        "barely-there pearl-white string bikini",
        # Cultural / Historical
        "traditional embroidered hanfu in deep jade and gold",
        "vibrant kente-patterned wrap dress",
        "1950s circle skirt, fitted cardigan, and white gloves",
        "1970s boho maxi dress with macrame belt",
        "Regency-era empire waist gown in sky blue muslin",
        "colorful Mexican bordado embroidered blouse and flared skirt",
        # Sport / Active
        "sleek athletic monochrome cycling kit",
        "high-waist sport leggings and a cropped sports bra",
    ],
    "female_clothing": [
        "floor-length midnight blue satin gown with sweetheart neckline",
        "cropped white linen blazer over high-waist wide-leg linen trousers",
        "sheer chiffon floral wrap dress with thigh slit",
        "strappy emerald satin slip dress",
        "vintage 1950s red polka dot circle skirt and white fitted blouse",
        "oversized chunky knit sage sweater and pleated mini skirt",
        "sleek black asymmetric bodycon dress",
        "traditional embroidered silk qipao in crimson",
        "flowing bohemian maxi dress in rust and terracotta print",
        "gothic velvet corset top with layered lace skirt",
        "iridescent silver mini dress with structural shoulders",
        "sporty crop tank and high-waisted biker shorts",
        "delicate ivory lace babydoll lingerie",
        "sheer organza blouse with wide-leg high-waisted trousers",
        "vibrant kente-patterned wrap skirt and matching bandeau",
        "cyberpunk translucent PVC trench coat over neon bodysuit",
        "Regency empire waist gown in soft peach muslin",
        "1970s boho fringe leather vest over floral peasant blouse",
        "sleek white latex catsuit",
        "theatrical baroque ballgown in deep burgundy with gold trim",
    ],
    "male_clothing": [
        "sharp navy three-piece suit with pocket square",
        "oversized cream linen shirt and wide-leg tailored trousers",
        "black turtleneck sweater and fitted dark jeans",
        "distressed biker leather jacket over white graphic tee",
        "traditional sashiko-stitched Japanese indigo jacket",
        "loose-fit tech-fleece track suit in monochrome grey",
        "ornate medieval plate armor with red surcoat",
        "Cuban-collar floral camp shirt and chino shorts",
        "structured camel wool overcoat and slim black trousers",
        "cyberpunk reflective jacket with cargo tech-wear pants",
        "vibrant West African dashiki with matching trousers",
        "classic white linen shirt open at collar with rolled sleeves",
        "Victorian-era waistcoat and frock coat",
        "sleek white compression tank and loose athletic shorts",
        "ornate embroidered Nehru jacket",
    ],
    "location": [
        # Luxury / Interior
        "in an opulent Belle Epoque boudoir with gilded mirrors and velvet drapes",
        "in a sun-drenched minimalist Bauhaus art studio",
        "in a cozy wood-paneled whiskey library with amber lamps and leather chairs",
        "in a steamy marble-tiled hammam bathhouse",
        "on a modern glass penthouse terrace overlooking a neon-lit city at dusk",
        "in a grand opera house foyer with crystal chandeliers",
        # Urban / Street
        "on a rain-slicked Tokyo neon alleyway at midnight",
        "in a graffiti-covered Berlin underground warehouse",
        "on a sun-bleached Los Angeles rooftop with a downtown skyline",
        "in a bustling Marrakech souk with lanterns and spice-colored fabrics",
        "on a quiet cobblestone Paris street lined with cafe awnings",
        "in a gritty New York subway station with dramatic fluorescent light",
        # Nature / Landscape
        "in an ancient misty redwood forest with cathedral-light beams",
        "on a volcanic black sand beach at golden hour",
        "in a field of tall lavender under a dramatic storm sky",
        "beside a glacier lake with mirror-still turquoise water",
        "on a chalk cliff edge overlooking a wild grey ocean",
        "deep in a bamboo forest at dawn",
        # Industrial / Dystopian
        "in an abandoned industrial factory with rust and shafts of light",
        "in a flooded underground cyberpunk server vault",
        "in a brutalist concrete bunker with dramatic side lighting",
        "on a decaying gothic cathedral rooftop",
        # Fantasy / Surreal
        "in an ethereal cherry blossom forest with floating lanterns",
        "in a crystal cave filled with iridescent stalagmites",
        "on a floating island above the clouds",
        "in an Art Nouveau greenhouse overgrown with exotic blooms",
        "inside a surreal Dali-esque dreamscape with melting clocks",
        "in an ancient Norse longhouse lit by fire",
    ],
    "skin_complexion": [
        "porcelain cool-toned skin",
        "warm golden-olive Mediterranean complexion",
        "rich deep ebony skin with blue-black undertones",
        "sun-bronzed amber complexion",
        "cool beige with rosy undertones",
        "deep caramel brown complexion",
        "warm terracotta complexion",
        "cool alabaster with violet undertones",
        "rich mahogany complexion",
        "light peachy-pink complexion",
        "warm honey complexion",
        "cool ash-brown complexion",
    ],
    "body_figure": [
        "slender willowy figure",
        "voluptuous hourglass figure",
        "athletic toned build",
        "petite compact frame",
        "statuesque tall build",
        "curvy thick build with full hips",
        "muscular defined physique",
        "soft plus-size figure",
        "lean androgynous frame",
    ],
    "camera_angle": [
        "dramatic low-angle looking up",
        "overhead bird's-eye view",
        "intimate close-up portrait",
        "wide establishing shot",
        "over-the-shoulder perspective",
        "extreme close-up on face",
        "Dutch angle tilt",
        "eye-level direct gaze",
        "side profile silhouette shot",
        "three-quarter turned angle",
    ],
    "lighting": [
        "soft golden hour backlight",
        "dramatic noir single-source chiaroscuro",
        "cool neon cyberpunk rim light",
        "clean high-key studio softbox",
        "harsh split-lighting from a side window",
        "dappled forest green ambient light",
        "warm candlelight glow",
        "cool blue moonlight",
        "overhead beauty dish with fill",
        "deep shadow with fiery rim light",
        "diffused overcast natural light",
        "bioluminescent cool teal underwater glow",
    ],
    "clothing_color": [
        "in rich burgundy wine red",
        "in pristine crisp optic white",
        "in deep midnight navy blue",
        "in electric neon hot pink",
        "in muted sage green",
        "in warm camel tan",
        "in vivid emerald green",
        "in soft blush champagne pink",
        "in cool steel grey",
        "in burnt sienna terracotta",
        "in icy powder blue",
        "in deep plum purple",
        "in warm mustard yellow",
        "in rich cognac brown",
        "in bright coral orange",
        "in cool lavender lilac",
        "in monochrome jet black",
        "in vintage faded denim blue",
        "in metallic rose gold",
        "in forest green with olive undertones",
    ],
}


def clean_duplicate_tokens(text: str) -> str:
    """Collapses duplicate words like 'hair hair', 'dress dress', double prepositions, double punctuation."""
    t = re.sub(r"\b([a-zA-Z]{3,})\s+\1\b", r"\1", text, flags=re.I)
    t = re.sub(r"\b(in|with|on|at|of)\s+\1\b", r"\1", t, flags=re.I)
    t = re.sub(r",\s*,+", ", ", t)
    t = re.sub(r"\.\s*,+", ". ", t)
    t = re.sub(r",\s*\.+", ".", t)
    t = re.sub(r"\s+([,.;])", r"\1", t)
    t = re.sub(r"([,.;])([^\s\d\n])", r"\1 \2", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s+", "\n", t)
    return t.strip(" \t\n\r,")


def resolve_conflicting_attributes(text: str, category: str, chosen_val: str) -> str:
    """Removes residual conflicting phrases of the same category (e.g. leftover 'black hair' when replacing with 'green hair')."""
    pat = None
    if category in ("hair_color", "hair"):
        pat = AI_SMART_LOCATORS["hair_color"]
    elif category in ("clothing", "female_clothing", "male_clothing"):
        pat = AI_SMART_LOCATORS["clothing"]

    if pat:
        matches = list(pat.finditer(text))
        if len(matches) > 1:
            chosen_pos = text.find(chosen_val)
            chosen_end = chosen_pos + len(chosen_val) if chosen_pos != -1 else -1

            to_remove = []
            for m in matches:
                m_start, m_end = m.start(), m.end()
                if chosen_pos != -1 and not (m_end <= chosen_pos or m_start >= chosen_end):
                    continue
                to_remove.append((m_start, m_end))

            res = text
            for s, e in reversed(to_remove):
                res = res[:s] + res[e:]
            return clean_duplicate_tokens(res)
    return text


def _sanitize_ai_value(val: str) -> str:
    """
    Cleans up contaminated AI values that contain parser artifacts.
    Strips 'replaces:' leakage, '##CATVAL##' fragments, '-- replaced with' chains,
    and truncates excessively long values.
    """
    if not val:
        return ""
    v = str(val).strip()
    # Strip leading 'replaces:' or 'value:' prefixes that leaked through
    v = re.sub(r'^(?:replaces|value)\s*:\s*["\']?\s*', '', v, flags=re.I).strip()
    # Strip ##CATVAL## fragments
    v = re.sub(r'##CATVAL##\s*', '', v, flags=re.I).strip()
    # Strip ' — replaced with ...' chains (LLM sometimes echoes the replacement instruction)
    v = re.sub(r'\s*[—–-]+\s*replaced\s+with .*$', '', v, flags=re.I).strip()
    # Strip trailing quotes
    v = v.strip('"\'').strip()
    # Truncate excessively long values (anything > 120 chars is likely contaminated prose)
    if len(v) > 120:
        for delim in [',', '.', ' — ', ' - ']:
            cut = v.rfind(delim, 0, 120)
            if cut > 30:
                v = v[:cut].strip(' ,.-—')
                break
        else:
            v = v[:120].strip()
    return v


def parse_ai_attribute_report(raw_text: str, enabled_categories: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """
    Multi-strategy parser for LLM-generated attribute variations.
    Supports:
      1. ##CATVAL## category_id | replaces: "..." | value: "..."
      2. ##CATVAL## category_id: value
      3. Pipe format without ##CATVAL##: category_id | replaces: "..." | value: "..."
      4. Markdown bullets / numbered lists:
         - **hair_color**: platinum blonde
         - 1. hair_color: platinum blonde
         - * Hair Color: platinum blonde
      5. JSON block: {"hair_color": "platinum blonde"} or {"hair_color": {"value": "..."}}
      6. Plain 'key: value' lines mapping natural names (e.g. 'Hair Color' -> 'hair_color')
    """
    results: List[Dict[str, Any]] = []
    seen_cats = set()
    raw = str(raw_text or "").strip()
    if not raw:
        return results

    enabled_set = set(enabled_categories or [])
    # Build alias lookup: e.g. "hair color" -> "hair_color", "clothing" -> "female_clothing", etc.
    norm_map: Dict[str, str] = {}
    for c in enabled_set:
        norm_map[c.lower().strip()] = c
        norm_map[c.lower().replace("_", " ").strip()] = c
        norm_map[c.lower().replace("_", "-").strip()] = c

    # Strategy 1: JSON detection
    json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```|(\{[\s\r\n]*\"[a-zA-Z_]+\"[\s\S]*?\})", raw)
    if json_match:
        try:
            blob = json_match.group(1) or json_match.group(2)
            parsed = json.loads(blob)
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    norm_k = norm_map.get(k.lower().strip()) or k.lower().replace(" ", "_").strip()
                    val = None
                    rep = None
                    if isinstance(v, str):
                        val = _sanitize_ai_value(v)
                    elif isinstance(v, dict):
                        val = _sanitize_ai_value(v.get("value") or v.get("description") or "")
                        rep = v.get("replaces")
                    if norm_k and val and norm_k not in seen_cats:
                        results.append({
                            "category": norm_k,
                            "replaces": rep if (rep and str(rep).upper() != "NONE") else None,
                            "value": val,
                        })
                        seen_cats.add(norm_k)
        except Exception:
            pass

    if results and enabled_set and seen_cats.issuperset(enabled_set):
        return results

    # Strategy 2: Line-by-line parsing
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue

        is_catval = s.startswith("##CATVAL##")
        if is_catval:
            rest = s[len("##CATVAL##"):].strip()
        else:
            # Strip markdown list markers: "* ", "- ", "1. ", "• "
            rest = re.sub(r"^(?:[\*\-\•]|\d+[\.\)])\s+", "", s).strip()
            # Strip markdown bold from key: e.g. **hair_color**: -> hair_color:
            rest = re.sub(r"^\*\*([^\*]+)\*\*", r"\1", rest).strip()

        # Try pipe-delimited format: category | replaces: ... | value: ...
        if "|" in rest:
            parts = [p.strip() for p in rest.split("|")]
            raw_cat = parts[0].lower().replace(" ", "_").strip()
            matched_cat = norm_map.get(raw_cat) or raw_cat
            replaces_val = None
            chosen_val = None
            for p in parts[1:]:
                if re.match(r"^replaces\s*:", p, re.I):
                    replaces_val = p.split(":", 1)[1].strip().strip("\"'")
                elif re.match(r"^value\s*:", p, re.I):
                    chosen_val = p.split(":", 1)[1].strip().strip("\"'")
                elif ":" in p and not chosen_val:
                    chosen_val = p.split(":", 1)[1].strip().strip("\"'")
            if not chosen_val and len(parts) >= 2:
                chosen_val = parts[-1].strip().strip("\"'")

            sanitized_val = _sanitize_ai_value(chosen_val)
            if matched_cat and sanitized_val and matched_cat not in seen_cats:
                results.append({
                    "category": matched_cat,
                    "replaces": replaces_val if (replaces_val and replaces_val.upper() != "NONE") else None,
                    "value": sanitized_val,
                })
                seen_cats.add(matched_cat)
                continue

        # Try key: value or key = value or key -> value
        m = re.match(r"^([a-zA-Z_][a-zA-Z0-9_\s\-]{1,35})\s*(?::|=|\->)\s*(.+)$", rest)
        if m:
            raw_key = m.group(1).lower().strip()
            val_part = m.group(2).strip()
            matched_cat = norm_map.get(raw_key) or norm_map.get(raw_key.replace(" ", "_")) or raw_key.replace(" ", "_")
            if enabled_set and matched_cat not in enabled_set and raw_key not in enabled_set:
                for ec in enabled_set:
                    if ec in raw_key or raw_key in ec:
                        matched_cat = ec
                        break

            rep = None
            val = val_part
            m_rep = re.search(r'replaces:\s*["\']?([^"\'\|,\n]+)["\']?', val_part, re.I)
            m_val = re.search(r'value:\s*["\']?([^"\'\|,\n]+)["\']?', val_part, re.I)
            if m_val:
                val = m_val.group(1).strip()
                if m_rep:
                    rep = m_rep.group(1).strip()
            else:
                val = _sanitize_ai_value(val)

            if matched_cat and val and matched_cat not in seen_cats:
                results.append({
                    "category": matched_cat,
                    "replaces": rep if (rep and rep.upper() != "NONE") else None,
                    "value": _sanitize_ai_value(val),
                })
                seen_cats.add(matched_cat)

    return results


def apply_ai_attribute_replacements(
    prompt: str,
    parsed_items: List[Dict[str, Any]],
    enabled_categories: List[str],
) -> str:
    """
    Applies AI-generated attribute replacements directly to the prompt.
    Operates using AI prompt analysis and smart semantic locating without relying on small DB files.
    """
    working = prompt.strip()
    if not working:
        return ", ".join(item.get("value", "") for item in parsed_items if item.get("value"))

    db = get_db_loader()

    for item in parsed_items:
        cat = item.get("category", "")
        replaces_target = item.get("replaces")
        val = item.get("value", "").strip()
        if not val:
            continue

        # Format hair traits naturally if inserted or replaced without hair noun
        if cat in ("hair_color", "hair_length", "hair_type"):
            has_hair_noun = bool(re.search(r"\b(hair|curls|locks|tresses|ponytail|braids?|bangs|updo|cut|bob)\b", val, re.I))
            if not has_hair_noun:
                val = f"{val} hair"

        replaced = False
        # 1. Try explicit replaces phrase from LLM
        if replaces_target and replaces_target.upper() != "NONE":
            pattern = re.compile(re.escape(replaces_target), re.I)
            m = pattern.search(working)
            if m:
                before = working[:m.start()]
                after = working[m.end():]
                # Ensure noun boundary isn't doubled (e.g. val ends with 'hair' and after begins with 'hair')
                if val.lower().endswith("hair") and after.lstrip().lower().startswith("hair"):
                    after = re.sub(r"^\s*hair\b", "", after, flags=re.I, count=1)
                sep_before = " " if before and before[-1].isalnum() and val[0].isalnum() else ""
                sep_after = " " if after and after[0].isalnum() and val[-1].isalnum() else ""
                working = f"{before}{sep_before}{val}{sep_after}{after}"
                working = clean_duplicate_tokens(working)
                replaced = True

        # 2. Try smart semantic attribute locator if LLM didn't provide target or target not found
        if not replaced:
            loc_pat = AI_SMART_LOCATORS.get(cat)
            if loc_pat:
                m = loc_pat.search(working)
                if m:
                    start, end = m.start(), m.end()
                    if m.group(0).lower().startswith(("with ", "has ")) and not val.lower().startswith(("with ", "has ")):
                        first_word = m.group(0).split()[0]
                        val = f"{first_word} {val}"
                    before = working[:start]
                    after = working[end:]
                    if val.lower().endswith("hair") and after.lstrip().lower().startswith("hair"):
                        after = re.sub(r"^\s*hair\b", "", after, flags=re.I, count=1)
                    sep_before = " " if before and before[-1].isalnum() and val[0].isalnum() else ""
                    sep_after = " " if after and after[0].isalnum() and val[-1].isalnum() else ""
                    working = f"{before}{sep_before}{val}{sep_after}{after}"
                    working = clean_duplicate_tokens(working)
                    replaced = True

        # 3. If category was not present in prompt, weave it in contextually
        if not replaced:
            working = PromptRewriter.insert_category(working, cat, val, db)

        # Clean residual conflicting attributes of the same category
        working = resolve_conflicting_attributes(working, cat, val)
        working = clean_duplicate_tokens(working)

    return clean_duplicate_tokens(working)


def pick_directions(
    prompt: str,
    enabled_categories: List[str],
    options: Dict[str, Any],
    recent: Dict[str, List[str]],
    rng: random.Random,
    node_id: str,
) -> Dict[str, str]:
    """
    Draw an aesthetic direction per category from the run RNG. LLMs collapse onto the same few
    "creative" answers for an identical request, so the spread has to come from here.
    Categories with semantic clusters get a family that differs from the source prompt's current
    value and the last two recorded values; other categories get a database entry as inspiration.
    """
    directions: Dict[str, str] = {}
    selector = get_randomizer_pipeline().selector
    for cat in enabled_categories:
        clusters = SEMANTIC_CLUSTERS.get(cat)
        if clusters:
            excluded = {get_cluster(v, cat) for v in recent.get(cat, [])[-2:]}
            loc = AI_SMART_LOCATORS.get(cat)
            current = loc.search(prompt) if (loc and prompt) else None
            if current:
                excluded.add(get_cluster(current.group(0), cat))
            families = [c for c in clusters if c not in excluded] or list(clusters)
            family = rng.choice(families)
            words = sorted(clusters[family])
            examples = ", ".join(rng.sample(words, min(3, len(words))))
            directions[cat] = f"the {family.replace('_', ' ')} family (e.g. {examples})"
            continue
        entry = selector.select(node_id=node_id, category_id=cat, options=options.get(cat), rng=rng)
        if entry and entry.get("text"):
            directions[cat] = f"something in the spirit of \"{entry['text']}\""
    return directions


def _constraint_text(
    enabled_categories: List[str],
    options: Dict[str, Any],
    avoidance: Dict[str, List[str]],
    directions: Dict[str, str],
) -> str:
    constraints = []
    preset = (options.get("age_range") or {}).get("preset")
    if "age_range" in enabled_categories and preset and preset != "any":
        constraints.append(f"- Age range target: {preset.replace('_', ' ')}")

    if directions:
        constraints.append(
            "ASSIGNED DIRECTIONS (drawn at random for this run - the new value MUST belong to its direction):\n"
            + "\n".join(f"  * {cat}: {d}" for cat, d in directions.items())
        )

    avoid_lines = [
        f"  * {cat}: " + ", ".join(f'"{v}"' for v in vals[-10:])
        for cat, vals in avoidance.items()
        if cat in enabled_categories and vals
    ]
    if avoid_lines:
        constraints.append("RECENTLY USED VALUES - never reuse these or minor variations of them:\n" + "\n".join(avoid_lines))

    return ("\nAdditional Constraints:\n" + "\n".join(constraints)) if constraints else ""


def build_attribute_instruction(
    prompt: str,
    enabled_categories: List[str],
    constraint_text: str,
) -> str:
    """Builds a structured prompt asking the model to scan the prompt and generate replacements."""
    cats_str = ", ".join(enabled_categories) if enabled_categories else "general visual attributes"
    return (
        f"SOURCE PROMPT:\n{prompt.strip()}\n\n"
        f"TARGET CATEGORIES TO RANDOMIZE:\n{cats_str}\n"
        f"{constraint_text}\n"
        f"INSTRUCTION:\n"
        f"1. Scan the SOURCE PROMPT above and locate the exact phrase describing each category in [{cats_str}] (or note NONE if not present).\n"
        f"2. Invent a fresh, specific replacement value inside the assigned direction that is clearly DIFFERENT from what's currently in the prompt.\n"
        f"3. Output ONLY lines in this exact format (one line per category):\n"
        f"##CATVAL## category_id | replaces: \"<exact phrase in prompt to replace, or NONE>\" | value: \"<new attribute description>\""
    )


def build_user_instruction(
    prompt: str,
    enabled_categories: List[str],
    constraint_text: str,
    use_report: bool = True,
) -> str:
    """Builds a structured prompt instructing the model to rewrite the full prompt."""
    cats_str = ", ".join(enabled_categories) if enabled_categories else "general visual attributes"
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
        f"Rewrite the prompt by replacing descriptions belonging to [{cats_str}] in-place with fresh values inside their assigned directions. "
        f"Preserve all other parts of the source prompt exactly as they are.\n"
        f"CRITICAL: DO NOT OUTPUT ANY THINKING PROCESS OR ANALYSIS. Output ONLY the raw final rewritten prompt text directly with zero preamble."
        f"{report_suffix}"
    )


def resolve_mutually_exclusive_categories(categories: List[str]) -> List[str]:
    """
    Prevents contradictory instructions where a parent all-in-one category
    (e.g., clothing, location, shot_type, hair) is enabled alongside its granular sub-selections.
    If sub-selections are active, suppresses the parent so specific traits are preserved.
    """
    if not categories:
        return []

    cats = list(categories)

    # 1. Hair
    hair_subs = {"hair_color", "hair_length", "hair_type", "hair_style"}
    if any(c in cats for c in hair_subs) and "hair" in cats:
        cats = [c for c in cats if c != "hair"]

    # 2. Clothing
    clothing_subs = {
        "top", "bottom", "footwear", "clothing_accessories", "fabric",
        "clothing_color", "style", "clothing_state", "outfit_type",
    }
    clothing_parents = {"clothing", "female_clothing", "male_clothing"}
    if any(c in cats for c in clothing_subs):
        cats = [c for c in cats if c not in clothing_parents]
    elif sum(1 for c in cats if c in clothing_parents) > 1:
        if "female_clothing" in cats:
            cats = [c for c in cats if c not in ("clothing", "male_clothing")]
        elif "male_clothing" in cats:
            cats = [c for c in cats if c not in ("clothing", "female_clothing")]

    # 3. Location / Environment
    location_subs = {"room_environment", "background", "architecture"}
    if any(c in cats for c in location_subs) and "location" in cats:
        cats = [c for c in cats if c != "location"]

    # 4. Camera / Shot Type
    shot_type_subs = {
        "camera_angle", "perspective", "framing", "distance",
        "lens_focal", "camera_position", "camera_characteristics",
    }
    if any(c in cats for c in shot_type_subs) and "shot_type" in cats:
        cats = [c for c in cats if c != "shot_type"]

    return cats


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
    check_interrupt=None,
    on_progress=None,
) -> Dict[str, Any]:
    """
    Randomizes the requested prompt attributes with the shared Built-In LLM.

      Feature A - Variation Cache: avoidance lists, repeat checks with optional retries, history recording.
      Feature B - Contextual Coherence: physical plausibility rules appended to the system prompt.
      Feature C - Seeded directions: one aesthetic direction per category drawn from the run seed.
    """
    enabled_categories = resolve_mutually_exclusive_categories(enabled_categories or [])
    options = options or {}
    ai_settings = ai_settings or {}
    node_key = str(node_id or "default")
    model_id = ai_settings.get("model") or ""

    if not model_id or model_id == "None":
        available = list_builtin_models()
        if not available:
            raise RuntimeError(
                "No GGUF models found! Place a GGUF model in ComfyUI/models/LLM or LM Studio."
            )
        model_id = available[0]["id"]

    auto_unload = bool(ai_settings.get("auto_unload", True))

    if seed is not None and seed > 0:
        run_seed = seed
    elif not ai_settings.get("randomize_seed", True) and int(ai_settings.get("seed", -1)) > 0:
        run_seed = int(ai_settings["seed"])
    else:
        run_seed = random.randint(1, 2147483647)
    rng = random.Random(run_seed)

    use_variation_cache = bool(ai_settings.get("variation_cache", True))
    cache_size = int(ai_settings.get("cache_size", 10))
    use_coherence = bool(ai_settings.get("contextual_coherence", True))
    is_attribute_mode = bool(ai_settings.get("attributes_only", True)) and bool(prompt and prompt.strip())

    # The custom system prompt is a full-rewrite prompt; attribute mode needs its own output format.
    if is_attribute_mode:
        system_prompt = ATTRIBUTE_RANDOMIZER_SYSTEM_PROMPT
    else:
        system_prompt = str(ai_settings.get("system_prompt") or "").strip() or RANDOMIZER_SYSTEM_PROMPT
    if use_coherence:
        system_prompt += _COHERENCE_BLOCK

    recent = get_avoidance_lists(node_key, enabled_categories) if (use_variation_cache and node_id) else {}
    directions = pick_directions(prompt, enabled_categories, options, recent, rng, node_key)

    llm_kwargs = {
        "model_id": model_id,
        "temperature": float(ai_settings.get("temperature", 0.92)),
        "max_tokens": int(ai_settings.get("max_tokens", 2048)),
        "context_length": int(ai_settings.get("context_length", 4096)),
        "n_gpu_layers": int(ai_settings.get("n_gpu_layers", -1)),
        "top_p": float(ai_settings.get("top_p", 0.95)),
        "top_k": int(ai_settings.get("top_k", 60)),
        "repetition_penalty": float(ai_settings.get("repetition_penalty", 1.10)),
        "auto_unload": False,
        "require_vision": False,
        "free_comfy": bool(ai_settings.get("free_comfy_memory", False)),
        "min_p": 0.05,
        "check_interrupt": check_interrupt,
    }

    max_attempts = 1 + max(0, int(ai_settings.get("max_retries", 0)))
    mode_label = "attributes_only" if is_attribute_mode else "full_rewrite"

    chosen_values: Dict[str, str] = {}
    parsed_items: List[Dict[str, Any]] = []
    raw_output = ""
    cleaned_prompt = ""
    status_note = ""
    meta: Dict[str, Any] = {}

    try:
        for attempt in range(max_attempts):
            avoidance = {}
            if use_variation_cache:
                avoidance = {cat: list(vals) for cat, vals in recent.items()}
                for cat, val in chosen_values.items():
                    if val not in avoidance.setdefault(cat, []):
                        avoidance[cat].append(val)
            constraint_text = _constraint_text(enabled_categories, options, avoidance, directions)

            if is_attribute_mode:
                user_msg = build_attribute_instruction(prompt, enabled_categories, constraint_text)
            else:
                user_msg = build_user_instruction(prompt, enabled_categories, constraint_text, use_report=use_variation_cache)

            logger.info(
                f"[Prompt Randomizer] Attempt {attempt + 1}/{max_attempts} ({mode_label}) with model '{model_id}', "
                f"node {node_id!r}, directions: {directions}"
            )
            raw_output, meta = generate_text_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                seed=run_seed + attempt,
                on_progress=on_progress,
                **llm_kwargs,
            )

            # Parse output
            if is_attribute_mode:
                parsed_items = parse_ai_attribute_report(raw_output, enabled_categories=enabled_categories)
                parsed_cats = {item["category"] for item in parsed_items}
                if any(c not in parsed_cats for c in enabled_categories):
                    for k, v in _parse_chosen_from_follow_up(raw_output).items():
                        if k not in parsed_cats:
                            parsed_items.append({"category": k, "replaces": None, "value": v})
                            parsed_cats.add(k)
                chosen_values = {item["category"]: item["value"] for item in parsed_items if item.get("value")}
            elif use_variation_cache:
                prompt_part, chosen_values = _split_prompt_and_report(raw_output)
                if not chosen_values and enabled_categories:
                    chosen_values = _do_follow_up_extraction(prompt_part, enabled_categories, llm_kwargs, run_seed)
                cleaned_prompt = _clean_output_text(prompt_part)
            else:
                cleaned_prompt = _clean_output_text(raw_output)
                chosen_values = {}

            # Feature A: repeat check & contrast handling
            repeats = check_repeats(node_key, chosen_values) if (use_variation_cache and node_id and chosen_values) else {}
            if repeats and attempt < max_attempts - 1:
                logger.info(f"[Prompt Randomizer] Repeat detected in {list(repeats)}; retrying (attempt {attempt + 2}/{max_attempts}).")
                continue

            if repeats and is_attribute_mode:
                replaced_from_pool = []
                recent_used_norm = {cat: {_normalize(v) for v in vals} for cat, vals in recent.items()}
                for rcat, rval in repeats.items():
                    fresh_val = None
                    pool = AI_CREATIVE_POOLS.get(rcat, [])
                    if pool:
                        used = recent_used_norm.get(rcat, set())
                        curr_cluster = get_cluster(rval, rcat)
                        different_entries = (
                            [e for e in pool if get_cluster(e, rcat) != curr_cluster and _normalize(e) not in used]
                            or [e for e in pool if _normalize(e) not in used]
                            or [e for e in pool if e.lower().strip() != rval.lower().strip()]
                        )
                        if different_entries:
                            pool_seed = int(hashlib.sha256(f"{run_seed}:{node_key}:{rcat}:pool:{attempt}".encode()).hexdigest()[:16], 16)
                            fresh_val = random.Random(pool_seed).choice(different_entries)
                    if not fresh_val:
                        # Categories without a creative pool (nationality, hair_type, ...) draw from the database.
                        entry = get_randomizer_pipeline().selector.select(
                            node_id=node_key,
                            category_id=rcat,
                            options=options.get(rcat),
                        )
                        if entry and entry.get("text"):
                            fresh_val = str(entry["text"]).strip()

                    if fresh_val:
                        chosen_values[rcat] = fresh_val
                        for item in parsed_items:
                            if item.get("category") == rcat:
                                item["value"] = fresh_val
                                break
                        else:
                            parsed_items.append({"category": rcat, "replaces": None, "value": fresh_val})
                        replaced_from_pool.append(rcat)

                if replaced_from_pool:
                    logger.info(f"[Prompt Randomizer] Repeated categories {replaced_from_pool} swapped to fresh contrasting variations.")
                    status_note = f" (varied: {', '.join(replaced_from_pool)})"
                else:
                    status_note = f" (repeated: {', '.join(repeats)})"
            elif repeats:
                status_note = f" (repeated: {', '.join(repeats)})"
                logger.info(f"[Prompt Randomizer] Repeat detected; accepting values for: {', '.join(repeats)}.")

            # Apply in-place replacements or full-prompt fallback
            if not is_attribute_mode:
                cleaned_prompt = clean_duplicate_tokens(cleaned_prompt)
            elif parsed_items:
                cleaned_prompt = apply_ai_attribute_replacements(prompt, parsed_items, enabled_categories)
            else:
                cleaned_raw = _clean_output_text(raw_output)
                if len(cleaned_raw) > 20 and cleaned_raw.strip().lower() != prompt.strip().lower():
                    logger.info("[Prompt Randomizer] Attribute lines not found in LLM output; using the full rewritten prompt.")
                    cleaned_prompt = clean_duplicate_tokens(cleaned_raw)
                else:
                    logger.warning("[Prompt Randomizer] LLM output unparseable or identical; using database pipeline fallback.")
                    cleaned_prompt = get_randomizer_pipeline().process(
                        prompt=prompt,
                        enabled_categories=enabled_categories,
                        category_options=options,
                        node_id=node_key,
                        seed=run_seed,
                    )
            break
    finally:
        if auto_unload:
            unload_model()

    cache_stats = {}
    if use_variation_cache and node_id and chosen_values:
        record_run(node_key, chosen_values, batch_size=cache_size)
        cache_stats = get_cache_stats(node_key, batch_size=cache_size)

    return {
        "status": "completed",
        "prompt": cleaned_prompt,
        "raw": raw_output,
        "seed": run_seed,
        "chosen_values": chosen_values,
        "cache_stats": cache_stats,
        "status_note": status_note,
        **meta,
    }


def _do_follow_up_extraction(
    prompt_text: str,
    enabled_categories: List[str],
    llm_kwargs: Dict[str, Any],
    run_seed: int,
) -> Dict[str, str]:
    """
    One-shot follow-up call (on the still-loaded model) to extract category values when
    the full rewrite did not include the report block.
    """
    extract_msg = (
        f"Given this image prompt:\n{prompt_text}\n\n"
        f"List the value chosen for each of these categories: {', '.join(enabled_categories)}.\n"
        f"Output only lines in this exact format (one per category):\n"
        f"##CATVAL## category_id: chosen value\n"
        f"If a category is not present in the prompt, skip it."
    )
    kwargs = dict(llm_kwargs, temperature=0.1, max_tokens=256, top_p=0.9, top_k=40, repetition_penalty=1.0)
    try:
        raw, _ = generate_text_completion(
            messages=[
                {"role": "system", "content": "Extract category values. Output only ##CATVAL## lines, nothing else."},
                {"role": "user", "content": extract_msg},
            ],
            seed=run_seed,
            **kwargs,
        )
    except GenerationCancelled:
        raise
    except Exception as e:
        logger.warning(f"[Prompt Randomizer] Follow-up extraction failed: {e}")
        return {}
    return _parse_chosen_from_follow_up(raw)
