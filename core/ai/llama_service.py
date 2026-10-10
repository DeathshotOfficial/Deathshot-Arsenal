"""
Deathshot Arsenal — Centralized AI Core: LLM Service
Unified llama-cpp execution, model lifecycle management, and prompt completion service.
Shared across DS Randomizer, DS AI Prompt Sensei, and future AI nodes.
"""

import gc
import logging
import os
import sys
import threading
import time
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger("DeathshotArsenal.Core.AI.Service")

_SERVICE_LOCK = threading.RLock()


def _get_builtin_llm_mod():
    """Dynamically resolves and reloads the shared builtin_llm engine."""
    mod = None
    try:
        from ...nodes.AIPromptSensei import builtin_llm
        mod = builtin_llm
    except Exception:
        pass

    if mod is None:
        try:
            sensei_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "nodes", "AI Prompt Sensei")
            )
            if sensei_dir not in sys.path:
                sys.path.insert(0, sensei_dir)
            import builtin_llm
            mod = builtin_llm
        except Exception as e:
            logger.error(f"[AI Service] Could not import builtin_llm: {e}")
            return None

    if mod is not None:
        try:
            import importlib
            importlib.reload(mod)
        except Exception:
            pass
    return mod


def get_backend_status() -> Dict[str, Any]:
    """Returns the current loaded model status, VRAM usage, and backend readiness."""
    mod = _get_builtin_llm_mod()
    if mod and hasattr(mod, "get_backend_status"):
        try:
            return mod.get_backend_status()
        except Exception as e:
            logger.debug(f"[AI Service] get_backend_status error: {e}")

    return {
        "loaded": False,
        "model_name": "",
        "vram_free_mb": 0,
        "has_vision": False,
        "has_gpu": False,
    }


def unload_model() -> bool:
    """Unloads any active LLM model from memory and releases VRAM/RAM completely."""
    mod = _get_builtin_llm_mod()
    if mod and hasattr(mod, "unload"):
        try:
            return mod.unload()
        except Exception as e:
            logger.warning(f"[AI Service] Model unload error: {e}")

    # Fallback cleanup
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass
    return True


def kill_active_generation() -> bool:
    """Cancels any running generation mid-flight."""
    mod = _get_builtin_llm_mod()
    if mod and hasattr(mod, "_state"):
        mod._state["abort"] = True
        return True
    return False


def load_model(
    model_identifier: str,
    n_ctx: int = 4096,
    n_gpu_layers: int = -1,
    require_vision: bool = False,
) -> Any:
    """Loads a GGUF model into memory using safe layer offload allocation."""
    mod = _get_builtin_llm_mod()
    if not mod or not hasattr(mod, "load_model"):
        raise RuntimeError("llama-cpp backend is unavailable. Ensure llama-cpp-python is installed.")

    return mod.load_model(
        key=model_identifier,
        n_ctx=n_ctx,
        n_gpu_layers=n_gpu_layers,
        require_vision=require_vision,
    )


def generate_text_completion(
    messages: List[Dict[str, str]],
    model_id: str,
    temperature: float = 0.8,
    max_tokens: int = 2048,
    context_length: int = 4096,
    n_gpu_layers: int = -1,
    top_p: float = 0.90,
    top_k: int = 40,
    repetition_penalty: float = 1.10,
    seed: int = -1,
    auto_unload: bool = True,
    require_vision: bool = False,
) -> Tuple[str, Dict[str, Any]]:
    """
    Executes a chat completion against the specified GGUF model.
    Optionally unloads the model from VRAM immediately after generation when auto_unload=True.
    Text prompt processing explicitly enforces require_vision=False so no vision/mmproj
    projectors or image processing handlers are loaded into VRAM/RAM.
    """
    with _SERVICE_LOCK:
        mod = _get_builtin_llm_mod()
        if not mod:
            raise RuntimeError("llama-cpp backend is not available.")

        # Ensure model is loaded strictly with require_vision=False for pure text tasks
        logger.info(
            f"[AI Service] Loading model '{model_id}' (require_vision={require_vision}, "
            f"image processing/mmproj projector is {'ATTACHED' if require_vision else 'DISABLED to save VRAM/RAM'})."
        )
        load_model(
            model_identifier=model_id,
            n_ctx=context_length,
            n_gpu_layers=n_gpu_layers,
            require_vision=require_vision,
        )

        try:
            t0 = time.time()
            text, tokens, elapsed = mod.generate_chat(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                seed=seed if seed >= 0 else -1,
                top_p=top_p,
                top_k=top_k,
                repeat_penalty=repetition_penalty,
            )

            meta = {
                "tokens": tokens,
                "elapsed": round(time.time() - t0, 2),
                "model": model_id,
            }
            return text, meta
        finally:
            if auto_unload:
                try:
                    unload_model()
                    logger.info("[AI Service] Auto-unloaded model after completion (auto_unload=True).")
                except Exception as e:
                    logger.warning(f"[AI Service] Error auto-unloading model: {e}")
