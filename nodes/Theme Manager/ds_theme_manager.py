"""
DS Theme Manager - Global Appearance Manager
DeathshotArsenal

Pure UI configuration node. No inputs, no outputs, no workflow execution.
Manages global theme, font, and font-size for all DeathshotArsenal nodes.
"""

import os
import json
import re
import hashlib
import urllib.request
import urllib.error

import server
from aiohttp import web

# ------------------------------------------------------------------
# PATHS
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_PACK_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
CONFIG_DIR = os.path.join(_PACK_ROOT, "config")
FONTS_DIR = os.path.join(_PACK_ROOT, "fonts")
THEMES_FILE = os.path.join(_PACK_ROOT, "js", "themes", "themes.json")
APPEARANCE_FILE = os.path.join(CONFIG_DIR, "appearance.json")

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)

DEFAULT_CONFIG = {
    "theme": "deathshot_dark",
    "font": "Inter",
    "fontSize": 14,
    "downloadedFonts": [],
    "custom": {},
}


def _load_json(path, fallback):
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[DS Theme Manager] Failed to load {path}: {e}")
        return fallback


def _save_json(path, data):
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
        return True
    except Exception as e:
        print(f"[DS Theme Manager] Failed to save {path}: {e}")
        return False


def load_appearance():
    cfg = _load_json(APPEARANCE_FILE, {})
    merged = {**DEFAULT_CONFIG, **cfg}
    if not isinstance(merged.get("downloadedFonts"), list):
        merged["downloadedFonts"] = []
    if not isinstance(merged.get("custom"), dict):
        merged["custom"] = {}
    return merged


def save_appearance(cfg):
    cleaned = {
        "theme": str(cfg.get("theme", DEFAULT_CONFIG["theme"])),
        "font": str(cfg.get("font", DEFAULT_CONFIG["font"])),
        "fontSize": int(cfg.get("fontSize", DEFAULT_CONFIG["fontSize"])),
        "downloadedFonts": list(cfg.get("downloadedFonts") or []),
        "custom": dict(cfg.get("custom") or {}),
    }
    cleaned["fontSize"] = max(10, min(24, cleaned["fontSize"]))
    return _save_json(APPEARANCE_FILE, cleaned)


def _font_family_to_google_param(name):
    return re.sub(r"\s+", "+", name.strip())


def _safe_font_filename(name):
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip().lower()).strip("_")
    return slug or "font"


def _download_google_font(font_name):
    """
    Download a Google Font and store woff2 files locally.
    Returns dict with success status and metadata.
    """
    family = font_name.strip()
    if not family or len(family) > 80:
        return {"success": False, "error": "Invalid font name"}

    slug = _safe_font_filename(family)
    family_param = _font_family_to_google_param(family)
    css_url = (
        f"https://fonts.googleapis.com/css2?"
        f"family={family_param}:wght@300;400;500;600;700&display=swap"
    )

    req = urllib.request.Request(
        css_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            css_text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"success": False, "error": f"Font '{family}' not found on Google Fonts"}
        return {"success": False, "error": f"Google Fonts HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"success": False, "error": f"Network error: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

    if "No fonts matched" in css_text or "@font-face" not in css_text:
        return {"success": False, "error": f"Font '{family}' not found or unsupported"}

    font_dir = os.path.join(FONTS_DIR, slug)
    os.makedirs(font_dir, exist_ok=True)

    downloaded_files = []
    font_face_rules = []

    for block in re.findall(r"@font-face\s*\{[^}]+\}", css_text, flags=re.DOTALL):
        url_match = re.search(r"url\((https?://[^)]+)\)", block)
        if not url_match:
            continue
        remote_url = url_match.group(1)
        weight_match = re.search(r"font-weight:\s*(\d+)", block)
        style_match = re.search(r"font-style:\s*(\w+)", block)
        weight = weight_match.group(1) if weight_match else "400"
        style = style_match.group(1) if style_match else "normal"

        file_hash = hashlib.md5(remote_url.encode()).hexdigest()[:10]
        filename = f"{slug}-{weight}-{style}-{file_hash}.woff2"
        local_path = os.path.join(font_dir, filename)

        if not os.path.exists(local_path):
            try:
                f_req = urllib.request.Request(remote_url, headers=req.headers)
                with urllib.request.urlopen(f_req, timeout=60) as f_resp:
                    data = f_resp.read()
                with open(local_path, "wb") as f:
                    f.write(data)
            except Exception as e:
                return {"success": False, "error": f"Failed to download font file: {e}"}

        rel_path = f"/extensions/DeathshotArsenal/fonts/{slug}/{filename}"
        local_rule = re.sub(
            r"url\([^)]+\)",
            f"url('{rel_path}')",
            block,
        )
        font_face_rules.append(local_rule)
        downloaded_files.append({"file": filename, "weight": weight, "style": style})

    if not downloaded_files:
        return {"success": False, "error": "No font files could be downloaded"}

    css_local_path = os.path.join(font_dir, "font.css")
    with open(css_local_path, "w", encoding="utf-8") as f:
        f.write("\n".join(font_face_rules))

    meta = {
        "name": family,
        "slug": slug,
        "cssPath": f"/extensions/DeathshotArsenal/fonts/{slug}/font.css",
        "files": downloaded_files,
    }
    return {"success": True, "font": meta}


# ------------------------------------------------------------------
# API ROUTES
# ------------------------------------------------------------------
@server.PromptServer.instance.routes.get("/ds/theme/config")
async def theme_get_config(_request):
    return web.json_response({"config": load_appearance()})


@server.PromptServer.instance.routes.post("/ds/theme/config")
async def theme_save_config(request):
    try:
        payload = await request.json()
        cfg = payload.get("config", payload)
        if not isinstance(cfg, dict):
            return web.json_response({"error": "config must be an object"}, status=400)
        current = load_appearance()
        merged = {**current, **cfg}
        ok = save_appearance(merged)
        return web.json_response({"success": ok, "config": load_appearance()})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/ds/theme/themes")
async def theme_get_themes(_request):
    themes = _load_json(THEMES_FILE, {"themes": {}})
    return web.json_response(themes)


@server.PromptServer.instance.routes.post("/ds/theme/download-font")
async def theme_download_font(request):
    try:
        payload = await request.json()
        font_name = str(payload.get("font", "")).strip()
        if not font_name:
            return web.json_response({"error": "font name required"}, status=400)

        result = _download_google_font(font_name)
        if not result.get("success"):
            return web.json_response(result, status=400)

        cfg = load_appearance()
        fonts = cfg.get("downloadedFonts", [])
        existing = next((f for f in fonts if f.get("name", "").lower() == font_name.lower()), None)
        if existing:
            existing.update(result["font"])
        else:
            fonts.append(result["font"])
        cfg["downloadedFonts"] = fonts
        cfg["font"] = font_name
        save_appearance(cfg)

        return web.json_response({
            "success": True,
            "font": result["font"],
            "config": load_appearance(),
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/ds/theme/font-presets")
async def theme_font_presets(_request):
    presets = [
        "Inter", "Roboto", "Open Sans", "Poppins", "Montserrat", "Lato", "Nunito",
        "Ubuntu", "JetBrains Mono", "Fira Code", "Source Sans 3", "Source Code Pro",
        "Noto Sans", "Noto Serif", "IBM Plex Sans", "IBM Plex Mono", "Merriweather",
        "Playfair Display", "Raleway", "Work Sans", "Quicksand", "Cabin", "Exo",
        "Orbitron", "Bebas Neue", "Oswald", "Inconsolata", "Rubik", "Outfit", "Manrope",
    ]
    return web.json_response({"presets": presets})


# ------------------------------------------------------------------
# COMFY NODE (UI only — never executes)
# ------------------------------------------------------------------
class DS_ThemeManager:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/🎨 UI"

    def noop(self):
        return ()