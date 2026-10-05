import { app } from "/scripts/app.js";
import { Card, Slider, normalizeDSWidgetHost, protectDSResizeCorners, installDSUI } from "../UIElements/index.js";

const TYPE = "DS_OutpaintStitch";
const CSS = "/extensions/DeathshotArsenal/Outpaint/ds_outpaint_stitch.css";
const UI_KEY = "ds_stitch_state";

const MIN_W = 260;
const DEFAULT_W = 280;
const CARD_MARGIN = 5;
const NATURAL_CARD_HEIGHT = 74; // 10px top/bottom padding + two 24px slider rows + 6px gap = 74px
const MIN_WIDGET_HEIGHT = NATURAL_CARD_HEIGHT + (CARD_MARGIN * 2); // 84px

installDSUI();

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function loadState(node) {
  const p = node?.properties || {};
  const saved = p[UI_KEY] || {};
  let cm = saved.color_match ?? p.color_match ?? 100;
  if (cm <= 2.0 && cm > 0 && Number.isFinite(cm)) {
    cm = Math.round(cm * 100);
  }
  return {
    feather: clamp(Number(saved.feather ?? p.feather ?? 64), 0, 1024),
    color_match: clamp(Number(cm ?? 100), 0, 200),
  };
}

function persistState(node, state) {
  if (!node) return;
  node.properties ||= {};
  node.properties[UI_KEY] = { ...state };
  node.properties.feather = state.feather;
  node.properties.color_match = state.color_match;

  for (const w of node.widgets || []) {
    if (w.name === "feather") {
      w.value = state.feather;
    } else if (w.name === "color_match") {
      w.value = Number((state.color_match / 100).toFixed(4));
    }
  }
}

function hideNativeWidgets(node) {
  for (const w of node.widgets || []) {
    if (w.name === "feather" || w.name === "color_match") {
      w.hidden = true;
      w.computeSize = () => [0, -4];
      w.draw = () => {};
      w.serialize = true;
      if (w.element?.style) {
        w.element.style.display = "none";
        w.element.style.visibility = "hidden";
        w.element.style.width = "0";
        w.element.style.height = "0";
        w.element.style.margin = "0";
        w.element.style.padding = "0";
      }
    }
  }

  let fw = node.widgets?.find((w) => w.name === "feather");
  if (!fw && typeof node.addWidget === "function") {
    fw = node.addWidget("number", "feather", 64, () => {}, { min: 0, max: 1024, step: 1 });
    fw.hidden = true;
    fw.computeSize = () => [0, -4];
    fw.draw = () => {};
    fw.serialize = true;
  }

  let cw = node.widgets?.find((w) => w.name === "color_match");
  if (!cw && typeof node.addWidget === "function") {
    cw = node.addWidget("number", "color_match", 1.0, () => {}, { min: 0.0, max: 2.0, step: 0.01 });
    cw.hidden = true;
    cw.computeSize = () => [0, -4];
    cw.draw = () => {};
    cw.serialize = true;
  }
}

function buildUI(node) {
  const card = Card({ className: "ds-stitch-card" });
  card.root.dataset.dsThemed = "true";

  const state = loadState(node);
  node._dsStitchState = state;

  const featherSlider = Slider({
    label: "Feather",
    min: 0,
    max: 1024,
    step: 1,
    value: state.feather,
    onChange: (val) => {
      state.feather = Math.round(val);
      persistState(node, state);
    },
  });

  const colorMatchSlider = Slider({
    label: "Color match",
    min: 0,
    max: 200,
    step: 1,
    value: state.color_match,
    onChange: (val) => {
      state.color_match = Math.round(val);
      persistState(node, state);
    },
  });

  card.append(featherSlider.root, colorMatchSlider.root);

  node._dsCard = card;
  node._dsSliders = {
    feather: featherSlider,
    colorMatch: colorMatchSlider,
  };

  return card;
}

function getWidgetY(node) {
  const w = node._dsStitchWidget;
  const y = Number(w?.y);
  if (Number.isFinite(y) && y > 0) return y;
  const lastY = Number(w?.last_y);
  if (Number.isFinite(lastY) && lastY > 0) return lastY;
  const slotCount = Math.max(node.inputs?.length || 0, node.outputs?.length || 0, 2);
  return Math.max(64, 30 + slotCount * 20 + 4);
}

function getFixedNodeHeight(node) {
  return Math.ceil(getWidgetY(node) + MIN_WIDGET_HEIGHT);
}

function fitNodeHeight(node) {
  if (!node || !Array.isArray(node.size)) return;
  const w = Math.max(MIN_W, Number(node.size[0]) || DEFAULT_W);
  const h = getFixedNodeHeight(node);
  node.size[0] = w;
  node.size[1] = h;
  node.setDirtyCanvas?.(true, true);
}

function mountWidget(node) {
  if (node._dsCard && node._dsStitchWidget) {
    return;
  }
  const card = buildUI(node);

  node._dsStitchWidget = node.addDOMWidget("ds_stitch_ui", "custom", card.root, {
    serialize: false,
    hideOnZoom: false,
    margin: CARD_MARGIN,
    getMinHeight: () => MIN_WIDGET_HEIGHT,
    getMaxHeight: () => MIN_WIDGET_HEIGHT,
  });

  node._dsStitchWidget.computeSize = () => [
    MIN_W,
    MIN_WIDGET_HEIGHT,
  ];

  normalizeDSWidgetHost(card.root, node, { shell: false });
  protectDSResizeCorners(node);
}

app.registerExtension({
  name: "DeathshotArsenal.DSOutpaintStitch",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;
    const originalResize = nodeType.prototype.onResize;
    const origSetSize = nodeType.prototype.setSize;
    const origAddInput = nodeType.prototype.addInput;
    const origDrawBg = nodeType.prototype.onDrawBackground;
    const origDrawFg = nodeType.prototype.onDrawForeground;
    const origDrawWidgets = nodeType.prototype.drawWidgets;
    const origSerialize = nodeType.prototype.onSerialize;

    function removeHiddenSockets(node) {
      if (!Array.isArray(node?.inputs)) return;
      const allowed = ["image", "outpaint_info"];
      for (let i = node.inputs.length - 1; i >= 0; i--) {
        const inp = node.inputs[i];
        if (!allowed.includes(inp?.name)) {
          try {
            if (inp.link != null && node.graph) {
              node.graph.removeLink(inp.link);
            }
            node.removeInput(i);
          } catch (_) {}
        }
      }
    }

    nodeType.prototype.addInput = function (name, type, extra_info) {
      const allowed = ["image", "outpaint_info"];
      if (!allowed.includes(name)) return null;
      return origAddInput ? origAddInput.apply(this, arguments) : null;
    };

    nodeType.prototype.computeSize = function () {
      return [
        MIN_W,
        getFixedNodeHeight(this),
      ];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;

      this.resizable = true;
      removeHiddenSockets(this);
      hideNativeWidgets(this);
      mountWidget(this);

      fitNodeHeight(this);
      setTimeout(() => fitNodeHeight(this), 0);
      setTimeout(() => fitNodeHeight(this), 50);

      persistState(this, this._dsStitchState);
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.onConfigure = function (info) {
      const result = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
      removeHiddenSockets(this);
      hideNativeWidgets(this);

      const state = loadState(this);
      this._dsStitchState = state;

      if (!this._dsCard || !this._dsStitchWidget) {
        mountWidget(this);
      }

      if (this._dsSliders) {
        this._dsSliders.feather?.setValue(state.feather);
        this._dsSliders.colorMatch?.setValue(state.color_match);
      }

      fitNodeHeight(this);
      setTimeout(() => fitNodeHeight(this), 0);
      setTimeout(() => fitNodeHeight(this), 50);

      persistState(this, state);
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.onResize = function (size) {
      if (size) {
        size[0] = Math.max(MIN_W, Number(size[0]) || DEFAULT_W);
        size[1] = getFixedNodeHeight(this);
      }
      const result = originalResize ? originalResize.apply(this, arguments) : undefined;
      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(size?.[0] ?? this.size[0]) || DEFAULT_W);
        this.size[1] = getFixedNodeHeight(this);
      }
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.setSize = function (size) {
      const w = Math.max(MIN_W, Number(size?.[0]) || DEFAULT_W);
      const h = getFixedNodeHeight(this);
      this.size = [w, h];
      const result = origSetSize ? origSetSize.apply(this, [[w, h]]) : undefined;
      if (this.size) {
        this.size[0] = w;
        this.size[1] = h;
      }
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.onDrawBackground = function (ctx) {
      const targetH = getFixedNodeHeight(this);
      if (this.size && this.size[1] !== targetH) {
        this.size[1] = targetH;
      }
      return origDrawBg ? origDrawBg.apply(this, arguments) : undefined;
    };

    nodeType.prototype.drawWidgets = function (ctx) {
      const targetH = getFixedNodeHeight(this);
      if (this.size && this.size[1] !== targetH) {
        this.size[1] = targetH;
        this.setDirtyCanvas?.(true, true);
      }
      return origDrawWidgets ? origDrawWidgets.apply(this, arguments) : undefined;
    };

    nodeType.prototype.onDrawForeground = function (ctx) {
      const targetH = getFixedNodeHeight(this);
      if (this.size && this.size[1] !== targetH) {
        this.size[1] = targetH;
        this.setDirtyCanvas?.(true, true);
      }
      return origDrawFg ? origDrawFg.apply(this, arguments) : undefined;
    };

    nodeType.prototype.onSerialize = function (o) {
      const result = origSerialize ? origSerialize.apply(this, arguments) : undefined;
      const targetH = getFixedNodeHeight(this);
      if (o && Array.isArray(o.size)) {
        o.size[1] = targetH;
      }
      if (this.size) {
        this.size[1] = targetH;
      }
      return result;
    };
  },
});
