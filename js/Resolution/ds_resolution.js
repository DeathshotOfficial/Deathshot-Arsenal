// DS Resolution — ratio grid + MP/divisibility controls.
// The visible UI is DOM-based; width/height remain hidden Comfy widgets so
// the node still exposes two normal INT outputs.

import { app } from "/scripts/app.js";
import { Card, Stepper, Field, protectDSResizeCorners, normalizeDSWidgetHost } from "../UIElements/index.js";
import { DSIcon } from "../Icons/index.js";

const cssHref = "/extensions/DeathshotArsenal/Resolution/ds_resolution.css";
if (!document.querySelector(`link[href="${cssHref}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssHref;
  document.head.appendChild(link);
}

const ASPECT_RATIOS = [
  { key: "1:1", ratio: 1 / 1, group: "Common" },
  { key: "4:3", ratio: 4 / 3, group: "Common" },
  { key: "3:2", ratio: 3 / 2, group: "Common" },
  { key: "16:9", ratio: 16 / 9, group: "Common" },
  { key: "21:9", ratio: 21 / 9, group: "Common" },

  { key: "2:3", ratio: 2 / 3, group: "Portrait" },
  { key: "3:4", ratio: 3 / 4, group: "Portrait" },
  { key: "4:5", ratio: 4 / 5, group: "Portrait" },
  { key: "9:16", ratio: 9 / 16, group: "Portrait" },

  { key: "5:4", ratio: 5 / 4, group: "Other" },
  { key: "5:7", ratio: 5 / 7, group: "Other" },
  { key: "7:5", ratio: 7 / 5, group: "Other" },
  { key: "3:5", ratio: 3 / 5, group: "Other" },
  { key: "5:8", ratio: 5 / 8, group: "Other" },
  { key: "7:9", ratio: 7 / 9, group: "Other" },
  { key: "9:19", ratio: 9 / 19, group: "Other" },
  { key: "9:21", ratio: 9 / 21, group: "Other" },
  { key: "9:32", ratio: 9 / 32, group: "Other" },
  { key: "5:3", ratio: 5 / 3, group: "Other" },
  { key: "8:5", ratio: 8 / 5, group: "Other" },
  { key: "9:7", ratio: 9 / 7, group: "Other" },
  { key: "19:9", ratio: 19 / 9, group: "Other" },
  { key: "32:9", ratio: 32 / 9, group: "Other" },
];

const PRESET_GROUPS = [
  { name: "Common", keys: ["1:1", "4:3", "3:2", "16:9", "21:9"] },
  { name: "Portrait", keys: ["2:3", "3:4", "4:5", "9:16"] },
  { name: "Other", keys: ["5:4", "5:7", "7:5", "3:5", "5:8", "7:9", "9:19", "9:21", "9:32", "5:3", "8:5", "9:7", "19:9", "32:9"] },
];

const DEFAULT_PRESETS = ["1:1", "4:3", "16:9", "9:16", "21:9"];

const MIN_NODE_W = 320;
const MIN_NODE_H = 150;
const DEFAULT_NODE_W = 340;
const DEFAULT_NODE_H = 260;
const TITLE_H = 30;
const UI_VERSION = 8;
const MIN_DIM = 64;
const MAX_DIM = 16384;
const MIN_MP = 0.1;
const MAX_MP = 30;
const DEFAULT_MP = 1.0;
const DEFAULT_DIVISIBLE = 8;
const DEFAULT_AR = "16:9";



function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function snap(n, multiple) {
  multiple = Math.max(1, Math.round(multiple || 1));
  return Math.max(MIN_DIM, Math.round(n / multiple) * multiple);
}

function getAR(key) {
  const text = String(key || "");
  return ASPECT_RATIOS.find(a => a.key === text)
    || ASPECT_RATIOS.find(a => text.startsWith(a.key))
    || ASPECT_RATIOS.find(a => a.key === DEFAULT_AR)
    || ASPECT_RATIOS[0];
}

function parsePresets(val, currentAspect = null) {
  let list = null;
  if (Array.isArray(val)) {
    list = val;
  } else if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) list = parsed;
    } catch (_) { }
  }
  if (!list || list.length === 0) {
    list = [...DEFAULT_PRESETS];
  }
  const validKeys = new Set(ASPECT_RATIOS.map(a => a.key));
  let result = list.filter(k => validKeys.has(k));
  if (result.length === 0) {
    result = [...DEFAULT_PRESETS];
  }
  if (currentAspect && validKeys.has(currentAspect) && !result.includes(currentAspect)) {
    result.push(currentAspect);
  }
  return result;
}

function dimensionsFromMP(mp, ratio, divisible) {
  mp = clamp(Number(mp) || DEFAULT_MP, MIN_MP, MAX_MP);
  ratio = ratio || 1;
  divisible = Math.max(1, Math.round(Number(divisible) || DEFAULT_DIVISIBLE));

  const area = mp * 1000000;
  let w = Math.sqrt(area * ratio);
  let h = w / ratio;

  w = snap(w, divisible);
  h = snap(h, divisible);

  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = snap(w * scale, divisible);
    h = snap(h * scale, divisible);
  }

  return {
    w: clamp(w, MIN_DIM, MAX_DIM),
    h: clamp(h, MIN_DIM, MAX_DIM),
  };
}

function areaMP(w, h) {
  return ((Number(w) * Number(h)) / 1000000).toFixed(2);
}

function makeStepInput(value, step, min, max, decimals = 0) {
  const wrap = document.createElement("div");
  wrap.className = "ds-stepper";

  const down = document.createElement("button");
  down.type = "button";
  down.className = "ds-step-btn";
  down.textContent = "−";
  down.title = "Decrease";

  const input = document.createElement("input");
  input.className = "ds-step-input";
  input.type = "number";
  input.value = String(value);
  input.step = String(step);
  input.min = String(min);
  input.max = String(max);
  input.inputMode = "decimal";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "ds-step-btn";
  up.textContent = "+";
  up.title = "Increase";

  wrap.append(down, input, up);

  const read = () => Number(input.value);
  const write = (n) => {
    if (!Number.isFinite(n)) return;
    const fixed = decimals ? Number(n.toFixed(decimals)) : Math.round(n);
    input.value = String(clamp(fixed, min, max));
  };

  down.onclick = () => {
    write(read() - step);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  up.onclick = () => {
    write(read() + step);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  return { wrap, input, write };
}

app.registerExtension({
  name: "DeathshotArsenal.DSResolution",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_Resolution") return;

    const oldCreated = nodeType.prototype.onNodeCreated;

    nodeType.prototype._measureCardHeight = function (candidateWidth = this.size?.[0] || DEFAULT_NODE_W) {
      if (!this.dom) return 176;
      const width = Math.max(MIN_NODE_W, Number(candidateWidth) || DEFAULT_NODE_W);
      const cardW = width - 20;

      // 1. If connected to document, use offsetHeight (UNZOOMED CSS pixels)
      if (this.dom.isConnected && this.dom.offsetHeight >= 80) {
        return this.dom.offsetHeight;
      }

      // 2. If not connected, measure via hidden offscreen clone in document.body
      const clone = this.dom.cloneNode(true);
      clone.style.width = `${cardW}px`;
      clone.style.height = "auto";
      clone.style.minHeight = "0";
      clone.style.maxHeight = "none";
      clone.style.position = "fixed";
      clone.style.left = "-100000px";
      clone.style.top = "0";
      clone.style.visibility = "hidden";
      clone.style.pointerEvents = "none";
      clone.style.overflow = "visible";
      document.body.appendChild(clone);
      try {
        const measured = Math.ceil(clone.offsetHeight || clone.scrollHeight || 0);
        if (measured >= 80) return measured;
      } catch (_) {
      } finally {
        clone.remove();
      }

      // 3. Fallback: exact mathematical formula based on button count and rows
      const count = this._enabledPresets?.length || DEFAULT_PRESETS.length;
      const rows = Math.max(1, Math.ceil(count / 5));
      const gridH = rows * 26 + (rows - 1) * 4;
      return 152 + gridH;
    };

    nodeType.prototype._fitNodeHeightToContent = function (candidateWidth = this.size?.[0] || DEFAULT_NODE_W) {
      const width = Math.max(MIN_NODE_W, Number(candidateWidth) || DEFAULT_NODE_W);
      const count = this._enabledPresets?.length || DEFAULT_PRESETS.length;
      const innerW = width - 42;
      const cols = Math.max(1, Math.min(5, Math.floor((innerW + 4) / 40)));
      const rows = Math.max(1, Math.ceil(count / cols));
      const targetH = 240 + (rows - 1) * 30;
      return [width, targetH];
    };

    nodeType.prototype._syncDomGeometry = function () {
      if (!this.dom) return;
      delete this.dom.dataset.dsUiHost;
      this.dom.style.width = "100%";
      this.dom.style.height = "auto";
      this.dom.style.minHeight = "0";
      this.dom.style.boxSizing = "border-box";
      this.dom.style.pointerEvents = "auto";
      this.dom.style.setProperty("background", "var(--ds-color-card, #12151c)", "important");
      this.dom.style.setProperty("background-color", "var(--ds-color-card, #12151c)", "important");

      const host = this.dom.parentElement;
      if (host) {
        host.style.width = "100%";
        host.style.pointerEvents = "none";
        host.style.background = "transparent";
        host.style.backgroundColor = "transparent";
        host.style.overflow = "visible";
        if (host.parentElement && host.parentElement !== document.body) {
          host.parentElement.style.background = "transparent";
          host.parentElement.style.backgroundColor = "transparent";
          host.parentElement.style.overflow = "visible";
        }
      }
    };

    // LiteGraph computeSize hook: returns floor minimums so user can freely resize/shrink
    nodeType.prototype.computeSize = function () {
      return [MIN_NODE_W, MIN_NODE_H];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated ? oldCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      protectDSResizeCorners(this);
      this._dsMinSize = [MIN_NODE_W, MIN_NODE_H];

      if (!this.properties) this.properties = {};

      const currentAspect = String(this.properties.ui_aspect || DEFAULT_AR);
      this._enabledPresets = parsePresets(this.properties.ui_ar_presets, currentAspect);

      const defaults = {
        ui_aspect: currentAspect,
        ui_megapixels: String(DEFAULT_MP.toFixed(1)),
        ui_divisible: String(DEFAULT_DIVISIBLE),
        res_width: "768",
        res_height: "1024",
        ui_ar_presets: this._enabledPresets,
        ui_version: String(UI_VERSION),
      };
      for (const [key, value] of Object.entries(defaults)) {
        if (this.properties[key] === undefined) this.properties[key] = value;
      }

      this._resState = {
        aspect: String(this.properties.ui_aspect || DEFAULT_AR),
        mp: Number(this.properties.ui_megapixels) || DEFAULT_MP,
        divisible: Number(this.properties.ui_divisible) || DEFAULT_DIVISIBLE,
      };

      this.dom = this._buildResolutionUI();
      protectDSResizeCorners(this);

      // Add DOM widget FIRST so it sits directly below output slots at y = 64
      const domWidget = this.addDOMWidget("ds_resolution_ui", "custom", this.dom, {
        serialize: false,
        hideOnZoom: false,
        margin: 5,
        getMinHeight: () => {
          return (this._fitNodeHeightToContent(this.size?.[0] || DEFAULT_NODE_W)[1] - 84);
        },
        getHeight: () => {
          return (this._fitNodeHeightToContent(this.size?.[0] || DEFAULT_NODE_W)[1] - 84);
        },
      });
      this.domWidget = domWidget;

      this.domWidget.computeSize = (width) => {
        const w = Math.max(MIN_NODE_W, Number(width) || DEFAULT_NODE_W);
        return [w, this._fitNodeHeightToContent(w)[1] - 84];
      };

      // Hidden output widgets: fully zeroed so they never push domWidget down
      let wWidget = this.widgets?.find(w => w.name === "width");
      let hWidget = this.widgets?.find(w => w.name === "height");

      if (!wWidget) {
        wWidget = this.addWidget("number", "width", 768, null, {
          min: MIN_DIM, max: MAX_DIM, step: 1,
        });
      }
      if (!hWidget) {
        hWidget = this.addWidget("number", "height", 1024, null, {
          min: MIN_DIM, max: MAX_DIM, step: 1,
        });
      }

      this._wWidget = wWidget;
      this._hWidget = hWidget;

      this._hideOutputWidgets();

      const initialFitted = this._fitNodeHeightToContent(DEFAULT_NODE_W);
      this.size = [DEFAULT_NODE_W, initialFitted[1]];
      this._dsMinSize = [MIN_NODE_W, MIN_NODE_H];

      this.setSize = function (size) {
        if (!size) return;
        const w = Math.max(MIN_NODE_W, Number(size[0]) || DEFAULT_NODE_W);
        const fitted = this._fitNodeHeightToContent ? this._fitNodeHeightToContent(w) : [w, initialFitted[1]];
        this.size = [w, fitted[1]];
      };

      const origOnResize = this.onResize;
      this.onResize = function (size) {
        if (!size || this._dsInResize) return;
        this._dsInResize = true;
        try {
          const w = Math.max(MIN_NODE_W, Number(size[0]) || DEFAULT_NODE_W);
          const fitted = this._fitNodeHeightToContent(w);
          size[0] = w;
          size[1] = fitted[1];
          if (this.size) {
            this.size[0] = w;
            this.size[1] = fitted[1];
          }
          this._syncDomGeometry?.();
          this._syncCollapsedState?.();
          this.setDirtyCanvas?.(true, true);
        } finally {
          this._dsInResize = false;
        }
        if (origOnResize) origOnResize.apply(this, arguments);
      };

      this._hideOutputWidgets();

      // Establish initial state
      this._applyStateToResolution(true);

      // Register with DSGearMenu for selection toolbox
      if (window.DSGearMenu) {
        window.DSGearMenu.register("DS_Resolution", {
          tooltip: "Aspect Ratio Presets",
          onClick: (n, canvas, ev) => (n._toggleGearPopover || n._openGearPopover).call(n, ev?.currentTarget || ev?.target),
        });
      }

      requestAnimationFrame(() => {
        try {
          if (window.DSGlobalTheme && this.dom) {
            window.DSGlobalTheme.bindNode(this.dom, this);
          }
          this._syncDomGeometry();
          const refitted = this._fitNodeHeightToContent(this.size?.[0] || DEFAULT_NODE_W);
          this.size[0] = refitted[0];
          this.size[1] = refitted[1];
          if (this._dsMinSize) this._dsMinSize[1] = refitted[1];
          this._syncCollapsedState();
          this._syncUI();
          this.setDirtyCanvas(true, true);
        } catch (e) {
          console.warn("[DS_Resolution] init:", e);
        }
      });

      return result;
    };


    nodeType.prototype._syncCollapsedState = function () {
      const collapsed = !!this.flags?.collapsed;
      if (collapsed === this._dsCollapsed) return;
      this._dsCollapsed = collapsed;

      const host = this.dom?.parentElement;
      if (host) host.style.display = collapsed ? "none" : "block";
      if (this.dom) this.dom.style.display = collapsed ? "none" : "block";
    };

    nodeType.prototype._hideOutputWidgets = function () {
      const names = new Set(["width", "height"]);
      if (this.widgets) {
        for (const widget of this.widgets) {
          if (!names.has(widget.name)) continue;
          widget.type = "hidden";
          widget.hidden = true;
          widget.computeSize = () => [0, -4];
          widget.draw = () => { };
          if (widget.options) widget.options.hidden = true;
          if (widget.element) {
            widget.element.style.display = "none";
            widget.element.style.height = "0";
          }
          if (widget.element?.parentNode) {
            widget.element.parentNode.style.display = "none";
            widget.element.parentNode.style.height = "0";
          }
        }
      }
      if (this.inputs) {
        this.inputs = this.inputs.filter(i => i.name !== "width" && i.name !== "height");
      }
    };

    nodeType.prototype._persist = function () {
      if (!this.properties) this.properties = {};
      this.properties.ui_aspect = this._resState.aspect;
      this.properties.ui_megapixels = Number(this._resState.mp).toFixed(1);
      this.properties.ui_divisible = String(Math.max(1, Math.round(this._resState.divisible)));
      this.properties.res_width = String(this._wWidget?.value || 768);
      this.properties.res_height = String(this._hWidget?.value || 1024);
      this.properties.ui_ar_presets = [...(this._enabledPresets || DEFAULT_PRESETS)];
      this.properties.ui_version = String(UI_VERSION);
    };

    nodeType.prototype._setResolution = function (w, h, persist = true) {
      const mult = Math.max(1, Math.round(this._resState.divisible || DEFAULT_DIVISIBLE));
      w = clamp(snap(w, mult), MIN_DIM, MAX_DIM);
      h = clamp(snap(h, mult), MIN_DIM, MAX_DIM);

      if (this._wWidget) this._wWidget.value = w;
      if (this._hWidget) this._hWidget.value = h;

      if (persist) {
        this._persist();
        this.setDirtyCanvas(true, true);
      }
      this._syncUI();
    };

    nodeType.prototype._applyStateToResolution = function (persist = true) {
      const ar = getAR(this._resState.aspect);
      const dims = dimensionsFromMP(this._resState.mp, ar.ratio, this._resState.divisible);
      this._setResolution(dims.w, dims.h, persist);
    };

    nodeType.prototype._selectAR = function (key) {
      const ar = getAR(key);
      this._resState.aspect = ar.key;
      this._applyStateToResolution(true);
    };

    nodeType.prototype._setMP = function (value) {
      let mp = Number(value);
      if (!Number.isFinite(mp)) mp = DEFAULT_MP;
      mp = clamp(mp, MIN_MP, MAX_MP);
      this._resState.mp = mp;
      this._applyStateToResolution(true);
    };

    nodeType.prototype._setDivisible = function (value) {
      let d = Number(value);
      if (!Number.isFinite(d)) d = DEFAULT_DIVISIBLE;
      d = clamp(Math.round(d), 1, 1024);
      this._resState.divisible = d;
      this._applyStateToResolution(true);
    };

    nodeType.prototype._syncUI = function () {
      const root = this.dom;
      if (!root) return;

      const w = Number(this._wWidget?.value || 768);
      const h = Number(this._hWidget?.value || 1024);

      if (root._preview) {
        root._preview.textContent = `${w} × ${h}`;
      }
      if (root._previewMeta) {
        root._previewMeta.textContent = `${areaMP(w, h)} MP`;
      }
      if (root._mpInput) {
        root._mpInput.value = Number(this._resState.mp).toFixed(1);
      }
      if (root._divInput) {
        root._divInput.value = String(Math.round(this._resState.divisible));
      }

      root.querySelectorAll(".ds-ar-btn").forEach(btn => {
        const selected = btn.dataset.ar === this._resState.aspect;
        btn.classList.toggle("selected", selected);
        btn.classList.toggle("is-active", selected);
        btn.removeAttribute("aria-pressed");
      });
    };

    nodeType.prototype._renderARButtons = function (gridEl = this.dom?._arGrid) {
      if (!gridEl) return;
      gridEl.innerHTML = "";

      const enabled = this._enabledPresets || DEFAULT_PRESETS;
      const list = ASPECT_RATIOS.filter(ar => enabled.includes(ar.key));

      if (list.length === 0) {
        const fallback = getAR(this._resState?.aspect || DEFAULT_AR);
        if (fallback) list.push(fallback);
      }

      list.forEach(ar => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ds-ar-btn";
        btn.dataset.ar = ar.key;
        btn.title = `${ar.key} aspect ratio`;
        btn.setAttribute("aria-label", `Aspect ratio ${ar.key}`);

        const iconWrap = document.createElement("span");
        iconWrap.className = "ds-ar-icon-wrap";

        const icon = document.createElement("span");
        icon.className = "ds-ar-icon";
        const maxW = 15, maxH = 13;
        let iw, ih;
        if (ar.ratio >= 1) {
          iw = maxW;
          ih = Math.max(5, Math.round(maxW / ar.ratio));
        } else {
          ih = maxH;
          iw = Math.max(5, Math.round(maxH * ar.ratio));
        }
        icon.style.setProperty("--ar-w", `${iw}px`);
        icon.style.setProperty("--ar-h", `${ih}px`);

        const text = document.createElement("span");
        text.className = "ds-ar-label";
        text.textContent = ar.key;

        iconWrap.appendChild(icon);
        btn.append(iconWrap, text);
        btn.onclick = () => this._selectAR(ar.key);
        gridEl.appendChild(btn);
      });

      this._syncUI();
    };

    nodeType.prototype._updateVisiblePresets = function () {
      if (!this.properties) this.properties = {};
      this.properties.ui_ar_presets = [...this._enabledPresets];
      this._renderARButtons();

      const width = Math.max(MIN_NODE_W, Number(this.size?.[0]) || DEFAULT_NODE_W);
      const fitted = this._fitNodeHeightToContent(width);
      this.size[0] = fitted[0];
      this.size[1] = fitted[1];
      if (this._dsMinSize) {
        this._dsMinSize[1] = fitted[1];
      }
      this._syncDomGeometry();
      this.setDirtyCanvas(true, true);

      requestAnimationFrame(() => {
        const reFitted = this._fitNodeHeightToContent(this.size?.[0] || width);
        if (Math.abs((this.size?.[1] || 0) - reFitted[1]) > 0.5) {
          this.size[1] = reFitted[1];
          if (this._dsMinSize) this._dsMinSize[1] = reFitted[1];
          this._syncDomGeometry();
          this.setDirtyCanvas(true, true);
        }
      });
    };

    nodeType.prototype._toggleGearPopover = function (anchorEl) {
      if (this._activeGearPopover) {
        const isSame = this._activeGearAnchor && (this._activeGearAnchor === anchorEl || this._activeGearAnchor.contains(anchorEl));
        this._closeGearPopover();
        if (isSame) return;
      }
      this._openGearPopover(anchorEl);
    };

    nodeType.prototype._toggleResolutionGearPopover = function (anchorEl) {
      return this._toggleGearPopover(anchorEl);
    };

    nodeType.prototype._openResolutionGearPopover = function (anchorEl) {
      return this._openGearPopover(anchorEl);
    };

    nodeType.prototype._closeGearPopover = function () {
      if (this._activeGearPopover) {
        if (this._activeGearAnchor?.classList) {
          this._activeGearAnchor.classList.remove("is-active");
        }
        this._activeGearPopover.remove();
        this._activeGearPopover = null;
        this._activeGearAnchor = null;
      }
    };

    nodeType.prototype._findToolboxAnchor = function () {
      return (
        document.querySelector(".ds-actionbar-gear-btn") ||
        document.querySelector('.selection-toolbox [aria-label*="Settings"]') ||
        document.querySelector('.selection-toolbox [title*="Settings"]') ||
        document.querySelector(".selection-toolbox") ||
        document.body
      );
    };

    nodeType.prototype._openGearPopover = function (anchorEl) {
      this._closeGearPopover();
      document.querySelectorAll(".ds-res-settings-popover").forEach(el => el.remove());

      const anchor = anchorEl || this._findToolboxAnchor();
      const popover = document.createElement("div");
      popover.className = "ds-res-settings-popover";
      popover.dataset.dsThemed = "true";

      if (window.DSGlobalTheme?.applyToElement) {
        window.DSGlobalTheme.applyToElement(popover);
      }

      const head = document.createElement("div");
      head.className = "ds-res-pop-head";
      head.innerHTML = `
        <div class="ds-res-pop-title-wrap">
          <span class="ds-res-pop-title">Aspect Ratio Presets</span>
          <span class="ds-res-pop-subtitle">Choose visible ratio buttons</span>
        </div>
        <button type="button" class="ds-res-pop-close-btn" title="Close (Esc)">✕</button>
      `;
      popover.appendChild(head);

      const body = document.createElement("div");
      body.className = "ds-res-pop-body";

      PRESET_GROUPS.forEach(group => {
        const groupTitle = document.createElement("div");
        groupTitle.className = "ds-res-pop-section-title";
        groupTitle.textContent = group.name;
        body.appendChild(groupTitle);

        const grid = document.createElement("div");
        grid.className = "ds-res-preset-grid";

        group.keys.forEach(key => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "ds-res-preset-chip";
          chip.dataset.key = key;
          chip.textContent = key;
          if (this._enabledPresets.includes(key)) {
            chip.classList.add("is-active");
          }

          chip.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = this._enabledPresets.indexOf(key);
            if (idx >= 0) {
              if (this._enabledPresets.length > 1) {
                this._enabledPresets.splice(idx, 1);
                chip.classList.remove("is-active");
              }
            } else {
              this._enabledPresets.push(key);
              chip.classList.add("is-active");
            }
            this._updateVisiblePresets();
          });

          grid.appendChild(chip);
        });

        body.appendChild(grid);
      });
      popover.appendChild(body);

      const footer = document.createElement("div");
      footer.className = "ds-res-pop-footer";

      const defBtn = document.createElement("button");
      defBtn.type = "button";
      defBtn.className = "ds-res-pop-action-btn";
      defBtn.textContent = "Default";
      defBtn.title = "Reset to default 5 presets";
      defBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._enabledPresets = [...DEFAULT_PRESETS];
        popover.querySelectorAll(".ds-res-preset-chip").forEach(chip => {
          chip.classList.toggle("is-active", this._enabledPresets.includes(chip.dataset.key));
        });
        this._updateVisiblePresets();
      });

      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "ds-res-pop-action-btn";
      allBtn.textContent = "Select All";
      allBtn.title = "Enable all aspect ratios";
      allBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._enabledPresets = ASPECT_RATIOS.map(a => a.key);
        popover.querySelectorAll(".ds-res-preset-chip").forEach(chip => {
          chip.classList.add("is-active");
        });
        this._updateVisiblePresets();
      });

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "ds-res-pop-action-btn";
      clearBtn.textContent = "Clear";
      clearBtn.title = "Keep only active ratio";
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._enabledPresets = [this._resState.aspect || DEFAULT_AR];
        popover.querySelectorAll(".ds-res-preset-chip").forEach(chip => {
          chip.classList.toggle("is-active", this._enabledPresets.includes(chip.dataset.key));
        });
        this._updateVisiblePresets();
      });

      footer.append(defBtn, allBtn, clearBtn);
      popover.appendChild(footer);

      head.querySelector(".ds-res-pop-close-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeGearPopover();
      });

      document.body.appendChild(popover);
      this._activeGearPopover = popover;
      this._activeGearAnchor = anchor;
      if (anchor?.classList) anchor.classList.add("is-active");

      const updatePosition = () => {
        if (!popover || !popover.isConnected) return;
        const currentAnchor = anchor && anchor.isConnected ? anchor : this._findToolboxAnchor();
        if (!currentAnchor || !currentAnchor.isConnected) {
          this._closeGearPopover();
          return;
        }

        const rect = currentAnchor.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();

        let top = rect.bottom + 6;
        let left = rect.left;

        if (left + popRect.width > window.innerWidth - 12) {
          left = window.innerWidth - popRect.width - 12;
        }
        if (left < 12) left = 12;

        if (top + popRect.height > window.innerHeight - 12) {
          const aboveTop = rect.top - popRect.height - 6;
          if (aboveTop >= 12) {
            top = aboveTop;
          } else {
            top = Math.max(12, window.innerHeight - popRect.height - 12);
          }
        }

        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
      };

      updatePosition();

      const onPointerDown = (e) => {
        if (popover.contains(e.target) || (anchor && anchor.contains(e.target))) return;
        this._closeGearPopover();
        cleanup();
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          this._closeGearPopover();
          cleanup();
        }
      };

      const cleanup = () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };

      setTimeout(() => {
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
      }, 10);
    };

    nodeType.prototype._buildResolutionUI = function () {
      const card = Card({ className: "ds-res-card" });

      const preview = document.createElement("div");
      preview.className = "ds-res-preview";
      const previewValue = document.createElement("div");
      previewValue.className = "ds-res-preview-value";
      const previewMeta = document.createElement("div");
      previewMeta.className = "ds-res-preview-meta";
      preview.append(previewValue, previewMeta);
      card.body.appendChild(preview);
      card.root._preview = previewValue;
      card.root._previewMeta = previewMeta;

      const label = document.createElement("div");
      label.className = "ds-res-section-label";
      label.textContent = "Aspect Ratio";
      card.body.appendChild(label);

      const grid = document.createElement("div");
      grid.className = "ds-res-ar-grid";
      card.body.appendChild(grid);
      card.root._arGrid = grid;

      this._renderARButtons(grid);

      const controls = document.createElement("div");
      controls.className = "ds-res-controls";

      const mpStepper = Stepper({
        min: MIN_MP,
        max: MAX_MP,
        step: 0.1,
        value: Number(this._resState.mp) || DEFAULT_MP,
        onChange: (val) => this._setMP(val)
      });
      const mpField = Field({
        label: "Megapixels",
        control: mpStepper.root
      });
      card.root._mpInput = mpStepper.input;

      const divStepper = Stepper({
        min: 1,
        max: 1024,
        step: 8,
        value: Number(this._resState.divisible) || DEFAULT_DIVISIBLE,
        onChange: (val) => this._setDivisible(val)
      });
      const divField = Field({
        label: "Divisible By",
        control: divStepper.root
      });
      card.root._divInput = divStepper.input;

      controls.append(mpField.root, divField.root);
      card.body.appendChild(controls);

      const note = document.createElement("div");
      note.className = "ds-res-note";
      note.innerHTML = `
        <span>Resolution follows MP + selected AR</span>
        <span>Snapped to divisibility</span>
      `;
      card.body.appendChild(note);

      return card.root;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      if (oldConfigure) oldConfigure.apply(this, arguments);

      if (!this.properties) this.properties = {};

      const aspect = String(this.properties.ui_aspect || DEFAULT_AR);
      const mp = Number(this.properties.ui_megapixels);
      const div = Number(this.properties.ui_divisible);
      const savedW = Number(this.properties.res_width);
      const savedH = Number(this.properties.res_height);
      const savedVersion = Number(this.properties.ui_version) || 0;

      this._enabledPresets = parsePresets(this.properties.ui_ar_presets, aspect);
      this.properties.ui_ar_presets = [...this._enabledPresets];

      this._resState = {
        aspect: getAR(aspect).key,
        mp: Number.isFinite(mp) ? clamp(mp, MIN_MP, MAX_MP) : DEFAULT_MP,
        divisible: Number.isFinite(div) ? clamp(Math.round(div), 1, 1024) : DEFAULT_DIVISIBLE,
      };

      if (savedW >= MIN_DIM && savedH >= MIN_DIM) {
        const mult = this._resState.divisible || DEFAULT_DIVISIBLE;
        this._wWidget.value = clamp(snap(savedW, mult), MIN_DIM, MAX_DIM);
        this._hWidget.value = clamp(snap(savedH, mult), MIN_DIM, MAX_DIM);
      } else {
        const ar = getAR(this._resState.aspect);
        const dims = dimensionsFromMP(this._resState.mp, ar.ratio, this._resState.divisible);
        this._wWidget.value = dims.w;
        this._hWidget.value = dims.h;
      }

      this.properties.ui_version = String(UI_VERSION);

      this._renderARButtons();
      const loadedWidth = Math.max(MIN_NODE_W, Number(this.size?.[0]) || DEFAULT_NODE_W);
      const fitted = this._fitNodeHeightToContent(loadedWidth);
      this.size = [loadedWidth, fitted[1]];
      this._dsMinSize = [MIN_NODE_W, MIN_NODE_H];
      this._persist();

      setTimeout(() => {
        try {
          this._hideOutputWidgets();
          this._syncDomGeometry();
          this._syncCollapsedState();
          this._syncUI();
          const reFitted = this._fitNodeHeightToContent(this.size?.[0] || loadedWidth);
          if (Math.abs((this.size?.[1] || 0) - reFitted[1]) > 0.5) {
            this.size[1] = reFitted[1];
          }
          if (window.DSGlobalTheme && this.dom) {
            window.DSGlobalTheme.bindNode(this.dom, this);
          }
          this.setDirtyCanvas(true, true);
        } catch (e) {
          console.warn("[DS_Resolution] configure:", e);
        }
      }, 20);
    };

    nodeType.prototype.computeSize = function () {
      return [MIN_NODE_W, MIN_NODE_H];
    };

    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (!Array.isArray(size) || this._dsInResize) return;
      this._dsInResize = true;
      try {
        const width = Math.max(MIN_NODE_W, Number(size[0]) || DEFAULT_NODE_W);
        const fitted = this._fitNodeHeightToContent(width);
        size[0] = width;
        size[1] = fitted[1];
        if (this.size) {
          this.size[0] = width;
          this.size[1] = fitted[1];
        }
        this._syncDomGeometry();
        this._syncCollapsedState();
        this.setDirtyCanvas(true, true);
      } finally {
        this._dsInResize = false;
      }
      if (oldResize) oldResize.apply(this, arguments);
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._closeGearPopover();
      if (oldRemoved) return oldRemoved.apply(this, arguments);
    };

    const oldDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function () {
      this._syncCollapsedState();
      const fitted = this._fitNodeHeightToContent ? this._fitNodeHeightToContent(this.size?.[0] || DEFAULT_NODE_W) : null;
      if (fitted && Math.abs((this.size?.[1] || 0) - fitted[1]) > 0.5) {
        this.size[1] = fitted[1];
        this.setDirtyCanvas(true, true);
      }
      if (oldDrawForeground) return oldDrawForeground.apply(this, arguments);
    };
  },
});

