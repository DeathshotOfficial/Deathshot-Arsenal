import json
import random


class AnyType(str):
    def __ne__(self, other):
        return False

    def __eq__(self, other):
        return True


any_type = AnyType("*")


class DS_Controller:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "controller_data": ("STRING", {"default": "[]"}),
            },
        }

    RETURN_TYPES = tuple([any_type] * 32)
    RETURN_NAMES = tuple([""] * 32)
    FUNCTION = "execute"
    CATEGORY = "☠️ Deathshot Arsenal/🎛️ Control"

    @classmethod
    def IS_CHANGED(cls, controller_data="[]", **kwargs):
        try:
            rows = json.loads(controller_data) if isinstance(controller_data, str) else controller_data
            if isinstance(rows, list):
                for row in rows:
                    if isinstance(row, dict):
                        dtype = str(row.get("detectedType", "")).strip().lower()
                        smode = str(row.get("seedMode", "")).strip().lower()
                        if dtype == "seed" and smode == "random":
                            return float("nan")
        except Exception:
            pass
        return str(controller_data)

    @staticmethod
    def _convert_row_value(row):
        if not isinstance(row, dict):
            return row

        dtype = str(row.get("detectedType", "")).strip().lower()
        if dtype in ("slider", "float"):
            dtype = "float"
        elif dtype in ("boolean", "toggle"):
            dtype = "toggle"
        elif dtype in ("combo", "list"):
            dtype = "list"
        elif dtype in ("string", "text"):
            dtype = "text"
        elif dtype in ("integer", "int"):
            dtype = "int"

        raw_val = row.get("value")
        seed_mode = str(row.get("seedMode", "fixed")).strip().lower()

        if dtype == "seed":
            if seed_mode == "random":
                return random.randint(0, 0xffffffffffffffff)
            try:
                val = int(raw_val)
            except (TypeError, ValueError):
                val = 0
            return max(0, min(0xffffffffffffffff, val))

        elif dtype == "int":
            try:
                return int(round(float(raw_val)))
            except (TypeError, ValueError):
                try:
                    return int(row.get("min", 0))
                except (TypeError, ValueError):
                    return 0

        elif dtype == "float":
            try:
                return float(raw_val)
            except (TypeError, ValueError):
                try:
                    return float(row.get("min", 0.0))
                except (TypeError, ValueError):
                    return 0.0

        elif dtype == "toggle":
            if isinstance(raw_val, str):
                return raw_val.strip().lower() in ("true", "1", "yes", "on")
            return bool(raw_val)

        elif dtype == "list":
            return str(raw_val) if raw_val is not None else ""

        elif dtype == "text":
            return str(raw_val) if raw_val is not None else ""

        else:
            if raw_val is None:
                return None
            if isinstance(raw_val, (int, float, bool, str)):
                return raw_val
            return str(raw_val)

    def execute(self, controller_data="[]", unique_id=None, prompt=None, extra_pnginfo=None, **kwargs):
        rows = []

        # 1. Parse serialized controller_data from hidden input widget
        if controller_data:
            try:
                parsed = json.loads(controller_data) if isinstance(controller_data, str) else controller_data
                if isinstance(parsed, list) and len(parsed) > 0:
                    rows = parsed
            except Exception as e:
                print(f"[DS Controller] Failed to parse controller_data: {e}", flush=True)

        # 2. Fallback: inspect extra_pnginfo workflow if controller_data was empty
        if not rows and extra_pnginfo and isinstance(extra_pnginfo, dict):
            workflow = extra_pnginfo.get("workflow", {})
            if isinstance(workflow, dict):
                for n in workflow.get("nodes", []):
                    if str(n.get("id")) == str(unique_id):
                        rows = n.get("properties", {}).get("ds_controller_rows") or n.get("controller_rows") or []
                        break

        # 3. Fallback: check prompt dictionary for unique_id
        if not rows and prompt and isinstance(prompt, dict) and unique_id:
            node_prompt = prompt.get(str(unique_id), {})
            inputs = node_prompt.get("inputs", {}) if isinstance(node_prompt, dict) else {}
            if "controller_data" in inputs:
                try:
                    cdata = inputs["controller_data"]
                    parsed = json.loads(cdata) if isinstance(cdata, str) else cdata
                    if isinstance(parsed, list):
                        rows = parsed
                except Exception:
                    pass

        # Identify any output slots that are actively connected in the prompt graph
        connected_slots = set()
        if prompt and unique_id:
            for nid, node_data in prompt.items():
                if isinstance(node_data, dict):
                    for in_name, in_val in node_data.get("inputs", {}).items():
                        if isinstance(in_val, list) and len(in_val) == 2:
                            if str(in_val[0]) == str(unique_id):
                                try:
                                    connected_slots.add(int(in_val[1]))
                                except (TypeError, ValueError):
                                    pass

        # Build output tuple of 32 items
        output_values = []
        for i in range(32):
            if i < len(rows):
                val = self._convert_row_value(rows[i])
                output_values.append(val)
            elif i in connected_slots:
                # Connected slot without a configured row: provide safe numeric fallback
                output_values.append(0)
            else:
                output_values.append(None)

        # Log active controls to terminal for clear execution visibility
        active_controls = []
        for i, r in enumerate(rows):
            if i < len(output_values):
                label = r.get("label") or f"Slot {i}"
                dtype = r.get("detectedType") or "unknown"
                active_controls.append(f"{label}: {output_values[i]} ({dtype})")
        controls_summary = ", ".join(active_controls) if active_controls else "no active controls"
        node_str = f"node '{unique_id}'" if unique_id else "controller"
        print(f"[DS Controller] Executing on {node_str} with {len(rows)} control(s): [{controls_summary}].", flush=True)

        return tuple(output_values)


NODE_CLASS_MAPPINGS = {"DS_Controller": DS_Controller}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_Controller": "DS Controller"}
