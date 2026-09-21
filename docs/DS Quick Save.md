# DS Quick Save — Documentation

## 1. Overview

**Node Name:** `DS Quick Save`  
**Category:** `☠️ Deathshot Arsenal/💾 Utilities`  
**Class:** `DS_QuickSave`  
**Purpose:** Rapid, frictionless image export node designed for iteration-heavy workflows. Automatically saves high-speed PNGs with timestamp and suffix naming, provides an integrated server-side folder picker, displays immediate thumbnail previews, and features an on-demand "Delete Last Saved" button to prune unwanted AI artifacts immediately from disk.

---

## 2. Core Capabilities

- **High-Speed PNG Saving:** Saves images at `compress_level=1` to minimize CPU encode latency during rapid generation loops while preserving full 24/32-bit lossless quality.
- **Timestamp & Suffix Naming:** Filenames follow `{timestamp}{_suffix}{_batch}.png` (e.g. `20260922_043000_upscale_0000.png`).
- **Interactive Server Folder Browser:** Clickable folder selector modal allowing visual filesystem browsing directly in the browser UI without manually typing absolute paths.
- **Delete Last Saved:** One-click disk cleanup button (`DELETE /ds/quicksave/delete`) that deletes the most recently saved image and its associated preview, perfect for discarding failed generations instantly.
- **Persistent State Across Restarts:** Persists the last output file path, directory, and preview thumbnail in `.quicksave_state.json`.
- **Lightweight Live Preview:** Efficient preview thumbnailing using ComfyUI's native `/view` pipeline and fallback base64 caching.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Batch of images `[B, H, W, C]` (float32, 0.0–1.0). |

### Hidden & UI-Managed Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `save_dir` | `STRING` | `"output"` | Target directory (relative or absolute). |
| `suffix` | `STRING` | `""` | Optional descriptive label appended after the timestamp. |

### Outputs

*Terminal Output Node (`OUTPUT_NODE = True`).*

---

## 4. Workflows & Best Practices

1. **Rapid Exploration:** Place `DS Quick Save` after KSamplers to capture iterations with zero delay.
2. **Instant Culling:** Use the "Delete Last Saved" button directly on the node whenever a seed produces poor composition or artifacts.
