# DeathshotArsenal/ds_resolution.py
"""DS Resolution - aspect-ratio + megapixel based resolution selector."""

class DS_Resolution:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "width": ("INT", {"default": 768, "min": 64, "max": 16384, "step": 1}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 1}),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "get_resolution"
    CATEGORY = "☠️ Deathshot Arsenal/🔢 Values"

    def get_resolution(self, width=768, height=1024, **kwargs):
        # JS keeps res_width/res_height in node.properties so the actual
        # resolution survives workflow save/load and browser refresh.
        try:
            w = int(kwargs.get("res_width", width))
        except (TypeError, ValueError):
            w = int(width or 768)
        try:
            h = int(kwargs.get("res_height", height))
        except (TypeError, ValueError):
            h = int(height or 1024)

        w = max(64, min(16384, w))
        h = max(64, min(16384, h))
        return (w, h)
