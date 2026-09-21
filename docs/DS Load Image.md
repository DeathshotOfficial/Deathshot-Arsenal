# DS Load Image — Documentation

## 1. Overview

**Node Name:** `DS Load Image`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_LoadImage`  
**Purpose:** High-performance, rich interactive image loading and pre-scaling node for ComfyUI. Features desktop/browser drag-and-drop, clipboard image pasting, top-lane socket resolution HUD plate, built-in thumbnail caching, multi-frame image sequence handling, and instant in-node scaling (Max Megapixels, Longest Side, Scale Factor, and VAE dimension snapping).

---

## 2. Core Capabilities

- **Frictionless Ingestion:**
  - Standard dropdown file browser querying ComfyUI's input directory.
  - Native file drag-and-drop directly onto the node canvas from operating system folders.
  - Direct clipboard pasting (`Ctrl+V`) into the node viewport.
- **Top-Lane Socket Resolution HUD:** Vertically aligned with input/output sockets, displaying original and processed dimensions (`W × H`) and active scaling telemetry.
- **Built-In Precision Prescaling:**
  - **`Off`**: Preserves original image resolution while still permitting VAE dimension snapping.
  - **`Max MP`**: Proportional scaling capping the total megapixel count (e.g. `1.0 MP`, `2.0 MP`, `4.0 MP`).
  - **`Longest side`**: Clamps the largest edge (width or height) to a target pixel value (e.g. `1024px`, `1536px`) while maintaining aspect ratio.
  - **`Scale by ×`**: Multiplies both dimensions by an exact multiplier (e.g. `0.5×`, `1.5×`, `2.0×`).
- **VAE Dimension Snapping:** Automatically rounds final dimensions to multiples of `8`, `16`, `32`, or `64` to prevent latent dimension mismatch errors during VAE encoding.
- **Selectable Resampling Filters:** `Auto` (switches to Area downsampling or Bicubic upsampling), `Nearest`, `Bilinear`, `Bicubic`, and `Lanczos`.
- **Upscale Protection Guard:** Optional `allow_upscale` switch to prevent low-resolution inputs from unintentionally blowing up in VRAM.
- **Multi-Frame Sequence Support:** Reads animated GIFs, APNGs, and multi-frame formats as stacked batch tensors `[B, H, W, C]`.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `COMBO` | Yes | Selected image filename from the input folder or dropped/pasted upload. |

### Hidden & Serialized Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `ds_load_image_state` | `STRING` | JSON | Serialized preset parameters: `mode`, `max_mp`, `longest_side`, `scale_factor`, `snap`, `resample`, `allow_upscale`. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Loaded image batch tensor `[B, H, W, C]` (float32, 0.0–1.0). |
| `W` | `INT` | Final processed image width. |
| `H` | `INT` | Final processed image height. |
| `Original W` | `INT` | Source image raw width prior to in-node scaling. |
| `Original H` | `INT` | Source image raw height prior to in-node scaling. |

---

## 4. Workflows & Best Practices

1. **SDXL / Flux Latent Normalization:** Set `snap = 16` and `max_mp = 1.0` (for SDXL) or `2.0` (for Flux) to ensure user-uploaded images immediately adhere to native model latent resolutions without downstream resize nodes.
2. **Direct Upscale Passthrough:** Pass `Original W` and `Original H` into downstream image comparison or latent un-crop nodes to preserve baseline references.
