"""
Deathshot Arsenal — DS Image Describer Node
Takes an image, analyzes it with a local vision LLM, and outputs a detailed text-to-image prompt.
Supports streaming, pause-to-edit, rich telemetry, and deterministic workflow execution.
"""

import hashlib
import json
import logging
import os
import random
import time
import torch
from PIL import Image

import comfy.model_management as mm
import folder_paths

try:
    from .describer_engine import (
        DEFAULT_SYSTEM_PROMPT,
        DEFAULT_SYSTEM_PROMPTS,
        get_system_prompt,
        describe_image_sync,
        compute_image_hash,
        pause_manager,
        set_debug_logging,
        _IMAGE_CACHE,
        tensor_to_pil,
    )
except (ImportError, ValueError):
    import sys
    cur_dir = os.path.dirname(__file__)
    if cur_dir not in sys.path:
        sys.path.insert(0, cur_dir)
    from describer_engine import (
        DEFAULT_SYSTEM_PROMPT,
        DEFAULT_SYSTEM_PROMPTS,
        get_system_prompt,
        describe_image_sync,
        compute_image_hash,
        pause_manager,
        set_debug_logging,
        _IMAGE_CACHE,
        tensor_to_pil,
    )


logger = logging.getLogger("DeathshotArsenal.ImageDescriber")


class DS_ImageDescriber:
    """
    DS Image Describer - High-performance local multimodal prompt extraction node.
    Extracts recreation prompts directly from images using local GGUF vision models.
    All UI widgets are frontend-owned in the card layout.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "The input image to analyze with the vision LLM."}),
            },
            "hidden": {
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "dynamicPrompts": False,
                    },
                ),
                "describer_state": ("STRING", {"default": "{}"}),
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "IMAGE")
    RETURN_NAMES = ("prompt", "image")
    FUNCTION = "describe"
    CATEGORY = "☠️ Deathshot Arsenal/🧠 AI"
    OUTPUT_NODE = True

    DESCRIPTION = (
        "DS Image Describer analyzes an input image using a local multimodal vision LLM "
        "and produces a rich, recreation-ready text-to-image prompt. Features real-time token "
        "streaming, Pause-to-Edit workflow control, auto-unload, and presets."
    )

    @classmethod
    def IS_CHANGED(cls, image=None, text="", describer_state="{}", **kwargs):
        try:
            state = json.loads(describer_state) if isinstance(describer_state, str) else (describer_state or {})
        except Exception:
            state = {}

        mode = state.get("mode", "Auto")
        if mode == "Always re-analyze":
            return str(time.time())

        if mode == "Use text only":
            return hashlib.sha256((text or "").encode("utf-8")).hexdigest()

        # Auto mode: hash image and settings + text
        img_hash = compute_image_hash(image) if image is not None else "no_image"
        stable_settings = {
            "m": state.get("model", ""),
            "t": state.get("temperature", 0.8),
            "mt": state.get("max_new_tokens", 2048),
            "ctx": state.get("n_ctx", 4096),
            "gpu": state.get("gpu_layers", -1),
            "tp": state.get("top_p", 0.90),
            "tk": state.get("top_k", 40),
            "rp": state.get("repeat_penalty", 1.10),
            "mp": state.get("min_p", 0.05),
            "s": state.get("seed", -1),
            "sp": state.get("system_prompt", ""),
            "dl": state.get("detail_level", "Detailed"),
            "os": state.get("output_style", "Natural prose"),
            "pfx": state.get("prefix", ""),
            "sfx": state.get("suffix", ""),
            "side": state.get("max_image_side", 1024),
            "text": text or "",
        }
        settings_str = json.dumps(stable_settings, sort_keys=True)
        return hashlib.sha256(f"{img_hash}:{settings_str}".encode("utf-8")).hexdigest()

    def describe(
        self,
        image,
        text="",
        describer_state="{}",
        unique_id=None,
        extra_pnginfo=None,
    ):
        try:
            state = json.loads(describer_state) if isinstance(describer_state, str) else (describer_state or {})
        except Exception:
            state = {}

        node_id_str = str(unique_id) if unique_id is not None else "describer_node"

        # Read config options from state
        mode = str(state.get("mode", "Auto"))
        pause_to_edit = bool(state.get("pause_to_edit", False))
        pause_timeout = int(state.get("pause_timeout", 0))
        model = str(state.get("model", ""))
        temperature = float(state.get("temperature", 0.8))
        top_p = float(state.get("top_p", 0.90))
        top_k = int(state.get("top_k", 40))
        min_p = float(state.get("min_p", 0.05))
        repeat_penalty = float(state.get("repeat_penalty", 1.10))
        max_new_tokens = int(state.get("max_new_tokens", 2048))
        n_ctx = int(state.get("n_ctx", 4096))
        gpu_layers = int(state.get("gpu_layers", -1))
        seed = int(state.get("seed", -1))
        randomize_seed = bool(state.get("randomize_seed", True))
        detail_level = str(state.get("detail_level", "Detailed"))
        output_style = str(state.get("output_style", "Natural prose"))
        prefix = str(state.get("prefix", ""))
        suffix = str(state.get("suffix", ""))
        cleanup_markdown = bool(state.get("cleanup_markdown", True))
        system_prompt = state.get("system_prompt")
        max_image_side = int(state.get("max_image_side", 1024))
        auto_unload = bool(state.get("auto_unload", True))
        free_comfy_models = bool(state.get("free_comfy_models", False))
        debug_logging = bool(state.get("debug_logging", False))

        set_debug_logging(debug_logging)

        if image is None:
            if mode == "Use text only" and text and text.strip():
                logger.info("[Image Describer] No image connected; outputting text in 'Use text only' mode.")
                empty_img = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
                return {
                    "ui": {"prompt": [text.strip()]},
                    "result": (text.strip(), empty_img),
                }
            raise ValueError("DS Image Describer: No input image connected. Please wire an IMAGE into the node.")

        current_text = str(text or "").strip()

        # ------------------------------------------------------------------
        # Execution Mode 1: Use Text Only
        # ------------------------------------------------------------------
        if mode == "Use text only":
            if not current_text:
                raise ValueError("DS Image Describer: Mode is 'Use text only' but the prompt text field is empty.")
            logger.info(f"[Image Describer] Mode is 'Use text only'. Outputting existing prompt ({len(current_text)} chars).")
            return {
                "ui": {"prompt": [current_text]},
                "result": (current_text, image),
            }

        # ------------------------------------------------------------------
        # Execution Mode 2: Auto Reuse Check
        # ------------------------------------------------------------------
        img_hash = compute_image_hash(image, max_side=max_image_side)
        cache_key = f"{img_hash}_{model}_{detail_level}_{output_style}_{temperature}_{max_new_tokens}"

        if mode == "Auto" and current_text and cache_key in _IMAGE_CACHE:
            cached_data = _IMAGE_CACHE[cache_key]
            if cached_data.get("text") == current_text:
                logger.info(f"[Image Describer] Auto mode: Image and settings unchanged. Reusing cached prompt ({len(current_text)} chars).")
                return {
                    "ui": {"prompt": [current_text]},
                    "result": (current_text, image),
                }

        # ------------------------------------------------------------------
        # Execution Mode 3: Vision LLM Analysis
        # ------------------------------------------------------------------
        effective_seed = random.randint(0, 0xffffffffffffffff) if (randomize_seed or seed < 0) else seed
        effective_sys_prompt = get_system_prompt(detail_level, output_style, system_prompt)

        logger.info(
            f"[Image Describer] Running Vision LLM analysis (mode={mode}, detail={detail_level}, "
            f"style={output_style}, seed={effective_seed})..."
        )

        def check_comfy_interrupt():
            mm.throw_exception_if_processing_interrupted()

        # Save small thumbnail for UI preview
        temp_thumb_info = None
        try:
            pil_thumb = tensor_to_pil(image, max_side=384)
            thumb_name = f"describer_thumb_{node_id_str}_{img_hash[:8]}.jpg"
            temp_dir = folder_paths.get_temp_directory()
            thumb_path = os.path.join(temp_dir, thumb_name)
            pil_thumb.save(thumb_path, format="JPEG", quality=85)
            temp_thumb_info = [{"filename": thumb_name, "subfolder": "", "type": "temp"}]
        except Exception as e:
            logger.debug(f"[Image Describer] Thumbnail preview save note: {e}")

        # Execute Vision Generation
        gen_result = describe_image_sync(
            image_tensor=image,
            model_key=model if model else None,
            system_prompt=effective_sys_prompt,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            min_p=min_p,
            repeat_penalty=repeat_penalty,
            max_tokens=max_new_tokens,
            n_ctx=n_ctx,
            gpu_layers=gpu_layers,
            seed=effective_seed,
            max_image_side=max_image_side,
            cleanup_markdown=cleanup_markdown,
            prefix=prefix,
            suffix=suffix,
            auto_unload=auto_unload,
            free_comfy=free_comfy_models,
            node_id=node_id_str,
            check_interrupt=check_comfy_interrupt,
        )

        generated_prompt = gen_result["prompt"]
        _IMAGE_CACHE[cache_key] = {"text": generated_prompt, "time": time.time()}

        # ------------------------------------------------------------------
        # Pause-to-Edit Workflow Hold
        # ------------------------------------------------------------------
        final_prompt = generated_prompt
        if pause_to_edit:
            logger.info(f"[Image Describer] Node {node_id_str} entering Pause-to-Edit state. Waiting for Continue signal...")
            pause_evt = pause_manager.register_pause(node_id_str, generated_prompt)

            # Broadcast pause event to frontend
            try:
                import server
                server.PromptServer.instance.send_sync("ds_describer_paused", {
                    "node_id": node_id_str,
                    "status": "Paused (waiting for you)",
                    "text": generated_prompt,
                    "tokens": gen_result.get("tokens", 0),
                    "speed": gen_result.get("speed", 0.0),
                    "elapsed": gen_result.get("elapsed", 0.0),
                    "model": gen_result.get("model", ""),
                })
            except Exception:
                pass

            t_pause_start = time.time()
            timeout_sec = float(pause_timeout) if pause_timeout > 0 else float("inf")

            while not pause_evt.is_set():
                mm.throw_exception_if_processing_interrupted()
                if time.time() - t_pause_start >= timeout_sec:
                    logger.info(f"[Image Describer] Pause timeout ({pause_timeout}s) elapsed. Continuing workflow automatically.")
                    break
                time.sleep(0.08)

            user_edited_prompt = pause_manager.get_text_and_cleanup(node_id_str)
            if user_edited_prompt:
                final_prompt = user_edited_prompt
                logger.info(f"[Image Describer] Workflow resumed with edited prompt ({len(final_prompt)} chars).")
            else:
                logger.info(f"[Image Describer] Workflow resumed with generated prompt ({len(final_prompt)} chars).")

        # ------------------------------------------------------------------
        # Output Payload
        # ------------------------------------------------------------------
        ui_dict = {"prompt": [final_prompt]}
        if temp_thumb_info:
            ui_dict["describer_preview"] = temp_thumb_info

        return {
            "ui": ui_dict,
            "result": (final_prompt, image),
        }


NODE_CLASS_MAPPINGS = {
    "DS_ImageDescriber": DS_ImageDescriber,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_ImageDescriber": "DS Image Describer",
}
