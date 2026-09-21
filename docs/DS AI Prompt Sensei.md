# DS AI Prompt Sensei — Documentation

## 1. Overview

**Node Name:** `DS AI Prompt Sensei`  
**Category:** `☠️ Deathshot Arsenal/🧠 AI`  
**Class:** `DS_AIPromptSensei`  
**Purpose:** All-in-one AI-assisted prompt generation and multimodal video generation cockpit for ComfyUI. Combines local LLM vision analysis, prompt expansion and scene direction, model and multi-LoRA stacking, video/audio VAE routing, resolution and aspect ratio formatting, and video timing coordination in a unified in-canvas hub.

---

## 2. Core Capabilities

- **Multimodal Image-to-Prompt Vision Analysis:** Inspects an input image using local LLMs (via the built-in Sensei engine or LM Studio API) to describe subject traits, atmosphere, lighting, camera angles, and action cues.
- **Dynamic LoRA Stacking:** In-node LoRA manager allowing users to select, stack, and assign model/clip strengths to multiple LoRAs with trigger word injection.
- **Video Model Pipeline Routing:** Emits post-LoRA `model`, `text_enc` (CLIP), `video_vae`, and `audio_vae` sockets directly into video samplers.
- **Aspect Ratio & Resolution Calculator:** Tailored for video diffusion models (such as LTX-Video), automatically selecting optimal width and height dimensions ($32$-multiple aligned).
- **Duration & FPS Timing:** Configures video duration in seconds and framerate (e.g. 24 fps) with internal frame calculations.

---

## 3. Sockets & Connectors

### Inputs

*Self-contained cockpit node. Configuration is persisted via `SenseiState`.*

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Uploaded reference image in native resolution `[B, H, W, 3]`. |
| `model` | `MODEL` | Diffusion model with all configured LoRA weights applied. |
| `video_vae` | `VAE` | Selected Video VAE for latent decoding/encoding. |
| `audio_vae` | `VAE` | Selected Audio VAE for sound generation pipelines. |
| `text_enc` | `CLIP` | Selected CLIP / text encoder with LoRA weights applied. |
| `width` | `INT` | Calculated video width in pixels. |
| `height` | `INT` | Calculated video height in pixels. |
| `duration` | `FLOAT` | Target video clip duration in seconds. |
| `fps` | `FLOAT` | Target playback framerate. |
| `prompt` | `STRING` | AI-generated or user-edited prompt text. |

---

## 4. Workflows & Best Practices

1. **Complete Video Generation Hub:**
   - Connect `model`, `text_enc`, and `video_vae` directly into an LTX or Hunyuan Video sampler.
   - Connect `prompt` to `CLIP Text Encode (Prompt)`.
   - Connect `width`, `height`, `fps`, and `duration` to `DS Video Timing` or `Empty Latent Video`.
   - Upload an image, click `Generate Prompt`, and queue generation without configuring dozens of separate loader nodes.
