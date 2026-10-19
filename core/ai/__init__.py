"""
Deathshot Arsenal - Centralized AI Core Package
One shared LLM runtime for every DS AI node: GGUF model discovery, the in-process llama.cpp
engine (Built-In), the LM Studio client, and hardware telemetry.
Nodes import it as `core.ai` so the whole pack shares a single loaded model.
"""

import asyncio
import logging

import server
from aiohttp import web

from . import lm_studio
from .hardware_telemetry import get_hardware_info, get_realtime_hw_stats, perform_hardware_action
from .llama_service import (
    abort_generation,
    generate_chat,
    generate_text_completion,
    get_backend_status,
    image_data_url,
    load_model,
    loaded_model_name,
    unload_model,
)
from .model_scanner import list_builtin_models, register_llm_folders, resolve_model_key
from .stream_filter import GenerationCancelled

logger = logging.getLogger("DeathshotArsenal.Core.AI")

__all__ = [
    "lm_studio",
    "get_hardware_info",
    "get_realtime_hw_stats",
    "perform_hardware_action",
    "abort_generation",
    "generate_chat",
    "generate_text_completion",
    "get_backend_status",
    "image_data_url",
    "load_model",
    "loaded_model_name",
    "unload_model",
    "kill_active_generation",
    "list_builtin_models",
    "register_llm_folders",
    "resolve_model_key",
    "GenerationCancelled",
    "register_ai_routes",
]


def kill_active_generation() -> bool:
    """Stop whatever is generating on either backend."""
    lm_studio.cancel_generation()
    return abort_generation()


def register_ai_routes():
    """Register the shared /ds/ai/* endpoints on ComfyUI's PromptServer."""
    routes = server.PromptServer.instance.routes

    @routes.get("/ds/ai/models")
    async def _ai_models(request):
        try:
            models = await asyncio.to_thread(list_builtin_models)
            return web.json_response({"ok": True, "models": models})
        except Exception as e:
            logger.error(f"[Centralized AI] Failed to scan models: {e}")
            return web.json_response({"ok": False, "error": str(e), "models": []})

    @routes.get("/ds/ai/hardware")
    async def _ai_hardware(request):
        hw = await asyncio.to_thread(get_hardware_info)
        return web.json_response({"ok": True, **hw})

    @routes.get("/ds/ai/status")
    async def _ai_status(request):
        return web.json_response({"ok": True, **get_backend_status()})

    @routes.post("/ds/ai/unload")
    async def _ai_unload(request):
        unloaded = await asyncio.to_thread(unload_model)
        return web.json_response({"ok": True, "unloaded": unloaded})

    @routes.post("/ds/ai/kill")
    async def _ai_kill(request):
        return web.json_response({"ok": True, "killed": kill_active_generation()})

    logger.info("[DeathshotArsenal] Centralized AI routes registered (/ds/ai/*)")
