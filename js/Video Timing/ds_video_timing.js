// DS Video Timing — compact duration / FPS selector for video workflows.
// Presets stay inline with a fifth editable "Custom" field. No expandable
// custom panels are used, so switching between presets never changes node size.
import { app } from "/scripts/app.js";

const cssHref = "/extensions/DeathshotArsenal/Video Timing/ds_video_timing.css";
if (!document.querySelector(`link[href="${cssHref}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssHref;
  document.head.appendChild(link);
}

const DURATION_PRESETS = [5, 10, 15, 20];
const FPS_PRESETS = [24, 30, 45, 60];
const MIN_DURATION = 0.1;
const MAX_DURATION = 3600;
const MIN_FPS = 1;
const MAX_FPS = 240;
const MIN_W = 360;
const MIN_H = 150;
const UI_VERSION = 4;

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

function isCollapsed(node) {
  return node?.flags?.collapsed === true || node?.collapsed === true;
}

app.registerExtension({
  name: "DeathshotArsenal.DSVideoTiming",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_VideoTiming") return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;

    nodeType.prototype.computeSize = function () {
      return [MIN_W, getVideoTimingNodeHeight(this)];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      this._dsVideoTimingMin = [MIN_W, MIN_H];
      this._dsVideoTimingVersion = UI_VERSION;
      this._dsVideoTimingSizeInitialized = false;

      if (!this.properties) this.properties = {};
      const defaults = {
        duration: "5",
        fps: "24",
        ui_duration: "5",
        ui_fps: "24",
        ui_version: String(UI_VERSION),
        ui_duration_custom: "0",
        ui_fps_custom: "0",
      };
      for (const [k, v] of Object.entries(defaults)) {
        if (this.properties[k] === undefined) this.properties[k] = v;
      }

      let dw = this.widgets?.find(w => w.name === "duration");
      let fw = this.widgets?.find(w => w.name === "fps");
      if (!dw) {
        dw = this.addWidget("number", "duration", Number(this.properties.duration) || 5, () => {}, {
          min: MIN_DURATION, max: MAX_DURATION, step: 0.1,
        });
      }
      if (!fw) {
        fw = this.addWidget("number", "fps", Number(this.properties.fps) || 24, () => {}, {
          min: MIN_FPS, max: MAX_FPS, step: 1,
        });
      }
      this._durationWidget = dw;
      this._fpsWidget = fw;
      this._hideVideoTimingWidgets();

      this._vtState = {
        duration: cleanNumber(this.properties.duration, 5, MIN_DURATION, MAX_DURATION),
        fps: cleanNumber(this.properties.fps, 24, MIN_FPS, MAX_FPS),
      };
      this._vtCustomDuration = String(this.properties.ui_duration_custom) === "1";
      this._vtCustomFPS = String(this.properties.ui_fps_custom) === "1";

      this.dom = buildUI(this);
      this.dom.dataset.dsThemed = "true";

      this.domWidget = this.addDOMWidget("ds_video_timing_ui", "div", this.dom, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
      });

      if (this.domWidget?.options) {
        this.domWidget.options.getMinHeight = () => getVideoTimingBodyHeight(this);
        this.domWidget.options.getMaxHeight = () => getVideoTimingBodyHeight(this);
      }
      if (this.domWidget) {
        this.domWidget.computeSize = () => [0, getVideoTimingBodyHeight(this)];
        this.domWidget.computeLayoutSize = () => ({
          minHeight: getVideoTimingBodyHeight(this),
          maxHeight: getVideoTimingBodyHeight(this),
          minWidth: 0,
        });
      }
      try {
        // Let LiteGraph keep ownership of node drag/resize hit areas.
        // Only the actual controls opt back into pointer events.
        if (this.domWidget?.element?.style) {
          this.domWidget.element.style.background = "transparent";
          this.domWidget.element.style.pointerEvents = "none";
        }
        if (this.domWidget?.container?.style) {
          this.domWidget.container.style.background = "transparent";
          this.domWidget.container.style.pointerEvents = "none";
        }
      } catch (_) {}

      this._syncVideoTimingState(true);
      this._hideVideoTimingWidgets();

      requestAnimationFrame(() => {
        if (!this._dsVideoTimingSizeInitialized) {
          const currentW = Number(this.size?.[0]) || 0;
          if (currentW < MIN_W) this.size[0] = MIN_W;
          const desiredH = getVideoTimingNodeHeight(this);
          // Reset only nodes carrying an older layout version or obviously bad height.
          const storedVersion = Number(this.properties.ui_version || 0);
          if (storedVersion < UI_VERSION || !this.size || this.size[1] > desiredH + 90 || this.size[1] < MIN_H) {
            this.size[1] = desiredH;
            this.properties.ui_version = String(UI_VERSION);
          }
          this._dsVideoTimingSizeInitialized = true;
        }
        this._syncVideoTimingState(true);
        this._syncCollapsedVideoTiming();
        this.setDirtyCanvas(true, true);
      });

      return result;
    };

    nodeType.prototype._hideVideoTimingWidgets = function () {
      for (const w of this.widgets || []) {
        if (w === this._durationWidget || w === this._fpsWidget || w?.name === "duration" || w?.name === "fps") {
          w.hidden = true;
          w.computeSize = () => [0, 0];
          w.serialize = true;
        }
      }
    };

    nodeType.prototype._syncVideoTimingState = function (updateWidgets = true) {
      if (!this._vtState || !this.dom) return;
      const d = cleanNumber(this._vtState.duration, 5, MIN_DURATION, MAX_DURATION);
      const f = cleanNumber(this._vtState.fps, 24, MIN_FPS, MAX_FPS);
      const frames = Math.max(1, Math.round(d * f));

      this._vtState.duration = d;
      this._vtState.fps = f;
      this.properties.duration = String(d);
      this.properties.fps = String(f);
      this.properties.ui_duration = String(d);
      this.properties.ui_fps = String(f);
      this.properties.ui_version = String(UI_VERSION);
      this.properties.ui_duration_custom = this._vtCustomDuration ? "1" : "0";
      this.properties.ui_fps_custom = this._vtCustomFPS ? "1" : "0";

      if (updateWidgets) {
        if (this._durationWidget) this._durationWidget.value = d;
        if (this._fpsWidget) this._fpsWidget.value = f;
      }

      this._vtSummaryText = `${formatNumber(d)}s · ${formatNumber(f)}fps · ${frames} frames`;

      this.dom.querySelectorAll(".ds-vt-duration-btn[data-value]").forEach(btn => {
        const v = Number(btn.dataset.value);
        btn.classList.toggle("selected", Number.isFinite(v) && Math.abs(v - d) < 1e-9 && !this._vtCustomDuration);
      });
      this._vtDurationInput.classList.toggle("custom-active", !!this._vtCustomDuration);
      this._vtDurationInput.value = this._vtCustomDuration ? formatNumber(d) : "";

      this.dom.querySelectorAll(".ds-vt-fps-btn[data-value]").forEach(btn => {
        const v = Number(btn.dataset.value);
        btn.classList.toggle("selected", Number.isFinite(v) && Math.abs(v - f) < 1e-9 && !this._vtCustomFPS);
      });
      this._vtFpsInput.classList.toggle("custom-active", !!this._vtCustomFPS);
      this._vtFpsInput.value = this._vtCustomFPS ? formatNumber(f) : "";

      this._hideVideoTimingWidgets();
      this.setDirtyCanvas(true, true);
    };

    nodeType.prototype._setVideoDuration = function (value, custom = false) {
      const d = cleanNumber(value, this._vtState?.duration || 5, MIN_DURATION, MAX_DURATION);
      this._vtState.duration = d;
      this._vtCustomDuration = !!custom;
      saveVideoTimingLocal(this);
      this._syncVideoTimingState(true);
      this._resizeVideoTimingNode();
    };

    nodeType.prototype._setVideoFPS = function (value, custom = false) {
      const f = cleanNumber(value, this._vtState?.fps || 24, MIN_FPS, MAX_FPS);
      this._vtState.fps = f;
      this._vtCustomFPS = !!custom;
      saveVideoTimingLocal(this);
      this._syncVideoTimingState(true);
      this._resizeVideoTimingNode();
    };

    nodeType.prototype._resizeVideoTimingNode = function () {
      // Keep the real minimum, but never overwrite a user's deliberate size.
      requestAnimationFrame(() => {
        if (!this.size) return;
        const minH = getVideoTimingNodeHeight(this);
        if (this.size[0] < MIN_W) this.size[0] = MIN_W;
        if (this.size[1] < minH) this.size[1] = minH;
        this.setDirtyCanvas(true, true);
      });
    };

    nodeType.prototype.onConfigure = function (info) {
      const result = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
      const p = this.properties || {};
      const saved = loadVideoTimingLocal(this);

      const durationSource = p.duration !== undefined ? p.duration : saved?.duration;
      const fpsSource = p.fps !== undefined ? p.fps : saved?.fps;
      this._vtState = {
        duration: cleanNumber(durationSource, 5, MIN_DURATION, MAX_DURATION),
        fps: cleanNumber(fpsSource, 24, MIN_FPS, MAX_FPS),
      };
      this._vtCustomDuration = String(p.ui_duration_custom ?? (saved?.customDuration ? "1" : "0")) === "1";
      this._vtCustomFPS = String(p.ui_fps_custom ?? (saved?.customFPS ? "1" : "0")) === "1";

      setTimeout(() => {
        this._syncVideoTimingState(true);
        this._resizeVideoTimingNode();
        this._syncCollapsedVideoTiming();
      }, 0);
      return result;
    };

    nodeType.prototype.onDrawForeground = function (ctx) {
      this._syncCollapsedVideoTiming();
      if (isCollapsed(this) || !this._vtSummaryText) return;

      // Compact summary shares the empty top band with the native output labels.
      const x = 10;
      const y = 48;
      const rightReserve = 82;
      const maxWidth = Math.max(90, this.size[0] - rightReserve - x);

      ctx.save();
      ctx.font = "700 10px Arial, sans-serif";
      ctx.fillStyle = "#cbd5e5";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const text = this._vtSummaryText;
      const measured = ctx.measureText(text).width;
      if (measured <= maxWidth) {
        ctx.fillText(text, x, y);
      } else {
        let out = text;
        while (out.length > 3 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
        ctx.fillText(`${out}…`, x, y);
      }
      ctx.restore();
    };

    nodeType.prototype._syncCollapsedVideoTiming = function () {
      if (!this.dom) return;
      this.dom.style.display = isCollapsed(this) ? "none" : "block";
    };
  },
});

function saveVideoTimingLocal(node) {
  try {
    if (!node?.id || !node?._vtState) return;
    localStorage.setItem(
      `DS_VideoTiming:${node.id}`,
      JSON.stringify({
        ...node._vtState,
        customDuration: !!node._vtCustomDuration,
        customFPS: !!node._vtCustomFPS,
      })
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

function getVideoTimingBodyHeight() {
  // Fixed: both custom values live inline as ordinary inputs.
  return 112;
}

function getVideoTimingNodeHeight() {
  return Math.max(MIN_H, 32 + getVideoTimingBodyHeight());
}

function buildUI(node) {
  const wrap = document.createElement("div");
  wrap.className = "ds-video-timing";

  wrap.innerHTML = `
    <div class="ds-vt-section">
      <div class="ds-vt-label">Duration (seconds)</div>
      <div class="ds-vt-buttons">
        ${DURATION_PRESETS.map(v => `<button type="button" class="ds-vt-btn ds-vt-duration-btn" data-value="${v}">${v}</button>`).join("")}
        <input class="ds-vt-custom-input ds-vt-duration-input" type="number" step="0.1" min="${MIN_DURATION}" max="${MAX_DURATION}" inputmode="decimal" placeholder="Custom" aria-label="Custom duration" />
      </div>
    </div>

    <div class="ds-vt-section">
      <div class="ds-vt-label">Frame rate (FPS)</div>
      <div class="ds-vt-buttons">
        ${FPS_PRESETS.map(v => `<button type="button" class="ds-vt-btn ds-vt-fps-btn" data-value="${v}">${v}</button>`).join("")}
        <input class="ds-vt-custom-input ds-vt-fps-input" type="number" step="1" min="${MIN_FPS}" max="${MAX_FPS}" inputmode="numeric" placeholder="Custom" aria-label="Custom FPS" />
      </div>
    </div>
  `;

  node._vtDurationInput = wrap.querySelector(".ds-vt-duration-input");
  node._vtFpsInput = wrap.querySelector(".ds-vt-fps-input");

  wrap.querySelectorAll(".ds-vt-duration-btn[data-value]").forEach(btn => {
    btn.addEventListener("click", () => {
      node._setVideoDuration(Number(btn.dataset.value), false);
    });
  });

  wrap.querySelectorAll(".ds-vt-fps-btn[data-value]").forEach(btn => {
    btn.addEventListener("click", () => {
      node._setVideoFPS(Number(btn.dataset.value), false);
    });
  });

  const handleDurationInput = () => {
    const raw = node._vtDurationInput.value.trim();
    if (!raw) return;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= MIN_DURATION && value <= MAX_DURATION) {
      node._setVideoDuration(value, true);
    }
  };

  const handleFPSInput = () => {
    const raw = node._vtFpsInput.value.trim();
    if (!raw) return;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= MIN_FPS && value <= MAX_FPS) {
      node._setVideoFPS(value, true);
    }
  };

  // While typing, update as soon as the text is a valid number.
  node._vtDurationInput.addEventListener("input", handleDurationInput);
  node._vtFpsInput.addEventListener("input", handleFPSInput);
  node._vtDurationInput.addEventListener("change", handleDurationInput);
  node._vtFpsInput.addEventListener("change", handleFPSInput);
  node._vtDurationInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleDurationInput();
      node._vtDurationInput.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      node._vtCustomDuration = false;
      node._syncVideoTimingState(false);
    }
  });
  node._vtFpsInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFPSInput();
      node._vtFpsInput.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      node._vtCustomFPS = false;
      node._syncVideoTimingState(false);
    }
  });

  return wrap;
}
