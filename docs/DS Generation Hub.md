# DS Generation Hub — Documentation

## 1. Overview

**Node Name:** `DS Generation Hub`  
**Category:** `☠️ Deathshot Arsenal/⚡ Generation`  
**Class:** `DS_GenerationHub`  
**Purpose:** Centralized generation cockpit for ComfyUI workflows combining checkpoint & diffusion model loading, standalone CLIP & VAE routing, dynamic multi-LoRA chaining with CivitAI trigger inspection, aspect ratio & resolution management, attention mechanism selection, and prompt engineering into a single unified node.

---

## 2. Core Capabilities

- **Unified Loader Architecture:**
  - Loads standard all-in-one checkpoints (`comfy.sd.load_checkpoint_guess_config`).
  - Fallback support for standalone diffusion models (FLUX UNet, Wan 2.1, Hunyuan Video, etc.).
  - Automatic architecture detection (SD1.5, SDXL, SD3, FLUX, Hunyuan, Wan, Krea, PixArt, Chroma, Lumina).
- **Independent CLIP & VAE Routing:**
  - Automatically derives CLIP and VAE from the selected checkpoint, or routes standalone CLIP and VAE models when using modular diffusion setups.
  - Context-aware CLIP filtering and auto-suggestion for specialized architectures.
- **Dynamic LoRA Stacking Chain:**
  - Add, remove, and reorder an arbitrary number of LoRA layers via drag-and-drop.
  - Per-LoRA active toggle switch to quickly bypass layers without removing them.
  - Independent Model and CLIP strength steppers.
  - Integrated CivitAI metadata lookup to view trained words and inject triggers directly into the prompt.
- **Aspect Ratio & Resolution Engine:**
  - Categorized resolution presets (Square, Landscape 4:3, Portrait 3:4, Widescreen 16:9, Cinematic 21:9, etc.).
  - Direct aspect ratio selection with automatic proportional dimension recalculation.
  - Target Megapixel (MP) presets and custom MP calculation.
  - Exact manual numeric width and height controls.
- **Attention Backend Selection:**
  - Select between `Auto-Detect`, `FlashAttention-2`, `SageAttention`, `SDPA`, and `XFormers`.
- **Integrated Prompt Management:**
  - Dedicated prompt textarea with active LoRA trigger counter badge.
  - One-click copy prompt and replace prompt from clipboard actions.
- **Micro UI & Sockets:**
  - Output sockets align directly with their corresponding functional rows on the node face.
  - Gear menu allows customizing section order (Models, Image Settings, LoRA, Prompt) and managing custom presets.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `HubState` | `STRING` | Hidden | Serialized state object containing all selections, presets, LoRA stacks, and parameters. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `model` | `MODEL` | The loaded diffusion model with the full LoRA chain applied. |
| `clip` | `CLIP` | The active text encoder / CLIP model with LoRA adjustments. |
| `vae` | `VAE` | The active variational autoencoder. |
| `width` | `INT` | Computed target generation width in pixels. |
| `height` | `INT` | Computed target generation height in pixels. |
| `prompt` | `STRING` | The final positive prompt text with active trigger words appended. |

---

## 4. UI Sections & Controls

### 1. Models Section
- **Model:** Dropdown listing checkpoints and diffusion models. Displays a live architecture badge (e.g. `SDXL`, `FLUX`, `WAN2.1`).
- **CLIP:** Dropdown selecting standalone CLIP / text encoders or defaulting to `Auto` (checkpoint-derived).
- **VAE:** Dropdown selecting standalone VAE or defaulting to `Auto` (checkpoint-derived).
- **Attention:** Dropdown to configure the attention implementation. Shows live detected backend when set to `Auto-Detect`.

### 2. Image Settings Section
- **Aspect Ratio:** Preset dropdown (`1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `32:9`, `5:4`, `3:2`).
- **Resolution:** Grouped preset dropdown categorized by aspect ratio families.
- **Megapixel (MP) Presets:** Quick-select chips (`0.5 MP`, `0.75 MP`, `1.0 MP`, `1.5 MP`, `2.0 MP`) plus a numeric input for custom MP targeting.
- **Width & Height:** Manual pixel inputs.

### 3. LoRA Section
- **Add LoRA:** Appends a new LoRA row to the stack.
- **Drag Handle:** Reorders the LoRA evaluation sequence.
- **Toggle (ON/OFF):** Enables or bypasses the individual LoRA.
- **LoRA Dropdown:** Selects the LoRA weights file.
- **Model & CLIP Strength Steppers:** Independent strength values.
- **Info Button:** Opens CivitAI metadata viewer and trigger word tag selector.
- **Delete Button:** Removes the LoRA from the stack.

### 4. Prompt Section
- **Prompt Textarea:** Main positive prompt input.
- **Active Triggers Badge:** Indicates total active trigger words attached from the LoRA chain.
- **Copy & Replace Actions:** Quick clipboard tools.

### 5. Gear Menu Configuration
- Access via the gear icon on the node header.
- **Section Order:** Reorder the four main panels (Models, Image Settings, LoRA, Prompt) using drag-and-drop.
- **Aspect Ratio Presets:** Add, edit, or delete aspect ratio presets.
- **Resolution Presets:** Add, categorize, and remove custom resolution presets.
- **Megapixel Presets:** Customize quick MP budget chips.
