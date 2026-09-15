/**
 * DS Interpolation - Custom Deathshot Arsenal Node UI
 * Deathshot Arsenal / DS Node Pack
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_Interpolation";
const EXT = "DeathshotArsenal.DSInterpolation";
const PROP = "ds_interpolation_state";

const DEFAULT_W = 340;
const MIN_W = 300;
const EXPANDED_H = 430;
const COLLAPSED_H = 185;

const MODEL_OPTIONS = [
  "sudo_rife4_269.662_testV1_scale1.pth",
  "rife47.pth",
  "rife49.pth",
  "rife417.pth",
  "rife426.pth",
];

const SCALE_OPTIONS = ["0.25", "0.5", "1x", "2", "4"];
const DTYPE_OPTIONS = ["float32", "float16", "bfloat16"];

const ICONS = {
  chevron: `<svg class="ds-interp-chevron" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>`,
  collapseChevron: `<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  stepUp: `<svg viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>`,
  stepDown: `<svg viewBox="0 0 24 24"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>`,
};

let cssLoaded = false;
function loadCSS() {
  if (cssLoaded || document.querySelector("link[data-ds-interp-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dsInterpCss = "true";
  link.href = new URL("./ds_interpolation.css", import.meta.url).href;
  document.head.appendChild(link);
  cssLoaded = true;
}

function getDefaultState() {
  return {
    ckpt_name: "rife49.pth",
    collapsed: false,
    clear_cache_after_n_frames: 10,
    multiplier: 2,
    fast_mode: true,
    ensemble: true,
    scale_factor: "1x",
    dtype: "float32",
    torch_compile: false,
    batch_size: 1,
  };
}

function getState(node) {
  if (!node._dsInterpState) {
    let s = null;
    try {
      const raw = node.properties?.[PROP];
      if (raw) s = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) {}
    node._dsInterpState = Object.assign(getDefaultState(), s || {});
  }
  return node._dsInterpState;
}

function persistState(node) {
  const s = getState(node);
  if (!node.properties) node.properties = {};
  node.properties[PROP] = JSON.stringify(s);

  // Synchronize internal properties for workflow serialization
  for (const [k, v] of Object.entries(s)) {
    node.properties[k] = v;
  }

  // Synchronize hidden LiteGraph widgets for ComfyUI backend execution
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
    w.computeSize = () => [0, 0];
    w.draw = () => {};
    if (w.element) w.element.style.display = "none";
  }
}

function attachStepper(btnUp, btnDown, getValue, setValue, step = 1, min = 1) {
  let timer = null;
  let interval = null;

  const stepVal = (delta) => {
    let cur = Number(getValue()) || 0;
    let next = Math.max(min, Math.round(cur + delta));
    setValue(next);
  };

  const stopHold = () => {
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    timer = null;
    interval = null;
  };

  btnUp.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stepVal(step);
    timer = setTimeout(() => {
      interval = setInterval(() => stepVal(step), 80);
    }, 300);
  });

  btnDown.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stepVal(-step);
    timer = setTimeout(() => {
      interval = setInterval(() => stepVal(-step), 80);
    }, 300);
  });

  window.addEventListener("pointerup", stopHold);
  window.addEventListener("pointercancel", stopHold);
}

// Global cached model installed statuses
let _modelsStatusCache = null;
async function fetchModelsStatus() {
  try {
    const res = await api.fetchApi("/ds/interpolation/models");
    if (res.ok) {
      const data = await res.json();
      if (data?.models) {
        _modelsStatusCache = {};
        for (const m of data.models) {
          _modelsStatusCache[m.name] = m.installed;
        }
      }
    }
  } catch (_) {}
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    loadCSS();
    fetchModelsStatus();

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;

    nodeType.prototype.computeSize = function () {
      const s = getState(this);
      const minH = s.collapsed ? COLLAPSED_H : EXPANDED_H;
      return [MIN_W, minH];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      if (!this.properties) this.properties = {};
      const defState = getDefaultState();
      for (const [k, v] of Object.entries(defState)) {
        if (this.properties[k] === undefined) this.properties[k] = v;
      }

      const s = getState(this);
      const minH = s.collapsed ? COLLAPSED_H : EXPANDED_H;
      this.min_size = [MIN_W, minH];

      const origResize = this.onResize;
      this.onResize = function (size) {
        if (origResize) origResize.apply(this, arguments);
        const curS = getState(this);
        if (!curS.collapsed && size && size[1] >= EXPANDED_H) {
          this._savedExpandedHeight = size[1];
        }
      };

      hideWidgets(this);

      const root = buildUI(this);

      this.domWidget = this.addDOMWidget("ds_interpolation_ui", "div", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
      });

      if (this.domWidget) {
        this.domWidget.computeSize = (w) => [
          this.size ? this.size[0] : DEFAULT_W,
          getState(this).collapsed ? 95 : 320,
        ];
        this.domWidget.computeLayoutSize = () => {
          const curS = getState(this);
          return {
            minWidth: MIN_W,
            minHeight: curS.collapsed ? COLLAPSED_H : EXPANDED_H,
          };
        };
        this.domWidget.onPointerDown = (pointer) => {
          const target = pointer?.eDown?.target;
          return !!target?.closest?.(
            "button, input, select, textarea, .ds-interp-collapse-header, .ds-interp-stepper-btn, .ds-interp-toggle-btn, .ds-interp-ckpt-trigger, .ds-interp-select-trigger"
          );
        };
      }

      window.DSGlobalTheme?.bindNode?.(root, this);
      window.DSGlobalTheme?.applyNodeBase?.(this);
      window.DSGlobalTheme?.subscribe?.(() => {
        this.setDirtyCanvas?.(true, true);
      });

      renderCollapse(this);

      requestAnimationFrame(() => {
        const curS = getState(this);
        const targetH = curS.collapsed ? COLLAPSED_H : (this._savedExpandedHeight || EXPANDED_H);
        const curW = Math.max(this.size?.[0] || DEFAULT_W, MIN_W);
        if (typeof this.setSize === "function") {
          this.setSize([curW, targetH]);
        } else {
          this.size = [curW, targetH];
        }
        hideWidgets(this);
        renderCollapse(this);
        this.setDirtyCanvas?.(true, true);
      });

      return result;
    };

    nodeType.prototype.onConfigure = function () {
      const result = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
      const s = getState(this);

      // Restore parameters from saved node properties
      const p = this.properties || {};
      for (const k of Object.keys(s)) {
        if (p[k] !== undefined) s[k] = p[k];
      }

      persistState(this);
      hideWidgets(this);
      renderUI(this);

      // Fix size if below minimum required height or width
      const minH = s.collapsed ? COLLAPSED_H : EXPANDED_H;
      if (!this.size || !Array.isArray(this.size) || this.size[1] < minH || this.size[0] < MIN_W) {
        const curW = Array.isArray(this.size) ? Math.max(this.size[0], MIN_W) : DEFAULT_W;
        const curH = Array.isArray(this.size) ? Math.max(this.size[1], minH) : minH;
        if (typeof this.setSize === "function") {
          this.setSize([curW, curH]);
        } else if (this.size) {
          this.size = [curW, curH];
        }
      }

      renderCollapse(this);
      return result;
    };
  },

  nodeCreated(node) {
    if (node?.type === TYPE) {
      ensureNodeSizing(node);
    }
  },

  loadedGraphNode(node) {
    if (node?.type === TYPE) {
      ensureNodeSizing(node);
    }
  },

  async setup() {
    loadCSS();

    setTimeout(() => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          ensureNodeSizing(n);
          n.setDirtyCanvas?.(true, true);
        }
      }
    }, 60);

    window.addEventListener("ds-theme-changed", () => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && n._dom?.root) {
          window.DSGlobalTheme?.bindNode?.(n._dom.root, n);
          window.DSGlobalTheme?.applyNodeBase?.(n);
        }
      }
    });
  },
});

function ensureNodeSizing(node) {
  if (!node || node.type !== TYPE) return;
  node.resizable = true;
  const s = getState(node);
  const minH = s.collapsed ? COLLAPSED_H : EXPANDED_H;
  node.min_size = [MIN_W, minH];
  if (!Array.isArray(node.size) || node.size[0] < MIN_W || node.size[1] < minH) {
    const curW = Array.isArray(node.size) ? Math.max(node.size[0], MIN_W) : DEFAULT_W;
    const curH = Array.isArray(node.size) ? Math.max(node.size[1], minH) : minH;
    if (typeof node.setSize === "function") {
      node.setSize([curW, curH]);
    } else {
      node.size = [curW, curH];
    }
  }
}

function buildUI(node) {
  const root = document.createElement("div");
  root.className = "ds-interpolation-root";

  root.innerHTML = `
    <!-- Full-Width Checkpoint Selection -->
    <div class="ds-interp-field">
      <span class="ds-interp-label">ckpt_name</span>
      <button type="button" class="ds-interp-ckpt-trigger" data-trigger="ckpt">
        <div class="ds-interp-ckpt-info">
          <span class="ds-interp-ckpt-name" data-label="ckpt">rife49.pth</span>
          <span class="ds-interp-badge ds-interp-badge--installed" data-badge="ckpt">✓ Installed</span>
        </div>
        ${ICONS.chevron}
      </button>
    </div>

    <!-- Collapsible Options Header -->
    <div class="ds-interp-collapse-header" data-collapse-header title="Toggle Advanced Interpolation Options">
      <div class="ds-interp-collapse-left">
        <span class="ds-interp-collapse-icon">${ICONS.collapseChevron}</span>
        <span>Interpolation Options</span>
      </div>
    </div>

    <!-- Big Box Options Panel -->
    <div class="ds-interp-options-panel" data-options-panel>
      <div class="ds-interp-grid">
        <!-- Row 1: Clear Cache | Multiplier -->
        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Cache After Frames</span>
          <div class="ds-interp-stepper-box">
            <input type="number" min="1" step="1" class="ds-interp-num-input" data-input="clear_cache" />
            <div class="ds-interp-stepper-actions">
              <button type="button" class="ds-interp-stepper-btn" data-step-up="clear_cache">${ICONS.stepUp}</button>
              <button type="button" class="ds-interp-stepper-btn" data-step-down="clear_cache">${ICONS.stepDown}</button>
            </div>
          </div>
        </div>

        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Multiplier</span>
          <div class="ds-interp-stepper-box">
            <input type="number" min="1" step="1" class="ds-interp-num-input" data-input="multiplier" />
            <div class="ds-interp-stepper-actions">
              <button type="button" class="ds-interp-stepper-btn" data-step-up="multiplier">${ICONS.stepUp}</button>
              <button type="button" class="ds-interp-stepper-btn" data-step-down="multiplier">${ICONS.stepDown}</button>
            </div>
          </div>
        </div>

        <!-- Row 2: Fast Mode | Ensemble -->
        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Fast Mode</span>
          <button type="button" class="ds-interp-toggle-btn" data-toggle="fast_mode" role="switch" aria-checked="true">
            <span class="ds-interp-toggle-text" data-toggle-label="fast_mode">ON</span>
            <span class="ds-interp-toggle-track"><span class="ds-interp-toggle-thumb"></span></span>
          </button>
        </div>

        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Ensemble</span>
          <button type="button" class="ds-interp-toggle-btn" data-toggle="ensemble" role="switch" aria-checked="true">
            <span class="ds-interp-toggle-text" data-toggle-label="ensemble">ON</span>
            <span class="ds-interp-toggle-track"><span class="ds-interp-toggle-thumb"></span></span>
          </button>
        </div>

        <!-- Row 3: Scale Factor | Dtype -->
        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Scale Factor</span>
          <button type="button" class="ds-interp-select-trigger" data-trigger="scale">
            <span data-label="scale">1x</span>
            ${ICONS.chevron}
          </button>
        </div>

        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Dtype</span>
          <button type="button" class="ds-interp-select-trigger" data-trigger="dtype">
            <span data-label="dtype">float32</span>
            ${ICONS.chevron}
          </button>
        </div>

        <!-- Row 4: Torch Compile | Batch Size -->
        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Torch Compile</span>
          <button type="button" class="ds-interp-toggle-btn" data-toggle="torch_compile" role="switch" aria-checked="false">
            <span class="ds-interp-toggle-text" data-toggle-label="torch_compile">OFF</span>
            <span class="ds-interp-toggle-track"><span class="ds-interp-toggle-thumb"></span></span>
          </button>
        </div>

        <div class="ds-interp-grid-cell">
          <span class="ds-interp-label">Batch Size</span>
          <div class="ds-interp-stepper-box">
            <input type="number" min="1" max="64" step="1" class="ds-interp-num-input" data-input="batch_size" />
            <div class="ds-interp-stepper-actions">
              <button type="button" class="ds-interp-stepper-btn" data-step-up="batch_size">${ICONS.stepUp}</button>
              <button type="button" class="ds-interp-stepper-btn" data-step-down="batch_size">${ICONS.stepDown}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  node._dom = {
    root,
    collapseHeader: root.querySelector("[data-collapse-header]"),
    optionsPanel: root.querySelector("[data-options-panel]"),

    triggerCkpt: root.querySelector('[data-trigger="ckpt"]'),
    labelCkpt: root.querySelector('[data-label="ckpt"]'),
    badgeCkpt: root.querySelector('[data-badge="ckpt"]'),

    inputClearCache: root.querySelector('[data-input="clear_cache"]'),
    inputMultiplier: root.querySelector('[data-input="multiplier"]'),

    toggleFastMode: root.querySelector('[data-toggle="fast_mode"]'),
    toggleFastModeLabel: root.querySelector('[data-toggle-label="fast_mode"]'),

    toggleEnsemble: root.querySelector('[data-toggle="ensemble"]'),
    toggleEnsembleLabel: root.querySelector('[data-toggle-label="ensemble"]'),

    triggerScale: root.querySelector('[data-trigger="scale"]'),
    labelScale: root.querySelector('[data-label="scale"]'),

    triggerDtype: root.querySelector('[data-trigger="dtype"]'),
    labelDtype: root.querySelector('[data-label="dtype"]'),

    toggleTorchCompile: root.querySelector('[data-toggle="torch_compile"]'),
    toggleTorchCompileLabel: root.querySelector('[data-toggle-label="torch_compile"]'),

    inputBatchSize: root.querySelector('[data-input="batch_size"]'),
  };

  wireEvents(node);
  renderUI(node);

  return root;
}

function wireEvents(node) {
  const d = node._dom;
  const s = getState(node);

  // Checkpoint Dropdown Popover
  d.triggerCkpt.addEventListener("click", (e) => {
    e.stopPropagation();
    openCkptDropdown(node);
  });

  // Collapsible Options Header
  d.collapseHeader.addEventListener("click", (e) => {
    e.stopPropagation();
    s.collapsed = !s.collapsed;
    persistState(node);
    renderCollapse(node, true);
  });

  // Numeric Steppers
  attachStepper(
    d.root.querySelector('[data-step-up="clear_cache"]'),
    d.root.querySelector('[data-step-down="clear_cache"]'),
    () => s.clear_cache_after_n_frames,
    (val) => {
      s.clear_cache_after_n_frames = val;
      d.inputClearCache.value = val;
      persistState(node);
    },
    1, 1
  );
  d.inputClearCache.addEventListener("change", () => {
    s.clear_cache_after_n_frames = Math.max(1, parseInt(d.inputClearCache.value, 10) || 10);
    d.inputClearCache.value = s.clear_cache_after_n_frames;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector('[data-step-up="multiplier"]'),
    d.root.querySelector('[data-step-down="multiplier"]'),
    () => s.multiplier,
    (val) => {
      s.multiplier = val;
      d.inputMultiplier.value = val;
      persistState(node);
    },
    1, 1
  );
  d.inputMultiplier.addEventListener("change", () => {
    s.multiplier = Math.max(1, parseInt(d.inputMultiplier.value, 10) || 2);
    d.inputMultiplier.value = s.multiplier;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector('[data-step-up="batch_size"]'),
    d.root.querySelector('[data-step-down="batch_size"]'),
    () => s.batch_size,
    (val) => {
      s.batch_size = val;
      d.inputBatchSize.value = val;
      persistState(node);
    },
    1, 1
  );
  d.inputBatchSize.addEventListener("change", () => {
    s.batch_size = Math.max(1, parseInt(d.inputBatchSize.value, 10) || 1);
    d.inputBatchSize.value = s.batch_size;
    persistState(node);
  });

  // Toggles
  d.toggleFastMode.addEventListener("click", (e) => {
    e.stopPropagation();
    s.fast_mode = !s.fast_mode;
    persistState(node);
    renderUI(node);
  });

  d.toggleEnsemble.addEventListener("click", (e) => {
    e.stopPropagation();
    s.ensemble = !s.ensemble;
    persistState(node);
    renderUI(node);
  });

  d.toggleTorchCompile.addEventListener("click", (e) => {
    e.stopPropagation();
    s.torch_compile = !s.torch_compile;
    persistState(node);
    renderUI(node);
  });

  // Dropdowns for Scale Factor & Dtype
  d.triggerScale.addEventListener("click", (e) => {
    e.stopPropagation();
    openSimpleDropdown(d.triggerScale, SCALE_OPTIONS, s.scale_factor, (val) => {
      s.scale_factor = val;
      persistState(node);
      renderUI(node);
    });
  });

  d.triggerDtype.addEventListener("click", (e) => {
    e.stopPropagation();
    openSimpleDropdown(d.triggerDtype, DTYPE_OPTIONS, s.dtype, (val) => {
      s.dtype = val;
      persistState(node);
      renderUI(node);
    });
  });
}

function renderUI(node) {
  const d = node._dom;
  if (!d) return;
  const s = getState(node);

  // Checkpoint label & badge
  d.labelCkpt.textContent = s.ckpt_name || "rife49.pth";
  const isInstalled = _modelsStatusCache ? Boolean(_modelsStatusCache[s.ckpt_name]) : true;
  if (isInstalled) {
    d.badgeCkpt.className = "ds-interp-badge ds-interp-badge--installed";
    d.badgeCkpt.textContent = "✓ Installed";
  } else {
    d.badgeCkpt.className = "ds-interp-badge ds-interp-badge--download";
    d.badgeCkpt.textContent = "↓ Download";
  }

  // Stepper inputs
  d.inputClearCache.value = s.clear_cache_after_n_frames;
  d.inputMultiplier.value = s.multiplier;
  d.inputBatchSize.value = s.batch_size;

  // Toggles
  d.toggleFastMode.classList.toggle("is-active", Boolean(s.fast_mode));
  d.toggleFastMode.setAttribute("aria-checked", s.fast_mode ? "true" : "false");
  d.toggleFastModeLabel.textContent = s.fast_mode ? "ON" : "OFF";

  d.toggleEnsemble.classList.toggle("is-active", Boolean(s.ensemble));
  d.toggleEnsemble.setAttribute("aria-checked", s.ensemble ? "true" : "false");
  d.toggleEnsembleLabel.textContent = s.ensemble ? "ON" : "OFF";

  d.toggleTorchCompile.classList.toggle("is-active", Boolean(s.torch_compile));
  d.toggleTorchCompile.setAttribute("aria-checked", s.torch_compile ? "true" : "false");
  d.toggleTorchCompileLabel.textContent = s.torch_compile ? "ON" : "OFF";

  // Select labels
  d.labelScale.textContent = s.scale_factor || "1x";
  d.labelDtype.textContent = s.dtype || "float32";

  renderCollapse(node);
  node.setDirtyCanvas?.(true, true);
}

function renderCollapse(node, stateChanged = false) {
  const s = getState(node);
  const d = node._dom;
  if (!d) return;

  const isCollapsed = Boolean(s.collapsed);
  d.collapseHeader.classList.toggle("is-open", !isCollapsed);
  d.optionsPanel.classList.toggle("is-collapsed", isCollapsed);

  node.min_size = [MIN_W, isCollapsed ? COLLAPSED_H : EXPANDED_H];

  if (stateChanged) {
    if (isCollapsed) {
      if (node.size && node.size[1] >= EXPANDED_H) {
        node._savedExpandedHeight = node.size[1];
      }
      const targetH = COLLAPSED_H;
      if (typeof node.setSize === "function") {
        node.setSize([Math.max(node.size?.[0] || DEFAULT_W, MIN_W), targetH]);
      } else if (node.size) {
        node.size[1] = targetH;
      }
    } else {
      const targetH = Math.max(node._savedExpandedHeight || EXPANDED_H, EXPANDED_H);
      if (typeof node.setSize === "function") {
        node.setSize([Math.max(node.size?.[0] || DEFAULT_W, MIN_W), targetH]);
      } else if (node.size) {
        node.size[1] = targetH;
      }
    }
  } else {
    // Non-toggle render (e.g. parameter changed, configure, or initial setup):
    // Only adjust height if it is below the required minimum
    const minH = isCollapsed ? COLLAPSED_H : EXPANDED_H;
    if (node.size && node.size[1] < minH) {
      if (typeof node.setSize === "function") {
        node.setSize([Math.max(node.size[0] || DEFAULT_W, MIN_W), minH]);
      } else if (node.size) {
        node.size[1] = minH;
      }
    }
  }

  if (node.domWidget) {
    node.domWidget.computeSize = (w) => [
      node.size ? node.size[0] : DEFAULT_W,
      isCollapsed ? 95 : 320,
    ];
  }
  node.setDirtyCanvas?.(true, true);
}

let _activeDropdownClose = null;

function closeAllDropdowns() {
  if (_activeDropdownClose) {
    const fn = _activeDropdownClose;
    _activeDropdownClose = null;
    fn();
  }
  document.querySelectorAll(".ds-interp-dropdown").forEach((el) => el.remove());
  document.querySelectorAll(".ds-interp-ckpt-trigger, .ds-interp-select-trigger").forEach((el) => el.classList.remove("is-active"));
}

function openCkptDropdown(node) {
  const d = node._dom;
  const s = getState(node);

  // If already open, clicking the trigger/arrow toggles it closed
  if (d.triggerCkpt.classList.contains("is-active")) {
    closeAllDropdowns();
    return;
  }

  closeAllDropdowns();
  d.triggerCkpt.classList.add("is-active");

  const menu = document.createElement("div");
  menu.className = "ds-interp-dropdown";

  const rect = d.triggerCkpt.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.width = `${rect.width}px`;

  MODEL_OPTIONS.forEach((ckpt) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ds-interp-dropdown-item";
    const isSel = (s.ckpt_name === ckpt);
    if (isSel) item.classList.add("is-selected");

    const isInstalled = _modelsStatusCache ? Boolean(_modelsStatusCache[ckpt]) : (ckpt === "rife49.pth");
    const badgeText = isInstalled ? "✓ Installed" : "↓ Download";
    const badgeCls = isInstalled ? "ds-interp-badge--installed" : "ds-interp-badge--download";

    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ckpt}</span>
        <span class="ds-interp-badge ${badgeCls}">${badgeText}</span>
      </div>
      ${isSel ? ICONS.check : ""}
    `;

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      s.ckpt_name = ckpt;
      persistState(node);
      renderUI(node);
      close();
    });

    menu.appendChild(item);
  });

  let isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    if (_activeDropdownClose === close) {
      _activeDropdownClose = null;
    }
    d.triggerCkpt.classList.remove("is-active");
    menu.remove();
    cleanupListeners();
  };

  const onOutside = (e) => {
    if (menu.contains(e.target)) return;
    if (d.triggerCkpt.contains(e.target)) return;
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const onScroll = (e) => {
    if (!menu.contains(e.target)) {
      close();
    }
  };

  const cleanupListeners = () => {
    window.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("mousedown", onOutside, true);
    window.removeEventListener("contextmenu", onOutside, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("wheel", onScroll, { capture: true, passive: true });
  };

  _activeDropdownClose = close;
  document.body.appendChild(menu);

  // Use capture phase so LiteGraph/ComfyUI canvas event stopPropagation doesn't block outside clicks!
  window.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("mousedown", onOutside, true);
  window.addEventListener("contextmenu", onOutside, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("wheel", onScroll, { capture: true, passive: true });
}

function openSimpleDropdown(triggerEl, options, currentValue, onSelect) {
  // If already open, clicking the trigger/arrow toggles it closed
  if (triggerEl.classList.contains("is-active")) {
    closeAllDropdowns();
    return;
  }

  closeAllDropdowns();
  triggerEl.classList.add("is-active");

  const menu = document.createElement("div");
  menu.className = "ds-interp-dropdown";

  const rect = triggerEl.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.minWidth = `${rect.width}px`;

  options.forEach((opt) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ds-interp-dropdown-item";
    const isSel = (opt === currentValue);
    if (isSel) item.classList.add("is-selected");

    item.innerHTML = `<span>${opt}</span>${isSel ? ICONS.check : ""}`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(opt);
      close();
    });

    menu.appendChild(item);
  });

  let isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    if (_activeDropdownClose === close) {
      _activeDropdownClose = null;
    }
    triggerEl.classList.remove("is-active");
    menu.remove();
    cleanupListeners();
  };

  const onOutside = (e) => {
    if (menu.contains(e.target)) return;
    if (triggerEl.contains(e.target)) return;
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const onScroll = (e) => {
    if (!menu.contains(e.target)) {
      close();
    }
  };

  const cleanupListeners = () => {
    window.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("mousedown", onOutside, true);
    window.removeEventListener("contextmenu", onOutside, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("wheel", onScroll, { capture: true, passive: true });
  };

  _activeDropdownClose = close;
  document.body.appendChild(menu);

  window.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("mousedown", onOutside, true);
  window.addEventListener("contextmenu", onOutside, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("wheel", onScroll, { capture: true, passive: true });
}
