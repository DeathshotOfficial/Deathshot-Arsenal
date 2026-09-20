# DS Image Preview — Documentation

## 1. Overview

**Node Name:** `DS Image Preview`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_ImagePreview`  
**Purpose:** High-fidelity image preview and lossless passthrough node for ComfyUI. Provides responsive in-canvas image inspection with zero quality loss, dual execution modes (`PREVIEW` vs `SAVE`), instant clipboard copy, full-resolution popout window, and on-demand manual disk export.

`DS Image Preview` functions as both an interactive visualization card and an inline workflow passthrough. It can be placed at any point in a generation or post-processing pipeline to inspect tensors in real time or chain them directly downstream to upscalers, comparisons, or output nodes.

---

## 2. Core Capabilities

- **Strict 1-to-1 Socket Architecture:** Exactly one `image` input on the left and one `image` output on the right. Zero hidden widget inputs, zero phantom sockets, and zero socket overlap.
- **Transparent Tensor Passthrough:** Outputs the exact `IMAGE` tensor received at the input without re-encoding, color space drift, or memory copying overhead.
- **Dual Execution Modes:**
  - **`PREVIEW` Mode:** Losslessly writes the active frame to ComfyUI's temporary directory for in-canvas inspection without writing persistent output files to disk.
  - **`SAVE` Mode:** In addition to the canvas preview, automatically saves every image in the batch as an individual, lossless PNG file to the ComfyUI output directory.
- **Lossless PNG Quality:** Uses PNG compression level 4 for speed while preserving 100% of the original pixel data. Compression alters only file size on disk, never image fidelity.
- **Batch-Aware Display:** Fully supports single images and multi-frame batches, displaying exact pixel dimensions and total frame count (e.g. `1024 × 1536 · 4 images`).
- **Interactive Action Bar:**
  - **`COPY`:** Reads the preview blob directly into the OS system clipboard using the browser Clipboard API, accompanied by a clean toast notification.
  - **`OPEN`:** Opens the preview image in a new dedicated browser tab at native resolution for zoom and pixel inspection.
  - **`SAVE OUTPUT`:** On-demand manual export button that commits the currently previewed image directly to disk with an animated status pill confirming the saved filename and path.
- **Session & Workflow Persistence:** Remembers selected mode (`PREVIEW` vs `SAVE`) across workflow reloads and automatically re-displays the last rendered image upon returning to the node.
- **Deathshot Theme Integration:** Fully bound to `DSGlobalTheme` with dark panel aesthetics, accented segmented buttons, glowing status indicators, and responsive canvas resizing.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Standard ComfyUI image tensor `[B, H, W, C]` (float32, 0.0–1.0). |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | The exact image tensor received at the input, forwarded downstream unchanged. |

> [!NOTE]
> `DS Image Preview` enforces a clean, minimal interface: exactly one input on the left and one output on the right. Both sockets use native ComfyUI `IMAGE` typing with standard link coloring. Mode selection is handled via the integrated DOM button bar and communicated to the backend via execution-time prompt hooks, eliminating extraneous widget sockets.

---

## 4. Execution Modes

The top mode bar allows switching between two distinct workflow behaviors with a single click:

| Mode | Canvas Preview | Output Files Created | Primary Use Case |
| :--- | :---: | :---: | :--- |
| **`PREVIEW`** *(Default)* | ✅ Yes | ❌ None | Rapid iteration, sampling checks, prompt testing, and intermediate pipeline inspection without accumulating junk files in the output directory. |
| **`SAVE`** | ✅ Yes | ✅ Yes (all frames in batch) | Final render passes where both visual verification and persistent archival to the output folder are required. |

### Output Filename Format (Save Mode)

When `SAVE` mode is active, images are written to the standard ComfyUI output folder using the following collision-free convention:
```
DS_ImagePreview_<YYYYMMDD_HHMMSS>_<millis>_<node_id>_<batch_index>_<unique_hash>.png
```

---

## 5. Action Bar Controls

Directly below the mode switcher, the action bar provides instant utilities for the current preview:

```
[ COPY ]  [ OPEN ]  [ SAVE OUTPUT ]
```

1. **`COPY`:**
   - Fetches the lossless image blob directly from the preview cache and writes it to the system clipboard as `image/png`.
   - Allows instant pasting (`Ctrl+V`) into Discord, Slack, Photoshop, or social media without saving to disk first.
   - Shows an in-canvas toast: `Copied image` or `Copy failed`.

2. **`OPEN`:**
   - Opens the uncompressed preview image in a separate browser tab (`_blank`).
   - Enables full-resolution browser inspection, pan/zoom, and external inspect tools.

3. **`SAVE OUTPUT`:**
   - Performs an asynchronous manual export of the active preview image to the ComfyUI output folder without requiring a workflow re-queue.
   - Disables the button temporarily (`SAVING…`) during disk writes.
   - On completion, renders an animated confirmation badge over the action bar displaying the saved filename and full destination path for 2 seconds.

---

## 6. Technical Architecture & Endpoints

### Backend Routes (aiohttp)

- **`GET /ds/image_preview/preview?file=<filename>`**
  - Serves temporary preview PNGs from ComfyUI's temp directory.
  - Validates filenames against `ds_image_preview_` prefixes to prevent directory traversal.
  - Sends `Cache-Control: no-store` to ensure browsers never serve stale preview frames across prompt runs.

- **`POST /ds/image_preview/save`**
  - Accepts JSON payload: `{ "file": "<temp_filename>", "node_id": "<id>" }`.
  - Performs a lossless stream copy from temp directly into the ComfyUI output directory.
  - Returns `{ "ok": true, "filename": "<out_name>", "path": "<full_path>" }`.

### Execution Prompt Hook

To avoid exposing extra serialized widgets or sockets on the LiteGraph node surface, the frontend intercepts ComfyUI's `app.graphToPrompt` pipeline:
1. When the workflow queue is submitted, the hook inspects active `DS_ImagePreview` nodes.
2. Injects the node's current mode (`preview` or `save`) directly into `entry.inputs.SaveMode`.
3. The Python backend reads `SaveMode` as a hidden execution argument, ensuring seamless mode switching with zero socket footprint.
