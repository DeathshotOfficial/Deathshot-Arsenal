"""DS Dev Spawner - DeathshotArsenal.

Development tool node to spawn all Deathshot Arsenal nodes onto an empty canvas.
"""


class DS_DevSpawner:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/🛠️ Dev"
    DESCRIPTION = (
        "Development tool: When toggled ON, spawns all Deathshot Arsenal nodes onto an empty canvas."
    )

    def noop(self, **kwargs):
        return ()


NODE_CLASS_MAPPINGS = {
    "DS_DevSpawner": DS_DevSpawner,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_DevSpawner": "DS Dev Spawner",
}
