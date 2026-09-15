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


def _extract_api_data(payload):
    if not isinstance(payload, dict):
        return {"trainedWords": [], "images": []}
    return {
        "trainedWords": [str(x) for x in payload.get("trainedWords", []) if str(x).strip()],
        "images": [
            img.get("url")
            for img in payload.get("images", [])
            if isinstance(img, dict) and img.get("url")
        ],
        "modelId": payload.get("modelId"),
        "modelVersionId": payload.get("id"),
        "raw": payload,
    }


def inspect_lora_metadata(name, api_key=None, force_online=False, allow_nsfw=True, site_mode="Standard"):
    path = get_lora_full_path(name)
    if not path:
        return {"ok": False, "error": "LoRA file not found.", "name": name, "trainedWords": [], "source": "missing"}

    # Local cache first.
    if not force_online:
        for candidate in _cache_candidates(path):
            data = _read_json(candidate)
            if data:
                words = _extract_local_trigger_words(data)
                return {
                    "ok": True,
                    "name": name,
                    "path": path,
                    "trainedWords": words,
                    "images": data.get("images", []) if isinstance(data.get("images"), list) else [],
                    "source": "cache",
                    "cachedAt": os.path.getmtime(candidate),
                }

    embedded = _inspect_safetensors_header(path)
    embedded_words = _extract_local_trigger_words(embedded)
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
    for url in urls:
        try:
            payload = _api_get(url, api_key=api_key)
            parsed = _extract_api_data(payload)
            if not allow_nsfw and isinstance(parsed.get("raw"), dict):
                parsed["images"] = []
            cache_data = {
                "trainedWords": parsed["trainedWords"],
                "images": parsed["images"],
                "modelId": parsed.get("modelId"),
                "modelVersionId": parsed.get("modelVersionId"),
                "sourceUrl": url,
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
                "sourceUrl": url,
            }
        except Exception as exc:
            last_error = str(exc)

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
