# DS Snap — Documentation

## 1. Overview

**Extension Name:** `DS Snap`  
**Category:** `☠️ Deathshot Arsenal / 🛠️ Frontend Extensions`  
**Class/Namespace:** `DeathshotArsenal.DSSnap`  
**Purpose:** A high-precision workflow alignment, snapping, spacing, and arrangement engine for ComfyUI. Designed to eliminate manual pixel-nudging and visual clutter in complex graph workflows by providing magnetic alignment guides, gap enforcement, multi-node organization, dimension measurement and matching, and a dedicated undo/redo history system.

Unlike ad-hoc alignment scripts that pollute the DOM with overlapping canvases or create aggressive drag locks, `DS Snap` operates synchronously with LiteGraph's native canvas render pipeline (`onDrawForeground`) in true graph coordinate space.

---

## 2. Core Architecture

`DS Snap` is organized into a modular, non-blocking architecture:

```
┌────────────────────────────────────────────────────────┐
│                     DS Snap Store                      │
│     (Reactive State, Config Persistence via Storage)    │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
       ┌───────▼────────┐        ┌────────▼────────┐
       │ Snap Engine    │        │ Action Bar Dock │
       │ (Hysteresis &  │        │ (Popover Panel) │
       │  Scoring)      │        └─────────────────┘
       └───────┬────────┘
               │
       ┌───────▼──────────────────────────┐
       │   DSSnapHistoryManager (Undo)    │
       │  (50-Level Node Snapshot Stack)  │
       └───────┬──────────────────────────┘
               │
       ┌───────▼──────────────────────────┐
       │  LiteGraph Canvas Render Hook    │
       │    (Native onDrawForeground)     │
       └──────────────────────────────────┘
```

1. **Reactive Configuration Store (`DSSnapStore`):**
   - Single source of truth for snapping thresholds, min-margin gaps, edge/center alignment toggles, and arrow step sizes.
   - Automatically persists settings to browser storage (`DS_SNAP_CONFIG_V1`).

2. **Snapping & Hysteresis Engine (`DSSnapEngine`):**
   - Spatial candidate search prioritizing immediate visual neighbors ($< 550\text{px}$) over distant nodes.
   - Distance-weighted scoring formula that favors edge alignments and exact margin spacing over distant centerlines.
   - Dynamic breakout hysteresis ($1.25\times$ threshold) ensuring fluid escape from magnetic guides without getting trapped.

3. **History & Undo/Redo Engine (`DSSnapHistoryManager`):**
   - Dedicated 50-level snapshot stack tracking node positions and sizes.
   - Captures state transitions across drag snapping, multi-node row/column arrangements, dimension matching, and keyboard arrow nudges.
   - Native keyboard bindings (`Ctrl + Z`, `Ctrl + Shift + Z`, `Ctrl + Y`).

4. **Native Foreground Rendering (`onDrawForeground`):**
   - Renders visual guide lines and high-contrast pill badges directly on the LiteGraph canvas foreground in graph coordinate space.
   - Zooms and pans in 1:1 real-time sync with nodes at all canvas zoom levels.
   - Zero additional DOM elements or background loops; automatically clears the instant drag ceases.

---

## 3. Features & Capabilities

### Intelligent Magnetic Alignment
- **Edge Snapping:** Top-to-top, bottom-to-bottom, left-to-left, and right-to-right alignment.
- **Center Alignment:** Center-X and Center-Y alignment with priority penalties so edge alignments take precedence when competing.
- **True Node Visual Bounds:** Computes the exact rendered visual rectangle using `node.getBounding()`, factoring in title bar height, headers, and collapsed states.
- **Alt Key Bypass:** Holding `Alt` (or `Option` on macOS) while dragging completely silences snapping for 100% freeform placement.
- **Dialog & Ghost Protection:** Automatically suppresses snapping when search dialogs (`.lgraph-search-box`, `.comfy-vue-search-box`) or ghost placement nodes are active.

### Minimum Margin & Gap Spacing
- Enforces consistent gap spacing between adjacent nodes (default `20px`, adjustable via popover).
- Guides indicate exact gap distances with dynamic label badges (e.g., `20PX GAP`).

### Multi-Node Arrangement
- **Arrange in Row:** Organizes selected nodes into a tidy horizontal sequence with uniform spacing, aligned along their top edges.
- **Arrange in Column:** Organizes selected nodes into a clean vertical stack with uniform spacing, aligned along their left edges.
- **Anchor Node Preservation:** The node selected first serves as the immovable anchor. Subsequent nodes align relative to it without shifting the workflow position.

### Dimension Measurement & Matching
- **Measure Node:** Captures the exact width and height of any primary selected node.
- **Apply Width:** Normalizes the width of all selected nodes to match the measured width.
- **Apply Height:** Normalizes the height of all selected nodes to match the measured height.
- **Apply Both:** Normalizes both width and height simultaneously.

### Dedicated Undo & Redo History
- Reverses node alignment, row/column ordering, dimension matching, and keyboard movements.
- Consecutive keyboard arrow nudges are automatically grouped into a single undo step.

---

## 4. Keyboard Shortcuts Reference

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + Z` / `Cmd + Z` | **Undo** | Reverses the last alignment, arrangement, dimension match, or move |
| `Ctrl + Shift + Z` / `Cmd + Shift + Z` | **Redo** | Reapplies the previously undone action |
| `Ctrl + Y` / `Cmd + Y` | **Redo (Alt)** | Standard Windows alternate redo shortcut |
| `Arrow Keys` (`↑`, `↓`, `←`, `→`) | **Nudge Nodes** | Moves selected nodes by the configured step (default: `10px`) |
| `Shift + Arrow Keys` | **Accelerated Nudge** | Moves selected nodes by step $\times$ multiplier (default: $5\times = 50\text{px}$) |
| `Alt` (Hold during drag) | **Snap Bypass** | Temporarily disables all magnetic snapping for freeform dragging |

> **Note:** Keyboard shortcuts are automatically disabled when focus is inside text fields, textareas, inputs, or modal dialogs to prevent interfering with text editing.

---

## 5. Controls & Popover Interface

The DS Snap popover can be toggled via the crosshair icon on ComfyUI's action dock bar or via the ComfyUI Command Palette (`DS Snap: Toggle Menu`).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DS SNAP  v1.1                       [ ↶ Undo ] [ ↷ Redo ]      [ ACTIVE ]  [✕]         │
├──────────────┬──────────────┬──────────────────┬─────────────────┬─────────────────────┤
│ MASTER SNAP  │ MIN MARGIN   │ ARRANGE          │ DIMENSIONS      │ KEYBOARD            │
│ [Toggle: ON] │ [Toggle: ON] │ [Row]            │ [ 768 × 1152 ]  │ [Step: 10px]        │
│ Threshold    │ Gap Size     │                  │ [Measure][Clear]│ Quick Chips:        │
│ [-] 10px [+] │ [-] 20px [+] │ [Column]         │ [Width] [Height]│ [1px] [5px]         │
│ Chips: 6-20px│ Chips: 10-40 │ (Anchor Preserved) [ Apply Both ]  │ [10px] [20px]       │
└──────────────┴──────────────┴──────────────────┴─────────────────┴─────────────────────┘
```

### Popover Sections
1. **Header Bar:** Extension logo and version tag, global **Undo** and **Redo** quick action buttons, **ACTIVE/OFF** status pill, and popover close button.
2. **Master Snap Column:** Master enable toggle, precision threshold stepper (`-` / `+`), and quick preset chips (`6px`, `10px`, `15px`, `20px`).
3. **Min Margin Column:** Spacing gap enable toggle, margin stepper, and quick chips (`10px`, `20px`, `30px`, `40px`).
4. **Arrange Column:** 1-click **Row** and **Column** arrangement buttons with first-selected anchor preservation.
5. **Dimensions Column:** Real-time dimension readout, **Measure**, **Clear**, **Width**, **Height**, and **Apply Both** buttons.
6. **Keyboard Column:** Arrow step stepper and quick chips (`1px`, `5px`, `10px`, `20px`).

---

## 6. Deathshot Design System Adherence

- **Dynamic Theme Reactivity:** Uses CSS variables (`--ds-accent`, `--ds-panel`, `--ds-border`, `--ds-text`) with dynamic fallbacks; automatically adapts when accent colors or dark palettes change in the UI.
- **Custom Native Controls:** Built using custom styled steppers, toggle switches, and pills. Zero browser-native inputs or spin controls.
- **Clean Action Bar Mounting:** Seamlessly docks into ComfyUI's top floating action bar alongside the DS Reminder and Settings icons.
