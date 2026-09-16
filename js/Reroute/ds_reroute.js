/* ============================================================
   Deathshot Arsenal — DS Reroute
   Generic Pass-Through Routing Node with Editable Label
   ============================================================ */

import { app } from "/scripts/app.js";

const EXTENSION_NAME = "DeathshotArsenal.DSReroute";
const NODE_TYPE = "DS_Reroute";
const NODE_TITLE = "DS Reroute";
const DEFAULT_HEIGHT = 28;
const DEFAULT_WIDTH = 140;
const MIN_WIDTH = 70;
const SOCKET_MARGIN = 22; // Clearance between socket and editable field

// -----------------------------------------------------------------------------
// DSRerouteNode Class Definition
// -----------------------------------------------------------------------------
function registerDSRerouteNodeType() {
  const LiteGraph = globalThis.LiteGraph;
  if (!LiteGraph || !LiteGraph.LGraphNode) return null;

  class DSRerouteNode extends LiteGraph.LGraphNode {
    static title = NODE_TITLE;
    static type = NODE_TYPE;
    static comfyClass = NODE_TYPE;
    static category = "Routing";
    static title_mode = LiteGraph.NO_TITLE;
    static collapsable = false;

    constructor(title = NODE_TITLE) {
      super(title);
      this.isVirtualNode = true;
      this.comfyClass = NODE_TYPE;
      this.type = NODE_TYPE;
      this.title = "";
      this.title_mode = LiteGraph.NO_TITLE;
      this.collapsable = false;
      this.hideSlotLabels = true;
      this.resizable = true;

      // Rounded container shape with Deathshot theme colors
      this.shape = LiteGraph.ROUND_SHAPE;
      this.color = "#161a23";
      this.bgcolor = "#0e1016";
      this.boxcolor = "rgba(255, 255, 255, 0.14)";

      this.flags = {
        no_title: true,
        allow_interaction: true,
      };

      this.size = [DEFAULT_WIDTH, DEFAULT_HEIGHT];
      this.min_size = [MIN_WIDTH, DEFAULT_HEIGHT];

      this.properties = this.properties || {};
      this.properties.label = this.properties.label ?? "";

      // Single input & single output row
      this.addInput("", "*");
      this.addOutput("", "*");

      // Listen for global theme updates to immediately re-render with new colors/fonts
      if (window.DSGlobalTheme?.subscribe) {
        this._dsThemeUnsub = window.DSGlobalTheme.subscribe(() => {
          this.setDirtyCanvas(true, true);
        });
      }
    }

    onRemoved() {
      if (this._dsThemeUnsub) {
        this._dsThemeUnsub();
        this._dsThemeUnsub = null;
      }
      super.onRemoved?.();
    }

    get title_mode() {
      return LiteGraph.NO_TITLE;
    }
    set title_mode(_) {}

    // Suppress title bar rendering while keeping the rounded body shape
    onDrawTitleBar() { return true; }
    drawTitleBarBackground() { return true; }
    onDrawTitleText() { return true; }
    drawTitleText() { return true; }

    // Accurate socket positioning inside the node
    getConnectionPos(is_input, slot_number, out) {
      out = out || new Float32Array(2);
      const [w, h] = this.size;
      const cy = Math.round(h * 0.5);
      out[0] = this.pos[0] + (is_input ? 10 : w - 10);
      out[1] = this.pos[1] + cy;
      return out;
    }

    getInputPos(slot, out) {
      return this.getConnectionPos(true, slot, out);
    }

    getOutputPos(slot, out) {
      return this.getConnectionPos(false, slot, out);
    }

    // Minimum allowed size for resizing: enables shrinking down to MIN_WIDTH
    computeSize() {
      return [MIN_WIDTH, DEFAULT_HEIGHT];
    }

    onResize(size) {
      size[0] = Math.max(MIN_WIDTH, Math.round(size[0]));
      size[1] = DEFAULT_HEIGHT;
      this.setDirtyCanvas(true, false);
    }

    // Open text editing dialog
    promptLabel(canvas, event) {
      const c = canvas || app.canvas;
      const current = this.properties?.label || "";
      const commit = (val) => {
        if (val !== null && val !== undefined) {
          this.properties.label = String(val).trim();
          this.setDirtyCanvas(true, true);
        }
      };

      if (c && typeof c.prompt === "function") {
        c.prompt("Label", current, commit, event);
      } else {
        const res = window.prompt("Reroute Label:", current);
        if (res !== null) {
          commit(res);
        }
      }
    }

    onMouseDown(event, localPos, canvas) {
      if (!localPos) return false;

      const [w, h] = this.size;

      // Allow LiteGraph resize in bottom-right corner (15x15)
      if (localPos[0] >= w - 15 && localPos[1] >= h - 15) {
        return false;
      }

      // Allow LiteGraph wire linking on left or right socket areas
      if (localPos[0] < SOCKET_MARGIN || localPos[0] > w - SOCKET_MARGIN) {
        return false;
      }

      // Track mouse position to detect clean clicks for editing vs node movement
      this._downX = localPos[0];
      this._downY = localPos[1];
      this._downTime = Date.now();
      return false;
    }

    onMouseUp(event, localPos, canvas) {
      if (!localPos || this._downX === undefined) return false;
      const dx = Math.abs(localPos[0] - this._downX);
      const dy = Math.abs(localPos[1] - this._downY);
      const dt = Date.now() - (this._downTime || 0);
      this._downX = undefined;

      // If user clicked inside the central label field without dragging
      if (dx < 5 && dy < 5 && dt < 400) {
        const [w] = this.size;
        if (localPos[0] >= SOCKET_MARGIN && localPos[0] <= w - SOCKET_MARGIN) {
          this.promptLabel(canvas, event);
          return true;
        }
      }
      return false;
    }

    onDblClick(event, localPos, canvas) {
      this.promptLabel(canvas, event);
      return true;
    }

    onDrawBackground(ctx) {
      if (this.flags?.collapsed || !ctx) return;

      const [w, h] = this.size;
      const cy = Math.round(h * 0.5);
      const radius = 8;

      // 1. Draw rounded outer node container
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(0, 0, w, h, [radius]);
      } else {
        ctx.rect(0, 0, w, h);
      }

      const panelBg = window.DSGlobalTheme?.getVar?.("--ds-panel", "#0f1219") || "#0f1219";
      const inputBg = window.DSGlobalTheme?.getVar?.("--ds-input-bg", "#080a0f") || "#080a0f";
      const border = window.DSGlobalTheme?.getVar?.("--ds-border", "rgba(255, 255, 255, 0.14)") || "rgba(255, 255, 255, 0.14)";
      const accent = window.DSGlobalTheme?.getVar?.("--ds-accent", "#67e8f9") || "#67e8f9";
      const textColor = window.DSGlobalTheme?.getVar?.("--ds-text", "#fcee0a") || "#fcee0a";

      ctx.fillStyle = panelBg;
      ctx.fill();

      ctx.strokeStyle = this.is_selected ? accent : border;
      ctx.lineWidth = this.is_selected ? 1.5 : 1;
      ctx.stroke();

      // 2. Central editable field plate
      const fx = SOCKET_MARGIN;
      const fy = 3;
      const fw = Math.max(10, w - SOCKET_MARGIN * 2);
      const fh = h - 6;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(fx, fy, fw, fh, [5]);
      } else {
        ctx.rect(fx, fy, fw, fh);
      }

      ctx.fillStyle = inputBg;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Label text or placeholder with full theme color & dynamic font
      const cfg = window.DSGlobalTheme?.getConfig?.() || {};
      const fontName = cfg.font || window.DSGlobalTheme?.getVar?.("--ds-font", "Inter") || "Inter";
      ctx.font = `600 11px "${fontName}", Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const label = this.properties?.label || "";
      if (label) {
        ctx.fillStyle = textColor;
        ctx.fillText(label, Math.round(w * 0.5), cy, fw - 8);
      } else {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = textColor;
        ctx.fillText("Reroute", Math.round(w * 0.5), cy, fw - 8);
        ctx.restore();
      }

      ctx.restore();
    }

    onConnectionsChange(type, slotIndex, isConnected, link, ioSlot) {
      const graph = this.graph || app.graph;
      if (!graph || app.configuringGraph) return;

      // When multiple outputs connect, disconnect mismatched types if any
      if (isConnected && type === LiteGraph.OUTPUT && this.outputs?.[0]?.links) {
        const connectedLinks = this.outputs[0].links.map((l) => graph.links[l]).filter(Boolean);
        const nonWildcardTypes = new Set(
          connectedLinks.map((l) => l.type).filter((t) => t && t !== "*")
        );
        if (nonWildcardTypes.size > 1) {
          const toDisconnect = connectedLinks.slice(0, -1);
          for (const l of toDisconnect) {
            graph.getNodeById(l.target_id)?.disconnectInput(l.target_slot);
          }
        }
      }

      // Trace backward to root origin node and slot
      let current = this;
      const chainNodes = [];
      let originType = null;
      let rootReroute = null;

      while (current) {
        chainNodes.unshift(current);
        const linkId = current.inputs?.[0]?.link;
        if (linkId != null) {
          const l = graph.links[linkId];
          if (!l) break;
          const node = graph.getNodeById(l.origin_id);
          if (!node) break;

          const nodeType = node.type || node.constructor?.type;
          if (nodeType?.includes("Reroute")) {
            if (node === this) {
              // Circular link detected: disconnect safely
              current.disconnectInput(l.target_slot);
              break;
            }
            current = node;
          } else {
            rootReroute = current;
            originType = node.outputs?.[l.origin_slot]?.type ?? null;
            break;
          }
        } else {
          break;
        }
      }

      // Trace forward to downstream destination nodes
      const queue = [this];
      let targetType = null;

      while (queue.length) {
        current = queue.pop();
        const links = current.outputs?.[0]?.links ?? [];
        for (const linkId of links) {
          const l = graph.links[linkId];
          if (!l) continue;
          const node = graph.getNodeById(l.target_id);
          if (!node) continue;

          const nodeType = node.type || node.constructor?.type;
          if (nodeType?.includes("Reroute")) {
            queue.push(node);
            if (!chainNodes.includes(node)) chainNodes.push(node);
          } else {
            const inputSlot = node.inputs?.[l.target_slot];
            const slotType = inputSlot?.type;
            const valid = !originType || !slotType || LiteGraph.isValidConnection(originType, slotType);
            if (!valid) {
              node.disconnectInput(l.target_slot);
              continue;
            }
            targetType = slotType;
          }
        }
      }

      // Update resolved output type and link colors across the reroute chain
      const resolvedType = originType || targetType || "*";
      const color = LiteGraph.LGraphCanvas.link_type_colors?.[resolvedType];

      for (const node of chainNodes) {
        if (node.outputs && node.outputs[0]) {
          node.outputs[0].type = originType || "*";
          node.__outputType = resolvedType;
          for (const linkId of node.outputs[0].links || []) {
            const l = graph.links[linkId];
            if (l && color) l.color = color;
          }
        }
      }

      if (rootReroute?.inputs?.[0]?.link) {
        const l = graph.links[rootReroute.inputs[0].link];
        if (l && color) l.color = color;
      }

      this.setDirtyCanvas(true, true);
    }

    onAfterGraphConfigured() {
      requestAnimationFrame(() => {
        this.onConnectionsChange(LiteGraph.INPUT, 0, true);
      });
    }

    getExtraMenuOptions(canvas, options) {
      options.unshift({
        content: "Edit Label",
        callback: () => this.promptLabel(canvas),
      });
      return [];
    }

    clone() {
      const cloned = super.clone();
      if (cloned) {
        cloned.properties = cloned.properties || {};
        cloned.properties.label = this.properties?.label || "";
        cloned.size = [this.size[0], DEFAULT_HEIGHT];
        if (cloned.inputs?.[0]) cloned.inputs[0].type = "*";
        if (cloned.outputs?.[0]) cloned.outputs[0].type = "*";
      }
      return cloned;
    }

    configure(info) {
      super.configure(info);
      this.properties = this.properties || {};
      if (info.properties?.label !== undefined) {
        this.properties.label = String(info.properties.label);
      } else if (info.widgets_values?.[0] !== undefined) {
        this.properties.label = String(info.widgets_values[0]);
      } else {
        this.properties.label = this.properties.label || "";
      }
      this.size[1] = DEFAULT_HEIGHT;
    }

    serialize() {
      const data = super.serialize();
      data.properties = data.properties || {};
      data.properties.label = this.properties?.label || "";
      data.widgets_values = [this.properties.label || ""];
      return data;
    }
  }

  // Register only the true backend type identifier to avoid creating duplicate nodes in search
  LiteGraph.registerNodeType(NODE_TYPE, DSRerouteNode);

  return DSRerouteNode;
}

// -----------------------------------------------------------------------------
// Web Extension Registration
// -----------------------------------------------------------------------------
if (typeof globalThis.LiteGraph !== "undefined") {
  registerDSRerouteNodeType();
}

app.registerExtension({
  name: EXTENSION_NAME,

  async init() {
    registerDSRerouteNodeType();
  },

  async setup() {
    registerDSRerouteNodeType();

    // Subscribe global theme changes to re-draw reroutes
    if (window.DSGlobalTheme?.subscribe) {
      window.DSGlobalTheme.subscribe(() => {
        const graph = app.graph;
        if (graph) graph.setDirtyCanvas(true, true);
      });
    }

    const syncExisting = () => {
      const graph = app.graph;
      if (!graph || !graph._nodes) return;
      for (const node of graph._nodes) {
        if (node.type === NODE_TYPE || node.constructor?.name === "DSRerouteNode") {
          node.isVirtualNode = true;
          node.comfyClass = NODE_TYPE;
          node.title_mode = LiteGraph.NO_TITLE;
          node.title = "";
          node.size[1] = DEFAULT_HEIGHT;
          node.shape = LiteGraph.ROUND_SHAPE;
        }
      }
    };

    syncExisting();
    setTimeout(syncExisting, 100);
    setTimeout(syncExisting, 1000);
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name === NODE_TYPE) {
      nodeType.title_mode = LiteGraph.NO_TITLE;
      nodeType.collapsable = false;
      nodeType.category = "Routing";
    }
  },

  nodeCreated(node) {
    if (node.type === NODE_TYPE || node.constructor?.name === "DSRerouteNode") {
      node.isVirtualNode = true;
      node.comfyClass = NODE_TYPE;
      node.title_mode = LiteGraph.NO_TITLE;
      node.title = "";
      node.size[1] = DEFAULT_HEIGHT;
      node.shape = LiteGraph.ROUND_SHAPE;
    }
  },

  async afterConfigureGraph() {
    const graph = app.graph;
    if (!graph || !graph._nodes) return;
    for (const node of graph._nodes) {
      if (node.type === NODE_TYPE || node.constructor?.name === "DSRerouteNode") {
        node.isVirtualNode = true;
        node.comfyClass = NODE_TYPE;
        node.title_mode = LiteGraph.NO_TITLE;
        node.title = "";
        node.size[1] = DEFAULT_HEIGHT;
        node.shape = LiteGraph.ROUND_SHAPE;
      }
    }
  },
});
