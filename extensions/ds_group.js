// Deathshot Arsenal — DS Group
// Frontend-only enhancement of ComfyUI's native LGraphGroup.
// Stored as a normal graph group; no executable Python node is created.

import { app } from "../../../scripts/app.js";

const EXTENSION = "DeathshotArsenal.DSGroup";
const FLAG = "ds_group";
const DEFAULT_TITLE = "DS Group";
const PADDING = 14;
const MIN_W = 180;
const MIN_H = 90;
const TITLE_H_FALLBACK = 30;
const BUTTON = 18;
const GAP = 4;
const RIGHT = 8;

let installed = false;
let tooltipEl = null;
let hoverGroup = null;
let hoverAction = null;
let hoverTimer = null;

function graphForCanvas(canvas = app?.canvas) {
    return canvas?.graph || app?.graph || null;
}

function groupsFor(graph) {
    return graph?.groups || graph?._groups || [];
}

function dirty(graph) {
    try { graph?.setDirtyCanvas?.(true, true); } catch (_) {}
    try { app?.canvas?.setDirty?.(true, true); } catch (_) {}
}

function titleHeight(group) {
    return Number(group?.titleHeight) || Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT) || TITLE_H_FALLBACK;
}

function isNode(item) {
    return !!item && Array.isArray(item.pos) && Array.isArray(item.size) && item.inputs !== undefined;
}

function selectedNodes(canvas = app?.canvas) {
    // Prefer the explicit node-only selection dictionary. This survives the
    // context-menu interaction much better than re-reading `selected` later.
    const dict = canvas?.selected_nodes;
    if (dict && typeof dict === "object") {
        const values = Object.values(dict).filter(isNode);
        if (values.length) return values;
    }

    const selectedItems = canvas?.selectedItems;
    if (selectedItems && typeof selectedItems.values === "function") {
        const values = [...selectedItems.values()].filter(isNode);
        if (values.length) return values;
    }

    const graph = graphForCanvas(canvas);
    return (graph?.nodes || []).filter((n) => n?.selected);
}

function nodeRect(node) {
    return {
        left: Number(node.pos?.[0]) || 0,
        top: Number(node.pos?.[1]) || 0,
        right: (Number(node.pos?.[0]) || 0) + (Number(node.size?.[0]) || 0),
        bottom: (Number(node.pos?.[1]) || 0) + (Number(node.size?.[1]) || 0),
    };
}

function groupRect(group) {
    const b = group?.boundingRect || group?._bounding;
    if (!b) return null;
    return { left: b[0], top: b[1], right: b[0] + b[2], bottom: b[1] + b[3] };
}

function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function overlapArea(a, b) {
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return w * h;
}

function nodesTouchingGroup(group) {
    const graph = group?.graph || graphForCanvas();
    const gr = groupRect(group);
    if (!graph || !gr) return [];

    // Ignore the title bar when deciding what the group contains.
    const body = { ...gr, top: gr.top + titleHeight(group) };
    return (graph.nodes || []).filter((node) => {
        if (!node || node === group) return false;
        const nr = nodeRect(node);
        if (!intersects(nr, body)) return false;
        // A 1px overlap is enough to count. This deliberately does not use
        // native recomputeInsideNodes(), which is centre-point based.
        return overlapArea(nr, body) > 0;
    });
}

function getGroupNodes(group) {
    // Prefer our geometric membership so Fit works even when a node is only
    // partially inside the group. Once fitted, native membership is rebuilt.
    const touching = nodesTouchingGroup(group);
    if (touching.length) return touching;
    return [...(group?._nodes || [])].filter(Boolean);
}

function fitGroupToNodes(group, nodes = null, padding = PADDING) {
    if (!group) return false;
    const list = nodes || getGroupNodes(group);
    if (!list.length) return false;

    if (typeof group.resizeTo === "function") {
        group.resizeTo(list, padding);
    } else {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const node of list) {
            const r = nodeRect(node);
            left = Math.min(left, r.left);
            top = Math.min(top, r.top);
            right = Math.max(right, r.right);
            bottom = Math.max(bottom, r.bottom);
        }
        const th = titleHeight(group);
        group.pos = [left - padding, top - padding - th];
        group.size = [Math.max(MIN_W, right - left + padding * 2), Math.max(MIN_H, bottom - top + padding * 2 + th)];
    }

    group.recomputeInsideNodes?.();
    dirty(group.graph);
    return true;
}

function createNativeGroup(canvas, nodes = []) {
    const graph = graphForCanvas(canvas);
    if (!graph) return null;

    const GroupCtor = globalThis.LiteGraph?.LGraphGroup;
    if (!GroupCtor) {
        console.error("[DS Group] Native LGraphGroup constructor unavailable");
        return null;
    }

    const group = new GroupCtor(DEFAULT_TITLE);
    group.title = DEFAULT_TITLE;
    group.flags = { ...(group.flags || {}), [FLAG]: true };
    group.color = "#4a8b5c";
    group.pos = [0, 0];
    group.size = [MIN_W, MIN_H];
    graph.add(group);

    if (nodes.length) {
        fitGroupToNodes(group, nodes, PADDING);
    } else {
        const p = canvas?.graph_mouse || [0, 0];
        group.pos = [p[0], p[1]];
        group.recomputeInsideNodes?.();
    }

    try {
        canvas.deselectAll?.();
        if (canvas.selectedItems?.clear) canvas.selectedItems.clear();
        group.selected = true;
        canvas.selectedItems?.add?.(group);
    } catch (_) {}

    dirty(graph);
    console.log(`[DS Group] Created "${group.title}"${nodes.length ? ` around ${nodes.length} selected node(s)` : ""}`);
    return group;
}

function allSelectedNodeIds(canvas) {
    return selectedNodes(canvas).map((n) => n.id).filter((id) => id != null);
}

function nodesFromIds(graph, ids) {
    const set = new Set(ids.map(String));
    return (graph?.nodes || []).filter((n) => set.has(String(n.id)));
}

function groupNodeCount(group) {
    return getGroupNodes(group).length;
}

function toggleBypass(group) {
    const nodes = getGroupNodes(group);
    if (!nodes.length) {
        console.warn("[DS Group] Bypass: no nodes found inside group");
        return;
    }

    // Keep each node's previous mode so Restore does not accidentally turn
    // muted nodes (mode 2) into normal nodes. ComfyUI documents changeMode()
    // as the supported way to switch a node between normal (0) and bypass (4).
    const saved = group.__dsBypassModes instanceof Map
        ? group.__dsBypassModes
        : new Map();
    const allBypassed = nodes.every((n) => Number(n.mode) === 4);

    if (!allBypassed) {
        saved.clear();
        for (const node of nodes) {
            const id = node.id != null ? String(node.id) : node;
            saved.set(id, Number(node.mode) || 0);
            try {
                if (typeof node.changeMode === "function") node.changeMode(4);
                else node.mode = 4;
            } catch (_) {
                node.mode = 4;
            }
            // Some frontend builds update the mode asynchronously/eventually;
            // guarantee the actual node state is bypassed as a fallback.
            if (Number(node.mode) !== 4) node.mode = 4;
            node.setDirtyCanvas?.(true, true);
        }
        group.__dsBypassModes = saved;
    } else {
        for (const node of nodes) {
            const id = node.id != null ? String(node.id) : node;
            const previous = saved.has(id) ? saved.get(id) : 0;
            try {
                if (typeof node.changeMode === "function") node.changeMode(previous);
                else node.mode = previous;
            } catch (_) {
                node.mode = previous;
            }
            if (Number(node.mode) !== previous) node.mode = previous;
            node.setDirtyCanvas?.(true, true);
        }
        saved.clear();
    }

    // Recompute execution order/change state and force both canvas layers to
    // refresh. This makes the action behave like ComfyUI's native node mode
    // controls instead of only changing an in-memory property.
    try { group.graph?.updateExecutionOrder?.(); } catch (_) {}
    try { group.graph?.change?.(); } catch (_) {}
    dirty(group.graph);
    console.log(`[DS Group] ${allBypassed ? "Restored" : "Bypassed"} ${nodes.length} node(s) in "${group.title}"`);
}

function buttonRects(group) {
    const width = Number(group.size?.[0]) || MIN_W;
    const th = titleHeight(group);
    const count = String(groupNodeCount(group));
    const countW = Math.max(26, 12 + count.length * 7);
    const total = BUTTON * 3 + GAP * 3 + countW;
    let x = width - RIGHT - total;
    const y = Math.max(3, (th - BUTTON) / 2);
    const make = (action, w = BUTTON) => {
        const r = { x, y, w, h: BUTTON, action };
        x += w + GAP;
        return r;
    };
    return [make("fit"), make("pin"), make("bypass"), make("count", countW)];
}

function pointIn(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function canvasPoint(canvas, event) {
    try { return canvas.convertEventToCanvasOffset?.(event); } catch (_) { return null; }
}

function findGroupAtPoint(canvas, point) {
    const graph = graphForCanvas(canvas);
    const groups = groupsFor(graph);
    let best = null;
    for (const group of groups) {
        if (!group?.flags?.[FLAG]) continue;
        const b = groupRect(group);
        if (!b) continue;
        if (point[0] >= b.left && point[0] <= b.right && point[1] >= b.top && point[1] <= b.bottom) {
            // Prefer the smallest/most-specific group when groups overlap.
            if (!best || (group.size[0] * group.size[1]) < (best.size[0] * best.size[1])) best = group;
        }
    }
    return best;
}

function actionAt(group, point) {
    const b = groupRect(group);
    if (!b) return null;
    const local = { x: point[0] - b.left, y: point[1] - b.top };
    if (local.y < 0 || local.y > titleHeight(group)) return null;
    return buttonRects(group).find((r) => pointIn(r, local.x, local.y) && r.action !== "count") || null;
}

function tooltipText(action, group) {
    if (!action) return "";
    if (action === "fit") return "Fit group to nodes";
    if (action === "pin") return group?.pinned ? "Unpin group" : "Pin group";
    if (action === "bypass") return "Bypass / restore nodes";
    return "";
}

function ensureTooltip() {
    if (tooltipEl?.isConnected) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.id = "ds-group-tooltip";
    Object.assign(tooltipEl.style, {
        position: "fixed",
        zIndex: "999999",
        display: "none",
        pointerEvents: "none",
        padding: "6px 8px",
        borderRadius: "5px",
        background: "rgba(20,22,24,.96)",
        color: "#f0f2f0",
        border: "1px solid rgba(112,185,128,.45)",
        boxShadow: "0 4px 14px rgba(0,0,0,.35)",
        font: "12px Arial, sans-serif",
        whiteSpace: "nowrap",
    });
    document.body.appendChild(tooltipEl);
    return tooltipEl;
}

function hideTooltip() {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverGroup = null;
    hoverAction = null;
    if (tooltipEl) tooltipEl.style.display = "none";
}

function scheduleTooltip(group, action, event) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverGroup = group;
    hoverAction = action;
    hoverTimer = setTimeout(() => {
        if (hoverGroup !== group || hoverAction !== action) return;
        const text = tooltipText(action, group);
        if (!text) return;
        const el = ensureTooltip();
        el.textContent = text;
        const x = Number(event.clientX) || 0;
        const y = Number(event.clientY) || 0;
        el.style.left = `${x + 12}px`;
        el.style.top = `${y + 16}px`;
        el.style.display = "block";
    }, 650);
}

function pointerMove(event) {
    const canvas = app?.canvas;
    const point = canvasPoint(canvas, event);
    if (!point) return;
    const group = findGroupAtPoint(canvas, point);
    const action = group ? actionAt(group, point) : null;
    if (!action) {
        hideTooltip();
        return;
    }
    scheduleTooltip(group, action.action, event);
}

function pointerDown(event) {
    if (event.button !== 0) return;
    const canvas = app?.canvas;
    const point = canvasPoint(canvas, event);
    if (!point) return;
    const group = findGroupAtPoint(canvas, point);
    const action = group ? actionAt(group, point) : null;
    if (!group || !action) return;

    hideTooltip();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (action.action === "fit") {
        fitGroupToNodes(group, getGroupNodes(group), PADDING);
    } else if (action.action === "pin") {
        group.pin?.(!group.pinned);
        dirty(group.graph);
    } else if (action.action === "bypass") {
        toggleBypass(group);
    }
}

function installPointerHandlers() {
    if (installed) return;
    const el = app?.canvas?.canvas;
    if (!el) return;
    installed = true;
    el.addEventListener("pointermove", pointerMove, true);
    el.addEventListener("pointerleave", hideTooltip, true);
    el.addEventListener("pointerdown", pointerDown, true);
}

function drawPinIcon(ctx, cx, cy, pinned, inkColor = "#e8f1ea") {
    // Compact, monochrome pushpin silhouette. The state is intentionally
    // conveyed by fill/highlight rather than an emoji's platform-dependent
    // colors.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.lineWidth = 1.35;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const ink = inkColor;
    ctx.strokeStyle = ink;
    ctx.fillStyle = pinned ? ink : (inkColor === "#0a0c10" ? "rgba(0,0,0,.15)" : "rgba(232,241,234,.10)");

    ctx.beginPath();
    ctx.moveTo(-4.5, -6);
    ctx.lineTo(4.5, -6);
    ctx.lineTo(3.1, -2.4);
    ctx.lineTo(1.7, -1.2);
    ctx.lineTo(1.7, 2.0);
    ctx.lineTo(-1.7, 2.0);
    ctx.lineTo(-1.7, -1.2);
    ctx.lineTo(-3.1, -2.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, 7);
    ctx.stroke();

    ctx.restore();
}

// Color conversion helpers for DS Group theming
function hexToRgb(hex) {
    let c = String(hex || "").trim().replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    if (c.length >= 6) {
        return {
            r: parseInt(c.slice(0, 2), 16) || 0,
            g: parseInt(c.slice(2, 4), 16) || 0,
            b: parseInt(c.slice(4, 6), 16) || 0,
        };
    }
    return { r: 74, g: 139, b: 92 };
}

function rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s, v: v };
}

function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) { r1 = c; g1 = x; }
    else if (h < 120) { r1 = x; g1 = c; }
    else if (h < 180) { g1 = c; b1 = x; }
    else if (h < 240) { g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

function getContrastColor(hex) {
    const rgb = hexToRgb(hex);
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    return yiq >= 150 ? "#0a0c10" : "#f2f5f2";
}

function drawDsGroup(graphCanvas, ctx) {
    const group = this;
    const [x, y] = group.pos;
    const [width, height] = group.size;
    const th = titleHeight(group);
    const count = groupNodeCount(group);
    const buttons = buttonRects(group);
    const header = group.color || "#4a8b5c";
    const radius = 9;

    ctx.save();
    const alpha = Number(graphCanvas?.editor_alpha) || 1;

    // Dark body background
    ctx.globalAlpha = alpha * 0.40;
    ctx.fillStyle = "#0c1015";
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    // Subtle tint with group header color
    ctx.globalAlpha = alpha * 0.08;
    ctx.fillStyle = header;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    // Header fill: Top corners curved with radius, bottom corners strictly square [radius, radius, 0, 0].
    // This completely prevents the armature / scaffolding gap shown under the rounded corners!
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillStyle = header;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, width, th, [radius, radius, 0, 0]);
    } else {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        ctx.lineTo(x + width, y + th);
        ctx.lineTo(x, y + th);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    }
    ctx.fill();

    // Outer boundary stroke
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = header;
    ctx.lineWidth = group.selected ? 2 : 1.3;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, radius);
    ctx.stroke();

    // Horizontal separator line under header
    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y + th + 0.5);
    ctx.lineTo(x + width, y + th + 0.5);
    ctx.stroke();

    // Contrast-aware title text
    const titleTextColor = getContrastColor(header);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = titleTextColor;
    ctx.font = `${Math.max(11, Math.min(15, Number(group.font_size) || 13))}px ${globalThis.LiteGraph?.GROUP_FONT || "Arial"}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(group.title || DEFAULT_TITLE), x + 11, y + th / 2 + 1);

    const nodes = getGroupNodes(group);
    const bypassed = nodes.length > 0 && nodes.every((n) => Number(n.mode) === 4);
    const isHeaderBright = titleTextColor === "#0a0c10";

    const labels = { fit: "↔", bypass: bypassed ? "◉" : "◌" };

    for (const r of buttons) {
        if (r.action === "count") {
            ctx.fillStyle = isHeaderBright ? "rgba(0,0,0,.15)" : "rgba(0,0,0,.24)";
            ctx.beginPath();
            ctx.roundRect(x + r.x, y + r.y, r.w, r.h, 7);
            ctx.fill();
            ctx.fillStyle = isHeaderBright ? "#111827" : "#dce9df";
            ctx.font = "bold 10px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(count), x + r.x + r.w / 2, y + r.y + r.h / 2 + 0.5);
        } else {
            const isPinnedButton = r.action === "pin";
            const isPinned = isPinnedButton && !!group.pinned;

            ctx.fillStyle = isPinned
                ? (isHeaderBright ? "rgba(0,0,0,.22)" : "rgba(220,240,225,.24)")
                : (isHeaderBright ? "rgba(0,0,0,.12)" : "rgba(0,0,0,.20)");
            ctx.beginPath();
            ctx.roundRect(x + r.x, y + r.y, r.w, r.h, 5);
            ctx.fill();

            if (isPinnedButton) {
                drawPinIcon(
                    ctx,
                    x + r.x + r.w / 2,
                    y + r.y + r.h / 2,
                    isPinned,
                    isHeaderBright ? "#0a0c10" : "#e8f1ea"
                );
            } else {
                ctx.fillStyle = isHeaderBright ? "#0a0c10" : "#e8f1ea";
                ctx.font = "bold 12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(labels[r.action], x + r.x + r.w / 2, y + r.y + r.h / 2 + 0.5);
            }
        }
    }

    // Resize grip colored with active group accent
    ctx.strokeStyle = header;
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + width - 3, y + height - 12);
    ctx.lineTo(x + width - 12, y + height - 3);
    ctx.moveTo(x + width - 3, y + height - 7);
    ctx.lineTo(x + width - 7, y + height - 3);
    ctx.stroke();

    ctx.restore();
}

function decorate(group) {
    if (!group || !group.flags?.[FLAG]) return;
    if (group.__dsGroupInstalled) return;
    group.__dsGroupInstalled = true;
    group.color = group.color || "#4a8b5c";
    group.draw = drawDsGroup;
    group.getMenuOptions = function () {
        return [
            { content: this.pinned ? "Unpin" : "Pin", callback: () => { this.pin?.(!this.pinned); dirty(this.graph); } },
            { content: "Fit to nodes", callback: () => fitGroupToNodes(this, getGroupNodes(this), PADDING) },
            { content: "Bypass / restore nodes", callback: () => toggleBypass(this) },
            null,
            { content: "Group Settings...", callback: () => openGroupGearPopover(this) },
            { content: "Rename", callback: () => {
                const value = prompt("DS Group title", this.title || DEFAULT_TITLE);
                if (value !== null) { this.title = value.trim() || DEFAULT_TITLE; dirty(this.graph); }
            } },
            { content: "Remove group", callback: () => { const g = this.graph; g?.remove?.(this); dirty(g); } },
        ];
    };
}

function isGraphGroup(item) {
    const GroupCtor = globalThis.LiteGraph?.LGraphGroup;
    if (GroupCtor && item instanceof GroupCtor) return true;
    // Compatibility fallback for builds where LGraphGroup is not exposed
    // on the LiteGraph global but native groups still carry the group shape.
    return !!item && Array.isArray(item.pos) && Array.isArray(item.size) &&
        Array.isArray(item._nodes) && item.title !== undefined && item.graph !== undefined;
}

function installGraphHooks(graph) {
    if (!graph || graph.__dsGroupHooksInstalled) return;
    if (typeof graph.add !== "function") return;

    const originalAdd = graph.add;
    graph.add = function (...args) {
        const item = args[0];
        const result = originalAdd.apply(this, args);

        // Native ComfyUI groups are added through LGraph.add(). Decorating here
        // makes DS groups created while ComfyUI is already running immediately
        // use the custom renderer/menu instead of waiting for a workflow reload.
        if (isGraphGroup(item) && item.flags?.[FLAG]) {
            decorate(item);
            dirty(this);
        }

        return result;
    };

    graph.__dsGroupHooksInstalled = true;
}

function decorateAll() {
    const graph = app?.graph;
    for (const group of groupsFor(graph)) decorate(group);
}

// ---------------------------------------------------------------------------
// Deathshot Curated Accent Presets & Proprietary 2D Color Picker
// ---------------------------------------------------------------------------
const DS_ACCENT_PRESETS = [
    { name: "DS Cyan", hex: "#67e8f9" },
    { name: "Forest", hex: "#4a8b5c" },
    { name: "Emerald", hex: "#10b981" },
    { name: "Lime", hex: "#39ff14" },
    { name: "Iceberg", hex: "#06b6d4" },
    { name: "Sky", hex: "#38bdf8" },
    { name: "Cobalt", hex: "#3b82f6" },
    { name: "Indigo", hex: "#6366f1" },
    { name: "Amethyst", hex: "#a855f7" },
    { name: "Dracula", hex: "#bd93f9" },
    { name: "Pink", hex: "#ec4899" },
    { name: "Rose", hex: "#fb7185" },
    { name: "Crimson", hex: "#ef4444" },
    { name: "Orange", hex: "#f97316" },
    { name: "Amber", hex: "#f59e0b" },
    { name: "Yellow", hex: "#fcee0a" },
    { name: "Slate", hex: "#64748b" },
    { name: "White", hex: "#ffffff" },
];

function createGroupColorEngine({ initialColor, onColorChange }) {
    const root = document.createElement("div");
    root.className = "ds-grp-color-engine";

    let rgb = hexToRgb(initialColor || "#4a8b5c");
    let hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

    const canvasRow = document.createElement("div");
    canvasRow.className = "ds-grp-color-canvas-row";

    // 2D Sat/Val canvas box
    const satvalWrap = document.createElement("div");
    satvalWrap.className = "ds-grp-satval-wrap";
    const satvalCanvas = document.createElement("canvas");
    satvalCanvas.className = "ds-grp-satval-canvas";
    satvalCanvas.width = 172;
    satvalCanvas.height = 104;
    const satvalReticle = document.createElement("div");
    satvalReticle.className = "ds-grp-satval-reticle";
    satvalWrap.append(satvalCanvas, satvalReticle);

    // Vertical Hue bar
    const hueWrap = document.createElement("div");
    hueWrap.className = "ds-grp-hue-wrap";
    const hueBar = document.createElement("div");
    hueBar.className = "ds-grp-hue-bar";
    const hueScrub = document.createElement("div");
    hueScrub.className = "ds-grp-hue-scrub";
    hueWrap.append(hueBar, hueScrub);

    canvasRow.append(satvalWrap, hueWrap);

    // Inputs Row (Swatch preview + Hex text input)
    const inputsRow = document.createElement("div");
    inputsRow.className = "ds-grp-color-inputs-row";

    const swatch = document.createElement("div");
    swatch.className = "ds-grp-active-swatch";

    const hexInputWrap = document.createElement("div");
    hexInputWrap.className = "ds-grp-hex-input-wrap";
    const hexPrefix = document.createElement("span");
    hexPrefix.className = "ds-grp-hex-prefix";
    hexPrefix.textContent = "#";
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "ds-grp-hex-input";
    hexInput.maxLength = 6;
    hexInput.spellcheck = false;
    hexInputWrap.append(hexPrefix, hexInput);

    inputsRow.append(swatch, hexInputWrap);
    root.append(canvasRow, inputsRow);

    const ctx = satvalCanvas.getContext("2d");

    const renderSatVal = () => {
        const w = satvalCanvas.width;
        const h = satvalCanvas.height;

        ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
        ctx.fillRect(0, 0, w, h);

        const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
        whiteGrad.addColorStop(0, "rgba(255,255,255,1)");
        whiteGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = whiteGrad;
        ctx.fillRect(0, 0, w, h);

        const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
        blackGrad.addColorStop(0, "rgba(0,0,0,0)");
        blackGrad.addColorStop(1, "rgba(0,0,0,1)");
        ctx.fillStyle = blackGrad;
        ctx.fillRect(0, 0, w, h);
    };

    const syncUI = (fire = true) => {
        renderSatVal();

        const rx = hsv.s * (satvalCanvas.clientWidth || 172);
        const ry = (1 - hsv.v) * (satvalCanvas.clientHeight || 104);
        satvalReticle.style.left = `${rx}px`;
        satvalReticle.style.top = `${ry}px`;

        const hy = (hsv.h / 360) * (hueBar.clientHeight || 104);
        hueScrub.style.top = `${hy}px`;

        const curRgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        const hex = rgbToHex(curRgb.r, curRgb.g, curRgb.b);
        swatch.style.backgroundColor = hex;
        hexInput.value = hex.replace("#", "").toUpperCase();

        if (fire) onColorChange?.(hex);
    };

    const applyColor = (hex, fire = true) => {
        const parsed = hexToRgb(hex);
        rgb = parsed;
        hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
        syncUI(fire);
    };

    // Dragging Sat/Val
    let isDraggingSatVal = false;
    const updateSatValFromEvent = (e) => {
        const rect = satvalWrap.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        hsv.s = rect.width ? x / rect.width : 0;
        hsv.v = rect.height ? 1 - (y / rect.height) : 1;
        syncUI(true);
    };

    satvalWrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingSatVal = true;
        satvalWrap.setPointerCapture(e.pointerId);
        updateSatValFromEvent(e);
    });
    satvalWrap.addEventListener("pointermove", (e) => {
        if (isDraggingSatVal) updateSatValFromEvent(e);
    });
    satvalWrap.addEventListener("pointerup", (e) => {
        isDraggingSatVal = false;
        try { satvalWrap.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    // Dragging Hue
    let isDraggingHue = false;
    const updateHueFromEvent = (e) => {
        const rect = hueBar.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        hsv.h = rect.height ? (y / rect.height) * 360 : 0;
        syncUI(true);
    };

    hueWrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingHue = true;
        hueWrap.setPointerCapture(e.pointerId);
        updateHueFromEvent(e);
    });
    hueWrap.addEventListener("pointermove", (e) => {
        if (isDraggingHue) updateHueFromEvent(e);
    });
    hueWrap.addEventListener("pointerup", (e) => {
        isDraggingHue = false;
        try { hueWrap.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    hexInput.addEventListener("input", () => {
        let val = hexInput.value.trim().replace(/[^0-9a-fA-F]/g, "");
        if (val.length === 3 || val.length === 6) {
            applyColor(`#${val}`, true);
        }
    });

    requestAnimationFrame(() => syncUI(false));

    return {
        root,
        setColor: (hex) => applyColor(hex, false),
        getColor: () => {
            const curRgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
            return rgbToHex(curRgb.r, curRgb.g, curRgb.b);
        },
    };
}

let activeGroupPopover = null;

function closeGroupGearPopover() {
    if (activeGroupPopover) {
        activeGroupPopover.remove();
        activeGroupPopover = null;
    }
}

function openGroupGearPopover(group, anchorEl = null) {
    if (!group) return;
    closeGroupGearPopover();

    // Ensure group is decorated as a DS Group
    if (!group.flags?.[FLAG]) {
        group.flags = { ...(group.flags || {}), [FLAG]: true };
        decorate(group);
    }

    const popover = document.createElement("div");
    popover.className = "ds-group-gear-popover";

    // 1. Header Bar
    const headerEl = document.createElement("div");
    headerEl.className = "ds-grp-popover-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-grp-popover-title-wrap";

    const iconBadge = document.createElement("span");
    iconBadge.className = "ds-grp-popover-badge";
    iconBadge.textContent = "GROUP";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "ds-grp-title-input";
    titleInput.value = group.title || DEFAULT_TITLE;
    titleInput.placeholder = "Group title...";
    titleInput.addEventListener("input", (e) => {
        group.title = e.target.value.trim() || DEFAULT_TITLE;
        dirty(group.graph);
        try { group.graph?.change?.(); } catch (_) {}
    });

    titleWrap.append(iconBadge, titleInput);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ds-grp-popover-close-btn";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", closeGroupGearPopover);

    headerEl.append(titleWrap, closeBtn);
    popover.appendChild(headerEl);

    // 2. Quick Action Chips Row
    const actionsRow = document.createElement("div");
    actionsRow.className = "ds-grp-actions-row";

    const fitBtn = document.createElement("button");
    fitBtn.type = "button";
    fitBtn.className = "ds-grp-action-chip";
    fitBtn.innerHTML = `<span>↔</span> <span>Fit</span>`;
    fitBtn.title = "Fit group to nodes";
    fitBtn.addEventListener("click", () => {
        fitGroupToNodes(group, getGroupNodes(group), PADDING);
        updateNodeCount();
    });

    const isPinned = !!group.pinned;
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = `ds-grp-action-chip ${isPinned ? "is-active" : ""}`;
    pinBtn.innerHTML = `<span>📌</span> <span>${isPinned ? "Pinned" : "Pin"}</span>`;
    pinBtn.title = isPinned ? "Unpin group" : "Pin group";
    pinBtn.addEventListener("click", () => {
        group.pin?.(!group.pinned);
        dirty(group.graph);
        const next = !!group.pinned;
        pinBtn.classList.toggle("is-active", next);
        pinBtn.querySelector("span:last-child").textContent = next ? "Pinned" : "Pin";
    });

    const nodes = getGroupNodes(group);
    const isBypassed = nodes.length > 0 && nodes.every((n) => Number(n.mode) === 4);
    const bypassBtn = document.createElement("button");
    bypassBtn.type = "button";
    bypassBtn.className = `ds-grp-action-chip ${isBypassed ? "is-active" : ""}`;
    bypassBtn.innerHTML = `<span>${isBypassed ? "◉" : "◌"}</span> <span>${isBypassed ? "Bypassed" : "Bypass"}</span>`;
    bypassBtn.title = "Bypass or restore contained nodes";
    bypassBtn.addEventListener("click", () => {
        toggleBypass(group);
        const nowNodes = getGroupNodes(group);
        const nowBypassed = nowNodes.length > 0 && nowNodes.every((n) => Number(n.mode) === 4);
        bypassBtn.classList.toggle("is-active", nowBypassed);
        bypassBtn.querySelector("span:first-child").textContent = nowBypassed ? "◉" : "◌";
        bypassBtn.querySelector("span:last-child").textContent = nowBypassed ? "Bypassed" : "Bypass";
    });

    const countChip = document.createElement("span");
    countChip.className = "ds-grp-count-chip";
    const updateNodeCount = () => {
        const c = groupNodeCount(group);
        countChip.textContent = `${c} node${c === 1 ? "" : "s"}`;
    };
    updateNodeCount();

    actionsRow.append(fitBtn, pinBtn, bypassBtn, countChip);
    popover.appendChild(actionsRow);

    // Separator
    const sep1 = document.createElement("div");
    sep1.className = "ds-grp-popover-sep";
    popover.appendChild(sep1);

    // 3. Accent Presets Section
    const presetsSection = document.createElement("div");
    presetsSection.className = "ds-grp-section";

    const presetsLabel = document.createElement("div");
    presetsLabel.className = "ds-grp-section-label";
    presetsLabel.textContent = "ACCENT PRESETS";
    presetsSection.appendChild(presetsLabel);

    const presetsGrid = document.createElement("div");
    presetsGrid.className = "ds-grp-presets-grid";

    let colorEngine = null;

    const highlightActivePreset = (currentHex) => {
        const norm = (currentHex || "").toLowerCase();
        presetsGrid.querySelectorAll(".ds-grp-preset-chip").forEach((btn) => {
            const btnHex = (btn.dataset.hex || "").toLowerCase();
            const isActive = btnHex === norm;
            btn.classList.toggle("is-active", isActive);
        });
    };

    const applyGroupColor = (hex) => {
        group.color = hex;
        dirty(group.graph);
        try { group.graph?.change?.(); } catch (_) {}
        highlightActivePreset(hex);
    };

    DS_ACCENT_PRESETS.forEach((preset) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ds-grp-preset-chip";
        chip.dataset.hex = preset.hex;
        chip.title = `${preset.name} (${preset.hex})`;

        const dot = document.createElement("span");
        dot.className = "ds-grp-preset-dot";
        dot.style.backgroundColor = preset.hex;

        const nameSpan = document.createElement("span");
        nameSpan.className = "ds-grp-preset-name";
        nameSpan.textContent = preset.name;

        chip.append(dot, nameSpan);

        chip.addEventListener("click", () => {
            applyGroupColor(preset.hex);
            colorEngine?.setColor(preset.hex);
        });

        presetsGrid.appendChild(chip);
    });

    presetsSection.appendChild(presetsGrid);
    popover.appendChild(presetsSection);

    // Separator
    const sep2 = document.createElement("div");
    sep2.className = "ds-grp-popover-sep";
    popover.appendChild(sep2);

    // 4. Custom 2D Color Picker Section
    const pickerSection = document.createElement("div");
    pickerSection.className = "ds-grp-section";

    const pickerLabel = document.createElement("div");
    pickerLabel.className = "ds-grp-section-label";
    pickerLabel.textContent = "CUSTOM COLOR PICKER";
    pickerSection.appendChild(pickerLabel);

    colorEngine = createGroupColorEngine({
        initialColor: group.color || "#4a8b5c",
        onColorChange: (hex) => {
            applyGroupColor(hex);
        },
    });

    pickerSection.appendChild(colorEngine.root);
    popover.appendChild(pickerSection);

    highlightActivePreset(group.color || "#4a8b5c");

    document.body.appendChild(popover);
    activeGroupPopover = popover;

    // Position Popover relative to anchor
    if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
        const rect = anchorEl.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left + rect.width / 2 - popRect.width / 2;

        if (left + popRect.width > window.innerWidth - 12) {
            left = window.innerWidth - popRect.width - 12;
        }
        if (left < 12) left = 12;

        if (top + popRect.height > window.innerHeight - 12) {
            top = Math.max(12, rect.top - popRect.height - 6);
        }

        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
    } else {
        popover.style.top = `${Math.round(window.innerHeight / 2 - 180)}px`;
        popover.style.left = `${Math.round(window.innerWidth / 2 - 150)}px`;
    }

    // Dismiss listeners
    const onOutsideClick = (e) => {
        if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
            closeGroupGearPopover();
            document.removeEventListener("pointerdown", onOutsideClick, true);
            document.removeEventListener("keydown", onKeyDown, true);
        }
    };
    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            closeGroupGearPopover();
            document.removeEventListener("pointerdown", onOutsideClick, true);
            document.removeEventListener("keydown", onKeyDown, true);
        }
    };
    setTimeout(() => {
        document.addEventListener("pointerdown", onOutsideClick, true);
        document.addEventListener("keydown", onKeyDown, true);
    }, 10);
}

function injectGroupStyles() {
    if (document.getElementById("ds-group-enhanced-styles")) return;
    const style = document.createElement("style");
    style.id = "ds-group-enhanced-styles";
    style.textContent = `
    .ds-group-gear-popover {
        position: fixed;
        z-index: 99999;
        width: 270px;
        background: var(--ds-bg-surface-elevated, var(--ds-panel-2, #161a23));
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.14));
        border-radius: 8px;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
        padding: 10px;
        font-family: var(--ds-font, Inter, system-ui, sans-serif);
        color: var(--ds-text, #f8fafc);
        user-select: none;
        box-sizing: border-box;
        animation: dsGroupPopIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes dsGroupPopIn {
        from { opacity: 0; transform: scale(0.96) translateY(-4px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .ds-grp-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
    }

    .ds-grp-popover-title-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
    }

    .ds-grp-popover-badge {
        font-size: 8.5px;
        font-weight: 800;
        padding: 2px 5px;
        border-radius: 4px;
        background: var(--ds-accent, #67e8f9);
        color: var(--ds-on-accent, #0a0c10);
        letter-spacing: 0.5px;
        flex-shrink: 0;
    }

    .ds-grp-title-input {
        flex: 1;
        min-width: 0;
        height: 24px;
        padding: 0 6px;
        background: var(--ds-bg, #0b0d12);
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.12));
        border-radius: 4px;
        color: var(--ds-text, #f8fafc);
        font-size: 11px;
        font-weight: 600;
        outline: none;
        transition: border-color 0.15s ease;
    }

    .ds-grp-title-input:focus {
        border-color: var(--ds-accent, #67e8f9);
    }

    .ds-grp-popover-close-btn {
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--ds-text-muted, #9ca3af);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        transition: all 0.12s ease;
    }

    .ds-grp-popover-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--ds-text, #ffffff);
    }

    .ds-grp-actions-row {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .ds-grp-action-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 7px;
        border-radius: 5px;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.12));
        background: var(--ds-panel-2, #161a23);
        color: var(--ds-text, #e2e8f0);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s ease;
    }

    .ds-grp-action-chip:hover {
        border-color: var(--ds-border-active, rgba(255, 255, 255, 0.25));
        background: rgba(255, 255, 255, 0.08);
    }

    .ds-grp-action-chip.is-active {
        border-color: var(--ds-accent, #67e8f9);
        color: var(--ds-accent, #67e8f9);
        box-shadow: inset 0 -2px 0 var(--ds-accent, #67e8f9);
    }

    .ds-grp-count-chip {
        margin-left: auto;
        font-size: 9.5px;
        font-weight: 600;
        color: var(--ds-text-muted, #9ca3af);
        padding: 0 4px;
    }

    .ds-grp-popover-sep {
        height: 1px;
        background: var(--ds-border, rgba(255, 255, 255, 0.10));
        margin: 8px 0;
    }

    .ds-grp-section-label {
        font-size: 9px;
        font-weight: 700;
        color: var(--ds-text-muted, #9ca3af);
        letter-spacing: 0.5px;
        margin-bottom: 6px;
    }

    .ds-grp-presets-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
    }

    .ds-grp-preset-chip {
        display: flex;
        align-items: center;
        gap: 5px;
        height: 24px;
        padding: 0 6px;
        border-radius: 4px;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.12));
        background: rgba(255, 255, 255, 0.03);
        cursor: pointer;
        transition: all 0.12s ease;
        min-width: 0;
    }

    .ds-grp-preset-chip:hover {
        border-color: var(--ds-accent, #67e8f9);
        background: rgba(255, 255, 255, 0.08);
    }

    .ds-grp-preset-chip.is-active {
        border-color: var(--ds-accent, #67e8f9);
        background: color-mix(in srgb, var(--ds-accent, #67e8f9) 15%, var(--ds-panel-2, #161a23));
        box-shadow: inset 0 -2px 0 var(--ds-accent, #67e8f9);
    }

    .ds-grp-preset-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 2px rgba(0,0,0,0.5);
    }

    .ds-grp-preset-name {
        font-size: 9px;
        font-weight: 600;
        color: var(--ds-text, #f8fafc);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Color Picker Layout */
    .ds-grp-color-engine {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .ds-grp-color-canvas-row {
        display: flex;
        gap: 6px;
        height: 104px;
    }

    .ds-grp-satval-wrap {
        position: relative;
        flex: 1;
        height: 104px;
        border-radius: 4px;
        overflow: hidden;
        cursor: crosshair;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
        touch-action: none;
    }

    .ds-grp-satval-canvas {
        display: block;
        width: 100%;
        height: 100%;
    }

    .ds-grp-satval-reticle {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    .ds-grp-hue-wrap {
        position: relative;
        width: 18px;
        height: 104px;
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
        touch-action: none;
        flex-shrink: 0;
    }

    .ds-grp-hue-bar {
        width: 100%;
        height: 100%;
        background: linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    }

    .ds-grp-hue-scrub {
        position: absolute;
        left: 0;
        right: 0;
        height: 4px;
        background: #ffffff;
        border: 1px solid #000000;
        box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
        transform: translateY(-50%);
        pointer-events: none;
        border-radius: 2px;
    }

    .ds-grp-color-inputs-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .ds-grp-active-swatch {
        width: 28px;
        height: 24px;
        border-radius: 4px;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
        box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
    }

    .ds-grp-hex-input-wrap {
        display: flex;
        align-items: center;
        flex: 1;
        height: 24px;
        background: var(--ds-bg, #0b0d12);
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
        border-radius: 4px;
        padding: 0 6px;
        gap: 3px;
        transition: border-color 0.15s ease;
    }

    .ds-grp-hex-input-wrap:focus-within {
        border-color: var(--ds-accent, #67e8f9);
    }

    .ds-grp-hex-prefix {
        font-size: 10px;
        font-weight: 700;
        color: var(--ds-text-muted, #9ca3af);
    }

    .ds-grp-hex-input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        outline: none;
        color: var(--ds-text, #f8fafc);
        font-size: 11px;
        font-weight: 700;
        font-family: monospace;
        letter-spacing: 0.5px;
    }
    `;
    document.head.appendChild(style);
}

function registerGroupGearMenu() {
    if (!window.DSGearMenu?.register) return false;
    window.DSGearMenu.register("ds_group", {
        tooltip: "DS Group Settings & Accents",
        onClick: (group, canvas, event) => {
            openGroupGearPopover(group, event?.currentTarget || event?.target);
        },
    });
    window.DSGearMenu.register("LGraphGroup", {
        tooltip: "DS Group Settings & Accents",
        onClick: (group, canvas, event) => {
            openGroupGearPopover(group, event?.currentTarget || event?.target);
        },
    });
    return true;
}

app.registerExtension({
    name: EXTENSION,

    async setup() {
        injectGroupStyles();
        installPointerHandlers();
        const graph = graphForCanvas();
        installGraphHooks(graph);
        decorateAll();
        registerGroupGearMenu();
        setTimeout(registerGroupGearMenu, 250);
        setTimeout(registerGroupGearMenu, 1000);
        console.log("[DS Group] Extension loaded (extensions/)");
    },

    async afterConfigureGraph() {
        injectGroupStyles();
        installPointerHandlers();
        const graph = graphForCanvas();
        installGraphHooks(graph);
        decorateAll();
        registerGroupGearMenu();
    },

    getCanvasMenuItems(canvas) {
        // Capture IDs NOW. Opening a context menu can change the live selection
        // before its callback fires; using the live selection was the cause of
        // "only the last-clicked node" behavior.
        const ids = allSelectedNodeIds(canvas);
        const count = ids.length;
        const graph = graphForCanvas(canvas);

        return [
            null,
            {
                content: count ? `Create DS Group (${count} selected)` : "Add DS Group",
                callback: () => createNativeGroup(canvas, nodesFromIds(graph, ids)),
            },
        ];
    },

    getNodeMenuItems(node) {
        const canvas = app?.canvas;
        const graph = graphForCanvas(canvas);
        const ids = allSelectedNodeIds(canvas);
        if (!ids.includes(node?.id)) ids.push(node?.id);
        const count = ids.filter((id) => id != null).length;

        return [
            null,
            {
                content: `Create DS Group (${count} selected)`,
                callback: () => createNativeGroup(canvas, nodesFromIds(graph, ids)),
            },
        ];
    },
});
