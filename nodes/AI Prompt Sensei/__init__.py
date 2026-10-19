"""
Deathshot Arsenal — DS AI Prompt Sensei Node Package
"""

import asyncio
import logging

import comfy.ldm.modules.attention as comfy_attention
import folder_paths
import server
from aiohttp import web

from core.ai import (
    abort_generation,
    get_backend_status,
    get_hardware_info,
    get_realtime_hw_stats,
    list_builtin_models,
    lm_studio,
    perform_hardware_action,
    unload_model,
)

from .ds_ai_prompt_sensei import DS_AIPromptSensei, NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS, ATTENTION_FUNCTIONS
from .llm_engine import generate_prompt

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei")


def register_prompt_sensei_routes():
    routes = server.PromptServer.instance.routes

    @routes.get("/ds/prompt_sensei/models")
    async def get_models_handler(request):
        try:
            diff_models = folder_paths.get_filename_list("checkpoints") + folder_paths.get_filename_list("diffusion_models")
            clips = folder_paths.get_filename_list("clip") + folder_paths.get_filename_list("text_encoders")
            # Only offer attention backends this ComfyUI install actually registered.
            attentions = ["default"] + [k for k, fn in ATTENTION_FUNCTIONS.items()
                                        if fn in comfy_attention.REGISTERED_ATTENTION_FUNCTIONS]
            return web.json_response({
                "models": sorted(set(diff_models), key=str.lower),
                "vaes": sorted(folder_paths.get_filename_list("vae"), key=str.lower),
                "clips": sorted(set(clips), key=str.lower),
                "loras": sorted(folder_paths.get_filename_list("loras"), key=str.lower),
                "attentions": attentions,
            })
        except Exception as e:
            logger.error(f"[Prompt Sensei] Failed to get models: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.get("/ds/prompt_sensei/lm_studio/models")
    async def lm_studio_models_handler(request):
        res = await asyncio.to_thread(
            lm_studio.fetch_models,
            ip=request.query.get("ip", "127.0.0.1"),
            port=request.query.get("port", "1234"),
        )
        if not res["ok"]:
            res["error"] = f"LM Studio unavailable\n{res['address']}"
        return web.json_response(res)

    @routes.post("/ds/prompt_sensei/generate")
    async def generate_handler(request):
        data = await request.json()
        mode = str(data.get("mode") or "i2v").lower()
        provider = str(data.get("provider") or "lm_studio").lower()

        if mode == "custom":
            return web.json_response({
                "status": "completed",
                "prompt": str(data.get("custom_text") or data.get("scene_notes") or "").strip(),
                "tokens": 0,
                "speed": 0.0,
                "elapsed": 0.01,
                "model": "Custom",
            })

        system_prompts = data.get("system_prompts") or {}
        auto_unload = bool(data.get("auto_unload", False))
        if provider == "built_in":
            cfg = dict(data.get("built_in") or {})
            cfg.setdefault("auto_unload", auto_unload)
        else:
            cfg = dict(data.get("lm_studio") or {})
            cfg["unload_after_run"] = auto_unload or bool(cfg.get("unload_after_run", False))

        image_path = None
        if mode not in ("t2i", "t2v"):
            image_path = data.get("image_path") or (data.get("context") or {}).get("image_path") or None

        result = await asyncio.to_thread(
            generate_prompt,
            provider=provider,
            mode=mode,
            scene_notes=data.get("scene_notes", ""),
            system_prompt=data.get("system_prompt") or system_prompts.get(mode, ""),
            image_path=image_path,
            cfg=cfg,
            node_id=data.get("node_id"),
        )
        return web.json_response(result)

    @routes.post("/ds/prompt_sensei/kill")
    async def kill_handler(request):
        killed_lm = lm_studio.cancel_generation()
        killed_builtin = abort_generation()
        return web.json_response({
            "killed": bool(killed_lm or killed_builtin),
            "builtin": killed_builtin,
            "lm_studio": killed_lm,
        })

    @routes.post("/ds/prompt_sensei/builtin/abort")
    async def builtin_abort_handler(request):
        return web.json_response({"killed": abort_generation()})

    @routes.post("/ds/prompt_sensei/start_lm_server")
    async def start_lm_server_handler(request):
        data = await request.json()
        ok, msg = await asyncio.to_thread(lm_studio.start_server, port=int(data.get("port") or 1234))
        return web.json_response({"ok": ok, "message": msg})

    @routes.get("/ds/prompt_sensei/builtin/models")
    async def builtin_models_handler(request):
        try:
            models = await asyncio.to_thread(list_builtin_models)
            return web.json_response({"ok": True, "models": models})
        except Exception as e:
            logger.error(f"[Prompt Sensei] Failed to query builtin models: {e}")
            return web.json_response({"ok": False, "error": str(e), "models": []})

    @routes.post("/ds/prompt_sensei/builtin/unload")
    async def builtin_unload_handler(request):
        unloaded = await asyncio.to_thread(unload_model)
        return web.json_response({"ok": True, "unloaded": unloaded})

    @routes.get("/ds/prompt_sensei/builtin/status")
    async def builtin_status_handler(request):
        return web.json_response({"ok": True, **get_backend_status()})

    @routes.get("/ds/prompt_sensei/hardware")
    async def hardware_handler(request):
        return web.json_response(await asyncio.to_thread(get_hardware_info))

    @routes.get("/ds/prompt_sensei/hw_stats")
    async def hw_stats_handler(request):
        return web.json_response(await asyncio.to_thread(get_realtime_hw_stats))

    @routes.post("/ds/prompt_sensei/hw_action")
    async def hw_action_handler(request):
        body = await request.json()
        ok = await asyncio.to_thread(perform_hardware_action, str(body.get("action") or "").strip())
        return web.json_response({"ok": ok})

    logger.info("[DeathshotArsenal] DS AI Prompt Sensei routes registered successfully.")


__all__ = [
    "DS_AIPromptSensei",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "register_prompt_sensei_routes",
]
