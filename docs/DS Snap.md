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
       │ (Natural Pos & │        │ (Popover Panel) │
       │  Edge Scoring) │        └─────────────────┘
       └───────┬────────┘
               │
       ┌───────▼──────────────────────────┐
       │  LiteGraph Canvas Render Hook    │
       │    (Native onDrawForeground)     │
       └──────────────────────────────────┘
```

1. **Reactive Configuration Store (`DSSnapStore`):**
   - Single source of truth for snapping thresholds, min-margin gaps, edge/center alignment toggles, and arrow step sizes.
   - Automatically persists settings to browser storage (`DS_SNAP_CONFIG_V1`).

2. **Snapping & Edge Alignment Engine (`DSSnapEngine`):**
   - True virtual natural drag trajectory tracking (`naturalX`, `naturalY`), preventing delta accumulation, sticky traps, or drag jitter.
   - Spatial candidate search prioritizing immediate visual neighbors ($< 650\text{px}$) over distant nodes.
   - Distance-weighted scoring formula that favors direct extreme edge alignments (Top-to-Top, Bottom-to-Bottom, Left-to-Left, Right-to-Right) and exact margin spacing over distant centerlines.
   - Clean breakout threshold ensuring fluid movement without sticky traps or resistance.
   - Mouse release commitment: firmly retains the exact snapped position on pointer release, preventing grid-snap drift or displacement.

3. **Native Foreground Rendering (`onDrawForeground`):**
   - Renders visual guide lines scoped directly between the aligned nodes with extreme edge ticks and high-contrast pill badges directly on the LiteGraph canvas foreground in graph coordinate space.
   - Zooms and pans in 1:1 real-time sync with nodes at all canvas zoom levels.
   - Zero additional DOM elements or background loops; automatically clears the instant drag ceases.

---

## 3. Features & Capabilities

### Intelligent Magnetic Alignment (Nodes & Groups)
- **Universal Graph Item Support:** Full alignment and magnetic snapping for both individual nodes and workflow group boxes (`LGraphGroup`).
- **Group-to-Group & Group-to-Node Snapping:** Dragging a group aligns with other groups or nearby nodes; dragging a node aligns with neighboring nodes or group boundaries.
- **Lockstep Child Node Movement:** When dragging a group, all internal nodes move synchronously with the group's exact snapped positions, preventing drift or displacement.
- **Edge Snapping:** Top-to-top, bottom-to-bottom, left-to-left, and right-to-right alignment with primary scoring priority.
- **Extreme Edge Flush Snapping:** Bottom-to-top and right-to-left touching edge alignment.
- **Center Alignment:** Center-X and Center-Y alignment with lower priority when competing with edge alignments.
- **True Visual Bounds:** Computes the exact rendered visual rectangle dynamically (`getItemVisualBoundsAt`), factoring in title bar height, headers, collapsed states, and group bounding boxes without reading stale cached bounds.
- **Bounding Box Distance Scaling:** Uses true spatial gap calculations (`getBoundingBoxDistance`), allowing massive group boxes (e.g. 1000px+) to cleanly snap side-by-side or stacked without distance cutoff issues.
- **Scoped Guidelines:** Guidelines connect directly from the moving item to the target candidate with extreme-edge tick marks instead of infinite canvas lines.
- **Alt Key Bypass:** Holding `Alt` (or `Option` on macOS) while dragging completely silences snapping for 100% freeform placement.
- **Dialog & Ghost Protection:** Automatically suppresses snapping when search dialogs (`.lgraph-search-box`, `.comfy-vue-search-box`) or ghost placement nodes are active.

### Minimum Margin & Gap Spacing
- Enforces consistent gap spacing between adjacent nodes and groups (default `20px`, adjustable via popover).
- Guides indicate exact gap distances with dynamic label badges (e.g., `20PX GAP`).

### Multi-Node Arrangement
- **Arrange in Row:** Organizes selected nodes into a tidy horizontal sequence with uniform spacing, aligned along their top edges.
- **Arrange in Column:** Organizes selected nodes into a clean vertical stack with uniform spacing, aligned along their left edges.
- **Anchor Node Preservation:** The node selected first serves as the immovable anchor. Subsequent nodes align relative to it without shifting the workflow position.

### Intelligent Resize Snapping & Alignment
- **Edge Alignment During Resize:** When dragging the resize corner of a node or group:
  - **Right Edge Align:** Snaps the right edge to match the right edge, left edge, or margin gap of neighboring nodes or groups.
  - **Bottom Edge Align:** Snaps the bottom edge to match the bottom edge, top edge, or margin gap of neighboring nodes or groups.
- **Dimension Matching:** Automatically detects and snaps to matching widths and heights of other workflow items.
- **Visual Resize Guidelines:** Displays scoped horizontal and vertical guidelines with extreme edge tick marks and dynamic badge labels (e.g., `RIGHT ALIGN`, `BOTTOM ALIGN`, `WIDTH 320PX`, `HEIGHT 180PX`).
- **Release Commitment:** Firmly locks and commits the snapped dimensions on pointer release, ensuring no native resize jitter or position reversion.

### Dimension Measurement & Matching
- **Measure Node:** Captures the exact width and height of any primary selected node.
- **Apply Width:** Normalizes the width of all selected nodes to match the measured width.
- **Apply Height:** Normalizes the height of all selected nodes to match the measured height.
- **Apply Both:** Normalizes both width and height simultaneously.

---

## 4. Keyboard Shortcuts Reference

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Arrow Keys` (`↑`, `↓`, `←`, `→`) | **Nudge Nodes & Groups** | Moves selected nodes and groups (including group children) by the configured step (default: `10px`) |
| `Shift + Arrow Keys` | **Accelerated Nudge** | Moves selected items by step $\times$ multiplier (default: $5\times = 50\text{px}$) |
| `Alt` (Hold during drag) | **Snap Bypass** | Temporarily disables all magnetic snapping for freeform dragging |

> **Note:** Undo/Redo shortcuts (`Ctrl+Z`, `Ctrl+Y`) are left to ComfyUI's native handling to prevent conflicting with native node shortcuts. Keyboard nudge is disabled when focus is inside text fields, textareas, inputs, or modal dialogs.

---

## 5. Controls & Popover Interface

The DS Snap popover can be toggled via the crosshair icon on ComfyUI's action dock bar or via the ComfyUI Command Palette (`DS Snap: Toggle Menu`).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ DS SNAP  v1.1                                                        [✕]         │
├──────────────┬──────────────┬──────────────────┬─────────────────┬───────────────┤
│ SNAP         │ MARGIN       │ ARRANGE          │ DIMENSIONS      │ ARROW STEP    │
│ [Toggle: ON] │ [Toggle: ON] │ [Row]            │ [Measure][Clear]│ [Step: 10px]  │
│ [ 10px ]     │ [ 20px ]     │ [Column]         │ [Width] [Height]│ SHIFT=5×      │
│              │              │                  │ [ Apply Both ]  │               │
└──────────────┴──────────────┴──────────────────┴─────────────────┴───────────────┘
```

### Popover Sections
1. **Brand Bar:** Extension logo and version tag, close button.
2. **Snap:** Master snap enable toggle and threshold input (`px`).
3. **Margin:** Minimum gap spacing enable toggle and margin gap input (`px`).
4. **Arrange:** 1-click **Row** and **Column** arrangement buttons with anchor preservation.
5. **Dimensions:** **Measure**, **Clear**, **Width**, **Height**, and **Apply Both** buttons.
6. **Arrow Step:** Keyboard arrow nudge step input (`px`) with Shift multiplier tag.

---

## 6. Deathshot Design System Adherence

- **Dynamic Theme Reactivity:** Uses CSS variables (`--ds-accent`, `--ds-panel`, `--ds-border`, `--ds-text`) with dynamic fallbacks; automatically adapts when accent colors or dark palettes change in the UI.
- **Custom Native Controls:** Built using custom styled steppers, toggle switches, and pills. Zero browser-native inputs or spin controls.
- **Clean Action Bar Mounting:** Seamlessly docks into ComfyUI's top floating action bar alongside the DS Reminder and Settings icons.
