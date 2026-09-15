"""DS Show Text - DeathshotArsenal.

Passes a STRING through unchanged while the frontend renders the current value
in a compact, theme-aware read-only preview with a copy action.
"""


class DS_ShowText:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "forceInput": True,
                        "default": "",
                        "dynamicPrompts": False,
                        "tooltip": "String to display and pass through unchanged.",
                    },
                ),
            },
        }

    # This is a display/sink utility: it must execute even when its passthrough
    # output is not connected, otherwise ComfyUI prunes it from the execution graph.
    OUTPUT_NODE = True

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "show"
    CATEGORY = "☠️ Deathshot Arsenal/✍️ Prompt"
    DESCRIPTION = (
        "Display a STRING value in a DeathshotArsenal preview and pass it "
        "through unchanged."
    )

    def show(self, text):
        value = "" if text is None else str(text)
        return {
            "ui": {"text_preview": [value]},
            "result": (value,),
        }


NODE_CLASS_MAPPINGS = {
    "DS_ShowText": DS_ShowText,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_ShowText": "DS Show Text",
}
