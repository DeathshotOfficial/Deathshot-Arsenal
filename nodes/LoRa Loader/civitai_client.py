# DS LoRa Loader — Civitai metadata / hashing helpers
import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import folder_paths


def get_lora_full_path(name):
    if not name:
        return None
    try:
        return folder_paths.get_full_path("loras", name)
    except Exception:
        return None


def _cache_candidates(path):
    p = Path(path)
    return [
        p.with_name(p.name + ".civitai.info"),
        p.with_suffix(p.suffix + ".civitai.info"),
        p.with_suffix(".civitai.info"),
        p.with_suffix(".json"),
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


def full_sha256(path, chunk=1024 * 1024):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def autov2_hash(path):
    size = os.path.getsize(path)
    h = hashlib.sha256()
    h.update(str(size).encode("utf-8"))
    with open(path, "rb") as f:
        h.update(f.read(65536))
    return h.hexdigest()


def _extract_local_trigger_words(data):
    if not isinstance(data, dict):
        return []

    result = []
    # Civitai/API style payload.
    trained = data.get("trainedWords")
    if isinstance(trained, list):
        result.extend(str(x) for x in trained if str(x).strip())

    # Common safetensors training metadata.
    meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else data
    for key in ("ss_trigger_words", "trigger_words"):
        val = meta.get(key) if isinstance(meta, dict) else None
        if isinstance(val, list):
            for x in val:
                if isinstance(x, str) and x.strip():
                    result.append(x.strip())
        elif isinstance(val, str) and val.strip():
            try:
                parsed = json.loads(val)
                if isinstance(parsed, list):
                    result.extend(str(x) for x in parsed if str(x).strip())
                else:
                    result.extend([x.strip() for x in val.split(",") if x.strip()])
            except Exception:
                result.extend([x.strip() for x in val.split(",") if x.strip()])

    # Fooocus / training frequency maps.
    freq = meta.get("ss_tag_frequency") if isinstance(meta, dict) else None
    if isinstance(freq, str):
        try:
            freq = json.loads(freq)
        except Exception:
            freq = None
    if isinstance(freq, dict):
        for bucket in freq.values():
            if isinstance(bucket, dict):
                result.extend(str(x) for x in bucket.keys() if str(x).strip())

    seen = set()
    out = []
    for x in result:
        k = x.casefold()
        if k not in seen:
            seen.add(k)
            out.append(x)
    return out


def _inspect_safetensors_header(path):
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


def _api_get(url, api_key=None, timeout=8):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "DeathshotArsenal-DS-LoRa-Loader/1.0",
            **({"Authorization": f"Bearer {api_key}"} if api_key else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _clean_word_list(value):
    """Normalize the different trigger-word containers returned by Civitai."""
    if value is None:
        return []
    if isinstance(value, str):
        # Civitai normally returns a list, but some cached/legacy payloads can
        # contain a comma-separated string.
        return [x.strip() for x in value.split(",") if x.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(x).strip() for x in value if str(x).strip()]
    return []


def _extract_triggers_from_text(text):
    """Regex parser to detect trigger/activation words mentioned in HTML descriptions."""
    if not text or not isinstance(text, str):
        return []
    import re
    # Remove HTML tags while preserving spaces
    clean = re.sub(r"<[^>]+>", " ", text)
    patterns = [
        r"(?:trigger\s*words?|trigger\s*word|activation\s*words?|activation\s*tag|activation\s*keyword|triggers?)\s*[:=\-–—]\s*([a-zA-Z0-9_\-,\s/]+)",
        r"(?:use\s*keyword|activation\s*phrase)\s*[:=\-–—]\s*([a-zA-Z0-9_\-,\s/]+)",
    ]
    found = []
    for pat in patterns:
        for match in re.findall(pat, clean, re.IGNORECASE):
            parts = re.split(r"[,/\n]", match)
            for p in parts:
                item = p.strip()
                if item and len(item) < 50 and not any(bad in item.lower() for bad in ["http", "patreon", "civitai", "model", "download"]):
                    found.append(item)
    return found


def _fetch_parent_model_triggers(model_id, primary_host="https://civitai.com", api_key=None):
    """Fetch parent model to recover triggers from other versions, descriptions, or tags."""
    if not model_id:
        return {"trainedWords": [], "images": []}
    words = []
    images = []
    urls = [
        f"{primary_host}/api/v1/models/{model_id}",
    ]
    alt_host = "https://civitai.red" if "civitai.com" in primary_host else "https://civitai.com"
    urls.append(f"{alt_host}/api/v1/models/{model_id}")

    for url in urls:
        try:
            model_data = _api_get(url, api_key=api_key, timeout=8)
            if not isinstance(model_data, dict):
                continue

            # 1. Search all model versions (many creators only set triggers on v1.0)
            versions = model_data.get("modelVersions")
            if isinstance(versions, list):
                for v in versions:
                    if isinstance(v, dict):
                        tw = v.get("trainedWords")
                        words.extend(_clean_word_list(tw))
                        # Also collect sample images if available
                        if not images and isinstance(v.get("images"), list):
                            for img in v["images"]:
                                if isinstance(img, dict) and img.get("url"):
                                    images.append(img["url"])

            # 2. Check model description and version descriptions for trigger regex
            if not words:
                desc = model_data.get("description", "")
                words.extend(_extract_triggers_from_text(desc))
                if isinstance(versions, list):
                    for v in versions:
                        if isinstance(v, dict):
                            words.extend(_extract_triggers_from_text(v.get("description", "")))

            # 3. Fallback to tags if triggers are still empty
            if not words and isinstance(model_data.get("tags"), list):
                tags = [str(t).strip() for t in model_data["tags"] if str(t).strip()]
                # Keep top 12 relevant tags as fallback prompt words
                words.extend(tags[:12])

            if words or images:
                break
        except Exception:
            pass

    # Deduplicate preserving order
    seen = set()
    trained_words = []
    for w in words:
        k = w.casefold()
        if k not in seen:
            seen.add(k)
            trained_words.append(w)

    return {"trainedWords": trained_words, "images": images}


def _extract_api_data(payload, primary_host="https://civitai.com", api_key=None):
    if not isinstance(payload, dict):
        return {"trainedWords": [], "images": []}

    words = []

    def add(value):
        words.extend(_clean_word_list(value))

    # Current Civitai model-version responses expose trainedWords at the top level
    add(payload.get("trainedWords"))

    # Check nested version collections
    for key in ("modelVersions", "versions"):
        versions = payload.get(key)
        if isinstance(versions, list):
            for version in versions:
                if isinstance(version, dict):
                    add(version.get("trainedWords"))

    model = payload.get("model")
    if isinstance(model, dict):
        add(model.get("trainedWords"))

    model_id = payload.get("modelId")
    images = [
        img.get("url")
        for img in payload.get("images", [])
        if isinstance(img, dict) and img.get("url")
    ]

    # If the version has no trainedWords, query parent model on CivitAI
    if not words and model_id:
        parent_meta = _fetch_parent_model_triggers(model_id, primary_host=primary_host, api_key=api_key)
        words.extend(parent_meta["trainedWords"])
        if not images:
            images.extend(parent_meta["images"])

    # Deduplicate while preserving Civitai order.
    seen = set()
    trained_words = []
    for word in words:
        k = word.casefold()
        if k not in seen:
            seen.add(k)
            trained_words.append(word)

    return {
        "trainedWords": trained_words,
        "images": images,
        "modelId": model_id,
        "modelVersionId": payload.get("id"),
        "raw": payload,
    }


def inspect_lora_metadata(name, api_key=None, force_online=False, allow_nsfw=True, site_mode="Standard"):
    import urllib.parse
    import re
    path = get_lora_full_path(name)
    if not path:
        return {"ok": False, "error": "LoRA file not found.", "name": name, "trainedWords": [], "source": "missing"}

    embedded = _inspect_safetensors_header(path)
    embedded_words = _extract_local_trigger_words(embedded)

    # Local cache check
    if not force_online:
        for candidate in _cache_candidates(path):
            data = _read_json(candidate)
            if data:
                words = _extract_local_trigger_words(data)
                # If cache has trigger words, return immediately
                if words:
                    return {
                        "ok": True,
                        "name": name,
                        "path": path,
                        "trainedWords": words,
                        "images": data.get("images", []) if isinstance(data.get("images"), list) else [],
                        "source": "cache",
                        "cachedAt": os.path.getmtime(candidate),
                    }
                # If cache has no trigger words, but embedded safetensors does, use embedded
                if embedded_words:
                    return {
                        "ok": True,
                        "name": name,
                        "path": path,
                        "trainedWords": embedded_words,
                        "images": data.get("images", []) if isinstance(data.get("images"), list) else [],
                        "source": "safetensors",
                    }

    if embedded_words and not force_online:
        return {
            "ok": True,
            "name": name,
            "path": path,
            "trainedWords": embedded_words,
            "images": [],
            "source": "safetensors",
        }

    # Online lookup by full SHA256, then AutoV2 as fallback.
    urls = []
    primary_host = "https://civitai.com" if site_mode != "Unrestricted" else "https://civitai.red"
    backup_host = "https://civitai.red" if primary_host.endswith(".com") else "https://civitai.com"
    hashes = []
    try:
        hashes.append(full_sha256(path))
    except Exception:
        pass
    try:
        hv2 = autov2_hash(path)
        if hv2 not in hashes:
            hashes.append(hv2)
    except Exception:
        pass
    for hv in hashes:
        urls.append(f"{primary_host}/api/v1/model-versions/by-hash/{hv}")
        urls.append(f"{backup_host}/api/v1/model-versions/by-hash/{hv}")

    last_error = None
    parsed = None
    for url in urls:
        try:
            payload = _api_get(url, api_key=api_key)
            parsed = _extract_api_data(payload, primary_host=primary_host, api_key=api_key)
            if parsed:
                break
        except Exception as exc:
            last_error = str(exc)

    # Search Fallback: If hash lookup failed (e.g. pruned/re-saved model), search by model stem name
    if not parsed or (not parsed.get("trainedWords") and not parsed.get("modelId")):
        stem = Path(path).stem
        clean_query = re.sub(r"([_\-\.]v\d+.*|\.safetensors$|\.pt$|[-_])", " ", stem).strip()
        if clean_query and len(clean_query) >= 3:
            search_urls = [
                f"{primary_host}/api/v1/models?query={urllib.parse.quote(clean_query)}&types=LORA&limit=3",
                f"{backup_host}/api/v1/models?query={urllib.parse.quote(clean_query)}&types=LORA&limit=3",
            ]
            for s_url in search_urls:
                try:
                    s_data = _api_get(s_url, api_key=api_key, timeout=6)
                    items = s_data.get("items", []) if isinstance(s_data, dict) else []
                    if items and isinstance(items[0], dict):
                        best_model = items[0]
                        m_id = best_model.get("id")
                        if m_id:
                            parent_meta = _fetch_parent_model_triggers(m_id, primary_host=primary_host, api_key=api_key)
                            parsed = {
                                "trainedWords": parent_meta["trainedWords"],
                                "images": parent_meta["images"],
                                "modelId": m_id,
                                "modelVersionId": None,
                                "raw": best_model,
                            }
                            break
                except Exception as exc:
                    last_error = str(exc)

    if parsed:
        if not parsed["trainedWords"] and embedded_words:
            parsed["trainedWords"] = list(embedded_words)

        if not allow_nsfw and isinstance(parsed.get("raw"), dict):
            parsed["images"] = []
        cache_data = {
            "trainedWords": parsed["trainedWords"],
            "images": parsed["images"],
            "modelId": parsed.get("modelId"),
            "modelVersionId": parsed.get("modelVersionId"),
            "sourceUrl": urls[0] if urls else "",
        }
        cache_path = Path(path).with_suffix(".civitai.info")
        _write_json(cache_path, cache_data)
        return {
            "ok": True,
            "name": name,
            "path": path,
            "trainedWords": parsed["trainedWords"],
            "images": parsed["images"],
            "source": "civitai",
            "modelId": parsed.get("modelId"),
        }

    # Graceful offline fallback.
    return {
        "ok": bool(embedded_words),
        "name": name,
        "path": path,
        "trainedWords": embedded_words,
        "images": [],
        "source": "offline",
        "error": last_error or "No metadata available.",
    }


def register_routes():
    try:
        import server
        from aiohttp import web
        routes = server.PromptServer.instance.routes

        @routes.post("/ds/lora_metadata")
        async def _ds_lora_metadata(request):
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

        return True
    except Exception as exc:
        print(f"[DS LoRa Loader] metadata route registration failed: {exc}")
        return False
