/**
 * DS Load Video - Unified UI Component & Video Player Overhaul
 * Deathshot Arsenal / DS Node Pack
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  installDSUI,
  Card,
  Button,
  Dropdown,
  Stepper,
  DSIcon,
  DSIconMarkup,
  VideoPlayerModal,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
} from "../UIElements/index.js";

const TYPE = "DS_LoadVideo";
const EXT = "DeathshotArsenal.LoadVideo";
const PROP = "ds_load_video_state";

const DEFAULT_W = 390;
const DEFAULT_H = 530;
const MIN_W = 300;
const MIN_H = 340;

const FORMAT_OPTIONS = [
  { id: "LTXV", label: "LTXV" },
  { id: "Wan", label: "Wan" },
  { id: "Hunyuan", label: "Hunyuan" },
  { id: "Mochi", label: "Mochi" },
  { id: "Cosmos", label: "Cosmos" },
  { id: "AnimateDiff", label: "AnimateDiff" },
  { id: "H3", label: "H3" },
  { id: "None", label: "None" },
];

const CSS_ID = "ds-load-video-ui-css";
const CSS_URL = new URL("./ds_load_video.css", import.meta.url).href;

function loadCSS() {
  const existing = document.getElementById(CSS_ID);
  if (existing) {
    existing.href = CSS_URL + "?t=" + Date.now();
    return;
  }
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = CSS_URL + "?t=" + Date.now();
  document.head.appendChild(link);
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getDefaultState() {
  return {
    version: 2,
    video: "",
    force_rate: 0,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: 0,
    skip_first_frames: 0,
    select_every_nth: 1,
    format: "LTXV",
    collapsed: true,
    volume: 1.0,
    muted: true,
    loop: true,
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

    // Explicit check for user's saved collapsed preference
    let savedCollapsed = null;
    if (node.id != null) {
      try {
        const nodeCol = localStorage.getItem(`DS_LOAD_VIDEO_COLLAPSED_${node.id}`);
        if (nodeCol !== null) savedCollapsed = (nodeCol === "1");
      } catch {}
    }
    if (savedCollapsed === null) {
      try {
        const globalCol = localStorage.getItem("DS_LOAD_VIDEO_GLOBAL_COLLAPSED");
        if (globalCol !== null) savedCollapsed = (globalCol === "1");
      } catch {}
    }
    if (savedCollapsed !== null) {
      node._dsState.collapsed = savedCollapsed;
    }
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
  node.properties["video"] = s.video || "";

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
      localStorage.setItem(`DS_LOAD_VIDEO_COLLAPSED_${node.id}`, s.collapsed ? "1" : "0");
    } catch {}
  }

  // 2. LocalStorage global persistence
  try {
    localStorage.setItem("DS_LOAD_VIDEO_GLOBAL_COLLAPSED", s.collapsed ? "1" : "0");
    if (s.video) {
      localStorage.setItem("DS_LOAD_VIDEO_GLOBAL_LAST", JSON.stringify(s));
    }
  } catch {}

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
          volume: s.volume,
          muted: !!s.muted,
          loop: !!s.loop,
        }),
      }).catch(() => {});
    } catch {}
  }

  try {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
  } catch {}
}

function restoreState(node) {
  if (!node) return;
  const s = getState(node);

  syncFromWidgets(node);

  let saved = {};

  // 1. Widget ds_load_video_state
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

  // 4. LocalStorage for this specific node
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

  // 6. Global last video fallback
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

  // Preserve user's local collapsed preference over stale server / widget cache
  let userCollapsedPref = null;
  if (node.id != null) {
    try {
      const c = localStorage.getItem(`DS_LOAD_VIDEO_COLLAPSED_${node.id}`);
      if (c !== null) userCollapsedPref = (c === "1");
    } catch {}
  }
  if (userCollapsedPref === null) {
    try {
      const g = localStorage.getItem("DS_LOAD_VIDEO_GLOBAL_COLLAPSED");
      if (g !== null) userCollapsedPref = (g === "1");
    } catch {}
  }

  if (saved && typeof saved === "object") {
    Object.assign(s, saved);
  }

  if (userCollapsedPref !== null) {
    s.collapsed = userCollapsedPref;
  } else if (typeof s.collapsed !== "boolean") {
    s.collapsed = true;
  }

  if (Array.isArray(s.node_size) && s.node_size[0] >= MIN_W && s.node_size[1] >= MIN_H) {
    node.size = [s.node_size[0], s.node_size[1]];
  }

  node._controller?.syncState();
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

/* ========================================================================= */
/* DS Load Video Controller                                                  */
/* ========================================================================= */
class DSLoadVideoController {
  constructor(node) {
    this.node = node;
    this.isSeeking = false;
    this.dirFiles = [];
    this.buildDOM();
    this.bindEvents();
    this.renderCollapse();
    this.loadDirectoryList();
  }

  buildDOM() {
    this.card = Card({ className: "ds-lv-card" });

    // Hidden native file input for upload
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v";
    this.fileInput.style.display = "none";
    this.card.root.appendChild(this.fileInput);

    // -------------------------------------------------------------------------
    // 1. Upload Video Button (Full-width, primary, clean)
    // -------------------------------------------------------------------------
    this.uploadBtn = Button({
      icon: "upload",
      label: "Upload Video",
      variant: "primary",
      tooltip: "Upload video from local disk to ComfyUI input folder",
      className: "ds-lv-upload-btn",
    });

    // -------------------------------------------------------------------------
    // 2. Dropdown & Navigation Row: [ < ] [ Video Dropdown Selector ] [ > ]
    //    Followed by the horizontal video files scroll row
    // -------------------------------------------------------------------------
    this.fileSection = document.createElement("div");
    this.fileSection.className = "ds-lv-file-section";

    this.navRow = document.createElement("div");
    this.navRow.className = "ds-lv-nav-row";

    this.prevBtn = Button({
      icon: "chevron-left",
      tooltip: "Previous video in folder",
      className: "ds-lv-nav-btn",
    });

    this.fileDropdown = Dropdown({
      options: [],
      value: "",
      compact: true,
      searchable: true,
      placeholder: "Choose video...",
      className: "ds-lv-file-dropdown",
      onChange: (val) => {
        const s = getState(this.node);
        s.video = val;
        persistState(this.node);
        this.loadVideo(val);
      },
    });

    this.nextBtn = Button({
      icon: "chevron-right",
      tooltip: "Next video in folder",
      className: "ds-lv-nav-btn",
    });

    this.navRow.append(this.prevBtn.root, this.fileDropdown.root, this.nextBtn.root);
    this.fileSection.append(this.navRow);

    // -------------------------------------------------------------------------
    // 3. Collapsible Video Options (NO SCROLLBAR, NARROW INPUTS)
    // -------------------------------------------------------------------------
    this.collapseSection = document.createElement("div");
    this.collapseSection.className = "ds-lv-collapse-section";

    this.collapseHeader = document.createElement("button");
    this.collapseHeader.type = "button";
    this.collapseHeader.className = "ds-lv-collapse-header";
    this.collapseHeader.title = "Toggle Video Options";

    this.collapseLeft = document.createElement("div");
    this.collapseLeft.className = "ds-lv-collapse-left";

    this.collapseIcon = document.createElement("span");
    this.collapseIcon.className = "ds-lv-collapse-icon";
    this.collapseIcon.appendChild(DSIcon("chevron-right", { size: 11 }));

    this.collapseTitle = document.createElement("span");
    this.collapseTitle.textContent = "Video Options";

    this.collapseLeft.append(this.collapseIcon, this.collapseTitle);

    this.collapseBadge = document.createElement("span");
    this.collapseBadge.className = "ds-lv-collapse-badge";
    this.collapseBadge.textContent = "LTXV";

    this.collapseHeader.append(this.collapseLeft, this.collapseBadge);
    this.collapseSection.appendChild(this.collapseHeader);

    // Options Panel (Completely visible, NO SCROLLBAR)
    this.optionsPanel = document.createElement("div");
    this.optionsPanel.className = "ds-lv-options-panel is-collapsed";

    // Format Profile Row
    this.formatRow = document.createElement("div");
    this.formatRow.className = "ds-lv-format-row";

    this.formatLabel = document.createElement("span");
    this.formatLabel.className = "ds-lv-format-label";
    this.formatLabel.textContent = "Format Profile";

    this.formatDropdownWrap = document.createElement("div");
    this.formatDropdownWrap.className = "ds-lv-format-dropdown-wrap";

    this.formatDropdown = Dropdown({
      options: FORMAT_OPTIONS,
      value: "LTXV",
      compact: true,
      onChange: (val) => {
        const s = getState(this.node);
        s.format = val;
        this.collapseBadge.textContent = val;
        persistState(this.node);
      },
    });

    this.formatDropdownWrap.appendChild(this.formatDropdown.root);
    this.formatRow.append(this.formatLabel, this.formatDropdownWrap);
    this.optionsPanel.appendChild(this.formatRow);

    // 2-Column Steppers Grid with Narrow Inputs
    this.optionsGrid = document.createElement("div");
    this.optionsGrid.className = "ds-lv-options-grid";

    // 1. Force Rate
    this.stepperForceRate = this.createOptionItem(
      "force_rate",
      "0 = native FPS",
      0, 240, 1,
      (val) => {
        const s = getState(this.node);
        s.force_rate = val;
        persistState(this.node);
      }
    );

    // 2. Custom Width
    this.stepperCustomWidth = this.createOptionItem(
      "custom_width",
      "0 = original width",
      0, 16384, 8,
      (val) => {
        const s = getState(this.node);
        s.custom_width = val;
        persistState(this.node);
      }
    );

    // 3. Custom Height
    this.stepperCustomHeight = this.createOptionItem(
      "custom_height",
      "0 = original height",
      0, 16384, 8,
      (val) => {
        const s = getState(this.node);
        s.custom_height = val;
        persistState(this.node);
      }
    );

    // 4. Frame Load Cap
    this.stepperFrameCap = this.createOptionItem(
      "frame_load_cap",
      "0 = load all frames",
      0, 1000000, 1,
      (val) => {
        const s = getState(this.node);
        s.frame_load_cap = val;
        persistState(this.node);
      }
    );

    // 5. Skip First Frames
    this.stepperSkipFrames = this.createOptionItem(
      "skip_first_frames",
      "0 = from frame 0",
      0, 1000000, 1,
      (val) => {
        const s = getState(this.node);
        s.skip_first_frames = val;
        persistState(this.node);
      }
    );

    // 6. Select Every Nth
    this.stepperSelectNth = this.createOptionItem(
      "select_every_nth",
      "1 = every frame",
      1, 1000, 1,
      (val) => {
        const s = getState(this.node);
        s.select_every_nth = Math.max(1, val);
        persistState(this.node);
      }
    );

    this.optionsGrid.append(
      this.stepperForceRate.root,
      this.stepperCustomWidth.root,
      this.stepperCustomHeight.root,
      this.stepperFrameCap.root,
      this.stepperSkipFrames.root,
      this.stepperSelectNth.root
    );

    this.optionsPanel.appendChild(this.optionsGrid);
    this.collapseSection.appendChild(this.optionsPanel);

    // -------------------------------------------------------------------------
    // 4. Video Preview Area (FLEXIBLE HEIGHT, CONTROLS DOCKED INSIDE)
    // -------------------------------------------------------------------------
    this.previewWrap = document.createElement("div");
    this.previewWrap.className = "ds-lv-preview-wrap";

    // Compact Metadata Display Bar at Top of Preview Area
    this.metaBar = document.createElement("div");
    this.metaBar.className = "ds-lv-meta-bar";
    this.metaBar.title = "Double-click to snap fit video aspect ratio";

    this.metaDims = document.createElement("span");
    this.metaDims.className = "ds-lv-meta-item ds-lv-meta-accent";
    this.metaDims.textContent = "— × —";

    this.metaFps = document.createElement("span");
    this.metaFps.className = "ds-lv-meta-item";
    this.metaFps.textContent = "— FPS";

    this.metaDur = document.createElement("span");
    this.metaDur.className = "ds-lv-meta-item";
    this.metaDur.textContent = "0.0s";

    this.metaFrames = document.createElement("span");
    this.metaFrames.className = "ds-lv-meta-item";
    this.metaFrames.textContent = "— frames";

    this.metaBar.append(this.metaDims, this.metaFps, this.metaDur, this.metaFrames);
    this.previewWrap.appendChild(this.metaBar);

    // Viewport
    this.viewport = document.createElement("div");
    this.viewport.className = "ds-lv-viewport";
    this.viewport.title = "Click to toggle Play/Pause";

    this.video = document.createElement("video");
    this.video.className = "ds-lv-video";
    this.video.playsInline = true;
    this.video.loop = true;
    this.video.muted = true;
    this.video.preload = "auto";
    this.viewport.appendChild(this.video);

    // Status Overlay
    this.statusOverlay = document.createElement("div");
    this.statusOverlay.className = "ds-lv-status-overlay";

    this.statusIcon = document.createElement("div");
    this.statusIcon.className = "ds-lv-status-icon";
    this.statusIcon.appendChild(DSIcon("play", { size: 24 }));

    this.statusTitle = document.createElement("div");
    this.statusTitle.className = "ds-lv-status-title";
    this.statusTitle.textContent = "No video selected";

    this.statusHint = document.createElement("div");
    this.statusHint.className = "ds-lv-status-hint";
    this.statusHint.textContent = "Upload or select a video to preview";

    this.statusUploadBtn = Button({
      icon: "upload",
      label: "Upload Video",
      variant: "primary",
      size: "compact",
      className: "ds-lv-status-btn",
    });

    this.statusOverlay.append(this.statusIcon, this.statusTitle, this.statusHint, this.statusUploadBtn.root);
    this.viewport.appendChild(this.statusOverlay);
    this.previewWrap.appendChild(this.viewport);

    // Controls Bar (Docked right at bottom inside the preview area)
    this.controlsBar = document.createElement("div");
    this.controlsBar.className = "ds-lv-controls-bar";

    this.playBtn = document.createElement("button");
    this.playBtn.type = "button";
    this.playBtn.className = "ds-lv-ctrl-btn";
    this.playBtn.title = "Play / Pause (Space)";
    this.playBtn.appendChild(DSIcon("play", { size: 12 }));

    this.progressWrap = document.createElement("div");
    this.progressWrap.className = "ds-lv-progress-wrap";
    this.progressWrap.title = "Seek video timeline";

    this.progressTrack = document.createElement("div");
    this.progressTrack.className = "ds-lv-progress-track";

    this.progressFill = document.createElement("div");
    this.progressFill.className = "ds-lv-progress-fill";

    this.progressThumb = document.createElement("div");
    this.progressThumb.className = "ds-lv-progress-thumb";

    this.progressFill.appendChild(this.progressThumb);
    this.progressTrack.appendChild(this.progressFill);
    this.progressWrap.appendChild(this.progressTrack);

    this.timeText = document.createElement("div");
    this.timeText.className = "ds-lv-time-text";
    this.timeCur = document.createElement("span");
    this.timeCur.className = "ds-lv-time-cur";
    this.timeCur.textContent = "00:00";
    this.timeDur = document.createElement("span");
    this.timeDur.textContent = "00:00";
    this.timeText.append(this.timeCur, " / ", this.timeDur);

    this.audioPill = document.createElement("button");
    this.audioPill.type = "button";
    this.audioPill.className = "ds-lv-audio-pill";
    this.audioPill.title = "Toggle Audio Mute";
    this.audioPill.innerHTML = `${DSIconMarkup("volume-x", { size: 11 })}<span>Mute</span>`;

    this.expandBtn = document.createElement("button");
    this.expandBtn.type = "button";
    this.expandBtn.className = "ds-lv-ctrl-btn";
    this.expandBtn.title = "Open in Video Player Modal";
    this.expandBtn.appendChild(DSIcon("maximize-2", { size: 11 }));

    this.controlsBar.append(
      this.playBtn,
      this.progressWrap,
      this.timeText,
      this.audioPill,
      this.expandBtn
    );
    this.previewWrap.appendChild(this.controlsBar);

    // -------------------------------------------------------------------------
    // Assemble Card in exact requested order:
    // Upload button -> Dropdown -> Collapsible menu -> Video preview area
    // -------------------------------------------------------------------------
    this.card.append(
      this.uploadBtn.root,
      this.fileSection,
      this.collapseSection,
      this.previewWrap
    );
  }

  createOptionItem(label, hintText, min, max, step, onChange) {
    const item = document.createElement("div");
    item.className = "ds-lv-option-item";

    const labelRow = document.createElement("div");
    labelRow.className = "ds-lv-option-label-row";

    const labelEl = document.createElement("span");
    labelEl.className = "ds-lv-option-label";
    labelEl.textContent = label;

    labelRow.appendChild(labelEl);

    const stepper = Stepper({
      min,
      max,
      step,
      value: min,
      onChange: (val) => onChange(val),
    });

    const hintEl = document.createElement("div");
    hintEl.className = "ds-lv-detected-hint";
    hintEl.textContent = hintText;

    item.append(labelRow, stepper.root, hintEl);

    return {
      root: item,
      stepper,
      hintEl,
      setHint: (txt) => {
        hintEl.textContent = txt;
      },
    };
  }

  bindEvents() {
    const s = getState(this.node);

    // 1. Upload Video Action
    const triggerUpload = () => this.fileInput.click();
    this.uploadBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerUpload();
    });
    this.statusUploadBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerUpload();
    });

    this.fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        this.showStatus("Uploading video...", "Transferring to server");
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
        persistState(this.node);
        await this.loadDirectoryList();
        await this.loadVideo(s.video);
      } catch (err) {
        this.showError("Upload failed", err.message);
      } finally {
        this.fileInput.value = "";
      }
    });

    // Drag and drop video file onto preview
    this.previewWrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.previewWrap.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith("video/")) return;
      try {
        this.showStatus("Uploading video...", file.name);
        const formData = new FormData();
        formData.append("image", file);
        formData.append("type", "input");
        const res = await api.fetchApi("/upload/image", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
        const data = await res.json();
        const uploadedName = data.subfolder ? `${data.subfolder}/${data.name}` : (data.name || file.name);
        s.video = uploadedName;
        persistState(this.node);
        await this.loadDirectoryList();
        await this.loadVideo(s.video);
      } catch (err) {
        this.showError("Upload failed", err.message);
      }
    });

    // 2. Navigation Buttons (Prev / Next)
    this.prevBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleVideo(-1);
    });
    this.nextBtn.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleVideo(1);
    });

    // 4. Video Viewport Play/Pause
    this.viewport.addEventListener("click", (e) => {
      if (e.target.closest(".ds-lv-status-btn")) return;
      this.togglePlay();
    });
    this.playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePlay();
    });

    // 5. Progress Scrubber
    const seek = (e) => {
      const rect = this.progressTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (this.video.duration) {
        this.video.currentTime = pos * this.video.duration;
        this.progressFill.style.width = `${pos * 100}%`;
        this.timeCur.textContent = formatTime(this.video.currentTime);
      }
    };

    this.progressWrap.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.isSeeking = true;
      seek(e);
      const onMove = (ev) => {
        if (this.isSeeking) seek(ev);
      };
      const onUp = () => {
        this.isSeeking = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    this.video.addEventListener("timeupdate", () => {
      if (this.isSeeking || !this.video.duration) return;
      const pct = (this.video.currentTime / this.video.duration) * 100;
      this.progressFill.style.width = `${pct}%`;
      this.timeCur.textContent = formatTime(this.video.currentTime);
    });

    this.video.addEventListener("loadedmetadata", () => {
      this.timeDur.textContent = formatTime(this.video.duration);
      this.hideStatus();
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      if (vw && vh) {
        this.adjustPreviewToVideo(vw, vh, false);
      }
    });

    this.video.addEventListener("play", () => {
      this.playBtn.replaceChildren(DSIcon("pause", { size: 12 }));
    });
    this.video.addEventListener("pause", () => {
      this.playBtn.replaceChildren(DSIcon("play", { size: 12 }));
    });

    // 6. Audio Mute Pill
    this.audioPill.addEventListener("click", (e) => {
      e.stopPropagation();
      this.video.muted = !this.video.muted;
      s.muted = this.video.muted;
      this.updateAudioPill();
      persistState(this.node);
    });

    // 7. Full Player Modal Button
    this.expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openModalPlayer();
    });

    // 8. Double-click metadata or viewport to snap aspect ratio (touch edges with zero gap)
    this.metaBar.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const vw = this.video.videoWidth || this.node._videoMeta?.width;
      const vh = this.video.videoHeight || this.node._videoMeta?.height;
      if (vw && vh) {
        this.adjustPreviewToVideo(vw, vh, true);
      }
    });
    this.viewport.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const vw = this.video.videoWidth || this.node._videoMeta?.width;
      const vh = this.video.videoHeight || this.node._videoMeta?.height;
      if (vw && vh) {
        this.adjustPreviewToVideo(vw, vh, true);
      }
    });

    // 10. Collapsible Options Toggle (STRICTLY NO NODE RESIZING!)
    this.collapseHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      s.collapsed = !s.collapsed;
      if (this.node?.id != null) {
        try {
          localStorage.setItem(`DS_LOAD_VIDEO_COLLAPSED_${this.node.id}`, s.collapsed ? "1" : "0");
        } catch {}
      }
      try {
        localStorage.setItem("DS_LOAD_VIDEO_GLOBAL_COLLAPSED", s.collapsed ? "1" : "0");
      } catch {}
      persistState(this.node);
      this.renderCollapse();
      // CRITICAL: node.size is NEVER modified on collapse/expand!
      this.node.setDirtyCanvas?.(true, true);
    });
  }

  cycleVideo(direction) {
    if (!this.dirFiles || this.dirFiles.length === 0) return;
    const s = getState(this.node);
    const curVal = s.video || "";
    let idx = this.dirFiles.findIndex((f) => f.rel_path === curVal || f.filename === curVal);
    if (idx < 0) idx = 0;
    else idx = (idx + direction + this.dirFiles.length) % this.dirFiles.length;
    const nextFile = this.dirFiles[idx];
    if (nextFile) {
      s.video = nextFile.rel_path || nextFile.filename;
      this.fileDropdown.setValue(s.video, false);
      persistState(this.node);
      this.loadVideo(s.video);
    }
  }

  togglePlay() {
    if (!this.video || !this.video.src) return;
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  updateAudioPill() {
    const isMuted = this.video.muted;
    this.audioPill.innerHTML = isMuted
      ? `${DSIconMarkup("volume-x", { size: 10 })}<span>Mute</span>`
      : `${DSIconMarkup("volume-2", { size: 10 })}<span>Audio</span>`;
    this.audioPill.classList.toggle("is-active", !isMuted);
  }

  renderCollapse() {
    const s = getState(this.node);
    this.collapseHeader.classList.toggle("is-open", !s.collapsed);
    this.optionsPanel.classList.toggle("is-collapsed", s.collapsed);
  }

  adjustPreviewToVideo(w, h, force = false) {
    if (!w || !h || !this.node?.size) return;
    const s = getState(this.node);
    if (!force && s.user_resized) return;

    const currentW = Math.max(MIN_W, this.node.size[0] || DEFAULT_W);
    const aspect = w / h;

    const cardEl = this.card?.root;
    const viewportEl = this.viewport;
    if (cardEl && viewportEl && cardEl.offsetHeight > 0 && viewportEl.clientWidth > 0) {
      const nonViewportH = cardEl.offsetHeight - viewportEl.offsetHeight;
      const viewportW = viewportEl.clientWidth;
      const idealViewportH = Math.round(viewportW / aspect);
      const targetCardH = nonViewportH + idealViewportH;
      const widgetY = Number(this.node._lvWidget?.y ?? 28);
      const targetNodeH = Math.max(MIN_H, Math.ceil(widgetY + targetCardH + 5));

      this.node.size[0] = currentW;
      this.node.size[1] = targetNodeH;
      s.node_size = [currentW, targetNodeH];
      if (force) s.user_resized = true;
      persistState(this.node);
      this.node.setDirtyCanvas?.(true, true);
      return;
    }

    // Fallback if called before DOM paint
    // Node width - 10px widget margins - 20px card padding - 2px card border - 2px preview border = -34px
    const previewContentW = currentW - 34;
    const idealVideoH = Math.round(previewContentW / aspect);
    const optionsH = s.collapsed ? 0 : 162;
    // Card padding (20px) + Upload (28px) + Gaps (12px) + Nav (28px) + Collapse (26px) + options + Meta (18px) + Controls (26px) + Borders (4px)
    const fixedInCard = 20 + 28 + 12 + 28 + 26 + (optionsH ? (optionsH + 6) : 0) + 18 + 26 + 4;
    const targetNodeH = Math.max(MIN_H, Math.ceil(28 + fixedInCard + idealVideoH + 5));

    this.node.size[0] = currentW;
    this.node.size[1] = targetNodeH;
    s.node_size = [currentW, targetNodeH];
    if (force) s.user_resized = true;
    persistState(this.node);
    this.node.setDirtyCanvas?.(true, true);
  }

  showStatus(title, hint) {
    this.statusTitle.textContent = title;
    this.statusHint.textContent = hint || "";
    this.statusUploadBtn.root.style.display = "none";
    this.statusOverlay.classList.remove("is-hidden");
  }

  showError(title, hint) {
    this.statusTitle.textContent = title;
    this.statusHint.textContent = hint || "";
    this.statusUploadBtn.root.style.display = "inline-flex";
    this.statusOverlay.classList.remove("is-hidden");
  }

  hideStatus() {
    this.statusOverlay.classList.add("is-hidden");
  }

  async loadDirectoryList() {
    try {
      const res = await fetch("/ds/load_video/list");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.videos)) {
          this.dirFiles = data.videos;
          const opts = data.videos.map((f) => ({
            id: f.rel_path || f.filename,
            label: f.filename,
          }));
          this.fileDropdown.setOptions(opts);
          const s = getState(this.node);
          if (s.video) this.fileDropdown.setValue(s.video, false);
        }
      }
    } catch {}
  }

  async loadVideo(videoPath) {
    if (!videoPath) {
      this.showStatus("No video selected", "Upload or select a video to preview");
      this.video.removeAttribute("src");
      this.video.load();
      return;
    }

    this.showStatus("Loading video...", "Reading video metadata");

    try {
      const res = await api.fetchApi("/ds/load_video/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: videoPath }),
      });

      if (!res.ok) throw new Error(`Query failed: ${res.statusText}`);
      const data = await res.json();

      if (!data.ok) {
        this.showError("Video unavailable", "File may have been moved or deleted");
        this.video.removeAttribute("src");
        this.video.load();
        return;
      }

      this.node._dirData = data;
      this.node._videoMeta = data.metadata || {};
      const meta = data.metadata || {};

      // Update metadata bar
      this.metaDims.textContent = `${meta.width || "—"} × ${meta.height || "—"}`;
      this.metaFps.textContent = `${meta.fps || 24} FPS`;
      this.metaDur.textContent = `${meta.duration || 0}s`;
      this.metaFrames.textContent = `${meta.frame_count || 0} frames`;

      // Update hints on steppers
      this.stepperForceRate.setHint(`Detected: ${meta.fps || 24} FPS`);
      this.stepperFrameCap.setHint(`Total: ${meta.frame_count || 0} frames`);

      // Update Video src
      const previewUrl = `/ds/load_video/preview?path=${encodeURIComponent(data.full_path)}`;
      if (this.video.src !== previewUrl) {
        this.video.src = previewUrl;
        this.video.load();
        this.video.play().catch(() => {});
      }

      // Persist active video reference
      const s = getState(this.node);
      s.video = data.rel_name || data.filename;
      this.fileDropdown.setValue(s.video, false);
      persistState(this.node);

      this.hideStatus();
    } catch (err) {
      this.showError("Unable to load video", err.message);
    }
  }

  openModalPlayer() {
    const s = getState(this.node);
    if (!s.video) return;

    const fullPath = this.node._dirData?.full_path || s.video;
    const previewUrl = `/ds/load_video/preview?path=${encodeURIComponent(fullPath)}`;

    const items = (this.dirFiles.length ? this.dirFiles : [{ filename: s.video, rel_path: s.video }]).map((f) => ({
      name: f.filename,
      src: `/ds/load_video/preview?path=${encodeURIComponent(f.full_path || f.rel_path || f.filename)}`,
      url: `/ds/load_video/preview?path=${encodeURIComponent(f.full_path || f.rel_path || f.filename)}`,
      type: "video",
    }));

    const curIdx = items.findIndex((it) => it.name === (this.node._dirData?.filename || s.video));

    VideoPlayerModal({
      src: previewUrl,
      title: this.node._dirData?.filename || s.video,
      items: items.length ? items : null,
      currentIndex: curIdx >= 0 ? curIdx : 0,
      loop: s.loop,
      volume: s.volume,
    });
  }

  syncState() {
    const s = getState(this.node);

    this.formatDropdown.setValue(s.format || "LTXV", false);
    this.collapseBadge.textContent = s.format || "LTXV";

    this.stepperForceRate.stepper.setValue(s.force_rate || 0, false);
    this.stepperCustomWidth.stepper.setValue(s.custom_width || 0, false);
    this.stepperCustomHeight.stepper.setValue(s.custom_height || 0, false);
    this.stepperFrameCap.stepper.setValue(s.frame_load_cap || 0, false);
    this.stepperSkipFrames.stepper.setValue(s.skip_first_frames || 0, false);
    this.stepperSelectNth.stepper.setValue(s.select_every_nth || 1, false);

    this.video.muted = Boolean(s.muted);
    this.video.loop = true;
    this.updateAudioPill();

    this.renderCollapse();

    if (s.video) {
      this.fileDropdown.setValue(s.video, false);
      this.loadVideo(s.video);
    } else {
      this.showStatus("No video selected", "Upload or select a video to preview");
    }
  }

  destroy() {
    try {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      this.card.destroy();
    } catch {}
  }
}

/* ========================================================================= */
/* Node Patching & LiteGraph Binding                                         */
/* ========================================================================= */
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

  protectDSResizeCorners(node);

  if (node._dsPatched) {
    hideWidgets(node);
    return;
  }
  node._dsPatched = true;
  loadCSS();
  installDSUI();

  syncFromWidgets(node);
  hideWidgets(node);

  const controller = new DSLoadVideoController(node);
  node._controller = controller;

  const CARD_MARGIN = 5;
  const root = controller.card.root;

  const widget = node.addDOMWidget("load_video_ui", "custom", root, {
    serialize: false,
    margin: CARD_MARGIN,
    getMinHeight: () => MIN_H,
    getMaxHeight: () => {
      const widgetY = Number(widget?.y ?? node.widgets_start_y ?? 28);
      const nodeHeight = Number(node.size?.[1] ?? 0);
      return Math.max(MIN_H, nodeHeight - widgetY);
    },
    getValue: () => null,
    setValue: () => {},
  });
  widget.y = 28;
  node._lvWidget = widget;

  widget.computeLayoutSize = () => ({
    minWidth: MIN_W,
    minHeight: MIN_H,
  });

  widget.onPointerDown = (pointer) => {
    const target = pointer?.eDown?.target;
    return !!target?.closest?.("button,input,textarea,select,video,.ds-lv-progress-wrap,.ds-ui-popup");
  };

  normalizeDSWidgetHost(root, node, { shell: false });

  const oldSerialize = node.serialize;
  node.serialize = function () {
    persistState(this);
    return oldSerialize?.apply(this, arguments) || {};
  };

  const oldRemoved = node.onRemoved;
  node.onRemoved = function () {
    try {
      this._controller?.destroy();
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

/* ========================================================================= */
/* Extension Registration & Setup                                            */
/* ========================================================================= */
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
    installDSUI();

    // 1. Fetch server-persisted state
    try {
      const res = await fetch("/ds/load_video/state");
      if (res.ok) {
        const d = await res.json();
        window._ds_load_video_server_nodes = d.nodes || {};
        window._ds_load_video_last_video = d.last_video || "";
        window._ds_load_video_last_collapsed = d.last_collapsed;
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
        if (n?.type === TYPE && n._controller?.card?.root) {
          window.DSGlobalTheme?.bindNode?.(n._controller.card.root, n);
        }
      }
    });
  },
});
