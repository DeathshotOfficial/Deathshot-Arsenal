import { app } from "/scripts/app.js";
import { attachNodeShortcuts } from "../UIElements/shortcuts.js";
import { api } from "/scripts/api.js";
import { DSIcon, normalizeDSWidgetHost, protectDSResizeCorners } from "../UIElements/index.js";

const TYPE = "DS_ImagePreview";
const EXT = "DeathshotArsenal.DSImagePreview";
const MODE_PROP = "ds_image_preview_mode";
const DEFAULT_SIZE = [620, 650];
const MIN_SIZE = [400, 360];
const CSS_ID = "ds-image-preview-css-v9";

function log(...args) { console.log("[DS Image Preview]", ...args); }
function error(...args) { console.error("[DS Image Preview]", ...args); }
function url(path) { try { return api.apiURL ? api.apiURL(path) : path; } catch { return path; } }

let cssPromise;
function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.getElementById(CSS_ID)) return resolve();
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Image Preview/ds_image_preview.css?v=9";
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  return cssPromise;
}

function state(node) {
  return node._dsImagePreviewState || (node._dsImagePreviewState = {
    mode: node.properties?.[MODE_PROP] === "save" ? "save" : "preview",
    file: "",
    width: 0,
    height: 0,
    count: 0,
    busy: false,
    toastTimer: null,
    saveConfirmTimer: null,
    items: [],
    activeIndex: 0,
    viewMode: "single", // "single" | "grid"
  });
}

function cleanupNode(node) {
  if (Array.isArray(node.inputs)) {
    for (let i = node.inputs.length - 1; i >= 0; i--) {
      const inp = node.inputs[i];
      if (inp.name !== "image") {
        node.removeInput(i);
      } else {
        inp.type = "IMAGE";
      }
    }
  }
  if (Array.isArray(node.widgets)) {
    for (let i = node.widgets.length - 1; i >= 0; i--) {
      if (node.widgets[i].name === "SaveMode") {
        node.widgets.splice(i, 1);
      }
    }
  }
  if (Array.isArray(node.outputs)) {
    for (let i = node.outputs.length - 1; i >= 0; i--) {
      const out = node.outputs[i];
      if (out.name !== "image") {
        node.removeOutput(i);
      } else {
        out.type = "IMAGE";
      }
    }
  }
}

function persist(node) {
  node.properties ??= {};
  const s = state(node);
  node.properties[MODE_PROP] = s.mode;
  node.properties.ds_image_preview_version = 4;
  node.properties.ds_ip_last_file = s.file;
  node.properties.ds_ip_last_width = s.width;
  node.properties.ds_ip_last_height = s.height;
  if (s.items?.length) {
    node.properties.ds_ip_last_items = s.items.map((it) => ({
      file: it.file,
      width: it.width,
      height: it.height,
    }));
  }
}

function getModeHelper(mode) {
  return mode === "save"
    ? "SAVE · Every queued image is written as a separate PNG."
    : "PREVIEW · Inspect the image without creating output files.";
}

function updatePlaceholder(node, isError = false) {
  const s = state(node);
  const root = node._dsImagePreviewRoot;
  if (!root) return;
  const ph = root.querySelector(".ds-ip-placeholder");
  if (!ph) return;

  const strong = ph.querySelector("strong");
  const span = ph.querySelector("span");

  if (isError) {
    if (strong) strong.textContent = "PREVIEW UNAVAILABLE";
    if (span) span.textContent = s.mode === "save"
      ? "Run the workflow to save and preview the image."
      : "Run the workflow to preview the image here.";
    return;
  }

  if (strong) strong.textContent = "READY";
  if (span) {
    span.textContent = s.mode === "save"
      ? "Run the workflow to save and preview the image here."
      : "Run the workflow to preview the image here.";
  }
}

function toast(node, text) {
  const root = node._dsImagePreviewRoot;
  const el = root?.querySelector(".ds-ip-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(state(node).toastTimer);
  state(node).toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function renderMode(node) {
  const s = state(node), root = node._dsImagePreviewRoot;
  if (!root) return;
  root.querySelectorAll(".ds-ip-tab-btn").forEach((b) => {
    const isActive = b.dataset.mode === s.mode;
    b.classList.toggle("active", isActive);
    b.classList.toggle("is-active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  if (!s.saveConfirmTimer) {
    const note = root.querySelector(".ds-ip-helper");
    if (note) note.textContent = getModeHelper(s.mode);
  }
}

function setMode(node, mode) {
  state(node).mode = mode === "save" ? "save" : "preview";
  persist(node);
  renderMode(node);
  updatePlaceholder(node);
  node.setDirtyCanvas?.(true, true);
  log("mode", state(node).mode, "node", node.id);
}

function renderGridContent(node, grid) {
  const s = state(node);
  const total = s.items.length;
  if (!total) return;

  const root = node._dsImagePreviewRoot;
  const pBox = root?.querySelector(".ds-ip-preview") || grid;
  const boxW = Math.max(160, pBox.clientWidth || 380);
  const boxH = Math.max(160, pBox.clientHeight || 420);
  const availW = Math.max(120, boxW - 16); // 8px padding left/right
  const availH = Math.max(120, boxH - 48); // 42px top + 6px bottom padding
  const gap = 6;

  // Determine optimal columns:
  // Aim for thumbnail widths between 70px and 140px
  let cols;
  if (total <= 1) {
    cols = 1;
  } else if (total === 2) {
    cols = 2;
  } else if (total <= 4) {
    cols = 2;
  } else if (total <= 6) {
    cols = 3;
  } else if (total <= 9) {
    cols = 3;
  } else if (total <= 12) {
    cols = boxW < 330 ? 3 : 4;
  } else if (total <= 16) {
    cols = boxW < 360 ? 4 : 4;
  } else if (total <= 25) {
    cols = boxW < 360 ? 4 : 5;
  } else {
    cols = Math.max(3, Math.min(6, Math.floor(availW / 75)));
  }

  // Minimum 2 columns for multi-image batches
  cols = Math.min(cols, total);
  if (total > 1) cols = Math.max(2, cols);

  const rows = Math.ceil(total / cols);
  const colWidth = (availW - gap * (cols - 1)) / cols;

  // Aspect ratio clamped between 0.75 (portrait) and 1.33 (landscape)
  const cur = s.items[s.activeIndex] || s.items[0];
  let imgAspect = 1.0;
  if (cur?.width && cur?.height) {
    imgAspect = cur.width / cur.height;
  }
  const tileAspect = Math.max(0.75, Math.min(1.33, imgAspect));

  let tileHeight = colWidth / tileAspect;

  // Auto-fit rows into available height if possible (when rows <= 4)
  const neededHeight = rows * tileHeight + gap * (rows - 1);
  if (rows <= 4 && neededHeight > availH) {
    const fitHeight = (availH - gap * (rows - 1)) / rows;
    if (fitHeight >= 48) {
      tileHeight = fitHeight;
    }
  } else if (rows > 4) {
    tileHeight = Math.min(130, Math.max(65, tileHeight));
  }

  const roundedH = Math.round(tileHeight);
  grid.style.setProperty("--ds-grid-cols", String(cols));
  grid.style.setProperty("--ds-tile-height", `${roundedH}px`);
  grid.style.setProperty("--ds-tile-aspect", `${tileAspect}`);

  grid.replaceChildren();

  s.items.forEach((item, idx) => {
    const tile = document.createElement("div");
    tile.className = "ds-ip-tile";
    if (idx === s.activeIndex) tile.classList.add("is-active");
    tile.style.setProperty("--tile-index", String(idx));
    tile.title = `Photo ${idx + 1} of ${total} · Click to view`;

    const img = document.createElement("img");
    img.src = url(`/ds/image_preview/preview?file=${encodeURIComponent(item.file)}`);
    img.alt = `Photo ${idx + 1}`;
    img.loading = "lazy";
    img.draggable = false;

    const badge = document.createElement("span");
    badge.className = "ds-ip-tile-badge";
    badge.textContent = String(idx + 1);

    tile.appendChild(img);
    tile.appendChild(badge);

    tile.addEventListener("click", (e) => {
      e.stopPropagation();
      s.activeIndex = idx;
      s.viewMode = "single";
      renderView(node);
    });

    grid.appendChild(tile);
  });
}

function renderView(node) {
  const s = state(node), root = node._dsImagePreviewRoot;
  if (!root) return;

  const img = root.querySelector(".ds-ip-image");
  const ph = root.querySelector(".ds-ip-placeholder");
  const grid = root.querySelector(".ds-ip-grid");
  const tileBtn = root.querySelector(".ds-ip-tile-btn");
  const prevBtn = root.querySelector(".ds-ip-nav-prev");
  const nextBtn = root.querySelector(".ds-ip-nav-next");
  const indexPill = root.querySelector(".ds-ip-index-pill");
  const dims = root.querySelector(".ds-ip-dims");

  const total = s.items.length;
  const hasMultiple = total > 1;

  // 1. Tile button visibility & state
  if (tileBtn) {
    tileBtn.hidden = !hasMultiple;
    tileBtn.classList.toggle("is-active", s.viewMode === "grid");
    tileBtn.title = s.viewMode === "grid" ? "Exit grid (Single view)" : `View batch grid (${total} photos)`;
  }

  // 2. Dimensions & index indicator
  if (dims) {
    if (s.width && s.height) {
      dims.textContent = `${s.width} × ${s.height}${hasMultiple ? ` · ${s.activeIndex + 1} of ${total}` : ""}`;
    } else {
      dims.textContent = "";
    }
  }

  if (indexPill) {
    if (hasMultiple && s.viewMode === "single") {
      indexPill.textContent = `${s.activeIndex + 1} / ${total}`;
      indexPill.hidden = false;
    } else {
      indexPill.hidden = true;
    }
  }

  // 3. Grid vs Single view
  if (s.viewMode === "grid" && hasMultiple) {
    if (img) img.hidden = true;
    if (prevBtn) prevBtn.hidden = true;
    if (nextBtn) nextBtn.hidden = true;
    if (ph) ph.hidden = true;

    if (grid) {
      grid.hidden = false;
      renderGridContent(node, grid);
    }
  } else {
    s.viewMode = "single";
    if (grid) grid.hidden = true;

    if (prevBtn) prevBtn.hidden = !hasMultiple;
    if (nextBtn) nextBtn.hidden = !hasMultiple;

    const cur = s.items[s.activeIndex];
    if (cur && cur.file) {
      s.file = cur.file;
      s.width = cur.width || s.width;
      s.height = cur.height || s.height;

      if (img) {
        img.onload = () => {
          img.hidden = false;
          if (ph) ph.hidden = true;
        };
        img.onerror = () => {
          img.hidden = true;
          if (ph) {
            ph.hidden = false;
            updatePlaceholder(node, true);
          }
        };
        const targetSrc = url(`/ds/image_preview/preview?file=${encodeURIComponent(s.file)}&t=${Date.now()}`);
        if (img.src !== targetSrc) {
          img.src = targetSrc;
        } else {
          img.hidden = false;
          if (ph) ph.hidden = true;
        }
      }
    } else {
      if (img) img.hidden = true;
      if (ph) {
        ph.hidden = false;
        updatePlaceholder(node);
      }
    }
  }

  node.setDirtyCanvas?.(true, true);
}

function navigatePhoto(node, delta) {
  const s = state(node);
  if (s.items.length <= 1) return;
  s.activeIndex = (s.activeIndex + delta + s.items.length) % s.items.length;
  s.viewMode = "single";
  renderView(node);
}

function setImage(node, info, append = false) {
  const s = state(node), root = node._dsImagePreviewRoot;
  if (!root || !info?.file) return;

  let incoming = [];
  if (Array.isArray(info.items) && info.items.length) {
    incoming = info.items.map((it, idx) => ({
      file: it.file,
      width: Number(it.width) || Number(info.width) || 0,
      height: Number(it.height) || Number(info.height) || 0,
      saved: info.saved?.[idx] || "",
      saved_path: info.saved_paths?.[idx] || "",
    }));
  } else if (Array.isArray(info.files) && info.files.length) {
    incoming = info.files.map((f, idx) => ({
      file: f,
      width: Number(info.width) || 0,
      height: Number(info.height) || 0,
      saved: info.saved?.[idx] || "",
      saved_path: info.saved_paths?.[idx] || "",
    }));
  } else {
    incoming = [{
      file: info.file,
      width: Number(info.width) || 0,
      height: Number(info.height) || 0,
      saved: info.saved?.[0] || "",
      saved_path: info.saved_paths?.[0] || "",
    }];
  }

  if (append && s.items.length > 0) {
    s.items.push(...incoming);
  } else {
    s.items = incoming;
  }

  s.count = s.items.length;
  s.activeIndex = Math.max(0, s.items.length - 1);
  s.file = s.items[s.activeIndex].file;
  s.width = s.items[s.activeIndex].width;
  s.height = s.items[s.activeIndex].height;
  s.viewMode = "single";

  persist(node);
  renderView(node);

  if (s.mode === "save" && info.saved?.length) {
    const lastSaved = info.saved[info.saved.length - 1];
    const lastPath = info.saved_paths?.[info.saved_paths.length - 1] || "";
    showSaveConfirmation(node, {
      ok: true,
      filename: lastSaved,
      path: lastPath,
    });
  }
}

function showSaveConfirmation(node, { ok, filename, path, error: errMsg }) {
  const root = node._dsImagePreviewRoot;
  if (!root) return;
  const container = root.querySelector(".ds-ip-info-message");
  if (!container) return;
  const s = state(node);

  if (s.saveConfirmTimer) {
    clearTimeout(s.saveConfirmTimer);
    s.saveConfirmTimer = null;
  }

  const safeFile = filename ? String(filename) : (ok ? "image.png" : "file");
  const safePath = path ? String(path) : "";
  const safeErr = errMsg ? String(errMsg) : "Could not save file";

  container.innerHTML = `
    <div class="ds-ip-save-confirm ${ok ? "is-success" : "is-error"}" title="${ok ? (safePath ? `${safeFile} → ${safePath}` : safeFile) : safeErr}">
      <span class="ds-ip-save-confirm-icon">${ok ? "✓" : "✕"}</span>
      <span class="ds-ip-save-confirm-title">${ok ? "Saved" : "Save failed"}</span>
      <span>·</span>
      <span class="ds-ip-save-confirm-name">${ok ? safeFile : safeErr}</span>
      ${ok && safePath ? `<span>·</span><span class="ds-ip-save-confirm-path">${safePath}</span>` : ""}
    </div>
  `;

  s.saveConfirmTimer = setTimeout(() => {
    s.saveConfirmTimer = null;
    container.innerHTML = `<span class="ds-ip-helper">${getModeHelper(s.mode)}</span>`;
  }, 2500);
}

async function copyImage(node) {
  const s = state(node);
  const curFile = s.items[s.activeIndex]?.file || s.file;
  if (!curFile) return toast(node, "No image yet");
  try {
    const r = await fetch(url(`/ds/image_preview/preview?file=${encodeURIComponent(curFile)}`), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard image API unavailable");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(node, "Copied image");
  } catch (e) {
    error("copy failed", e);
    toast(node, "Copy failed");
  }
}

function openImage(node) {
  const s = state(node);
  const curFile = s.items[s.activeIndex]?.file || s.file;
  if (!curFile) return toast(node, "No image yet");
  const w = window.open(url(`/ds/image_preview/preview?file=${encodeURIComponent(curFile)}&t=${Date.now()}`), "_blank");
  if (!w) toast(node, "Popup blocked");
}

async function saveImage(node) {
  const s = state(node);
  const curFile = s.items[s.activeIndex]?.file || s.file;
  if (!curFile) return toast(node, "No image yet");
  const root = node._dsImagePreviewRoot;
  const saveBtn = root?.querySelector(".ds-ip-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add("is-saving");
    saveBtn.replaceChildren(DSIcon("refresh-cw", { size: 14 }));
  }
  try {
    const r = await api.fetchApi("/ds/image_preview/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: curFile, node_id: String(node.id) }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
    showSaveConfirmation(node, { ok: true, filename: d.filename, path: d.path });
    log("manual save", d.path);
  } catch (e) {
    error("save failed", e);
    showSaveConfirmation(node, { ok: false, error: e.message || "Save failed", filename: curFile });
  } finally {
    if (saveBtn) {
      saveBtn.classList.remove("is-saving");
      saveBtn.replaceChildren(DSIcon("save", { size: 14 }));
      saveBtn.disabled = !curFile;
    }
  }
}

function setupKeyListeners(card, node) {
  let isHovered = false;
  card.addEventListener("mouseenter", () => { isHovered = true; });
  card.addEventListener("mouseleave", () => { isHovered = false; });

  const onKeyDown = (e) => {
    const s = state(node);
    if (!isHovered && !card.contains(document.activeElement)) return;
    if (s.items.length <= 1) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      s.viewMode = s.viewMode === "grid" ? "single" : "grid";
      renderView(node);
      return;
    }

    if (s.viewMode === "single") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        navigatePhoto(node, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        navigatePhoto(node, 1);
      }
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  node._dsCleanKeyListeners = () => {
    window.removeEventListener("keydown", onKeyDown, true);
  };
}

function buildUI(node) {
  const card = document.createElement("div");
  card.className = "ds-ui-card ds-ip-card";
  card.dataset.dsThemed = "true";

  card.innerHTML = `
    <div class="ds-ip-options-row">
      <div class="ds-ip-tab-group" role="tablist">
        <button type="button" class="ds-ui-btn ds-ip-tab-btn active is-active" data-mode="preview" role="tab" aria-selected="true" title="Preview mode · Inspect without saving"></button>
        <button type="button" class="ds-ui-btn ds-ip-tab-btn" data-mode="save" role="tab" aria-selected="false" title="Save mode · Write every queued image to disk"></button>
      </div>
      <button type="button" class="ds-ui-btn ds-ip-btn ds-ip-copy" title="Copy image to clipboard"></button>
      <button type="button" class="ds-ui-btn ds-ip-btn ds-ip-open" title="Open image in new window"></button>
      <button type="button" class="ds-ui-btn ds-ip-btn ds-ip-save" title="Save output"></button>
    </div>
    <div class="ds-ip-info-row">
      <div class="ds-ip-info-message">
        <span class="ds-ip-helper">PREVIEW · Inspect the image without creating output files.</span>
      </div>
      <div class="ds-ip-info-meta">
        <span class="ds-ip-dims"></span>
        <div class="ds-ip-status"><span class="ds-ip-dot"></span><span class="ds-ip-status-text">READY</span></div>
      </div>
    </div>
    <div class="ds-ip-preview">
      <img class="ds-ip-image" alt="Image preview" hidden draggable="false">
      <div class="ds-ip-grid" hidden></div>
      <button type="button" class="ds-ip-tile-btn" title="View batch grid" hidden></button>
      <button type="button" class="ds-ip-nav-btn ds-ip-nav-prev" title="Previous photo (Left arrow)" hidden></button>
      <button type="button" class="ds-ip-nav-btn ds-ip-nav-next" title="Next photo (Right arrow)" hidden></button>
      <div class="ds-ip-index-pill" hidden></div>
      <div class="ds-ip-placeholder"><strong>READY</strong><span>Run the workflow to preview the image here.</span></div>
      <div class="ds-ip-toast"></div>
    </div>
  `;

  // Attach DSIcons
  const prevBtn = card.querySelector('.ds-ip-tab-btn[data-mode="preview"]');
  if (prevBtn) prevBtn.appendChild(DSIcon("eye", { size: 13 }));

  const saveTabBtn = card.querySelector('.ds-ip-tab-btn[data-mode="save"]');
  if (saveTabBtn) saveTabBtn.appendChild(DSIcon("download", { size: 13 }));

  const copyBtn = card.querySelector(".ds-ip-copy");
  if (copyBtn) copyBtn.appendChild(DSIcon("copy", { size: 14 }));

  const openBtn = card.querySelector(".ds-ip-open");
  if (openBtn) openBtn.appendChild(DSIcon("square-arrow-out-up-right", { size: 14 }));

  const saveBtn = card.querySelector(".ds-ip-save");
  if (saveBtn) saveBtn.appendChild(DSIcon("save", { size: 14 }));

  // In-Preview Multi-image Controls
  const tileBtn = card.querySelector(".ds-ip-tile-btn");
  if (tileBtn) tileBtn.appendChild(DSIcon("grid", { size: 14 }));

  const navPrevBtn = card.querySelector(".ds-ip-nav-prev");
  if (navPrevBtn) navPrevBtn.appendChild(DSIcon("chevron-left", { size: 20 }));

  const navNextBtn = card.querySelector(".ds-ip-nav-next");
  if (navNextBtn) navNextBtn.appendChild(DSIcon("chevron-right", { size: 20 }));

  // Event handlers
  card.querySelectorAll(".ds-ip-tab-btn").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setMode(node, b.dataset.mode); }));
  copyBtn.addEventListener("click", (e) => { e.stopPropagation(); copyImage(node); });
  openBtn.addEventListener("click", (e) => { e.stopPropagation(); openImage(node); });
  saveBtn.addEventListener("click", (e) => { e.stopPropagation(); saveImage(node); });

  tileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const s = state(node);
    s.viewMode = s.viewMode === "grid" ? "single" : "grid";
    renderView(node);
  });

  navPrevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigatePhoto(node, -1);
  });

  navNextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigatePhoto(node, 1);
  });

  return card;
}

function install(node) {
  if (node._dsImagePreviewInstalled) return;
  node._dsImagePreviewInstalled = true;
  node.resizable = true;
  node.properties ??= {};

  if (!Array.isArray(node.size) || node.size[0] < MIN_SIZE[0] || node.size[1] < MIN_SIZE[1]) {
    node.size = [...DEFAULT_SIZE];
  }
  state(node).mode = node.properties[MODE_PROP] === "save" ? "save" : "preview";

  cleanupNode(node);
  protectDSResizeCorners(node);

  const card = buildUI(node);
  node._dsImagePreviewRoot = card;
  normalizeDSWidgetHost(card, node, { shell: false });
  window.DSGlobalTheme?.bindNode?.(card, node);
  setupKeyListeners(card, node);

  const CARD_MARGIN = 5;
  if (typeof node.addDOMWidget === "function") {
    node._dsImagePreviewWidget = node.addDOMWidget("ds_image_preview_ui", "custom", card, {
      serialize: false,
      hideOnZoom: false,
      margin: CARD_MARGIN,
      getMinHeight: () => MIN_SIZE[1] - (node._dsImagePreviewWidget?.y || 42) - CARD_MARGIN,
      getHeight: () => {
        const widgetY = Number(node._dsImagePreviewWidget?.y ?? 42);
        const nodeHeight = Number(node.size?.[1] ?? DEFAULT_SIZE[1]);
        return Math.max(80, nodeHeight - widgetY - CARD_MARGIN);
      },
    });
  }
  const previewBox = card.querySelector(".ds-ip-preview");
  if (window.ResizeObserver && previewBox) {
    const ro = new ResizeObserver(() => {
      const s = state(node);
      if (s.viewMode === "grid") {
        const grid = previewBox.querySelector(".ds-ip-grid");
        if (grid && !grid.hidden) renderGridContent(node, grid);
      }
    });
    ro.observe(previewBox);
    node._dsResizeObserver = ro;
  }

  cleanupNode(node);
  renderMode(node);
  renderView(node);
  log("node installed", node.id);
}

let isBatchActive = false;
let lastKnownRemaining = 0;

function installQueueTracking() {
  if (app._dsImagePreviewQueueTrackingInstalled) return;
  app._dsImagePreviewQueueTrackingInstalled = true;

  const origQueue = app.queuePrompt?.bind(app);
  if (origQueue) {
    app.queuePrompt = async function (number, batchCount, ...rest) {
      let count = 1;
      if (typeof batchCount === "number") {
        count = batchCount;
      } else {
        const el = document.getElementById("batchCountInput")
          || document.querySelector(".comfy-menu-batch-count input")
          || app.ui?.batchCountInput;
        if (el && el.value) {
          count = parseInt(el.value, 10) || 1;
        }
      }

      const allNodes = app.graph?._nodes || [];
      if (count > 1) {
        isBatchActive = true;
        for (const n of allNodes) {
          if (n.type === TYPE) {
            n._dsNewBatchPending = true;
            n._dsInBatchQueue = true;
          }
        }
      } else {
        isBatchActive = false;
        for (const n of allNodes) {
          if (n.type === TYPE) {
            n._dsSingleRunPending = true;
            n._dsInBatchQueue = false;
          }
        }
      }

      return origQueue(number, batchCount, ...rest);
    };
  }

  api.addEventListener("status", (e) => {
    const remaining = e.detail?.exec_info?.queue_remaining ?? e.detail?.status?.exec_info?.queue_remaining ?? 0;
    if (lastKnownRemaining === 0 && remaining > 1 && !isBatchActive) {
      isBatchActive = true;
      for (const n of (app.graph?._nodes || [])) {
        if (n.type === TYPE) {
          n._dsNewBatchPending = true;
          n._dsInBatchQueue = true;
        }
      }
    }
    if (remaining === 0) {
      isBatchActive = false;
      for (const n of (app.graph?._nodes || [])) {
        if (n.type === TYPE) {
          n._dsInBatchQueue = false;
        }
      }
    }
    lastKnownRemaining = remaining;
  });

  api.addEventListener("execution_interrupted", () => {
    isBatchActive = false;
    for (const n of (app.graph?._nodes || [])) {
      if (n.type === TYPE) {
        n._dsInBatchQueue = false;
      }
    }
  });
}

function installPromptHook() {
  if (app._dsImagePreviewGraphToPromptHook) return;
  app._dsImagePreviewGraphToPromptHook = true;
  const original = app.graphToPrompt?.bind(app);
  if (!original) return;
  app.graphToPrompt = async function (...args) {
    const result = await original(...args);
    try {
      const out = result?.output || {};
      for (const id in out) {
        const entry = out[id];
        if (!entry || entry.class_type !== TYPE || !entry.inputs) continue;
        let node = app.graph?.getNodeById?.(id);
        if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(id));
        if (!node) continue;
        entry.inputs.SaveMode = state(node).mode || "preview";
      }
    } catch (e) {
      error("graphToPrompt error", e);
    }
    return result;
  };
}

app.registerExtension({
  name: EXT,
  async setup() {
    await loadCss();
    installPromptHook();
    installQueueTracking();
    api.addEventListener("executed", (e) => {
      const data = e.detail;
      const frames = data?.output?.ds_image_preview;
      if (!frames?.length) return;
      let node = app.graph?.getNodeById?.(data.node);
      if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(data.node));
      if (!node || node.type !== TYPE) return;

      const info = frames[0];
      const shouldReset = node._dsNewBatchPending || node._dsSingleRunPending;
      node._dsNewBatchPending = false;
      node._dsSingleRunPending = false;

      setImage(node, info, !shouldReset && Boolean(node._dsInBatchQueue));

      const status = node._dsImagePreviewRoot?.querySelector(".ds-ip-status-text");
      if (status) status.textContent = state(node).mode === "save" ? "SAVED" : "PREVIEW";
      log("executed", { node: data.node, mode: info.mode, count: state(node).items.length });
    });
    log("extension ready");
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;
    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      attachNodeShortcuts(this);
      const result = oldCreated?.apply(this, arguments);
      install(this);
      return result;
    };
    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = oldConfigure?.apply(this, arguments);
      if (!this.properties) this.properties = {};
      const s = state(this);
      const loadedMode = this.properties[MODE_PROP] === "save" ? "save" : "preview";
      s.mode = loadedMode;
      this.properties[MODE_PROP] = loadedMode;
      cleanupNode(this);
      renderMode(this);

      if (Array.isArray(this.properties.ds_ip_last_items) && this.properties.ds_ip_last_items.length) {
        s.items = [...this.properties.ds_ip_last_items];
        s.count = s.items.length;
        s.activeIndex = Math.max(0, s.items.length - 1);
        setTimeout(() => renderView(this), 80);
      } else if (this.properties.ds_ip_last_file) {
        setTimeout(() => setImage(this, {
          file: this.properties.ds_ip_last_file,
          width: this.properties.ds_ip_last_width || 0,
          height: this.properties.ds_ip_last_height || 0,
          count: 1,
        }), 80);
      }
      return result;
    };
    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (size[0] < MIN_SIZE[0]) size[0] = MIN_SIZE[0];
      if (size[1] < MIN_SIZE[1]) size[1] = MIN_SIZE[1];
      const res = oldResize?.apply(this, arguments);
      const s = state(this);
      if (s.viewMode === "grid") {
        const grid = this._dsImagePreviewRoot?.querySelector(".ds-ip-grid");
        if (grid) renderGridContent(this, grid);
      }
      return res;
    };
    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      clearTimeout(this._dsImagePreviewState?.toastTimer);
      clearTimeout(this._dsImagePreviewState?.saveConfirmTimer);
      this._dsCleanKeyListeners?.();
      this._dsResizeObserver?.disconnect?.();
      return oldRemoved?.apply(this, arguments);
    };
  },
});
