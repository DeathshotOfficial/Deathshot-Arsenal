"""
DS AI Prompt Sensei — Prompt generation
Builds the Sensei chat messages and runs them on the shared core.ai backends
(Built-In llama.cpp or LM Studio), streaming progress to the node UI.
"""

import logging
import os
import random

import folder_paths
import server

from core.ai import GenerationCancelled, generate_text_completion, image_data_url, list_builtin_models, lm_studio

from .prompt_manager import clean_generated_prompt, load_default_prompt

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei")


def resolve_image_path(image_path):
    """Resolve an image_path to an absolute filesystem path, or None."""
    if not image_path:
        return None
    resolved = None
    try:
        resolved = folder_paths.get_annotated_filepath(image_path)
    except Exception:
        pass
    if not resolved or not os.path.isfile(resolved):
        cand = os.path.join(folder_paths.get_input_directory(), image_path)
        resolved = cand if os.path.isfile(cand) else image_path
    return resolved if os.path.isfile(resolved) else None


def _send(event, payload):
    server.PromptServer.instance.send_sync(event, payload)


def _progress(stage, message, node_id, model, **extra):
    _send("ds_sensei_progress", {
        "stage": stage,
        "message": message,
        "tokens": extra.pop("tokens", 0),
        "speed": extra.pop("speed", 0.0),
        "elapsed": extra.pop("elapsed", 0.0),
        "model": model,
        "node_id": node_id,
        **extra,
    })


def _stream_sender(node_id, model):
    def _on_progress(text, tokens, elapsed):
        speed = round(tokens / elapsed, 1)
        _send("ds_sensei_stream", {
            "node_id": node_id,
            "text": text,
            "tokens": tokens,
            "speed": speed,
            "elapsed": elapsed,
            "model": model,
        })
        _progress("generating", f"Writing prompt: {tokens} tokens ({elapsed}s · {speed} Tk/s)...",
                  node_id, model, tokens=tokens, speed=speed, elapsed=elapsed)
    return _on_progress


def _resolve_seed(cfg):
    seed = cfg.get("seed")
    try:
        seed = int(seed)
    except (TypeError, ValueError):
        seed = -1
    if cfg.get("randomize_seed", True) or seed < 0:
        return random.randint(0, 2147483647)
    return seed


def _builtin_completion(notes, system_prompt, image_url, cfg, node_id, check_interrupt):
    model_key = cfg.get("model")
    if not model_key:
        available = list_builtin_models()
        if not available:
            raise RuntimeError("No Built-In model found. Place GGUF models in ComfyUI/models/LLM or select a model in Gear Menu > Built In.")
        model_key = available[0]["id"]
    model_name = os.path.basename(model_key).replace(".gguf", "")

    user_text = notes or "Write a cinematic scene prompt."
    messages = []
    if "gemma" in model_key.lower():
        # Gemma chat templates have no system role; fold the instructions into the user turn.
        user_text = (
            f"{system_prompt}\n\nScene Details:\n{user_text}\n\n"
            f"CRITICAL: Output ONLY the final prompt text. Do NOT include any preamble, analysis, thought process, notes, or instructions."
        )
    else:
        messages.append({"role": "system", "content": system_prompt})
    if image_url:
        messages.append({"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": image_url}},
            {"type": "text", "text": user_text},
        ]})
    else:
        messages.append({"role": "user", "content": user_text})

    # On-demand vision attaches the projector only when an image is sent; otherwise keep it
    # attached so switching between I2V and T2V never reloads the model.
    require_vision = bool(image_url) or cfg.get("enable_vision") is False
    seed = _resolve_seed(cfg)

    _progress("loading", f"Loading model {model_name}...", node_id, model_name)
    text, meta = generate_text_completion(
        messages=messages,
        model_id=model_key,
        temperature=float(cfg.get("temperature", 0.7)),
        max_tokens=int(cfg.get("max_tokens", 2048)),
        context_length=int(cfg.get("context_length", 8192)),
        n_gpu_layers=0 if cfg.get("cpu_only") else int(cfg.get("n_gpu_layers", -1)),
        top_p=float(cfg.get("top_p", 0.95)),
        top_k=int(cfg.get("top_k", 40)),
        repetition_penalty=float(cfg.get("repetition_penalty", 1.1)),
        seed=seed,
        auto_unload=bool(cfg.get("auto_unload", True)),
        require_vision=require_vision,
        free_comfy=bool(cfg.get("free_comfy_memory", True)),
        check_interrupt=check_interrupt,
        on_progress=_stream_sender(node_id, model_name),
    )
    return text, meta["tokens"], meta["elapsed"], meta["model"], seed


def _lm_studio_completion(notes, system_prompt, image_url, cfg, node_id):
    user_text = notes or ("Analyze this image and write a cinematic, detailed video generation prompt." if image_url
                          else "Generate a rich, cinematic video generation prompt.")
    user_content = [{"type": "text", "text": user_text}, {"type": "image_url", "image_url": {"url": image_url}}] if image_url else user_text
    seed = _resolve_seed(cfg)
    model = str(cfg.get("model") or "")
    try:
        text, tokens, elapsed, model = lm_studio.chat_completion(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
            ip=cfg.get("ip") or "127.0.0.1",
            port=cfg.get("port") or 1234,
            model=model,
            max_tokens=int(cfg.get("max_tokens") or 2048),
            temperature=float(cfg.get("temperature", 0.7)),
            seed=seed,
            timeout=float(cfg.get("timeout") or 300.0),
            on_progress=_stream_sender(node_id, model or "LM Studio"),
        )
    finally:
        if cfg.get("unload_after_run"):
            lm_studio.unload_model(ip=cfg.get("ip") or "127.0.0.1", port=cfg.get("port") or 1234, model_name=model)
    return text, tokens, elapsed, model, seed


def generate_prompt(
    provider,
    mode,
    scene_notes,
    system_prompt=None,
    image_path=None,
    image_tensor=None,
    cfg=None,
    node_id=None,
    check_interrupt=None,
):
    """
    Generate a Sensei prompt with the Built-In LLM ("built_in") or LM Studio.
    Returns {"status": "completed"|"failed"|"cancelled", "prompt", "tokens", "speed", "elapsed", "model", "seed", "error", "error_type"}.
    ComfyUI interrupts raised by check_interrupt propagate to the caller.
    """
    cfg = dict(cfg or {})
    node_id = str(node_id) if node_id is not None else None
    notes = (scene_notes or "").strip()
    system_prompt = (system_prompt or "").strip() or load_default_prompt(mode)
    is_lm = provider != "built_in"
    model_label = str(cfg.get("model") or ("LM Studio" if is_lm else "GGUF Model"))

    resolved = resolve_image_path(image_path) if image_tensor is None else None
    image_url = None
    if image_tensor is not None or resolved:
        image_url = image_data_url(image_tensor=image_tensor, image_path=resolved,
                                   max_side=1536 if is_lm else 1280, quality=88 if is_lm else 90)

    try:
        if is_lm:
            text, tokens, elapsed, model, seed = _lm_studio_completion(notes, system_prompt, image_url, cfg, node_id)
        else:
            text, tokens, elapsed, model, seed = _builtin_completion(notes, system_prompt, image_url, cfg, node_id, check_interrupt)
    except GenerationCancelled:
        logger.info("[Prompt Sensei] Generation cancelled by user.")
        _progress("cancelled", "Generation stopped by user.", node_id, model_label, prompt="")
        return {"status": "cancelled", "error": "Generation interrupted by user", "prompt": notes}
    except lm_studio.LMStudioError as e:
        logger.warning(f"[Prompt Sensei] LM Studio: {e}")
        _progress("failed", f"Generation failed: {e}", node_id, model_label, prompt="")
        return {"status": "failed", "error": str(e), "error_type": e.error_type, "model": model_label, "prompt": notes}
    except (RuntimeError, ValueError, OSError) as e:
        logger.error(f"[Prompt Sensei] Generation error: {e}")
        _progress("failed", f"Generation failed: {e}", node_id, model_label, prompt="")
        return {"status": "failed", "error": str(e), "prompt": notes}

    prompt = clean_generated_prompt(text, system_prompt=system_prompt)
    speed = round(tokens / elapsed, 1)
    _progress("completed", f"Completed ({tokens} tokens · {speed} Tk/s · {elapsed}s)", node_id, model,
              tokens=tokens, speed=speed, elapsed=elapsed, prompt=prompt)
    return {
        "status": "completed",
        "prompt": prompt,
        "tokens": tokens,
        "speed": speed,
        "elapsed": elapsed,
        "model": model,
        "seed": seed,
    }
