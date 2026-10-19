"""
Deathshot Arsenal — Centralized AI Core: Model Scanner
Discovers GGUF models across ComfyUI/models/LLM, LM Studio downloads and common drive locations,
resolves model keys to files and reads GGUF header metadata.
"""

import json
import logging
import os
import re
import string
import struct
import sys
import threading

logger = logging.getLogger("DeathshotArsenal.Core.AI.Scanner")

GiB = 1024 ** 3

# (path, size, mtime) -> header metadata. Headers never change without the file changing.
_meta_cache = {}
_meta_lock = threading.Lock()


def _get_models_dir() -> str:
    try:
        import folder_paths
        if getattr(folder_paths, "models_dir", None) and os.path.isdir(folder_paths.models_dir):
            return folder_paths.models_dir
    except Exception:
        pass

    p = os.path.abspath(os.path.dirname(__file__))
    for _ in range(7):
        if (os.path.isfile(os.path.join(p, "main.py")) or os.path.isdir(os.path.join(p, "custom_nodes"))) and os.path.isdir(os.path.join(p, "models")):
            return os.path.join(p, "models")
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    return os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "models"))


def register_llm_folders():
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
        for tag in ("LLM", "llm", "LLMs", "gguf", "GGUF", "text_encoders"):
            try:
                dirs.extend(folder_paths.get_folder_paths(tag) or [])
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"[Model Scanner] Error querying folder_paths: {e}")

    for sub in ("LLM", "llm", "LLMs", "gguf", "GGUF"):
        candidate = os.path.join(base_models, sub)
        if os.path.isdir(candidate):
            dirs.append(candidate)

    if default_llm not in dirs and os.path.isdir(default_llm):
        dirs.append(default_llm)

    return dirs if dirs else [default_llm]


def get_lmstudio_model_roots():
    """Detect LM Studio models across user profiles, settings, pointers, and all drives."""
    user = os.path.expanduser("~")
    appdata = os.environ.get("APPDATA", "")
    localappdata = os.environ.get("LOCALAPPDATA", "")
    userprofile = os.environ.get("USERPROFILE", user)

    candidates = [
        os.path.join(user, ".cache", "lm-studio", "models"),
        os.path.join(user, ".lmstudio", "models"),
        os.path.join(user, ".lmstudio"),
    ]
    for base in (appdata, localappdata):
        if base:
            candidates.extend([
                os.path.join(base, "LM Studio", "models"),
                os.path.join(base, "lm-studio", "models"),
            ])

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
                        candidates.extend(item for item in arr if isinstance(item, str) and os.path.isdir(item))
            except Exception:
                pass

    for pf in (
        os.path.join(user, ".lmstudio-home-pointer"),
        os.path.join(userprofile, ".lmstudio-home-pointer"),
        os.path.join(user, ".lmstudio-models-pointer"),
    ):
        if os.path.isfile(pf):
            try:
                with open(pf, "r", encoding="utf-8") as f:
                    ptr = f.read().strip()
                if ptr and os.path.isdir(ptr):
                    candidates.append(ptr)
                    candidates.append(os.path.join(ptr, "models"))
            except Exception:
                pass

    drive_pat = re.compile(r'(lm[\s_\-]?studio|llm[\s_\-]?model|gguf[\s_\-]?model|ai[\s_\-]?model|^models?$|^llms?$|^ggufs?$)', re.I)
    if sys.platform.startswith("win"):
        drives = [f"{letter}:\\" for letter in string.ascii_uppercase if os.path.exists(f"{letter}:\\")]
    else:
        drives = ["/"]

    for d in drives:
        candidates.extend([
            os.path.join(d, "LM_Studio_Models"),
            os.path.join(d, "LM Studio Models"),
            os.path.join(d, "LM-Studio-Models"),
            os.path.join(d, "LMStudioModels"),
            os.path.join(d, "LM Studio", "models"),
            os.path.join(d, "LM-Studio", "models"),
            os.path.join(d, "lmstudio", "models"),
            os.path.join(d, "lm-studio", "models"),
            os.path.join(d, "LMStudio", "models"),
            os.path.join(d, "LLM_Models"),
            os.path.join(d, "LLM Models"),
            os.path.join(d, "LLM"),
            os.path.join(d, "LLMs"),
            os.path.join(d, "GGUF"),
            os.path.join(d, "AI", "models", "LM-Studio"),
            os.path.join(d, "AI", "models", "LMStudio"),
            os.path.join(d, "AI", "LM-Studio", "models"),
            os.path.join(d, "AI", "LMStudio", "models"),
            os.path.join(d, "AI", "models", "LLM"),
            os.path.join(d, "AI", "models"),
            os.path.join(d, "models", "LLM"),
            os.path.join(d, "models", "llm"),
            os.path.join(d, "models", "LLMs"),
            os.path.join(d, "models", "GGUF"),
            os.path.join(d, "models", "gguf"),
            os.path.join(d, "StabilityMatrix", "Models", "LLM"),
            os.path.join(d, "StabilityMatrix", "Models", "GGUF"),
        ])
        try:
            for entry in os.listdir(d):
                full_entry = os.path.join(d, entry)
                if drive_pat.search(entry) and os.path.isdir(full_entry):
                    candidates.append(full_entry)
                    for sub in ("models", "LLM", "llm", "gguf", "GGUF", "models/LLM"):
                        candidates.append(os.path.join(full_entry, sub))
        except Exception:
            pass

    for env_k in ("LM_STUDIO_MODELS_DIR", "LM_STUDIO_MODELS", "LM_STUDIO_HOME", "LLM_MODELS_DIR", "GGUF_MODELS_DIR", "DS_LLM_MODELS_PATH"):
        v = os.environ.get(env_k)
        if v:
            candidates.append(v)
            candidates.append(os.path.join(v, "models"))

    roots = []
    seen = set()
    for c in candidates:
        if c and os.path.isdir(c):
            norm = os.path.normcase(os.path.realpath(c))
            if norm not in seen:
                seen.add(norm)
                roots.append(c)
    return roots


def model_roots():
    """Return list of (label, directory) to search for GGUF models."""
    out = []
    seen = set()
    sources = [("ComfyUI", d) for d in register_llm_folders()]
    sources += [("LM Studio", d) for d in get_lmstudio_model_roots()]
    sources.append(("Ollama", os.path.join(os.path.expanduser("~"), ".ollama", "models")))
    for label, d in sources:
        if d and os.path.isdir(d):
            key = os.path.normcase(os.path.realpath(d))
            if key not in seen:
                seen.add(key)
                out.append((label, d))
    return out


def is_mmproj(name: str) -> bool:
    low = name.lower()
    return "mmproj" in low or "projector" in low or ("vision" in low and ".gguf" in low) or ("-vl-" in low and "proj" in low)


def find_mmproj_for(model_path: str):
    """Find vision projector GGUF located next to the model, in an 'mmproj' subfolder, or in the parent."""
    if not model_path or not os.path.isfile(model_path):
        return None
    folder = os.path.dirname(model_path)
    stem = os.path.basename(model_path).lower()

    search_folders = [folder, os.path.join(folder, "mmproj"), os.path.dirname(folder)]
    found = []
    for fld in search_folders:
        if not os.path.isdir(fld):
            continue
        try:
            for f in os.listdir(fld):
                if f.lower().endswith(".gguf") and is_mmproj(f):
                    full_p = os.path.join(fld, f)
                    if full_p != model_path and os.path.isfile(full_p):
                        found.append(full_p)
        except Exception:
            pass

    if not found:
        return None
    found.sort(key=lambda f: (-len(os.path.commonprefix([os.path.basename(f).lower(), stem])), len(f)))
    return found[0]


def read_gguf_arch(path: str) -> dict:
    """Minimal GGUF header reader: returns numeric arch keys (block_count, attention.head_count, ...)."""
    try:
        st = os.stat(path)
    except OSError:
        return {}
    cache_key = (path, st.st_size, st.st_mtime)
    with _meta_lock:
        cached = _meta_cache.get(cache_key)
    if cached is not None:
        return cached

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
        logger.debug(f"[Model Scanner] GGUF header read failed for {path}: {e}")

    with _meta_lock:
        _meta_cache[cache_key] = out
    return out


def list_builtin_models():
    """
    Scan model roots and return model metadata:
    [{"id", "name", "rel_path", "root", "full_path", "has_vision", "mmproj_path", "size_gb", "mmproj_size_gb", "total_layers"}]
    """
    models = []
    seen_paths = set()
    seen_names = set()

    for label, root in model_roots():
        for dirpath, _dirs, files in os.walk(root):
            for f in files:
                if not f.lower().endswith(".gguf") or is_mmproj(f):
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
                mmproj = find_mmproj_for(full)
                models.append({
                    "id": f"{label}/{rel}",
                    "name": f[:-5] if f.lower().endswith(".gguf") else f,
                    "rel_path": rel,
                    "root": label,
                    "full_path": full,
                    "has_vision": bool(mmproj),
                    "mmproj_path": mmproj,
                    "size_gb": round(size_bytes / GiB, 2),
                    "mmproj_size_gb": round(os.path.getsize(mmproj) / GiB, 2) if mmproj else 0,
                    "total_layers": int(read_gguf_arch(full).get("block_count") or 32),
                })

    models.sort(key=lambda m: (not m["has_vision"], m["name"].lower()))
    return models


def resolve_model_key(key: str):
    """
    Resolve a model key to (model_path, mmproj_path). Accepts 'Root/rel/path.gguf',
    absolute paths, relative paths and bare file names (with or without '.gguf').
    """
    if not key:
        raise FileNotFoundError("[Model Scanner] Empty model key provided")

    s_key = str(key).strip()
    for direct in (s_key, s_key.replace("/", "\\"), s_key.replace("\\", "/")):
        if os.path.isfile(direct):
            return direct, find_mmproj_for(direct)

    norm_key = s_key.replace("\\", "/")
    label, sep, rel = norm_key.partition("/")
    if sep:
        for root_label, root in model_roots():
            if root_label.lower() == label.lower():
                path = os.path.join(root, *rel.split("/"))
                if os.path.isfile(path):
                    return path, find_mmproj_for(path)

    all_models = list_builtin_models()
    norm_lower = norm_key.lower()
    base_name = norm_key.split("/")[-1].lower()
    base_stem = base_name[:-5] if base_name.endswith(".gguf") else base_name
    base_name = f"{base_stem}.gguf"

    for match in (
        lambda m: m["id"].lower() == norm_lower,
        lambda m: m["rel_path"].lower() in (norm_lower, rel.lower()),
        lambda m: os.path.basename(m["full_path"]).lower() == base_name or m["name"].lower() == base_stem,
    ):
        for m in all_models:
            if match(m):
                return m["full_path"], m["mmproj_path"]

    raise FileNotFoundError(f"[Model Scanner] Model not found on disk: {key}")
