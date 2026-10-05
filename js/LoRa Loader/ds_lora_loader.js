import { app } from "/scripts/app.js";
import {
  Card,
  Stepper,
  Toggle,
  Button,
  Dropdown,
  protectDSResizeCorners,
  installDSUI,
  DSIcon,
} from "../UIElements/index.js";

installDSUI();

const MAX_LORAS = 32;
const STORAGE_KEY = "DS_LoRaLoader.settings.v1";
const CSS_HREF = "/extensions/DeathshotArsenal/LoRa%20Loader/ds_lora_loader.css?v=56";

const existingLink = document.querySelector(`link[href*="ds_lora_loader.css"]`);
if (existingLink) {
  existingLink.href = CSS_HREF;
} else {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

const DEFAULT_SETTINGS = {
  defaultStrength: 0.5,
  strengthStep: 0.05,
  separateClipStrength: false,
  enableVideoStrength: true,
  enableAudioStrength: true,
  triggerSeparator: ", ",
  memoryMode: "Standard",
  siteMode: "Standard",
  hideExtension: true,
  civitaiLookup: true,
  showThumbnails: true,
  civitaiApiKey: "",
  allowNsfwPreviews: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function defaultRow(settings) {
  const def = Number(settings?.defaultStrength) || 0.5;
  return {
    id: `lora-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    modelStrength: def,
    clipStrength: def,
    videoStrength: 1.0,
    audioStrength: 1.0,
    enabled: true,
    selectedTriggers: [],
  };
}

function cleanRow(row, settings, i) {
  const def = Number(settings?.defaultStrength) || 0.5;
  return {
    id: row?.id || `lora-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    name: typeof row?.name === "string" ? row.name : "",
    modelStrength: Number.isFinite(row?.modelStrength) ? Number(row.modelStrength) : (Number.isFinite(row?.strength) ? Number(row.strength) : def),
    clipStrength: Number.isFinite(row?.clipStrength) ? Number(row.clipStrength) : (Number.isFinite(row?.strength) ? Number(row.strength) : def),
    videoStrength: Number.isFinite(row?.videoStrength) ? Number(row.videoStrength) : 1.0,
    audioStrength: Number.isFinite(row?.audioStrength) ? Number(row.audioStrength) : 1.0,
    enabled: row?.enabled !== false,
    selectedTriggers: Array.isArray(row?.selectedTriggers) ? row.selectedTriggers.map(String) : [],
  };
}

function decodeState(raw) {
  const defSettings = loadSettings();
  if (!raw) {
    return { masterEnabled: true, mode: "image", rows: [], settings: defSettings };
  }
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { masterEnabled: true, mode: "image", rows: [], settings: defSettings };
    }
  }
  if (!obj || typeof obj !== "object") {
    return { masterEnabled: true, mode: "image", rows: [], settings: defSettings };
  }
  const s = { ...defSettings, ...(obj.settings || {}) };
  return {
    masterEnabled: obj.masterEnabled !== false,
    mode: obj.mode === "video" ? "video" : "image",
    rows: Array.isArray(obj.rows) ? obj.rows.map((r, i) => cleanRow(r, s, i)) : [],
    settings: s,
  };
}

function compileTriggers(node) {
  if (!node?._dsLora) return "";
  if (!node._dsLora.masterEnabled) return "";
  const sep = node._dsLora.settings?.triggerSeparator || ", ";
  const parts = [];
  for (const r of node._dsLora.rows || []) {
    if (!r.enabled) continue;
    for (const t of r.selectedTriggers || []) {
      const trimmed = String(t).trim();
      if (trimmed && !parts.includes(trimmed)) parts.push(trimmed);
    }
  }
  return parts.join(sep);
}

function notifyDownstream(node) {
  const graph = node.graph || app?.graph;
  if (!graph || graph.is_loading) return;
  const triggerStr = compileTriggers(node);
  node.triggers = triggerStr;
  node.lora_triggers = triggerStr;

  if (node.outputs) {
    for (let i = 0; i < node.outputs.length; i++) {
      if (node.outputs[i].name === "triggers") {
        node.outputs[i]._data = triggerStr;
        node.outputs[i].value = triggerStr;
      }
    }
  }
  try {
    node.setDirtyCanvas?.(true, true);
    graph.setDirtyCanvas?.(true, true);
  } catch {}
}

function serialize(node) {
  if (!node?._dsLora) return;
  const graph = node.graph || app?.graph;
  if (graph?.is_loading) return;

  const triggerStr = compileTriggers(node);
  const state = {
    version: 1,
    mode: node._dsLora.mode || "image",
    masterEnabled: node._dsLora.masterEnabled,
    rows: (node._dsLora.rows || []).map(clone),
    settings: { ...loadSettings(), ...node._dsLora.settings, civitaiApiKey: undefined },
  };
  delete state.settings.civitaiApiKey;

  node.properties = node.properties || {};
  node.properties.ds_lora_state = state;
  node.properties.triggers = triggerStr;
  node.properties.lora_triggers = triggerStr;
  node.triggers = triggerStr;
  node.lora_triggers = triggerStr;

  if (node.outputs) {
    for (let i = 0; i < node.outputs.length; i++) {
      if (node.outputs[i].name === "triggers") {
        node.outputs[i]._data = triggerStr;
        node.outputs[i].value = triggerStr;
      }
    }
  }

  const hidden = ensureHiddenWidget(node);
  if (hidden) hidden.value = JSON.stringify(state);

  notifyDownstream(node);
  try {
    node.setDirtyCanvas?.(true, true);
    graph?.afterChange?.();
  } catch {}
}

function ensureHiddenWidget(node) {
  let w = node.widgets?.find((x) => x.name === "LoaderState");
  if (!w) {
    w = {
      name: "LoaderState",
      type: "hidden",
      value: "{}",
      serialize: true,
      computeSize: () => [0, -4],
      draw: () => {},
    };
    node.widgets ||= [];
    node.widgets.push(w);
  }
  w.type = "hidden";
  w.hidden = true;
  w.options = w.options || {};
  w.options.hidden = true;
  w.computeSize = () => [0, -4];
  w.draw = () => {};
  w.serialize = true;
  w.y = -9999;
  for (const el of [w.inputEl, w.element]) {
    if (el?.style) {
      el.style.display = "none";
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
    }
    try {
      el?.remove?.();
    } catch (_) {}
  }
  w.inputEl = null;
  w.element = null;
  return w;
}

function displayName(name, hideExtension) {
  if (!name) return "Select a LoRA…";
  return hideExtension ? name.replace(/\.safetensors$/i, "") : name;
}

async function getLoras() {
  try {
    const r = await fetch("/ds/loras", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[DS LoRa Loader] failed to list loras:", e);
    return [];
  }
}

async function fetchMetadata(node, row, forceOnline = false) {
  if (!row.name) return { ok: false, error: "Choose a LoRA first.", trainedWords: [] };
  const settings = { ...DEFAULT_SETTINGS, ...loadSettings(), ...node._dsLora.settings };
  try {
    const r = await fetch("/ds/lora_metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: row.name,
        apiKey: settings.civitaiApiKey || "",
        forceOnline,
        allowNsfw: !!settings.allowNsfwPreviews,
        siteMode: settings.siteMode || "Standard",
      }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e), trainedWords: [], source: "offline" };
  }
}

function calculateCardHeight(node) {
  const rows = node?._dsLora?.rows || [];
  const rowCount = Math.max(1, rows.length);
  const rowsHeight = rowCount * 34 + Math.max(0, rowCount - 1) * 5;
  return 56 + rowsHeight;
}

function calculateNodeHeight(node) {
  const cardHeight = calculateCardHeight(node);
  return 96 + cardHeight + 5;
}

function resizeNode(node) {
  if (!node) return;
  const minW = node._dsLora?.mode === "video" ? 440 : 380;
  const w = Math.max(minW, Number(node.size?.[0]) || minW);
  const targetH = calculateNodeHeight(node);
  const cardH = calculateCardHeight(node);

  node.min_size = [minW, targetH];
  node.size[0] = w;
  node.size[1] = targetH;

  if (typeof node.setSize === "function") {
    try {
      node.setSize([w, targetH]);
    } catch {}
  }
  node.size[0] = w;
  node.size[1] = targetH;

  if (node._dsLora?.addWidget) {
    node._dsLora.addWidget.computeSize = () => [minW, 36];
  }
  if (node._dsLora?.cardWidget) {
    node._dsLora.cardWidget.computeSize = () => [minW, cardH];
  }

  try {
    node.setDirtyCanvas?.(true, true);
    (node.graph || app?.graph)?.setDirtyCanvas?.(true, true);
  } catch {}
}

function placeSidePanel(panel, anchor, preferred = "right") {
  const rect = anchor?.getBoundingClientRect?.();
  const width = panel.offsetWidth || 440;
  const gap = 10;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let side = preferred;
  let left = rect ? rect.right + gap : Math.max(12, (viewportW - width) / 2);
  if (rect && left + width > viewportW - 10) {
    side = "left";
    left = rect.left - width - gap;
  }
  if (left < 10) {
    side = "right";
    left = rect ? rect.right + gap : 10;
    if (left + width > viewportW - 10) left = Math.max(10, viewportW - width - 10);
  }
  const panelH = panel.offsetHeight || 420;
  let top = rect ? rect.top : 20;
  if (top + panelH > viewportH - 12) {
    top = Math.max(12, viewportH - panelH - 12);
  }
  if (top < 12) top = 12;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.dataset.side = side;
}

function installOutsideClose(panel, anchor, onClose) {
  const handler = (e) => {
    if (panel.contains(e.target) || anchor?.contains?.(e.target)) return;
    onClose();
    document.removeEventListener("pointerdown", handler, true);
  };
  requestAnimationFrame(() => document.addEventListener("pointerdown", handler, true));
  return handler;
}

function registerGearMenu() {
  if (typeof window !== "undefined" && window.DSGearMenu?.register) {
    const gearConfig = {
      tooltip: "DS LoRa Loader Settings",
      onClick: (node, canvas, ev) => {
        renderSettingsModal(node, ev?.currentTarget || ev?.target);
      },
    };
    window.DSGearMenu.register("DS_LoRaLoader", gearConfig);
    window.DSGearMenu.register("DS LoRa Loader", gearConfig);
  }
}

registerGearMenu();

/* ========================================================================= */
/* LoRA Item Row (Matching Generation Hub row design & UI Elements)          */
/* ========================================================================= */
function renderRow(node, row, index, allLoras) {
  const loraRow = document.createElement("div");
  loraRow.className = "ds-lora-row" + (row.enabled ? "" : " is-off");
  loraRow.dataset.id = row.id;
  loraRow.draggable = true;

  // 1. Drag Handle
  const dragHandle = document.createElement("span");
  dragHandle.className = "ds-lora-drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.appendChild(DSIcon("grip-vertical", { size: 14 }));

  // 2. LoRA Name Dropdown (UIElements Dropdown)
  const loraOptions = (allLoras || []).map((name) => ({
    id: name,
    label: displayName(name, node._dsLora?.settings?.hideExtension),
  }));

  const loraDropdown = Dropdown({
    value: row.name || "",
    options: loraOptions,
    placeholder: "Select LoRA...",
    searchable: true,
    compact: true,
    onChange: (val) => {
      row.name = val;
      row.selectedTriggers = [];
      saveStateAndSync(node);
      node._dsRender();
    },
  });

  // 3. Strength Stepper(s)
  const isVideo = node._dsLora?.mode === "video";
  const stepVal = Number(node._dsLora?.settings?.strengthStep) || 0.05;
  const showV = node._dsLora?.settings?.enableVideoStrength !== false;
  const showA = node._dsLora?.settings?.enableAudioStrength !== false;

  let steppersWrap;
  if (isVideo) {
    steppersWrap = document.createElement("div");
    steppersWrap.className = "ds-lora-video-steppers";

    const createSubStepper = (prefix, val, min, max, onChange, title) => {
      const wrap = document.createElement("div");
      wrap.className = "ds-lora-sub-stepper";
      if (title) wrap.title = title;

      const pfx = document.createElement("span");
      pfx.className = "ds-lora-sub-label";
      pfx.textContent = prefix;
      wrap.appendChild(pfx);

      const st = Stepper({
        min,
        max,
        step: stepVal,
        value: val,
        className: "ds-ui-stepper",
        onChange,
      });
      wrap.appendChild(st.root);
      return wrap;
    };

    const sStepper = createSubStepper(
      "S",
      row.modelStrength ?? 1.0,
      -10.0,
      10.0,
      (val) => {
        row.modelStrength = Math.round(val * 100) / 100;
        row.clipStrength = row.modelStrength;
        saveStateAndSync(node);
      },
      "Strength (overall strength)"
    );
    steppersWrap.appendChild(sStepper);

    if (showV) {
      const vStepper = createSubStepper(
        "V",
        row.videoStrength ?? 1.0,
        0.0,
        10.0,
        (val) => {
          row.videoStrength = Math.round(val * 100) / 100;
          saveStateAndSync(node);
        },
        "Video Strength"
      );
      steppersWrap.appendChild(vStepper);
    }

    if (showA) {
      const aStepper = createSubStepper(
        "A",
        row.audioStrength ?? 1.0,
        0.0,
        10.0,
        (val) => {
          row.audioStrength = Math.round(val * 100) / 100;
          saveStateAndSync(node);
        },
        "Audio Strength"
      );
      steppersWrap.appendChild(aStepper);
    }
  } else {
    steppersWrap = Stepper({
      min: -10.0,
      max: 10.0,
      step: stepVal,
      value: row.modelStrength ?? 0.5,
      className: "ds-ui-stepper",
      onChange: (val) => {
        row.modelStrength = Math.round(val * 100) / 100;
        row.clipStrength = row.modelStrength;
        saveStateAndSync(node);
      },
    }).root;
  }

  // 4. CivitAI Info Button (UIElements Button)
  const infoBtn = Button({
    icon: "info",
    compact: true,
    className: "ds-lora-info-btn" + (row.selectedTriggers?.length ? " has-triggers" : ""),
    tooltip: "Trigger Words & Metadata",
    onClick: (e) => {
      e.stopPropagation();
      openTriggerModal(node, row, infoBtn.root);
    },
  });

  // 5. On/Off Toggle Switch (UIElements Toggle)
  const toggle = Toggle({
    checked: Boolean(row.enabled),
    onChange: (checked) => {
      row.enabled = checked;
      loraRow.classList.toggle("is-off", !checked);
      saveStateAndSync(node);
      updateSubtitle(node);
    },
  });

  // 6. Delete Button (UIElements Button)
  const delBtn = Button({
    icon: "trash-2",
    compact: true,
    tooltip: "Delete LoRA",
    onClick: (e) => {
      e.stopPropagation();
      if (node._dsLora.rows.length > 1) {
        node._dsLora.rows.splice(index, 1);
        saveStateAndSync(node);
        node._dsRender();
        resizeNode(node);
      }
    },
  });

  loraRow.append(dragHandle, loraDropdown.root, steppersWrap, infoBtn.root, toggle.root, delBtn.root);

  // Drag & drop reordering
  loraRow.ondragstart = (e) => {
    node._dsLora.dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.effectAllowed = "move";
    }
  };
  loraRow.ondragover = (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    loraRow.classList.add("is-dragover");
  };
  loraRow.ondragenter = (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  };
  loraRow.ondragleave = (e) => {
    if (!loraRow.contains(e.relatedTarget)) {
      loraRow.classList.remove("is-dragover");
    }
  };
  loraRow.ondrop = (e) => {
    e.preventDefault();
    loraRow.classList.remove("is-dragover");
    const from = node._dsLora.dragIndex;
    if (!Number.isInteger(from) || from === index) return;
    const [moved] = node._dsLora.rows.splice(from, 1);
    node._dsLora.rows.splice(index, 0, moved);
    saveStateAndSync(node);
    node._dsRender();
  };
  loraRow.ondragend = () => {
    node._dsLora.dragIndex = null;
    node._dsLora.dom?.querySelectorAll(".ds-lora-row").forEach((r) => r.classList.remove("is-dragover"));
  };

  return loraRow;
}

function saveStateAndSync(node) {
  serialize(node);
}

function updateSubtitle(node) {
  const subtitle = node._dsLora?.card?.querySelector(".ds-lora-subtitle");
  if (!subtitle) return;
  const total = (node._dsLora?.rows || []).length;
  const active = node._dsLora?.masterEnabled
    ? (node._dsLora?.rows || []).filter((r) => r.enabled !== false).length
    : 0;
  subtitle.textContent = `${active}/${total} Active`;
  subtitle.classList.toggle("is-bypassed", !node._dsLora?.masterEnabled);
}

function renderCard(node) {
  const card = node._dsLora?.card;
  if (!card) return;
  card.textContent = "";

  const isMasterOn = Boolean(node._dsLora.masterEnabled);
  card.classList.toggle("is-master-off", !isMasterOn);

  // Card Header: Master switch on left, Mode tabs on right
  const cardHead = document.createElement("div");
  cardHead.className = "ds-lora-card-head";

  const headLeft = document.createElement("div");
  headLeft.className = "ds-lora-head-left";

  const masterToggle = Toggle({
    label: "ALL",
    checked: isMasterOn,
    onChange: (checked) => {
      node._dsLora.masterEnabled = checked;
      node._dsRender();
      serialize(node);
    },
  });

  const totalRows = (node._dsLora.rows || []).length;
  const activeRows = isMasterOn
    ? (node._dsLora.rows || []).filter((r) => r.enabled !== false).length
    : 0;

  const countBadge = document.createElement("span");
  countBadge.className = "ds-lora-subtitle" + (!isMasterOn ? " is-bypassed" : "");
  countBadge.textContent = `${activeRows}/${totalRows} Active`;

  headLeft.append(masterToggle.root, countBadge);

  const headRight = document.createElement("div");
  headRight.className = "ds-lora-head-right";

  const modeGroup = document.createElement("div");
  modeGroup.className = "ds-lora-modes";

  const isImage = node._dsLora.mode !== "video";
  const imgBtn = document.createElement("button");
  imgBtn.type = "button";
  imgBtn.className = "ds-lora-mode-btn" + (isImage ? " is-active" : "");
  imgBtn.append(DSIcon("image", { size: 12 }), document.createTextNode("Image"));
  imgBtn.onclick = () => {
    if (node._dsLora.mode !== "image") {
      node._dsLora.mode = "image";
      node._dsRender();
      resizeNode(node);
      serialize(node);
    }
  };

  const vidBtn = document.createElement("button");
  vidBtn.type = "button";
  vidBtn.className = "ds-lora-mode-btn" + (!isImage ? " is-active" : "");
  vidBtn.append(DSIcon("film", { size: 12 }), document.createTextNode("Video"));
  vidBtn.onclick = () => {
    if (node._dsLora.mode !== "video") {
      node._dsLora.mode = "video";
      node._dsRender();
      resizeNode(node);
      serialize(node);
    }
  };

  modeGroup.append(imgBtn, vidBtn);
  headRight.appendChild(modeGroup);

  cardHead.append(headLeft, headRight);
  card.appendChild(cardHead);

  // Rows List
  const rowsContainer = document.createElement("div");
  rowsContainer.className = "ds-lora-rows";

  if (!node._dsLora.rows || node._dsLora.rows.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "ds-lora-empty-state";
    const emptyAddBtn = Button({
      icon: "plus",
      label: "Add First LoRA",
      compact: true,
      onClick: () => {
        node._dsLora.rows.push(defaultRow(node._dsLora.settings));
        node._dsRender();
        resizeNode(node);
        serialize(node);
      },
    });
    emptyState.appendChild(emptyAddBtn.root);
    rowsContainer.appendChild(emptyState);
  } else {
    for (let i = 0; i < node._dsLora.rows.length; i++) {
      const rowEl = renderRow(node, node._dsLora.rows[i], i, node._dsLora.allLoras);
      rowsContainer.appendChild(rowEl);
    }
  }

  card.appendChild(rowsContainer);

  requestAnimationFrame(() => {
    resizeNode(node);
  });
}

/* ========================================================================= */
/* Settings Modal: True Steppers (arrows), Reliable Selects, No Horiz Scroll  */
/* ========================================================================= */
function renderSettingsModal(node, anchorEl) {
  const settings = { ...DEFAULT_SETTINGS, ...loadSettings(), ...node._dsLora.settings };
  const modal = document.createElement("div");
  modal.className = "ds-lora-popover-host";

  const panel = document.createElement("div");
  panel.className = "ds-lora-settings ds-lora-side-panel";

  const head = document.createElement("div");
  head.className = "ds-lora-modal-head";

  const titleGroup = document.createElement("div");
  titleGroup.className = "ds-lora-modal-title-group";
  titleGroup.append(DSIcon("settings", { size: 14 }), document.createTextNode("DS LoRa Loader — Settings"));

  const closeBtn = Button({
    icon: "x",
    compact: true,
    tooltip: "Close",
    onClick: () => modal.remove(),
  });
  head.append(titleGroup, closeBtn.root);

  const body = document.createElement("div");
  body.className = "ds-lora-settings-body";

  const createRow = (label, element) => {
    const row = document.createElement("div");
    row.className = "ds-lora-setting-row";
    const lbl = document.createElement("span");
    lbl.className = "ds-lora-setting-label";
    lbl.textContent = label;
    row.append(lbl, element);
    return row;
  };

  // Helper for clean true stepper with up/down arrows (compact, no +- buttons)
  const createArrowStepper = (val, step, min, max, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "ds-lora-spin-wrap";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "ds-lora-spin-input";
    input.value = Number(val).toFixed(step < 0.01 ? 3 : 2);
    input.step = String(step);
    input.min = String(min);
    input.max = String(max);

    const controls = document.createElement("div");
    controls.className = "ds-lora-spin-controls";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "ds-lora-spin-btn";
    up.appendChild(DSIcon("chevron-up", { size: 9 }));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "ds-lora-spin-btn";
    down.appendChild(DSIcon("chevron-down", { size: 9 }));

    const commit = (newVal) => {
      const clamped = Math.min(max, Math.max(min, Number(newVal) || 0));
      const rounded = Math.round(clamped * 1000) / 1000;
      input.value = rounded.toFixed(step < 0.01 ? 3 : 2);
      onChange(rounded);
    };

    let timer = null;
    let interval = null;
    const startRepeat = (delta) => {
      commit(Number(input.value) + delta);
      timer = setTimeout(() => {
        interval = setInterval(() => {
          commit(Number(input.value) + delta);
        }, 80);
      }, 320);
    };
    const stopRepeat = () => {
      clearTimeout(timer);
      clearInterval(interval);
      timer = null;
      interval = null;
    };

    up.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startRepeat(step);
    });
    up.addEventListener("pointerup", stopRepeat);
    up.addEventListener("pointerleave", stopRepeat);

    down.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startRepeat(-step);
    });
    down.addEventListener("pointerup", stopRepeat);
    down.addEventListener("pointerleave", stopRepeat);

    input.onchange = () => commit(Number(input.value));

    controls.append(up, down);
    wrap.append(input, controls);
    return wrap;
  };

  // 1. Default strength
  const defStrStepper = createArrowStepper(
    settings.defaultStrength ?? 0.5,
    Number(settings.strengthStep) || 0.05,
    -10,
    10,
    (v) => { settings.defaultStrength = v; }
  );
  body.appendChild(createRow("Default strength (new LoRAs)", defStrStepper));

  // 2. Strength step
  const stepStepper = createArrowStepper(
    settings.strengthStep ?? 0.05,
    0.01,
    0.001,
    5,
    (v) => { settings.strengthStep = v; }
  );
  body.appendChild(createRow("Strength step (arrows)", stepStepper));

  // 3. Separator
  const sepInput = document.createElement("input");
  sepInput.type = "text";
  sepInput.className = "ds-lora-setting-input";
  sepInput.value = settings.triggerSeparator || ", ";
  body.appendChild(createRow("Trigger words separator", sepInput));

  // 4. Boolean Toggles
  const sepClipToggle = Toggle({
    label: "Separate model / clip strength",
    checked: Boolean(settings.separateClipStrength),
    onChange: (c) => { settings.separateClipStrength = c; },
  });
  body.appendChild(sepClipToggle.root);

  const videoStrengthToggle = Toggle({
    label: "Show video strength (V) in video mode",
    checked: settings.enableVideoStrength !== false,
    onChange: (c) => {
      settings.enableVideoStrength = c;
      node._dsLora.settings.enableVideoStrength = c;
      node._dsRender();
    },
  });
  body.appendChild(videoStrengthToggle.root);

  const audioStrengthToggle = Toggle({
    label: "Show audio strength (A) in video mode",
    checked: settings.enableAudioStrength !== false,
    onChange: (c) => {
      settings.enableAudioStrength = c;
      node._dsLora.settings.enableAudioStrength = c;
      node._dsRender();
    },
  });
  body.appendChild(audioStrengthToggle.root);

  const hideExtToggle = Toggle({
    label: "Hide .safetensors extension",
    checked: Boolean(settings.hideExtension),
    onChange: (c) => { settings.hideExtension = c; },
  });
  body.appendChild(hideExtToggle.root);

  const lookupToggle = Toggle({
    label: "Civitai lookup button",
    checked: Boolean(settings.civitaiLookup),
    onChange: (c) => { settings.civitaiLookup = c; },
  });
  body.appendChild(lookupToggle.root);

  const thumbToggle = Toggle({
    label: "Show preview thumbnails",
    checked: Boolean(settings.showThumbnails),
    onChange: (c) => { settings.showThumbnails = c; },
  });
  body.appendChild(thumbToggle.root);

  const nsfwToggle = Toggle({
    label: "Allow adult preview images",
    checked: Boolean(settings.allowNsfwPreviews),
    onChange: (c) => { settings.allowNsfwPreviews = c; },
  });
  body.appendChild(nsfwToggle.root);

  // 5. Reliable Themed Selects (Never Dead)
  const createThemedSelect = (val, options, onChange) => {
    const select = document.createElement("select");
    select.className = "ds-lora-setting-select";
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.label;
      if (opt.id === val) el.selected = true;
      select.appendChild(el);
    }
    select.onchange = () => onChange(select.value);
    return select;
  };

  const memSelect = createThemedSelect(
    settings.memoryMode || "Standard",
    [
      { id: "Standard", label: "Standard" },
      { id: "Fast", label: "Fast" },
      { id: "Lowest", label: "Lowest" },
    ],
    (v) => { settings.memoryMode = v; }
  );
  body.appendChild(createRow("LoRa memory use", memSelect));

  const siteSelect = createThemedSelect(
    settings.siteMode || "Standard",
    [
      { id: "Standard", label: "Standard" },
      { id: "Unrestricted", label: "Unrestricted" },
    ],
    (v) => { settings.siteMode = v; }
  );
  body.appendChild(createRow("Ask this site first", siteSelect));

  // 6. Civitai API Key
  const keyInput = document.createElement("input");
  keyInput.type = "password";
  keyInput.className = "ds-lora-setting-input";
  keyInput.placeholder = "optional";
  keyInput.value = loadSettings().civitaiApiKey || "";
  body.appendChild(createRow("Civitai API key (saved locally)", keyInput));

  // Footer Save Button
  const foot = document.createElement("div");
  foot.className = "ds-lora-modal-foot";

  const saveBtn = Button({
    icon: "save",
    label: "Save Settings",
    variant: "primary",
    onClick: () => {
      settings.triggerSeparator = sepInput.value;
      settings.civitaiApiKey = keyInput.value;
      saveSettings(settings);
      node._dsLora.settings = { ...settings };
      node._dsRender();
      resizeNode(node);
      serialize(node);
      modal.remove();
    },
  });
  foot.appendChild(saveBtn.root);

  panel.append(head, body, foot);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  requestAnimationFrame(() => placeSidePanel(panel, anchorEl || node._dsLora?.card, "right"));
  installOutsideClose(panel, anchorEl || node._dsLora?.card, () => modal.remove());
}

/* ========================================================================= */
/* CivitAI Trigger Words Modal                                               */
/* ========================================================================= */
function openTriggerModal(node, row, anchorEl) {
  const settings = { ...DEFAULT_SETTINGS, ...loadSettings(), ...node._dsLora.settings };
  const modal = document.createElement("div");
  modal.className = "ds-lora-popover-host";

  const panel = document.createElement("div");
  panel.className = "ds-lora-modal ds-lora-side-panel";

  const head = document.createElement("div");
  head.className = "ds-lora-modal-head";

  const titleGroup = document.createElement("div");
  titleGroup.className = "ds-lora-modal-title-group";
  titleGroup.append(DSIcon("sparkles", { size: 14 }), document.createTextNode(displayName(row.name, settings.hideExtension)));

  const closeBtn = Button({
    icon: "x",
    compact: true,
    tooltip: "Close",
    onClick: () => {
      serialize(node);
      modal.remove();
    },
  });
  head.append(titleGroup, closeBtn.root);

  const body = document.createElement("div");
  body.className = "ds-lora-modal-body";

  const status = document.createElement("div");
  status.textContent = "Loading metadata…";
  status.style.fontSize = "10px";
  status.style.color = "var(--ds-color-muted-text, #8d96a3)";

  let tags = [];
  const tagsWrap = document.createElement("div");
  tagsWrap.className = "ds-lora-tags";

  const renderTags = () => {
    tagsWrap.textContent = "";
    for (const t of tags) {
      const isSel = row.selectedTriggers.includes(t);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ds-lora-tag" + (isSel ? " is-selected" : "");
      b.textContent = t;
      b.onclick = () => {
        if (row.selectedTriggers.includes(t)) {
          row.selectedTriggers = row.selectedTriggers.filter((x) => x !== t);
        } else {
          row.selectedTriggers.push(t);
        }
        serialize(node);
        renderTags();
      };
      tagsWrap.appendChild(b);
    }
  };

  const quickRow = document.createElement("div");
  quickRow.style.display = "flex";
  quickRow.style.gap = "6px";
  quickRow.style.alignItems = "center";
  quickRow.style.flexWrap = "wrap";

  const allBtn = Button({
    label: "All",
    compact: true,
    onClick: () => {
      for (const t of tags) row.selectedTriggers = [...new Set([...row.selectedTriggers, t])];
      renderTags();
      serialize(node);
    },
  });

  const noneBtn = Button({
    label: "None",
    compact: true,
    onClick: () => {
      row.selectedTriggers = [];
      renderTags();
      serialize(node);
    },
  });

  const retrieveCivitaiBtn = Button({
    label: "Retrieve from CivitAI",
    compact: true,
    onClick: async () => {
      retrieveCivitaiBtn.root.disabled = true;
      const prevText = retrieveCivitaiBtn.root.textContent;
      retrieveCivitaiBtn.root.textContent = "Retrieving...";
      status.textContent = "Querying CivitAI (computing hash & parsing triggers)...";
      try {
        const m = await fetchMetadata(node, row, true);
        const newTags = Array.from(new Set(m.trainedWords || []));
        if (newTags.length) {
          tags = newTags;
          status.textContent = `Retrieved ${newTags.length} trigger words from CivitAI!`;
          if (settings.showThumbnails && m.images?.[0]) {
            thumb.src = m.images[0];
            thumb.hidden = false;
          }
          renderTags();
        } else {
          status.textContent = m.error || "No triggers found on CivitAI.";
        }
      } catch (err) {
        status.textContent = "CivitAI query failed.";
      } finally {
        retrieveCivitaiBtn.root.disabled = false;
        retrieveCivitaiBtn.root.textContent = prevText;
      }
    },
  });

  quickRow.append(allBtn.root, noneBtn.root, retrieveCivitaiBtn.root);

  const thumb = document.createElement("img");
  thumb.className = "ds-lora-thumb";
  thumb.hidden = true;
  thumb.alt = "";

  body.append(status, quickRow, tagsWrap, thumb);

  const foot = document.createElement("div");
  foot.className = "ds-lora-modal-foot";

  const doneBtn = Button({
    label: "Done",
    variant: "primary",
    onClick: () => {
      serialize(node);
      node._dsRender();
      modal.remove();
    },
  });
  foot.appendChild(doneBtn.root);

  panel.append(head, body, foot);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  requestAnimationFrame(() => placeSidePanel(panel, anchorEl || node._dsLora?.card, "right"));
  installOutsideClose(panel, anchorEl || node._dsLora?.card, () => {
    serialize(node);
    node._dsRender();
    modal.remove();
  });

  (async () => {
    const m = await fetchMetadata(node, row, false);
    tags = Array.from(new Set(m.trainedWords || []));
    if (settings.showThumbnails && m.images?.[0]) {
      thumb.src = m.images[0];
      thumb.hidden = false;
    }
    status.textContent = m.ok ? (tags.length ? `Loaded ${tags.length} trigger words.` : "No triggers found.") : (m.error || "No triggers found.");
    renderTags();
  })();
}

/* ========================================================================= */
/* Extension Registration & Lifecycle                                        */
/* ========================================================================= */
app.registerExtension({
  name: "DeathshotArsenal.DSLoRaLoader",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_LoRaLoader") return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.onConfigure;
    const originalRemoved = nodeType.prototype.onRemoved;
    const originalSerialize = nodeType.prototype.serialize;

    nodeType.prototype._dsRender = () => {};

    // computeSize must ALWAYS return min required size so LiteGraph allows shrinking back
    nodeType.prototype.computeSize = function (out) {
      out = out || [0, 0];
      const minW = this._dsLora?.mode === "video" ? 440 : 380;
      const targetH = calculateNodeHeight(this);
      out[0] = minW;
      out[1] = targetH;
      return out;
    };

    nodeType.prototype.onNodeCreated = function () {
      const r = originalCreated?.apply(this, arguments);
      this.resizable = true;
      this.widgets_start_y = 36;
      this.properties = this.properties || {};

      const graph = this.graph || app?.graph;
      const state = this.properties.ds_lora_state || this.widgets?.find((w) => w.name === "LoaderState")?.value;
      const decoded = decodeState(state);
      this._dsLora = { ...decoded, allLoras: [], dragIndex: null };
      this._dsLora.mode = decoded.mode || "image";
      this._dsLora.settings = { ...loadSettings(), ...decoded.settings };
      this._dsLora.settings.civitaiApiKey = loadSettings().civitaiApiKey;

      if (!this._dsLora.rows || !this._dsLora.rows.length) {
        this._dsLora.rows = [defaultRow(this._dsLora.settings)];
      }

      this._dsRender = () => renderCard(this);

      // Top Add LoRA area (positioned in empty space between sockets)
      const addArea = document.createElement("div");
      addArea.className = "ds-lora-top-add-area";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "ds-lora-big-add-btn";
      addBtn.appendChild(DSIcon("plus", { size: 15 }));
      addBtn.appendChild(document.createTextNode("Add LoRA"));
      addBtn.onclick = () => {
        if (this._dsLora.rows.length >= MAX_LORAS) return;
        this._dsLora.rows.push(defaultRow(this._dsLora.settings));
        this._dsRender();
        resizeNode(this);
        serialize(this);
      };
      addArea.appendChild(addBtn);

      // Card is the primary container for controls and LoRA rows
      const card = document.createElement("div");
      card.className = "ds-ui-card ds-lora-card";

      this._dsLora.addArea = addArea;
      this._dsLora.card = card;

      const minW = this._dsLora.mode === "video" ? 440 : 380;

      const addWidget = this.addDOMWidget("ds_lora_add", "custom", addArea, {
        serialize: false,
        margin: 0,
      });
      addWidget.serialize = false;
      addWidget.computeSize = () => [minW, 36];
      const origAddDraw = addWidget.draw;
      addWidget.draw = function (ctx, node, widget_width, y, widget_height) {
        if (typeof origAddDraw === "function") {
          origAddDraw.call(this, ctx, node, widget_width, 34, widget_height);
        }
      };
      this._dsLora.addWidget = addWidget;

      const cardWidget = this.addDOMWidget("ds_lora_card", "custom", card, {
        serialize: false,
        margin: 0,
        getMinHeight: () => calculateCardHeight(this),
        getMaxHeight: () => calculateCardHeight(this),
      });
      cardWidget.serialize = false;
      cardWidget.computeSize = () => [minW, calculateCardHeight(this)];
      const origCardDraw = cardWidget.draw;
      cardWidget.draw = function (ctx, node, widget_width, y, widget_height) {
        if (typeof origCardDraw === "function") {
          origCardDraw.call(this, ctx, node, widget_width, 96, widget_height);
        }
      };
      this._dsLora.cardWidget = cardWidget;

      protectDSResizeCorners(this);
      registerGearMenu();
      ensureHiddenWidget(this);

      if (Array.isArray(this.widgets)) {
        const addIdx = this.widgets.indexOf(addWidget);
        if (addIdx > 0) {
          this.widgets.splice(addIdx, 1);
          this.widgets.unshift(addWidget);
        }
        const cardIdx = this.widgets.indexOf(cardWidget);
        if (cardIdx > 1) {
          this.widgets.splice(cardIdx, 1);
          this.widgets.splice(1, 0, cardWidget);
        }
      }

      this.min_size = [minW, calculateNodeHeight(this)];

      this.setSize = function (size) {
        const minWidth = this._dsLora?.mode === "video" ? 440 : 380;
        const width = Math.max(minWidth, Number(size?.[0]) || minWidth);
        const targetH = calculateNodeHeight(this);
        this.size[0] = width;
        this.size[1] = targetH;
      };

      this.onResize = function (size) {
        const minWidth = this._dsLora?.mode === "video" ? 440 : 380;
        const width = Math.max(minWidth, Number(size?.[0]) || minWidth);
        const targetH = calculateNodeHeight(this);
        this.size[0] = width;
        this.size[1] = targetH;
      };

      const initialW = Math.max(minW, Number(this.size?.[0]) || minW);
      const initialH = calculateNodeHeight(this);
      this.size = [initialW, initialH];

      this._dsLora.reload = async () => {
        this._dsLora.allLoras = await getLoras();
        this._dsRender();
      };
      this._dsLora.reload();
      this._dsRender();

      requestAnimationFrame(() => {
        resizeNode(this);
        registerGearMenu();
      });

      if (!graph?.is_loading) {
        serialize(this);
      }
      return r;
    };

    nodeType.prototype.onConfigure = function (info) {
      const r = originalConfigure?.apply(this, arguments);
      this.widgets_start_y = 36;
      this.properties = this.properties || {};

      const rawState =
        info?.properties?.ds_lora_state ||
        info?.widgets_values_named?.LoaderState ||
        info?.widgets_values?.[0] ||
        this.properties?.ds_lora_state ||
        this.widgets?.find((w) => w.name === "LoaderState")?.value;

      const decoded = decodeState(rawState);
      this._dsLora = this._dsLora || {};
      this._dsLora.masterEnabled = decoded.masterEnabled;
      this._dsLora.mode = decoded.mode || "image";
      this._dsLora.rows = decoded.rows;
      if (!this._dsLora.rows.length && !rawState) {
        this._dsLora.rows = [defaultRow(this._dsLora.settings)];
      }
      this._dsLora.settings = { ...loadSettings(), ...decoded.settings, civitaiApiKey: loadSettings().civitaiApiKey };
      this._dsLora.allLoras = this._dsLora.allLoras || [];
      this._dsRender = this._dsRender || (() => renderCard(this));

      protectDSResizeCorners(this);
      registerGearMenu();
      ensureHiddenWidget(this);

      const minW = this._dsLora.mode === "video" ? 440 : 380;

      if (this._dsLora?.addWidget) {
        this._dsLora.addWidget.computeSize = () => [minW, 36];
        const origAddDraw = this._dsLora.addWidget.draw;
        this._dsLora.addWidget.draw = function (ctx, node, widget_width, y, widget_height) {
          if (typeof origAddDraw === "function") {
            origAddDraw.call(this, ctx, node, widget_width, 34, widget_height);
          }
        };
      }
      if (this._dsLora?.cardWidget) {
        this._dsLora.cardWidget.computeSize = () => [minW, calculateCardHeight(this)];
        const origCardDraw = this._dsLora.cardWidget.draw;
        this._dsLora.cardWidget.draw = function (ctx, node, widget_width, y, widget_height) {
          if (typeof origCardDraw === "function") {
            origCardDraw.call(this, ctx, node, widget_width, 96, widget_height);
          }
        };
      }

      this.min_size = [minW, calculateNodeHeight(this)];

      this.setSize = function (size) {
        const minWidth = this._dsLora?.mode === "video" ? 440 : 380;
        const width = Math.max(minWidth, Number(size?.[0]) || minWidth);
        const targetH = calculateNodeHeight(this);
        this.size[0] = width;
        this.size[1] = targetH;
      };

      this.onResize = function (size) {
        const minWidth = this._dsLora?.mode === "video" ? 440 : 380;
        const width = Math.max(minWidth, Number(size?.[0]) || minWidth);
        const targetH = calculateNodeHeight(this);
        this.size[0] = width;
        this.size[1] = targetH;
      };

      if (!this._dsLora.allLoras.length) {
        getLoras().then((loras) => {
          if (this._dsLora) {
            this._dsLora.allLoras = loras;
            this._dsRender();
          }
        });
      }

      this._dsRender();
      requestAnimationFrame(() => {
        resizeNode(this);
        registerGearMenu();
      });

      const triggerStr = compileTriggers(this);
      this.properties.ds_lora_state = {
        version: 1,
        mode: this._dsLora.mode || "image",
        masterEnabled: this._dsLora.masterEnabled,
        rows: this._dsLora.rows.map(clone),
        settings: { ...loadSettings(), ...this._dsLora.settings, civitaiApiKey: undefined },
      };
      this.properties.triggers = triggerStr;
      this.properties.lora_triggers = triggerStr;
      this.triggers = triggerStr;
      this.lora_triggers = triggerStr;

      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i].name === "triggers") {
            this.outputs[i]._data = triggerStr;
            this.outputs[i].value = triggerStr;
          }
        }
      }

      return r;
    };

    nodeType.prototype.serialize = function () {
      serialize(this);
      const data = originalSerialize ? originalSerialize.apply(this, arguments) : {};
      data.properties = data.properties || {};
      data.properties.ds_lora_state = this.properties?.ds_lora_state;
      data.properties.triggers = this.properties?.triggers;
      data.properties.lora_triggers = this.properties?.lora_triggers;
      data.triggers = this.triggers;
      data.lora_triggers = this.lora_triggers;
      return data;
    };

    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      const base = options.slice();
      options.length = 0;
      options.push(...base);
      options.push({ content: "LoRa Loader settings", callback: () => renderSettingsModal(this) });
      options.push({ content: "Refresh LoRA list", callback: () => this._dsLora?.reload?.() });
      options.push({
        content: "+ Add LoRA",
        callback: () => {
          if (this._dsLora?.rows?.length < MAX_LORAS) {
            this._dsLora.rows.push(defaultRow(this._dsLora.settings));
            this._dsRender();
            resizeNode(this);
            serialize(this);
          }
        },
      });
    };

    nodeType.prototype.onRemoved = function () {
      try {
        this._dsLora?.addArea?.remove?.();
        this._dsLora?.card?.remove?.();
        this._dsLora = null;
      } catch {}
      originalRemoved?.apply(this, arguments);
    };
  },
});