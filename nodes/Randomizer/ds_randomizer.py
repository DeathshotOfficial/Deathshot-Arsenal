"""
DeathshotArsenal - DS Randomizer Node
A smart, semantic prompt variation node with non-repeating shuffle-bag selection
and modular multi-file JSON database support.
"""

import json
import logging
from typing import Dict, Any, Optional

try:
    import server
    from aiohttp import web
except ImportError:
    server = None
    web = None

from .randomizer_engine import (
    get_db_loader,
    get_variation_selector,
    get_randomizer_pipeline,
)

logger = logging.getLogger("DeathshotArsenal.Randomizer")


# Cache last generated prompt per node to guarantee stability during multi-stage continue/upscale passes
_NODE_PROMPT_CACHE: Dict[str, Dict[str, Any]] = {}


def _get_ai_randomize():
    """
    Robust import resolver for the centralized AI prompt_randomizer module.
    Works whether DeathshotArsenal is imported as custom_nodes.DeathshotArsenal,
    DeathshotArsenal, or dynamically loaded via _load_node_pkg.
    """
    import os
    import sys

    # 1. Ensure DeathshotArsenal root directory is in sys.path
    here = os.path.dirname(os.path.abspath(__file__))  # nodes/Randomizer
    root = os.path.dirname(os.path.dirname(here))      # DeathshotArsenal
    if root not in sys.path:
        sys.path.insert(0, root)

    # 2. Try direct import from core.ai
    try:
        from core.ai.prompt_randomizer import randomize_prompt
        return randomize_prompt
    except Exception:
        pass

    # 3. Try importing from DeathshotArsenal.core.ai
    try:
        from DeathshotArsenal.core.ai.prompt_randomizer import randomize_prompt
        return randomize_prompt
    except Exception:
        pass

    # 4. Try importing from custom_nodes.DeathshotArsenal.core.ai
    try:
        from custom_nodes.DeathshotArsenal.core.ai.prompt_randomizer import randomize_prompt
        return randomize_prompt
    except Exception:
        pass

    # 5. Direct file location fallback via importlib
    try:
        import importlib.util
        target = os.path.join(root, "core", "ai", "prompt_randomizer.py")
        if os.path.isfile(target):
            spec = importlib.util.spec_from_file_location("DeathshotArsenal.core.ai.prompt_randomizer", target)
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = mod
                spec.loader.exec_module(mod)
                return getattr(mod, "randomize_prompt")
    except Exception as e:
        logger.warning(f"[DS Randomizer] importlib resolution error: {e}")

    raise ImportError("Unable to import randomize_prompt from core.ai")


class DS_Randomizer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "text": (
                    "STRING",
                    {
                        "forceInput": True,
                        "default": "",
                        "tooltip": "Optional upstream text connection. When connected, incoming text will be randomized according to enabled categories.",
                    },
                ),
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0xffffffffffffffff,
                        "tooltip": "Variation seed (0 = fresh random variation on every queue).",
                    },
                ),
                "prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "dynamicPrompts": False,
                        "tooltip": "Optional template text for backward compatibility.",
                    },
                ),
            },
            "hidden": {
                "randomizer_state": ("STRING", {"default": "{}"}),
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "randomize"
    CATEGORY = "☠️ Deathshot Arsenal/✍️ Prompt"
    OUTPUT_NODE = True

    DESCRIPTION = (
        "DeathshotArsenal intelligent prompt randomizer. Analyzes prompt structure, "
        "detects selected semantic categories, and intelligently replaces existing attributes "
        "or contextually weaves missing attributes into natural zones without blind appending. "
        "Preserves your source prompt and guarantees non-repeating variations."
    )

    @classmethod
    def IS_CHANGED(cls, prompt="", text=None, seed=0, randomizer_state="{}", unique_id=None, **kwargs):
        try:
            state = json.loads(randomizer_state) if isinstance(randomizer_state, str) else (randomizer_state or {})
        except Exception:
            state = {}

        is_ai = bool(state.get("ai_enabled", False) or state.get("ai_mode", False))
        ai_cfg = state.get("ai_settings", {})
        randomize_seed = bool(ai_cfg.get("randomize_seed", True))

        if is_ai and randomize_seed:
            # The JS queue hook writes a fresh random seed for every new Queue run,
            # but re-uses _dsLastRunSeed for Continue runs.
            # When a non-zero seed is present, return a hash keyed on seed + active_prompt
            # so that ComfyUI treats identical seeds (Continue) as unchanged while
            # treating new seeds (fresh Queue) as changed.
            if seed:
                active = text if (text is not None and str(text).strip()) else prompt
                return f"{unique_id or 'default'}:ai:{seed}:{active}"
            # No seed committed yet (shouldn't happen after the queue hook runs, but be safe)
            return float("nan")

        if not seed:
            return float("nan")

        active = text if (text is not None and str(text).strip()) else prompt
        return f"{unique_id or 'default'}:{seed}:{active}:{randomizer_state}"

    def randomize(
        self,
        prompt: str = "",
        text: Optional[str] = None,
        seed: int = 0,
        randomizer_state: str = "{}",
        unique_id: Optional[str] = None,
        **kwargs,
    ):
        node_id = str(unique_id or "default_randomizer")

        # 1. Determine active prompt: wired input ('text' or legacy 'source_text') takes precedence over editor
        source_text = kwargs.get("source_text")
        active_prompt = ""
        if text is not None and str(text).strip():
            active_prompt = str(text).strip()
        elif source_text is not None and str(source_text).strip():
            active_prompt = str(source_text).strip()
        elif prompt is not None and str(prompt).strip():
            active_prompt = str(prompt).strip()

        # 2. Parse randomizer state
        try:
            state = json.loads(randomizer_state) if isinstance(randomizer_state, str) else (randomizer_state or {})
            if not isinstance(state, dict):
                state = {}
        except Exception:
            state = {}

        enabled_categories = state.get("enabled_categories", [])
        if not isinstance(enabled_categories, list):
            enabled_categories = []

        category_options = state.get("options", {})
        if not isinstance(category_options, dict):
            category_options = {}

        is_ai_mode = bool(state.get("ai_enabled", False) or state.get("ai_mode", False))
        ai_settings = state.get("ai_settings", {})
        should_randomize_seed = bool(ai_settings.get("randomize_seed", True)) if is_ai_mode else (seed == 0)

        # 0a. Primary multi-stage cache: non-AI or AI with fixed seed
        #     Only reuse if NOT randomizing seed AND seed != 0 AND full state matches
        if not should_randomize_seed and seed != 0 and node_id in _NODE_PROMPT_CACHE:
            cached = _NODE_PROMPT_CACHE[node_id]
            if (
                cached.get("seed") == seed
                and cached.get("prompt")
                and cached.get("active_prompt") == active_prompt
                and cached.get("state") == randomizer_state
            ):
                cached_prompt = cached["prompt"]
                logger.info(f"[DS Randomizer] Multi-stage pass detected for node '{node_id}' (seed {seed}). Reusing active prompt to prevent upscale artifacts.")
                return {
                    "ui": {"prompt_preview": [cached_prompt]},
                    "result": (cached_prompt,),
                }

        # 0b. AI Continue cache: when randomize_seed=True the JS queue hook still writes
        #     a stable seed (_dsLastRunSeed) for Continue runs.  Match on seed + active_prompt
        #     only — randomizer_state is intentionally different on Continue because
        #     the queue hook clears preview_prompt before sending.
        if is_ai_mode and should_randomize_seed and seed != 0 and node_id in _NODE_PROMPT_CACHE:
            cached = _NODE_PROMPT_CACHE[node_id]
            if (
                cached.get("seed") == seed
                and cached.get("prompt")
                and cached.get("active_prompt") == active_prompt
            ):
                cached_prompt = cached["prompt"]
                logger.info(f"[DS Randomizer] AI Continue pass detected for node '{node_id}' (seed {seed}). Reusing cached AI prompt.")
                return {
                    "ui": {"prompt_preview": [cached_prompt]},
                    "result": (cached_prompt,),
                }

        logger.info(
            f"[DS Randomizer] Executing on node '{node_id}' with {len(enabled_categories)} enabled categories. "
            f"Active prompt length: {len(active_prompt)} chars (seed: {seed})."
        )

        # 3. Determine execution pipeline: AI LLM vs Classical Database Engine
        manual_preview = str(state.get("preview_prompt") or "").strip()

        final_prompt = ""
        if is_ai_mode:
            pause_for_edit = bool(ai_settings.get("pause_for_edit", False))

            # If pause_for_edit is enabled AND user has a manual preview, use it
            if pause_for_edit and manual_preview:
                final_prompt = manual_preview
            else:
                # Runs the LLM on workflow Queue, unloads LLM, and continues without pausing
                try:
                    ai_randomize = _get_ai_randomize()

                    if ai_settings.get("free_comfy_memory", True):
                        try:
                            import comfy.model_management as mm
                            mm.unload_all_models()
                            mm.soft_empty_cache()
                        except Exception:
                            pass

                    ai_cfg = dict(ai_settings)
                    if "auto_unload" not in ai_cfg:
                        ai_cfg["auto_unload"] = True
                    # DS Randomizer is strictly a text-only prompt modification node.
                    # Enforce require_vision=False to prevent loading mmproj vision projectors or image handlers into VRAM/RAM.
                    ai_cfg["require_vision"] = False

                    res = ai_randomize(
                        prompt=active_prompt,
                        enabled_categories=enabled_categories,
                        options=category_options,
                        ai_settings=ai_cfg,
                        seed=seed if seed != 0 else None,
                        node_id=node_id,
                    )
                    final_prompt = res.get("prompt", active_prompt)
                    actual_seed = res.get("seed", seed)
                except Exception as e:
                    logger.error(f"[DS Randomizer] AI randomization error: {e}. Falling back to database pipeline.")
                    pipeline = get_randomizer_pipeline()
                    final_prompt = pipeline.process(
                        prompt=active_prompt,
                        enabled_categories=enabled_categories,
                        category_options=category_options,
                        node_id=node_id,
                        seed=seed if seed != 0 else None,
                    )
                    actual_seed = seed
        else:
            # Classical semantic database replacement
            pipeline = get_randomizer_pipeline()
            final_prompt = pipeline.process(
                prompt=active_prompt,
                enabled_categories=enabled_categories,
                category_options=category_options,
                node_id=node_id,
                seed=seed if seed != 0 else None,
            )
            actual_seed = seed

        # Save to cache so downstream checkpoints and multi-stage continue passes receive the exact executed prompt
        _NODE_PROMPT_CACHE[node_id] = {
            "seed": actual_seed,
            "prompt": final_prompt,
            "active_prompt": active_prompt,
            "state": randomizer_state,
        }

        return {
            "ui": {
                "prompt_preview": [final_prompt],
                "seed": [actual_seed],
            },
            "result": (final_prompt,),
        }


def register_randomizer_routes():
    """Registers HTTP API endpoints for DS Randomizer frontend interaction."""
    try:
        if server is None or not hasattr(server, "PromptServer"):
            return
        ps = getattr(server.PromptServer, "instance", None)
        if ps is None or not hasattr(ps, "routes") or ps.routes is None:
            return
        routes = ps.routes
    except Exception as e:
        logger.warning(f"[DS Randomizer] Route registration deferred or unavailable: {e}")
        return

    @routes.get("/ds/randomizer/categories")
    async def _get_categories(request):
        try:
            db = get_db_loader()
            return web.json_response(db.get_catalog())
        except Exception as e:
            logger.error(f"[DS Randomizer] Failed getting categories: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/ds/randomizer/preview")
    async def _preview_variation(request):
        try:
            payload = await request.json()
            text = payload.get("text", "")
            enabled_categories = payload.get("enabled_categories", [])
            options = payload.get("options", {})
            node_id = str(payload.get("node_id", "preview_node"))
            seed = payload.get("seed", 0)

            pipeline = get_randomizer_pipeline()
            preview = pipeline.process(
                prompt=text,
                enabled_categories=enabled_categories,
                category_options=options,
                node_id=node_id,
                seed=seed if seed else None,
            )

            return web.json_response({"preview": preview})
        except Exception as e:
            logger.error(f"[DS Randomizer] Failed preview generation: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/ds/randomizer/ai_preview")
    async def _ai_preview_variation(request):
        try:
            payload = await request.json()
            text = payload.get("text", "") or payload.get("prompt", "")
            enabled_categories = payload.get("enabled_categories", [])
            options = payload.get("options", {})
            ai_settings = payload.get("ai_settings", {})
            seed = payload.get("seed", 0)
            node_id = str(payload.get("node_id") or "")

            ai_cfg = dict(ai_settings)
            ai_cfg["require_vision"] = False

            ai_randomize = _get_ai_randomize()

            import asyncio
            result = await asyncio.to_thread(
                ai_randomize,
                prompt=text,
                enabled_categories=enabled_categories,
                options=options,
                ai_settings=ai_cfg,
                seed=seed if seed else None,
                node_id=node_id or None,
            )
            return web.json_response({
                "preview": result.get("prompt", ""),
                "model": result.get("model", ""),
                "tokens": result.get("tokens", 0),
                "elapsed": result.get("elapsed", 0),
                "cache_stats": result.get("cache_stats", {}),
                "status_note": result.get("status_note", ""),
            })
        except Exception as e:
            logger.error(f"[DS Randomizer] Failed AI preview generation: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/ds/randomizer/reset_history")
    async def _reset_history(request):
        try:
            payload = await request.json()
            node_id = payload.get("node_id")
            selector = get_variation_selector()
            selector.reset(node_id)
            return web.json_response({"success": True, "reset_node": node_id})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.post("/ds/randomizer/reload_db")
    async def _reload_db(request):
        try:
            db = get_db_loader()
            db.load()
            return web.json_response({
                "success": True,
                "categories_count": len(db.categories),
                "groups_count": len(db.groups),
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)


NODE_CLASS_MAPPINGS = {
    "DS_Randomizer": DS_Randomizer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_Randomizer": "DS Randomizer",
}
