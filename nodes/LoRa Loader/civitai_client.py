# DS LoRa Loader — Civitai metadata / hashing helpers
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import folder_paths

# In-memory hash cache: path -> (mtime, hashes_dict)
_HASH_CACHE = {}


def get_lora_full_path(name):
    """
    Robust LoRA path resolver. Handles:
    - Relative paths with forward/back slashes (e.g. 'krea2/model.safetensors' or 'krea2\\model.safetensors')
    - Plain basenames without folder (e.g. 'model.safetensors' located inside subfolder)
    - Names without extensions (e.g. 'model' or 'krea2/model')
    - Absolute file paths
    """
    if not name:
        return None

    name = str(name).strip()
    if os.path.isabs(name) and os.path.isfile(name):
        return name

    # Normalize backslashes
    norm_name = name.replace("\\", "/").strip("/")

    # 1. Direct folder_paths lookup
    try:
        p = folder_paths.get_full_path("loras", norm_name)
        if p and os.path.isfile(p):
            return p
    except Exception:
        pass

    # 2. Try with standard extensions
    for ext in (".safetensors", ".pt", ".ckpt", ".bin"):
        try:
            p = folder_paths.get_full_path("loras", norm_name + ext)
            if p and os.path.isfile(p):
                return p
        except Exception:
            pass

    # 3. Search all registered LoRA search directories
    try:
        lora_dirs = folder_paths.get_folder_paths("loras")
    except Exception:
        lora_dirs = []

    base_name = os.path.basename(norm_name).lower()
    base_no_ext = os.path.splitext(base_name)[0].lower()

    for l_dir in lora_dirs:
        if not os.path.isdir(l_dir):
            continue

        direct = os.path.join(l_dir, norm_name)
        if os.path.isfile(direct):
            return direct
        for ext in (".safetensors", ".pt", ".ckpt", ".bin"):
            if os.path.isfile(direct + ext):
                return direct + ext

        # Recursive search in subdirectories
        for root, _, files in os.walk(l_dir):
            for f in files:
                f_lower = f.lower()
                if f_lower == base_name or os.path.splitext(f_lower)[0] == base_no_ext:
                    return os.path.join(root, f)

    return None


def _cache_candidates(path):
    p = Path(path)
    return [
        p.with_suffix(".civitai.info"),
        p.with_name(p.name + ".civitai.info"),
        p.with_suffix(p.suffix + ".civitai.info"),
    ]


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _write_json(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def compute_file_hashes(path, chunk=4 * 1024 * 1024):
    """
    Computes full SHA256 and Civitai AutoV2 hash (first 10 hex chars of SHA256).
    Caches results by file mtime to avoid re-reading disk on repeated queries.
    """
    try:
        mtime = os.path.getmtime(path)
        if path in _HASH_CACHE:
            cached_mtime, cached_hashes = _HASH_CACHE[path]
            if cached_mtime == mtime:
                return cached_hashes
    except Exception:
        mtime = 0

    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)

    full_sha = h.hexdigest().lower()
    autov2 = full_sha[:10].upper()
    hashes = {
        "sha256": full_sha,
        "autov2": autov2,
    }

    if mtime:
        _HASH_CACHE[path] = (mtime, hashes)

    return hashes


def full_sha256(path):
    return compute_file_hashes(path)["sha256"]


def autov2_hash(path):
    return compute_file_hashes(path)["autov2"]


def _clean_word_list(value):
    """Normalize trigger-word lists returned by Civitai or embedded metadata."""
    if value is None:
        return []
    words = []
    if isinstance(value, str):
        parts = [x.strip() for x in value.split(",") if x.strip()]
        words.extend(parts)
    elif isinstance(value, (list, tuple, set)):
        for x in value:
            if isinstance(x, str) and x.strip():
                words.append(x.strip())
            elif isinstance(x, (int, float)):
                words.append(str(x).strip())

    # Deduplicate case-insensitively while preserving original casing and order
    seen = set()
    cleaned = []
    for w in words:
        k = w.casefold()
        if k not in seen:
            seen.add(k)
            cleaned.append(w)
    return cleaned


def _extract_local_trigger_words(data):
    """
    Extract trigger words from local cache or safetensors metadata.
    STRICT: Only extracts actual trained words or explicit ss_trigger_words.
    NEVER extracts model tags, tag frequency tables, or arbitrary text.
    """
    if not isinstance(data, dict):
        return []

    # 1. Civitai cache style payload
    trained = data.get("trainedWords")
    if isinstance(trained, list):
        return _clean_word_list(trained)

    # 2. Common safetensors explicit training trigger words
    meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else data
    for key in ("ss_trigger_words", "trigger_words"):
        val = meta.get(key) if isinstance(meta, dict) else None
        if val:
            if isinstance(val, list):
                return _clean_word_list(val)
            elif isinstance(val, str) and val.strip():
                try:
                    parsed = json.loads(val)
                    if isinstance(parsed, list):
                        return _clean_word_list(parsed)
                except Exception:
                    pass
                return _clean_word_list(val)

    return []


def _inspect_safetensors_header(path):
    """Read metadata block from safetensors file without loading tensor data."""
    try:
        with open(path, "rb") as f:
            raw = f.read(8)
            if len(raw) != 8:
                return {}
            header_len = int.from_bytes(raw, "little")
            if header_len <= 0 or header_len > 64 * 1024 * 1024:
                return {}
            header = f.read(header_len)
        data = json.loads(header.decode("utf-8"))
        meta = data.get("__metadata__", {}) if isinstance(data, dict) else {}
        return meta if isinstance(meta, dict) else {}
    except Exception:
        return {}


def _api_get(url, api_key=None, timeout=10):
    """Perform HTTP GET with browser-like user agent to avoid Civitai 403 blocks."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 DeathshotArsenal/1.0",
        "Accept": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _query_parent_model_versions(model_id, primary_host="https://civitai.com", api_key=None):
    """
    If the queried version has no trainedWords, query parent model versions ONLY
    for explicit version-level trainedWords. NEVER fall back to model tags.
    """
    if not model_id:
        return []
    hosts = [primary_host]
    alt_host = "https://civitai.red" if "civitai.com" in primary_host else "https://civitai.com"
    hosts.append(alt_host)

    for host in hosts:
        try:
            url = f"{host}/api/v1/models/{model_id}"
            model_data = _api_get(url, api_key=api_key, timeout=8)
            if not isinstance(model_data, dict):
                continue

            versions = model_data.get("modelVersions")
            if isinstance(versions, list):
                for v in versions:
                    if isinstance(v, dict):
                        tw = v.get("trainedWords")
                        words = _clean_word_list(tw)
                        if words:
                            return words
        except Exception:
            pass

    return []


def inspect_lora_metadata(name, api_key=None, force_online=False, allow_nsfw=True, site_mode="Standard"):
    """
    Centralized Civitai Trigger Words Retriever:
    1. Resolves model path robustly (handles subpaths, basenames, backslashes, missing extensions).
    2. If force_online is False: checks local .civitai.info cache.
    3. If force_online is True (or cache not found):
       - Computes true AutoV2 and SHA256 hashes.
       - Queries CivitAI (.com and .red).
       - Extracts STRICT trainedWords from CivitAI (NEVER tags, NEVER fake words).
       - If CivitAI has no trigger words (e.g. sliders), returns empty trainedWords [].
       - Overwrites .civitai.info cache so corrupted cache is repaired.
    """
    path = get_lora_full_path(name)
    if not path:
        return {
            "ok": False,
            "error": f"LoRA file not found on disk: {name}",
            "name": name,
            "trainedWords": [],
            "hasTriggers": False,
            "source": "missing",
        }

    # 1. Local Cache Check (if not forcing online refresh)
    if not force_online:
        for candidate in _cache_candidates(path):
            if not os.path.isfile(candidate):
                continue
            data = _read_json(candidate)
            if data:
                words = _clean_word_list(data.get("trainedWords"))
                images = data.get("images", []) if isinstance(data.get("images"), list) else []
                return {
                    "ok": True,
                    "name": name,
                    "path": path,
                    "trainedWords": words,
                    "hasTriggers": bool(words),
                    "images": images if allow_nsfw else [],
                    "modelId": data.get("modelId"),
                    "modelVersionId": data.get("modelVersionId"),
                    "source": "cache",
                    "cachedAt": os.path.getmtime(candidate),
                }

    # Read safetensors header early for hashes / AIR
    embedded = _inspect_safetensors_header(path)

    # 2. Compute Hashes
    try:
        hashes = compute_file_hashes(path)
    except Exception as exc:
        return {
            "ok": False,
            "error": f"Failed to compute file hash: {exc}",
            "name": name,
            "trainedWords": [],
            "hasTriggers": False,
            "source": "error",
        }

    # 3. Query CivitAI (.com and .red)
    primary_host = "https://civitai.red" if site_mode == "Unrestricted" else "https://civitai.com"
    backup_host = "https://civitai.com" if primary_host == "https://civitai.red" else "https://civitai.red"
    hosts = [primary_host, backup_host]

    # Collect hash candidates: AutoV2 (10 chars), full SHA256, plus any header hashes
    hash_candidates = [hashes["autov2"], hashes["sha256"]]
    for k in ("sshs_model_hash", "sshs_legacy_hash", "civitai_hash"):
        h_val = embedded.get(k)
        if h_val and isinstance(h_val, str) and h_val.strip() and h_val not in hash_candidates:
            hash_candidates.append(h_val.strip())

    civitai_payload = None
    successful_url = ""
    last_error = None

    for h in hash_candidates:
        for host in hosts:
            url = f"{host}/api/v1/model-versions/by-hash/{h}"
            try:
                res = _api_get(url, api_key=api_key, timeout=9)
                if isinstance(res, dict) and (res.get("id") or res.get("modelId")):
                    civitai_payload = res
                    successful_url = url
                    break
            except urllib.error.HTTPError as he:
                if he.code == 404:
                    continue
                last_error = f"CivitAI HTTP {he.code}"
            except Exception as e:
                last_error = str(e)
        if civitai_payload:
            break

    # If hash lookup failed, check if header has modelVersionId or AIR (civitai:modelId@versionId)
    if not civitai_payload and embedded.get("air"):
        air = str(embedded.get("air"))
        # Parse version ID after @
        m = re.search(r"@(\d+)", air)
        if m:
            v_id = m.group(1)
            for host in hosts:
                url = f"{host}/api/v1/model-versions/{v_id}"
                try:
                    res = _api_get(url, api_key=api_key, timeout=9)
                    if isinstance(res, dict) and (res.get("id") or res.get("modelId")):
                        civitai_payload = res
                        successful_url = url
                        break
                except Exception:
                    pass

    # 4. Process CivitAI Response
    if civitai_payload:
        raw_words = civitai_payload.get("trainedWords")
        words = _clean_word_list(raw_words)

        # If this exact version has no trainedWords, check other versions of the same model
        model_id = civitai_payload.get("modelId")
        if not words and model_id:
            parent_words = _query_parent_model_versions(model_id, primary_host=primary_host, api_key=api_key)
            if parent_words:
                words = parent_words

        # Extract sample preview images
        images = []
        if isinstance(civitai_payload.get("images"), list):
            for img in civitai_payload["images"]:
                if isinstance(img, dict) and img.get("url"):
                    images.append(img["url"])

        # Write clean cache to disk (this overwrites any previously poisoned cache files!)
        cache_data = {
            "trainedWords": words,
            "hasTriggers": bool(words),
            "images": images,
            "modelId": model_id,
            "modelVersionId": civitai_payload.get("id"),
            "modelName": civitai_payload.get("name"),
            "source": "civitai",
            "sourceUrl": successful_url,
            "retrievedAt": int(time.time()),
        }
        cache_path = Path(path).with_suffix(".civitai.info")
        _write_json(cache_path, cache_data)

        msg = (
            f"Retrieved {len(words)} trigger word(s) from CivitAI."
            if words
            else "Model found on CivitAI, but it has no trigger words registered."
        )

        return {
            "ok": True,
            "name": name,
            "path": path,
            "trainedWords": words,
            "hasTriggers": bool(words),
            "images": images if allow_nsfw else [],
            "modelId": model_id,
            "modelVersionId": civitai_payload.get("id"),
            "source": "civitai",
            "message": msg,
        }

    # 5. Offline Fallback: Check Safetensors Header for explicit ss_trigger_words
    embedded_words = _extract_local_trigger_words(embedded)
    if embedded_words:
        return {
            "ok": True,
            "name": name,
            "path": path,
            "trainedWords": embedded_words,
            "hasTriggers": True,
            "images": [],
            "source": "safetensors",
            "message": f"Found {len(embedded_words)} trigger word(s) embedded in safetensors header.",
        }

    # 6. Model Not Found
    return {
        "ok": False,
        "name": name,
        "path": path,
        "trainedWords": [],
        "hasTriggers": False,
        "images": [],
        "source": "offline",
        "error": last_error or "LoRA not found on CivitAI (.com / .red).",
    }


def register_routes():
    """Register centralized API routes for Civitai Trigger Retrieval."""
    try:
        import server
        from aiohttp import web
        routes = server.PromptServer.instance.routes

        async def _handle_retrieve(request):
            try:
                payload = await request.json()
            except Exception:
                payload = {}
            result = inspect_lora_metadata(
                payload.get("name", ""),
                api_key=payload.get("apiKey") or None,
                force_online=bool(payload.get("forceOnline")),
                allow_nsfw=bool(payload.get("allowNsfw", True)),
                site_mode=payload.get("siteMode", "Standard"),
            )
            return web.json_response(result)

        # 1. Centralized dedicated route
        routes.post("/ds/civitai/retrieve")(_handle_retrieve)
        # 2. Backward compatibility route
        routes.post("/ds/lora_metadata")(_handle_retrieve)

        print("[DeathshotArsenal] Civitai Retriever routes registered (/ds/civitai/retrieve, /ds/lora_metadata)")
        return True
    except Exception as exc:
        print(f"[DeathshotArsenal] Civitai route registration notice: {exc}")
        return False
