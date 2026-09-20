# Deathshot Arsenal

[![GitHub stars](https://img.shields.io/github/stars/DeathshotOfficial/Deathshot-Arsenal?style=social)](https://github.com/DeathshotOfficial/Deathshot-Arsenal)
[![License: All Rights Reserved](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](LICENSE)
[![ComfyUI Custom Node](https://img.shields.io/badge/ComfyUI-Custom%20Node-purple.svg)](https://github.com/comfyanonymous/ComfyUI)


A comprehensive suite of high-performance, precision-crafted UI and utility nodes for **[ComfyUI](https://github.com/comfyanonymous/ComfyUI)**.

---

## Highlights & Features

### 🎨 Unified Theme & UI System
- **DS Theme Manager**: Full visual customization for ComfyUI nodes with dynamic accent tokens, custom dark/light color schemes, and seamless UI styling.
- **Micro UI Geometry**: Polished buttons, sliders, chip toggles, custom dropdowns, and integrated HUD socket lanes.

### 🎛️ System Diagnostics & Control
- **DS Control Panel**: Centralized management interface for Deathshot workflow components.
- **DS Hardware Monitor**: Real-time tracking of GPU / VRAM usage, CPU, RAM, and temperature via NVML and system sensors.
- **DS System Monitor**: Compact status bar for live generation stats and hardware metrics.
- **DS Run Timer**: Accurate execution benchmarking and completion audio alerts with multi-stage checkpoint pause/resume coordination. See [DS Run Timer Documentation](docs/DS%20Run%20Timer.md).
- **DS The Purger**: Safe, direct ComfyUI resource cleanup utility and transparent workflow passthrough node. Frees VRAM, RAM, cached models, and memory allocations mid-workflow or queue-to-queue under thread-safe synchronization with live before/after metrics. See [DS The Purger Documentation](docs/DS%20The%20Purger.md).

### 🖼️ Image & Media Tools
- **DS Image Preview**: Real-time high-fidelity image inspection and lossless passthrough node with dual PREVIEW and SAVE execution modes, instant clipboard copy, full-resolution popout window, and on-demand manual disk export. See [DS Image Preview Documentation](docs/DS%20Image%20Preview.md).
- **DS Film Grain**: High-performance photographic film grain processor powered by GLSL shaders with real-time interactive WebGL preview, customizable grain scale, chromatic variation, and luminance-based shadow weighting. See [DS Film Grain Documentation](docs/DS%20Film%20Grain.md).
- **DS Image Save Advance**: Powerful image export with dynamic filename templating (`{model}`, `{seed}`, `{date}`, `{width}x{height}`), format conversion, and metadata embedding.
- **DS Quick Save**: One-click rapid asset saving directly from canvas workflows.
- **DS Image Checkpoint & Compare**: A/B image comparison and multi-stage visual checkpointing.
- **DS Load Image & Folder Loader**: High-speed image loader with built-in HUD controls and batch folder ingestion.
- **DS Gallery**: In-canvas media viewer with real-time thumbnail caching and filtering.

### 🎬 Video & Frame Interpolation
- **DS Video Save & Load Video**: Fast, reliable video export and reading with PyAV and FFmpeg.
- **DS Frame Interpolation (RIFE)**: High-quality AI frame interpolation using RIFE 4.9 (auto-downloads models on first run).
- **DS Video Timing**: Precise FPS, frame count, and duration calculations.

### 🛡️ Smart Moderation & Safety
- **NSFW Detection & Blur**: Integrated Vision Transformer (ViT INT4) and NudeNet detectors with automatic disk caching and smart blur filters.

### ⚡ Generation & Workflow Hubs
- **DS Generation Hub**: All-in-one generation cockpit combining checkpoint and diffusion model loading, standalone CLIP/VAE routing, dynamic multi-LoRA stacking with CivitAI triggers, aspect ratio/resolution management, and prompt engineering.

### 📝 Prompt Engineering & Utilities
- **DS AI Prompt Sensei**: Next-generation AI prompt generator and scene director powered by local LLMs. Features multi-modal image-to-prompt vision analysis, dynamic LoRA stacking with per-model/clip strengths, automated aspect ratio detection, customizable video dimensions/durations, and interactive prompt editing. **Note:** [LM Studio](https://lmstudio.ai/) is required for this node to run local LLMs.
- **DS Randomizer**: Intelligent prompt randomization and variation engine. Preserves the user's template prompt while dynamically replacing or contextually inserting variations across 46+ extensible semantic categories with non-repeating shuffle-bag selection. Features tag-based contradiction prevention (e.g. night vs daylight), semantic zone placement (subject traits, clothing, lighting), live upstream prompt mirroring, and multi-stage checkpoint synchronization to prevent upscale prompt redraws. See [DS Randomizer Documentation](docs/DS%20Randomizer.md) for architecture details.
- **DS Prompt & Prompt Cards**: Modular prompt editor with category cards, trigger injection, and effective prompt previews.
- **DS Prompt Scanner & Show Text**: Live prompt diagnostics and string display widgets.
- **DS Notes & Label**: Canvas documentation, workflow notes, and visual group labels.
- **Logic & Flow Control**: `DS Switch`, `DS Any Switch`, `DS Group Switch`, `DS Pipe`, and `DS Seed`.
- **Canvas & Framing**: `DS Outpaint` and `DS Resolution` helpers.

---

## Installation

### Method 1: ComfyUI Manager (Recommended)
Search for **Deathshot Arsenal** in the ComfyUI Manager node list and click **Install**.

### Method 2: Manual Git Clone
1. Open a terminal in your ComfyUI directory:
   ```bash
   cd ComfyUI/custom_nodes
   ```
2. Clone this repository:
   ```bash
   git clone https://github.com/DeathshotOfficial/Deathshot-Arsenal.git DeathshotArsenal
   ```
3. Install the required dependencies:
   ```bash
   cd DeathshotArsenal
   pip install -r requirements.txt
   ```
4. Restart ComfyUI.

---

## Dependencies

The package requires standard Python libraries:
- `numpy`
- `psutil`
- `av`
- `opencv-python`
- `imageio-ffmpeg`
- `onnxruntime`
- `pynvml` *(optional, for GPU hardware monitoring)*

Install all dependencies in one command:
```bash
pip install -r requirements.txt
```

### External Requirements
- **[LM Studio](https://lmstudio.ai/)**: Required for **DS AI Prompt Sensei**. Download and install [LM Studio](https://lmstudio.ai/), then start the local server (default: `127.0.0.1:1234`) with your desired vision/chat LLM loaded.

---

## AI Models

- **NSFW Detection**: ViT INT4 model is automatically downloaded on first use from Hugging Face.
- **Frame Interpolation**: RIFE 4.9 model weights are automatically downloaded when running interpolation nodes.

---

## License
 
Copyright © 2026 DeathshotOfficial. All Rights Reserved.  
This software is provided for **Personal Use Only**. Redistribution, unauthorized modification, resale, and commercial monetization are strictly prohibited. See the [LICENSE](LICENSE) for full terms.
