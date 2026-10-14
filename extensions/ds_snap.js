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

/**
 * Returns the title bar height of a node.
 * For chromeless, baseless, or headerless nodes, this returns 0.
 */
function getNodeTitleHeight(node) {
  const LG = window.LiteGraph || globalThis.LiteGraph || app?.canvas?.constructor;
  const noTitle = LG?.NO_TITLE ?? 1;
  const transparentTitle = LG?.TRANSPARENT_TITLE ?? 2;
  const titleMode = node.title_mode !== undefined ? node.title_mode : node.constructor?.title_mode;
  if (
    node.flags?.no_header ||
    node.flags?.no_title ||
    node.flags?.no_box ||
    titleMode === noTitle ||
    titleMode === transparentTitle ||
    titleMode === "none"
  ) {
    return 0;
  }
  return Number(node.titleHeight) || Number(LG?.NODE_TITLE_HEIGHT) || 30;
}

/**
 * Calculates the exact visual bounds of a node at a given (posX, posY).
 * Derived purely from the node geometry, size, title bar, and collapsed state.
 * Never relies on cached/stale LiteGraph getBounding() rectangles.
 */
function getNodeVisualBoundsAt(node, posX, posY) {
  const x = Number(posX) || 0;
  const y = Number(posY) || 0;
  const w = Math.max(10, Number(node.size?.[0]) || 60);
  const bodyH = Math.max(10, Number(node.size?.[1]) || 40);
  const titleH = getNodeTitleHeight(node);
  const isCollapsed = Boolean(node.flags?.collapsed);

  const left = x;
  const right = x + (isCollapsed ? (Number(node.collapsed_width) || 100) : w);
  const top = y - titleH;
  const bottom = y + (isCollapsed ? 0 : bodyH);

  return {
    item: node,
    node,
    group: null,
    id: node.id,
    title: node.title || `Node #${node.id}`,
    titleH,
    isCollapsed,
    isGroup: false,
    isNode: true,
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    bodyHeight: bodyH,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/**
 * Calculates the exact visual bounds of an LGraphGroup at a given (posX, posY).
 * In LiteGraph / ComfyUI, a group rectangle is drawn starting at [pos[0], pos[1]]
 * with dimensions [size[0], size[1]].
 */
function getGroupVisualBoundsAt(group, posX, posY) {
  const x = Number(posX) || 0;
  const y = Number(posY) || 0;
  const w = Math.max(10, Number(group.size?.[0]) || 140);
  const h = Math.max(10, Number(group.size?.[1]) || 80);

  const left = x;
  const right = x + w;
  const top = y;
  const bottom = y + h;

  return {
    item: group,
    node: null,
    group,
    id: group.id ?? `group_${Math.round(x)}_${Math.round(y)}`,
    title: group.title || "Group",
    titleH: 0,
    isCollapsed: false,
    isGroup: true,
    isNode: false,
    left,
    right,
    top,
    bottom,
    width: w,
    height: h,
    bodyHeight: h,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/**
 * Returns visual bounds for either a node or a group at given position.
 */
function getItemVisualBoundsAt(item, posX, posY) {
  if (isGroup(item)) {
    return getGroupVisualBoundsAt(item, posX, posY);
  }
  return getNodeVisualBoundsAt(item, posX, posY);
}

function getItemVisualBounds(item) {
  if (!item) return null;
  return getItemVisualBoundsAt(item, item.pos?.[0], item.pos?.[1]);
}

function getNodeVisualBounds(node) {
  return getItemVisualBounds(node);
}

function getBoundingBoxDistance(a, b) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
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

/**
 * Returns only the items that should genuinely move with activeItem.
 * Crucial: dragging a node never drags groups or unselected nodes.
 */
function getDragItemsFor(canvas = app?.canvas, activeItem) {
  if (!activeItem) return [];

  // When dragging a node, NEVER include groups or unrelated nodes
  if (isNode(activeItem)) {
    const selectedNodes = new Set();
    if (canvas?.selected_nodes && typeof canvas.selected_nodes === "object") {
      const vals = Object.values(canvas.selected_nodes).filter(isNode);
      if (vals.length > 1 && vals.some((n) => n === activeItem || String(n.id) === String(activeItem.id))) {
        vals.forEach((n) => selectedNodes.add(n));
      }
    }
    if (canvas?.selectedItems && canvas.selectedItems.size > 1) {
      const items = Array.from(canvas.selectedItems).filter(isNode);
      if (items.length > 1 && items.some((n) => n === activeItem || String(n.id) === String(activeItem.id))) {
        items.forEach((n) => selectedNodes.add(n));
      }
    }
    if (selectedNodes.size > 1) {
      return [...selectedNodes];
    }
    // Single node drag: ONLY this node, nothing else
    return [activeItem];
  }

  // When dragging a group, only include that group (or multiple groups if multi-selected)
  if (isGroup(activeItem)) {
    const selectedGroups = new Set();
    if (canvas?.selectedItems && canvas.selectedItems.size > 1) {
      const grps = Array.from(canvas.selectedItems).filter(isGroup);
      if (grps.length > 1 && grps.includes(activeItem)) {
        grps.forEach((g) => selectedGroups.add(g));
      }
    }
    if (selectedGroups.size > 1) {
      return [...selectedGroups];
    }
    return [activeItem];
  }

  return [activeItem];
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

    // Active drag session tracking
    this.dragSession = null;
    // Active resize session tracking
    this.resizeSession = null;

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

  onDragStart(canvas, primaryItem, allSelectedItems = []) {
    if (!primaryItem || !isGraphItem(primaryItem) || isPinned(primaryItem)) return;

    const selectedSet = new Set();
    const addWithChildren = (item) => {
      if (!item || selectedSet.has(item) || isPinned(item)) return;
      selectedSet.add(item);
      if (isGroup(item)) {
        // Collect all inside nodes and nested children so they move in lockstep
        if (item.children && typeof item.children.forEach === "function") {
          item.children.forEach((c) => {
            if (!isPinned(c)) addWithChildren(c);
          });
        }
        if (item._children && typeof item._children.forEach === "function") {
          item._children.forEach((c) => {
            if (!isPinned(c)) addWithChildren(c);
          });
        }
        if (Array.isArray(item._nodes)) {
          for (const n of item._nodes) {
            if (!isPinned(n)) addWithChildren(n);
          }
        }
        if (Array.isArray(item.nodes)) {
          for (const n of item.nodes) {
            if (!isPinned(n)) addWithChildren(n);
          }
        }
      }
    };

    addWithChildren(primaryItem);
    for (const it of allSelectedItems) {
      // If dragging a Node, NEVER pull groups into the drag session
      if (isNode(primaryItem) && isGroup(it)) continue;
      if (!isPinned(it)) addWithChildren(it);
    }

    const mouseX = canvas?.graph_mouse ? canvas.graph_mouse[0] : (Number(primaryItem.pos[0]) || 0);
    const mouseY = canvas?.graph_mouse ? canvas.graph_mouse[1] : (Number(primaryItem.pos[1]) || 0);

    this.dragSession = {
      primaryItem,
      primaryNode: isNode(primaryItem) ? primaryItem : null,
      lastGraphMouseX: mouseX,
      lastGraphMouseY: mouseY,
      records: Array.from(selectedSet).filter((it) => isGraphItem(it) && !isPinned(it)).map((it) => {
        const posX = Number(it.pos[0]) || 0;
        const posY = Number(it.pos[1]) || 0;
        return {
          item: it,
          node: isNode(it) ? it : null,
          startX: posX,
          startY: posY,
          naturalX: posX,
          naturalY: posY,
        };
      }),
      snapDeltaX: 0,
      snapDeltaY: 0,
    };

    this.activeGuides = [];
  }

  onDragEnd(canvas) {
    if (this.dragSession) {
      // Re-affirm final positions on all nodes and groups
      for (const rec of this.dragSession.records) {
        const it = rec.item || rec.node;
        if (it && it.pos && !isPinned(it)) {
          it.pos[0] = rec.naturalX + this.dragSession.snapDeltaX;
          it.pos[1] = rec.naturalY + this.dragSession.snapDeltaY;
          it.setDirtyCanvas?.(true, true);
        }
      }
      this.dragSession = null;
    }
    document.body?.classList.remove("ds-canvas-dragging");
    if (this.activeGuides.length > 0) {
      this.activeGuides = [];
    }
    canvas?.setDirty?.(true, true);
  }

  onResizeEnd(canvas) {
    document.body?.classList.remove("ds-canvas-dragging");
    if (this.resizeSession) {
      const { item, width, height } = this.resizeSession;
      if (item && item.size && !isPinned(item)) {
        if (width != null) item.size[0] = width;
        if (height != null) item.size[1] = height;
        item.setSize?.(item.size);
        item.onResize?.(item.size);
        item.setDirtyCanvas?.(true, true);
      }
      this.resizeSession = null;
    }
    if (this.resizingGuides.length > 0) {
      this.resizingGuides = [];
      canvas?.setDirty?.(true, true);
    }
  }

  /**
   * Process graph item (node or group) position during drag.
   * Compares visual bounds against candidate target nodes and groups,
   * snaps cleanly into alignment, prioritizes close neighbors, and registers guide lines.
   */
  processItemDrag(canvas, activeItem, pointerEvent = null) {
    const state = this.store.state;
    if (!state.enabled || !activeItem || !isGraphItem(activeItem) || isPinned(activeItem)) {
      this.activeGuides = [];
      return;
    }

    // Alt key completely bypasses snapping for effortless 100% freeform placement
    if (pointerEvent?.altKey) {
      this.activeGuides = [];
      if (this.dragSession) {
        for (const rec of this.dragSession.records) {
          const it = rec.item || rec.node;
          if (it && it.pos && !isPinned(it)) {
            it.pos[0] = rec.naturalX;
            it.pos[1] = rec.naturalY;
          }
        }
        this.dragSession.snapDeltaX = 0;
        this.dragSession.snapDeltaY = 0;
      }
      return;
    }

    // Ghost node, connecting node, or search box active — never snap
    if (isPlacementOrSearchActive()) {
      this.activeGuides = [];
      return;
    }

    const graph = canvas?.graph || app?.graph;
    if (!graph) return;

    // Ensure active dragSession
    if (!this.dragSession || this.dragSession.primaryItem !== activeItem) {
      const selected = getDragItemsFor(canvas, activeItem);
      this.onDragStart(canvas, activeItem, selected);
    }

    // Update natural positions based on graph_mouse displacement
    const currentMouseX = canvas?.graph_mouse ? canvas.graph_mouse[0] : (Number(activeItem.pos[0]) || 0);
    const currentMouseY = canvas?.graph_mouse ? canvas.graph_mouse[1] : (Number(activeItem.pos[1]) || 0);
    const dGraphX = currentMouseX - this.dragSession.lastGraphMouseX;
    const dGraphY = currentMouseY - this.dragSession.lastGraphMouseY;
    this.dragSession.lastGraphMouseX = currentMouseX;
    this.dragSession.lastGraphMouseY = currentMouseY;

    for (const rec of this.dragSession.records) {
      rec.naturalX += dGraphX;
      rec.naturalY += dGraphY;
    }

    const primaryRec =
      this.dragSession.records.find((r) => r.item === activeItem) || this.dragSession.records[0];
    const naturalX = primaryRec.naturalX;
    const naturalY = primaryRec.naturalY;

    // Compute natural bounds of activeItem
    const vBounds = getItemVisualBoundsAt(activeItem, naturalX, naturalY);

    // Build candidate list — visible nodes and groups not in current dragging session
    const draggedItemsSet = new Set(this.dragSession.records.map((r) => r.item));
    const draggedIdsSet = new Set(
      this.dragSession.records.map((r) => r.item?.id).filter((id) => id !== undefined)
    );

    const candidates = [];

    // 1. Candidate nodes
    if (Array.isArray(graph.nodes)) {
      for (let i = 0; i < graph.nodes.length; i++) {
        const other = graph.nodes[i];
        if (!isNode(other) || draggedItemsSet.has(other) || draggedIdsSet.has(other.id)) continue;
        if (other.mode === 2 || other.mode === 3) continue;

        const cb = getItemVisualBoundsAt(other, other.pos[0], other.pos[1]);
        const boxDist = getBoundingBoxDistance(cb, vBounds);
        if (boxDist < 1400) {
          candidates.push({ ...cb, boxDist, dist: boxDist });
        }
      }
    }

    // 2. Candidate groups
    const graphGroups = getGraphGroups(graph);
    for (let i = 0; i < graphGroups.length; i++) {
      const other = graphGroups[i];
      if (!isGroup(other) || draggedItemsSet.has(other) || draggedIdsSet.has(other.id)) continue;

      const cb = getItemVisualBoundsAt(other, other.pos[0], other.pos[1]);
      const boxDist = getBoundingBoxDistance(cb, vBounds);
      if (boxDist < 1600) {
        candidates.push({ ...cb, boxDist, dist: boxDist });
      }
    }

    if (candidates.length === 0) {
      this.activeGuides = [];
      for (const rec of this.dragSession.records) {
        const it = rec.item || rec.node;
        if (it && it.pos && !isPinned(it)) {
          it.pos[0] = rec.naturalX;
          it.pos[1] = rec.naturalY;
        }
      }
      this.dragSession.snapDeltaX = 0;
      this.dragSession.snapDeltaY = 0;
      return;
    }

    const candidatePool = candidates;

    const baseThreshold = Number(state.snapThreshold) || 8;
    const scale = Math.max(0.2, canvas?.ds?.scale || 1.0);
    // Snap threshold in graph space: capped between 4 and 12 graph pixels so it stays crisp
    const threshold = Math.min(12, Math.max(4, baseThreshold / scale));

    const minMarginX = state.minMarginEnabled ? (Number(state.minMarginX) || 20) : 0;
    const minMarginY = state.minMarginEnabled ? (Number(state.minMarginY) || 20) : 0;

    // --- HORIZONTAL ALIGNMENT (Matching Y coordinates / horizontal guide lines) ---
    let bestYMatch = null;
    let bestYScore = Infinity;

    for (const t of candidatePool) {
      const tests = [];

      if (state.alignEdges) {
        // Direct Edge-to-Edge alignments (Priority 1)
        tests.push({
          targetY: t.top,
          sourceY: vBounds.top,
          diff: t.top - vBounds.top,
          label: "Top Align",
          priority: 1,
        });
        tests.push({
          targetY: t.bottom,
          sourceY: vBounds.bottom,
          diff: t.bottom - vBounds.bottom,
          label: "Bottom Align",
          priority: 1,
        });

        // Flush Edge-to-Edge alignments (Priority 2)
        tests.push({
          targetY: t.top,
          sourceY: vBounds.bottom,
          diff: t.top - vBounds.bottom,
          label: "Edge Align",
          priority: 2,
        });
        tests.push({
          targetY: t.bottom,
          sourceY: vBounds.top,
          diff: t.bottom - vBounds.top,
          label: "Edge Align",
          priority: 2,
        });
      }

      if (state.alignSpacing && state.minMarginEnabled && minMarginY > 0) {
        tests.push({
          targetY: t.bottom + minMarginY,
          sourceY: vBounds.top,
          diff: (t.bottom + minMarginY) - vBounds.top,
          label: `${minMarginY}px Gap`,
          priority: 3,
        });
        tests.push({
          targetY: t.top - minMarginY,
          sourceY: vBounds.bottom,
          diff: (t.top - minMarginY) - vBounds.bottom,
          label: `${minMarginY}px Gap`,
          priority: 3,
        });
      }

      if (state.alignCenters) {
        tests.push({
          targetY: t.centerY,
          sourceY: vBounds.centerY,
          diff: t.centerY - vBounds.centerY,
          label: "Center Align",
          priority: 4,
        });
      }

      // Perpendicular distance (horizontal distance along the alignment line)
      const perpDist = Math.max(0, vBounds.left - t.right, t.left - vBounds.right);
      // Distance penalty ensures close neighbors ALWAYS win over far-away candidates
      const distPenalty = (perpDist / 30) * 6.0 + ((t.boxDist || 0) / 50) * 3.0;

      for (const test of tests) {
        const absDiff = Math.abs(test.diff);
        if (absDiff <= threshold) {
          const typeAffinity = (vBounds.isGroup === t.isGroup) ? -2.0 : 0;
          const score =
            absDiff * 3.0 +
            (test.priority - 1) * 4.0 +
            distPenalty +
            typeAffinity;

          if (score < bestYScore) {
            bestYScore = score;
            bestYMatch = {
              targetItem: t,
              guideY: test.targetY,
              snapDeltaY: test.diff,
              label: test.label,
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
        // Direct Edge-to-Edge alignments (Priority 1)
        tests.push({
          targetX: t.left,
          sourceX: vBounds.left,
          diff: t.left - vBounds.left,
          label: "Left Align",
          priority: 1,
        });
        tests.push({
          targetX: t.right,
          sourceX: vBounds.right,
          diff: t.right - vBounds.right,
          label: "Right Align",
          priority: 1,
        });

        // Flush Edge-to-Edge alignments (Priority 2)
        tests.push({
          targetX: t.left,
          sourceX: vBounds.right,
          diff: t.left - vBounds.right,
          label: "Edge Align",
          priority: 2,
        });
        tests.push({
          targetX: t.right,
          sourceX: vBounds.left,
          diff: t.right - vBounds.left,
          label: "Edge Align",
          priority: 2,
        });
      }

      if (state.alignSpacing && state.minMarginEnabled && minMarginX > 0) {
        tests.push({
          targetX: t.right + minMarginX,
          sourceX: vBounds.left,
          diff: (t.right + minMarginX) - vBounds.left,
          label: `${minMarginX}px Gap`,
          priority: 3,
        });
        tests.push({
          targetX: t.left - minMarginX,
          sourceX: vBounds.right,
          diff: (t.left - minMarginX) - vBounds.right,
          label: `${minMarginX}px Gap`,
          priority: 3,
        });
      }

      if (state.alignCenters) {
        tests.push({
          targetX: t.centerX,
          sourceX: vBounds.centerX,
          diff: t.centerX - vBounds.centerX,
          label: "Center Align",
          priority: 4,
        });
      }

      // Perpendicular distance (vertical distance along the alignment line)
      const perpDist = Math.max(0, vBounds.top - t.bottom, t.top - vBounds.bottom);
      // Distance penalty ensures close neighbors ALWAYS win over far-away candidates
      const distPenalty = (perpDist / 30) * 6.0 + ((t.boxDist || 0) / 50) * 3.0;

      for (const test of tests) {
        const absDiff = Math.abs(test.diff);
        if (absDiff <= threshold) {
          const typeAffinity = (vBounds.isGroup === t.isGroup) ? -2.0 : 0;
          const score =
            absDiff * 3.0 +
            (test.priority - 1) * 4.0 +
            distPenalty +
            typeAffinity;

          if (score < bestXScore) {
            bestXScore = score;
            bestXMatch = {
              targetItem: t,
              guideX: test.targetX,
              snapDeltaX: test.diff,
              label: test.label,
            };
          }
        }
      }
    }

    // Apply snap deltas
    const snapDeltaX = bestXMatch ? bestXMatch.snapDeltaX : 0;
    const snapDeltaY = bestYMatch ? bestYMatch.snapDeltaY : 0;

    this.dragSession.snapDeltaX = snapDeltaX;
    this.dragSession.snapDeltaY = snapDeltaY;

    for (const rec of this.dragSession.records) {
      const it = rec.item || rec.node;
      if (it && it.pos && !isPinned(it)) {
        it.pos[0] = rec.naturalX + snapDeltaX;
        it.pos[1] = rec.naturalY + snapDeltaY;
      }
    }

    const snappedBounds = getItemVisualBoundsAt(
      activeItem,
      primaryRec.naturalX + snapDeltaX,
      primaryRec.naturalY + snapDeltaY
    );

    const guides = [];

    if (bestYMatch) {
      guides.push({
        type: "horizontal",
        y: bestYMatch.guideY,
        sourceBounds: snappedBounds,
        targetBounds: bestYMatch.targetItem,
        label: bestYMatch.label,
      });
    }

    if (bestXMatch) {
      guides.push({
        type: "vertical",
        x: bestXMatch.guideX,
        sourceBounds: snappedBounds,
        targetBounds: bestXMatch.targetItem,
        label: bestXMatch.label,
      });
    }

    this.activeGuides = guides;
    canvas?.setDirty?.(true, true);
  }

  /**
   * Compatibility wrapper for node dragging.
   */
  processNodeDrag(canvas, activeNode, pointerEvent = null) {
    return this.processItemDrag(canvas, activeNode, pointerEvent);
  }

  /**
   * Process group resizing in real-time with edge alignment and visual guides.
   */
  processGroupResize(canvas, group) {
    const state = this.store.state;
    if (!state.enabled || !state.resizeSnap || !group || !isGroup(group) || isPinned(group)) {
      this.resizingGuides = [];
      this.resizeSession = null;
      return;
    }

    const graph = canvas?.graph || app?.graph;
    if (!graph) return;

    // Alt key completely bypasses resize snapping
    const pointerEvent = canvas?.pointer?.eMove || window.event;
    if (pointerEvent?.altKey) {
      this.resizingGuides = [];
      this.resizeSession = null;
      return;
    }

    const allCandidates = [
      ...getGraphGroups(graph).filter((g) => g !== group).map((g) => getItemVisualBoundsAt(g, g.pos[0], g.pos[1])),
      ...(graph.nodes || []).filter(isNode).map((n) => getItemVisualBoundsAt(n, n.pos[0], n.pos[1])),
    ];

    if (allCandidates.length === 0) {
      this.resizingGuides = [];
      this.resizeSession = null;
      return;
    }

    const baseThreshold = Number(state.snapThreshold) || 10;
    const scale = Math.max(0.2, canvas?.ds?.scale || 1.0);
    const threshold = Math.max(4, baseThreshold / scale);

    const minMarginX = state.minMarginEnabled ? (Number(state.minMarginX) || 20) : 0;
    const minMarginY = state.minMarginEnabled ? (Number(state.minMarginY) || 20) : 0;

    const posX = Number(group.pos[0]) || 0;
    const posY = Number(group.pos[1]) || 0;
    const currentW = Math.max(140, Number(group.size[0]) || 140);
    const currentH = Math.max(80, Number(group.size[1]) || 80);
    const currentRight = posX + currentW;
    const currentBottom = posY + currentH;

    const minW = 140;
    const minH = 80;

    let bestRightDiff = Infinity;
    let bestRightTarget = null;
    let bestRightLabel = "Right Align";
    let bestRightW = currentW;
    let bestRightGuideX = currentRight;

    let bestBottomDiff = Infinity;
    let bestBottomTarget = null;
    let bestBottomLabel = "Bottom Align";
    let bestBottomH = currentH;
    let bestBottomGuideY = currentBottom;

    for (const t of allCandidates) {
      // 1. Right-to-Right Edge Align
      const diffRR = Math.abs(currentRight - t.right);
      if (diffRR <= threshold && diffRR < bestRightDiff && (t.right - posX) >= minW) {
        bestRightDiff = diffRR;
        bestRightTarget = t;
        bestRightLabel = "Right Align";
        bestRightW = t.right - posX;
        bestRightGuideX = t.right;
      }

      // 2. Right-to-Left Edge Align / Margin
      if (t.left > posX) {
        const diffRL = Math.abs(currentRight - t.left);
        if (diffRL <= threshold && diffRL < bestRightDiff && (t.left - posX) >= minW) {
          bestRightDiff = diffRL;
          bestRightTarget = t;
          bestRightLabel = "Edge Align";
          bestRightW = t.left - posX;
          bestRightGuideX = t.left;
        }
        if (minMarginX > 0) {
          const diffGap = Math.abs(currentRight - (t.left - minMarginX));
          if (diffGap <= threshold && diffGap < bestRightDiff && (t.left - minMarginX - posX) >= minW) {
            bestRightDiff = diffGap;
            bestRightTarget = t;
            bestRightLabel = `${minMarginX}px Gap`;
            bestRightW = t.left - minMarginX - posX;
            bestRightGuideX = t.left - minMarginX;
          }
        }
      }

      // 3. Bottom-to-Bottom Edge Align
      const diffBB = Math.abs(currentBottom - t.bottom);
      if (diffBB <= threshold && diffBB < bestBottomDiff && (t.bottom - posY) >= minH) {
        bestBottomDiff = diffBB;
        bestBottomTarget = t;
        bestBottomLabel = "Bottom Align";
        bestBottomH = t.bottom - posY;
        bestBottomGuideY = t.bottom;
      }

      // 4. Bottom-to-Top Edge Align / Margin
      if (t.top > posY) {
        const diffBT = Math.abs(currentBottom - t.top);
        if (diffBT <= threshold && diffBT < bestBottomDiff && (t.top - posY) >= minH) {
          bestBottomDiff = diffBT;
          bestBottomTarget = t;
          bestBottomLabel = "Edge Align";
          bestBottomH = t.top - posY;
          bestBottomGuideY = t.top;
        }
        if (minMarginY > 0) {
          const diffGap = Math.abs(currentBottom - (t.top - minMarginY));
          if (diffGap <= threshold && diffGap < bestBottomDiff && (t.top - minMarginY - posY) >= minH) {
            bestBottomDiff = diffGap;
            bestBottomTarget = t;
            bestBottomLabel = `${minMarginY}px Gap`;
            bestBottomH = t.top - minMarginY - posY;
            bestBottomGuideY = t.top - minMarginY;
          }
        }
      }
    }

    const finalW = bestRightTarget ? Math.max(minW, Math.round(bestRightW)) : currentW;
    const finalH = bestBottomTarget ? Math.max(minH, Math.round(bestBottomH)) : currentH;

    if (bestRightTarget || bestBottomTarget) {
      group.size[0] = finalW;
      group.size[1] = finalH;
      group.setDirtyCanvas?.(false, true);

      this.resizeSession = {
        item: group,
        width: bestRightTarget ? finalW : null,
        height: bestBottomTarget ? finalH : null,
      };
    } else {
      this.resizeSession = null;
    }

    const updatedGroupBounds = getGroupVisualBoundsAt(group, posX, posY);
    const guides = [];

    if (bestRightTarget) {
      guides.push({
        type: "vertical",
        x: bestRightGuideX,
        sourceBounds: updatedGroupBounds,
        targetBounds: bestRightTarget,
        label: bestRightLabel,
        isResizeGuide: true,
      });
    }

    if (bestBottomTarget) {
      guides.push({
        type: "horizontal",
        y: bestBottomGuideY,
        sourceBounds: updatedGroupBounds,
        targetBounds: bestBottomTarget,
        label: bestBottomLabel,
        isResizeGuide: true,
      });
    }

    this.resizingGuides = guides;
    canvas?.setDirty?.(true, true);
  }

  /**
   * Process node resizing in real-time with edge alignment, dimension matching, and guidelines.
   */
  processNodeResize(canvas, node) {
    const state = this.store.state;
    if (!state.enabled || !state.resizeSnap || !node || !isNode(node) || isPinned(node)) {
      this.resizingGuides = [];
      this.resizeSession = null;
      return;
    }

    const graph = canvas?.graph || app?.graph;
    if (!graph) return;

    // Alt key completely bypasses resize snapping
    const pointerEvent = canvas?.pointer?.eMove || window.event;
    if (pointerEvent?.altKey) {
      this.resizingGuides = [];
      this.resizeSession = null;
      return;
    }

    const baseThreshold = Number(state.snapThreshold) || 10;
    const scale = Math.max(0.2, canvas?.ds?.scale || 1.0);
    const threshold = Math.max(4, baseThreshold / scale);

    const minMarginX = state.minMarginEnabled ? (Number(state.minMarginX) || 20) : 0;
    const minMarginY = state.minMarginEnabled ? (Number(state.minMarginY) || 20) : 0;

    const posX = Number(node.pos[0]) || 0;
    const posY = Number(node.pos[1]) || 0;
    const currentW = Math.max(10, Number(node.size[0]) || 60);
    const currentH = Math.max(10, Number(node.size[1]) || 40);
    const nodeVBounds = getNodeVisualBoundsAt(node, posX, posY);

    // Minimum node dimensions
    const computedMin = typeof node.computeSize === "function" ? node.computeSize() : [60, 30];
    const minW = Math.max(Number(node.min_width) || 40, computedMin[0] || 60);
    const minH = Math.max(Number(node.min_height) || 30, computedMin[1] || 30);

    // Collect all candidate nodes and groups
    const candidates = [];

    if (Array.isArray(graph.nodes)) {
      for (let i = 0; i < graph.nodes.length; i++) {
        const other = graph.nodes[i];
        if (!isNode(other) || other === node) continue;
        if (other.mode === 2 || other.mode === 3) continue;

        const cb = getItemVisualBoundsAt(other, other.pos[0], other.pos[1]);
        const boxDist = getBoundingBoxDistance(cb, nodeVBounds);
        if (boxDist < 1400) {
          candidates.push({ ...cb, boxDist });
        }
      }
    }

    const graphGroups = getGraphGroups(graph);
    for (let i = 0; i < graphGroups.length; i++) {
      const other = graphGroups[i];
      if (!isGroup(other)) continue;

      const cb = getItemVisualBoundsAt(other, other.pos[0], other.pos[1]);
      const boxDist = getBoundingBoxDistance(cb, nodeVBounds);
      if (boxDist < 1600) {
        candidates.push({ ...cb, boxDist });
      }
    }

    if (candidates.length === 0) {
      this.resizingGuides = [];
      this.resizeSession = null;
      return;
    }

    const resizeDir = canvas?.pointer?.resizeDirection || "SE";
    const affectsRight = resizeDir.includes("E") || resizeDir === "SE" || !resizeDir;
    const affectsBottom = resizeDir.includes("S") || resizeDir === "SE" || !resizeDir;

    let bestWidthMatch = null;
    let bestWidthScore = Infinity;

    let bestHeightMatch = null;
    let bestHeightScore = Infinity;

    // Evaluate candidates
    for (const t of candidates) {
      // --- WIDTH / RIGHT EDGE ALIGNMENT ---
      if (affectsRight) {
        const widthTests = [];

        // 1. Right-to-Right Edge Align (Priority 1)
        const targetW_R = t.right - posX;
        if (targetW_R >= minW) {
          widthTests.push({
            targetW: targetW_R,
            guideX: t.right,
            diff: targetW_R - currentW,
            label: "Right Align",
            priority: 1,
          });
        }

        // 2. Right-to-Left Edge Flush or Margin Gap (Priority 2)
        if (t.left > posX) {
          const targetW_L = t.left - posX;
          if (targetW_L >= minW) {
            widthTests.push({
              targetW: targetW_L,
              guideX: t.left,
              diff: targetW_L - currentW,
              label: "Edge Align",
              priority: 2,
            });
          }
          if (minMarginX > 0 && targetW_L - minMarginX >= minW) {
            widthTests.push({
              targetW: targetW_L - minMarginX,
              guideX: t.left - minMarginX,
              diff: (targetW_L - minMarginX) - currentW,
              label: `${minMarginX}px Gap`,
              priority: 2,
            });
          }
        }

        // 3. Exact Width Dimension Match (Priority 3)
        if (t.width >= minW) {
          widthTests.push({
            targetW: t.width,
            guideX: posX + t.width,
            diff: t.width - currentW,
            label: `Width ${Math.round(t.width)}px`,
            priority: 3,
          });
        }

        const vertDist = Math.max(0, nodeVBounds.top - t.bottom, t.top - nodeVBounds.bottom);
        for (const test of widthTests) {
          const absDiff = Math.abs(test.diff);
          if (absDiff <= threshold) {
            const score =
              absDiff * 2.0 +
              (test.priority - 1) * 5.0 +
              (vertDist / 100) * 1.5 +
              (t.boxDist / 200) * 1.0;
            if (score < bestWidthScore) {
              bestWidthScore = score;
              bestWidthMatch = {
                targetItem: t,
                targetW: test.targetW,
                guideX: test.guideX,
                label: test.label,
              };
            }
          }
        }
      }

      // --- HEIGHT / BOTTOM EDGE ALIGNMENT ---
      if (affectsBottom) {
        const heightTests = [];

        // 1. Bottom-to-Bottom Edge Align (Priority 1)
        const targetH_B = t.bottom - posY;
        if (targetH_B >= minH) {
          heightTests.push({
            targetH: targetH_B,
            guideY: t.bottom,
            diff: targetH_B - currentH,
            label: "Bottom Align",
            priority: 1,
          });
        }

        // 2. Bottom-to-Top Edge Flush or Margin Gap (Priority 2)
        if (t.top > posY) {
          const targetH_T = t.top - posY;
          if (targetH_T >= minH) {
            heightTests.push({
              targetH: targetH_T,
              guideY: t.top,
              diff: targetH_T - currentH,
              label: "Edge Align",
              priority: 2,
            });
          }
          if (minMarginY > 0 && targetH_T - minMarginY >= minH) {
            heightTests.push({
              targetH: targetH_T - minMarginY,
              guideY: t.top - minMarginY,
              diff: (targetH_T - minMarginY) - currentH,
              label: `${minMarginY}px Gap`,
              priority: 2,
            });
          }
        }

        // 3. Exact Height Dimension Match (Priority 3)
        if (t.height >= minH) {
          heightTests.push({
            targetH: t.height,
            guideY: posY + t.height,
            diff: t.height - currentH,
            label: `Height ${Math.round(t.height)}px`,
            priority: 3,
          });
        }

        const horizDist = Math.max(0, nodeVBounds.left - t.right, t.left - nodeVBounds.right);
        for (const test of heightTests) {
          const absDiff = Math.abs(test.diff);
          if (absDiff <= threshold) {
            const score =
              absDiff * 2.0 +
              (test.priority - 1) * 5.0 +
              (horizDist / 100) * 1.5 +
              (t.boxDist / 200) * 1.0;
            if (score < bestHeightScore) {
              bestHeightScore = score;
              bestHeightMatch = {
                targetItem: t,
                targetH: test.targetH,
                guideY: test.guideY,
                label: test.label,
              };
            }
          }
        }
      }
    }

    const finalW = bestWidthMatch ? Math.max(minW, Math.round(bestWidthMatch.targetW)) : currentW;
    const finalH = bestHeightMatch ? Math.max(minH, Math.round(bestHeightMatch.targetH)) : currentH;

    if (bestWidthMatch || bestHeightMatch) {
      node.size[0] = finalW;
      node.size[1] = finalH;
      node.setSize?.(node.size);
      node.onResize?.(node.size);
      node.setDirtyCanvas?.(true, true);

      this.resizeSession = {
        item: node,
        width: bestWidthMatch ? finalW : null,
        height: bestHeightMatch ? finalH : null,
      };
    } else {
      this.resizeSession = null;
    }

    const updatedNodeBounds = getNodeVisualBoundsAt(node, posX, posY);
    const guides = [];

    if (bestWidthMatch) {
      guides.push({
        type: "vertical",
        x: bestWidthMatch.guideX,
        sourceBounds: updatedNodeBounds,
        targetBounds: bestWidthMatch.targetItem,
        label: bestWidthMatch.label,
        isResizeGuide: true,
      });
    }

    if (bestHeightMatch) {
      guides.push({
        type: "horizontal",
        y: bestHeightMatch.guideY,
        sourceBounds: updatedNodeBounds,
        targetBounds: bestHeightMatch.targetItem,
        label: bestHeightMatch.label,
        isResizeGuide: true,
      });
    }

    this.resizingGuides = guides;
    canvas?.setDirty?.(true, true);
  }

  /**
   * Draws active visual alignment guides on the canvas in graph coordinates.
   * Scoped to connect the aligned nodes directly with precision tick marks at extreme edges.
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
    const scale = Math.max(0.2, canvas?.ds?.scale || 1.0);
    const lineWidth = Math.max(1.5, 2.0 / scale);
    const dash = [6 / scale, 4 / scale];

    ctx.save();

    for (const guide of allGuides) {
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      const sb = guide.sourceBounds;
      const tb = guide.targetBounds;

      if (guide.type === "horizontal") {
        let x1, x2;
        if (sb && tb) {
          x1 = Math.min(sb.left, tb.left) - 16 / scale;
          x2 = Math.max(sb.right, tb.right) + 16 / scale;
        } else {
          const va = canvas?.visible_area;
          x1 = va ? va[0] - 100 : -50000;
          x2 = va ? va[2] + 100 : 50000;
        }

        ctx.beginPath();
        ctx.moveTo(x1, guide.y);
        ctx.lineTo(x2, guide.y);
        ctx.stroke();

        // Draw precision extreme-edge ticks
        if (sb && tb) {
          ctx.setLineDash([]);
          ctx.lineWidth = Math.max(2, 2.5 / scale);
          const tickLen = 6 / scale;

          ctx.beginPath();
          ctx.moveTo(sb.left, guide.y - tickLen);
          ctx.lineTo(sb.left, guide.y + tickLen);
          ctx.moveTo(sb.right, guide.y - tickLen);
          ctx.lineTo(sb.right, guide.y + tickLen);
          ctx.moveTo(tb.left, guide.y - tickLen);
          ctx.lineTo(tb.left, guide.y + tickLen);
          ctx.moveTo(tb.right, guide.y - tickLen);
          ctx.lineTo(tb.right, guide.y + tickLen);
          ctx.stroke();
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

          let bx, by;
          if (sb && tb) {
            bx = (sb.centerX + tb.centerX) / 2 - boxW / 2;
            by = guide.y - boxH - 6 / scale;
          } else {
            bx = (x1 + x2) / 2 - boxW / 2;
            by = guide.y - boxH - 6 / scale;
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
      } else {
        let y1, y2;
        if (sb && tb) {
          y1 = Math.min(sb.top, tb.top) - 16 / scale;
          y2 = Math.max(sb.bottom, tb.bottom) + 16 / scale;
        } else {
          const va = canvas?.visible_area;
          y1 = va ? va[1] - 100 : -50000;
          y2 = va ? va[3] + 100 : 50000;
        }

        ctx.beginPath();
        ctx.moveTo(guide.x, y1);
        ctx.lineTo(guide.x, y2);
        ctx.stroke();

        // Draw precision extreme-edge ticks
        if (sb && tb) {
          ctx.setLineDash([]);
          ctx.lineWidth = Math.max(2, 2.5 / scale);
          const tickLen = 6 / scale;

          ctx.beginPath();
          ctx.moveTo(guide.x - tickLen, sb.top);
          ctx.lineTo(guide.x + tickLen, sb.top);
          ctx.moveTo(guide.x - tickLen, sb.bottom);
          ctx.lineTo(guide.x + tickLen, sb.bottom);
          ctx.moveTo(guide.x - tickLen, tb.top);
          ctx.lineTo(guide.x + tickLen, tb.top);
          ctx.moveTo(guide.x - tickLen, tb.bottom);
          ctx.lineTo(guide.x + tickLen, tb.bottom);
          ctx.stroke();
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

          let bx, by;
          if (sb && tb) {
            bx = guide.x + 8 / scale;
            by = (sb.centerY + tb.centerY) / 2 - boxH / 2;
          } else {
            bx = guide.x + 8 / scale;
            by = (y1 + y2) / 2 - boxH / 2;
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
    node.setDirtyCanvas?.(true, true);

    const updatedB = getNodeVisualBounds(node);
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
    node.setDirtyCanvas?.(true, true);

    const updatedB = getNodeVisualBounds(node);
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

        <!-- Section 7: Close (Far Right) -->
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
let lastPointerDownItem = null;
let lastPointerDownPos = null;
let globalListenersInstalled = false;

function installGlobalPointerListeners() {
  if (globalListenersInstalled) return;
  globalListenersInstalled = true;

  // Track selection history and target item on pointerdown
  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;

    const target = e.target;
    if (!target || !(target instanceof Element)) return;

    if (target.closest?.(".ds-snap-popover, .comfy-modal, .litegraph-dialog, .ds-ui-menu, input, textarea, select, button")) {
      return;
    }

    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    lastPointerDownPos = [e.clientX, e.clientY];

    const vueNodeEl = target.closest?.("[data-node-id]");
    if (vueNodeEl) {
      const rawId = vueNodeEl.dataset?.nodeId || vueNodeEl.getAttribute("data-node-id");
      const graph = app?.graph || app?.canvas?.graph;
      const node = graph?.getNodeById?.(rawId);
      if (node && isNode(node)) {
        lastPointerDownItem = node;
        recordNodeSelection(node.id, isMulti);
      }
    } else {
      const canvas = app?.canvas;
      if (canvas?.graph_mouse && canvas.graph) {
        const mouseX = canvas.graph_mouse[0];
        const mouseY = canvas.graph_mouse[1];
        const node = canvas.graph.getNodeOnPos ? canvas.graph.getNodeOnPos(mouseX, mouseY) : null;
        if (node && isNode(node)) {
          lastPointerDownItem = node;
          recordNodeSelection(node.id, isMulti);
        } else {
          const group = canvas.graph.getGroupOnPos ? canvas.graph.getGroupOnPos(mouseX, mouseY) : null;
          if (group && isGroup(group)) {
            lastPointerDownItem = group;
          } else {
            lastPointerDownItem = null;
          }
        }
      }
    }

    if (!isMulti && !vueNodeEl && !lastPointerDownItem && target === app?.canvas?.canvas) {
      selectionHistory = [];
    }
  }, true);

  // Global window pointermove handler (ensures dragging works 100% reliably in Vue nodes and Classic LiteGraph)
  const handleGlobalPointerMove = (e) => {
    if (!snapStore.state.enabled) return;
    if (e && e.__ds_snap_move_handled) return;

    const canvas = app?.canvas;
    if (!canvas) return;

    // Must be dragging with primary mouse button
    if (!e || e.buttons !== 1) {
      if (snapEngine.dragSession || snapEngine.hasGuides()) {
        snapEngine.onDragEnd(canvas);
        snapEngine.onResizeEnd(canvas);
        canvas.setDirty?.(true, true);
      }
      return;
    }

    // Alt-key bypass or search dialog active
    if (e.altKey || isPlacementOrSearchActive()) {
      if (snapEngine.hasGuides()) {
        snapEngine.onDragEnd(canvas);
        canvas.setDirty?.(true, true);
      }
      return;
    }

    // Panning canvas or drawing selection box
    if (canvas.dragging_canvas || canvas.dragging_rectangle) {
      if (snapEngine.hasGuides()) {
        snapEngine.onDragEnd(canvas);
        canvas.setDirty?.(true, true);
      }
      return;
    }

    // Resizing detection - CRITICAL: if resizing, NEVER drag!
    const isResizing = Boolean(
      canvas.resizing_node ||
      canvas.pointer?.resizeDirection ||
      canvas.resizingGroup ||
      (canvas.selected_group && canvas.selected_group_resizing)
    );

    const resizingGroupItem =
      (canvas.resizingGroup && isGroup(canvas.resizingGroup) ? canvas.resizingGroup : null) ||
      (canvas.selected_group && canvas.selected_group_resizing && isGroup(canvas.selected_group) ? canvas.selected_group : null);

    let resizingNodeItem = null;
    if (isNode(canvas.resizing_node)) {
      resizingNodeItem = canvas.resizing_node;
    } else if (canvas.resizing_node || canvas.pointer?.resizeDirection) {
      resizingNodeItem =
        (canvas.current_node && isNode(canvas.current_node) ? canvas.current_node : null) ||
        (canvas.node_over && isNode(canvas.node_over) ? canvas.node_over : null) ||
        (lastPointerDownItem && isNode(lastPointerDownItem) ? lastPointerDownItem : null);
    }

    if (isResizing) {
      e.__ds_snap_move_handled = true;
      if (resizingNodeItem) {
        snapEngine.processNodeResize(canvas, resizingNodeItem);
      } else if (resizingGroupItem) {
        snapEngine.processGroupResize(canvas, resizingGroupItem);
      }
      return;
    }

    // Require at least 4px pointer movement from pointerdown before treating as drag
    if (lastPointerDownPos) {
      const dist = Math.hypot(e.clientX - lastPointerDownPos[0], e.clientY - lastPointerDownPos[1]);
      if (dist < 4) return;
    }

    // Dragged item detection (supports Classic + Vue Nodes + Groups)
    let activeItem = null;

    if (canvas.node_dragged && isNode(canvas.node_dragged) && !isPinned(canvas.node_dragged)) {
      activeItem = canvas.node_dragged;
    } else if (lastPointerDownItem && isNode(lastPointerDownItem) && !isPinned(lastPointerDownItem)) {
      activeItem = lastPointerDownItem;
    } else if (lastPointerDownItem && isGroup(lastPointerDownItem) && !isPinned(lastPointerDownItem)) {
      activeItem = lastPointerDownItem;
    } else if (canvas.current_node && isNode(canvas.current_node) && !isPinned(canvas.current_node) && canvas.isDragging) {
      activeItem = canvas.current_node;
    }

    if (activeItem && !isPinned(activeItem)) {
      e.__ds_snap_move_handled = true;
      snapEngine.processItemDrag(canvas, activeItem, e);
    } else {
      if (snapEngine.activeGuides.length > 0) {
        snapEngine.onDragEnd(canvas);
        canvas.setDirty?.(true, true);
      }
    }
  };

  window.addEventListener("pointermove", handleGlobalPointerMove, false);

  // Pointer release handler
  const handleGlobalPointerRelease = () => {
    lastPointerDownItem = null;
    lastPointerDownPos = null;
    document.body?.classList.remove("ds-canvas-dragging");
    if (snapEngine.dragSession || snapEngine.hasGuides() || snapEngine.resizeSession) {
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
      if (e && e.__ds_snap_move_handled) return res;
      if (e) e.__ds_snap_move_handled = true;

      // Ensure active mouse drag state
      if (!e || e.buttons === 0) {
        if (snapEngine.dragSession || snapEngine.hasGuides()) {
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

        // Detect resizing first - CRITICAL: if resizing, NEVER process as drag!
        const isResizing = Boolean(
          this.resizing_node ||
          this.pointer?.resizeDirection ||
          this.resizingGroup ||
          (this.selected_group && this.selected_group_resizing)
        );

        const resizingGroupItem =
          (this.resizingGroup && isGroup(this.resizingGroup) ? this.resizingGroup : null) ||
          (this.selected_group && this.selected_group_resizing && isGroup(this.selected_group) ? this.selected_group : null);

        let resizingNodeItem = null;
        if (isNode(this.resizing_node)) {
          resizingNodeItem = this.resizing_node;
        } else if (this.resizing_node || this.pointer?.resizeDirection) {
          resizingNodeItem =
            (this.current_node && isNode(this.current_node) ? this.current_node : null) ||
            (this.node_over && isNode(this.node_over) ? this.node_over : null) ||
            (this.selectedItems ? Array.from(this.selectedItems).find(isNode) : null) ||
            (this.selected_nodes ? Object.values(this.selected_nodes).find(isNode) : null) ||
            (lastPointerDownItem && isNode(lastPointerDownItem) ? lastPointerDownItem : null);
        }

        if (isResizing) {
          if (resizingNodeItem) {
            snapEngine.processNodeResize(this, resizingNodeItem);
          } else if (resizingGroupItem) {
            snapEngine.processGroupResize(this, resizingGroupItem);
          }
          return res;
        } else if (snapEngine.resizingGuides.length > 0) {
          snapEngine.onResizeEnd(this);
        }

        // Detect active dragged item (node or group)
        let activeItem = null;

        if (this.node_dragged && isNode(this.node_dragged) && !isPinned(this.node_dragged)) {
          activeItem = this.node_dragged;
        } else if (lastPointerDownItem && isNode(lastPointerDownItem) && !isPinned(lastPointerDownItem)) {
          activeItem = lastPointerDownItem;
        } else if (lastPointerDownItem && isGroup(lastPointerDownItem) && !isPinned(lastPointerDownItem)) {
          activeItem = lastPointerDownItem;
        } else if (this.current_node && isNode(this.current_node) && !isPinned(this.current_node) && (this.selectedItems ? this.selectedItems.has(this.current_node) : true)) {
          activeItem = this.current_node;
        } else if (this.selected_nodes && typeof this.selected_nodes === "object") {
          activeItem = Object.values(this.selected_nodes).find((n) => isNode(n) && !isPinned(n)) || null;
        } else {
          const ordered = getOrderedSelectedNodes(this).filter((n) => !isPinned(n));
          if (ordered.length > 0) activeItem = ordered[0];
        }

        if (activeItem && !isPinned(activeItem) && (this.isDragging || e.buttons === 1)) {
          snapEngine.processItemDrag(this, activeItem, e);
        } else {
          if (snapEngine.activeGuides.length > 0) {
            snapEngine.onDragEnd(this);
            this.setDirty?.(true, true);
          }
        }
      }
    } catch (err) {
      console.warn("[DS Snap] Error in processMouseMove hook:", err);
    }

    return res;
  };

  // 2. Hook Mouse Up
  const origProcessMouseUp = target.processMouseUp;
  target.processMouseUp = function (e) {
    if (e && e.__ds_snap_up_handled) {
      return origProcessMouseUp ? origProcessMouseUp.apply(this, arguments) : undefined;
    }
    if (e) e.__ds_snap_up_handled = true;

    // Capture exact final snapped positions before LiteGraph clears drag state
    let finalPositions = null;
    if (
      snapEngine.dragSession &&
      (snapEngine.dragSession.snapDeltaX !== 0 || snapEngine.dragSession.snapDeltaY !== 0)
    ) {
      finalPositions = snapEngine.dragSession.records.map((r) => ({
        item: r.item || r.node,
        x: r.naturalX + snapEngine.dragSession.snapDeltaX,
        y: r.naturalY + snapEngine.dragSession.snapDeltaY,
      }));
    }

    let res;
    try {
      res = origProcessMouseUp ? origProcessMouseUp.apply(this, arguments) : undefined;
    } finally {
      if (finalPositions) {
        // Enforce exact snapped positions across any grid snap overrides
        for (const it of finalPositions) {
          if (it.item && it.item.pos && !isPinned(it.item)) {
            it.item.pos[0] = it.x;
            it.item.pos[1] = it.y;
            it.item.setDirtyCanvas?.(true, true);
          }
        }
      }
      snapEngine.onDragEnd(this);
      snapEngine.onResizeEnd(this);
      this.setDirty?.(true, true);
    }
    return res;
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

