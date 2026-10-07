// DeathshotArsenal/js/Load Images From Folder/ds_load_images_from_folder.js
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  installDSUI,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  Button,
  Dropdown,
  Stepper,
  DSIcon,
} from "../UIElements/index.js";
import { browseFolderOS } from "./os_dialog_bridge.js";
import { openGalleryModal } from "./gallery_modal.js";
import {
  RESIZE_MODES,
  renderResizePanel,
  computeOutputDimensions,
} from "./resize_panel.js";

const STATE_WIDGET = "ds_folder_loader_state";
const STATE_PROP = "dsFolderLoaderState";

const DEFAULT_STATE = {
  folder_path: "",
  selected_files: [],
  current_index: 1,
  batch_size: 1,
  execution_mode: "sequential",
  include_subfolders: true,
  keep_folder_structure: false,
  sort_by: "name",
  sort_dir: "asc",
  resize_config: {
    mode: "off",
    max_mp: 1.0,
    longest_side: 1024,
    scale_factor: 1.0,
    fit_w: 1024,
    fit_h: 1024,
    cover_w: 1024,
    cover_h: 1024,
    ratio_preset: "1:1",
    ratio_w: 1,
    ratio_h: 1,
    ratio_action: "crop",
    pad_color: "#808080",
    pad_top: 0,
    pad_bottom: 0,
    pad_left: 0,
    pad_right: 0,
    crop_anchor: "center",
    crop_scale: true,
    snap: 0,
    resample: "auto",
    allow_upscale: true,
  },
};

function injectCSS() {
  installDSUI();

  let link = document.getElementById("ds-load-images-from-folder-link");
  if (!link) {
    link = document.createElement("link");
    link.id = "ds-load-images-from-folder-link";
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Load%20Images%20From%20Folder/folder_loader.css?v=" + Date.now();
    document.head.appendChild(link);
  }
}

function cleanPath(p) {
  if (p === null || p === undefined) return "";
  let s = String(p).trim();
  s = s.replace(/^["']|["']$/g, "");
  s = s.replace(/\\/g, "/");
  s = s.replace(/\/+$/, "");
  return s;
}

function readState(node) {
  const prop = node?.properties?.[STATE_PROP];
  if (prop) {
    if (typeof prop === "object") return { ...DEFAULT_STATE, ...prop };
    try {
      const parsed = JSON.parse(prop);
      if (typeof parsed === "object" && parsed !== null) {
        return { ...DEFAULT_STATE, ...parsed };
      }
    } catch (_) {}
  }
  const sw = node?.widgets?.find((w) => w?.name === STATE_WIDGET);
  if (sw && sw.value) {
    try {
      const parsed = JSON.parse(sw.value);
      if (typeof parsed === "object" && parsed !== null) {
        return { ...DEFAULT_STATE, ...parsed };
      }
    } catch (_) {}
  }
  return { ...DEFAULT_STATE };
}

function saveState(node, patch) {
  app.canvas?.emitBeforeChange?.();
  try {
    const current = readState(node);
    const updated = { ...current, ...patch };
    const serialized = JSON.stringify(updated);
    node.properties ||= {};
    node.properties[STATE_PROP] = serialized;

    const sw = node.widgets?.find((w) => w?.name === STATE_WIDGET);
    if (sw) {
      sw.value = serialized;
      sw.callback?.(serialized, app.canvas, node);
    }
    return updated;
  } finally {
    app.canvas?.emitAfterChange?.();
    node.setDirtyCanvas?.(true, true);
  }
}

function markWorkflowDirty() {
  try {
    app.canvas?.emitBeforeChange?.();
    app.canvas?.emitAfterChange?.();
    app.canvas?.setDirty?.(true, true);
  } catch (_) {}
}

function bodyTop(node) {
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const inputs = (node.inputs ?? []).filter((i) => !i.widget).length;
  const outputs = (node.outputs ?? []).length;
  const rows = Math.max(inputs, outputs);
  return rows ? rows * slotH + (node.constructor.slot_start_y || 0) : 0;
}

function setupNode(node) {
  if (!node) return;
  const isTarget =
    node.type === "DS_LoadImagesFromFolder" ||
    node.comfyClass === "DS_LoadImagesFromFolder" ||
    node.constructor?.comfyClass === "DS_LoadImagesFromFolder";
  if (!isTarget) return;
  if (node._dsFolderLoaderSetup) return;
  node._dsFolderLoaderSetup = true;

  node.title = "DS Load Images From Folder";
  node.properties ||= {};
  node.properties.dsDisplayName = "DS Load Images From Folder";
  node.shape = 2;
  node.resizable = true;

  injectCSS();

  // Ensure state widget exists and hide it from canvas
  node.widgets ||= [];
  let stateWidget = node.widgets.find((w) => w?.name === STATE_WIDGET);
  if (!stateWidget && node.addWidget) {
    stateWidget = node.addWidget("text", STATE_WIDGET, "{}", () => {}, { hidden: true });
  }
  if (stateWidget && !node.properties[STATE_PROP] && stateWidget.value && stateWidget.value !== "{}") {
    try {
      node.properties[STATE_PROP] = stateWidget.value;
    } catch (_) {}
  }
  if (!node.properties[STATE_PROP]) {
    saveState(node, {});
  }

  function hideWidget(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    if (w.element) {
      w.element.style.display = "none";
      w.element.style.pointerEvents = "none";
    }
  }

  for (const w of node.widgets || []) {
    if (w.name !== "ds_folder_loader_ui") {
      hideWidget(w);
    }
  }

  // Card as the visible DOM widget container (Node Base -> Card -> UI Elements)
  const card = document.createElement("div");
  card.className = "ds-ui-card ds-fl-node-card";
  card.dataset.dsThemed = "true";
  card.dataset.dsFolderCard = "true";
  card.style.setProperty("background", "var(--ds-color-card, #12151c)", "important");
  card.style.setProperty("background-color", "var(--ds-color-card, #12151c)", "important");
  card.style.setProperty("border", "1px solid var(--ds-color-card-border, #242a36)", "important");
  card.style.setProperty("border-radius", "var(--ds-radius-card, 8px)", "important");
  card.style.setProperty("box-sizing", "border-box", "important");
  card.style.setProperty("box-shadow", "none", "important");
  card.style.setProperty("margin", "0", "important");
  card.style.setProperty("padding", "var(--ds-card-padding, 10px)", "important");

  // 1. Status Bar Readout
  const statusBar = document.createElement("div");
  statusBar.className = "ds-fl-status-bar";
  statusBar.innerHTML = `
    <div class="ds-fl-status-left">
      <span class="ds-fl-badge" data-index-badge>Current: 1 / 0</span>
      <span style="opacity:.45;font-size:8px;">──►</span>
      <span class="ds-fl-filename" data-filename>(No image)</span>
    </div>
    <span class="ds-fl-dim-badge" data-dim-badge>— × —</span>
  `;
  card.appendChild(statusBar);

  const indexBadge = statusBar.querySelector("[data-index-badge]");
  const filenameEl = statusBar.querySelector("[data-filename]");
  const dimBadge = statusBar.querySelector("[data-dim-badge]");

  // 2. Folder Path Row with browse button
  const pathRow = document.createElement("div");
  pathRow.className = "ds-fl-row";

  const pathInput = document.createElement("input");
  pathInput.type = "text";
  pathInput.className = "ds-ui-input ds-fl-input";
  pathInput.placeholder = "Folder Path: Type, paste or browse...";
  pathInput.setAttribute("data-path-input", "");

  const browseBtn = Button({
    label: "Browse",
    icon: "folder",
    tooltip: "Browse folders on disk",
    onClick: (e) => {
      e.stopPropagation();
      const cur = cleanPath(pathInput.value) || readState(node).folder_path;
      browseFolderOS(cur, (chosen) => {
        if (chosen) {
          const p = cleanPath(chosen);
          pathInput.value = p;
          saveState(node, { folder_path: p, current_index: 1 });
          fetchScan(p);
          markWorkflowDirty();
        }
      });
    },
  });

  pathRow.append(pathInput, browseBtn.root);
  card.appendChild(pathRow);

  // 3. Pick Images / Select Images Button
  const galleryBtn = Button({
    label: "🖼 Select images : 0",
    variant: "primary",
    className: "ds-fl-gallery-btn",
    onClick: (e) => {
      e.stopPropagation();
      const directPath = cleanPath(pathInput.value) || readState(node).folder_path;
      if (directPath) {
        saveState(node, { folder_path: directPath });
      }
      const state = readState(node);
      openGalleryModal({
        node,
        folderPath: directPath || state.folder_path,
        initialSelected: state.selected_files || [],
        includeSubfolders: state.include_subfolders,
        keepFolderStructure: state.keep_folder_structure,
        sortBy: state.sort_by,
        sortDir: state.sort_dir,
        onApply: (res) => {
          saveState(node, {
            selected_files: res.selectedFiles,
            includeSubfolders: res.includeSubfolders,
            keepFolderStructure: res.keepFolderStructure,
            sort_by: res.sortBy,
            sort_dir: res.sortDir,
            current_index: 1,
          });
          refreshUI();
          markWorkflowDirty();
        },
      });
    },
  });
  card.appendChild(galleryBtn.root);

  // 4. Execution Controls Row
  const execRow = document.createElement("div");
  execRow.className = "ds-fl-row ds-fl-exec-row";

  const execDropdown = Dropdown({
    label: "EXECUTION:",
    options: [
      { id: "sequential", label: "Sequential (1-by-1)" },
      { id: "batch", label: "Batch Mode" },
    ],
    value: "sequential",
    onChange: (val) => {
      saveState(node, { execution_mode: val });
      markWorkflowDirty();
    },
  });
  execDropdown.root.style.flex = "1";
  execDropdown.root.style.minWidth = "0";

  const batchLabel = document.createElement("span");
  batchLabel.className = "ds-fl-label";
  batchLabel.textContent = "BATCH:";

  const batchStepper = Stepper({
    min: 1,
    max: 100,
    step: 1,
    value: 1,
    compact: true,
    onChange: (val) => {
      saveState(node, { batch_size: Math.max(1, parseInt(val) || 1) });
      markWorkflowDirty();
    },
  });
  batchStepper.root.style.width = "85px";

  const stopBtn = Button({
    label: "Stop",
    icon: "square",
    variant: "danger",
    size: "compact",
    tooltip: "Stop auto-feeder loop",
    onClick: (e) => {
      e.stopPropagation();
      node._dsAutoFeedActive = false;
      stopBtn.root.style.display = "none";
    },
  });
  stopBtn.root.style.display = "none";

  execRow.append(execDropdown.root, batchLabel, batchStepper.root, stopBtn.root);
  card.appendChild(execRow);

  // 5. Resize Controls Section
  const resizeBox = document.createElement("div");
  resizeBox.className = "ds-fl-resize-box";

  const resizeHeadRow = document.createElement("div");
  resizeHeadRow.className = "ds-fl-row";

  const resizeDropdown = Dropdown({
    label: "RESIZE:",
    options: RESIZE_MODES.map((m) => ({ id: m.id, label: m.label })),
    value: "off",
    onChange: (val) => {
      const state = readState(node);
      const cfg = { ...state.resize_config, mode: val };
      saveState(node, { resize_config: cfg });
      renderResizeSubpanel();
      updateDimensions();
      markWorkflowDirty();
    },
  });
  resizeDropdown.root.style.flex = "1";
  resizeDropdown.root.style.minWidth = "0";

  resizeHeadRow.appendChild(resizeDropdown.root);

  const resizeSubpanel = document.createElement("div");
  resizeSubpanel.className = "ds-fl-resize-panel";
  resizeSubpanel.dataset.resizeSubpanel = "";

  resizeBox.append(resizeHeadRow, resizeSubpanel);
  card.appendChild(resizeBox);

  // 6. Current Image Preview & Drop Target Area (Grow Area)
  const previewZone = document.createElement("div");
  previewZone.className = "ds-fl-preview-zone";
  previewZone.innerHTML = `
    <img class="ds-fl-preview-img" data-img alt="Active Preview">
    <div class="ds-fl-placeholder" data-ph>
      <strong>CURRENT IMAGE PREVIEW & DROP TARGET ZONE</strong>
      <span>Type or browse folder, or drop folder here</span>
    </div>
    <div class="ds-fl-resbadge" data-resbadge>OUTPUT — × —</div>
  `;
  card.appendChild(previewZone);

  const previewImg = previewZone.querySelector("[data-img]");
  const previewPh = previewZone.querySelector("[data-ph]");
  const resBadge = previewZone.querySelector("[data-resbadge]");

  previewZone.addEventListener("click", (e) => {
    if (e.target.closest("button, input")) return;
    galleryBtn.root.click();
  });

  // Top offset override for exact socket row placement
  Object.defineProperty(node, "widgets_start_y", {
    configurable: true,
    get() {
      return bodyTop(this);
    },
    set() {},
  });

  // Attach Card as direct DOM Widget root
  const CARD_MARGIN = 5;
  const MIN_CARD_HEIGHT = 420;
  const MIN_WIDGET_HEIGHT = MIN_CARD_HEIGHT + CARD_MARGIN * 2;

  const domWidget = node.addDOMWidget("ds_folder_loader_ui", "custom", card, {
    serialize: false,
    margin: CARD_MARGIN,
    getMinHeight: () => MIN_WIDGET_HEIGHT,
    getMaxHeight: () => {
      const widgetY = Number(domWidget?.y ?? node._getWidgetY?.() ?? 0);
      const nodeHeight = Number(node.size?.[1] ?? 0);
      return Math.max(MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
    },
  });
  domWidget.serialize = false;

  normalizeDSWidgetHost(card, node, { shell: false });

  // Native resize corners hit-testing preservation
  const originalGetWidgetOnPos = node.getWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    const x = Number(canvasX) - Number(this.pos?.[0] ?? 0);
    const y = Number(canvasY) - Number(this.pos?.[1] ?? 0);
    const w = Number(this.size?.[0] ?? 0);
    const h = Number(this.size?.[1] ?? 0);
    const handle = Number(this.constructor?.resizeHandleSize) || 15;

    const inLeft = x <= handle;
    const inRight = x >= w - handle;
    const inTop = y <= handle;
    const inBottom = y >= h - handle;

    if ((inLeft || inRight) && (inTop || inBottom)) {
      return undefined;
    }

    const hit = originalGetWidgetOnPos ? originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled) : undefined;
    return hit === domWidget ? undefined : hit;
  };

  domWidget.onPointerDown = function (pointer) {
    const e = pointer?.eDown || pointer?.e;
    const target = pointer?.eDown?.target || e?.target;

    if (e && node.size) {
      const rect = card.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const fromBottom = rect.bottom - e.clientY;
      if (fromBottom <= 15 || (fromRight <= 18 && fromBottom <= 18)) {
        return false;
      }
    }

    return !!target?.closest?.(
      "button, input, select, textarea, .ds-ui-btn, .ds-ui-dropdown, .ds-ui-stepper, .ds-ui-toggle, .ds-fl-preview-zone"
    );
  };

  // Node Sizing and Clamping
  const baseComputeSize = node.computeSize;
  node.computeSize = function (out) {
    const size = baseComputeSize ? baseComputeSize.call(this, out) : [380, 520];
    size[0] = Math.max(size[0], 360);
    const minH = bodyTop(this) + MIN_WIDGET_HEIGHT + 5;
    size[1] = Math.max(size[1], minH);
    return size;
  };

  // UI state refresh helper
  const refreshUI = () => {
    const state = readState(node);
    pathInput.value = state.folder_path || "";
    execDropdown.setValue(state.execution_mode || "sequential", false);
    batchStepper.setValue(state.batch_size || 1, false);
    resizeDropdown.setValue(state.resize_config?.mode || "off", false);

    const total = (state.selected_files || []).length;
    let idx = state.current_index || 1;
    if (idx > total) idx = Math.max(1, total);
    if (idx < 1) idx = 1;

    galleryBtn.setLabel(`🖼 Select images : ${total}`);
    indexBadge.textContent = total > 0 ? `Current: ${idx} / ${total}` : "Current: 0 / 0";

    if (total > 0 && idx <= total) {
      const activeRel = state.selected_files[idx - 1];
      filenameEl.textContent = state.keep_folder_structure
        ? activeRel
        : activeRel.split("/").pop() || activeRel;
      filenameEl.title = activeRel;

      const full = state.folder_path ? `${state.folder_path}/${activeRel}` : "";
      const targetSrc = `/ds/image?path=${encodeURIComponent(full)}`;
      if (previewImg.getAttribute("data-full-path") !== full) {
        previewImg.setAttribute("data-full-path", full);
        previewImg.src = targetSrc;
      }
      previewImg.style.display = "block";
      previewPh.style.display = "none";
    } else {
      filenameEl.textContent = "(No image)";
      previewImg.removeAttribute("data-full-path");
      previewImg.removeAttribute("src");
      previewImg.style.display = "none";
      previewPh.style.display = "flex";
      dimBadge.textContent = "— × —";
      resBadge.textContent = "OUTPUT — × —";
    }

    if (node._dsAutoFeedActive) {
      stopBtn.root.style.display = "inline-flex";
    } else {
      stopBtn.root.style.display = "none";
    }

    renderResizeSubpanel();
  };

  const updateDimensions = () => {
    const state = readState(node);
    const nw = previewImg.naturalWidth || 1024;
    const nh = previewImg.naturalHeight || 1024;
    const out = computeOutputDimensions(nw, nh, state.resize_config);
    const aspect = (out.w / out.h).toFixed(2);
    dimBadge.textContent = `${out.w} × ${out.h} (${aspect}:1)`;
    resBadge.textContent = `IN ${nw}×${nh}  ·  OUT ${out.w}×${out.h}`;
  };

  if (previewImg) {
    previewImg.onload = () => {
      previewImg.style.display = "block";
      previewPh.style.display = "none";
      updateDimensions();
    };
    previewImg.onerror = () => {
      previewImg.style.display = "none";
      previewPh.style.display = "flex";
    };
  }

  const renderResizeSubpanel = () => {
    const state = readState(node);
    const nw = previewImg.naturalWidth || 1024;
    const nh = previewImg.naturalHeight || 1024;
    renderResizePanel(
      resizeSubpanel,
      state.resize_config || {},
      (updatedConfig) => {
        saveState(node, { resize_config: updatedConfig });
        renderResizeSubpanel();
        updateDimensions();
        markWorkflowDirty();
      },
      { w: nw, h: nh }
    );
  };

  pathInput.addEventListener("input", () => {
    const p = cleanPath(pathInput.value);
    saveState(node, { folder_path: p, current_index: 1 });
  });

  pathInput.addEventListener("change", () => {
    const p = cleanPath(pathInput.value);
    pathInput.value = p;
    saveState(node, { folder_path: p, current_index: 1 });
    fetchScan(p);
    markWorkflowDirty();
  });

  const fetchScan = async (folder) => {
    const clean = cleanPath(folder);
    if (!clean) return;
    try {
      const state = readState(node);
      const res = await fetch("/ds/folder_scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: clean,
          recursive: state.include_subfolders,
          sort_by: state.sort_by,
          sort_dir: state.sort_dir,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const allRels = (data.files || []).map((f) => f.rel_path);
        saveState(node, { selected_files: allRels, current_index: 1 });
        refreshUI();
      }
    } catch (err) {
      console.warn("[DS Load Images From Folder] Auto-scan error:", err);
    }
  };

  // Drag and drop support on preview area
  previewZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    previewZone.classList.add("drag-over");
    e.dataTransfer.dropEffect = "copy";
  });

  previewZone.addEventListener("dragleave", () => {
    previewZone.classList.remove("drag-over");
  });

  previewZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    previewZone.classList.remove("drag-over");

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      if (firstFile.path) {
        const folder = firstFile.path.replace(/[\\\/][^\\\/]+$/, "");
        pathInput.value = folder;
        saveState(node, { folder_path: folder, current_index: 1 });
        fetchScan(folder);
        markWorkflowDirty();
      }
    }
  });

  // Automated Execution Loop (The "Auto-Feeder")
  const onExecutionCompleted = (e) => {
    const detail = e.detail;
    if (!detail || detail.node !== String(node.id)) return;

    const state = readState(node);
    const total = (state.selected_files || []).length;
    if (total <= 0) return;

    const step = state.execution_mode === "batch" ? Math.max(1, state.batch_size || 1) : 1;
    const curIdx = state.current_index || 1;

    if (curIdx + step <= total) {
      node._dsAutoFeedActive = true;
      const nextIdx = curIdx + step;
      saveState(node, { current_index: nextIdx });
      refreshUI();

      setTimeout(() => {
        if (node._dsAutoFeedActive) {
          app.queuePrompt(0);
        }
      }, 80);
    } else {
      node._dsAutoFeedActive = false;
      saveState(node, { current_index: 1 });
      refreshUI();
      console.log("[DS Load Images From Folder] Batch execution complete! Reset index to 1.");
    }
  };

  api.addEventListener("executed", onExecutionCompleted);

  const oldRemoved = node.onRemoved;
  node.onRemoved = function () {
    api.removeEventListener("executed", onExecutionCompleted);
    node._dsAutoFeedActive = false;
    document.querySelector(".ds-fl-gallery-modal")?.remove();
    document.querySelector(".ds-fl-dir-modal")?.remove();
    document.querySelector(".ds-fl-color-modal")?.remove();
    browseBtn.destroy?.();
    galleryBtn.destroy?.();
    execDropdown.destroy?.();
    batchStepper.destroy?.();
    stopBtn.destroy?.();
    resizeDropdown.destroy?.();
    if (oldRemoved) oldRemoved.apply(this, arguments);
  };

  const oldResize = node.onResize;
  node.onResize = function (size) {
    try {
      if (oldResize) oldResize.apply(this, arguments);
    } catch (_) {}
    this.setDirtyCanvas?.(true, true);
  };

  const oldConfigure = node.onConfigure;
  node.onConfigure = function () {
    const r = oldConfigure?.apply(this, arguments);
    setTimeout(() => {
      try {
        const sw = this.widgets?.find((w) => w.name === STATE_WIDGET);
        if (sw?.value && !this.properties?.[STATE_PROP]) {
          this.properties[STATE_PROP] = sw.value;
        }
        const min = this.computeSize();
        const curW = Number(this.size?.[0]) || min[0];
        const curH = Number(this.size?.[1]) || min[1];
        if (this.setSize) {
          this.setSize([Math.max(curW, min[0]), Math.max(curH, min[1])]);
        } else {
          this.size = [Math.max(curW, min[0]), Math.max(curH, min[1])];
        }
        refreshUI();
        this.setDirtyCanvas?.(true, true);
      } catch (_) {}
    }, 40);
    return r;
  };

  // Initial node sizing for newly created nodes
  requestAnimationFrame(() => {
    const min = node.computeSize();
    const curW = Number(node.size?.[0]) || 0;
    const curH = Number(node.size?.[1]) || 0;
    const targetW = Math.max(min[0], curW || 380);
    const targetH = Math.max(min[1], curH || 520);
    if (node.setSize) node.setSize([targetW, targetH]);
    else node.size = [targetW, targetH];
    node.setDirtyCanvas?.(true, true);
  });

  node._dsFLRefreshUI = refreshUI;
  refreshUI();
  try {
    window.DSGlobalTheme?.bindNode?.(card, node);
  } catch (_) {}
}

app.registerExtension({
  name: "DeathshotArsenal.DSLoadImagesFromFolder",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_LoadImagesFromFolder") return;
    try {
      nodeData.display_name = "DS Load Images From Folder";
    } catch (_) {}
    try {
      nodeType.title = "DS Load Images From Folder";
    } catch (_) {}
    nodeType.comfyClass = "DS_LoadImagesFromFolder";
    nodeType.prototype.comfyClass = "DS_LoadImagesFromFolder";
  },
  nodeCreated(node) {
    if (node.comfyClass === "DS_LoadImagesFromFolder" || node.type === "DS_LoadImagesFromFolder") {
      setupNode(node);
    }
  },
  loadedGraphNode(node) {
    if (node.comfyClass === "DS_LoadImagesFromFolder" || node.type === "DS_LoadImagesFromFolder") {
      setupNode(node);
    }
  },
});
