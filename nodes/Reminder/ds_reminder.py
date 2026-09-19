"""Deathshot Arsenal - DS Reminder
Persistent time-based reminder utility node and global reminder backend.
"""
import os
import json
import logging
import server
from aiohttp import web

logger = logging.getLogger("DeathshotArsenal.Reminder")

_HERE = os.path.dirname(__file__)
_PACK_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
CONFIG_DIR = os.path.join(_PACK_ROOT, "config")
STATE_FILE = os.path.join(CONFIG_DIR, "reminders.json")

os.makedirs(CONFIG_DIR, exist_ok=True)


def _load_reminders():
    if not os.path.isfile(STATE_FILE):
        return {"reminders": [], "settings": {"globalFullscreen": True, "masterVolume": 0.7}}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                return {"reminders": [], "settings": {"globalFullscreen": True, "masterVolume": 0.7}}
            if "reminders" not in data or not isinstance(data["reminders"], list):
                data["reminders"] = []
            if "settings" not in data or not isinstance(data["settings"], dict):
                data["settings"] = {"globalFullscreen": True, "masterVolume": 0.7}
            return data
    except Exception as e:
        logger.warning(f"Corrupted or unreadable reminders file, resetting gracefully: {e}")
        return {"reminders": [], "settings": {"globalFullscreen": True, "masterVolume": 0.7}}


def _save_reminders(data):
    try:
        tmp_file = f"{STATE_FILE}.tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        if os.path.exists(tmp_file):
            os.replace(tmp_file, STATE_FILE)
        return True
    except Exception as e:
        logger.error(f"Failed to persist reminders: {e}")
        return False


class DS_Reminder:
    """DS Reminder utility node for Deathshot Arsenal.
    Frontend-only persistent timer and reminder interface.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/🛠️ Utility"
    OUTPUT_NODE = False

    def noop(self):
        return ()


# Register Server API Routes for Global Persistence
def register_reminder_routes():
    if getattr(server.PromptServer, "_ds_reminder_routes_registered", False):
        return
    try:
        if not hasattr(server.PromptServer, "instance") or server.PromptServer.instance is None:
            return
        routes = server.PromptServer.instance.routes

        @routes.get("/ds/reminders")
        async def get_reminders(request):
            try:
                data = _load_reminders()
                return web.json_response({"ok": True, "data": data})
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        @routes.post("/ds/reminders")
        async def save_reminders(request):
            try:
                payload = await request.json()
                if not isinstance(payload, dict):
                    return web.json_response({"ok": False, "error": "Invalid payload format"}, status=400)
                ok = _save_reminders(payload)
                if ok:
                    return web.json_response({"ok": True})
                return web.json_response({"ok": False, "error": "Write failed"}, status=500)
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        server.PromptServer._ds_reminder_routes_registered = True
    except Exception as e:
        logger.warning(f"Deferred reminder route registration: {e}")

try:
    register_reminder_routes()
except Exception:
    pass

NODE_CLASS_MAPPINGS = {"DS_Reminder": DS_Reminder}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_Reminder": "DS Reminder"}

