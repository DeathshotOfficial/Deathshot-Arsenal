"""
Deathshot Arsenal — DS Image Describer Package
"""

import logging
import os
import server
from aiohttp import web

try:
    from .ds_image_describer import DS_ImageDescriber, NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from .describer_engine import (
        _get_builtin_llm,
        get_recent_logs,
        pause_manager,
        free_vram_and_comfy_models,
        get_vram_status,
        DEFAULT_SYSTEM_PROMPTS,
        describe_image_sync,
    )
except (ImportError, ValueError):
    import sys
    cur_dir = os.path.dirname(__file__)
    if cur_dir not in sys.path:
        sys.path.insert(0, cur_dir)
    from ds_image_describer import DS_ImageDescriber, NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from describer_engine import (
        _get_builtin_llm,
        get_recent_logs,
        pause_manager,
        free_vram_and_comfy_models,
        get_vram_status,
        DEFAULT_SYSTEM_PROMPTS,
        describe_image_sync,
    )


logger = logging.getLogger("DeathshotArsenal.ImageDescriber")


def register_image_describer_routes():
    """Register HTTP / WebSocket API routes for DS Image Describer."""
    try:
        routes = server.PromptServer.instance.routes

        # 1. Models Listing
        @routes.get("/ds/describer/models")
        async def get_models_handler(request):
            try:
                b_llm = _get_builtin_llm()
                if b_llm is None:
                    return web.json_response({"ok": False, "models": [], "error": "Builtin LLM engine not found"})
                models = b_llm.list_builtin_models()
                return web.json_response({"ok": True, "models": models})
            except Exception as e:
                logger.error(f"[Image Describer] Failed to list models: {e}")
                return web.json_response({"ok": False, "models": [], "error": str(e)}, status=500)

        # 2. System Prompt Presets
        @routes.get("/ds/describer/presets")
        async def get_presets_handler(request):
            return web.json_response({
                "ok": True,
                "presets": DEFAULT_SYSTEM_PROMPTS,
            })

        # 3. Pause / Continue Action
        @routes.post("/ds/describer/continue")
        async def continue_handler(request):
            try:
                data = await request.json()
                node_id = str(data.get("node_id") or "")
                text = data.get("text", "")
                released = pause_manager.release_pause(node_id, text)
                logger.info(f"[Image Describer] Continue received for node {node_id} (released={released})")
                return web.json_response({"ok": True, "released": released})
            except Exception as e:
                logger.error(f"[Image Describer] Continue handler error: {e}")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # 4. Kill / Stop Active Generation
        @routes.post("/ds/describer/kill")
        async def kill_handler(request):
            try:
                data = {}
                try:
                    data = await request.json()
                except Exception:
                    pass
                unload = bool(data.get("unload", False))

                b_llm = _get_builtin_llm()
                if b_llm:
                    if hasattr(b_llm, "_state"):
                        b_llm._state["abort"] = True
                    if unload:
                        b_llm.unload()
                        free_vram_and_comfy_models()

                return web.json_response({"ok": True, "stopped": True, "unloaded": unload})
            except Exception as e:
                logger.error(f"[Image Describer] Kill handler error: {e}")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # 5. Eject / Unload Model
        @routes.post("/ds/describer/unload")
        async def unload_handler(request):
            try:
                b_llm = _get_builtin_llm()
                if b_llm:
                    b_llm.unload()
                free_vram_and_comfy_models()
                vram = get_vram_status()
                logger.info(f"[Image Describer] Model unloaded. Free VRAM: {vram.get('available_mb')} MB")
                return web.json_response({"ok": True, "unloaded": True, "vram": vram})
            except Exception as e:
                logger.error(f"[Image Describer] Unload handler error: {e}")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # 6. Standalone Direct Image Generation (from local upload/drag-drop or in-node Run)
        @routes.post("/ds/describer/generate")
        async def generate_handler(request):
            try:
                import asyncio
                import base64
                import io
                from PIL import Image
                import numpy as np
                import torch

                data = await request.json()
                image_b64 = data.get("image_base64")
                image_path = data.get("image_path")
                node_id = str(data.get("node_id") or "manual_run")
                settings = data.get("settings") or {}

                img_tensor = None
                if image_b64:
                    if "," in image_b64:
                        image_b64 = image_b64.split(",", 1)[1]
                    raw_bytes = base64.b64decode(image_b64)
                    pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
                    np_arr = np.array(pil_img).astype(np.float32) / 255.0
                    img_tensor = torch.from_numpy(np_arr).unsqueeze(0)
                elif image_path and os.path.isfile(image_path):
                    pil_img = Image.open(image_path).convert("RGB")
                    np_arr = np.array(pil_img).astype(np.float32) / 255.0
                    img_tensor = torch.from_numpy(np_arr).unsqueeze(0)

                if img_tensor is None:
                    return web.json_response({"ok": False, "error": "No valid image data provided for generation."}, status=400)

                # Execute in worker thread
                result = await asyncio.to_thread(
                    describe_image_sync,
                    image_tensor=img_tensor,
                    model_key=settings.get("model"),
                    system_prompt=settings.get("system_prompt"),
                    temperature=float(settings.get("temperature", 0.8)),
                    top_p=float(settings.get("top_p", 0.90)),
                    top_k=int(settings.get("top_k", 40)),
                    min_p=float(settings.get("min_p", 0.05)),
                    repeat_penalty=float(settings.get("repeat_penalty", 1.10)),
                    max_tokens=int(settings.get("max_new_tokens", 2048)),
                    n_ctx=int(settings.get("n_ctx", 4096)),
                    gpu_layers=int(settings.get("gpu_layers", -1)),
                    seed=int(settings.get("seed", -1)),
                    max_image_side=int(settings.get("max_image_side", 1024)),
                    cleanup_markdown=bool(settings.get("cleanup_markdown", True)),
                    prefix=str(settings.get("prefix", "")),
                    suffix=str(settings.get("suffix", "")),
                    auto_unload=bool(settings.get("auto_unload", False)),
                    free_comfy=bool(settings.get("free_comfy_models", False)),
                    node_id=node_id,
                )

                return web.json_response({"ok": True, **result})
            except Exception as e:
                logger.error(f"[Image Describer] Standalone generation error: {e}")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # 7. Recent In-Memory Log Viewer
        @routes.get("/ds/describer/logs")
        async def logs_handler(request):
            logs = get_recent_logs(limit=100)
            return web.json_response({"ok": True, "logs": logs})

        logger.info("[DeathshotArsenal] DS Image Describer routes registered successfully.")
    except Exception as e:
        logger.warning(f"[DeathshotArsenal] Failed to register Image Describer routes: {e}")


__all__ = [
    "DS_ImageDescriber",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "register_image_describer_routes",
]
