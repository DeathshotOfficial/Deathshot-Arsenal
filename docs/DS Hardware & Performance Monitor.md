# DS Hardware & Performance Monitor — Documentation

## 1. Overview

**Extension Name:** `DS Hardware & Performance Monitor`  
**Location:** Top Action Bar (docked on the leftmost side, directly preceding the Global Reminder bell)  
**Script:** `extensions/ds_hardware_monitor_bar.js`  
**Backend Daemon:** `core/monitor/service.py`  
**Platform Support:** Windows & Linux  

The **DS Hardware & Performance Monitor** is a unified, high-performance telemetry HUD and execution benchmark monitor integrated directly into the ComfyUI action bar. It consolidates hardware vitals, local LLM inference telemetry, and multi-stage workflow execution timing into a compact 38px toolbar strip with zero canvas clutter.

---

## 2. Architecture & Modules

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [::] │ CPU 30% RAM 88% GPU 100% VRAM 3.1G │ 🗲 9.6 tk/s 223 tok │ ⏱ 03:00 • │
└──────┴────────────────────────────────────┴────────────────────┴──────────────┘
  ▲                     ▲                              ▲                ▲
  │                     │                              │                │
  │               Hardware Hub                  LLM Tracker       Run Benchmark
Drag Handle       (CPU/RAM/GPU)               (Prompt Sensei)     (Queue Timer)
```

### 1. Dock & Float Handle (`.hpm-dock-grip`)
* **ComfyUI-Native 2×3 Dot Grip**: Standard ComfyUI-styled drag handle matching native panel handles.
* **Seamless Undocking**: Click or drag the grip to undock the monitor strip into a free-floating overlay that can be placed anywhere on the screen.
* **Jitter-Free Movement**: Dragging is rendered via `requestAnimationFrame` with viewport clamping, preventing snapping jerks or cursor desynchronization.
* **Dock Target**: Leaves a clean dashed placeholder (`↧`) in the action bar. Drop the strip back onto the action bar or click the placeholder to instantly re-dock.

### 2. Hardware Resource Hub (`.hpm-hw`)
* **Toolbar Readings**: Fixed-width slots for `CPU %`, `RAM %`, `GPU %`, and `VRAM GB` with color-coded warning/danger thresholds:
  * Low (Normal): Mint Green (`--hpm-green`)
  * Moderate (70%+): Warm Amber (`--hpm-amber`)
  * Critical (90%+): Coral Red (`--hpm-red`)
* **Hover / Focus Popover Card**:
  * Real-time linear gauge bars for CPU, RAM, GPU core, and VRAM memory.
  * Multi-core CPU topology (physical cores and logical threads).
  * Detected GPU name and driver version (via PyTorch CUDA diagnostics, NVML, or `nvidia-smi`).
  * Total vs. allocated memory stats.
  * Cross-platform sampling daemon running on a non-blocking background thread.

### 3. Local LLM Generation Tracker (`.hpm-llm`)
* **Toolbar Readings**: Live generation speed (`tk/s`) and total generated tokens (`tok`).
* **Active Status Pill**: Dynamically transitions between `Active` (during inference) and `Idle`.
* **Hover / Focus Popover Card**:
  * **Loaded Model**: Displays the active model name (e.g. `Qwen2.5-Coder-7B-Instruct`) rather than generic node names.
  * **Inference Metrics**: Live generation speed, total token count, Time to First Token (TTFT), and request elapsed time.
  * **Throughput Sparkline**: Dynamic bar-chart visualizer plotting recent token generation rates.
  * **Persistence**: LLM telemetry retains completed stats on finish and persists in `localStorage` across page reloads.

### 4. Execution Timer & Benchmark (`.hpm-timer`)
* **Precision Stopwatch**: Tabular numeric readout (`MM:SS`) with status indicator dot:
  * **Green (Solid)**: Workflow actively executing.
  * **Amber (Pulsing)**: Workflow paused at a checkpoint node.
  * **Amber (Rewind Animation)**: Rolling back downstream time during checkpoint continuation.
  * **Dimmed Green**: Execution idle / complete.
* **Hover / Focus Popover Card**:
  * Active queue execution ID (`#queueNumber`).
  * Session average execution duration (`Avg run time`).
  * Top 10 run history with timestamp, duration, and green `Best` badge tagging for the fastest run.

---

## 3. Multi-Stage Checkpoint Lifecycle & Time Rollback

The monitor bar coordinates directly with `DS Image Checkpoint` to eliminate false timings when re-running downstream passes:

```
[ Queue Prompt ] ──────────────────────────────────> Starts at 00:00
      │
(Upstream Generation)
      │
      ▼
[ DS Image Checkpoint ] ─── Captured at 03:00 ─────> Checkpoint Split: 03:00
      │
(Downstream / Upscale)
      │
      ▼
[ Workflow Complete ] ───── Finished at 05:00 ─────> History Logs: 05:00 (Idle)
      │
  [ Switch to Pause & Click CONTINUE to Re-Upscale ]
      │
      ▼
[ Time Rollback Animation ] ───────────────────────> Numbers rapidly rewind:
                                                     05:00 ──▶ 03:00 (Amber Glow)
      │
(Downstream Re-run) ───────────────────────────────> Resumes from 03:00:
                                                     03:01, 03:02...
      │
      ▼
[ Upscale Complete ] ────── Finished at 05:15 ─────> History Logs: 05:15 (New Run)
```

### Key Behaviors:
1. **Split-Time Tracking**: Records the exact time to reach the checkpoint ($T_{\text{checkpoint}}$ = `03:00`).
2. **Rollback on Continue**: Clicking **Continue** on the checkpoint to re-run downstream stages subtracts the previous downstream time and rewinds the timer to $T_{\text{checkpoint}}$ via a rapid reverse-rolling animation.
3. **Independent History Logging**: Each completed load-to-end execution is recorded as an independent entry in the run history.
4. **Pause Time Exclusion**: Idle time spent inspecting images at checkpoint gates is automatically excluded from execution timings.
5. **No False Completion Pauses**: Finishing a continuation pass properly transitions to `Idle` without falsely re-pausing the timer.

---

## 4. Theme Adaptability & Viewport Edge Clamping

### Theme-Native Styling
* Designed using ComfyUI theme variables (`--comfy-menu-bg`, `--input-text`, `--fg-color`, `--descrip-text`) and dynamic CSS `color-mix()` tokens.
* Seamlessly adapts to light, dark, and custom themes:
  * Light theme: High-contrast dark charcoal text and subtle tinted surfaces without harsh black rectangles.
  * Dark theme: Glowing neon accents with translucent blurred backdrops.

### Dynamic Edge Detection & Viewport Clamping
* Hover panels calculate screen boundaries dynamically on enter/focus:
  * **Horizontal Clamping**: Clamps inside viewport margins (`left: clamp(...) !important`) so cards never bleed off-screen, regardless of where the monitor is docked or moved.
  * **Vertical Flipping**: If positioned near the screen bottom, popover panels automatically flip upward (`.hpm-opens-up`).
  * **Constrained Viewports**: Enables internal smooth scrolling (`.hpm-panel-scroll`) when vertical space is restricted.
