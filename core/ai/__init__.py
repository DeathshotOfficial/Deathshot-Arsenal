"""
Deathshot Arsenal - Centralized AI Core Package
Provides unified GGUF model scanning, llama.cpp execution, hardware telemetry,
and prompt randomization across all custom nodes.
"""

import asyncio
import logging
try:
    from aiohttp import web
    import server
except ImportError:
    web = None
    server = None

from .hardware_telemetry import get_hardware_info
from .model_scanner import list_builtin_models, register_llm_folders
from .llama_service import (
    unload_model,
    kill_active_generation,
    get_backend_status,
    generate_text_completion,
)
from .prompt_randomizer import randomize_prompt, RANDOMIZER_SYSTEM_PROMPT
from .variation_cache import (
    clear_node_cache,
    clear_all_cache,
    get_cache_stats,
)

logger = logging.getLogger("DeathshotArsenal.Core.AI")

__all__ = [
    "get_hardware_info",
    "list_builtin_models",
    "register_llm_folders",
    "unload_model",
    "kill_active_generation",
    "get_backend_status",
    "generate_text_completion",
    "randomize_prompt",
    "clear_node_cache",
    "clear_all_cache",
    "get_cache_stats",
    "register_ai_routes",
]


def register_ai_routes():
    """Register centralized HTTP API endpoints on ComfyUI's PromptServer."""
    try:
        if not hasattr(server, "PromptServer") or server.PromptServer.instance is None:
            return
        routes = server.PromptServer.instance.routes
    except Exception as e:
        logger.warning(f"[Centralized AI] Route registration skipped: {e}")
        return

    # 1. Models Catalog
    @routes.get("/ds/ai/default_prompt")
    async def _ai_default_prompt(request):
        return web.json_response({"ok": True, "prompt": RANDOMIZER_SYSTEM_PROMPT})

    @routes.get("/ds/ai/models")
    async def _ai_models(request):
        try:
            models = list_builtin_models()
            return web.json_response({"ok": True, "models": models})
        except Exception as e:
            logger.error(f"[Centralized AI] Failed to scan models: {e}")
            return web.json_response({"ok": False, "error": str(e), "models": []})

    # 2. Hardware Telemetry
    @routes.get("/ds/ai/hardware")
    async def _ai_hardware(request):
        try:
            hw = get_hardware_info()
            return web.json_response({"ok": True, **hw})
        except Exception as e:
            logger.warning(f"[Centralized AI] Hardware info error: {e}")
            return web.json_response({"ok": False, "error": str(e)})

    # 3. Model Loaded Status
    @routes.get("/ds/ai/status")
    async def _ai_status(request):
        try:
            st = get_backend_status()
            return web.json_response({"ok": True, **st})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    # 4. Unload Model Now
    @routes.post("/ds/ai/unload")
    async def _ai_unload(request):
        try:
            unloaded = unload_model()
            return web.json_response({"ok": True, "unloaded": unloaded})
        except Exception as e:
            logger.error(f"[Centralized AI] Unload error: {e}")
            return web.json_response({"ok": False, "error": str(e)})

    # 5. Kill Generation
    @routes.post("/ds/ai/kill")
    async def _ai_kill(request):
        try:
            killed = kill_active_generation()
            return web.json_response({"ok": True, "killed": killed})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    # 6. Prompt Randomization Endpoint
    @routes.post("/ds/ai/randomize")
    async def _ai_randomize(request):
        try:
            data = await request.json()
            prompt = str(data.get("prompt") or data.get("text") or "").strip()
            enabled_categories = data.get("enabled_categories", [])
            options = data.get("options", {})
            ai_settings = data.get("ai_settings", {})
            ai_cfg = dict(ai_settings)
            ai_cfg["require_vision"] = False
            seed = data.get("seed")
            node_id = str(data.get("node_id") or "")

            result = await asyncio.to_thread(
                randomize_prompt,
                prompt=prompt,
                enabled_categories=enabled_categories,
                options=options,
                ai_settings=ai_cfg,
                seed=seed,
                node_id=node_id or None,
            )
            return web.json_response({"ok": True, **result})
        except Exception as e:
            logger.error(f"[Centralized AI] Randomization error: {e}")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    # 7. Variation Cache Reset (Feature A — separate from DB shuffle-bag reset)
    @routes.post("/ds/randomizer/ai_reset_history")
    async def _ai_reset_history(request):
        try:
            data = await request.json()
            node_id = str(data.get("node_id") or "")
            if node_id:
                clear_node_cache(node_id)
                msg = f"Variation cache cleared for node '{node_id}'."
            else:
                clear_all_cache()
                msg = "All variation caches cleared."
            logger.info(f"[Centralized AI] {msg}")
            return web.json_response({"ok": True, "message": msg})
        except Exception as e:
            logger.error(f"[Centralized AI] Cache reset error: {e}")
            return web.json_response({"ok": False, "error": str(e)}, status=500)

    logger.info("[DeathshotArsenal] Centralized AI routes registered (/ds/ai/*)")
