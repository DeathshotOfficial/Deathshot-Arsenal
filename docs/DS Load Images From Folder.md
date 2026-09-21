# DS Load Images From Folder — Documentation

## 1. Overview

**Node Name:** `DS Load Images From Folder`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_LoadImagesFromFolder`  
**Purpose:** High-throughput batch image ingestion and automated workflow feeder for ComfyUI. Recursively indexes directories on disk, provides an interactive visual gallery modal with multi-selection and sorting, supports sequential or simultaneous batch execution, and auto-increments queue executions until full folders are processed.

---

## 2. Core Capabilities

- **Directory Scanning & Recursive Traversal:** Reads from any local disk directory with optional recursive subfolder traversal (`include_subfolders`).
- **Interactive Thumbnail Gallery Modal:**
  - Fast thumbnail grid displaying all discovered images.
  - Filter by subfolder, name, or dimensions.
  - Multi-selection and range selection (`Shift+Click`).
  - Sort by name, date modified, file size, or dimensions in ascending/descending order.
- **Automated Sequential Execution Loop (Auto-Feeder):**
  - Integrated `AutoQueueRunner` automatically advances `current_index` and triggers the next queue generation via ComfyUI's API until the selected file list is complete.
  - No external queue automation scripts or looping custom nodes required.
- **Integrated 8-Mode Resizing Engine:**
  - Resize modes: `Off`, `Scale by ×`, `Longest side`, `Shortest side`, `Width & Height`, `Max Megapixels`, `Match aspect ratio`, and `Pad`.
  - Configurable resampling algorithms and anchor offsets.
- **Rich Output Telemetry:** Supplies downstream nodes with image tensor `[B, H, W, 3]`, dimensions `W` and `H`, the relative or base `filename`, the current `index` (1-based), and `total` count.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `ds_folder_loader_state` | `STRING` | Optional | Serialized JSON containing directory path, selected files, index, batch size, and resize engine configuration. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Output image batch tensor `[B, H, W, 3]`. |
| `W` | `INT` | Processed width in pixels. |
| `H` | `INT` | Processed height in pixels. |
| `filename` | `STRING` | Name of the active image file (or relative path if structure retained). |
| `index` | `INT` | 1-based sequential execution index. |
| `total` | `INT` | Total count of selected images in the queue sequence. |

---

## 4. Workflows & Best Practices

1. **Mass Dataset Inpainting / Captioning:**
   - Select a folder of raw photos.
   - Wire `filename` to a prompt saver or image exporter.
   - Start the automated sequential runner; the node will process every photo sequentially without manual queue clicks.
