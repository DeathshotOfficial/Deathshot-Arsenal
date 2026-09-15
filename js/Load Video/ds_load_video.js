/**
 * DS Load Video - Frontend LiteGraph Canvas & DOM UI
 * Deathshot Arsenal / DS Node Pack
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_LoadVideo";
const EXT = "DeathshotArsenal.LoadVideo";
const PROP = "ds_load_video_state";

const DEFAULT_W = 380;
const DEFAULT_H = 500;
const MIN_W = 320;
const MIN_H = 340;

const FORMAT_OPTIONS = [
  "None",
  "AnimateDiff",
  "Mochi",
  "LTXV",
  "Hunyuan",
  "Cosmos",
  "Wan",
  "H3"
];

const ICONS = {
  upload: `<svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>`,
  prev: `<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`,
  next: `<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
  dropdownArrow: `<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  volumeUp: `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  volumeMute: `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
  fullscreen: `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  videoPlaceholder: `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  stepUp: `<svg viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>`,
  stepDown: `<svg viewBox="0 0 24 24"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>`,
};

let cssLoaded = false;
function loadCSS() {
  if (cssLoaded || document.querySelector("link[data-ds-load-video-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dsLoadVideoCss = "true";
  link.href = new URL("./ds_load_video.css", import.meta.url).href;
  document.head.appendChild(link);
  cssLoaded = true;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getDefaultState() {
  return {
    video: "",
    force_rate: 0,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: 0,
    skip_first_frames: 0,
    select_every_nth: 1,
    format: "LTXV",
    collapsed: true,
    node_size: [DEFAULT_W, DEFAULT_H],
    user_resized: false,
  };
}

function getState(node) {
  if (!node._dsState) {
    let s = null;
    try {
      const raw = node.properties?.[PROP];
      if (raw) s = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {}
    if (node.id != null) {
      try {
        const raw = localStorage.getItem(`DS_LOAD_VIDEO_STATE_${node.id}`);
        if (raw) {
          const l = JSON.parse(raw);
          s = Object.assign(s || {}, l);
        }
      } catch {}
    }
    node._dsState = Object.assign(getDefaultState(), s || {});
  }
  return node._dsState;
}

function syncFromWidgets(node) {
  const s = getState(node);
  if (!node.widgets) return;
  for (const w of node.widgets) {
    if (!w || !w.name) continue;
    if (w.name in s && w.value !== undefined && w.value !== null && w.value !== "") {
      if (typeof s[w.name] === "number") {
        s[w.name] = Number(w.value) || 0;
      } else {
        s[w.name] = String(w.value);
      }
    }
  }
}

function persistState(node) {
  if (!node) return;
  const s = getState(node);
  if (Array.isArray(node.size)) {
    s.node_size = [node.size[0], node.size[1]];
  }
  node.properties = node.properties || {};
  node.properties[PROP] = JSON.stringify(s);

  // Synchronize hidden widgets for ComfyUI backend execution
  if (node.widgets) {
    for (const w of node.widgets) {
      if (!w || !w.name) continue;
      if (w.name in s) {
        w.value = s[w.name];
      }
      if (w.name === "ds_load_video_state") {
        w.value = node.properties[PROP];
      }
    }
  }

  // 1. LocalStorage per-node persistence
  if (node.id != null) {
    try {
      localStorage.setItem(`DS_LOAD_VIDEO_STATE_${node.id}`, JSON.stringify(s));
    } catch {}
  }

  // 2. LocalStorage global last video persistence
  if (s.video) {
    try {
      localStorage.setItem("DS_LOAD_VIDEO_GLOBAL_LAST", JSON.stringify(s));
    } catch {}
  }

  // 3. Backend persistence
  if (node.id != null) {
    try {
      fetch("/ds/load_video/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: node.id,
          video: s.video || "",
          collapsed: !!s.collapsed,
          node_size: s.node_size,
          format: s.format,
          user_resized: !!s.user_resized,
        }),
      }).catch(() => {});
    } catch {}
  }

  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch {}
}

function restoreState(node) {
  if (!node) return;
  const s = getState(node);

  // Read any initial widget values
  syncFromWidgets(node);

  let saved = {};

  // 1. Widget ds_load_video_state (workflow snapshot)
  const stateWidget = node.widgets?.find((w) => w?.name === "ds_load_video_state");
  if (stateWidget?.value) {
    try {
      const raw = Array.isArray(stateWidget.value) ? stateWidget.value.join("") : String(stateWidget.value);
      if (raw) Object.assign(saved, JSON.parse(raw));
    } catch {}
  }

  // 2. Node properties
  if (node.properties?.[PROP]) {
    try {
      const raw = node.properties[PROP];
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (p) Object.assign(saved, p);
    } catch {}
  }

  // 3. Server-persisted state cache
  if (node.id != null && window._ds_load_video_server_nodes?.[String(node.id)]) {
    Object.assign(saved, window._ds_load_video_server_nodes[String(node.id)]);
  }

  // 4. LocalStorage for this specific node (highest client session precedence)
  if (node.id != null) {
    try {
      const raw = localStorage.getItem(`DS_LOAD_VIDEO_STATE_${node.id}`);
      if (raw) Object.assign(saved, JSON.parse(raw));
    } catch {}
  }

  // 5. Fallback for video from primary 'video' widget if still empty
  const videoWidget = node.widgets?.find((w) => w?.name === "video");
  if (!saved.video && videoWidget?.value) {
    saved.video = String(videoWidget.value);
  }

  // 6. Global last video fallback if no video found anywhere
  if (!saved.video) {
    if (window._ds_load_video_last_video) {
      saved.video = window._ds_load_video_last_video;
    } else {
      try {
        const raw = localStorage.getItem("DS_LOAD_VIDEO_GLOBAL_LAST");
        if (raw) {
          const g = JSON.parse(raw);
          if (g?.video) saved.video = g.video;
        }
      } catch {}
    }
  }

  if (saved && typeof saved === "object") {
    Object.assign(s, saved);
  }

  if (typeof s.collapsed !== "boolean") {
    s.collapsed = true;
  }

  if (Array.isArray(s.node_size) && s.node_size[0] >= MIN_W && s.node_size[1] >= MIN_H) {
    node.size = [s.node_size[0], s.node_size[1]];
  }

  renderNode(node);
  persistState(node);
}

function adjustPreviewToVideo(node, w, h, force = false) {
  if (!w || !h || !node?.size) return;
  const s = getState(node);
  const currentW = Math.max(MIN_W, node.size[0] || DEFAULT_W);
  const contentW = currentW - 14;
  const aspect = w / h;

  // Calculate adequate viewport height for this aspect ratio (clamped between 180 and 520)
  const idealViewportH = Math.max(180, Math.min(520, Math.round(contentW / aspect)));
  const optionsH = s.collapsed ? 0 : 210;
  const fixedUI = 28 + 5 + 28 + 5 + 20 + 5 + optionsH + 20 + 28 + 24;
  const targetH = Math.max(MIN_H, fixedUI + idealViewportH);

  // If forced (e.g. double-click) or if user hasn't explicitly resized the node and it's too cramped
  if (force || (!s.user_resized && node.size[1] < targetH)) {
    node.size[0] = currentW;
    node.size[1] = targetH;
    s.node_size = [node.size[0], node.size[1]];
    persistState(node);
    node.setDirtyCanvas?.(true, true);
  }
}

function hideWidgets(node) {
  if (!node.widgets) return;
  for (const w of node.widgets) {
    if (w?.name === "load_video_ui") continue;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, 0];
    w.draw = () => {};
    if (w.element) w.element.style.display = "none";
  }
}

function attachStepper(btnUp, btnDown, getValue, setValue, step = 1, min = 0, isFloat = false) {
  let timer = null;
  let interval = null;

  const stepVal = (delta) => {
    let cur = Number(getValue()) || 0;
    let next = cur + delta;
    if (min !== null) next = Math.max(min, next);
    if (isFloat) next = Math.round(next * 100) / 100;
    else next = Math.round(next);
    setValue(next);
  };

  const stopHold = () => {
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    timer = null;
    interval = null;
    window.removeEventListener("pointerup", stopHold);
    window.removeEventListener("pointercancel", stopHold);
  };

  const startHold = (delta) => {
    stopHold();
    stepVal(delta);
    timer = setTimeout(() => {
      interval = setInterval(() => {
        stepVal(delta);
      }, 100);
    }, 300);
    window.addEventListener("pointerup", stopHold);
    window.addEventListener("pointercancel", stopHold);
  };

  btnUp.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    startHold(step);
  });
  btnDown.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    startHold(-step);
  });
}

function buildUI(node) {
  const root = document.createElement("div");
  root.className = "ds-lv-root";
  root.dataset.dsThemed = "true";

  root.innerHTML = `
    <!-- Hidden File Input for Video Upload -->
    <input type="file" accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v" style="display: none;" data-file-input />

    <!-- Section 4: Full-Width Upload Button -->
    <button class="ds-lv-upload-btn" data-btn-upload title="Upload Video from local disk">
      ${ICONS.upload}
      <span>Upload Video</span>
    </button>

    <!-- Section 5 & 6: File Browser Row -->
    <div class="ds-lv-file-row">
      <button class="ds-lv-nav-btn" data-btn-prev title="Previous video in same folder" disabled>
        ${ICONS.prev}
      </button>
      <div class="ds-lv-filename-box">
        <div class="ds-lv-filename-text" data-filename-text>No video selected</div>
        <div class="ds-lv-file-count-badge" data-file-count></div>
      </div>
      <button class="ds-lv-nav-btn" data-btn-next title="Next video in same folder" disabled>
        ${ICONS.next}
      </button>
    </div>

    <!-- Section 9: Collapsible Options Header -->
    <div class="ds-lv-collapse-header" data-collapse-header title="Toggle Advanced Video Options">
      <div class="ds-lv-collapse-left">
        <span class="ds-lv-collapse-icon">${ICONS.chevron}</span>
        <span>Video Options</span>
      </div>
    </div>

    <!-- Section 10: Space-Efficient Two-Options-Per-Row Grid -->
    <div class="ds-lv-options-panel" data-options-panel>
      <div class="ds-lv-options-grid">
        <!-- Row 1: force_rate | custom_width -->
        <div class="ds-lv-option-item">
          <div class="ds-lv-option-label-row">
            <span class="ds-lv-option-label">force_rate</span>
          </div>
          <div class="ds-lv-stepper-box">
            <input type="number" min="0" step="1" class="ds-lv-num-input" data-input-force-rate />
            <div class="ds-lv-stepper-actions">
              <button class="ds-lv-stepper-btn" data-step-up-force-rate>${ICONS.stepUp}</button>
              <button class="ds-lv-stepper-btn" data-step-down-force-rate>${ICONS.stepDown}</button>
            </div>
          </div>
          <div class="ds-lv-detected-hint" data-hint-fps>Detected: — FPS</div>
        </div>

        <div class="ds-lv-option-item">
          <div class="ds-lv-option-label-row">
            <span class="ds-lv-option-label">custom_width</span>
          </div>
          <div class="ds-lv-stepper-box">
            <input type="number" min="0" step="8" class="ds-lv-num-input" data-input-custom-width />
            <div class="ds-lv-stepper-actions">
              <button class="ds-lv-stepper-btn" data-step-up-custom-width>${ICONS.stepUp}</button>
              <button class="ds-lv-stepper-btn" data-step-down-custom-width>${ICONS.stepDown}</button>
            </div>
          </div>
          <div class="ds-lv-detected-hint">0 = original</div>
        </div>

        <!-- Row 2: custom_height | frame_load_cap -->
        <div class="ds-lv-option-item">
          <div class="ds-lv-option-label-row">
            <span class="ds-lv-option-label">custom_height</span>
          </div>
          <div class="ds-lv-stepper-box">
            <input type="number" min="0" step="8" class="ds-lv-num-input" data-input-custom-height />
            <div class="ds-lv-stepper-actions">
              <button class="ds-lv-stepper-btn" data-step-up-custom-height>${ICONS.stepUp}</button>
              <button class="ds-lv-stepper-btn" data-step-down-custom-height>${ICONS.stepDown}</button>
            </div>
          </div>
          <div class="ds-lv-detected-hint">0 = original</div>
        </div>

        <div class="ds-lv-option-item">
          <div class="ds-lv-option-label-row">
            <span class="ds-lv-option-label">frame_load_cap</span>
          </div>
          <div class="ds-lv-stepper-box">
            <input type="number" min="0" step="1" class="ds-lv-num-input" data-input-frame-load-cap />
            <div class="ds-lv-stepper-actions">
              <button class="ds-lv-stepper-btn" data-step-up-frame-load-cap>${ICONS.stepUp}</button>
              <button class="ds-lv-stepper-btn" data-step-down-frame-load-cap>${ICONS.stepDown}</button>
            </div>
          </div>
          <div class="ds-lv-detected-hint" data-hint-total-frames>Total: — frames</div>
        </div>

        <!-- Row 3: skip_first_frames | select_every_nth -->
        <div class="ds-lv-option-item">
          <div class="ds-lv-option-label-row">
            <span class="ds-lv-option-label">skip_first_frames</span>
          </div>
          <div class="ds-lv-stepper-box">
            <input type="number" min="0" step="1" class="ds-lv-num-input" data-input-skip-frames />
            <div class="ds-lv-stepper-actions">
              <button class="ds-lv-stepper-btn" data-step-up-skip-frames>${ICONS.stepUp}</button>
              <button class="ds-lv-stepper-btn" data-step-down-skip-frames>${ICONS.stepDown}</button>
            </div>
          </div>
          <div class="ds-lv-detected-hint">0 = from start</div>
        </div>

        <div class="ds-lv-option-item">
          <div class="ds-lv-option-label-row">
            <span class="ds-lv-option-label">select_every_nth</span>
          </div>
          <div class="ds-lv-stepper-box">
            <input type="number" min="1" step="1" class="ds-lv-num-input" data-input-select-nth />
            <div class="ds-lv-stepper-actions">
              <button class="ds-lv-stepper-btn" data-step-up-select-nth>${ICONS.stepUp}</button>
              <button class="ds-lv-stepper-btn" data-step-down-select-nth>${ICONS.stepDown}</button>
            </div>
          </div>
          <div class="ds-lv-detected-hint">1 = every frame</div>
        </div>
      </div>

      <!-- Section 18 & 19: Full-Width Format Dropdown -->
      <div class="ds-lv-format-row">
        <span class="ds-lv-format-header">Format</span>
        <button class="ds-lv-format-trigger" data-format-trigger>
          <span data-format-label>LTXV</span>
          ${ICONS.dropdownArrow}
        </button>
      </div>
    </div>

    <!-- Section 21 - 25: Large Video Preview Area & Custom Player -->
    <div class="ds-lv-preview-container" data-preview-container>
      <!-- Section 25: Compact Video Metadata Display -->
      <div class="ds-lv-meta-bar" data-meta-bar>
        <span data-meta-dims>— × —</span>
        <span data-meta-fps>— FPS</span>
        <span data-meta-dur>0.0s</span>
        <span data-meta-total>— frames</span>
      </div>

      <!-- Video Viewport -->
      <div class="ds-lv-viewport" data-viewport>
        <video class="ds-lv-video" data-video playsinline loop preload="auto"></video>

        <!-- Overlay Status (Loading / Empty / Error) -->
        <div class="ds-lv-status-overlay" data-status-overlay>
          ${ICONS.videoPlaceholder}
          <div class="ds-lv-status-title" data-status-title>No video selected</div>
          <div class="ds-lv-status-hint" data-status-hint>Upload or select a video to preview</div>
          <button class="ds-lv-status-btn" data-status-upload-btn style="display: none;">Upload Video</button>
        </div>
      </div>

      <!-- Section 23 & 36: Custom Video Player Controls Bar -->
      <div class="ds-lv-controls-bar">
        <button class="ds-lv-ctrl-btn" data-btn-play title="Play / Pause">
          ${ICONS.play}
        </button>
        <div class="ds-lv-progress-wrap" data-progress-wrap title="Seek time">
          <div class="ds-lv-progress-track">
            <div class="ds-lv-progress-fill" data-progress-fill></div>
          </div>
        </div>
        <div class="ds-lv-time">
          <span class="ds-lv-time-cur" data-time-cur>00:00</span> / <span data-time-dur>00:00</span>
        </div>
        <div class="ds-lv-audio-pill" data-audio-pill title="Toggle Audio">
          ${ICONS.volumeMute}
          <span>Mute</span>
        </div>
        <button class="ds-lv-ctrl-btn" data-btn-fullscreen title="Fullscreen preview">
          ${ICONS.fullscreen}
        </button>
      </div>
    </div>
  `;

  // Attach element refs
  node._dom = {
    root,
    fileInput: root.querySelector("[data-file-input]"),
    btnUpload: root.querySelector("[data-btn-upload]"),
    btnPrev: root.querySelector("[data-btn-prev]"),
    btnNext: root.querySelector("[data-btn-next]"),
    filenameText: root.querySelector("[data-filename-text]"),
    fileCount: root.querySelector("[data-file-count]"),
    collapseHeader: root.querySelector("[data-collapse-header]"),
    optionsPanel: root.querySelector("[data-options-panel]"),

    // Numeric inputs
    inputForceRate: root.querySelector("[data-input-force-rate]"),
    hintFps: root.querySelector("[data-hint-fps]"),
    inputCustomWidth: root.querySelector("[data-input-custom-width]"),
    inputCustomHeight: root.querySelector("[data-input-custom-height]"),
    inputFrameLoadCap: root.querySelector("[data-input-frame-load-cap]"),
    hintTotalFrames: root.querySelector("[data-hint-total-frames]"),
    inputSkipFrames: root.querySelector("[data-input-skip-frames]"),
    inputSelectNth: root.querySelector("[data-input-select-nth]"),

    // Format dropdown
    formatTrigger: root.querySelector("[data-format-trigger]"),
    formatLabel: root.querySelector("[data-format-label]"),

    // Metadata bar
    metaBar: root.querySelector("[data-meta-bar]"),
    metaDims: root.querySelector("[data-meta-dims]"),
    metaFps: root.querySelector("[data-meta-fps]"),
    metaDur: root.querySelector("[data-meta-dur]"),
    metaTotal: root.querySelector("[data-meta-total]"),

    // Player
    viewport: root.querySelector("[data-viewport]"),
    video: root.querySelector("[data-video]"),
    statusOverlay: root.querySelector("[data-status-overlay]"),
    statusTitle: root.querySelector("[data-status-title]"),
    statusHint: root.querySelector("[data-status-hint]"),
    statusUploadBtn: root.querySelector("[data-status-upload-btn]"),

    // Controls
    btnPlay: root.querySelector("[data-btn-play]"),
    progressWrap: root.querySelector("[data-progress-wrap]"),
    progressFill: root.querySelector("[data-progress-fill]"),
    timeCur: root.querySelector("[data-time-cur]"),
    timeDur: root.querySelector("[data-time-dur]"),
    audioPill: root.querySelector("[data-audio-pill]"),
    btnFullscreen: root.querySelector("[data-btn-fullscreen]"),
  };

  wireEvents(node);
  renderNode(node);

  return root;
}

function wireEvents(node) {
  const d = node._dom;
  const s = getState(node);

  // 1. Upload Video
  d.btnUpload.addEventListener("click", () => d.fileInput.click());
  d.statusUploadBtn.addEventListener("click", () => d.fileInput.click());

  d.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showStatus(node, "Uploading video...", "Transferring to server");
      const formData = new FormData();
      formData.append("image", file);
      formData.append("type", "input");

      const res = await api.fetchApi("/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      const data = await res.json();
      const uploadedName = data.subfolder ? `${data.subfolder}/${data.name}` : (data.name || file.name);

      s.video = uploadedName;
      persistState(node);
      await loadVideoData(node, s.video);
    } catch (err) {
      showError(node, "Upload failed", err.message);
    } finally {
      d.fileInput.value = "";
    }
  });

  // 2. Directory Navigation Buttons
  d.btnPrev.addEventListener("click", () => {
    if (node._dirData?.has_prev && node._dirData.prev_file) {
      const nextTarget = node._dirData.directory
        ? `${node._dirData.directory}/${node._dirData.prev_file}`
        : node._dirData.prev_file;
      s.video = nextTarget;
      persistState(node);
      loadVideoData(node, s.video);
    }
  });

  d.btnNext.addEventListener("click", () => {
    if (node._dirData?.has_next && node._dirData.next_file) {
      const nextTarget = node._dirData.directory
        ? `${node._dirData.directory}/${node._dirData.next_file}`
        : node._dirData.next_file;
      s.video = nextTarget;
      persistState(node);
      loadVideoData(node, s.video);
    }
  });

  // 3. Collapsible Options Toggle
  d.collapseHeader.addEventListener("click", () => {
    s.collapsed = !s.collapsed;
    const deltaH = s.collapsed ? -210 : 210;
    node.size[1] = Math.max(MIN_H, (node.size[1] || DEFAULT_H) + deltaH);
    s.node_size = [node.size[0], node.size[1]];
    persistState(node);
    renderCollapse(node);
    node.setDirtyCanvas?.(true, true);
  });

  // 4. Steppers & Numeric Inputs
  attachStepper(
    d.root.querySelector("[data-step-up-force-rate]"),
    d.root.querySelector("[data-step-down-force-rate]"),
    () => s.force_rate,
    (val) => {
      s.force_rate = Math.max(0, val);
      d.inputForceRate.value = s.force_rate;
      persistState(node);
    },
    1, 0, false
  );
  d.inputForceRate.addEventListener("change", () => {
    s.force_rate = Math.max(0, parseFloat(d.inputForceRate.value) || 0);
    d.inputForceRate.value = s.force_rate;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector("[data-step-up-custom-width]"),
    d.root.querySelector("[data-step-down-custom-width]"),
    () => s.custom_width,
    (val) => {
      s.custom_width = Math.max(0, val);
      d.inputCustomWidth.value = s.custom_width;
      persistState(node);
    },
    8, 0, false
  );
  d.inputCustomWidth.addEventListener("change", () => {
    s.custom_width = Math.max(0, parseInt(d.inputCustomWidth.value, 10) || 0);
    d.inputCustomWidth.value = s.custom_width;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector("[data-step-up-custom-height]"),
    d.root.querySelector("[data-step-down-custom-height]"),
    () => s.custom_height,
    (val) => {
      s.custom_height = Math.max(0, val);
      d.inputCustomHeight.value = s.custom_height;
      persistState(node);
    },
    8, 0, false
  );
  d.inputCustomHeight.addEventListener("change", () => {
    s.custom_height = Math.max(0, parseInt(d.inputCustomHeight.value, 10) || 0);
    d.inputCustomHeight.value = s.custom_height;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector("[data-step-up-frame-load-cap]"),
    d.root.querySelector("[data-step-down-frame-load-cap]"),
    () => s.frame_load_cap,
    (val) => {
      s.frame_load_cap = Math.max(0, val);
      d.inputFrameLoadCap.value = s.frame_load_cap;
      persistState(node);
    },
    1, 0, false
  );
  d.inputFrameLoadCap.addEventListener("change", () => {
    s.frame_load_cap = Math.max(0, parseInt(d.inputFrameLoadCap.value, 10) || 0);
    d.inputFrameLoadCap.value = s.frame_load_cap;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector("[data-step-up-skip-frames]"),
    d.root.querySelector("[data-step-down-skip-frames]"),
    () => s.skip_first_frames,
    (val) => {
      s.skip_first_frames = Math.max(0, val);
      d.inputSkipFrames.value = s.skip_first_frames;
      persistState(node);
    },
    1, 0, false
  );
  d.inputSkipFrames.addEventListener("change", () => {
    s.skip_first_frames = Math.max(0, parseInt(d.inputSkipFrames.value, 10) || 0);
    d.inputSkipFrames.value = s.skip_first_frames;
    persistState(node);
  });

  attachStepper(
    d.root.querySelector("[data-step-up-select-nth]"),
    d.root.querySelector("[data-step-down-select-nth]"),
    () => s.select_every_nth,
    (val) => {
      s.select_every_nth = Math.max(1, val);
      d.inputSelectNth.value = s.select_every_nth;
      persistState(node);
    },
    1, 1, false
  );
  d.inputSelectNth.addEventListener("change", () => {
    s.select_every_nth = Math.max(1, parseInt(d.inputSelectNth.value, 10) || 1);
    d.inputSelectNth.value = s.select_every_nth;
    persistState(node);
  });

  // 5. Format Dropdown (Custom Deathshot Popup Menu)
  d.formatTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    openFormatMenu(node);
  });

  // 6. Video Player Interactions
  d.viewport.addEventListener("click", (e) => {
    if (e.target.closest(".ds-lv-status-btn")) return;
    togglePlay(node);
  });

  d.btnPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay(node);
  });

  // Progress Seekbar
  let isSeeking = false;
  const seek = (e) => {
    const rect = d.progressWrap.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (d.video.duration) {
      d.video.currentTime = pos * d.video.duration;
      d.progressFill.style.width = `${pos * 100}%`;
      d.timeCur.textContent = formatTime(d.video.currentTime);
    }
  };

  d.progressWrap.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    isSeeking = true;
    seek(e);
    const onPointerMove = (ev) => {
      if (isSeeking) seek(ev);
    };
    const onPointerUp = () => {
      isSeeking = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  // Video playback timeupdate
  d.video.addEventListener("timeupdate", () => {
    if (isSeeking || !d.video.duration) return;
    const pct = (d.video.currentTime / d.video.duration) * 100;
    d.progressFill.style.width = `${pct}%`;
    d.timeCur.textContent = formatTime(d.video.currentTime);
  });

  d.video.addEventListener("loadedmetadata", () => {
    d.timeDur.textContent = formatTime(d.video.duration);
    hideStatus(node);
  });

  d.video.addEventListener("play", () => {
    d.btnPlay.innerHTML = ICONS.pause;
  });

  d.video.addEventListener("pause", () => {
    d.btnPlay.innerHTML = ICONS.play;
  });

  // Audio pill toggle
  d.video.muted = true;
  d.audioPill.addEventListener("click", (e) => {
    e.stopPropagation();
    d.video.muted = !d.video.muted;
    updateAudioPill(node);
  });

  // Fullscreen button
  d.btnFullscreen.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      d.viewport.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  // Double-click to snap aspect ratio
  d.metaBar?.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const vw = d.video.videoWidth || (node._dirData?.metadata?.width);
    const vh = d.video.videoHeight || (node._dirData?.metadata?.height);
    if (vw && vh) {
      adjustPreviewToVideo(node, vw, vh, true);
    }
  });
  if (d.metaBar) d.metaBar.title = "Double-click to snap fit video aspect ratio";

  d.video.addEventListener("loadedmetadata", () => {
    const vw = d.video.videoWidth || (node._dirData?.metadata?.width);
    const vh = d.video.videoHeight || (node._dirData?.metadata?.height);
    if (vw && vh) {
      adjustPreviewToVideo(node, vw, vh, false);
    }
  });
}

function togglePlay(node) {
  const v = node._dom?.video;
  if (!v || !v.src) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

function updateAudioPill(node) {
  const d = node._dom;
  if (!d) return;
  const isMuted = d.video.muted;
  d.audioPill.innerHTML = isMuted ? `${ICONS.volumeMute}<span>Mute</span>` : `${ICONS.volumeUp}<span>Audio</span>`;
  d.audioPill.classList.toggle("is-active", !isMuted);
}

function renderCollapse(node) {
  const s = getState(node);
  const d = node._dom;
  if (!d) return;
  d.collapseHeader.classList.toggle("is-open", !s.collapsed);
  d.optionsPanel.classList.toggle("is-collapsed", s.collapsed);
  node.setDirtyCanvas?.(true, true);
}

function openFormatMenu(node) {
  const d = node._dom;
  const s = getState(node);

  // Close existing dropdown
  const existing = document.querySelector(".ds-lv-format-dropdown");
  if (existing) existing.remove();

  d.formatTrigger.classList.add("is-active");

  const menu = document.createElement("div");
  menu.className = "ds-lv-format-dropdown";

  const rect = d.formatTrigger.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.width = `${rect.width}px`;

  FORMAT_OPTIONS.forEach((fmt) => {
    const item = document.createElement("div");
    item.className = "ds-lv-format-item";
    const isSel = (s.format === fmt);
    if (isSel) item.classList.add("is-selected");

    item.innerHTML = `<span>${fmt}</span>${isSel ? ICONS.check : ""}`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      s.format = fmt;
      d.formatLabel.textContent = fmt;
      persistState(node);
      closeMenu();
    });
    menu.appendChild(item);
  });

  const closeMenu = () => {
    d.formatTrigger.classList.remove("is-active");
    menu.remove();
    window.removeEventListener("pointerdown", onOutside);
  };

  const onOutside = (e) => {
    if (!menu.contains(e.target) && !d.formatTrigger.contains(e.target)) {
      closeMenu();
    }
  };

  document.body.appendChild(menu);
  setTimeout(() => window.addEventListener("pointerdown", onOutside), 10);
}

function showStatus(node, title, hint) {
  const d = node._dom;
  if (!d) return;
  d.statusTitle.textContent = title;
  d.statusHint.textContent = hint || "";
  d.statusUploadBtn.style.display = "none";
  d.statusOverlay.classList.remove("is-hidden");
}

function showError(node, title, hint) {
  const d = node._dom;
  if (!d) return;
  d.statusTitle.textContent = title;
  d.statusHint.textContent = hint || "";
  d.statusUploadBtn.style.display = "block";
  d.statusOverlay.classList.remove("is-hidden");
}

function hideStatus(node) {
  const d = node._dom;
  if (!d) return;
  d.statusOverlay.classList.add("is-hidden");
}

async function loadVideoData(node, videoPath) {
  const d = node._dom;
  if (!d) return;
  if (!videoPath) {
    showStatus(node, "No video selected", "Upload or select a video to preview");
    d.filenameText.textContent = "No video selected";
    d.fileCount.textContent = "";
    d.btnPrev.disabled = true;
    d.btnNext.disabled = true;
    d.video.removeAttribute("src");
    d.video.load();
    return;
  }

  showStatus(node, "Loading video...", "Scanning video information");

  try {
    const res = await api.fetchApi("/ds/load_video/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: videoPath }),
    });

    if (!res.ok) throw new Error(`Query failed: ${res.statusText}`);
    const data = await res.json();

    if (!data.ok) {
      showError(node, "Video unavailable", "File may have been moved or deleted");
      d.filenameText.textContent = videoPath.split(/[\/\\]/).pop();
      d.btnPrev.disabled = true;
      d.btnNext.disabled = true;
      d.video.removeAttribute("src");
      d.video.load();
      return;
    }

    node._dirData = data;
    const meta = data.metadata || {};

    // Update Section 5: Filename & badges
    d.filenameText.textContent = data.filename;
    d.filenameText.title = data.full_path;
    d.fileCount.textContent = data.total > 1 ? `(${data.index + 1}/${data.total})` : "";

    // Update Section 8: Navigation state
    d.btnPrev.disabled = !data.has_prev;
    d.btnNext.disabled = !data.has_next;

    // Update Section 17: Detected contextual hints
    d.hintFps.textContent = `Detected: ${meta.fps || 24} FPS`;
    d.hintTotalFrames.textContent = `Total: ${meta.frame_count || 0} frames`;

    // Update Section 25: Metadata display bar
    d.metaDims.textContent = `${meta.width || "—"} × ${meta.height || "—"}`;
    d.metaFps.textContent = `${meta.fps || 24} FPS`;
    d.metaDur.textContent = `${meta.duration || 0}s`;
    d.metaTotal.textContent = `${meta.frame_count || 0} frames`;

    // Update Section 21 & 22: Video Preview
    const previewUrl = `/ds/load_video/preview?path=${encodeURIComponent(data.full_path)}`;
    if (d.video.src !== previewUrl) {
      d.video.src = previewUrl;
      d.video.load();
      d.video.play().catch(() => {});
    }

    if (meta.width && meta.height) {
      adjustPreviewToVideo(node, meta.width, meta.height);
    }

    // Persist active video reference
    const s = getState(node);
    s.video = data.rel_name || data.filename;
    persistState(node);
    node.setDirtyCanvas?.(true, true);
  } catch (err) {
    showError(node, "Unable to load video", err.message);
  }
}

function renderNode(node) {
  const d = node._dom;
  if (!d) return;
  const s = getState(node);

  d.inputForceRate.value = s.force_rate;
  d.inputCustomWidth.value = s.custom_width;
  d.inputCustomHeight.value = s.custom_height;
  d.inputFrameLoadCap.value = s.frame_load_cap;
  d.inputSkipFrames.value = s.skip_first_frames;
  d.inputSelectNth.value = s.select_every_nth;
  d.formatLabel.textContent = s.format || "LTXV";

  renderCollapse(node);

  if (s.video) {
    loadVideoData(node, s.video);
  } else {
    showStatus(node, "No video selected", "Upload or select a video to preview");
  }
}

function patchNode(node) {
  if (!node || node.type !== TYPE) return;

  node.resizable = true;
  node.min_size = [MIN_W, MIN_H];

  const s = getState(node);
  if (Array.isArray(s.node_size) && s.node_size[0] >= MIN_W && s.node_size[1] >= MIN_H) {
    node.size = [s.node_size[0], s.node_size[1]];
  } else if (!Array.isArray(node.size) || node.size[0] < MIN_W || node.size[1] < MIN_H) {
    node.size = [DEFAULT_W, DEFAULT_H];
  }

  // Hook onResize to remember user custom sizing
  if (!node._dsResizeHooked) {
    node._dsResizeHooked = true;
    const origOnResize = node.onResize;
    node.onResize = function (size) {
      if (size[0] < MIN_W) size[0] = MIN_W;
      if (size[1] < MIN_H) size[1] = MIN_H;
      const st = getState(this);
      st.node_size = [size[0], size[1]];
      st.user_resized = true;
      persistState(this);
      return origOnResize?.apply(this, arguments);
    };
  }

  if (node._dsPatched) {
    hideWidgets(node);
    return;
  }
  node._dsPatched = true;
  loadCSS();

  syncFromWidgets(node);
  hideWidgets(node);

  const root = buildUI(node);
  const widget = node.addDOMWidget("load_video_ui", "custom", root, {
    serialize: false,
    hideOnZoom: false,
    getValue: () => null,
    setValue: () => {},
  });
  node._lvWidget = widget;

  widget.computeLayoutSize = () => ({
    minWidth: MIN_W,
    minHeight: MIN_H,
  });

  widget.onPointerDown = (pointer) => {
    const target = pointer?.eDown?.target;
    return !!target?.closest?.("button,input,textarea,select,video,.ds-lv-progress-wrap,.ds-lv-format-dropdown");
  };

  const oldSerialize = node.serialize;
  node.serialize = function () {
    persistState(this);
    return oldSerialize?.apply(this, arguments) || {};
  };

  const oldRemoved = node.onRemoved;
  node.onRemoved = function () {
    try {
      if (this._dom?.video) {
        this._dom.video.pause();
        this._dom.video.removeAttribute("src");
        this._dom.video.load();
      }
      if (this._dom?.root) {
        this._dom.root.remove();
      }
    } catch {}
    return oldRemoved?.apply(this, arguments);
  };

  setTimeout(() => {
    try {
      window.DSGlobalTheme?.bindNode?.(root, node);
      hideWidgets(node);
      restoreState(node);
      node.setDirtyCanvas?.(true, true);
    } catch {}
  }, 0);
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NORMAL != null ? LG.NORMAL : 0;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      patchNode(this);
      restoreState(this);
      return r;
    };

    const origConfigure = nodeType.prototype.configure || nodeType.prototype.onConfigure;
    nodeType.prototype.configure = function (info) {
      const r = origConfigure?.apply(this, arguments);
      setTimeout(() => {
        patchNode(this);
        restoreState(this);
      }, 30);
      return r;
    };

    const origSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      persistState(this);
      return origSerialize?.apply(this, arguments) || {};
    };
  },

  nodeCreated(node) {
    if (node?.type === TYPE) {
      patchNode(node);
      restoreState(node);
    }
  },

  loadedGraphNode(node) {
    if (node?.type === TYPE) {
      patchNode(node);
      restoreState(node);
    }
  },

  async setup() {
    loadCSS();

    // 1. Fetch server-persisted state
    try {
      const res = await fetch("/ds/load_video/state");
      if (res.ok) {
        const d = await res.json();
        window._ds_load_video_server_nodes = d.nodes || {};
        window._ds_load_video_last_video = d.last_video || "";
      }
    } catch {}

    // 2. Restore all DS_LoadVideo nodes on graph
    setTimeout(() => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          patchNode(n);
          restoreState(n);
          n.setDirtyCanvas?.(true, true);
        }
      }
    }, 50);

    window.addEventListener("ds-theme-changed", () => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && n._dom?.root) {
          window.DSGlobalTheme?.bindNode?.(n._dom.root, n);
        }
      }
    });
  },
});
