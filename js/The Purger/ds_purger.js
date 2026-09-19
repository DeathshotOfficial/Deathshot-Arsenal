/**
 * Deathshot Arsenal - DS The Purger
 *
 * Ultra-compact, borderless, zero-overhead memory and cache management node.
 * Features customizable segmented mode buttons flanked on the exact same horizontal axis by
 * 1 universal input port and 1 universal output port.
 *
 * Integrated with Deathshot UI System (ds_controls.js / DSGlobalTheme) — strictly NO drop shadows.
 */

import { app } from "/scripts/app.js";

const NODE_TYPE = "DS_ThePurger";
const EXT_NAME = "DeathshotArsenal.DS_ThePurger";

const BASE_H = 38;
const ALL_BUTTONS = ["All", "VRAM", "RAM", "Models", "Cache"];
const MARGIN_LR = 12;
const BTN_H = 28;
const BTN_W = 50;
const GAP = 4;

function computeNodeWidth(buttonCount) {
  const count = Math.max(1, buttonCount || 1);
  return MARGIN_LR * 2 + count * BTN_W + (count - 1) * GAP;
}

function getLayout(node) {
  const visible = Array.isArray(node?.properties?.visible_buttons) && node.properties.visible_buttons.length > 0
    ? node.properties.visible_buttons
    : ALL_BUTTONS;
  const count = Math.max(1, visible.length);
  const w = node?.size?.[0] || computeNodeWidth(count);
  const h = node?.size?.[1] || BASE_H;
  const btnY = Math.round((h - BTN_H) / 2);
  const trackW = w - 2 * MARGIN_LR;
  const totalGaps = (count - 1) * GAP;
  const btnW = Math.max(28, Math.floor((trackW - totalGaps) / count));
  const trackStartX = MARGIN_LR + Math.round((trackW - (count * btnW + totalGaps)) / 2);

  return {
    visible,
    count,
    w,
    h,
    btnH: BTN_H,
    btnY,
    btnW,
    gap: GAP,
    trackStartX,
  };
}

function getButtonAtPos(node, pos) {
  if (!node || !pos) return -1;
  const px = Number(pos[0]);
  const py = Number(pos[1]);
  if (isNaN(px) || isNaN(py)) return -1;

  const layout = getLayout(node);
  if (py < layout.btnY || py > layout.btnY + layout.btnH) return -1;

  for (let i = 0; i < layout.count; i++) {
    const bx = layout.trackStartX + i * (layout.btnW + layout.gap);
    if (px >= bx && px <= bx + layout.btnW) {
      return i;
    }
  }
  return -1;
}

function getThemeColors() {
  const dsTheme = window.DSGlobalTheme;
  const bgSurface = dsTheme?.getVar("--ds-panel", "#12151c") || "#12151c";
  const btnBg = dsTheme?.getVar("--ds-panel-2", dsTheme?.getVar("--ds-btn-bg", "#161a23")) || "#161a23";
  const border = dsTheme?.getVar("--ds-border", "#242a36") || "#242a36";
  const borderActive = dsTheme?.getVar("--ds-border-active", dsTheme?.getVar("--ds-accent", "#67e8f9")) || "#67e8f9";
  const accent = dsTheme?.getVar("--ds-accent", "#67e8f9") || "#67e8f9";
  const activeBg = dsTheme?.getVar("--ds-panel-2", "#21252d") || "#21252d";
  const btnHover = dsTheme?.getVar("--ds-btn-hover", "#1c2130") || "#1c2130";
  const textMuted = dsTheme?.getVar("--ds-text-muted", "#9ca3af") || "#9ca3af";
  const textNormal = dsTheme?.getVar("--ds-text", "#e5e7eb") || "#e5e7eb";

  return {
    bgSurface,
    btnBg,
    border,
    borderActive,
    accent,
    activeBg,
    btnHover,
    textMuted,
    textNormal,
  };
}

// ---------------------------------------------------------------------------
// Dedicated Deathshot Quick Config Popover (Small UI containing all buttons)
// ---------------------------------------------------------------------------
let activePurgerPopup = null;

function closePurgerQuickConfig() {
  if (activePurgerPopup) {
    activePurgerPopup.remove();
    activePurgerPopup = null;
  }
}

function openPurgerQuickConfig(node, anchorEl) {
  closePurgerQuickConfig();
  if (!node) return;

  const popup = document.createElement("div");
  popup.className = "ds-purger-popup";
  popup.style.position = "fixed";
  popup.style.zIndex = "100002";
  popup.style.boxSizing = "border-box";
  popup.style.background = "var(--ds-panel, #12151c)";
  popup.style.border = "1px solid var(--ds-border, #343a44)";
  popup.style.borderRadius = "8px";
  popup.style.boxShadow = "0 12px 32px rgba(0, 0, 0, 0.45)";
  popup.style.padding = "12px 14px";
  popup.style.minWidth = "280px";
  popup.style.fontFamily = "var(--ds-font, Inter, system-ui, sans-serif)";
  popup.style.color = "var(--ds-text, #e5e7eb)";
  popup.style.userSelect = "none";

  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  popup.addEventListener("mousedown", (e) => e.stopPropagation());
  popup.addEventListener("click", (e) => e.stopPropagation());

  const renderContent = () => {
    const visible = Array.isArray(node.properties?.visible_buttons) && node.properties.visible_buttons.length > 0
      ? node.properties.visible_buttons
      : [...ALL_BUTTONS];
    const currentMode = node.properties?.purge_mode || "All";

    popup.innerHTML = "";

    // 1. Header
    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.marginBottom = "10px";
    head.style.paddingBottom = "8px";
    head.style.borderBottom = "1px solid var(--ds-border, #242a36)";

    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";
    titleWrap.style.gap = "8px";

    const badge = document.createElement("span");
    badge.textContent = "DS";
    badge.style.fontSize = "9px";
    badge.style.fontWeight = "800";
    badge.style.padding = "1px 5px";
    badge.style.borderRadius = "3px";
    badge.style.background = "var(--ds-accent, #67e8f9)";
    badge.style.color = "var(--ds-on-accent, #0a0c10)";

    const titleText = document.createElement("div");
    titleText.innerHTML = `<strong style="font-size: 11px; display: block; line-height: 1.2;">DS The Purger</strong><small style="font-size: 8.5px; color: var(--ds-text-muted, #9ca3af);">Click button to toggle visibility</small>`;

    titleWrap.appendChild(badge);
    titleWrap.appendChild(titleText);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.color = "var(--ds-text-muted, #9ca3af)";
    closeBtn.style.fontSize = "16px";
    closeBtn.style.lineHeight = "1";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "2px 6px";
    closeBtn.style.borderRadius = "4px";
    closeBtn.addEventListener("click", closePurgerQuickConfig);

    head.appendChild(titleWrap);
    head.appendChild(closeBtn);
    popup.appendChild(head);

    // 2. Small UI containing all buttons
    const sectionLabel = document.createElement("div");
    sectionLabel.style.fontSize = "8px";
    sectionLabel.style.fontWeight = "700";
    sectionLabel.style.textTransform = "uppercase";
    sectionLabel.style.letterSpacing = "0.5px";
    sectionLabel.style.color = "var(--ds-text-muted, #8d95a1)";
    sectionLabel.style.marginBottom = "6px";
    sectionLabel.textContent = "VISIBLE BUTTONS";
    popup.appendChild(sectionLabel);

    const chipsRow = document.createElement("div");
    chipsRow.style.display = "grid";
    chipsRow.style.gridTemplateColumns = "repeat(5, 1fr)";
    chipsRow.style.gap = "4px";
    chipsRow.style.marginBottom = "10px";

    ALL_BUTTONS.forEach((btnName) => {
      const isVisible = visible.includes(btnName);

      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = btnName;
      chip.style.height = "28px";
      chip.style.padding = "0 4px";
      chip.style.border = isVisible
        ? "1px solid var(--ds-accent, #67e8f9)"
        : "1px solid var(--ds-border, #242a36)";
      chip.style.borderRadius = "5px";
      chip.style.background = isVisible
        ? "color-mix(in srgb, var(--ds-accent, #67e8f9) 15%, var(--ds-panel-2, #161a23))"
        : "var(--ds-panel-2, #161a23)";
      chip.style.color = isVisible
        ? "var(--ds-text, #ffffff)"
        : "var(--ds-text-muted, #8d95a1)";
      chip.style.boxShadow = isVisible
        ? "inset 0 -2px 0 var(--ds-accent, #67e8f9)"
        : "none";
      chip.style.fontSize = "9.5px";
      chip.style.fontWeight = isVisible ? "700" : "600";
      chip.style.cursor = "pointer";
      chip.style.transition = "all 120ms ease";
      chip.style.opacity = isVisible ? "1" : "0.5";

      chip.title = isVisible
        ? `Click to hide ${btnName}`
        : `Click to show ${btnName}`;

      chip.addEventListener("click", () => {
        node.toggleVisibleButton?.(btnName);
        renderContent();
      });

      chipsRow.appendChild(chip);
    });
    popup.appendChild(chipsRow);

    // 3. Footer with "Show All" and active mode indicator
    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.alignItems = "center";
    footer.style.justifyContent = "space-between";
    footer.style.paddingTop = "8px";
    footer.style.borderTop = "1px solid var(--ds-border, #242a36)";

    const statusText = document.createElement("span");
    statusText.style.fontSize = "9px";
    statusText.style.color = "var(--ds-text-muted, #9ca3af)";
    statusText.innerHTML = `Active: <strong style="color: var(--ds-accent, #67e8f9);">${currentMode}</strong>`;

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Show All";
    resetBtn.style.height = "22px";
    resetBtn.style.padding = "0 8px";
    resetBtn.style.border = "1px solid var(--ds-border, #242a36)";
    resetBtn.style.borderRadius = "4px";
    resetBtn.style.background = "var(--ds-panel-2, #161a23)";
    resetBtn.style.color = "var(--ds-text-muted, #9ca3af)";
    resetBtn.style.fontSize = "8.5px";
    resetBtn.style.fontWeight = "600";
    resetBtn.style.cursor = "pointer";

    resetBtn.addEventListener("click", () => {
      node.properties.visible_buttons = [...ALL_BUTTONS];
      const newW = computeNodeWidth(ALL_BUTTONS.length);
      node.size = [newW, BASE_H];
      if (node.outputs?.[0]) node.outputs[0].pos = [newW, BASE_H / 2];
      node.setDirtyCanvas?.(true, true);
      node.graph?.change?.();
      renderContent();
    });

    footer.appendChild(statusText);
    footer.appendChild(resetBtn);
    popup.appendChild(footer);
  };

  renderContent();
  document.body.appendChild(popup);
  activePurgerPopup = popup;

  // Position popup anchored to anchorEl
  if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
    const rect = anchorEl.getBoundingClientRect();
    const pw = popup.offsetWidth || 280;
    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));
    let top = rect.bottom + 6;
    if (top + (popup.offsetHeight || 160) > window.innerHeight - 10) {
      top = rect.top - (popup.offsetHeight || 160) - 6;
    }
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  } else {
    popup.style.left = `${Math.round(window.innerWidth / 2 - 140)}px`;
    popup.style.top = `${Math.round(window.innerHeight / 2 - 80)}px`;
  }

  // Dismiss on outside click
  const onOutsideClick = (e) => {
    if (!popup.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closePurgerQuickConfig();
      document.removeEventListener("pointerdown", onOutsideClick);
    }
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutsideClick);
  }, 10);
}

function setupNode(node) {
  if (!node) return;

  // 1. Suppression of native node chrome / title bar
  node.shape = 0; // Standard box shape (suppresses ROUND_SHAPE outer ring)
  node.color = "transparent";
  node.bgcolor = "transparent";
  node.boxcolor = "transparent";
  node.flags = node.flags || {};
  node.flags.no_box = true;
  node.flags.no_header = true;
  node.flags.no_title = true;
  node.title = "";
  node._dsNodeBaseOptOut = true;

  // 2. Complete suppression of source/pack badge ("DeathshotArsenal" pill)
  try {
    Object.defineProperty(node, "badges", {
      get() {
        return [];
      },
      set(_) {},
      configurable: true,
      enumerable: true,
    });
  } catch (_) {
    node.badges = [];
  }
  node.showBadges = false;
  node.drawBadges = function () {
    return false;
  };
  node.onDrawBadges = function () {
    return false;
  };

  // 3. State initialization & visible buttons
  node.properties = node.properties || {};
  if (!Array.isArray(node.properties.visible_buttons) || node.properties.visible_buttons.length === 0) {
    node.properties.visible_buttons = [...ALL_BUTTONS];
  }
  if (!node.properties.purge_mode) {
    const modeWidget = (node.widgets || []).find((w) => w.name === "mode");
    node.properties.purge_mode = modeWidget?.value || "All";
  }

  // 4. Geometry based on visible buttons
  const w = computeNodeWidth(node.properties.visible_buttons.length);
  node.size = [w, BASE_H];
  node.min_size = [w, BASE_H];
  node.resizable = false;
  node.computeSize = function () {
    const curW = computeNodeWidth((this.properties?.visible_buttons || ALL_BUTTONS).length);
    return [curW, BASE_H];
  };

  // 5. Ports: horizontally aligned with node edges, no labels
  // Set color_off/color_on to transparent so the native LiteGraph slot dot
  // is invisible — our custom onDrawForeground dot handles the visual.
  // The slot geometry and connection logic remain fully functional.
  if (node.inputs?.[0]) {
    node.inputs[0].label = " ";
    node.inputs[0].pos = [0, BASE_H / 2];
    node.inputs[0].color_off = "rgba(0,0,0,0)";
    node.inputs[0].color_on  = "rgba(0,0,0,0)";
  }
  if (node.outputs?.[0]) {
    node.outputs[0].label = " ";
    node.outputs[0].pos = [w, BASE_H / 2];
    node.outputs[0].color_off = "rgba(0,0,0,0)";
    node.outputs[0].color_on  = "rgba(0,0,0,0)";
  }

  node.getConnectionPos = function (is_input, slot_number, out) {
    out = out || new Float32Array(2);
    out[0] = this.pos[0] + (is_input ? 0 : this.size[0]);
    out[1] = this.pos[1] + this.size[1] / 2;
    return out;
  };

  // 6. Hide underlying combo widget while retaining graph serialization
  for (const wgt of node.widgets || []) {
    if (wgt.name === "mode") {
      wgt.hidden = true;
      wgt.type = "hidden";
      wgt.computeSize = () => [0, -4];
      wgt.draw = () => {};
    }
  }

  // 7. Dynamic button toggle helper
  node.toggleVisibleButton = function (buttonName) {
    if (!ALL_BUTTONS.includes(buttonName)) return;
    this.properties = this.properties || {};
    let visible = Array.isArray(this.properties.visible_buttons)
      ? [...this.properties.visible_buttons]
      : [...ALL_BUTTONS];

    const idx = visible.indexOf(buttonName);
    if (idx >= 0) {
      if (visible.length <= 1) return; // Prevent removing last remaining button
      visible.splice(idx, 1);
    } else {
      visible.push(buttonName);
      visible.sort((a, b) => ALL_BUTTONS.indexOf(a) - ALL_BUTTONS.indexOf(b));
    }

    this.properties.visible_buttons = visible;

    // Fallback mode if current mode was toggled off
    if (!visible.includes(this.properties.purge_mode)) {
      const fallback = visible.includes("All") ? "All" : visible[0];
      this.properties.purge_mode = fallback;
      const modeWidget = (this.widgets || []).find((w) => w.name === "mode");
      if (modeWidget) {
        modeWidget.value = fallback;
        modeWidget.callback?.(fallback);
      }
    }

    const newW = computeNodeWidth(visible.length);
    this.size = [newW, BASE_H];
    if (this.outputs?.[0]) {
      this.outputs[0].pos = [newW, BASE_H / 2];
    }

    this.setDirtyCanvas?.(true, true);
    if (this.graph) {
      this.graph.change?.();
    }
  };

  // 8. Hook live theme changes
  if (window.DSGlobalTheme?.subscribe && !node._dsThemeSubscribed) {
    node._dsThemeSubscribed = true;
    node._dsThemeUnsub = window.DSGlobalTheme.subscribe(() => {
      node.setDirtyCanvas?.(true, true);
    });
  }
}

function registerGearMenu() {
  if (!window.DSGearMenu?.register) return;

  window.DSGearMenu.register(NODE_TYPE, {
    tooltip: "DS The Purger Configuration",
    onClick: (node, canvas, event) => {
      openPurgerQuickConfig(node, event?.currentTarget || event?.target);
    },
  });
}

app.registerExtension({
  name: EXT_NAME,

  init() {
    registerGearMenu();
  },

  setup() {
    registerGearMenu();
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    registerGearMenu();

    const LG = window.LiteGraph || globalThis.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;

    // Suppress title bar, box outline & badges drawing completely on prototype
    nodeType.prototype.onDrawTitleBar = function () {};
    nodeType.prototype.onDrawTitleText = function () {};
    nodeType.prototype.drawTitleText = function () {};
    nodeType.prototype.onDrawBox = function () {
      return true;
    };
    nodeType.prototype.drawBox = function () {
      return true;
    };
    nodeType.prototype.showBadges = false;
    nodeType.prototype.badges = [];
    nodeType.prototype.drawBadges = function () {
      return false;
    };
    nodeType.prototype.onDrawBadges = function () {
      return false;
    };

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const res = oldCreated ? oldCreated.apply(this, arguments) : undefined;
      setupNode(this);
      this._dsHoverIdx = -1;
      this.setDirtyCanvas?.(true, true);
      return res;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const res = oldConfigure ? oldConfigure.apply(this, arguments) : undefined;
      setupNode(this);
      const mode = this.properties?.purge_mode || "All";
      const modeWidget = (this.widgets || []).find((w) => w.name === "mode");
      if (modeWidget) modeWidget.value = mode;

      const visible = this.properties?.visible_buttons || ALL_BUTTONS;
      const expectedW = computeNodeWidth(visible.length);
      this.size = [expectedW, BASE_H];
      if (this.outputs?.[0]) this.outputs[0].pos = [expectedW, BASE_H / 2];

      this._dsHoverIdx = -1;
      this.setDirtyCanvas?.(true, true);
      return res;
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      closePurgerQuickConfig();
      if (this._dsThemeUnsub) {
        this._dsThemeUnsub();
        this._dsThemeUnsub = null;
        this._dsThemeSubscribed = false;
      }
      return oldRemoved ? oldRemoved.apply(this, arguments) : undefined;
    };

    // Double-click opens Quick Config
    nodeType.prototype.onDblClick = function () {
      openPurgerQuickConfig(this);
      return true;
    };

    // Canvas Right-Click Extra Menu Options
    const oldGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      if (oldGetExtraMenuOptions) {
        oldGetExtraMenuOptions.apply(this, arguments);
      }
      options = options || [];

      options.push(
        null,
        {
          content: "⚙ Configure Buttons...",
          callback: () => {
            openPurgerQuickConfig(this);
          },
        },
        null
      );
    };

    // Segmented strip capsule container (strictly NO drop shadows)
    nodeType.prototype.onDrawBackground = function (ctx) {
      if (this.flags?.collapsed) return;

      const colors = getThemeColors();
      const layout = getLayout(this);
      const w = this.size[0] || layout.w;
      const h = this.size[1] || layout.h;

      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Draw outer capsule matching Deathshot panel styling
      ctx.fillStyle = colors.bgSurface;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(0, 0, w, h, 6);
      } else {
        ctx.rect(0, 0, w, h);
      }
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    };

    // Segmented buttons & slot dot indicators
    nodeType.prototype.onDrawForeground = function (ctx) {
      if (this.flags?.collapsed) return;

      const colors = getThemeColors();
      const layout = getLayout(this);
      const currentMode = this.properties?.purge_mode || "All";
      const fontName = window.DSGlobalTheme?.getConfig?.()?.font || "Inter";

      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // ── ERASE any native LiteGraph slot dots ──────────────────────────────
      // onDrawForeground runs AFTER LiteGraph's slot-dot rendering pass, so
      // we can overdraw the native dots with the background color before
      // painting our own styled dots. This works in all LiteGraph versions.
      ctx.fillStyle = colors.bgSurface;
      ctx.beginPath(); ctx.arc(0,        layout.h / 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(layout.w, layout.h / 2, 7, 0, Math.PI * 2); ctx.fill();
      // ─────────────────────────────────────────────────────────────────────

      // Draw visible segmented buttons matching .ds-ui-button / .ds-il-chip
      for (let i = 0; i < layout.count; i++) {
        const mode = layout.visible[i];
        const bx = layout.trackStartX + i * (layout.btnW + layout.gap);
        const by = layout.btnY;
        const bw = layout.btnW;
        const bh = layout.btnH;

        const isActive = currentMode === mode;
        const isHover = this._dsHoverIdx === i;

        // Button body (EVERY button has a distinct bordered shape!)
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(bx, by, bw, bh, 5);
        } else {
          ctx.rect(bx, by, bw, bh);
        }

        if (isActive) {
          // Active state (.ds-il-chip.active: panel-2 bg, accent border & bottom accent indicator)
          ctx.fillStyle = colors.activeBg;
          ctx.fill();

          // Signature bottom accent indicator line clipped strictly to the button's rounded corners
          ctx.save();
          ctx.clip();
          ctx.fillStyle = colors.accent;
          ctx.fillRect(bx, by + bh - 2.5, bw, 2.5);
          ctx.restore();

          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (isHover) {
          // Hover state (.ds-il-chip:hover: btn-hover bg & border)
          ctx.fillStyle = colors.btnHover;
          ctx.fill();

          ctx.strokeStyle = colors.borderActive;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // Inactive state (.ds-il-chip: panel-2 background & subtle border)
          ctx.fillStyle = colors.btnBg;
          ctx.fill();

          ctx.strokeStyle = colors.border;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Typography (Active = accent text; Inactive = muted text; Hover = normal text)
        const fontSize = 10;
        const fontWeight = isActive ? "700" : "600";
        ctx.font = `${fontWeight} ${fontSize}px "${fontName}", system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = isActive ? colors.accent : (isHover ? colors.textNormal : colors.textMuted);
        ctx.textAlign = "center";

        // Subpixel optical vertical centering using glyph bounding box
        const metrics = ctx.measureText(mode);
        let textY;
        if (metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null) {
          ctx.textBaseline = "alphabetic";
          const glyphCenterOffset = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
          textY = Math.round(by + bh / 2 + glyphCenterOffset);
        } else {
          ctx.textBaseline = "middle";
          textY = Math.round(by + bh / 2) - 0.5;
        }

        ctx.fillText(mode, Math.round(bx + bw / 2), textY);
      }

      // Slot indicators centered on left (input) and right (output) edges
      const inConnected = Boolean(this.inputs?.[0]?.link != null);
      const outConnected = Boolean(this.outputs?.[0]?.links?.length > 0);

      // Input dot (left edge)
      ctx.fillStyle = inConnected ? colors.accent : colors.border;
      ctx.beginPath();
      ctx.arc(0, layout.h / 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.bgSurface;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Output dot (right edge)
      ctx.fillStyle = outConnected ? colors.accent : colors.border;
      ctx.beginPath();
      ctx.arc(layout.w, layout.h / 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.bgSurface;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    };

    // Mouse interaction for segmented button strip
    const oldMouseMove = nodeType.prototype.onMouseMove;
    nodeType.prototype.onMouseMove = function (e, pos) {
      const idx = getButtonAtPos(this, pos);
      if (idx !== this._dsHoverIdx) {
        this._dsHoverIdx = idx;
        this.setDirtyCanvas?.(true, false);
      }
      return oldMouseMove ? oldMouseMove.apply(this, arguments) : undefined;
    };

    const oldMouseLeave = nodeType.prototype.onMouseLeave;
    nodeType.prototype.onMouseLeave = function () {
      if (this._dsHoverIdx !== -1) {
        this._dsHoverIdx = -1;
        this.setDirtyCanvas?.(true, false);
      }
      return oldMouseLeave ? oldMouseLeave.apply(this, arguments) : undefined;
    };

    const oldMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function (e, pos) {
      const idx = getButtonAtPos(this, pos);
      if (idx >= 0) {
        const layout = getLayout(this);
        const selectedMode = layout.visible[idx];
        this.properties = this.properties || {};
        this.properties.purge_mode = selectedMode;

        const modeWidget = (this.widgets || []).find((w) => w.name === "mode");
        if (modeWidget) {
          modeWidget.value = selectedMode;
          if (typeof modeWidget.callback === "function") {
            modeWidget.callback(selectedMode);
          }
        }

        this.setDirtyCanvas?.(true, true);
        if (this.graph) {
          this.graph.change?.();
        }
        // Consume click so node is not dragged when pressing a button
        return true;
      }

      return oldMouseDown ? oldMouseDown.apply(this, arguments) : undefined;
    };
  },
});
