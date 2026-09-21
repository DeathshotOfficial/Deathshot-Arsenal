# DS Gallery — Documentation

## 1. Overview

**Node Name:** `DS Gallery`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_Gallery`  
**Purpose:** Comprehensive in-canvas media viewer, asset manager, and gallery browser for ComfyUI. Displays images and videos in a fast thumbnail grid directly on the node face, featuring fullscreen lightbox viewing with zoom/pan, integrated video player, search/filtering, file sorting, deletion, and local NSFW blur protection.

---

## 2. Core Capabilities

- **Direct In-Canvas Media Grid:**
  - Fast thumbnail grid rendering outputs or custom disk directories directly inside the LiteGraph node body.
  - Smooth infinite scrolling and dynamic tile sizing.
- **Fullscreen Lightbox Viewer:**
  - High-resolution modal lightbox with smooth wheel zoom, click-and-drag panning, and 1:1 pixel inspection.
  - Next/previous keyboard navigation (`ArrowRight` / `ArrowLeft`).
- **Integrated Video Player:** Custom HTML5 video player with playback scrub bar, duration/timecode indicators, looping, and volume control.
- **Search & Multi-Criteria Filtering:**
  - Filter by media type (`Images`, `Videos`, `All`).
  - Search by filename pattern or date.
  - Sort by date modified, name, dimensions, or file size.
- **File Management Actions:**
  - One-click file deletion with confirmation to clean failed renders.
  - Copy file path or direct image export to clipboard.
- **Local NSFW Shield Integration:** Hooks into Deathshot's local ViT/NudeNet detectors to selectively blur sensitive media in the gallery grid.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `folder_path` | `STRING` | No | Optional external disk directory path to display. If omitted, defaults to ComfyUI's output folder. |

### Outputs

*Terminal Visualization Node (`OUTPUT_NODE = True`).*

---

## 4. Workflows & Best Practices

1. **Dedicated Output Dashboard:** Place `DS Gallery` on a dedicated canvas section or side monitor to browse generated outputs, compare multi-generation batches, and review videos without leaving ComfyUI.
