/**
* DS Video Save - Frontend LiteGraph Canvas UI
* DeathshotArsenal / DS Node Pack
*/

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_VideoSave";
const EXT = "DeathshotArsenal.VideoSave";
const PROP = "ds_video_save";

const MIN_W = 380;
const MIN_H = 380;
const DEFAULT_W = 420;
const DEFAULT_H = 480;

let cssLoaded = false;

// ------------------------------------------------------------------
// Vector Icons
// ------------------------------------------------------------------
const ICON = {
play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
volumeUp: `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
volumeMute: `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
fullscreen: `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
open: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
chevronDown: `<svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>`,
chevronUp: `<svg viewBox="0 0 24 24"><path d="m7 14 5-5 5 5"/></svg>`,
close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
videoPlaceholder: `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg>`,
};

// ------------------------------------------------------------------
// Format Definitions
// ------------------------------------------------------------------
const VIDEO_FORMATS = [
"h264-mp4",
"h265-mp4",
"nvenc_h264-mp4",
"nvenc_hevc-mp4",
"nvenc_av1-mp4",
"av1-webm",
"webm",
"ProRes",
"ffv1-mkv",
"ffmpeg-gif",
"8bit-png",
"16bit-png",
];

const IMAGE_FORMATS = ["image/gif", "image/webp"];
const PIX_FMTS = ["yuv420p", "yuv420p10le"];

const DEFAULT_PROPERTIES = {
drawer_expanded: false,
active_category: "Video",
selected_format: "h264-mp4",
fps: 24.0,
prefix: "LTX/DS_Video",
loop_count: 0,
pix_fmt: "yuv420p",
crf: 12,
save_metadata: true,
trim_to_audio: false,
lossless: true,
save_output: true,
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

function stop(e) {
e?.stopPropagation?.();
}

function formatTime(seconds) {
if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
const m = Math.floor(seconds / 60);
const s = Math.floor(seconds % 60);
return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPropState(node) {
node.properties ||= {};
let s = node.properties[PROP];
if (!s || typeof s !== "object") {
s = node.properties[PROP] = { ...DEFAULT_PROPERTIES };
}
for (const [k, v] of Object.entries(DEFAULT_PROPERTIES)) {
if (s[k] === undefined) s[k] = v;
}
s.fps = Math.max(0.01, Math.min(1000, Number(s.fps) || 24.0));
s.loop_count = Math.max(0, Math.min(100, Number(s.loop_count) || 0));
s.crf = Math.max(0, Math.min(51, Number(s.crf) || 12));
s.drawer_expanded = !!s.drawer_expanded;
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
set("save_metadata", !!s.save_metadata);
set("trim_to_audio", !!s.trim_to_audio);
set("lossless", !!s.lossless);
set("save_output", !!s.save_output);
set("selected_format", s.selected_format || "h264-mp4");
set("active_category", s.active_category || "Video");
set("config_json", JSON.stringify(s));
}

function persist(node) {
syncWidgets(node);
try {
app.graph?.setDirtyCanvas?.(true, true);
} catch {}
}

function hideWidgets(node) {
for (const w of node.widgets || []) {
if (w?.name === "video_save_ui") continue;
w.hidden = true;
w.type = "hidden";
w.computeSize = () => [0, 0];
w.draw = () => {};
if (w.element) w.element.style.display = "none";
}
}

// ------------------------------------------------------------------
// Custom Stepper Handler with Click & Hold Acceleration
// ------------------------------------------------------------------
function attachStepper(btnUp, btnDown, getValue, setValue, step = 1, min = 0, max = 100, isFloat = false) {
let timer = null;
let interval = null;

const stepVal = (delta) => {
let cur = Number(getValue()) || 0;
let next = cur + delta;
if (min !== null) next = Math.max(min, next);
if (max !== null) next = Math.min(max, next);
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
let speed = 100;
interval = setInterval(() => {
stepVal(delta);
}, speed);
}, 320);
window.addEventListener("pointerup", stopHold);
window.addEventListener("pointercancel", stopHold);
};

btnUp.addEventListener("pointerdown", (e) => {
stop(e);
startHold(step);
});
btnDown.addEventListener("pointerdown", (e) => {
stop(e);
startHold(-step);
});
}

// ------------------------------------------------------------------
// DOM UI Builder
// ------------------------------------------------------------------
function buildRoot(node) {
const root = document.createElement("div");
root.className = "ds-vs-root";
root.dataset.dsThemed = "true";

root.innerHTML = `
<!-- Header: [DS] Brand + Title on Left, Action Buttons on Right -->
<div class="ds-vs-header">
<div class="ds-vs-header-left">
<div class="ds-vs-brand">DS</div>
<div class="ds-vs-title">Video Save</div>
</div>
<div class="ds-vs-header-actions">
<button class="ds-vs-icon-btn" data-btn-open title="Open Video in external media player">
${ICON.open}
</button>
<button class="ds-vs-icon-btn" data-btn-folder title="Open folder (prefix subfolder or output)">
${ICON.folder}
</button>
<button class="ds-vs-icon-btn ds-vs-menu-btn" data-drawer-toggle title="Toggle Options Menu">
${ICON.menu}
</button>
</div>
</div>

<!-- Full-Width FPS Stepper Row: Frame Rate on left, number + stepper on right -->
<div class="ds-vs-fps-row" data-fps-row>
<div class="ds-vs-fps-box" data-fps-wrap>
<div class="ds-vs-fps-left">
<span class="ds-vs-fps-title">Frame Rate</span>
<span class="ds-vs-fps-badge">WIRED</span>
</div>
<div class="ds-vs-fps-right">
<input type="number" class="ds-vs-fps-input" data-fps-input step="1" min="0.01" max="1000" />
<div class="ds-vs-stepper-controls">
<button class="ds-vs-stepper-btn" data-fps-up title="Increase FPS">▲</button>
<button class="ds-vs-stepper-btn" data-fps-down title="Decrease FPS">▼</button>
</div>
</div>
</div>
</div>

<!-- Collapsible Settings Drawer -->
<div class="ds-vs-drawer is-collapsed" data-drawer>
<!-- Format Selection Bar: Segmented Tabs (Left) + Dropdown (Right) -->
<div class="ds-vs-format-bar">
<div class="ds-vs-tabs">
<button class="ds-vs-tab is-active" data-tab="Video">Video</button>
<button class="ds-vs-tab" data-tab="Image">Image</button>
</div>
<div class="ds-vs-select-wrapper">
<button class="ds-vs-select-trigger" data-format-trigger>
<span data-format-label>h264-mp4</span>
${ICON.chevronDown}
</button>
</div>
</div>

<!-- Sub-panel: Video Options (Spacious Multi-Row Layout) -->
<div class="ds-vs-subpanel" data-panel-video>
<!-- Row 1: Filename Prefix (Full Width) -->
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Filename Prefix</label>
<input type="text" class="ds-vs-text-input" data-input-prefix placeholder="LTX/DS_Video" />
</div>

<!-- Row 2: Loop Count (Left) + Pixel Format (Right) -->
<div class="ds-vs-row-2col">
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Loop Count</label>
<div class="ds-vs-stepper-box">
<input type="number" class="ds-vs-num-input" data-input-loop min="0" max="100" />
<div class="ds-vs-stepper-controls">
<button class="ds-vs-stepper-btn" data-loop-up>▲</button>
<button class="ds-vs-stepper-btn" data-loop-down>▼</button>
</div>
</div>
</div>

<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Pixel Format</label>
<button class="ds-vs-select-trigger" data-pix-trigger>
<span data-pix-label>yuv420p</span>
${ICON.chevronDown}
</button>
</div>
</div>

<!-- Row 3: CRF (Left) + Save Metadata (Right) -->
<div class="ds-vs-row-2col">
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">CRF (0–51)</label>
<div class="ds-vs-stepper-box">
<input type="number" class="ds-vs-num-input" data-input-crf min="0" max="51" />
<div class="ds-vs-stepper-controls">
<button class="ds-vs-stepper-btn" data-crf-up>▲</button>
<button class="ds-vs-stepper-btn" data-crf-down>▼</button>
</div>
</div>
</div>

<div class="ds-vs-toggle-group">
<label class="ds-vs-field-label">Save Metadata</label>
<div class="ds-vs-toggle-control" data-toggle="save_metadata">
<span class="ds-vs-toggle-state-text">Metadata</span>
<div class="ds-vs-switch"><div class="ds-vs-switch-thumb"></div></div>
</div>
</div>
</div>

<!-- Row 4: Trim to Audio (Left) + Save Output (Right) -->
<div class="ds-vs-row-2col">
<div class="ds-vs-toggle-group">
<label class="ds-vs-field-label">Trim to Audio</label>
<div class="ds-vs-toggle-control" data-toggle="trim_to_audio">
<span class="ds-vs-toggle-state-text">Trim Audio</span>
<div class="ds-vs-switch"><div class="ds-vs-switch-thumb"></div></div>
</div>
</div>

<div class="ds-vs-toggle-group">
<label class="ds-vs-field-label">Save Output</label>
<div class="ds-vs-toggle-control" data-toggle="save_output">
<span class="ds-vs-toggle-state-text">Save</span>
<div class="ds-vs-switch"><div class="ds-vs-switch-thumb"></div></div>
</div>
</div>
</div>
</div>

<!-- Sub-panel: Image/GIF Options -->
<div class="ds-vs-subpanel" data-panel-gif style="display: none;">
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Filename Prefix</label>
<input type="text" class="ds-vs-text-input" data-input-prefix-gif placeholder="DS_Gif" />
</div>
<div class="ds-vs-row-2col">
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Loop Count</label>
<div class="ds-vs-stepper-box">
<input type="number" class="ds-vs-num-input" data-input-loop-gif min="0" max="100" />
<div class="ds-vs-stepper-controls">
<button class="ds-vs-stepper-btn" data-loop-gif-up>▲</button>
<button class="ds-vs-stepper-btn" data-loop-gif-down>▼</button>
</div>
</div>
</div>
<div class="ds-vs-toggle-group">
<label class="ds-vs-field-label">Save Output</label>
<div class="ds-vs-toggle-control" data-toggle="save_output">
<span class="ds-vs-toggle-state-text">Save</span>
<div class="ds-vs-switch"><div class="ds-vs-switch-thumb"></div></div>
</div>
</div>
</div>
</div>

<!-- Sub-panel: Image/WebP Options -->
<div class="ds-vs-subpanel" data-panel-webp style="display: none;">
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Filename Prefix</label>
<input type="text" class="ds-vs-text-input" data-input-prefix-webp placeholder="DS_Webp" />
</div>
<div class="ds-vs-row-2col">
<div class="ds-vs-field-group">
<label class="ds-vs-field-label">Loop Count</label>
<div class="ds-vs-stepper-box">
<input type="number" class="ds-vs-num-input" data-input-loop-webp min="0" max="100" />
<div class="ds-vs-stepper-controls">
<button class="ds-vs-stepper-btn" data-loop-webp-up>▲</button>
<button class="ds-vs-stepper-btn" data-loop-webp-down>▼</button>
</div>
</div>
</div>
<div class="ds-vs-toggle-group">
<label class="ds-vs-field-label">Lossless</label>
<div class="ds-vs-toggle-control" data-toggle="lossless">
<span class="ds-vs-toggle-state-text">Lossless</span>
<div class="ds-vs-switch"><div class="ds-vs-switch-thumb"></div></div>
</div>
</div>
</div>
<div class="ds-vs-toggle-group">
<label class="ds-vs-field-label">Save Output</label>
<div class="ds-vs-toggle-control" data-toggle="save_output">
<span class="ds-vs-toggle-state-text">Save</span>
<div class="ds-vs-switch"><div class="ds-vs-switch-thumb"></div></div>
</div>
</div>
</div>
</div>

<!-- Persistent Row 3: Interactive Video Player Preview -->
<div class="ds-vs-preview-container" data-preview-container>
<div class="ds-vs-player-viewport" data-viewport>
<!-- Empty Placeholder -->
<div class="ds-vs-empty-state" data-empty-state>
${ICON.videoPlaceholder}
<div class="ds-vs-empty-text">No video exported yet</div>
<div class="ds-vs-empty-hint">Queue workflow to generate and preview</div>
</div>
<!-- Media Players -->
<video class="ds-vs-video" data-video playsinline loop preload="auto" style="display: none;"></video>
<img class="ds-vs-img" data-img style="display: none;" />
</div>

<!-- Player Controls Bar -->
<div class="ds-vs-controls-bar" data-controls-bar>
<button class="ds-vs-control-btn" data-btn-play title="Play / Pause">${ICON.play}</button>
<div class="ds-vs-progress-wrap" data-progress-wrap title="Seek time">
<div class="ds-vs-progress-track">
<div class="ds-vs-progress-fill" data-progress-fill></div>
</div>
</div>
<div class="ds-vs-time">
<span class="ds-vs-time-cur" data-time-cur>00:00</span> / <span data-time-dur>00:00</span>
</div>
<div class="ds-vs-audio-pill" data-audio-pill title="Hover cursor over video to unmute">
${ICON.volumeMute}
<span>Hover Audio</span>
</div>
<button class="ds-vs-control-btn" data-btn-fullscreen title="Fullscreen preview">${ICON.fullscreen}</button>
</div>
</div>
`;

// Attach elements to node reference
node.rootEl = root;
node._fpsRowEl = root.querySelector("[data-fps-row]");
node._fpsWrap = root.querySelector("[data-fps-wrap]");
node._fpsInput = root.querySelector("[data-fps-input]");
node._drawerEl = root.querySelector("[data-drawer]");
node._drawerToggle = root.querySelector("[data-drawer-toggle]");
node._drawerIcon = root.querySelector("[data-drawer-icon]");
node._formatTrigger = root.querySelector("[data-format-trigger]");
node._formatLabel = root.querySelector("[data-format-label]");
node._pixTrigger = root.querySelector("[data-pix-trigger]");
node._pixLabel = root.querySelector("[data-pix-label]");
node._videoEl = root.querySelector("[data-video]");
node._imgEl = root.querySelector("[data-img]");
node._emptyState = root.querySelector("[data-empty-state]");
node._btnPlay = root.querySelector("[data-btn-play]");
node._progressWrap = root.querySelector("[data-progress-wrap]");
node._progressFill = root.querySelector("[data-progress-fill]");
node._timeCur = root.querySelector("[data-time-cur]");
node._timeDur = root.querySelector("[data-time-dur]");
node._audioPill = root.querySelector("[data-audio-pill]");

// Wire FPS Stepper & Input
const fpsUp = root.querySelector("[data-fps-up]");
const fpsDown = root.querySelector("[data-fps-down]");
attachStepper(
fpsUp,
fpsDown,
() => node._fpsInput.value,
(val) => {
getPropState(node).fps = val;
node._fpsInput.value = val.toFixed(2);
persist(node);
},
1.0,
0.01,
1000.0,
true
);

node._fpsInput.addEventListener("input", () => {
const val = Number(node._fpsInput.value) || 24.0;
getPropState(node).fps = val;
persist(node);
});

// Action Toolbar Events
root.querySelector("[data-btn-open]").addEventListener("click", (e) => {
stop(e);
openVideoFile(node);
});

root.querySelector("[data-btn-folder]").addEventListener("click", (e) => {
stop(e);
openOutputFolder(node);
});

node._drawerToggle.addEventListener("click", (e) => {
stop(e);
const s = getPropState(node);
s.drawer_expanded = !s.drawer_expanded;
persist(node);
render(node);
});

// Format Bar: Tabs & Dropdown Menu
const tabs = root.querySelectorAll("[data-tab]");
tabs.forEach((tab) => {
tab.addEventListener("click", (e) => {
stop(e);
const cat = tab.dataset.tab;
const s = getPropState(node);
s.active_category = cat;
if (cat === "Video") {
if (!VIDEO_FORMATS.includes(s.selected_format)) {
s.selected_format = "h264-mp4";
}
} else {
if (!IMAGE_FORMATS.includes(s.selected_format)) {
s.selected_format = "image/gif";
}
}
persist(node);
render(node);
});
});

node._formatTrigger.addEventListener("click", (e) => {
stop(e);
openFormatMenu(node);
});

node._pixTrigger.addEventListener("click", (e) => {
stop(e);
openPixFmtMenu(node);
});

// Sub-panel Inputs & Steppers
const prefixInput = root.querySelector("[data-input-prefix]");
prefixInput.addEventListener("input", () => {
getPropState(node).prefix = prefixInput.value;
persist(node);
});

const prefixGifInput = root.querySelector("[data-input-prefix-gif]");
prefixGifInput.addEventListener("input", () => {
getPropState(node).prefix = prefixGifInput.value;
persist(node);
});

const prefixWebpInput = root.querySelector("[data-input-prefix-webp]");
prefixWebpInput.addEventListener("input", () => {
getPropState(node).prefix = prefixWebpInput.value;
persist(node);
});

// Steppers for Loop & CRF
attachStepper(
root.querySelector("[data-loop-up]"),
root.querySelector("[data-loop-down]"),
() => getPropState(node).loop_count,
(v) => {
getPropState(node).loop_count = v;
persist(node);
render(node);
},
1,
0,
100,
false
);

attachStepper(
root.querySelector("[data-loop-gif-up]"),
root.querySelector("[data-loop-gif-down]"),
() => getPropState(node).loop_count,
(v) => {
getPropState(node).loop_count = v;
persist(node);
render(node);
},
1,
0,
100,
false
);

attachStepper(
root.querySelector("[data-loop-webp-up]"),
root.querySelector("[data-loop-webp-down]"),
() => getPropState(node).loop_count,
(v) => {
getPropState(node).loop_count = v;
persist(node);
render(node);
},
1,
0,
100,
false
);

attachStepper(
root.querySelector("[data-crf-up]"),
root.querySelector("[data-crf-down]"),
() => getPropState(node).crf,
(v) => {
getPropState(node).crf = v;
persist(node);
render(node);
},
1,
0,
51,
false
);

// Toggle Controls
root.querySelectorAll("[data-toggle]").forEach((ctl) => {
ctl.addEventListener("click", (e) => {
stop(e);
const key = ctl.dataset.toggle;
const s = getPropState(node);
s[key] = !s[key];
persist(node);
render(node);
});
});

// Interactive Video Player Setup
const video = node._videoEl;
const viewport = root.querySelector("[data-viewport]");

viewport.addEventListener("click", (e) => {
stop(e);
if (!video.src) return;
if (video.paused) video.play();
else video.pause();
updatePlayBtn(node);
});

node._btnPlay.addEventListener("click", (e) => {
stop(e);
if (!video.src) return;
if (video.paused) video.play();
else video.pause();
updatePlayBtn(node);
});

// Smart Hover Audio
viewport.addEventListener("pointerenter", () => {
if (!video.src || !node._hasAudio) return;
video.muted = false;
node._audioPill.classList.add("is-unmuted");
node._audioPill.innerHTML = `${ICON.volumeUp}<span>Hover Audio (Active)</span>`;
});

viewport.addEventListener("pointerleave", () => {
if (!video.src) return;
video.muted = true;
node._audioPill.classList.remove("is-unmuted");
node._audioPill.innerHTML = `${ICON.volumeMute}<span>Hover Audio</span>`;
});

// Progress scrubbing
node._progressWrap.addEventListener("click", (e) => {
stop(e);
if (!video.duration) return;
const rect = node._progressWrap.getBoundingClientRect();
const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
video.currentTime = pos * video.duration;
});

video.addEventListener("timeupdate", () => {
if (!video.duration) return;
const pct = (video.currentTime / video.duration) * 100;
node._progressFill.style.width = `${pct}%`;
node._timeCur.textContent = formatTime(video.currentTime);
});

video.addEventListener("loadedmetadata", () => {
node._timeDur.textContent = formatTime(video.duration);
updatePlayBtn(node);
});

video.addEventListener("play", () => updatePlayBtn(node));
video.addEventListener("pause", () => updatePlayBtn(node));

// Fullscreen button
root.querySelector("[data-btn-fullscreen]").addEventListener("click", (e) => {
stop(e);
openFullscreenModal(node);
});

return root;
}

function updatePlayBtn(node) {
const isPaused = node._videoEl.paused;
node._btnPlay.innerHTML = isPaused ? ICON.play : ICON.pause;
}

// ------------------------------------------------------------------
// Format Menus (Custom Deathshot Dropdowns)
// ------------------------------------------------------------------
function openFormatMenu(node) {
const s = getPropState(node);
const items = s.active_category === "Video" ? VIDEO_FORMATS : IMAGE_FORMATS;

const menu = document.createElement("div");
menu.className = "ds-ui-menu";
menu.addEventListener("pointerdown", stop);
menu.addEventListener("mousedown", stop);

for (const item of items) {
const btn = document.createElement("button");
btn.type = "button";
btn.className = "ds-ui-menu-item";
btn.style.cssText =
"width: 100%; height: 26px; display: flex; align-items: center; padding: 0 8px; border: none; background: transparent; color: var(--ds-text, #e5e7eb); font-size: 10px; font-weight: 600; cursor: pointer; text-align: left; border-radius: 4px;";
btn.textContent = item;
if (item === s.selected_format) {
btn.style.background = "var(--ds-panel-2, #161a23)";
btn.style.color = "var(--ds-accent, #67e8f9)";
}
btn.addEventListener("mouseenter", () => {
btn.style.background = "var(--ds-hover, #1c2130)";
});
btn.addEventListener("mouseleave", () => {
btn.style.background = item === s.selected_format ? "var(--ds-panel-2, #161a23)" : "transparent";
});
btn.addEventListener("click", (e) => {
stop(e);
s.selected_format = item;
persist(node);
render(node);
menu.remove();
});
menu.appendChild(btn);
}

document.body.appendChild(menu);
const rect = node._formatTrigger.getBoundingClientRect();
menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 170, rect.left))}px`;
menu.style.top = `${rect.bottom + 4}px`;

setTimeout(() => {
const clickAway = (e) => {
if (!menu.contains(e.target) && !node._formatTrigger.contains(e.target)) {
menu.remove();
document.removeEventListener("pointerdown", clickAway, true);
}
};
document.addEventListener("pointerdown", clickAway, true);
}, 0);
}

function openPixFmtMenu(node) {
const s = getPropState(node);
const menu = document.createElement("div");
menu.className = "ds-ui-menu";
menu.addEventListener("pointerdown", stop);

for (const fmt of PIX_FMTS) {
const btn = document.createElement("button");
btn.type = "button";
btn.className = "ds-ui-menu-item";
btn.style.cssText =
"width: 100%; height: 26px; display: flex; align-items: center; padding: 0 8px; border: none; background: transparent; color: var(--ds-text, #e5e7eb); font-size: 10px; font-weight: 600; cursor: pointer; text-align: left; border-radius: 4px;";
btn.textContent = fmt;
if (fmt === s.pix_fmt) {
btn.style.background = "var(--ds-panel-2, #161a23)";
btn.style.color = "var(--ds-accent, #67e8f9)";
}
btn.addEventListener("click", (e) => {
stop(e);
s.pix_fmt = fmt;
persist(node);
render(node);
menu.remove();
});
menu.appendChild(btn);
}

document.body.appendChild(menu);
const rect = node._pixTrigger.getBoundingClientRect();
menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 140, rect.left))}px`;
menu.style.top = `${rect.bottom + 4}px`;

setTimeout(() => {
const clickAway = (e) => {
if (!menu.contains(e.target) && !node._pixTrigger.contains(e.target)) {
menu.remove();
document.removeEventListener("pointerdown", clickAway, true);
}
};
document.addEventListener("pointerdown", clickAway, true);
}, 0);
}

// ------------------------------------------------------------------
// Fullscreen Preview Modal
// ------------------------------------------------------------------
function openFullscreenModal(node) {
if (!node._lastPath) {
showToast(node, "No media to preview");
return;
}

const modal = document.createElement("div");
modal.className = "ds-vs-modal";

const isImg =
node.properties[PROP]?.selected_format === "image/gif" ||
node.properties[PROP]?.selected_format === "image/webp" ||
node._lastPath.endsWith(".png") ||
node._lastPath.endsWith(".gif") ||
node._lastPath.endsWith(".webp");

const mediaSrc = url(`/ds/video_save/preview?path=${encodeURIComponent(node._lastPath)}`);

modal.innerHTML = `
<div class="ds-vs-modal-head">
<div class="ds-vs-modal-title">DS Video Save — Fullscreen Preview</div>
<button class="ds-vs-modal-close" data-close title="Close (Esc)">${ICON.close}</button>
</div>
<div class="ds-vs-modal-body">
${
isImg
? `<img src="${mediaSrc}" />`
: `<video src="${mediaSrc}" loop controls playsinline></video>`
}
</div>
`;

const close = () => {
modal.remove();
window.removeEventListener("keydown", onKey);
};
modal.querySelector("[data-close]").addEventListener("click", close);
modal.addEventListener("click", (e) => {
if (e.target === modal) close();
});

const onKey = (e) => {
if (e.key === "Escape") {
close();
}
};
window.addEventListener("keydown", onKey);

document.body.appendChild(modal);

if (!isImg) {
const v = modal.querySelector("video");
if (v) {
v.play().catch(() => {
v.muted = true;
v.play().catch(() => {});
});
}
}
}

function showToast(node, msg, isWarn = false) {
if (!node.rootEl) return;
const old = node.rootEl.querySelector(".ds-vs-toast");
old?.remove();
const t = document.createElement("div");
t.className = "ds-vs-toast" + (isWarn ? " is-warn" : "");
t.textContent = msg;
node.rootEl.appendChild(t);
setTimeout(() => t.remove(), 2500);
}

function url(path) {
return typeof api.fileURL === "function" ? api.fileURL(path) : path;
}

// ------------------------------------------------------------------
// Toolbar Actions: OS Player & Folder
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
} catch (err) {
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
} catch (err) {
showToast(node, "Failed to open folder", true);
}
}

// ------------------------------------------------------------------
// Render & Sync
// ------------------------------------------------------------------
function render(node) {
if (!node.rootEl) return;
const s = getPropState(node);

// 1. Inline FPS input state
const fpsSlot = node.inputs?.find((inp) => inp?.name?.toLowerCase() === "fps");
const isFpsConnected = fpsSlot?.link != null;
node._fpsWrap?.classList.toggle("is-connected", isFpsConnected);
if (node._fpsInput) {
node._fpsInput.disabled = isFpsConnected;
if (!isFpsConnected) {
node._fpsInput.value = Number(s.fps).toFixed(2);
}
}

// 2. Drawer expansion state
node._drawerEl?.classList.toggle("is-collapsed", !s.drawer_expanded);
node._drawerToggle?.classList.toggle("is-expanded", s.drawer_expanded);
if (node._drawerIcon) {
node._drawerIcon.innerHTML = s.drawer_expanded ? ICON.chevronUp : ICON.chevronDown;
}

// 3. Format category tabs & dropdown
node.rootEl.querySelectorAll("[data-tab]").forEach((t) => {
t.classList.toggle("is-active", t.dataset.tab === s.active_category);
});
node._formatLabel.textContent = s.selected_format;
node._pixLabel.textContent = s.pix_fmt;

// 4. Sub-panels visibility
const isVideo = s.active_category === "Video";
node.rootEl.querySelector("[data-panel-video]").style.display = isVideo ? "flex" : "none";
node.rootEl.querySelector("[data-panel-gif]").style.display =
!isVideo && s.selected_format === "image/gif" ? "flex" : "none";
node.rootEl.querySelector("[data-panel-webp]").style.display =
!isVideo && s.selected_format === "image/webp" ? "flex" : "none";

// 5. Populate input values
const pInput = node.rootEl.querySelector("[data-input-prefix]");
if (pInput) pInput.value = s.prefix || "DS_Video";
const pGifInput = node.rootEl.querySelector("[data-input-prefix-gif]");
if (pGifInput) pGifInput.value = s.prefix || "DS_Gif";
const pWebpInput = node.rootEl.querySelector("[data-input-prefix-webp]");
if (pWebpInput) pWebpInput.value = s.prefix || "DS_Webp";

const loopInput = node.rootEl.querySelector("[data-input-loop]");
if (loopInput) loopInput.value = s.loop_count || 0;
const loopGifInput = node.rootEl.querySelector("[data-input-loop-gif]");
if (loopGifInput) loopGifInput.value = s.loop_count || 0;
const loopWebpInput = node.rootEl.querySelector("[data-input-loop-webp]");
if (loopWebpInput) loopWebpInput.value = s.loop_count || 0;

const crfInput = node.rootEl.querySelector("[data-input-crf]");
if (crfInput) crfInput.value = s.crf || 12;

// 6. Toggle controls state
node.rootEl.querySelectorAll("[data-toggle]").forEach((ctl) => {
const key = ctl.dataset.toggle;
const sw = ctl.querySelector(".ds-vs-switch");
if (sw) sw.classList.toggle("is-checked", !!s[key]);
});

// 7. Theme binding
try {
window.DSGlobalTheme?.bindNode?.(node.rootEl, node);
} catch {}
}

function updatePreview(node, mediaPath) {
if (!node.rootEl) return;
node._lastPath = mediaPath || "";

const video = node._videoEl;
const img = node._imgEl;
const empty = node._emptyState;

if (!mediaPath) {
video.style.display = "none";
img.style.display = "none";
empty.style.display = "flex";
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
img.style.display = "block";
empty.style.display = "none";
img.onerror = () => {
    empty.style.display = "flex";
    img.style.display = "none";
};
img.src = streamUrl;
} else {
img.style.display = "none";
video.style.display = "block";
empty.style.display = "none";
video.onerror = () => {
    console.warn("[DS Video Save] Preview video playback error:", streamUrl);
};
video.src = streamUrl;
video.muted = true;
video.play().catch(() => {});
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

getPropState(node);

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

// Build and mount DOM Widget
const root = buildRoot(node);
const widget = node.addDOMWidget("video_save_ui", "custom", root, {
serialize: false,
hideOnZoom: false,
getValue: () => null,
setValue: () => {},
});
node._vsWidget = widget;

widget.computeLayoutSize = () => ({
minHeight: MIN_H,
minWidth: MIN_W,
});
widget.onPointerDown = (pointer) => {
const target = pointer?.eDown?.target;
return !!target?.closest?.("button,input,textarea,select,video,.ds-vs-progress-wrap");
};

// Connection change hook (locks/dims FPS stepper when wired)
const origOnConnectionsChange = node.onConnectionsChange?.bind(node);
node.onConnectionsChange = function (type, index, isConnected, link_info, input_or_output) {
origOnConnectionsChange?.apply(this, arguments);
render(this);
};

syncWidgets(node);
render(node);
setTimeout(() => {
try {
window.DSGlobalTheme?.bindNode?.(root, node);
syncWidgets(node);
render(node);
} catch {}
}, 0);
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
        const isComment = (
            (uint8[i] === 0x43 && uint8[i+1] === 0x4f && uint8[i+2] === 0x4d && uint8[i+3] === 0x4d && uint8[i+4] === 0x45 && uint8[i+5] === 0x4e && uint8[i+6] === 0x54) ||
            (uint8[i] === 0x63 && uint8[i+1] === 0x6f && uint8[i+2] === 0x6d && uint8[i+3] === 0x6d && uint8[i+4] === 0x65 && uint8[i+5] === 0x6e && uint8[i+6] === 0x74)
        );
        if (isComment) {
            for (let k = i + 7; k < Math.min(len, i + 64); k++) {
                if (uint8[k] === 0x7b) { // '{'
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
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB head & tail chunk

    // 1. Read header (faststart MP4s, WebM, MKV have metadata near the beginning)
    const headBlob = file.slice(0, Math.min(file.size, CHUNK_SIZE));
    const headBuf = await readBlobBuffer(headBlob);
    let result = parseVideoBuffer(headBuf);
    if (result) return result;

    // 2. If not found and file > 4MB, check tail (non-faststart MP4s have moov at the end)
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
    // Hijack comfy-file-input accept list so user can also open videos via file picker
    const fileInput = document.getElementById("comfy-file-input");
    if (fileInput && !fileInput.accept?.includes("video/")) {
        fileInput.accept += ",video/mp4,video/webm,video/x-matroska,video/quicktime,.mp4,.webm,.mkv,.mov";
    }

    // Wrap app.handleFile to intercept video drops
    const origHandleFile = app.handleFile;
    app.handleFile = async function (file, ...args) {
        if (isVideoFile(file)) {
            try {
                // First check native ComfyUI parser if available
                let meta = null;
                if (window.comfyAPI?.isobmff?.getFromIsobmffFile && (file.name?.endsWith(".mp4") || file.name?.endsWith(".mov") || file.type?.includes("mp4") || file.type?.includes("quicktime"))) {
                    try { meta = await window.comfyAPI.isobmff.getFromIsobmffFile(file); } catch {}
                }
                if (!meta?.workflow && window.comfyAPI?.ebml?.getFromWebmFile && (file.name?.endsWith(".webm") || file.type?.includes("webm"))) {
                    try { meta = await window.comfyAPI.ebml.getFromWebmFile(file); } catch {}
                }
                // Fallback to our robust custom parser (supports \xa9cmt, NaN, Infinity, and legacy files)
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
// Restore properties from widget config_json if available
const w = this.widgets?.find((x) => x?.name === "config_json");
if (w?.value) {
try {
const raw = Array.isArray(w.value) ? w.value.join("") : String(w.value);
const saved = JSON.parse(raw);
if (saved && typeof saved === "object") Object.assign(s, saved);
} catch {}
}
syncWidgets(this);
render(this);
}, 30);
return r;
};

const oldSerialize = nodeType.prototype.serialize;
nodeType.prototype.serialize = function () {
persist(this);
return oldSerialize?.apply(this, arguments) || {};
};

const oldRemoved = nodeType.prototype.onRemoved;
nodeType.prototype.onRemoved = function () {
try {
if (this._videoEl) {
this._videoEl.pause();
this._videoEl.removeAttribute("src");
this._videoEl.load();
}
if (this._imgEl) {
this._imgEl.removeAttribute("src");
}
if (this.rootEl) {
this.rootEl.remove();
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
this._lastPath = String(primary);
this._hasAudio = hasAudio;
updatePreview(this, this._lastPath);
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
    window.addEventListener("ds-theme-changed", () => {
        for (const n of app.graph?._nodes || []) {
            if (n?.type === TYPE) render(n);
        }
    });

    // Restore last previews from server state
    try {
        const res = await fetch(url("/ds/video_save/state"));
        const saved = await res.json();
        for (const n of app.graph?._nodes || []) {
            if (n?.type === TYPE) {
                const st = saved?.nodes?.[String(n.id)];
                if (st?.last_path) {
                    n._lastPath = st.last_path;
                    n._hasAudio = Boolean(st.has_audio);
                    updatePreview(n, n._lastPath);
                }
            }
        }
    } catch {}
},
});

