import { app } from "/scripts/app.js";

const TYPE = "DS_GroupSwitch";
const EXT = "DeathshotArsenal.DS_GroupSwitch";
const BASE_W = 360;
const BASE_H = 400;
const MIN_SCALE = 0.70;
const MAX_SCALE = 2.20;
const DEFAULT_W = BASE_W;
const DEFAULT_H = BASE_H;
const TITLE_H = 0;
const ROW_H = 38;
const UI_PAD_Y = 17;
const UI_TOP_H = 30;
const UI_CONTROLS_H = 33;
const UI_LIST_MARGIN = 8;
const UI_LIST_MIN_H = 120;
const UI_FOOTER_H = 23;
const UI_WIDGET_MARGIN = 10;
const UI_MAX_FIT_ROWS = 8;
const UI_SIZE_VERSION = 4;

const OPEN_POPUPS = new Map();
const GROUP_KEYS = new WeakMap();
let nextSyntheticGroupKey = 1;
let cssPromise = null;
let refreshTimer = null;
let globalsInstalled = false;

const ICON = {
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.7 2.8h4.6l.7 2.2c.5.2 1 .4 1.4.8l2.2-.6 2.3 4-1.6 1.6c.1.5.1 1 0 1.5l1.6 1.6-2.3 4-2.2-.6c-.4.4-.9.6-1.4.8l-.7 2.2H9.7L9 17.9c-.5-.2-1-.4-1.4-.8l-2.2.6-2.3-4 1.6-1.6c-.1-.5-.1-1 0-1.5L3.1 9.2l2.3-4 2.2.6c.4-.4.9-.6 1.4-.8l.7-2.2Z"/><circle cx="12" cy="12" r="3.1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

function graphOf(node) {
  return node?.graph || app?.canvas?.graph || app?.graph || app?.rootGraph || null;
}

function graphNodes(node) {
  const graph = graphOf(node);
  return Array.isArray(graph?._nodes) ? graph._nodes :
    Array.isArray(graph?.nodes) ? graph.nodes : [];
}

function rawGroups(node) {
  const graph = graphOf(node);
  if (!graph) return [];
  const groups = Array.isArray(graph._groups) ? graph._groups :
    Array.isArray(graph.groups) ? graph.groups : [];
  return groups.filter(Boolean);
}

function groupKey(group) {
  if (group == null) return "";
  const id = group.id;
  if (id !== undefined && id !== null && String(id) !== "" && String(id) !== "-1") {
    return `id:${id}`;
  }

  let key = GROUP_KEYS.get(group);
  if (!key) {
    const p = group.pos || group._pos || [0, 0];
    const s = group.size || group._size || [0, 0];
    const title = String(group.title || group.name || "Group");
    key = `g:${nextSyntheticGroupKey++}:${title}:${Number(p[0] || 0)}:${Number(p[1] || 0)}:${Number(s[0] || 0)}:${Number(s[1] || 0)}`;
    GROUP_KEYS.set(group, key);
  }
  return key;
}

function groupInfo(group) {
  const p = group.pos || group._pos || [0, 0];
  const s = group.size || group._size || [0, 0];
  return {
    key: groupKey(group),
    group,
    name: String(group.title || group.name || "Group"),
    x: Number(p[0] || 0),
    y: Number(p[1] || 0),
    w: Number(s[0] || 0),
    h: Number(s[1] || 0),
  };
}

function groupsOf(node) {
  const result = [];
  const seen = new Set();

  for (const group of rawGroups(node)) {
    try {
      // This is the canonical ComfyUI/LiteGraph membership calculation.
      group.recomputeInsideNodes?.(100);
    } catch {}

    const info = groupInfo(group);
    if (!info.key || seen.has(info.key)) continue;
    seen.add(info.key);
    result.push(info);
  }

  result.sort((a, b) =>
    (a.y - b.y) || (a.x - b.x) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return result;
}

function nodeCenter(node) {
  try {
    const b = node.boundingRect || node.getBounding?.();
    if (b) return [Number(b[0]) + Number(b[2]) / 2, Number(b[1]) + Number(b[3]) / 2];
  } catch {}
  const p = node?.pos || [0, 0];
  const s = node?.size || [0, 0];
  return [Number(p[0] || 0) + Number(s[0] || 0) / 2,
          Number(p[1] || 0) + Number(s[1] || 0) / 2];
}

function geometryMember(info, node) {
  const b = info.group?.boundingRect || info.group?.getBounding?.();
  if (!b || !node || node.id == null) return false;
  const c = nodeCenter(node);
  return c[0] >= Number(b[0]) &&
         c[1] >= Number(b[1]) &&
         c[0] <= Number(b[0]) + Number(b[2]) &&
         c[1] <= Number(b[1]) + Number(b[3]);
}

function memberNodes(info, controller) {
  const out = [];
  const seen = new Set();
  const direct = Array.isArray(info.group?._nodes) ? info.group._nodes :
    Array.isArray(info.group?.nodes) ? info.group.nodes : [];

  for (const n of direct) {
    if (!n || n === controller || n.id == null) continue;
    const id = String(n.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(n);
  }

  // Older LiteGraph builds may not populate _nodes. Only then use geometry.
  if (!out.length) {
    for (const n of graphNodes(controller)) {
      if (!n || n === controller || n.id == null) continue;
      if (geometryMember(info, n)) out.push(n);
    }
  }
  return out;
}

function configOf(node) {
  node.properties ||= {};
  node.properties.ds_group_switch ||= {
    version: 3,
    uiSizeVersion: 3,
    selectionMode: "pick",
    actionMode: "bypass",
    switchMode: "any",
    selectedGroups: [],
    restoreModes: {},
  };

  const c = node.properties.ds_group_switch;
  if (!Array.isArray(c.selectedGroups)) c.selectedGroups = [];
  if (!c.restoreModes || typeof c.restoreModes !== "object") c.restoreModes = {};
  if (!["pick", "all"].includes(c.selectionMode)) c.selectionMode = "pick";
  if (!["bypass", "mute"].includes(c.actionMode)) c.actionMode = "bypass";
  if (!["any", "one", "always"].includes(c.switchMode)) c.switchMode = "any";
  if (!Number.isFinite(Number(c.uiSizeVersion))) c.uiSizeVersion = 2;
  c.version = 3;
  return c;
}

function controlled(node) {
  const c = configOf(node);
  const groups = groupsOf(node);
  if (c.selectionMode === "all") return groups;
  const selected = new Set(c.selectedGroups.map(String));
  return groups.filter(g => selected.has(String(g.key)));
}

function touch(node) {
  try { graphOf(node)?.change?.(); } catch {}
  try { graphOf(node)?.setDirtyCanvas?.(true, true); } catch {}
  try { node.setDirtyCanvas?.(true, true); } catch {}
  refreshNodeUI(node);
}

function captureModes(node, info) {
  const c = configOf(node);
  const bucket = c.restoreModes[info.key] ||= {};

  for (const n of memberNodes(info, node)) {
    const mode = Number(n.mode);
    if (mode !== 2 && mode !== 4) {
      bucket[String(n.id)] = Number.isFinite(mode) ? mode : 0;
    }
  }
}

function setGroupMode(node, info, enabled) {
  const c = configOf(node);
  const nodes = memberNodes(info, node);
  if (!nodes.length) return;

  if (!enabled) {
    captureModes(node, info);
    const disabledMode = c.actionMode === "mute" ? 2 : 4;
    for (const n of nodes) n.mode = disabledMode;
    return;
  }

  const bucket = c.restoreModes[info.key] || {};
  for (const n of nodes) {
    const id = String(n.id);
    if (Object.prototype.hasOwnProperty.call(bucket, id)) {
      n.mode = Number(bucket[id]);
    } else if (Number(n.mode) === 2 || Number(n.mode) === 4) {
      n.mode = 0;
    }
  }
}

function stateOf(node, info) {
  const nodes = memberNodes(info, node);
  if (!nodes.length) return "empty";

  let disabled = 0;
  for (const n of nodes) {
    const mode = Number(n.mode);
    if (mode === 2 || mode === 4) disabled++;
  }

  if (disabled === 0) return "on";
  if (disabled === nodes.length) return "off";
  return "mixed";
}

function setGroup(node, info, enabled) {
  const c = configOf(node);
  const groups = controlled(node);
  if (!groups.some(g => g.key === info.key)) return;

  if (enabled && (c.switchMode === "one" || c.switchMode === "always")) {
    for (const g of groups) {
      if (g.key !== info.key) setGroupMode(node, g, false);
    }
  }

  if (!enabled && c.switchMode === "always") {
    const anotherOn = groups.some(g =>
      g.key !== info.key && stateOf(node, g) === "on"
    );
    if (!anotherOn) return;
  }

  setGroupMode(node, info, enabled);
  touch(node);
}

function setAll(node, enabled) {
  const c = configOf(node);
  const groups = controlled(node).filter(g => memberNodes(g, node).length);
  if (!groups.length) return;

  if (c.switchMode === "one" || c.switchMode === "always") {
    const keep = enabled ? groups[0] : groups.find(g => stateOf(node, g) === "on") || groups[0];
    for (const g of groups) setGroupMode(node, g, g.key === keep.key);
  } else {
    for (const g of groups) setGroupMode(node, g, enabled);
  }

  touch(node);
}

function installCSS() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise(resolve => {
    const existing = document.getElementById("ds-group-switch-css");
    if (existing) return resolve();

    const link = document.createElement("link");
    link.id = "ds-group-switch-css";
    link.rel = "stylesheet";
    link.href = `${location.origin}/extensions/DeathshotArsenal/Group Switch/ds_group_switch.css?v=7.0.0`;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return cssPromise;
}

function stopEvent(e) {
  e?.stopPropagation?.();
}

function makeButton(text, cls, handler) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.addEventListener("pointerdown", stopEvent);
  b.addEventListener("click", e => {
    stopEvent(e);
    handler(e);
  });
  return b;
}

function stateLabel(state) {
  return state === "on" ? "ON" : state === "off" ? "OFF" : state === "mixed" ? "MIXED" : "EMPTY";
}

function buildNodeUI(node) {
  const root = document.createElement("div");
  root.className = "ds-gs-node";
  root.dataset.dsThemed = "true";

  // The face is visual-only. Let LiteGraph receive drag/selection/resize
  // events everywhere except actual controls, which opt into pointer events.
  root.style.pointerEvents = "none";

  const top = document.createElement("div");
  top.className = "ds-gs-node-top";

  const brand = document.createElement("div");
  brand.className = "ds-gs-brand";
  brand.textContent = "DS";

  const title = document.createElement("div");
  title.className = "ds-gs-node-title";
  title.textContent = "Group Switch";

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "ds-gs-settings";
  settings.innerHTML = ICON.gear;
  settings.title = "Group Switch settings";
  settings.addEventListener("pointerdown", stopEvent);
  settings.addEventListener("click", e => {
    stopEvent(e);
    openSettings(node);
  });

  top.append(brand, title, settings);
  root.appendChild(top);

  const controls = document.createElement("div");
  controls.className = "ds-gs-node-controls";

  const action = document.createElement("div");
  action.className = "ds-gs-node-segment";
  const mute = makeButton("MUTE", "ds-gs-node-seg", () => {
    configOf(node).actionMode = "mute";
    touch(node);
  });
  const bypass = makeButton("BYPASS", "ds-gs-node-seg", () => {
    configOf(node).actionMode = "bypass";
    touch(node);
  });
  action.append(mute, bypass);

  const allOn = makeButton("ALL ON", "ds-gs-node-action", () => setAll(node, true));
  const allOff = makeButton("ALL OFF", "ds-gs-node-action", () => setAll(node, false));

  controls.append(action, allOn, allOff);
  root.appendChild(controls);

  const list = document.createElement("div");
  list.className = "ds-gs-node-list";
  root.appendChild(list);

  const footer = document.createElement("div");
  footer.className = "ds-gs-node-footer";
  root.appendChild(footer);

  node._dsGsDom = { root, list, footer, mute, bypass, settings };
  renderNodeUI(node);
  return root;
}

function renderNodeUI(node) {
  const ui = node._dsGsDom;
  if (!ui) return;

  const c = configOf(node);
  const groups = controlled(node);

  ui.mute.classList.toggle("active", c.actionMode === "mute");
  ui.bypass.classList.toggle("active", c.actionMode === "bypass");

  ui.list.innerHTML = "";

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "ds-gs-node-empty";
    empty.textContent = c.selectionMode === "pick"
      ? "No groups selected — open settings"
      : "No groups detected on this canvas";
    ui.list.appendChild(empty);
  } else {
    for (const group of groups) {
      const row = document.createElement("div");
      row.className = "ds-gs-node-row";

      const dot = document.createElement("span");
      dot.className = "ds-gs-node-dot";

      const name = document.createElement("span");
      name.className = "ds-gs-node-group-name";
      name.textContent = group.name;

      const state = document.createElement("button");
      state.type = "button";
      state.className = "ds-gs-node-toggle";
      const current = stateOf(node, group);
      state.dataset.state = current;
      const label = current === "on" ? "ON" :
        current === "off" ? "OFF" :
        current === "mixed" ? "MIX" : "—";
      state.innerHTML = `<span class="ds-gs-toggle-mark" aria-hidden="true"><i></i></span><span class="ds-gs-toggle-label">${label}</span>`;
      state.title = current === "on" ? "Enabled — click to disable" :
        current === "off" ? "Disabled — click to enable" :
        current === "mixed" ? "Mixed state — click to enable all" :
        "No nodes in group";

      state.addEventListener("pointerdown", stopEvent);
      state.addEventListener("click", e => {
        stopEvent(e);
        const now = stateOf(node, group);
        setGroup(node, group, now !== "on");
      });

      // Only the state control captures pointer input. The row itself remains
      // transparent to the pointer so native LiteGraph dragging still works.
      row.append(dot, name, state);
      ui.list.appendChild(row);
    }
  }

  const detected = groupsOf(node).length;
  const controlledCount = groups.length;
  ui.footer.textContent = `${controlledCount} controlled · ${detected} detected`;
}

function fixedNodeHeightForWidth(width) {
  const w = Math.max(BASE_W * MIN_SCALE, Number(width) || BASE_W);
  return Math.round(w * BASE_H / BASE_W);
}

function applyResizeAspect(node) {
  const proposedW = Math.max(1, Number(node.size?.[0]) || BASE_W);
  const proposedH = Math.max(1, Number(node.size?.[1]) || BASE_H);
  const scale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, Math.max(proposedW / BASE_W, proposedH / BASE_H))
  );
  const w = Math.round(BASE_W * scale);
  const h = Math.round(BASE_H * scale);
  if (Math.abs(proposedW - w) > 0.5) node.size[0] = w;
  if (Math.abs(proposedH - h) > 0.5) node.size[1] = h;
  node._dsGsScale = scale;
}

function syncScale(node) {
  const w = Number(node.size?.[0]) || BASE_W;
  node._dsGsScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, w / BASE_W));
}

function syncDOMWidgetGeometry(node) {
  const widget = node?._dsGsDomWidget;
  const dom = node?._dsGsDomRoot;
  if (!widget || !dom) return;

  const w = Math.max(BASE_W * MIN_SCALE, Number(node.size?.[0]) || BASE_W);
  const h = fixedNodeHeightForWidth(w);

  // The node itself owns the geometry. The DOM is only the visual face.
  // The widget wrapper gets its height from getHeight(); keep the face itself
  // pinned to that geometry without feeding the measurement back into node.size.
  dom.style.width = "100%";
  dom.style.height = "100%";
  dom.style.minHeight = "0";
  dom.style.maxHeight = "100%";
}

function refreshNodeUI(node) {
  if (!node?._dsGsDom) return;
  renderNodeUI(node);
}

function bindDOMWidget(node) {
  if (node._dsGsDomBound) return;
  node._dsGsDomBound = true;

  node.resizable = true;
  node.flags ||= {};
  node.flags.no_title = true;
  node.title = "";
  node.badges = [];
  node.min_size = [Math.round(BASE_W * MIN_SCALE), Math.round(BASE_H * MIN_SCALE)];

  if (!Array.isArray(node.size) || node.size.length < 2 ||
      !Number.isFinite(Number(node.size[0])) || Number(node.size[0]) <= 0 ||
      !Number.isFinite(Number(node.size[1])) || Number(node.size[1]) <= 0) {
    node.size = [DEFAULT_W, DEFAULT_H];
  }

  // Normalize only if the node is clearly invalid. Existing workflow sizes
  // are preserved; deliberate resizing is never replaced by content height.
  if (Number(node.size[0]) < node.min_size[0]) node.size[0] = node.min_size[0];
  syncScale(node);

  if (!node.properties) node.properties = {};
  const config = configOf(node);
  config.uiSizeVersion = UI_SIZE_VERSION;

  const dom = buildNodeUI(node);
  node._dsGsDomRoot = dom;

  if (typeof node.addDOMWidget === "function") {
    // Match the proven Hardware Monitor / Pixaroma-style DOM widget contract:
    // let ComfyUI own the widget geometry, while the node width remains the
    // single source of truth for the aspect ratio. Do not use afterResize or
    // write computedHeight on every frame; those can turn the DOM widget into
    // a full-canvas interaction shield and can also create resize feedback.
    const widget = node.addDOMWidget("ds_group_switch_ui", "group_switch", dom, {
      serialize: false,
      hideOnZoom: false,
      getHeight: () => Math.max(1, Math.round((Number(node.size?.[0]) || BASE_W) * BASE_H / BASE_W)),
      getMinHeight: Math.round(BASE_H * MIN_SCALE),
    });
    widget.computeLayoutSize = () => ({
      minHeight: Math.round(BASE_H * MIN_SCALE),
      minWidth: Math.round(BASE_W * MIN_SCALE),
    });

    node._dsGsDomWidget = widget;

    // The DOM widget occupies the visual body of the node, so recent
    // ComfyUI CanvasPointer handling may route the pointer through the
    // widget instead of the native node hit-test. Bridge non-control
    // pointer-downs back into LiteGraph's native drag lifecycle. This is
    // the same pattern used by ComfyUI's own full-node custom widgets.
    widget.onPointerDown = function(pointer, ownerNode, canvas) {
      const target = pointer?.eDown?.target;

      // Actual DOM controls own their click. Returning true here prevents
      // LiteGraph from interpreting a button press as a node drag.
      if (target?.closest?.("button, input, select, textarea, [contenteditable=\"true\"]")) {
        return true;
      }

      // IMPORTANT: do not cancel LiteGraph for the visual surface.
      // Returning false hands the pointer back to native CanvasPointer
      // processing, so the entire node body can select, drag and resize.
      // This is the supported DOMWidget/LiteGraph hand-off.
      return false;
    };

    // Only set the visual face geometry. Never use it to mutate node.size.
    syncDOMWidgetGeometry(node);
  } else {
    installCanvasFallback(node);
  }

  try {
    window.DSGlobalTheme?.bindNode?.(dom, node);
  } catch {}

  setTimeout(() => {
    try {
      window.DSGlobalTheme?.bindNode?.(dom, node);
      renderNodeUI(node);
      syncDOMWidgetGeometry(node);
      node.setDirtyCanvas?.(true, true);
    } catch (e) {
      console.error("[DS Group Switch] UI initialization error:", e);
    }
  }, 0);
}

function installCanvasFallback(node) {
  if (node._dsGsCanvasFallback) return;
  node._dsGsCanvasFallback = true;

  node.onDrawForeground = function(ctx) {
    const w = Math.max(BASE_W * MIN_SCALE, Number(node.size?.[0]) || DEFAULT_W);
    const h = fixedNodeHeightForWidth(w);
    ctx.save();
    ctx.fillStyle = "#17191d";
    ctx.fillRect(0, TITLE_H, w, h - TITLE_H);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "700 13px sans-serif";
    ctx.fillText("DS Group Switch", 12, TITLE_H + 22);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("Open settings to select workflow groups.", 12, TITLE_H + 45);
    ctx.restore();
  };
}

function popupTheme(popup, theme) {
  popup.dataset.dsThemed = "true";
  if (theme?.vars) {
    for (const [key, value] of Object.entries(theme.vars)) {
      popup.style.setProperty(key, value);
    }
  }
}

async function loadTheme() {
  try {
    const r = await fetch("/ds/theme/config", { cache: "no-store" });
    if (!r.ok) return null;
    const cfg = (await r.json())?.config || {};
    const id = cfg.theme || "deathshot_dark";

    let data = null;
    try {
      const t = await fetch("/ds/theme/themes", { cache: "no-store" });
      if (t.ok) data = await t.json();
    } catch {}

    if (!data) {
      const t = await fetch("/extensions/DeathshotArsenal/themes/themes.json", { cache: "no-store" });
      if (t.ok) data = await t.json();
    }

    const theme = data?.themes?.[id];
    return theme ? { id, ...theme } : null;
  } catch {
    return null;
  }
}

function popupPosition(node, popup) {
  const canvas = app?.canvas?.canvas || document.querySelector("canvas");
  const ds = app?.canvas?.ds;
  if (!canvas || !ds) return;

  const rect = canvas.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const offset = ds.offset || [0, 0];
  const nr = {
    left: rect.left + (Number(node.pos?.[0] || 0) + Number(offset[0] || 0)) * scale,
    top: rect.top + (Number(node.pos?.[1] || 0) + Number(offset[1] || 0)) * scale,
    width: Number(node.size?.[0] || DEFAULT_W) * scale,
    height: Number(node.size?.[1] || DEFAULT_H) * scale,
  };

  const margin = 8;
  const pw = popup.offsetWidth || 430;
  const ph = Math.min(popup.scrollHeight || 700, innerHeight - margin * 2);

  let left = nr.left + nr.width + 10;
  if (left + pw > innerWidth - margin) left = nr.left - pw - 10;
  left = Math.max(margin, Math.min(left, innerWidth - pw - margin));

  let top = nr.top;
  if (top + ph > innerHeight - margin) top = innerHeight - ph - margin;
  top = Math.max(margin, top);

  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function closeSettings(nodeId) {
  const item = OPEN_POPUPS.get(nodeId);
  if (!item) return;
  if (item.raf) cancelAnimationFrame(item.raf);
  item.popup.remove();
  OPEN_POPUPS.delete(nodeId);
}

function makeSegment(container, labels, active, callback) {
  container.innerHTML = "";
  for (const [value, label] of labels) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `ds-gs-popup-seg${active === value ? " active" : ""}`;
    b.textContent = label;
    b.addEventListener("pointerdown", stopEvent);
    b.addEventListener("click", e => {
      stopEvent(e);
      callback(value);
    });
    container.appendChild(b);
  }
}

function openSettings(node) {
  if (OPEN_POPUPS.has(node.id)) {
    popupPosition(node, OPEN_POPUPS.get(node.id).popup);
    return;
  }

  for (const id of [...OPEN_POPUPS.keys()]) closeSettings(id);

  const popup = document.createElement("div");
  popup.className = "ds-gs-popup";
  popup.dataset.dsThemed = "true";
  popup.addEventListener("pointerdown", stopEvent);
  popup.addEventListener("mousedown", stopEvent);
  popup.addEventListener("wheel", e => e.stopPropagation(), { passive: true });

  const item = { node, popup, search: "", sort: "position", raf: 0 };
  OPEN_POPUPS.set(node.id, item);
  document.body.appendChild(popup);

  renderSettings(item);

  item.raf = requestAnimationFrame(function loop() {
    if (!document.body.contains(popup)) return;
    popupPosition(node, popup);
    item.raf = requestAnimationFrame(loop);
  });
}

function renderSettings(item) {
  const { node, popup } = item;
  const c = configOf(node);
  const groups = groupsOf(node);
  const selected = new Set(c.selectedGroups.map(String));

  popup.innerHTML = "";

  const head = document.createElement("div");
  head.className = "ds-gs-popup-head";
  head.innerHTML = `<div class="ds-gs-popup-brand">DS</div><div><div class="ds-gs-popup-title">Group Switch</div><div class="ds-gs-popup-sub">Select which canvas groups this node controls</div></div>`;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "ds-gs-popup-close";
  close.innerHTML = ICON.close;
  close.addEventListener("pointerdown", stopEvent);
  close.addEventListener("click", e => {
    stopEvent(e);
    closeSettings(node.id);
  });
  head.appendChild(close);
  popup.appendChild(head);

  const body = document.createElement("div");
  body.className = "ds-gs-popup-body";

  const actionSection = document.createElement("section");
  actionSection.className = "ds-gs-popup-section";
  actionSection.innerHTML = `<div class="ds-gs-popup-label">Execution action</div>`;
  const actionSeg = document.createElement("div");
  actionSeg.className = "ds-gs-popup-segment";
  makeSegment(actionSeg, [["mute", "Mute"], ["bypass", "Bypass"]], c.actionMode, value => {
    configOf(node).actionMode = value;
    touch(node);
    renderSettings(item);
  });
  actionSection.appendChild(actionSeg);
  body.appendChild(actionSection);

  const selectionSection = document.createElement("section");
  selectionSection.className = "ds-gs-popup-section";
  selectionSection.innerHTML = `<div class="ds-gs-popup-label">Controlled groups</div>`;
  const selectionSeg = document.createElement("div");
  selectionSeg.className = "ds-gs-popup-segment";
  makeSegment(selectionSeg, [["all", "All groups"], ["pick", "Pick groups"]], c.selectionMode, value => {
    configOf(node).selectionMode = value;
    touch(node);
    renderSettings(item);
  });
  selectionSection.appendChild(selectionSeg);

  const toolbar = document.createElement("div");
  toolbar.className = "ds-gs-popup-toolbar";

  const search = document.createElement("div");
  search.className = "ds-gs-popup-search";
  search.innerHTML = ICON.search;
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Filter groups…";
  input.value = item.search;
  input.addEventListener("pointerdown", stopEvent);
  input.addEventListener("input", () => {
    item.search = input.value;
    renderSettings(item);
    const next = popup.querySelector("input");
    next?.focus();
    if (next) next.setSelectionRange(next.value.length, next.value.length);
  });
  search.appendChild(input);
  toolbar.appendChild(search);

  const sort = document.createElement("select");
  sort.className = "ds-gs-popup-sort";
  for (const [value, label] of [["position", "Position"], ["name", "Name"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sort.appendChild(option);
  }
  sort.value = item.sort;
  sort.addEventListener("pointerdown", stopEvent);
  sort.addEventListener("change", e => {
    stopEvent(e);
    item.sort = e.target.value;
    renderSettings(item);
  });
  toolbar.appendChild(sort);
  selectionSection.appendChild(toolbar);

  let filtered = groups.filter(g =>
    g.name.toLowerCase().includes(item.search.trim().toLowerCase())
  );
  if (item.sort === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  const list = document.createElement("div");
  list.className = "ds-gs-popup-list";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "ds-gs-popup-empty";
    empty.textContent = groups.length ? "No groups match the filter." : "No groups detected on this canvas.";
    list.appendChild(empty);
  } else {
    for (const g of filtered) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `ds-gs-popup-row${c.selectionMode === "all" || selected.has(String(g.key)) ? " selected" : ""}`;

      const check = document.createElement("span");
      check.className = "ds-gs-popup-check";
      check.innerHTML = ICON.check;

      const text = document.createElement("span");
      text.className = "ds-gs-popup-group";
      const name = document.createElement("span");
      name.className = "ds-gs-popup-group-name";
      name.textContent = g.name;
      const meta = document.createElement("span");
      meta.className = "ds-gs-popup-group-meta";
      meta.textContent = `${memberNodes(g, node).length} node${memberNodes(g, node).length === 1 ? "" : "s"}`;
      text.append(name, meta);

      const status = document.createElement("span");
      status.className = `ds-gs-popup-status ${stateOf(node, g)}`;
      status.textContent = stateLabel(stateOf(node, g));

      row.append(check, text, status);
      row.addEventListener("pointerdown", stopEvent);
      row.addEventListener("click", e => {
        stopEvent(e);
        if (c.selectionMode === "all") return;

        const cfg = configOf(node);
        const set = new Set(cfg.selectedGroups.map(String));
        const key = String(g.key);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        cfg.selectedGroups = [...set];

        touch(node);
        renderSettings(item);
      });

      list.appendChild(row);
    }
  }

  selectionSection.appendChild(list);

  const note = document.createElement("div");
  note.className = "ds-gs-popup-note";
  note.textContent = `${filtered.length} shown · ${groups.length} detected · ${controlled(node).length} controlled`;
  selectionSection.appendChild(note);

  body.appendChild(selectionSection);

  const ruleSection = document.createElement("section");
  ruleSection.className = "ds-gs-popup-section";
  ruleSection.innerHTML = `<div class="ds-gs-popup-label">Switching rule</div>`;

  const rules = document.createElement("div");
  rules.className = "ds-gs-popup-rules";
  const ruleData = [
    ["any", "Independent", "Each group can be switched separately."],
    ["one", "Only one", "Turning one on turns the others off."],
    ["always", "Always one", "At least one controlled group stays on."],
  ];

  for (const [value, label, desc] of ruleData) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `ds-gs-popup-rule${c.switchMode === value ? " active" : ""}`;
    row.innerHTML = `<span class="ds-gs-popup-radio"></span><span><strong>${label}</strong><small>${desc}</small></span>`;
    row.addEventListener("pointerdown", stopEvent);
    row.addEventListener("click", e => {
      stopEvent(e);
      configOf(node).switchMode = value;
      touch(node);
      renderSettings(item);
    });
    rules.appendChild(row);
  }

  ruleSection.appendChild(rules);
  body.appendChild(ruleSection);
  popup.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "ds-gs-popup-footer";
  footer.append(
    makeButton("Enable controlled groups", "ds-gs-popup-footer-btn", () => {
      setAll(node, true);
      renderSettings(item);
    }),
    makeButton("Disable controlled groups", "ds-gs-popup-footer-btn", () => {
      setAll(node, false);
      renderSettings(item);
    })
  );
  popup.appendChild(footer);

  popupTheme(popup, window.__DS_GROUP_SWITCH_THEME__ || null);
  popupPosition(node, popup);
}

function installGlobals() {
  if (globalsInstalled) return;
  globalsInstalled = true;

  window.addEventListener("pointerdown", e => {
    for (const [id, item] of [...OPEN_POPUPS]) {
      if (item.popup.contains(e.target)) continue;
      if (item.node?._dsGsDomRoot?.contains?.(e.target)) continue;
      closeSettings(id);
    }
  }, true);

  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    for (const id of [...OPEN_POPUPS.keys()]) closeSettings(id);
  });
}

function patchNode(node) {
  if (!node || node.type !== TYPE) return;
  node.flags ||= {};
  node.flags.no_title = true;
  node.title = "";
  node.resizable = true;
  // The custom face is the node. Do not let DSGlobalTheme paint a second
  // native base underneath it.
  node._dsNodeBaseOptOut = true;
  node.bgcolor = "transparent";
  node.color = "transparent";
  node.boxcolor = "transparent";
  bindDOMWidget(node);
}

function refresh() {
  const nodes = graphNodes(null).filter(n => n?.type === TYPE);
  for (const node of nodes) {
    if (!node._dsGsDomBound) patchNode(node);

    const sig = groupsOf(node).map(g =>
      `${g.key}:${g.name}:${g.x}:${g.y}:${g.w}:${g.h}`
    ).join("|");

    if (sig !== node._dsGsGroupSignature) {
      node._dsGsGroupSignature = sig;
      syncScale(node);
      syncDOMWidgetGeometry(node);
      refreshNodeUI(node);
      for (const item of OPEN_POPUPS.values()) {
        if (item.node === node) renderSettings(item);
      }
    } else {
      refreshNodeUI(node);
    }
  }
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    // Pixaroma-style chromeless node: title mode belongs to the NODE TYPE.
    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const result = oldCreated ? oldCreated.apply(this, arguments) : undefined;
      patchNode(this);
      return result;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
      const result = oldConfigure ? oldConfigure.apply(this, arguments) : undefined;
      this.flags ||= {};
      this.flags.no_title = true;
      this.title = "";
      configOf(this);
      syncScale(this);

      // Keep only configuration in workflow JSON; the DOM itself is transient.
      setTimeout(() => {
        patchNode(this);
        refreshNodeUI(this);
        syncDOMWidgetGeometry(this);
      }, 0);

      return result;
    };

    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function(size) {
      // Snap LiteGraph's freeform resize proposal back to the node's one
      // canonical aspect ratio. Do this before ComfyUI's original hook.
      applyResizeAspect(this);
      const result = oldResize ? oldResize.apply(this, arguments) : undefined;
      syncScale(this);
      syncDOMWidgetGeometry(this);
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function() {
      closeSettings(this.id);
      if (oldRemoved) return oldRemoved.apply(this, arguments);
    };
  },

  nodeCreated(node) {
    patchNode(node);
  },

  loadedGraphNode(node) {
    patchNode(node);
  },

  async setup() {
    await installCSS();
    installGlobals();

    try {
      window.__DS_GROUP_SWITCH_THEME__ = await loadTheme();
    } catch {}

    window.addEventListener("ds-theme-changed", e => {
      window.__DS_GROUP_SWITCH_THEME__ = e?.detail?.theme || null;
      for (const item of OPEN_POPUPS.values()) {
        popupTheme(item.popup, window.__DS_GROUP_SWITCH_THEME__);
      }
      for (const node of graphNodes(null).filter(n => n?.type === TYPE)) {
        try {
          window.DSGlobalTheme?.bindNode?.(node._dsGsDomRoot, node);
          node.setDirtyCanvas?.(true, true);
        } catch {}
      }
    });

    refresh();
    if (!refreshTimer) refreshTimer = setInterval(refresh, 700);
  },
});
