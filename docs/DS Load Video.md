# DS Load Video — Documentation

## 1. Overview

**Node Name:** `DS Load Video`  
**Category:** `☠️ Deathshot Arsenal/🎬 Video`  
**Class:** `DS_LoadVideo`  
**Purpose:** High-performance video loader and frame extraction engine for ComfyUI. Supports high-speed frame decoding via OpenCV, audio stream extraction, custom framerate interpolation/decimation (`force_rate`), spatial downscaling, frame stepping (`select_every_nth`), and automated alignment with popular video diffusion formats (`LTXV`, `Mochi`, `Hunyuan`, `Cosmos`, `Wan`, `AnimateDiff`, `H3`).

---

## 2. Core Capabilities

- **Fast Video Decoding & Audio Extraction:** Ingests `.mp4`, `.webm`, `.mov`, `.mkv`, `.avi`, `.flv`, `.wmv`, and `.m4v` containers, extracting video frames into PyTorch tensors and audio into standard ComfyUI audio tuples.
- **Model-Specific Target Presets (`format`):**
  - **`LTXV`**: 24 fps, spatial multiple 32, frame count formula $8n + 1$.
  - **`Mochi`**: 24 fps, spatial multiple 16, frame count formula $6n + 1$.
  - **`Hunyuan`**: 24 fps, spatial multiple 16, frame count formula $4n + 1$.
  - **`Cosmos`**: 24 fps, spatial multiple 16, frame count formula $8n + 1$.
  - **`Wan`**: 16 fps, spatial multiple 8, frame count formula $4n + 1$.
  - **`AnimateDiff`**: 8 fps, spatial multiple 8.
  - **`H3`**: 24 fps, spatial multiple 32, frame count formula $17n + 5$.
- **Framerate Resampling (`force_rate`):** Resamples video to any desired FPS on the fly without external transcoding.
- **Selective Frame Loading:**
  - `skip_first_frames`: Omit intro or lead-in frames.
  - `frame_load_cap`: Limit maximum frames decoded into VRAM.
  - `select_every_nth`: Temporal decimation (e.g. step every 2nd or 4th frame).
- **VHS Video Info Output:** Produces standard `VHS_VIDEOINFO` dictionary compatible with VideoHelperSuite nodes.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `video` | `COMBO` / `STRING` | Yes | Target video file path or selection from ComfyUI input folder. |
| `force_rate` | `FLOAT` | No | Target FPS (`0.0` = native FPS, `0.0`–`240.0`). |
| `custom_width` | `INT` | No | Target width (`0` = keep native / format preset). |
| `custom_height` | `INT` | No | Target height (`0` = keep native / format preset). |
| `frame_load_cap` | `INT` | No | Maximum frames to load (`0` = all frames). |
| `skip_first_frames` | `INT` | No | Number of initial frames to skip. |
| `select_every_nth` | `INT` | No | Step factor (default `1`). |
| `format` | `COMBO` | No | Architecture alignment preset (`LTXV`, `Mochi`, `Hunyuan`, `Cosmos`, `Wan`, `AnimateDiff`, `H3`, `None`). |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `Images` | `IMAGE` | Decoded video frame batch tensor `[B, H, W, C]`. |
| `Audio` | `AUDIO` | Audio stream tuple `{waveform, sample_rate}`. |
| `Frame_Count` | `INT` | Total number of frames extracted. |
| `Video_Info` | `VHS_VIDEOINFO` | Video metadata dictionary for downstream video nodes. |

---

## 4. Workflows & Best Practices

1. **AI Video-to-Video (LTXV / Hunyuan / Wan):**
   - Select target model format from the `format` dropdown.
   - The node automatically calculates the correct frame-count alignment ($4n+1$, $8n+1$, etc.) and spatial dimension divisibility, preventing VAE encoding errors during conditioning.
