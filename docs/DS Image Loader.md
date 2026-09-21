# DS Image Loader — Documentation

## 1. Overview

**Node Name:** `DS Image Loader`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_ImageLoader`  
**Purpose:** Native-style compact image ingestion node providing drag-and-drop, clipboard pasting, interactive thumbnail viewing, multi-frame sequence batching, and focused inline resizing controls.

---

## 2. Core Capabilities

- **Frictionless Media Import:** Drag and drop from operating system desktop/folders or paste directly via clipboard (`Ctrl+V`).
- **Inline Scaling Controls:**
  - `Off` (with snap support)
  - `Max MP` (Megapixel boundary capping)
  - `Longest side` (Max edge constraint)
  - `Scale by ×` (Proportional multiplier)
- **Compact Footprint:** Clean 3-socket output (`IMAGE`, `width (W)`, `height (H)`) designed for ultra-tight workflows.
- **Color Profile & Exif Normalization:** Automatically applies `ImageOps.exif_transpose` to respect camera orientation tags, and normalizes 16-bit grayscale (`I;16`) to standard 3-channel RGB float tensors.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `COMBO` | Yes | Target image file from ComfyUI's input directory or user upload. |

### Hidden & Serialized Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `ds_image_loader_state` | `STRING` | JSON | Serialized scaling parameters and snap config. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Loaded image tensor `[B, H, W, C]`. |
| `width (W)` | `INT` | Processed width. |
| `height (H)` | `INT` | Processed height. |

---

## 4. Workflows & Best Practices

1. **Lightweight Workflows:** Ideal for workflows where extra original dimension sockets are not needed and a minimal canvas presence is preferred.
