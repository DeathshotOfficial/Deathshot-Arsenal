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


class DS_Randomizer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "dynamicPrompts": False,
                        "tooltip": "Source prompt template. Will be analyzed and randomized according to enabled categories.",
                    },
                ),
            },
            "optional": {
                "text": (
                    "STRING",
                    {
                        "forceInput": True,
                        "default": "",
                        "tooltip": "Optional upstream text connection. When connected, incoming text takes precedence during execution.",
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
        # When seed is non-zero (or managed across queues), maintain deterministic stability across continue/upscale stages
        if seed != 0:
            return f"{unique_id or 'default'}:{seed}"
        # Fallback if seed is 0: force re-run on fresh independent queue
        return float("nan")

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

        # 0. Check multi-stage cache: if this node was already executed for this seed (e.g. Continue/Upscale stage), return the identical prompt
        if seed != 0 and node_id in _NODE_PROMPT_CACHE:
            cached = _NODE_PROMPT_CACHE[node_id]
            if cached.get("seed") == seed and cached.get("prompt"):
                cached_prompt = cached["prompt"]
                logger.info(f"[DS Randomizer] Multi-stage pass detected for node '{node_id}' (seed {seed}). Reusing active prompt to prevent upscale artifacts.")
                return {
                    "ui": {"prompt_preview": [cached_prompt]},
                    "result": (cached_prompt,),
                }

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

        logger.info(
            f"[DS Randomizer] Executing on node '{node_id}' with {len(enabled_categories)} enabled categories. "
            f"Active prompt length: {len(active_prompt)} chars (seed: {seed})."
        )

        # 3. Execute semantic variation pipeline
        pipeline = get_randomizer_pipeline()
        final_prompt = pipeline.process(
            prompt=active_prompt,
            enabled_categories=enabled_categories,
            category_options=category_options,
            node_id=node_id,
            seed=seed if seed != 0 else None,
        )

        # Save to cache so any downstream continue/upscale pass receives the exact same prompt
        if seed != 0:
            _NODE_PROMPT_CACHE[node_id] = {"seed": seed, "prompt": final_prompt}

        return {
            "ui": {"prompt_preview": [final_prompt]},
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
