/**
 * DS Interpolation - Custom Deathshot Arsenal Node UI
 * Deathshot Arsenal / DS Node Pack
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  installDSUI,
  Card,
  Field,
  Dropdown,
  Stepper,
  Toggle,
  StatusBar,
  DSIcon,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
} from "../UIElements/index.js";

const TYPE = "DS_Interpolation";
const EXT = "DeathshotArsenal.DSInterpolation";
const PROP = "ds_interpolation_state";

const DEFAULT_W = 320;
const MIN_W = 260;
const CARD_MARGIN = 5;

const COLLAPSED_CARD_H = 119;
const EXPANDED_CARD_H = 358;

const MODEL_OPTIONS = [
  "sudo_rife4_269.662_testV1_scale1.pth",
  "rife47.pth",
  "rife49.pth",
  "rife417.pth",
  "rife426.pth",
];

const MOTION_SCALE_OPTIONS = [
  { id: "0.25", label: "0.25x (Fast)" },
  { id: "0.5",  label: "0.5x (Action)" },
  { id: "1x",   label: "1x (Normal)" },
  { id: "2",    label: "2x (Slow)" },
  { id: "4",    label: "4x (Micro)" },
];

const DTYPE_OPTIONS = [
  { id: "float32", label: "float32" },
  { id: "float16", label: "float16" },
  { id: "bfloat16", label: "bfloat16" },
];

const CSS_ID = "ds-interpolation-ui-css";
const CSS_URL = new URL("./ds_interpolation.css", import.meta.url).href;

function loadCSS() {
  const existing = document.getElementById(CSS_ID);
  if (existing) {
    existing.href = CSS_URL + "?t=" + Date.now();
    return;
  }
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = CSS_URL + "?t=" + Date.now();
  document.head.appendChild(link);
}

let _modelsStatusCache = null;

async function fetchModelsStatus() {
  try {
    const res = await api.fetchApi("/ds/interpolation/models");
    if (res.ok) {
      const data = await res.json();
      if (data?.models) {
        _modelsStatusCache = {};
        for (const m of data.models) {
          _modelsStatusCache[m.name] = Boolean(m.installed);
        }
      }
    }
  } catch (_) {}
}

function getDefaultState() {
  return {
    ckpt_name: "rife49.pth",
    collapsed: false,
    clear_cache_after_n_frames: 10,
    mode: "Target FPS",
    multiplier: 2,
    target_fps: 60,
    source_fps: 24,
    fast_mode: true,
    ensemble: true,
    scale_factor: "1x",
    dtype: "float32",
    torch_compile: false,
    batch_size: 1,
    node_size: null,
  };
}

function getState(node) {
  if (!node._dsInterpState) {
    let s = null;
    try {
      const raw = node.properties?.[PROP];
      if (raw) s = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) {}

    const def = getDefaultState();
    const merged = Object.assign(def, s || {});
    if (node.properties) {
      for (const k of Object.keys(def)) {
        if (node.properties[k] !== undefined && (s === null || s[k] === undefined)) {
          merged[k] = node.properties[k];
        }
      }
    }

    let userCollapsedPref = null;
    if (node.id != null) {
      try {
        const c = localStorage.getItem(`DS_INTERPOLATION_COLLAPSED_${node.id}`);
        if (c !== null) userCollapsedPref = (c === "1");
      } catch {}
    }
    if (userCollapsedPref === null) {
      try {
        const g = localStorage.getItem("DS_INTERPOLATION_GLOBAL_COLLAPSED");
        if (g !== null) userCollapsedPref = (g === "1");
      } catch {}
    }
    if (userCollapsedPref !== null) {
      merged.collapsed = userCollapsedPref;
    }

    node._dsInterpState = merged;
  }
  return node._dsInterpState;
}

function persistState(node) {
  const s = getState(node);
  if (!node.properties) node.properties = {};

  if (Array.isArray(node.size) && node.size[0] >= MIN_W && node.size[1] > 0) {
    s.node_size = [node.size[0], node.size[1]];
    node.properties.ds_interp_size = [node.size[0], node.size[1]];
  }

  node.properties[PROP] = JSON.stringify(s);

  for (const [k, v] of Object.entries(s)) {
    node.properties[k] = v;
  }

  if (node.widgets) {
    for (const w of node.widgets) {
      if (!w || !w.name) continue;
      if (w.name in s) {
        w.value = s[w.name];
      }
      if (w.name === "ds_interpolation_state") {
        w.value = node.properties[PROP];
      }
    }
  }
}

function hideWidgets(node) {
  if (!node.widgets) return;
  for (const w of node.widgets) {
    if (w?.name === "ds_interpolation_ui") continue;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    w.computedHeight = 0;
    if (w.element) w.element.style.display = "none";
  }
}

function bodyTop(node) {
  try {
    const measured = node?._measureSlots?.();
    if (measured && Array.isArray(measured) && measured.length >= 4) {
      const bottom = Math.ceil(measured[1] + measured[3] - Number(node.pos?.[1] ?? 0));
      if (bottom > 0) return bottom;
    }
  } catch (_) {}

  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const titleH = globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  const inputs = (node.inputs ?? []).filter((i) => !i.widget).length;
  const outputs = (node.outputs ?? []).length;
  const rows = Math.max(inputs, outputs);
  const startY = Number(node.constructor?.slot_start_y) || titleH;
  return rows ? rows * slotH + startY : 0;
}

class DSInterpolationController {
  constructor(node) {
    this.node = node;
    this.buildDOM();
    this.bindEvents();
    this.syncState();
  }

  getFormattedModelOptions() {
    return MODEL_OPTIONS.map((name) => {
      const isInstalled = _modelsStatusCache ? Boolean(_modelsStatusCache[name]) : (name === "rife49.pth");
      const shortName = name.replace(".pth", "");
      const label = isInstalled ? `${shortName} (✓)` : `${shortName} (↓)`;
      return { id: name, label, installed: isInstalled };
    });
  }

  buildDOM() {
    this.card = Card({ className: "ds-interp-card" });

    // 1. Status Bar on Top
    this.statusBar = StatusBar({
      state: "idle",
      text: "Ready",
    });

    // 2. Checkpoint Model Selection
    this.ckptDropdown = Dropdown({
      options: this.getFormattedModelOptions(),
      value: getState(this.node).ckpt_name || "rife49.pth",
      compact: true,
      onChange: (val) => {
        const s = getState(this.node);
        s.ckpt_name = val;
        persistState(this.node);
        this.handleModelSelect(val);
      },
    });

    this.ckptField = Field({
      label: "Checkpoint Model",
      control: this.ckptDropdown.root,
    });

    // 3. Collapsible Options Section
    this.collapseSection = document.createElement("div");
    this.collapseSection.className = "ds-interp-collapse-section";

    this.collapseHeader = document.createElement("button");
    this.collapseHeader.type = "button";
    this.collapseHeader.className = "ds-interp-collapse-header";
    this.collapseHeader.title = "Toggle Interpolation Options";

    this.collapseLeft = document.createElement("div");
    this.collapseLeft.className = "ds-interp-collapse-left";

    this.collapseIcon = document.createElement("span");
    this.collapseIcon.className = "ds-interp-collapse-icon";
    this.collapseIcon.appendChild(DSIcon("chevron-right", { size: 11 }));

    this.collapseTitle = document.createElement("span");
    this.collapseTitle.textContent = "Interpolation Options";

    this.collapseLeft.append(this.collapseIcon, this.collapseTitle);

    this.collapseBadge = document.createElement("span");
    this.collapseBadge.className = "ds-interp-collapse-badge";
    this.collapseBadge.textContent = "60 FPS";

    this.collapseHeader.append(this.collapseLeft, this.collapseBadge);
    this.collapseSection.appendChild(this.collapseHeader);

    // Options Panel
    this.optionsPanel = document.createElement("div");
    this.optionsPanel.className = "ds-interp-options-panel is-collapsed";
    this.collapseSection.appendChild(this.optionsPanel);

    // Mode Row (Segmented Buttons)
    this.modeRow = document.createElement("div");
    this.modeRow.className = "ds-interp-mode-row";

    this.btnModeTargetFps = document.createElement("button");
    this.btnModeTargetFps.type = "button";
    this.btnModeTargetFps.className = "ds-interp-mode-btn is-active";
    this.btnModeTargetFps.textContent = "Target FPS";

    this.btnModeMultiplier = document.createElement("button");
    this.btnModeMultiplier.type = "button";
    this.btnModeMultiplier.className = "ds-interp-mode-btn";
    this.btnModeMultiplier.textContent = "Multiplier";

    this.modeRow.append(this.btnModeTargetFps, this.btnModeMultiplier);

    // Live Timing Badge
    this.timingBadge = document.createElement("div");
    this.timingBadge.className = "ds-interp-timing-badge";

    this.timingText = document.createElement("span");
    this.timingText.className = "ds-interp-timing-text";
    this.timingText.textContent = "24 fps ➔ 60 fps (duration preserved)";

    this.timingChip = document.createElement("span");
    this.timingChip.className = "ds-interp-timing-chip";
    this.timingChip.textContent = "2.5x sync";

    this.timingBadge.append(this.timingText, this.timingChip);

    // 2-Column Controls Grid
    this.grid = document.createElement("div");
    this.grid.className = "ds-interp-grid";

    // Primary Rate Stepper
    this.stepperPrimary = Stepper({
      min: 1,
      max: 240,
      step: 1,
      value: getState(this.node).target_fps || 60,
      onChange: (val) => {
        const s = getState(this.node);
        if (s.mode === "Multiplier") {
          s.multiplier = Math.max(1, Math.min(100, Math.round(val)));
        } else {
          s.target_fps = Math.max(1, Math.min(240, Math.round(val)));
        }
        persistState(this.node);
        this.updateTimingBadge();
      },
    });
    this.fieldPrimary = Field({
      label: "Target FPS",
      control: this.stepperPrimary.root,
    });

    // Source FPS Stepper
    this.stepperSourceFps = Stepper({
      min: 1,
      max: 240,
      step: 1,
      value: getState(this.node).source_fps || 24,
      onChange: (val) => {
        const s = getState(this.node);
        s.source_fps = Math.max(1, Math.min(240, Math.round(val)));
        persistState(this.node);
        this.updateTimingBadge();
      },
    });
    this.fieldSourceFps = Field({
      label: "Source FPS",
      control: this.stepperSourceFps.root,
    });

    // Cache After Frames Stepper
    this.stepperClearCache = Stepper({
      min: 1,
      max: 10000,
      step: 1,
      value: getState(this.node).clear_cache_after_n_frames || 10,
      onChange: (val) => {
        const s = getState(this.node);
        s.clear_cache_after_n_frames = Math.max(1, Math.round(val));
        persistState(this.node);
      },
    });
    this.fieldClearCache = Field({
      label: "Cache Clear",
      control: this.stepperClearCache.root,
    });

    // Batch Size Stepper
    this.stepperBatchSize = Stepper({
      min: 1,
      max: 64,
      step: 1,
      value: getState(this.node).batch_size || 1,
      onChange: (val) => {
        const s = getState(this.node);
        s.batch_size = Math.max(1, Math.min(64, Math.round(val)));
        persistState(this.node);
      },
    });
    this.fieldBatchSize = Field({
      label: "Batch Size",
      control: this.stepperBatchSize.root,
    });

    // Fast Mode Toggle
    this.toggleFastMode = Toggle({
      label: "Fast Mode",
      checked: Boolean(getState(this.node).fast_mode),
      onChange: (checked) => {
        const s = getState(this.node);
        s.fast_mode = checked;
        persistState(this.node);
      },
    });

    // Ensemble Toggle
    this.toggleEnsemble = Toggle({
      label: "Ensemble",
      checked: Boolean(getState(this.node).ensemble),
      onChange: (checked) => {
        const s = getState(this.node);
        s.ensemble = checked;
        persistState(this.node);
      },
    });

    // Motion Scale Dropdown
    this.dropdownScale = Dropdown({
      options: MOTION_SCALE_OPTIONS,
      value: getState(this.node).scale_factor || "1x",
      compact: true,
      onChange: (val) => {
        const s = getState(this.node);
        s.scale_factor = val;
        persistState(this.node);
      },
    });
    this.fieldScale = Field({
      label: "Motion Scale",
      control: this.dropdownScale.root,
    });

    // Dtype Dropdown
    this.dropdownDtype = Dropdown({
      options: DTYPE_OPTIONS,
      value: getState(this.node).dtype || "float32",
      compact: true,
      onChange: (val) => {
        const s = getState(this.node);
        s.dtype = val;
        persistState(this.node);
      },
    });
    this.fieldDtype = Field({
      label: "Precision (Dtype)",
      control: this.dropdownDtype.root,
    });

    // Torch Compile Toggle
    this.toggleTorchCompile = Toggle({
      label: "Torch Compile",
      checked: Boolean(getState(this.node).torch_compile),
      className: "ds-interp-grid-full",
      onChange: (checked) => {
        const s = getState(this.node);
        s.torch_compile = checked;
        persistState(this.node);
      },
    });

    this.grid.append(
      this.fieldPrimary.root,
      this.fieldSourceFps.root,
      this.fieldClearCache.root,
      this.fieldBatchSize.root,
      this.toggleFastMode.root,
      this.toggleEnsemble.root,
      this.fieldScale.root,
      this.fieldDtype.root,
      this.toggleTorchCompile.root
    );

    this.optionsPanel.append(this.modeRow, this.timingBadge, this.grid);

    // Assemble Card in exact requested order: Status Bar -> Model -> Collapsible Menu
    this.card.append(
      this.statusBar.root,
      this.ckptField.root,
      this.collapseSection
    );
  }

  bindEvents() {
    this.btnModeTargetFps.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode("Target FPS");
    });

    this.btnModeMultiplier.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode("Multiplier");
    });

    this.collapseHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = getState(this.node);
      s.collapsed = !s.collapsed;
      if (this.node?.id != null) {
        try {
          localStorage.setItem(`DS_INTERPOLATION_COLLAPSED_${this.node.id}`, s.collapsed ? "1" : "0");
        } catch {}
      }
      try {
        localStorage.setItem("DS_INTERPOLATION_GLOBAL_COLLAPSED", s.collapsed ? "1" : "0");
      } catch {}
      persistState(this.node);
      this.renderCollapse();
    });
  }

  async handleModelSelect(modelName) {
    const isInstalled = _modelsStatusCache ? Boolean(_modelsStatusCache[modelName]) : false;
    if (!isInstalled) {
      this.statusBar.setStatus(`Downloading ${modelName}...`, "running");
      try {
        const res = await api.fetchApi("/ds/interpolation/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ckpt_name: modelName }),
        });
        if (res.ok) {
          if (_modelsStatusCache) _modelsStatusCache[modelName] = true;
          this.ckptDropdown.setOptions(this.getFormattedModelOptions(), true);
          this.statusBar.setStatus(`Model ready`, "success");
          setTimeout(() => this.statusBar.reset("Ready"), 3000);
        } else {
          this.statusBar.setStatus("Download failed", "error");
        }
      } catch (_) {
        this.statusBar.setStatus("Download error", "error");
      }
    } else {
      this.statusBar.setStatus(`Model: ${modelName}`, "idle");
    }
  }

  setMode(mode) {
    const s = getState(this.node);
    s.mode = mode;
    persistState(this.node);
    this.syncModeState();
    this.fitNodeToContent();
  }

  syncModeState() {
    const s = getState(this.node);
    const isTargetFps = (s.mode !== "Multiplier");

    this.btnModeTargetFps.classList.toggle("is-active", isTargetFps);
    this.btnModeMultiplier.classList.toggle("is-active", !isTargetFps);

    if (isTargetFps) {
      this.fieldPrimary.setLabel("Target FPS");
      this.stepperPrimary.setValue(s.target_fps || 60, false);
    } else {
      this.fieldPrimary.setLabel("Multiplier");
      this.stepperPrimary.setValue(s.multiplier || 2, false);
    }

    this.updateTimingBadge();
  }

  updateTimingBadge() {
    const s = getState(this.node);
    const src = Number(s.source_fps) || 24;

    if (s.mode === "Multiplier") {
      const mult = Number(s.multiplier) || 2;
      const outFps = Math.round(src * mult * 100) / 100;
      this.timingText.textContent = `${src} fps ➔ ${outFps} fps (duration preserved)`;
      this.timingChip.textContent = `${mult}x sync`;
      this.collapseBadge.textContent = `${mult}X (${outFps} FPS)`;
    } else {
      const tgt = Number(s.target_fps) || 60;
      const ratio = (tgt / src).toFixed(2);
      this.timingText.textContent = `${src} fps ➔ ${tgt} fps (duration preserved)`;
      this.timingChip.textContent = `${ratio}x sync`;
      this.collapseBadge.textContent = `${tgt} FPS`;
    }
  }

  minCardHeight() {
    const s = getState(this.node);
    const isCollapsed = Boolean(s.collapsed);

    const pad = 20; // 10px top + 10px bottom
    const gaps = 12; // 6px gap * 2
    const statusH = 22;
    const ckptH = 39;

    let collapseH = 26; // collapse header height
    if (!isCollapsed) {
      let panelH = 0;
      if (this.optionsPanel && this.optionsPanel.offsetHeight > 0) {
        panelH = this.optionsPanel.offsetHeight;
      } else {
        panelH = EXPANDED_CARD_H - (pad + statusH + ckptH + 26 + gaps);
      }
      collapseH += panelH;
    }

    return pad + statusH + ckptH + collapseH + gaps;
  }

  relayout({ shrink = false } = {}) {
    if (!this.node) return;
    hideWidgets(this.node);
    const min = this.node.computeSize();
    this.node.setSize([
      Math.max(this.node.size[0], min[0]),
      shrink ? min[1] : Math.max(this.node.size[1], min[1]),
    ]);
    const s = getState(this.node);
    s.node_size = [this.node.size[0], this.node.size[1]];
    persistState(this.node);
    this.node.setDirtyCanvas?.(true, true);
  }

  fitNodeToContent(shrink = false) {
    this.relayout({ shrink });
  }

  renderCollapse() {
    const s = getState(this.node);
    const isCollapsed = Boolean(s.collapsed);
    this.collapseHeader.classList.toggle("is-open", !isCollapsed);
    this.optionsPanel.classList.toggle("is-collapsed", isCollapsed);
    this.relayout({ shrink: isCollapsed });
    requestAnimationFrame(() => this.relayout({ shrink: isCollapsed }));
    setTimeout(() => this.relayout({ shrink: isCollapsed }), 50);
  }

  syncState() {
    const s = getState(this.node);

    this.ckptDropdown.setValue(s.ckpt_name || "rife49.pth", false);
    this.stepperSourceFps.setValue(s.source_fps || 24, false);
    this.stepperClearCache.setValue(s.clear_cache_after_n_frames || 10, false);
    this.stepperBatchSize.setValue(s.batch_size || 1, false);

    this.toggleFastMode.setValue(Boolean(s.fast_mode), false);
    this.toggleEnsemble.setValue(Boolean(s.ensemble), false);
    this.dropdownScale.setValue(s.scale_factor || "1x", false);
    this.dropdownDtype.setValue(s.dtype || "float32", false);
    this.toggleTorchCompile.setValue(Boolean(s.torch_compile), false);

    this.syncModeState();
    this.renderCollapse();
  }
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    installDSUI();
    loadCSS();
    fetchModelsStatus();

    const originalCreated = nodeType.prototype.onNodeCreated;
    const origConfigure = nodeType.prototype.configure;
    const origOnConfigure = nodeType.prototype.onConfigure;
    const origSerialize = nodeType.prototype.serialize;
    const origResize = nodeType.prototype.onResize;
    const origOnExecuted = nodeType.prototype.onExecuted;
    const baseComputeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function (out) {
      const size = baseComputeSize ? baseComputeSize.call(this, out) : [MIN_W, 0];
      size[0] = Math.max(size[0], MIN_W);
      const minH = this._controller
        ? bodyTop(this) + this._controller.minCardHeight() + 2 * CARD_MARGIN
        : bodyTop(this) + (getState(this).collapsed ? COLLAPSED_CARD_H : EXPANDED_CARD_H) + 2 * CARD_MARGIN;
      size[1] = minH;
      return size;
    };

    const baseGetWidgetOnPos = nodeType.prototype.getWidgetOnPos;
    nodeType.prototype.getWidgetOnPos = function (...args) {
      const hit = baseGetWidgetOnPos ? baseGetWidgetOnPos.apply(this, args) : undefined;
      return hit === this.domWidget ? undefined : hit;
    };

    nodeType.prototype.onResize = function (size) {
      if (!Array.isArray(size) || this._dsInResize) return;
      this._dsInResize = true;
      try {
        hideWidgets(this);
        const min = this.computeSize();
        size[0] = Math.max(size[0], min[0]);
        size[1] = min[1]; // Auto-calculated vertical resize (Rule B / card layout)
        if (this.size) {
          this.size[0] = size[0];
          this.size[1] = size[1];
        }
        const s = getState(this);
        s.node_size = [size[0], size[1]];
        persistState(this);
        this.setDirtyCanvas?.(true, true);
      } finally {
        this._dsInResize = false;
      }
      if (origResize) origResize.apply(this, arguments);
    };

    nodeType.prototype.serialize = function () {
      persistState(this);
      const o = origSerialize ? origSerialize.apply(this, arguments) : {};
      if (o && Array.isArray(this.size)) {
        o.size = [this.size[0], this.size[1]];
      }
      return o;
    };

    nodeType.prototype.configure = function () {
      const result = origConfigure ? origConfigure.apply(this, arguments) : undefined;
      hideWidgets(this);
      if (this._controller) {
        this._controller.syncState();
        requestAnimationFrame(() => this._controller?.relayout({ shrink: getState(this).collapsed }));
      }
      return result;
    };

    nodeType.prototype.onConfigure = function () {
      const result = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
      hideWidgets(this);
      if (this._controller) {
        this._controller.syncState();
        requestAnimationFrame(() => this._controller?.relayout({ shrink: getState(this).collapsed }));
      }
      return result;
    };

    nodeType.prototype.onExecuted = function () {
      const result = origOnExecuted ? origOnExecuted.apply(this, arguments) : undefined;
      this._controller?.statusBar?.setStatus("Interpolation Complete", "success");
      setTimeout(() => {
        this._controller?.statusBar?.reset("Ready");
      }, 4000);
      return result;
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;

      this.resizable = true;

      // Card starts exactly 5px below the node top / socket rows (removes ComfyUI's +2px)
      Object.defineProperty(this, "widgets_start_y", {
        configurable: true,
        get() { return bodyTop(this); },
        set() {},
      });

      if (!this.properties) this.properties = {};
      const defState = getDefaultState();
      for (const [k, v] of Object.entries(defState)) {
        if (this.properties[k] === undefined) this.properties[k] = v;
      }

      hideWidgets(this);

      const controller = new DSInterpolationController(this);
      this._controller = controller;

      const domWidget = this.addDOMWidget("ds_interpolation_ui", "custom", controller.card.root, {
        serialize: false,
        margin: CARD_MARGIN,
        getMinHeight: () => controller.minCardHeight() + 2 * CARD_MARGIN,
      });
      domWidget.serialize = false;
      this.domWidget = domWidget;
      controller.domWidget = domWidget;

      domWidget.onPointerDown = (pointer) => {
        const target = pointer?.eDown?.target;
        return !!target?.closest?.("button, input, select, textarea, .ds-ui-toggle-track, .ds-ui-toggle-row, .ds-ui-dropdown-trigger, .ds-interp-collapse-header, .ds-ui-stepper-btn");
      };

      normalizeDSWidgetHost(controller.card.root, this, { shell: false });
      protectDSResizeCorners(this);

      window.DSGlobalTheme?.bindNode?.(controller.card.root, this);
      window.DSGlobalTheme?.applyNodeBase?.(this);
      window.DSGlobalTheme?.subscribe?.(() => {
        this.setDirtyCanvas?.(true, true);
      });

      requestAnimationFrame(() => {
        controller.relayout({ shrink: getState(this).collapsed });
      });
      setTimeout(() => {
        controller.relayout({ shrink: getState(this).collapsed });
      }, 50);
      return result;
    };
  },

  nodeCreated(node) {
    if (node?.type === TYPE) {
      hideWidgets(node);
      node._controller?.syncState();
      requestAnimationFrame(() => {
        node._controller?.relayout({ shrink: getState(node).collapsed });
      });
      setTimeout(() => {
        node._controller?.relayout({ shrink: getState(node).collapsed });
      }, 50);
    }
  },

  loadedGraphNode(node) {
    if (node?.type === TYPE) {
      hideWidgets(node);
      node._controller?.syncState();
      requestAnimationFrame(() => {
        node._controller?.relayout({ shrink: getState(node).collapsed });
      });
      setTimeout(() => {
        node._controller?.relayout({ shrink: getState(node).collapsed });
      }, 50);
    }
  },

  async setup() {
    installDSUI();
    loadCSS();
    await fetchModelsStatus();

    // ComfyUI execution lifecycle tracking for status bar
    api.addEventListener("executing", (e) => {
      const executingNodeId = e?.detail;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && String(n.id) === String(executingNodeId)) {
          n._controller?.statusBar?.setStatus("Interpolating frames...", "running");
        }
      }
    });

    api.addEventListener("progress", (e) => {
      const d = e?.detail;
      if (!d) return;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && String(n.id) === String(d.node)) {
          if (d.max > 0) {
            const pct = (d.value / d.max) * 100;
            n._controller?.statusBar?.setProgress(pct, `Interpolating (${Math.round(pct)}%)...`);
          }
        }
      }
    });

    api.addEventListener("executed", (e) => {
      const execNodeId = e?.detail?.node ?? e?.detail;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && String(n.id) === String(execNodeId)) {
          n._controller?.statusBar?.setStatus("Interpolation Complete", "success");
          setTimeout(() => {
            n._controller?.statusBar?.reset("Ready");
          }, 4000);
        }
      }
    });

    api.addEventListener("execution_error", (e) => {
      const errNodeId = e?.detail?.node_id;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && String(n.id) === String(errNodeId)) {
          n._controller?.statusBar?.setStatus("Interpolation Failed", "error");
        }
      }
    });

    api.addEventListener("execution_interrupted", () => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          n._controller?.statusBar?.reset("Ready");
        }
      }
    });

    window.addEventListener("ds-theme-changed", () => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && n._controller?.card?.root) {
          window.DSGlobalTheme?.bindNode?.(n._controller.card.root, n);
          window.DSGlobalTheme?.applyNodeBase?.(n);
          n.setDirtyCanvas?.(true, true);
        }
      }
    });
  },
});
