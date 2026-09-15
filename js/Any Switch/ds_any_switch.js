// Deathshot Arsenal — DS Any Switch
// Native ComfyUI/LiteGraph node shell + compact dynamic wildcard inputs.
// Default: 2 inputs. Click the green + in the title bar to add another.

import { app } from "/scripts/app.js";

const TYPE = "DS_AnySwitch";
const EXTENSION = "DeathshotArsenal.DSAnySwitch";
const MIN_W = 205;
const MIN_H = 82;
const ROW_H = 20;
const TITLE_H = 30;
const BODY_PAD = 12;

function graphFor(node) {
  return node?.graph || app?.canvas?.graph || app?.graph || null;
}

function linkForInput(node, input) {
  const graph = graphFor(node);
  if (!input?.link || !graph?.links) return null;
  return graph.links[input.link] || null;
}

function connectedTypeFromInputs(node) {
  for (const input of node.inputs || []) {
    const link = linkForInput(node, input);
    if (!link) continue;

    const origin = graphFor(node)?.getNodeById?.(link.origin_id);
    const output = origin?.outputs?.[link.origin_slot];
    const type = output?.type;
    if (type && type !== "*" && type !== "0") {
      return { type, label: output.label || String(type) };
    }
  }
  return null;
}

function connectedTypeFromOutput(node) {
  const graph = graphFor(node);
  const output = node.outputs?.[0];
  if (!output?.links || !graph?.links) return null;

  for (const id of output.links) {
    const link = graph.links[id];
    if (!link) continue;
    const target = graph.getNodeById?.(link.target_id);
    const input = target?.inputs?.[link.target_slot];
    const type = input?.type;
    if (type && type !== "*" && type !== "0") {
      return { type, label: input.label || String(type) };
    }
  }
  return null;
}

function inferType(node) {
  return connectedTypeFromInputs(node) || connectedTypeFromOutput(node) || { type: "*", label: "*" };
}

function inputNumber(name) {
  const match = String(name || "").match(/^any_(\d+)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function inputName(index) {
  return `any_${String(index).padStart(2, "0")}`;
}

function requiredHeight(node) {
  return Math.max(MIN_H, TITLE_H + BODY_PAD + (node.inputs?.length || 2) * ROW_H);
}

function ensureTwoInputs(node) {
  if (!Array.isArray(node.inputs)) node.inputs = [];

  // A workflow loaded from disk may already contain the dynamic inputs. Never
  // duplicate those. Only fill missing defaults when necessary.
  while (node.inputs.length < 2) {
    const name = inputName(node.inputs.length + 1);
    node.addInput(name, node._dsAnyType || "*");
  }
}

function normalizeInputNames(node) {
  if (!Array.isArray(node.inputs)) return;
  node.inputs.forEach((input, index) => {
    input.name = inputName(index + 1);
    input.label = inputName(index + 1);
  });
}

function removeAnyInput(node) {
  ensureTwoInputs(node);
  if ((node.inputs?.length || 2) <= 2) {
    node._dsAnyMinusHover = false;
    node.setDirtyCanvas?.(true, true);
    return;
  }

  const lastIndex = node.inputs.length - 1;
  const lastInput = node.inputs[lastIndex];

  // Only remove the final dynamic input. LiteGraph handles unlinking any
  // connection attached to that input when the slot is removed.
  node.removeInput?.(lastIndex);
  node._dsAnyInputCount = node.inputs.length;
  normalizeInputNames(node);

  const minHeight = requiredHeight(node);
  if (Array.isArray(node.size) && node.size[1] > minHeight) {
    node.setSize([node.size[0], minHeight]);
  }

  stabilize(node);
  node.setDirtyCanvas?.(true, true);
  graphFor(node)?.setDirtyCanvas?.(true, true);
  graphFor(node)?.change?.();
}

function addAnyInput(node) {
  ensureTwoInputs(node);
  const next = node.inputs.length + 1;
  node.addInput(inputName(next), node._dsAnyType || "*");
  node._dsAnyInputCount = node.inputs.length;

  const h = requiredHeight(node);
  if (!Array.isArray(node.size) || node.size[1] < h) {
    node.setSize([Math.max(MIN_W, node.size?.[0] || MIN_W), h]);
  }

  node.setDirtyCanvas?.(true, true);
  graphFor(node)?.setDirtyCanvas?.(true, true);
  graphFor(node)?.change?.();
}

function stabilize(node) {
  ensureTwoInputs(node);
  normalizeInputNames(node);

  const resolved = inferType(node);
  node._dsAnyType = resolved.type || "*";
  node._dsAnyLabel = resolved.label || String(node._dsAnyType);

  for (const input of node.inputs || []) {
    input.type = node._dsAnyType;
  }

  if (node.outputs?.[0]) {
    node.outputs[0].type = node._dsAnyType;
    node.outputs[0].label = node._dsAnyLabel;
  }

  // Do not continuously force the height. This keeps manual resizing stable.
  if (!Array.isArray(node.size) || node.size[1] < requiredHeight(node)) {
    node.setSize([Math.max(MIN_W, node.size?.[0] || MIN_W), requiredHeight(node)]);
  }

  node.setDirtyCanvas?.(true, true);
}

function drawTitleButtons(node, ctx, titleHeight = 30) {
  const plusX = Math.max(42, node.size[0] - 18);
  const minusX = Math.max(28, node.size[0] - 36);
  const y = 5 - titleHeight + 10;
  const r = 7.5;
  const canRemove = (node.inputs?.length || 2) > 2;

  node._dsAnyPlusHit = { x: plusX, y, r: 11 };
  node._dsAnyMinusHit = { x: minusX, y, r: 11 };

  ctx.save();

  // Minus / remove button. It remains visible at 2 inputs but becomes
  // intentionally disabled so the node can never have fewer than two.
  ctx.beginPath();
  ctx.arc(minusX, y, r, 0, Math.PI * 2);
  ctx.fillStyle = canRemove
    ? (node._dsAnyMinusHover ? "rgba(232, 92, 92, 0.30)" : "rgba(232, 92, 92, 0.14)")
    : "rgba(130, 130, 130, 0.08)";
  ctx.fill();
  ctx.strokeStyle = canRemove
    ? (node._dsAnyMinusHover ? "rgba(255, 125, 125, 1)" : "rgba(245, 105, 105, 0.90)")
    : "rgba(150, 150, 150, 0.28)";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.strokeStyle = canRemove ? "rgba(255, 145, 145, 1)" : "rgba(160, 160, 160, 0.38)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(minusX - 3.1, y);
  ctx.lineTo(minusX + 3.1, y);
  ctx.stroke();

  // Plus / add button.
  ctx.beginPath();
  ctx.arc(plusX, y, r, 0, Math.PI * 2);
  ctx.fillStyle = node._dsAnyPlusHover
    ? "rgba(83, 205, 126, 0.32)"
    : "rgba(83, 205, 126, 0.16)";
  ctx.fill();
  ctx.strokeStyle = node._dsAnyPlusHover
    ? "rgba(125, 239, 158, 1)"
    : "rgba(105, 226, 143, 0.95)";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.strokeStyle = "rgba(130, 244, 161, 1)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(plusX - 3.1, y);
  ctx.lineTo(plusX + 3.1, y);
  ctx.moveTo(plusX, y - 3.1);
  ctx.lineTo(plusX, y + 3.1);
  ctx.stroke();

  ctx.restore();
}

app.registerExtension({
  name: EXTENSION,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    // Intentionally do NOT set title_mode / NO_TITLE. The native ComfyUI
    // title bar and node base remain visible and functional.
    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated?.apply(this, arguments);
      this.resizable = true;
      this._dsAnyType = "*";
      this._dsAnyInputCount = 2;
      this._dsAnyPlusHit = { x: 0, y: 0, r: 12 };

      ensureTwoInputs(this);
      if (this.outputs?.[0]) {
        this.outputs[0].type = "*";
        this.outputs[0].label = "*";
      }

      if (!Array.isArray(this.size) || this.size[0] < MIN_W || this.size[1] < MIN_H) {
        this.setSize([Math.max(MIN_W, this.size?.[0] || MIN_W), Math.max(MIN_H, this.size?.[1] || MIN_H)]);
      }

      stabilize(this);
      return result;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = oldConfigure?.apply(this, arguments);
      ensureTwoInputs(this);
      this._dsAnyInputCount = this.inputs.length;
      stabilize(this);
      return result;
    };

    const oldConnections = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const result = oldConnections?.apply(this, arguments);
      // ComfyUI can update link records just after the callback, so defer the
      // type pass by one frame rather than reading stale graph links.
      clearTimeout(this._dsAnyStabilizeTimer);
      this._dsAnyStabilizeTimer = setTimeout(() => stabilize(this), 0);
      return result;
    };

    // Use the native title-bar hook rather than onDrawForeground.
    // ComfyUI/LiteGraph calls onDrawTitleBar in the title coordinate system,
    // so the + stays in the header and can never sit on the output link.
    const oldDrawTitleBar = nodeType.prototype.onDrawTitleBar;
    nodeType.prototype.onDrawTitleBar = function (ctx, titleHeight, size, scale, fgColor) {
      oldDrawTitleBar?.apply(this, arguments);
      drawTitleButtons(this, ctx, Number(titleHeight) || TITLE_H);
    };

    const oldMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function (e, pos) {
      const px = Number(pos?.[0] || 0);
      const py = Number(pos?.[1] || 0);
      const plusHit = this._dsAnyPlusHit;
      const minusHit = this._dsAnyMinusHit;

      const pdx = px - (plusHit?.x ?? this.size[0] - 18);
      const pdy = py - (plusHit?.y ?? (5 - (Number(this.constructor?.title_height) || TITLE_H) + 10));
      if (pdx * pdx + pdy * pdy <= (plusHit?.r ?? 11) * (plusHit?.r ?? 11)) {
        addAnyInput(this);
        return true;
      }

      const mdx = px - (minusHit?.x ?? this.size[0] - 36);
      const mdy = py - (minusHit?.y ?? (5 - (Number(this.constructor?.title_height) || TITLE_H) + 10));
      if (mdx * mdx + mdy * mdy <= (minusHit?.r ?? 11) * (minusHit?.r ?? 11)) {
        removeAnyInput(this);
        return true;
      }

      return oldMouseDown?.apply(this, arguments);
    };

    const oldMouseMove = nodeType.prototype.onMouseMove;
    nodeType.prototype.onMouseMove = function (e, pos) {
      const px = Number(pos?.[0] || 0);
      const py = Number(pos?.[1] || 0);
      const plusHit = this._dsAnyPlusHit;
      const minusHit = this._dsAnyMinusHit;
      const pdx = px - (plusHit?.x ?? this.size[0] - 18);
      const pdy = py - (plusHit?.y ?? (5 - (Number(this.constructor?.title_height) || TITLE_H) + 10));
      const mdx = px - (minusHit?.x ?? this.size[0] - 36);
      const mdy = py - (minusHit?.y ?? (5 - (Number(this.constructor?.title_height) || TITLE_H) + 10));
      const plusHover = pdx * pdx + pdy * pdy <= (plusHit?.r ?? 11) * (plusHit?.r ?? 11);
      const minusHover = mdx * mdx + mdy * mdy <= (minusHit?.r ?? 11) * (minusHit?.r ?? 11)
        && (this.inputs?.length || 2) > 2;
      if (plusHover !== this._dsAnyPlusHover || minusHover !== this._dsAnyMinusHover) {
        this._dsAnyPlusHover = plusHover;
        this._dsAnyMinusHover = minusHover;
        this.setDirtyCanvas?.(true, false);
      }
      return oldMouseMove?.apply(this, arguments);
    };
  },
});
