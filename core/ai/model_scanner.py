"""
Deathshot Arsenal — Centralized AI Core: Model Scanner
Discovers GGUF models across ComfyUI/models/LLM, text_encoders, LM Studio, and system paths.
Reads GGUF metadata for layer count, file size, and vision projectors.
"""

import json
import logging
import os
import struct
import sys
from typing import List, Dict, Any, Optional

logger = logging.getLogger("DeathshotArsenal.Core.AI.Scanner")

META_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_meta_cache.json")


def _get_models_dir() -> str:
    try:
        import folder_paths
        if hasattr(folder_paths, "models_dir") and folder_paths.models_dir and os.path.isdir(folder_paths.models_dir):
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


def register_llm_folders() -> List[str]:
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
                paths = folder_paths.get_folder_paths(tag)
                if paths:
                    dirs.extend(paths)
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


def get_lmstudio_model_roots() -> List[str]:
    """Detect LM Studio model download locations across user profiles, settings, and drives."""
    roots = []
    user = os.path.expanduser("~")

    candidates = [
        os.path.join(user, ".cache", "lm-studio", "models"),
        os.path.join(user, ".lmstudio", "models"),
        os.path.join(user, ".lmstudio"),
    ]

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

    if sys.platform.startswith("win"):
        import string
        for letter in string.ascii_uppercase:
            d = f"{letter}:\\"
            if os.path.exists(d):
                candidates.extend([
                    os.path.join(d, "LM_Studio_Models"),
                    os.path.join(d, "LM Studio Models"),
                    os.path.join(d, "LM-Studio-Models"),
                    os.path.join(d, "LMStudioModels"),
                    os.path.join(d, "LM Studio", "models"),
                    os.path.join(d, "LM-Studio", "models"),
                    os.path.join(d, "lmstudio", "models"),
                    os.path.join(d, "lm-studio", "models"),
                    os.path.join(d, "LLM_Models"),
                    os.path.join(d, "LLM Models"),
                    os.path.join(d, "LLM"),
                    os.path.join(d, "LLMs"),
                    os.path.join(d, "GGUF"),
                ])

    seen = set()
    for c in candidates:
        if c and os.path.isdir(c):
            norm = os.path.normcase(os.path.realpath(c))
            if norm not in seen:
                seen.add(norm)
                roots.append(c)
    return roots


def get_all_model_roots() -> List[tuple]:
    """Return list of (origin_label, path) to search for GGUF models."""
    out = []
    seen = set()

    for d in register_llm_folders():
        if d and os.path.isdir(d):
            key = os.path.normcase(os.path.realpath(d))
            if key not in seen:
                seen.add(key)
                out.append(("ComfyUI", d))

    for d in get_lmstudio_model_roots():
        if d and os.path.isdir(d):
            key = os.path.normcase(os.path.realpath(d))
            if key not in seen:
                seen.add(key)
                out.append(("LM Studio", d))

    return out


def is_mmproj(filename: str) -> bool:
    low = filename.lower()
    return "mmproj" in low or "projector" in low or ("vision" in low and ".gguf" in low) or ("-vl-" in low and "proj" in low)


def find_mmproj_for(model_path: str) -> Optional[str]:
    """Find vision projector GGUF located next to the model, in mmproj subfolder, or parent."""
    if not model_path or not os.path.exists(model_path):
        return None
    folder = os.path.dirname(model_path)
    stem = os.path.basename(model_path).lower()
    if not os.path.isdir(folder):
        return None

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
                if f.lower().endswith(".gguf") and is_mmproj(f):
                    full_p = os.path.join(fld, f)
                    if full_p != model_path and os.path.isfile(full_p):
                        found.append(full_p)
        except Exception:
            pass

    if not found:
        return None

    # Pick the best matching mmproj
    found.sort(key=lambda x: len(os.path.commonprefix([os.path.basename(x).lower(), stem])), reverse=True)
    return found[0]


def read_gguf_metadata(path: str) -> dict:
    """Quickly read GGUF header to extract block count, context, and architecture."""
    meta = {
        "total_layers": 32,
        "context_length": 4096,
        "architecture": "llama",
    }
    sizes = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}
    fmts = {0: "<B", 1: "<b", 2: "<H", 3: "<h", 4: "<I", 5: "<i", 6: "<f", 7: "<?", 10: "<Q", 11: "<q", 12: "<d"}

    try:
        with open(path, "rb") as f:
            if f.read(4) != b"GGUF":
                return meta
            f.read(4)  # version
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
                        f.seek(sizes.get(et, 1) * n, 1)
                    return None
                return struct.unpack(fmts.get(t, "<I"), f.read(sizes.get(t, 4)))[0]

            for _ in range(min(n_kv, 128)):
                key = rstr()
                t = struct.unpack("<I", f.read(4))[0]
                v = rval(t)
                if key.startswith("tokenizer."):
                    break
                if "block_count" in key and isinstance(v, (int, float)):
                    meta["total_layers"] = int(v)
                elif "context_length" in key and isinstance(v, (int, float)):
                    meta["context_length"] = int(v)
                elif key == "general.architecture" and isinstance(v, str):
                    meta["architecture"] = str(v)
    except Exception as e:
        logger.debug(f"[Model Scanner] GGUF metadata read note for {path}: {e}")

    return meta


def list_builtin_models() -> List[Dict[str, Any]]:
    """Scan and return rich metadata for all GGUF models available."""
    # Try using existing Sensei list if available
    try:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "nodes", "AI Prompt Sensei"))
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)
        import builtin_llm
        if hasattr(builtin_llm, "list_builtin_models"):
            res = builtin_llm.list_builtin_models()
            if res and isinstance(res, list):
                return res
    except Exception:
        pass

    # Native scanner fallback
    cache = {}
    if os.path.isfile(META_CACHE):
        try:
            with open(META_CACHE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    models = []
    roots = get_all_model_roots()

    for root_label, root_dir in roots:
        if not os.path.isdir(root_dir):
            continue
        try:
            for root, _, files in os.walk(root_dir):
                for f in files:
                    if not f.lower().endswith(".gguf") or is_mmproj(f):
                        continue
                    full_p = os.path.join(root, f)
                    try:
                        mtime = os.path.getmtime(full_p)
                        size_bytes = os.path.getsize(full_p)
                        size_gb = round(size_bytes / (1024 ** 3), 2)
                    except OSError:
                        continue

                    cached = cache.get(full_p)
                    if cached and cached.get("mtime") == mtime:
                        meta = cached["meta"]
                    else:
                        meta = read_gguf_metadata(full_p)
                        cache[full_p] = {"mtime": mtime, "meta": meta}

                    mmproj = find_mmproj_for(full_p)
                    mmproj_size_gb = 0.0
                    if mmproj and os.path.isfile(mmproj):
                        try:
                            mmproj_size_gb = round(os.path.getsize(mmproj) / (1024 ** 3), 2)
                        except Exception:
                            pass

                    # Clean model name
                    disp_name = os.path.splitext(f)[0]
                    # Format id: relative if under root, otherwise absolute
                    rel_id = os.path.relpath(full_p, root_dir) if root_dir else full_p
                    models.append({
                        "id": full_p,
                        "rel_id": rel_id,
                        "name": disp_name,
                        "root": root_label,
                        "size_gb": size_gb,
                        "total_layers": meta.get("total_layers", 32),
                        "context_length": meta.get("context_length", 4096),
                        "architecture": meta.get("architecture", "llama"),
                        "has_vision": bool(mmproj),
                        "mmproj_path": mmproj,
                        "mmproj_size_gb": mmproj_size_gb,
                    })
        except Exception as e:
            logger.warning(f"[Model Scanner] Error scanning {root_dir}: {e}")

    # Save cache
    try:
        with open(META_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass

    models.sort(key=lambda m: (m.get("root") != "ComfyUI", m.get("name", "").lower()))
    return models
