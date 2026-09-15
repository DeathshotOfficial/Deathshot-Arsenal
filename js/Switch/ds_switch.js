// Deathshot Arsenal — DS Switch
// High-performance canvas implementation with 100% native LiteGraph socket linking,
// exact row-center alignment, exclusive single-toggle selection, and inline text editing.

import { app } from "/scripts/app.js";

const TYPE = "DS_Switch";
const EXTENSION = "DeathshotArsenal.DSSwitch";

const DEFAULT_W = 280;
const MIN_W = 220;
const ROW_H = 26;
const ROW_GAP = 6;
const ROW_PITCH = ROW_H + ROW_GAP; // 32px
const TOP_PAD = 10;
const STATE_PROP = "ds_switch";

let activeEditor = null; // Transient label editor singleton

function graphFor(node) {
  return node?.graph || app?.canvas?.graph || app?.graph || null;
}

function inputName(slotIdx1) {
  return `input_${slotIdx1}`;
}

function defaultState() {
  return {
    activeIndex: 0,
    labels: {},
    rowCount: 1,
  };
}

function readState(node) {
  if (!node.properties) node.properties = {};
  if (!node.properties[STATE_PROP]) {
    node.properties[STATE_PROP] = defaultState();
  }
  const state = node.properties[STATE_PROP];
  if (typeof state.activeIndex !== "number") state.activeIndex = 0;
  if (!state.labels || typeof state.labels !== "object") state.labels = {};
  return state;
}

function persistState(node) {
  const state = readState(node);
  const selectedWidget = (node.widgets || []).find((w) => w.name === "selected_index");
  if (selectedWidget) {
    selectedWidget.value = state.activeIndex || 0;
  }
  graphFor(node)?.change?.();
}

function isInputConnected(node, slotIdx0) {
  const slot = node.inputs?.[slotIdx0];
  return slot != null && slot.link != null;
}

function calculateRequiredHeight(rowCount) {
  const count = Math.max(1, rowCount);
  return TOP_PAD + count * ROW_PITCH + 10;
}

// Single source of truth for row vertical center in node-local coordinates
function getRowCenterY(slotIdx0) {
  return TOP_PAD + slotIdx0 * ROW_PITCH + ROW_H * 0.5;
}

function getColorLuminance(colorStr) {
  if (!colorStr) return null;
  if (window.DSGlobalTheme?.getRelativeLuminance) {
    try {
      return window.DSGlobalTheme.getRelativeLuminance(colorStr);
    } catch (_) {}
  }
  const s = String(colorStr).trim();
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
  if (hexMatch) {
    const r = parseInt(hexMatch[1], 16) / 255;
    const g = parseInt(hexMatch[2], 16) / 255;
    const b = parseInt(hexMatch[3], 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const rgbMatch = s.match(/\d+/g);
  if (rgbMatch && rgbMatch.length >= 3) {
    const r = Number(rgbMatch[0]) / 255;
    const g = Number(rgbMatch[1]) / 255;
    const b = Number(rgbMatch[2]) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return null;
}

function getColors(node) {
  const gt = window.DSGlobalTheme;
  const getVar = (name, fallback = "") => {
    try {
      const v = gt?.getVar?.(name, "");
      if (v) return String(v).trim();
    } catch (_) {}
    try {
      const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (v) return v;
    } catch (_) {}
    try {
      const v = window.getComputedStyle(document.body).getPropertyValue(name).trim();
      if (v) return v;
    } catch (_) {}
    return fallback;
  };

  // Determine if current theme or node canvas background is light
  let isLight = false;
  if (gt?.isLight) {
    isLight = Boolean(gt.isLight());
  } else if (document.documentElement.classList.contains("light") || document.body.classList.contains("light")) {
    isLight = true;
  } else {
    const candidates = [
      node?.bgcolor,
      node?.color,
      node?.renderingColor,
      getVar("--ds-panel"),
      getVar("--ds-bg"),
      getVar("--bg-color"),
      window.LiteGraph?.NODE_DEFAULT_BGCOLOR,
      window.LiteGraph?.NODE_DEFAULT_COLOR,
    ];
    for (const c of candidates) {
      if (!c || c === "transparent") continue;
      const lum = getColorLuminance(c);
      if (typeof lum === "number") {
        if (lum > 0.45) {
          isLight = true;
          break;
        }
      }
    }
  }

  const bg = getVar("--ds-bg", isLight ? "#f4f6fa" : "#0b0d12");
  const panel = getVar("--ds-panel-2", getVar("--ds-panel", isLight ? "#eef1f7" : "#161a23"));
  const inputBg = getVar("--ds-input-bg", isLight ? "#ffffff" : "#0e1016");
  const accent = getVar("--ds-accent", isLight ? "#0891b2" : "#67e8f9");
  const border = getVar("--ds-border", isLight ? "#d8dee9" : "#242a36");
  const borderActive = getVar("--ds-border-active", accent);
  const text = getVar("--ds-text", isLight ? "#111827" : "#f8fafc");
  const textMuted = getVar("--ds-text-muted", isLight ? "#64748b" : "#9ca3af");

  // Track & Field colors strictly follow theme variables
  const toggleTrack = isLight
    ? getVar("--ds-btn-hover", getVar("--ds-border", "#e2e8f0"))
    : getVar("--ds-input-bg", getVar("--ds-panel-2", "#0e1016"));

  const toggleThumbMuted = isLight ? "#94a3b8" : "#6b7280";
  const fieldBg = inputBg;
  const fieldBorder = border;
  const trailingBg = isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)";

  return {
    isLight,
    bg,
    panel,
    inputBg,
    accent,
    border,
    borderActive,
    text,
    textMuted,
    toggleTrack,
    toggleThumbMuted,
    fieldBg,
    fieldBorder,
    trailingBg,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// Row component coordinates
function getRowLayout(nodeWidth, slotIdx0) {
  const cy = getRowCenterY(slotIdx0);
  const top = cy - ROW_H * 0.5;
  const rowX = 14; // Leaves 14px space for the input socket circle at x=0
  const rowW = Math.max(60, nodeWidth - rowX - 14);

  const toggleX = rowX + 8;
  const toggleW = 28;
  const toggleH = 16;
  const toggleY = cy - toggleH * 0.5;

  const textX = toggleX + toggleW + 8;
  const textW = Math.max(40, rowX + rowW - textX - 6);
  const textY = top + 2;
  const textH = ROW_H - 4;

  return {
    cy,
    top,
    rowX,
    rowW,
    toggle: { x: toggleX, y: toggleY, w: toggleW, h: toggleH },
    text: { x: textX, y: textY, w: textW, h: textH },
  };
}

export function alignSockets(node) {
  if (!Array.isArray(node.inputs)) return;

  for (let i = 0; i < node.inputs.length; i++) {
    const input = node.inputs[i];
    const cy = getRowCenterY(i);
    input.pos = [0, cy];
    input.label = "​"; // Zero-width space suppresses LiteGraph's canvas text collision
    input.name = inputName(i + 1);
  }

  // Output socket: placed natively on the right edge at standard node output position with label suppressed
  if (node.outputs?.[0]) {
    node.outputs[0].label = "​"; // Zero-width space suppresses the canvas "output" text
    node.outputs[0].pos = [node.size[0], 14];
  }
}

function normalizeSlots(node) {
  if (!Array.isArray(node.inputs)) node.inputs = [];

  let lastConnected = -1;
  for (let i = 0; i < node.inputs.length; i++) {
    if (isInputConnected(node, i)) {
      lastConnected = i;
    }
  }

  // Exactly one trailing empty row:
  const targetCount = Math.max(1, lastConnected + 2);

  // Remove redundant trailing empty rows (walk backwards, never remove connected row or Row 1)
  while (node.inputs.length > targetCount) {
    const lastIdx = node.inputs.length - 1;
    if (lastIdx <= 0) break;
    if (isInputConnected(node, lastIdx)) break;
    node.removeInput(lastIdx);
  }

  // Add missing trailing slots
  while (node.inputs.length < targetCount) {
    const nextIdx = node.inputs.length + 1;
    node.addInput(inputName(nextIdx), "*");
  }

  const state = readState(node);
  const rowCountChanged = state.rowCount !== node.inputs.length;
  state.rowCount = node.inputs.length;

  if (state.activeIndex > 0) {
    const activeSlotIdx = state.activeIndex - 1;
    if (activeSlotIdx >= node.inputs.length || !isInputConnected(node, activeSlotIdx)) {
      state.activeIndex = 0;
      persistState(node);
    }
  }

  const minH = calculateRequiredHeight(node.inputs.length);
  const curW = Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W);
  const curH = Number(node.size?.[1]) || minH;

  // Only expand height if row count increased or current size is smaller than required
  if (rowCountChanged || curH < minH) {
    node.setSize([curW, Math.max(minH, curH)]);
  }

  alignSockets(node);
  node.setDirtyCanvas?.(true, true);
  graphFor(node)?.setDirtyCanvas?.(true, true);
}

// ── Inline Label Editor ──────────────────────────────────────────────────
function commitEditor(editor) {
  if (!editor || editor._committed) return;
  editor._committed = true;
  const { node, slotIdx1, input } = editor;
  const val = input.value.trim();
  const state = readState(node);
  if (val) {
    state.labels[slotIdx1] = val;
  } else {
    delete state.labels[slotIdx1];
  }
  persistState(node);
  cleanupEditor(editor);
  node.setDirtyCanvas?.(true, true);
}

function cancelEditor(editor) {
  if (!editor || editor._committed) return;
  editor._committed = true;
  cleanupEditor(editor);
}

function cleanupEditor(editor) {
  if (!editor) return;
  if (editor.keyHandler) window.removeEventListener("keydown", editor.keyHandler, true);
  if (editor.blurHandler) editor.input.removeEventListener("blur", editor.blurHandler);
  editor.input.remove();
  if (activeEditor === editor) activeEditor = null;
}

function openLabelEditor(node, slotIdx1) {
  if (activeEditor) commitEditor(activeEditor);

  const slotIdx0 = slotIdx1 - 1;
  const layout = getRowLayout(node.size[0], slotIdx0);
  const textRect = layout.text;

  const canvas = app.canvas;
  const ds = canvas?.ds;
  const scale = Number(ds?.scale) || 1;
  const canvasEl = canvas?.canvas;
  const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 };

  const screenX = canvasRect.left + ((node.pos?.[0] || 0) + textRect.x + (ds?.offset?.[0] || 0)) * scale;
  const screenY = canvasRect.top + ((node.pos?.[1] || 0) + textRect.y + (ds?.offset?.[1] || 0)) * scale;
  const screenW = Math.max(60, textRect.w * scale);
  const screenH = textRect.h * scale;

  const state = readState(node);
  const initialText = state.labels[slotIdx1] || `Option ${slotIdx1}`;
  const colors = getColors(node);

  const input = document.createElement("input");
  input.type = "text";
  input.value = initialText;
  input.className = "ds-switch-floating-editor";
  input.style.cssText = [
    "position: fixed",
    `left: ${Math.round(screenX)}px`,
    `top: ${Math.round(screenY)}px`,
    `width: ${Math.round(screenW)}px`,
    `height: ${Math.round(screenH)}px`,
    "z-index: 100000",
    `background: ${colors.inputBg}`,
    `color: ${colors.text}`,
    `border: 1.5px solid ${colors.accent}`,
    "border-radius: 4px",
    `padding: 0 6px`,
    `font: 500 ${Math.max(10, Math.round(11 * scale))}px Inter, system-ui, sans-serif`,
    "outline: none",
    "box-sizing: border-box",
    "line-height: 1",
  ].join("; ");

  document.body.appendChild(input);

  const editorState = { node, slotIdx1, input, _committed: false };

  editorState.keyHandler = (e) => {
    if (e.target !== input) return;
    e.stopImmediatePropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitEditor(editorState);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditor(editorState);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitEditor(editorState);
      const nextIdx = e.shiftKey ? slotIdx1 - 1 : slotIdx1 + 1;
      if (nextIdx >= 1 && nextIdx <= (node.inputs?.length || 1)) {
        setTimeout(() => openLabelEditor(node, nextIdx), 10);
      }
    }
  };

  editorState.blurHandler = () => commitEditor(editorState);
  window.addEventListener("keydown", editorState.keyHandler, true);

  activeEditor = editorState;

  setTimeout(() => {
    if (!input.isConnected) return;
    input.focus();
    input.select();
    input.addEventListener("blur", editorState.blurHandler);
  }, 0);
}

// ── Canvas Rendering ──────────────────────────────────────────────────────
function drawSwitch(node, ctx) {
  const inputs = node.inputs;
  if (!inputs || inputs.length === 0) return;

  const w = node.size[0];
  const state = readState(node);
  const activeIndex = state.activeIndex || 0;
  const colors = getColors(node);

  for (let i = 0; i < inputs.length; i++) {
    const slotIdx1 = i + 1;
    const connected = isInputConnected(node, i);
    const isActive = activeIndex === slotIdx1;
    const isTrailing = !connected && slotIdx1 === inputs.length;
    const layout = getRowLayout(w, i);

    ctx.save();

    // 1. Row card background
    roundRect(ctx, layout.rowX, layout.top, layout.rowW, ROW_H, 5);
    if (isActive) {
      ctx.fillStyle = `color-mix(in srgb, ${colors.accent} 16%, ${colors.panel})`;
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Left signature indicator bar
      ctx.fillStyle = colors.accent;
      roundRect(ctx, layout.rowX + 2, layout.top + 4, 3, ROW_H - 8, 1.5);
      ctx.fill();
    } else {
      ctx.fillStyle = isTrailing ? colors.trailingBg : colors.panel;
      ctx.fill();
      ctx.strokeStyle = isTrailing ? colors.fieldBorder : colors.border;
      ctx.lineWidth = 1;
      if (isTrailing) ctx.setLineDash([3, 2.5]);
      ctx.stroke();
      if (isTrailing) ctx.setLineDash([]);
    }

    // 2. Toggle button
    const tg = layout.toggle;
    const toggleRad = tg.h * 0.5;
    roundRect(ctx, tg.x, tg.y, tg.w, tg.h, toggleRad);

    if (isActive) {
      ctx.fillStyle = `color-mix(in srgb, ${colors.accent} 28%, ${colors.panel})`;
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Active knob
      const knobX = tg.x + tg.w - toggleRad;
      const knobY = tg.y + toggleRad;
      ctx.beginPath();
      ctx.arc(knobX, knobY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.accent;
      ctx.fill();
    } else {
      ctx.fillStyle = colors.toggleTrack;
      ctx.fill();
      ctx.strokeStyle = connected ? colors.border : colors.fieldBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inactive knob
      const knobX = tg.x + toggleRad;
      const knobY = tg.y + toggleRad;
      ctx.beginPath();
      ctx.arc(knobX, knobY, 4, 0, Math.PI * 2);
      ctx.fillStyle = connected ? colors.textMuted : colors.toggleThumbMuted;
      ctx.fill();
    }

    // 3. Editable Text field area
    const tx = layout.text;
    roundRect(ctx, tx.x, tx.y, tx.w, tx.h, 4);
    ctx.fillStyle = colors.fieldBg;
    ctx.fill();
    ctx.strokeStyle = isActive
      ? `color-mix(in srgb, ${colors.accent} 40%, transparent)`
      : colors.fieldBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label text
    const customLabel = state.labels[slotIdx1];
    let displayText = customLabel || (connected ? `Option ${slotIdx1}` : "(connect input)");
    let textColor = isActive ? colors.text : (connected ? colors.textMuted : (colors.isLight ? "rgba(0, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.35)"));

    ctx.fillStyle = textColor;
    ctx.font = `${isActive ? "600" : "500"} 11px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Text truncation with ellipsis if too wide
    const maxTextW = tx.w - 12;
    let labelToDraw = displayText;
    if (ctx.measureText(labelToDraw).width > maxTextW) {
      while (labelToDraw.length > 1 && ctx.measureText(labelToDraw + "...").width > maxTextW) {
        labelToDraw = labelToDraw.slice(0, -1);
      }
      labelToDraw += "...";
    }

    ctx.fillText(labelToDraw, tx.x + 6, layout.cy);

    ctx.restore();
  }
}

function setupNode(node) {
  node.resizable = true;

  if (window.DSGlobalTheme?.subscribe) {
    const unsub = window.DSGlobalTheme.subscribe(() => {
      node.setDirtyCanvas?.(true, true);
    });
    const origOnRemoved = node.onRemoved;
    node.onRemoved = function () {
      try { unsub?.(); } catch (_) {}
      return origOnRemoved?.apply(this, arguments);
    };
  }

  // Hide the internal selected_index widget from canvas while retaining serialization
  for (const wgt of node.widgets || []) {
    if (wgt.name === "selected_index") {
      wgt.hidden = true;
      wgt.type = "hidden";
      wgt.computeSize = () => [0, -4];
      wgt.draw = () => {};
    }
  }

  if (node.outputs?.[0]) {
    node.outputs[0].label = "​";
  }

  // Pure mathematical socket coordinate alignment
  const origGetConnectionPos = node.getConnectionPos;
  node.getConnectionPos = function (is_input, slot_number, out) {
    out = out || new Float32Array(2);
    if (this.flags?.collapsed) {
      return origGetConnectionPos ? origGetConnectionPos.apply(this, arguments) : out;
    }

    if (is_input) {
      if (!this.inputs || slot_number >= this.inputs.length) return out;
      out[0] = this.pos[0];
      out[1] = this.pos[1] + getRowCenterY(slot_number);
      return out;
    }

    // Output socket: native LiteGraph position (right border, y=14)
    if (origGetConnectionPos) {
      return origGetConnectionPos.call(this, false, slot_number, out);
    }
    out[0] = this.pos[0] + this.size[0];
    out[1] = this.pos[1] + 14;
    return out;
  };

  // Free resizing with minimum constraints
  const origOnResize = node.onResize;
  node.onResize = function (size) {
    const minH = calculateRequiredHeight(this.inputs?.length || 1);
    size[0] = Math.max(MIN_W, size[0]);
    size[1] = Math.max(minH, size[1]);
    alignSockets(this);
    return origOnResize?.apply(this, arguments);
  };

  // Precise canvas hit-testing for toggle buttons and text fields
  const origMouseDown = node.onMouseDown;
  node.onMouseDown = function (e, localPos, canvas) {
    const px = localPos[0];
    const py = localPos[1];
    const inputs = this.inputs || [];
    const w = this.size[0];

    // Check if clicked in any row
    for (let i = 0; i < inputs.length; i++) {
      const layout = getRowLayout(w, i);

      // Check Toggle Button Hit
      const tg = layout.toggle;
      if (
        px >= tg.x - 3 && px <= tg.x + tg.w + 3 &&
        py >= tg.y - 3 && py <= tg.y + tg.h + 3
      ) {
        if (!isInputConnected(this, i)) return true; // Disabled for unconnected row
        const slotIdx1 = i + 1;
        const state = readState(this);
        if (state.activeIndex === slotIdx1) {
          state.activeIndex = 0; // Toggle OFF
        } else {
          state.activeIndex = slotIdx1; // Select exclusively
        }
        persistState(this);
        this.setDirtyCanvas(true, true);
        return true; // Handled
      }

      // Check Text Field Hit
      const tx = layout.text;
      if (
        px >= tx.x && px <= tx.x + tx.w &&
        py >= tx.y && py <= tx.y + tx.h
      ) {
        openLabelEditor(this, i + 1);
        return true; // Handled
      }
    }

    return origMouseDown?.apply(this, arguments);
  };
}

app.registerExtension({
  name: EXTENSION,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      setupNode(this);

      // Fresh node starts with 1 row, unconnected, toggle OFF
      normalizeSlots(this);
      persistState(this);

      return r;
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      this._dsConfiguring = true;
      try {
        const r = origConfigure?.apply(this, arguments);
        setupNode(this);
        setTimeout(() => {
          normalizeSlots(this);
          persistState(this);
        }, 50);
        return r;
      } finally {
        this._dsConfiguring = false;
      }
    };

    const origConnections = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const r = origConnections?.apply(this, arguments);
      clearTimeout(this._dsStabilizeTimer);
      this._dsStabilizeTimer = setTimeout(() => {
        normalizeSlots(this);
        persistState(this);
      }, 20);
      return r;
    };

    const origDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      const r = origDrawForeground?.apply(this, arguments);
      alignSockets(this);
      drawSwitch(this, ctx);
      return r;
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      if (activeEditor && activeEditor.node === this) {
        cancelEditor(activeEditor);
      }
      return origRemoved?.apply(this, arguments);
    };
  },
});
