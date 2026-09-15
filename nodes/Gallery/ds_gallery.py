# DeathshotArsenal/nodes/Gallery/ds_gallery.py
"""
DS Gallery - Deathshot Arsenal

Frontend-heavy media gallery and browser node for images and videos.
Provides fast thumbnail grid, searching, filtering, sorting, selection, deletion,
fullscreen lightbox viewing with zoom/pan, custom fullscreen video player,
and optional local NSFW protection.
"""

class DS_Gallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "folder_path": ("STRING", {"default": "", "forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    OUTPUT_NODE = True
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"
    DESCRIPTION = (
        "Fast local media gallery for images and videos with thumbnail grid, "
        "lightbox viewer, custom video player, search, filter, and NSFW detection."
    )

    def noop(self, **kwargs):
        return ()


NODE_CLASS_MAPPINGS = {
    "DS_Gallery": DS_Gallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_Gallery": "DS Gallery",
}
