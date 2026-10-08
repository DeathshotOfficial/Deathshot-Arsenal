/**
 * DS Video Save - Frontend LiteGraph Canvas UI
 * DeathshotArsenal / DS Node Pack
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  Card,
  Field,
  Button,
  Dropdown,
  Stepper,
  Toggle,
  VideoPreview,
  VideoPlayerModal,
  StatusBar,
  normalizeDSWidgetHost,
  DSIcon,
} from "../UIElements/index.js";

const TYPE = "DS_VideoSave";
const EXT = "DeathshotArsenal.VideoSave";
const PROP = "ds_video_save";

const MIN_W = 260;
const MIN_H = 300;
const DEFAULT_W = 320;
const DEFAULT_H = 440;
const CARD_MARGIN = 5;

let cssLoaded = false;

// ------------------------------------------------------------------
// Format Definitions & Options
// ------------------------------------------------------------------
const VIDEO_FORMAT_OPTIONS = [
  { id: "h264-mp4", label: "H.264 (MP4)" },
  { id: "h265-mp4", label: "H.265 (MP4)" },
  { id: "nvenc_h264-mp4", label: "NVENC H.264 (MP4)" },
  { id: "nvenc_hevc-mp4", label: "NVENC HEVC (MP4)" },
  { id: "nvenc_av1-mp4", label: "NVENC AV1 (MP4)" },
  { id: "av1-webm", label: "AV1 (WebM)" },
  { id: "webm", label: "VP9 (WebM)" },
  { id: "ProRes", label: "ProRes 422 HQ (MOV)" },
  { id: "ffv1-mkv", label: "FFV1 Lossless (MKV)" },
  { id: "ffmpeg-gif", label: "High-Quality GIF" },
  { id: "8bit-png", label: "8-bit PNG Sequence" },
  { id: "16bit-png", label: "16-bit PNG Sequence" },
];

const IMAGE_FORMAT_OPTIONS = [
  { id: "image/gif", label: "GIF Animation" },
  { id: "image/webp", label: "WebP Animation" },
];

const PIX_FMT_OPTIONS = [
  { id: "yuv420p", label: "yuv420p" },
  { id: "yuv420p10le", label: "yuv420p10le" },
];

const DEFAULT_PROPERTIES = {
  drawer_expanded: true,
  active_category: "Video",
  selected_format: "h264-mp4",
  fps: 24.0,
  prefix: "DS_Video",
  loop_count: 0,
  pix_fmt: "yuv420p",
  crf: 12,
  save_metadata: true,
  trim_to_audio: false,
  lossless: true,
  save_output: true,
  last_path: "",
  has_audio: false,
};

function loadCSS() {
  if (cssLoaded || document.querySelector("link[data-ds-video-save-css]")) return;
  cssLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dsVideoSaveCss = "true";
  link.href = new URL("./ds_video_save.css", import.meta.url).href;
  document.head.appendChild(link);
}

function url(path) {
  return typeof api.fileURL === "function" ? api.fileURL(path) : path;
}

function getPropState(node) {
  node.properties ||= {};
  let s = node.properties[PROP];
  if (!s || typeof s !== "object") {
    s = node._dsVsState || { ...DEFAULT_PROPERTIES };
  }
  // configure() swaps in a new properties object on load/refresh: merge it into
  // the original so every closure built earlier keeps pointing at live state.
  if (node._dsVsState && node._dsVsState !== s) {
    Object.assign(node._dsVsState, s);
    s = node._dsVsState;
  }
  node._dsVsState = node.properties[PROP] = s;
  for (const [k, v] of Object.entries(DEFAULT_PROPERTIES)) {
    if (s[k] === undefined) s[k] = v;
  }
  s.fps = Math.max(0.01, Math.min(1000, Number(s.fps) || 24.0));
  s.loop_count = Math.max(0, Math.min(100, Number(s.loop_count) || 0));
  s.crf = Math.max(0, Math.min(51, Number(s.crf) || 12));
  s.drawer_expanded = Boolean(s.drawer_expanded);
  s.last_path = String(s.last_path || "");
  s.has_audio = Boolean(s.has_audio);
  return s;
}

function syncWidgets(node) {
  const s = getPropState(node);
  const set = (name, value) => {
    const w = node.widgets?.find((x) => x?.name === name);
    if (w) w.value = value;
  };

  set("filename_prefix", s.prefix || "DS_Video");
  set("loop_count", s.loop_count || 0);
  set("pix_fmt", s.pix_fmt || "yuv420p");
  set("crf", s.crf || 12);
  set("save_metadata", Boolean(s.save_metadata));
  set("trim_to_audio", Boolean(s.trim_to_audio));
  set("lossless", Boolean(s.lossless));
  set("save_output", Boolean(s.save_output));
  set("selected_format", s.selected_format || "h264-mp4");
  set("active_category", s.active_category || "Video");
  set("config_json", JSON.stringify(s));
}

let _trackTimer = null;
function requestAutosave() {
  // ComfyUI's change tracker checks on mouseup, which fires BEFORE our click
  // handler, so the workflow gets saved one step behind. Run one check after
  // the click settles. Debounced, and never called from serialize().
  clearTimeout(_trackTimer);
  _trackTimer = setTimeout(() => {
    try {
      app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.();
    } catch {}
  }, 200);
}

function persist(node) {
  syncWidgets(node);
  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch {}
  requestAutosave();
}

function hideWidgets(node) {
  for (const w of node.widgets || []) {
    if (w?.name === "ds_video_save_ui") continue;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, 0];
    w.draw = () => {};
    if (w.element) w.element.style.display = "none";
  }
}

function showToast(node, msg, isWarn = false) {
  if (!node.card?.root) return;
  const old = node.card.root.querySelector(".ds-vs-toast");
  old?.remove();
  const t = document.createElement("div");
  t.className = "ds-vs-toast" + (isWarn ? " is-warn" : "");
  t.textContent = msg;
  node.card.root.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ------------------------------------------------------------------
// Action Handlers: System Player, Folder, Fullscreen
// ------------------------------------------------------------------
async function openVideoFile(node) {
  const p = node._lastPath;
  if (!p) {
    showToast(node, "No exported video yet");
    return;
  }
  try {
    const res = await fetch(url("/ds/video_save/open"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p }),
    });
    const d = await res.json();
    if (!d.success) showToast(node, d.error || "Failed to open video", true);
  } catch {
    showToast(node, "Failed to open video", true);
  }
}

async function openOutputFolder(node) {
  const s = getPropState(node);
  const p = node._lastPath || "";
  const prefix = s.prefix || "";
  try {
    const res = await fetch(url("/ds/video_save/folder"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p, prefix: prefix }),
    });
    const d = await res.json();
    if (!d.success) showToast(node, d.error || "Failed to open folder", true);
  } catch {
    showToast(node, "Failed to open folder", true);
  }
}

function openFullscreenModal(node) {
  if (!node._lastPath) {
    showToast(node, "No media to preview");
    return;
  }

  const isImg =
    node.properties[PROP]?.selected_format === "image/gif" ||
    node.properties[PROP]?.selected_format === "image/webp" ||
    node._lastPath.endsWith(".png") ||
    node._lastPath.endsWith(".gif") ||
    node._lastPath.endsWith(".webp");

  const mediaSrc = url(`/ds/video_save/preview?path=${encodeURIComponent(node._lastPath)}`);
  const filename = node._lastPath.split(/[/\\]/).pop() || "Video Preview";

  VideoPlayerModal({
    src: mediaSrc,
    title: filename,
    isImage: isImg,
    loop: true,
    autoplay: true,
  });
}

// ------------------------------------------------------------------
// Card & UI Construction
// ------------------------------------------------------------------
function buildVideoSaveUI(node) {
  const s = getPropState(node);

  let drawerToggleBtn = null;

  // Toggle drawer helper – callable from button click or context menu
  function toggleDrawer() {
    s.drawer_expanded = !s.drawer_expanded;
    drawerToggleBtn?.classList.toggle("is-active", s.drawer_expanded);
    persist(node);
    render(node);
  }

  // 1. Root Card Construction
  const card = Card({
    title: "Video Save",
    icon: "film",
    className: "ds-vs-card",
    actions: [
      {
        icon: "external-link",
        tooltip: "Open in external player",
        onClick: () => openVideoFile(node),
      },
      {
        icon: "folder",
        tooltip: "Open output folder",
        onClick: () => openOutputFolder(node),
      },
      {
        icon: "sliders",
        tooltip: "Toggle Encoder Settings",
        onClick: (e) => {
          e.stopPropagation();
          toggleDrawer();
        },
      },
    ],
  });

  // Reference the drawer toggle action button – robust multi-strategy lookup
  const actionButtons = card.head?.querySelectorAll(".ds-ui-card-actions button");
  if (actionButtons && actionButtons.length >= 3) {
    drawerToggleBtn = actionButtons[2];
  } else if (actionButtons && actionButtons.length > 0) {
    drawerToggleBtn = actionButtons[actionButtons.length - 1];
  }
  if (drawerToggleBtn) {
    drawerToggleBtn.classList.toggle("is-active", s.drawer_expanded);
  }

  // Store toggleDrawer on node so context menu & external callers can use it
  node._toggleDrawer = toggleDrawer;

  // 2. FPS Stepper Row (Inline label + Stepper control)
  const fpsRow = document.createElement("div");
  fpsRow.className = "ds-vs-fps-row";

  const fpsLabelGroup = document.createElement("div");
  fpsLabelGroup.className = "ds-vs-fps-label-group";

  const fpsTitle = document.createElement("span");
  fpsTitle.className = "ds-vs-fps-title";
  fpsTitle.textContent = "Frame Rate";

  const fpsBadge = document.createElement("span");
  fpsBadge.className = "ds-vs-fps-badge";
  fpsBadge.textContent = "WIRED";

  fpsLabelGroup.append(fpsTitle, fpsBadge);

  const fpsStepperWrap = document.createElement("div");
  fpsStepperWrap.className = "ds-vs-fps-stepper-wrap";

  const fpsStepper = Stepper({
    min: 0.01,
    max: 1000,
    step: 1,
    value: s.fps,
    onChange: (val) => {
      s.fps = val;
      persist(node);
    },
  });
  fpsStepperWrap.appendChild(fpsStepper.root);
  fpsRow.append(fpsLabelGroup, fpsStepperWrap);

  // 3. Collapsible Settings Drawer
  const drawer = document.createElement("div");
  drawer.className = "ds-vs-drawer" + (s.drawer_expanded ? "" : " is-collapsed");

  // Format selection bar: Category buttons on left, Dropdown on right
  const formatBar = document.createElement("div");
  formatBar.className = "ds-vs-format-bar";

  const categoryGroup = document.createElement("div");
  categoryGroup.className = "ds-vs-category-group";

  const btnVideo = Button({
    label: "Video",
    compact: true,
    onClick: () => {
      s.active_category = "Video";
      if (!VIDEO_FORMAT_OPTIONS.some((f) => f.id === s.selected_format)) {
        s.selected_format = "h264-mp4";
      }
      persist(node);
      render(node);
    },
  });

  const btnImage = Button({
    label: "Image",
    compact: true,
    onClick: () => {
      s.active_category = "Image";
      if (!IMAGE_FORMAT_OPTIONS.some((f) => f.id === s.selected_format)) {
        s.selected_format = "image/gif";
      }
      persist(node);
      render(node);
    },
  });
  categoryGroup.append(btnVideo.root, btnImage.root);

  const formatSelectWrap = document.createElement("div");
  formatSelectWrap.className = "ds-vs-format-select-wrap";

  const formatDropdown = Dropdown({
    options: s.active_category === "Video" ? VIDEO_FORMAT_OPTIONS : IMAGE_FORMAT_OPTIONS,
    value: s.selected_format,
    compact: true,
    onChange: (val) => {
      s.selected_format = val;
      persist(node);
      render(node);
    },
  });
  formatSelectWrap.appendChild(formatDropdown.root);
  formatBar.append(categoryGroup, formatSelectWrap);
  drawer.appendChild(formatBar);

  // Prefix Input
  const prefixInput = document.createElement("input");
  prefixInput.type = "text";
  prefixInput.className = "ds-vs-text-input";
  prefixInput.value = s.prefix || "DS_Video";
  prefixInput.placeholder = "DS_Video";
  prefixInput.addEventListener("input", () => {
    s.prefix = prefixInput.value;
    persist(node);
  });

  const prefixField = Field({
    label: "Filename Prefix",
    control: prefixInput,
  });
  drawer.appendChild(prefixField.root);

  // Subpanel: Video Options
  const subpanelVideo = document.createElement("div");
  subpanelVideo.style.display = "flex";
  subpanelVideo.style.flexDirection = "column";
  subpanelVideo.style.gap = "5px";

  // Row 1: Loop Count + Pixel Format
  const row1 = document.createElement("div");
  row1.className = "ds-vs-row-2col";

  const loopStepper = Stepper({
    min: 0,
    max: 100,
    step: 1,
    value: s.loop_count,
    onChange: (val) => {
      s.loop_count = val;
      persist(node);
    },
  });
  const loopField = Field({
    label: "Loop Count",
    control: loopStepper.root,
  });

  const pixDropdown = Dropdown({
    options: PIX_FMT_OPTIONS,
    value: s.pix_fmt,
    compact: true,
    onChange: (val) => {
      s.pix_fmt = val;
      persist(node);
    },
  });
  const pixField = Field({
    label: "Pixel Format",
    control: pixDropdown.root,
  });
  row1.append(loopField.root, pixField.root);

  // Row 2: CRF + Save Metadata
  const row2 = document.createElement("div");
  row2.className = "ds-vs-row-2col";

  const crfStepper = Stepper({
    min: 0,
    max: 51,
    step: 1,
    value: s.crf,
    onChange: (val) => {
      s.crf = val;
      persist(node);
    },
  });
  const crfField = Field({
    label: "CRF (0–51)",
    control: crfStepper.root,
  });

  const metaToggle = Toggle({
    label: "Save Metadata",
    checked: s.save_metadata,
    onChange: (val) => {
      s.save_metadata = val;
      persist(node);
    },
  });
  row2.append(crfField.root, metaToggle.root);

  // Row 3: Trim to Audio + Save Output
  const row3 = document.createElement("div");
  row3.className = "ds-vs-row-2col";

  const trimToggle = Toggle({
    label: "Trim to Audio",
    checked: s.trim_to_audio,
    onChange: (val) => {
      s.trim_to_audio = val;
      persist(node);
    },
  });

  const saveToggle = Toggle({
    label: "Save Output",
    checked: s.save_output,
    onChange: (val) => {
      s.save_output = val;
      persist(node);
    },
  });
  row3.append(trimToggle.root, saveToggle.root);

  subpanelVideo.append(row1, row2, row3);
  drawer.appendChild(subpanelVideo);

  // Subpanel: GIF Options
  const subpanelGif = document.createElement("div");
  subpanelGif.style.display = "none";
  subpanelGif.style.flexDirection = "column";
  subpanelGif.style.gap = "5px";

  const rowGif = document.createElement("div");
  rowGif.className = "ds-vs-row-2col";

  const loopGifStepper = Stepper({
    min: 0,
    max: 100,
    step: 1,
    value: s.loop_count,
    onChange: (val) => {
      s.loop_count = val;
      loopStepper.setValue(val);
      persist(node);
    },
  });
  const loopGifField = Field({
    label: "Loop Count",
    control: loopGifStepper.root,
  });

  const saveGifToggle = Toggle({
    label: "Save Output",
    checked: s.save_output,
    onChange: (val) => {
      s.save_output = val;
      saveToggle.setValue(val);
      persist(node);
    },
  });
  rowGif.append(loopGifField.root, saveGifToggle.root);
  subpanelGif.appendChild(rowGif);
  drawer.appendChild(subpanelGif);

  // Subpanel: WebP Options
  const subpanelWebp = document.createElement("div");
  subpanelWebp.style.display = "none";
  subpanelWebp.style.flexDirection = "column";
  subpanelWebp.style.gap = "5px";

  const rowWebp1 = document.createElement("div");
  rowWebp1.className = "ds-vs-row-2col";

  const loopWebpStepper = Stepper({
    min: 0,
    max: 100,
    step: 1,
    value: s.loop_count,
    onChange: (val) => {
      s.loop_count = val;
      loopStepper.setValue(val);
      persist(node);
    },
  });
  const loopWebpField = Field({
    label: "Loop Count",
    control: loopWebpStepper.root,
  });

  const losslessToggle = Toggle({
    label: "Lossless",
    checked: s.lossless,
    onChange: (val) => {
      s.lossless = val;
      persist(node);
    },
  });
  rowWebp1.append(loopWebpField.root, losslessToggle.root);

  const rowWebp2 = document.createElement("div");
  rowWebp2.className = "ds-vs-row-2col";

  const saveWebpToggle = Toggle({
    label: "Save Output",
    checked: s.save_output,
    onChange: (val) => {
      s.save_output = val;
      saveToggle.setValue(val);
      persist(node);
    },
  });
  rowWebp2.append(saveWebpToggle.root);

  subpanelWebp.append(rowWebp1, rowWebp2);
  drawer.appendChild(subpanelWebp);

  // 4. Custom StatusBar Component (from UIElements)
  const statusBar = StatusBar({
    text: s.last_path ? "Ready" : "Waiting for export",
    state: s.last_path ? "idle" : "idle",
  });

  // 5. VideoPreview Component
  const preview = VideoPreview({
    loop: true,
    muted: true,
    placeholder: "No video exported yet",
  });

  const previewBox = preview.root.querySelector(".ds-ui-image-preview-box");
  const previewFooter = preview.root.querySelector(".ds-ui-preview-footer");

  // Auxiliary image element for GIF/WebP display
  const previewImg = document.createElement("img");
  previewImg.style.maxWidth = "100%";
  previewImg.style.maxHeight = "100%";
  previewImg.style.display = "none";
  previewImg.style.objectFit = "contain";
  if (previewBox) previewBox.appendChild(previewImg);

  // Toggle play on video viewport click
  previewBox?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!preview.video.src || preview.video.style.display === "none") return;
    if (preview.video.paused) preview.play();
    else preview.pause();
  });

  // Audio indicator pill in preview footer
  const audioPill = document.createElement("div");
  audioPill.className = "ds-vs-audio-pill";
  audioPill.title = "Hover over video to unmute audio";

  const audioPillIcon = document.createElement("span");
  audioPillIcon.style.display = "inline-flex";
  audioPillIcon.appendChild(DSIcon("volume-x", { size: 10, color: "var(--ds-color-muted-text, #9ca3af)" }));

  const audioPillText = document.createElement("span");
  audioPillText.textContent = "Hover Audio";
  audioPill.append(audioPillIcon, audioPillText);

  // Hover unmuting
  previewBox?.addEventListener("pointerenter", () => {
    if (!preview.video.src || preview.video.style.display === "none" || !node._hasAudio) return;
    preview.video.muted = false;
    audioPill.classList.add("is-active");
    audioPillText.textContent = "Audio Active";
    audioPillIcon.replaceChildren(DSIcon("volume-2", { size: 10, color: "var(--ds-color-accent, #67e8f9)" }));
  });

  previewBox?.addEventListener("pointerleave", () => {
    if (!preview.video.src || preview.video.style.display === "none") return;
    preview.video.muted = true;
    audioPill.classList.remove("is-active");
    audioPillText.textContent = "Hover Audio";
    audioPillIcon.replaceChildren(DSIcon("volume-x", { size: 10, color: "var(--ds-color-muted-text, #9ca3af)" }));
  });

  // Fullscreen Preview Button
  const fullscreenBtn = Button({
    icon: "maximize-2",
    compact: true,
    tooltip: "Fullscreen preview",
    onClick: (e) => {
      e.stopPropagation();
      openFullscreenModal(node);
    },
  });

  if (previewFooter) {
    previewFooter.append(audioPill, fullscreenBtn.root);
  }

  // Append elements to card body: FPS Row -> Drawer -> Status Bar -> Preview
  card.body.append(fpsRow, drawer, statusBar.root, preview.root);

  // Bind controls to node
  node.card = card;
  node._fpsRow = fpsRow;
  node._fpsBadge = fpsBadge;
  node._fpsStepper = fpsStepper;
  node._drawer = drawer;
  node._drawerToggleBtn = drawerToggleBtn;
  node._btnVideo = btnVideo;
  node._btnImage = btnImage;
  node._formatDropdown = formatDropdown;
  node._prefixInput = prefixInput;
  node._subpanelVideo = subpanelVideo;
  node._subpanelGif = subpanelGif;
  node._subpanelWebp = subpanelWebp;
  node._loopStepper = loopStepper;
  node._loopGifStepper = loopGifStepper;
  node._loopWebpStepper = loopWebpStepper;
  node._pixDropdown = pixDropdown;
  node._crfStepper = crfStepper;
  node._metaToggle = metaToggle;
  node._trimToggle = trimToggle;
  node._saveToggle = saveToggle;
  node._saveGifToggle = saveGifToggle;
  node._saveWebpToggle = saveWebpToggle;
  node._losslessToggle = losslessToggle;
  node._statusBar = statusBar;
  node._preview = preview;
  node._previewImg = previewImg;
  node._previewBox = previewBox;
  node._audioPill = audioPill;

  return card;
}

// ------------------------------------------------------------------
// Render State Synchronizer
// ------------------------------------------------------------------
function render(node) {
  if (!node.card?.root) return;
  const s = getPropState(node);

  // 1. FPS slot connection state
  const fpsSlot = node.inputs?.find((inp) => inp?.name?.toLowerCase() === "fps");
  const isFpsConnected = fpsSlot?.link != null;
  node._fpsRow?.classList.toggle("is-wired", isFpsConnected);
  if (node._fpsStepper) {
    node._fpsStepper.setDisabled(isFpsConnected);
    if (!isFpsConnected) {
      node._fpsStepper.setValue(s.fps, false);
    }
  }

  // 2. Drawer expanded state
  node._drawer?.classList.toggle("is-collapsed", !s.drawer_expanded);
  node._drawerToggleBtn?.classList.toggle("is-active", s.drawer_expanded);

  // 3. Category toggles & dropdown options
  const isVideo = s.active_category === "Video";
  node._btnVideo?.setActive(isVideo);
  node._btnImage?.setActive(!isVideo);

  if (node._formatDropdown) {
    node._formatDropdown.setOptions(isVideo ? VIDEO_FORMAT_OPTIONS : IMAGE_FORMAT_OPTIONS);
    node._formatDropdown.setValue(s.selected_format, false);
  }

  // 4. Subpanel visibility
  if (node._subpanelVideo) node._subpanelVideo.style.display = isVideo ? "flex" : "none";
  if (node._subpanelGif) {
    node._subpanelGif.style.display = !isVideo && s.selected_format === "image/gif" ? "flex" : "none";
  }
  if (node._subpanelWebp) {
    node._subpanelWebp.style.display = !isVideo && s.selected_format === "image/webp" ? "flex" : "none";
  }

  // 5. Input values sync
  if (node._prefixInput && node._prefixInput.value !== s.prefix) {
    node._prefixInput.value = s.prefix || "DS_Video";
  }
  node._loopStepper?.setValue(s.loop_count, false);
  node._loopGifStepper?.setValue(s.loop_count, false);
  node._loopWebpStepper?.setValue(s.loop_count, false);
  node._pixDropdown?.setValue(s.pix_fmt, false);
  node._crfStepper?.setValue(s.crf, false);
  node._metaToggle?.setValue(s.save_metadata, false);
  node._trimToggle?.setValue(s.trim_to_audio, false);
  node._saveToggle?.setValue(s.save_output, false);
  node._saveGifToggle?.setValue(s.save_output, false);
  node._saveWebpToggle?.setValue(s.save_output, false);
  node._losslessToggle?.setValue(s.lossless, false);
}

function updatePreview(node, mediaPath) {
  if (!node._preview) return;
  node._lastPath = mediaPath || "";

  const video = node._preview.video;
  const img = node._previewImg;
  const placeholder = node._preview.root.querySelector(".ds-ui-image-preview-box > span");
  const audioPill = node._audioPill;

  if (!mediaPath) {
    video.style.display = "none";
    if (img) img.style.display = "none";
    if (placeholder) placeholder.style.display = "block";
    if (audioPill) audioPill.style.display = "none";
    return;
  }

  const isImg =
    mediaPath.endsWith(".png") ||
    mediaPath.endsWith(".gif") ||
    mediaPath.endsWith(".webp") ||
    node.properties[PROP]?.selected_format === "image/gif" ||
    node.properties[PROP]?.selected_format === "image/webp";

  const streamUrl = url(`/ds/video_save/preview?path=${encodeURIComponent(mediaPath)}&t=${Date.now()}`);

  if (isImg) {
    video.pause();
    video.style.display = "none";
    if (img) {
      img.style.display = "block";
      img.onerror = () => {
        if (placeholder) placeholder.style.display = "block";
        img.style.display = "none";
      };
      img.src = streamUrl;
    }
    if (placeholder) placeholder.style.display = "none";
    if (audioPill) audioPill.style.display = "none";
  } else {
    if (img) img.style.display = "none";
    video.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
    video.src = streamUrl;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
    if (audioPill) {
      audioPill.style.display = node._hasAudio ? "inline-flex" : "none";
    }
  }
}

// ------------------------------------------------------------------
// Node Patching & LiteGraph Hooking
// ------------------------------------------------------------------
function patchNode(node) {
  if (!node || node.type !== TYPE || node._dsVideoSavePatched) return;
  node._dsVideoSavePatched = true;
  loadCSS();

  node.resizable = true;
  node.min_size = [MIN_W, MIN_H];
  if (!Array.isArray(node.size) || node.size[0] < MIN_W || node.size[1] < MIN_H) {
    node.size = [DEFAULT_W, DEFAULT_H];
  }

  // Preserve UI state by clamping resize to minimum bounds
  const origOnResize = node.onResize;
  node.onResize = function (size) {
    if (Array.isArray(size)) {
      size[0] = Math.max(MIN_W, size[0]);
      size[1] = Math.max(MIN_H, size[1]);
    }
    return origOnResize?.apply(this, arguments);
  };

  const s = getPropState(node);

  // Instantiate hidden backend widgets if missing
  node.widgets ||= [];
  const hiddenWidgets = [
    ["filename_prefix", "DS_Video"],
    ["loop_count", 0],
    ["pix_fmt", "yuv420p"],
    ["crf", 12],
    ["save_metadata", true],
    ["trim_to_audio", false],
    ["lossless", true],
    ["save_output", true],
    ["selected_format", "h264-mp4"],
    ["active_category", "Video"],
    ["config_json", ""],
  ];
  for (const [name, def] of hiddenWidgets) {
    if (!node.widgets.find((w) => w?.name === name)) {
      node.addWidget("text", name, def, () => {}, { hidden: true });
    }
  }
  hideWidgets(node);

  // Build Card as DOM Widget Root
  const card = buildVideoSaveUI(node);

  const domWidget = node.addDOMWidget("ds_video_save_ui", "custom", card.root, {
    serialize: false,
    margin: CARD_MARGIN,
    getMinHeight: () => MIN_H,
    getMaxHeight: () => {
      const widgetY = Number(domWidget?.y ?? node._getWidgetY?.() ?? 0);
      const nodeHeight = Number(node.size?.[1] ?? 0);
      return Math.max(MIN_H, nodeHeight - widgetY);
    },
  });
  node._vsWidget = domWidget;

  normalizeDSWidgetHost(card.root, node, { shell: false });

  // Native resize corner hit testing release (Rule E)
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

    return originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
  };

  // Connection change hook (locks/dims FPS stepper when wired)
  const origOnConnectionsChange = node.onConnectionsChange?.bind(node);
  node.onConnectionsChange = function (type, index, isConnected, link_info, input_or_output) {
    origOnConnectionsChange?.apply(this, arguments);
    render(this);
  };

  // Right-click context menu: expose Toggle Settings option as reliable fallback
  const origGetExtraMenuOptions = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    const extras = origGetExtraMenuOptions?.apply(this, arguments) || [];
    extras.push(
      null, // separator
      {
        content: getPropState(this).drawer_expanded ? "⚙️ Hide Encoder Settings" : "⚙️ Show Encoder Settings",
        callback: () => {
          if (typeof this._toggleDrawer === "function") this._toggleDrawer();
        },
      }
    );
    return extras;
  };

  // Immediate preview restoration if previous generation path exists
  if (s.last_path) {
    node._lastPath = s.last_path;
    node._hasAudio = Boolean(s.has_audio);
    updatePreview(node, s.last_path);
  }

  syncWidgets(node);
  render(node);
}

// ------------------------------------------------------------------
// Video Workflow Drag-and-Drop & Metadata Extraction Helpers
// ------------------------------------------------------------------
const NON_FINITE_REGEX = /"(?:\\.|[^"\\])*"|(?<![\w.-])(-?Infinity|NaN)(?![\w.])/g;

function parseJsonSafe(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    try {
      const cleaned = text.replace(NON_FINITE_REGEX, (match, nonFinite) => (nonFinite ? "null" : match));
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

function parseVideoBuffer(buffer) {
  const uint8 = new Uint8Array(buffer);
  const dataView = new DataView(buffer);
  const len = uint8.length;
  const decoder = new TextDecoder("utf-8");

  // 1. Scan for \xa9cmt atom (QuickTime / iTunes comment format used by FFmpeg)
  for (let i = 0; i < len - 16; i++) {
    if (
      uint8[i] === 0xa9 &&
      uint8[i + 1] === 0x63 &&
      uint8[i + 2] === 0x6d &&
      uint8[i + 3] === 0x74
    ) {
      for (let j = i + 4; j < Math.min(len - 16, i + 64); j++) {
        if (
          uint8[j] === 0x64 &&     // 'd'
          uint8[j + 1] === 0x61 && // 'a'
          uint8[j + 2] === 0x74 && // 't'
          uint8[j + 3] === 0x61    // 'a'
        ) {
          const atomSize = dataView.getUint32(j - 4);
          if (atomSize > 16 && j - 4 + atomSize <= len) {
            const payload = uint8.subarray(j + 12, j - 4 + atomSize);
            const text = decoder.decode(payload);
            const json = parseJsonSafe(text);
            if (json) {
              if (json.workflow) return { workflow: json.workflow, prompt: json.prompt };
              if (Array.isArray(json.nodes)) return { workflow: json };
            }
          }
        }
      }
    }
  }

  // 2. Scan for Matroska / WebM COMMENT or comment tag
  for (let i = 0; i < len - 16; i++) {
    const isComment =
      (uint8[i] === 0x43 && uint8[i + 1] === 0x4f && uint8[i + 2] === 0x4d && uint8[i + 3] === 0x4d && uint8[i + 4] === 0x45 && uint8[i + 5] === 0x4e && uint8[i + 6] === 0x54) ||
      (uint8[i] === 0x63 && uint8[i + 1] === 0x6f && uint8[i + 2] === 0x6d && uint8[i + 3] === 0x6d && uint8[i + 4] === 0x45 && uint8[i + 5] === 0x6e && uint8[i + 6] === 0x54);
    if (isComment) {
      for (let k = i + 7; k < Math.min(len, i + 64); k++) {
        if (uint8[k] === 0x7b) {
          const text = decoder.decode(uint8.subarray(k));
          const jsonStr = extractJsonObject(text);
          if (jsonStr) {
            const json = parseJsonSafe(jsonStr);
            if (json) {
              if (json.workflow) return { workflow: json.workflow, prompt: json.prompt };
              if (Array.isArray(json.nodes)) return { workflow: json };
            }
          }
          break;
        }
      }
    }
  }

  // 3. Fallback scan for embedded "workflow": { ... } JSON signature
  const textChunk = decoder.decode(uint8.subarray(0, Math.min(len, 4 * 1024 * 1024)));
  let searchPos = 0;
  while ((searchPos = textChunk.indexOf('"workflow"', searchPos)) !== -1) {
    const braceAfter = textChunk.indexOf("{", searchPos);
    if (braceAfter !== -1 && braceAfter - searchPos < 50) {
      const jsonStr = extractJsonObject(textChunk.slice(braceAfter));
      if (jsonStr) {
        const json = parseJsonSafe(jsonStr);
        if (json) {
          if (json.workflow) return { workflow: json.workflow, prompt: json.prompt };
          if (Array.isArray(json.nodes)) return { workflow: json };
        }
      }
    }
    searchPos += 10;
  }

  return null;
}

async function readBlobBuffer(blob) {
  if (blob.arrayBuffer) {
    return await blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

async function extractVideoMetadata(file) {
  if (!file || typeof file.slice !== "function") return null;
  const CHUNK_SIZE = 4 * 1024 * 1024;

  const headBlob = file.slice(0, Math.min(file.size, CHUNK_SIZE));
  const headBuf = await readBlobBuffer(headBlob);
  let result = parseVideoBuffer(headBuf);
  if (result) return result;

  if (file.size > CHUNK_SIZE) {
    const tailBlob = file.slice(Math.max(0, file.size - CHUNK_SIZE));
    const tailBuf = await readBlobBuffer(tailBlob);
    result = parseVideoBuffer(tailBuf);
    if (result) return result;
  }

  return null;
}

function isVideoFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("video/") ||
    name.endsWith(".mp4") ||
    name.endsWith(".webm") ||
    name.endsWith(".mkv") ||
    name.endsWith(".mov")
  );
}

function setupVideoDropHandler() {
  const fileInput = document.getElementById("comfy-file-input");
  if (fileInput && !fileInput.accept?.includes("video/")) {
    fileInput.accept += ",video/mp4,video/webm,video/x-matroska,video/quicktime,.mp4,.webm,.mkv,.mov";
  }

  const origHandleFile = app.handleFile;
  app.handleFile = async function (file, ...args) {
    if (isVideoFile(file)) {
      try {
        let meta = null;
        if (
          window.comfyAPI?.isobmff?.getFromIsobmffFile &&
          (file.name?.endsWith(".mp4") ||
            file.name?.endsWith(".mov") ||
            file.type?.includes("mp4") ||
            file.type?.includes("quicktime"))
        ) {
          try {
            meta = await window.comfyAPI.isobmff.getFromIsobmffFile(file);
          } catch {}
        }
        if (
          !meta?.workflow &&
          window.comfyAPI?.ebml?.getFromWebmFile &&
          (file.name?.endsWith(".webm") || file.type?.includes("webm"))
        ) {
          try {
            meta = await window.comfyAPI.ebml.getFromWebmFile(file);
          } catch {}
        }
        if (!meta?.workflow) {
          meta = await extractVideoMetadata(file);
        }
        if (meta?.workflow) {
          const wf = typeof meta.workflow === "string" ? parseJsonSafe(meta.workflow) : meta.workflow;
          if (wf && typeof wf === "object") {
            await app.loadGraphData(wf);
            return;
          }
        }
      } catch (err) {
        console.warn("[DS Video Save] Error reading video workflow metadata:", err);
      }
    }
    return origHandleFile ? await origHandleFile.apply(this, [file, ...args]) : undefined;
  };
}

// ------------------------------------------------------------------
// Register Extension with ComfyUI
// ------------------------------------------------------------------
app.registerExtension({
  name: EXT,
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NORMAL != null ? LG.NORMAL : 0;

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = oldCreated?.apply(this, arguments);
      patchNode(this);
      return r;
    };

    const oldConfigure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
      const r = oldConfigure?.apply(this, arguments);
      setTimeout(() => {
        const s = getPropState(this);
        const w = this.widgets?.find((x) => x?.name === "config_json");
        if (w?.value) {
          try {
            const raw = Array.isArray(w.value) ? w.value.join("") : String(w.value);
            const saved = JSON.parse(raw);
            if (saved && typeof saved === "object") {
              Object.assign(s, saved);
            }
          } catch {}
        }
        syncWidgets(this);
        render(this);

        // Immediate playback of last saved video upon workflow load or browser refresh
        if (s.last_path) {
          this._lastPath = s.last_path;
          this._hasAudio = Boolean(s.has_audio);
          updatePreview(this, s.last_path);
        }
      }, 30);
      return r;
    };

    const oldSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      syncWidgets(this);
      return oldSerialize?.apply(this, arguments) || {};
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try {
        if (this._preview) {
          this._preview.destroy();
        }
        if (this.card) {
          this.card.destroy();
        }
      } catch {}
      return oldRemoved?.apply(this, arguments);
    };

    nodeType.prototype.onExecuted = function (message) {
      const videoItems = message?.video || [];
      const primary = videoItems[0]?.fullpath || message?.last_path?.[0];
      const fallback = videoItems[0]?.fallback || message?.fallback?.[0];
      const hasAudio = Boolean(message?.has_audio?.[0] ?? videoItems[0]?.has_audio ?? false);

      if (primary) {
        const s = getPropState(this);
        s.last_path = String(primary);
        s.has_audio = hasAudio;
        this._lastPath = s.last_path;
        this._hasAudio = s.has_audio;
        updatePreview(this, this._lastPath);

        const filename = videoItems[0]?.filename || "Exported";
        this._statusBar?.setStatus(`Saved: ${filename}`, "success");
        setTimeout(() => {
          this._statusBar?.reset("Ready");
        }, 5000);
      }
      if (fallback) {
        showToast(this, String(fallback), true);
      }
      persist(this);
      render(this);
      this.setDirtyCanvas?.(true, true);
    };
  },

  nodeCreated(node) {
    patchNode(node);
  },

  loadedGraphNode(node) {
    patchNode(node);
  },

  async setup() {
    loadCSS();
    setupVideoDropHandler();

    // Hook ComfyUI execution lifecycle for status bar progress tracking
    api.addEventListener("executing", (e) => {
      const executingNodeId = e?.detail;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          if (String(n.id) === String(executingNodeId)) {
            n._statusBar?.setStatus("Encoding & Saving Video...", "running");
          }
        }
      }
    });

    api.addEventListener("progress", (e) => {
      const d = e?.detail;
      if (!d) return;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && String(n.id) === String(d.node)) {
          if (d.max > 0) {
            const pct = (d.value / d.max) * 100;
            n._statusBar?.setProgress(pct, `Encoding (${Math.round(pct)}%)...`);
          }
        }
      }
    });

    api.addEventListener("execution_error", (e) => {
      const errNodeId = e?.detail?.node_id;
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE && String(n.id) === String(errNodeId)) {
          n._statusBar?.setStatus("Encoding Failed", "error");
        }
      }
    });

    api.addEventListener("execution_interrupted", () => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          n._statusBar?.reset("Ready");
        }
      }
    });

    window.addEventListener("ds-theme-changed", () => {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) render(n);
      }
    });

    // Restore last saved video from server state or persisted node properties
    const restorePreviews = async () => {
      let serverState = null;
      try {
        const res = await fetch(url("/ds/video_save/state"));
        serverState = await res.json();
      } catch {}

      for (const n of app.graph?._nodes || []) {
        if (n?.type === TYPE) {
          const s = getPropState(n);
          const st = serverState?.nodes?.[String(n.id)];
          const path = st?.last_path || s.last_path;
          if (path) {
            n._lastPath = path;
            n._hasAudio = Boolean(st ? st.has_audio : s.has_audio);
            s.last_path = n._lastPath;
            s.has_audio = n._hasAudio;
            updatePreview(n, n._lastPath);
          }
        }
      }
    };

    setTimeout(restorePreviews, 100);
    setTimeout(restorePreviews, 600);
  },
});
