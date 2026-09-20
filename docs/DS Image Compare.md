# DS Image Compare — Documentation

## 1. Overview

**Node Name:** `DS Image Compare`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_ImageCompare`  
**Purpose:** Real-time in-canvas visual comparison node for ComfyUI. Features an interactive split-slider comparison tool with integrated top-lane resolution metrics, megapixel differential analysis, continuous pointer tracking, and persistent multi-tab session state.

`DS Image Compare` is engineered for detailed pixel inspection between any two image stages (e.g. Original vs Upscaled, Denoised vs Raw, Prompt A vs Prompt B, Color Graded vs Flat).

---

## 2. Core Capabilities

- **Interactive Split Slider:** Smooth canvas-rendered vertical divider with a custom circular handle (puck) and theme-accent chevrons (`‹ ›`).
- **Continuous Global Drag Tracking:** Pointer capture remains active even when dragging outside the node boundaries or across canvas borders, tracking seamlessly from `0%` to `100%`.
- **Center Auto-Snap:** Automatically springs back to a clean `50/50` center split upon release using a smooth cubic ease-out animation.
- **Top-Lane Resolution HUD:** Built directly into the top socket lane (vertically centered with input sockets at `8px` symmetrical margin) to display:
  - Exact pixel dimensions for both images (`W × H`).
  - Megapixel count (`X.XX MP`).
  - Center comparison badge:
    - `1:1 MATCH` (Identical width and height).
    - `SAME MP` (Identical total pixel area with different aspect ratios).
    - `◀ +X%` / `+X% ▶` (Shows which image is larger and by what percentage).
    - `NO INPUT` (When neither socket is connected).
- **Persistent Multi-Tab Session State:**
  - Automatically caches image references and dimensions in `node.properties` and in-memory session caches.
  - Switching between workflow tabs in ComfyUI preserves the active comparison without blanking out or resetting to `NO INPUT`.
  - Switching back immediately restores both images synchronously with zero loading delay.
- **Single-Image Fallback:** If only `image_a` or `image_b` is connected, the node cleanly renders the single available image without errors or broken split lines.
- **Universal Corner Badges:** High-contrast `[● A]` and `[● B]` badges in the top corners smoothly fade out as the slider approaches their boundary, preventing visual clutter while maintaining clear channel identity.
- **Theme-Aware Styling:** Dynamically reads and adapts to `DSGlobalTheme` colors, border styles, text contrast variables, and custom accent highlights.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image_a` | `IMAGE` | No | Left-side baseline image tensor `[B, H, W, C]`. |
| `image_b` | `IMAGE` | No | Right-side comparison image tensor `[B, H, W, C]`. |

### Outputs

*None (Terminal output / visualization node).*

> [!NOTE]
> Both input sockets are optional. Connecting only one input displays that image across the full canvas. When both sockets are connected, the split slider and HUD comparison metrics activate automatically.

---

## 4. UI Layout & Visual Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│ DS Image Compare                                            │
├─────────────────────────────────────────────────────────────┤
│ (●) image_a  ┌────────────────────────────────────────────┐ │
│ (●) image_b  │  IMAGE A       1:1 MATCH       IMAGE B     │ │
│              │ 1024×1536                      1024×1536   │ │
│              │  1.57 MP                        1.57 MP    │ │
│              └────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [● A]                                               [● B]   │
│                      │                                      │
│                      │                                      │
│        Image A       │(‹ ›)           Image B               │
│                      │                                      │
│                      │                                      │
└─────────────────────────────────────────────────────────────┘
```

1. **Top HUD Plate:**
   - Positioned cleanly to the right of the input sockets with dynamic text-width clearance.
   - Highlights the higher-resolution channel with an upward arrow (`▲`) and theme accent coloring.
2. **Comparison Slider & Puck:**
   - Circular puck with subtle drop shadow and theme-accent border.
   - Displays a floating percentage pill tooltip while actively dragging (e.g. `63%`).
3. **Corner Badges:**
   - Top-left `[● A]` and top-right `[● B]` pills indicate visible sides.
   - Opacity automatically adjusts dynamically based on the slider position.

---

## 5. Session Persistence Architecture

To guarantee that comparison images are never lost when navigating between workflow tabs in ComfyUI:

1. **Multi-Layer State Storage:**
   - Execution results (`compare_images` info and `dims`) are stored in `node.properties.ds_cmp_a` and `node.properties.ds_cmp_b`.
   - ComfyUI preserves `node.properties` across open tab instances in memory.
2. **In-Memory Image Element Cache:**
   - Loaded `HTMLImageElement` instances are retained in a session-level map keyed by unique temp filenames (`cmp_<id>_a_*.webp`).
   - Returning to a workflow tab triggers `onConfigure`, which synchronously re-binds cached image elements with zero network latency.
3. **Fallback Re-Fetch:**
   - If images are not yet decoded or if the page was hard-refreshed, `onConfigure` automatically re-requests preview images from `/view` and renders them as soon as they resolve.

---

## 6. Technical Details

- **Backend Route:** Standard ComfyUI `/view` endpoint serving lightweight native WebP preview files (`quality=92, method=2`) generated in under 15ms.
- **Custom UI Key:** Uses `compare_images` in node execution results to bypass ComfyUI's default image preview popup overlay.
- **Execution Event Listener:** Subscribes to `api.addEventListener("executed")` in addition to `nodeType.prototype.onExecuted` for universal compatibility across all ComfyUI frontend versions.
