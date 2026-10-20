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
   - Runs after LiteGraph's own move/resize on every pointer move. The natural position is the current one minus the last applied snap offset, so snapping never accumulates, sticks, or drifts.
   - Picks the single closest edge, center, gap, or size match within the threshold. Ties go to the item nearest on the other axis.
   - The threshold is in screen pixels, so snapping feels the same at every zoom level.
   - Only nodes and groups currently in view are snap targets.

3. **Native Foreground Rendering (`onDrawForeground`):**
   - Renders visual guide lines scoped directly between the aligned nodes with extreme edge ticks and high-contrast pill badges directly on the LiteGraph canvas foreground in graph coordinate space.
   - Zooms and pans in 1:1 real-time sync with nodes at all canvas zoom levels.
   - Zero additional DOM elements or background loops; automatically clears the instant drag ceases.

---

## 3. Features & Capabilities

### Magnetic Alignment (Nodes & Groups)
- Moving a node, group, or multi-selection snaps the selection's bounding box to visible nodes and groups.
- **Edges:** left/right/top/bottom to the same edge, or flush against the opposite edge of an item beside it.
- **Centers:** center-to-center (toggle `alignCenters`).
- **Group contents:** a dragged group carries its children; with Ctrl/Cmd held only the group moves, matching ComfyUI.
- **Bounds:** node rects include the title bar and use the drawn width for collapsed nodes, same as LiteGraph.
- **Guides:** a dashed line is drawn along the aligned edge from the moving item to the nearest item on that line, with ticks at both items.
- **Alt Key Bypass:** Hold `Alt` (or `Option` on macOS) while dragging or resizing to disable snapping.

### Minimum Margin & Gap Spacing
- Snaps to the configured gap (default `20px`) between items that sit side by side or stacked.
- Shows a measurement bar between the two facing edges with the gap value.

### Multi-Node Arrangement
- **Arrange in Row:** Organizes selected nodes into a tidy horizontal sequence with uniform spacing, aligned along their top edges.
- **Arrange in Column:** Organizes selected nodes into a clean vertical stack with uniform spacing, aligned along their left edges.
- **Anchor Node Preservation:** The node selected first serves as the immovable anchor. Subsequent nodes align relative to it without shifting the workflow position.

### Resize Snapping
- Works from any node resize corner (NE, SE, SW, NW) and the group resize corner. Only the edges being dragged snap.
- **Horizontal resize:** the moving left/right edge snaps to the edges of visible items and shows a vertical guide, so a node can be made the same width as the node above or below it.
- **Vertical resize:** the moving top/bottom edge snaps to the edges of visible items and shows a horizontal guide, so heights can be matched with neighbours.
- **Size match:** also snaps to the exact width/height of another item and shows `W 320` / `H 180` bars on both items.
- Snaps that would shrink an item below its minimum size are skipped. Resizing a group can snap to the nodes inside it.

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
