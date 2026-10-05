"""
Deathshot Arsenal — DS AI Prompt Sensei
Prompt Manager: Manages per-mode default system prompts (I2V, T2I, T2V)
and output text sanitization (reasoning tags, quotes, etc.).
"""

import os
import re

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")

FALLBACK_PROMPTS = {
    "i2v": (
        "You are an LTX-2.5 i2v prompt generator. I will give you an image plus short notes on the scene idea. "
        "You write ONE positive prompt per image, as three paragraphs of flowing prose with no headings, no lists, no labels. "
        "You output ONLY the finished prompt — no commentary, no analysis, no reasoning steps, no negatives."
    ),
    "t2i": (
        "You are a Krea 2 Text to Image prompt writer specialized in transforming brief scene descriptions into "
        "highly detailed, structured, and cinematic image generation prompts. You output only the prompt — no comments or explanations."
    ),
    "t2v": (
        "You are an expert AI video prompt generator specialized in transforming brief scene descriptions into "
        "detailed, continuous-motion Text-to-Video prompts for modern video diffusion models (LTX-Video, Wan 2.1, HunyuanVideo). "
        "You output ONLY the finished prompt — no preamble, no commentary, no quotes, no markdown headers."
    ),
}


def load_default_prompt(mode: str) -> str:
    """Load default system prompt for the specified mode from disk or fallback."""
    mode_key = str(mode or "i2v").lower().strip()
    filename = f"{mode_key}_default.txt"
    filepath = os.path.join(PROMPTS_DIR, filename)
    if os.path.isfile(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception:
            pass
    return FALLBACK_PROMPTS.get(mode_key, FALLBACK_PROMPTS["i2v"])


def get_all_default_prompts() -> dict:
    """Return dictionary of all default prompts keyed by mode."""
    return {
        "i2v": load_default_prompt("i2v"),
        "t2i": load_default_prompt("t2i"),
        "t2v": load_default_prompt("t2v"),
    }


def clean_generated_prompt(raw_text: str, system_prompt: str = None) -> str:
    """
    Sanitizes LLM output:
    - Removes <think>...</think>, <thought>...</thought>, and <|channel>thought...<channel|> blocks.
    - Strips surrounding quotes and markdown code fences.
    - Strips echoed system prompt text or preamble instructions.
    - Strips analysis/planning checklists (e.g. '* **Analyze Request:**', '* **Identify Key Elements:**').
    - Drops leading 'Prompt:' or '**Prompt:**' wrapper labels.
    - Normalizes '* **Style Check:**' or '* **Style:**' to 'Style:'.
    - Strips conversational intros ('Here is the prompt:', 'Sure, here is...').
    """
    if not raw_text:
        return ""

    text = str(raw_text).strip()

    # 1. Remove thinking / thought blocks and channels
    text = re.sub(r"<think>[\s\S]*?(?:</think>|$)", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<thought>[\s\S]*?(?:</thought>|$)", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"<\|channel\>thought[\s\S]*?(?:<channel\|>|$)", "", text, flags=re.IGNORECASE).strip()

    # 2. Strip surrounding markdown code blocks (e.g. ```text ... ``` or ``` ...)
    text = re.sub(r"^`{3,}[a-zA-Z0-9_-]*\s*\n?", "", text).strip()
    text = re.sub(r"\n?`{3,}\s*$", "", text).strip()

    # 3. Strip surrounding double or single quotes
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        if len(text) > 2:
            text = text[1:-1].strip()

    # 4. Strip user-provided or default system prompt if echoed verbatim or by prefix
    if system_prompt:
        sp = system_prompt.strip()
        if sp and text.startswith(sp):
            text = text[len(sp):].strip()
        else:
            pfx = sp[:min(60, len(sp))].strip()
            if pfx and pfx.lower() in text[:150].lower():
                idx = text.lower().find(pfx.lower())
                after = text[idx + len(pfx):]
                dnl = after.find("\n\n")
                if dnl >= 0:
                    text = after[dnl:].strip()

    # 5. Strip any echoed system instructions or multiline 'You are a/an...' preambles
    text = re.sub(r"(?is)^\s*(?:Instructions:\s*[\s\S]*?---\s*(?:Task:)?\s*)", "", text).strip()
    text = re.sub(r"(?is)^\s*You are (?:an?|the)\b[\s\S]*?(?:no negatives\.?|no comments or explanations\.?|direct use in [^\n\.]+\.?|no extra commentary\.?|\n\n+)", "", text).strip()

    # 6. If prompt starts with meta-analysis or planning bullets, find transition to actual prompt
    section_match = re.search(r"(?mi)^(?:\*\*)?(?:Prompt|Final Prompt|Generated Prompt|Style|Camera|Composition|Paragraph 1)(?:\s*Check)?\s*:?\s*(?:\*\*)?:?\s*", text)
    if section_match and section_match.start() > 0:
        preamble = text[:section_match.start()]
        if re.search(r"(?i)(goal|analyze|analysis|identify|elements|thought|plan|checklist|requirement|here is|here's|prompt writer|prompt generator|instructions|rules|strictly)", preamble):
            text = text[section_match.start():].strip()

    # 7. Strip leading 'Prompt:' or '**Prompt:**' label if present
    text = re.sub(r"(?i)^\s*(?:\*\*)?(?:Prompt|Final Prompt|Generated Prompt|Output)\s*:?\s*(?:\*\*)?:?\s*", "", text).strip()

    # 8. Strip conversational intros
    text = re.sub(r"(?i)^\s*(?:Here(?:\'s| is) (?:a |the )?(?:generated )?prompt:?|Sure, here is the prompt:?)\s*", "", text).strip()

    # 9. Strip any remaining leading goal/check lines (e.g. '* **Goal:** ...', '* **Analyze Request:** ...')
    lines = text.splitlines()
    clean_lines = []
    skipping_meta = True
    for line in lines:
        stripped = line.strip()
        if skipping_meta and (
            re.match(r"^[\*\-]?\s*\*\*(?:Goal|Plan|Analysis|Analyze|Note|Objective|Requirement|Task|Identify)[\w\s]*:?\*\*:?", stripped, re.IGNORECASE)
            or re.match(r"^Here(?:\'s| is) (?:a |the )?(?:thinking process|generated prompt|prompt)[\s\S]*?:?$", stripped, re.IGNORECASE)
            or re.match(r"^(?:Sure|Certainly|Here is the prompt)[^:\n]*:?$", stripped, re.IGNORECASE)
        ):
            continue
        skipping_meta = False
        clean_lines.append(line)

    text = "\n".join(clean_lines).strip()

    # 10. Normalize section headers:
    # '* **Style Check:**' -> 'Style: '
    # '* **Style:**' or '**Style**:' -> 'Style: '
    text = re.sub(r"(?mi)^\s*[\*\-]?\s*\*\*([A-Za-z0-9\s/()_-]+?)\s*Check\s*:?\*\*:?\s*", r"\1: ", text)
    text = re.sub(r"(?mi)^\s*[\*\-]?\s*\*\*([A-Za-z0-9\s/()_-]+?):?\*\*:?\s*", r"\1: ", text)

    return text.strip()
