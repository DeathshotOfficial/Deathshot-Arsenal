# DeathshotArsenal UI System

This folder is the single source of truth for DeathshotArsenal UI geometry and reusable controls.

## Geometry contract

- `shellInsetBase`: 6px — face inset for nodes that keep the native LiteGraph/ComfyUI base.
- `shellInsetBare`: 6px — face inset for chromeless/baseless nodes.
- The two anchors are intentionally separate but currently identical. This prevents a future change to one shell type from accidentally changing the other.
- `gapSM`: 5px — default internal rhythm.
- `gapMD`: 7px — larger internal rhythm.
- Controls: 28px high, 5px radius.
- Panels: 6px radius.
- Borders: 1px.

The node base is not treated as a card around another card. The shell owns only the small, consistent face inset.

## Reusable controls

`ds_controls.js` (and `window.DSUI`) exposes:

### 1. Sliders & Numeric Inputs
- `createSlider({ min, max, step, value, label, suffix, onChange })`
  - filled track with accent fill
  - draggable thumb
  - numeric input synchronized both ways
- `upgradeLegacyDSRange(input)`
  - applies the centralized filled-track treatment to an existing HTML range input

### 2. Toggles
- `createToggle({ checked, label, description, onChange })`
  - custom theme switch (accessible `role="switch"`)

### 3. Color Picker
- `createColorPicker({ value, label, presets, onChange })`
  - theme-styled trigger with live swatch & uppercase hex display
  - clean theme-aware popup with native color input + hex field + preset swatch palette
  - automatic click-outside dismissal
  - returns `{ root, trigger, getValue(), setValue(hex), destroy() }`

### 4. Segmented Button Groups & Chips (Snap, Modes, Tabs)
- `createSegmentedGroup({ options: [{ id, label }], value, compact, onChange })`
  - standard button row/chips with bottom accent indicator and active state styling
  - optional `compact: true` for tight rows (18px high)
  - returns `{ root, buttons, getValue(), setValue(id), destroy() }`

#### Button & Chip Visual Contract (Strict Deathshot Style):
Every button or chip (active or inactive, in DOM or Canvas) MUST look like an intentional, bordered control:
- **Geometry**: Height: 28px (compact: 22px), Border Radius: 5px, Border: 1px solid `var(--ds-border)`.
- **Inactive State**: Background `var(--ds-panel-2)`, border `1px solid var(--ds-border)`, text `var(--ds-text-muted)`, font-weight 600. NEVER leave inactive buttons as naked, borderless, or transparent text floating in space.
- **Hover State**: Background `var(--ds-btn-hover)`, border `var(--ds-border-active)`, text `var(--ds-text)`.
- **Active State**: Background `var(--ds-panel-2)` (or subtle accent tint), border `1px solid var(--ds-accent)`, text `var(--ds-accent)` (or `--ds-text`), and signature **2px to 2.5px bottom accent indicator bar** (`var(--ds-accent)`). NEVER fill an entire active button with a solid neon block.

### 5. Context Menus, Dropdowns & Popovers
- `createMenu({ items: [{ id, label, description, separator, active }], onSelect, searchable })`
  - standard theme popup menu
  - optional real-time search filter input
  - returns `{ show(anchorOrPosition), hide(), destroy() }`

#### UI Decision Rule: Chip Grid vs. Dropdown:
Choose the UI control based on the size and nature of the options:
- **Small sets & quick toggles (2 to 6 options)**: 
  DO NOT bury them in nested text dropdowns (`submenu: [...]`). 
  Use an inline row or grid of clickable chips/buttons (`.ds-il-chip` / `.ds-ui-segmented`). The user should see and toggle all options directly with 1 click.
  *Examples: Purge modes, button visibility toggles, snap sizes (`Off`, `8`, `16`, `32`, `64`), channel switches (`RGB`, `Alpha`).*
- **Large sets, long catalogs, or open-ended lists (7+ options)**: 
  Use a dropdown menu or searchable popup (`createMenu({ searchable: true })`).
  *Examples: Resample algorithms, model/LoRa pickers, image selection lists, prompt cards.*

### 6. Canvas2D Button Drawing & Bottom Accent Clipping
When drawing buttons on Canvas (`onDrawForeground`):
1. Always draw a 5px rounded rectangle for the button body and stroke with `var(--ds-border)`.
2. When the button is **active**, wrap the bottom accent bar in a clip:
   ```js
   ctx.save();
   ctx.clip(); // Clips strictly to the button's 5px rounded corners
   ctx.fillStyle = colors.accent;
   ctx.fillRect(bx, by + bh - 2.5, bw, 2.5);
   ctx.restore();
   ```
   *Never draw an unclipped rectangle at the bottom of a rounded button, as its sharp 90° corners will poke out of the curved edges.*

### 7. Chromeless / Floating Strip Nodes (LiteGraph)
For ultra-compact or chromeless utility nodes that opt out of the standard ComfyUI container (`_dsNodeBaseOptOut = true`):
- Set `node.shape = 0;` (NEVER `LiteGraph.ROUND_SHAPE` / `2`, which forces LiteGraph to draw an ugly secondary black outer ring).
- Set `node.color = "transparent"; node.bgcolor = "transparent"; node.boxcolor = "transparent";`.
- Set `node.flags = node.flags || {}; node.flags.no_box = true; node.flags.no_header = true; node.flags.no_title = true;`.
- Stub box drawing: `nodeType.prototype.onDrawBox = () => true; nodeType.prototype.drawBox = () => true;` so LiteGraph skips drawing its native box.

### 8. Image & HUD Preview Card
- `createPreviewCard({ title, badge, height, placeholder })`
  - standard dark preview surface with containment frame
  - footer with title and badge (dimensions, ratio, etc.)
  - returns `{ root, box, img, footer, setImage(url, dims), destroy() }`

## Design Anti-Patterns (DO NOT DO THIS)
1. **DO NOT render inactive buttons as plain floating text** without a background or border. Every button must have `--ds-panel-2` background and `--ds-border` stroke.
2. **DO NOT fill an active button with a solid neon accent block**. Active buttons use `--ds-panel-2` background, an accent border, accent text, and a 2px bottom accent indicator bar.
3. **DO NOT use nested dropdown menus (`> submenu`) for short option sets (2–6 items)**. Use a row or grid of clickable chips.
4. **DO NOT draw unclipped rectangles on rounded canvas buttons**, which causes sharp corners to bleed out of curved borders.
5. **DO NOT use `LiteGraph.ROUND_SHAPE` (shape = 2)** on chromeless nodes, as it causes LiteGraph to draw an unwanted outer black outline.
6. **DO NOT put node settings/context menus only in the native ComfyUI right-click menu.** When a context/settings menu is requested, it **MUST** be placed in the node's floating selection toolbar (via the ⚙ gear button or action bar). An option in the right-click menu is acceptable only as a secondary shortcut.
7. **DO NOT bury node options in multi-level cascading submenus (`>`)**. Always use a dedicated custom DOM popover anchored to the toolbar button with direct, flattened controls (segmented chips, custom dropdowns, switches, sliders).
8. **DO NOT use browser-native `<select>` dropdowns in settings popovers**. Always use custom Deathshot styled dropdown menus.
9. **DO NOT omit high-contrast styling on toolbar action/gear buttons.** Action bar icons must use `#e2e8f0` stroke/color so they are immediately visible on the dark floating toolbar without requiring hover.


## Node faces

Call `window.DSGlobalTheme.bindNode(root, node)` for every node DOM UI. The theme system automatically applies the correct shell mode and keeps colors in sync whenever the theme changes:

```js
// In your node creation / widget setup:
window.DSGlobalTheme.bindNode(rootEl, this);
```

For styling DOM elements directly with CSS classes, use the central primitives:
- `.ds-ui-button` — standard button (28px height, 5px radius)
- `.ds-ui-icon-button` — square icon button
- `.ds-ui-input` — text/number inputs
- `.ds-ui-select` — select dropdown
- `.ds-ui-row` — flex row with standardized gap
- `.ds-ui-stack` — vertical column with standardized gap
- `.ds-ui-section` — framed panel box with standard padding

## Context Menus, Settings Panels & Node Toolbar Actions

When the user requests a **"context menu"**, **"settings menu"**, or **"options menu"** for a node:

### 1. Where to Place It: Floating Selection Toolbar (MANDATORY)
- **Mandatory Toolbar Integration**: Modern ComfyUI displays a floating selection toolbox (`.selection-toolbox`) above selected nodes. Custom node settings and actions **MUST** be accessible from a dedicated button (typically a ⚙ Gear button `.ds-actionbar-gear-btn` or custom action button) in this floating toolbar (see `extensions/ds_gear_menu.js` or `getSelectionToolboxCommands`).
- **Optional Right-Click Shortcut**: Adding an entry to ComfyUI's native right-click context menu (via `getExtraMenuOptions`) is acceptable as a secondary shortcut, but **it MUST NOT be the only place**. It must always be accessible from the toolbar.
- **High-Contrast Toolbar Icon**: Action bar icons (such as the ⚙ gear SVG) MUST have explicit high-contrast styling (`color: #e2e8f0 !important; stroke: #e2e8f0;`) so they are clearly visible against dark floating toolbars in both light and dark themes, transitioning to `var(--ds-accent)` on hover and when the popover is active (`.is-active`).

### 2. How to Implement It: Custom DOM Popover (NOT LiteGraph Cascading Menus)
- **NEVER use native LiteGraph / ComfyUI cascading context menus for settings**:
  - Do NOT open a native `LiteGraph.ContextMenu` with tiny cascading `>` hover submenus for node settings.
  - Instead, open a dedicated **Deathshot custom DOM popover panel** (e.g. `.ds-*-settings-popover` or via `window.DSUI.createMenu`), anchored directly to the toolbar button (or cleanly aligned with the node).
- **Direct, Flattened Controls**:
  - Present controls directly inside the popover: segmented chip buttons for small option sets (grid size, media filters, snap, modes), custom Deathshot dropdowns for longer lists, accessible switches for toggles, and sliders for numeric ranges.
  - Keep popover dimensions clean and compact (e.g. width `~300-340px`, max height `80vh` with styled scrolling).
  - Never hide simple options behind multi-level hover submenus (`submenu: [...]`).
- **Custom Deathshot Dropdowns (No Native `<select>`)**:
  - Always use custom styled Deathshot dropdowns (`.ds-*-dropdown` with checkmarks and theme highlights), never unstyled browser-native `<select>` tags.
- **Theme & Switch Integrity**:
  - Popovers must inherit theme variables (`window.DSGlobalTheme.applyToElement(popover)` or clone node CSS variables) so accent color, borders, and dark/light modes work seamlessly.
  - Toggle switches inside flex rows must always have `flex-shrink: 0 !important; box-sizing: border-box !important; overflow: hidden;` so label text never squashes the switch track or pushes the toggle thumb out of its pill boundary.

## Context menus (LiteGraph styling)

The central stylesheet intentionally overrides LiteGraph's old `has_submenu` cyan side bar. Submenus use a small muted `›` indicator instead. Menu entries, separators, hover state, radius and typography share one compact style.

## Recreate compatibility

`../ds_node_fixer_compat.js` contains a narrow compatibility shim for current LiteGraph string node IDs. Some ComfyUI-Manager releases pass a string ID directly to `LGraphNode.connect()`, which can throw before the original node is removed and leave a duplicate replacement. The shim resolves that string to the node object before calling the native method.

## HUD Geometry & Alignment Standards (Socket Lane Placement)

When creating a HUD in the top socket lane (beside input sockets, as seen in `DS Load Image` and `DS Image Compare`):

### 1. LiteGraph Coordinate Space
- In custom widget `draw` and node `onDrawForeground`, `y = 0` is already at the top of the node body (below the title header).
- **DO NOT** add `titleH` or `30px` to `y`. Doing so creates an unnecessary black gap and pushes controls down into the preview area.

### 2. Symmetrical Top & Bottom Margins (8px Rhythm)
- `marginY = 8` (8px top margin, 8px bottom margin).
- `hudH = 34` (standard HUD plate height).
- `hudY = marginY` = 8px from the body top (vertically centered with input sockets at `y ≈ 16` and `y ≈ 34`).
- `contentStartY = hudY + hudH + marginY` = `8 + 34 + 8 = 50px`.
- The preview or control canvas starts immediately at `y = 50px`, keeping the node tight and maximizing usable canvas area.

### 3. Socket Lane Clearance
- Do not let upstream node titles overwrite `input.label`. Keep slot labels short and clean (`input.label = input.name`).
- Dynamically compute left clearance based on measured socket label width, ensuring a generous breathing margin (minimum 20px+ after label text) so HUD panels never touch or overlap input sockets, connection dots, or link labels:
  ```js
  let maxLabelW = 50;
  ctx.font = "bold 12px Inter, system-ui, sans-serif";
  for (const input of node.inputs || []) {
      const lw = ctx.measureText(input.label || input.name || "").width;
      if (lw > maxLabelW) maxLabelW = lw;
  }
  const slotTextStartX = 18; // Slot label start X after connection dot
  const slotMargin = 22;     // Clean spacing between slot label and HUD plate
  const leftX = Math.max(92, Math.round(slotTextStartX + maxLabelW + slotMargin));
  const rightMargin = 8;
  const hudW = Math.max(120, w - leftX - rightMargin);
  ```

### 4. Deathshot Theme Integration & Accent Colors
- Custom canvas widgets must hook into the central theme system so the node frame and header reflect the active Deathshot accent:
  ```js
  const onCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function() {
      onCreated?.apply(this, arguments);
      window.DSGlobalTheme?.applyNodeBase?.(this);
      window.DSGlobalTheme?.subscribe?.(() => {
          this.setDirtyCanvas(true, true);
      });
  };
  ```
- Always resolve theme colors dynamically via `window.DSGlobalTheme.getVar(varName, fallback)`:
  - **Accent**: `node?.properties?.ds_cp_accent || window.DSGlobalTheme?.getVar?.("--ds-accent", "#67e8f9")`
  - **Panel**: `getVar("--ds-panel-2", getVar("--ds-panel", "rgba(18, 22, 30, 0.75)"))`
  - **Border**: `getVar("--ds-border", "rgba(255, 255, 255, 0.14)")`
  - **Text**: `getVar("--ds-text", isLight ? "#0f172a" : "#f8fafc")`
  - **Muted**: `getVar("--ds-text-muted", isLight ? "rgba(15, 23, 42, 0.55)" : "rgba(248, 250, 252, 0.55)")`
- Apply `theme.accent` to active badges, comparison tags, indicators, sliders, and border highlights. Zero hardcoded blues.

## 5. Global Smart Text Contrast System

Text contrast is **centrally owned and calculated by `DSGlobalTheme` (`js/Shared/ds_global_theme.js`)**. Individual nodes should never implement duplicate luminance math or hardcode white/black text over theme colors.

### Smart Tokens Automatically Injected by `DSGlobalTheme`:
- `--ds-on-accent`: High-contrast text color guaranteed to be legible on top of `--ds-accent`. For bright accents (Cyberpunk yellow, neon lime, cyan, pure white), this automatically resolves to `#0a0c10` (deep dark). For dark accents, it resolves to `#ffffff`.
- `--ds-on-accent-shadow`: Paired shadow (`0 1px 0 rgba(255, 255, 255, 0.35)` on bright accents; `0 1px 2px rgba(0, 0, 0, 0.70)` on dark accents).
- `--ds-on-panel`: High-contrast text on panel/input surfaces, preventing low-contrast clashing (e.g. yellow on yellow or dark on dark).
- `--ds-on-bg`: High-contrast text on main node background.

### Usage in CSS:
```css
/* Any button or element filled with accent background */
.my-accent-button.active,
.my-slider-fill {
  background: var(--ds-accent);
  color: var(--ds-on-accent);
  text-shadow: var(--ds-on-accent-shadow);
}
```

### Usage in Canvas / JavaScript:
```js
const onAccentText = window.DSGlobalTheme?.getOnAccentTextColor?.() || "#0a0c10";
const onAccentShadow = window.DSGlobalTheme?.getOnAccentShadow?.() || "none";
const onPanelText = window.DSGlobalTheme?.getVar?.("--ds-on-panel", "#ffffff");
```


---

## Custom DOM-Driven Socket / Connection Point Positioning

Some DS nodes (e.g. `DS_GenerationHub`) position their **output connection sockets** to align with specific DOM rows inside the node's widget — so the wire visually exits from the "Model" row, the "CLIP" row, etc. instead of the standard LiteGraph evenly-spaced slots.

This is a non-trivial pattern with several sharp edges. Read this entire section before implementing or modifying it.

---

### How It Works (The Full Pipeline)

#### 1. Override `getConnectionPos`
```js
this.getConnectionPos = function (is_input, slot_number, out) {
  out = out || new Float32Array(2);
  if (this.flags?.collapsed) {
    return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
  }
  if (!is_input && this.outputs?.[slot_number]) {
    const slot = this.outputs[slot_number];
    if (slot.pos && Number.isFinite(slot.pos[0]) && Number.isFinite(slot.pos[1])) {
      out[0] = this.pos[0] + slot.pos[0];
      out[1] = this.pos[1] + slot.pos[1];
      return out;
    }
  }
  return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
};
```
- `slot.pos` stores a **graph-space offset** from `node.pos` (top-left of the node).
- Always fall back to the default when collapsed or when `slot.pos` is not set.

#### 2. Compute `slot.pos` from DOM Rows (`alignOutputs`)
```js
function alignOutputs(node) {
  if (!node || !node.outputs || !node._anchorEls) return;
  const nx = node.size[0]; // right edge in graph-space (X for output sockets)
  let changed = false;
  for (let i = 0; i < N_OUTPUTS; i++) {
    const out = node.outputs[i];
    const el  = node._anchorEls[i]; // DOM element for that row
    if (!out || !el) continue;
    out.label = " "; // suppress LiteGraph's overlapping text label

    const targetY = getElementCenterY(node, el);
    if (!Number.isFinite(targetY)) continue; // skip hidden elements (see below)

    if (!out.pos || Math.abs(out.pos[0] - nx) > 0.5 || Math.abs(out.pos[1] - targetY) > 0.5) {
      out.pos = [nx, targetY];
      changed = true;
    }
  }
  if (changed) node.setDirtyCanvas?.(true, true);
}
```
- Store references to DOM row elements in `node._anchorEls[slotIndex]` at build time.
- `getElementCenterY` converts the DOM row's screen position to a graph-space Y offset.

#### 3. Convert Screen Position to Graph-Space Y (`getElementCenterY`)

```js
function getElementCenterY(node, el) {
  if (!el || !node._domRoot) return null;
  const w = node._hubWidget;
  const widgetY      = Number.isFinite(w?.y) ? w.y : (node.widgets_start_y ?? 2);
  const widgetMargin = Number.isFinite(w?.margin) ? w.margin : (w?.options?.margin ?? 6);
  const scale        = app.canvas?.ds?.scale || 1.0;
  if (scale <= 0) return null;

  const rootRect = node._domRoot.getBoundingClientRect();
  const elRect   = el.getBoundingClientRect();

  // ⚠️  CRITICAL: Guard against hidden elements (see "The Hidden-Element Bug" below)
  if (!rootRect.height || !elRect.height) return null;

  // The relative distance between two elements in the same DOM subtree is
  // pan-stable: panning moves both by the same amount, so their difference is constant.
  // Dividing by scale converts screen-space px → graph-space units.
  const localCenterY = (elRect.top + elRect.height * 0.5 - rootRect.top) / scale;
  return Math.round(widgetY + widgetMargin + localCenterY);
}
```

---

### ⚠️ The Hidden-Element Bug (Critical — Read Before Touching This)

**Symptom:** Link endpoints visibly "shift" to the top of the node after panning the canvas, then snap back when the node comes back into view.

**Root cause:** When a node's DOM widget scrolls off-screen, ComfyUI hides it (`display:none` or moves it off-viewport). `getBoundingClientRect()` on hidden elements returns `{top: 0, height: 0, ...}` — all zeros. This makes:

```
localCenterY = (0 + 0*0.5 - 0) / scale = 0
```

This **is a valid finite number**, so `alignOutputs` writes `slot.pos[1] = widgetY + margin + 0`, moving every output socket to the top of the node. The 250ms poll then "fixes" it when the node comes back into view, causing a visible flash-shift.

**The Fix — one line:**
```js
// If either element has no rendered height, bail — keep the last known good slot.pos
if (!rootRect.height || !elRect.height) return null;
```

Returning `null` causes `!Number.isFinite(null)` → `alignOutputs` skips that slot and **preserves the last known good `slot.pos`**. Links stay correct while off-screen and are re-measured as soon as the widget is visible again.

**DO NOT replace `getBoundingClientRect` with `offsetTop` traversal** — this was tried and broke link positions entirely because:
- `offsetParent` chains follow CSS `position` context, not the DOM parent tree; they don't reliably terminate at `_domRoot`.
- When elements are `display: none`, `offsetTop` returns 0 for everything — same broken result as the original bug, but worse because there's no height guard.

---

### Scheduling Alignment (`scheduleAlign` + `watchAlign`)

```js
function scheduleAlign(node) {
  if (!node || node._dsRemoved) return;
  const run = () => { if (node.graph && !node._dsRemoved) alignOutputs(node); };
  requestAnimationFrame(run);
  setTimeout(run, 50);
  setTimeout(run, 180);
}

function watchAlign(node) {
  // Poll every 250ms to keep in sync during content changes (rows added/removed etc.)
  if (node._dsAlignPoll) return;
  node._dsAlignPoll = setInterval(() => {
    if (!node.graph || node._dsRemoved) { unwatchAlign(node); return; }
    alignOutputs(node);
  }, 250);
}

function unwatchAlign(node) {
  if (node?._dsAlignPoll) { clearInterval(node._dsAlignPoll); node._dsAlignPoll = null; }
}
```

Call `scheduleAlign(node)` whenever node content changes (rows added/removed, resize, catalog load).
Call `watchAlign(node)` once after `onNodeCreated`.
Call `unwatchAlign(node)` in `onRemoved`.

**Also install a canvas `wheel` listener** to re-align immediately on zoom (the 250ms poll is too slow to prevent a visible shift during pinch/scroll zoom):

```js
function installHubZoomListener(NODE_TYPE) {
  const canvasEl = app.canvas?.canvas;
  if (!canvasEl || canvasEl._dsHubZoomBound) return;
  canvasEl._dsHubZoomBound = true;
  canvasEl.addEventListener("wheel", () => {
    for (const n of app.graph?._nodes || []) {
      if (n.type === NODE_TYPE && n._anchorEls && !n._dsRemoved) {
        requestAnimationFrame(() => alignOutputs(n));
      }
    }
  }, { passive: true });
}
```

---

### Summary: What To Store and When

| What | Where | When to Update |
|---|---|---|
| DOM row refs | `node._anchorEls[i]` | Once, at `buildRoot` / `_renderUI` time |
| Socket X (right edge) | `slot.pos[0] = node.size[0]` | Every `alignOutputs` call |
| Socket Y (row center) | `slot.pos[1] = getElementCenterY(...)` | Every `alignOutputs` call, **skip if null** |
| Position override | `node.getConnectionPos(...)` | Auto-called by LiteGraph each frame |
