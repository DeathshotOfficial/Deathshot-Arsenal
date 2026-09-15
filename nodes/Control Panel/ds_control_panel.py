# ds_control_panel.py
import json

MAX_CONTROLS = 16


class AnyType(str):
    def __ne__(self, other):
        return False


ANY = AnyType("*")


def _coerce(control):
    ctype = (control or {}).get("type", "auto")
    value = (control or {}).get("value")

    try:
        if ctype in ("int", "seed"):
            if value is None:
                return 0
            return int(round(float(value)))

        if ctype == "float":
            if value is None:
                return 0.0
            return float(value)

        if ctype == "toggle":
            return bool(value)

        if ctype in ("combo", "text"):
            return "" if value is None else str(value)

        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value
        if value is None:
            return 0
        return str(value)
    except (TypeError, ValueError):
        return 0


class DS_ControlPanel:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "ControlState": (
                    "STRING",
                    {"default": "[]"},
                ),
            },
        }

    RETURN_TYPES = tuple([ANY] * MAX_CONTROLS)
    RETURN_NAMES = tuple(f"value_{i + 1}" for i in range(MAX_CONTROLS))
    FUNCTION = "run"
    CATEGORY = "☠️ Deathshot Arsenal/🎛️ Control"
    DESCRIPTION = "One polished panel for the workflow values, switches and pickers you tweak most - each row drives a real output socket."

    def run(self, ControlState="[]"):
        try:
            controls = json.loads(ControlState) if ControlState else []
            if not isinstance(controls, list):
                controls = []
        except (TypeError, ValueError):
            controls = []

        values = [_coerce(c) for c in controls[:MAX_CONTROLS]]
        # Never pad with None — pad with 0 so numerical nodes never receive NoneType
        if len(values) < MAX_CONTROLS:
            values.extend([0] * (MAX_CONTROLS - len(values)))

        return tuple(values)


NODE_CLASS_MAPPINGS = {"DS_ControlPanel": DS_ControlPanel}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ControlPanel": "DS Control Panel"}