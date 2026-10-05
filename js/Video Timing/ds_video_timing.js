import { app } from "/scripts/app.js";
import {
  Card,
  Slider,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  installDSUI,
} from "../UIElements/index.js";

installDSUI();

const CSS_HREF = "/extensions/DeathshotArsenal/Video Timing/ds_video_timing.css";
if (!document.querySelector(`link[data-ds-video-timing="1"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  link.dataset.dsVideoTiming = "1";
  document.head.appendChild(link);
}

const MIN_DURATION = 0.1;
const MAX_DURATION = 3600;
const DEFAULT_SLIDER_MAX_DURATION = 60;
const MIN_FPS = 1;
const MAX_FPS = 240;
const DEFAULT_SLIDER_MAX_FPS = 60;
const MIN_W = 340;
const CARD_MARGIN = 5;
const NATURAL_CARD_HEIGHT = 142;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function cleanNumber(n, fallback, lo, hi) {
  const v = Number(n);
  return Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}

function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(2)));
}

function getCardHeight(node) {
  const card = node?._vtCard?.root || node?.dom;
  if (card) {
    const h = card.offsetHeight || card.scrollHeight;
    if (h > 50) {
      return Math.ceil(h);
    }
  }
  return NATURAL_CARD_HEIGHT;
}

function getFittedWidgetHeight(node) {
  return getCardHeight(node) + (CARD_MARGIN * 2);
}

function getNodeFittedHeight(node) {
  const widgetY = Number(node?.domWidget?.y ?? (typeof node?._getWidgetY === "function" ? node._getWidgetY() : 0)) || 90;
  const widgetH = getFittedWidgetHeight(node);
  return Math.ceil(widgetY + widgetH);
}

function hideWidgets(node) {
  if (!node?.widgets) return;
  for (const w of node.widgets) {
    if (w === node.domWidget || w?.name === "ds_ui") continue;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, 0];
    w.draw = () => {};
    w.y = -9999;
    w.computedHeight = 0;
    for (const el of [w.inputEl, w.element]) {
      if (el?.style) {
        el.style.display = "none";
        el.style.visibility = "hidden";
        el.style.pointerEvents = "none";
      }
    }
  }
}

function fitNodeHeight(node) {
  if (!node || !Array.isArray(node.size)) return;
  hideWidgets(node);
  const curW = Math.max(MIN_W, Number(node.size[0]) || MIN_W);
  const widgetH = getFittedWidgetHeight(node);
  const widgetY = Number(node.domWidget?.y ?? (typeof node._getWidgetY === "function" ? node._getWidgetY() : 0)) || 90;
  const targetH = Math.ceil(widgetY + widgetH);

  node.size[0] = curW;
  node.size[1] = targetH;
  node.min_size = [MIN_W, targetH];

  if (node.domWidget) {
    node.domWidget.computeSize = () => [MIN_W, widgetH];
    node.domWidget.computeLayoutSize = () => ({ minWidth: MIN_W, minHeight: widgetH, maxHeight: widgetH });
  }

  node.setDirtyCanvas?.(true, true);
}

function saveVideoTimingLocal(node) {
  try {
    if (!node?.id || !node?._vtState) return;
    localStorage.setItem(
      `DS_VideoTiming:${node.id}`,
      JSON.stringify(node._vtState)
    );
  } catch (_) {}
}

function loadVideoTimingLocal(node) {
  try {
    if (!node?.id) return null;
    const raw = localStorage.getItem(`DS_VideoTiming:${node.id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function theme(root, node) {
  try {
    window.DSGlobalTheme?.bindNode?.(root, node);
    window.DSGlobalTheme?.applyNodeBase?.(node);
  } catch (_) {}
}

function buildUI(node) {
  const initDuration = cleanNumber(node._vtState?.duration, 5, MIN_DURATION, MAX_DURATION);
  const initFps = cleanNumber(node._vtState?.fps, 24, MIN_FPS, MAX_FPS);
  const initFrames = Math.max(1, Math.round(initDuration * initFps));

  let durationMax = Math.max(DEFAULT_SLIDER_MAX_DURATION, Math.ceil(initDuration));
  const durationSlider = Slider({
    label: "Duration (s)",
    min: MIN_DURATION,
    max: durationMax,
    step: 0.1,
    value: initDuration,
    showNumber: true,
    onChange: (val) => {
      node._setVideoDuration(val);
    },
  });

  let fpsMax = Math.max(DEFAULT_SLIDER_MAX_FPS, Math.ceil(initFps));
  const fpsSlider = Slider({
    label: "Frame Rate (FPS)",
    min: MIN_FPS,
    max: fpsMax,
    step: 1,
    value: initFps,
    showNumber: true,
    onChange: (val) => {
      node._setVideoFPS(val);
    },
  });

  const card = Card({
    title: "Video Timing",
    icon: "clock",
    className: "ds-video-timing-card",
  });
  card.root.dataset.dsThemed = "true";

  card.root.style.setProperty("background", "var(--ds-color-card, #12151c)", "important");
  card.root.style.setProperty("background-color", "var(--ds-color-card, #12151c)", "important");
  card.root.style.setProperty("border", "1px solid var(--ds-color-card-border, #242a36)", "important");
  card.root.style.setProperty("border-radius", "var(--ds-radius-card, 8px)", "important");
  card.root.style.setProperty("padding", "var(--ds-card-padding, 10px)", "important");
  card.root.style.setProperty("box-sizing", "border-box", "important");
  card.root.style.setProperty("pointer-events", "auto", "important");

  const stats = document.createElement("div");
  stats.className = "ds-vt-stats";
  stats.innerHTML = `
    <div class="ds-vt-stat">
      <span class="ds-vt-stat-label">Duration</span>
      <span class="ds-vt-stat-val ds-vt-val-duration">${formatNumber(initDuration)}s</span>
    </div>
    <div class="ds-vt-stat-divider"></div>
    <div class="ds-vt-stat">
      <span class="ds-vt-stat-label">FPS</span>
      <span class="ds-vt-stat-val ds-vt-val-fps">${formatNumber(initFps)}</span>
    </div>
    <div class="ds-vt-stat-divider"></div>
    <div class="ds-vt-stat ds-vt-stat-accent">
      <span class="ds-vt-stat-label">Total Frames</span>
      <span class="ds-vt-stat-val ds-vt-val-frames">${initFrames}</span>
    </div>
  `;

  card.append(durationSlider.root, fpsSlider.root, stats);

  const stopPropagation = (e) => e.stopPropagation();

  card.root.addEventListener("pointerdown", stopPropagation);
  card.root.addEventListener("mousedown", stopPropagation);

  durationSlider.root.addEventListener("pointerdown", stopPropagation);
  durationSlider.root.addEventListener("mousedown", stopPropagation);
  durationSlider.root.addEventListener("wheel", stopPropagation, { passive: false });

  if (durationSlider.input) {
    durationSlider.input.addEventListener("pointerdown", stopPropagation);
    durationSlider.input.addEventListener("mousedown", stopPropagation);
    durationSlider.input.addEventListener("keydown", stopPropagation);
    durationSlider.input.addEventListener("keyup", stopPropagation);
    durationSlider.input.addEventListener("wheel", stopPropagation, { passive: false });
    durationSlider.input.addEventListener("input", () => {
      const val = parseFloat(durationSlider.input.value);
      if (Number.isFinite(val) && val > durationMax && val <= MAX_DURATION) {
        durationMax = Math.min(MAX_DURATION, Math.ceil(val));
        node._vtDurationMax = durationMax;
        durationSlider.setRange(MIN_DURATION, durationMax, 0.1);
      }
    });
  }

  fpsSlider.root.addEventListener("pointerdown", stopPropagation);
  fpsSlider.root.addEventListener("mousedown", stopPropagation);
  fpsSlider.root.addEventListener("wheel", stopPropagation, { passive: false });

  if (fpsSlider.input) {
    fpsSlider.input.addEventListener("pointerdown", stopPropagation);
    fpsSlider.input.addEventListener("mousedown", stopPropagation);
    fpsSlider.input.addEventListener("keydown", stopPropagation);
    fpsSlider.input.addEventListener("keyup", stopPropagation);
    fpsSlider.input.addEventListener("wheel", stopPropagation, { passive: false });
    fpsSlider.input.addEventListener("input", () => {
      const val = parseFloat(fpsSlider.input.value);
      if (Number.isFinite(val) && val > fpsMax && val <= MAX_FPS) {
        fpsMax = Math.min(MAX_FPS, Math.ceil(val));
        node._vtFpsMax = fpsMax;
        fpsSlider.setRange(MIN_FPS, fpsMax, 1);
      }
    });
  }

  node._vtCard = card;
  node._vtDurationSlider = durationSlider;
  node._vtFpsSlider = fpsSlider;
  node._vtDurationMax = durationMax;
  node._vtFpsMax = fpsMax;
  node._vtValDuration = stats.querySelector(".ds-vt-val-duration");
  node._vtValFps = stats.querySelector(".ds-vt-val-fps");
  node._vtValFrames = stats.querySelector(".ds-vt-val-frames");

  return card;
}

app.registerExtension({
  name: "DeathshotArsenal.DSVideoTiming",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_VideoTiming") return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;
    const oldResize = nodeType.prototype.onResize;

    nodeType.prototype.computeSize = function (out) {
      const targetH = getNodeFittedHeight(this);
      if (Array.isArray(out)) {
        out[0] = MIN_W;
        out[1] = targetH;
        return out;
      }
      return [MIN_W, targetH];
    };

    nodeType.prototype.onResize = function (size) {
      const targetH = getNodeFittedHeight(this);
      if (size) {
        size[0] = Math.max(MIN_W, Number(size[0]) || MIN_W);
        size[1] = targetH;
      }
      const r = oldResize?.apply(this, arguments);
      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(this.size[0]) || MIN_W);
        this.size[1] = targetH;
      }
      this.setDirtyCanvas(true, true);
      return r;
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;

      this.resizable = true;

      if (!this.properties) this.properties = {};
      const defaults = {
        duration: "5",
        fps: "24",
      };
      for (const [k, v] of Object.entries(defaults)) {
        if (this.properties[k] === undefined) this.properties[k] = v;
      }

      let dw = this.widgets?.find((w) => w.name === "duration");
      let fw = this.widgets?.find((w) => w.name === "fps");
      if (!dw) {
        dw = this.addWidget("number", "duration", Number(this.properties.duration) || 5, () => {}, {
          min: MIN_DURATION,
          max: MAX_DURATION,
          step: 0.1,
        });
      }
      if (!fw) {
        fw = this.addWidget("number", "fps", Number(this.properties.fps) || 24, () => {}, {
          min: MIN_FPS,
          max: MAX_FPS,
          step: 1,
        });
      }
      this._durationWidget = dw;
      this._fpsWidget = fw;

      this._vtState = {
        duration: cleanNumber(this.properties.duration, 5, MIN_DURATION, MAX_DURATION),
        fps: cleanNumber(this.properties.fps, 24, MIN_FPS, MAX_FPS),
      };

      const card = buildUI(this);
      this.dom = card.root;

      const domWidget = this.addDOMWidget("ds_ui", "custom", card.root, {
        serialize: false,
        margin: CARD_MARGIN,
        getMinHeight: () => getFittedWidgetHeight(this),
        getMaxHeight: () => {
          const widgetY = Number(domWidget?.y ?? (typeof this._getWidgetY === "function" ? this._getWidgetY() : 0)) || 90;
          const nodeHeight = Number(this.size?.[1] ?? 0);
          return Math.max(getFittedWidgetHeight(this), nodeHeight - widgetY);
        },
      });

      this.domWidget = domWidget;
      this._getWidgetY = () => {
        if (typeof domWidget?.y === "number" && domWidget.y > 0) return domWidget.y;
        return 90;
      };
      hideWidgets(this);

      this.setSize = function (size) {
        const targetH = getNodeFittedHeight(this);
        const w = Math.max(MIN_W, Number(size?.[0]) || MIN_W);
        this.size = [w, targetH];
        this.setDirtyCanvas(true, true);
      };

      const oldDrawBg = this.onDrawBackground;
      this.onDrawBackground = function () {
        const targetH = getNodeFittedHeight(this);
        if (this.size && this.size[1] !== targetH) {
          this.size[1] = targetH;
        }
        return oldDrawBg?.apply(this, arguments);
      };

      normalizeDSWidgetHost(card.root, this, { shell: false });
      protectDSResizeCorners(this);
      theme(card.root, this);

      fitNodeHeight(this);
      this._syncVideoTimingState(true);

      requestAnimationFrame(() => {
        fitNodeHeight(this);
        card.root.style.setProperty("background", "var(--ds-color-card, #12151c)", "important");
        card.root.style.setProperty("background-color", "var(--ds-color-card, #12151c)", "important");
        card.root.style.setProperty("border", "1px solid var(--ds-color-card-border, #242a36)", "important");
        card.root.style.setProperty("border-radius", "var(--ds-radius-card, 8px)", "important");
        card.root.style.setProperty("padding", "var(--ds-card-padding, 10px)", "important");
        card.root.style.setProperty("box-sizing", "border-box", "important");
        card.root.style.setProperty("pointer-events", "auto", "important");
        this._syncVideoTimingState(true);
      });

      setTimeout(() => fitNodeHeight(this), 50);
      setTimeout(() => fitNodeHeight(this), 150);

      return result;
    };

    nodeType.prototype._hideVideoTimingWidgets = function () {
      hideWidgets(this);
    };

    nodeType.prototype._syncVideoTimingState = function (updateWidgets = true) {
      if (!this._vtState) return;
      const d = cleanNumber(this._vtState.duration, 5, MIN_DURATION, MAX_DURATION);
      const f = cleanNumber(this._vtState.fps, 24, MIN_FPS, MAX_FPS);
      const frames = Math.max(1, Math.round(d * f));

      this._vtState.duration = d;
      this._vtState.fps = f;
      this.properties.duration = String(d);
      this.properties.fps = String(f);

      if (updateWidgets) {
        if (this._durationWidget) this._durationWidget.value = d;
        if (this._fpsWidget) this._fpsWidget.value = f;
      }

      if (this._vtDurationSlider) {
        let maxD = this._vtDurationMax || DEFAULT_SLIDER_MAX_DURATION;
        if (d > maxD) {
          maxD = Math.min(MAX_DURATION, Math.ceil(d));
          this._vtDurationMax = maxD;
          this._vtDurationSlider.setRange(MIN_DURATION, maxD, 0.1);
        }
        this._vtDurationSlider.setValue(d, false);
      }

      if (this._vtFpsSlider) {
        let maxF = this._vtFpsMax || DEFAULT_SLIDER_MAX_FPS;
        if (f > maxF) {
          maxF = Math.min(MAX_FPS, Math.ceil(f));
          this._vtFpsMax = maxF;
          this._vtFpsSlider.setRange(MIN_FPS, maxF, 1);
        }
        this._vtFpsSlider.setValue(f, false);
      }

      if (this._vtValDuration) {
        this._vtValDuration.textContent = `${formatNumber(d)}s`;
      }
      if (this._vtValFps) {
        this._vtValFps.textContent = `${formatNumber(f)}`;
      }
      if (this._vtValFrames) {
        this._vtValFrames.textContent = `${frames}`;
      }

      this._hideVideoTimingWidgets();
      this.setDirtyCanvas(true, true);
    };

    nodeType.prototype._setVideoDuration = function (value) {
      const d = cleanNumber(value, this._vtState?.duration || 5, MIN_DURATION, MAX_DURATION);
      this._vtState.duration = d;
      saveVideoTimingLocal(this);
      this._syncVideoTimingState(true);
    };

    nodeType.prototype._setVideoFPS = function (value) {
      const f = cleanNumber(value, this._vtState?.fps || 24, MIN_FPS, MAX_FPS);
      this._vtState.fps = f;
      saveVideoTimingLocal(this);
      this._syncVideoTimingState(true);
    };

    nodeType.prototype.onConfigure = function (info) {
      const result = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
      const p = this.properties || {};
      const saved = loadVideoTimingLocal(this);

      const dw = this.widgets?.find((w) => w.name === "duration");
      const fw = this.widgets?.find((w) => w.name === "fps");

      const durationSource =
        dw?.value !== undefined ? dw.value : p.duration !== undefined ? p.duration : saved?.duration;
      const fpsSource =
        fw?.value !== undefined ? fw.value : p.fps !== undefined ? p.fps : saved?.fps;

      this._vtState = {
        duration: cleanNumber(durationSource, 5, MIN_DURATION, MAX_DURATION),
        fps: cleanNumber(fpsSource, 24, MIN_FPS, MAX_FPS),
      };

      setTimeout(() => {
        this._syncVideoTimingState(true);
        fitNodeHeight(this);
      }, 0);
      setTimeout(() => fitNodeHeight(this), 60);

      return result;
    };
  },
});
