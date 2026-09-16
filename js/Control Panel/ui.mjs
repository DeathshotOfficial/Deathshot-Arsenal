import { app } from "/scripts/app.js";

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function precisionForStep(step) {
  const s = String(step ?? 1);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function formatNumber(value, step) {
  const p = precisionForStep(step);
  const n = Number(value) || 0;
  return p > 0 ? n.toFixed(p) : String(Math.round(n));
}

function iconSvg(name) {
  switch (name) {
    case "dice":
      return '<svg viewBox="0 0 24 24" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="16" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="16" r="1.4" fill="currentColor"/><circle cx="16" cy="16" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>';
    case "chevron":
      return '<svg viewBox="0 0 24 24" width="10" height="10"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    case "gear":
      return '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9.7 2.8h4.6l.7 2.2c.5.2 1 .4 1.4.8l2.2-.6 2.3 4-1.6 1.6c.1.5.1 1 0 1.5l1.6 1.6-2.3 4-2.2-.6c-.4.4-.9.6-1.4.8l-.7 2.2H9.7L9 17.9c-.5-.2-1-.4-1.4-.8l-2.2.6-2.3-4 1.6-1.6c-.1-.5-.1-1 0-1.5L3.1 9.2l2.3-4 2.2.6c.4-.4.9-.6 1.4-.8l.7-2.2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    default:
      return "";
  }
}

function pct(value, min, max) {
  if (!(max > min)) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function makeBase(control) {
  const root = document.createElement("div");
  root.className = "ds-cp-row";
  root.dataset.controlId = control.id;
  root.tabIndex = 0;

  const fill = document.createElement("div");
  fill.className = "ds-cp-fill";

  // Layer 1: text visible over unfilled track
  const trackLayer = document.createElement("div");
  trackLayer.className = "ds-cp-text-layer ds-cp-layer-track";
  const lblTrack = document.createElement("span");
  lblTrack.className = "ds-cp-label";
  lblTrack.textContent = control.name;
  const valTrack = document.createElement("span");
  valTrack.className = "ds-cp-value";
  trackLayer.append(lblTrack, valTrack);

  // Layer 2: text visible over active fill (with smart high-contrast coloring)
  const fillLayer = document.createElement("div");
  fillLayer.className = "ds-cp-text-layer ds-cp-layer-fill";
  const lblFill = document.createElement("span");
  lblFill.className = "ds-cp-label";
  lblFill.textContent = control.name;
  const valFill = document.createElement("span");
  valFill.className = "ds-cp-value";
  fillLayer.append(lblFill, valFill);

  root.append(fill, trackLayer, fillLayer);
  return { root, fill, trackLayer, fillLayer, lblTrack, valTrack, lblFill, valFill };
}

function updateRowContent(base, p, name, val) {
  base.fill.style.width = `${p}%`;
  base.trackLayer.style.clipPath = `inset(0 0 0 ${p}%)`;
  base.fillLayer.style.clipPath = `inset(0 calc(100% - ${p}%) 0 0)`;
  base.lblTrack.textContent = name;
  base.lblFill.textContent = name;
  base.valTrack.textContent = val;
  base.valFill.textContent = val;
}

function beginEditValue(rootEl, initialText, onCommit) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ds-cp-edit-input";
  input.value = initialText;
  rootEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit) onCommit(input.value);
    input.remove();
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
}

function buildSlider(control, on) {
  const base = makeBase(control);
  const { root } = base;
  root.classList.add("ds-cp-slider");

  const render = (c) => {
    const p = pct(c.value, c.min, c.max);
    updateRowContent(base, p, c.name, formatNumber(c.value, c.step));
  };
  render(control);

  let dragging = false;
  let fineOrigin = null;

  const valueFromClientX = (clientX, c, fine) => {
    const rect = root.getBoundingClientRect();
    if (fine && fineOrigin) {
      const deltaPx = clientX - fineOrigin.clientX;
      const range = c.max - c.min;
      const deltaVal = (deltaPx / Math.max(rect.width, 1)) * range * 0.15;
      return clamp(fineOrigin.value + deltaVal, c.min, c.max);
    }
    const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    return c.min + ratio * (c.max - c.min);
  };

  const snap = (v, step) => {
    if (!step) return v;
    return Math.round(v / step) * step;
  };

  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ds-cp-edit-input")) return;
    root.setPointerCapture(e.pointerId);
    dragging = true;
    fineOrigin = { clientX: e.clientX, value: on.getValue().value };
    const raw = valueFromClientX(e.clientX, on.getValue(), e.shiftKey);
    on.setValue(snap(raw, on.getValue().step));
  });
  root.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const raw = valueFromClientX(e.clientX, on.getValue(), e.shiftKey);
    on.setValue(snap(raw, on.getValue().step));
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { root.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  root.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const c = on.getValue();
    beginEditValue(root, formatNumber(c.value, c.step), (text) => {
      const n = Number(text);
      if (Number.isFinite(n)) on.setValue(clamp(n, c.min, c.max));
    });
  });

  return { root, render };
}

function buildToggle(control, on) {
  const base = makeBase(control);
  const { root } = base;
  root.classList.add("ds-cp-toggle");

  const render = (c) => {
    const p = c.value ? 100 : 0;
    const text = c.value ? (c.onLabel || "On") : (c.offLabel || "Off");
    updateRowContent(base, p, c.name, text);
    root.classList.toggle("is-on", !!c.value);
  };
  render(control);

  root.addEventListener("click", () => {
    const c = on.getValue();
    on.setValue(!c.value);
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const c = on.getValue();
      on.setValue(!c.value);
    }
  });

  return { root, render };
}

function buildCombo(control, on) {
  const base = makeBase(control);
  const { root, fill } = base;
  root.classList.add("ds-cp-combo");
  fill.style.width = "0%";

  const chevron = document.createElement("span");
  chevron.className = "ds-cp-chevron";
  chevron.innerHTML = iconSvg("chevron");
  root.appendChild(chevron);

  let menu = null;

  const closeMenu = () => {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener("pointerdown", onDocDown, true);
    window.removeEventListener("resize", closeMenu, true);
    window.removeEventListener("scroll", onWindowScroll, true);
  };
  const onDocDown = (e) => {
    if (menu && !menu.contains(e.target) && !root.contains(e.target)) closeMenu();
  };
  const onWindowScroll = (e) => {
    if (menu && (e.target === menu || (e.target?.nodeType && menu.contains(e.target)))) return;
    closeMenu();
  };

  const render = (c) => {
    updateRowContent(base, 0, c.name, String(c.value ?? ""));
  };
  render(control);

  const positionMenu = () => {
    if (!menu) return;
    const rect = root.getBoundingClientRect();
    const maxH = Math.min(180, menu.scrollHeight || 180);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < maxH && rect.top > spaceBelow;
    menu.style.left = `${Math.round(rect.left)}px`;
    menu.style.width = `${Math.round(rect.width)}px`;
    if (openUp) {
      menu.style.top = "";
      menu.style.bottom = `${Math.round(window.innerHeight - rect.top + 3)}px`;
    } else {
      menu.style.bottom = "";
      menu.style.top = `${Math.round(rect.bottom + 3)}px`;
    }
  };

  root.addEventListener("click", () => {
    if (menu) { closeMenu(); return; }
    const c = on.getValue();
    const opts = (c.allowedOptions && c.allowedOptions.length ? c.allowedOptions : c.options) || [];
    if (!opts.length) return;

    menu = document.createElement("div");
    menu.className = "ds-cp-combo-menu is-fixed";
    menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    menu.addEventListener("wheel", (ev) => ev.stopPropagation());

    try {
      const cs = getComputedStyle(root);
      for (const key of ["--ds-cp-accent", "--ds-panel", "--ds-panel-2", "--ds-border", "--ds-text", "--ds-font"]) {
        const v = cs.getPropertyValue(key);
        if (v) menu.style.setProperty(key, v.trim());
      }
    } catch (_) {}

    for (const opt of opts) {
      const item = document.createElement("div");
      item.className = "ds-cp-combo-item" + (opt === c.value ? " is-selected" : "");
      item.textContent = String(opt);
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        on.setValue(opt);
        closeMenu();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    positionMenu();
    document.addEventListener("pointerdown", onDocDown, true);
    window.addEventListener("resize", closeMenu, true);
    window.addEventListener("scroll", onWindowScroll, true);
  });

  return { root, render, destroy: closeMenu };
}

function buildSeed(control, on) {
  const base = makeBase(control);
  const { root, fill } = base;
  root.classList.add("ds-cp-seed");
  fill.style.width = "0%";

  const dice = document.createElement("button");
  dice.type = "button";
  dice.className = "ds-cp-mini-btn ds-cp-dice";
  dice.innerHTML = iconSvg("dice");
  dice.title = "New fixed seed";

  const modePill = document.createElement("button");
  modePill.type = "button";
  modePill.className = "ds-cp-mini-pill";
  modePill.title = "Toggle fixed / random";

  root.append(dice, modePill);

  const render = (c) => {
    updateRowContent(base, 0, c.name, String(Math.trunc(c.value || 0)));
    modePill.textContent = c.seedMode === "random" ? "R" : "F";
    modePill.classList.toggle("is-random", c.seedMode === "random");
  };
  render(control);

  dice.addEventListener("pointerdown", (e) => e.stopPropagation());
  dice.addEventListener("click", (e) => {
    e.stopPropagation();
    const newSeed = Math.floor(Math.random() * 0xffffffff);
    on.setValue({ value: newSeed, seedMode: "fixed" });
  });

  modePill.addEventListener("pointerdown", (e) => e.stopPropagation());
  modePill.addEventListener("click", (e) => {
    e.stopPropagation();
    const c = on.getValue();
    on.setValue({ seedMode: c.seedMode === "random" ? "fixed" : "random" });
  });

  root.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const c = on.getValue();
    beginEditValue(root, String(Math.trunc(c.value || 0)), (text) => {
      const n = Math.trunc(Number(text));
      if (Number.isFinite(n)) on.setValue({ value: Math.max(0, n), seedMode: "fixed" });
    });
  });

  return { root, render };
}

function buildText(control, on) {
  const root = document.createElement("div");
  root.className = "ds-cp-row ds-cp-text";
  root.dataset.controlId = control.id;

  const label = document.createElement("div");
  label.className = "ds-cp-text-label";

  const area = document.createElement("textarea");
  area.className = "ds-cp-textarea";
  area.spellcheck = false;
  area.rows = 2;

  root.append(label, area);

  const render = (c) => {
    label.textContent = c.name;
    if (document.activeElement !== area) area.value = c.value ?? "";
  };
  render(control);

  area.addEventListener("pointerdown", (e) => e.stopPropagation());
  area.addEventListener("input", () => on.setValue(area.value, { grow: true }));
  area.addEventListener("change", () => on.setValue(area.value));

  return { root, render };
}

export function createControlRow(control, on) {
  switch (control.type) {
    case "toggle": return buildToggle(control, on);
    case "combo": return buildCombo(control, on);
    case "seed": return buildSeed(control, on);
    case "text": return buildText(control, on);
    case "int":
    case "float":
    case "auto":
    default: return buildSlider(control, on);
  }
}

export function createAddButton(onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ds-cp-add";
  btn.textContent = "+ Add Control";
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

export function createGearButton(onClick) {
  return null;
}

export function showToast(root, message) {
  const toast = document.createElement("div");
  toast.className = "ds-cp-toast";
  toast.textContent = message;
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

// ------------------------------------------------------------------
// Per-row widget geometry and layout
// ------------------------------------------------------------------
export const ROW_H = 28;
export const ROW_GAP = 6;
export const ADD_H = 26;
export const MIN_W = 220;
export const DEFAULT_W = 260;
export const ZW = "\u200b";

export function rowHeightForControl(control) {
  return control?.type === "text" ? 54 : ROW_H;
}

function removeWidget(node, widget) {
  if (!widget) return;
  const i = node.widgets?.indexOf(widget) ?? -1;
  if (i >= 0) node.widgets.splice(i, 1);
  try { widget.onRemove?.(); } catch (_) {}
  try { widget.element?.remove?.(); } catch (_) {}
}

function applyAccent(node) {
  const accent = node?.properties?.ds_cp_accent;
  const targets = [...(node?._dsRowWidgets || [])];
  if (node?._dsAddWidget) targets.push(node._dsAddWidget);
  for (const w of targets) {
    const el = w?.element;
    if (!el?.style) continue;
    if (accent) {
      el.style.setProperty("--ds-cp-accent-override", accent);
      if (window.DSGlobalTheme?.getOnAccentTextColor) {
        el.style.setProperty("--ds-cp-fill-text", window.DSGlobalTheme.getOnAccentTextColor(accent));
        el.style.setProperty("--ds-cp-fill-shadow", window.DSGlobalTheme.getOnAccentShadow(accent));
      }
    } else {
      el.style.removeProperty("--ds-cp-accent-override");
      el.style.removeProperty("--ds-cp-fill-text");
      el.style.removeProperty("--ds-cp-fill-shadow");
    }
  }
}

function makeRowWidget(node, index, built) {
  const rowH = rowHeightForControl(node._dsControls[index]);
  const row = built.root;
  row.style.height = `${rowH}px`;
  row.style.minHeight = `${rowH}px`;
  row.style.boxSizing = "border-box";

  const w = node.addDOMWidget(`ds_cp_row_${index + 1}`, "ds_cp_row", row, {
    serialize: false,
    getMinHeight: () => rowH,
  });
  w.serialize = false;
  w.computeSize = () => [node.size?.[0] || DEFAULT_W, rowH];
  w.computeLayoutSize = undefined;
  return w;
}

export function syncRowWidgets(node, buildRow, onAdd, onGear) {
  const controls = node._dsControls || [];
  const oldRows = node._dsRowWidgets || [];
  for (const built of node._dsRows || []) { try { built?.destroy?.(); } catch (_) {} }
  for (const w of oldRows) removeWidget(node, w);
  if (node._dsAddWidget) { removeWidget(node, node._dsAddWidget); node._dsAddWidget = null; }
  if (node._dsGearWidget) { removeWidget(node, node._dsGearWidget); node._dsGearWidget = null; }

  node._dsRows = [];
  node._dsRowWidgets = [];

  for (let i = 0; i < controls.length; i++) {
    const built = buildRow(i);
    const w = makeRowWidget(node, i, built);
    node._dsRows.push(built);
    node._dsRowWidgets.push(w);
  }

  const add = createAddButton(onAdd);
  add.style.height = `${ADD_H}px`;
  add.style.minHeight = `${ADD_H}px`;
  add.style.boxSizing = "border-box";

  node._dsAddWidget = node.addDOMWidget("ds_cp_add", "ds_cp_add", add, {
    serialize: false,
    getMinHeight: () => ADD_H,
  });
  node._dsAddWidget.serialize = false;
  node._dsAddWidget.computeSize = () => [node.size?.[0] || DEFAULT_W, ADD_H];
  node._dsAddWidget.computeLayoutSize = undefined;

  applyAccent(node);

  node._dsGearWidget = null;
  node._dsOnGear = null;
  releaseGearNode(node);
}

// ------------------------------------------------------------------
// Height calculations & Safe node sizing (Pixaroma pattern)
// ------------------------------------------------------------------
export function bodyHeight(node) {
  const controls = node._dsControls || [];
  let h = 0;
  for (let i = 0; i < controls.length; i++) {
    h += rowHeightForControl(controls[i]) + ROW_GAP;
  }
  h += ADD_H + 12;
  return h;
}

export function fitNode(node) {
  if (app.configuringGraph) return;
  const w = Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W);
  if (isVueNodes()) {
    node.setSize?.([w, bodyHeight(node) + 52]);
  } else {
    node.setSize?.([w, bodyHeight(node)]);
  }
  scheduleAlign(node);
}

// ------------------------------------------------------------------
// Title-bar gear tracking
// ------------------------------------------------------------------
// Internal gear tracking removed in favor of DS Toolbar Gear
// ------------------------------------------------------------------
export function isVueNodes() {
  return !!(
    window.LiteGraph?.vueNodesMode ||
    document.querySelector(".lg-node") ||
    document.querySelector(".vue-canvas")
  );
}

export function ensureGearHost(node, onGear) {
  return null;
}

export function releaseGearNode(node) {
  if (node?._dsGearHost) {
    try { node._dsGearHost.remove(); } catch (_) {}
    node._dsGearHost = null;
  }
}

// Clean up any stale orphaned gear hosts in document.body from past runs/reloads
try {
  document.querySelectorAll(".ds-cp-gear-host, .ds-cp-gear").forEach((el) => {
    try { el.remove(); } catch (_) {}
  });
} catch (_) {}

// ------------------------------------------------------------------
// Output alignment logic (Direct Pixaroma Implementation)
// ------------------------------------------------------------------
export function alignOutputsLegacy(node) {
  const rows = node._dsRowWidgets || [];
  if (!node.outputs || !rows.length) return;
  for (let i = 0; i < node.outputs.length && i < rows.length; i++) {
    const w = rows[i];
    const y = w?.y;
    if (!Number.isFinite(y)) continue;
    const margin = Number.isFinite(w.margin) ? w.margin : 10;
    const pos = node.outputs[i].pos;
    const nx = node.size[0];
    const ny = y + margin + ROW_H * 0.5;
    if (!pos || pos[0] !== nx || Math.abs(pos[1] - ny) > 0.5) {
      node.outputs[i].pos = [nx, ny];
    }
  }
}

function isAligned(rowEls, outs) {
  if (outs.length !== rowEls.length) return false;
  const rr = rowEls[0].getBoundingClientRect();
  const dd = outs[0].getBoundingClientRect();
  return Math.abs((rr.top + rr.height / 2) - (dd.top + dd.height / 2)) < 1;
}

export function alignOutputsNodes2(node) {
  if (!isVueNodes()) return;
  try {
    const el = document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
    if (!el) return;
    const rowEls = el.querySelectorAll(".ds-cp-row");
    const outs = el.querySelectorAll(".lg-slot--output");
    if (!rowEls.length || !outs.length) return;
    if (isAligned(rowEls, outs)) return;

    const col = outs[0].parentElement;
    const block = col?.parentElement;
    if (!col || !block) return;

    block.style.marginBottom = "0px";
    col.style.transform = "none";
    col.style.gap = "0px";
    block.style.pointerEvents = "none";
    col.style.pointerEvents = "auto";

    const rowH = rowEls[0].offsetHeight || ROW_H;
    const toLayout = rowH / (rowEls[0].getBoundingClientRect().height || rowH);

    const pitch = rowEls.length > 1
      ? (rowEls[1].getBoundingClientRect().top - rowEls[0].getBoundingClientRect().top) * toLayout
      : rowH + ROW_GAP;

    for (const o of outs) {
      o.style.height = `${rowH}px`;
      o.style.minHeight = `${rowH}px`;
      o.style.marginBottom = `${Math.max(0, pitch - rowH)}px`;
    }

    block.style.marginBottom = `${-block.offsetHeight}px`;

    const delta =
      (rowEls[0].getBoundingClientRect().top - outs[0].getBoundingClientRect().top) * toLayout;
    col.style.transform = `translateY(${delta}px)`;
  } catch (_) {}
}

export function scheduleAlign(node) {
  if (!node) return;
  const run = () => {
    if (node._dsRemoved) return;
    if (isVueNodes()) alignOutputsNodes2(node);
    else alignOutputsLegacy(node);
  };
  run();
  requestAnimationFrame(() => {
    run();
    setTimeout(run, 120);
  });
}

export function watchAlign(node) {
  if (!isVueNodes() || node._dsAlignPoll) return;
  node._dsAlignPoll = setInterval(() => {
    if (node._dsRemoved) {
      clearInterval(node._dsAlignPoll);
      node._dsAlignPoll = null;
      return;
    }
    alignOutputsNodes2(node);
  }, 350);
  scheduleAlign(node);
}

export function unwatchAlign(node) {
  if (node?._dsAlignPoll) clearInterval(node._dsAlignPoll);
  node._dsAlignPoll = null;
}