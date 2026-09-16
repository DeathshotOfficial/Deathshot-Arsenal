/* ============================================================
   DS Control Panel — DeathshotArsenal
   ============================================================ */

import { app } from "/scripts/app.js";
import {
  MAX_CONTROLS,
  createDefaultControl,
  cloneControl,
  serializeControls,
  isAcceptableInputType,
  hasComboOptions,
  resolveControlTypeFromInput,
  adoptTargetConfig,
  outputTypeForControl,
  applyManualType,
} from "./core.mjs";
import {
  syncRowWidgets,
  bodyHeight,
  fitNode,
  alignOutputsLegacy,
  scheduleAlign,
  watchAlign,
  unwatchAlign,
  createControlRow,
  ZW,
  MIN_W,
  DEFAULT_W,
  showToast,
  releaseGearNode,
  isVueNodes,
} from "./ui.mjs";
import {
  openSettings,
  closeSettings,
  isSettingsOpen,
  openAccentPicker,
  CUSTOM_ACCENT_PRESETS,
  PRESET_NAMES,
} from "./settings.mjs";

function registerGearMenu() {
  if (window.DSGearMenu?.register) {
    window.DSGearMenu.register("DS_ControlPanel", {
      tooltip: "DS Control Panel Settings",
      onClick: (node, canvas, event) => {
        const anchor = event?.currentTarget || event?.target;
        const api = node._dsSettingsApi?.();
        if (!api) return;
        if (isSettingsOpen(node)) {
          closeSettings(node);
        } else {
          openSettings(app, node, api, anchor);
        }
      },
    });
    return true;
  }
  return false;
}

if (!registerGearMenu()) {
  setTimeout(registerGearMenu, 250);
  setTimeout(registerGearMenu, 1000);
}

const cssBase = "/extensions/DeathshotArsenal/Control Panel/ds_control_panel.css";
const existingCssLink = document.querySelector('link[href*="ds_control_panel.css"]');
if (existingCssLink) {
  existingCssLink.href = `${cssBase}?v=${Date.now()}`;
} else {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${cssBase}?v=${Date.now()}`;
  document.head.appendChild(link);
}

const REJECT_TOAST = "Control Panel drives numbers, switches, dropdowns, seeds, and text — not structural data.";

function findWidgetValue(targetNode, inputName) {
  const w = (targetNode?.widgets || []).find((x) => x?.name === inputName);
  return w ? w.value : undefined;
}

const awaitlessUi = { createControlRow };

app.registerExtension({
  name: "DeathshotArsenal.ControlPanel",

  async setup() {
    registerGearMenu();
    const original = app.graphToPrompt?.bind(app);
    if (!original || app._dsControlPanelPromptHooked) return;
    app._dsControlPanelPromptHooked = true;

    app.graphToPrompt = async function (...args) {
      const result = await original(...args);
      try {
        const nodes = app.graph?._nodes || [];
        for (const node of nodes) {
          if (node?.type !== "DS_ControlPanel" || !node._dsControls) continue;
          const entry = result?.output?.[String(node.id)];
          if (!entry) continue;
          entry.inputs = entry.inputs || {};

          // ALWAYS inject ControlState into inputs for every run
          const runtime = node._dsControls.map((c) => {
            if (c.type === "seed" && c.seedMode === "random") {
              return { ...c, value: Math.floor(Math.random() * 0xffffffff) };
            }
            return c;
          });
          entry.inputs.ControlState = JSON.stringify(serializeControls(runtime));
        }
      } catch (e) {
        console.warn("[DS Control Panel] prompt serialization failed:", e);
      }
      return result;
    };
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_ControlPanel") return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;
    const originalConnections = nodeType.prototype.onConnectionsChange;
    const originalAdded = nodeType.prototype.onAdded;
    const originalRemoved = nodeType.prototype.onRemoved;
    const originalExtraMenu = nodeType.prototype.getExtraMenuOptions;

    nodeType.prototype._dsSettingsApi = function () {
      const node = this;
      return {
        patch(index, patch) {
          const c = node._dsControls[index];
          if (!c) return;
          Object.assign(c, patch);
          if (c.type === "int" || c.type === "float") {
            c.value = Math.min(Math.max(Number(c.value) || 0, c.min), c.max);
          }
          node._dsRerenderRow(index);
          node._dsSyncOutputMeta(index);
          node._dsPersist();
          fitNode(node);
          node._dsRerenderSettings?.();
        },
        setType(index, type) {
          const c = node._dsControls[index];
          if (!c || c.lastTarget) return;
          applyManualType(c, type);
          node._dsRerenderRow(index);
          node._dsSyncOutputMeta(index);
          node._dsPersist();
          fitNode(node);
          node._dsRerenderSettings?.();
        },
        move(index, dir) {
          const to = index + dir;
          if (to < 0 || to >= node._dsControls.length) return;
          const arr = node._dsControls;
          [arr[index], arr[to]] = [arr[to], arr[index]];
          node._dsRenderRows();
          node._dsSyncAllOutputMeta();
          node._dsPersist();
          scheduleAlign(node);
          node._dsRerenderSettings?.();
        },
        remove(index) {
          if (node._dsControls.length <= 1) return;
          node._dsRemoveControl(index);
          node._dsRerenderSettings?.();
        },
        add() {
          node._dsAddControl();
          node._dsRerenderSettings?.();
        },
        setAccent(color) {
          node.properties.ds_cp_accent = color;
          const onAccent = window.DSGlobalTheme?.getOnAccentTextColor ? window.DSGlobalTheme.getOnAccentTextColor(color) : "#0a0c10";
          const onShadow = window.DSGlobalTheme?.getOnAccentShadow ? window.DSGlobalTheme.getOnAccentShadow(color) : "0 1px 0 rgba(255,255,255,0.35)";
          for (const w of node._dsRowWidgets || []) {
            w?.element?.style?.setProperty("--ds-cp-accent-override", color);
            w?.element?.style?.setProperty("--ds-cp-fill-text", onAccent);
            w?.element?.style?.setProperty("--ds-cp-fill-shadow", onShadow);
          }
          if (node._dsAddWidget?.element?.style) {
            node._dsAddWidget.element.style.setProperty("--ds-cp-accent-override", color);
          }
          node._dsPersist();
          node._dsRerenderSettings?.();
        },
      };
    };

    nodeType.prototype._dsSyncOutputMeta = function (index) {
      const control = this._dsControls[index];
      const output = this.outputs?.[index];
      if (!control || !output) return;
      output.name = `value_${index + 1}`;
      output.label = ZW;
      output.type = outputTypeForControl(control);
    };

    nodeType.prototype._dsSyncAllOutputMeta = function () {
      for (let i = 0; i < this._dsControls.length; i++) this._dsSyncOutputMeta(i);
    };

    nodeType.prototype._dsSyncOutputs = function () {
      const target = Math.min(this._dsControls.length, MAX_CONTROLS);
      while ((this.outputs?.length || 0) > target) {
        try { this.removeOutput(this.outputs.length - 1); } catch (_) { break; }
      }
      while ((this.outputs?.length || 0) < target) {
        const i = this.outputs.length;
        this.addOutput(`value_${i + 1}`, outputTypeForControl(this._dsControls[i]));
      }
      this._dsSyncAllOutputMeta();
    };

    nodeType.prototype._dsRowApi = function (index) {
      const node = this;
      return {
        getValue: () => node._dsControls[index],
        setValue: (patchOrValue, meta) => {
          const c = node._dsControls[index];
          if (!c) return;
          if (patchOrValue !== null && typeof patchOrValue === "object" && !Array.isArray(patchOrValue)) {
            Object.assign(c, patchOrValue);
          } else {
            c.value = patchOrValue;
          }
          node._dsRows[index]?.render(c);
          node._dsPersist();
          if (meta?.grow) {
            fitNode(node);
          }
        },
      };
    };

    nodeType.prototype._dsRenderRows = function () {
      syncRowWidgets(
        this,
        (index) => {
          const { createControlRow } = this._dsUI;
          return createControlRow(this._dsControls[index], this._dsRowApi(index));
        },
        () => this._dsAddControl(),
      );
      scheduleAlign(this);
    };

    nodeType.prototype._dsRerenderRow = function () {
      this._dsRenderRows();
    };

    nodeType.prototype._dsAddControl = function () {
      if (this._dsControls.length >= MAX_CONTROLS) {
        showToast(this._dsRows?.[0]?.root || document.body, `Control Panel supports up to ${MAX_CONTROLS} controls.`);
        return;
      }
      this._dsControls.push(createDefaultControl(this._dsControls.length));
      this._dsSyncOutputs();
      this._dsPersist();
      this._dsRenderRows();
      fitNode(this);
    };

    nodeType.prototype._dsRemoveControl = function (index) {
      if (this._dsControls.length <= 1) return;
      this._dsRemovingRow = true;
      try {
        if (this.outputs?.[index]) {
          try { this.removeOutput(index); } catch (_) {}
        }
        this._dsControls.splice(index, 1);
        this._dsSyncOutputs();
        this._dsPersist();
        this._dsRenderRows();
        fitNode(this);
      } finally {
        this._dsRemovingRow = false;
      }
    };

    nodeType.prototype._dsPersist = function () {
      this.properties = this.properties || {};
      this.properties.ds_cp_controls = serializeControls(this._dsControls || []);
      this.setDirtyCanvas?.(true, true);
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated ? originalCreated.apply(this, arguments) : undefined;
      this._dsUI = awaitlessUi;
      this.resizable = true;
      this.properties = this.properties || {};

      const saved = Array.isArray(this.properties.ds_cp_controls) ? this.properties.ds_cp_controls : null;
      this._dsControls = saved && saved.length
        ? saved.map((s) => cloneControl(s))
        : [createDefaultControl(0)];

      this.widgets_start_y = 2;

      if (!isVueNodes()) {
        this.computeSize = function () {
          return [MIN_W, bodyHeight(this)];
        };
      }

      this._dsSyncOutputs();
      this._dsRenderRows();

      if (!Array.isArray(this.size)) this.size = [DEFAULT_W, DEFAULT_W];
      this.size[0] = DEFAULT_W;
      this.size[1] = bodyHeight(this) + (isVueNodes() ? 52 : 0);

      window.DSGlobalTheme?.applyNodeBase?.(this);
      window.DSGlobalTheme?.subscribe?.(() => {
        this.setDirtyCanvas?.(true, true);
        this._dsRenderRows?.();
      });

      queueMicrotask(() => {
        fitNode(this);
        watchAlign(this);
        scheduleAlign(this);
      });

      return result;
    };

    nodeType.prototype.onConfigure = function () {
      this._dsConfiguring = true;
      try {
        const r = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
        this.properties = this.properties || {};
        this.widgets_start_y = 2;
        const saved = Array.isArray(this.properties.ds_cp_controls) ? this.properties.ds_cp_controls : null;
        this._dsControls = saved && saved.length
          ? saved.map((s) => cloneControl(s))
          : [createDefaultControl(0)];

        this._dsRenderRows();
        queueMicrotask(() => {
          fitNode(this);
          watchAlign(this);
          scheduleAlign(this);
        });
        return r;
      } finally {
        this._dsConfiguring = false;
      }
    };

    nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link) {
      if (originalConnections) originalConnections.apply(this, arguments);
      if (type !== 2 /* LiteGraph.OUTPUT */ || this._dsRemovingRow) return;
      if (this._dsConfiguring || app.configuringGraph) return;

      const linkInfo = (typeof link === "object" && link !== null)
        ? link
        : (this.graph?.links?.[link] || (typeof this.graph?.links?.get === "function" ? this.graph.links.get(link) : null));

      const outSlot = (linkInfo && Number.isInteger(linkInfo.origin_slot)) ? linkInfo.origin_slot : slotIndex;
      const control = this._dsControls?.[outSlot];
      const output = this.outputs?.[outSlot];
      if (!control || !output) return;

      if (isConnected) {
        if (linkInfo) {
          const graph = this.graph || app.graph;
          const targetNode = graph?.getNodeById?.(linkInfo.target_id);
          const targetInput = targetNode?.inputs?.[linkInfo.target_slot];
          if (!targetNode || !targetInput) return;

          const rawType = Array.isArray(targetInput.type) ? "COMBO" : targetInput.type;
          if (!isAcceptableInputType(rawType) && !hasComboOptions(targetInput)) {
            const self = this;
            const lk = linkInfo;
            setTimeout(() => {
              if (!self.graph || app.configuringGraph) return;
              try {
                const tgt = self.graph.getNodeById?.(lk.target_id);
                const inp = tgt?.inputs?.[lk.target_slot];
                if (tgt && inp && inp.link === lk.id) {
                  tgt.disconnectInput(lk.target_slot);
                  self.setDirtyCanvas?.(true, true);
                  showToast(self._dsRows?.[outSlot]?.root || document.body, REJECT_TOAST);
                }
              } catch (_) {}
            }, 0);
            return;
          }

          const targetKey = `${linkInfo.target_id}:${linkInfo.target_slot}`;
          const inputName = targetInput.name || targetInput.widget?.name || `input_${linkInfo.target_slot}`;
          if (control.lastTarget !== targetKey) {
            try {
              control.type = resolveControlTypeFromInput(targetInput, inputName);
              adoptTargetConfig(control, targetInput, inputName, findWidgetValue(targetNode, inputName), targetNode);
              control.lastTarget = targetKey;
              this._dsSyncOutputMeta(outSlot);
              this._dsRerenderRow(outSlot);
            } catch (e) {
              console.warn("[DS Control Panel] connection adoption failed", e);
            }
          }
          this._dsPersist();
          scheduleAlign(this);
        }
      } else if (!this._dsRemovingRow) {
        const self = this;
        const row = control;
        setTimeout(() => {
          if (!self.graph || app.configuringGraph) return;
          const currentLinks = output.links;
          if (!currentLinks || currentLinks.length === 0) {
            row.lastTarget = null;
            output.type = "*";
            output.label = ZW;
            self._dsPersist();
            scheduleAlign(self);
          }
        }, 0);
      }
    };

    const originalArrange = nodeType.prototype.arrange;
    nodeType.prototype.arrange = function () {
      const r = originalArrange?.apply(this, arguments);
      if (!isVueNodes()) {
        alignOutputsLegacy(this);
        originalArrange?.apply(this, arguments);
      }
      return r;
    };

    const originalSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      const o = originalSerialize?.apply(this, arguments);
      if (o?.outputs) for (const out of o.outputs) if (out?.pos) delete out.pos;
      return o;
    };

    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      if (originalExtraMenu) originalExtraMenu.apply(this, arguments);
      const api = this._dsSettingsApi();
      const currentAccent = (this.properties?.ds_cp_accent || "#67e8f9").toLowerCase();

      options.push(
        { content: "Control settings", callback: () => openSettings(app, this, api) },
        { content: "Add control", callback: () => this._dsAddControl() },
        {
          content: "Accent Color",
          has_submenu: true,
          submenu: {
            options: [
              {
                content: "🎨 Custom Accent...",
                callback: () => openAccentPicker(app, this, api),
              },
              null,
              ...CUSTOM_ACCENT_PRESETS.map((color) => ({
                content: `${currentAccent === color.toLowerCase() ? "● " : "○ "} ${PRESET_NAMES[color] || color}`,
                callback: () => api.setAccent(color),
              })),
            ],
          },
        },
        null,
      );
    };

    nodeType.prototype.onRemoved = function () {
      this._dsRemoved = true;
      closeSettings(this);
      unwatchAlign(this);
      releaseGearNode(this);
      if (this._dsRowWidgets) for (const w of this._dsRowWidgets) { try { w.onRemove?.(); } catch (_) {} }
      if (this._dsAddWidget) { try { this._dsAddWidget.onRemove?.(); } catch (_) {} }
      if (originalRemoved) originalRemoved.apply(this, arguments);
    };

    nodeType.prototype.onAdded = function (graph) {
      if (originalAdded) originalAdded.apply(this, arguments);
      scheduleAlign(this);
    };
  },

  getNodeMenuItems(node) {
    if (node?.comfyClass !== "DS_ControlPanel" && node?.type !== "DS_ControlPanel") return [];
    const api = node._dsSettingsApi?.();
    if (!api) return [];
    const currentAccent = (node.properties?.ds_cp_accent || "#67e8f9").toLowerCase();

    return [
      {
        content: "⚙ Control settings",
        callback: () => openSettings(app, node, api),
      },
      {
        content: "+ Add control",
        callback: () => node._dsAddControl?.(),
      },
      {
        content: "Accent Color",
        submenu: {
          options: [
            {
              content: "🎨 Custom Accent...",
              callback: () => openAccentPicker(app, node, api),
            },
            null,
            ...CUSTOM_ACCENT_PRESETS.map((color) => ({
              content: `${currentAccent === color.toLowerCase() ? "● " : "○ "} ${PRESET_NAMES[color] || color}`,
              callback: () => api.setAccent(color),
            })),
          ],
        },
      },
    ];
  },
});