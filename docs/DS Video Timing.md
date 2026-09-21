# DS Video Timing — Documentation

## 1. Overview

**Node Name:** `DS Video Timing`  
**Category:** `☠️ Deathshot Arsenal/🎬 Video`  
**Class:** `DS_VideoTiming`  
**Purpose:** Precise mathematical synchronization and timing utility for generative video workflows in ComfyUI. Automatically coordinates duration, playback framerate (`fps`), and total frame count (`frames`), calculating $\text{frames} = \text{round}(\text{duration} \times \text{fps})$.

---

## 2. Core Capabilities

- **Bidirectional Video Timing Math:** Calculates total frame count from duration and FPS, or synchronizes custom values.
- **Interactive In-Node Steppers:** Quick presets for common cinematic and animation framerates (`12`, `16`, `24`, `30`, `60 fps`) and durations (`2s`, `3s`, `4s`, `5s`, `10s`).
- **Synchronous Output Routing:** Simultaneously emits `duration` (float), `fps` (float), and `frames` (integer) to feed video diffusion conditioning, sampler latent batches, and downstream video encoders from a single source of truth.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Default | Range | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `duration` | `FLOAT` | Yes | `5.0` | `0.1`–`3600.0` | Target clip duration in seconds. |
| `fps` | `FLOAT` | Yes | `24.0` | `1.0`–`240.0` | Target playback framerate. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `duration` | `FLOAT` | Clamped duration in seconds. |
| `fps` | `FLOAT` | Clamped playback framerate. |
| `frames` | `INT` | Calculated total whole frame count ($\text{duration} \times \text{fps}$). |

---

## 4. Workflows & Best Practices

1. **Centralized Video Pipeline Timing:** Connect `frames` to `Empty Latent Video` and `fps` to `DS Video Save` to ensure your diffusion sampler and final video encoder always match timing perfectly.
