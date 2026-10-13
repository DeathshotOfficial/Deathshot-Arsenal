"""
Deathshot Arsenal - Hardware & Performance Monitor: Backend Service
Coordinates sampler thread, client liveness detection, WebSocket telemetry push,
and API routes for both Linux and Windows.
"""

import asyncio
import gc
import logging
import os
import platform
import sys
import threading
import time
from typing import Dict, Any, Optional

from aiohttp import web

from .hardware import get_static_specs, query_dynamic_telemetry
from .llm_tracker import get_llm_telemetry, configure_llm_backends, report_llm

logger = logging.getLogger("DeathshotArsenal.HPM.Service")

_LOCK = threading.Lock()
_STATIC_CACHE: Optional[Dict[str, Any]] = None
_DYNAMIC_CACHE: Dict[str, Any] = {}
_LAST_CLIENT_SEEN = 0.0
_CLIENT_TIMEOUT_SECS = 12.0
_SAMPLER_THREAD: Optional[threading.Thread] = None
_STOP_EVENT = threading.Event()
_CONFIG = {
    "enabled": True,
    "gpu_index": 0,
}


def touch_client():
    """Marks client activity and starts the sampler thread if paused."""
    global _LAST_CLIENT_SEEN
    _LAST_CLIENT_SEEN = time.time()
    _ensure_sampler_running()


def _ensure_sampler_running():
    global _SAMPLER_THREAD
    if not _CONFIG.get("enabled", True):
        return
    with _LOCK:
        if _SAMPLER_THREAD is None or not _SAMPLER_THREAD.is_alive():
            _STOP_EVENT.clear()
            _SAMPLER_THREAD = threading.Thread(target=_sampler_loop, name="DS-HPM-Sampler", daemon=True)
            _SAMPLER_THREAD.start()
            logger.info("[HPM] Sampler thread started on demand.")


def _sampler_loop():
    global _SAMPLER_THREAD
    while not _STOP_EVENT.is_set():
        now = time.time()
        # Idle check: if no client ping received within timeout, stop sampling
        if now - _LAST_CLIENT_SEEN > _CLIENT_TIMEOUT_SECS or not _CONFIG.get("enabled", True):
            logger.info("[HPM] No active clients connected. Sampler going to sleep.")
            break

        gpu_idx = int(_CONFIG.get("gpu_index", 0))
        try:
            hw_data = query_dynamic_telemetry(gpu_index=gpu_idx)
            llm_data = get_llm_telemetry()
            payload = {
                "timestamp": now,
                "hw": hw_data,
                "llm": llm_data,
            }
            with _LOCK:
                _DYNAMIC_CACHE.clear()
                _DYNAMIC_CACHE.update(payload)

            # Push telemetry via WebSocket
            _push_telemetry(payload)
        except Exception as e:
            logger.debug(f"[HPM] Telemetry sampling iteration error: {e}")

        # 1-second sample rate
        time.sleep(1.0)

    with _LOCK:
        _SAMPLER_THREAD = None


def _push_telemetry(payload: Dict[str, Any]):
    try:
        import server
        if hasattr(server, "PromptServer") and hasattr(server.PromptServer, "instance") and server.PromptServer.instance is not None:
            server.PromptServer.instance.send_sync("ds_hpm.telemetry", payload)
    except Exception:
        pass


def get_cached_static(gpu_index: int = 0) -> Dict[str, Any]:
    global _STATIC_CACHE
    if _STATIC_CACHE is None or _STATIC_CACHE.get("gpu_index") != gpu_index:
        specs = get_static_specs(gpu_index=gpu_index)
        specs["gpu_index"] = gpu_index
        _STATIC_CACHE = specs
    return dict(_STATIC_CACHE)


def free_vram_and_memory(action: str = "free_vram") -> bool:
    """Performs deep memory cleanup on Linux and Windows."""
    try:
        if action == "unload_models":
            try:
                import comfy.model_management as mm
                mm.unload_all_models()
            except Exception:
                pass

        try:
            import comfy.model_management as mm
            mm.soft_empty_cache()
        except Exception:
            pass

        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
        except Exception:
            pass

        gc.collect()

        # Linux libc malloc_trim
        if sys.platform.startswith("linux"):
            try:
                import ctypes
                libc = ctypes.CDLL("libc.so.6")
                if hasattr(libc, "malloc_trim"):
                    libc.malloc_trim(0)
            except Exception:
                pass

        # Windows working set purge
        if sys.platform == "win32":
            try:
                import ctypes
                k32 = ctypes.windll.kernel32
                psapi = ctypes.windll.psapi
                psapi.EmptyWorkingSet(k32.GetCurrentProcess())
            except Exception:
                pass
        return True
    except Exception as e:
        logger.error(f"[HPM] Memory clean error: {e}")
        return False


def register_monitor_routes():
    """Registers API routes on ComfyUI's PromptServer."""
    try:
        import server
        if not hasattr(server, "PromptServer") or not hasattr(server.PromptServer, "instance") or server.PromptServer.instance is None:
            return
        routes = server.PromptServer.instance.routes

        @routes.get("/ds/hpm/static")
        async def route_hpm_static(request):
            gpu_idx = int(request.query.get("gpu", _CONFIG.get("gpu_index", 0)))
            touch_client()
            return web.json_response(get_cached_static(gpu_idx))

        @routes.get("/ds/hpm/stats")
        async def route_hpm_stats(_request):
            touch_client()
            gpu_idx = int(_CONFIG.get("gpu_index", 0))
            with _LOCK:
                hw = _DYNAMIC_CACHE.get("hw") or query_dynamic_telemetry(gpu_idx)
                llm = _DYNAMIC_CACHE.get("llm") or get_llm_telemetry()
            return web.json_response({
                "static": get_cached_static(gpu_idx),
                "hw": hw,
                "llm": llm,
                "timestamp": time.time(),
            })

        @routes.post("/ds/hpm/ping")
        async def route_hpm_ping(_request):
            touch_client()
            return web.json_response({"ok": True})

        @routes.post("/ds/hpm/config")
        async def route_hpm_config(request):
            try:
                body = await request.json()
                if "enabled" in body:
                    _CONFIG["enabled"] = bool(body["enabled"])
                if "gpu_index" in body:
                    _CONFIG["gpu_index"] = int(body["gpu_index"])
                    global _STATIC_CACHE
                    _STATIC_CACHE = None
                if "llm_urls" in body and isinstance(body["llm_urls"], dict):
                    configure_llm_backends(body["llm_urls"])
                touch_client()
                return web.json_response({"ok": True, "config": _CONFIG})
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=400)

        @routes.post("/ds/hpm/action")
        async def route_hpm_action(request):
            try:
                body = await request.json()
                action = body.get("action", "free_vram")
                ok = free_vram_and_memory(action)
                touch_client()
                return web.json_response({"ok": ok, "action": action})
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        # Legacy compatibility routes for AI Prompt Sensei
        @routes.get("/ds/hardware_monitor/stats")
        async def route_legacy_hw_stats(_request):
            touch_client()
            gpu_idx = int(_CONFIG.get("gpu_index", 0))
            with _LOCK:
                hw = _DYNAMIC_CACHE.get("hw") or query_dynamic_telemetry(gpu_idx)
            legacy_data = {
                "timestamp": time.time(),
                "cpu": hw.get("cpu", 0.0),
                "ram": hw.get("ram", 0.0),
                "ram_used_gb": hw.get("ram_used_gb", 0.0),
                "ram_total_gb": hw.get("ram_total_gb", 0.0),
                "gpu": hw.get("gpu"),
                "gpu_available": hw.get("gpu_available", False),
                "gpu_temp": hw.get("gpu_temp"),
                "gpu_power": hw.get("gpu_power"),
                "vram_used_gb": hw.get("vram_used_gb"),
                "vram_total_gb": hw.get("vram_total_gb"),
                "vram_free_gb": hw.get("vram_free_gb"),
            }
            return web.json_response(legacy_data)

        @routes.post("/ds/hardware_monitor/action")
        async def route_legacy_hw_action(request):
            try:
                body = await request.json()
                action = body.get("action", "free_vram")
                ok = free_vram_and_memory(action)
                touch_client()
                return web.json_response({"ok": ok, "action": action})
            except Exception as e:
                return web.json_response({"ok": False, "error": str(e)}, status=500)

        logger.info("[HPM] Registered backend routes.")
    except Exception as e:
        logger.warning(f"[HPM] Route registration failed: {e}")
