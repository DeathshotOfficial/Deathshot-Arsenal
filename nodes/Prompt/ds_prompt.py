"""
DS Prompt - DeathshotArsenal

A lightweight prompt editor with a STRING output.
- Multiline prompt input.
- Optional wired LoRA trigger string.
- Expanded preview of the effective prompt.
- Copy / Clear / Replace-from-clipboard actions.

The frontend is responsible only for presentation and clipboard actions.
Prompt composition happens here so the actual STRING output is deterministic
and does not depend on browser state.
"""


def _clean(value):
    if value is None:
        return ""
    return str(value).strip()


def build_prompt(text, lora_triggers=None, trigger_position="after"):
    prompt = _clean(text)
    triggers = _clean(lora_triggers)

    if not triggers:
        return prompt
    if not prompt:
        return triggers

    # Avoid the most common accidental duplication when a loader sends the
    # same trigger text that the user already pasted into the prompt.
    if triggers == prompt or triggers in prompt:
        return prompt

    if trigger_position == "before":
        return f"{triggers}, {prompt}"
    return f"{prompt}, {triggers}"


class DS_Prompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "dynamicPrompts": False,
                        "tooltip": "The prompt text. The STRING output contains this text plus any wired LoRA triggers.",
                    },
                ),
            },
            "optional": {
                "trigger_position": (
                    "STRING",
                    {
                        "default": "after",
                        "tooltip": "Place wired LoRA triggers before or after the prompt.",
                    },
                ),
                "lora_triggers": (
                    "STRING",
                    {
                        "forceInput": True,
                        "default": "",
                        "tooltip": "Optional wired LoRA trigger words. They are appended to the prompt for the output and expanded preview.",
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "☠️ Deathshot Arsenal/✍️ Prompt"

    DESCRIPTION = (
        "DeathshotArsenal prompt editor. Write a multiline prompt, optionally "
        "wire LoRA trigger words into the trigger input, and use the expanded "
        "preview to inspect the effective prompt. Copy, Clear and Replace "
        "operate on the prompt field."
    )

    def process(self, text, trigger_position="after", lora_triggers=None):
        final_prompt = build_prompt(text, lora_triggers, trigger_position)
        return {
            "ui": {"prompt_preview": [final_prompt]},
            "result": (final_prompt,),
        }


NODE_CLASS_MAPPINGS = {
    "DS_Prompt": DS_Prompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_Prompt": "DS Prompt",
}
