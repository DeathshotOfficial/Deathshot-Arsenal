"""
DS Prompt Cards - Modern Pose / Reference Prompt Card Library
DeathshotArsenal

A clean, resizable inline node for storing image + prompt pairs.
Designed specifically for I2V / video generation workflows.

- No inputs, no outputs, no ComfyUI string fields
- Grid or List view + S / M / L preview sizes (big readable previews by default)
- Proper scrolling body (cards no longer squish when you add many)
- Detail modal for large preview + full prompt editing
- Image previews that respect aspect ratio (contain)
- Auto-saving prompt textarea
- Copy / Duplicate / Delete / Pin + Export/Import library (JSON)
- Drag to reorder + move buttons
- Pinned filter + search
- Modern inline SVG icons
- Generous default size + strong min-size guard

Persistence:
- Data is saved to custom_nodes/DeathshotArsenal/cards/cards.json on disk.
- Survives node recreation, "Fix node", delete + re-add, Comfy restarts.
- All "DS Prompt Cards" nodes share the same library.
"""

import os
import json
import uuid

import server
from aiohttp import web

# ------------------------------------------------------------------
# STORAGE (global library - survives node delete/recreate)
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_PACK_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
CARDS_DIR = os.path.join(_PACK_ROOT, "cards")
CARDS_FILE = os.path.join(CARDS_DIR, "cards.json")

os.makedirs(CARDS_DIR, exist_ok=True)


def load_cards():
    """Load cards from disk. Returns [] on any problem."""
    if not os.path.exists(CARDS_FILE):
        return []
    try:
        with open(CARDS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            # Light normalization
            for c in data:
                c.setdefault("id", str(uuid.uuid4()))
                c.setdefault("prompt", "")
                c.setdefault("image", None)
                c["type"] = "video" if c.get("type") == "video" else "image"
                c.setdefault("pinned", False)
                c.setdefault("ts", 0)
            return data
        return []
    except Exception as e:
        print(f"[DS Prompt Cards] Failed to load cards: {e}")
        return []


def save_cards(cards):
    """Atomic save of the cards list."""
    try:
        # Keep only what we need
        cleaned = []
        for c in cards:
            if not isinstance(c, dict):
                continue
            cleaned.append({
                "id": str(c.get("id") or str(uuid.uuid4())),
                "prompt": str(c.get("prompt", "")),
                "image": c.get("image"),   # data URL or None
                "type": "video" if c.get("type") == "video" else "image",
                "pinned": bool(c.get("pinned", False)),
                "ts": int(c.get("ts") or 0),
            })
        tmp = CARDS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cleaned, f, indent=2, ensure_ascii=False)
        os.replace(tmp, CARDS_FILE)
        return True
    except Exception as e:
        print(f"[DS Prompt Cards] Failed to save cards: {e}")
        return False


# ------------------------------------------------------------------
# API (used by the node frontend)
# ------------------------------------------------------------------
@server.PromptServer.instance.routes.get("/ds/promptcards/cards")
async def promptcards_get(_request):
    return web.json_response({"cards": load_cards()})


@server.PromptServer.instance.routes.post("/ds/promptcards/cards")
async def promptcards_post(request):
    try:
        payload = await request.json()
        cards = payload.get("cards", [])
        if not isinstance(cards, list):
            return web.json_response({"error": "cards must be a list"}, status=400)
        ok = save_cards(cards)
        return web.json_response({"success": ok, "count": len(cards)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ------------------------------------------------------------------
# COMFY NODE (UI only)
# ------------------------------------------------------------------
class DS_PromptCards:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "cards_state": ("STRING", {"default": "{}"}),  # tiny UI-state only; card library stays on disk
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/✍️ Prompt"
    OUTPUT_NODE = True

    def noop(self, cards_state="{}"):
        return {}
