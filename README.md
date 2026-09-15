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
- **DS Run Timer**: Accurate execution benchmarking for nodes and workflow stages.

### 🖼️ Image & Media Tools
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

### 📝 Prompt Engineering & Utilities
- **DS Prompt & Prompt Cards**: Modular prompt editor with category cards, trigger injection, and effective prompt previews.
- **DS Prompt Scanner & Show Text**: Live prompt diagnostics and string display widgets.
- **DS Notes & Label**: Canvas documentation, workflow notes, and visual group labels.
- **Logic & Flow Control**: `DS Switch`, `DS Any Switch`, `DS Group Switch`, `DS Pipe`, `DS Seed`, and `The Purger`.
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

---

## AI Models

- **NSFW Detection**: ViT INT4 model is automatically downloaded on first use from Hugging Face.
- **Frame Interpolation**: RIFE 4.9 model weights are automatically downloaded when running interpolation nodes.

---

## License
 
Copyright © 2026 DeathshotOfficial. All Rights Reserved.  
This software is provided for **Personal Use Only**. Redistribution, unauthorized modification, resale, and commercial monetization are strictly prohibited. See the [LICENSE](LICENSE) for full terms.
