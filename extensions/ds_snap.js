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
      snapThreshold: 12,
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
// 3. TRUE VISUAL NODE BOUNDS (ACCURATE EDGE & TITLE MEASUREMENT)
// ---------------------------------------------------------------------------
function isNode(item) {
  if (!item || typeof item !== "object") return false;
  const p = item.pos;
  const s = item.size;
  if (!p || !s) return false;
  if (typeof p[0] !== "number" || typeof p[1] !== "number") return false;
  if (typeof s[0] !== "number" || typeof s[1] !== "number") return false;
  return item.id !== undefined;
}

/**
 * Returns the title bar height of a node.
 * For chromeless, baseless, or headerless nodes, this returns 0.
 */
function getNodeTitleHeight(node) {
  const LG = window.LiteGraph || globalThis.LiteGraph || app?.canvas?.constructor;
  const noTitle = LG?.NO_TITLE ?? 1;
  const titleMode = node.title_mode !== undefined ? node.title_mode : node.constructor?.title_mode;
  if (
    node.flags?.no_header ||
    node.flags?.no_title ||
    node.flags?.no_box ||
    titleMode === noTitle ||
    titleMode === 2 ||
    titleMode === "none"
  ) {
    return 0;
  }
  return Number(node.titleHeight) || Number(LG?.NODE_TITLE_HEIGHT) || 30;
}

/**
 * Calculates the exact rendered visual bounds of a node.
 * Uses LiteGraph's getBounding() when available (which accounts for title bar and collapsed state).
 * Falls back to pos and size with exact title height calculation.
 */
function getNodeVisualBounds(node) {
  const x = Number(node.pos?.[0]) || 0;
  const y = Number(node.pos?.[1]) || 0;
  const w = Math.max(10, Number(node.size?.[0]) || 60);
  const bodyH = Math.max(10, Number(node.size?.[1]) || 40);

  let top = y;
  let bottom = y + bodyH;
  let titleH = 30;

  // 1. Try LiteGraph's native getBounding
  let nativeB = null;
  try {
    if (typeof node.getBounding === "function") {
      nativeB = node.getBounding();
    }
  } catch (_) {}

  if (nativeB && nativeB.length >= 4 && !isNaN(nativeB[1]) && !isNaN(nativeB[3])) {
    top = Number(nativeB[1]);
    bottom = top + Number(nativeB[3]);
    titleH = Math.max(0, y - top);
  } else {
    titleH = getNodeTitleHeight(node);
    top = y - titleH;
    bottom = y + (node.flags?.collapsed ? 0 : bodyH);
  }

  if (top > bottom) {
    const tmp = top;
    top = bottom;
    bottom = tmp;
  }

  return {
    node,
    id: node.id,
    titleH,
    left: x,
    top: top,
    right: x + w,
    bottom: bottom,
    width: w,
    height: bottom - top,
    bodyHeight: bodyH,
    centerX: x + w / 2,
    centerY: (top + bottom) / 2,
  };
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

  if (result.size === 0) {
    const graph = canvas?.graph || app?.graph;
    if (graph?.nodes) {
      for (const node of graph.nodes) {
        if (node?.selected && isNode(node)) result.add(node);
      }
    }
  }

  return [...result];
}

function getPrimarySelectedNode(canvas = app?.canvas) {
  const nodes = getOrderedSelectedNodes(canvas);
  if (nodes.length > 0) return nodes[0];
  if (canvas?.current_node && isNode(canvas.current_node)) return canvas.current_node;
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

function isPlacementOrSearchActive() {
  const canvas = app?.canvas;
  if (!canvas) return false;

  // 1. Ghost node actively following pointer before placement
  if (canvas.state?.ghostNodeId != null || canvas.ghost_node != null) return true;
  if (canvas.connecting_node != null) return true;

  // 2. Active search on canvas
  if (canvas.searching === true) return true;

  // 3. Check if search box element is currently VISIBLE in the DOM
  const searchBox = canvas.search_box;
  if (searchBox && searchBox.style?.display !== "none" && searchBox.offsetParent !== null) {
    return true;
  }

  const searchEl = document.querySelector(".lgraph-search-box, .litegraph-searchbox, .comfy-vue-search-box");
  if (searchEl && searchEl.style?.display !== "none" && searchEl.offsetParent !== null) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 4. ALIGNMENT & SNAPPING ENGINE
// ---------------------------------------------------------------------------
class DSSnapEngine {
  constructor(store) {
    this.store = store;
    this.activeGuides = [];
    this.resizingGuides = [];

    // Drag tracking & hysteresis state
    this.draggedNode = null;
    this.lastSnappedX = null;
    this.lastSnappedY = null;

    // Toast feedback notification
    this._toastTimer = null;
    this._toastEl = null;
  }

  hasGuides() {
    return this.activeGuides.length > 0 || this.resizingGuides.length > 0;
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

  onDragStart(canvas, node) {
    if (!node || !isNode(node)) return;
    this.draggedNode = node;
    this.lastSnappedX = null;
    this.lastSnappedY = null;
    this.activeGuides = [];
  }

  onDragEnd(canvas) {
    this.draggedNode = null;
    this.lastSnappedX = null;
    this.lastSnappedY = null;
    if (this.activeGuides.length > 0) {
      this.activeGuides = [];
      canvas?.setDirty?.(true, true);
    }
  }

  onResizeEnd(canvas) {
    if (this.resizingGuides.length > 0) {
      this.resizingGuides = [];
      canvas?.setDirty?.(true, true);
    }
  }

  /**
   * Process node position during drag.
   * Compares visual bounds of dragged node against candidate target nodes,
   * snaps into alignment, stabilizes via hysteresis, and registers guide lines.
   */
  processNodeDrag(canvas, node, pointerEvent = null) {
    const state = this.store.state;
    if (!state.enabled || !node) {
      this.activeGuides = [];
      return;
    }

    // Alt key completely bypasses snapping for effortless 100% freeform placement
    if (pointerEvent?.altKey) {
      this.activeGuides = [];
      this.lastSnappedX = null;
      this.lastSnappedY = null;
      return;
    }

    // Ghost node, connecting node, or search box active — never snap
    if (isPlacementOrSearchActive()) {
      this.activeGuides = [];
      this.lastSnappedX = null;
      this.lastSnappedY = null;
      return;
    }

    const graph = canvas?.graph || app?.graph;
    if (!graph || !Array.isArray(graph.nodes)) return;

    const selectedList = getSelectedNodes(canvas);
    const selectedSet = new Set(selectedList);
    selectedSet.add(node);
    const selectedIds = new Set(Array.from(selectedSet).map((n) => n.id));

    const vBounds = getNodeVisualBounds(node);

    // Build candidate list — only VISIBLE nodes, prioritizing topmost (last in graph.nodes = front)
    // LiteGraph node.mode: 0 = always, 1 = on event, 2 = never (hidden), 3 = bypass, 4 = always no exec
    const HIDDEN_MODES = new Set([2, 3]);   // never-draw and bypassed
    const totalNodes = graph.nodes.length;

    const candidates = [];
    for (let i = 0; i < graph.nodes.length; i++) {
      const other = graph.nodes[i];
      if (!isNode(other) || other === node || selectedSet.has(other) || selectedIds.has(other.id)) continue;
      // Skip hidden / bypassed nodes
      if (HIDDEN_MODES.has(other.mode)) continue;
      // Skip collapsed nodes that have no visible body (they mislead alignment)
      // (collapsed nodes still have a title bar so keep them — but they're small)
      const b = getNodeVisualBounds(other);
      const dist = Math.hypot(b.centerX - vBounds.centerX, b.centerY - vBounds.centerY);
      if (dist < 1400) {
        // depthScore: nodes later in the array are rendered on top → lower score = higher priority
        const depthScore = (totalNodes - 1 - i) / totalNodes;  // 0.0 = topmost, ~1.0 = bottommost
        candidates.push({ ...b, dist, depthScore });
      }
    }

    if (candidates.length === 0) {
      this.activeGuides = [];
      this.lastSnappedX = null;
      this.lastSnappedY = null;
      return;
    }

    // CRITICAL: Sort candidates by distance ascending (nearest neighbor first!)
    // Then apply a secondary sort bonus for topmost (lowest depthScore) nodes.
    candidates.sort((a, b) => {
      // Primary: distance; Secondary: z-order (topmost first)
      const distDiff = a.dist - b.dist;
      if (Math.abs(distDiff) > 40) return distDiff;  // clearly different distance → pure distance sort
      return a.depthScore - b.depthScore;              // similar distance → prefer topmost node
    });

    const baseThreshold = Number(state.snapThreshold) || 10;
    const scale = canvas?.ds?.scale || 1.0;

    // -------------------------------------------------------------------------
    // TWO-ZONE GUIDE SYSTEM
    // -------------------------------------------------------------------------
    // visualThreshold  = outer zone: guide LINE is drawn, NO position change.
    //                    This is the "suggestion" zone.
    // snapZone         = inner zone (very tight): position actually adjusts — once.
    //                    Spacing/margin guides get an even tighter inner zone so
    //                    they're purely visual unless you're pixel-perfect.
    // latch            = once we snap, we mark it as latched and apply zero delta
    //                    on subsequent frames until the node escapes hysteresis.
    //                    This prevents the "held in place" accumulation problem.
    // -------------------------------------------------------------------------
    const visualThreshold = Math.min(18, Math.max(8, baseThreshold / Math.max(0.2, scale)));
    const snapZone        = 3;   // px: only actually move node when this close
    const spacingSnapZone = 2;   // px: spacing/margin guides are even less grabby
    const hysteresis      = visualThreshold * 1.6;  // must move this far to break latch

    const minMarginX = state.minMarginEnabled ? state.minMarginX : 0;
    const minMarginY = state.minMarginEnabled ? state.minMarginY : 0;

    // Separate into distance tiers: Close neighbors (< 550px) vs Farther nodes
    const closeCandidates = candidates.filter((c) => c.dist <= 550);
    const candidatePool = closeCandidates.length > 0 ? closeCandidates : candidates;

    // --- HORIZONTAL ALIGNMENT (Matching Y coordinates / horizontal guide lines) ---
    let bestYMatch = null;
    let bestYScore = Infinity;

    for (const t of candidatePool) {
      const tests = [];

      if (state.alignEdges) {
        tests.push({ targetY: t.top,    sourceY: vBounds.top,    delta: t.top    - vBounds.top,    label: "Top Align",    isEdge: true });
        tests.push({ targetY: t.bottom, sourceY: vBounds.bottom, delta: t.bottom - vBounds.bottom, label: "Bottom Align", isEdge: true });
      }

      if (state.alignSpacing && state.minMarginEnabled && minMarginY > 0) {
        tests.push({ targetY: t.bottom + minMarginY, sourceY: vBounds.top,    delta: (t.bottom + minMarginY) - vBounds.top,    label: `${minMarginY}px Gap`, isSpacing: true, spacingY: t.bottom });
        tests.push({ targetY: t.top    - minMarginY, sourceY: vBounds.bottom, delta: (t.top    - minMarginY) - vBounds.bottom, label: `${minMarginY}px Gap`, isSpacing: true, spacingY: t.top    });
      }

      if (state.alignCenters) {
        tests.push({ targetY: t.centerY, sourceY: vBounds.centerY, delta: t.centerY - vBounds.centerY, label: "Center Align", isCenter: true });
      }

      for (const test of tests) {
        const absDiff = Math.abs(test.delta);
        // Use hysteresis window when already latched to this anchor, visual threshold otherwise
        const isLatched = this.lastSnappedY?.targetId === t.id && this.lastSnappedY?.label === test.label;
        const limit = isLatched ? hysteresis : visualThreshold;

        if (absDiff <= limit) {
          const score = absDiff + (t.dist / 300) * 3 + (test.isCenter ? 4 : 0) + t.depthScore * 6;
          if (score < bestYScore) {
            bestYScore = score;
            bestYMatch = {
              targetNode: t,
              coordY: test.targetY,
              deltaY: test.delta,
              label: test.label,
              isSpacing: test.isSpacing || false,
              isLatched,
              spacingY: test.spacingY,
            };
          }
        }
      }
    }

    // --- VERTICAL ALIGNMENT (Matching X coordinates / vertical guide lines) ---
    let bestXMatch = null;
    let bestXScore = Infinity;

    for (const t of candidatePool) {
      const tests = [];

      if (state.alignEdges) {
        tests.push({ targetX: t.left,  sourceX: vBounds.left,  delta: t.left  - vBounds.left,  label: "Left Align",  isEdge: true });
        tests.push({ targetX: t.right, sourceX: vBounds.right, delta: t.right - vBounds.right, label: "Right Align", isEdge: true });
      }

      if (state.alignSpacing && state.minMarginEnabled && minMarginX > 0) {
        tests.push({ targetX: t.right + minMarginX, sourceX: vBounds.left,  delta: (t.right + minMarginX) - vBounds.left,  label: `${minMarginX}px Gap`, isSpacing: true, spacingX: t.right });
        tests.push({ targetX: t.left  - minMarginX, sourceX: vBounds.right, delta: (t.left  - minMarginX) - vBounds.right, label: `${minMarginX}px Gap`, isSpacing: true, spacingX: t.left  });
      }

      if (state.alignCenters) {
        tests.push({ targetX: t.centerX, sourceX: vBounds.centerX, delta: t.centerX - vBounds.centerX, label: "Center Align", isCenter: true });
      }

      for (const test of tests) {
        const absDiff = Math.abs(test.delta);
        const isLatched = this.lastSnappedX?.targetId === t.id && this.lastSnappedX?.label === test.label;
        const limit = isLatched ? hysteresis : visualThreshold;

        if (absDiff <= limit) {
          const score = absDiff + (t.dist / 300) * 3 + (test.isCenter ? 4 : 0) + t.depthScore * 6;
          if (score < bestXScore) {
            bestXScore = score;
            bestXMatch = {
              targetNode: t,
              coordX: test.targetX,
              deltaX: test.delta,
              label: test.label,
              isSpacing: test.isSpacing || false,
              isLatched,
              spacingX: test.spacingX,
            };
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // APPLY POSITION CHANGES  (two-zone: visual = no move, snap zone = move once)
    // -------------------------------------------------------------------------
    // Rule: if already latched to this guide → apply ZERO delta (guide is visual only).
    //       If newly entering snap zone (absDiff ≤ snapZone) → apply EXACT delta once.
    //       If in visual zone only (absDiff > snapZone) → apply ZERO delta.
    // This means the guide line shows up early as a hint, but only snaps when truly close.
    const guides = [];

    if (bestYMatch) {
      const absDY = Math.abs(bestYMatch.deltaY);
      const innerZone = bestYMatch.isSpacing ? spacingSnapZone : snapZone;
      if (!bestYMatch.isLatched && absDY <= innerZone) {
        // First entry into snap zone: move exactly to alignment
        for (const sn of selectedSet) {
          sn.pos[1] += bestYMatch.deltaY;
        }
      }
      // If already latched or only in visual zone: zero position change — guide line only
      this.lastSnappedY = { targetId: bestYMatch.targetNode.id, label: bestYMatch.label };

      guides.push({
        type: "horizontal",
        y: bestYMatch.coordY,
        sourceNode: node,
        targetNode: bestYMatch.targetNode,
        label: bestYMatch.label,
        isSpacing: bestYMatch.isSpacing,
        spacingY: bestYMatch.spacingY,
      });
    } else {
      this.lastSnappedY = null;
    }

    if (bestXMatch) {
      const absDX = Math.abs(bestXMatch.deltaX);
      const innerZone = bestXMatch.isSpacing ? spacingSnapZone : snapZone;
      if (!bestXMatch.isLatched && absDX <= innerZone) {
        for (const sn of selectedSet) {
          sn.pos[0] += bestXMatch.deltaX;
        }
      }
      this.lastSnappedX = { targetId: bestXMatch.targetNode.id, label: bestXMatch.label };

      guides.push({
        type: "vertical",
        x: bestXMatch.coordX,
        sourceNode: node,
        targetNode: bestXMatch.targetNode,
        label: bestXMatch.label,
        isSpacing: bestXMatch.isSpacing,
        spacingX: bestXMatch.spacingX,
      });
    } else {
      this.lastSnappedX = null;
    }

    this.activeGuides = guides;
    canvas?.setDirty?.(true, true);
  }

  /**
   * Process node resizing in real-time.
   */
  processNodeResize(canvas, node) {
    const state = this.store.state;
    if (!state.enabled || !state.resizeSnap || !node) {
      this.resizingGuides = [];
      return;
    }

    const graph = canvas?.graph || app?.graph;
    if (!graph || !Array.isArray(graph.nodes)) return;

    const threshold = state.snapThreshold;
    const candidates = graph.nodes
      .filter((n) => isNode(n) && n !== node)
      .map(getNodeVisualBounds);

    if (candidates.length === 0) {
      this.resizingGuides = [];
      return;
    }

    const currentW = node.size[0];
    const currentH = node.size[1];
    const guides = [];

    // Width Dimension Matching
    let bestWDiff = Infinity;
    let bestWTarget = null;

    for (const t of candidates) {
      const diffW = Math.abs(currentW - t.width);
      if (diffW <= threshold && diffW < bestWDiff) {
        bestWDiff = diffW;
        bestWTarget = t;
      }
    }

    if (bestWTarget) {
      node.size[0] = bestWTarget.width;
      node.onResize?.(node.size);
      guides.push({
        type: "vertical",
        x: node.pos[0] + bestWTarget.width,
        label: `Width ${Math.round(bestWTarget.width)}px`,
        isDimensionMatch: true,
      });
    }

    // Height Dimension Matching
    let bestHDiff = Infinity;
    let bestHTarget = null;

    for (const t of candidates) {
      const diffH = Math.abs(currentH - t.height);
      if (diffH <= threshold && diffH < bestHDiff) {
        bestHDiff = diffH;
        bestHTarget = t;
      }
    }

    if (bestHTarget) {
      node.size[1] = bestHTarget.height;
      node.onResize?.(node.size);
      guides.push({
        type: "horizontal",
        y: node.pos[1] + bestHTarget.height,
        label: `Height ${Math.round(bestHTarget.height)}px`,
        isDimensionMatch: true,
      });
    }

    this.resizingGuides = guides;
    canvas?.setDirty?.(true, true);
  }

  /**
   * Draws active visual alignment guides on the canvas in graph coordinates.
   */
  drawGuides(ctx, canvas) {
    const allGuides = [...this.activeGuides, ...this.resizingGuides];
    if (!ctx || allGuides.length === 0) return;

    const accent =
      window.DSGlobalTheme?.getVar?.("--ds-color-accent") ||
      window.DSGlobalTheme?.getVar?.("--ds-accent") ||
      getComputedStyle(document.documentElement).getPropertyValue("--ds-color-accent")?.trim() ||
      getComputedStyle(document.documentElement).getPropertyValue("--ds-accent")?.trim() ||
      "#67e8f9";
    const scale = canvas?.ds?.scale || 1.0;
    const lineWidth = Math.max(1.5, 2.0 / scale);
    const dash = [8 / scale, 5 / scale];

    // Compute large bounding extent across visible canvas viewport
    let vx1 = -500000;
    let vx2 = 500000;
    let vy1 = -500000;
    let vy2 = 500000;
    if (canvas?.visible_area && canvas.visible_area.length >= 4) {
      const minX = Math.min(canvas.visible_area[0], canvas.visible_area[2]);
      const maxX = Math.max(canvas.visible_area[0], canvas.visible_area[2]);
      const minY = Math.min(canvas.visible_area[1], canvas.visible_area[3]);
      const maxY = Math.max(canvas.visible_area[1], canvas.visible_area[3]);
      vx1 = minX - 50000;
      vx2 = maxX + 50000;
      vy1 = minY - 50000;
      vy2 = maxY + 50000;
    }

    ctx.save();

    for (const guide of allGuides) {
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);

      // Clean guide stroke without glow blur
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.beginPath();
      if (guide.type === "horizontal") {
        ctx.moveTo(vx1, guide.y);
        ctx.lineTo(vx2, guide.y);
      } else {
        ctx.moveTo(guide.x, vy1);
        ctx.lineTo(guide.x, vy2);
      }
      ctx.stroke();

      // Reset dash & shadow for badges and ticks
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Draw anchor tick marks if source & target nodes are available
      if (guide.sourceNode && guide.targetNode) {
        const sb = guide.sourceNode?.left !== undefined ? guide.sourceNode : getNodeVisualBounds(guide.sourceNode);
        const tb = guide.targetNode?.left !== undefined ? guide.targetNode : getNodeVisualBounds(guide.targetNode);

        ctx.lineWidth = Math.max(2, 2.5 / scale);
        const tickLen = 7 / scale;

        if (guide.type === "horizontal") {
          ctx.beginPath();
          // Tick at source left & right
          ctx.moveTo(sb.left, guide.y - tickLen);
          ctx.lineTo(sb.left, guide.y + tickLen);
          ctx.moveTo(sb.right, guide.y - tickLen);
          ctx.lineTo(sb.right, guide.y + tickLen);
          // Tick at target left & right
          ctx.moveTo(tb.left, guide.y - tickLen);
          ctx.lineTo(tb.left, guide.y + tickLen);
          ctx.moveTo(tb.right, guide.y - tickLen);
          ctx.lineTo(tb.right, guide.y + tickLen);
          ctx.stroke();
        } else {
          ctx.beginPath();
          // Tick at source top & bottom
          ctx.moveTo(guide.x - tickLen, sb.top);
          ctx.lineTo(guide.x + tickLen, sb.top);
          ctx.moveTo(guide.x - tickLen, sb.bottom);
          ctx.lineTo(guide.x + tickLen, sb.bottom);
          // Tick at target top & bottom
          ctx.moveTo(guide.x - tickLen, tb.top);
          ctx.lineTo(guide.x + tickLen, tb.top);
          ctx.moveTo(guide.x - tickLen, tb.bottom);
          ctx.lineTo(guide.x + tickLen, tb.bottom);
          ctx.stroke();
        }
      }

      // Draw high-contrast badge label
      if (guide.label) {
        const text = String(guide.label).toUpperCase();
        const fontSize = Math.max(10, Math.round(11 / scale));
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;

        const tw = ctx.measureText(text).width;
        const padX = 7 / scale;
        const padY = 3.5 / scale;
        const boxW = tw + padX * 2;
        const boxH = fontSize + padY * 2;

        let bx = 0;
        let by = 0;

        if (guide.sourceNode && guide.targetNode) {
          const sb = guide.sourceNode?.left !== undefined ? guide.sourceNode : getNodeVisualBounds(guide.sourceNode);
          const tb = guide.targetNode?.left !== undefined ? guide.targetNode : getNodeVisualBounds(guide.targetNode);
          if (guide.type === "horizontal") {
            bx = (sb.centerX + tb.centerX) / 2 - boxW / 2;
            by = guide.y - boxH - 6 / scale;
          } else {
            bx = guide.x + 8 / scale;
            by = (sb.centerY + tb.centerY) / 2 - boxH / 2;
          }
        } else {
          const va = canvas?.visible_area;
          const midX = va && va.length >= 3 ? (va[0] + va[2]) / 2 : (guide.x || 0);
          const midY = va && va.length >= 4 ? (va[1] + va[3]) / 2 : (guide.y || 0);
          if (guide.type === "horizontal") {
            bx = midX - boxW / 2;
            by = guide.y - boxH - 6 / scale;
          } else {
            bx = guide.x + 8 / scale;
            by = midY - boxH / 2;
          }
        }

        // Pill background
        ctx.fillStyle = "rgba(10, 12, 16, 0.94)";
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.2 / scale;

        const r = 4 / scale;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(bx, by, boxW, boxH, r);
        } else {
          ctx.rect(bx, by, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();

        // Label text
        ctx.fillStyle = accent;
        ctx.textBaseline = "middle";
        ctx.fillText(text, bx + padX, by + boxH / 2);
      }
    }

    ctx.restore();
  }
}

export const snapEngine = new DSSnapEngine(snapStore);

// ---------------------------------------------------------------------------
// 5. UNDO & REDO HISTORY MANAGER
// ---------------------------------------------------------------------------
class DSSnapHistoryManager {
  constructor(maxDepth = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxDepth = maxDepth;
    this._arrowTimer = null;
    this._arrowInitialSnapshot = null;
    this._dragInitialSnapshot = null;
  }

  takeSnapshot(nodes) {
    if (!nodes || !nodes.length) return [];
    const seen = new Set();
    const result = [];
    for (const n of nodes) {
      if (!isNode(n) || seen.has(n.id)) continue;
      seen.add(n.id);
      result.push({
        id: n.id,
        pos: [Number(n.pos[0]) || 0, Number(n.pos[1]) || 0],
        size: [Number(n.size[0]) || 0, Number(n.size[1]) || 0],
      });
    }
    return result;
  }

  hasChanged(before, after) {
    if (!before || !after || before.length !== after.length) return true;
    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after[i];
      if (b.id !== a.id) return true;
      if (Math.abs(b.pos[0] - a.pos[0]) > 0.01 || Math.abs(b.pos[1] - a.pos[1]) > 0.01) return true;
      if (Math.abs(b.size[0] - a.size[0]) > 0.01 || Math.abs(b.size[1] - a.size[1]) > 0.01) return true;
    }
    return false;
  }

  push(description, beforeSnapshot, afterSnapshot) {
    if (!this.hasChanged(beforeSnapshot, afterSnapshot)) return;
    this.undoStack.push({
      description,
      before: beforeSnapshot,
      after: afterSnapshot,
    });
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  record(description, nodes, actionFn) {
    const before = this.takeSnapshot(nodes);
    try {
      actionFn();
    } finally {
      const after = this.takeSnapshot(nodes);
      this.push(description, before, after);
    }
  }

  startDrag(nodes) {
    this._dragInitialSnapshot = this.takeSnapshot(nodes);
  }

  endDrag(nodes) {
    if (!this._dragInitialSnapshot || !this._dragInitialSnapshot.length) return;
    const after = this.takeSnapshot(nodes);
    this.push("Move / Snap", this._dragInitialSnapshot, after);
    this._dragInitialSnapshot = null;
  }

  recordArrowMove(nodes, stepFn) {
    if (!this._arrowInitialSnapshot) {
      this._arrowInitialSnapshot = this.takeSnapshot(nodes);
    }
    stepFn();
    if (this._arrowTimer) clearTimeout(this._arrowTimer);
    this._arrowTimer = setTimeout(() => {
      if (this._arrowInitialSnapshot) {
        const after = this.takeSnapshot(nodes);
        this.push("Move Nodes", this._arrowInitialSnapshot, after);
        this._arrowInitialSnapshot = null;
      }
    }, 400);
  }

  applySnapshot(records, canvas = app?.canvas) {
    if (!records || !records.length) return;
    const graph = canvas?.graph || app?.graph;
    if (!graph) return;

    for (const record of records) {
      const node = graph.getNodeById?.(record.id);
      if (node && isNode(node)) {
        node.pos[0] = record.pos[0];
        node.pos[1] = record.pos[1];
        node.size[0] = record.size[0];
        node.size[1] = record.size[1];
        node.onResize?.(node.size);
        node.setDirtyCanvas?.(true, true);
      }
    }
    canvas?.setDirty?.(true, true);
  }

  undo(canvas = app?.canvas) {
    if (this.undoStack.length === 0) return false;
    const item = this.undoStack.pop();
    this.redoStack.push(item);
    this.applySnapshot(item.before, canvas);
    snapEngine.showToast(`Undo: ${item.description}`);
    return true;
  }

  redo(canvas = app?.canvas) {
    if (this.redoStack.length === 0) return false;
    const item = this.redoStack.pop();
    this.undoStack.push(item);
    this.applySnapshot(item.after, canvas);
    snapEngine.showToast(`Redo: ${item.description}`);
    return true;
  }
}

export const snapHistory = new DSSnapHistoryManager();

// ---------------------------------------------------------------------------
// 6. KEYBOARD SHORTCUTS & PRECISION ARROW MOVEMENT
// ---------------------------------------------------------------------------
function isKeyboardFocusProtected() {
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
  if (isKeyboardFocusProtected()) return;

  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  const key = e.key;

  // Undo shortcut: Ctrl+Z / Cmd+Z (without Shift)
  if (isCtrlOrMeta && !e.shiftKey && (key === "z" || key === "Z")) {
    if (snapHistory.undo(app?.canvas)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  // Redo shortcut: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
  if ((isCtrlOrMeta && e.shiftKey && (key === "z" || key === "Z")) || (isCtrlOrMeta && (key === "y" || key === "Y"))) {
    if (snapHistory.redo(app?.canvas)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  // Arrow key precision movement
  if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") {
    return;
  }

  const canvas = app?.canvas;
  const selected = getSelectedNodes(canvas);
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

  snapHistory.recordArrowMove(selected, () => {
    try {
      canvas?.emitBeforeChange?.();
    } catch (_) {}

    for (const node of selected) {
      node.pos[0] += dx;
      node.pos[1] += dy;
    }

    try {
      canvas?.emitAfterChange?.();
    } catch (_) {}

    canvas?.setDirty?.(true, true);
  });
}

// ---------------------------------------------------------------------------
// 7. MULTI-NODE ARRANGEMENT (ROW & COLUMN)
// ---------------------------------------------------------------------------
export function arrangeNodesInRow(canvas = app?.canvas) {
  const nodes = getOrderedSelectedNodes(canvas);
  if (nodes.length < 2) {
    snapEngine.showToast("Select 2 or more nodes to arrange in a row");
    return;
  }

  snapHistory.record("Arrange Row", nodes, () => {
    const anchor = nodes[0];
    const anchorBounds = getNodeVisualBounds(anchor);
    const margin = Number(snapStore.state.minMarginX) || 20;

    try {
      canvas?.emitBeforeChange?.();
    } catch (_) {}

    const commonVisualTop = anchorBounds.top;
    let currentVisualRight = anchorBounds.right;

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const b = getNodeVisualBounds(node);
      const topOffset = (Number(node.pos?.[1]) || 0) - b.top;
      const leftOffset = (Number(node.pos?.[0]) || 0) - b.left;

      node.pos[0] = currentVisualRight + margin + leftOffset;
      node.pos[1] = commonVisualTop + topOffset;
      node.onResize?.(node.size);

      const updatedB = getNodeVisualBounds(node);
      currentVisualRight = updatedB.right;
    }

    try {
      canvas?.emitAfterChange?.();
    } catch (_) {}

    canvas?.setDirty?.(true, true);
  });

  snapEngine.showToast(`Arranged ${nodes.length} nodes in a row relative to anchor "${nodes[0].title || nodes[0].id}"`);
}

export function arrangeNodesInColumn(canvas = app?.canvas) {
  const nodes = getOrderedSelectedNodes(canvas);
  if (nodes.length < 2) {
    snapEngine.showToast("Select 2 or more nodes to arrange in a column");
    return;
  }

  snapHistory.record("Arrange Column", nodes, () => {
    const anchor = nodes[0];
    const anchorBounds = getNodeVisualBounds(anchor);
    const margin = Number(snapStore.state.minMarginY) || 20;

    try {
      canvas?.emitBeforeChange?.();
    } catch (_) {}

    const commonVisualLeft = anchorBounds.left;
    let currentVisualBottom = anchorBounds.bottom;

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const b = getNodeVisualBounds(node);
      const topOffset = (Number(node.pos?.[1]) || 0) - b.top;
      const leftOffset = (Number(node.pos?.[0]) || 0) - b.left;

      node.pos[0] = commonVisualLeft + leftOffset;
      node.pos[1] = currentVisualBottom + margin + topOffset;
      node.onResize?.(node.size);

      const updatedB = getNodeVisualBounds(node);
      currentVisualBottom = updatedB.bottom;
    }

    try {
      canvas?.emitAfterChange?.();
    } catch (_) {}

    canvas?.setDirty?.(true, true);
  });

  snapEngine.showToast(`Arranged ${nodes.length} nodes in a column relative to anchor "${nodes[0].title || nodes[0].id}"`);
}

// ---------------------------------------------------------------------------
// 8. DIMENSION MEASUREMENT & MATCHING
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
  snapEngine.showToast(`Measured: ${w} × ${h} px`);
}

export function applyDimensionsToSelected(mode = "both", canvas = app?.canvas) {
  const state = snapStore.state;
  if (!state.measuredWidth || !state.measuredHeight) {
    snapEngine.showToast("No dimensions measured. Measure a node first.");
    return;
  }

  const nodes = getSelectedNodes(canvas);
  if (nodes.length === 0) {
    snapEngine.showToast("Select target node(s) to apply dimensions");
    return;
  }

  let count = 0;
  snapHistory.record(`Match Dimensions (${mode})`, nodes, () => {
    try {
      canvas?.emitBeforeChange?.();
    } catch (_) {}

    for (const node of nodes) {
      if (node.flags?.resizable === false) continue;

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
        count++;
      }
    }

    try {
      canvas?.emitAfterChange?.();
    } catch (_) {}

    canvas?.setDirty?.(true, true);
  });

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

      // Continuously ensure active canvas instance is hooked
      if (app?.canvas) {
        hookCanvasTarget(app.canvas);
        attachCanvasDomEvents(app.canvas);
      }
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
   * DS Snap | Snap toggle, input field | Margin toggle, input field | Row, Column | Measure, Clear, Width, Height, Apply Both | Arrow step input field | History (Undo, Redo) | Status, Close
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
            <input type="number" class="ds-snap-input" id="ds-snap-input-threshold" value="${state.snapThreshold}" min="1" max="100" aria-label="Snap threshold" />
            <span class="ds-snap-input-unit">px</span>
          </div>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 3: Margin toggle & input field -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">MARGIN</span>
          <div id="ds-snap-margin-toggle-slot"></div>
          <div class="ds-snap-input-wrap" title="Minimum node spacing gap (px)">
            <input type="number" class="ds-snap-input" id="ds-snap-input-margin" value="${state.minMarginX}" min="0" max="250" aria-label="Margin gap" />
            <span class="ds-snap-input-unit">px</span>
          </div>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 4: Row, Column -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">ARRANGE</span>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-row" title="Arrange selected nodes into a horizontal row">
            ${ICON_ROW}
            <span>Row</span>
          </button>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-col" title="Arrange selected nodes into a vertical column">
            ${ICON_COL}
            <span>Column</span>
          </button>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 5: Measure, Clear, Width, Height, Apply Both -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">DIMENSIONS</span>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-measure" title="Measure selected node width & height">
            Measure
          </button>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-clear" title="Clear measured dimensions">
            Clear
          </button>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-apply-w" title="Apply measured width to selected nodes">
            Width
          </button>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-apply-h" title="Apply measured height to selected nodes">
            Height
          </button>
          <button type="button" class="ds-snap-btn ds-snap-btn-accent" id="ds-snap-btn-apply-both" title="Apply measured width & height to selected nodes">
            Apply Both
          </button>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 6: Arrow step input field -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">ARROW STEP</span>
          <div class="ds-snap-input-wrap" title="Keyboard arrow nudge step (px)">
            <input type="number" class="ds-snap-input" id="ds-snap-input-step" value="${state.keyboardStep}" min="1" max="100" aria-label="Arrow step" />
            <span class="ds-snap-input-unit">px</span>
          </div>
          <span class="ds-snap-tag" title="Holding Shift multiplies arrow movement by 5×">SHIFT=5×</span>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 7: History (Undo / Redo with icon + text) -->
        <div class="ds-snap-sec">
          <span class="ds-snap-sec-title">HISTORY</span>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-undo" title="Undo node change (Ctrl+Z)" aria-label="Undo">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-undo-2 preview-icon"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
            <span>Undo</span>
          </button>
          <button type="button" class="ds-snap-btn" id="ds-snap-btn-redo" title="Redo node change (Ctrl+Shift+Z / Ctrl+Y)" aria-label="Redo">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-redo-2 preview-icon"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></svg>
            <span>Redo</span>
          </button>
        </div>

        <div class="ds-snap-divider"></div>

        <!-- Section 8: Close (Far Right) -->
        <div class="ds-snap-sec ds-snap-sec-actions">
          <button type="button" class="ds-snap-close-btn" id="ds-snap-close-btn" aria-label="Close Snap Bar" title="Close Snap Bar">
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

    // Arrange and history buttons
    this.popover.querySelector("#ds-snap-btn-row")?.addEventListener("click", () => arrangeNodesInRow());
    this.popover.querySelector("#ds-snap-btn-col")?.addEventListener("click", () => arrangeNodesInColumn());
    this.popover.querySelector("#ds-snap-btn-undo")?.addEventListener("click", () => snapHistory.undo());
    this.popover.querySelector("#ds-snap-btn-redo")?.addEventListener("click", () => snapHistory.redo());

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
// 9. OVERLAY ADAPTER INTERFACE
// ---------------------------------------------------------------------------
try {
  const existingOverlay = document.getElementById("ds-snap-guide-overlay");
  if (existingOverlay) existingOverlay.remove();
} catch (_) {}

export const snapOverlay = {
  clear() {
    try {
      const el = document.getElementById("ds-snap-guide-overlay");
      if (el) el.remove();
    } catch (_) {}
  },
  renderGuides() {},
};

function stopGlobalDrag() {
  if (snapEngine.hasGuides()) {
    snapEngine.onDragEnd(app?.canvas);
    snapEngine.onResizeEnd(app?.canvas);
    app?.canvas?.setDirty?.(true, true);
  }
}

// ---------------------------------------------------------------------------
// 10. GLOBAL POINTER EVENT LISTENERS (SELECTION & FAILSAFE RELEASE)
// ---------------------------------------------------------------------------
let globalListenersInstalled = false;

function installGlobalPointerListeners() {
  if (globalListenersInstalled) return;
  globalListenersInstalled = true;

  // Track selection history when clicking Vue Node DOM elements
  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;

    const target = e.target;
    if (!target || !(target instanceof Element)) return;

    if (target.closest?.(".ds-snap-popover, .comfy-modal, .litegraph-dialog, .ds-ui-menu, input, textarea, select, button")) {
      return;
    }

    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;

    const vueNodeEl = target.closest?.("[data-node-id]");
    if (vueNodeEl) {
      const rawId = vueNodeEl.dataset?.nodeId || vueNodeEl.getAttribute("data-node-id");
      const graph = app?.graph || app?.canvas?.graph;
      const node = graph?.getNodeById?.(rawId);
      if (node && isNode(node)) {
        recordNodeSelection(node.id, isMulti);
      }
    }

    if (!isMulti && !vueNodeEl && target !== app?.canvas?.canvas) {
      selectionHistory = [];
    }
  }, true);

  // Pointer release handler
  const handleGlobalPointerRelease = () => {
    if (snapEngine.draggedNode) {
      snapHistory.endDrag([snapEngine.draggedNode, ...getSelectedNodes(app?.canvas)]);
    }
    if (snapEngine.hasGuides()) {
      snapEngine.onDragEnd(app?.canvas);
      snapEngine.onResizeEnd(app?.canvas);
      app?.canvas?.setDirty?.(true, true);
    }
  };

  window.addEventListener("pointerup", handleGlobalPointerRelease, true);
  window.addEventListener("mouseup", handleGlobalPointerRelease, true);
  window.addEventListener("pointercancel", handleGlobalPointerRelease, true);
  window.addEventListener("blur", handleGlobalPointerRelease, true);
}

// ---------------------------------------------------------------------------
// 11. LITEGRAPH CANVAS HOOKS (DRAG TRACKING & NATIVE FOREGROUND DRAW)
// ---------------------------------------------------------------------------
let lastPointerDownNode = null;

function attachCanvasDomEvents(canvas) {
  if (!canvas || !canvas.canvas || canvas.canvas.__ds_snap_dom_hooked) return;
  canvas.canvas.__ds_snap_dom_hooked = true;
}

function hookCanvasTarget(target, label = "canvas") {
  if (!target) return;
  if (Object.prototype.hasOwnProperty.call(target, "__ds_snap_hooked")) return;
  Object.defineProperty(target, "__ds_snap_hooked", { value: true, configurable: true, writable: true });

  // 1. Hook Mouse Move (Node Dragging & Resizing)
  const origProcessMouseMove = target.processMouseMove;
  target.processMouseMove = function (e) {
    const res = origProcessMouseMove ? origProcessMouseMove.apply(this, arguments) : undefined;

    try {
      // Ensure active mouse drag state
      if (!e || e.buttons === 0) {
        if (snapEngine.draggedNode) {
          snapHistory.endDrag([snapEngine.draggedNode, ...getSelectedNodes(this)]);
        }
        if (snapEngine.hasGuides()) {
          snapEngine.onDragEnd(this);
          snapEngine.onResizeEnd(this);
          this.setDirty?.(true, true);
        }
        return res;
      }

      if (snapStore.state.enabled) {
        // Panning canvas or drawing selection box
        if (this.dragging_canvas || this.dragging_rectangle) {
          if (snapEngine.hasGuides()) {
            snapEngine.onDragEnd(this);
            this.setDirty?.(true, true);
          }
          return res;
        }

        // Alt-key bypass or search dialog active
        if (e?.altKey || isPlacementOrSearchActive()) {
          if (snapEngine.hasGuides()) {
            snapEngine.onDragEnd(this);
            this.setDirty?.(true, true);
          }
          return res;
        }

        // Detect active node
        const activeNode =
          (this.node_dragged && isNode(this.node_dragged) ? this.node_dragged : null) ||
          (this.current_node && isNode(this.current_node) ? this.current_node : null) ||
          (this.selected_nodes ? Object.values(this.selected_nodes).find(isNode) : null) ||
          (this.selectedItems ? Array.from(this.selectedItems).find(isNode) : null) ||
          (getOrderedSelectedNodes(this)[0]) ||
          null;

        if (activeNode) {
          if (!snapEngine.draggedNode || snapEngine.draggedNode !== activeNode) {
            snapEngine.onDragStart(this, activeNode);
            snapHistory.startDrag([activeNode, ...getSelectedNodes(this)]);
          }
          snapEngine.processNodeDrag(this, activeNode, e);
        } else {
          if (snapEngine.activeGuides.length > 0 && !this.resizing_node) {
            snapEngine.onDragEnd(this);
            this.setDirty?.(true, true);
          }
        }

        if (this.resizing_node && isNode(this.resizing_node)) {
          snapEngine.processNodeResize(this, this.resizing_node);
        } else if (snapEngine.resizingGuides.length > 0) {
          snapEngine.onResizeEnd(this);
        }
      }
    } catch (err) {
      console.warn("[DS Snap] Error in processMouseMove hook:", err);
    }

    return res;
  };

  // 2. Hook Mouse Up
  const origProcessMouseUp = target.processMouseUp;
  target.processMouseUp = function () {
    try {
      if (snapEngine.draggedNode) {
        snapHistory.endDrag([snapEngine.draggedNode, ...getSelectedNodes(this)]);
      }
      if (snapEngine.hasGuides()) {
        snapEngine.onDragEnd(this);
        snapEngine.onResizeEnd(this);
        this.setDirty?.(true, true);
      }
    } catch (_) {}
    return origProcessMouseUp ? origProcessMouseUp.apply(this, arguments) : undefined;
  };

  // 3. Hook onDrawForeground (Native LiteGraph foreground canvas rendering)
  // This draws directly in graph coordinate space — perfectly synchronizing with zoom and pan!
  const origDrawForeground = target.onDrawForeground;
  target.onDrawForeground = function (ctx, visibleArea) {
    const res = origDrawForeground ? origDrawForeground.apply(this, arguments) : undefined;
    try {
      if (snapStore.state.enabled && snapEngine.hasGuides()) {
        snapEngine.drawGuides(ctx, this);
      }
    } catch (err) {
      console.warn("[DS Snap] Error in onDrawForeground:", err);
    }
    return res;
  };
}

let hooksInstalled = false;

function installCanvasHooks() {
  installGlobalPointerListeners();

  const LG = window.LiteGraph || globalThis.LiteGraph;
  if (LG?.LGraphCanvas?.prototype) {
    hookCanvasTarget(LG.LGraphCanvas.prototype, "prototype");
  }
  if (app?.canvas) {
    hookCanvasTarget(app.canvas, "app.canvas");
    attachCanvasDomEvents(app.canvas);
  }

  // Periodic safeguard to ensure app.canvas is hooked if created asynchronously
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (app?.canvas) {
      hookCanvasTarget(app.canvas, "app.canvas");
      attachCanvasDomEvents(app.canvas);
      if (Object.prototype.hasOwnProperty.call(app.canvas, "__ds_snap_hooked")) {
        clearInterval(timer);
      }
    }
    if (attempts > 30) clearInterval(timer);
  }, 250);

  if (!hooksInstalled) {
    hooksInstalled = true;
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
    .ds-snap-input {
      all: unset !important;
      width: 24px !important;
      height: 100% !important;
      background: transparent !important;
      border: none !important;
      outline: none !important;
      text-align: center !important;
      font-family: var(--ds-font, Inter, monospace) !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      padding: 0 !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      -moz-appearance: textfield !important;
    }
    .ds-snap-input::-webkit-outer-spin-button,
    .ds-snap-input::-webkit-inner-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
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
    .ds-snap-btn {
      height: 24px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      padding: 0 7px !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #161a23)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #e5e7eb)) !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      cursor: pointer !important;
      user-select: none !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
      white-space: nowrap !important;
      outline: none !important;
      box-shadow: none !important;
      vertical-align: middle !important;
    }
    .ds-snap-btn span {
      display: inline-flex !important;
      align-items: center !important;
      line-height: 1 !important;
      margin: 0 !important;
      vertical-align: middle !important;
    }
    .ds-snap-btn svg,
    .ds-snap-btn .preview-icon {
      display: inline-block !important;
      flex-shrink: 0 !important;
      stroke: currentColor !important;
      fill: none !important;
      pointer-events: none !important;
      margin: 0 !important;
      vertical-align: middle !important;
    }
    .ds-snap-btn:hover {
      background: var(--ds-btn-hover, #1e2433) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      box-shadow: none !important;
    }
    .ds-snap-btn:active {
      transform: translateY(1px) !important;
    }
    .ds-snap-btn-accent {
      background: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
    }
    .ds-snap-btn-accent:hover {
      background: var(--ds-color-accent-hover, #22d3ee) !important;
      border-color: var(--ds-color-accent-hover, #22d3ee) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      box-shadow: none !important;
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
    .ds-snap-close-btn {
      width: 24px !important;
      min-width: 24px !important;
      height: 24px !important;
      padding: 0 !important;
      margin: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #161a23)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #e5e7eb)) !important;
      cursor: pointer !important;
      outline: none !important;
      box-shadow: none !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
    .ds-snap-close-btn svg {
      display: block !important;
      width: 12px !important;
      height: 12px !important;
      stroke: currentColor !important;
      fill: none !important;
      pointer-events: none !important;
    }
    .ds-snap-close-btn:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #1e2433) !important;
      box-shadow: none !important;
    }
    .ds-snap-close-btn:focus,
    .ds-snap-close-btn:focus-visible {
      outline: none !important;
      box-shadow: none !important;
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
    {
      id: "DeathshotArsenal.DSSnap.Undo",
      label: "DS Snap: Undo (Ctrl+Z)",
      function: () => snapHistory.undo(),
    },
    {
      id: "DeathshotArsenal.DSSnap.Redo",
      label: "DS Snap: Redo (Ctrl+Shift+Z / Ctrl+Y)",
      function: () => snapHistory.redo(),
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

