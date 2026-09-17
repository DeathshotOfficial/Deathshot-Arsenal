"""
DS AI Prompt Sensei — LLM / Sensei Engine
Handles prompt generation via the built-in Sensei expansion engine.

The primary prompt-generation pipeline is entirely self-contained:
  Image path → PIL analysis → image context dict
              → Sensei expansion engine → generated prompt

No external LLM application is required. If an optional local LLM
(Ollama, LM Studio, OpenAI-compatible) IS running, it will be used as an
enhanced backend. If none is available, the built-in Sensei engine generates
a high-quality prompt from the image analysis and scene notes without any
network dependency.
"""

import base64
import io
import json
import logging
import os
import random
import re
import shutil
import socket
import subprocess
import threading
import time
import urllib.request
import urllib.error
from PIL import Image, ImageOps, ImageStat

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei")

# ---------------------------------------------------------------------------
# Global generation state
# ---------------------------------------------------------------------------
_ACTIVE_GENERATION = {
    "task_id": None,
    "cancelled": False,
    "active_sock": None,
    "thread": None,
    "lock": threading.Lock(),
}

# ---------------------------------------------------------------------------
# Default system prompt
# ---------------------------------------------------------------------------
DEFAULT_SYSTEM_PROMPT = (
    "You are an expert AI cinematographer and prompt engineer specializing in high-fidelity "
    "video generation (LTX-Video, Wan2.1, HunyuanVideo, CogVideoX, SVD). "
    "Analyze the supplied image and scene context, then write a rich, vivid, cinematic "
    "generation prompt. Detail the subject, composition, camera perspective, environment, "
    "clothing, lighting (e.g. volumetric rays, rim light, golden hour, moody chiaroscuro), "
    "motion possibilities, atmosphere, textures, and temporal continuity. "
    "Output ONLY the final generation prompt text without conversational preamble or meta-commentary."
)


# ---------------------------------------------------------------------------
# Image helpers & vision preparation
# ---------------------------------------------------------------------------

def _resolve_image_path(image_path):
    """Resolve an image_path to an absolute filesystem path."""
    if not image_path:
        return None
    resolved = None
    try:
        import folder_paths
        resolved = folder_paths.get_annotated_filepath(image_path)
    except Exception:
        pass
    if not resolved or not os.path.isfile(resolved):
        try:
            import folder_paths
            input_dir = folder_paths.get_input_directory()
            cand = os.path.join(input_dir, image_path)
            if os.path.isfile(cand):
                resolved = cand
        except Exception:
            pass
    if not resolved and os.path.isfile(image_path):
        resolved = image_path
    return resolved if (resolved and os.path.isfile(resolved)) else None


def prepare_image_for_lm_studio(image_path, max_dim=1536):
    """
    Load the source image, transpose EXIF, downscale if excessively large,
    and encode as base64 JPEG for OpenAI-compatible vision requests.
    """
    resolved = _resolve_image_path(image_path)
    if not resolved:
        return None

    try:
        with Image.open(resolved) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode != "RGB":
                img = img.convert("RGB")

            sw, sh = img.size
            if max(sw, sh) > max_dim:
                scale = max_dim / float(max(sw, sh))
                new_w = max(64, int(round(sw * scale)))
                new_h = max(64, int(round(sh * scale)))
                img = img.resize((new_w, new_h), Image.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=88, optimize=True)
            b64_bytes = base64.b64encode(buffer.getvalue())
            return b64_bytes.decode("utf-8")
    except Exception as e:
        logger.warning(f"[Prompt Sensei] Failed to prepare vision image for LM Studio: {e}")
        return None


def analyze_image_for_context(image_path):
    """
    Perform lightweight PIL image analysis to extract visual context for prompt generation.

    Returns a dict with keys:
      dominant_colors   — list of hex color strings (top 5)
      brightness        — "dark" | "neutral" | "bright"
      is_portrait       — bool
      estimated_subject — rough descriptor string
      composition_hint  — "centered" | "left-weighted" | "right-weighted" | "complex"
      color_mood        — "warm" | "cool" | "neutral" | "vivid"
      has_skin_tones    — bool (simple heuristic)
      width             — int
      height            — int
    """
    result = {
        "dominant_colors": [],
        "brightness": "neutral",
        "is_portrait": False,
        "estimated_subject": "scene",
        "composition_hint": "centered",
        "color_mood": "neutral",
        "has_skin_tones": False,
        "width": 0,
        "height": 0,
    }

    if not image_path:
        return result

    # Resolve path
    resolved = None
    try:
        import folder_paths
        resolved = folder_paths.get_annotated_filepath(image_path)
    except Exception:
        pass
    if not resolved or not os.path.isfile(resolved):
        try:
            import folder_paths
            input_dir = folder_paths.get_input_directory()
            cand = os.path.join(input_dir, image_path)
            if os.path.isfile(cand):
                resolved = cand
        except Exception:
            pass
    if not resolved and os.path.isfile(image_path):
        resolved = image_path

    if not resolved or not os.path.isfile(resolved):
        return result

    try:
        from PIL import Image, ImageStat
        import colorsys

        with Image.open(resolved) as img:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
            w, h = img.size
            result["width"] = w
            result["height"] = h
            result["is_portrait"] = h > w

            # Thumbnail for fast analysis
            thumb = img.convert("RGB")
            thumb.thumbnail((128, 128), Image.LANCZOS)
            tw, th = thumb.size

            # Brightness analysis
            stat = ImageStat.Stat(thumb)
            mean_brightness = sum(stat.mean[:3]) / 3.0
            if mean_brightness < 80:
                result["brightness"] = "dark"
            elif mean_brightness > 175:
                result["brightness"] = "bright"
            else:
                result["brightness"] = "neutral"

            # Dominant colors via quantize
            try:
                quantized = thumb.quantize(colors=6, method=2)
                palette = quantized.getpalette()
                # Top 6 colors from palette
                colors_hex = []
                for i in range(6):
                    r, g, b = palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]
                    colors_hex.append(f"#{r:02x}{g:02x}{b:02x}")
                result["dominant_colors"] = colors_hex[:5]
            except Exception:
                pass

            # Color mood analysis — check warm vs cool dominance
            pixels = list(thumb.getdata())
            warm_count = 0
            cool_count = 0
            skin_count = 0
            total = len(pixels)
            for px in pixels:
                r, g, b = px[0], px[1], px[2]
                # Warm: red/orange/yellow dominant
                if r > g and r > b and r > 100:
                    warm_count += 1
                # Cool: blue/cyan dominant
                elif b > r and b > g and b > 80:
                    cool_count += 1
                # Skin tone heuristic: reddish-tan range
                if (150 < r < 255) and (80 < g < 200) and (50 < b < 170):
                    if r > g > b and r - b > 20:
                        skin_count += 1

            warm_pct = warm_count / total
            cool_pct = cool_count / total
            skin_pct = skin_count / total
            result["has_skin_tones"] = skin_pct > 0.08

            if warm_pct > 0.35:
                result["color_mood"] = "warm"
            elif cool_pct > 0.35:
                result["color_mood"] = "cool"
            else:
                result["color_mood"] = "neutral"

            # Composition hint — compare left half brightness vs right half
            try:
                left_half = thumb.crop((0, 0, tw // 2, th))
                right_half = thumb.crop((tw // 2, 0, tw, th))
                left_mean = sum(ImageStat.Stat(left_half).mean[:3]) / 3
                right_mean = sum(ImageStat.Stat(right_half).mean[:3]) / 3
                diff = left_mean - right_mean
                if abs(diff) > 20:
                    result["composition_hint"] = "left-weighted" if diff > 0 else "right-weighted"
                else:
                    result["composition_hint"] = "centered"
            except Exception:
                result["composition_hint"] = "centered"

            # Estimated subject
            if result["has_skin_tones"] and skin_pct > 0.2:
                result["estimated_subject"] = "person or portrait"
            elif result["is_portrait"]:
                result["estimated_subject"] = "vertical composition subject"
            else:
                result["estimated_subject"] = "scene or landscape"

    except Exception as e:
        logger.debug(f"[Prompt Sensei] Image analysis warning: {e}")

    return result


# ---------------------------------------------------------------------------
# LM Studio API: Model Listing & Unload
# ---------------------------------------------------------------------------

def fetch_lm_studio_models(ip="127.0.0.1", port=1234, timeout=4.0):
    """
    Retrieve models currently available/downloaded in the configured LM Studio instance.
    Returns dict: {"ok": True, "models": list_of_model_ids} or {"ok": False, "error": "...", "address": "..."}
    """
    ip_str = str(ip or "127.0.0.1").strip()
    port_val = int(port or 1234)
    addr = f"{ip_str}:{port_val}"

    endpoints = [
        f"http://{addr}/api/v1/models",
        f"http://{addr}/v1/models",
        f"http://{addr}/api/v0/models",
    ]

    last_error = None
    for url in endpoints:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "DeathshotArsenal-Sensei"}, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    raw = resp.read().decode("utf-8")
                    data = json.loads(raw)
                    model_list = []
                    if isinstance(data.get("data"), list):
                        for m in data["data"]:
                            if isinstance(m, dict):
                                mid = m.get("id") or m.get("key")
                                if mid:
                                    model_list.append(mid)
                    elif isinstance(data.get("models"), list):
                        for m in data["models"]:
                            if isinstance(m, dict):
                                mid = m.get("key") or m.get("id")
                                if not mid and m.get("loaded_instances"):
                                    for inst in m["loaded_instances"]:
                                        if isinstance(inst, dict) and inst.get("id"):
                                            mid = inst["id"]
                                            break
                                if mid:
                                    model_list.append(mid)
                            elif isinstance(m, str):
                                model_list.append(m)
                    elif isinstance(data, list):
                        for m in data:
                            if isinstance(m, dict):
                                mid = m.get("key") or m.get("id")
                                if mid:
                                    model_list.append(mid)
                            elif isinstance(m, str):
                                model_list.append(m)

                    if model_list:
                        # Deduplicate while preserving order and placing non-embedding LLMs first
                        seen = set()
                        deduped = []
                        for m in model_list:
                            if m not in seen:
                                seen.add(m)
                                deduped.append(m)
                        return {"ok": True, "models": deduped, "address": addr}
        except (urllib.error.URLError, socket.timeout, ConnectionRefusedError, OSError) as e:
            last_error = e
        except Exception as e:
            last_error = e

    err_msg = "LM Studio unavailable"
    logger.debug(f"[Prompt Sensei] Failed to reach LM Studio at {addr}: {last_error}")
    return {"ok": False, "error": err_msg, "address": addr, "models": []}


def find_lms_cli():
    """Finds the path to the LM Studio CLI (lms / lms.exe)."""
    p = shutil.which("lms")
    if p and os.path.isfile(p):
        return p
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".lmstudio", "bin", "lms.exe"),
        os.path.join(home, ".lmstudio", "bin", "lms"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "LM Studio", "resources", "app", "bin", "lms.exe"),
        r"C:\Users\GodKiller\.lmstudio\bin\lms.exe",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


def start_lm_studio_server(port=1234):
    """
    Attempts to start the LM Studio server in the background using the LMS CLI.
    Returns (success: bool, message: str).
    """
    cli = find_lms_cli()
    if not cli:
        return False, "LM Studio CLI (lms) not found. Please start LM Studio manually."
    try:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.Popen(
            [cli, "server", "start"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        t_end = time.time() + 8.0
        while time.time() < t_end:
            time.sleep(0.5)
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{port}/api/v1/models")
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        return True, f"LM Studio server successfully started on port {port}"
            except Exception:
                pass
        return False, "Timed out waiting for LM Studio server to respond."
    except Exception as e:
        return False, str(e)


def unload_lm_studio_model(ip="127.0.0.1", port=1234, model_name=None, timeout=5.0):
    """
    Unload the selected model in LM Studio through its model management endpoints,
    and release local ComfyUI memory cache.
    """
    ip_str = str(ip or "127.0.0.1").strip()
    port_val = int(port or 1234)
    addr = f"{ip_str}:{port_val}"

    instance_ids = []
    v1_api_connected = False

    # 1. Check currently loaded model instances via LM Studio v1 API
    try:
        req = urllib.request.Request(
            f"http://{addr}/api/v1/models",
            headers={"User-Agent": "DeathshotArsenal-Sensei"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            if resp.status == 200:
                v1_api_connected = True
                data = json.loads(resp.read().decode("utf-8"))
                for m in data.get("models", []):
                    m_key = m.get("key", "")
                    match = not model_name or m_key == model_name or any(
                        inst.get("id") == model_name for inst in m.get("loaded_instances", [])
                    )
                    if match:
                        for inst in m.get("loaded_instances", []):
                            iid = inst.get("id")
                            if iid and iid not in instance_ids:
                                instance_ids.append(iid)
    except Exception as e:
        logger.debug(f"[Prompt Sensei] Querying /api/v1/models for loaded instances: {e}")

    # If LM Studio v1 API is active:
    if v1_api_connected:
        if not instance_ids:
            # Model is already unloaded
            logger.info(f"[Prompt Sensei] Model '{model_name or 'active'}' is already unloaded in LM Studio.")
            try:
                import comfy.model_management as mm
                mm.soft_empty_cache()
            except Exception:
                pass
            return True

        unloaded = False
        for iid in instance_ids:
            try:
                data_bytes = json.dumps({"instance_id": iid}).encode("utf-8")
                req = urllib.request.Request(
                    f"http://{addr}/api/v1/models/unload",
                    data=data_bytes,
                    headers={"Content-Type": "application/json", "User-Agent": "DeathshotArsenal-Sensei"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status in (200, 204):
                        unloaded = True
                        logger.info(f"[Prompt Sensei] Successfully unloaded LM Studio model instance: {iid}")
            except urllib.error.HTTPError as e:
                err_body = ""
                try:
                    err_body = e.read().decode("utf-8", errors="ignore")
                except Exception:
                    pass
                if "is not loaded" in err_body or "model_not_found" in err_body or e.code == 404:
                    logger.info(f"[Prompt Sensei] Instance {iid} already unloaded in LM Studio.")
                    unloaded = True
                else:
                    logger.warning(f"[Prompt Sensei] Unload error {e.code} for {iid}: {err_body}")
            except Exception as e:
                logger.warning(f"[Prompt Sensei] Unload request error for {iid}: {e}")

        try:
            import comfy.model_management as mm
            mm.soft_empty_cache()
        except Exception:
            pass
        return unloaded

    # 2. Legacy fallback endpoints only if v1 API was not reachable (LM Studio < 0.3)
    unloaded = False
    unload_targets = [
        f"http://{addr}/api/v0/models/unload",
        f"http://{addr}/v1/models/unload",
        f"http://{addr}/api/v0/model/unload",
    ]
    payloads = []
    if model_name:
        payloads.append({"identifier": model_name, "model": model_name})
        payloads.append({"model": model_name})
    payloads.append({})

    for url in unload_targets:
        for p in payloads:
            try:
                data_bytes = json.dumps(p).encode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=data_bytes,
                    headers={"Content-Type": "application/json", "User-Agent": "DeathshotArsenal-Sensei"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status in (200, 204):
                        unloaded = True
                        break
            except Exception:
                continue
        if unloaded:
            break

    # Release ComfyUI soft cache
    try:
        import comfy.model_management as mm
        mm.soft_empty_cache()
    except Exception:
        pass

    logger.info(f"[Prompt Sensei] Unload request for '{model_name}' on LM Studio ({addr}). Result={unloaded}")
    return unloaded


# ---------------------------------------------------------------------------
# Generation Control (Kill LLM / Cancellation)
# ---------------------------------------------------------------------------

def kill_active_generation():
    """Immediately stops and cancels the active LM Studio generation request."""
    with _ACTIVE_GENERATION["lock"]:
        _ACTIVE_GENERATION["cancelled"] = True
        active_sock = _ACTIVE_GENERATION.get("active_sock")
        if active_sock:
            try:
                active_sock.shutdown(socket.SHUT_RDWR)
                active_sock.close()
            except Exception:
                pass
            _ACTIVE_GENERATION["active_sock"] = None

        if _ACTIVE_GENERATION["task_id"]:
            logger.info(f"[Prompt Sensei] Active generation cancelled for task {_ACTIVE_GENERATION['task_id']}")
            _ACTIVE_GENERATION["task_id"] = None
            return True
        return False


def is_cancelled(task_id=None):
    with _ACTIVE_GENERATION["lock"]:
        return bool(_ACTIVE_GENERATION["cancelled"])


# ---------------------------------------------------------------------------
# LM Studio Generation Pipeline
# ---------------------------------------------------------------------------

def generate_prompt_lm_studio(
    scene_notes,
    system_prompt=None,
    image_path=None,
    lm_studio_config=None,
    context=None,
    task_id=None,
):
    """Generate prompt using LM Studio chat completions endpoint."""
    t0 = time.perf_counter()
    task_id = task_id or f"task_{int(time.time() * 1000)}"

    with _ACTIVE_GENERATION["lock"]:
        _ACTIVE_GENERATION["task_id"] = task_id
        _ACTIVE_GENERATION["cancelled"] = False
        _ACTIVE_GENERATION["active_sock"] = None

    cfg = lm_studio_config or {}
    ip = str(cfg.get("ip") or "127.0.0.1").strip()
    port = int(cfg.get("port") or 1234)
    selected_model = str(cfg.get("model") or "").strip()
    max_tokens = int(cfg.get("max_tokens") or 2048)
    temperature = float(cfg.get("temperature") if cfg.get("temperature") is not None else 0.7)
    seed = cfg.get("seed")
    timeout = float(cfg.get("timeout") or 300.0)
    unload_after_run = bool(cfg.get("unload_after_run", False))

    addr = f"{ip}:{port}"
    endpoint = f"http://{addr}/v1/chat/completions"
    sys_prompt = (system_prompt or "").strip() or DEFAULT_SYSTEM_PROMPT
    notes = (scene_notes or "").strip()

    # 1. Model Availability & Connection Verification
    models_res = fetch_lm_studio_models(ip=ip, port=port, timeout=min(5.0, timeout))
    if not models_res["ok"]:
        if ip in ("127.0.0.1", "localhost"):
            logger.info(f"[Prompt Sensei] LM Studio offline at {addr}, attempting background launch via LMS CLI...")
            started, msg = start_lm_studio_server(port=port)
            if started:
                logger.info(f"[Prompt Sensei] {msg}, re-checking models...")
                models_res = fetch_lm_studio_models(ip=ip, port=port, timeout=5.0)

    if not models_res["ok"]:
        with _ACTIVE_GENERATION["lock"]:
            if _ACTIVE_GENERATION["task_id"] == task_id:
                _ACTIVE_GENERATION["task_id"] = None
        return {
            "status": "failed",
            "error": f"LM Studio unavailable\n{addr}",
            "error_type": "connection_error",
            "prompt": notes,
        }

    available_models = models_res.get("models", [])
    if not selected_model:
        if available_models:
            selected_model = available_models[0]
        else:
            with _ACTIVE_GENERATION["lock"]:
                if _ACTIVE_GENERATION["task_id"] == task_id:
                    _ACTIVE_GENERATION["task_id"] = None
            return {
                "status": "failed",
                "error": "No model selected or loaded in LM Studio",
                "error_type": "no_model",
                "prompt": notes,
            }

    # Validate requested model availability
    if selected_model not in available_models:
        match = next((m for m in available_models if m.lower() == selected_model.lower()), None)
        if not match:
            with _ACTIVE_GENERATION["lock"]:
                if _ACTIVE_GENERATION["task_id"] == task_id:
                    _ACTIVE_GENERATION["task_id"] = None
            return {
                "status": "failed",
                "error": f"Model unavailable\n{selected_model}",
                "error_type": "model_unavailable",
                "model": selected_model,
                "prompt": notes,
            }
        selected_model = match

    if is_cancelled(task_id):
        return {"status": "cancelled", "prompt": notes}

    # 2. Prepare Messages Payload (Image + Scene Description + System Prompt)
    messages = [
        {"role": "system", "content": sys_prompt},
    ]

    img_b64 = prepare_image_for_lm_studio(image_path) if image_path else None
    if img_b64:
        user_content = [
            {
                "type": "text",
                "text": notes or "Analyze this image and write a cinematic, detailed video generation prompt.",
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{img_b64}",
                },
            },
        ]
    else:
        user_content = notes or "Generate a rich, cinematic video generation prompt."

    messages.append({"role": "user", "content": user_content})

    payload = {
        "model": selected_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": max(0.0, min(2.0, temperature)),
        "stream": False,
    }

    used_seed = None
    randomize_seed = bool(cfg.get("randomize_seed", True))
    if randomize_seed or seed is None or str(seed).strip() in ("-1", ""):
        used_seed = random.randint(0, 2147483647)
        payload["seed"] = used_seed
    else:
        try:
            s_val = int(seed)
            if s_val >= 0:
                payload["seed"] = s_val
                used_seed = s_val
        except (ValueError, TypeError):
            pass

    # 3. HTTP Request Execution with Timeout
    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "DeathshotArsenal-Sensei",
        },
        method="POST",
    )

    result_text = None
    completion_tokens = 0

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if is_cancelled(task_id):
                return {"status": "cancelled", "prompt": notes}

            if resp.status == 200:
                body = json.loads(resp.read().decode("utf-8"))
                choices = body.get("choices", [])
                if choices and isinstance(choices, list):
                    msg = choices[0].get("message", {})
                    result_text = msg.get("content", "").strip()

                usage = body.get("usage", {})
                completion_tokens = usage.get("completion_tokens") or 0
            else:
                return {
                    "status": "failed",
                    "error": f"LM Studio returned HTTP {resp.status}",
                    "prompt": notes,
                }
    except urllib.error.HTTPError as e:
        if is_cancelled(task_id):
            return {"status": "cancelled", "prompt": notes}
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="ignore")
            err_json = json.loads(err_body)
            err_body = err_json.get("error", {}).get("message", err_body)
        except Exception:
            pass
        logger.error(f"[Prompt Sensei] LM Studio HTTP Error {e.code}: {err_body}")
        return {
            "status": "failed",
            "error": f"LM Studio Error: {err_body or e.reason}",
            "prompt": notes,
        }
    except (socket.timeout, TimeoutError) as e:
        logger.warning(f"[Prompt Sensei] Generation timed out after {timeout}s: {e}")
        return {
            "status": "failed",
            "error": f"Request timed out ({int(timeout)}s)",
            "error_type": "timeout",
            "prompt": notes,
        }
    except (urllib.error.URLError, ConnectionRefusedError, OSError) as e:
        if is_cancelled(task_id):
            return {"status": "cancelled", "prompt": notes}
        logger.warning(f"[Prompt Sensei] Connection error to LM Studio: {e}")
        return {
            "status": "failed",
            "error": f"LM Studio unavailable\n{addr}",
            "error_type": "connection_error",
            "prompt": notes,
        }
    except Exception as e:
        if is_cancelled(task_id):
            return {"status": "cancelled", "prompt": notes}
        logger.error(f"[Prompt Sensei] Unexpected error during LM Studio generation: {e}")
        return {
            "status": "failed",
            "error": str(e),
            "prompt": notes,
        }
    finally:
        with _ACTIVE_GENERATION["lock"]:
            _ACTIVE_GENERATION["active_sock"] = None

    if is_cancelled(task_id):
        with _ACTIVE_GENERATION["lock"]:
            if _ACTIVE_GENERATION["task_id"] == task_id:
                _ACTIVE_GENERATION["task_id"] = None
        return {"status": "cancelled", "prompt": notes}

    if not result_text:
        return {
            "status": "failed",
            "error": "Empty response received from LM Studio",
            "prompt": notes,
        }

    if result_text.startswith('"') and result_text.endswith('"') and len(result_text) > 2:
        result_text = result_text[1:-1].strip()

    t1 = time.perf_counter()
    elapsed = max(0.01, round(t1 - t0, 2))
    words = len(result_text.split())
    if not completion_tokens:
        completion_tokens = int(words * 1.33)
    speed = round(completion_tokens / elapsed, 1)

    # 4. Unload LLM After Run if Configured
    if unload_after_run:
        try:
            unload_lm_studio_model(ip=ip, port=port, model_name=selected_model)
        except Exception as e:
            logger.warning(f"[Prompt Sensei] Error unloading model after run: {e}")

    with _ACTIVE_GENERATION["lock"]:
        if _ACTIVE_GENERATION["task_id"] == task_id:
            _ACTIVE_GENERATION["task_id"] = None

    return {
        "status": "completed",
        "prompt": result_text,
        "tokens": completion_tokens,
        "speed": speed,
        "elapsed": elapsed,
        "model": selected_model,
        "seed": used_seed,
    }


def generate_prompt_sync(scene_notes, system_prompt=None, context=None, endpoint_config=None, task_id=None):
    """Backward-compatible shim."""
    image_path = None
    if context:
        image_path = context.get("image_path")
    return generate_prompt_lm_studio(
        scene_notes=scene_notes,
        system_prompt=system_prompt,
        image_path=image_path,
        lm_studio_config=endpoint_config,
        context=context,
        task_id=task_id,
    )


def unload_llm_memory(ip="127.0.0.1", port=1234, model_name=None):
    """Releases LM Studio model resources and frees ComfyUI model memory."""
    unload_lm_studio_model(ip=ip, port=port, model_name=model_name)
    try:
        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass
    logger.info("[Prompt Sensei] Unloaded model memory.")
    return True
