# DS Video Save — Documentation

## 1. Overview

**Node Name:** `DS Video Save`  
**Category:** `☠️ Deathshot Arsenal/🎬 Video`  
**Class:** `DS_VideoSave`  
**Purpose:** High-performance, GPU-accelerated video export engine for ComfyUI. Encodes image frame batches and audio into high-quality video files with NVIDIA NVENC hardware acceleration, automatic CPU fallback, rich codec choices (`H.264`, `H.265/HEVC`, `AV1`, `Apple ProRes`, `Animated WebP`, `GIF`, and `16-bit PNG Sequences`), ComfyUI workflow metadata embedding, and an interactive in-canvas video player.

---

## 2. Core Capabilities

- **NVIDIA NVENC Hardware Acceleration:** Automatic runtime probe for `h264_nvenc` and `hevc_nvenc`. Encodes 4K/60fps video at wire speed directly using GPU encoder chips.
- **Graceful CPU Fallback:** If hardware NVENC fails or is unsupported on the system, the pipeline automatically falls back to software encoding (`libx264`, `libx265`, `libsvtav1`) without failing the workflow.
- **Supported Encoders & Formats:**
  - **`h264-mp4` / `nvenc_h264-mp4`:** Universal compatibility with H.264 and AAC audio.
  - **`h265-mp4` / `nvenc_hevc-mp4`:** High efficiency HEVC compression for high-resolution AI video.
  - **`av1-mp4`:** Next-generation open AV1 compression (`libsvtav1`).
  - **`prores-mov`:** Broadcast-standard Apple ProRes 422 with uncompressed PCM 16-bit audio.
  - **`image/webp`:** Animated WebP with lossless or lossy compression.
  - **`image/gif`:** High-fidelity GIF with two-pass adaptive palette generation (`palettegen` + `paletteuse`).
  - **`image/png-sequence`:** 8-bit or 16-bit lossless PNG frame sequences.
- **Synchronized Audio Multiplexing:** Automatically multiplexes incoming `AUDIO` streams (`aac`, `libopus`, `flac`, `pcm_s16le`), with optional `trim_to_audio` and audio padding filters (`apad`).
- **Embedded Workflow Provenance:** Injects prompt and workflow JSON directly into video container user metadata tags.
- **Interactive In-Canvas Video Player:** Custom HTML5 video player rendered on the node face with scrub bar, looping toggle, and direct file/folder opening shortcuts.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Images` | `IMAGE` | Yes | Frame batch tensor `[B, H, W, C]` (float32, 0.0–1.0). |
| `Audio` | `AUDIO` | No | Optional audio stream `{waveform, sample_rate}`. |
| `FPS` | `*` / `FLOAT` | No | Target playback framerate (or integer/float value). |
| `Meta_batch` | `*` | No | Optional batch coordination metadata. |

### Hidden & UI-Managed Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `filename_prefix` | `STRING` | `"DS_Video"` | Base filename and subfolder pattern. |
| `selected_format` | `STRING` | `"h264-mp4"` | Target encoder preset (`h264-mp4`, `h265-mp4`, `nvenc_h264-mp4`, `nvenc_hevc-mp4`, `av1-mp4`, `prores-mov`, `image/webp`, `image/gif`, `png-sequence`). |
| `crf` | `INT` | `12` | Constant Rate Factor (`0` = lossless, `51` = lowest quality). |
| `pix_fmt` | `STRING` | `"yuv420p"` | Pixel format (`yuv420p`, `yuv420p10le`). |
| `loop_count` | `INT` | `0` | Number of times to loop container playback (`0` = infinite for web). |
| `save_metadata` | `BOOLEAN` | `True` | Embed prompt and workflow JSON into container tags. |
| `trim_to_audio` | `BOOLEAN` | `False` | Truncate video duration to match audio length. |
| `save_output` | `BOOLEAN` | `True` | Save to ComfyUI output directory vs temp directory. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `Filenames` | `LIST` | List of exported video file paths (casts to primary file string when wired to single-string inputs). |

---

## 4. Workflows & Best Practices

1. **Ultra-Fast Generation Loops:**
   - Select `nvenc_h264-mp4` with `crf = 16`.
   - Renders video directly on NVIDIA GPUs in milliseconds after sampler execution completes.
2. **Post-Production Archiving:**
   - Select `prores-mov` for lossless color depth and seamless editing in DaVinci Resolve or Premiere Pro.
