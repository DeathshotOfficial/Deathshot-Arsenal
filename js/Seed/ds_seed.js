import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_Seed";
const EXT = "DeathshotArsenal.DS_Seed";
const CSS = "/extensions/DeathshotArsenal/Seed/ds_seed.css";
const STATE_KEY = "ds_seed_state";
const STATE_VERSION = 4;
const MAX_SAFE_SEED = Number.MAX_SAFE_INTEGER;
const MIN_W = 250;
const MIN_H = 112;
const DEFAULT_W = 330;
const DEFAULT_H = 112;
const DOM_BODY_H = 81;
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
    seedWidget = node.addWidget("number", "seed", 0, () => {}, {
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
    seedWidget.computeSize = () => [0, 0];
    seedWidget.draw = () => {};
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
    stateWidget = node.addWidget("text", "ds_seed_state", "", () => {}, {
      serialize: true,
    });
  }
  if (stateWidget) {
    stateWidget.hidden = true;
    stateWidget.computeSize = () => [0, 0];
    stateWidget.draw = () => {};
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

function makeButton(className, label, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.setAttribute("aria-label", title);
  b.title = title;
  return b;
}

function buildUI(node) {
  const root = document.createElement("div");
  root.className = "ds-seed-root";
  root.dataset.dsUiShell = "base";

  const field = document.createElement("div");
  field.className = "ds-seed-input-wrap";

  const input = document.createElement("input");
  input.className = "ds-seed-input";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Seed value");
  input.title = "Click to edit seed value. Use stepper arrows or scroll wheel to adjust.";
  node._dsSeedInput = input;

  const stepper = document.createElement("div");
  stepper.className = "ds-seed-stepper";
  const up = makeButton("ds-seed-step", "▲", "Increment seed (+1)");
  const down = makeButton("ds-seed-step", "▼", "Decrement seed (-1)");
  stepper.append(up, down);
  field.append(input, stepper);

  const actions = document.createElement("div");
  actions.className = "ds-seed-actions";
  const rf = makeButton("ds-seed-mode-btn", "F", modeTitle("fixed"));
  const inc = makeButton("ds-seed-mode-btn", "⇧", modeTitle("increment"));
  const dec = makeButton("ds-seed-mode-btn", "⇩", modeTitle("decrement"));
  const reuse = makeButton("ds-seed-reuse-btn", "↺", "Reuse last generated seed");
  actions.append(rf, inc, dec, reuse);

  node._dsSeedButtons = { rf, inc, dec, reuse };

  const stopCanvas = (event) => event.stopPropagation();
  for (const element of [input, up, down, rf, inc, dec, reuse]) {
    element.addEventListener("pointerdown", stopCanvas);
    element.addEventListener("mousedown", stopCanvas);
  }

  const step = (delta) => {
    const state = ensureState(node);
    if (state.mode === "random") {
      setMode(node, "fixed");
    }
    setSeed(node, state.seed_value + delta, true);
    touch(node);
  };

  input.addEventListener("input", () => {
    if (!/^\d*$/.test(input.value.trim())) {
      input.value = String(ensureState(node).seed_value);
    }
  });
  input.addEventListener("change", () => commitSeedInput(node));
  input.addEventListener("blur", () => commitSeedInput(node));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitSeedInput(node);
      input.blur();
    }
  });
  input.addEventListener("wheel", (event) => {
    event.preventDefault();
    step(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  up.addEventListener("click", () => step(1));
  down.addEventListener("click", () => step(-1));

  rf.addEventListener("click", () => {
    const state = ensureState(node);
    const next = state.mode === "random" ? "fixed" : "random";
    setMode(node, next);
    if (next === "fixed") {
      broadcastToCanvas(node, state.seed_value);
    }
  });
  inc.addEventListener("click", () => {
    const state = ensureState(node);
    const nextMode = state.mode === "increment" ? "fixed" : "increment";
    setMode(node, nextMode);
    if (nextMode === "increment" || nextMode === "fixed") {
      broadcastToCanvas(node, state.seed_value);
    }
  });
  dec.addEventListener("click", () => {
    const state = ensureState(node);
    const nextMode = state.mode === "decrement" ? "fixed" : "decrement";
    setMode(node, nextMode);
    if (nextMode === "decrement" || nextMode === "fixed") {
      broadcastToCanvas(node, state.seed_value);
    }
  });
  reuse.addEventListener("click", () => {
    const state = ensureState(node);
    if (state.last_executed_seed == null) return;
    setMode(node, "fixed");
    setSeed(node, state.last_executed_seed, true);
    touch(node);
  });

  root.append(field, actions);
  return root;
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
  b.rf.setAttribute("aria-pressed", isRandom ? "true" : "false");
  b.rf.title = modeTitle(isRandom ? "random" : "fixed");

  b.inc.dataset.active = isInc ? "true" : "false";
  b.inc.classList.toggle("is-active", isInc);
  b.inc.setAttribute("aria-pressed", isInc ? "true" : "false");
  b.inc.title = modeTitle("increment");

  b.dec.dataset.active = isDec ? "true" : "false";
  b.dec.classList.toggle("is-active", isDec);
  b.dec.setAttribute("aria-pressed", isDec ? "true" : "false");
  b.dec.title = modeTitle("decrement");

  const hasLastSeed = state.last_executed_seed != null;
  b.reuse.title = hasLastSeed
    ? `Reuse last seed: ${state.last_executed_seed}`
    : "Reuse last generated seed";
  b.reuse.style.opacity = hasLastSeed ? "1" : "0.5";
  b.reuse.style.cursor = hasLastSeed ? "pointer" : "default";
}

function installNode(node) {
  if (!node || node._dsSeedInstalled) return;
  node._dsSeedInstalled = true;
  node.resizable = true;
  node.size = [
    Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W),
    Math.max(MIN_H, Number(node.size?.[1]) || DEFAULT_H),
  ];

  ensureState(node);
  ensureHiddenWidgets(node);

  const root = buildUI(node);
  root.dataset.dsTransparent = "true";
  node._dsSeedRoot = root;
  node._dsSeedDomWidget = node.addDOMWidget("ds_seed_ui", "div", root, {
    serialize: false,
    hideOnZoom: false,
    margin: 0,
  });

  node._dsSeedDomWidget.options.getMinHeight = () => DOM_BODY_H;
  node._dsSeedDomWidget.options.getMaxHeight = () => DOM_BODY_H;
  node._dsSeedDomWidget.computeSize = () => [0, DOM_BODY_H];
  node._dsSeedDomWidget.computeLayoutSize = () => ({
    minHeight: DOM_BODY_H,
    maxHeight: DOM_BODY_H,
    minWidth: 0,
  });

  const syncTransparentContainers = () => {
    let parent = root.parentElement;
    for (let depth = 0; depth < 4 && parent; depth += 1) {
      if (parent.id === "graph-canvas" || parent.classList?.contains("litegraph")) break;
      parent.style.setProperty("background", "transparent", "important");
      parent.style.setProperty("background-color", "transparent", "important");
      parent.dataset.dsSeedHost = "true";
      delete parent.dataset.dsNodeBase;
      parent = parent.parentElement;
    }
  };

  const host = root.parentElement;
  if (host) {
    host.dataset.dsSeedHost = "true";
    host.style.setProperty("background", "transparent", "important");
    host.style.setProperty("background-color", "transparent", "important");
    host.style.width = "100%";
    host.style.height = `${DOM_BODY_H}px`;
    host.style.minHeight = `${DOM_BODY_H}px`;
    host.style.maxHeight = `${DOM_BODY_H}px`;
    host.style.padding = "0";
    host.style.margin = "0";
    host.style.boxSizing = "border-box";
    host.style.overflow = "hidden";
    host.style.alignSelf = "flex-start";
    host.style.flex = `0 0 ${DOM_BODY_H}px`;
  }
  syncTransparentContainers();

  try { window.DSGlobalTheme?.bindNode?.(root, node); } catch {}
  try { window.DSUI?.protectResizeCorners?.(node); } catch {}
  try { window.DSGlobalTheme?.applyNodeBase?.(node); } catch {}
  syncTransparentContainers();
  try {
    node._dsSeedThemeUnsub = window.DSGlobalTheme?.subscribe?.(() => {
      syncTransparentContainers();
    });
  } catch {}

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
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) {}
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
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) {}
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
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) {}
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
              try { widget.callback(seed, app.canvas, graphNode, null, null); } catch (_) {}
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
    const oldSelected = nodeType.prototype.onSelected;
    const oldRemoved = nodeType.prototype.onRemoved;

    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated?.apply(this, arguments);
      installNode(this);
      return result;
    };

    nodeType.prototype.onConfigure = function () {
      const result = oldConfigured?.apply(this, arguments);
      setTimeout(() => {
        ensureState(this);
        installNode(this);
        ensureHiddenWidgets(this);
        syncUI(this);
      }, 0);
      return result;
    };

    nodeType.prototype.onSelected = function () {
      const result = oldSelected?.apply(this, arguments);
      touch(this);
      return result;
    };

    nodeType.prototype.onResize = function (size) {
      if (Array.isArray(size)) {
        size[0] = Math.max(MIN_W, Number(size[0]) || DEFAULT_W);
        size[1] = Math.max(MIN_H, Number(size[1]) || DEFAULT_H);
      }
      const result = oldResize?.apply(this, arguments);
      if (this._dsSeedRoot) {
        this._dsSeedRoot.style.width = "100%";
        this._dsSeedRoot.style.height = `${DOM_BODY_H}px`;
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
      try { this._dsSeedThemeUnsub?.(); } catch {}
      try { this._dsSeedDomWidget?.onRemove?.(); } catch {}
      try { this._dsSeedRoot?.remove?.(); } catch {}
      return oldRemoved?.apply(this, arguments);
    };
  },
});
