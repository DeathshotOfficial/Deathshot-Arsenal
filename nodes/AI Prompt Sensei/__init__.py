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
    """Return GPU and system memory information for VRAM advisory warnings."""
    info = {
        "gpu_name": "Unknown",
        "total_vram_mb": 0,
        "available_vram_mb": 0,
        "system_ram_mb": 0,
        "has_gpu": False,
    }
    # GPU via pynvml
    try:
        import pynvml
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        info["gpu_name"] = pynvml.nvmlDeviceGetName(handle)
        if isinstance(info["gpu_name"], bytes):
            info["gpu_name"] = info["gpu_name"].decode("utf-8", errors="replace")
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        info["total_vram_mb"] = int(mem.total / 1024 / 1024)
        info["available_vram_mb"] = int(mem.free / 1024 / 1024)
        info["has_gpu"] = True
    except Exception:
        pass

    # Fallback via torch
    if not info["has_gpu"]:
        try:
            import torch
            if torch.cuda.is_available():
                props = torch.cuda.get_device_properties(0)
                info["gpu_name"] = props.name
                total = props.total_memory
                info["total_vram_mb"] = int(total / 1024 / 1024)
                reserved = torch.cuda.memory_reserved(0)
                allocated = torch.cuda.memory_allocated(0)
                available = total - reserved
                info["available_vram_mb"] = int(available / 1024 / 1024)
                info["has_gpu"] = True
        except Exception:
            pass

    # System RAM
    try:
        import psutil
        vm = psutil.virtual_memory()
        info["system_ram_mb"] = int(vm.total / 1024 / 1024)
    except Exception:
        pass

    return info


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
        # Prompt generation (LM Studio API: Image + Notes + System Prompt)
        # ------------------------------------------------------------------
        @routes.post("/ds/prompt_sensei/generate")
        async def generate_handler(request):
            try:
                data = await request.json()
                scene_notes = data.get("scene_notes", "")
                system_prompt = data.get("system_prompt", "")
                context = data.get("context", {})
                task_id = data.get("task_id")
                lm_studio_cfg = data.get("lm_studio") or {}
                auto_unload = bool(data.get("auto_unload", False)) or bool(lm_studio_cfg.get("unload_after_run", False))
                lm_studio_cfg["unload_after_run"] = auto_unload

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

                result = generate_prompt_lm_studio(
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
            except Exception as e:
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

        logger.info("[DeathshotArsenal] DS AI Prompt Sensei routes registered successfully.")
    except Exception as e:
        logger.warning(f"[DeathshotArsenal] Failed to register Prompt Sensei routes: {e}")


__all__ = [
    "DS_AIPromptSensei",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "register_prompt_sensei_routes",
]
