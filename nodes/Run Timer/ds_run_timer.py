"""Deathshot Arsenal - DS Run Timer
Frontend-only workflow run timer.
"""
import json
import server
from aiohttp import web


class DS_RunTimer:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/🖥️ Monitoring"
    OUTPUT_NODE = False

    def noop(self):
        return ()


if not getattr(server.PromptServer, "_ds_run_timer_log_route", False):
    @server.PromptServer.instance.routes.post("/ds/run_timer/log")
    async def ds_run_timer_log(request):
        try:
            payload = await request.json()
            event = str(payload.get("event", "log"))[:80]
            detail = payload.get("detail", "")
            if isinstance(detail, (dict, list)):
                detail = json.dumps(detail, ensure_ascii=False, separators=(",", ":"))
            print(f"[DS Run Timer] {event}: {str(detail)[:600]}", flush=True)
            return web.json_response({"ok": True})
        except Exception as e:
            print(f"[DS Run Timer] log endpoint error: {e}", flush=True)
            return web.json_response({"ok": False, "error": str(e)}, status=400)
    server.PromptServer._ds_run_timer_log_route = True

NODE_CLASS_MAPPINGS = {"DS_RunTimer": DS_RunTimer}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_RunTimer": "DS Run Timer"}
