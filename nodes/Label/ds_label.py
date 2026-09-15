"""Backend registration for the frontend-only DS Label canvas annotation."""


class DS_Label:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/🎨 UI"

    def noop(self):
        return ()
