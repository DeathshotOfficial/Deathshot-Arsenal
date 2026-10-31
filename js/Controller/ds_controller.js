import { app } from "/scripts/app.js";
import { attachNodeShortcuts } from "../UIElements/shortcuts.js";
import { Slider, Toggle, Dropdown, Button, Input, InputRow, protectDSResizeCorners } from "../UIElements/index.js";
import { Popup } from "../UIElements/Core/Popup.js";

const EXTENSION_NAME = "DeathshotArsenal.DSController";
const NODE_NAME = "DS_Controller";
const CARD_MARGIN = 5;
const CARD_PAD = 10;
const ROW_GAP = 6;
const ADD_BTN_H = 28;
const MIN_WIDTH = 280;

function injectCSS() {
  if (typeof document === "undefined") return;
  const linkId = "ds-controller-css-link";
  if (!document.getElementById(linkId)) {
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Controller/ds_controller.css";
    document.head.appendChild(link);
  }
}

function randomSeed() {
  return String(Math.floor(Math.random() * 1125899906842624));
}

// Randomize + fixed/random mode buttons for a seed row.
function seedActions(row, onSeed, onMode) {
  const dice = Button({
    icon: "dice",
    compact: true,
    tooltip: "Randomize Seed",
    onClick: (e) => {
      e.stopPropagation();
      onSeed(randomSeed());
    },
  });
  const mode = Button({
    label: row.seedMode === "random" ? "R" : "F",
    compact: true,
    active: row.seedMode === "random",
    tooltip: row.seedMode === "random" ? "Randomize Each Gen" : "Fixed Seed",
    onClick: (e) => {
      e.stopPropagation();
      row.seedMode = row.seedMode === "random" ? "fixed" : "random";
      mode.setLabel(row.seedMode === "random" ? "R" : "F");
      mode.setActive(row.seedMode === "random");
      mode.root.title = row.seedMode === "random" ? "Randomize Each Gen" : "Fixed Seed";
      onMode();
    },
  });
  mode.root.classList.add("ds-ui-btn-icon-only");
  return [dice, mode];
}

function normalizeRowType(type) {
  if (!type) return "float";
  const lower = String(type).toLowerCase();
  if (lower === "slider") return "float";
  if (lower === "boolean") return "toggle";
  if (lower === "combo") return "list";
  if (lower === "string") return "text";
  return lower;
}

function getRowHeight(row) {
  const normType = normalizeRowType(row?.detectedType);
  if (normType === "text" && row?.expanded) {
    return Math.max(60, Number(row.customHeight) || 84);
  }
  return 28;
}

function offsetInCard(el, card) {
  return el.offsetParent === card ? el.offsetTop : el.offsetTop - card.offsetTop;
}

// Natural content height of the card, measured from the live DOM in unscaled
// layout units (offsetTop/offsetHeight ignore the canvas zoom transform), so it
// follows the theme's real control sizes instead of the hard-coded fallbacks.
function measureCardHeight(card) {
  if (!card || !card.isConnected || card.offsetHeight <= 0) return null;
  let bottom = 0;
  for (const child of card.children) {
    if (child.offsetHeight <= 0) continue;
    bottom = Math.max(bottom, offsetInCard(child, card) + child.offsetHeight);
  }
  if (bottom <= 0) return null;
  const padBottom = parseFloat(getComputedStyle(card).paddingBottom) || 0;
  return Math.ceil(bottom + padBottom);
}

function getCardHeight(rows, node) {
  const measured = measureCardHeight(node?._controllerCard);
  if (measured) return measured;
  const list = Array.isArray(rows) && rows.length > 0 ? rows : [{ detectedType: "float" }];
  let h = 0;
  for (let i = 0; i < list.length; i++) {
    h += getRowHeight(list[i]);
  }
  return (CARD_PAD * 2) + h + ADD_BTN_H + (list.length * ROW_GAP);
}

function getCardTopY(node) {
  const wY = Number.isFinite(node?._controllerWidget?.y)
    ? node._controllerWidget.y
    : (Number.isFinite(node?.widgets_start_y)
        ? node.widgets_start_y
        : (node?.constructor?.title_mode === LiteGraph.NO_TITLE ? 0 : (LiteGraph.NODE_TITLE_HEIGHT || 30)));
  const margin = Number.isFinite(node?._controllerWidget?.margin)
    ? node._controllerWidget.margin
    : CARD_MARGIN;
  return wY + margin;
}

function getNodeHeight(node, rows) {
  const cardTopY = getCardTopY(node);
  const margin = Number.isFinite(node?._controllerWidget?.margin)
    ? node._controllerWidget.margin
    : CARD_MARGIN;
  return cardTopY + getCardHeight(rows, node) + margin;
}

function getRowCenterY(node, slotIndex) {
  const el = node?._rowElements?.[slotIndex];
  const card = node?._controllerCard;
  if (el && card && el.isConnected && el.offsetHeight > 0) {
    // Layout units, not screen rects / canvas zoom: immune to DOM vs canvas scale drift.
    const localCenterY = offsetInCard(el, card) + (el.offsetHeight * 0.5);
    return getCardTopY(node) + localCenterY;
  }

  const cardTopY = getCardTopY(node);
  let y = cardTopY + CARD_PAD;
  for (let i = 0; i < slotIndex; i++) {
    y += getRowHeight(node?.rows?.[i]) + ROW_GAP;
  }
  return y + (getRowHeight(node?.rows?.[slotIndex]) / 2);
}

function detectInputType(targetNode, targetSlotIndex) {
  if (!targetNode || targetSlotIndex === undefined || targetSlotIndex < 0) {
    return { type: "float", label: "Control", min: 0, max: 1, step: 0.01, value: 0.5 };
  }

  const targetInput = targetNode.inputs?.[targetSlotIndex];
  const inputName = targetInput?.name || "";
  const lowerName = inputName.toLowerCase();

  const targetWidget = targetNode.widgets?.find(
    (w) => w.name === inputName || (targetInput?.widget && targetInput.widget.name === w.name)
  );

  const nodeData =
    targetNode.constructor?.nodeData ||
    (targetNode.type && LiteGraph.registered_node_types?.[targetNode.type]?.nodeData) ||
    (targetNode.comfyClass && LiteGraph.registered_node_types?.[targetNode.comfyClass]?.nodeData) ||
    (window.app?.graph?.extra?.definitions?.[targetNode.type]) ||
    (window.app?.graph?.extra?.definitions?.[targetNode.comfyClass]);

  const inputConfig =
    nodeData?.input?.required?.[inputName] ||
    nodeData?.input?.optional?.[inputName] ||
    null;

  const metaType = inputConfig ? inputConfig[0] : null;
  const metaOpts = inputConfig ? inputConfig[1] || {} : {};

  if (
    lowerName === "seed" ||
    lowerName === "noise_seed" ||
    lowerName.includes("seed") ||
    metaOpts.control_after_generate !== undefined ||
    targetWidget?.name?.toLowerCase().includes("seed")
  ) {
    return {
      type: "seed",
      label: inputName || "Seed",
      value: String(targetWidget?.value ?? metaOpts.default ?? "0"),
      targetWidget,
    };
  }

  let rawOptions = null;
  if (Array.isArray(targetInput?.type)) {
    rawOptions = targetInput.type;
  } else if (typeof targetWidget?.options?.values === "function") {
    try { rawOptions = targetWidget.options.values(); } catch (_) { rawOptions = null; }
  } else if (Array.isArray(targetWidget?.options?.values)) {
    rawOptions = targetWidget.options.values;
  } else if (typeof targetInput?.widget?.options?.values === "function") {
    try { rawOptions = targetInput.widget.options.values(); } catch (_) { rawOptions = null; }
  } else if (Array.isArray(targetInput?.widget?.options?.values)) {
    rawOptions = targetInput.widget.options.values;
  } else if (Array.isArray(metaType)) {
    rawOptions = metaType;
  } else if (Array.isArray(targetWidget?.options?.items)) {
    rawOptions = targetWidget.options.items;
  }

  if (!rawOptions && (targetWidget?.type === "combo" || targetInput?.type === "COMBO" || lowerName === "sampler_name" || lowerName === "scheduler")) {
    const regDef = LiteGraph.registered_node_types?.[targetNode.type]?.nodeData || LiteGraph.registered_node_types?.[targetNode.comfyClass]?.nodeData;
    const reqField = regDef?.input?.required?.[inputName]?.[0] || regDef?.input?.optional?.[inputName]?.[0];
    if (Array.isArray(reqField)) rawOptions = reqField;
  }

  if (!rawOptions && (lowerName === "sampler_name" || lowerName.includes("sampler"))) {
    if (Array.isArray(window.app?.samplers)) rawOptions = window.app.samplers;
    else if (Array.isArray(window.comfyAPI?.samplers)) rawOptions = window.comfyAPI.samplers;
  }
  if (!rawOptions && (lowerName === "scheduler" || lowerName.includes("scheduler"))) {
    if (Array.isArray(window.app?.schedulers)) rawOptions = window.app.schedulers;
    else if (Array.isArray(window.comfyAPI?.schedulers)) rawOptions = window.comfyAPI.schedulers;
  }

  if (Array.isArray(rawOptions) || targetWidget?.type === "combo" || targetInput?.type === "COMBO") {
    const list = Array.isArray(rawOptions) ? rawOptions : [];
    const options = list.map((opt) => (typeof opt === "object" && opt !== null ? String(opt.id ?? opt.value ?? opt.name) : String(opt)));
    
    let defaultVal = targetWidget?.value;
    if (defaultVal === undefined && targetInput?.widget?.value !== undefined) {
      defaultVal = targetInput.widget.value;
    }
    if (defaultVal === undefined && metaOpts.default !== undefined) {
      defaultVal = metaOpts.default;
    }
    if (defaultVal === undefined || (options.length > 0 && !options.includes(String(defaultVal)))) {
      defaultVal = options[0] ?? "";
    }

    return {
      type: "list",
      label: inputName || "List",
      options,
      value: String(defaultVal ?? ""),
      targetWidget,
    };
  }

  if (metaType === "BOOLEAN" || targetWidget?.type === "toggle" || targetInput?.type === "BOOLEAN" || typeof targetWidget?.value === "boolean") {
    const defaultBool = targetWidget?.value !== undefined ? Boolean(targetWidget.value) : Boolean(metaOpts.default ?? false);
    return {
      type: "toggle",
      label: inputName || "Toggle",
      value: defaultBool,
      targetWidget,
    };
  }

  if (metaType === "STRING" || targetWidget?.type === "text" || targetWidget?.type === "customtext" || targetInput?.type === "STRING" || typeof targetWidget?.value === "string") {
    return {
      type: "text",
      label: inputName || "Text",
      value: String(targetWidget?.value ?? metaOpts.default ?? ""),
      targetWidget,
    };
  }

  const isExplicitInt = metaType === "INT" || targetInput?.type === "INT";
  const isExplicitFloat = metaType === "FLOAT" || targetInput?.type === "FLOAT";

  const isInt = isExplicitInt ||
    (!isExplicitFloat && metaOpts.step !== undefined && Number.isInteger(metaOpts.step) && Number.isInteger(metaOpts.min ?? 0) && Number.isInteger(metaOpts.max ?? 100)) ||
    (!isExplicitFloat && targetWidget?.options?.step !== undefined && Number.isInteger(targetWidget.options.step) && !String(targetWidget.options.step).includes("."));

  const isFloat = isExplicitFloat || (!isInt && targetWidget?.options?.step && String(targetWidget.options.step).includes("."));

  if (isInt && !isFloat) {
    const min = Math.round(Number(targetWidget?.options?.min ?? metaOpts.min ?? 0));
    const max = Math.round(Number(targetWidget?.options?.max ?? metaOpts.max ?? 100));
    const step = Math.round(Number(targetWidget?.options?.step ?? metaOpts.step ?? 1));
    const currentVal = Math.round(Number(targetWidget?.value ?? metaOpts.default ?? min));
    return {
      type: "int",
      label: inputName || "Int",
      min,
      max,
      step: Math.max(1, step),
      value: currentVal,
      targetWidget,
    };
  }

  const min = Number(targetWidget?.options?.min ?? metaOpts.min ?? 0);
  const max = Number(targetWidget?.options?.max ?? metaOpts.max ?? 1);
  const step = Number(targetWidget?.options?.step ?? metaOpts.step ?? 0.01);
  const currentVal = Number(targetWidget?.value ?? metaOpts.default ?? min);

  return {
    type: "float",
    label: inputName || "Float",
    min,
    max,
    step,
    value: currentVal,
    targetWidget,
  };
}

function installPromptHook() {
  if (app._dsControllerGraphToPromptHook) return;
  const original = app.graphToPrompt?.bind(app);
  if (!original) return;
  app._dsControllerGraphToPromptHook = true;

  app.graphToPrompt = async function (...args) {
    const result = await original(...args);
    try {
      const output = result?.output || {};
      const graph = app.graph;
      if (graph && graph._nodes) {
        for (const node of graph._nodes) {
          if (node.type === NODE_NAME || node.comfyClass === NODE_NAME) {
            node._commitActiveInputs?.();

            if (Array.isArray(node.rows)) {
              let rowsChanged = false;
              for (const row of node.rows) {
                if (row && normalizeRowType(row.detectedType) === "seed" && row.seedMode === "random") {
                  const randSeed = Math.floor(Math.random() * 1125899906842624);
                  row.value = randSeed;
                  rowsChanged = true;
                }
              }
              if (rowsChanged) {
                node._updateDOMRowValues?.();
              }
            }

            node._syncControllerData?.();

            const entry = output[String(node.id)];
            if (entry) {
              entry.inputs = entry.inputs || {};
              entry.inputs.controller_data = JSON.stringify(node.rows || []);
            }

            if (result?.workflow?.nodes) {
              for (const wfNode of result.workflow.nodes) {
                if (String(wfNode?.id) === String(node.id)) {
                  wfNode.properties = wfNode.properties || {};
                  wfNode.properties.ds_controller_rows = JSON.parse(JSON.stringify(node.rows || []));
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[DS Controller] graphToPrompt hook error:", e);
    }
    return result;
  };
}


app.registerExtension({
  name: EXTENSION_NAME,
  init() {
    installPromptHook();
  },
  loadedGraphNode(node) {
    if (node.type === NODE_NAME || node.comfyClass === NODE_NAME) {
      node.syncOutputs?.();
      node._syncControllerData?.();
      node.setDirtyCanvas?.(true, true);
    }
  },
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) {
      if (node.type === NODE_NAME || node.comfyClass === NODE_NAME) {
        node.syncOutputs?.();
        node._syncControllerData?.();
        node.setDirtyCanvas?.(true, true);
      }
    }
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    injectCSS();
    installPromptHook();

    nodeType.prototype._openControllerGearPopover = function (anchorEl) {
      this.openSettings?.(anchorEl);
    };
    nodeType.prototype._toggleControllerGearPopover = function (anchorEl) {
      this.openSettings?.(anchorEl);
    };

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      attachNodeShortcuts(this);
      origOnNodeCreated?.apply(this, arguments);

      this._openControllerGearPopover = (anchorEl) => this.openSettings?.(anchorEl);
      this._toggleControllerGearPopover = (anchorEl) => this.openSettings?.(anchorEl);
      registerDSControllerGear();

      this.inputs = [];
      this.addInput = () => null;
      this.onConnectInput = () => false;

      Object.defineProperty(this, "widgets_start_y", {
        configurable: true,
        enumerable: true,
        get() {
          return 0;
        },
        set() {},
      });

      function hideNativeWidget(widget) {
        if (!widget) return;
        widget.hidden = true;
        widget.options = widget.options || {};
        widget.options.hidden = true;
        widget.computeSize = () => [0, -4];
        widget.draw = () => {};
        for (const el of [widget.inputEl, widget.element]) {
          if (el?.style) {
            el.style.display = "none";
            el.style.visibility = "hidden";
            el.style.pointerEvents = "none";
            el.style.width = "0";
            el.style.height = "0";
            el.style.margin = "0";
            el.style.padding = "0";
          }
        }
      }

      this._commitActiveInputs = () => {
        if (!this._rowElements || !Array.isArray(this.rows)) return;
        this.rows.forEach((row, idx) => {
          const el = this._rowElements[idx];
          if (!el) return;
          const active = document.activeElement;
          if (active && el.contains(active)) {
            if (active.tagName === "INPUT" || active.tagName === "TEXTAREA") {
              const val = active.value;
              const normType = normalizeRowType(row.detectedType);
              if (normType === "int" || normType === "float") {
                const num = Number(val);
                if (!isNaN(num)) row.value = num;
              } else if (normType === "seed" || normType === "text") {
                row.value = val;
              }
            }
          }
        });
      };

      const syncControllerData = () => {
        this._commitActiveInputs?.();
        this.properties = this.properties || {};
        this.properties.ds_controller_rows = JSON.parse(JSON.stringify(this.rows || []));
        let dataWidget = (this.widgets || []).find((w) => w?.name === "controller_data");
        if (!dataWidget && typeof this.addWidget === "function") {
          dataWidget = this.addWidget("text", "controller_data", "[]", () => {}, {
            serialize: true,
          });
        }
        if (dataWidget) {
          hideNativeWidget(dataWidget);
          dataWidget.serialize = true;
          dataWidget.value = JSON.stringify(this.rows || []);
          this._dataWidget = dataWidget;
        }
      };
      this._syncControllerData = syncControllerData;

      let initDataWidget = (this.widgets || []).find((w) => w?.name === "controller_data");
      if (!initDataWidget && typeof this.addWidget === "function") {
        initDataWidget = this.addWidget("text", "controller_data", "[]", () => {}, {
          serialize: true,
        });
      }
      if (initDataWidget) {
        hideNativeWidget(initDataWidget);
        initDataWidget.serialize = true;
        this._dataWidget = initDataWidget;
      }

      const savedExisting = this.properties?.ds_controller_rows || this.controller_rows;
      if (Array.isArray(savedExisting) && savedExisting.length > 0) {
        this.rows = JSON.parse(JSON.stringify(savedExisting));
      } else {
        this.rows = this.rows || [
          {
            id: `ds_row_${Date.now()}`,
            label: "Control",
            detectedType: "int",
            min: 0,
            max: 100,
            step: 1,
            value: 10,
            seedMode: "fixed",
            expanded: false,
            customHeight: 84,
            connected: false,
          },
        ];
      }

      this._rowElements = [];

      this._updateDOMRowValues = () => {
        if (!Array.isArray(this.rows) || !this._rowElements) return;
        this.rows.forEach((row, idx) => {
          const el = this._rowElements[idx];
          const normType = normalizeRowType(row.detectedType);
          if (normType === "seed") {
            if (el) {
              const inp = el.querySelector?.(".ds-controller-seed-input");
              if (inp && inp.value !== String(row.value)) {
                inp.value = String(row.value ?? "0");
              }
            }
          }
        });
        if (this._settingsPopup && this._settingsPopup.isOpen()) {
          const seedInps = this._settingsPopup.root?.querySelectorAll?.(".ds-controller-settings-seed-num");
          if (seedInps) {
            let sIdx = 0;
            this.rows.forEach((row) => {
              if (normalizeRowType(row.detectedType) === "seed") {
                if (seedInps[sIdx] && seedInps[sIdx].value !== String(row.value)) {
                  seedInps[sIdx].value = String(row.value ?? "0");
                }
                sIdx++;
              }
            });
          }
        }
      };

      const origSetSize = this.setSize.bind(this);
      this.setSize = function (size) {
        const minW = MIN_WIDTH;
        const targetH = getNodeHeight(this, this.rows);
        const targetW = Math.max(minW, Number(size?.[0]) || minW);
        return origSetSize([targetW, targetH]);
      };

      this.computeSize = function (out) {
        const outSize = out || new Float32Array(2);
        outSize[0] = MIN_WIDTH;
        outSize[1] = getNodeHeight(this, this.rows);
        return outSize;
      };

      this.onResize = function (size) {
        const minW = MIN_WIDTH;
        const targetH = getNodeHeight(this, this.rows);
        size[0] = Math.max(minW, Number(size?.[0]) || minW);
        size[1] = targetH;
        this.syncOutputs();
        alignOutputs();
      };

      const alignOutputs = () => {
        if (!this.outputs || !this.rows) return;
        const nx = this.size[0];
        for (let i = 0; i < this.rows.length; i++) {
          const out = this.outputs[i];
          if (!out) continue;
          out.label = " ";
          out.name = " ";
          out.type = "*";
          out.pos = [nx, getRowCenterY(this, i)];
        }
      };

      const origOnDrawForeground = this.onDrawForeground;
      this.onDrawForeground = function (ctx) {
        origOnDrawForeground?.apply(this, arguments);
        alignOutputs();
      };

      this.fitNodeHeight = () => {
        const minW = MIN_WIDTH;
        const targetH = getNodeHeight(this, this.rows);
        const curW = Math.max(minW, Number(this.size?.[0]) || minW);
        this.setSize([curW, targetH]);
        this.syncOutputs();
        alignOutputs();
        this.setDirtyCanvas?.(true, true);
      };

      this.syncOutputs = () => {
        if (!this.outputs) this.outputs = [];
        if (!this.rows) this.rows = [];

        // Safety guarantee: ensure this.rows accommodates any output that has active links
        for (let i = 0; i < this.outputs.length; i++) {
          const out = this.outputs[i];
          if (out && Array.isArray(out.links) && out.links.length > 0) {
            while (this.rows.length <= i) {
              this.rows.push({
                id: `ds_row_${Date.now()}_${this.rows.length}`,
                label: `Control ${this.rows.length + 1}`,
                detectedType: "int",
                min: 0,
                max: 100,
                step: 1,
                value: 10,
                seedMode: "fixed",
                expanded: false,
                customHeight: 84,
                connected: true,
              });
            }
          }
        }

        // Add slots if fewer than rows
        while (this.outputs.length < this.rows.length) {
          const idx = this.outputs.length;
          this.addOutput(" ", "*");
          const outSlot = this.outputs[idx];
          if (outSlot) {
            outSlot.label = " ";
            outSlot.name = " ";
            outSlot.color_on = "#67e8f9";
            outSlot.color_off = "#374151";
          }
        }

        // Prune trailing dummy sockets created by Python's 32 return types,
        // but ONLY if they are unconnected! NEVER disconnect an active link here!
        while (this.outputs.length > this.rows.length) {
          const idx = this.outputs.length - 1;
          const out = this.outputs[idx];
          if (!out || !out.links || out.links.length === 0) {
            this.outputs.pop();
          } else {
            // Socket has active link, do NOT pop or disconnect!
            break;
          }
        }

        alignOutputs();
      };

      this.moveRow = (fromIndex, toIndex) => {
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= this.rows.length || toIndex >= this.rows.length) {
          return;
        }
        const movedRow = this.rows.splice(fromIndex, 1)[0];
        this.rows.splice(toIndex, 0, movedRow);

        if (Array.isArray(this.outputs) && this.outputs.length > 0) {
          const movedOutput = this.outputs.splice(fromIndex, 1)[0];
          this.outputs.splice(toIndex, 0, movedOutput);

          const graph = app.graph || this.graph;
          if (graph && graph.links) {
            for (let s = 0; s < this.outputs.length; s++) {
              const slot = this.outputs[s];
              if (slot && Array.isArray(slot.links)) {
                for (const linkId of slot.links) {
                  const link = graph.links[linkId];
                  if (link && link.origin_id === this.id) {
                    link.origin_slot = s;
                  }
                }
              }
            }
          }
        }

        this.properties = this.properties || {};
        this.properties.ds_controller_rows = JSON.parse(JSON.stringify(this.rows));
        syncControllerData();
        this.syncOutputs();
        renderRows();
        this._updateSettingsList?.();
        this.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty?.(true, true);
      };

      this.removeRow = (index) => {
        if (this.rows.length <= 1 || index < 0 || index >= this.rows.length) return;
        this.rows.splice(index, 1);

        if (Array.isArray(this.outputs) && this.outputs[index]) {
          this.disconnectOutput(index);
          this.outputs.splice(index, 1);

          const graph = app.graph || this.graph;
          if (graph && graph.links) {
            for (let s = 0; s < this.outputs.length; s++) {
              const slot = this.outputs[s];
              if (slot && Array.isArray(slot.links)) {
                for (const linkId of slot.links) {
                  const link = graph.links[linkId];
                  if (link && link.origin_id === this.id) {
                    link.origin_slot = s;
                  }
                }
              }
            }
          }
        }

        this.properties = this.properties || {};
        this.properties.ds_controller_rows = JSON.parse(JSON.stringify(this.rows));
        syncControllerData();
        this.syncOutputs();
        renderRows();
        this._updateSettingsList?.();
        this.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty?.(true, true);
      };

      this.addControlRow = (customProps = {}) => {
        this.rows.push({
          id: `ds_row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          label: `Control ${this.rows.length + 1}`,
          detectedType: "int",
          min: 0,
          max: 100,
          step: 1,
          value: 10,
          seedMode: "fixed",
          expanded: false,
          customHeight: 84,
          connected: false,
          ...customProps,
        });
        this.properties = this.properties || {};
        this.properties.ds_controller_rows = JSON.parse(JSON.stringify(this.rows));
        syncControllerData();
        this.syncOutputs();
        renderRows();
        this._updateSettingsList?.();
        this.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty?.(true, true);
      };

      const card = document.createElement("div");
      card.className = "ds-ui-card ds-controller-card";
      card.dataset.dsUiCard = "true";
      card.style.minWidth = "0px";
      this._controllerCard = card;

      protectDSResizeCorners(this);

      const renderRows = () => {
        this._rowElements = [];
        card.replaceChildren();

        this.rows.forEach((row, idx) => {
          const syncTarget = (val) => {
            row.value = val;
            syncControllerData();
            app.canvas?.emitBeforeChange?.();
            try {
              const linkIds = this.outputs?.[idx]?.links || [];
              for (const linkId of linkIds) {
                const link = app.graph?.links?.[linkId];
                if (link) {
                  const targetNode = app.graph.getNodeById(link.target_id);
                  if (targetNode) {
                    const targetInput = targetNode.inputs?.[link.target_slot];
                    const inputName = targetInput?.name;
                    const w = targetNode.widgets?.find(
                      (item) => item.name === inputName || (targetInput?.widget && targetInput.widget.name === item.name)
                    );
                    if (w) {
                      w.value = val;
                      w.callback?.(val);
                    }
                    targetNode.setDirtyCanvas?.(true, true);
                  }
                }
              }
            } finally {
              app.canvas?.emitAfterChange?.();
              this.setDirtyCanvas?.(true, true);
            }
          };

          const normType = normalizeRowType(row.detectedType);

          if (normType === "int" || normType === "float" || normType === "slider") {
            const isInt = normType === "int";
            const minV = Number(row.min ?? (isInt ? 0 : 0));
            const maxV = Number(row.max ?? (isInt ? 100 : 1));
            const stepV = Number(row.step > 0 ? row.step : (isInt ? 1 : 0.01));
            const curV = Number(row.value ?? minV);
            const slider = Slider({
              label: row.label,
              min: minV,
              max: maxV,
              step: stepV,
              value: curV,
              onChange: (val) => syncTarget(val),
            });
            slider.root.style.boxSizing = "border-box";
            this._rowElements[idx] = slider.root;
            card.appendChild(slider.root);
          } else if (normType === "toggle" || normType === "boolean") {
            const tgl = Toggle({
              label: row.label,
              checked: Boolean(row.value),
              className: "ds-ui-input-row",
              onChange: (val) => syncTarget(val),
            });
            this._rowElements[idx] = tgl.root;
            card.appendChild(tgl.root);
          } else if (normType === "list" || normType === "combo") {
            let opts = Array.isArray(row.options) && row.options.length > 0 ? row.options : [];
            if (opts.length <= 1) {
              const linkId = this.outputs?.[idx]?.links?.[0];
              if (linkId !== undefined && linkId !== null) {
                const link = app.graph?.links?.[linkId];
                if (link) {
                  const targetNode = app.graph.getNodeById(link.target_id);
                  if (targetNode) {
                    const detected = detectInputType(targetNode, link.target_slot);
                    if (Array.isArray(detected.options) && detected.options.length > 0) {
                      row.options = detected.options;
                      opts = row.options;
                      if (!opts.includes(String(row.value)) || row.value === 10 || row.value === "10") {
                        row.value = String(detected.value ?? opts[0] ?? "");
                      }
                    }
                  }
                }
              }
            }

            if (opts.length === 0) {
              opts = [String(row.value || "")];
            }

            const curVal = String(row.value ?? opts[0] ?? "");
            const formattedOpts = opts.map((opt) => ({
              id: String(opt),
              label: String(opt),
            }));

            const dd = Dropdown({
              label: row.label,
              options: formattedOpts,
              value: curVal,
              searchable: true,
              compact: true,
              className: "ds-controller-card-dropdown",
              onChange: (val) => {
                syncTarget(val);
              },
            });

            this._rowElements[idx] = dd.root;
            card.appendChild(dd.root);
          } else if (normType === "seed") {
            const seedRow = InputRow({
              label: row.label,
              value: row.value ?? "0",
              mono: true,
              onChange: (val) => syncTarget(val),
              actions: seedActions(
                row,
                (val) => { seedRow.setValue(val); syncTarget(val); },
                () => { syncControllerData(); this.setDirtyCanvas?.(true, true); },
              ),
            });
            this._rowElements[idx] = seedRow.root;
            card.appendChild(seedRow.root);
          } else if (normType === "text" || normType === "string") {
            let textRow;
            if (!row.expanded) {
              textRow = InputRow({
                label: row.label,
                value: row.value ?? "",
                onInput: (val) => syncTarget(val),
                actions: [Button({
                  icon: "maximize-2",
                  compact: true,
                  tooltip: "Expand Text Area",
                  onClick: (e) => {
                    e.stopPropagation();
                    row.expanded = true;
                    renderRows();
                  },
                })],
              }).root;
            } else {
              textRow = document.createElement("div");
              textRow.className = "ds-controller-text-row is-expanded";
              textRow.style.height = `${row.customHeight || 84}px`;

              const head = document.createElement("div");
              head.className = "ds-controller-text-head";

              const lbl = document.createElement("span");
              lbl.className = "ds-controller-row-label";
              lbl.textContent = row.label;

              const colBtn = Button({
                icon: "minimize-2",
                compact: true,
                tooltip: "Collapse",
                onClick: (e) => {
                  e.stopPropagation();
                  row.expanded = false;
                  renderRows();
                },
              });

              head.append(lbl, colBtn.root);

              const ta = document.createElement("textarea");
              ta.className = "ds-controller-textarea";
              ta.value = String(row.value ?? "");
              ta.style.height = `${(row.customHeight || 84) - 34}px`;
              ta.addEventListener("input", (e) => syncTarget(e.target.value));

              const ro = new ResizeObserver(() => {
                const newH = Math.max(60, ta.offsetHeight + 34);
                if (Math.abs(newH - (row.customHeight || 84)) > 2) {
                  row.customHeight = newH;
                  textRow.style.height = `${newH}px`;
                  this.fitNodeHeight();
                }
              });
              ro.observe(ta);

              textRow.append(head, ta);
            }

            this._rowElements[idx] = textRow;
            card.appendChild(textRow);
          }
        });

        const addBtn = Button({
          icon: "plus",
          label: "Add Control",
          className: "ds-controller-add-btn",
          onClick: () => this.addControlRow(),
        });
        card.appendChild(addBtn.root);

        // Refit whenever a row's real size changes (theme CSS loading late, text area resize, ...).
        this._layoutObserver?.disconnect();
        this._layoutObserver = new ResizeObserver(() => {
          const targetH = getNodeHeight(this, this.rows);
          if (Math.abs((this.size?.[1] || 0) - targetH) > 0.5) {
            this.fitNodeHeight();
          } else {
            alignOutputs();
            this.setDirtyCanvas?.(true, true);
          }
        });
        this._layoutObserver.observe(card);
        for (const child of card.children) this._layoutObserver.observe(child);

        this.fitNodeHeight();
        // Re-fit once the browser has laid out the new rows, so the height is measured from the DOM.
        requestAnimationFrame(() => {
          this.fitNodeHeight();
        });
      };

      this._controllerWidget = this.addDOMWidget("ds_controller_ui", "custom", card, {
        margin: CARD_MARGIN,
        serialize: false,
        getMinHeight: () => getCardHeight(this.rows, this) + (CARD_MARGIN * 2),
        getMaxHeight: () => getCardHeight(this.rows, this) + (CARD_MARGIN * 2),
      });

      if (this._controllerWidget) {
        // The DOM element gets (widget height - 2 * margin), so the margins must be included here.
        this._controllerWidget.computeSize = () => [MIN_WIDTH, getCardHeight(this.rows, this) + (CARD_MARGIN * 2)];
      }

      const baseGetWidgetOnPos = this.getWidgetOnPos;
      this.getWidgetOnPos = function (...args) {
        const hit = baseGetWidgetOnPos ? baseGetWidgetOnPos.apply(this, args) : undefined;
        return (hit === this._controllerWidget || hit === this._dataWidget) ? undefined : hit;
      };

      this.getConnectionPos = function (is_input, slot_number, out) {
        out = out || new Float32Array(2);
        if (this.flags?.collapsed) {
          return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
        }
        if (!is_input && this.outputs?.[slot_number]) {
          out[0] = this.pos[0] + this.size[0];
          out[1] = this.pos[1] + getRowCenterY(this, slot_number);
          return out;
        }
        return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
      };

      this.getOutputPos = function (slot_idx, out) {
        out = out || new Float32Array(2);
        out[0] = this.pos[0] + this.size[0];
        out[1] = this.pos[1] + getRowCenterY(this, slot_idx);
        return out;
      };

      this.onConnectionsChange = function (type, index, isConnected, link_info) {
        if (type === LiteGraph.OUTPUT) {
          if (isConnected && link_info) {
            const targetNode = app.graph?.getNodeById(link_info.target_id);
            const targetSlot = link_info.target_slot;
            if (targetNode && targetSlot !== undefined && targetSlot >= 0) {
              const detected = detectInputType(targetNode, targetSlot);
              const row = this.rows?.[index];
              if (row) {
                if (!row.label || row.label.startsWith("Control")) {
                  row.label = detected.label || row.label;
                }
                const oldType = normalizeRowType(row.detectedType);
                const newType = normalizeRowType(detected.type);
                row.detectedType = detected.type;
                row.connected = true;

                if (newType === "list") {
                  row.options = Array.isArray(detected.options) && detected.options.length > 0
                    ? detected.options
                    : (row.options || []);
                  if (
                    oldType !== "list" ||
                    row.value === undefined ||
                    row.value === 10 ||
                    row.value === "10" ||
                    !row.options.includes(String(row.value))
                  ) {
                    row.value = String(detected.value ?? row.options[0] ?? "");
                  }
                } else if (newType === "toggle") {
                  if (oldType !== "toggle" || typeof row.value !== "boolean") {
                    row.value = Boolean(detected.value);
                  }
                } else if (newType === "int") {
                  row.min = detected.min ?? row.min ?? 0;
                  row.max = detected.max ?? row.max ?? 100;
                  row.step = detected.step ?? row.step ?? 1;
                  if (oldType !== "int" || row.value === undefined) {
                    row.value = detected.value ?? row.min ?? 0;
                  }
                } else if (newType === "float") {
                  row.min = detected.min ?? row.min ?? 0;
                  row.max = detected.max ?? row.max ?? 1;
                  row.step = detected.step ?? row.step ?? 0.01;
                  if (oldType !== "float" || row.value === undefined || (oldType === "int" && row.value === 10)) {
                    row.value = detected.value ?? row.min ?? 0;
                  }
                } else if (newType === "text") {
                  if (oldType !== "text" || row.value === undefined || row.value === 10) {
                    row.value = String(detected.value ?? "");
                  }
                } else if (newType === "seed") {
                  if (oldType !== "seed" || row.value === undefined || row.value === 10) {
                    row.value = String(detected.value ?? "0");
                  }
                }

                syncControllerData();

                if (!this._isConfiguring && !app.canvas?.loading) {
                  renderRows();
                  this._updateSettingsList?.();
                }
              }
            }
          } else if (!isConnected) {
            const row = this.rows?.[index];
            if (row) {
              row.connected = false;
              syncControllerData();
              if (!this._isConfiguring && !app.canvas?.loading) {
                this._updateSettingsList?.();
              }
            }
          }
        }
      };

      const origSerialize = this.onSerialize;
      this.onSerialize = function (info) {
        origSerialize?.apply(this, arguments);
        syncControllerData();
        if (info) {
          info.controller_rows = JSON.parse(JSON.stringify(this.rows || []));
          info.properties = info.properties || {};
          info.properties.ds_controller_rows = JSON.parse(JSON.stringify(this.rows || []));
        }
      };

      const origNodeSerialize = this.serialize;
      this.serialize = function () {
        syncControllerData();
        const data = origNodeSerialize ? origNodeSerialize.apply(this, arguments) : {};
        if (data) {
          data.controller_rows = JSON.parse(JSON.stringify(this.rows || []));
          data.properties = data.properties || {};
          data.properties.ds_controller_rows = JSON.parse(JSON.stringify(this.rows || []));
        }
        return data;
      };

      const origConfigure = this.onConfigure;
      this.onConfigure = function (info) {
        this._isConfiguring = true;
        try {
          const savedRows = info?.controller_rows || info?.properties?.ds_controller_rows || this.properties?.ds_controller_rows;
          if (Array.isArray(savedRows) && savedRows.length > 0) {
            this.rows = JSON.parse(JSON.stringify(savedRows));
            this.properties = this.properties || {};
            this.properties.ds_controller_rows = this.rows;
          } else if (this._dataWidget?.value) {
            try {
              const parsed = JSON.parse(this._dataWidget.value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                this.rows = parsed;
                this.properties = this.properties || {};
                this.properties.ds_controller_rows = this.rows;
              }
            } catch (_) {}
          } else if (Array.isArray(info?.widgets_values)) {
            for (const val of info.widgets_values) {
              if (typeof val === "string" && val.startsWith("[") && val.includes("detectedType")) {
                try {
                  const parsed = JSON.parse(val);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    this.rows = parsed;
                    this.properties = this.properties || {};
                    this.properties.ds_controller_rows = this.rows;
                    break;
                  }
                } catch (_) {}
              }
            }
          } else if (Array.isArray(info?.outputs) && info.outputs.length > 0) {
            const maxSlotWithLink = info.outputs.reduce((max, out, idx) => {
              return (out && Array.isArray(out.links) && out.links.length > 0) ? Math.max(max, idx) : max;
            }, -1);
            if (maxSlotWithLink >= 0) {
              this.rows = this.rows || [];
              while (this.rows.length <= maxSlotWithLink) {
                this.rows.push({
                  id: `ds_row_${Date.now()}_${this.rows.length}`,
                  label: `Control ${this.rows.length + 1}`,
                  detectedType: "int",
                  min: 0,
                  max: 100,
                  step: 1,
                  value: 10,
                  seedMode: "fixed",
                  expanded: false,
                  customHeight: 84,
                  connected: true,
                });
              }
            }
          }

          if (!this.outputs) this.outputs = [];
          while (this.outputs.length < this.rows.length) {
            const idx = this.outputs.length;
            this.addOutput(" ", "*");
            if (this.outputs[idx]) {
              this.outputs[idx].label = " ";
            }
          }
          origConfigure?.apply(this, arguments);
        } finally {
          this._isConfiguring = false;
        }
        syncControllerData();
        this.syncOutputs();
        renderRows();

        requestAnimationFrame(() => {
          this.syncOutputs();
          alignOutputs();
          this.setDirtyCanvas?.(true, true);
        });
      };

      this.openSettings = (anchorEl) => {
        if (this._settingsPopup && this._settingsPopup.isOpen()) {
          this._settingsPopup.hide();
          this._settingsPopup = null;
          return;
        }

        const existing = document.querySelectorAll(".ds-controller-settings-popup");
        existing.forEach((el) => el.remove());

        let followRaf = null;
        let clickOutsideHandler = null;

        const popup = Popup({
          width: 640,
          maxHeight: 520,
          className: "ds-controller-settings-popup",
          closeOnClickOutside: false,
          onClose: () => {
            this._settingsPopup = null;
            if (followRaf) {
              cancelAnimationFrame(followRaf);
              followRaf = null;
            }
            if (clickOutsideHandler) {
              document.removeEventListener("pointerdown", clickOutsideHandler, true);
              clickOutsideHandler = null;
            }
          },
        });
        this._settingsPopup = popup;

        setTimeout(() => {
          clickOutsideHandler = (e) => {
            if (!popup.isOpen() || !popup.root?.isConnected) return;
            if (popup.root.contains(e.target)) return;
            if (e.target.closest?.(".ds-ui-popup, .ds-ui-dropdown")) return;
            if (anchorEl?.contains?.(e.target)) return;
            popup.hide();
          };
          document.addEventListener("pointerdown", clickOutsideHandler, true);
        }, 50);

        const updatePosition = () => {
          if (!popup || !popup.isOpen() || !popup.root?.isConnected) return;
          const pw = Math.max(popup.root.offsetWidth || 0, 640);
          const ph = Math.max(popup.root.offsetHeight || 0, 360);
          const margin = 12;
          const gap = 14;

          let targetRect = null;
          if (this._controllerCard && this._controllerCard.isConnected) {
            const cr = this._controllerCard.getBoundingClientRect();
            if (cr.width > 0 && cr.height > 0) {
              targetRect = cr;
            }
          }

          if (!targetRect && app?.canvas) {
            const canvasEl = app.canvas.canvas;
            const ds = app.canvas.ds;
            if (canvasEl && ds && Array.isArray(this.pos) && Array.isArray(this.size)) {
              const cr = canvasEl.getBoundingClientRect();
              const scale = Number(ds.scale) || 1;
              const offset = ds.offset || [0, 0];
              const left = cr.left + (Number(this.pos[0] || 0) + Number(offset[0] || 0)) * scale;
              const top = cr.top + (Number(this.pos[1] || 0) + Number(offset[1] || 0)) * scale;
              const width = Number(this.size[0] || 280) * scale;
              const height = Number(this.size[1] || 200) * scale;
              targetRect = { left, top, width, height, right: left + width, bottom: top + height };
            }
          }

          if (targetRect) {
            const spaceRight = window.innerWidth - targetRect.right - margin;
            const spaceLeft = targetRect.left - margin;

            let left;
            if (spaceRight >= pw + gap) {
              left = targetRect.right + gap;
            } else if (spaceLeft >= pw + gap) {
              left = targetRect.left - pw - gap;
            } else if (spaceRight >= spaceLeft) {
              left = targetRect.right + gap;
            } else {
              left = targetRect.left - pw - gap;
            }

            left = Math.max(margin, Math.min(window.innerWidth - pw - margin, left));

            let top = targetRect.top;
            if (top + ph > window.innerHeight - margin) {
              top = window.innerHeight - ph - margin;
            }
            top = Math.max(margin, top);

            popup.root.style.position = "fixed";
            popup.root.style.left = `${Math.round(left)}px`;
            popup.root.style.top = `${Math.round(top)}px`;
            popup.root.style.zIndex = "9999";
          }
        };

        const followLoop = () => {
          if (this._settingsPopup && this._settingsPopup.isOpen()) {
            updatePosition();
            followRaf = requestAnimationFrame(followLoop);
          }
        };

        this._updatePopupPosition = updatePosition;

        const header = document.createElement("div");
        header.className = "ds-controller-settings-header";

        const titleGroup = document.createElement("div");
        titleGroup.className = "ds-controller-settings-title-group";

        const title = document.createElement("div");
        title.className = "ds-controller-settings-title";
        title.textContent = "CONTROLLER SETTINGS";

        const countBadge = document.createElement("div");
        countBadge.className = "ds-controller-settings-count-badge";

        titleGroup.append(title, countBadge);

        const closeBtn = Button({ icon: "x", compact: true, tooltip: "Close", onClick: () => popup.hide() });
        header.append(titleGroup, closeBtn.root);

        const listContainer = document.createElement("div");
        listContainer.className = "ds-controller-settings-list";

        const footer = document.createElement("div");
        footer.className = "ds-controller-settings-footer";

        const addBtn = Button({
          icon: "plus",
          label: "Add Control",
          className: "ds-controller-add-btn",
          onClick: () => this.addControlRow(),
        });
        footer.appendChild(addBtn.root);

        let draggedIndex = null;

        const renderSettingsList = () => {
          countBadge.textContent = `${this.rows.length} ${this.rows.length === 1 ? "CONTROL" : "CONTROLS"}`;
          listContainer.replaceChildren();

          this.rows.forEach((row, i) => {
            const item = document.createElement("div");
            item.className = "ds-controller-settings-item";
            item.draggable = true;

            const handle = document.createElement("div");
            handle.className = "ds-controller-settings-drag-handle";
            handle.textContent = "☰";

            item.addEventListener("dragstart", () => {
              draggedIndex = i;
            });
            item.addEventListener("dragover", (e) => {
              e.preventDefault();
            });
            item.addEventListener("drop", (e) => {
              e.preventDefault();
              if (draggedIndex !== null && draggedIndex !== i) {
                const from = draggedIndex;
                const to = i;
                draggedIndex = null;
                this.moveRow(from, to);
              }
            });

            const nameInp = Input({
              value: row.label || "",
              placeholder: "Control name",
              className: "ds-controller-settings-name",
              onInput: (val) => {
                row.label = val;
                syncControllerData();
                renderRows();
              },
            });

            const normType = normalizeRowType(row.detectedType);
            const typeBadge = document.createElement("div");
            typeBadge.className = "ds-controller-settings-type-badge";
            if (row.connected) {
              typeBadge.classList.add("is-locked");
              typeBadge.textContent = `🔒 ${normType.toUpperCase()}`;
              typeBadge.title = `Locked to detected input type: ${normType.toUpperCase()}`;
            } else {
              typeBadge.textContent = normType.toUpperCase();
              typeBadge.title = `Type: ${normType.toUpperCase()}`;
            }

            const paramGroup = document.createElement("div");
            paramGroup.className = "ds-controller-settings-param-group";

            const syncVal = (val) => {
              row.value = val;
              syncControllerData();
              const linkIds = this.outputs?.[i]?.links || [];
              for (const linkId of linkIds) {
                const link = app.graph?.links?.[linkId];
                if (link) {
                  const targetNode = app.graph.getNodeById(link.target_id);
                  if (targetNode) {
                    const targetInput = targetNode.inputs?.[link.target_slot];
                    const inputName = targetInput?.name;
                    const w = targetNode.widgets?.find(
                      (item) => item.name === inputName || (targetInput?.widget && targetInput.widget.name === item.name)
                    );
                    if (w) {
                      w.value = val;
                      w.callback?.(val);
                      targetNode.setDirtyCanvas?.(true, true);
                    }
                  }
                }
              }
              renderRows();
            };

            const makeField = (label, val, onCommit, isInt = false) => {
              const field = InputRow({
                label,
                value: val ?? 0,
                mono: true,
                className: "ds-controller-settings-param",
                onChange: (raw) => {
                  let num = Number(String(raw).trim());
                  if (isNaN(num)) num = 0;
                  if (isInt) num = Math.round(num);
                  const committed = onCommit(num);
                  field.setValue(committed !== undefined ? committed : num);
                },
              });
              return field.root;
            };

            if (normType === "int") {
              const minP = makeField("Min", row.min ?? 0, (v) => { row.min = v; syncControllerData(); renderRows(); }, true);
              const maxP = makeField("Max", row.max ?? 100, (v) => { row.max = v; syncControllerData(); renderRows(); }, true);
              const defP = makeField("Def", row.value ?? row.min ?? 0, (v) => { syncVal(v); }, true);
              const stepP = makeField("Step", (row.step > 0 ? row.step : 1), (v) => {
                row.step = Math.max(1, Math.round(v));
                syncControllerData();
                renderRows();
                return row.step;
              }, true);
              paramGroup.append(minP, maxP, defP, stepP);
            } else if (normType === "float") {
              const minP = makeField("Min", row.min ?? 0, (v) => { row.min = v; syncControllerData(); renderRows(); }, false);
              const maxP = makeField("Max", row.max ?? 1, (v) => { row.max = v; syncControllerData(); renderRows(); }, false);
              const defP = makeField("Def", row.value ?? row.min ?? 0, (v) => { syncVal(v); }, false);
              const stepP = makeField("Step", (row.step > 0 ? row.step : 0.01), (v) => {
                row.step = Math.max(0.0001, v);
                syncControllerData();
                renderRows();
                return row.step;
              }, false);
              paramGroup.append(minP, maxP, defP, stepP);
            } else if (normType === "toggle") {
              const state = Toggle({
                label: "State",
                checked: Boolean(row.value),
                className: "ds-ui-input-row ds-controller-settings-param",
                onChange: (val) => syncVal(val),
              });
              paramGroup.appendChild(state.root);
            } else if (normType === "list") {
              let opts = Array.isArray(row.options) && row.options.length > 0 ? row.options : [];
              if (opts.length <= 1) {
                const linkId = this.outputs?.[i]?.links?.[0];
                if (linkId !== undefined && linkId !== null) {
                  const link = app.graph?.links?.[linkId];
                  if (link) {
                    const targetNode = app.graph.getNodeById(link.target_id);
                    if (targetNode) {
                      const detected = detectInputType(targetNode, link.target_slot);
                      if (Array.isArray(detected.options) && detected.options.length > 0) {
                        row.options = detected.options;
                        opts = row.options;
                        if (!opts.includes(String(row.value)) || row.value === 10 || row.value === "10") {
                          row.value = String(detected.value ?? opts[0] ?? "");
                        }
                      }
                    }
                  }
                }
              }

              if (opts.length === 0) {
                opts = [String(row.value || "")];
              }

              const curVal = String(row.value ?? opts[0] ?? "");
              const formattedOpts = opts.map((opt) => ({
                id: String(opt),
                label: String(opt),
              }));

              const dd = Dropdown({
                options: formattedOpts,
                value: curVal,
                searchable: true,
                compact: true,
                className: "ds-controller-settings-dropdown-control",
                onChange: (val) => {
                  syncVal(val);
                },
              });

              paramGroup.appendChild(dd.root);
            } else if (normType === "text") {
              const textInp = Input({
                value: row.value ?? "",
                placeholder: "Text value...",
                onInput: (val) => syncVal(val),
              });
              paramGroup.appendChild(textInp.root);
            } else if (normType === "seed") {
              const seedParam = InputRow({
                label: "Seed",
                value: row.value ?? "0",
                mono: true,
                className: "ds-controller-settings-param",
                onChange: (val) => syncVal(val),
                actions: seedActions(
                  row,
                  (val) => { seedParam.setValue(val); syncVal(val); },
                  () => { syncControllerData(); renderRows(); },
                ),
              });
              paramGroup.appendChild(seedParam.root);
            }

            const delBtn = Button({
              icon: "trash-2",
              compact: true,
              tooltip: this.rows.length <= 1 ? "At least one control required" : "Remove Control",
              disabled: this.rows.length <= 1,
              onClick: () => this.removeRow(i),
            });

            item.append(handle, nameInp.root, typeBadge, paramGroup, delBtn.root);
            listContainer.appendChild(item);
          });
        };

        this._updateSettingsList = renderSettingsList;

        renderSettingsList();
        popup.root.append(header, listContainer, footer);
        popup.show();
        updatePosition();
        followLoop();
      };

      const origGetExtraMenuOptions = this.getExtraMenuOptions;
      this.getExtraMenuOptions = function (_, options) {
        origGetExtraMenuOptions?.apply(this, arguments);
        options.push({
          content: "⚙ Controller Settings",
          callback: () => this.openSettings(),
        });
      };

      const origOnRemoved = this.onRemoved;
      this.onRemoved = function () {
        this._layoutObserver?.disconnect();
        if (this._settingsPopup) {
          this._settingsPopup.hide();
          this._settingsPopup = null;
        }
        return origOnRemoved?.apply(this, arguments);
      };

      renderRows();
      this.syncOutputs();
    };
  },
});

function registerDSControllerGear() {
  if (typeof window !== "undefined" && window.DSGearMenu?.register) {
    const gearConfig = {
      tooltip: "DS Controller Settings",
      onClick: (node, canvas, ev) => {
        const anchor = ev?.currentTarget || ev?.target;
        if (typeof node?._toggleControllerGearPopover === "function") {
          node._toggleControllerGearPopover(anchor);
        } else if (typeof node?._openControllerGearPopover === "function") {
          node._openControllerGearPopover(anchor);
        } else if (typeof node?.openSettings === "function") {
          node.openSettings(anchor);
        }
      },
    };
    window.DSGearMenu.register(NODE_NAME, gearConfig);
    window.DSGearMenu.register("DS Controller", gearConfig);
    window.DSGearMenu.register("DS_Controller", gearConfig);
  }
}

registerDSControllerGear();
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", registerDSControllerGear);
  setTimeout(registerDSControllerGear, 500);
  setTimeout(registerDSControllerGear, 2000);
}
