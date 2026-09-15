"""DS Notes - DeathshotArsenal.

Rich text documentation, instructions, descriptions, guides, changelogs,
and workflow notes directly inside ComfyUI.
"""


class DS_Notes:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/🎨 UI"
    DESCRIPTION = (
        "Rich text documentation and workflow note node with compact preview and full editor."
    )

    def noop(self, **kwargs):
        return ()


NODE_CLASS_MAPPINGS = {
    "DS_Notes": DS_Notes,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_Notes": "DS Notes",
}
