# DS Image Save Advance — Documentation

## 1. Overview

**Node Name:** `DS Image Save Advance`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_ImageSaveAdvance`  
**Purpose:** Advanced production image export node with rich dynamic filename templating, multi-format compression (`PNG`, `WEBP`, `JPEG`), A1111/CivitAI metadata generation, persistent counters, folder navigation, and real-time frontend preview cards.

`DS Image Save Advance` replaces standard image save nodes with dynamic pattern-driven serialization, allowing files to be named based on models, seeds, timestamps, dimensions, and batch indices while embedding comprehensive workflow provenance.

---

## 2. Core Capabilities

- **Dynamic Token Templating:** File naming supports tokens:
  - `{input_name}`: Custom name or upstream identifier.
  - `{model}`: Active checkpoint or diffusion model name extracted automatically from the graph.
  - `{seed}`: Random seed integer detected from upstream samplers.
  - `{date}`: Formatted date according to user style (e.g. `dd-MM-yyyy`, `yyyy-MM-dd`).
  - `{time}`: Timestamp string (e.g. `HH-mm-ss`).
  - `{counter}`: Zero-padded auto-incrementing serial number (e.g. `001`, `0001`).
  - `{width}` & `{height}`: Output pixel dimensions.
  - `{batch_index}`: Batch index offset within multi-image generations.
- **Multiple Output Formats:**
  - **PNG:** Lossless compression with embedded ComfyUI workflow and prompt chunks.
  - **WEBP:** Lossless or lossy mode with configurable quality slider (`1` to `100`).
  - **JPEG:** Standard lossy compression with configurable quality.
- **CivitAI / A1111 Compatible Metadata:** Formats prompt text, negative prompt, sampler parameters (steps, cfg, sampler name, scheduler, seed, size, model hash) into standard `parameters` EXIF metadata recognized by image hosting platforms and civitai.com.
- **Persistent State & Auto-Counter:** Tracks the last save directory, counter value, and saved file paths across sessions via `.image_save_advance_state.json`.
- **Integrated Folder & Shell Actions:**
  - Open target folder in native file explorer (`os.startfile` on Windows, `open` on macOS, `xdg-open` on Linux).
  - Open last saved file directly in system image viewer.
- **On-Demand Format Conversion:** Convert existing saved images between PNG, JPG, and WEBP without re-running the generation queue.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Image batch tensor `[B, H, W, C]` (float32, 0.0–1.0). |

### Hidden & UI-Managed Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `save_dir` | `STRING` | `""` | Target output directory (relative to ComfyUI output dir or absolute path). |
| `template` | `STRING` | `"{input_name}_{date}_{time}_{counter}"` | Filename pattern string. |
| `date_style` | `STRING` | `"dd-MM-yyyy"` | Date format syntax. |
| `counter_digits` | `INT` | `3` | Zero-padding width for `{counter}`. |
| `quality` | `INT` | `100` | Quality level for lossy WebP and JPG (`1`–`100`). |
| `webp_lossless` | `BOOLEAN` | `False` | Force lossless mode when saving WebP. |
| `civitai` | `BOOLEAN` | `False` | Generate and inject A1111/Civitai parameters text. |
| `embed_workflow` | `BOOLEAN` | `True` | Embed prompt and workflow JSON in image metadata. |
| `keep_input_folders` | `BOOLEAN` | `False` | Preserve upstream subdirectory organization. |
| `format` | `STRING` | `"png"` | Target file format (`png`, `webp`, `jpg`). |

### Outputs

*Terminal Output Node (`OUTPUT_NODE = True`). Returns live telemetry to the browser UI with paths and next counter value.*

---

## 4. UI Controls & Micro-Geometry

- **Format Pill Switcher:** Single-click selector for `PNG`, `WEBP`, and `JPG`.
- **Save Path Input:** Text field with browse button and quick-action icon to open directory in system file manager.
- **Template Formula Bar:** Interactive token field with real-time filename preview string.
- **Settings Drawer:** Accessible popup panel configuring counter padding, Civitai generation params, quality sliders, and folder structures.
- **Live Preview Card:** Visual thumbnail of the last saved asset with resolution badge and file size readout.

---

## 5. Workflows & Best Practices

1. **Production Portfolio Archiving:**
   - Set template to `Portfolio/{date}/{model}_{seed}_{counter}`.
   - Enables clean daily categorization while preserving exact model lineage.
2. **Web Delivery Optimization:**
   - Select `WEBP` format, `quality = 90`, and disable `webp_lossless`.
   - Produces compact files with metadata intact for fast web loading.
