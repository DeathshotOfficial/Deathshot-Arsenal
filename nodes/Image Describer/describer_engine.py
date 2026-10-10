"""
Deathshot Arsenal — DS Image Describer Engine
High-performance vision prompt extraction, streaming, and execution management.
Reuses the local LLM backend from AI Prompt Sensei.
"""

import base64
import collections
import gc
import hashlib
import io
import json
import logging
import os
import re
import sys
import threading
import time
import numpy as np
from PIL import Image
import torch

# ---------------------------------------------------------------------------
# Logging & In-Memory Log Buffer
# ---------------------------------------------------------------------------
logger = logging.getLogger("DeathshotArsenal.ImageDescriber")
logger.setLevel(logging.INFO)

class MemoryLogHandler(logging.Handler):
    """Ring buffer of recent log messages for the in-node log viewer."""
    def __init__(self, max_records=200):
        super().__init__()
        self.records = collections.deque(maxlen=max_records)
        self.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", "%H:%M:%S"))

    def emit(self, record):
        try:
            msg = self.format(record)
            self.records.append({
                "time": time.strftime("%H:%M:%S", time.localtime(record.created)),
                "level": record.levelname,
                "message": record.getMessage(),
                "formatted": msg,
            })
        except Exception:
            pass

_mem_handler = MemoryLogHandler(max_records=200)
if not any(isinstance(h, MemoryLogHandler) for h in logger.handlers):
    logger.addHandler(_mem_handler)


def set_debug_logging(enabled: bool):
    logger.setLevel(logging.DEBUG if enabled else logging.INFO)


def get_recent_logs(limit: int = 100):
    return list(_mem_handler.records)[-limit:]


# ---------------------------------------------------------------------------
# Built-In LLM Import Bridge
# ---------------------------------------------------------------------------
def _get_builtin_llm():
    try:
        from ..AI_Prompt_Sensei import builtin_llm
        return builtin_llm
    except Exception:
        pass
    try:
        sensei_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "AI Prompt Sensei"))
        if sensei_dir not in sys.path:
            sys.path.insert(0, sensei_dir)
        import builtin_llm
        return builtin_llm
    except Exception as e:
        logger.error(f"[Image Describer] Failed to import builtin_llm: {e}")
        return None


# ---------------------------------------------------------------------------
# System Prompts & Presets
# ---------------------------------------------------------------------------
DEFAULT_SYSTEM_PROMPTS = {
    "Detailed": (
        "You are an expert AI vision prompt generator for text-to-image AI models (Flux, Midjourney, SDXL).\n"
        "Analyze the provided image and generate a vivid, comprehensive description prompt describing all visual elements:\n"
        "1. Subject(s): identity, pose, clothing, facial expression, textures, details.\n"
        "2. Setting: environment, background, objects, architectural style, atmosphere.\n"
        "3. Composition: framing, camera angle, lens perspective, depth of field.\n"
        "4. Lighting & Color: light sources, highlights, shadows, color temperature, palette.\n"
        "5. Style & Medium: photographic style (e.g. 35mm film, editorial) or artistic medium (e.g. digital art, oil painting).\n\n"
        "MANDATORY RULES:\n"
        "- Output ONLY the final visual recreation prompt in natural flowing prose.\n"
        "- NEVER output any internal reasoning, thoughts, analysis, <think> tags, or conversational remarks.\n"
        "- Do NOT use introductory or conversational filler (e.g. 'Here is a prompt', 'The image depicts'). Start immediately with the visual description.\n"
        "- Do NOT use generic buzzwords like 'hyperrealistic', '8k', 'trending on artstation'. Describe concrete physical details instead."
    ),
    "Concise": (
        "You are an expert AI vision prompt generator. Generate a concise, high-impact text-to-image prompt "
        "(40-80 words) describing the main subject, setting, lighting, and artistic style of the image. "
        "Output ONLY the prompt. NEVER output thinking tags, explanations, or conversational preamble."
    ),
    "Exhaustive": (
        "You are an expert AI vision prompt generator. Generate an exhaustive, ultra-detailed text-to-image prompt "
        "describing every single discernible element in the image: subject anatomy, textures, clothing folds, "
        "background elements, lighting, camera qualities, and style. "
        "Output ONLY the prompt in natural prose. NEVER output thinking tags or conversational preambles."
    ),
    "Tags": (
        "You are an expert AI vision tag generator. Generate a dense, high-quality comma-separated list of tags describing "
        "the subject, pose, clothing, hair, environment, lighting, camera angle, and artistic medium. "
        "Output ONLY the tags separated by commas. NEVER output thinking tags or conversational preambles."
    ),
    "Both": (
        "You are an expert image prompt extractor. First write a detailed natural prose paragraph describing "
        "the subject, environment, lighting, and style. Follow it with a comma-separated list of descriptive keywords. "
        "Output ONLY the prompt content. NEVER output thinking tags or conversational preambles."
    )
}

DEFAULT_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPTS["Detailed"]


def get_system_prompt(detail_level: str = "Detailed", output_style: str = "Natural prose", custom_prompt: str = ""):
    if custom_prompt and custom_prompt.strip():
        return custom_prompt.strip()

    if output_style == "Comma-separated tags":
        return DEFAULT_SYSTEM_PROMPTS["Tags"]
    elif output_style == "Both":
        return DEFAULT_SYSTEM_PROMPTS["Both"]

    return DEFAULT_SYSTEM_PROMPTS.get(detail_level, DEFAULT_SYSTEM_PROMPTS["Detailed"])


# ---------------------------------------------------------------------------
# Text Post-Processing & Formatting
# ---------------------------------------------------------------------------
_PREAMBLE_PATTERNS = [
    r"^(?:here(?:\s+is|\s+'s)?(?:\s+a|\s+the)?\s+(?:detailed\s+)?(?:description|prompt|breakdown|analysis)(?:\s+of\s+the\s+image)?:?\s*)",
    r"^(?:this\s+image\s+(?:shows|depicts|features|displays|presents|is|illustrates)\s*:?\s*)",
    r"^(?:in\s+this\s+image,?\s*)",
    r"^(?:sure(?:thing)?!?,?\s*(?:here(?:\s+is|\s+'s)?)?\s*)",
    r"^(?:certainly!?,?\s*(?:here(?:\s+is|\s+'s)?)?\s*)",
    r"^(?:based\s+on\s+the\s+image,?\s*)",
    r"^(?:(?:visual\s+)?prompt\s*:\s*)",
    r"^(?:description\s*:\s*)",
]

def strip_reasoning_and_preamble(text: str, is_final: bool = False) -> str:
    """Removes <think>...</think>, <thought>...</thought>, and conversational preambles."""
    if not text:
        return ""
    
    # Strip thinking / reasoning tags
    if is_final:
        cleaned = re.sub(r"<(?:think|thought|reasoning)>[\s\S]*?</(?:think|thought|reasoning)>", "", text, flags=re.IGNORECASE)
    else:
        # During streaming, strip everything from unclosed <think> tag to the current end
        cleaned = re.sub(r"<(?:think|thought|reasoning)>[\s\S]*?(?:</(?:think|thought|reasoning)>|$)", "", text, flags=re.IGNORECASE)

    # Strip code blocks if any
    cleaned = re.sub(r"^```(?:markdown|text|prompt)?\s*", "", cleaned, flags=re.IGNORECASE)
    if is_final:
        cleaned = re.sub(r"\s*```$", "", cleaned)

    # Strip leading conversational preambles
    for pattern in _PREAMBLE_PATTERNS:
        cleaned = re.sub(pattern, "", cleaned, count=1, flags=re.IGNORECASE)

    return cleaned.strip()


def clean_generated_prompt(raw_text: str, cleanup_markdown: bool = True, prefix: str = "", suffix: str = "") -> str:
    if not raw_text:
        return ""

    text = strip_reasoning_and_preamble(raw_text, is_final=True)

    if cleanup_markdown:
        # Remove leading/trailing quotes if the whole text is enclosed
        if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
            if len(text) >= 2:
                text = text[1:-1].strip()

    # Apply Prefix and Suffix
    parts = []
    if prefix and prefix.strip():
        parts.append(prefix.strip().rstrip(","))
    if text:
        parts.append(text.lstrip(",").rstrip(","))
    if suffix and suffix.strip():
        parts.append(suffix.strip().lstrip(","))

    final_text = ", ".join(parts) if len(parts) > 1 else (parts[0] if parts else "")
    return final_text.strip()


# ---------------------------------------------------------------------------
# Image Utilities & Hash Cache
# ---------------------------------------------------------------------------
_IMAGE_CACHE = {} # (image_hash, settings_hash) -> {"text": str, "timestamp": float}

def tensor_to_pil(image_tensor, max_side: int = 1024) -> Image.Image:
    """Converts a ComfyUI image tensor [B, H, W, C] to PIL Image (RGB)."""
    if image_tensor is None:
        raise ValueError("No image tensor provided.")

    if hasattr(image_tensor, "cpu"):
        arr = image_tensor[0].cpu().numpy()
    else:
        arr = np.array(image_tensor[0])

    # Convert to uint8 RGB
    arr = np.clip(255.0 * arr, 0, 255).astype(np.uint8)
    if arr.ndim == 2:
        img = Image.fromarray(arr, mode="L").convert("RGB")
    elif arr.shape[-1] == 4:
        img = Image.fromarray(arr, mode="RGBA").convert("RGB")
    else:
        img = Image.fromarray(arr, mode="RGB")

    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    return img


def compute_image_hash(image_tensor, max_side: int = 1024) -> str:
    """Fast hash of image downscaled preview bytes for caching and IS_CHANGED."""
    try:
        img = tensor_to_pil(image_tensor, max_side=min(max_side, 512))
        bio = io.BytesIO()
        img.save(bio, format="JPEG", quality=85)
        return hashlib.sha256(bio.getvalue()).hexdigest()[:24]
    except Exception as e:
        logger.debug(f"[Image Describer] Hash computation fallback: {e}")
        return hashlib.sha256(str(getattr(image_tensor, "shape", "")).encode()).hexdigest()[:24]


def encode_pil_to_base64(img: Image.Image, quality: int = 90) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


# ---------------------------------------------------------------------------
# Pause / Continue State Management
# ---------------------------------------------------------------------------
class PauseManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._pauses = {} # node_id -> {"event": threading.Event(), "text": str, "time": float}

    def register_pause(self, node_id: str, initial_text: str):
        with self._lock:
            evt = threading.Event()
            self._pauses[str(node_id)] = {
                "event": evt,
                "text": str(initial_text),
                "time": time.time(),
            }
            return evt

    def release_pause(self, node_id: str, updated_text: str = None) -> bool:
        with self._lock:
            info = self._pauses.get(str(node_id))
            if not info:
                return False
            if updated_text is not None:
                info["text"] = str(updated_text)
            info["event"].set()
            return True

    def get_text_and_cleanup(self, node_id: str) -> str:
        with self._lock:
            info = self._pauses.pop(str(node_id), None)
            return info["text"] if info else ""

    def is_paused(self, node_id: str) -> bool:
        with self._lock:
            info = self._pauses.get(str(node_id))
            return bool(info and not info["event"].is_set())

pause_manager = PauseManager()


# ---------------------------------------------------------------------------
# VRAM / Memory Freeing Helper
# ---------------------------------------------------------------------------
def free_vram_and_comfy_models():
    """Aggressively free VRAM and ComfyUI model cache."""
    try:
        import comfy.model_management as mm
        mm.unload_all_models()
        mm.soft_empty_cache()
    except Exception:
        pass

    gc.collect()
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass


def get_vram_status():
    """Return free and total VRAM in MB if CUDA is available."""
    try:
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            return {
                "available_mb": round(free / (1024 * 1024)),
                "total_mb": round(total / (1024 * 1024)),
                "used_mb": round((total - free) / (1024 * 1024)),
                "has_cuda": True,
            }
    except Exception:
        pass
    return {"available_mb": 0, "total_mb": 0, "used_mb": 0, "has_cuda": False}


# ---------------------------------------------------------------------------
# Core Vision Generation Routine
# ---------------------------------------------------------------------------
def describe_image_sync(
    image_tensor,
    model_key: str = None,
    system_prompt: str = None,
    temperature: float = 0.8,
    top_p: float = 0.95,
    top_k: int = 40,
    min_p: float = 0.05,
    repeat_penalty: float = 1.1,
    max_tokens: int = 512,
    n_ctx: int = 4096,
    gpu_layers: int = -1,
    seed: int = -1,
    max_image_side: int = 1024,
    cleanup_markdown: bool = True,
    prefix: str = "",
    suffix: str = "",
    auto_unload: bool = True,
    free_comfy: bool = False,
    node_id: str = None,
    check_interrupt = None,
    on_token = None,
):
    """
    Main entry point for analyzing an image and generating a descriptive prompt.
    Streams token progress via websocket and callbacks, handles memory and errors.
    """
    b_llm = _get_builtin_llm()
    if b_llm is None:
        raise RuntimeError("Builtin LLM engine is unavailable. Please verify DeathshotArsenal installation.")

    t_start = time.perf_counter()
    vram_before = get_vram_status()
    logger.info(f"[Image Describer] Starting vision analysis (node_id={node_id}, model={model_key or 'auto'}). Free VRAM: {vram_before.get('available_mb')} MB")

    if free_comfy:
        logger.info("[Image Describer] Freeing ComfyUI model memory before LLM load...")
        free_vram_and_comfy_models()

    # 1. Resolve Model
    if not model_key:
        available = b_llm.list_builtin_models()
        if available:
            # Pick first vision-capable or first available model
            model_key = available[0]["id"]
            for m in available:
                if m.get("has_vision") or "vl" in m.get("id", "").lower() or "vision" in m.get("id", "").lower():
                    model_key = m["id"]
                    break
        else:
            raise RuntimeError("No GGUF models found in ComfyUI/models/LLM or LM Studio. Please download a vision model (e.g. Qwen2.5-VL, Gemma-3).")

    model_display_name = os.path.basename(model_key).replace(".gguf", "")

    # Notify WebSocket: Loading
    _send_ws_event("ds_describer_status", {
        "node_id": str(node_id) if node_id else None,
        "status": "Loading model",
        "message": f"Loading model {model_display_name}...",
        "model": model_display_name,
        "tokens": 0,
        "speed": 0.0,
        "elapsed": 0.0,
    })

    # 2. Load Model with Vision projector
    t_load_0 = time.perf_counter()
    b_llm.load_model(
        key=model_key,
        n_ctx=n_ctx,
        n_gpu_layers=gpu_layers,
        free_comfy=free_comfy,
        require_vision=True,
    )
    load_time = round(time.perf_counter() - t_load_0, 2)
    logger.info(f"[Image Describer] Model {model_display_name} loaded in {load_time}s.")

    # 3. Prepare and Encode Image
    _send_ws_event("ds_describer_status", {
        "node_id": str(node_id) if node_id else None,
        "status": "Encoding image",
        "message": "Encoding image for vision encoder...",
        "model": model_display_name,
        "tokens": 0,
        "speed": 0.0,
        "elapsed": round(time.perf_counter() - t_start, 1),
    })

    pil_img = tensor_to_pil(image_tensor, max_side=max_image_side)
    image_payload = encode_pil_to_base64(pil_img, quality=90)

    # 4. Construct Prompt & Chat Messages
    if not system_prompt or not system_prompt.strip():
        system_prompt = DEFAULT_SYSTEM_PROMPT

    low_key = model_key.lower()
    is_gemma = "gemma" in low_key
    user_instruction = "Describe this image in rich, vivid detail so a text-to-image generator can recreate it accurately."

    messages = []
    if is_gemma:
        # Gemma models often perform best with system prompt merged into user turn
        combined_text = f"{system_prompt.strip()}\n\nTask: {user_instruction}\n\nOutput ONLY the final descriptive prompt."
        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_payload}},
                {"type": "text", "text": combined_text},
            ],
        })
    else:
        messages.append({"role": "system", "content": system_prompt.strip()})
        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_payload}},
                {"type": "text", "text": user_instruction},
            ],
        })

    # 5. Stream Completion
    _send_ws_event("ds_describer_status", {
        "node_id": str(node_id) if node_id else None,
        "status": "Writing prompt",
        "message": "Generating prompt...",
        "model": model_display_name,
        "tokens": 0,
        "speed": 0.0,
        "elapsed": round(time.perf_counter() - t_start, 1),
    })

    llm_inst = getattr(b_llm, "_state", {}).get("llm")
    if llm_inst is None:
        raise RuntimeError("LLM instance is not initialized.")

    b_llm._state["abort"] = False
    generated_tokens = []
    token_count = 0
    t_first_token = None
    t_gen_start = time.perf_counter()
    last_ws_time = t_gen_start
    batched_delta = []

    # Sampling parameters
    sampling = {
        "top_k": top_k,
        "top_p": top_p,
        "repeat_penalty": repeat_penalty,
    }
    if min_p > 0 and "min_p" in inspect_params(llm_inst.create_chat_completion):
        sampling["min_p"] = min_p
    if "reasoning_budget" in inspect_params(llm_inst.create_chat_completion):
        sampling["reasoning_budget"] = 0

    stream = llm_inst.create_chat_completion(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        seed=None if (seed is None or seed < 0) else seed,
        stream=True,
        **sampling,
    )

    try:
        for chunk in stream:
            if b_llm._state.get("abort"):
                logger.info("[Image Describer] Generation cancelled by user.")
                break
            if check_interrupt:
                check_interrupt()

            delta = chunk["choices"][0].get("delta") or {}
            piece = delta.get("content") or ""
            if piece:
                if t_first_token is None:
                    t_first_token = time.perf_counter()

                generated_tokens.append(piece)
                batched_delta.append(piece)
                token_count += 1

                if on_token:
                    on_token(piece)

                now = time.perf_counter()
                # Throttle WebSocket updates to ~10-12 per second
                if now - last_ws_time >= 0.08:
                    elapsed_so_far = max(0.1, round(now - t_gen_start, 1))
                    tk_s = round(token_count / elapsed_so_far, 1)
                    batched_text = "".join(batched_delta)
                    batched_delta = []

                    raw_acc = "".join(generated_tokens)
                    display_text = strip_reasoning_and_preamble(raw_acc, is_final=False)
                    is_thinking = ("<think>" in raw_acc.lower() and "</think>" not in raw_acc.lower())
                    st_label = "Thinking..." if (is_thinking and not display_text) else "Writing prompt"

                    _send_ws_event("ds_describer_progress", {
                        "node_id": str(node_id) if node_id else None,
                        "status": st_label,
                        "delta": batched_text,
                        "text": display_text,
                        "tokens": token_count,
                        "max_tokens": max_tokens,
                        "speed": tk_s,
                        "elapsed": elapsed_so_far,
                        "model": model_display_name,
                    })
                    last_ws_time = now
    finally:
        try:
            stream.close()
        except Exception:
            pass

    # Flush remaining delta
    if batched_delta:
        raw_acc = "".join(generated_tokens)
        display_text = strip_reasoning_and_preamble(raw_acc, is_final=False)
        _send_ws_event("ds_describer_progress", {
            "node_id": str(node_id) if node_id else None,
            "status": "Writing prompt",
            "delta": "".join(batched_delta),
            "text": display_text,
            "tokens": token_count,
            "max_tokens": max_tokens,
            "speed": round(token_count / max(0.1, time.perf_counter() - t_gen_start), 1),
            "elapsed": round(time.perf_counter() - t_gen_start, 1),
            "model": model_display_name,
        })

    raw_text = "".join(generated_tokens).strip()
    total_elapsed = max(0.01, round(time.perf_counter() - t_start, 2))
    gen_elapsed = max(0.01, round(time.perf_counter() - t_gen_start, 2))
    avg_speed = round(token_count / gen_elapsed, 1) if gen_elapsed > 0 else 0.0
    ttft = round(t_first_token - t_gen_start, 2) if t_first_token else 0.0

    # 6. Post-Process Text
    final_prompt = clean_generated_prompt(
        raw_text,
        cleanup_markdown=cleanup_markdown,
        prefix=prefix,
        suffix=suffix,
    )

    logger.info(
        f"[Image Describer] Generation completed: {token_count} tokens in {gen_elapsed}s "
        f"({avg_speed} tok/s, TTFT: {ttft}s). Output length: {len(final_prompt)} chars."
    )

    # 7. Auto Unload if requested
    if auto_unload:
        logger.info("[Image Describer] Auto-unload enabled. Ejecting LLM model from VRAM...")
        try:
            b_llm.unload()
            free_vram_and_comfy_models()
            vram_after = get_vram_status()
            logger.info(f"[Image Describer] Model ejected. Free VRAM: {vram_after.get('available_mb')} MB")
        except Exception as e:
            logger.warning(f"[Image Describer] Auto-unload error: {e}")

    # Final Done Notification
    _send_ws_event("ds_describer_done", {
        "node_id": str(node_id) if node_id else None,
        "status": "Done",
        "text": final_prompt,
        "tokens": token_count,
        "max_tokens": max_tokens,
        "speed": avg_speed,
        "elapsed": total_elapsed,
        "ttft": ttft,
        "model": model_display_name,
    })

    return {
        "prompt": final_prompt,
        "raw_text": raw_text,
        "tokens": token_count,
        "speed": avg_speed,
        "elapsed": total_elapsed,
        "ttft": ttft,
        "model": model_display_name,
    }


def inspect_params(func):
    import inspect
    try:
        return inspect.signature(func).parameters
    except Exception:
        return {}


def _send_ws_event(event_name: str, payload: dict):
    try:
        import server
        server.PromptServer.instance.send_sync(event_name, payload)
    except Exception:
        pass
