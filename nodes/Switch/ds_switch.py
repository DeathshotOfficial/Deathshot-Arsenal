"""Deathshot Arsenal - DS Switch.

Conditional input selector / switch that routes one active input row to a single output.
The frontend dynamically expands rows as connections are made and ensures exactly one
toggle is active at a time. Server-side lazy evaluation guarantees only the active
row's upstream branch is executed.
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
        return (self.value_type, {"lazy": True, "forceInput": True})


class DS_Switch:
    """Select exactly one row from dynamically created input sockets to pass to the output."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_index": ("INT", {"default": 0, "min": 0, "max": 9999, "step": 1}),
            },
            "optional": FlexibleOptionalInputType(
                any_type,
                {
                    "input_1": (any_type, {"lazy": True, "forceInput": True}),
                },
            ),
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("",)
    FUNCTION = "switch"
    CATEGORY = "☠️ Deathshot Arsenal/🔀 Routing"

    def check_lazy_status(self, selected_index=0, **kwargs):
        """Ask ComfyUI to evaluate ONLY the active row's upstream branch."""
        try:
            idx = int(selected_index)
        except (ValueError, TypeError):
            idx = 0

        if idx <= 0:
            return []

        target_key = f"input_{idx}"
        if target_key in kwargs and kwargs[target_key] is None:
            return [target_key]

        return []

    def switch(self, selected_index=0, **kwargs):
        """Pass through the value from the selected row, or None if inactive/unconnected."""
        try:
            idx = int(selected_index)
        except (ValueError, TypeError):
            idx = 0

        if idx <= 0:
            return (None,)

        target_key = f"input_{idx}"
        val = kwargs.get(target_key, None)
        return (val,)


NODE_CLASS_MAPPINGS = {"DS_Switch": DS_Switch}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_Switch": "DS Switch"}
