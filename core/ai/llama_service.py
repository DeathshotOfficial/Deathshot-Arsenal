"""
Deathshot Arsenal — Centralized AI Core: Built-In LLM Service
Runs GGUF text and vision-language models in-process through llama-cpp-python.
There is exactly one loaded model per ComfyUI process; every DS AI node shares it,
so switching between nodes that use the same model never reloads it.
"""

import base64
import ctypes
import gc
import inspect
import io
import logging
import os
import sys
import threading
import time

import comfy.model_management as mm
import numpy as np
import torch
from PIL import Image, ImageOps

from ..monitor.llm_tracker import report_llm
from .model_scanner import resolve_model_key, read_gguf_arch
from .stream_filter import GenerationCancelled, ThinkFilter, strip_leading_tag

logger = logging.getLogger("DeathshotArsenal.Core.AI.Service")

MiB = 1024 ** 2
IMAGE_TOKENS = 280
UBATCH = 1024
PROGRESS_INTERVAL = 0.08

# Model architecture to llama-cpp-python chat handler mappings
HANDLERS = {
    "gemma4": "Gemma4ChatHandler",
    "gemma3": "Gemma3ChatHandler",
    "qwen3vl": "Qwen3VLChatHandler",
    "qwen25vl": "Qwen25VLChatHandler",
}
FALLBACK_HANDLER = "MTMDChatHandler"

_lock = threading.RLock()
_state = {
    "llm": None,
    "handler": None,
    "key": None,
    "n_ctx": 0,
    "n_gpu_layers": -1,
    "has_vision": False,
    "vision_available": False,
    "loaded_model_name": "",
    "chat_kwargs": {},
    "chat_params": frozenset(),
    "abort": False,
    "generating": False,
}
_backend = {"done": False, "gpu": False, "error": None}


def ascii_path(path: str) -> str:
    """Windows short-path helper: llama.cpp takes narrow strings."""
    path = os.path.abspath(path)
    if path.isascii() or not sys.platform.startswith("win"):
        return path
    buf = ctypes.create_unicode_buffer(1024)
    if ctypes.windll.kernel32.GetShortPathNameW(path, buf, len(buf)) and buf.value.isascii():
        return buf.value
    return path


def _preload_cuda_linux():
    """Ensure the Linux dynamic linker can resolve pip-installed CUDA runtime libraries for libggml-cuda.so."""
    if not sys.platform.startswith("linux") or os.environ.get("DS_SENSEI_SKIP_CUDA_PRELOAD") == "1":
        return
    try:
        import site
        search_dirs = []
        for sp in site.getsitepackages():
            nvidia_root = os.path.join(sp, "nvidia")
            if os.path.isdir(nvidia_root):
                for sub in os.listdir(nvidia_root):
                    lib_sub = os.path.join(nvidia_root, sub, "lib")
                    if os.path.isdir(lib_sub):
                        search_dirs.append(lib_sub)
                        curr_ld = os.environ.get("LD_LIBRARY_PATH", "")
                        if lib_sub not in curr_ld:
                            os.environ["LD_LIBRARY_PATH"] = f"{lib_sub}:{curr_ld}"

        for p in ("nccl", "cudart", "nvrtc", "cublasLt", "cublas"):
            for d in search_dirs:
                for f in sorted(os.listdir(d)):
                    if p in f and ".so" in f:
                        try:
                            ctypes.CDLL(os.path.join(d, f), mode=ctypes.RTLD_GLOBAL)
                        except OSError:
                            pass
    except Exception as e:
        logger.debug(f"[AI Service] Linux CUDA preload: {e}")


def ensure_backends():
    """Register llama.cpp CPU and CUDA backend libraries once per process."""
    with _lock:
        if _backend["done"]:
            return _backend
        try:
            torch.cuda.is_available()
            _preload_cuda_linux()
            import llama_cpp
            from llama_cpp import _ggml

            if _ggml.ggml_backend_reg_count() == 0:
                llama_cpp.llama_backend_init()
                lib_dir = os.path.join(os.path.dirname(llama_cpp.__file__), "lib")
                if os.path.isdir(lib_dir):
                    _ggml.ggml_backend_load_all_from_path(ascii_path(lib_dir).encode("utf-8"))
                llama_cpp.Llama._Llama__backend_initialized = True
            _backend["gpu"] = bool(llama_cpp.llama_supports_gpu_offload())
        except Exception as e:
            logger.warning(f"[AI Service] Backend registration warning: {e}")
            _backend["error"] = str(e)
        _backend["done"] = True
        return _backend


def _free_vram_mb():
    if torch.cuda.is_available():
        return int(torch.cuda.mem_get_info()[0] / MiB)
    return 0


def is_loaded():
    with _lock:
        return _state["llm"] is not None


def loaded_model_name():
    return _state["loaded_model_name"]


def get_backend_status():
    """Status summary for UI polling."""
    return {
        "loaded": _state["llm"] is not None,
        "key": _state["key"],
        "model_name": _state["loaded_model_name"],
        "has_vision": _state["has_vision"],
        "gpu": bool(_backend["gpu"]),
        "vram_free_mb": _free_vram_mb(),
        "backend_error": _backend["error"],
    }


def _unload_locked():
    llm = _state["llm"]
    handler = _state["handler"]
    if llm is None and handler is None:
        return False
    _state.update(llm=None, handler=None, key=None, n_ctx=0, n_gpu_layers=-1, loaded_model_name="",
                  has_vision=False, vision_available=False, chat_kwargs={}, chat_params=frozenset())

    if handler is not None:
        try:
            if callable(getattr(handler, "_free_mtmd_resources", None)):
                handler._free_mtmd_resources()
            if callable(getattr(handler, "close", None)):
                handler.close()
        except Exception as e:
            logger.debug(f"[AI Service] mmproj close: {e}")

    if llm is not None:
        try:
            llm.close()
        except Exception as e:
            logger.debug(f"[AI Service] model close: {e}")

    del llm, handler
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.ipc_collect()
    mm.soft_empty_cache()

    # Return the freed GGUF pages to the OS so RAM usage drops right away.
    if sys.platform == "win32":
        try:
            import ctypes.wintypes
            k32 = ctypes.windll.kernel32
            psapi = ctypes.windll.psapi
            k32.GetCurrentProcess.restype = ctypes.wintypes.HANDLE
            psapi.EmptyWorkingSet.argtypes = [ctypes.wintypes.HANDLE]
            psapi.EmptyWorkingSet(k32.GetCurrentProcess())
        except Exception as e:
            logger.debug(f"[AI Service] EmptyWorkingSet trim: {e}")
    elif sys.platform.startswith("linux"):
        try:
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except Exception as e:
            logger.debug(f"[AI Service] malloc_trim: {e}")

    logger.info("[AI Service] Model unloaded: VRAM and system RAM released.")
    return True


def abort_generation() -> bool:
    """Stop the active built-in generation mid-flight."""
    _state["abort"] = True
    llm = _state["llm"]
    # Builds that expose Llama.abort() can also stop a long prompt evaluation natively. Only call it
    # mid-generation: an idle native abort flag survives into the next request's prompt evaluation.
    if _state["generating"] and llm is not None and hasattr(llm, "abort"):
        llm.abort()
    return True


def unload_model() -> bool:
    """Unload the shared model and free GPU VRAM and system RAM. Returns True if something was loaded."""
    abort_generation()
    with _lock:
        return _unload_locked()


def _plan_gpu(model_path, mmproj_path, n_ctx, requested_layers):
    """
    Decide how many layers (and whether the vision projector) fit in FREE VRAM.
    Windows silently spills VRAM into system RAM; Linux hard-fails with cudaMalloc OOM,
    so the budget is explicit. Returns dict(layers=int(-1 = all), mm_gpu=bool, n_layer=int, note=str).
    """
    plan = {"layers": requested_layers, "mm_gpu": True, "n_layer": 32, "note": "no VRAM info"}
    if not torch.cuda.is_available():
        return plan
    free = int(torch.cuda.mem_get_info()[0])

    meta = read_gguf_arch(model_path)
    n_layer = int(meta.get("block_count") or 32)
    n_head = int(meta.get("attention.head_count") or 32)
    n_kv = int(meta.get("attention.head_count_kv") or n_head)
    embd = int(meta.get("embedding_length") or 4096)
    head_dim = int(meta.get("attention.key_length") or (embd // max(1, n_head)))

    kv_total = 2 * n_layer * n_kv * head_dim * 2 * int(n_ctx)  # K+V, f16
    per_layer = os.path.getsize(model_path) * 0.93 / n_layer + kv_total / n_layer
    budget = free - 900 * MiB  # compute buffers + safety margin
    mm_cost = (os.path.getsize(mmproj_path) + 300 * MiB) if mmproj_path else 0

    def fit(b):
        return max(0, int(b // per_layer))

    full = n_layer + 1  # all repeating layers + output layer
    layers = fit(budget - mm_cost)
    mm_gpu = True
    if mm_cost and layers < 0.6 * n_layer:
        alt = fit(budget)
        if alt >= layers + 0.25 * n_layer:
            layers, mm_gpu = alt, False
    if layers == 0:
        mm_gpu = budget >= mm_cost
    layers = min(layers, full)
    if requested_layers is not None and requested_layers >= 0:
        layers = min(layers, requested_layers)
    plan.update(
        layers=-1 if layers >= full else layers,
        mm_gpu=mm_gpu,
        n_layer=n_layer,
        note=(f"free VRAM {free // MiB} MiB, ctx {n_ctx}, kv {kv_total // MiB} MiB, "
              f"-> gpu_layers={layers} of {full}, mmproj_on_gpu={mm_gpu}"),
    )
    return plan


def _enforce_no_thinking_on_llm(llm):
    """
    Disable chain-of-thought for reasoning-trained models: patch the Jinja chat templates
    to render with enable_thinking=False and close any dangling '<think>' the template opens.
    """
    def _patch_template_render(tmpl):
        if not hasattr(tmpl, "render") or getattr(tmpl, "_no_thinking_patched", False):
            return
        orig_render = tmpl.render

        def _patched_render(*args, **kwargs):
            kwargs.setdefault("enable_thinking", False)
            res = orig_render(*args, **kwargs)
            if isinstance(res, str):
                for tag in ("think", "thought"):
                    for opener in (f"<{tag}>\n", f"<{tag}>"):
                        if res.endswith(opener):
                            return res[:-len(opener)] + f"<{tag}>\n\n</{tag}>\n\n"
            return res

        tmpl.render = _patched_render
        tmpl._no_thinking_patched = True

    def _patch_handler(handler):
        for cell in getattr(handler, "__closure__", None) or ():
            if hasattr(cell.cell_contents, "_template"):
                _patch_template_render(cell.cell_contents._template)
        if hasattr(handler, "_template"):
            _patch_template_render(handler._template)
        if hasattr(handler, "enable_thinking"):
            handler.enable_thinking = False

    for handler_fn in list((getattr(llm, "_chat_handlers", None) or {}).values()):
        _patch_handler(handler_fn)
    if getattr(llm, "chat_handler", None) is not None:
        _patch_handler(llm.chat_handler)


def _create_vision_handler(model_path, mmproj_path, use_gpu):
    from llama_cpp import llama_chat_format as cf

    m_low = model_path.lower()
    if "qwen3" in m_low:
        arch_key = "qwen3vl"
    elif "qwen" in m_low:
        arch_key = "qwen25vl"
    elif "gemma" in m_low:
        arch_key = "gemma4" if ("gemma-4" in m_low or "gemma4" in m_low) else "gemma3"
    else:
        arch_key = None

    handler_cls_name = HANDLERS.get(arch_key, FALLBACK_HANDLER)
    handler_cls = getattr(cf, handler_cls_name, None) or getattr(cf, FALLBACK_HANDLER)
    sig_params = inspect.signature(handler_cls.__init__).parameters

    hk = {"verbose": False}
    if "mmproj_path" in sig_params and "clip_model_path" not in sig_params:
        hk["mmproj_path"] = ascii_path(mmproj_path)
    else:
        hk["clip_model_path"] = ascii_path(mmproj_path)
    if "use_gpu" in sig_params or issubclass(handler_cls, cf.MTMDChatHandler):
        hk["use_gpu"] = use_gpu
    if "image_max_tokens" in sig_params:
        hk["image_max_tokens"] = IMAGE_TOKENS
    if "batch_max_tokens" in sig_params:
        hk["batch_max_tokens"] = UBATCH
    if "enable_thinking" in sig_params:
        hk["enable_thinking"] = False

    handler = handler_cls(**hk)

    # The handler re-tokenizes the full multimodal prompt; make it start from an empty KV
    # position so a reused context does not shift the image embeddings.
    orig_tokenize = getattr(handler, "_process_mtmd_prompt", None)
    if orig_tokenize is not None:
        def _fresh_tokenize(*args, **kwargs):
            _l = kwargs.get("llama")
            if _l is None:
                return orig_tokenize(*args, **kwargs)
            saved = _l.n_tokens
            _l.n_tokens = 0
            try:
                return orig_tokenize(*args, **kwargs)
            finally:
                _l.n_tokens = saved
        handler._process_mtmd_prompt = _fresh_tokenize
    return handler


def _chat_kwargs_for(llm):
    """Sampling kwargs that switch off reasoning, filtered to what this llama-cpp build accepts."""
    params = inspect.signature(llm.create_chat_completion).parameters
    has_varkw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values())
    wanted = {"enable_thinking": False, "chat_template_kwargs": {"enable_thinking": False}}
    # A zero reasoning budget is only for always-thinking templates. Templates with an
    # enable_thinking switch are closed by the template patch, and non-reasoning models
    # given a budget emit '</think>' and stop with an empty answer.
    template = str((llm.metadata or {}).get("tokenizer.chat_template", ""))
    if "<think>" in template and "enable_thinking" not in template:
        wanted.update(reasoning_budget=0, reasoning_start="<think>", reasoning_end="</think>", reasoning_start_in_prompt=True)
    kwargs = {k: v for k, v in wanted.items() if k in params or (has_varkw and k != "enable_thinking")}
    return kwargs, frozenset(params) if not has_varkw else None


def load_model(key: str, n_ctx=4096, n_gpu_layers=-1, require_vision=False, free_comfy=False):
    """
    Load a GGUF model (and its vision projector when an image will be sent).
    The already-loaded model is reused whenever it satisfies the request: same file, same GPU layer
    setting, large enough context, and the projector attached if vision is needed.
    Every request starts here, so this also clears a stale abort flag.
    """
    _state["abort"] = False
    with _lock:
        if (
            _state["llm"] is not None
            and _state["key"] == key
            and _state["n_ctx"] >= n_ctx
            and _state["n_gpu_layers"] == n_gpu_layers
            and (_state["has_vision"] or not require_vision or not _state["vision_available"])
        ):
            return _state["llm"]

        if _state["llm"] is not None:
            logger.info(f"[AI Service] Reloading: requested '{key}' (ctx={n_ctx}, gpu_layers={n_gpu_layers}, vision={require_vision}).")
        _unload_locked()

        if free_comfy:
            mm.unload_all_models()
            mm.soft_empty_cache()

        be = ensure_backends()
        model_path, mmproj_path = resolve_model_key(key)
        has_vision = bool(require_vision and mmproj_path)

        import llama_cpp
        from llama_cpp import Llama

        use_gpu = bool(be["gpu"]) and n_gpu_layers != 0
        plan = {"layers": 0, "mm_gpu": False, "n_layer": 32, "note": "gpu disabled"}
        if use_gpu:
            plan = _plan_gpu(model_path, mmproj_path if has_vision else None, n_ctx, n_gpu_layers)
        logger.info(f"[AI Service] GPU plan (vision={has_vision}): {plan['note']}")

        handler = None
        if has_vision:
            try:
                handler = _create_vision_handler(model_path, mmproj_path, use_gpu and plan["mm_gpu"])
            except Exception as e:
                logger.warning(f"[AI Service] Vision projector failed to initialize, continuing text-only: {e}")
                has_vision = False

        llama_params = inspect.signature(Llama.__init__).parameters
        gpu_layers = plan["layers"] if use_gpu else 0
        plan_num = plan["n_layer"] + 1 if gpu_layers == -1 else gpu_layers
        reduced_70 = max(1, int(plan_num * 0.7)) if plan_num > 0 else 0
        reduced_40 = max(1, int(plan_num * 0.4)) if plan_num > 0 else 0

        no_mmap = {}
        if "load_mode" in llama_params and hasattr(llama_cpp, "llama_load_mode"):
            no_mmap = {"load_mode": int(llama_cpp.llama_load_mode.LLAMA_LOAD_MODE_NONE)}
        elif "use_mmap" in llama_params:
            no_mmap = {"use_mmap": False}

        # Flash attention stays on llama.cpp's AUTO default for the first attempt and is
        # switched off explicitly for the fallbacks.
        fa_off = {}
        if "flash_attn_type" in llama_params and hasattr(llama_cpp, "llama_flash_attn_type"):
            fa_off = {"flash_attn_type": int(llama_cpp.llama_flash_attn_type.LLAMA_FLASH_ATTN_TYPE_DISABLED)}
        elif "flash_attn" in llama_params:
            fa_off = {"flash_attn": False}

        ladder = [
            ("default", {"n_batch": UBATCH, "n_ubatch": UBATCH, "n_gpu_layers": gpu_layers, **no_mmap}),
            ("safe batch + mmap + no flash-attn", {"n_batch": 512, "n_ubatch": 512, "n_gpu_layers": reduced_70, **fa_off}),
            ("no KV-cache offload", {"n_batch": 512, "n_ubatch": 512, "n_gpu_layers": reduced_40, "offload_kqv": False, **fa_off}),
            ("CPU only", {"n_batch": 512, "n_ubatch": 512, "n_gpu_layers": 0, "offload_kqv": False, **fa_off}),
        ]

        llm = None
        errors = []
        seen_cfgs = set()
        t0 = time.time()
        for idx, (label, extra) in enumerate(ladder):
            lk = {"model_path": ascii_path(model_path), "n_ctx": n_ctx, "verbose": idx == 1}
            lk.update({k: v for k, v in extra.items() if k in llama_params})
            if "chat_template_kwargs" in llama_params:
                lk["chat_template_kwargs"] = {"enable_thinking": False}
            if handler is not None:
                lk["chat_handler"] = handler

            sig = repr(sorted((k, repr(v)) for k, v in lk.items() if k not in ("verbose", "chat_handler")))
            if sig in seen_cfgs:
                continue
            seen_cfgs.add(sig)

            logger.info(
                f"[AI Service] Loading {os.path.basename(model_path)} "
                f"(vision={has_vision}, gpu_layers={lk.get('n_gpu_layers')}, ctx={n_ctx}, attempt='{label}')..."
            )
            try:
                llm = Llama(**lk)
                init_fn = getattr(handler, "_init_mtmd_context", None) if handler is not None else None
                if init_fn:
                    if getattr(handler, "use_gpu", False) and _free_vram_mb() * MiB < os.path.getsize(mmproj_path) + 250 * MiB:
                        logger.warning("[AI Service] Not enough free VRAM for the vision projector; running it on CPU.")
                        handler.use_gpu = False
                    init_fn(llm)
                if idx > 0:
                    logger.warning(f"[AI Service] Loaded using fallback attempt '{label}'.")
                break
            except Exception as e:
                errors.append(f"{label}: {e}")
                logger.warning(f"[AI Service] Attempt '{label}' failed: {e}")
                llm = None
                gc.collect()
                mm.soft_empty_cache()

        if llm is None:
            if handler is not None:
                try:
                    handler.close()
                except Exception:
                    pass
            raise RuntimeError(
                "Could not create a llama.cpp context after all fallback attempts. "
                "Check the ComfyUI console for the llama.cpp error lines just above this. "
                "Last error: " + (errors[-1] if errors else "unknown")
            )

        _enforce_no_thinking_on_llm(llm)
        chat_kwargs, chat_params = _chat_kwargs_for(llm)
        model_name = os.path.basename(model_path)
        if model_name.lower().endswith(".gguf"):
            model_name = model_name[:-5]

        _state.update(
            llm=llm,
            handler=handler,
            key=key,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            has_vision=has_vision,
            vision_available=bool(mmproj_path),
            loaded_model_name=model_name,
            chat_kwargs=chat_kwargs,
            chat_params=chat_params,
        )
        logger.info(f"[AI Service] Loaded {model_name} in {round(time.time() - t0, 2)}s.")
        return llm


def generate_chat(
    messages,
    max_tokens=2048,
    temperature=0.7,
    seed=-1,
    top_p=0.95,
    top_k=40,
    repeat_penalty=1.1,
    min_p=None,
    extra_sampling=None,
    check_interrupt=None,
    on_progress=None,
):
    """
    Stream a chat completion from the loaded model with reasoning blocks removed.
    on_progress(text_so_far, tokens, elapsed) is called at most every PROGRESS_INTERVAL seconds.
    Returns (text, completion_tokens, elapsed_seconds). Raises GenerationCancelled on abort.
    """
    with _lock:
        llm = _state["llm"]
        if llm is None:
            raise RuntimeError("[AI Service] No model loaded. Select and load a model first.")
        if _state["abort"]:
            raise GenerationCancelled()

        sampling = dict(_state["chat_kwargs"])
        sampling.update(top_k=top_k, top_p=top_p, repeat_penalty=repeat_penalty)
        if min_p is not None:
            sampling["min_p"] = min_p
        if extra_sampling:
            sampling.update(extra_sampling)
        chat_params = _state["chat_params"]
        if chat_params is not None:
            sampling = {k: v for k, v in sampling.items() if k in chat_params}

        if hasattr(llm, "abort"):
            # Llama.abort() leaves its native flag set until create_completion() resets it, but
            # multimodal handlers evaluate the prompt before that, so a past Kill would abort this request.
            native_flag = getattr(llm, "_native_abort_flag", None)
            if native_flag is not None:
                native_flag.value = False
            llm._abort_event.clear()

        t0 = time.perf_counter()
        _state["generating"] = True
        stream = None
        think = ThinkFilter()
        parts = []
        token_count = 0
        ttft = None
        last_progress = t0
        try:
            stream = llm.create_chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                seed=None if (seed is None or seed < 0) else seed & 0xFFFFFFFF,
                stream=True,
                **sampling,
            )
            for chunk in stream:
                if _state["abort"]:
                    raise GenerationCancelled(strip_leading_tag("".join(parts)))
                if check_interrupt:
                    check_interrupt()
                choice = chunk["choices"][0] if chunk.get("choices") else {}
                if choice.get("finish_reason") == "abort":
                    raise GenerationCancelled(strip_leading_tag("".join(parts)))
                piece = think.feed((choice.get("delta") or {}).get("content") or "")
                if not piece:
                    continue
                now = time.perf_counter()
                if ttft is None:
                    ttft = now - t0
                parts.append(piece)
                token_count += 1
                if on_progress and now - last_progress >= PROGRESS_INTERVAL:
                    last_progress = now
                    on_progress("".join(parts), token_count, max(0.01, round(now - t0, 1)))
        except GenerationCancelled:
            raise
        except Exception:
            if _state["abort"]:
                raise GenerationCancelled(strip_leading_tag("".join(parts))) from None
            raise
        finally:
            _state["generating"] = False
            if stream is not None:
                stream.close()

        text = strip_leading_tag("".join(parts))
        elapsed = max(0.01, round(time.perf_counter() - t0, 2))
        report_llm(
            model=_state["loaded_model_name"] or "GGUF Model",
            tokens=token_count,
            seconds=elapsed,
            ttft=round(ttft, 2) if ttft is not None else None,
            status="idle",
            format_name="GGUF Vision" if _state["has_vision"] else "GGUF",
            offload="GPU offload" if _backend["gpu"] and _state["n_gpu_layers"] != 0 else "CPU Only",
            backend="DS Built-In LLM",
        )
        return text, token_count, elapsed


def generate_text_completion(
    messages,
    model_id,
    temperature=0.8,
    max_tokens=2048,
    context_length=4096,
    n_gpu_layers=-1,
    top_p=0.90,
    top_k=40,
    repetition_penalty=1.10,
    seed=-1,
    auto_unload=True,
    require_vision=False,
    free_comfy=False,
    min_p=None,
    extra_sampling=None,
    check_interrupt=None,
    on_progress=None,
):
    """Load (or reuse) the model, run one chat completion, and optionally unload. Returns (text, meta)."""
    with _lock:
        t0 = time.time()
        load_model(model_id, n_ctx=context_length, n_gpu_layers=n_gpu_layers,
                   require_vision=require_vision, free_comfy=free_comfy)
        load_time = round(time.time() - t0, 2)
        try:
            text, tokens, elapsed = generate_chat(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                seed=seed,
                top_p=top_p,
                top_k=top_k,
                repeat_penalty=repetition_penalty,
                min_p=min_p,
                extra_sampling=extra_sampling,
                check_interrupt=check_interrupt,
                on_progress=on_progress,
            )
            meta = {
                "tokens": tokens,
                "elapsed": elapsed,
                "load_time": load_time,
                "speed": round(tokens / elapsed, 1),
                "model": _state["loaded_model_name"] or model_id,
            }
            return text, meta
        finally:
            if auto_unload:
                _unload_locked()


def image_data_url(image_tensor=None, image_path=None, max_side=1280, quality=90):
    """Encode the first image of a ComfyUI IMAGE tensor, or an image file, as a JPEG data URL."""
    if image_tensor is not None:
        arr = np.clip(255.0 * image_tensor[0].cpu().numpy(), 0, 255).astype(np.uint8)
        img = Image.fromarray(arr[..., :3] if arr.ndim == 3 else arr).convert("RGB")
    elif image_path and os.path.isfile(image_path):
        with Image.open(image_path) as src:
            img = ImageOps.exif_transpose(src).convert("RGB")
    else:
        return None
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
