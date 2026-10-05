/**
 * DeathshotArsenal — DS Film Grain
 * Overhauled fixed-height card layout with unified controls and locked vertical geometry.
 */

import { app } from "/scripts/app.js";
import { Card, Slider, normalizeDSWidgetHost, protectDSResizeCorners } from "../UIElements/index.js";

const TYPE = "DS_FilmGrain";
const EXT_NAME = "DeathshotArsenal.DSFilmGrain";
const CSS_ID = "ds-film-grain-css";
const CARD_MARGIN = 5;
const MIN_WIDTH = 260;
const DEFAULT_WIDTH = 280;
const NATURAL_CARD_HEIGHT = 146;

let cssPromise = null;
function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.getElementById(CSS_ID)) return resolve();
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Film Grain/ds_film_grain.css?v=3";
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  return cssPromise;
}

function getNodeState(node) {
  return node._dsFilmGrainState || (node._dsFilmGrainState = {
    amount: 0.30,
    size: 0.50,
    color: 0.00,
    shadow: 0.00,
    mode: "Smooth",
  });
}

function syncWidgetsFromState(node) {
  const s = getNodeState(node);
  const findWidget = (name) => (node.widgets || []).find((w) => w.name === name);

  const wAmount = findWidget("grain_amount");
  if (wAmount) wAmount.value = s.amount;
  const wSize = findWidget("grain_size");
  if (wSize) wSize.value = s.size;
  const wColor = findWidget("color_amount");
  if (wColor) wColor.value = s.color;
  const wShadow = findWidget("shadow_focus");
  if (wShadow) wShadow.value = s.shadow;
  const wMode = findWidget("grain_mode");
  if (wMode) wMode.value = s.mode;
}

function syncStateFromWidgets(node) {
  const s = getNodeState(node);
  const findWidget = (name) => (node.widgets || []).find((w) => w.name === name);

  const wAmount = findWidget("grain_amount");
  if (wAmount && typeof wAmount.value === "number") s.amount = wAmount.value;
  const wSize = findWidget("grain_size");
  if (wSize && typeof wSize.value === "number") s.size = wSize.value;
  const wColor = findWidget("color_amount");
  if (wColor && typeof wColor.value === "number") s.color = wColor.value;
  const wShadow = findWidget("shadow_focus");
  if (wShadow && typeof wShadow.value === "number") s.shadow = wShadow.value;
  const wMode = findWidget("grain_mode");
  if (wMode && typeof wMode.value === "string") s.mode = wMode.value;
}

function hideNativeWidgets(node) {
  const names = ["grain_amount", "grain_size", "color_amount", "shadow_focus", "grain_mode"];
  (node.widgets || []).forEach((w) => {
    if (names.includes(w.name)) {
      w.hidden = true;
      w.computeSize = () => [0, 0];
    }
  });
}

function persistState(node) {
  const s = getNodeState(node);
  node.properties = node.properties || {};
  node.properties.ds_film_grain_amount = s.amount;
  node.properties.ds_film_grain_size = s.size;
  node.properties.ds_film_grain_color = s.color;
  node.properties.ds_film_grain_shadow = s.shadow;
  node.properties.ds_film_grain_mode = s.mode;
  syncWidgetsFromState(node);
}

function buildUI(node) {
  const card = Card({ className: "ds-fg-card" });
  const s = getNodeState(node);

  const sAmount = Slider({
    label: "Grain Amount",
    min: 0.00,
    max: 1.00,
    step: 0.01,
    value: s.amount,
    onChange: (val) => {
      s.amount = val;
      persistState(node);
    },
  });

  const sSize = Slider({
    label: "Grain Size",
    min: 0.01,
    max: 2.00,
    step: 0.01,
    value: s.size,
    onChange: (val) => {
      s.size = val;
      persistState(node);
    },
  });

  const sColor = Slider({
    label: "Color Amount",
    min: 0.00,
    max: 1.00,
    step: 0.01,
    value: s.color,
    onChange: (val) => {
      s.color = val;
      persistState(node);
    },
  });

  const sShadow = Slider({
    label: "Shadow Focus",
    min: 0.00,
    max: 1.00,
    step: 0.01,
    value: s.shadow,
    onChange: (val) => {
      s.shadow = val;
      persistState(node);
    },
  });

  const modeRow = document.createElement("div");
  modeRow.className = "ds-fg-mode-row";

  const modeLabel = document.createElement("span");
  modeLabel.className = "ds-fg-mode-label";
  modeLabel.textContent = "Grain Mode";

  const modeGroup = document.createElement("div");
  modeGroup.className = "ds-fg-mode-group";

  const btnSmooth = document.createElement("button");
  btnSmooth.type = "button";
  btnSmooth.textContent = "Smooth";

  const btnGrainy = document.createElement("button");
  btnGrainy.type = "button";
  btnGrainy.textContent = "Grainy";

  const updateModeButtons = (mode) => {
    const isSmooth = mode === "Smooth";
    if (isSmooth) {
      btnSmooth.className = "ds-ui-btn ds-ui-btn-primary is-active";
      btnSmooth.setAttribute("aria-pressed", "true");
      btnGrainy.className = "ds-ui-btn ds-ui-btn-secondary";
      btnGrainy.setAttribute("aria-pressed", "false");
    } else {
      btnSmooth.className = "ds-ui-btn ds-ui-btn-secondary";
      btnSmooth.setAttribute("aria-pressed", "false");
      btnGrainy.className = "ds-ui-btn ds-ui-btn-primary is-active";
      btnGrainy.setAttribute("aria-pressed", "true");
    }
  };

  btnSmooth.addEventListener("click", (e) => {
    e.stopPropagation();
    s.mode = "Smooth";
    updateModeButtons("Smooth");
    persistState(node);
  });

  btnGrainy.addEventListener("click", (e) => {
    e.stopPropagation();
    s.mode = "Grainy";
    updateModeButtons("Grainy");
    persistState(node);
  });

  updateModeButtons(s.mode);
  modeGroup.append(btnSmooth, btnGrainy);
  modeRow.append(modeLabel, modeGroup);

  card.append(sAmount.root, sSize.root, sColor.root, sShadow.root, modeRow);

  card.root.style.height = "auto";
  card.root.style.minHeight = "0";
  card.root.style.maxHeight = "none";
  if (card.body) {
    card.body.style.flex = "0 0 auto";
    card.body.style.height = "auto";
    card.body.style.minHeight = "0";
  }

  node._dsFilmGrainControls = {
    sAmount,
    sSize,
    sColor,
    sShadow,
    setMode: (mode) => {
      s.mode = mode;
      updateModeButtons(mode);
    },
  };

  return card;
}

function getCardHeight(card) {
  if (!card) return NATURAL_CARD_HEIGHT;
  const root = card.root || card;
  const body = card.body || root.querySelector?.(".ds-ui-card-body");
  if (body) {
    const bodyHeight = body.scrollHeight || body.offsetHeight;
    if (bodyHeight > 50) {
      return Math.ceil(bodyHeight + 22);
    }
  }
  if (root) {
    const rootHeight = root.scrollHeight || root.offsetHeight;
    if (rootHeight > 50) {
      return Math.ceil(rootHeight);
    }
  }
  return NATURAL_CARD_HEIGHT;
}

function getLockedHeight(node) {
  const widgetY = Number(node._dsFilmGrainWidget?.y ?? 45);
  const cardHeight = getCardHeight(node._dsFilmGrainCard);
  return Math.ceil(widgetY + cardHeight + (CARD_MARGIN * 2));
}

function fitNodeHeight(node) {
  const targetWidth = Math.max(MIN_WIDTH, Number(node.size?.[0]) || DEFAULT_WIDTH);
  const targetHeight = getLockedHeight(node);
  node.setSize([targetWidth, targetHeight]);
  node.setDirtyCanvas?.(true, true);
}

function install(node) {
  if (node._dsFilmGrainInstalled) return;
  node._dsFilmGrainInstalled = true;
  node.resizable = true;

  const s = getNodeState(node);
  syncStateFromWidgets(node);

  if (node.properties?.ds_film_grain_amount !== undefined) s.amount = Number(node.properties.ds_film_grain_amount);
  if (node.properties?.ds_film_grain_size !== undefined) s.size = Number(node.properties.ds_film_grain_size);
  if (node.properties?.ds_film_grain_color !== undefined) s.color = Number(node.properties.ds_film_grain_color);
  if (node.properties?.ds_film_grain_shadow !== undefined) s.shadow = Number(node.properties.ds_film_grain_shadow);
  if (node.properties?.ds_film_grain_mode) s.mode = node.properties.ds_film_grain_mode;

  protectDSResizeCorners(node);

  const originalGetWidgetOnPos = node.getWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    const x = Number(canvasX) - Number(this.pos?.[0] ?? 0);
    const y = Number(canvasY) - Number(this.pos?.[1] ?? 0);
    const w = Number(this.size?.[0] ?? 0);
    const h = Number(this.size?.[1] ?? 0);
    const handle = Number(this.constructor?.resizeHandleSize) || 15;

    const inLeft = x <= handle;
    const inRight = x >= w - handle;
    const inTop = y <= handle;
    const inBottom = y >= h - handle;

    if ((inLeft || inRight) && (inTop || inBottom)) {
      return undefined;
    }

    return originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
  };

  const card = buildUI(node);
  node._dsFilmGrainCard = card;

  normalizeDSWidgetHost(card.root, node, { shell: false });
  window.DSGlobalTheme?.bindNode?.(card.root, node);
  hideNativeWidgets(node);

  const domWidget = node.addDOMWidget("ds_film_grain_ui", "custom", card.root, {
    serialize: false,
    margin: CARD_MARGIN,
    getMinHeight: () => getCardHeight(node._dsFilmGrainCard) + (CARD_MARGIN * 2),
    getMaxHeight: () => getCardHeight(node._dsFilmGrainCard) + (CARD_MARGIN * 2),
  });
  domWidget.computeSize = (width) => [
    Math.max(MIN_WIDTH, Number(width) || DEFAULT_WIDTH),
    getCardHeight(node._dsFilmGrainCard) + (CARD_MARGIN * 2),
  ];
  node._dsFilmGrainWidget = domWidget;

  node.onResize = function (size) {
    if (!size) return;
    size[0] = Math.max(MIN_WIDTH, size[0]);
    size[1] = getLockedHeight(this);
  };

  persistState(node);

  requestAnimationFrame(() => {
    fitNodeHeight(node);
  });
  setTimeout(() => {
    fitNodeHeight(node);
  }, 50);
  setTimeout(() => {
    fitNodeHeight(node);
  }, 150);
}

app.registerExtension({
  name: EXT_NAME,
  async setup() {
    await loadCss();
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const res = oldCreated?.apply(this, arguments);
      install(this);
      return res;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const res = oldConfigure?.apply(this, arguments);
      if (!this.properties) this.properties = {};
      const s = getNodeState(this);

      syncStateFromWidgets(this);
      if (this.properties.ds_film_grain_amount !== undefined) s.amount = Number(this.properties.ds_film_grain_amount);
      if (this.properties.ds_film_grain_size !== undefined) s.size = Number(this.properties.ds_film_grain_size);
      if (this.properties.ds_film_grain_color !== undefined) s.color = Number(this.properties.ds_film_grain_color);
      if (this.properties.ds_film_grain_shadow !== undefined) s.shadow = Number(this.properties.ds_film_grain_shadow);
      if (this.properties.ds_film_grain_mode) s.mode = this.properties.ds_film_grain_mode;

      const ctrl = this._dsFilmGrainControls;
      if (ctrl) {
        ctrl.sAmount.setValue(s.amount);
        ctrl.sSize.setValue(s.size);
        ctrl.sColor.setValue(s.color);
        ctrl.sShadow.setValue(s.shadow);
        ctrl.setMode(s.mode);
      }

      hideNativeWidgets(this);
      syncWidgetsFromState(this);
      persistState(this);

      requestAnimationFrame(() => {
        fitNodeHeight(this);
      });
      setTimeout(() => {
        fitNodeHeight(this);
      }, 50);
      setTimeout(() => {
        fitNodeHeight(this);
      }, 150);

      return res;
    };

    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (size) {
        size[0] = Math.max(MIN_WIDTH, size[0]);
        size[1] = getLockedHeight(this);
      }
      return oldResize?.apply(this, arguments);
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._dsFilmGrainCard = null;
      this._dsFilmGrainControls = null;
      this._dsFilmGrainWidget = null;
      return oldRemoved?.apply(this, arguments);
    };
  },
});
