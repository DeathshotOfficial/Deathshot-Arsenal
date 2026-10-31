// Deathshot Arsenal — DS Snap
// Frontend Extension for ComfyUI Node Placement, Alignment, Spacing, Resizing, and Arrangement.
//
// Provides intelligent visual alignment guides, positional snapping with hysteresis,
// keyboard arrow precision movement, minimum node margin enforcement, multi-node
// row/column arrangement, dimension measurement and matching, and intelligent resize guides.
//
// Adheres strictly to the DeathshotArsenal UI geometry contract & design system.
// Zero browser-native controls.

import { app } from "/scripts/app.js";
import { Toggle } from "/extensions/DeathshotArsenal/UIElements/Controls/Toggle.js";

const EXTENSION_NAME = "DeathshotArsenal.DSSnap";
const STORAGE_KEY = "DS_SNAP_CONFIG_V1";

// ---------------------------------------------------------------------------
// 1. DEDICATED DS SNAP ACTION BAR ICON (High-contrast, Theme-Aware)
// ---------------------------------------------------------------------------
const DS_SNAP_ICON_SVG = `
<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ds-snap-svg">
  <!-- Precision Alignment Crosshairs -->
  <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2" opacity="0.65" />
  <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2" opacity="0.65" />
  <!-- Magnetic Snapping Node Frame -->
  <rect x="5.5" y="5.5" width="13" height="13" rx="3" stroke="currentColor" stroke-width="1.8" />
  <!-- Precision Center Target -->
  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
  <!-- Corner Alignment Markers -->
  <circle cx="5.5" cy="5.5" r="1.1" fill="currentColor" />
  <circle cx="18.5" cy="18.5" r="1.1" fill="currentColor" />
</svg>
`;

const ICON_ROW = `
<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1.5" y="3.5" width="3.5" height="9" rx="1" />
  <rect x="6.25" y="3.5" width="3.5" height="9" rx="1" />
  <rect x="11" y="3.5" width="3.5" height="9" rx="1" />
</svg>
`;

const ICON_COL = `
<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3.5" y="1.5" width="9" height="3.5" rx="1" />
  <rect x="3.5" y="6.25" width="9" height="3.5" rx="1" />
  <rect x="3.5" y="11" width="9" height="3.5" rx="1" />
</svg>
`;

// ---------------------------------------------------------------------------
// 2. CONFIGURATION & PERSISTENCE STORE
// ---------------------------------------------------------------------------
class DSSnapStore {
  constructor() {
    this.state = {
      enabled: true,
      snapThreshold: 10,
      minMarginEnabled: true,
      minMarginX: 20,
      minMarginY: 20,
      alignCenters: true,
      alignEdges: true,
      alignSpacing: true,
      resizeSnap: true,
      keyboardStep: 10,
      keyboardShiftMultiplier: 5,
      measuredWidth: null,
      measuredHeight: null,
    };
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.state = { ...this.state, ...parsed };
        }
      }
    } catch (e) {
      console.warn("[DS Snap] Could not load stored config:", e);
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn("[DS Snap] Could not save config:", e);
    }
  }

  update(partial) {
    this.state = { ...this.state, ...partial };
    this.save();
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch (err) {
        console.error("[DS Snap] Store listener error:", err);
      }
    }
  }
}

export const snapStore = new DSSnapStore();

// ---------------------------------------------------------------------------
// 3. TRUE VISUAL BOUNDS & GRAPH ITEM DETECTION (NODES & GROUPS)
// ---------------------------------------------------------------------------
function isGroup(item) {
  if (!item || typeof item !== "object") return false;
  // If it has node-specific properties, it is a node, not a group
  if (typeof item.type === "string" && item.id !== undefined) return false;
  if (item.constructor?.name === "LGraphNode") return false;
  const LG = window.LiteGraph || globalThis.LiteGraph;
  if (LG?.LGraphNode && item instanceof LG.LGraphNode) return false;

  // True group indicators
  if (item.constructor?.name === "LGraphGroup") return true;
  if (LG?.LGraphGroup && item instanceof LG.LGraphGroup) return true;
  if (item.is_group === true || item.isGroup === true) return true;
  if (typeof item.recomputeInsideNodes === "function") return true;
  if (item._children instanceof Set || (Array.isArray(item._nodes) && !Array.isArray(item.inputs))) return true;
  return false;
}

function isNode(item) {
  if (!item || typeof item !== "object") return false;
  if (isGroup(item)) return false;
  if (item.constructor?.name === "LGraphNode") return true;
  const LG = window.LiteGraph || globalThis.LiteGraph;
  if (LG?.LGraphNode && item instanceof LG.LGraphNode) return true;
  if (typeof item.type === "string" && item.id !== undefined) return true;

  const p = item.pos;
  const s = item.size;
  if (!p || !s) return false;
  if (typeof p[0] !== "number" || typeof p[1] !== "number") return false;
  if (typeof s[0] !== "number" || typeof s[1] !== "number") return false;
  return item.id !== undefined || item.type !== undefined;
}

function isGraphItem(item) {
  return isNode(item) || isGroup(item);
}

function isPinned(item) {
  if (!item || typeof item !== "object") return false;
  if (item.flags && Boolean(item.flags.pinned)) return true;
  if (item.flags && item.flags.allow_interaction === false) return true;
  if (typeof item.pinned === "boolean" && item.pinned) return true;
  if (typeof item.is_pinned === "boolean" && item.is_pinned) return true;
  return false;
}

function getGraphGroups(graph = app?.graph || app?.canvas?.graph) {
  if (!graph) return [];
  if (Array.isArray(graph.groups)) return graph.groups;
  if (Array.isArray(graph._groups)) return graph._groups;
  return [];
}

function makeRect(left, top, right, bottom) {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function offsetRect(r, dx, dy) {
  return makeRect(r.left + dx, r.top + dy, r.right + dx, r.bottom + dy);
}

function unionRects(rects) {
  return makeRect(
    Math.min(...rects.map((r) => r.left)),
    Math.min(...rects.map((r) => r.top)),
    Math.max(...rects.map((r) => r.right)),
    Math.max(...rects.map((r) => r.bottom))
  );
}

/**
 * Visual rect of a node or group, computed from its current pos/size.
 * Mirrors LGraphNode.measure(): includes the title bar; collapsed nodes use their drawn width.
 */
function getItemRect(item) {
  const x = item.pos[0];
  const y = item.pos[1];
  if (isGroup(item)) return makeRect(x, y, x + item.size[0], y + item.size[1]);

  const LG = globalThis.LiteGraph;
  const titleH = LG?.NODE_TITLE_HEIGHT ?? 30;
  const titleMode = item.title_mode ?? item.constructor?.title_mode;
  const top = titleMode === (LG?.NO_TITLE ?? 1) || titleMode === (LG?.TRANSPARENT_TITLE ?? 2) ? y : y - titleH;
  if (item.flags?.collapsed) {
    return makeRect(x, top, x + (item.boundingRect?.[2] || LG?.NODE_COLLAPSED_WIDTH || 80), top + titleH);
  }
  return makeRect(x, top, x + item.size[0], y + item.size[1]);
}

function getSelectedNodes(canvas = app?.canvas) {
  const result = new Set();

  if (canvas?.selectedItems) {
    for (const item of canvas.selectedItems) {
      if (isNode(item)) result.add(item);
    }
  }

  if (canvas?.selected_nodes && typeof canvas.selected_nodes === "object") {
    for (const item of Object.values(canvas.selected_nodes)) {
      if (isNode(item)) result.add(item);
    }
  }

  const graph = canvas?.graph || app?.graph;
  if (result.size === 0 && graph) {
    const allNodes = graph.nodes || graph._nodes || [];
    for (const node of allNodes) {
      if ((node?.selected || node?.is_selected) && isNode(node)) result.add(node);
    }
  }

  if (result.size === 0 && canvas?.current_node && isNode(canvas.current_node)) {
    result.add(canvas.current_node);
  }

  return [...result];
}

function getSelectedGroups(canvas = app?.canvas) {
  const result = new Set();
  if (canvas?.selected_group && isGroup(canvas.selected_group)) {
    result.add(canvas.selected_group);
  }
  if (canvas?.selectedItems) {
    for (const item of canvas.selectedItems) {
      if (isGroup(item)) result.add(item);
    }
  }
  return [...result];
}

function getSelectedGraphItems(canvas = app?.canvas) {
  const nodes = getSelectedNodes(canvas);
  const groups = getSelectedGroups(canvas);
  return [...new Set([...nodes, ...groups])];
}

function getPrimarySelectedNode(canvas = app?.canvas) {
  const nodes = getOrderedSelectedNodes(canvas);
  if (nodes.length > 0) return nodes[0];
  if (canvas?.current_node && isNode(canvas.current_node)) return canvas.current_node;
  const anySelected = getSelectedNodes(canvas);
  if (anySelected.length > 0) return anySelected[0];
  return null;
}

// Selection order tracking (preserves exact user click order so 1st clicked node is Anchor)
let selectionHistory = [];

export function recordNodeSelection(nodeId, isMulti = false) {
  if (!nodeId) return;
  const sId = String(nodeId);
  if (isMulti) {
    if (!selectionHistory.includes(sId)) {
      selectionHistory.push(sId);
    }
  } else {
    selectionHistory = [sId];
  }
}

export function getOrderedSelectedNodes(canvas = app?.canvas) {
  const currentSelected = getSelectedNodes(canvas);
  if (currentSelected.length <= 1) return currentSelected;

  const currentMap = new Map();
  for (const n of currentSelected) {
    currentMap.set(String(n.id), n);
  }

  const ordered = [];
  // 1. Add currently selected nodes in their historical selection click order
  for (const id of selectionHistory) {
    if (currentMap.has(id)) {
      ordered.push(currentMap.get(id));
      currentMap.delete(id);
    }
  }

  // 2. Any remaining selected nodes (e.g. from marquee box select) added in place
  for (const n of currentMap.values()) {
    ordered.push(n);
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// 4. ALIGNMENT & SNAPPING ENGINE
// ---------------------------------------------------------------------------
// Snapping runs in a bubble-phase window pointermove listener, i.e. after LiteGraph
// has applied its own move/resize for the event. Drags are incremental in LiteGraph,
// so the natural position is the current one minus the offset we applied last time.
// Resizes are recomputed from the start bounds on every event, so they are natural as-is.

const AXES = {
  x: { start: "left", end: "right", center: "centerX", size: "width", crossStart: "top", crossEnd: "bottom", sizeLabel: "W" },
  y: { start: "top", end: "bottom", center: "centerY", size: "height", crossStart: "left", crossEnd: "right", sizeLabel: "H" },
};

// Tie-break order when two snaps are equally close.
const KIND_RANK = { align: 0, flush: 1, gap: 2, size: 3, center: 4 };

// Distance between two rects along the axis perpendicular to `A`; 0 when they sit side by side.
function crossGap(a, b, A) {
  return Math.max(0, a[A.crossStart] - b[A.crossEnd], b[A.crossStart] - a[A.crossEnd]);
}

/**
 * Finds the closest snap for the given edges of `src` along one axis.
 * `features` lists which edges of src may move ("start", "center", "end").
 * `opts.fixed` (resize only) is the opposite, non-moving edge; enables size matching.
 * `opts.minSize` (resize only) rejects snaps that would shrink below the minimum.
 */
function findSnap(axis, src, features, targets, opts) {
  const A = AXES[axis];
  let best = null;

  const consider = (feature, line, kind, target) => {
    const diff = line - src[A[feature]];
    const absDiff = Math.abs(diff);
    if (absDiff > opts.threshold) return;
    if (opts.minSize != null) {
      const size = feature === "end" ? line - opts.fixed : opts.fixed - line;
      if (size < opts.minSize) return;
    }
    const cross = crossGap(src, target, A);
    const rank = KIND_RANK[kind];
    if (best) {
      const bestAbs = Math.abs(best.diff);
      if (absDiff > bestAbs + 0.01) return;
      if (absDiff >= bestAbs - 0.01 && (cross > best.cross || (cross === best.cross && rank >= best.rank))) return;
    }
    best = { axis, feature, line, diff, kind, target, cross, rank };
  };

  for (const t of targets) {
    const beside = crossGap(src, t, A) === 0;
    for (const feature of features) {
      if (feature === "center") {
        if (opts.centers) consider("center", t[A.center], "center", t);
        continue;
      }
      const isStart = feature === "start";
      if (opts.edges) {
        consider(feature, t[A[feature]], "align", t);
        if (beside) consider(feature, t[isStart ? A.end : A.start], "flush", t);
      }
      if (beside && opts.gap > 0) {
        consider(feature, isStart ? t[A.end] + opts.gap : t[A.start] - opts.gap, "gap", t);
      }
      if (opts.fixed != null) {
        consider(feature, isStart ? opts.fixed - t[A.size] : opts.fixed + t[A.size], "size", t);
      }
    }
  }
  return best;
}

/**
 * Converts a snap into a drawable guide, measured against the snapped source rect.
 * Edge/center lines are drawn to the nearest item that actually lies on the line.
 */
function buildGuide(snap, src, targets, gap) {
  const A = AXES[snap.axis];
  if (snap.kind === "gap") {
    return { kind: "gap", axis: snap.axis, src, target: snap.target, label: `${gap}px` };
  }
  if (snap.kind === "size") {
    return { kind: "size", axis: snap.axis, src, target: snap.target, label: `${A.sizeLabel} ${Math.round(snap.target[A.size])}` };
  }
  const keys = snap.kind === "center" ? [A.center] : [A.start, A.end];
  let target = snap.target;
  let nearest = crossGap(src, target, A);
  for (const t of targets) {
    if (!keys.some((k) => Math.abs(t[k] - snap.line) < 0.5)) continue;
    const d = crossGap(src, t, A);
    if (d < nearest) {
      nearest = d;
      target = t;
    }
  }
  return { kind: "line", axis: snap.axis, at: snap.line, src, target };
}

function addNestedItems(item, out) {
  if (out.has(item) || item.pinned) return;
  out.add(item);
  if (item.children) {
    for (const child of item.children) addNestedItems(child, out);
  }
}

class DSSnapEngine {
  constructor(store) {
    this.store = store;
    this.guides = [];
    this.drag = null;

    // Toast feedback notification
    this._toastTimer = null;
    this._toastEl = null;
  }

  hasGuides() {
    return this.guides.length > 0;
  }

  showToast(message, duration = 1800) {
    if (this._toastEl) {
      this._toastEl.remove();
      this._toastEl = null;
    }
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }

    const toast = document.createElement("div");
    toast.className = "ds-snap-toast";
    toast.textContent = message;
    if (window.DSGlobalTheme?.applyToElement) {
      window.DSGlobalTheme.applyToElement(toast);
    }
    document.body.appendChild(toast);
    this._toastEl = toast;

    this._toastTimer = setTimeout(() => {
      toast.classList.add("is-fading");
      setTimeout(() => {
        toast.remove();
        if (this._toastEl === toast) this._toastEl = null;
      }, 250);
    }, duration);
  }

  setGuides(canvas, guides) {
    if (guides.length === 0 && this.guides.length === 0) return;
    this.guides = guides;
    canvas.setDirty?.(true, false);
  }

  end(canvas) {
    this.drag = null;
    this.setGuides(canvas, []);
  }

  getOptions(canvas, axis) {
    const state = this.store.state;
    const scale = canvas.ds?.scale || 1;
    const margin = axis === "x" ? state.minMarginX : state.minMarginY;
    return {
      // Threshold is in screen pixels, so snapping feels the same at every zoom level.
      threshold: Math.max(1, Number(state.snapThreshold) || 10) / scale,
      gap: state.alignSpacing && state.minMarginEnabled ? Number(margin) || 0 : 0,
      edges: state.alignEdges,
      centers: state.alignCenters,
    };
  }

  /** Visible nodes and groups, excluding the items being moved or resized. */
  collectTargets(canvas, exclude) {
    const graph = canvas.graph;
    const [vx, vy, vw, vh] = canvas.visible_area;
    const targets = [];
    for (const item of [...(graph._nodes || graph.nodes || []), ...getGraphGroups(graph)]) {
      if (exclude.has(item)) continue;
      const r = getItemRect(item);
      if (r.right < vx || r.left > vx + vw || r.bottom < vy || r.top > vy + vh) continue;
      targets.push(r);
    }
    return targets;
  }

  update(canvas, e) {
    const state = this.store.state;
    const active =
      state.enabled &&
      (e.buttons & 1) === 1 &&
      canvas.pointer?.isDown &&
      !canvas.linkConnector?.isConnecting &&
      !canvas.dragging_rectangle &&
      !canvas.dragging_canvas;

    if (active && state.resizeSnap && isNode(canvas.resizing_node)) {
      this.resizeItem(canvas, canvas.resizing_node, canvas.pointer.resizeDirection || "SE", e);
    } else if (active && state.resizeSnap && isGroup(canvas.resizingGroup)) {
      this.resizeItem(canvas, canvas.resizingGroup, "SE", e);
    } else if (active && canvas.isDragging && canvas.selectedItems?.size) {
      this.dragItems(canvas, e);
    } else {
      this.end(canvas);
    }
  }

  dragItems(canvas, e) {
    if (!this.drag) {
      // Same item set LiteGraph moves (getDraggedItems): the selection plus nested group
      // contents, or only the selection while Ctrl/Cmd is held.
      const selected = [...canvas.selectedItems];
      const nested = new Set();
      for (const it of selected) addNestedItems(it, nested);
      this.drag = {
        anchors: selected.filter((it) => isGraphItem(it) && !it.pinned),
        items: e.ctrlKey || e.metaKey ? selected : [...nested],
        exclude: new Set([...selected, ...nested]),
        dx: 0,
        dy: 0,
      };
    }
    const drag = this.drag;
    if (drag.anchors.length === 0) return;

    const current = unionRects(drag.anchors.map(getItemRect));
    const natural = offsetRect(current, -drag.dx, -drag.dy);

    const optsX = this.getOptions(canvas, "x");
    const optsY = this.getOptions(canvas, "y");
    let snapX = null;
    let snapY = null;
    let targets = [];
    if (!e.altKey) {
      targets = this.collectTargets(canvas, drag.exclude);
      snapX = findSnap("x", natural, ["start", "center", "end"], targets, optsX);
      snapY = findSnap("y", natural, ["start", "center", "end"], targets, optsY);
    }

    const dx = snapX ? snapX.diff : 0;
    const dy = snapY ? snapY.diff : 0;
    if (dx !== drag.dx || dy !== drag.dy) {
      for (const it of drag.items) it.move(dx - drag.dx, dy - drag.dy, true);
      drag.dx = dx;
      drag.dy = dy;
    }

    const snapped = offsetRect(natural, dx, dy);
    const guides = [];
    if (snapX) guides.push(buildGuide(snapX, snapped, targets, optsX.gap));
    if (snapY) guides.push(buildGuide(snapY, snapped, targets, optsY.gap));
    this.setGuides(canvas, guides);
  }

  resizeItem(canvas, item, direction, e) {
    if (e.altKey) {
      this.setGuides(canvas, []);
      return;
    }

    const natural = getItemRect(item);
    const group = isGroup(item);
    const titleH = group ? 0 : item.pos[1] - natural.top;
    let minW;
    let minH;
    if (group) {
      const LG = globalThis.LiteGraph;
      minW = LG?.LGraphGroup?.minWidth ?? 140;
      minH = LG?.LGraphGroup?.minHeight ?? 80;
    } else {
      const min = item.computeSize();
      minW = min[0];
      minH = min[1] + titleH;
    }

    // Groups contain their children, so their edges are useful targets when resizing a group.
    const targets = this.collectTargets(canvas, new Set([item]));
    const xFeature = direction.includes("W") ? "start" : "end";
    const yFeature = direction.includes("N") ? "start" : "end";
    const fixedX = xFeature === "end" ? natural.left : natural.right;
    const fixedY = yFeature === "end" ? natural.top : natural.bottom;

    const optsX = { ...this.getOptions(canvas, "x"), centers: false, fixed: fixedX, minSize: minW };
    const optsY = { ...this.getOptions(canvas, "y"), centers: false, fixed: fixedY, minSize: minH };
    const snapX = findSnap("x", natural, [xFeature], targets, optsX);
    const snapY = findSnap("y", natural, [yFeature], targets, optsY);

    const r = { ...natural };
    if (snapX) r[AXES.x[xFeature]] = snapX.line;
    if (snapY) r[AXES.y[yFeature]] = snapY.line;

    if (snapX || snapY) {
      if (group) {
        item.resize(r.right - r.left, r.bottom - r.top);
      } else {
        item.pos = [r.left, r.top + titleH];
        item.setSize([r.right - r.left, r.bottom - r.top - titleH]);
      }
    }

    const snapped = makeRect(r.left, r.top, r.right, r.bottom);
    const guides = [];
    if (snapX) guides.push(buildGuide(snapX, snapped, targets, optsX.gap));
    if (snapY) guides.push(buildGuide(snapY, snapped, targets, optsY.gap));
    this.setGuides(canvas, guides);
  }

  /**
   * Draws the active guides in graph space (called from onDrawForeground).
   */
  drawGuides(ctx, canvas) {
    if (!ctx || this.guides.length === 0) return;

    const accent =
      window.DSGlobalTheme?.getVar?.("--ds-color-accent") ||
      window.DSGlobalTheme?.getVar?.("--ds-accent") ||
      getComputedStyle(document.documentElement).getPropertyValue("--ds-color-accent")?.trim() ||
      getComputedStyle(document.documentElement).getPropertyValue("--ds-accent")?.trim() ||
      "#67e8f9";
    const scale = canvas.ds?.scale || 1;
    const px = 1 / scale;
    const tick = 5 * px;

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 * px;

    const segment = (x1, y1, x2, y2, dashed) => {
      ctx.setLineDash(dashed ? [5 * px, 4 * px] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    // Solid measurement bar with end ticks between a and b along `axis`, at cross position c.
    const bar = (axis, a, b, c) => {
      if (axis === "x") {
        segment(a, c, b, c, false);
        segment(a, c - tick, a, c + tick, false);
        segment(b, c - tick, b, c + tick, false);
      } else {
        segment(c, a, c, b, false);
        segment(c - tick, a, c + tick, a, false);
        segment(c - tick, b, c + tick, b, false);
      }
    };

    const pill = (text, cx, cy) => {
      const fontSize = 11 * px;
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 12 * px;
      const h = fontSize + 7 * px;
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(10, 12, 16, 0.94)";
      ctx.lineWidth = 1.2 * px;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 4 * px);
      else ctx.rect(cx - w / 2, cy - h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
      ctx.lineWidth = 1.5 * px;
    };

    for (const g of this.guides) {
      const { src, target } = g;
      const A = AXES[g.axis];

      if (g.kind === "line") {
        // Line across both items along the aligned edge, with ticks where it meets each item.
        const from = Math.min(src[A.crossStart], target[A.crossStart]) - 8 * px;
        const to = Math.max(src[A.crossEnd], target[A.crossEnd]) + 8 * px;
        const ends = [src[A.crossStart], src[A.crossEnd], target[A.crossStart], target[A.crossEnd]];
        if (g.axis === "x") {
          segment(g.at, from, g.at, to, true);
          for (const y of ends) segment(g.at - tick, y, g.at + tick, y, false);
        } else {
          segment(from, g.at, to, g.at, true);
          for (const x of ends) segment(x, g.at - tick, x, g.at + tick, false);
        }
      } else if (g.kind === "gap") {
        // Spacing bar between the facing edges, centred on the shared span.
        const a = src[A.start] >= target[A.end] ? target[A.end] : src[A.end];
        const b = src[A.start] >= target[A.end] ? src[A.start] : target[A.start];
        const c = (Math.max(src[A.crossStart], target[A.crossStart]) + Math.min(src[A.crossEnd], target[A.crossEnd])) / 2;
        bar(g.axis, a, b, c);
        if (g.axis === "x") pill(g.label, (a + b) / 2, c - 12 * px);
        else pill(g.label, c + 24 * px, (a + b) / 2);
      } else if (g.kind === "size") {
        // Matching dimension bars just outside both items.
        for (const r of [src, target]) {
          const c = g.axis === "x" ? r.top - 10 * px : r.right + 10 * px;
          bar(g.axis, r[A.start], r[A.end], c);
          if (g.axis === "x") pill(g.label, r.centerX, c - 12 * px);
          else pill(g.label, c + 24 * px, r.centerY);
        }
      }
    }

    ctx.restore();
  }
}

export const snapEngine = new DSSnapEngine(snapStore);

// ---------------------------------------------------------------------------
// 5. KEYBOARD PRECISION ARROW MOVEMENT (NUDGE)
// ---------------------------------------------------------------------------
function isKeyboardFocusProtected(key, isCtrlOrMeta) {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest?.(".ds-snap-popover, .comfy-modal, .litegraph-dialog, .ds-ui-menu, .ds-gear-popover")) {
    return true;
  }
  return false;
}

function handleGlobalKeyDown(e) {
  const key = e.key;

  if (isKeyboardFocusProtected(key, e.ctrlKey || e.metaKey)) return;

  // Arrow key precision movement
  if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") {
    return;
  }

  const canvas = app?.canvas;
  const selected = getSelectedGraphItems(canvas);
  if (!selected || selected.length === 0) return;

  const state = snapStore.state;
  const multiplier = e.shiftKey ? state.keyboardShiftMultiplier : 1;
  const step = state.keyboardStep * multiplier;

  let dx = 0;
  let dy = 0;

  if (key === "ArrowUp") dy = -step;
  if (key === "ArrowDown") dy = step;
  if (key === "ArrowLeft") dx = -step;
  if (key === "ArrowRight") dx = step;

  e.preventDefault();
  e.stopPropagation();

  try {
    canvas?.emitBeforeChange?.();
  } catch (_) {}

  for (const item of selected) {
    if (isPinned(item)) continue;
    if (isGroup(item)) {
      item.pos[0] += dx;
      item.pos[1] += dy;
      if (item.children && typeof item.children.forEach === "function") {
        item.children.forEach((c) => {
          if (!isPinned(c)) {
            c.pos[0] += dx;
            c.pos[1] += dy;
            c.setDirtyCanvas?.(true, true);
          }
        });
      }
      item.setDirtyCanvas?.(true, true);
    } else if (isNode(item)) {
      item.pos[0] += dx;
      item.pos[1] += dy;
      item.setDirtyCanvas?.(true, true);
    }
  }

  try {
    canvas?.emitAfterChange?.();
  } catch (_) {}

  canvas?.setDirty?.(true, true);
}

// ---------------------------------------------------------------------------
// 6. MULTI-NODE ARRANGEMENT (ROW & COLUMN)
// ---------------------------------------------------------------------------
export function arrangeNodesInRow(canvas = app?.canvas) {
  const allSelected = getSelectedNodes(canvas);
  if (allSelected.length < 2) {
    snapEngine.showToast("Select 2 or more nodes to arrange in a row");
    return;
  }
  const nodes = getOrderedSelectedNodes(canvas).filter((n) => !isPinned(n));
  if (nodes.length < 2) {
    snapEngine.showToast("Need 2 or more unpinned nodes to arrange in a row");
    return;
  }

  const anchor = nodes[0];
  const anchorBounds = getItemRect(anchor);
  const margin = Number(snapStore.state.minMarginX) || 20;

  try {
    canvas?.emitBeforeChange?.();
  } catch (_) {}

  const commonVisualTop = anchorBounds.top;
  let currentVisualRight = anchorBounds.right;

  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const b = getItemRect(node);
    const topOffset = (Number(node.pos?.[1]) || 0) - b.top;
    const leftOffset = (Number(node.pos?.[0]) || 0) - b.left;

    node.pos[0] = currentVisualRight + margin + leftOffset;
    node.pos[1] = commonVisualTop + topOffset;
    node.onResize?.(node.size);
    node.setDirtyCanvas?.(true, true);

    const updatedB = getItemRect(node);
    currentVisualRight = updatedB.right;
  }

  try {
    canvas?.emitAfterChange?.();
  } catch (_) {}

  canvas?.setDirty?.(true, true);
  snapEngine.showToast(`Arranged ${nodes.length} nodes in a row relative to anchor "${nodes[0].title || nodes[0].id}"`);
}

export function arrangeNodesInColumn(canvas = app?.canvas) {
  const allSelected = getSelectedNodes(canvas);
  if (allSelected.length < 2) {
    snapEngine.showToast("Select 2 or more nodes to arrange in a column");
    return;
  }
  const nodes = getOrderedSelectedNodes(canvas).filter((n) => !isPinned(n));
  if (nodes.length < 2) {
    snapEngine.showToast("Need 2 or more unpinned nodes to arrange in a column");
    return;
  }

  const anchor = nodes[0];
  const anchorBounds = getItemRect(anchor);
  const margin = Number(snapStore.state.minMarginY) || 20;

  try {
    canvas?.emitBeforeChange?.();
  } catch (_) {}

  const commonVisualLeft = anchorBounds.left;
  let currentVisualBottom = anchorBounds.bottom;

  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const b = getItemRect(node);
    const topOffset = (Number(node.pos?.[1]) || 0) - b.top;
    const leftOffset = (Number(node.pos?.[0]) || 0) - b.left;

    node.pos[0] = commonVisualLeft + leftOffset;
    node.pos[1] = currentVisualBottom + margin + topOffset;
    node.onResize?.(node.size);
    node.setDirtyCanvas?.(true, true);

    const updatedB = getItemRect(node);
    currentVisualBottom = updatedB.bottom;
  }

  try {
    canvas?.emitAfterChange?.();
  } catch (_) {}

  canvas?.setDirty?.(true, true);
  snapEngine.showToast(`Arranged ${nodes.length} nodes in a column relative to anchor "${nodes[0].title || nodes[0].id}"`);
}

// ---------------------------------------------------------------------------
// 7. DIMENSION MEASUREMENT & MATCHING
// ---------------------------------------------------------------------------
export function measureSelectedNode(canvas = app?.canvas) {
  const node = getPrimarySelectedNode(canvas);
  if (!node) {
    snapEngine.showToast("Select a node to measure dimensions");
    return;
  }

  const w = Math.round(node.size[0]);
  const h = Math.round(node.size[1]);
  snapStore.update({ measuredWidth: w, measuredHeight: h });
  const title = node.title || node.type || "Node";
  snapEngine.showToast(`Measured "${title}": ${w} × ${h} px`);
}

export function applyDimensionsToSelected(mode = "both", canvas = app?.canvas) {
  const state = snapStore.state;
  if (!state.measuredWidth || !state.measuredHeight) {
    snapEngine.showToast("No dimensions measured. Measure a node first.");
    return;
  }

  const allSelected = getSelectedNodes(canvas);
  if (allSelected.length === 0) {
    snapEngine.showToast("Select target node(s) to apply dimensions");
    return;
  }

  const nodes = allSelected.filter((n) => !isPinned(n));
  if (nodes.length === 0) {
    snapEngine.showToast("Selected node(s) are pinned and cannot be resized");
    return;
  }

  try {
    canvas?.emitBeforeChange?.();
  } catch (_) {}

  let count = 0;
  for (const node of nodes) {
    if (isPinned(node) || node.flags?.resizable === false) continue;

    let changed = false;
    if (mode === "width" || mode === "both") {
      const minW = node.min_width || 40;
      node.size[0] = Math.max(minW, state.measuredWidth);
      changed = true;
    }

    if (mode === "height" || mode === "both") {
      const minH = node.min_height || 30;
      node.size[1] = Math.max(minH, state.measuredHeight);
      changed = true;
    }

    if (changed) {
      node.onResize?.(node.size);
      node.setDirtyCanvas?.(true, true);
      count++;
    }
  }

  try {
    canvas?.emitAfterChange?.();
  } catch (_) {}

  canvas?.setDirty?.(true, true);
  snapEngine.showToast(`Applied ${mode} to ${count} node(s)`);
}

export function clearMeasuredDimensions() {
  snapStore.update({ measuredWidth: null, measuredHeight: null });
  snapEngine.showToast("Cleared measured dimensions");
}

// ---------------------------------------------------------------------------
// 8. ACTION BAR INTEGRATION & CUSTOM POPOVER UI
// ---------------------------------------------------------------------------
class DSSnapToolbarManager {
  constructor() {
    this.group = null;
    this.btn = null;
    this.popover = null;
    this.isOpen = false;
    this._mountTries = 0;

    snapStore.subscribe(() => {
      if (this.isOpen && this.popover) {
        this.renderPopoverContent();
      }
    });

    if (window.DSGlobalTheme?.subscribe) {
      window.DSGlobalTheme.subscribe(() => {
        if (this.popover) window.DSGlobalTheme.applyToElement(this.popover);
      });
    }

    document.addEventListener("mousedown", (e) => {
      if (
        this.isOpen &&
        this.popover &&
        !this.popover.contains(e.target) &&
        !this.btn?.contains(e.target)
      ) {
        this.closePopover();
      }
    });

    // Auto-mount immediately
    this.init();
  }

  init() {
    this.mountToolbarButton();
    this.initObserver();
  }

  _createButton() {
    if (this.btn && this.group) return;

    const group = document.createElement("div");
    group.className = "ds-snap-toolbar-group";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ds-snap-toolbar-btn";
    btn.className = "comfyui-button ds-snap-tb-btn";
    btn.setAttribute("title", "DS Snap — Workflow Precision & Alignment");
    btn.setAttribute("aria-label", "DS Snap");
    btn.innerHTML = `
      <span class="ds-snap-tb-icon-box">
        ${DS_SNAP_ICON_SVG}
      </span>
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePopover();
    });

    group.appendChild(btn);
    this.group = group;
    this.btn = btn;
  }

  mountToolbarButton() {
    const remGroup = document.querySelector(".ds-reminder-toolbar-group");
    const actionDock =
      remGroup?.parentElement ||
      app.menu?.settingsGroup?.element?.parentElement ||
      document.querySelector(".comfyui-menu") ||
      document.querySelector(".action-bar") ||
      document.querySelector(".top-bar-button-group");

    if (!actionDock) {
      if (++this._mountTries < 80) {
        setTimeout(() => this.mountToolbarButton(), 150);
      }
      return;
    }

    this._createButton();

    // Attach right after the reminder button or prepend to action bar
    if (remGroup && remGroup.parentElement === actionDock) {
      if (remGroup.nextSibling !== this.group) {
        remGroup.after(this.group);
      }
    } else if (!actionDock.contains(this.group)) {
      actionDock.prepend(this.group);
    }
  }

  initObserver() {
    const check = () => {
      const remGroup = document.querySelector(".ds-reminder-toolbar-group");
      const actionDock =
        remGroup?.parentElement ||
        app.menu?.settingsGroup?.element?.parentElement ||
        document.querySelector(".comfyui-menu") ||
        document.querySelector(".action-bar") ||
        document.querySelector(".top-bar-button-group");

      if (!actionDock || !this.group) return;

      if (!actionDock.contains(this.group)) {
        if (remGroup && remGroup.parentElement === actionDock) {
          remGroup.after(this.group);
        } else {
          actionDock.prepend(this.group);
        }
      }

      // Continuously ensure the active canvas draws snap guides
      hookCanvasDraw(app?.canvas);
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(check, 300);
    setTimeout(check, 1200);
    setTimeout(check, 3000);
  }

  togglePopover() {
    if (this.isOpen) {
      this.closePopover();
    } else {
      this.openPopover();
    }
  }

  openPopover() {
    this.closePopover();

    const popover = document.createElement("div");
    popover.id = "ds-snap-global-popover";
    popover.className = "ds-snap-popover";
    popover.setAttribute("data-ds-themed", "true");

    if (window.DSGlobalTheme?.applyToElement) {
      window.DSGlobalTheme.applyToElement(popover);
    }

    document.body.appendChild(popover);
    this.popover = popover;
    this.isOpen = true;
    this.btn?.classList.add("is-active");

    this.renderPopoverContent();
    this.updatePosition();

    if (!this._resizeAttached) {
      this._resizeAttached = true;
      window.addEventListener("resize", () => {
        if (this.isOpen && this.popover) {
          this.updatePosition();
        }
      });
    }
  }

  updatePosition() {
    if (!this.popover) return;
    const btnRect = this.btn?.getBoundingClientRect();
    let top = 48;
    if (btnRect && btnRect.bottom > 0 && btnRect.top < window.innerHeight / 2) {
      top = btnRect.bottom + 6;
    } else {
      const topBar = document.querySelector(".comfyui-menu, .action-bar, .top-bar-button-group, .comfyui-body-top");
      if (topBar) {
        const r = topBar.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight / 2) {
          top = r.bottom + 6;
        } else {
          top = 10;
        }
      } else {
        top = 10;
      }
    }
    this.popover.style.setProperty("top", `${Math.max(6, Math.round(top))}px`, "important");
    this.popover.style.setProperty("bottom", "auto", "important");
    this.popover.style.setProperty("left", "5px", "important");
    this.popover.style.setProperty("right", "5px", "important");
    this.popover.style.setProperty("width", "calc(100vw - 10px)", "important");
  }

  closePopover() {
    if (this.popover) {
      this.popover.remove();
      this.popover = null;
    }
    this.isOpen = false;
    this.btn?.classList.remove("is-active");
  }

  /**
   * Renders the single thick horizontal toolbar strip.
   * Options cleanly divided into sections across the full browser width:
   * DS Snap | Snap toggle, input field | Margin toggle, input field | Row, Column | Measure, Clear, Width, Height, Apply Both | Arrow step input field | Close
   */
  renderPopoverContent() {
    if (!this.popover) return;
    const state = snapStore.state;

    this.popover.innerHTML = `
      <div class="ds-snap-bar">
        <!-- Section 1: DS Snap Brand -->
        <div class="ds-snap-sec ds-snap-sec-brand">
          <span class="ds-snap-badge-icon">${DS_SNAP_ICON_SVG}</span>
          <strong class="ds-snap-title">DS SNAP</strong>
          <span class="ds-snap-version">v1.1</span>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 2: Snap toggle & input field -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">SNAP</span>
          <div id="ds-snap-toggle-slot"></div>
          <div class="ds-snap-input-wrap" title="Snap hysteresis threshold (px)">
            <input type="number" class="ds-ui-input ds-snap-input" id="ds-snap-input-threshold" value="${state.snapThreshold}" min="1" max="100" aria-label="Snap threshold" />
            <span class="ds-snap-input-unit">px</span>
          </div>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 3: Margin toggle & input field -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">MARGIN</span>
          <div id="ds-snap-margin-toggle-slot"></div>
          <div class="ds-snap-input-wrap" title="Minimum node spacing gap (px)">
            <input type="number" class="ds-ui-input ds-snap-input" id="ds-snap-input-margin" value="${state.minMarginX}" min="0" max="250" aria-label="Margin gap" />
            <span class="ds-snap-input-unit">px</span>
          </div>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 4: Row, Column -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">ARRANGE</span>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn" id="ds-snap-btn-row" title="Arrange selected nodes into a horizontal row">
            ${ICON_ROW}
            <span>Row</span>
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn" id="ds-snap-btn-col" title="Arrange selected nodes into a vertical column">
            ${ICON_COL}
            <span>Column</span>
          </button>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 5: Measure, Clear, Width, Height, Apply Both -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">DIMENSIONS</span>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn" id="ds-snap-btn-measure" title="Measure selected node width & height">
            Measure
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn" id="ds-snap-btn-clear" title="Clear measured dimensions">
            Clear
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn" id="ds-snap-btn-apply-w" title="Apply measured width to selected nodes">
            Width
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn" id="ds-snap-btn-apply-h" title="Apply measured height to selected nodes">
            Height
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-snap-btn ds-snap-btn-accent" id="ds-snap-btn-apply-both" title="Apply measured width & height to selected nodes">
            Apply Both
          </button>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 6: Arrow step input field -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">ARROW STEP</span>
          <div class="ds-snap-input-wrap" title="Keyboard arrow nudge step (px)">
            <input type="number" class="ds-ui-input ds-snap-input" id="ds-snap-input-step" value="${state.keyboardStep}" min="1" max="100" aria-label="Arrow step" />
            <span class="ds-snap-input-unit">px</span>
          </div>
          <span class="ds-snap-tag" title="Holding Shift multiplies arrow movement by 5×">SHIFT=5×</span>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 7: Close (Far Right) -->
        <div class="ds-snap-sec ds-snap-sec-actions">
          <button type="button" class="ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact ds-snap-close-btn" id="ds-snap-close-btn" aria-label="Close Snap Bar" title="Close Snap Bar">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" />
              <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" />
            </svg>
          </button>
        </div>
      </div>
    `;

    // Mount official UI Toggle components
    const snapToggle = Toggle({
      checked: state.enabled,
      onChange: (checked) => {
        snapStore.update({ enabled: checked });
      },
    });
    this.popover.querySelector("#ds-snap-toggle-slot")?.replaceWith(snapToggle.root);

    const marginToggle = Toggle({
      checked: state.minMarginEnabled,
      onChange: (checked) => {
        snapStore.update({ minMarginEnabled: checked });
      },
    });
    this.popover.querySelector("#ds-snap-margin-toggle-slot")?.replaceWith(marginToggle.root);

    // --- Interactive Event Bindings ---
    this.popover.querySelector("#ds-snap-close-btn")?.addEventListener("click", () => this.closePopover());

    // Threshold input
    const thresholdInput = this.popover.querySelector("#ds-snap-input-threshold");
    thresholdInput?.addEventListener("change", (e) => {
      const val = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 6));
      snapStore.update({ snapThreshold: val });
    });

    // Margin input
    const marginInput = this.popover.querySelector("#ds-snap-input-margin");
    marginInput?.addEventListener("change", (e) => {
      const val = Math.max(0, Math.min(250, parseInt(e.target.value, 10) || 10));
      snapStore.update({ minMarginX: val, minMarginY: val });
    });

    // Keyboard step input
    const stepInput = this.popover.querySelector("#ds-snap-input-step");
    stepInput?.addEventListener("change", (e) => {
      const val = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1));
      snapStore.update({ keyboardStep: val });
    });

    // Mouse wheel on inputs for fast increment/decrement
    [thresholdInput, marginInput, stepInput].forEach((inp) => {
      inp?.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const current = parseInt(inp.value, 10) || 0;
        const minVal = Number(inp.min) || 0;
        const maxVal = Number(inp.max) || 250;
        inp.value = String(Math.max(minVal, Math.min(maxVal, current + delta)));
        inp.dispatchEvent(new Event("change"));
      }, { passive: false });
    });

    // Arrange buttons
    this.popover.querySelector("#ds-snap-btn-row")?.addEventListener("click", () => arrangeNodesInRow());
    this.popover.querySelector("#ds-snap-btn-col")?.addEventListener("click", () => arrangeNodesInColumn());

    // Dimension buttons
    this.popover.querySelector("#ds-snap-btn-measure")?.addEventListener("click", () => measureSelectedNode());
    this.popover.querySelector("#ds-snap-btn-clear")?.addEventListener("click", () => clearMeasuredDimensions());
    this.popover.querySelector("#ds-snap-btn-apply-w")?.addEventListener("click", () => applyDimensionsToSelected("width"));
    this.popover.querySelector("#ds-snap-btn-apply-h")?.addEventListener("click", () => applyDimensionsToSelected("height"));
    this.popover.querySelector("#ds-snap-btn-apply-both")?.addEventListener("click", () => applyDimensionsToSelected("both"));
  }
}

export const toolbarManager = new DSSnapToolbarManager();

// ---------------------------------------------------------------------------
// 9. CANVAS HOOKS (SELECTION ORDER, SNAP UPDATES, GUIDE DRAWING)
// ---------------------------------------------------------------------------
let globalListenersInstalled = false;

function isPointerNearNodeSlot(node, mouseX, mouseY) {
  if (!node) return false;
  const radius = (globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20) * 1.35;
  if (Array.isArray(node.inputs)) {
    for (let i = 0; i < node.inputs.length; i++) {
      const pos = node.getInputPos ? node.getInputPos(i) : null;
      if (pos && Math.hypot(mouseX - pos[0], mouseY - pos[1]) <= radius) {
        return true;
      }
    }
  }
  if (Array.isArray(node.outputs)) {
    for (let i = 0; i < node.outputs.length; i++) {
      const pos = node.getOutputPos ? node.getOutputPos(i) : null;
      if (pos && Math.hypot(mouseX - pos[0], mouseY - pos[1]) <= radius) {
        return true;
      }
    }
  }
  return false;
}

function installGlobalPointerListeners() {
  if (globalListenersInstalled) return;
  globalListenersInstalled = true;

  // Track node click order so the first clicked node is the arrange anchor
  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;

    const target = e.target;
    if (!target || !(target instanceof Element)) return;
    if (target.closest?.(".ds-snap-popover, .comfy-modal, .litegraph-dialog, .ds-ui-menu, input, textarea, select, button")) {
      return;
    }

    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    const graph = app?.graph || app?.canvas?.graph;
    const vueNodeEl = target.closest?.("[data-node-id]");
    let node = null;
    if (vueNodeEl) {
      node = graph?.getNodeById?.(vueNodeEl.dataset?.nodeId || vueNodeEl.getAttribute("data-node-id"));
    } else {
      const canvas = app?.canvas;
      if (canvas?.graph_mouse && canvas.graph) {
        const [mouseX, mouseY] = canvas.graph_mouse;
        node = canvas.graph.getNodeOnPos?.(mouseX, mouseY);
        if (node && isPointerNearNodeSlot(node, mouseX, mouseY)) return;
      }
    }

    if (node && isNode(node)) {
      recordNodeSelection(node.id, isMulti);
    } else if (!isMulti && target === app?.canvas?.canvas) {
      selectionHistory = [];
    }
  }, true);

  // Bubble phase: runs after LiteGraph has processed the same pointermove.
  window.addEventListener("pointermove", (e) => {
    const canvas = app?.canvas;
    if (canvas?.graph) snapEngine.update(canvas, e);
  });

  const release = () => {
    if (app?.canvas) snapEngine.end(app.canvas);
  };
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
  window.addEventListener("blur", release);
}

function hookCanvasDraw(canvas) {
  if (!canvas || canvas.__ds_snap_draw_hooked) return;
  canvas.__ds_snap_draw_hooked = true;

  const origDrawForeground = canvas.onDrawForeground;
  canvas.onDrawForeground = function (ctx, visibleArea) {
    const res = origDrawForeground?.apply(this, arguments);
    snapEngine.drawGuides(ctx, this);
    return res;
  };
}

let keyboardInstalled = false;

function installCanvasHooks() {
  installGlobalPointerListeners();
  hookCanvasDraw(app?.canvas);

  if (!keyboardInstalled) {
    keyboardInstalled = true;
    window.addEventListener("keydown", handleGlobalKeyDown, true);
  }
}


// ---------------------------------------------------------------------------
// 10. STYLESHEET INJECTION (STRICT DEATHSHOT DESIGN SYSTEM)
// ---------------------------------------------------------------------------
function injectSnapStyles() {
  const oldStyle = document.getElementById("ds-snap-styles-v1");
  if (oldStyle) oldStyle.remove();
  let style = document.getElementById("ds-snap-styles-v2");
  if (!style) {
    style = document.createElement("style");
    style.id = "ds-snap-styles-v2";
    document.head.appendChild(style);
  }
  style.textContent = `
/* Action Bar Dock Wrapper */
    .ds-snap-toolbar-group,
    div.ds-snap-toolbar-group {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: visible !important;
      background: none !important;
      background-color: transparent !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 4px 0 2px !important;
      outline: none !important;
    }

.ds-snap-toolbar-group::before,
    .ds-snap-toolbar-group::after {
      display: none !important;
      content: none !important;
    }

/* DS Snap Toolbar Button */
    .ds-snap-tb-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      overflow: visible !important;
      min-width: 40px !important;
      height: 38px !important;
      padding: 0 10px !important;
      margin: 0 !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, rgba(255, 255, 255, 0.18))) !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #e2e8f0)) !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      outline: none !important;
      box-shadow: none !important;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
      vertical-align: middle !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
    }

.ds-snap-tb-btn:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
      box-shadow: none !important;
    }

.ds-snap-tb-btn.is-active {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }

.ds-snap-tb-icon-box {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 22px !important;
      height: 22px !important;
      color: var(--ds-color-text, currentColor) !important;
    }

.ds-snap-svg {
      display: block !important;
      width: 22px !important;
      height: 22px !important;
      stroke: var(--ds-color-text, currentColor) !important;
      color: var(--ds-color-text, currentColor) !important;
      transition: color 0.15s ease, stroke 0.15s ease !important;
    }

.ds-snap-tb-btn:hover .ds-snap-svg,
    .ds-snap-tb-btn.is-active .ds-snap-svg {
      color: var(--ds-color-accent, #67e8f9) !important;
      stroke: var(--ds-color-accent, #67e8f9) !important;
    }

/* DS Snap Single Thick Row Bar across full browser width (5px margin on each side) */
    .ds-snap-popover {
      position: fixed !important;
      top: 48px !important;
      bottom: auto !important;
      z-index: 100010 !important;
      left: 5px !important;
      right: 5px !important;
      width: calc(100vw - 10px) !important;
      min-width: calc(100vw - 10px) !important;
      max-width: calc(100vw - 10px) !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
      background: var(--ds-color-card, #12151c) !important;
      border: 1px solid var(--ds-color-card-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-card, 8px) !important;
      padding: 6px 10px !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5) !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
      color: var(--ds-color-text, #e5e7eb) !important;
      animation: dsSnapPopIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      overflow: hidden !important;
    }

@keyframes dsSnapPopIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

.ds-snap-bar {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
      gap: 6px !important;
      min-height: 24px !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      flex-wrap: nowrap !important;
    }

.ds-snap-sec {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
    }

.ds-snap-sec-brand {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding-right: 2px !important;
      flex-shrink: 0 !important;
    }

.ds-snap-badge-icon {
      color: var(--ds-color-accent, #67e8f9) !important;
      display: flex !important;
      align-items: center !important;
    }

.ds-snap-badge-icon .ds-snap-svg {
      width: 16px !important;
      height: 16px !important;
    }

.ds-snap-title {
      font-size: 11px !important;
      font-weight: 800 !important;
      letter-spacing: 0.06em !important;
      color: var(--ds-color-text, #f8fafc) !important;
      text-transform: uppercase !important;
      white-space: nowrap !important;
    }

.ds-snap-version {
      font-size: 8px !important;
      font-weight: 700 !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      opacity: 0.75 !important;
      user-select: none !important;
    }

.ds-snap-sec-title {
      font-size: 9px !important;
      font-weight: 800 !important;
      letter-spacing: 0.04em !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      text-transform: uppercase !important;
      user-select: none !important;
      white-space: nowrap !important;
      margin-right: 1px !important;
    }

.ds-snap-divider {
      width: 1px !important;
      height: 18px !important;
      background: var(--ds-color-border, rgba(255, 255, 255, 0.12)) !important;
      margin: 0 3px !important;
      flex-shrink: 0 !important;
    }

/* UIElements Toggle integration inside toolbar */
    .ds-snap-sec .ds-ui-toggle-row {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      cursor: pointer !important;
      user-select: none !important;
    }

.ds-snap-sec .ds-ui-toggle-copy {
      display: none !important;
    }

.ds-snap-sec .ds-ui-toggle-track {
      position: relative !important;
      width: 32px !important;
      min-width: 32px !important;
      max-width: 32px !important;
      height: 18px !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
      overflow: hidden !important;
      outline: none !important;
      box-shadow: none !important;
      transition: background 120ms ease, border-color 120ms ease !important;
    }

.ds-snap-sec .ds-ui-toggle-row:focus-visible .ds-ui-toggle-track,
    .ds-snap-sec .ds-ui-toggle-track:focus-visible {
      outline: 1px solid var(--ds-color-accent, #67e8f9) !important;
    }

.ds-snap-sec .ds-ui-toggle-row.is-on .ds-ui-toggle-track {
      background: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      box-shadow: none !important;
    }

.ds-snap-sec .ds-ui-toggle-thumb {
      position: absolute !important;
      top: 2px !important;
      left: 2px !important;
      width: 12px !important;
      height: 12px !important;
      border-radius: 2px !important;
      background: var(--ds-color-muted-text, #94a3b8) !important;
      transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1), background-color 120ms ease !important;
      pointer-events: none !important;
      box-shadow: none !important;
    }

.ds-snap-sec .ds-ui-toggle-row.is-on .ds-ui-toggle-thumb {
      transform: translateX(14px) !important;
      background: var(--ds-color-on-accent, #0a0c10) !important;
    }

/* Clean Input Field */
    .ds-snap-input-wrap {
      display: inline-flex !important;
      align-items: center !important;
      height: 24px !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      padding: 0 4px !important;
      box-sizing: border-box !important;
      transition: border-color 0.12s ease !important;
      box-shadow: none !important;
    }

.ds-snap-input-wrap:focus-within {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      box-shadow: none !important;
    }

.ds-ui-input.ds-snap-input {
  all: unset;
  width: 24px;
  height: 100%;
  text-align: center;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  -moz-appearance: textfield;
}

.ds-ui-input.ds-snap-input::-webkit-outer-spin-button,
.ds-ui-input.ds-snap-input::-webkit-inner-spin-button {
  margin: 0;
}

.ds-snap-input-unit {
      font-size: 8.5px !important;
      font-weight: 700 !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      user-select: none !important;
      pointer-events: none !important;
      opacity: 0.8 !important;
    }

/* Buttons */
.ds-ui-btn.ds-snap-btn {
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 7px;
  border-radius: var(--ds-radius-control, 4px);
  box-sizing: border-box;
  white-space: nowrap;
  vertical-align: middle;
}

.ds-ui-btn.ds-snap-btn span {
  display: inline-flex;
  align-items: center;
  margin: 0;
  vertical-align: middle;
}

.ds-ui-btn.ds-snap-btn svg,
.ds-ui-btn.ds-snap-btn .preview-icon {
  display: inline-block;
  flex-shrink: 0;
  stroke: currentColor;
  fill: none;
  pointer-events: none;
  margin: 0;
  vertical-align: middle;
}

.ds-snap-tag {
      font-size: 8px !important;
      font-weight: 800 !important;
      font-family: monospace !important;
      color: var(--ds-color-muted-text, #9ca3af) !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      padding: 1px 3px !important;
      border-radius: var(--ds-radius-badge, 3px) !important;
      user-select: none !important;
    }

/* Right Section: Actions */
    .ds-snap-sec-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 0 !important;
      flex-shrink: 0 !important;
      margin: 0 !important;
    }

/* Close Button (Zero text fallback artifact, pure SVG) */
.ds-ui-btn.ds-snap-close-btn {
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-control, 4px);
  box-sizing: border-box;
  flex-shrink: 0;
}

.ds-ui-btn.ds-snap-close-btn svg {
  display: block;
  width: 12px;
  height: 12px;
  stroke: currentColor;
  fill: none;
  pointer-events: none;
}

/* Toast Notification */
    .ds-snap-toast {
      position: fixed !important;
      top: 60px !important;
      bottom: auto !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: var(--ds-color-panel-2, #181d26) !important;
      border: 1px solid var(--ds-color-accent, #67e8f9) !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      padding: 6px 16px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      color: var(--ds-color-text, #f8fafc) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
      z-index: 999999 !important;
      pointer-events: none !important;
      animation: dsToastPop 0.18s ease-out !important;
      transition: opacity 0.25s ease !important;
    }

.ds-snap-toast.is-fading {
      opacity: 0 !important;
    }

@keyframes dsToastPop {
      from { opacity: 0; transform: translate(-50%, 10px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
`;
}

// ---------------------------------------------------------------------------
// 11. CONTEXT MENU & CANVAS INTEGRATION FALLBACK
// ---------------------------------------------------------------------------
function installLegacySnapCanvasMenuFallback() {
  const LG = window.LiteGraph || globalThis.LiteGraph || app?.canvas?.constructor;
  const canvasProto = app?.canvas?.constructor?.prototype || LG?.LGraphCanvas?.prototype;
  if (!canvasProto || canvasProto.__dsaSnapLegacyMenuInstalled) return Boolean(canvasProto?.__dsaSnapLegacyMenuInstalled);

  const originalCanvasMenu = canvasProto.getCanvasMenuOptions;
  if (typeof originalCanvasMenu === "function") {
    canvasProto.getCanvasMenuOptions = function(...args) {
      const options = originalCanvasMenu.apply(this, args);
      if (!Array.isArray(options)) return options;
      const alreadyPresent = options.some(item =>
        item && typeof item === "object" &&
        String(item.content || "").includes("DS Snap")
      );
      if (!alreadyPresent) {
        options.push(null, {
          content: "🎯 DS Snap",
          callback: () => toolbarManager.togglePopover(),
        });
      }
      return options;
    };
  }

  const originalNodeMenu = canvasProto.getNodeMenuOptions;
  if (typeof originalNodeMenu === "function") {
    canvasProto.getNodeMenuOptions = function(...args) {
      const options = originalNodeMenu.apply(this, args);
      if (!Array.isArray(options)) return options;
      const alreadyPresent = options.some(item =>
        item && typeof item === "object" &&
        String(item.content || "").includes("DS Snap")
      );
      if (!alreadyPresent) {
        options.push(
          null,
          {
            content: "🎯 DS Snap: Arrange Row",
            callback: () => arrangeNodesInRow(),
          },
          {
            content: "🎯 DS Snap: Arrange Column",
            callback: () => arrangeNodesInColumn(),
          },
          {
            content: "🎯 DS Snap: Measure Node",
            callback: () => measureSelectedNode(),
          }
        );
      }
      return options;
    };
  }

  canvasProto.__dsaSnapLegacyMenuInstalled = true;
  return true;
}

function scheduleLegacySnapCanvasMenuFallback() {
  if (installLegacySnapCanvasMenuFallback()) return;
  for (const delay of [0, 100, 400, 1000, 2500]) {
    setTimeout(() => {
      installLegacySnapCanvasMenuFallback();
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// 12. COMFYUI WEB EXTENSION REGISTRATION
// ---------------------------------------------------------------------------
app.registerExtension({
  name: EXTENSION_NAME,

  commands: [
    {
      id: "DeathshotArsenal.DSSnap.ToggleMenu",
      label: "DS Snap: Toggle Menu",
      icon: "ds-snap-tb-icon-box",
      function: () => toolbarManager.togglePopover(),
    },
    {
      id: "DeathshotArsenal.DSSnap.ArrangeRow",
      label: "DS Snap: Arrange Row",
      function: () => arrangeNodesInRow(),
    },
    {
      id: "DeathshotArsenal.DSSnap.ArrangeColumn",
      label: "DS Snap: Arrange Column",
      function: () => arrangeNodesInColumn(),
    },
    {
      id: "DeathshotArsenal.DSSnap.Measure",
      label: "DS Snap: Measure Selected Node",
      function: () => measureSelectedNode(),
    },
  ],

  menuCommands: [
    {
      path: ["DeathshotArsenal"],
      commands: [
        "DeathshotArsenal.DSSnap.ToggleMenu",
        "DeathshotArsenal.DSSnap.ArrangeRow",
        "DeathshotArsenal.DSSnap.ArrangeColumn",
        "DeathshotArsenal.DSSnap.Measure",
      ],
    },
  ],

  getNodeMenuItems(node) {
    return [
      null,
      {
        content: "🎯 DS Snap",
        callback: () => toolbarManager.togglePopover(),
      },
      {
        content: "🎯 DS Snap: Arrange Row",
        callback: () => arrangeNodesInRow(),
      },
      {
        content: "🎯 DS Snap: Arrange Column",
        callback: () => arrangeNodesInColumn(),
      },
      {
        content: "🎯 DS Snap: Measure Node",
        callback: () => measureSelectedNode(),
      },
    ];
  },

  getCanvasMenuItems(canvas) {
    return [
      null,
      {
        content: "🎯 DS Snap",
        callback: () => toolbarManager.togglePopover(),
      },
    ];
  },

  async setup() {
    console.log("[DS Snap] Initializing DeathshotArsenal frontend extension...");
    injectSnapStyles();
    installCanvasHooks();
    toolbarManager.init();
    scheduleLegacySnapCanvasMenuFallback();
    console.log("[DS Snap] Successfully mounted DS Snap action bar, canvas hooks, and context menu.");
  },
});

// Immediate execution for dynamic extension imports
try {
  injectSnapStyles();
  installCanvasHooks();
  toolbarManager.init();
  scheduleLegacySnapCanvasMenuFallback();
} catch (err) {
  console.warn("[DS Snap] Immediate bootstrap warning:", err);
}

