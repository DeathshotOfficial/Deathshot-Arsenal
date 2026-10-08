"""
Deathshot Arsenal — DS AI Prompt Sensei
Built-in LLM backend engine.

Runs GGUF vision-language and text models locally via llama-cpp-python.
Loads models from ComfyUI/models/LLM and LM Studio local downloads.
"""

import ctypes
import gc
import inspect
import json
import logging
import os
import sys
import threading
import time

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei.BuiltinLLM")

GiB = 1024 ** 3
IMAGE_TOKENS = 280
UBATCH = 1024
VRAM_OVERHEAD = int(0.4 * GiB)
VRAM_TIGHT = int(0.3 * GiB)
VRAM_EXTRA_MAX = int(3.0 * GiB)
VRAM_SLACK = int(1.1 * GiB)
MAX_IMAGE_SIDE = 1280
EXPERT_MARK = "_exps"
META_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "builtin_meta_cache.json")

# Model architecture to llama-cpp-python chat handler mappings
HANDLERS = {
    "gemma4": "Gemma4ChatHandler",
    "gemma3": "Gemma3ChatHandler",
    "qwen3vl": "Qwen3VLChatHandler",
    "qwen3vlmoe": "Qwen3VLChatHandler",
    "qwen25vl": "Qwen25VLChatHandler",
    "qwen2vl": "Qwen25VLChatHandler",
}
FALLBACK_HANDLER = "MTMDChatHandler"

_lock = threading.RLock()
_state = {
    "llm": None,
    "handler": None,
    "key": None,
    "n_ctx": 0,
    "abort": False,
    "loaded_model_name": "",
    "has_vision": False,
}
_backend = {"done": False, "gpu": False, "error": None}


def ascii_path(path: str) -> str:
    """Windows ANSI/short path helper for llama.cpp narrow strings."""
    path = os.path.abspath(path)
    if path.isascii() or not sys.platform.startswith("win"):
        return path
    buf = ctypes.create_unicode_buffer(1024)
    if ctypes.windll.kernel32.GetShortPathNameW(path, buf, len(buf)) and buf.value.isascii():
        return buf.value
    return path


def _get_models_dir() -> str:
    try:
        import folder_paths
        if hasattr(folder_paths, "models_dir") and folder_paths.models_dir and os.path.isdir(folder_paths.models_dir):
            return folder_paths.models_dir
    except Exception:
        pass
    
    # Traverse parent directories to find root ComfyUI directory containing custom_nodes/ and models/
    p = os.path.abspath(os.path.dirname(__file__))
    for _ in range(7):
        if (os.path.isfile(os.path.join(p, "main.py")) or os.path.isdir(os.path.join(p, "custom_nodes"))) and os.path.isdir(os.path.join(p, "models")):
            return os.path.join(p, "models")
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    return os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "models"))


def register_llm_folder():
    """Register ComfyUI/models/LLM in folder_paths and return all ComfyUI LLM directories."""
    dirs = []
    base_models = _get_models_dir()
    default_llm = os.path.join(base_models, "LLM")
    try:
        os.makedirs(default_llm, exist_ok=True)
    except Exception:
        pass

    try:
        import folder_paths
        if "LLM" not in folder_paths.folder_names_and_paths:
            folder_paths.add_model_folder_path("LLM", default_llm)
        
        # Check all possible ComfyUI folder registrations
        for tag in ("LLM", "llm", "LLMs", "gguf", "GGUF", "text_encoders"):
            try:
                paths = folder_paths.get_folder_paths(tag)
                if paths:
                    dirs.extend(paths)
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"[Builtin LLM] Error querying folder_paths: {e}")

    # Also include standard fallback subdirectories
    for sub in ("LLM", "llm", "LLMs", "gguf", "GGUF"):
        candidate = os.path.join(base_models, sub)
        if os.path.isdir(candidate):
            dirs.append(candidate)

    if default_llm not in dirs and os.path.isdir(default_llm):
        dirs.append(default_llm)

    return dirs if dirs else [default_llm]


def get_lmstudio_model_roots():
    """Universal detection of LM Studio models across user profiles, settings, pointers, and all drives."""
    roots = []
    user = os.path.expanduser("~")
    
    # 1. User profile and cache defaults
    candidates = [
        os.path.join(user, ".cache", "lm-studio", "models"),
        os.path.join(user, ".lmstudio", "models"),
        os.path.join(user, ".lmstudio"),
    ]
    
    # Windows AppData paths
    appdata = os.environ.get("APPDATA", "")
    localappdata = os.environ.get("LOCALAPPDATA", "")
    userprofile = os.environ.get("USERPROFILE", user)
    
    if appdata:
        candidates.extend([
            os.path.join(appdata, "LM Studio", "models"),
            os.path.join(appdata, "lm-studio", "models"),
        ])
    if localappdata:
        candidates.extend([
            os.path.join(localappdata, "LM Studio", "models"),
            os.path.join(localappdata, "lm-studio", "models"),
        ])

    # 2. Check settings.json files for custom download / model directories
    settings_files = [
        os.path.join(user, ".lmstudio", "settings.json"),
        os.path.join(userprofile, ".lmstudio", "settings.json"),
        os.path.join(appdata, "LM Studio", "settings.json") if appdata else "",
        os.path.join(appdata, "lm-studio", "settings.json") if appdata else "",
    ]
    for sf in settings_files:
        if sf and os.path.isfile(sf):
            try:
                with open(sf, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                for key in ("downloadsFolder", "modelsDirectory", "modelDirectory", "modelPath"):
                    val = cfg.get(key)
                    if isinstance(val, str) and os.path.isdir(val):
                        candidates.append(val)
                for list_key in ("customModelPaths", "indexedFolders", "downloadFolders"):
                    arr = cfg.get(list_key)
                    if isinstance(arr, list):
                        for item in arr:
                            if isinstance(item, str) and os.path.isdir(item):
                                candidates.append(item)
            except Exception:
                pass

    # 3. Check LM Studio home / models pointer files
    pointer_files = [
        os.path.join(user, ".lmstudio-home-pointer"),
        os.path.join(userprofile, ".lmstudio-home-pointer"),
        os.path.join(user, ".lmstudio-models-pointer"),
    ]
    for pf in pointer_files:
        if pf and os.path.isfile(pf):
            try:
                with open(pf, "r", encoding="utf-8") as f:
                    ptr = f.read().strip()
                if ptr and os.path.isdir(ptr):
                    candidates.append(ptr)
                    models_sub = os.path.join(ptr, "models")
                    if os.path.isdir(models_sub):
                        candidates.append(models_sub)
            except Exception:
                pass

    # 4. Check standard root drives on Windows (C:, D:, E:, F:, G:, H:, etc.)
    drives = []
    if sys.platform.startswith("win"):
        import string
        for letter in string.ascii_uppercase:
            d = f"{letter}:\\"
            if os.path.exists(d):
                drives.append(d)
    else:
        drives = ["/"]

    for d in drives:
        candidates.extend([
            os.path.join(d, "LM Studio", "models"),
            os.path.join(d, "LM-Studio", "models"),
            os.path.join(d, "lmstudio", "models"),
            os.path.join(d, "lm-studio", "models"),
            os.path.join(d, "LMStudio", "models"),
            os.path.join(d, "AI", "models", "LM-Studio"),
            os.path.join(d, "AI", "models", "LMStudio"),
            os.path.join(d, "AI", "LM-Studio", "models"),
            os.path.join(d, "AI", "LMStudio", "models"),
            os.path.join(d, "AI", "models", "LLM"),
            os.path.join(d, "models", "LLM"),
            os.path.join(d, "models", "GGUF"),
        ])

    # 5. Check Environment Variables
    for env_k in ("LM_STUDIO_MODELS_DIR", "LM_STUDIO_MODELS", "LM_STUDIO_HOME", "LLM_MODELS_DIR", "GGUF_MODELS_DIR", "DS_LLM_MODELS_PATH"):
        v = os.environ.get(env_k)
        if v and os.path.isdir(v):
            candidates.append(v)
            if os.path.isdir(os.path.join(v, "models")):
                candidates.append(os.path.join(v, "models"))

    seen = set()
    for c in candidates:
        if c and os.path.isdir(c):
            norm = os.path.normcase(os.path.realpath(c))
            if norm not in seen:
                seen.add(norm)
                roots.append(c)
    return roots


def model_roots():
    """Return list of (label, directory) to search for GGUF models across ComfyUI, LM Studio, and PC."""
    out = []
    seen = set()

    # 1. ComfyUI LLM folders
    comfy_dirs = register_llm_folder()
    for d in comfy_dirs:
        if d and os.path.isdir(d):
            key = os.path.normcase(os.path.realpath(d))
            if key not in seen:
                seen.add(key)
                out.append(("ComfyUI", d))

    # 2. LM Studio & External LLM folders
    for d in get_lmstudio_model_roots():
        if d and os.path.isdir(d):
            key = os.path.normcase(os.path.realpath(d))
            if key not in seen:
                seen.add(key)
                out.append(("LM Studio", d))

    # 3. Ollama standard folder
    user = os.path.expanduser("~")
    ollama_dir = os.path.join(user, ".ollama", "models")
    if os.path.isdir(ollama_dir):
        key = os.path.normcase(os.path.realpath(ollama_dir))
        if key not in seen:
            seen.add(key)
            out.append(("Ollama", ollama_dir))

    return out


def _is_mmproj(name: str) -> bool:
    low = name.lower()
    return "mmproj" in low or "projector" in low or ("vision" in low and ".gguf" in low) or ("-vl-" in low and "proj" in low)


def find_mmproj_for(model_path: str):
    """Find vision projector GGUF located next to the model, in subfolder, or in parent."""
    if not model_path or not os.path.exists(model_path):
        return None
    folder = os.path.dirname(model_path)
    stem = os.path.basename(model_path).lower()
    if not os.path.isdir(folder):
        return None

    # Search candidates: 1. same folder, 2. 'mmproj' subfolder, 3. parent folder
    search_folders = [folder]
    sub_mm = os.path.join(folder, "mmproj")
    if os.path.isdir(sub_mm):
        search_folders.append(sub_mm)
    parent_folder = os.path.dirname(folder)
    if os.path.isdir(parent_folder):
        search_folders.append(parent_folder)

    found = []
    for fld in search_folders:
        try:
            for f in os.listdir(fld):
                if f.lower().endswith(".gguf") and _is_mmproj(f):
                    full_p = os.path.join(fld, f)
                    if full_p != model_path and os.path.isfile(full_p):
                        found.append(full_p)
        except Exception:
            pass

    if not found:
        return None

    def shared_prefix_len(full_f):
        f_name = os.path.basename(full_f).lower()
        n = 0
        while n < min(len(f_name), len(stem)) and f_name[n] == stem[n]:
            n += 1
        return n

    found.sort(key=lambda f: (-shared_prefix_len(f), len(f)))
    return found[0]


def list_builtin_models():
    """
    Scans model roots and returns a list of dictionaries with model metadata:
    [{"id": key, "name": display_name, "has_vision": bool, "size_gb": float, "root": label}]
    """
    models = []
    seen_paths = set()
    seen_names = set()

    for label, root in model_roots():
        if not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            for f in files:
                if not f.lower().endswith(".gguf") or _is_mmproj(f):
                    continue
                full = os.path.join(dirpath, f)
                real = os.path.normcase(os.path.realpath(full))
                try:
                    size_bytes = os.path.getsize(full)
                except OSError:
                    continue

                file_sig = (f.lower(), size_bytes)
                if real in seen_paths or file_sig in seen_names:
                    continue
                seen_paths.add(real)
                seen_names.add(file_sig)

                rel = os.path.relpath(full, root).replace("\\", "/")
                key = f"{label}/{rel}"
                mmproj = find_mmproj_for(full)
                size_gb = round(size_bytes / GiB, 2)

                display_name = f
                if display_name.lower().endswith(".gguf"):
                    display_name = display_name[:-5]

                models.append({
                    "id": key,
                    "name": display_name,
                    "rel_path": rel,
                    "root": label,
                    "full_path": full,
                    "has_vision": bool(mmproj),
                    "mmproj_path": mmproj,
                    "size_gb": size_gb,
                })

    models.sort(key=lambda m: (not m["has_vision"], m["name"].lower()))
    return models


def resolve_model_key(key: str):
    """
    Resolve model key to (model_path, mmproj_path).
    Supports:
    - 'Root/rel/path/model.gguf'
    - 'Root\\rel\\path\\model.gguf' (Windows backslashes)
    - Direct absolute paths ('D:/models/LLM/model.gguf')
    - Bare model filenames ('model.gguf' or 'model')
    - Relative paths
    """
    if not key:
        raise FileNotFoundError("[Builtin LLM] Empty model key provided")

    s_key = str(key).strip()

    # 1. Direct absolute file path check
    for direct in (s_key, s_key.replace("/", "\\"), s_key.replace("\\", "/")):
        if os.path.isfile(direct):
            return direct, find_mmproj_for(direct)

    # Normalize slashes
    norm_key = s_key.replace("\\", "/")
    label, sep, rel = norm_key.partition("/")

    # 2. Match via registered roots
    if sep:
        for root_label, root in model_roots():
            if root_label.lower() == label.lower():
                path = os.path.join(root, *rel.split("/"))
                if os.path.isfile(path):
                    return path, find_mmproj_for(path)

    # 3. Fallback: Search all discovered models in list_builtin_models()
    all_models = list_builtin_models()
    norm_lower = norm_key.lower()
    base_name = norm_key.split("/")[-1].lower()
    if base_name.endswith(".gguf"):
        base_stem = base_name[:-5]
    else:
        base_stem = base_name
        base_name = f"{base_name}.gguf"

    # Exact ID match (case-insensitive)
    for m in all_models:
        if m["id"].lower() == norm_lower or m["id"].replace("\\", "/").lower() == norm_lower:
            return m["full_path"], m.get("mmproj_path") or find_mmproj_for(m["full_path"])

    # Relative path match
    for m in all_models:
        if m["rel_path"].lower() == norm_lower or m["rel_path"].lower() == rel.lower():
            return m["full_path"], m.get("mmproj_path") or find_mmproj_for(m["full_path"])

    # Filename match
    for m in all_models:
        m_file = os.path.basename(m["full_path"]).lower()
        if m_file == base_name or m["name"].lower() == base_stem:
            return m["full_path"], m.get("mmproj_path") or find_mmproj_for(m["full_path"])

    raise FileNotFoundError(f"[Builtin LLM] Model not found on disk: {key}")


def _preload_cuda_linux():
    """Ensure Linux dynamic linker can resolve CUDA runtime libraries for libggml-cuda.so."""
    if not sys.platform.startswith("linux"):
        return
    if os.environ.get("DS_SENSEI_SKIP_CUDA_PRELOAD") == "1":
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

        priority = ["nccl", "cudart", "nvrtc", "cublasLt", "cublas"]
        for p in priority:
            for d in search_dirs:
                try:
                    for f in sorted(os.listdir(d)):
                        if p in f and (".so" in f):
                            full = os.path.join(d, f)
                            try:
                                ctypes.CDLL(full, mode=ctypes.RTLD_GLOBAL)
                            except Exception:
                                pass
                except Exception:
                    pass
    except Exception as e:
        logger.debug(f"[Builtin LLM] Linux CUDA preload: {e}")


def ensure_backends():
    """Register llama.cpp CPU and CUDA backend DLLs once per process."""
    with _lock:
        if _backend["done"]:
            return _backend
        try:
            import torch
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
            logger.warning(f"[Builtin LLM] Backend registration warning: {e}")
            _backend["error"] = str(e)
        _backend["done"] = True
        return _backend


def is_loaded():
    with _lock:
        return _state["llm"] is not None


def loaded_key():
    with _lock:
        return _state["key"]


def loaded_model_name():
    with _lock:
        return _state.get("loaded_model_name", "")


def get_backend_status():
    """Return status summary for UI polling."""
    vram_free_mb = 0
    try:
        import torch
        if torch.cuda.is_available():
            vram_free_mb = int(torch.cuda.mem_get_info()[0] / (1024 * 1024))
    except Exception:
        pass

    with _lock:
        return {
            "loaded": _state["llm"] is not None,
            "key": _state.get("key"),
            "model_name": _state.get("loaded_model_name", ""),
            "has_vision": _state.get("has_vision", False),
            "gpu": bool(_backend.get("gpu", False)),
            "vram_free_mb": vram_free_mb,
            "backend_error": _backend.get("error"),
        }


def _unload_locked():
    llm = _state.get("llm")
    handler = _state.get("handler")
    _state.update(llm=None, handler=None, key=None, n_ctx=0, loaded_model_name="", has_vision=False)

    if handler is not None:
        try:
            if hasattr(handler, "_free_mtmd_resources") and callable(handler._free_mtmd_resources):
                handler._free_mtmd_resources()
            if hasattr(handler, "close") and callable(handler.close):
                handler.close()
        except Exception as e:
            logger.debug(f"[Builtin LLM] mmproj close: {e}")

    if llm is not None:
        try:
            if hasattr(llm, "_ctx") and llm._ctx is not None:
                try:
                    if hasattr(llm._ctx, "close") and callable(llm._ctx.close):
                        llm._ctx.close()
                except Exception:
                    pass
            if hasattr(llm, "_model") and llm._model is not None:
                try:
                    if hasattr(llm._model, "close") and callable(llm._model.close):
                        llm._model.close()
                except Exception:
                    pass
            if hasattr(llm, "_stack") and llm._stack is not None:
                try:
                    llm._stack.close()
                except Exception:
                    pass
            llm.close()
        except Exception as e:
            logger.debug(f"[Builtin LLM] model close: {e}")

    del llm, handler

    # 1. Double pass garbage collection to break cyclical references
    gc.collect()
    gc.collect()

    # 2. PyTorch CUDA memory purge & IPC cleanup
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
    except Exception:
        pass

    # 3. ComfyUI memory management soft cache release
    try:
        import comfy.model_management as mm
        mm.soft_empty_cache()
        if hasattr(mm, "cleanup_models_gc"):
            mm.cleanup_models_gc()
    except Exception:
        pass

    # 4. OS Process Memory Trim (purges memory-mapped GGUF pages from physical RAM)
    if sys.platform == "win32":
        try:
            import ctypes.wintypes
            k32 = ctypes.windll.kernel32
            psapi = ctypes.windll.psapi
            k32.GetCurrentProcess.restype = ctypes.wintypes.HANDLE
            psapi.EmptyWorkingSet.argtypes = [ctypes.wintypes.HANDLE]
            psapi.EmptyWorkingSet.restype = ctypes.wintypes.BOOL
            psapi.EmptyWorkingSet(k32.GetCurrentProcess())
        except Exception as e:
            logger.debug(f"[Builtin LLM] EmptyWorkingSet trim: {e}")
    elif sys.platform.startswith("linux"):
        try:
            libc = ctypes.CDLL("libc.so.6")
            if hasattr(libc, "malloc_trim"):
                libc.malloc_trim(0)
        except Exception as e:
            logger.debug(f"[Builtin LLM] malloc_trim: {e}")

    logger.info("[Builtin LLM] Model fully unloaded: VRAM & System RAM completely released.")
    return True


def unload():
    """Unload model and free GPU VRAM and System RAM completely."""
    _state["abort"] = True
    with _lock:
        was_loaded = _state["llm"] is not None
        _unload_locked()
        return was_loaded


MiB = 1024 ** 2


def _read_gguf_arch(path: str) -> dict:
    """Minimal GGUF header reader: returns numeric arch keys (block_count, head_count, ...)."""
    import struct
    sizes = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}
    fmts = {0: "<B", 1: "<b", 2: "<H", 3: "<h", 4: "<I", 5: "<i", 6: "<f", 7: "<?", 10: "<Q", 11: "<q", 12: "<d"}
    out = {}
    try:
        with open(path, "rb") as f:
            if f.read(4) != b"GGUF":
                return out
            f.read(4)
            _n_tensors, n_kv = struct.unpack("<QQ", f.read(16))

            def rstr():
                n = struct.unpack("<Q", f.read(8))[0]
                return f.read(n).decode("utf-8", "replace")

            def rval(t):
                if t == 8:
                    return rstr()
                if t == 9:
                    et = struct.unpack("<I", f.read(4))[0]
                    n = struct.unpack("<Q", f.read(8))[0]
                    if et == 8:
                        for _ in range(n):
                            f.seek(struct.unpack("<Q", f.read(8))[0], 1)
                    else:
                        f.seek(sizes[et] * n, 1)
                    return None
                return struct.unpack(fmts[t], f.read(sizes[t]))[0]

            for _ in range(n_kv):
                key = rstr()
                t = struct.unpack("<I", f.read(4))[0]
                v = rval(t)
                if key.startswith("tokenizer."):
                    break
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    out[key.split(".", 1)[-1]] = v
    except Exception as e:
        logger.debug(f"[Builtin LLM] GGUF header read failed: {e}")
    return out


def _plan_gpu(model_path, mmproj_path, n_ctx, requested_layers):
    """
    Decide how many layers (and whether the vision projector) fit in FREE VRAM.
    Windows silently spills VRAM into system RAM; Linux does not and hard-fails with
    cudaMalloc OOM, so we must budget explicitly.
    Returns dict(layers=int(-1 = all), mm_gpu=bool, n_layer=int, note=str).
    """
    plan = {"layers": requested_layers, "mm_gpu": True, "n_layer": 32, "note": "no VRAM info"}
    try:
        import torch
        if not torch.cuda.is_available():
            return plan
        free = int(torch.cuda.mem_get_info()[0])
    except Exception:
        return plan

    meta = _read_gguf_arch(model_path)
    n_layer = int(meta.get("block_count") or 32)
    n_head = int(meta.get("attention.head_count") or 32)
    n_kv = int(meta.get("attention.head_count_kv") or n_head)
    embd = int(meta.get("embedding_length") or 4096)
    head_dim = int(meta.get("attention.key_length") or (embd // max(1, n_head)))

    kv_total = 2 * n_layer * n_kv * head_dim * 2 * int(n_ctx)  # K+V, f16
    size = os.path.getsize(model_path)
    per_layer = size * 0.93 / n_layer + kv_total / n_layer
    compute = 450 * MiB
    margin = 450 * MiB
    budget = free - margin - compute
    mm_cost = (os.path.getsize(mmproj_path) + 300 * MiB) if mmproj_path and os.path.isfile(mmproj_path) else 0

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
    n_num = layers
    layers = -1 if layers >= full else layers
    plan.update(
        layers=layers, layers_num=n_num, mm_gpu=mm_gpu, n_layer=n_layer,
        note=(f"free VRAM {free // MiB} MiB, ctx {n_ctx}, kv {kv_total // MiB} MiB, "
              f"-> gpu_layers={layers} of {full}, mmproj_on_gpu={mm_gpu}"),
    )
    return plan


def load_model(key: str, n_ctx=4096, n_gpu_layers=-1, free_comfy=False):
    """Loads GGUF model and mmproj vision projector if present."""
    with _lock:
        if _state["llm"] is not None and _state["key"] == key and _state["n_ctx"] >= n_ctx:
            return _state["llm"]

        _unload_locked()

        if free_comfy:
            try:
                import comfy.model_management as mm
                mm.unload_all_models()
                mm.soft_empty_cache()
            except Exception:
                pass

        be = ensure_backends()
        if be.get("error"):
            logger.warning(f"[Builtin LLM] Backends initialized with note: {be['error']}")

        model_path, mmproj_path = resolve_model_key(key)
        has_vision = bool(mmproj_path and os.path.isfile(mmproj_path))

        import llama_cpp
        from llama_cpp import Llama
        from llama_cpp import llama_chat_format as cf

        plan = {"layers": 0, "mm_gpu": False, "n_layer": 32, "layers_num": 0, "note": "gpu disabled"}
        if be.get("gpu") and n_gpu_layers != 0:
            plan = _plan_gpu(model_path, mmproj_path if has_vision else None, n_ctx, n_gpu_layers)
        logger.info(f"[Builtin LLM] GPU plan: {plan['note']}")

        handler = None
        if has_vision:
            m_low = model_path.lower()
            if "qwen3" in m_low:
                arch_key = "qwen3vl"
            elif "qwen" in m_low:
                arch_key = "qwen25vl"
            elif "gemma" in m_low:
                arch_key = "gemma4" if "gemma-4" in m_low or "gemma4" in m_low else "gemma3"
            else:
                arch_key = FALLBACK_HANDLER

            handler_cls_name = HANDLERS.get(arch_key, FALLBACK_HANDLER)
            handler_cls = getattr(cf, handler_cls_name, None) or getattr(cf, FALLBACK_HANDLER)

            sig_params = inspect.signature(handler_cls.__init__).parameters
            hk = {
                "verbose": False,
            }
            # Compatible with JamePeng 0.4.0, official llama_cpp 0.3.x/0.4.x, and MTMDChatHandler subclasses
            if issubclass(handler_cls, cf.MTMDChatHandler) or "clip_model_path" in sig_params:
                hk["clip_model_path"] = ascii_path(mmproj_path)
            elif "mmproj_path" in sig_params:
                hk["mmproj_path"] = ascii_path(mmproj_path)
            else:
                hk["clip_model_path"] = ascii_path(mmproj_path)

            if "use_gpu" in sig_params or issubclass(handler_cls, cf.MTMDChatHandler):
                hk["use_gpu"] = bool(be.get("gpu", False)) and bool(plan["mm_gpu"])
            if "image_max_tokens" in sig_params:
                hk["image_max_tokens"] = IMAGE_TOKENS
            if "batch_max_tokens" in sig_params:
                hk["batch_max_tokens"] = UBATCH
            if "enable_thinking" in sig_params:
                hk["enable_thinking"] = False

            try:
                handler = handler_cls(**hk)
            except Exception as e:
                logger.warning(f"[Builtin LLM] Failed to initialize vision handler ({handler_cls_name}): {e}")
                handler = None
                has_vision = False

            if handler is not None:
                orig_tokenize = getattr(handler, "_process_mtmd_prompt", None)
                if orig_tokenize is not None:
                    def _fresh_tokenize(*args, **kwargs):
                        _l = kwargs.get("llama")
                        if _l is None:
                            return orig_tokenize(*args, **kwargs)
                        _s = _l.n_tokens
                        _l.n_tokens = 0
                        try:
                            return orig_tokenize(*args, **kwargs)
                        finally:
                            _l.n_tokens = _s
                    handler._process_mtmd_prompt = _fresh_tokenize

        llama_params = inspect.signature(Llama.__init__).parameters
        gpu_layers = plan["layers"] if (be.get("gpu") and n_gpu_layers != 0) else 0
        full_num = plan["n_layer"] + 1
        plan_num = full_num if gpu_layers == -1 else gpu_layers
        reduced_70 = max(1, int(plan_num * 0.7)) if plan_num > 0 else 0
        reduced_40 = max(1, int(plan_num * 0.4)) if plan_num > 0 else 0

        def _mmap_kwargs():
            """Original behaviour: read the whole model instead of mmap'ing it."""
            if "load_mode" in llama_params:
                mode_enum = getattr(llama_cpp, "llama_load_mode", None)
                mode_none = getattr(mode_enum, "LLAMA_LOAD_MODE_NONE", None)
                if mode_none is not None:
                    return {"load_mode": int(mode_none)}
                return {}
            if "use_mmap" in llama_params:
                return {"use_mmap": False}
            return {}

        # Attempt ladder. The first one is the exact config that worked on Windows.
        # If llama.cpp refuses to create a context (common on Linux: CUDA/cuBLAS
        # quirks, VRAM pressure, mmap/batch/flash-attn differences) we progressively
        # fall back to safer settings instead of failing outright.
        ladder = [
            ("default", {"n_batch": UBATCH, "n_ubatch": UBATCH, "n_gpu_layers": gpu_layers}, True),
            ("safe batch + mmap + no flash-attn",
             {"n_batch": 512, "n_ubatch": 512, "n_gpu_layers": reduced_70, "flash_attn": False}, False),
            ("no KV-cache offload",
             {"n_batch": 512, "n_ubatch": 512, "n_gpu_layers": reduced_40, "flash_attn": False,
              "offload_kqv": False}, False),
            ("CPU only",
             {"n_batch": 512, "n_ubatch": 512, "n_gpu_layers": 0, "flash_attn": False,
              "offload_kqv": False}, False),
        ]

        llm = None
        errors = []
        seen_cfgs = set()
        t0 = time.time()
        for idx, (label, extra, no_mmap) in enumerate(ladder):
            lk = {
                "model_path": ascii_path(model_path),
                "n_ctx": n_ctx,
                # Verbose on retries so llama.cpp prints the REAL failure reason to the console.
                "verbose": idx == 1,
            }
            lk.update({k: v for k, v in extra.items() if k in llama_params})
            if no_mmap:
                lk.update(_mmap_kwargs())
            if handler is not None:
                lk["chat_handler"] = handler

            sig = repr(sorted((k, repr(v)) for k, v in lk.items() if k not in ("verbose", "chat_handler")))
            if sig in seen_cfgs:
                continue
            seen_cfgs.add(sig)

            logger.info(
                f"[Builtin LLM] Loading {os.path.basename(model_path)} "
                f"(vision={has_vision}, gpu_layers={lk.get('n_gpu_layers')}, ctx={n_ctx}, attempt='{label}')..."
            )
            try:
                llm = Llama(**lk)
                init_fn = getattr(handler, "_init_mtmd_context", None) if handler is not None else None
                if init_fn and mmproj_path and getattr(handler, "use_gpu", False):
                    try:
                        import torch
                        need = os.path.getsize(mmproj_path) + 250 * MiB
                        if torch.cuda.is_available() and torch.cuda.mem_get_info()[0] < need:
                            logger.warning("[Builtin LLM] Not enough free VRAM for the vision projector; running it on CPU.")
                            handler.use_gpu = False
                    except Exception:
                        pass
                if init_fn:
                    init_fn(llm)
                if idx > 0:
                    logger.warning(f"[Builtin LLM] Loaded using fallback attempt '{label}'.")
                break
            except Exception as e:
                errors.append(f"{label}: {e}")
                logger.warning(f"[Builtin LLM] Attempt '{label}' failed: {e}")
                llm = None
                gc.collect()
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass

        if llm is None:
            if handler:
                try:
                    handler.close()
                except Exception:
                    pass
            raise RuntimeError(
                "Could not create a llama.cpp context after all fallback attempts. "
                "Check the ComfyUI console for the llama.cpp error lines just above this. "
                "Last error: " + (errors[-1] if errors else "unknown")
            )

        model_name = os.path.basename(model_path)
        if model_name.lower().endswith(".gguf"):
            model_name = model_name[:-5]

        _state.update(
            llm=llm,
            handler=handler,
            key=key,
            n_ctx=n_ctx,
            abort=False,
            loaded_model_name=model_name,
            has_vision=has_vision,
        )
        logger.info(f"[Builtin LLM] Successfully loaded {model_name} in {round(time.time() - t0, 2)}s.")
        return llm


def generate_chat(
    messages,
    max_tokens=512,
    temperature=0.7,
    seed=-1,
    top_p=0.95,
    top_k=40,
    repeat_penalty=1.1,
    check_interrupt=None,
    on_text=None,
    system_prompt=None,
):
    """
    Generate chat completion through the loaded model with streaming and interrupt support.
    Returns (cleaned_text, completion_tokens, elapsed_seconds).
    """
    with _lock:
        llm = _state["llm"]
        if llm is None:
            raise RuntimeError("[Builtin LLM] No model loaded. Select and load a model first.")

        _state["abort"] = False
        t0 = time.perf_counter()
        parts = []

        sampling = {
            "top_k": top_k,
            "top_p": top_p,
            "repeat_penalty": repeat_penalty,
        }
        if "reasoning_budget" in inspect.signature(llm.create_chat_completion).parameters:
            sampling["reasoning_budget"] = 0

        stream = llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            seed=None if (seed is None or seed < 0) else seed,
            stream=True,
            **sampling,
        )

        last_progress_time = t0
        token_count = 0
        try:
            for chunk in stream:
                if _state["abort"]:
                    raise RuntimeError("[Builtin LLM] Generation cancelled mid-run.")
                if check_interrupt:
                    check_interrupt()
                delta = chunk["choices"][0].get("delta") or {}
                piece = delta.get("content") or ""
                if piece:
                    parts.append(piece)
                    token_count += 1
                    if on_text:
                        on_text(piece)
                    now = time.perf_counter()
                    if now - last_progress_time >= 0.1:
                        last_progress_time = now
                        elapsed_so_far = max(0.1, round(now - t0, 1))
                        tk_s = round(token_count / elapsed_so_far, 1)
                        try:
                            import server
                            server.PromptServer.instance.send_sync("ds_sensei_progress", {
                                "stage": "generating",
                                "message": f"Writing prompt: {token_count} tokens ({elapsed_so_far}s · {tk_s} Tk/s)...",
                                "tokens": token_count,
                                "speed": tk_s,
                                "elapsed": elapsed_so_far,
                            })
                        except Exception:
                            pass
        finally:
            stream.close()

        raw_text = "".join(parts).strip()
        elapsed = max(0.01, round(time.perf_counter() - t0, 2))

        try:
            from .prompt_manager import clean_generated_prompt
            cleaned_text = clean_generated_prompt(raw_text, system_prompt=system_prompt)
        except Exception:
            try:
                from prompt_manager import clean_generated_prompt
                cleaned_text = clean_generated_prompt(raw_text, system_prompt=system_prompt)
            except Exception:
                cleaned_text = raw_text

        tokens = len(llm.tokenize(cleaned_text.encode("utf-8"), add_bos=False, special=False)) if cleaned_text else 0
        speed = round(tokens / elapsed, 1) if elapsed > 0 else 0.0

        try:
            import server
            server.PromptServer.instance.send_sync("ds_sensei_progress", {
                "stage": "completed",
                "message": f"Prompt generated ({tokens} tokens in {elapsed}s · {speed} Tk/s)",
                "tokens": tokens,
                "speed": speed,
                "elapsed": elapsed,
            })
        except Exception:
            pass

        return cleaned_text, tokens, elapsed


def generate_prompt_builtin(
    scene_notes: str,
    system_prompt: str,
    image_path: str = None,
    image_tensor = None,
    builtin_config: dict = None,
    context: dict = None,
    check_interrupt = None,
    on_text = None,
):
    """
    Unified prompt generation entry point for the Built-In LLM backend.
    Loads the requested model, formats multimodal/text chat messages,
    streams completion, strips <think> reasoning tokens, and honors auto-unload.
    """
    cfg = builtin_config or {}
    model_key = cfg.get("model")
    if not model_key:
        available = list_builtin_models()
        if available:
            model_key = available[0]["id"]
            cfg["model"] = model_key
        else:
            return {
                "status": "failed",
                "error": "No Built-In model found. Please place GGUF models in ComfyUI/models/LLM or select a model in Gear Menu > Built In.",
            }

    temperature = float(cfg.get("temperature", 0.7))
    max_tokens = int(cfg.get("max_tokens", 2048))
    context_length = int(cfg.get("context_length", 8192))
    n_gpu_layers = 0 if cfg.get("cpu_only") else int(cfg.get("n_gpu_layers", 15))
    top_p = float(cfg.get("top_p", 0.95))
    top_k = int(cfg.get("top_k", 40))
    repetition_penalty = float(cfg.get("repetition_penalty", 1.1))
    seed = int(cfg.get("seed", -1))
    auto_unload = bool(cfg.get("auto_unload", True))
    free_comfy = bool(cfg.get("free_comfy_memory", True))

    model_display_name = os.path.basename(model_key).replace('.gguf', '')

    try:
        import server
        server.PromptServer.instance.send_sync("ds_sensei_progress", {
            "stage": "loading",
            "message": f"Loading model {model_display_name} into VRAM...",
            "tokens": 0,
            "speed": 0.0,
            "elapsed": 0.0,
        })
    except Exception:
        pass

    t_load_start = time.time()
    try:
        load_model(
            key=model_key,
            n_ctx=context_length,
            n_gpu_layers=n_gpu_layers,
            free_comfy=free_comfy,
        )
        t_load = round(time.time() - t_load_start, 1)
        try:
            import server
            server.PromptServer.instance.send_sync("ds_sensei_progress", {
                "stage": "loaded",
                "message": f"Model loaded ({t_load}s)! Writing prompt...",
                "tokens": 0,
                "speed": 0.0,
                "elapsed": 0.0,
            })
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[Builtin LLM] Error loading model '{model_key}': {e}")
        return {
            "status": "failed",
            "error": f"Failed to load built-in model: {e}",
        }

    # Encode image if present
    image_payload = None
    if image_tensor is not None:
        try:
            import base64
            import io
            import numpy as np
            from PIL import Image

            if hasattr(image_tensor, "cpu"):
                arr = image_tensor[0].cpu().numpy()
            else:
                arr = np.array(image_tensor[0])
            img = Image.fromarray(np.clip(255.0 * arr, 0, 255).astype(np.uint8))
            if max(img.size) > MAX_IMAGE_SIDE:
                img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            image_payload = f"data:image/jpeg;base64,{b64}"
        except Exception as e:
            logger.warning(f"[Builtin LLM] Image tensor encoding error: {e}")
    elif image_path and os.path.isfile(image_path):
        try:
            import base64
            import io
            from PIL import Image

            with Image.open(image_path) as img:
                img = img.convert("RGB")
                if max(img.size) > MAX_IMAGE_SIDE:
                    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=90)
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                image_payload = f"data:image/jpeg;base64,{b64}"
        except Exception as e:
            logger.warning(f"[Builtin LLM] Image file encoding error: {e}")

    # Build chat messages
    low_key = str(model_key or "").lower()
    is_gemma = "gemma" in low_key

    messages = []
    user_text = scene_notes or "Write a cinematic scene prompt."
    if system_prompt and is_gemma:
        user_text = (
            f"{system_prompt.strip()}\n\n"
            f"Scene Details:\n{user_text}\n\n"
            f"CRITICAL: Output ONLY the final prompt text. Do NOT include any preamble, analysis, thought process, notes, or instructions."
        )
    elif system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    has_vision = _state.get("has_vision", False)
    if has_vision and image_payload:
        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_payload}},
                {"type": "text", "text": user_text},
            ],
        })
    else:
        messages.append({
            "role": "user",
            "content": user_text,
        })

    def _default_interrupt():
        try:
            import comfy.model_management as mm
            mm.throw_exception_if_processing_interrupted()
        except Exception:
            pass

    actual_interrupt = check_interrupt or _default_interrupt

    result = {}
    try:
        cleaned_text, tokens, elapsed = generate_chat(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            seed=seed,
            top_p=top_p,
            top_k=top_k,
            repeat_penalty=repetition_penalty,
            check_interrupt=actual_interrupt,
            on_text=on_text,
            system_prompt=system_prompt,
        )
        speed = round(tokens / elapsed, 1) if elapsed > 0 else 0.0
        result = {
            "status": "completed",
            "prompt": cleaned_text,
            "tokens": tokens,
            "speed": speed,
            "elapsed": elapsed,
            "model": loaded_model_name() or os.path.basename(model_key),
            "seed": seed,
        }
    except Exception as e:
        logger.error(f"[Builtin LLM] Generation error: {e}")
        result = {"status": "failed", "error": str(e)}
    finally:
        if auto_unload:
            time.sleep(0.3)
            try:
                import server
                server.PromptServer.instance.send_sync("ds_sensei_progress", {
                    "stage": "unloading",
                    "message": "Unloading model from VRAM & RAM...",
                    "tokens": result.get("tokens", 0),
                    "speed": result.get("speed", 0.0),
                    "elapsed": result.get("elapsed", 0.0),
                })
            except Exception:
                pass
            unload()
            time.sleep(0.15)

        try:
            import server
            tok = result.get("tokens", 0)
            spd = result.get("speed", 0.0)
            ela = result.get("elapsed", 0.0)
            mod = loaded_model_name() or os.path.basename(model_key)
            server.PromptServer.instance.send_sync("ds_sensei_progress", {
                "stage": "completed",
                "message": f"Completed ({tok} tokens · {spd} Tk/s · {ela}s)",
                "tokens": tok,
                "speed": spd,
                "elapsed": ela,
                "model": mod,
            })
        except Exception:
            pass

    return result
