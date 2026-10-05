import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { Card, ColorPicker, normalizeDSWidgetHost, protectDSResizeCorners, installDSUI, DSIcon } from "../UIElements/index.js";
import { createPreview } from "./outpaint_canvas.js";
import { openSettings } from "./outpaint_settings.js";
import { calculatePreview } from "./outpaint_math.js";

const TYPE = "DS_Outpaint";
const CSS = "/extensions/DeathshotArsenal/Outpaint/outpaint.css";
const UI_KEY = "ds_outpaint_state";

const MIN_W = 280;
const DEFAULT_W = 340;
const MIN_COLLAPSED_H = 260;
const MIN_EXPANDED_H = 360;
const DEFAULT_EXPANDED_H = 480;

function getMinHeight(node) {
  return node?._dsState?.collapsed ? MIN_COLLAPSED_H : MIN_EXPANDED_H;
}

const NATIVE_LANE_H = 110;
const CARD_MARGIN = 5;

const DEFAULT_RATIOS = ["1:1", "4:5", "16:9", "9:16", "3:2", "2:3", "21:9", "4:3"];
const DEFAULT_MP = [0, 1, 1.5, 2, 2.5, 3];
const SNAP_VALUES = [8, 16, 32, 64];

installDSUI();

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

function registerOutpaintGearMenu() {
  if (typeof window !== "undefined" && window.DSGearMenu?.register) {
    const gearConfig = {
      icon: "settings",
      tooltip: "Outpaint Settings",
      onClick: (n) => openSettings(n),
    };
    window.DSGearMenu.register(TYPE, gearConfig);
    window.DSGearMenu.register("DS Outpaint", gearConfig);
    return true;
  }
  return false;
}

if (!registerOutpaintGearMenu()) {
  setTimeout(registerOutpaintGearMenu, 250);
  setTimeout(registerOutpaintGearMenu, 1000);
}

const clone = (v) => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

function defaults() {
  return {
    mode: "To ratio",
    ratio: "3:2",
    direction: "Both",
    pad_left: 0,
    pad_top: 0,
    pad_right: 0,
    pad_bottom: 0,
    snap_enabled: true,
    snap_multiple: 8,
    target_mp: 0,
    fill_color: "#808080",
    collapsed: false,
    saved_width: DEFAULT_W,
    expanded_height: DEFAULT_EXPANDED_H,
    custom_ratios: [...DEFAULT_RATIOS],
    custom_mp: [...DEFAULT_MP],
  };
}

function loadState(node) {
  const s = { ...defaults(), ...(node?.properties?.[UI_KEY] || {}) };
  s.custom_ratios = Array.isArray(s.custom_ratios) && s.custom_ratios.length ? [...s.custom_ratios] : [...DEFAULT_RATIOS];
  s.custom_mp = Array.isArray(s.custom_mp) && s.custom_mp.length ? s.custom_mp.map(Number).filter(Number.isFinite) : [...DEFAULT_MP];
  if (!s.custom_mp.some((v) => Number(v) === 0)) s.custom_mp.unshift(0);
  if (!s.custom_ratios.includes(s.ratio)) s.ratio = s.custom_ratios[0] || DEFAULT_RATIOS[0];
  if (!s.custom_mp.some((v) => Number(v) === Number(s.target_mp))) s.target_mp = 0;
  s.snap_multiple = SNAP_VALUES.includes(Number(s.snap_multiple)) ? Number(s.snap_multiple) : 8;
  s.snap_enabled = Boolean(s.snap_enabled);
  s.target_mp = Math.max(0, Number(s.target_mp) || 0);
  s.fill_color = /^#[0-9a-f]{6}$/i.test(String(s.fill_color || "")) ? String(s.fill_color) : "#808080";
  s.saved_width = Math.max(MIN_W, Math.round(Number(s.saved_width) || DEFAULT_W));
  s.expanded_height = Math.max(s.collapsed ? MIN_COLLAPSED_H : MIN_EXPANDED_H, Math.round(Number(s.expanded_height) || DEFAULT_EXPANDED_H));
  s.collapsed = Boolean(s.collapsed);
  return s;
}

function errorLog(event, err, details) {
  const message = err?.stack || err?.message || String(err);
  console.error(`[DS Outpaint] ERROR ${event}: ${message}`, details || "");
  try {
    fetch("/ds_debug_log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: `DS Outpaint/${event}`, message, details: details || {} }),
    }).catch(() => {});
  } catch (_) {}
}

function persist(node) {
  if (!node) return;
  node.properties ||= {};
  node.properties[UI_KEY] = clone(node._dsState);
}

function beginHistory(node) {
  if (!node || node._dsHistoryOpen) return;
  node._dsHistoryOpen = true;
  try { node.graph?.beforeChange?.(); } catch (e) { errorLog("history-before", e, { node: node.id }); }
  try { app.canvas?.emitBeforeChange?.(); } catch (e) { errorLog("history-canvas-before", e, { node: node.id }); }
}

function endHistory(node) {
  if (!node || !node._dsHistoryOpen) return;
  try { node.graph?.afterChange?.(); } catch (e) { errorLog("history-after", e, { node: node.id }); }
  try { app.canvas?.emitAfterChange?.(); } catch (e) { errorLog("history-canvas-after", e, { node: node.id }); }
  node._dsHistoryOpen = false;
}

function syncHiddenWidgets(node) {
  const s = node._dsState;
  const rows = [
    ["mode", "text", s.mode],
    ["ratio", "text", s.ratio],
    ["direction", "text", s.direction],
    ["pad_left", "number", s.pad_left],
    ["pad_top", "number", s.pad_top],
    ["pad_right", "number", s.pad_right],
    ["pad_bottom", "number", s.pad_bottom],
    ["snap_enabled", "toggle", s.snap_enabled],
    ["snap_multiple", "number", s.snap_multiple],
    ["target_mp", "number", s.target_mp],
    ["fill_color", "text", s.fill_color],
  ];
  for (const [name, type, value] of rows) {
    let w = node.widgets?.find((x) => x.name === name);
    if (!w) w = node.addWidget(type, name, value, () => {}, {});
    w.value = value;
    w.hidden = true;
    w.serialize = true;
    w.computeSize = () => [0, 0];
    w.draw = () => {};
    if (w.element) {
      w.element.style.display = "none";
      w.element.style.visibility = "hidden";
      w.element.style.pointerEvents = "none";
    }
    if (w.element?.parentElement) {
      w.element.parentElement.style.display = "none";
      w.element.parentElement.style.height = "0";
      w.element.parentElement.style.minHeight = "0";
    }
  }
}

function btn(text, cls = "", active = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `ds-ui-btn ds-ui-btn-compact ${cls}${active ? " is-active" : ""}`.trim();
  b.textContent = text;
  return b;
}

function directionLabels(s, node) {
  if (s.mode !== "To ratio") return ["Left", "Both", "Right"];
  const [a, b] = String(s.ratio).split(":").map(Number);
  const target = a > 0 && b > 0 ? a / b : 1;
  const img = node?._dsImage || (node ? findImage(node) : null);
  const iw = Number(img?.naturalWidth || img?.width || 0);
  const ih = Number(img?.naturalHeight || img?.height || 0);
  if (iw > 0 && ih > 0) {
    const current = iw / ih;
    if (target < current - 1e-12) return ["Top", "Both", "Bottom"];
    return ["Left", "Both", "Right"];
  }
  if (["Top", "Bottom"].includes(String(s.direction))) return ["Top", "Both", "Bottom"];
  return ["Left", "Both", "Right"];
}

function normalizeDirection(node) {
  const s = node?._dsState;
  if (!s || s.mode !== "To ratio") return false;
  const labels = directionLabels(s, node);
  if (labels.includes(s.direction)) return false;
  s.direction = "Both";
  return true;
}

function isDrawable(v) {
  if (!v) return false;
  if (v.naturalWidth > 0 || v.videoWidth > 0) return true;
  if (typeof HTMLCanvasElement !== "undefined" && v instanceof HTMLCanvasElement && v.width > 0) return true;
  if (typeof ImageBitmap !== "undefined" && v instanceof ImageBitmap && v.width > 0) return true;
  if (v.width > 0 && v.height > 0 && !(typeof HTMLElement !== "undefined" && v instanceof HTMLElement && v.tagName !== "CANVAS" && v.tagName !== "IMG" && v.tagName !== "VIDEO")) {
    return true;
  }
  return false;
}

function getUpstreamNode(node, inputName = "image", depth = 0) {
  if (!node || depth > 10) return null;
  const input = node.inputs?.find((i) => i.name === inputName);
  if (!input || input.link == null) return null;

  let upstream = null;
  if (typeof node.getInputNode === "function") {
    const slotIdx = node.inputs.indexOf(input);
    upstream = node.getInputNode(slotIdx);
  }
  if (!upstream && app.graph) {
    const link = app.graph.links?.[input.link] ?? (app.graph.links?.get ? app.graph.links.get(input.link) : null);
    if (link) {
      upstream = app.graph.getNodeById ? app.graph.getNodeById(link.origin_id) : null;
    }
  }
  if (!upstream) return null;

  const type = String(upstream.type || upstream.constructor?.name || "").toLowerCase();
  if (type.includes("reroute")) {
    return getUpstreamNode(upstream, upstream.inputs?.[0]?.name || "image", depth + 1);
  }
  return upstream;
}

function hookImageElement(node, img) {
  if (img && typeof img.addEventListener === "function" && (!img.complete || !img.naturalWidth)) {
    if (!img._dsOpHooked) {
      img._dsOpHooked = true;
      img.addEventListener("load", () => {
        node._dsRefreshPreview?.();
      }, { once: true });
    }
  }
}

function getOrCreateCachedImage(node, url) {
  if (!url) return null;
  if (!node._dsCachedImage || node._dsCachedImageUrl !== url) {
    const img = new Image();
    img.decoding = "async";
    node._dsCachedImageUrl = url;
    node._dsCachedImage = img;
    img.onload = () => {
      if (node._dsCachedImageUrl === url) {
        node._dsRefreshPreview?.();
      }
    };
    img.src = url;
  }
  if (node._dsCachedImage && isDrawable(node._dsCachedImage)) {
    return node._dsCachedImage;
  }
  return null;
}

function findImage(node) {
  try {
    const upstream = getUpstreamNode(node, "image");
    if (!upstream) return null;

    const unwrap = (value, depth = 0) => {
      if (!value || depth > 4) return null;
      hookImageElement(node, value);
      if (isDrawable(value)) return value;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = unwrap(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      if (typeof value !== "object") return null;
      for (const key of [
        "img", "image", "images", "imgs", "_dsLIPreview", "_dsILPreview",
        "previewImages", "preview_images", "preview", "previewImage",
        "_dsImage", "_dsPreviewImage", "cachedImage", "outputImages",
      ]) {
        if (key in value) {
          const found = unwrap(value[key], depth + 1);
          if (found) return found;
        }
      }
      return null;
    };

    const candidates = [
      upstream._dsLIPreview?.img,
      upstream._dsLIPreview,
      upstream._dsILPreview,
      upstream.imgs,
      upstream.images,
      upstream.image,
      upstream.img,
      upstream.previewImages,
      upstream.preview_images,
      upstream.preview,
      upstream.previewImage,
      upstream._dsImage,
      upstream._dsPreviewImage,
      upstream.properties?.image,
    ];
    for (const c of candidates) {
      const img = unwrap(c);
      if (img) return img;
    }

    const out = app.nodeOutputs?.[upstream.id];
    if (out?.images?.length) {
      const item = out.images[0];
      const params = new URLSearchParams({
        filename: item.filename,
        type: item.type || "temp",
        subfolder: item.subfolder || "",
      });
      const url = api.apiURL ? api.apiURL(`/view?${params.toString()}`) : `/view?${params.toString()}`;
      const img = getOrCreateCachedImage(node, url);
      if (img) return img;
    }

    const isImgFile = (v) => /\.(png|jpe?g|webp|bmp|tiff?|avif)$/i.test(String(v || "").trim());
    let fn = null;
    const imageWidget = upstream.widgets?.find((w) => w?.name === "image");
    if (imageWidget && typeof imageWidget.value === "string" && isImgFile(imageWidget.value)) {
      fn = imageWidget.value;
    } else {
      for (const w of upstream.widgets || []) {
        if (typeof w?.value === "string" && isImgFile(w.value)) {
          fn = w.value;
          break;
        }
      }
    }
    if (fn) {
      const clean = fn.replace(/\\/g, "/");
      const parts = clean.split("/");
      const filename = parts.pop() || "";
      const subfolder = parts.join("/");
      const params = new URLSearchParams({ filename, type: "input" });
      if (subfolder) params.set("subfolder", subfolder);
      const url = api.apiURL ? api.apiURL(`/view?${params.toString()}`) : `/view?${params.toString()}`;
      const img = getOrCreateCachedImage(node, url);
      if (img) return img;
    }
  } catch (e) {
    errorLog("image-lookup", e, { node: node?.id });
  }
  return null;
}

function drawResolutionHUD(node, ctx) {
  if (node.flags?.collapsed) return;
  const w = Number(node.size?.[0]) || DEFAULT_W;

  const leftClearance = 56;
  const rightClearance = 94;
  const availableW = w - leftClearance - rightClearance;
  if (availableW < 60) return;

  const boxW = Math.min(320, Math.max(130, availableW));
  const boxH = 46;
  const cx = leftClearance + availableW / 2;
  const cy = Math.round(NATIVE_LANE_H / 2);
  const x = Math.round(cx - boxW / 2);
  const y = Math.round(cy - boxH / 2);

  const img = node._dsImage || findImage(node);
  const iw = Number(img?.naturalWidth || img?.width || 0);
  const ih = Number(img?.naturalHeight || img?.height || 0);

  let inStr = "----×----";
  let outStr = "----×----";
  let isPadded = false;

  if (iw > 0 && ih > 0) {
    const dims = calculatePreview(node._dsState || {}, iw, ih);
    inStr = `${iw}×${ih}`;
    outStr = `${dims.totalW}×${dims.totalH}`;
    isPadded = dims.totalW > iw || dims.totalH > ih;
  }

  const getThemeVar = (name, fallback) => {
    try {
      const v = window.DSGlobalTheme?.getVar?.(name, "");
      if (v) return String(v).trim();
    } catch {}
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (v) return v;
    } catch {}
    return fallback;
  };

  const panelBg = getThemeVar("--ds-color-card", "#12151c");
  const textCol = getThemeVar("--ds-color-text", "#e5e7eb");
  const mutedCol = getThemeVar("--ds-color-muted-text", "#9ca3af");
  const borderCol = getThemeVar("--ds-color-card-border", "rgba(255, 255, 255, 0.12)");
  const accentCol = getThemeVar("--ds-color-accent", "#67e8f9");

  ctx.save();

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, boxW, boxH, 8);
  } else {
    ctx.rect(x, y, boxW, boxH);
  }
  ctx.fillStyle = panelBg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = borderCol;
  ctx.stroke();

  const colW = (boxW - 32) / 2;
  const inColX = x + 10 + colW / 2;
  const arrowX = cx;
  const outColX = x + boxW - 10 - colW / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const numFont = colW < 70 ? "bold 9.5px Inter, monospace, sans-serif" : "bold 11px Inter, monospace, sans-serif";

  ctx.font = "bold 8.5px Inter, system-ui, sans-serif";
  ctx.fillStyle = mutedCol;
  ctx.fillText("IN", inColX, y + 14);

  ctx.font = numFont;
  ctx.fillStyle = textCol;
  ctx.fillText(inStr, inColX, y + 31);

  ctx.font = "900 12px Inter, system-ui, sans-serif";
  ctx.fillStyle = accentCol;
  ctx.fillText("❯❯", arrowX, y + 23);

  ctx.font = "bold 8.5px Inter, system-ui, sans-serif";
  ctx.fillStyle = isPadded ? "#38ef7d" : mutedCol;
  ctx.fillText(isPadded ? "OUT ▲" : "OUT", outColX, y + 14);

  ctx.font = numFont;
  ctx.fillStyle = isPadded ? "#38ef7d" : textCol;
  ctx.fillText(outStr, outColX, y + 31);

  ctx.restore();
}

app.registerExtension({
  name: "DeathshotArsenal.DSOutpaint",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldSetSize = nodeType.prototype.setSize;
    const oldConnections = nodeType.prototype.onConnectionsChange;
    const oldSerialize = nodeType.prototype.onSerialize;
    const oldRemoved = nodeType.prototype.onRemoved;
    const oldDraw = nodeType.prototype.onDrawForeground;
    const oldMenu = nodeType.prototype.getExtraMenuOptions;

    function removeHiddenSockets(node) {
      if (!Array.isArray(node?.inputs)) return;
      for (let i = node.inputs.length - 1; i >= 0; i--) {
        const inp = node.inputs[i];
        if (inp?.name !== "image") {
          try {
            if (inp.link != null && node.graph) {
              node.graph.removeLink(inp.link);
            }
            node.removeInput(i);
          } catch (_) {}
        }
      }
    }

    const oldAddInput = nodeType.prototype.addInput;
    nodeType.prototype.addInput = function (name, type, extra_info) {
      if (name !== "image") return null;
      return oldAddInput.apply(this, arguments);
    };

    nodeType.prototype.computeSize = function (out) {
      const minH = getMinHeight(this);
      const result = [MIN_W, minH];
      if (Array.isArray(out)) {
        out[0] = result[0];
        out[1] = result[1];
        return out;
      }
      return result;
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated?.apply(this, arguments);
      try {
        removeHiddenSockets(this);
        this.resizable = true;
        this.properties ||= {};
        this._dsState = loadState(this);

        const targetW = Math.max(MIN_W, Number(this._dsState.saved_width) || DEFAULT_W);
        const targetH = Math.max(getMinHeight(this), Number(this._dsState.expanded_height) || (this._dsState.collapsed ? MIN_COLLAPSED_H : DEFAULT_EXPANDED_H));
        this.size = [targetW, targetH];
        this._dsImage = null;
        syncHiddenWidgets(this);

        const card = Card({ className: "ds-op-card" });

        // Header: [ Collapse ] [ To ratio ] [ By side ] [ ColorPicker Trigger ]
        const header = document.createElement("div");
        header.className = "ds-op-header";
        const collapse = btn(this._dsState.collapsed ? "▲" : "▼", "ds-op-collapse");
        collapse.title = "Collapse / Expand Controls";
        const toRatio = btn("To ratio", "ds-op-tab", this._dsState.mode === "To ratio");
        const bySide = btn("By side", "ds-op-tab", this._dsState.mode === "By side");

        // ColorPicker directly anchored inside header for exact positioning next to node
        const colorPicker = ColorPicker({
          node: this,
          className: "ds-op-color-picker",
          value: this._dsState.fill_color,
          onChange: (hex) => {
            this._dsBeginChange();
            this._dsState.fill_color = String(hex).toLowerCase();
            this._dsCommit();
          },
        });
        this._dsColorPicker = colorPicker;

        this._toggleOutpaintGearPopover = () => openSettings(this);
        this._openOutpaintGearPopover = () => openSettings(this);

        header.append(collapse, toRatio, bySide, colorPicker.root);

        const summary = document.createElement("div");
        summary.className = "ds-op-summary";

        const body = document.createElement("div");
        body.className = "ds-op-controls";
        const ratios = document.createElement("div");
        ratios.className = "ds-op-grid ds-op-ratios";
        const directions = document.createElement("div");
        directions.className = "ds-op-grid ds-op-directions";
        const sides = document.createElement("div");
        sides.className = "ds-op-grid ds-op-sides";
        const snap = document.createElement("div");
        snap.className = "ds-op-grid ds-op-snap";
        const mp = document.createElement("div");
        mp.className = "ds-op-grid ds-op-mp";
        body.append(ratios, directions, sides, snap, mp);

        const preview = document.createElement("div");
        preview.className = "ds-op-preview";

        card.append(header, summary, body, preview);

        this._dsCard = card;
        this._dsRefs = {
          header,
          collapse,
          toRatio,
          bySide,
          colorPicker,
          summary,
          body,
          ratios,
          directions,
          sides,
          snap,
          mp,
          preview,
        };

        this._dsPreview = createPreview(preview, () => this._dsState);
        this._dsPreview.mount();

        const minWidgetH = () => (this._dsState?.collapsed ? 140 : 240);
        const getWidgetHeight = () => {
          const widgetY = Number(domWidget?.y ?? this._getWidgetY?.() ?? NATIVE_LANE_H);
          const nodeHeight = Number(this.size?.[1] ?? (this._dsState?.collapsed ? MIN_COLLAPSED_H : DEFAULT_EXPANDED_H));
          return Math.max(minWidgetH(), nodeHeight - widgetY - CARD_MARGIN);
        };
        this._dsGetWidgetHeight = getWidgetHeight;

        const domWidget = this.addDOMWidget("ds_outpaint_ui", "custom", card.root, {
          serialize: false,
          margin: CARD_MARGIN,
          getMinHeight: minWidgetH,
          getHeight: getWidgetHeight,
        });
        this._dsDOMWidget = domWidget;

        domWidget.computeSize = (width) => [width || this.size?.[0] || DEFAULT_W, getWidgetHeight()];

        this._dsSyncLayout = () => {
          if (!this.size) return;
          const targetH = getWidgetHeight();
          if (domWidget) {
            domWidget.computedHeight = targetH;
          }
          if (card.root) {
            card.root.style.height = "100%";
          }
          if (card.root?.parentElement) {
            card.root.parentElement.style.height = `${targetH}px`;
          }
        };

        normalizeDSWidgetHost(card.root, this, { shell: false });
        protectDSResizeCorners(this);
        registerOutpaintGearMenu();

        const refresh = () => {
          this._dsImage = findImage(this);
          const directionChanged = normalizeDirection(this);
          if (directionChanged) persist(this);
          this._dsPreview?.setState(this._dsState, this._dsImage);
          this._dsUpdateUI?.();
          this._dsSyncLayout?.();
          this.setDirtyCanvas?.(true, true);
        };
        this._dsRefreshPreview = refresh;

        this._dsBeginChange = () => beginHistory(this);
        this._dsCommit = () => {
          try {
            persist(this);
            syncHiddenWidgets(this);
            this._dsUpdateUI?.();
            this._dsSyncLayout?.();
            refresh();
            this.setDirtyCanvas?.(true, true);
          } catch (e) {
            errorLog("commit", e, { node: this.id });
          } finally {
            endHistory(this);
          }
        };

        // Collapse toggles ONLY the middle controls block; node dimensions are never shrunk below preview
        collapse.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dsBeginChange();
          this._dsState.collapsed = !this._dsState.collapsed;
          if (!this._dsState.collapsed && Array.isArray(this.size) && this.size[1] < MIN_EXPANDED_H) {
            this.size[1] = MIN_EXPANDED_H;
            this._dsState.expanded_height = MIN_EXPANDED_H;
          }
          this._dsCommit();
          this.setDirtyCanvas?.(true, true);
        });

        toRatio.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dsBeginChange();
          this._dsState.mode = "To ratio";
          this._dsState.direction = "Both";
          this._dsCommit();
        });

        bySide.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dsBeginChange();
          this._dsState.mode = "By side";
          this._dsCommit();
        });

        const rebuildGrid = (container, items, active, handler, cls) => {
          container.className = `ds-op-grid ${cls}`;
          container.replaceChildren();
          for (const item of items) {
            const b = btn(item, "", String(item) === String(active));
            b.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              this._dsBeginChange?.();
              handler(item);
            });
            container.appendChild(b);
          }
        };

        this._dsUpdateUI = () => {
          const s = this._dsState;
          const r = this._dsRefs;
          if (!r) return;

          r.collapse.textContent = s.collapsed ? "▲" : "▼";
          r.toRatio.classList.toggle("is-active", s.mode === "To ratio");
          r.bySide.classList.toggle("is-active", s.mode === "By side");
          this._dsColorPicker?.setValue?.(s.fill_color, false);

          const snapSummary = btn("", "ds-op-summary-item", s.snap_enabled);
          snapSummary.style.display = "inline-flex";
          snapSummary.style.alignItems = "center";
          snapSummary.style.justifyContent = "center";
          snapSummary.style.gap = "2px";
          snapSummary.append(DSIcon("magnet", { size: 12 }), document.createTextNode(s.snap_enabled ? ` ${s.snap_multiple}` : " Off"));

          r.summary.replaceChildren(
            btn(`${s.ratio}`, "ds-op-summary-item", true),
            btn(s.direction || "Both", "ds-op-summary-item", true),
            snapSummary,
            btn(Number(s.target_mp) > 0 ? `${s.target_mp}MP` : "MP:Off", "ds-op-summary-item", Number(s.target_mp) > 0)
          );
          r.summary.children[0].onclick = () => openSettings(this);
          r.summary.children[1].onclick = () => openSettings(this);
          r.summary.children[2].onclick = () => {
            s.snap_enabled = !s.snap_enabled;
            this._dsCommit();
          };
          r.summary.children[3].onclick = () => openSettings(this);

          // Controls collapse into summary row; preview remains 100% visible and expands
          r.summary.style.display = s.collapsed ? "grid" : "none";
          r.body.style.display = s.collapsed ? "none" : "flex";
          r.preview.style.display = "block";

          rebuildGrid(
            r.ratios,
            s.custom_ratios,
            s.ratio,
            (v) => {
              s.ratio = v;
              s.direction = "Both";
              this._dsCommit();
            },
            "ds-op-ratios"
          );
          r.ratios.style.display = s.mode === "To ratio" ? "grid" : "none";

          rebuildGrid(
            r.directions,
            directionLabels(s, this),
            s.direction,
            (v) => {
              s.direction = v;
              this._dsCommit();
            },
            "ds-op-directions"
          );
          r.directions.style.display = s.mode === "To ratio" ? "grid" : "none";

          r.sides.className = "ds-op-grid ds-op-sides";
          r.sides.replaceChildren();
          for (const [key, label] of [
            ["pad_left", "L"],
            ["pad_top", "T"],
            ["pad_right", "R"],
            ["pad_bottom", "B"],
          ]) {
            const wrap = document.createElement("label");
            wrap.className = "ds-op-side-field";
            const title = document.createElement("span");
            title.textContent = label;
            const input = document.createElement("input");
            input.type = "number";
            input.className = "ds-op-number";
            input.value = String(s[key]);
            input.min = "0";
            input.max = "16384";
            input.step = "1";
            input.addEventListener("pointerdown", (e) => e.stopPropagation());
            input.addEventListener("change", () => {
              this._dsBeginChange();
              s[key] = Math.max(0, Math.min(16384, Math.round(Number(input.value) || 0)));
              this._dsCommit();
            });
            wrap.append(title, input);
            r.sides.appendChild(wrap);
          }
          const reset = btn("↺", "ds-op-reset");
          reset.title = "Reset Pads";
          reset.onclick = () => {
            this._dsBeginChange();
            for (const k of ["pad_left", "pad_top", "pad_right", "pad_bottom"]) s[k] = 0;
            this._dsCommit();
          };
          r.sides.appendChild(reset);
          r.sides.style.display = s.mode === "By side" ? "grid" : "none";

          // Snap row with magnet icon toggle
          r.snap.replaceChildren();
          r.snap.classList.toggle("is-muted", !s.snap_enabled);
          const snapToggle = document.createElement("button");
          snapToggle.type = "button";
          snapToggle.className = `ds-ui-btn ds-ui-btn-compact ds-op-snap-toggle${s.snap_enabled ? " is-active" : ""}`;
          snapToggle.title = s.snap_enabled ? "Snap: ON" : "Snap: OFF";
          snapToggle.appendChild(DSIcon("magnet", { size: 14 }));
          snapToggle.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._dsBeginChange?.();
            s.snap_enabled = !s.snap_enabled;
            this._dsCommit();
          });
          r.snap.appendChild(snapToggle);

          for (const val of SNAP_VALUES) {
            const b = btn(String(val), "", s.snap_enabled && Number(s.snap_multiple) === Number(val));
            if (!s.snap_enabled) {
              b.style.opacity = "0.35";
              b.style.pointerEvents = "none";
              b.style.filter = "grayscale(1)";
            }
            b.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              this._dsBeginChange?.();
              s.snap_multiple = Number(val);
              this._dsCommit();
            });
            r.snap.appendChild(b);
          }

          rebuildGrid(
            r.mp,
            s.custom_mp.map((v) => (Number(v) === 0 ? "Off" : `${v} MP`)),
            Number(s.target_mp) === 0 ? "Off" : `${s.target_mp} MP`,
            (v) => {
              s.target_mp = v === "Off" ? 0 : Number(String(v).replace(/\s*MP$/i, ""));
              this._dsCommit();
            },
            "ds-op-mp"
          );
        };

        this._dsUpdateUI();
        refresh();
      } catch (e) {
        errorLog("node-created", e, { node: this.id });
      }
      return result;
    };

    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      const minH = getMinHeight(this);
      const targetW = size ? size[0] : this.size?.[0];
      const targetH = size ? size[1] : this.size?.[1];
      const w = Math.max(MIN_W, Math.round(Number(targetW) || MIN_W));
      const h = Math.max(minH, Math.round(Number(targetH) || minH));
      if (size) {
        size[0] = w;
        size[1] = h;
      }
      if (this.size) {
        this.size[0] = w;
        this.size[1] = h;
      }
      const result = oldResize?.apply(this, arguments);
      try {
        if (this._dsState) {
          this._dsState.saved_width = w;
          this._dsState.expanded_height = h;
          persist(this);
        }
        this._dsSyncLayout?.();
        this._dsPreview?.setState?.(this._dsState, this._dsImage);
        this.setDirtyCanvas?.(true, true);
      } catch (e) {
        errorLog("resize", e, { node: this.id });
      }
      return result;
    };

    nodeType.prototype.setSize = function (size) {
      if (!size) return;
      const minH = getMinHeight(this);
      const w = Math.max(MIN_W, Math.round(Number(size[0]) || MIN_W));
      const h = Math.max(minH, Math.round(Number(size[1]) || minH));
      this.size = [w, h];
      const result = oldSetSize ? oldSetSize.apply(this, [[w, h]]) : undefined;
      if (this.size) {
        this.size[0] = w;
        this.size[1] = h;
      }
      if (this._dsState) {
        this._dsState.saved_width = w;
        this._dsState.expanded_height = h;
        persist(this);
      }
      this._dsSyncLayout?.();
      this._dsPreview?.setState?.(this._dsState, this._dsImage);
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.onConfigure = function (info) {
      const result = oldConfigure?.apply(this, arguments);
      try {
        removeHiddenSockets(this);
        this.properties ||= {};
        if (info?.properties?.[UI_KEY]) {
          this.properties[UI_KEY] = { ...(this.properties[UI_KEY] || {}), ...info.properties[UI_KEY] };
        }
        this._dsState = loadState(this);
        syncHiddenWidgets(this);

        const minH = getMinHeight(this);
        const rawW = info?.size?.[0] ?? this.properties?.[UI_KEY]?.saved_width ?? this._dsState?.saved_width ?? this.size?.[0];
        const rawH = info?.size?.[1] ?? this.properties?.[UI_KEY]?.expanded_height ?? this._dsState?.expanded_height ?? this.size?.[1];

        const loadedW = Math.max(MIN_W, Math.round(Number(rawW) || DEFAULT_W));
        const loadedH = Math.max(minH, Math.round(Number(rawH) || (this._dsState?.collapsed ? MIN_COLLAPSED_H : DEFAULT_EXPANDED_H)));

        this.size = [loadedW, loadedH];
        this._dsState.saved_width = loadedW;
        this._dsState.expanded_height = loadedH;
        persist(this);

        this._dsUpdateUI?.();
        this._dsSyncLayout?.();
        this._dsRefreshPreview?.();
        this.setDirtyCanvas?.(true, true);

        setTimeout(() => {
          this.size = [loadedW, loadedH];
          this._dsSyncLayout?.();
          this._dsPreview?.setState?.(this._dsState, this._dsImage);
          this._dsRefreshPreview?.();
          this.setDirtyCanvas?.(true, true);
        }, 50);
        setTimeout(() => {
          this.size = [loadedW, loadedH];
          this._dsSyncLayout?.();
          this.setDirtyCanvas?.(true, true);
        }, 200);
      } catch (e) {
        errorLog("configure", e, { node: this.id });
      }
      return result;
    };

    const oldExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function () {
      const result = oldExecuted?.apply(this, arguments);
      this._dsRefreshPreview?.();
      return result;
    };

    nodeType.prototype.onConnectionsChange = function () {
      const result = oldConnections?.apply(this, arguments);
      try {
        this._dsRefreshPreview?.();
      } catch (e) {
        errorLog("connections", e, { node: this.id });
      }
      return result;
    };

    nodeType.prototype.onSerialize = function (o) {
      try {
        if (Array.isArray(this.size) && this._dsState) {
          this._dsState.saved_width = Math.round(this.size[0]);
          this._dsState.expanded_height = Math.round(this.size[1]);
        }
        persist(this);
        syncHiddenWidgets(this);
        if (o) {
          if (Array.isArray(this.size)) {
            o.size = [Math.round(this.size[0]), Math.round(this.size[1])];
          }
          o.properties = o.properties || {};
          o.properties[UI_KEY] = clone(this._dsState);
        }
      } catch (e) {
        errorLog("serialize", e, { node: this.id });
      }
      return oldSerialize?.apply(this, arguments);
    };

    nodeType.prototype.onDrawForeground = function (ctx) {
      const result = oldDraw?.apply(this, arguments);
      try {
        const currentImg = findImage(this);
        const prevImg = this._dsImage;
        const currentW = Number(currentImg?.naturalWidth || currentImg?.width || 0);
        const currentH = Number(currentImg?.naturalHeight || currentImg?.height || 0);
        const prevW = Number(prevImg?.naturalWidth || prevImg?.width || 0);
        const prevH = Number(prevImg?.naturalHeight || prevImg?.height || 0);

        if (currentImg !== prevImg || currentW !== prevW || currentH !== prevH) {
          this._dsImage = currentImg;
          const directionChanged = normalizeDirection(this);
          if (directionChanged) persist(this);
          this._dsPreview?.setState?.(this._dsState, this._dsImage);
          this._dsUpdateUI?.();
        }

        drawResolutionHUD(this, ctx);
      } catch (e) {
        errorLog("draw", e, { node: this.id });
      }
      return result;
    };

    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      oldMenu?.apply(this, arguments);
      options.push({
        content: "⚙ Outpaint Settings",
        callback: () => openSettings(this),
      });
      options.push({
        content: this._dsState?.collapsed ? "Expand Controls" : "Collapse Controls",
        callback: () => {
          this._dsState ||= loadState(this);
          beginHistory(this);
          this._dsState.collapsed = !this._dsState.collapsed;
          this._dsCommit?.();
        },
      });
    };

    nodeType.prototype.onRemoved = function () {
      try { this._dsColorPicker?.destroy?.(); } catch (_) {}
      try { this._dsPreview?.destroy?.(); } catch (_) {}
      try { this._dsCard?.destroy?.(); } catch (_) {}
      return oldRemoved?.apply(this, arguments);
    };
  },
});

api.addEventListener("executed", () => {
  for (const node of app.graph?._nodes || app.graph?.nodes || []) {
    if (node?.type === TYPE) {
      node._dsRefreshPreview?.();
    }
  }
});

api.addEventListener("execution_success", () => {
  for (const node of app.graph?._nodes || app.graph?.nodes || []) {
    if (node?.type === TYPE) {
      node._dsRefreshPreview?.();
    }
  }
});