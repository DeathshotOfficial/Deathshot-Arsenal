# DS Reminder — Documentation

## 1. Overview

**Node Name:** `DS Reminder`  
**Category:** `☠️ Deathshot Arsenal/🛠️ Utility`  
**Class:** `DS_Reminder`  
**Purpose:** A native, persistent time-based reminder and alert manager for ComfyUI. Designed to keep creators on track during long-running generations, model downloads, queue batches, or offline real-world tasks (such as checking the oven, GPU temperatures, taking a break, or stepping away from the workstation).

Unlike isolated node-only timers, `DS Reminder` functions as a full-fledged ComfyUI ambient service with global persistence, native action bar integration, and an animated fullscreen notification system that triggers even if the node is buried on another part of the canvas or not present in the current workflow.

---

## 2. Core Architecture

`DS Reminder` is built around a centralized, reactive multi-layer architecture:

```
┌────────────────────────────────────────────────────────┐
│                   DS Reminder Store                    │
│      (Reactive State, Web Audio Alert Synthesizer)      │
│     Synchronized with Server (config/reminders.json)   │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
       ┌───────▼────────┐        ┌────────▼────────┐
       │  Canvas Node   │        │ Native Dock Bar │
       │ (DS Reminder)  │        │ (Global Popover)│
       └───────┬────────┘        └────────┬────────┘
               │                          │
               └───────────┬──────────────┘
                           │
                 ┌─────────▼─────────┐
                 │ Fullscreen Modal  │
                 │  Overlay & Audio  │
                 └───────────────────┘
```

1. **Centralized Engine (`reminderStore`):**
   - Single source of truth managing all timers, lifecycle states (`scheduled`, `triggered`, `completed`), volume, and audio settings.
   - Automatically synchronizes with ComfyUI's backend (`/ds/reminders` API route saving to `config/reminders.json`) with an instantaneous `localStorage` fallback.
   - Runs background interval ticks independent of node execution or canvas zoom.

2. **Native Action Dock Integration:**
   - Mounts directly into ComfyUI's floating action dock right before the settings group.
   - Features an animated bell icon with snappy hover response and an active badge counter.
   - Clicking opens the floating **DS Reminder Popover** allowing creators to view, add, pause, or edit reminders from anywhere in ComfyUI without needing to hunt down a node.

3. **In-Node Interactive Canvas Interface:**
   - Custom DOM node rendered with clean geometry, status indicators, and quick-preset buttons.
   - Smooth horizontal layout ensuring reminder titles, targets, and action buttons never overlap or truncate.
   - Inline sliding drawer for creating and editing timers.

4. **Animated Fullscreen Alert Modal:**
   - Appears immediately when a reminder reaches zero (can be toggled per reminder or globally).
   - Features an animated swinging bell icon with glowing radar pulse rings, clean typography, and keyboard shortcuts (`Enter`/`Space` to dismiss, `Esc`).
   - Includes a **Snooze 5 Min** button for quick postponement.

---

## 3. Features & Capabilities

### Two Flexible Timing Modes
- **Duration Timer (Countdown):** Set a relative timer from 1 minute up to 999 minutes using the custom Deathshot numeric stepper or quick duration pill buttons (`1m`, `5m`, `10m`, `15m`, `30m`, `60m`).
- **Clock Time (Wall-Clock Target):** Set an exact target time of day (e.g., `18:30` or `23:00`) using a styled 24-hour time selector. Automatically calculates the remaining duration until that time.

### Quick Preset Bar
The canvas node includes a dedicated top strip of 1-click presets:
- **Rice** (15 min) — *"Check the rice"*
- **Oven** (30 min) — *"Turn off oven"*
- **Gen** (5 min) — *"Check generation"*
- **GPU** (10 min) — *"Check GPU temp"*
- **Break** (45 min) — *"Take a break"*
- **Water** (20 min) — *"Drink water"*

Clicking any preset immediately schedules a persistent reminder without having to open any form.

### Built-in Web Audio Alert Synthesizer
Zero external audio files, MP3s, or network dependencies. All alert sounds are synthesized in real-time using mathematical waveforms via the Web Audio API:
- **Reception Bell (Crisp):** Dual-tone high-frequency mechanical bell ping.
- **Classic Chime:** Warm acoustic descending two-note chime.
- **Digital Alarm (Urgent):** Triple-pulse square-wave electronic alarm.
- **Radar Ping:** Resonant sonar radar blip.
- **Tubular Bell:** Orchestral chime with multi-harmonic sustain.
- **Tibetan Bowl:** Low, calming zen meditation gong with gentle beat frequency.
- **Victory Fanfare:** Upbeat celebratory arpeggio.

Audio loops continuously when an alarm is due until acknowledged or snoozed, with preview buttons in the creation drawers.

### Strict Deathshot Design Contract
- **Deathshot Theme Reactive:** Fully bound to `window.DSGlobalTheme` and CSS tokens (`--ds-accent`, `--ds-panel`, `--ds-border`, etc.). Adapts dynamically when switching theme accents or dark palettes without reloading the page.
- **Custom UI Components:** Custom 32x18 switch toggles, styled WebKit scrollbars, and zero browser-native arrows or spin buttons.
- **Non-Overlapping Layout:** Distinct card rows with dedicated sections for title, target time, live status badge, and control buttons (Enable/Disable toggle, Edit, Delete).

---

## 4. Controls & Interfaces

### A. Action Dock & Global Popover

Located on ComfyUI's action dock:

| Element | Interaction | Behavior |
| :--- | :--- | :--- |
| **Bell Button** | Hover | Plays a lively swinging bell animation. |
| **Alert State** | Triggered Reminder | Bell rings vigorously in alert red with a pulsing badge counter. |
| **Badge Counter** | Automatic | Displays count of active scheduled timers (or alert count if due). |
| **Popover Header** | Click Button | Opens the non-modal manager displaying all reminders and presets. |
| **+ Add Reminder** | Click | Opens the global creation modal to schedule a new timer on the fly. |

### B. In-Node Drawer

Opening the drawer on the canvas node exposes:
- **Mode Toggle:** Switch between **Duration (Min)** and **Exact Time (Clock)**.
- **Duration Stepper:** Decrement / Increment buttons with direct numeric input and quick chips.
- **Custom Sound Dropdown:** Custom Deathshot themed dropdown with preview test button.
- **Fullscreen Modal Switch:** Toggle whether this specific reminder triggers the full-screen modal or alerts subtly via audio and action dock.

### C. Fullscreen Modal Notification

When a reminder expires, the modal appears:
- **Acknowledge & Dismiss:** Stops audio loop, marks reminder completed, closes modal (`Enter` or `Space`).
- **Snooze 5 Min:** Extends reminder by 5 minutes and resumes monitoring.
- **Card Shake:** Clicking the dimmed backdrop safely shakes the modal to remind the user to explicitly acknowledge or snooze.

---

## 5. Keyboard Shortcuts

| Key | Context | Action |
| :--- | :--- | :--- |
| `Enter` / `Space` | Fullscreen Overlay active | Acknowledge and dismiss all triggered reminders. |
| `Escape` | Fullscreen Overlay active | Acknowledge and dismiss overlay. |
| `Escape` | Global Popover open | Closes the popover manager. |

---

## 6. Persistence & Storage

- **Server Storage:** Reminders are persisted to `config/reminders.json` on the ComfyUI host.
- **Local Fallback:** Browser `localStorage` maintains a synchronous snapshot to prevent loss of state during network disconnects.
- **Workflow Independence:** Reminders belong to the ComfyUI user session, not an individual graph file. Loading a new workflow or clearing the canvas will **not** wipe scheduled reminders.
