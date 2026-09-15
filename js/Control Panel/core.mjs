/**
 * DS Control Panel — core state & type-resolution logic.
 */

export const MAX_CONTROLS = 16;

const REJECTED_TYPES = new Set([
  "MODEL", "LATENT", "IMAGE", "MASK", "CONDITIONING", "VAE", "CLIP",
  "CLIP_VISION", "CONTROL_NET", "STYLE_MODEL", "GLIGEN", "UPSCALE_MODEL",
  "AUDIO", "VIDEO", "SAMPLER", "SIGMAS", "NOISE", "GUIDER", "PHOTOMAKER",
  "WEBCAM", "POINT", "MESH",
]);

let uidCounter = 0;
export function nextId() {
  uidCounter += 1;
  return `ctl_${Date.now().toString(36)}_${uidCounter}`;
}

export function createDefaultControl(index) {
  return {
    id: nextId(),
    name: `Value ${index + 1}`,
    type: "auto",
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    autoName: true,
    options: [],
    allowedOptions: [],
    onLabel: "On",
    offLabel: "Off",
    seedMode: "fixed",
    lastTarget: null,
    text: "",
  };
}

export function isAcceptableInputType(type) {
  const t = String(type || "").toUpperCase();
  if (t === "*") return true;
  if (REJECTED_TYPES.has(t)) return false;
  if (t === "BOOLEAN" || t === "INT" || t === "FLOAT" || t === "STRING") return true;
  return true;
}

export function hasComboOptions(input) {
  if (Array.isArray(input?.type)) return true;
  if (Array.isArray(input?.widget?.type)) return true;
  if (input?.type === "COMBO" || input?.widget?.type === "COMBO") return true;
  return false;
}

function getComboOptions(input, targetNode, inputName) {
  if (Array.isArray(input?.type)) return input.type.slice();
  if (Array.isArray(input?.widget?.type)) return input.widget.type.slice();
  const cfg = input?.widget?.options || input?.options;
  if (Array.isArray(cfg?.values)) return cfg.values.slice();
  if (targetNode && inputName) {
    const w = (targetNode.widgets || []).find((x) => x?.name === inputName);
    if (Array.isArray(w?.type)) return w.type.slice();
    const wcfg = w?.options;
    if (Array.isArray(wcfg?.values)) return wcfg.values.slice();
  }
  return [];
}

function widgetConfig(input) {
  return input?.widget?.options || input?.options || {};
}

export function resolveControlTypeFromInput(input, inputName) {
  const rawType = Array.isArray(input?.type) ? "COMBO" : String(input?.type || "").toUpperCase();
  const nameLower = String(inputName || "").toLowerCase();

  if (rawType === "BOOLEAN") return "toggle";
  if (hasComboOptions(input)) return "combo";
  if (rawType === "INT" && /seed|noise_seed/i.test(nameLower)) return "seed";
  if (/^steps$|step_count/i.test(nameLower)) return "int";
  if (rawType === "INT") return "int";
  if (/denoise|^cfg$|^cfg_scale$|guidance/i.test(nameLower)) return "float";
  if (rawType === "FLOAT") return "float";
  if (rawType === "STRING") return "text";
  return "text";
}

export function prettifyName(name) {
  return String(name || "value")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function usefulRange(min, max, value, step) {
  min = Number.isFinite(min) ? min : 0;
  max = Number.isFinite(max) ? max : 100;
  value = Number.isFinite(value) ? value : min;
  const span = max - min;
  const MAX_COMFORTABLE_SPAN = 200;

  if (!Number.isFinite(span) || span <= MAX_COMFORTABLE_SPAN || span <= 0) {
    return { min, max };
  }

  const magnitude = Math.max(Math.abs(value), Math.abs(step) * 10, 10);
  let windowMax = magnitude * 4;
  windowMax = Math.min(max, Math.max(windowMax, min + MAX_COMFORTABLE_SPAN));
  return { min, max: windowMax };
}

export function adoptTargetConfig(control, input, inputName, currentWidgetValue, targetNode) {
  const cfg = widgetConfig(input);
  const type = control.type;
  const nameLower = String(inputName || "").toLowerCase();

  if (control.autoName) control.name = prettifyName(inputName);

  if (type === "toggle") {
    control.value = currentWidgetValue != null ? !!currentWidgetValue : !!cfg.default;
    return;
  }

  if (type === "combo") {
    control.options = getComboOptions(input, targetNode, inputName);
    control.allowedOptions = [];
    control.value = currentWidgetValue ?? control.options[0] ?? "";
    return;
  }

  if (type === "text") {
    control.value = currentWidgetValue != null ? String(currentWidgetValue) : (cfg.default ?? "");
    return;
  }

  // 1. Denoise recognition (0.0 to 1.0)
  if (/denoise/i.test(nameLower)) {
    control.type = "float";
    control.min = 0.0;
    control.max = 1.0;
    control.step = 0.01;
    const v = Number(currentWidgetValue);
    control.value = Number.isFinite(v) ? Math.min(1.0, Math.max(0.0, v)) : 1.0;
    control.default = control.value;
    return;
  }

  // 2. CFG / Guidance recognition (1.0 to 4.0)
  if (/^cfg$|^cfg_scale$|guidance/i.test(nameLower)) {
    control.type = "float";
    control.min = 1.0;
    control.max = 4.0;
    control.step = 0.1;
    const v = Number(currentWidgetValue);
    const def = Number.isFinite(cfg.default) ? cfg.default : 3.5;
    control.value = Number.isFinite(v) ? Math.min(4.0, Math.max(1.0, v)) : Math.min(4.0, Math.max(1.0, def));
    control.default = control.value;
    return;
  }

  // 3. Steps recognition (1 to 50)
  if (/^steps$|step_count/i.test(nameLower)) {
    control.type = "int";
    control.min = 1;
    control.max = 50;
    control.step = 1;
    const v = Number(currentWidgetValue);
    const def = Number.isFinite(cfg.default) ? Math.round(cfg.default) : 20;
    control.value = Number.isFinite(v) ? Math.min(50, Math.max(1, Math.round(v))) : Math.min(50, Math.max(1, def));
    control.default = control.value;
    return;
  }

  // Fallback for general numeric controls
  const min = Number.isFinite(cfg.min) ? cfg.min : (type === "seed" ? 0 : 0);
  const max = Number.isFinite(cfg.max) ? cfg.max : (type === "seed" ? 0xffffffffffff : 100);
  const step = Number.isFinite(cfg.step) ? cfg.step : (type === "float" ? 0.1 : 1);
  const value = Number.isFinite(currentWidgetValue) ? currentWidgetValue : (Number.isFinite(cfg.default) ? cfg.default : min);

  control.default = Number.isFinite(cfg.default) ? cfg.default : value;

  const useful = type === "seed" ? { min, max } : usefulRange(min, max, value, step);
  control.min = useful.min;
  control.max = useful.max;
  control.fullMin = min;
  control.fullMax = max;
  control.step = step;
  control.value = Math.min(Math.max(value, control.min), control.max);
}

export const CONTROL_TYPES = ["auto", "int", "float", "toggle", "combo", "seed", "text"];
export const TYPE_LABELS = {
  auto: "Auto",
  int: "Integer",
  float: "Float",
  toggle: "Toggle",
  combo: "Dropdown",
  seed: "Seed",
  text: "Text",
};

export function isTypeLocked(control) {
  return !!control?.lastTarget;
}

export function applyManualType(control, type) {
  if (!control || !CONTROL_TYPES.includes(type)) return;
  control.type = type;
  control.lastTarget = null;

  if (type === "toggle") {
    if (typeof control.value !== "boolean") control.value = !!control.value;
  } else if (type === "combo") {
    if (!Array.isArray(control.options)) control.options = [];
    if (!Array.isArray(control.allowedOptions)) control.allowedOptions = [];
    if (!control.options.includes(control.value)) control.value = control.options[0] ?? "";
  } else if (type === "text") {
    control.value = control.value != null ? String(control.value) : "";
  } else if (type === "seed") {
    control.min = 0;
    control.max = 0xffffffffffff;
    control.step = 1;
    control.value = Number.isFinite(Number(control.value)) ? Math.trunc(Number(control.value)) : 0;
    control.seedMode = control.seedMode === "random" ? "random" : "fixed";
  } else if (type === "int" || type === "float") {
    if (!Number.isFinite(control.min)) control.min = 0;
    if (!Number.isFinite(control.max)) control.max = type === "int" ? 100 : 1;
    if (!Number.isFinite(control.step)) control.step = type === "int" ? 1 : 0.01;
    const v = Number.isFinite(Number(control.value)) ? Number(control.value) : control.min;
    control.value = Math.min(Math.max(v, control.min), control.max);
  }
}

export function outputTypeForControl(control) {
  switch (control.type) {
    case "int": return "INT";
    case "seed": return "INT";
    case "float": return "FLOAT";
    case "toggle": return "BOOLEAN";
    case "text": return "STRING";
    case "combo": return "*";
    default: return "*";
  }
}

export function serializeControls(controls) {
  return controls.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    value: c.value,
    min: c.min,
    max: c.max,
    step: c.step,
    default: c.default,
    fullMin: c.fullMin,
    fullMax: c.fullMax,
    autoName: c.autoName,
    options: c.options,
    allowedOptions: c.allowedOptions,
    onLabel: c.onLabel,
    offLabel: c.offLabel,
    seedMode: c.seedMode,
    lastTarget: c.lastTarget,
  }));
}

export function cloneControl(saved) {
  const base = createDefaultControl(0);
  const source = (saved && typeof saved === "object" && !Array.isArray(saved)) ? saved : {};
  const out = { ...base, ...source };
  if (!out.id) out.id = base.id;
  if (!Array.isArray(out.options)) out.options = [];
  if (!Array.isArray(out.allowedOptions)) out.allowedOptions = [];
  if (typeof out.name !== "string") out.name = base.name;
  if (!out.type) out.type = "auto";
  return out;
}