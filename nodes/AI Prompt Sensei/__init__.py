"""
Deathshot Arsenal — DS AI Prompt Sensei Node Package
"""

import os
import json
import logging
from aiohttp import web
import server
import folder_paths

try:
    from .ds_ai_prompt_sensei import DS_AIPromptSensei, NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from .llm_engine import (
        kill_active_generation,
        generate_prompt_sync,
        generate_prompt_lm_studio,
        unload_llm_memory,
        analyze_image_for_context,
        fetch_lm_studio_models,
        unload_lm_studio_model,
        start_lm_studio_server,
    )
except (ImportError, ValueError):
    import sys
    cur_dir = os.path.dirname(__file__)
    if cur_dir not in sys.path:
        sys.path.insert(0, cur_dir)
    from ds_ai_prompt_sensei import DS_AIPromptSensei, NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from llm_engine import (
        kill_active_generation,
        generate_prompt_sync,
        generate_prompt_lm_studio,
        unload_llm_memory,
        analyze_image_for_context,
        fetch_lm_studio_models,
        unload_lm_studio_model,
        start_lm_studio_server,
    )

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei")


def _get_hardware_info():
    """Return GPU and system memory information for VRAM advisory warnings (Linux & Windows)."""
    try:
        try:
            from .telemetry import get_hardware_info
        except Exception:
            from telemetry import get_hardware_info
        return get_hardware_info()
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Telemetry get_hardware_info error: {e}")
        return {
            "gpu_name": "Unknown",
            "total_vram_mb": 0,
            "available_vram_mb": 0,
            "system_ram_mb": 0,
            "has_gpu": False,
        }


def register_prompt_sensei_routes():
    try:
        routes = server.PromptServer.instance.routes

        # ------------------------------------------------------------------
        # Model catalog
        # ------------------------------------------------------------------
        @routes.get("/ds/prompt_sensei/models")
        async def get_models_handler(request):
            try:
                # Diffusion models & checkpoints
                checkpoints = folder_paths.get_filename_list("checkpoints")
                diff_models = []
                try:
                    diff_models = folder_paths.get_filename_list("diffusion_models")
                except Exception:
                    pass
                models_list = sorted(list(set(checkpoints + diff_models)), key=str.lower)

                # VAEs
                vaes = sorted(folder_paths.get_filename_list("vae"), key=str.lower)

                # Text encoders / clip
                clips = []
                try:
                    clips = folder_paths.get_filename_list("clip")
                except Exception:
                    pass
                try:
                    clips.extend(folder_paths.get_filename_list("text_encoders"))
                except Exception:
                    pass
                clips = sorted(list(set(clips)), key=str.lower)

                # LoRAs
                loras = sorted(folder_paths.get_filename_list("loras"), key=str.lower)

                return web.json_response({
                    "models": models_list,
                    "vaes": vaes,
                    "clips": clips,
                    "loras": loras,
                    "attentions": ["default", "kitchen", "comfy_kitchen", "flash_attn", "sage_attn", "sdpa", "xformers"],
                })
            except Exception as e:
                logger.error(f"[Prompt Sensei] Failed to get models: {e}")
                return web.json_response({"error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # LM Studio: Models Listing
        # ------------------------------------------------------------------
        @routes.get("/ds/prompt_sensei/lm_studio/models")
        async def lm_studio_models_handler(request):
            try:
                ip = request.query.get("ip", "127.0.0.1")
                port = request.query.get("port", "1234")
                res = fetch_lm_studio_models(ip=ip, port=port)
                return web.json_response(res)
            except Exception as e:
                logger.error(f"[Prompt Sensei] Failed to query LM Studio models: {e}")
                return web.json_response({
                    "ok": False,
                    "error": f"LM Studio unavailable\n{request.query.get('ip', '127.0.0.1')}:{request.query.get('port', '1234')}",
                    "address": f"{request.query.get('ip', '127.0.0.1')}:{request.query.get('port', '1234')}",
                    "models": [],
                })

        # ------------------------------------------------------------------
        # LM Studio: Unload Model
        # ------------------------------------------------------------------
        @routes.post("/ds/prompt_sensei/lm_studio/unload")
        async def lm_studio_unload_handler(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            ip = data.get("ip", "127.0.0.1")
            port = data.get("port", 1234)
            model = data.get("model", "")
            unloaded = unload_lm_studio_model(ip=ip, port=port, model_name=model)
            return web.json_response({"unloaded": unloaded})

        # ------------------------------------------------------------------
        # Default System Prompts
        # ------------------------------------------------------------------
        @routes.get("/ds/prompt_sensei/default_prompts")
        async def get_default_prompts_handler(request):
            try:
                try:
                    from .prompt_manager import get_all_default_prompts
                except Exception:
                    from prompt_manager import get_all_default_prompts
                return web.json_response(get_all_default_prompts())
            except Exception as e:
                logger.error(f"[Prompt Sensei] Failed to get default prompts: {e}")
                return web.json_response({"error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # Prompt generation (LM Studio API: Image + Notes + System Prompt)
        # ------------------------------------------------------------------
        @routes.post("/ds/prompt_sensei/generate")
        async def generate_handler(request):
            try:
                data = await request.json()
                mode = str(data.get("mode") or "i2v").lower()
                provider = str(data.get("provider") or "lm_studio").lower()

                # In Custom mode, return the custom prompt directly without LLM
                if mode == "custom":
                    custom_text = str(data.get("custom_text") or data.get("scene_notes") or "").strip()
                    return web.json_response({
                        "status": "completed",
                        "prompt": custom_text,
                        "tokens": 0,
                        "speed": 0.0,
                        "elapsed": 0.01,
                        "model": "Custom",
                    })

                scene_notes = data.get("scene_notes", "")
                system_prompts = data.get("system_prompts") or {}
                system_prompt = data.get("system_prompt") or system_prompts.get(mode, "")
                context = data.get("context", {})
                task_id = data.get("task_id")
                lm_studio_cfg = data.get("lm_studio") or {}
                auto_unload = bool(data.get("auto_unload", False)) or bool(lm_studio_cfg.get("unload_after_run", False))
                lm_studio_cfg["unload_after_run"] = auto_unload

                # Image is ignored in T2I and T2V modes
                if mode in ("t2i", "t2v"):
                    image_path = None
                    context["has_image"] = False
                else:
                    image_path = data.get("image_path", "") or context.get("image_path", "")
                    if image_path:
                        try:
                            img_analysis = analyze_image_for_context(image_path)
                            context["image_analysis"] = img_analysis
                            context["has_image"] = True
                        except Exception as e:
                            logger.warning(f"[Prompt Sensei] Image analysis failed: {e}")
                            context["has_image"] = bool(image_path)
                    else:
                        context["has_image"] = False

                if provider == "built_in":
                    try:
                        from .builtin_llm import generate_prompt_builtin
                    except Exception:
                        from builtin_llm import generate_prompt_builtin

                    builtin_cfg = data.get("built_in") or {}
                    if "auto_unload" not in builtin_cfg:
                        builtin_cfg["auto_unload"] = auto_unload

                    import asyncio
                    result = await asyncio.to_thread(
                        generate_prompt_builtin,
                        scene_notes=scene_notes,
                        system_prompt=system_prompt,
                        image_path=image_path,
                        builtin_config=builtin_cfg,
                        context=context,
                    )
                    return web.json_response(result)

                import asyncio
                result = await asyncio.to_thread(
                    generate_prompt_lm_studio,
                    scene_notes=scene_notes,
                    system_prompt=system_prompt,
                    image_path=image_path,
                    lm_studio_config=lm_studio_cfg,
                    context=context,
                    task_id=task_id,
                )

                # Auto-unload model if requested
                if auto_unload and result.get("status") != "completed":
                    unload_lm_studio_model(
                        ip=lm_studio_cfg.get("ip", "127.0.0.1"),
                        port=lm_studio_cfg.get("port", 1234),
                        model_name=lm_studio_cfg.get("model", ""),
                    )

                return web.json_response(result)
            except BaseException as e:
                if type(e).__name__ in ("InterruptProcessingException", "CancelledError"):
                    logger.info("[Prompt Sensei] Generation cancelled/interrupted by user.")
                    return web.json_response({"status": "cancelled", "error": "Generation interrupted by user"})
                logger.error(f"[Prompt Sensei] Generation error: {e}")
                return web.json_response({"status": "failed", "error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # Kill active generation
        # ------------------------------------------------------------------
        @routes.post("/ds/prompt_sensei/kill")
        async def kill_handler(request):
            try:
                killed = kill_active_generation()
                return web.json_response({"killed": killed})
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # Unload models from memory
        # ------------------------------------------------------------------
        @routes.post("/ds/prompt_sensei/unload")
        async def unload_handler(request):
            try:
                data = {}
                try:
                    data = await request.json()
                except Exception:
                    pass
                ip = data.get("ip", "127.0.0.1")
                port = data.get("port", 1234)
                model = data.get("model", "")
                unloaded = unload_llm_memory(ip=ip, port=port, model_name=model)
                return web.json_response({"unloaded": unloaded})
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # Start LM Studio Server
        # ------------------------------------------------------------------
        @routes.post("/ds/prompt_sensei/start_lm_server")
        async def start_lm_server_handler(request):
            try:
                data = {}
                try:
                    data = await request.json()
                except Exception:
                    pass
                port = int(data.get("port") or 1234)
                ok, msg = start_lm_studio_server(port=port)
                return web.json_response({"ok": ok, "message": msg})
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # Built-in LLM Routes
        # ------------------------------------------------------------------
        @routes.get("/ds/prompt_sensei/builtin/models")
        async def builtin_models_handler(request):
            try:
                try:
                    from .builtin_llm import list_builtin_models
                except Exception:
                    from builtin_llm import list_builtin_models
                models = list_builtin_models()
                return web.json_response({"ok": True, "models": models})
            except Exception as e:
                logger.error(f"[Prompt Sensei] Failed to query builtin models: {e}")
                return web.json_response({"ok": False, "error": str(e), "models": []})

        @routes.post("/ds/prompt_sensei/builtin/unload")
        async def builtin_unload_handler(request):
            try:
                try:
                    from .builtin_llm import unload
                except Exception:
                    from builtin_llm import unload
                unloaded = unload()
                return web.json_response({"ok": True, "unloaded": unloaded})
            except Exception as e:
                logger.error(f"[Prompt Sensei] Failed to unload builtin model: {e}")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        @routes.get("/ds/prompt_sensei/builtin/status")
        async def builtin_status_handler(request):
            try:
                try:
                    from .builtin_llm import get_backend_status
                except Exception:
                    from builtin_llm import get_backend_status
                status_info = get_backend_status()
                return web.json_response({"ok": True, **status_info})
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # ------------------------------------------------------------------
        # Hardware info for VRAM advisory warnings
        # ------------------------------------------------------------------
        @routes.get("/ds/prompt_sensei/hardware")
        async def hardware_handler(request):
            try:
                info = _get_hardware_info()
                return web.json_response(info)
            except Exception as e:
                logger.warning(f"[Prompt Sensei] Hardware info error: {e}")
                return web.json_response({
                    "gpu_name": "Unknown",
                    "total_vram_mb": 0,
                    "available_vram_mb": 0,
                    "system_ram_mb": 0,
                    "has_gpu": False,
                    "error": str(e),
                })

        # ------------------------------------------------------------------
        # Realtime Hardware Telemetry & Quick Memory Actions
        # ------------------------------------------------------------------
        @routes.get("/ds/prompt_sensei/hw_stats")
        async def hw_stats_handler(request):
            try:
                try:
                    from .telemetry import get_realtime_hw_stats
                except Exception:
                    from telemetry import get_realtime_hw_stats
                stats = get_realtime_hw_stats()
                return web.json_response(stats)
            except Exception as e:
                logger.error(f"[Prompt Sensei] hw_stats error: {e}")
                return web.json_response({
                    "cpu": 0, "ram": 0, "gpu": 0,
                    "vram_used_gb": 0, "vram_total_gb": 0, "vram_free_gb": 0,
                    "error": str(e)
                })

        @routes.post("/ds/prompt_sensei/hw_action")
        async def hw_action_handler(request):
            try:
                body = await request.json()
                action = str(body.get("action") or "").strip()
                try:
                    from .telemetry import perform_hardware_action
                except Exception:
                    from telemetry import perform_hardware_action
                ok = perform_hardware_action(action)
                return web.json_response({"ok": ok})
            except Exception as e:
                logger.error(f"[Prompt Sensei] hw_action error: {e}")
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        logger.info("[DeathshotArsenal] DS AI Prompt Sensei routes registered successfully.")
    except Exception as e:
        logger.warning(f"[DeathshotArsenal] Failed to register Prompt Sensei routes: {e}")


__all__ = [
    "DS_AIPromptSensei",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "register_prompt_sensei_routes",
]
