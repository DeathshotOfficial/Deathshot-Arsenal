"""
Deathshot Arsenal — Centralized AI Core: LM Studio client
Talks to a user-run LM Studio server (OpenAI-compatible API): model listing, server start,
model unload, and streamed chat completions with cancellation.
"""

import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

from ..monitor.llm_tracker import report_llm
from .stream_filter import GenerationCancelled, ThinkFilter, strip_leading_tag

logger = logging.getLogger("DeathshotArsenal.Core.AI.LMStudio")

_HEADERS = {"User-Agent": "DeathshotArsenal-Sensei"}
_active = {"cancelled": False, "sock": None, "lock": threading.Lock()}


class LMStudioError(RuntimeError):
    """LM Studio request failure; error_type is one of connection_error, no_model, model_unavailable, timeout, error."""

    def __init__(self, message, error_type="error"):
        super().__init__(message)
        self.error_type = error_type


def _addr(ip, port):
    return f"{str(ip or '127.0.0.1').strip()}:{int(port or 1234)}"


def fetch_models(ip="127.0.0.1", port=1234, timeout=4.0):
    """Return {"ok": True, "models": [...], "address": addr} or {"ok": False, "error": ..., "models": []}."""
    addr = _addr(ip, port)
    last_error = None
    for url in (f"http://{addr}/api/v1/models", f"http://{addr}/v1/models", f"http://{addr}/api/v0/models"):
        try:
            req = urllib.request.Request(url, headers=_HEADERS, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            last_error = e
            continue

        if isinstance(data, list):
            entries = data
        else:
            entries = data.get("data") if isinstance(data.get("data"), list) else data.get("models") or []

        model_list = []
        for m in entries:
            if isinstance(m, str):
                mid = m
            elif isinstance(m, dict):
                mid = m.get("id") or m.get("key")
                if not mid:
                    mid = next((inst["id"] for inst in m.get("loaded_instances") or [] if isinstance(inst, dict) and inst.get("id")), None)
            else:
                mid = None
            if mid and mid not in model_list:
                model_list.append(mid)
        if model_list:
            return {"ok": True, "models": model_list, "address": addr}

    logger.debug(f"[LM Studio] Failed to reach LM Studio at {addr}: {last_error}")
    return {"ok": False, "error": "LM Studio unavailable", "address": addr, "models": []}


def find_lms_cli():
    """Find the LM Studio CLI (lms / lms.exe) on Linux, macOS and Windows."""
    p = shutil.which("lms")
    if p and os.path.isfile(p):
        return os.path.abspath(p)
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".lmstudio", "bin", "lms"),
        os.path.join(home, ".cache", "lm-studio", "bin", "lms"),
        os.path.join(home, ".local", "bin", "lms"),
        "/usr/local/bin/lms",
        "/usr/bin/lms",
        "/var/lib/flatpak/exports/bin/lms",
        os.path.join(home, ".local", "share", "flatpak", "exports", "bin", "lms"),
        os.path.join(home, ".lmstudio", "bin", "lms.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "LM Studio", "resources", "app", "bin", "lms.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "LM Studio", "resources", "app", "bin", "lms.exe"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "LM Studio", "resources", "app", "bin", "lms.exe"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    return None


def start_server(port=1234):
    """Start the local LM Studio server through the lms CLI. Returns (success, message)."""
    cli = find_lms_cli()
    if not cli:
        return False, "LM Studio CLI (lms) not found. Please start LM Studio manually."
    kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        subprocess.Popen([cli, "server", "start"], **kwargs)
    except OSError as e:
        return False, str(e)
    t_end = time.time() + 8.0
    while time.time() < t_end:
        time.sleep(0.5)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{int(port)}/api/v1/models", timeout=1.0) as resp:
                if resp.status == 200:
                    return True, f"LM Studio server started on port {port}"
        except Exception:
            pass
    return False, "Timed out waiting for LM Studio server to respond."


def _post_json(url, payload, timeout):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **_HEADERS},
        method="POST",
    )
    return urllib.request.urlopen(req, timeout=timeout)


def unload_model(ip="127.0.0.1", port=1234, model_name=None, timeout=5.0):
    """Unload the model (or every loaded instance when model_name is empty) from LM Studio."""
    addr = _addr(ip, port)

    instance_ids = None
    try:
        req = urllib.request.Request(f"http://{addr}/api/v1/models", headers=_HEADERS, method="GET")
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            if resp.status == 200:
                instance_ids = []
                for m in json.loads(resp.read().decode("utf-8")).get("models", []):
                    instances = m.get("loaded_instances", [])
                    if not model_name or m.get("key") == model_name or any(inst.get("id") == model_name for inst in instances):
                        instance_ids.extend(inst["id"] for inst in instances if inst.get("id") and inst["id"] not in instance_ids)
    except Exception as e:
        logger.debug(f"[LM Studio] Querying /api/v1/models for loaded instances: {e}")

    if instance_ids is not None:
        unloaded = not instance_ids
        for iid in instance_ids:
            try:
                with _post_json(f"http://{addr}/api/v1/models/unload", {"instance_id": iid}, timeout) as resp:
                    unloaded = unloaded or resp.status in (200, 204)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="ignore")
                if e.code == 404 or "is not loaded" in body or "model_not_found" in body:
                    unloaded = True
                else:
                    logger.warning(f"[LM Studio] Unload error {e.code} for {iid}: {body}")
            except Exception as e:
                logger.warning(f"[LM Studio] Unload request error for {iid}: {e}")
        logger.info(f"[LM Studio] Unload '{model_name or 'all'}' on {addr}: {unloaded}")
        return unloaded

    # LM Studio < 0.3 has no v1 management API.
    payloads = ([{"identifier": model_name, "model": model_name}, {"model": model_name}] if model_name else []) + [{}]
    for url in (f"http://{addr}/api/v0/models/unload", f"http://{addr}/v1/models/unload", f"http://{addr}/api/v0/model/unload"):
        for p in payloads:
            try:
                with _post_json(url, p, timeout) as resp:
                    if resp.status in (200, 204):
                        return True
            except Exception:
                continue
    return False


def cancel_generation():
    """Cancel the active LM Studio request by closing its socket."""
    with _active["lock"]:
        _active["cancelled"] = True
        sock = _active["sock"]
        _active["sock"] = None
    if sock is not None:
        try:
            sock.shutdown(socket.SHUT_RDWR)
            sock.close()
        except OSError:
            pass
        return True
    return False


def chat_completion(
    messages,
    ip="127.0.0.1",
    port=1234,
    model="",
    max_tokens=2048,
    temperature=0.7,
    seed=None,
    timeout=300.0,
    on_progress=None,
):
    """
    Stream a chat completion from LM Studio. Starts a local server through the CLI when it is offline,
    and falls back to the first available model when none is selected.
    on_progress(text_so_far, tokens, elapsed) is called at most every 0.1s.
    Returns (text, completion_tokens, elapsed_seconds, model).
    """
    t0 = time.perf_counter()
    addr = _addr(ip, port)
    with _active["lock"]:
        _active["cancelled"] = False
        _active["sock"] = None

    models_res = fetch_models(ip=ip, port=port, timeout=min(5.0, timeout))
    if not models_res["ok"] and str(ip or "127.0.0.1").strip() in ("127.0.0.1", "localhost"):
        logger.info(f"[LM Studio] Offline at {addr}, attempting background launch via lms CLI...")
        started, msg = start_server(port=port)
        logger.info(f"[LM Studio] {msg}")
        if started:
            models_res = fetch_models(ip=ip, port=port, timeout=5.0)
    if not models_res["ok"]:
        raise LMStudioError(f"LM Studio unavailable\n{addr}", "connection_error")

    available = models_res["models"]
    model = str(model or "").strip()
    if not model:
        if not available:
            raise LMStudioError("No model selected or loaded in LM Studio", "no_model")
        model = available[0]
    elif model not in available:
        match = next((m for m in available if m.lower() == model.lower()), None)
        if not match:
            raise LMStudioError(f"Model unavailable\n{model}", "model_unavailable")
        model = match

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": max(0.0, min(2.0, temperature)),
        "stream": True,
    }
    if seed is not None and seed >= 0:
        payload["seed"] = int(seed)

    endpoint = f"http://{addr}/v1/chat/completions"
    think = ThinkFilter()
    parts = []
    tokens = 0
    last_progress = t0
    text = ""
    try:
        try:
            resp_ctx = _post_json(endpoint, payload, timeout)
        except urllib.error.HTTPError:
            payload["stream"] = False
            resp_ctx = _post_json(endpoint, payload, timeout)

        with resp_ctx as resp:
            try:
                with _active["lock"]:
                    _active["sock"] = resp.fp.raw._sock
            except AttributeError:
                pass

            if payload["stream"]:
                for raw_line in resp:
                    if _active["cancelled"]:
                        raise GenerationCancelled(strip_leading_tag("".join(parts)))
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        choices = json.loads(data_str).get("choices") or []
                    except ValueError:
                        continue
                    if not choices:
                        continue
                    piece = think.feed((choices[0].get("delta") or {}).get("content") or "")
                    if not piece:
                        continue
                    parts.append(piece)
                    tokens += 1
                    now = time.perf_counter()
                    if on_progress and now - last_progress >= 0.1:
                        last_progress = now
                        on_progress("".join(parts), tokens, max(0.01, round(now - t0, 1)))
                text = strip_leading_tag("".join(parts))
            else:
                body = json.loads(resp.read().decode("utf-8"))
                choices = body.get("choices") or []
                text = strip_leading_tag((choices[0].get("message") or {}).get("content") or "") if choices else ""
                tokens = (body.get("usage") or {}).get("completion_tokens") or int(len(text.split()) * 1.33)
    except GenerationCancelled:
        raise
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        try:
            err_body = json.loads(err_body).get("error", {}).get("message", err_body)
        except (ValueError, AttributeError):
            pass
        raise LMStudioError(f"LM Studio Error: {err_body or e.reason}") from None
    except (socket.timeout, TimeoutError):
        raise LMStudioError(f"Request timed out ({int(timeout)}s)", "timeout") from None
    except OSError:
        if _active["cancelled"]:
            raise GenerationCancelled(strip_leading_tag("".join(parts))) from None
        raise LMStudioError(f"LM Studio unavailable\n{addr}", "connection_error") from None
    finally:
        with _active["lock"]:
            _active["sock"] = None

    if _active["cancelled"]:
        raise GenerationCancelled(text)
    if not text:
        raise LMStudioError("Empty response received from LM Studio")

    elapsed = max(0.01, round(time.perf_counter() - t0, 2))
    report_llm(
        model=model,
        tokens=tokens,
        seconds=elapsed,
        status="idle",
        format_name="Remote / Local API",
        offload="Local Server",
        backend="LM Studio",
    )
    return text, tokens, elapsed, model
