# DeathshotArsenal/ds_system_monitor.py

import os
import json

import server
from aiohttp import web

CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "config")
LAYOUT_FILE = os.path.join(CONFIG_DIR, "system_monitor_layout.json")

DEFAULT_LAYOUT = {
    "dashW": 900,
    "dashH": 540,
    "updateInterval": 300,
    "graphInterval": 500,
}

os.makedirs(CONFIG_DIR, exist_ok=True)


def _load_layout():
    if not os.path.exists(LAYOUT_FILE):
        return dict(DEFAULT_LAYOUT)
    try:
        with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return dict(DEFAULT_LAYOUT)
        merged = {**DEFAULT_LAYOUT, **data}
        merged["dashW"] = max(640, min(1800, int(merged.get("dashW", DEFAULT_LAYOUT["dashW"]))))
        merged["dashH"] = max(340, min(1400, int(merged.get("dashH", DEFAULT_LAYOUT["dashH"]))))
        merged["updateInterval"] = max(100, min(2000, int(merged.get("updateInterval", 300))))
        merged["graphInterval"] = max(100, min(2000, int(merged.get("graphInterval", 500))))
        return merged
    except Exception as e:
        print(f"[DS System Monitor] Failed to load layout: {e}")
        return dict(DEFAULT_LAYOUT)


def _save_layout(data):
    cleaned = {
        "dashW": max(640, min(1800, int(data.get("dashW", DEFAULT_LAYOUT["dashW"])))),
        "dashH": max(340, min(1400, int(data.get("dashH", DEFAULT_LAYOUT["dashH"])))),
        "updateInterval": max(100, min(2000, int(data.get("updateInterval", DEFAULT_LAYOUT["updateInterval"])))),
        "graphInterval": max(100, min(2000, int(data.get("graphInterval", DEFAULT_LAYOUT["graphInterval"])))),
    }
    try:
        tmp = LAYOUT_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cleaned, f, indent=2)
        os.replace(tmp, LAYOUT_FILE)
        return cleaned
    except Exception as e:
        print(f"[DS System Monitor] Failed to save layout: {e}")
        return None


@server.PromptServer.instance.routes.get("/ds/sysmonitor/layout")
async def sysmonitor_get_layout(_request):
    return web.json_response(_load_layout())


@server.PromptServer.instance.routes.post("/ds/sysmonitor/layout")
async def sysmonitor_save_layout(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    if not isinstance(body, dict):
        return web.json_response({"error": "invalid body"}, status=400)
    saved = _save_layout(body)
    if saved is None:
        return web.json_response({"error": "save failed"}, status=500)
    return web.json_response(saved)


class DS_SystemMonitor:
    """
    DS System Monitor — real-time workflow & hardware dashboard.
    Visual-only node: no graph inputs, outputs, or execution ports.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "monitor"
    CATEGORY = "☠️ Deathshot Arsenal/🖥️ Monitoring"
    OUTPUT_NODE = True

    def monitor(self):
        return ()