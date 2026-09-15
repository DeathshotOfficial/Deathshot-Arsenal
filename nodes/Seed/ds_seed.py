"""Deathshot Arsenal DS Seed controller backend.

The visible UI is entirely frontend-owned.  The seed itself is a hidden INT
widget so ComfyUI can serialize and execute the value without rendering its
native seed/control-after-generate widget.
"""


class DS_Seed:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 9007199254740991,
                        "step": 1,
                    },
                ),
                "ds_seed_state": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "get_seed"
    CATEGORY = "☠️ Deathshot Arsenal/🔢 Values"

    @classmethod
    def IS_CHANGED(cls, seed=0, ds_seed_state="", **kwargs):
        return seed

    def get_seed(self, seed=0, ds_seed_state="", **kwargs):
        try:
            seed = int(seed)
        except (TypeError, ValueError):
            seed = 0
        return (max(0, min(9007199254740991, seed)),)


NODE_CLASS_MAPPINGS = {"DS_Seed": DS_Seed}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_Seed": "DS Seed"}
