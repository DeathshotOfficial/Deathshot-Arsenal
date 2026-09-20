/**
 * Deathshot Arsenal — DS The Purger Frontend
 * Ultra-compact baseless workflow passthrough & safe resource cleanup utility.
 * Pure Canvas2D rendering for the node surface, zero native browser widgets,
 * execution-time cleanup trigger, and toolbar gear popover synchronization.
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_ThePurger";
const DISPLAY_NAME = "DS The Purger";
const EXT_NAME = "DeathshotArsenal.DS_ThePurger";
const CSS_URL = "/extensions/DeathshotArsenal/The%20Purger/ds_the_purger.css";

const DEFAULT_W = 390;
const NODE_H = 32;
const SOCKET_MARGIN = 16; // Clearance for connection socket dots

const ACTION_DESCRIPTIONS = {
  ALL: "Coordinated purge of all eligible models, caches, VRAM, and RAM",
  VRAM: "Release GPU memory allocations and flush CUDA/MPS cache",
  RAM: "Collect Python garbage and release system memory",
  MODELS: "Unload unreferenced resident models from memory",
  CACHE: "Flush disposable framework and node caches",
};

// ---------------------------------------------------------------------------
// Global Shared Configuration & State
// ---------------------------------------------------------------------------
let globalConfig = {
  buttons: ["ALL", "VRAM", "RAM", "MODELS", "CACHE"],
  enabled: {
    ALL: true,
    VRAM: true,
    RAM: true,
    MODELS: true,
    CACHE: true,
  },
};

const activePurgerNodes = new Set();
let activeGearPopover = null;

// ---------------------------------------------------------------------------
// CSS Injection
// ---------------------------------------------------------------------------
function ensureCSS() {
  if (!document.querySelector(`link[href*="ds_the_purger.css"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CSS_URL}?v=${Date.now()}`;
    document.head.appendChild(link);
  }
}

// ---------------------------------------------------------------------------
// Helpers: Theme, Drawing & Dimensions
// ---------------------------------------------------------------------------
function themeVar(name, fallback) {
  try {
    return window.DSGlobalTheme?.getVar?.(name, fallback) || fallback;
  } catch (_) {
    return fallback;
  }
}

function palette() {
  const cfg = window.DSGlobalTheme?.getConfig?.() || {};
  const activeTheme = window.DSGlobalTheme?.getTheme?.(cfg.theme);
  const smart = window.DSGlobalTheme?.getSmartContrastVars?.(activeTheme) || {};
  return {
    bg: themeVar("--ds-bg", "#0b0d12"),
    panel: themeVar("--ds-panel", "#12151c"),
    panel2: themeVar("--ds-panel-2", "#161a23"),
    btnBg: themeVar("--ds-btn-bg", themeVar("--ds-panel-2", "#161a23")),
    btnHover: themeVar("--ds-btn-hover", "#1e2433"),
    text: themeVar("--ds-text", "#e5e7eb"),
    muted: themeVar("--ds-text-muted", "#9ca3af"),
    border: themeVar("--ds-border", "#242a36"),
    borderActive: themeVar("--ds-border-active", "rgba(255, 255, 255, 0.3)"),
    accent: themeVar("--ds-accent", "#67e8f9"),
    onAccent: smart["--ds-on-accent"] || themeVar("--ds-on-accent", "#0a0c10"),
    onAccentShadow: smart["--ds-on-accent-shadow"] || themeVar("--ds-on-accent-shadow", "none"),
    warning: themeVar("--ds-warning", "#f59e0b"),
    danger: themeVar("--ds-danger", "#ef4444"),
  };
}

let scratchCanvasCtx = null;
function getScratchCanvas() {
  if (!scratchCanvasCtx) {
    const cv = document.createElement("canvas");
    scratchCanvasCtx = cv.getContext("2d");
  }
  return scratchCanvasCtx;
}

function rr(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, [r]);
  } else {
    ctx.rect(x, y, w, h);
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Config Persistence & Live Sync
// ---------------------------------------------------------------------------
async function fetchConfig() {
  try {
    const res = await fetch("/ds/purger/config", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.buttons && data.enabled) {
        globalConfig = data;
        syncAllNodes();
      }
    }
  } catch (_) {}
}

async function saveConfig(newConfig) {
  globalConfig = newConfig;
  syncAllNodes();
  try {
    await fetch("/ds/purger/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConfig),
    });
  } catch (_) {}
}

function syncAllNodes() {
  for (const node of activePurgerNodes) {
    const minW = computeRequiredWidth(node);
    const savedW = Number(node.properties?.custom_width) || (Array.isArray(node.size) ? Number(node.size[0]) : 0);
    const finalW = Math.max(minW, savedW > 0 ? savedW : minW);
    node.size = [finalW, NODE_H];
    node.min_size = [minW, NODE_H];
    node.setDirtyCanvas?.(true, true);
  }
}

function getVisibleButtons() {
  const list = globalConfig.buttons || ["ALL", "VRAM", "RAM", "MODELS", "CACHE"];
  const enabledMap = globalConfig.enabled || {};
  return list.filter((act) => enabledMap[act] !== false);
}

function computeSnugMetrics(node, targetW = null) {
  const visible = getVisibleButtons();
  const cfg = window.DSGlobalTheme?.getConfig?.() || {};
  const fontName = cfg.font || window.DSGlobalTheme?.getVar?.("--ds-font", "Inter") || "Inter";

  const scratch = getScratchCanvas();
  scratch.font = `700 11px "${fontName}", Inter, system-ui, sans-serif`;

  const naturalButtons = [];
  let totalNaturalBtnW = 0;
  for (const act of visible) {
    const textW = scratch.measureText(act).width;
    const w = Math.max(44, Math.round(textW + 18));
    naturalButtons.push({ action: act, naturalW: w });
    totalNaturalBtnW += w;
  }

  const btnGap = 5;
  const totalGaps = Math.max(0, visible.length - 1) * btnGap;
  const st = node?._dsPurgerState || { status: "READY" };
  const statusStr = (st.status || "READY").toUpperCase();
  const statusTextW = scratch.measureText(statusStr).width;
  const statusW = Math.max(74, Math.round(statusTextW + 24));
  const gapToStatus = 8;
  const socketMargin = SOCKET_MARGIN;
  const minRequiredW = socketMargin * 2 + totalNaturalBtnW + totalGaps + gapToStatus + statusW;

  const currentW = targetW != null && Number(targetW) > 0 ? Math.round(Number(targetW)) : minRequiredW;
  const finalW = Math.max(minRequiredW, currentW);

  // If node is wider than minimum, distribute extra space across buttons evenly
  const extraSpace = finalW - minRequiredW;
  const perBtnExtra = visible.length > 0 ? Math.floor(extraSpace / visible.length) : 0;
  let remainderExtra = visible.length > 0 ? (extraSpace % visible.length) : 0;

  const buttonsLayout = [];
  let curX = socketMargin;
  for (const nb of naturalButtons) {
    let extra = perBtnExtra;
    if (remainderExtra > 0) {
      extra += 1;
      remainderExtra -= 1;
    }
    const w = nb.naturalW + extra;
    buttonsLayout.push({
      action: nb.action,
      x: curX,
      w: w,
    });
    curX += w + btnGap;
  }

  const statusX = finalW - socketMargin - statusW;

  return {
    w: finalW,
    minW: minRequiredW,
    buttons: buttonsLayout,
    statusX: statusX,
    statusW: statusW,
    statusStr: statusStr,
  };
}

function computeRequiredWidth(node) {
  return computeSnugMetrics(node).minW;
}

// ---------------------------------------------------------------------------
// Dynamic Type Resolution & Link Wire Color Synchronization
// ---------------------------------------------------------------------------
function resolveUpstreamType(node) {
  const graph = node?.graph || app?.graph;
  if (!graph || !graph.links) return null;

  let current = node;
  const visited = new Set();

  while (current && !visited.has(current)) {
    visited.add(current);
    const linkId = current.inputs?.[0]?.link;
    if (linkId == null) break;
    const l = graph.links[linkId];
    if (!l) break;
    const prevNode = graph.getNodeById(l.origin_id);
    if (!prevNode) break;

    const prevType = prevNode.type || prevNode.constructor?.type || "";
    // If upstream is a passthrough (Reroute or another Purger)
    if (prevType.includes("Reroute") || prevType === TYPE) {
      const slotType = prevNode.outputs?.[l.origin_slot]?.type;
      if (slotType && slotType !== "*" && slotType !== "0") {
        return slotType;
      }
      current = prevNode;
    } else {
      const originSlot = prevNode.outputs?.[l.origin_slot];
      const type = originSlot?.type;
      if (type && type !== "*" && type !== "0") {
        return type;
      }
      break;
    }
  }
  return null;
}

function resolveDownstreamType(node) {
  const graph = node?.graph || app?.graph;
  if (!graph || !graph.links) return null;

  const queue = [node];
  const visited = new Set([node]);

  while (queue.length > 0) {
    const cur = queue.shift();
    const links = cur.outputs?.[0]?.links || [];
    for (const linkId of links) {
      const l = graph.links[linkId];
      if (!l) continue;
      const targetNode = graph.getNodeById(l.target_id);
      if (!targetNode || visited.has(targetNode)) continue;
      visited.add(targetNode);

      const targetType = targetNode.type || targetNode.constructor?.type || "";
      if (targetType.includes("Reroute") || targetType === TYPE) {
        queue.push(targetNode);
      } else {
        const inputSlot = targetNode.inputs?.[l.target_slot];
        const type = inputSlot?.type;
        if (type && type !== "*" && type !== "0") {
          return type;
        }
      }
    }
  }
  return null;
}

function inferPurgerType(node) {
  return resolveUpstreamType(node) || resolveDownstreamType(node) || "*";
}

function stabilizePurger(node) {
  if (!node) return;
  const graph = node.graph || app?.graph;
  const resolvedType = inferPurgerType(node);
  node._dsPurgerType = resolvedType;

  if (node.inputs && node.inputs[0]) {
    node.inputs[0].type = resolvedType;
  }
  if (node.outputs && node.outputs[0]) {
    node.outputs[0].type = resolvedType;
  }

  // Update wire / link colors in LiteGraph
  const LG = window.LiteGraph;
  if (LG && LG.LGraphCanvas && graph && graph.links) {
    const color = LG.LGraphCanvas.link_type_colors?.[resolvedType] || (resolvedType === "*" ? null : undefined);

    // Incoming link
    if (node.inputs?.[0]?.link != null) {
      const l = graph.links[node.inputs[0].link];
      if (l) l.color = color;
    }
    // Outgoing links
    if (node.outputs?.[0]?.links) {
      for (const linkId of node.outputs[0].links) {
        const l = graph.links[linkId];
        if (l) l.color = color;
      }
    }
  }

  node.setDirtyCanvas?.(true, true);
}

function ensureNodeState(node) {
  node.properties = node.properties || {};
  if (!node.properties.selected_action) {
    node.properties.selected_action = "ALL";
  }

  if (!node._dsPurgerState) {
    node._dsPurgerState = {
      status: "READY",
      action: node.properties.selected_action,
      message: "Ready to purge",
      vram_released_str: "",
      ram_released_str: "",
      elapsed_ms: 0,
      timestamp: Date.now(),
    };
  }

  // 1. Suppress native widgets
  if (Array.isArray(node.widgets) && node.widgets.length > 0) {
    node.widgets.length = 0;
  }
  node.serialize_widgets = false;

  // 2. Enforce single input and single output slot
  if (!Array.isArray(node.inputs) || node.inputs.length === 0) {
    node.addInput(" ", node._dsPurgerType || "*");
  } else if (node.inputs.length > 1) {
    while (node.inputs.length > 1) {
      node.removeInput(node.inputs.length - 1);
    }
  }

  if (!Array.isArray(node.outputs) || node.outputs.length === 0) {
    node.addOutput(" ", node._dsPurgerType || "*");
  } else if (node.outputs.length > 1) {
    while (node.outputs.length > 1) {
      node.removeOutput(node.outputs.length - 1);
    }
  }

  // 3. Keep slot names valid for prompt mapping while suppressing visual canvas labels
  if (node.inputs?.[0]) {
    node.inputs[0].name = "value";
    node.inputs[0].label = " ";
    if (node._dsPurgerType) node.inputs[0].type = node._dsPurgerType;
  }
  if (node.outputs?.[0]) {
    node.outputs[0].name = "value";
    node.outputs[0].label = " ";
    if (node._dsPurgerType) node.outputs[0].type = node._dsPurgerType;
  }
}

// ---------------------------------------------------------------------------
// Pure Canvas2D Rendering for Baseless Surface
// ---------------------------------------------------------------------------
function paintPurgerCanvas(node, ctx) {
  if (!ctx || node.flags?.collapsed) return;

  ensureNodeState(node);

  const minW = computeRequiredWidth(node);
  const savedW = Number(node.properties?.custom_width) || (Array.isArray(node.size) ? Number(node.size[0]) : 0);
  const targetW = savedW > 0 ? savedW : node.size?.[0];
  const metrics = computeSnugMetrics(node, targetW);
  const w = metrics.w;
  const h = NODE_H;

  // Enforce locked height and width
  if (!node.size || node.size[0] !== w || node.size[1] !== h) {
    node.size = [w, h];
  }

  const c = palette();
  const st = node._dsPurgerState || { status: "READY" };
  const currentAction = node.properties.selected_action || "ALL";

  ctx.save();

  // 1. Draw outer baseless container
  const isSelected = Boolean(node.is_selected);
  const isPurging = st.status === "PURGING";
  const borderColor = isPurging ? c.accent : (isSelected ? c.accent : c.border);
  const borderWidth = (isPurging || isSelected) ? 1.5 : 1;

  rr(ctx, 0, 0, w, h, 6, c.panel, borderColor, borderWidth);

  // 2. Buttons Row
  const btnH = 22;
  const btnY = Math.round((h - btnH) * 0.5); // 5px

  node._dsButtonHits = [];

  const cfg = window.DSGlobalTheme?.getConfig?.() || {};
  const fontName = cfg.font || window.DSGlobalTheme?.getVar?.("--ds-font", "Inter") || "Inter";
  ctx.font = `700 11px "${fontName}", Inter, system-ui, sans-serif`;

  for (const item of metrics.buttons) {
    const act = item.action;
    const btnX = item.x;
    const btnW = item.w;
    const isActive = (act === currentAction);
    const isHovered = (act === node._dsHoveredAction);

    let btnBg, btnBorder, btnText;
    if (isActive) {
      btnBg = c.accent;
      btnBorder = c.accent;
      btnText = c.onAccent;
    } else if (isHovered) {
      btnBg = c.btnHover;
      btnBorder = c.accent;
      btnText = c.accent;
    } else {
      btnBg = c.btnBg;
      btnBorder = c.border;
      btnText = c.text;
    }

    rr(ctx, btnX, btnY, btnW, btnH, 5, btnBg, btnBorder, 1);

    // Button text
    ctx.fillStyle = btnText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(act, btnX + Math.round(btnW * 0.5), btnY + Math.round(btnH * 0.5));

    node._dsButtonHits.push({
      action: act,
      x: btnX,
      y: btnY,
      w: btnW,
      h: btnH,
    });
  }

  // 3. Status Indicator Pill on the Right
  const statusStr = metrics.statusStr;
  const statusW = metrics.statusW;
  const statusX = metrics.statusX;

  let statusTextColor = c.text;
  let dotColor = c.muted;
  let statusBorderColor = c.border;
  let statusBg = c.panel2;

  if (statusStr === "PURGING") {
    statusTextColor = c.accent;
    dotColor = c.accent;
    statusBorderColor = c.accent;
  } else if (statusStr === "PURGED") {
    statusTextColor = c.accent;
    dotColor = c.accent;
  } else if (statusStr === "PARTIAL") {
    statusTextColor = c.warning;
    dotColor = c.warning;
  } else if (statusStr === "FAILED") {
    statusTextColor = c.danger;
    dotColor = c.danger;
  }

  // Status background pill
  rr(ctx, statusX, btnY, statusW, btnH, 5, statusBg, statusBorderColor, 1);

  // Status dot
  const dotX = statusX + 11;
  const dotY = btnY + Math.round(btnH * 0.5);
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  // Status text
  ctx.fillStyle = statusTextColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(statusStr, statusX + 21, dotY);

  node._dsStatusHit = {
    x: statusX,
    y: btnY,
    w: statusW,
    h: btnH,
  };

  // 4. Hover Tooltip (Metrics & Diagnostics)
  const tooltipInfo = (st.status !== "READY" && st.message) ? st : node._dsLastPurgeInfo;
  if (node._dsHoveredStatus && tooltipInfo && (tooltipInfo.message || tooltipInfo.vram_released_str || tooltipInfo.ram_released_str)) {
    drawHoverTooltip(ctx, node, statusX, btnY, tooltipInfo, c, fontName);
  }

  ctx.restore();
}

function drawHoverTooltip(ctx, node, anchorX, anchorY, st, c, fontName) {
  const isCurrent = (node._dsPurgerState?.status !== "READY");
  const prefix = isCurrent ? "" : "Last Run: ";
  const line1 = `${prefix}${st.action || "PURGE"} • ${st.status || "PURGED"}`;
  const line2 = st.message || "";
  const parts = [];
  if (st.vram_released_str && st.vram_released_str !== "0 MB") parts.push(`VRAM: ${st.vram_released_str}`);
  if (st.ram_released_str && st.ram_released_str !== "0 MB") parts.push(`RAM: ${st.ram_released_str}`);
  if (st.elapsed_ms > 0) parts.push(`${st.elapsed_ms}ms`);
  const line3 = parts.join(" • ");

  ctx.save();
  ctx.font = `600 10.5px "${fontName}", Inter, system-ui, sans-serif`;
  const tw = Math.max(
    ctx.measureText(line1).width,
    ctx.measureText(line2).width,
    ctx.measureText(line3).width,
    140
  );
  const boxW = Math.round(tw + 18);
  const boxH = line3 ? 48 : 34;
  const boxX = Math.min(anchorX + 10, node.size[0] - boxW - 4);
  const boxY = anchorY - boxH - 6;

  rr(ctx, boxX, boxY, boxW, boxH, 5, c.panel, c.border, 1);

  ctx.fillStyle = c.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(line1, boxX + 9, boxY + 7);

  ctx.font = `500 9.5px "${fontName}", Inter, system-ui, sans-serif`;
  ctx.fillStyle = c.text;
  ctx.fillText(line2, boxX + 9, boxY + 21);

  if (line3) {
    ctx.fillStyle = c.muted;
    ctx.fillText(line3, boxX + 9, boxY + 34);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Toolbar DS Gear Menu Popover (Deathshot Custom UI)
// ---------------------------------------------------------------------------
function closeGearPopover() {
  if (activeGearPopover) {
    activeGearPopover.remove();
    activeGearPopover = null;
  }
}

function openPurgerGearPopover(targetNode, anchorEl) {
  closeGearPopover();

  const popover = document.createElement("div");
  popover.className = "ds-purger-gear-popover";
  popover.dataset.dsThemed = "true";

  window.DSGlobalTheme?.applyToElement?.(popover);

  popover.addEventListener("pointerdown", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());
  popover.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  const renderPopoverContent = () => {
    popover.innerHTML = "";

    // Header
    const head = document.createElement("div");
    head.className = "ds-purger-popover-head";
    head.innerHTML = `
      <div class="ds-purger-popover-head-left">
        <div class="ds-purger-brand-badge">DS</div>
        <div>
          <div class="ds-purger-popover-title">DS The Purger</div>
          <div class="ds-purger-popover-desc">Enable, disable, and reorder purge actions</div>
        </div>
      </div>
      <button type="button" class="ds-purger-popover-close" title="Close">✕</button>
    `;

    head.querySelector(".ds-purger-popover-close").addEventListener("click", () => {
      closeGearPopover();
    });

    popover.appendChild(head);

    // List of Actions
    const list = document.createElement("div");
    list.className = "ds-purger-actions-list";

    const buttons = globalConfig.buttons || ["ALL", "VRAM", "RAM", "MODELS", "CACHE"];
    const enabledMap = globalConfig.enabled || {};

    buttons.forEach((act, idx) => {
      const row = document.createElement("div");
      row.className = "ds-purger-settings-row";

      // Info
      const info = document.createElement("div");
      info.className = "ds-purger-settings-row-text";
      info.innerHTML = `
        <span class="ds-purger-settings-row-label">${act}</span>
        <span class="ds-purger-settings-row-desc">${ACTION_DESCRIPTIONS[act] || act}</span>
      `;

      // Right controls: Order buttons + Custom DS Switch
      const rightGroup = document.createElement("div");
      rightGroup.className = "ds-purger-settings-row-right";

      const orderControls = document.createElement("div");
      orderControls.className = "ds-purger-order-controls";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "ds-purger-order-btn";
      upBtn.title = "Move Up";
      upBtn.disabled = idx === 0;
      upBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>`;
      upBtn.addEventListener("click", () => {
        if (idx > 0) {
          const temp = buttons[idx];
          buttons[idx] = buttons[idx - 1];
          buttons[idx - 1] = temp;
          globalConfig.buttons = [...buttons];
          saveConfig(globalConfig);
          renderPopoverContent();
        }
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "ds-purger-order-btn";
      downBtn.title = "Move Down";
      downBtn.disabled = idx === buttons.length - 1;
      downBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>`;
      downBtn.addEventListener("click", () => {
        if (idx < buttons.length - 1) {
          const temp = buttons[idx];
          buttons[idx] = buttons[idx + 1];
          buttons[idx + 1] = temp;
          globalConfig.buttons = [...buttons];
          saveConfig(globalConfig);
          renderPopoverContent();
        }
      });

      orderControls.append(upBtn, downBtn);

      // Custom Deathshot Toggle Switch
      const isEnabled = enabledMap[act] !== false;
      const toggle = document.createElement("div");
      toggle.className = `ds-purger-switch${isEnabled ? " is-on" : ""}`;
      toggle.title = isEnabled ? `Disable ${act}` : `Enable ${act}`;

      const thumb = document.createElement("div");
      thumb.className = "ds-purger-switch-thumb";
      toggle.appendChild(thumb);

      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        globalConfig.enabled[act] = !isEnabled;
        saveConfig(globalConfig);
        renderPopoverContent();
      });

      rightGroup.append(orderControls, toggle);
      row.append(info, rightGroup);
      list.appendChild(row);
    });

    popover.appendChild(list);

    // Footer: Reset & Enable All
    const foot = document.createElement("div");
    foot.className = "ds-purger-popover-footer";

    const enableAllBtn = document.createElement("button");
    enableAllBtn.type = "button";
    enableAllBtn.className = "ds-purger-footer-btn";
    enableAllBtn.textContent = "Enable All";
    enableAllBtn.addEventListener("click", () => {
      for (const k of ["ALL", "VRAM", "RAM", "MODELS", "CACHE"]) {
        globalConfig.enabled[k] = true;
      }
      saveConfig(globalConfig);
      renderPopoverContent();
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ds-purger-footer-btn";
    resetBtn.textContent = "Reset Defaults";
    resetBtn.addEventListener("click", () => {
      globalConfig.buttons = ["ALL", "VRAM", "RAM", "MODELS", "CACHE"];
      for (const k of globalConfig.buttons) {
        globalConfig.enabled[k] = true;
      }
      saveConfig(globalConfig);
      renderPopoverContent();
    });

    foot.append(enableAllBtn, resetBtn);
    popover.appendChild(foot);
  };

  renderPopoverContent();
  document.body.appendChild(popover);
  activeGearPopover = popover;

  // Positioning
  const pw = 340;
  if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    left = Math.max(16, left);

    let top = rect.bottom + 6;
    if (top + 340 > window.innerHeight - 16) {
      top = Math.max(16, rect.top - 350);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  } else {
    popover.style.left = `${Math.round((window.innerWidth - pw) / 2)}px`;
    popover.style.top = `${Math.round(window.innerHeight / 2 - 160)}px`;
  }

  // Click outside to dismiss
  const onOutsideClick = (e) => {
    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeGearPopover();
      document.removeEventListener("pointerdown", onOutsideClick, true);
    }
  };

  setTimeout(() => {
    document.addEventListener("pointerdown", onOutsideClick, true);
  }, 10);
}

// ---------------------------------------------------------------------------
// Extension Registration & Patching
// ---------------------------------------------------------------------------
app.registerExtension({
  name: EXT_NAME,

  async setup() {
    ensureCSS();
    fetchConfig();

    // Register with Deathshot Arsenal Floating Action Toolbar
    if (window.DSGearMenu?.register) {
      const gearConfig = {
        tooltip: "DS The Purger Settings",
        onClick: (node, canvas, event) => {
          const targetNode = node || app?.canvas?.current_node;
          openPurgerGearPopover(targetNode, event?.currentTarget || event?.target);
        },
      };
      window.DSGearMenu.register(TYPE, gearConfig);
      window.DSGearMenu.register(DISPLAY_NAME, gearConfig);
    }

    // 1. WebSocket listener for live purge result from workflow execution
    api.addEventListener("ds_purger_status", ({ detail }) => {
      if (!detail) return;
      const targetId = detail.node_id ? String(detail.node_id) : null;
      for (const node of activePurgerNodes) {
        if (!targetId || String(node.id) === targetId) {
          if (node._dsResetTimer) {
            clearTimeout(node._dsResetTimer);
            node._dsResetTimer = null;
          }

          node._dsPurgerState = {
            status: detail.status || "PURGED",
            action: detail.action || node.properties?.selected_action || "ALL",
            message: detail.message || "Completed",
            vram_released_str: detail.vram_released_str || "",
            ram_released_str: detail.ram_released_str || "",
            elapsed_ms: detail.elapsed_ms || 0,
            timestamp: Date.now(),
          };

          // Cache last purge metrics for persistent hover inspection
          node._dsLastPurgeInfo = { ...node._dsPurgerState };

          node.setDirtyCanvas?.(true, true);

          // Auto-reset back to READY after 3.5 seconds so subsequent runs are clearly signaled
          node._dsResetTimer = setTimeout(() => {
            node._dsResetTimer = null;
            if (node._dsPurgerState && node._dsPurgerState.status !== "PURGING") {
              node._dsPurgerState.status = "READY";
              node._dsPurgerState.message = "Ready to purge";
              node.setDirtyCanvas?.(true, true);
            }
          }, 3500);
        }
      }
    });

    // 2. ComfyUI workflow execution event listener
    api.addEventListener("executing", ({ detail }) => {
      if (detail === null) {
        // Workflow finished
        return;
      }
      const executingId = String(detail);
      for (const node of activePurgerNodes) {
        if (String(node.id) === executingId) {
          // Execution just reached this DS The Purger node!
          if (node._dsResetTimer) {
            clearTimeout(node._dsResetTimer);
            node._dsResetTimer = null;
          }
          node._dsPurgerState = {
            status: "PURGING",
            action: node.properties?.selected_action || "ALL",
            message: `Purging ${node.properties?.selected_action || "ALL"}...`,
            vram_released_str: "",
            ram_released_str: "",
            elapsed_ms: 0,
            timestamp: Date.now(),
          };
          node.setDirtyCanvas?.(true, true);
        }
      }
    });

    // 3. Reset to READY whenever a new workflow queue execution starts
    api.addEventListener("execution_start", () => {
      for (const node of activePurgerNodes) {
        if (node._dsResetTimer) {
          clearTimeout(node._dsResetTimer);
          node._dsResetTimer = null;
        }
        if (node._dsPurgerState && node._dsPurgerState.status !== "PURGING") {
          node._dsPurgerState.status = "READY";
          node._dsPurgerState.message = "Ready to purge";
          node.setDirtyCanvas?.(true, true);
        }
      }
    });

    // 4. Config sync event listener
    api.addEventListener("ds_purger_config_updated", ({ detail }) => {
      if (detail && detail.buttons && detail.enabled) {
        globalConfig = detail;
        syncAllNodes();
      }
    });

    // 5. Global graph topology listener to refresh link colors & types
    api.addEventListener("graphChanged", () => {
      for (const node of activePurgerNodes) {
        stabilizePurger(node);
      }
    });
  },

  async afterConfigureGraph() {
    for (const node of activePurgerNodes) {
      stabilizePurger(node);
    }
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    // Baseless node setup
    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldResize = nodeType.prototype.onResize;
    const oldRemoved = nodeType.prototype.onRemoved;
    const oldMouseDown = nodeType.prototype.onMouseDown;
    const oldMouseMove = nodeType.prototype.onMouseMove;
    const oldConnectionsChange = nodeType.prototype.onConnectionsChange;

    function applyBaselessFlags(node) {
      node.flags = node.flags || {};
      node.flags.no_title = true;
      node.flags.no_box = true;
      node.flags.no_header = true;
      node.title = "";
      node.badges = [];
      node.hideSlotLabels = true;
      node.shape = 0;
      node.color = "transparent";
      node.bgcolor = "transparent";
      node.boxcolor = "transparent";
      node.resizable = true;
      node._dsNodeBaseOptOut = true;

      // Clear native widgets
      if (Array.isArray(node.widgets)) {
        node.widgets.length = 0;
      }
      node.serialize_widgets = false;

      // Blank slot labels
      if (Array.isArray(node.inputs)) {
        for (const inp of node.inputs) inp.label = " ";
      }
      if (Array.isArray(node.outputs)) {
        for (const out of node.outputs) out.label = " ";
      }

      const minW = computeRequiredWidth(node);
      const savedW = Number(node.properties?.custom_width) || (Array.isArray(node.size) ? Number(node.size[0]) : 0);
      const finalW = Math.max(minW, savedW > 0 ? savedW : minW);
      node.size = [finalW, NODE_H];
      node.min_size = [minW, NODE_H];
    }

    nodeType.prototype.onNodeCreated = function () {
      oldCreated?.apply(this, arguments);

      ensureNodeState(this);
      applyBaselessFlags(this);
      activePurgerNodes.add(this);

      // Subscribe to central theme updates
      if (!this._dsThemeSubscribed && window.DSGlobalTheme?.subscribe) {
        this._dsThemeSubscribed = true;
        window.DSGlobalTheme.subscribe(() => {
          this.setDirtyCanvas?.(true, true);
        });
      }

      setTimeout(() => stabilizePurger(this), 10);
      this.setDirtyCanvas?.(true, true);
    };

    nodeType.prototype.onConfigure = function (info) {
      const r = oldConfigure?.apply(this, arguments);

      ensureNodeState(this);
      applyBaselessFlags(this);

      const minW = computeRequiredWidth(this);
      const savedW = Number(this.properties?.custom_width) ||
        (Array.isArray(info?.size) ? Number(info.size[0]) : (Array.isArray(this.size) ? Number(this.size[0]) : 0));
      const finalW = Math.max(minW, savedW > 0 ? savedW : minW);
      this.size = [finalW, NODE_H];
      this.min_size = [minW, NODE_H];

      activePurgerNodes.add(this);
      setTimeout(() => stabilizePurger(this), 10);
      this.setDirtyCanvas?.(true, true);
      return r;
    };

    nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link, ioSlot) {
      const r = oldConnectionsChange?.apply(this, arguments);
      clearTimeout(this._dsStabilizeTimer);
      this._dsStabilizeTimer = setTimeout(() => {
        stabilizePurger(this);
      }, 0);
      return r;
    };

    nodeType.prototype.computeSize = function () {
      const minW = computeRequiredWidth(this);
      const savedW = Number(this.properties?.custom_width) || (Array.isArray(this.size) ? Number(this.size[0]) : 0);
      return [Math.max(minW, savedW > 0 ? savedW : minW), NODE_H];
    };

    nodeType.prototype.onResize = function (size) {
      const minW = computeRequiredWidth(this);
      const w = Math.max(minW, Math.round(size[0]));
      size[0] = w;
      size[1] = NODE_H; // Strictly lock height to 32px
      this.properties = this.properties || {};
      this.properties.custom_width = w;
      const r = oldResize?.apply(this, arguments);
      this.setDirtyCanvas?.(true, false);
      return r;
    };

    nodeType.prototype.onRemoved = function () {
      if (this._dsResetTimer) {
        clearTimeout(this._dsResetTimer);
        this._dsResetTimer = null;
      }
      activePurgerNodes.delete(this);
      if (oldRemoved) return oldRemoved.apply(this, arguments);
    };

    // Stubs to suppress native ComfyUI box, badges, and title bar rendering
    nodeType.prototype.onDrawBox = () => true;
    nodeType.prototype.drawBox = () => true;
    nodeType.prototype.onDrawTitleBar = () => true;
    nodeType.prototype.drawTitleBar = () => true;
    nodeType.prototype.onDrawTitleText = () => true;
    nodeType.prototype.drawTitleText = () => true;
    nodeType.prototype.getBadges = () => [];

    // Sockets positioning: precisely centered vertically on left and right outer edges
    nodeType.prototype.getConnectionPos = function (is_input, slot_number, out) {
      out = out || new Float32Array(2);
      const [w, h] = this.size;
      const cy = Math.round(h * 0.5); // 16px
      out[0] = this.pos[0] + (is_input ? 0 : w);
      out[1] = this.pos[1] + cy;
      return out;
    };

    nodeType.prototype.getInputPos = function (slot, out) {
      return this.getConnectionPos(true, slot, out);
    };

    nodeType.prototype.getOutputPos = function (slot, out) {
      return this.getConnectionPos(false, slot, out);
    };

    // Pure Canvas2D background & button painting
    nodeType.prototype.onDrawBackground = function (ctx) {
      paintPurgerCanvas(this, ctx);
    };

    // Suppress foreground painting
    nodeType.prototype.onDrawForeground = function () {};

    // Action button selection
    nodeType.prototype.onMouseDown = function (e, pos) {
      if (pos && Array.isArray(this._dsButtonHits)) {
        for (const hit of this._dsButtonHits) {
          if (
            pos[0] >= hit.x &&
            pos[0] <= hit.x + hit.w &&
            pos[1] >= hit.y &&
            pos[1] <= hit.y + hit.h
          ) {
            // Update selected purge action
            this.properties.selected_action = hit.action;
            if (this._dsResetTimer) {
              clearTimeout(this._dsResetTimer);
              this._dsResetTimer = null;
            }
            if (this._dsPurgerState && this._dsPurgerState.status !== "PURGING") {
              this._dsPurgerState.status = "READY";
              this._dsPurgerState.action = hit.action;
              this._dsPurgerState.message = "Ready to purge";
            }
            this.setDirtyCanvas?.(true, true);
            return true;
          }
        }
      }
      return oldMouseDown ? oldMouseDown.apply(this, arguments) : false;
    };

    // Hover detection for buttons and status pill
    nodeType.prototype.onMouseMove = function (e, pos) {
      let changed = false;
      if (pos && Array.isArray(this._dsButtonHits)) {
        let hoveredAct = null;
        for (const hit of this._dsButtonHits) {
          if (
            pos[0] >= hit.x &&
            pos[0] <= hit.x + hit.w &&
            pos[1] >= hit.y &&
            pos[1] <= hit.y + hit.h
          ) {
            hoveredAct = hit.action;
            break;
          }
        }
        if (this._dsHoveredAction !== hoveredAct) {
          this._dsHoveredAction = hoveredAct;
          changed = true;
        }
      } else if (this._dsHoveredAction) {
        this._dsHoveredAction = null;
        changed = true;
      }

      if (pos && this._dsStatusHit) {
        const isHover = (
          pos[0] >= this._dsStatusHit.x &&
          pos[0] <= this._dsStatusHit.x + this._dsStatusHit.w &&
          pos[1] >= this._dsStatusHit.y &&
          pos[1] <= this._dsStatusHit.y + this._dsStatusHit.h
        );
        if (this._dsHoveredStatus !== isHover) {
          this._dsHoveredStatus = isHover;
          changed = true;
        }
      } else if (this._dsHoveredStatus) {
        this._dsHoveredStatus = false;
        changed = true;
      }

      if (changed) {
        this.setDirtyCanvas?.(true, false);
      }
      return oldMouseMove ? oldMouseMove.apply(this, arguments) : false;
    };

    nodeType.prototype.onMouseLeave = function () {
      let changed = false;
      if (this._dsHoveredAction) {
        this._dsHoveredAction = null;
        changed = true;
      }
      if (this._dsHoveredStatus) {
        this._dsHoveredStatus = false;
        changed = true;
      }
      if (changed) {
        this.setDirtyCanvas?.(true, false);
      }
    };

    // Toolbar gear popover trigger methods
    nodeType.prototype._openPurgerGearPopover = function (anchorEl) {
      openPurgerGearPopover(this, anchorEl);
    };

    nodeType.prototype._togglePurgerGearPopover = function (anchorEl) {
      if (activeGearPopover) {
        closeGearPopover();
      } else {
        openPurgerGearPopover(this, anchorEl);
      }
    };
  },
});
