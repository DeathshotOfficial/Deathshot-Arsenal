import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { Card, protectDSResizeCorners } from "../UIElements/index.js";
import { DSIcon } from "../Icons/index.js";

const TYPE = "DS_Seed";
const EXT = "DeathshotArsenal.DS_Seed";
const CSS = "/extensions/DeathshotArsenal/Seed/ds_seed.css";
const STATE_KEY = "ds_seed_state";
const STATE_VERSION = 4;
const MAX_SAFE_SEED = Number.MAX_SAFE_INTEGER;
const MIN_W = 260;
const MIN_H = 154;
const DEFAULT_W = 280;
const DEFAULT_H = 154;
const FIXED_H = 130;
const DOM_BODY_H = 88;
const MODES = new Set(["random", "fixed", "increment", "decrement"]);
const SEED_NAMES = new Set(["seed", "noise_seed", "random_seed", "variation_seed"]);

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

function clampSeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SAFE_SEED, Math.trunc(n)));
}

function parseSeed(raw, fallback = 0) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return clampSeed(fallback);
  try {
    const value = BigInt(text);
    const max = BigInt(MAX_SAFE_SEED);
    return Number(value > max ? max : value);
  } catch {
    return clampSeed(fallback);
  }
}

function randomSeed() {
  try {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    const wide = (BigInt(values[0]) << 32n) | BigInt(values[1]);
    return Number(wide % (BigInt(MAX_SAFE_SEED) + 1n));
  } catch {
    return Math.floor(Math.random() * (MAX_SAFE_SEED + 1));
  }
}

function ensureState(node) {
  node.properties ||= {};
  const saved = node.properties[STATE_KEY];
  const defaults = {
    version: STATE_VERSION,
    seed_value: 0,
    mode: "fixed",
    last_executed_seed: null,
    last_touched: 0,
  };
  const state = saved && typeof saved === "object" ? { ...defaults, ...saved } : defaults;
  state.version = STATE_VERSION;
  state.seed_value = parseSeed(state.seed_value, 0);
  state.last_executed_seed = state.last_executed_seed == null
    ? null
    : parseSeed(state.last_executed_seed, 0);
  state.mode = MODES.has(state.mode) ? state.mode : "fixed";
  state.last_touched = Number(state.last_touched) || 0;
  node.properties[STATE_KEY] = state;
  return state;
}

function touch(node) {
  const state = ensureState(node);
  state.last_touched = Date.now();
  node._dsSeedLastTouched = state.last_touched;
  node.setDirtyCanvas?.(true, true);
}

function getHiddenSeedWidget(node) {
  return node.widgets?.find?.((w) => w?.name === "seed") || null;
}

function ensureHiddenWidgets(node) {
  let seedWidget = getHiddenSeedWidget(node);
  if (!seedWidget && typeof node.addWidget === "function") {
    seedWidget = node.addWidget("number", "seed", 0, () => { }, {
      min: 0,
      max: MAX_SAFE_SEED,
      step: 1,
      precision: 0,
      serialize: true,
    });
  }
  if (seedWidget) {
    seedWidget.hidden = true;
    seedWidget.options ||= {};
    seedWidget.options.hidden = true;
    seedWidget.options.min = 0;
    seedWidget.options.max = MAX_SAFE_SEED;
    seedWidget.options.step = 1;
    seedWidget.computeSize = () => [0, -4];
    seedWidget.draw = () => { };
    seedWidget.serialize = true;
    seedWidget.value = ensureState(node).seed_value;
    if (seedWidget.element?.style) {
      seedWidget.element.style.display = "none";
      seedWidget.element.style.visibility = "hidden";
      seedWidget.element.style.width = "0";
      seedWidget.element.style.height = "0";
      seedWidget.element.style.margin = "0";
      seedWidget.element.style.padding = "0";
    }
  }

  let stateWidget = node.widgets?.find?.((w) => w?.name === "ds_seed_state") || null;
  if (!stateWidget && typeof node.addWidget === "function") {
    stateWidget = node.addWidget("text", "ds_seed_state", "", () => { }, {
      serialize: true,
    });
  }
  if (stateWidget) {
    stateWidget.hidden = true;
    stateWidget.computeSize = () => [0, -4];
    stateWidget.draw = () => { };
    stateWidget.serialize = true;
    stateWidget.value = JSON.stringify(ensureState(node));
    if (stateWidget.element?.style) {
      stateWidget.element.style.display = "none";
      stateWidget.element.style.visibility = "hidden";
      stateWidget.element.style.width = "0";
      stateWidget.element.style.height = "0";
      stateWidget.element.style.margin = "0";
      stateWidget.element.style.padding = "0";
    }
  }

  node._dsSeedWidget = seedWidget;
  node._dsSeedStateWidget = stateWidget;
}

function setSeed(node, value, syncCanvas = false) {
  const normalized = clampSeed(value);
  const state = ensureState(node);
  state.seed_value = normalized;
  ensureHiddenWidgets(node);
  if (node._dsSeedWidget) node._dsSeedWidget.value = normalized;
  if (node._dsSeedInput) node._dsSeedInput.value = String(normalized);
  persistState(node);
  syncUI(node);
  if (syncCanvas) {
    broadcastToCanvas(node, normalized);
  }
  return normalized;
}

function persistState(node) {
  const state = ensureState(node);
  if (document.activeElement === node._dsSeedInput && node._dsSeedInput?.value != null) {
    state.seed_value = parseSeed(node._dsSeedInput.value, state.seed_value);
  }
  const normalizedSeed = clampSeed(state.seed_value);
  state.seed_value = normalizedSeed;
  node.properties[STATE_KEY] = {
    version: STATE_VERSION,
    seed_value: normalizedSeed,
    mode: MODES.has(state.mode) ? state.mode : "fixed",
    last_executed_seed: state.last_executed_seed == null ? null : clampSeed(state.last_executed_seed),
    last_touched: Number(node._dsSeedLastTouched || state.last_touched || 0),
  };
  ensureHiddenWidgets(node);
  if (node._dsSeedWidget) node._dsSeedWidget.value = normalizedSeed;
  if (node._dsSeedStateWidget) node._dsSeedStateWidget.value = JSON.stringify(node.properties[STATE_KEY]);
}

function setMode(node, mode) {
  if (!MODES.has(mode)) return;
  const state = ensureState(node);
  if (mode === "random" || mode === "fixed") {
    state._lastRF = mode;
  }
  state.mode = mode;
  touch(node);
  persistState(node);
  syncUI(node);
}

function commitSeedInput(node) {
  const state = ensureState(node);
  const input = node._dsSeedInput;
  const next = parseSeed(input?.value, state.seed_value);
  if (next !== state.seed_value) {
    if (state.mode === "random") {
      setMode(node, "fixed");
    }
    setSeed(node, next, true);
  } else if (input) {
    input.value = String(state.seed_value);
  }
  touch(node);
}

function modeLabel(mode) {
  if (mode === "random") return "R";
  if (mode === "fixed") return "F";
  return mode === "increment" ? "⇧" : "⇩";
}

function modeTitle(mode) {
  switch (mode) {
    case "random": return "Random — generate a new seed on every queue (click to switch to Fixed)";
    case "fixed": return "Fixed — keep the same seed after generate (click to switch to Random)";
    case "increment": return "Increment — add 1 after every generate (click to switch to Fixed)";
    case "decrement": return "Decrement — subtract 1 after every generate (click to switch to Fixed)";
    default: return "";
  }
}

function makeButton(className, labelOrIcon, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `ds-ui-btn ${className}`;
  if (labelOrIcon instanceof SVGElement || labelOrIcon instanceof HTMLElement) {
    b.appendChild(labelOrIcon);
  } else {
    b.textContent = String(labelOrIcon);
  }
  b.setAttribute("aria-label", title);
  b.title = title;
  return b;
}

function buildUI(node) {
  const card = Card({ className: "ds-seed-card" });

  const field = document.createElement("div");
  field.className = "ds-seed-input-wrap";

  const input = document.createElement("input");
  input.className = "ds-seed-input";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Seed value");
  input.title = "Click to edit seed value or use scroll wheel to adjust.";
  node._dsSeedInput = input;

  // Up/down spinner buttons stacked on the right side of the field
  const spinners = document.createElement("div");
  spinners.className = "ds-seed-spinners";

  const spinUp = document.createElement("button");
  spinUp.type = "button";
  spinUp.className = "ds-seed-spin-btn";
  spinUp.title = "Increment seed";
  spinUp.appendChild(DSIcon("chevron-up", { size: 10 }));

  const spinDn = document.createElement("button");
  spinDn.type = "button";
  spinDn.className = "ds-seed-spin-btn";
  spinDn.title = "Decrement seed";
  spinDn.appendChild(DSIcon("chevron-down", { size: 10 }));

  spinners.append(spinUp, spinDn);
  field.append(input, spinners);

  const actions = document.createElement("div");
  actions.className = "ds-seed-actions";
  const rf = makeButton("ds-seed-mode-btn", "F", modeTitle("fixed"));
  const inc = makeButton("ds-seed-mode-btn", DSIcon("plus", { size: 12 }), modeTitle("increment"));
  const dec = makeButton("ds-seed-mode-btn", DSIcon("minus", { size: 12 }), modeTitle("decrement"));
  const reuse = makeButton("ds-seed-reuse-btn", DSIcon("refresh-cw", { size: 12 }), "Reuse last generated seed");
  actions.append(rf, inc, dec, reuse);

  node._dsSeedButtons = { rf, inc, dec, reuse };

  const stopCanvas = (event) => event.stopPropagation();
  for (const element of [input, spinUp, spinDn, rf, inc, dec, reuse]) {
    element.addEventListener("pointerdown", stopCanvas);
    element.addEventListener("mousedown", stopCanvas);
  }

  const stepSeed = (delta) => {
    const state = ensureState(node);
    if (state.mode === "random") setMode(node, "fixed");
    setSeed(node, state.seed_value + delta, true);
    touch(node);
  };

  // Hold-to-repeat on spinner buttons
  let _spinTimer = null;
  let _spinInterval = null;
  const startSpin = (delta) => {
    stepSeed(delta);
    _spinTimer = setTimeout(() => {
      _spinInterval = setInterval(() => stepSeed(delta), 80);
    }, 350);
  };
  const stopSpin = () => {
    clearTimeout(_spinTimer);
    clearInterval(_spinInterval);
    _spinTimer = null;
    _spinInterval = null;
  };

  spinUp.addEventListener("pointerdown", (e) => { e.stopPropagation(); startSpin(1); });
  spinUp.addEventListener("pointerup", stopSpin);
  spinUp.addEventListener("pointerleave", stopSpin);
  spinDn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startSpin(-1); });
  spinDn.addEventListener("pointerup", stopSpin);
  spinDn.addEventListener("pointerleave", stopSpin);

  input.addEventListener("input", () => {
    if (!/^\d*$/.test(input.value.trim())) {
      input.value = String(ensureState(node).seed_value);
    }
  });
  input.addEventListener("change", () => commitSeedInput(node));
  input.addEventListener("blur", () => commitSeedInput(node));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); commitSeedInput(node); input.blur(); }
  });
  input.addEventListener("wheel", (event) => {
    event.preventDefault();
    stepSeed(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  rf.addEventListener("click", () => {
    const state = ensureState(node);
    const next = state.mode === "random" ? "fixed" : "random";
    setMode(node, next);
    if (next === "fixed") broadcastToCanvas(node, state.seed_value);
  });
  inc.addEventListener("click", () => {
    const state = ensureState(node);
    const nextMode = state.mode === "increment" ? "fixed" : "increment";
    setMode(node, nextMode);
    if (nextMode === "increment" || nextMode === "fixed") broadcastToCanvas(node, state.seed_value);
  });
  dec.addEventListener("click", () => {
    const state = ensureState(node);
    const nextMode = state.mode === "decrement" ? "fixed" : "decrement";
    setMode(node, nextMode);
    if (nextMode === "decrement" || nextMode === "fixed") broadcastToCanvas(node, state.seed_value);
  });
  reuse.addEventListener("click", () => {
    const state = ensureState(node);
    if (state.last_executed_seed == null) return;
    setMode(node, "fixed");
    setSeed(node, state.last_executed_seed, true);
    touch(node);
  });

  card.body.append(field, actions);
  return card.root;
}

function syncUI(node) {
  const state = ensureState(node);
  if (node._dsSeedInput && document.activeElement !== node._dsSeedInput) {
    node._dsSeedInput.value = String(state.seed_value);
  }

  const b = node._dsSeedButtons;
  if (!b) return;

  const isRandom = state.mode === "random";
  const isFixed = state.mode === "fixed";
  const isInc = state.mode === "increment";
  const isDec = state.mode === "decrement";

  b.rf.textContent = isRandom ? "R" : "F";
  b.rf.dataset.active = (isRandom || isFixed) ? "true" : "false";
  b.rf.classList.toggle("is-active", isRandom || isFixed);
  b.rf.classList.toggle("ds-ui-btn-primary", isRandom || isFixed);
  b.rf.classList.toggle("ds-ui-btn-secondary", !(isRandom || isFixed));
  b.rf.setAttribute("aria-pressed", isRandom ? "true" : "false");
  b.rf.title = modeTitle(isRandom ? "random" : "fixed");

  b.inc.dataset.active = isInc ? "true" : "false";
  b.inc.classList.toggle("is-active", isInc);
  b.inc.classList.toggle("ds-ui-btn-primary", isInc);
  b.inc.classList.toggle("ds-ui-btn-secondary", !isInc);
  b.inc.setAttribute("aria-pressed", isInc ? "true" : "false");
  b.inc.title = modeTitle("increment");

  b.dec.dataset.active = isDec ? "true" : "false";
  b.dec.classList.toggle("is-active", isDec);
  b.dec.classList.toggle("ds-ui-btn-primary", isDec);
  b.dec.classList.toggle("ds-ui-btn-secondary", !isDec);
  b.dec.setAttribute("aria-pressed", isDec ? "true" : "false");
  b.dec.title = modeTitle("decrement");

  b.reuse.classList.toggle("ds-ui-btn-secondary", true);

  const hasLastSeed = state.last_executed_seed != null;
  b.reuse.title = hasLastSeed
    ? `Reuse last seed: ${state.last_executed_seed}`
    : "Reuse last generated seed";
  b.reuse.style.opacity = hasLastSeed ? "1" : "0.5";
  b.reuse.style.cursor = hasLastSeed ? "pointer" : "default";
}

function installNode(node) {
  if (!node) return;
  node._dsSeedFixedH = FIXED_H;
  if (node.size) {
    node.size[1] = FIXED_H;
  }
  if (node._dsSeedInstalled) return;
  node._dsSeedInstalled = true;
  node.resizable = true;

  const initialW = Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W);
  node.size = [initialW, FIXED_H];

  ensureState(node);
  ensureHiddenWidgets(node);
  protectDSResizeCorners(node);

  const card = buildUI(node);
  node._dsSeedRoot = card;

  node.computeSize = function () {
    return [MIN_W, FIXED_H];
  };

  const origOnResize = node.onResize;
  node.onResize = function (size) {
    if (size) {
      size[0] = Math.max(MIN_W, Number(size[0]) || DEFAULT_W);
      size[1] = FIXED_H;
    }
    const res = origOnResize?.apply(this, arguments);
    if (this.size) {
      this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
      this.size[1] = FIXED_H;
    }
    this.setDirtyCanvas?.(true, true);
    return res;
  };

  const origSetSize = node.setSize;
  node.setSize = function (size) {
    const w = Math.max(MIN_W, Number(size?.[0]) || DEFAULT_W);
    this.size = [w, FIXED_H];
    const res = origSetSize?.apply(this, [this.size]);
    if (this.size) {
      this.size[0] = w;
      this.size[1] = FIXED_H;
    }
    this.setDirtyCanvas?.(true, true);
    return res;
  };

  const origDrawWidgets = node.drawWidgets;
  node.drawWidgets = function (ctx) {
    const res = origDrawWidgets?.apply(this, arguments);
    if (this.size && this.size[1] !== FIXED_H) {
      this.size[1] = FIXED_H;
      this.setDirtyCanvas?.(true, true);
    }
    return res;
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    const res = origDrawFg?.apply(this, arguments);
    if (this.size && this.size[1] !== FIXED_H) {
      this.size[1] = FIXED_H;
      this.setDirtyCanvas?.(true, true);
    }
    return res;
  };

  const origDrawBg = node.onDrawBackground;
  node.onDrawBackground = function (ctx) {
    if (this.size && this.size[1] !== FIXED_H) {
      this.size[1] = FIXED_H;
    }
    return origDrawBg?.apply(this, arguments);
  };

  node._dsSeedDomWidget = node.addDOMWidget("ds_seed_ui", "custom", card, {
    serialize: false,
    hideOnZoom: false,
    margin: 5,
    getMinHeight: () => DOM_BODY_H,
    getHeight: () => DOM_BODY_H,
  });

  node._dsSeedDomWidget.computeSize = () => [
    MIN_W,
    0,
  ];

  requestAnimationFrame(() => {
    ensureHiddenWidgets(node);
    if (node._dsSeedWidget?.element) {
      node._dsSeedWidget.element.style.cssText =
        "display:none!important;visibility:hidden!important;" +
        "position:absolute!important;width:0!important;height:0!important;" +
        "overflow:hidden!important;pointer-events:none!important;";
    }

    const host = card.parentElement;
    if (host) {
      host.style.setProperty("pointer-events", "none", "important");
      host.style.setProperty("background", "transparent", "important");
      host.style.setProperty("background-color", "transparent", "important");
      if (host.parentElement && host.parentElement !== document.body) {
        host.parentElement.style.setProperty("background", "transparent", "important");
        host.parentElement.style.setProperty("background-color", "transparent", "important");
      }
    }

    node._dsSeedFixedH = FIXED_H;
    const currentW = Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W);
    node.size = [currentW, FIXED_H];
    node.setDirtyCanvas?.(true, true);
  });

  try { node._dsSeedThemeUnsub = window.DSGlobalTheme?.bindNode?.(card, node); } catch {}
  try { window.DSUI?.protectResizeCorners?.(node); } catch {}
  try { window.DSGlobalTheme?.applyNodeBase?.(node); } catch {}

  syncUI(node);
}

function getGraphRoot() {
  return app.graph?.rootGraph || app.graph || null;
}

function allNodes(graph) {
  const result = [];
  const seen = new Set();
  const visit = (g) => {
    if (!g || seen.has(g)) return;
    seen.add(g);
    for (const node of g._nodes || g.nodes || []) {
      if (!node) continue;
      result.push(node);
      const child = node.subgraph || node.graph || node._graph;
      if (child && child !== g) visit(child);
    }
  };
  visit(graph);
  return result;
}

function dsSeedNodes() {
  return allNodes(getGraphRoot()).filter((node) => node?.type === TYPE || node?.comfyClass === TYPE);
}

function standalone(node) {
  if (!node?.outputs?.length) return true;
  return !node.outputs.some((output) => {
    if (!output?.links || !output.links.length) return false;
    const graphLinks = app.graph?.links;
    return output.links.some((linkId) => linkId != null && (!graphLinks || graphLinks[linkId] != null));
  });
}

function masterSeedNode(nodes) {
  const candidates = nodes.filter(standalone);
  if (!candidates.length) return null;
  return candidates.reduce((best, node) => {
    const a = Number(node._dsSeedLastTouched || ensureState(node).last_touched || 0);
    const b = Number(best._dsSeedLastTouched || ensureState(best).last_touched || 0);
    return a >= b ? node : best;
  }, null);
}

function explicitlyLinked(node, inputName) {
  const graphLinks = app.graph?.links;
  return (
    node?.inputs?.some?.(
      (input) =>
        input?.name === inputName &&
        input.link != null &&
        (!graphLinks || graphLinks[input.link] != null)
    ) || false
  );
}

const NON_SEED_NAMES = new Set([
  "control_after_generate",
  "seed_mode",
  "seed_action",
  "seed_behavior",
  "seed_type",
]);

function isSeedName(name) {
  if (!name || typeof name !== "string") return false;
  const lower = name.trim().toLowerCase();
  if (NON_SEED_NAMES.has(lower)) return false;
  return (
    lower === "seed" ||
    lower.endsWith("_seed") ||
    lower.startsWith("seed_") ||
    lower.endsWith("seed") ||
    lower.startsWith("seed") ||
    lower.includes("seed")
  );
}

function isSeedWidget(widget) {
  if (!widget) return false;
  if (widget.type === "converted-widget" || widget.type === "combo") return false;
  const val = widget.value;
  if (typeof val === "number") return true;
  if (typeof val === "string" && /^\d+$/.test(val.trim())) return true;
  if (val == null) return true;
  return false;
}

function isSeedConsumer(node, promptEntry, name) {
  if (!isSeedName(name)) return false;
  if (node?.type === TYPE || node?.comfyClass === TYPE) return false;

  const val = promptEntry?.inputs?.[name];
  if (Array.isArray(val)) return false;
  if (explicitlyLinked(node, name)) return false;

  const widget = node?.widgets?.find?.((w) => w?.name === name);
  if (promptEntry && promptEntry.inputs?.[name] === undefined && !widget) {
    return false;
  }

  if (widget && !isSeedWidget(widget)) {
    return false;
  }

  return true;
}

function disableWidgetRandomizer(node, targetWidget) {
  if (!node?.widgets) return;
  if (Array.isArray(targetWidget?.linkedWidgets)) {
    for (const linked of targetWidget.linkedWidgets) {
      if (linked && (linked.name === "control_after_generate" || linked.type === "combo")) {
        linked.value = "fixed";
      }
    }
  }
  for (const w of node.widgets) {
    if (!w) continue;
    if (
      w.name === "control_after_generate" ||
      w.name === `${targetWidget?.name}_control_after_generate`
    ) {
      w.value = "fixed";
    }
  }
}

function syncWorkflowNodeWidget(workflow, nodeId, graphNode, widgetName, seed) {
  const wfNode = workflow?.nodes?.find?.((n) => String(n?.id) === String(nodeId));
  if (!wfNode || !Array.isArray(wfNode.widgets_values) || !graphNode?.widgets) return;
  const widget = graphNode.widgets.find((w) => w?.name === widgetName);
  if (!widget) return;
  const idx = graphNode.widgets.indexOf(widget);
  if (idx >= 0 && idx < wfNode.widgets_values.length) {
    wfNode.widgets_values[idx] = seed;
  }
}

function broadcast(output, graphNodes, source, seed, workflow) {
  let changed = false;
  const processedNodeIds = new Set();

  for (const id in output) {
    const entry = output[id];
    if (!entry?.inputs) continue;
    if (String(id) === String(source?.id)) continue;

    const graphNode = graphNodes.find((n) => String(n?.id) === String(id));
    if (graphNode?.type === TYPE || graphNode?.comfyClass === TYPE) continue;
    processedNodeIds.add(String(id));

    for (const key of Object.keys(entry.inputs)) {
      if (isSeedConsumer(graphNode, entry, key)) {
        entry.inputs[key] = seed;
        changed = true;

        if (graphNode?.widgets) {
          const widget = graphNode.widgets.find((w) => w?.name === key);
          if (widget && isSeedWidget(widget)) {
            widget.value = seed;
            if (typeof widget.callback === "function") {
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) { }
            }
            disableWidgetRandomizer(graphNode, widget);
          }
          graphNode.setDirtyCanvas?.(true, true);
        }

        if (workflow?.nodes) {
          syncWorkflowNodeWidget(workflow, id, graphNode, key, seed);
        }
      }
    }

    if (graphNode?.widgets) {
      for (const widget of graphNode.widgets) {
        const name = widget?.name;
        if (!name || entry.inputs[name] !== undefined) continue;
        if (isSeedConsumer(graphNode, entry, name)) {
          entry.inputs[name] = seed;
          changed = true;
          if (isSeedWidget(widget)) {
            widget.value = seed;
            if (typeof widget.callback === "function") {
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) { }
            }
            disableWidgetRandomizer(graphNode, widget);
          }
          graphNode.setDirtyCanvas?.(true, true);
          if (workflow?.nodes) {
            syncWorkflowNodeWidget(workflow, id, graphNode, name, seed);
          }
        }
      }
    }
  }

  for (const graphNode of graphNodes) {
    const id = String(graphNode?.id);
    if (processedNodeIds.has(id)) continue;
    if (id === String(source?.id)) continue;
    if (graphNode?.type === TYPE || graphNode?.comfyClass === TYPE) continue;

    if (graphNode?.widgets) {
      for (const widget of graphNode.widgets) {
        const name = widget?.name;
        if (!name) continue;
        if (isSeedConsumer(graphNode, null, name)) {
          if (isSeedWidget(widget)) {
            widget.value = seed;
            if (typeof widget.callback === "function") {
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) { }
            }
            disableWidgetRandomizer(graphNode, widget);
            graphNode.setDirtyCanvas?.(true, true);
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    app.graph?.setDirtyCanvas?.(true, true);
  }
}

function broadcastToCanvas(source, seed) {
  if (!standalone(source)) return;
  const nodes = dsSeedNodes();
  const master = masterSeedNode(nodes);
  if (master !== source) return;

  const graphNodes = allNodes(getGraphRoot());
  let changed = false;
  for (const graphNode of graphNodes) {
    if (String(graphNode?.id) === String(source?.id)) continue;
    if (graphNode?.type === TYPE || graphNode?.comfyClass === TYPE) continue;

    if (graphNode?.widgets) {
      for (const widget of graphNode.widgets) {
        const name = widget?.name;
        if (!name) continue;
        if (isSeedConsumer(graphNode, null, name)) {
          if (isSeedWidget(widget)) {
            widget.value = seed;
            if (typeof widget.callback === "function") {
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) { }
            }
            disableWidgetRandomizer(graphNode, widget);
            graphNode.setDirtyCanvas?.(true, true);
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    app.graph?.setDirtyCanvas?.(true, true);
  }
}

function nextDisplayedSeed(usedSeed, mode) {
  switch (mode) {
    case "random": return usedSeed;
    case "increment": return clampSeed(usedSeed + 1);
    case "decrement": return clampSeed(usedSeed - 1);
    case "fixed":
    default: return usedSeed;
  }
}

function installPromptHook() {
  if (app._dsSeedGraphToPromptHook) return;
  const original = app.graphToPrompt?.bind(app);
  if (!original) return;
  app._dsSeedGraphToPromptHook = true;

  app.graphToPrompt = async function (...args) {
    const result = await original(...args);
    try {
      const output = result?.output || {};
      const nodes = dsSeedNodes();
      const master = masterSeedNode(nodes);
      const graphNodes = allNodes(getGraphRoot());

      for (const node of nodes) {
        ensureHiddenWidgets(node);
        const entry = output?.[String(node.id)];
        const isStandaloneNode = standalone(node);

        if (!entry?.inputs && !isStandaloneNode) continue;
        if (isStandaloneNode && node !== master) continue;

        const state = ensureState(node);
        let usedSeed = state.seed_value;
        if (state.mode === "random") usedSeed = randomSeed();

        state.last_executed_seed = usedSeed;
        if (entry?.inputs) {
          entry.inputs.seed = usedSeed;
          entry.inputs.ds_seed_state = JSON.stringify({
            ...state,
            seed_value: usedSeed,
            last_executed_seed: usedSeed,
          });
        }

        if (isStandaloneNode && node === master) {
          broadcast(output, graphNodes, node, usedSeed, result?.workflow);
        }

        if (result?.workflow?.nodes) {
          for (const wfNode of result.workflow.nodes) {
            if (String(wfNode?.id) === String(node.id)) {
              if (wfNode.properties?.[STATE_KEY]) {
                wfNode.properties[STATE_KEY] = {
                  ...node.properties[STATE_KEY],
                  seed_value: usedSeed,
                  last_executed_seed: usedSeed,
                };
              }
              if (Array.isArray(wfNode.widgets_values)) {
                const seedIdx = node.widgets?.indexOf(node._dsSeedWidget);
                if (seedIdx != null && seedIdx >= 0) {
                  wfNode.widgets_values[seedIdx] = usedSeed;
                }
              }
            }
          }
        }

        const nextSeed = nextDisplayedSeed(usedSeed, state.mode);
        setSeed(node, nextSeed, false);
        touch(node);
      }
    } catch (error) {
      console.warn("[DeathshotArsenal][DS Seed] prompt preparation failed", error);
    }
    return result;
  };
}

app.registerExtension({
  name: EXT,

  async setup() {
    installPromptHook();
    api?.addEventListener?.("executed", (event) => {
      const nodeId = event?.detail?.node;
      if (!nodeId) return;
      const nodes = dsSeedNodes();
      const node = nodes.find((n) => String(n.id) === String(nodeId));
      if (!node) return;
      const seedOutput = event.detail?.output?.seed?.[0];
      if (seedOutput != null) {
        const executedSeed = parseSeed(seedOutput, 0);
        const state = ensureState(node);
        state.last_executed_seed = executedSeed;
        syncUI(node);
      }
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigured = nodeType.prototype.onConfigure;
    const oldSerialize = nodeType.prototype.serialize;
    const oldOnSerialize = nodeType.prototype.onSerialize;
    const oldResize = nodeType.prototype.onResize;
    const oldSetSize = nodeType.prototype.setSize;
    const oldSelected = nodeType.prototype.onSelected;
    const oldRemoved = nodeType.prototype.onRemoved;

    nodeType.prototype.computeSize = function () {
      return [
        MIN_W,
        FIXED_H,
      ];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated?.apply(this, arguments);
      installNode(this);
      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
        this.size[1] = FIXED_H;
      }
      return result;
    };

    nodeType.prototype.onConfigure = function () {
      const result = oldConfigured?.apply(this, arguments);
      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
        this.size[1] = FIXED_H;
      }
      setTimeout(() => {
        ensureState(this);
        if (this.size) {
          this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
          this.size[1] = FIXED_H;
        }
        installNode(this);
        ensureHiddenWidgets(this);
        syncUI(this);
        this.setDirtyCanvas?.(true, true);
      }, 0);
      return result;
    };

    nodeType.prototype.setSize = function (size) {
      const w = Math.max(MIN_W, Number(size?.[0]) || DEFAULT_W);
      this.size = [w, FIXED_H];
      const res = oldSetSize?.apply(this, [this.size]);
      if (this.size) {
        this.size[0] = w;
        this.size[1] = FIXED_H;
      }
      this.setDirtyCanvas?.(true, true);
      return res;
    };

    nodeType.prototype.onSelected = function () {
      const result = oldSelected?.apply(this, arguments);
      touch(this);
      return result;
    };

    nodeType.prototype.onResize = function (size) {
      if (size) {
        size[0] = Math.max(MIN_W, Number(size[0]) || DEFAULT_W);
        size[1] = FIXED_H;
      }
      const result = oldResize?.apply(this, arguments);
      if (this.size) {
        this.size[0] = Math.max(MIN_W, Number(this.size[0]) || DEFAULT_W);
        this.size[1] = FIXED_H;
      }
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    nodeType.prototype.serialize = function () {
      persistState(this);
      return oldSerialize?.apply(this, arguments);
    };

    nodeType.prototype.onSerialize = function (info) {
      persistState(this);
      if (info) {
        info.properties = info.properties || {};
        info.properties[STATE_KEY] = { ...this.properties[STATE_KEY] };
      }
      return oldOnSerialize?.apply(this, arguments);
    };

    nodeType.prototype.onRemoved = function () {
      try { this._dsSeedThemeUnsub?.(); } catch { }
      try { this._dsSeedDomWidget?.onRemove?.(); } catch { }
      try { this._dsSeedRoot?.remove?.(); } catch { }
      return oldRemoved?.apply(this, arguments);
    };
  },
});
