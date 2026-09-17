# DS Interpolation — Documentation

## 1. Overview

**Node Name:** `DS Interpolation`  
**Category:** `Deathshot Arsenal/Interpolation`  
**Class:** `DS_Interpolation`  
**Purpose:** High-performance neural frame interpolation for ComfyUI featuring continuous temporal duration locking, custom micro-geometry UI, and automated model weight management.

`DS Interpolation` synthesizes intermediate frames between consecutive images or video frames using deep optical flow and temporal blending networks. It ensures smooth slow-motion or high-framerate playback (e.g., 24 fps to 60 fps) while strictly preserving total playback duration and audio synchronization.

---

## 2. Core Capabilities

- **Duration-Locked Interpolation:** Automatically synchronizes output framerates to maintain exact source video duration without speedup or slow-motion drift.
- **Dual Synthesis Modes:**
  - **Target FPS:** Continuous arbitrary framerate conversion (e.g., 23.976 fps -> 60 fps).
  - **Multiplier:** Classic integer sequence expansion (e.g., 2x, 4x, 8x).
- **Integrated Model Downloader:** Automatically checks for local model weights across standard ComfyUI directories and downloads missing checkpoints directly on demand.
- **Micro UI Design:** Compact, collapsible options panel with segmented mode toggles, numeric steppers with click-hold repeat, styled custom dropdowns, and a live duration timing badge.
- **Memory & VRAM Management:** Batched GPU inference with immediate CPU offload and automated periodic optical flow cache purging.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `images` | `IMAGE` | Yes | Batch of video frames `[B, H, W, C]` (float32, 0.0–1.0). |
| `optional_source_fps` | `FLOAT` / `INT` / `DICT` | No | Incoming video framerate from upstream nodes (such as `DS Load Video`). Overrides the manual Source FPS field when connected. |
| `optional_interpolation_states` | `*` | No | Optional state object or list of frame indices to selectively skip during interpolation. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `images` | `IMAGE` | Interpolated output sequence `[B_out, H, W, C]`. |
| `audio` | `AUDIO` | Untouched audio passthrough preserving timeline alignment. |
| `fps` | `FLOAT` | Exact effective output framerate, directly connectable to downstream video encoders (e.g., `DS Video Save`). |

---

## 4. UI Controls & Parameters

### Checkpoint Selection
- **`ckpt_name`**: The neural interpolation model checkpoint.
  - Supported models:
    - `rife49.pth` (Default, recommended all-round architecture)
    - `rife47.pth`
    - `rife417.pth`
    - `rife426.pth`
    - `sudo_rife4_269.662_testV1_scale1.pth`
  - Includes live installation badges: `✓ Installed` or `↓ Download`.

### Interpolation Options Panel (Collapsible)

#### Mode Selection
- **Target FPS (Default):** Generates a sequence matching the exact target framerate while locking video duration to the source.
- **Multiplier:** Multiplies the total frame count by an integer ratio (2x, 3x, etc.).

#### Live Timing Badge
- Displays real-time calculations indicating source framerate, target framerate, and playback speed synchronization (e.g., `24 fps ➔ 60 fps (duration preserved)`).

#### Primary Controls
- **Target FPS / Multiplier:**
  - In *Target FPS* mode: Desired playback framerate (1 to 240 fps, default `60`).
  - In *Multiplier* mode: Expansion multiplier (1 to 100x, default `2`).
- **Source FPS:** Framerate of the input sequence (1 to 240 fps, default `24`). Automatically overridden if `optional_source_fps` is connected.
- **Cache After Frames:** Number of frames processed before freeing PyTorch GPU VRAM and clearing optical flow warp caches (default `10`).
- **Batch Size:** Number of frame pairs synthesized simultaneously on GPU (1 to 64, default `1`). Higher values increase throughput on GPUs with sufficient VRAM.

#### Performance & Quality Flags
- **Fast Mode (ON/OFF):** Bypasses extra optical flow refinement iterations for faster inference speed.
- **Ensemble (ON/OFF):** Computes bidirectional forward/reverse optical flows and blends results for maximum edge fidelity.
- **Motion Scale:** Adjusts the optical flow search grid according to expected motion magnitude:
  - `1x` (1.0 - Default: balanced motion)
  - `0.5x` (0.5 - Low Motion: camera pans, talking heads)
  - `0.25x` (0.25 - Very Low Motion: slow zooms, minimal movement)
  - `2x` (2.0 - High Motion: action, sports, rapid gestures)
  - `4x` (4.0 - Extreme Motion: fast cuts, high-velocity dynamics)
- **Dtype:** Compute precision (`float32`, `float16`, `bfloat16`).
- **Torch Compile (ON/OFF):** Compiles the model with `torch.compile` for kernel fusion where supported.

---

## 5. Duration Locking & Timeline Math

When operating in **Target FPS** mode, the node maps the target timeline back to source frame indices using continuous interpolation:

$$t_{\text{target}} = \frac{k}{FPS_{\text{target}}}, \quad k \in [0, N_{\text{target}} - 1]$$

$$pos = k \times \frac{FPS_{\text{source}}}{FPS_{\text{target}}}$$

For each target position:
1. If $pos$ falls directly on an integer frame (within $10^{-5}$), the original source frame is preserved without re-sampling.
2. If $pos$ falls between frame $p_0$ and $p_1$, the fractional offset $\Delta t = pos - p_0$ is evaluated by the neural network at exact timestep $\Delta t$.

This guarantees that:
$$\text{Duration}_{\text{in}} = \frac{N_{\text{in}} - 1}{FPS_{\text{source}}} \approx \text{Duration}_{\text{out}} = \frac{N_{\text{out}} - 1}{FPS_{\text{target}}}$$

---

## 6. Recommended Workflows

### Standard Video Smoothing (24 fps -> 60 fps)
1. Connect `DS Load Video` **IMAGE** output to `DS Interpolation` **images**.
2. Connect `DS Load Video` **fps** output to `DS Interpolation` **optional_source_fps**.
3. Set `DS Interpolation` to **Target FPS** mode with `Target FPS = 60`.
4. Connect `DS Interpolation` **images** to `DS Video Save` **images**.
5. Connect `DS Interpolation` **fps** output to `DS Video Save` **fps**.
6. Connect `DS Interpolation` **audio** to `DS Video Save` **audio**.
7. Result: Smooth 60 fps video with identical duration and fully synchronized audio.

---

## 7. Troubleshooting & VRAM Optimization

- **Out of Memory (OOM):**
  - Set **Dtype** to `float16` or `bfloat16`.
  - Reduce **Batch Size** to `1`.
  - Set **Cache After Frames** to `4` or `5`.
  - For large 4K frames, set **Motion Scale** to `0.5x` or `1x`.
- **Fast Motion Artifacts:**
  - Increase **Motion Scale** to `2x`.
  - Enable **Ensemble** mode.
