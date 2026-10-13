# DS GIF Generator — Documentation

## 1. Overview

**Node Name:** `DS GIF Generator`  
**Category:** `☠️ Deathshot Arsenal/🎬 Video`  
**Class:** `DS_GifGenerator` (`DSGifGenerator`)  
**Purpose:** High-performance animated image encoder for ComfyUI that converts `IMAGE` frame batches into **Animated GIF**, **Animated WebP**, or **APNG** files with real-time playback speed synchronization, multithreaded FFmpeg streaming, optional `gifsicle` lossy post-optimization, live calibrated file-size estimation, and an interactive in-node looping preview.

---

## 2. Core Capabilities

- **Multi-Format Animated Encoding:**
  - **`GIF`:** Two-pass adaptive palette generation (`palettegen` + `paletteuse`) with rectangle frame differencing (`diff_mode=rectangle`), configurable palette size (`2–256` colors), `Global` or `Per frame` palette modes, and `Bayer`, `Floyd-Steinberg`, or `None` dithering.
  - **`WebP`:** High-efficiency animated WebP (`libwebp`) supporting both lossy quality/compression tuning and true `Lossless` 24-bit color at up to 60 FPS.
  - **`APNG`:** Lossless 24-bit Animated PNG container encoding.
- **Multithreaded FFmpeg Pipe + Native Pillow Fallback:**
  - Streams raw frames directly to `ffmpeg` without holding hundreds of encoded frames in RAM.
  - Automatically falls back to a native Pillow quantization and animation pipeline if `ffmpeg` is unavailable on the system.
  - Optional post-processing with `gifsicle` (`-O3 --lossy`) when `Optimize (GIF)` is enabled and `gifsicle` is installed, reducing GIF sizes by an additional 30–50%.
- **Real-Time Temporal Speed Synchronization (`1.0×` Speed):**
  - Automatically detects upstream source FPS from connected `opt_video_info` or upstream loader nodes (`DS Load Video`, `VHS_LoadVideo`, video inputs, `force_rate`, and `select_every_nth`)—even across `Reroute` / `DS Reroute` chains.
  - **`Sync speed (Real-time)`:** Resamples frame indices temporally so the exported animation plays back at exact `1.0×` real-time duration regardless of target `fps` or `frame_step` (`Every Nth`), never duplicating frames when source FPS is lower than target FPS.
  - **`Keep all frames`:** Preserves every selected frame without temporal resampling (useful for deliberate slow-motion or fast-forward output).
  - **50 FPS GIF Browser Guard:** Automatically caps GIF output at `50 FPS` (`20ms` frame delay) with error-diffused frame durations because browsers interpret `<20ms` (`1cs`) GIF delays as `100ms` (10 FPS slow-motion). Recommends **WebP** when true `60 FPS` output is requested.
- **Live Calibrated File-Size Estimator:**
  - Inspects connected upstream nodes (`DS Load Video`, `DS Load Images From Folder`, `VHS_LoadVideo`, or generic latent/image nodes) to display live estimated output size, resolution, frame count, and playback speed before execution.
  - Self-calibrates per format after each run using actual encoded byte ratios (`Calibrated ✨`) and warns when estimated output exceeds `50 MB`.
- **Interactive Card UI & Looping Preview:**
  - Built on the Deathshot Card Layout system (`Status Bar` → collapsible `Settings` panel → `Looping Preview`).
  - Live WebSocket progress bar (`ds_gif_progress`) with stage feedback (`preparing`, `encoding`, `finalizing`, `optimizing`) and one-click path copy to clipboard.
  - Interactive preview box supporting click-to-restart, `Space` to pause/resume on the current frame, and `R` to restart playback from frame 1.
- **Strict Path Validation & Safe File Writing:**
  - Atomic temporary file encoding in the destination directory before moving to the final path.
  - Enforces relative path security within ComfyUI's `output` (or `temp`) directory, blocking path traversal (`..`), drive letters, control characters, and Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1–9`, `LPT1–9`).

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `frames` | `IMAGE` | Yes | Batch of input frames `[B, H, W, C]` (`float32`, `0.0–1.0`, 1, 3, or 4 channels; up to 3,000 selected frames). |
| `opt_video_info` | `VIDEO_INFO` | No | Optional video metadata dictionary (`source_fps` / `loaded_fps`) for automatic real-time speed synchronization. |

### Outputs

`DS GIF Generator` is an `OUTPUT_NODE` with no downstream tensor outputs. It returns UI metadata (`card_preview` and `ds_gif_info`) to update the in-node preview, status bar, and size calibration.

---

## 4. UI Controls & Parameters

### Output Section

| Parameter | Widget / Label | Type | Default | Description |
| :--- | :--- | :--- | :---: | :--- |
| `save_path` | **Save path** | `STRING` | `"Gif/Gif"` | Relative subfolder and filename prefix inside ComfyUI's `output/` (or `temp/`) directory. Trailing slashes (e.g. `"MyFolder/"`) default the filename prefix to `"Gif"`. |
| `format` | **Format** | `COMBO` | `"GIF"` | Target animation container: `GIF`, `WebP` (animated), or `APNG`. |
| `save_mode` | **Save mode** | `COMBO` | `"Save + preview"` | `Save + preview` writes permanently to ComfyUI's `output/` folder; `Preview only` writes to `temp/`. |
| `existing_files` | **Existing files** | `COMBO` | `"Auto-number"` | `Auto-number` appends a 4-digit incrementing suffix (`Gif0001.gif`, `Gif0002.gif`); `Overwrite` replaces `<prefix>.<ext>`. |

### Timing Section

| Parameter | Widget / Label | Type | Default | Description |
| :--- | :--- | :--- | :---: | :--- |
| `fps` | **FPS Presets / FPS (custom)** | `INT` | `24` | Target playback frame rate (`1–60` FPS, with quick preset buttons for `10`, `12`, `15`, `20`, `24`, `30`, `50`, `60`). Capped at `50` for `GIF`. |
| `loop_count` | **Loop count (0=∞)** | `INT` | `0` | Number of playback loops (`0` = infinite loop, `1–100` = fixed repeat count). |
| `playback_order` | **Playback** | `COMBO` | `"Forward"` | Frame sequence direction: `Forward`, `Reverse`, or `Ping-pong` (forward then reverse without duplicating endpoints). |
| `timing_mode` | **Timing mode** | `COMBO` | `"Sync speed (Real-time)"` | `Sync speed (Real-time)` matches `1.0×` source duration; `Keep all frames` encodes every selected frame at target `fps`. |
| `source_fps` | **Source FPS (0=auto)** | `INT` | `0` | Source frame rate (`0–240`). When set to `0`, auto-detects from `opt_video_info` or upstream video loader nodes. |

### Frames Section

| Parameter | Widget / Label | Type | Default | Description |
| :--- | :--- | :--- | :---: | :--- |
| `start_frame` | **Start** | `INT` | `0` | 0-indexed starting frame of the input batch (`0` = first frame). |
| `end_frame` | **End (0=last)** | `INT` | `0` | Exclusive ending frame index (`0` = include through the last available frame). |
| `frame_step` | **Every Nth** | `INT` | `1` | Frame decimation step (`1` = every frame, `2` = every 2nd frame, etc.). |

### Size Section

| Parameter | Widget / Label | Type | Default | Description |
| :--- | :--- | :--- | :---: | :--- |
| `max_side` | **Max side (0=orig)** | `INT` | `0` | Constrains the longest dimension (width or height) to `max_side` pixels (`0–8192`, `0` = original resolution) while preserving aspect ratio. |
| `resample` | **Filter** | `COMBO` | `"Lanczos"` | Downscaling interpolation filter: `Lanczos`, `Bicubic`, `Bilinear`, or `Nearest`. |

### Quality & Compression Section

| Parameter | Widget / Label | Type | Default | Formats | Description |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `quality` | **Quality** | `INT` | `90` | All | Visual quality (`1–100`). Scales effective palette colors for GIF and `-q:v` for WebP. |
| `compression` | **Compression** | `INT` | `50` | All | Compression effort/strength (`0–100`). Tunes GIF Bayer scale, palette reduction, `gifsicle --lossy`, WebP `-compression_level`, and APNG `compress_level`. |
| `colors` | **Colors (GIF)** | `INT` | `256` | `GIF` | Maximum palette colors (`2–256`). |
| `dither` | **Dither (GIF)** | `COMBO` | `"Bayer"` | `GIF` | Dithering algorithm: `Bayer` (structured web-standard pattern), `Floyd-Steinberg` (error diffusion), or `None`. |
| `palette` | **Palette (GIF)** | `COMBO` | `"Global"` | `GIF` | `Global` computes one shared palette optimized across frame differences; `Per frame` generates a dedicated palette per frame. |
| `optimize` | **Optimize (GIF)** | `BOOLEAN` | `True` | `GIF` | Enables FFmpeg rectangle diffing (`diff_mode=rectangle`), Pillow palette optimization, and optional `gifsicle -O3` lossy compression. |
| `lossless` | **Lossless (WebP)** | `BOOLEAN` | `False` | `WebP` | Enables pixel-exact lossless WebP encoding (`-lossless 1`). |

---

## 5. Preview Shortcuts & Status Bar Controls

- **Copy Saved Path (`Copy` icon button):** Copies the relative path of the most recently generated file (e.g., `Gif/Gif0001.gif`) to the system clipboard.
- **Settings Toggle (`Settings` button):** Collapses or expands the configuration panel to maximize preview space while persisting state in the workflow.
- **Reset to Defaults:** Restores all 21 node parameters to their factory defaults in a single click.
- **Preview Interactions:**
  - **Left-Click on Preview:** Restarts animation playback from the beginning.
  - **`Space` (when preview is focused):** Pauses or resumes the animation on the exact current frame via an internal freeze-frame canvas.
  - **`R` (when preview is focused):** Restarts the animation loop immediately.

---

## 6. Workflows & Best Practices

1. **Web-Optimized Loops from 60 FPS Video (`DS Load Video` → `DS GIF Generator`):**
   - Connect `frames` (and optionally `video_info`) from **DS Load Video**.
   - Keep **Timing mode** on `Sync speed (Real-time)` and **FPS** at `24` or `30`. The node automatically downsamples temporal frames so playback speed stays `1.0×` without slow-motion drift.
   - Use `Bayer` dithering with `Global` palette and `Max side = 512` or `720` for compact, sharp social/web GIFs.
2. **True 60 FPS High-Color Animations:**
   - Switch **Format** to `WebP` and set **FPS** to `60`. Unlike GIF (which is restricted to 10ms centisecond ticks and capped at 50 FPS by web browsers), animated WebP supports full 24-bit color and true 60 FPS playback at a fraction of the file size.
3. **Seamless Boomerang Loops:**
   - Set **Playback** to `Ping-pong` and **Loop count** to `0` (`∞`) to create smooth back-and-forth loops without duplicating the first and last turnaround frames.
