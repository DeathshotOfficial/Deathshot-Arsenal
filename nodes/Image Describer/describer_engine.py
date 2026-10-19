"""
Deathshot Arsenal — DS Image Describer Engine
Vision prompt extraction on the shared core.ai Built-In LLM, with streaming and pause management.
"""

import base64
import collections
import hashlib
import io
import logging
import os
import re
import threading
import time
import numpy as np
from PIL import Image
import server
import torch

from core.ai import GenerationCancelled, generate_text_completion, list_builtin_models

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
# VRAM status
# ---------------------------------------------------------------------------
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
    check_interrupt=None,
):
    """
    Analyze an image with the shared vision LLM and return a descriptive prompt.
    Streams token progress via websocket. Stopping with Kill keeps the text written so far.
    """
    node_id = str(node_id) if node_id else None
    t_start = time.perf_counter()

    if not model_key:
        available = list_builtin_models()
        if not available:
            raise RuntimeError("No GGUF models found in ComfyUI/models/LLM or LM Studio. Please download a vision model (e.g. Qwen2.5-VL, Gemma-3).")
        model_key = next((m["id"] for m in available if m["has_vision"]), available[0]["id"])

    model_display_name = os.path.basename(model_key).replace(".gguf", "")
    logger.info(f"[Image Describer] Starting vision analysis (node_id={node_id}, model={model_display_name}). Free VRAM: {get_vram_status().get('available_mb')} MB")
    _send_ws_event("ds_describer_status", {
        "node_id": node_id,
        "status": "Loading model",
        "message": f"Loading model {model_display_name}...",
        "model": model_display_name,
        "tokens": 0,
        "speed": 0.0,
        "elapsed": 0.0,
    })

    image_payload = encode_pil_to_base64(tensor_to_pil(image_tensor, max_side=max_image_side), quality=90)
    system_prompt = (system_prompt or "").strip() or DEFAULT_SYSTEM_PROMPT
    user_instruction = "Describe this image in rich, vivid detail so a text-to-image generator can recreate it accurately."
    if "gemma" in model_key.lower():
        # Gemma chat templates have no system role; fold the instructions into the user turn.
        messages = [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": image_payload}},
            {"type": "text", "text": f"{system_prompt}\n\nTask: {user_instruction}\n\nOutput ONLY the final descriptive prompt."},
        ]}]
    else:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": image_payload}},
                {"type": "text", "text": user_instruction},
            ]},
        ]

    def _on_progress(text, tokens, elapsed):
        display_text = strip_reasoning_and_preamble(text, is_final=False)
        _send_ws_event("ds_describer_progress", {
            "node_id": node_id,
            "status": "Writing prompt",
            "text": display_text,
            "tokens": tokens,
            "max_tokens": max_tokens,
            "speed": round(tokens / elapsed, 1),
            "elapsed": elapsed,
            "model": model_display_name,
        })

    try:
        raw_text, meta = generate_text_completion(
            messages=messages,
            model_id=model_key,
            temperature=temperature,
            max_tokens=max_tokens,
            context_length=n_ctx,
            n_gpu_layers=gpu_layers,
            top_p=top_p,
            top_k=top_k,
            repetition_penalty=repeat_penalty,
            seed=seed,
            auto_unload=auto_unload,
            require_vision=True,
            free_comfy=free_comfy,
            min_p=min_p if min_p > 0 else None,
            check_interrupt=check_interrupt,
            on_progress=_on_progress,
        )
        tokens, gen_elapsed, model_display_name = meta["tokens"], meta["elapsed"], meta["model"]
    except GenerationCancelled as e:
        logger.info("[Image Describer] Generation stopped by user; keeping the text written so far.")
        raw_text, tokens, gen_elapsed = e.text, 0, max(0.01, round(time.perf_counter() - t_start, 2))

    total_elapsed = max(0.01, round(time.perf_counter() - t_start, 2))
    avg_speed = round(tokens / gen_elapsed, 1)
    final_prompt = clean_generated_prompt(raw_text, cleanup_markdown=cleanup_markdown, prefix=prefix, suffix=suffix)
    logger.info(
        f"[Image Describer] Generation completed: {tokens} tokens in {gen_elapsed}s "
        f"({avg_speed} tok/s). Output length: {len(final_prompt)} chars."
    )

    _send_ws_event("ds_describer_done", {
        "node_id": node_id,
        "status": "Done",
        "text": final_prompt,
        "tokens": tokens,
        "max_tokens": max_tokens,
        "speed": avg_speed,
        "elapsed": total_elapsed,
        "model": model_display_name,
    })

    return {
        "prompt": final_prompt,
        "raw_text": raw_text,
        "tokens": tokens,
        "speed": avg_speed,
        "elapsed": total_elapsed,
        "model": model_display_name,
    }


def _send_ws_event(event_name: str, payload: dict):
    server.PromptServer.instance.send_sync(event_name, payload)
