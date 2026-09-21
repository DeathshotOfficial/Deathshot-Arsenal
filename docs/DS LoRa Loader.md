# DS LoRa Loader — Documentation

## 1. Overview

**Node Name:** `DS LoRa Loader`  
**Category:** `☠️ Deathshot Arsenal/💾 Utilities`  
**Class:** `DS_LoRaLoader`  
**Purpose:** Advanced modular LoRA stacker and loader for ComfyUI. Supports multi-LoRA stacking, independent model and CLIP strengths, video/audio dual-stream weight scaling, Civitai metadata & thumbnail caching, interactive trigger word extraction, and memory-optimized execution.

---

## 2. Core Capabilities

- **Multi-LoRA Stacking:** Manage up to 32 LoRAs in a single sleek UI node without daisy-chaining dozens of individual loader nodes.
- **Independent Strengths:** Fine-tune `modelStrength` and `clipStrength` per LoRA row, with master enable toggles and per-item bypass switches.
- **Video & Audio Mode:** Specialized mode for video diffusion architectures (e.g. Wan2.1, CogVideoX, HunyuanVideo). Automatically separates and scales video weights and audio weights independently (`videoStrength`, `audioStrength`).
- **Civitai Metadata & Previews:** Automatically reads embedded metadata and caches Civitai model descriptions, sample images, base model tags, and trigger words.
- **Trigger Word Compilation:** Automatically displays trained trigger words for every loaded LoRA. Select or deselect tags interactively to output a clean, deduplicated, separator-formatted prompt string directly from the `triggers` socket.
- **Smart Memory Caching:** Implements an LRU LoRA file cache to prevent redundant disk I/O when iterating on weights, plus an optional `"Lowest"` memory mode for VRAM/RAM constrained machines.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `model` | `MODEL` | Yes | Base or upstream diffusion model to patch. |
| `clip` | `CLIP` | Yes | Base or upstream CLIP text encoder to patch. |
| `LoaderState` | `STRING` | Optional | Serialized JSON state storing the stacked LoRA rows, weights, and trigger selections. Automatically handled by frontend UI. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `model` | `MODEL` | Model patched with all enabled LoRA weights. |
| `clip` | `CLIP` | CLIP encoder patched with all enabled LoRA weights. |
| `triggers` | `STRING` | Deduplicated list of selected trigger words joined by the configured separator (e.g. `", "`). |

---

## 4. UI Controls & Configuration

- **Add LoRA:** Search and select LoRAs from your local models directory with live autocomplete and instant thumbnail preview.
- **Strength Sliders:** Adjust model and clip weights (-2.00 to 2.00) with quick-reset buttons.
- **Trigger Word Badges:** Click individual trigger chips to toggle inclusion in the output string.
- **Drag-to-Reorder:** Easily change the sequential application order of your LoRA stack.
- **Master Toggle:** Instantly disable all LoRAs in the stack without modifying individual strength values.

---

## 5. Workflows & Best Practices

1. **Character + Style Stacking:** Load a character LoRA at `model: 0.85`, `clip: 0.85` alongside an art style LoRA at `model: 0.60`, `clip: 0.50`, piping the `triggers` output directly into your positive prompt text concatenator.
2. **Video Generation Pipelines:** Switch to `video` mode when working with Wan2.1 or HunyuanVideo to scale camera motion or character weights without distorting audio or temporal stability.
3. **Trigger Concatenation:** Connect the `triggers` output into `DS AI Prompt Sensei` or `CLIPTextEncode` to guarantee exact keyword activation without manually copying words from Civitai.
