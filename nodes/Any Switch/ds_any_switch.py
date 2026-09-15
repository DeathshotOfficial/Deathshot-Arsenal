"""Deathshot Arsenal - DS Any Switch.

Passes through the first non-empty value from a dynamic set of wildcard inputs.
The frontend keeps the visible input count small by default and can add more
inputs on demand.  The flexible optional-input contract lets ComfyUI accept
any connected type and any number of `any_XX` inputs.
"""


class AnyType(str):
    """Wildcard type that compares as compatible with other types."""

    def __ne__(self, other):
        return False


any_type = AnyType("*")


class FlexibleOptionalInputType(dict):
    """Accept arbitrary optional input names while retaining known defaults."""

    def __init__(self, value_type, data=None):
        self.value_type = value_type
        self.data = dict(data or {})
        super().__init__(self.data)

    def __contains__(self, key):
        return True

    def __getitem__(self, key):
        if key in self.data:
            return self.data[key]
        return (self.value_type,)


def _is_empty(value):
    """Match rgthree's useful notion of an empty switch value."""
    if value is None:
        return True

    # rgthree CONTEXT values can exist as a dict while containing no usable
    # model/clip pair. Treat those as empty rather than selecting them.
    if isinstance(value, dict) and "model" in value and "clip" in value:
        return value.get("model") is None and value.get("clip") is None

    return False


class DS_AnySwitch:
    """Select the first non-empty value from any_01, any_02, ... in order."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": FlexibleOptionalInputType(
                any_type,
                {
                    "any_01": (any_type,),
                    "any_02": (any_type,),
                },
            ),
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("*",)
    FUNCTION = "switch"
    CATEGORY = "☠️ Deathshot Arsenal/🔀 Routing"

    def switch(self, **kwargs):
        # Sort numerically so execution order is stable even if the incoming
        # dict was assembled differently by a ComfyUI version.
        keys = [k for k in kwargs if k.startswith("any_")]
        keys.sort(key=lambda k: int(k[4:]) if k[4:].isdigit() else 10**9)

        for key in keys:
            value = kwargs.get(key)
            if not _is_empty(value):
                return (value,)

        return (None,)


NODE_CLASS_MAPPINGS = {"DS_AnySwitch": DS_AnySwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_AnySwitch": "DS Any Switch"}
