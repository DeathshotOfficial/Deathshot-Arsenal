import { app } from "/scripts/app.js";
import {
  Card,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  Toggle,
  Dropdown,
  installDSUI,
} from "../UIElements/index.js";

installDSUI();

const CSS_HREF = "/extensions/DeathshotArsenal/Group Switch/ds_group_switch.css";
if (typeof document !== "undefined") {
  const linkId = "ds-group-switch-css";
  let link = document.getElementById(linkId);
  const cacheBustHref = `${CSS_HREF}?t=${Date.now()}`;
  if (!link) {
    link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = cacheBustHref;
    document.head.appendChild(link);
  } else {
    link.href = cacheBustHref;
  }
}

const TYPE = "DS_GroupSwitch";
const EXT = "DeathshotArsenal.DS_GroupSwitch";
const CARD_MARGIN = 5;
const MIN_WIDTH = 240;
const DEFAULT_W = 270;
const ROW_HEIGHT = 36;
const TITLE_H = 0;
const UI_SIZE_VERSION = 8;

const OPEN_POPUPS = new Map();
const GROUP_KEYS = new WeakMap();
let nextSyntheticGroupKey = 1;
let cssPromise = null;
let refreshTimer = null;
let globalsInstalled = false;

const ICON = {
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

function registerGearMenu() {
  if (typeof window !== "undefined" && window.DSGearMenu?.register) {
    const gearConfig = {
      tooltip: "DS Group Switch Settings",
      onClick: (node) => {
        if (!node) return;
        if (OPEN_POPUPS.has(node.id)) {
          closeSettings(node.id);
        } else {
          openSettings(node);
        }
      },
    };
    window.DSGearMenu.register(TYPE, gearConfig);
    window.DSGearMenu.register("DS Group Switch", gearConfig);
    return true;
  }
  return false;
}

if (!registerGearMenu()) {
  setTimeout(registerGearMenu, 250);
  setTimeout(registerGearMenu, 1000);
}

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

  if (!out.length) {
    for (const n of graphNodes(controller)) {
      if (!n || n === controller || n.id == null) continue;
      if (geometryMember(info, n)) out.push(n);
    }
  }
  return out;
}

function configOf(node) {
  if (!node || node.type !== TYPE) return null;
  node.properties ||= {};
  node.properties.ds_group_switch ||= {
    version: 3,
    uiSizeVersion: UI_SIZE_VERSION,
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
  c.uiSizeVersion = UI_SIZE_VERSION;
  c.version = 3;
  return c;
}

function controlled(node) {
  if (!node || node.type !== TYPE) return [];
  const c = configOf(node);
  if (!c) return [];
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

function isAllOn(node) {
  const groups = controlled(node).filter(g => memberNodes(g, node).length);
  if (!groups.length) return false;
  return groups.every(g => stateOf(node, g) === "on");
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
    const timestamp = Date.now();
    const existing = document.getElementById("ds-group-switch-css");
    if (existing) {
      existing.href = `${location.origin}/extensions/DeathshotArsenal/Group Switch/ds_group_switch.css?t=${timestamp}`;
      return resolve();
    }

    const link = document.createElement("link");
    link.id = "ds-group-switch-css";
    link.rel = "stylesheet";
    link.href = `${location.origin}/extensions/DeathshotArsenal/Group Switch/ds_group_switch.css?t=${timestamp}`;
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
  return state === "on" ? "ON" : state === "off" ? "OFF" : state === "mixed" ? "MIX" : "EMPTY";
}

function calculateExactHeight(node) {
  if (!node || node.type !== TYPE) return 0;
  const groups = controlled(node);
  const rowCount = groups.length;
  const maxVisibleRows = 8;
  const visibleRows = Math.min(rowCount, maxVisibleRows);
  const listHeight = rowCount > 0 ? (visibleRows * ROW_HEIGHT) : 40;
  // Card header 20px + margin 8px = 28px
  // Controls 28px + margin 8px = 36px
  // List listHeight + margin 8px
  // Footer 14px
  // Card padding: 10px top + 10px bottom = 20px, Card border: 2px = 22px
  // Node outer margin: 5px top + 5px bottom = 10px
  const naturalCardHeight = 28 + 36 + listHeight + 8 + 14 + 22;
  return Math.ceil(naturalCardHeight + (CARD_MARGIN * 2));
}

function fitNodeHeight(node) {
  if (!node || node.type !== TYPE) return;
  const targetH = calculateExactHeight(node);
  if (!targetH) return;
  const currentW = Math.max(MIN_WIDTH, Number(node.size?.[0]) || DEFAULT_W);
  node.size[0] = currentW;
  node.size[1] = targetH;
  node.setDirtyCanvas?.(true, true);
}

function buildNodeUI(node) {
  const card = Card({
    title: "Group Switch",
    icon: "layers",
  });
  card.root.classList.add("ds-gs-card");
  card.root.dataset.dsThemed = "true";
  card.root.style.height = "100%";
  card.root.style.boxSizing = "border-box";

  if (card.head) {
    card.head.style.height = "20px";
    card.head.style.minHeight = "20px";
    card.head.style.marginBottom = "8px";
  }

  if (card.body) {
    card.body.style.display = "flex";
    card.body.style.flexDirection = "column";
    card.body.style.justifyContent = "flex-start";
    card.body.style.gap = "0";
    card.body.style.padding = "0";
    card.body.style.margin = "0";
    card.body.style.width = "100%";
    card.body.style.flex = "1 1 auto";
    card.body.style.minHeight = "0";
  }

  const controls = document.createElement("div");
  controls.className = "ds-gs-node-controls";
  controls.style.display = "flex";
  controls.style.flexDirection = "row";
  controls.style.alignItems = "center";
  controls.style.justifyContent = "space-between";
  controls.style.gap = "10px";
  controls.style.width = "100%";
  controls.style.boxSizing = "border-box";
  controls.style.flex = "0 0 28px";
  controls.style.height = "28px";
  controls.style.marginBottom = "8px";

  const action = document.createElement("div");
  action.className = "ds-gs-segment ds-gs-node-segment";
  action.style.display = "grid";
  action.style.gridTemplateColumns = "1fr 1fr";
  action.style.gap = "2px";
  action.style.padding = "2px";
  action.style.flex = "1 1 auto";
  action.style.minWidth = "0";
  action.style.width = "auto";
  action.style.margin = "0";
  action.style.boxSizing = "border-box";

  const mute = makeButton("MUTE", "ds-gs-tab ds-gs-node-seg", () => {
    configOf(node).actionMode = "mute";
    touch(node);
  });
  const bypass = makeButton("BYPASS", "ds-gs-tab ds-gs-node-seg", () => {
    configOf(node).actionMode = "bypass";
    touch(node);
  });
  action.append(mute, bypass);

  const allWrap = document.createElement("div");
  allWrap.className = "ds-gs-all-toggle-wrap";
  allWrap.style.display = "flex";
  allWrap.style.flexDirection = "row";
  allWrap.style.alignItems = "center";
  allWrap.style.gap = "6px";
  allWrap.style.flex = "0 0 auto";
  allWrap.style.margin = "0";
  allWrap.style.padding = "0 10px 0 0";
  allWrap.style.boxSizing = "border-box";

  const allToggle = Toggle({
    className: "ds-gs-all-toggle",
    label: "ALL",
    checked: false,
    onChange: (checked) => {
      setAll(node, checked);
    },
  });
  allToggle.root.style.display = "inline-flex";
  allToggle.root.style.flexDirection = "row";
  allToggle.root.style.alignItems = "center";
  allToggle.root.style.gap = "6px";
  allToggle.root.style.margin = "0";
  allToggle.root.style.width = "auto";
  allWrap.appendChild(allToggle.root);

  controls.append(action, allWrap);
  card.body.appendChild(controls);

  const list = document.createElement("div");
  list.className = "ds-gs-node-list";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.flexWrap = "nowrap";
  list.style.width = "100%";
  list.style.boxSizing = "border-box";
  list.style.flex = "0 0 auto";
  list.style.margin = "0 0 8px 0";
  list.style.padding = "0";
  list.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
  card.body.appendChild(list);

  const footer = document.createElement("div");
  footer.className = "ds-gs-node-footer";
  footer.style.flex = "0 0 14px";
  footer.style.height = "14px";
  footer.style.lineHeight = "14px";
  footer.style.margin = "0";
  footer.style.padding = "0";
  card.body.appendChild(footer);

  node._dsGsDom = {
    card,
    root: card.root,
    list,
    footer,
    mute,
    bypass,
    allToggle,
    renderedKeys: "",
    toggleMap: new Map(),
  };

  renderNodeUI(node);
  return card.root;
}

function renderNodeUI(node) {
  const ui = node._dsGsDom;
  if (!ui) return;

  const c = configOf(node);
  const groups = controlled(node);

  ui.mute.classList.toggle("is-active", c.actionMode === "mute");
  ui.mute.classList.toggle("active", c.actionMode === "mute");
  ui.bypass.classList.toggle("is-active", c.actionMode === "bypass");
  ui.bypass.classList.toggle("active", c.actionMode === "bypass");

  const groupsKey = groups.map(g => g.key).join("|");
  const listStructureChanged = ui.renderedKeys !== groupsKey;

  if (listStructureChanged) {
    ui.renderedKeys = groupsKey;
    ui.list.replaceChildren();
    ui.toggleMap.clear();

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "ds-gs-node-empty";
      empty.textContent = c.selectionMode === "pick"
        ? "No groups selected"
        : "No canvas groups detected";
      ui.list.appendChild(empty);
    } else {
      for (const group of groups) {
        const toggle = Toggle({
          className: "ds-gs-group-row",
          label: group.name,
          checked: false,
          onChange: (checked) => {
            setGroup(node, group, checked);
          },
        });
        toggle.root.style.display = "flex";
        toggle.root.style.flexDirection = "row";
        toggle.root.style.alignItems = "center";
        toggle.root.style.justifyContent = "space-between";
        toggle.root.style.width = "100%";
        toggle.root.style.minWidth = "100%";
        toggle.root.style.maxWidth = "100%";
        toggle.root.style.boxSizing = "border-box";
        toggle.root.style.height = "36px";
        toggle.root.style.flex = "0 0 36px";

        ui.toggleMap.set(group.key, toggle);
        ui.list.appendChild(toggle.root);
      }
    }
  }

  // Update toggle values in place
  for (const group of groups) {
    const toggle = ui.toggleMap.get(group.key);
    if (toggle) {
      const current = stateOf(node, group);
      toggle.setValue(current === "on", false);
      toggle.setDisabled(current === "empty");
    }
  }

  // Master ALL toggle
  ui.allToggle.setValue(isAllOn(node), false);

  const detected = groupsOf(node).length;
  const controlledCount = groups.length;
  ui.footer.textContent = `${controlledCount} controlled · ${detected} detected`;

  fitNodeHeight(node);
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

  const initialH = calculateExactHeight(node);
  node.min_size = [MIN_WIDTH, initialH];

  if (!Array.isArray(node.size) || node.size.length < 2 ||
      !Number.isFinite(Number(node.size[0])) || Number(node.size[0]) <= 0 ||
      !Number.isFinite(Number(node.size[1])) || Number(node.size[1]) <= 0) {
    node.size = [DEFAULT_W, initialH];
  }

  if (Number(node.size[0]) < MIN_WIDTH) node.size[0] = MIN_WIDTH;
  node.size[1] = initialH;

  if (!node.properties) node.properties = {};
  const config = configOf(node);
  config.uiSizeVersion = UI_SIZE_VERSION;

  const cardRoot = buildNodeUI(node);
  node._dsGsDomRoot = cardRoot;

  if (typeof node.addDOMWidget === "function") {
    const domWidget = node.addDOMWidget("ds_group_switch_ui", "custom", cardRoot, {
      serialize: false,
      margin: CARD_MARGIN,
      getMinHeight: () => calculateExactHeight(node),
      getMaxHeight: () => {
        const widgetY = Number(domWidget?.y ?? (node.widgets_start_y ?? 0));
        const nodeHeight = Number(node.size?.[1] ?? 0);
        return Math.max(calculateExactHeight(node), nodeHeight - widgetY);
      },
    });

    domWidget.computeLayoutSize = () => ({
      minHeight: calculateExactHeight(node),
      minWidth: MIN_WIDTH,
    });

    node._dsGsDomWidget = domWidget;

    domWidget.onPointerDown = function(pointer, ownerNode, canvas) {
      const target = pointer?.eDown?.target;
      if (target?.closest?.("button, input, select, textarea, [contenteditable=\"true\"], .ds-ui-toggle-row, .ds-ui-toggle-track, .ds-ui-toggle-thumb, .ds-ui-dropdown, .ds-gs-tab")) {
        return true;
      }
      return false;
    };

    normalizeDSWidgetHost(cardRoot, node, { shell: false });
    protectDSResizeCorners(node);
  } else {
    installCanvasFallback(node);
  }

  try {
    window.DSGlobalTheme?.bindNode?.(cardRoot, node);
  } catch {}

  setTimeout(() => {
    try {
      window.DSGlobalTheme?.bindNode?.(cardRoot, node);
      renderNodeUI(node);
      fitNodeHeight(node);
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
    const w = Math.max(MIN_WIDTH, Number(node.size?.[0]) || DEFAULT_W);
    const h = calculateExactHeight(node);
    ctx.save();
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, TITLE_H, w, h - TITLE_H);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "700 13px sans-serif";
    ctx.fillText("DS Group Switch", 12, TITLE_H + 22);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("Open settings in toolbar to select workflow groups.", 12, TITLE_H + 45);
    ctx.restore();
  };
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
    height: Number(node.size?.[1] || 300) * scale,
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
  popup.addEventListener("wheel", e => e.stopPropagation(), { passive: true });

  const item = { node, popup, search: "", sort: "position", raf: 0 };
  OPEN_POPUPS.set(node.id, item);
  document.body.appendChild(popup);

  buildSettingsContent(item);

  item.raf = requestAnimationFrame(function loop() {
    if (!document.body.contains(popup)) return;
    popupPosition(node, popup);
    item.raf = requestAnimationFrame(loop);
  });
}

function buildSettingsContent(item) {
  const { node, popup } = item;
  const c = configOf(node);
  const groups = groupsOf(node);

  popup.replaceChildren();

  // Header
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

  // Section 1: Execution Action
  const actionSection = document.createElement("section");
  actionSection.className = "ds-gs-popup-section";
  actionSection.innerHTML = `<div class="ds-gs-popup-label">Execution action</div>`;
  const actionSeg = document.createElement("div");
  actionSeg.className = "ds-gs-segment ds-gs-popup-segment";

  const muteBtn = makeButton("Mute", `ds-gs-tab${c.actionMode === "mute" ? " is-active active" : ""}`, () => {
    c.actionMode = "mute";
    muteBtn.classList.add("is-active", "active");
    bypassBtn.classList.remove("is-active", "active");
    touch(node);
  });
  const bypassBtn = makeButton("Bypass", `ds-gs-tab${c.actionMode === "bypass" ? " is-active active" : ""}`, () => {
    c.actionMode = "bypass";
    bypassBtn.classList.add("is-active", "active");
    muteBtn.classList.remove("is-active", "active");
    touch(node);
  });
  actionSeg.append(muteBtn, bypassBtn);
  actionSection.appendChild(actionSeg);
  body.appendChild(actionSection);

  // Section 2: Controlled Groups
  const selectionSection = document.createElement("section");
  selectionSection.className = "ds-gs-popup-section";
  selectionSection.innerHTML = `<div class="ds-gs-popup-label">Controlled groups</div>`;
  const selectionSeg = document.createElement("div");
  selectionSeg.className = "ds-gs-segment ds-gs-popup-segment";

  let allBtn, pickBtn;
  const updateSelectionToggles = () => {
    const isAll = c.selectionMode === "all";
    allBtn.classList.toggle("is-active", isAll);
    allBtn.classList.toggle("active", isAll);
    pickBtn.classList.toggle("is-active", !isAll);
    pickBtn.classList.toggle("active", !isAll);

    for (const [key, t] of toggleRowMap) {
      t.setDisabled(isAll);
      if (isAll) {
        t.setValue(true, false);
      } else {
        const set = new Set(c.selectedGroups.map(String));
        t.setValue(set.has(String(key)), false);
      }
    }
    updateNote();
  };

  allBtn = makeButton("All groups", `ds-gs-tab${c.selectionMode === "all" ? " is-active active" : ""}`, () => {
    c.selectionMode = "all";
    updateSelectionToggles();
    touch(node);
  });
  pickBtn = makeButton("Pick groups", `ds-gs-tab${c.selectionMode === "pick" ? " is-active active" : ""}`, () => {
    c.selectionMode = "pick";
    updateSelectionToggles();
    touch(node);
  });
  selectionSeg.append(allBtn, pickBtn);
  selectionSection.appendChild(selectionSeg);

  // Toolbar (Search + Dropdown)
  const toolbar = document.createElement("div");
  toolbar.className = "ds-gs-popup-toolbar";

  const search = document.createElement("div");
  search.className = "ds-gs-popup-search";
  search.innerHTML = ICON.search;
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Filter groups…";
  input.value = item.search;
  input.addEventListener("pointerdown", stopEvent);
  input.addEventListener("input", () => {
    item.search = input.value;
    filterRows();
  });
  search.appendChild(input);
  toolbar.appendChild(search);

  const sortDropdown = Dropdown({
    options: [
      { id: "position", label: "Position" },
      { id: "name", label: "Name" },
    ],
    value: item.sort,
    width: 95,
    compact: true,
    onChange: (val) => {
      item.sort = val;
      sortRows();
    },
  });
  toolbar.appendChild(sortDropdown.root);
  selectionSection.appendChild(toolbar);

  // List of group toggles (strictly 1 item per row)
  const list = document.createElement("div");
  list.className = "ds-gs-popup-list";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.flexWrap = "nowrap";
  list.style.width = "100%";
  list.style.boxSizing = "border-box";
  list.style.padding = "0";
  list.style.marginTop = "8px";

  const toggleRowMap = new Map();
  const rowElements = [];

  const updateNote = () => {
    let visibleCount = 0;
    for (const r of rowElements) {
      if (r.style.display !== "none") visibleCount++;
    }
    note.textContent = `${visibleCount} shown · ${groups.length} detected · ${controlled(node).length} controlled`;
  };

  for (const g of groups) {
    const isSelected = c.selectionMode === "all" || c.selectedGroups.map(String).includes(String(g.key));
    const gState = stateOf(node, g);
    const memberCount = memberNodes(g, node).length;

    const groupToggle = Toggle({
      className: "ds-gs-popup-row",
      label: g.name,
      description: `${memberCount} node${memberCount === 1 ? "" : "s"} · ${stateLabel(gState)}`,
      checked: isSelected,
      disabled: c.selectionMode === "all",
      onChange: (checked) => {
        if (c.selectionMode === "all") return;
        const set = new Set(c.selectedGroups.map(String));
        const key = String(g.key);
        if (checked) set.add(key);
        else set.delete(key);
        c.selectedGroups = [...set];

        touch(node);
        updateNote();
      },
    });

    groupToggle.root.style.display = "flex";
    groupToggle.root.style.flexDirection = "row";
    groupToggle.root.style.alignItems = "center";
    groupToggle.root.style.justifyContent = "space-between";
    groupToggle.root.style.width = "100%";
    groupToggle.root.style.minWidth = "100%";
    groupToggle.root.style.maxWidth = "100%";
    groupToggle.root.style.boxSizing = "border-box";

    toggleRowMap.set(g.key, groupToggle);
    groupToggle.root.dataset.groupKey = g.key;
    groupToggle.root.dataset.groupName = g.name;
    rowElements.push(groupToggle.root);
    list.appendChild(groupToggle.root);
  }

  selectionSection.appendChild(list);

  const note = document.createElement("div");
  note.className = "ds-gs-popup-note";
  selectionSection.appendChild(note);
  updateNote();

  body.appendChild(selectionSection);

  const filterRows = () => {
    const q = item.search.trim().toLowerCase();
    for (const r of rowElements) {
      const name = (r.dataset.groupName || "").toLowerCase();
      r.style.display = (!q || name.includes(q)) ? "flex" : "none";
    }
    updateNote();
  };

  const sortRows = () => {
    const sorted = [...rowElements].sort((a, b) => {
      if (item.sort === "name") {
        return (a.dataset.groupName || "").localeCompare(b.dataset.groupName || "", undefined, { sensitivity: "base" });
      }
      return 0;
    });
    for (const r of sorted) list.appendChild(r);
  };

  // Section 3: Switching Rules Tabs
  const ruleSection = document.createElement("section");
  ruleSection.className = "ds-gs-popup-section";
  ruleSection.innerHTML = `<div class="ds-gs-popup-label">Switching rule</div>`;

  const ruleData = [
    ["any", "Independent", "Each group can be switched separately."],
    ["one", "Only one", "Turning one on turns the others off."],
    ["always", "Always one", "At least one controlled group stays on."],
  ];

  const ruleSeg = document.createElement("div");
  ruleSeg.className = "ds-gs-segment ds-gs-popup-segment ds-gs-rule-tabs";
  ruleSeg.style.gridTemplateColumns = "1fr 1fr 1fr";

  const ruleButtons = [];
  for (const [val, label] of ruleData) {
    const isAct = c.switchMode === val;
    const b = makeButton(label, `ds-gs-tab${isAct ? " is-active active" : ""}`, () => {
      c.switchMode = val;
      for (const btn of ruleButtons) btn.classList.remove("is-active", "active");
      b.classList.add("is-active", "active");
      const activeInfo = ruleData.find(r => r[0] === val) || ruleData[0];
      ruleDesc.textContent = activeInfo[2];
      touch(node);
    });
    ruleButtons.push(b);
    ruleSeg.appendChild(b);
  }
  ruleSection.appendChild(ruleSeg);

  const activeRule = ruleData.find(r => r[0] === c.switchMode) || ruleData[0];
  const ruleDesc = document.createElement("div");
  ruleDesc.className = "ds-gs-rule-desc";
  ruleDesc.textContent = activeRule[2];
  ruleSection.appendChild(ruleDesc);

  body.appendChild(ruleSection);
  popup.appendChild(body);

  // Footer Actions
  const footer = document.createElement("div");
  footer.className = "ds-gs-popup-footer";
  footer.append(
    makeButton("Enable controlled groups", "ds-ui-btn ds-ui-btn-compact ds-gs-popup-footer-btn", () => {
      setAll(node, true);
    }),
    makeButton("Disable controlled groups", "ds-ui-btn ds-ui-btn-compact ds-gs-popup-footer-btn", () => {
      setAll(node, false);
    })
  );
  popup.appendChild(footer);

  popupPosition(node, popup);
}

function installGlobals() {
  if (globalsInstalled) return;
  globalsInstalled = true;

  window.addEventListener("pointerdown", e => {
    for (const [id, item] of [...OPEN_POPUPS]) {
      if (item.popup.contains(e.target)) continue;
      if (document.querySelector(".ds-ui-popup")?.contains(e.target)) continue;
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
  node._dsNodeBaseOptOut = true;
  node.bgcolor = "transparent";
  node.color = "transparent";
  node.boxcolor = "transparent";
  bindDOMWidget(node);
  fitNodeHeight(node);
}

function refresh() {
  const nodes = graphNodes(null).filter(n => n?.type === TYPE);
  if (!nodes.length) return;
  for (const node of nodes) {
    if (!node._dsGsDomBound) patchNode(node);

    const sig = groupsOf(node).map(g =>
      `${g.key}:${g.name}:${g.x}:${g.y}:${g.w}:${g.h}`
    ).join("|");

    if (sig !== node._dsGsGroupSignature) {
      node._dsGsGroupSignature = sig;
      refreshNodeUI(node);
      fitNodeHeight(node);
    } else {
      refreshNodeUI(node);
    }
  }
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    registerGearMenu();

    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const result = oldCreated ? oldCreated.apply(this, arguments) : undefined;
      patchNode(this);
      fitNodeHeight(this);
      return result;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
      const result = oldConfigure ? oldConfigure.apply(this, arguments) : undefined;
      this.flags ||= {};
      this.flags.no_title = true;
      this.title = "";
      configOf(this);

      setTimeout(() => {
        patchNode(this);
        refreshNodeUI(this);
        fitNodeHeight(this);
      }, 0);

      return result;
    };

    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function(size) {
      if (size) {
        size[0] = Math.max(MIN_WIDTH, Number(size[0]) || MIN_WIDTH);
        size[1] = calculateExactHeight(this);
      }
      const result = oldResize ? oldResize.apply(this, arguments) : undefined;
      this.size[1] = calculateExactHeight(this);
      this.setDirtyCanvas?.(true, true);
      return result;
    };

    const oldDrawBg = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function() {
      const targetH = calculateExactHeight(this);
      if (this.size && this.size[1] !== targetH) {
        this.size[1] = targetH;
      }
      return oldDrawBg ? oldDrawBg.apply(this, arguments) : undefined;
    };

    nodeType.prototype.setSize = function(size) {
      const targetH = calculateExactHeight(this);
      const w = Math.max(MIN_WIDTH, Number(size?.[0]) || MIN_WIDTH);
      this.size = [w, targetH];
      this.setDirtyCanvas?.(true, true);
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function() {
      closeSettings(this.id);
      if (oldRemoved) return oldRemoved.apply(this, arguments);
    };
  },

  nodeCreated(node) {
    if (node?.type === TYPE) {
      patchNode(node);
      fitNodeHeight(node);
    }
  },

  loadedGraphNode(node) {
    if (node?.type === TYPE) {
      patchNode(node);
      fitNodeHeight(node);
    }
  },

  async setup() {
    await installCSS();
    installGlobals();
    registerGearMenu();

    window.addEventListener("ds-theme-changed", () => {
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
