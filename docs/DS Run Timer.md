# DS Run Timer — Documentation

## 1. Overview

**Node Name:** `DS Run Timer`  
**Category:** `☠️ Deathshot Arsenal/🖥️ Monitoring`  
**Class:** `DS_RunTimer`  
**Purpose:** Real-time workflow execution timer and audio completion notifier for ComfyUI. Built with a clean digital face, dual-mode canvas/DOM rendering, multi-stage checkpoint pause & resume coordination, and a built-in Web Audio synthesizer.

---

## 2. Core Capabilities

- **Precision Stopwatch Display:**
  - High-contrast monospace digital readout (`MM:SS` or `HH:MM:SS`).
  - Optical vertical centering ensuring equal top and bottom padding regardless of aspect ratio or font metrics.
  - Automatically updates every frame via `requestAnimationFrame` during execution.

- **Crisp, Clean Aesthetics:**
  - Designed with Deathshot Arsenal dark theme tokens.
  - Sharp 1px border that shifts to the active accent color when running and muted accent when paused.
  - Free from blurry text-shadows, radial halos, or canvas gradient blooms for maximum legibility.

- **Multi-Stage Checkpoint Lifecycle (Pause & Continue Coordination):**
  - Seamlessly coordinates with `DS Image Checkpoint`.
  - **Generation Stage:** Timer counts up from `00:00` during the initial image generation.
  - **Checkpoint Pause:** When the workflow halts at a checkpoint for inspection, the timer automatically **pauses**, preserving accumulated time and suppressing finish sounds.
  - **Continue Stage:** When `Continue` is clicked on the checkpoint (e.g. to send to an upscaler or downstream pass), the timer **resumes** from where it paused rather than resetting to `00:00`.
  - **Completion:** When the entire downstream workflow finishes, the timer stops, displays total cumulative run time, and plays the selected finish audio.
  - **Regenerate / New Queue:** When `Regenerate` or a fresh prompt is queued, the timer resets to `00:00` and starts fresh.

- **Built-in Web Audio Synthesizer:**
  - Zero external MP3/WAV file dependencies — all sounds are synthesized mathematically on-demand via the Web Audio API.
  - Multiple sound presets across categories (Bells, Chimes, Game, Retro, Synth, Minimalist).
  - Volume slider (0% to 100%) and instant sound test preview.
  - Mute option to disable completion audio without removing the node.

- **Floating Settings Panel:**
  - Open via node gear icon or top actionbar.
  - Categorized sound filter chips (All, Chimes, Synth, Retro, UI).
  - Non-destructive and closes with click-outside or Escape key.

---

## 3. Multi-Stage Checkpoint Flow

When combining `DS Run Timer` with `DS Image Checkpoint`, the timer automatically links the multi-stage queue into a single continuous run:

```
[ Queue Prompt / Regen ] ──────> Timer starts at 00:00
          │
    (Base Model / Sampler)
          │
          ▼
[ DS Image Checkpoint ] ───────> Workflow halts at checkpoint
                                 Timer PAUSES at e.g. 00:14
                                 (No completion chime played)
          │
  [ Click CONTINUE ] ──────────> Timer RESUMES from 00:14
          │
    (Upscaler / Face Detailer)
          │
          ▼
   [ Final Output ] ───────────> Workflow completes
                                 Timer STOPS at total time (e.g. 00:25)
                                 Completion chime plays!
```

If you click **REGENERATE** instead of Continue, the timer recognizes this as an entirely new generation cycle and restarts cleanly from `00:00`.

---

## 4. Node Settings & Controls

Access settings by clicking the gear icon on the node or the top actionbar:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **Sound** | Selection | `chime` | Completion audio chime synthesized via Web Audio API. |
| **Volume** | Slider | `80%` | Audio volume output percentage (0% to 100%). |
| **Mute** | Toggle | `false` | When enabled, runs silently while continuing to measure time. |

### Available Sound Presets
- **Chimes & Bells:** Modern Chime, Bell Ding, Soft Ding, Two-Tone Chord, Crystal Shimmer.
- **Synth & Electronic:** Synth Success, Rising Arp, Cosmic Sparkle, Digital Beep.
- **Game & Retro:** 8-Bit Level Up, Coin Pickup, Retro Victory.
- **Minimalist:** Clean Click, Subtle Pop, Muted Tone.

---

## 5. UI States & Indicators

| State | Border | Text Color | Behavior |
| :--- | :--- | :--- | :--- |
| **READY** | Muted dark border | Light gray text | Workflow idle, timer reset. |
| **RUNNING** | Active theme accent | Active theme accent | Workflow executing, timer counting up. |
| **PAUSED** | Soft muted accent | Soft muted text | Checkpoint active, elapsed time held frozen. |
| **FINISHED** | Standard border | Clean text | Run completed, total elapsed time displayed. |
| **STOPPED / ERROR** | Muted border | Gray text | Execution aborted or failed; audio suppressed. |

---

## 6. Best Practices

- **Place Anywhere:** `DS Run Timer` is a lightweight display and monitoring node. It requires no inputs or outputs and can be placed anywhere on your canvas.
- **Multi-Stage Upscaling:** When building workflows with intermediate review checkpoints (e.g. txt2img -> Checkpoint -> Ultimate SD Upscale), keep the timer visible on canvas to monitor total combined generation duration.
- **Headless & Remote:** The timer runs locally in the browser interface; logging events are synced to the backend console if needed without impacting prompt execution speed.
