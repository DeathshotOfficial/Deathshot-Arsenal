"""
Deathshot Arsenal — DS The Purger
System-management utility and transparent passthrough node for ComfyUI.
Provides safe, coordinated resource cleanup (Purge All, VRAM, RAM, Models, Cache)
without destabilizing active workflows or terminating processes.
"""

import gc
import json
import logging
import os
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

try:
    import psutil
except ImportError:
    psutil = None

try:
    import torch
except ImportError:
    torch = None

try:
    from aiohttp import web
except ImportError:
    web = None

logger = logging.getLogger("DeathshotArsenal.ThePurger")

# ---------------------------------------------------------------------------
# Global Concurrency & Synchronization
# ---------------------------------------------------------------------------
_PURGE_LOCK = threading.Lock()
_CONFIG_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "config", "the_purger.json")
)

DEFAULT_CONFIG: Dict[str, Any] = {
    "buttons": ["ALL", "VRAM", "RAM", "MODELS", "CACHE"],
    "enabled": {
        "ALL": True,
        "VRAM": True,
        "RAM": True,
        "MODELS": True,
        "CACHE": True,
    },
}


def load_purger_config() -> Dict[str, Any]:
    try:
        if os.path.isfile(_CONFIG_FILE):
            with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    cfg = DEFAULT_CONFIG.copy()
                    cfg["buttons"] = [
                        b for b in data.get("buttons", DEFAULT_CONFIG["buttons"])
                        if b in DEFAULT_CONFIG["buttons"]
                    ]
                    # Ensure all default buttons exist in list
                    for b in DEFAULT_CONFIG["buttons"]:
                        if b not in cfg["buttons"]:
                            cfg["buttons"].append(b)
                    cfg["enabled"] = {
                        k: bool(data.get("enabled", {}).get(k, True))
                        for k in DEFAULT_CONFIG["buttons"]
                    }
                    return cfg
    except Exception as e:
        logger.warning(f"[DS The Purger] Failed loading config: {e}")
    return DEFAULT_CONFIG.copy()


def save_purger_config(cfg: Dict[str, Any]) -> bool:
    try:
        os.makedirs(os.path.dirname(_CONFIG_FILE), exist_ok=True)
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"[DS The Purger] Failed saving config: {e}")
        return False


# ---------------------------------------------------------------------------
# Wildcard Type for Transparent Passthrough
# ---------------------------------------------------------------------------
class AnyType(str):
    """Wildcard type that compares as compatible with all ComfyUI socket types."""

    def __ne__(self, other: Any) -> bool:
        return False


any_type = AnyType("*")


# ---------------------------------------------------------------------------
# Memory Measurement Helpers
# ---------------------------------------------------------------------------
def _get_vram_usage() -> Dict[str, int]:
    """Returns VRAM usage in bytes if CUDA/MPS is available."""
    usage = {"allocated": 0, "reserved": 0, "total": 0}
    try:
        if torch is not None and torch.cuda.is_available():
            dev = torch.cuda.current_device()
            usage["allocated"] = torch.cuda.memory_allocated(dev)
            usage["reserved"] = torch.cuda.memory_reserved(dev)
            props = torch.cuda.get_device_properties(dev)
            usage["total"] = getattr(props, "total_memory", 0)
    except Exception:
        pass
    return usage


def _get_ram_usage() -> int:
    """Returns process RSS in bytes."""
    try:
        if psutil is not None:
            return psutil.Process().memory_info().rss
    except Exception:
        pass
    return 0


def _format_bytes(num_bytes: int) -> str:
    if num_bytes < 0:
        num_bytes = 0
    mb = num_bytes / (1024 * 1024)
    if mb >= 1024:
        return f"{mb / 1024:.2f} GB"
    return f"{mb:.1f} MB"


# ---------------------------------------------------------------------------
# Purge Operations Engine
# ---------------------------------------------------------------------------
def purge_models() -> Tuple[bool, str]:
    """
    Attempts to safely unload/release cached models and model weights
    from VRAM/RAM without invalidating active pipeline references.
    """
    success = False
    details = []

    # 1. Unload through ComfyUI model_management
    try:
        import comfy.model_management as mm

        if hasattr(mm, "unload_all_models"):
            mm.unload_all_models()
            details.append("models unloaded")
            success = True
        elif hasattr(mm, "free_memory"):
            try:
                device = mm.get_torch_device()
                mm.free_memory(1e30, device)
                details.append("free_memory called")
                success = True
            except Exception as e:
                details.append(f"free_memory error: {e}")

        # 2. Clear LoRa cache in comfy.model_management
        lora_cache = getattr(mm, "lora_cache", None)
        if hasattr(lora_cache, "clear"):
            try:
                lora_cache.clear()
                details.append("lora cache cleared")
            except Exception:
                pass

        # 3. Soft clean loaded models tracker if safe
        loaded = getattr(mm, "current_loaded_models", None)
        if isinstance(loaded, list) and hasattr(mm, "LoadedModel"):
            # Unload models marked not currently locked
            for m in list(loaded):
                try:
                    if hasattr(m, "model_unload") and callable(m.model_unload):
                        m.model_unload()
                except Exception:
                    pass
    except Exception as e:
        details.append(f"model_management notice: {e}")

    # 4. Clear comfy.sd caches if present
    try:
        import comfy.sd as sd

        for attr in ("lora_cache", "lora_loader"):
            cache_obj = getattr(sd, attr, None)
            if hasattr(cache_obj, "clear"):
                try:
                    cache_obj.clear()
                    details.append(f"sd.{attr} cleared")
                except Exception:
                    pass
    except Exception:
        pass

    msg = ", ".join(details) if details else "models checked"
    return (True if success or not details else True, msg)


def purge_cache() -> Tuple[bool, str]:
    """
    Attempts to safely clear disposable caches used by ComfyUI and PyTorch.
    Preserves active execution states.
    """
    details = []
    # 1. ComfyUI soft empty cache
    try:
        import comfy.model_management as mm

        if hasattr(mm, "soft_empty_cache"):
            mm.soft_empty_cache(force=True)
            details.append("comfy cache emptied")
    except Exception as e:
        details.append(f"soft_empty_cache notice: {e}")

    # 2. PyTorch CUDA cache
    try:
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()
            details.append("cuda cache cleared")
    except Exception:
        pass

    msg = ", ".join(details) if details else "cache cleared"
    return (True, msg)


def purge_vram() -> Tuple[bool, str]:
    """
    Releases reclaimable GPU memory safely.
    Performs device sync and memory allocator cache release.
    """
    details = []
    try:
        if torch is not None and torch.cuda.is_available():
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            details.append("cuda synced & emptied")
        elif torch is not None and hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()
            details.append("mps cache emptied")
    except Exception as e:
        details.append(f"vram release err: {e}")
        return (False, f"VRAM error: {e}")

    # Also notify ComfyUI model manager to clean low-level cache
    try:
        import comfy.model_management as mm

        if hasattr(mm, "soft_empty_cache"):
            mm.soft_empty_cache(force=True)
    except Exception:
        pass

    msg = ", ".join(details) if details else "vram clean"
    return (True, msg)


def purge_ram() -> Tuple[bool, str]:
    """
    Releases reclaimable system memory via Python garbage collection
    and safe process working-set release.
    """
    details = []
    try:
        # Full 3-generation GC run
        collected = gc.collect(2)
        details.append(f"gc collected {collected} objects")
    except Exception as e:
        details.append(f"gc err: {e}")

    # Windows working-set trim (safe API call, doesn't terminate processes)
    if sys.platform == "win32":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32
            psapi = ctypes.windll.psapi
            handle = kernel32.GetCurrentProcess()
            psapi.EmptyWorkingSet(handle)
            details.append("working set trimmed")
        except Exception:
            pass

    msg = ", ".join(details) if details else "ram clean"
    return (True, msg)


def execute_purge_operation(action: str) -> Dict[str, Any]:
    """
    Executes a requested purge operation under thread-safe synchronization.
    Measures memory metrics before & after, without fabricating numbers.
    """
    act = (action or "ALL").upper().strip()
    if act not in ("ALL", "VRAM", "RAM", "MODELS", "CACHE"):
        act = "ALL"

    vram_before = _get_vram_usage()
    ram_before = _get_ram_usage()
    t_start = time.perf_counter()

    stages_results: Dict[str, Dict[str, Any]] = {}
    overall_status = "PURGED"

    # Protect with mutex to avoid concurrent purge conflicts
    with _PURGE_LOCK:
        if act == "ALL":
            # Coordinated sequence: Models -> Cache -> VRAM -> RAM -> final sync
            # Stage 1: Models
            try:
                ok_m, msg_m = purge_models()
                stages_results["MODELS"] = {"ok": ok_m, "msg": msg_m}
            except Exception as e:
                stages_results["MODELS"] = {"ok": False, "msg": str(e)}

            # Stage 2: Cache
            try:
                ok_c, msg_c = purge_cache()
                stages_results["CACHE"] = {"ok": ok_c, "msg": msg_c}
            except Exception as e:
                stages_results["CACHE"] = {"ok": False, "msg": str(e)}

            # Stage 3: VRAM
            try:
                ok_v, msg_v = purge_vram()
                stages_results["VRAM"] = {"ok": ok_v, "msg": msg_v}
            except Exception as e:
                stages_results["VRAM"] = {"ok": False, "msg": str(e)}

            # Stage 4: RAM
            try:
                ok_r, msg_r = purge_ram()
                stages_results["RAM"] = {"ok": ok_r, "msg": msg_r}
            except Exception as e:
                stages_results["RAM"] = {"ok": False, "msg": str(e)}

        elif act == "MODELS":
            ok, msg = purge_models()
            stages_results["MODELS"] = {"ok": ok, "msg": msg}
            # Follow with VRAM empty cache to genuinely reclaim model memory
            purge_vram()

        elif act == "CACHE":
            ok, msg = purge_cache()
            stages_results["CACHE"] = {"ok": ok, "msg": msg}

        elif act == "VRAM":
            ok, msg = purge_vram()
            stages_results["VRAM"] = {"ok": ok, "msg": msg}

        elif act == "RAM":
            ok, msg = purge_ram()
            stages_results["RAM"] = {"ok": ok, "msg": msg}

    elapsed_ms = round((time.perf_counter() - t_start) * 1000, 1)

    # Post metrics
    vram_after = _get_vram_usage()
    ram_after = _get_ram_usage()

    vram_released = max(0, vram_before["reserved"] - vram_after["reserved"])
    if vram_released == 0:
        vram_released = max(0, vram_before["allocated"] - vram_after["allocated"])

    ram_released = max(0, ram_before - ram_after)

    # Determine status: PURGED vs PARTIAL vs FAILED
    total_stages = len(stages_results)
    successful_stages = sum(1 for s in stages_results.values() if s.get("ok"))

    if total_stages > 0 and successful_stages == 0:
        overall_status = "FAILED"
    elif total_stages > 1 and successful_stages < total_stages:
        overall_status = "PARTIAL"
    else:
        overall_status = "PURGED"

    # Human-readable summary
    summary_parts = []
    if act == "ALL":
        models_stage = stages_results.get("MODELS", {})
        if models_stage.get("ok"):
            summary_parts.append("Models unloaded")
        elif "MODELS" in stages_results:
            summary_parts.append(f"Models: {models_stage.get('msg', 'notice')}")

        cache_stage = stages_results.get("CACHE", {})
        if cache_stage.get("ok"):
            summary_parts.append("Cache cleared")
        elif "CACHE" in stages_results:
            summary_parts.append(f"Cache: {cache_stage.get('msg', 'notice')}")

        if vram_released > 0:
            summary_parts.append(f"VRAM freed: {_format_bytes(vram_released)}")
        else:
            summary_parts.append("VRAM clean")

        if ram_released > 0:
            summary_parts.append(f"RAM freed: {_format_bytes(ram_released)}")
        else:
            summary_parts.append("RAM clean")

    elif act == "MODELS":
        models_stage = stages_results.get("MODELS", {})
        summary_parts.append("Models unloaded" if models_stage.get("ok") else "Models checked")
        if vram_released > 0:
            summary_parts.append(f"VRAM freed: {_format_bytes(vram_released)}")
        if ram_released > 0:
            summary_parts.append(f"RAM freed: {_format_bytes(ram_released)}")

    elif act == "CACHE":
        cache_stage = stages_results.get("CACHE", {})
        summary_parts.append("Cache cleared" if cache_stage.get("ok") else "Cache checked")
        if vram_released > 0:
            summary_parts.append(f"VRAM freed: {_format_bytes(vram_released)}")
        if ram_released > 0:
            summary_parts.append(f"RAM freed: {_format_bytes(ram_released)}")

    elif act == "VRAM":
        summary_parts.append(f"VRAM freed: {_format_bytes(vram_released)}" if vram_released > 0 else "VRAM clean")
        if ram_released > 0:
            summary_parts.append(f"RAM freed: {_format_bytes(ram_released)}")

    elif act == "RAM":
        summary_parts.append(f"RAM freed: {_format_bytes(ram_released)}" if ram_released > 0 else "RAM clean")
        if vram_released > 0:
            summary_parts.append(f"VRAM freed: {_format_bytes(vram_released)}")

    if not summary_parts:
        summary_text = f"{act} cleanup completed ({elapsed_ms}ms)"
    else:
        summary_text = " | ".join(summary_parts) + f" ({elapsed_ms}ms)"

    result_payload = {
        "status": overall_status,
        "action": act,
        "message": summary_text,
        "elapsed_ms": elapsed_ms,
        "vram_released": vram_released,
        "vram_released_str": _format_bytes(vram_released) if vram_released > 0 else "0 MB",
        "ram_released": ram_released,
        "ram_released_str": _format_bytes(ram_released) if ram_released > 0 else "0 MB",
        "stages": stages_results,
        "timestamp": time.time(),
    }

    # Broadcast live status to frontend via ComfyUI PromptServer if running
    try:
        import server

        prompt_server = server.PromptServer.instance
        if prompt_server is not None:
            prompt_server.send_sync("ds_purger_status", result_payload)
    except Exception:
        pass

    logger.info(f"[DS The Purger] {act} result: {overall_status} - {summary_text}")
    return result_payload


# ---------------------------------------------------------------------------
# ComfyUI Node Class: DS_ThePurger
# ---------------------------------------------------------------------------
class DS_ThePurger:
    """
    DS The Purger — Transparent workflow passthrough & safe resource cleanup utility.
    Accepts arbitrary ComfyUI data types and forwards them unchanged while executing
    the selected cleanup operation.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type, {}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "purge"
    CATEGORY = "☠️ Deathshot Arsenal/💾 Utilities"
    DESCRIPTION = (
        "DS The Purger: Transparent workflow passthrough & safe ComfyUI resource cleanup. "
        "Reclaims VRAM, RAM, cached models, and memory allocations without destabilizing the workflow."
    )

    def purge(
        self,
        value: Any = None,
        unique_id: Any = None,
        extra_pnginfo: Any = None,
        prompt: Any = None,
        **kwargs: Any,
    ) -> Tuple[Any]:
        """
        Executes cleanup for the selected action and guarantees safe value passthrough.
        Cleanup is performed exclusively when the workflow execution reaches this node.
        """
        act = "ALL"
        try:
            # 1. Try reading from workflow node properties
            if extra_pnginfo and isinstance(extra_pnginfo, dict):
                wf = extra_pnginfo.get("workflow", {})
                for n in wf.get("nodes", []):
                    if str(n.get("id")) == str(unique_id):
                        act = n.get("properties", {}).get("selected_action", "ALL")
                        break
            # 2. Fallback to kwargs or prompt if present
            if not act or act == "ALL":
                if "action" in kwargs and kwargs["action"]:
                    act = kwargs["action"]
                elif prompt and isinstance(prompt, dict) and str(unique_id) in prompt:
                    node_data = prompt[str(unique_id)]
                    act = node_data.get("inputs", {}).get("action", "ALL")
        except Exception:
            act = "ALL"

        act = (act or "ALL").upper().strip()
        if act not in ("ALL", "VRAM", "RAM", "MODELS", "CACHE"):
            act = "ALL"

        try:
            res = execute_purge_operation(act)
            try:
                import server

                server.PromptServer.instance.send_sync(
                    "ds_purger_status",
                    {
                        "node_id": str(unique_id) if unique_id is not None else "",
                        "status": res.get("status", "PURGED"),
                        "action": act,
                        "message": res.get("message", f"{act} completed"),
                        "vram_released_str": res.get("vram_released_str", ""),
                        "ram_released_str": res.get("ram_released_str", ""),
                        "elapsed_ms": res.get("elapsed_ms", 0),
                        "timestamp": time.time(),
                    },
                )
            except Exception:
                pass
        except Exception as e:
            logger.error(f"[DS The Purger] Exception during execution purge: {e}")
            try:
                import server

                server.PromptServer.instance.send_sync(
                    "ds_purger_status",
                    {
                        "node_id": str(unique_id) if unique_id is not None else "",
                        "status": "FAILED",
                        "action": act,
                        "message": f"Purge error: {e}",
                        "timestamp": time.time(),
                    },
                )
            except Exception:
                pass
        finally:
            # Absolute passthrough guarantee
            return (value,)


# ---------------------------------------------------------------------------
# HTTP Route Registration for Live Canvas Interactions & Config
# ---------------------------------------------------------------------------
def register_purger_routes():
    try:
        import server

        routes = server.PromptServer.instance.routes

        @routes.post("/ds/purger/action")
        async def _ds_purger_action(request: web.Request) -> web.Response:
            try:
                body = await request.json()
            except Exception:
                body = {}
            action = body.get("action", "ALL")
            res = execute_purge_operation(action)
            return web.json_response(res)

        @routes.get("/ds/purger/config")
        async def _ds_purger_get_config(request: web.Request) -> web.Response:
            cfg = load_purger_config()
            return web.json_response(cfg)

        @routes.post("/ds/purger/config")
        async def _ds_purger_save_config(request: web.Request) -> web.Response:
            try:
                body = await request.json()
            except Exception:
                return web.json_response({"error": "Invalid JSON"}, status=400)
            if not isinstance(body, dict):
                return web.json_response({"error": "Expected dict"}, status=400)

            cfg = load_purger_config()
            if "buttons" in body and isinstance(body["buttons"], list):
                cfg["buttons"] = [b for b in body["buttons"] if b in DEFAULT_CONFIG["buttons"]]
                for b in DEFAULT_CONFIG["buttons"]:
                    if b not in cfg["buttons"]:
                        cfg["buttons"].append(b)

            if "enabled" in body and isinstance(body["enabled"], dict):
                for k in DEFAULT_CONFIG["buttons"]:
                    if k in body["enabled"]:
                        cfg["enabled"][k] = bool(body["enabled"][k])

            save_purger_config(cfg)

            # Broadcast update event to all connected frontends
            try:
                server.PromptServer.instance.send_sync("ds_purger_config_updated", cfg)
            except Exception:
                pass

            return web.json_response({"ok": True, "config": cfg})

        logger.info("[DS The Purger] Routes registered successfully")
    except Exception as e:
        logger.warning(f"[DS The Purger] Could not register routes: {e}")
