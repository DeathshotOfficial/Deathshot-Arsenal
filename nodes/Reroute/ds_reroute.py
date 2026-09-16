"""Deathshot Arsenal — DS Reroute.

Generic pass-through routing node with editable label field.
Passes any compatible data through unchanged with zero computational overhead.
"""


class AnyType(str):
    """Wildcard type that compares as compatible with other types."""

    def __ne__(self, other):
        return False

    def __eq__(self, other):
        return True


any_type = AnyType("*")


class DS_Reroute:
    """Generic pass-through reroute node with descriptive label."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type, {}),
            },
            "optional": {
                "label": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "route"
    CATEGORY = "Routing"
    DESCRIPTION = "Generic pass-through routing node with editable descriptive label."

    def route(self, value=None, label=""):
        return (value,)
