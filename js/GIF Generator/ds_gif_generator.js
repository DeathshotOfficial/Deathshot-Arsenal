/**
 * DeathshotArsenal — DS GIF Generator Node Frontend
 * Layout: Status -> Settings -> Preview
 * Features real-time progress bar, live encoding updates, and constant node sizing.
 */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { registerCardNode, useNativeWidget, LAYOUT } from "../UIElements/card_layout.js";
import {
  ImagePreview,
  Button,
  Dropdown,
  Slider,
  Stepper,
  Toggle,
  Field,
  Section,
  Panel,
  Input,
  StatusBar,
  DSIcon,
} from "../UIElements/index.js";

const STYLE_ID = "dsgif-style";
// GIF delays are 1/100 s; >50 FPS => 1cs delays => browsers play them at 100ms (slow motion)
const GIF_MAX_FPS = 50;

function injectNodeStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.dsui-card .ds-ui-status-bar {
  display: flex;
  align-items: center;
  gap: var(--ds-gap-sm, 6px);
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  font-family: var(--ds-font);
  user-select: text;
}
.dsui-card .ds-ui-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--ds-color-muted-text, #9ca3af);
  transition: background-color var(--ds-transition);
}
.dsui-card .ds-ui-status-bar[data-state="running"] .ds-ui-status-dot {
  background: var(--ds-color-accent, #67e8f9);
  box-shadow: 0 0 6px var(--ds-color-accent, #67e8f9);
}
.dsui-card .ds-ui-status-bar[data-state="success"] .ds-ui-status-dot {
  background: var(--ds-color-success, #34d399);
}
.dsui-card .ds-ui-status-bar[data-state="error"] .ds-ui-status-dot {
  background: var(--ds-color-danger, #f87171);
}
.dsui-card .ds-ui-status-label {
  font-size: 11px;
  color: var(--ds-color-muted-text, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 0;
  min-width: 0;
}
.dsui-card .ds-ui-status-bar[data-state="running"] .ds-ui-status-label {
  color: var(--ds-color-text, #e5e7eb);
}
.dsui-card .ds-ui-status-bar[data-state="error"] .ds-ui-status-label {
  color: var(--ds-color-danger, #f87171);
}
.dsui-card .ds-ui-status-track {
  height: 4px;
  width: 70px;
  flex-shrink: 0;
  background: var(--ds-color-border, #242a36);
  border-radius: 2px;
  overflow: hidden;
  display: none;
}
.dsui-card .ds-ui-status-fill {
  height: 100%;
  background: var(--ds-color-accent, #67e8f9);
  border-radius: 2px;
  transition: width 120ms ease;
}
.dsui-card .ds-ui-status-percent {
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-accent, #67e8f9);
  flex-shrink: 0;
}
.dsui-card .ds-ui-card-body > .dsgif-settings.dsui-grow {
  flex: 0 1 auto;
  max-height: 420px;
  overflow-y: auto;
}
.dsui-card .ds-ui-card-body > .dsgif-settings.is-collapsed {
  display: none !important;
}
.dsgif-field-row {
  display: flex;
  gap: var(--ds-gap-sm, 6px);
  width: 100%;
}
.dsgif-field-row > * {
  flex: 1 1 0;
  min-width: 0;
}
.dsgif-fps-row {
  display: flex;
  gap: 4px;
  width: 100%;
}
.dsgif-fps-row > button {
  flex: 1 1 0;
  min-width: 0;
  padding: 0;
  text-align: center;
}
.dsgif-est-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--ds-color-surface-sunken, rgba(0, 0, 0, 0.28));
  border: 1px solid var(--ds-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--ds-radius-md, 6px);
  padding: 8px 10px;
  margin-top: 6px;
  box-sizing: border-box;
}
.dsgif-est-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dsgif-est-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ds-color-text, #e5e7eb);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dsgif-est-val {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-accent, #67e8f9);
}
.dsgif-est-val.is-large {
  color: var(--ds-color-warning, #fbbf24);
}
.dsgif-est-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10.5px;
  color: var(--ds-color-muted-text, #9ca3af);
}
.dsgif-est-source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.dsgif-est-source-tag {
  color: var(--ds-color-text, #d1d5db);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsgif-est-details-tag {
  color: var(--ds-color-muted-text, #9ca3af);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}
.dsgif-est-warn {
  display: none;
  font-size: 10px;
  line-height: 1.35;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 4px;
  padding: 4px 6px;
  margin-top: 3px;
}
.dsgif-timing-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: var(--ds-color-surface-sunken, rgba(0, 0, 0, 0.24));
  border: 1px solid var(--ds-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--ds-radius-sm, 4px);
  padding: 4px 8px;
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ds-color-muted-text, #9ca3af);
  font-variant-numeric: tabular-nums;
}
.dsgif-timing-pill-val {
  color: var(--ds-color-accent, #67e8f9);
  font-weight: 600;
}
.dsgif-timing-warn {
  display: none;
  font-size: 10px;
  line-height: 1.35;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 4px;
  padding: 5px 7px;
  margin-top: 4px;
}
.dsui-card .ds-ui-card-body > .ds-ui-preview-container.dsui-grow {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 140px;
}
.ds-ui-preview-container.dsui-grow .ds-ui-image-preview-box {
  flex: 1 1 auto;
  height: 100%;
  width: 100%;
  min-height: 0;
  cursor: pointer;
  user-select: none;
}
`;
  document.head.appendChild(style);
}

const RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

function validatePath(str) {
  if (!str) return { valid: true };
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) < 32) return { valid: false, reason: "Contains control characters" };
  }
  if (/^[a-zA-Z]:/.test(str)) {
    return { valid: false, reason: "Drive letters not allowed (must be relative)" };
  }
  if (str.startsWith("/") || str.startsWith("\\")) {
    return { valid: false, reason: "Leading slash not allowed (must be relative)" };
  }
  const illegal = ["<", ">", ":", '"', "|", "?", "*"];
  for (const ch of illegal) {
    if (str.includes(ch)) return { valid: false, reason: `Illegal character '${ch}'` };
  }
  const parts = str.replace(/\\/g, "/").split("/");
  for (const p of parts) {
    if (p === "..") return { valid: false, reason: "Cannot contain '..' segments" };
    if (p.endsWith(" ") || p.endsWith(".")) return { valid: false, reason: "Segments cannot end with space or dot" };
    const stem = p.split(".")[0].toUpperCase();
    if (RESERVED_NAMES.has(stem)) return { valid: false, reason: `Reserved device name '${stem}'` };
  }
  return { valid: true };
}

function buildGifGenerator(node, card) {
  injectNodeStyles();

  // Apply DS Global theme to the outer LiteGraph node canvas base
  if (window.DSGlobalTheme?.applyNodeBaseTheme) {
    window.DSGlobalTheme.applyNodeBaseTheme(node);
  }

  // Disable default LiteGraph / ComfyUI canvas progress bar rendering on this node
  node.drawProgressBar = function () {};
  node.drawExecutionProgress = function () {};
  try {
    Object.defineProperty(node, "drawProgressBar", {
      value: function () {},
      writable: false,
      configurable: true,
    });
    Object.defineProperty(node, "drawExecutionProgress", {
      value: function () {},
      writable: false,
      configurable: true,
    });
    Object.defineProperty(node, "progress", {
      get() { return null; },
      set(_) {},
      configurable: true,
    });
  } catch (_) {}

  // 1. Safe helper for native Python widgets (handles cached node instances)
  function getWidget(name, defaultVal) {
    const w = node.widgets?.find((x) => x.name === name);
    if (w) {
      w.hidden = true;
      w.computeSize = () => [0, -4];
      return w;
    }
    return { name, value: defaultVal, hidden: true, computeSize: () => [0, -4] };
  }

  const w_save_path = getWidget("save_path", "Gif/Gif");
  const w_format = getWidget("format", "GIF");
  const w_save_mode = getWidget("save_mode", "Save + preview");
  const w_existing_files = getWidget("existing_files", "Auto-number");
  const w_fps = getWidget("fps", 24);
  const w_loop_count = getWidget("loop_count", 0);
  const w_playback_order = getWidget("playback_order", "Forward");
  const w_start_frame = getWidget("start_frame", 0);
  const w_end_frame = getWidget("end_frame", 0);
  const w_frame_step = getWidget("frame_step", 1);
  const w_max_side = getWidget("max_side", 0);
  const w_resample = getWidget("resample", "Lanczos");
  const w_quality = getWidget("quality", 90);
  const w_compression = getWidget("compression", 50);
  const w_colors = getWidget("colors", 256);
  const w_dither = getWidget("dither", "Bayer");
  const w_palette = getWidget("palette", "Global");
  const w_optimize = getWidget("optimize", true);
  const w_lossless = getWidget("lossless", false);
  const w_timing_mode = getWidget("timing_mode", "Sync speed (Real-time)");
  const w_source_fps = getWidget("source_fps", 0);

  const allWidgets = [
    w_save_path, w_format, w_save_mode, w_existing_files,
    w_fps, w_loop_count, w_playback_order,
    w_start_frame, w_end_frame, w_frame_step,
    w_max_side, w_resample,
    w_quality, w_compression,
    w_colors, w_dither, w_palette, w_optimize,
    w_lossless,
    w_timing_mode, w_source_fps,
  ];

  let lastSavedPath = "";
  let isPaused = false;
  let pauseCanvas = null;

  // =========================================================================
  // Item 1: Status Row (TOP of the card)
  // =========================================================================
  const statusBar = StatusBar({ text: "Ready", state: "idle" });
  const copyBtn = Button({
    icon: "copy",
    compact: true,
    tooltip: "Copy saved path",
    onClick: async (e) => {
      e.stopPropagation();
      if (!lastSavedPath) return;
      try {
        await navigator.clipboard.writeText(lastSavedPath);
        const prevText = statusBar.label.textContent;
        statusBar.setStatus("Copied to clipboard", "success");
        setTimeout(() => {
          statusBar.setStatus(prevText, "idle");
        }, 1500);
      } catch (err) {
        console.error("[DS GIF] Copy failed:", err);
      }
    },
  });
  copyBtn.root.style.flex = "0 0 24px";
  card.row([statusBar.root, copyBtn.root], { height: 24 });

  // =========================================================================
  // Item 2: Settings Menu Toggle & Settings Panel (BELOW Status)
  // =========================================================================
  let isMenuOpen = node.properties?.dsGifMenuOpen ?? true;
  const menuToggle = Button({
    label: "Settings",
    icon: isMenuOpen ? "chevron-up" : "chevron-down",
    active: isMenuOpen,
    onClick: (e) => {
      e.stopPropagation();
      setMenuOpen(!isMenuOpen);
    },
  });
  menuToggle.root.setAttribute("aria-pressed", isMenuOpen ? "true" : "false");
  card.fixed(menuToggle.root, { height: LAYOUT.ROW_HEIGHT });

  const settingsPanel = Panel({
    className: "dsgif-settings",
  });

  function setMenuOpen(open) {
    isMenuOpen = Boolean(open);
    settingsPanel.root.classList.toggle("is-collapsed", !isMenuOpen);
    settingsPanel.setVisible(isMenuOpen);
    menuToggle.setActive(isMenuOpen);
    menuToggle.setIcon(isMenuOpen ? "chevron-up" : "chevron-down");
    card.commit(() => {
      node.properties = node.properties || {};
      node.properties.dsGifMenuOpen = isMenuOpen;
    });
  }

  // --- Output Section ---
  settingsPanel.append(Section({ title: "Output" }));

  const inputPath = Input({
    value: w_save_path.value,
    placeholder: "Gif/Gif",
    onInput: (val) => {
      const check = validatePath(val);
      if (!check.valid) {
        inputPath.setError(true);
        fieldPath.setError(check.reason);
        statusBar.setStatus(check.reason, "error");
      } else {
        inputPath.setError(false);
        fieldPath.clearError();
        checkTimingWarning();
      }
    },
    onChange: (val) => {
      const check = validatePath(val);
      if (check.valid) {
        card.set(w_save_path, val);
        inputPath.setError(false);
        fieldPath.clearError();
        checkTimingWarning();
      } else {
        inputPath.setError(true);
        fieldPath.setError(check.reason);
        statusBar.setStatus(check.reason, "error");
      }
    },
  });

  const fieldPath = Field({ label: "Save path", control: inputPath });
  settingsPanel.append(fieldPath);

  const dropdownFormat = Dropdown({
    label: "Format",
    options: [
      { id: "GIF", label: "GIF" },
      { id: "WebP", label: "WebP (animated)" },
      { id: "APNG", label: "APNG" },
    ],
    value: w_format.value,
    onChange: (val) => {
      card.set(w_format, val);
      updateFormatDependencies(val);
      checkTimingWarning();
    },
  });

  const dropdownSaveMode = Dropdown({
    label: "Save mode",
    options: [
      { id: "Save + preview", label: "Save + preview" },
      { id: "Preview only", label: "Preview only" },
    ],
    value: w_save_mode.value,
    onChange: (val) => {
      card.set(w_save_mode, val);
    },
  });

  const dropdownExisting = Dropdown({
    label: "Existing files",
    options: [
      { id: "Auto-number", label: "Auto-number" },
      { id: "Overwrite", label: "Overwrite" },
    ],
    value: w_existing_files.value,
    onChange: (val) => {
      card.set(w_existing_files, val);
    },
  });

  const outputRow = document.createElement("div");
  outputRow.className = "dsgif-field-row";
  outputRow.append(dropdownFormat.root, dropdownSaveMode.root, dropdownExisting.root);
  settingsPanel.append(outputRow);

  // --- Timing Section ---
  settingsPanel.append(Section({ title: "Timing" }));

  const fpsPresets = [10, 12, 15, 20, 24, 30, 50, 60];
  const fpsButtons = [];
  const fpsRow = document.createElement("div");
  fpsRow.className = "dsgif-fps-row";

  fpsPresets.forEach((preset, idx) => {
    const btn = Button({
      label: String(preset),
      compact: true,
      active: Number(w_fps.value) === preset,
      onClick: (e) => {
        e.stopPropagation();
        card.set(w_fps, preset);
        stepperFps.setValue(preset);
        syncFpsPresets(preset);
        checkTimingWarning();
      },
    });

    btn.root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        e.stopPropagation();
        fpsButtons[idx - 1].root.focus();
      } else if (e.key === "ArrowRight" && idx < fpsButtons.length - 1) {
        e.preventDefault();
        e.stopPropagation();
        fpsButtons[idx + 1].root.focus();
      }
    });

    fpsButtons.push(btn);
    fpsRow.appendChild(btn.root);
  });

  function syncFpsPresets(val) {
    const num = Number(val);
    fpsButtons.forEach((btn, i) => {
      btn.setActive(fpsPresets[i] === num);
    });
  }

  settingsPanel.append(fpsRow);

  const stepperFps = Stepper({
    value: w_fps.value,
    min: 1,
    max: 60,
    step: 1,
    compact: true,
    onChange: (val) => {
      card.set(w_fps, Number(val));
      syncFpsPresets(val);
      checkTimingWarning();
      updateEstimatedSize?.();
    },
  });

  const stepperLoop = Stepper({
    value: w_loop_count.value,
    min: 0,
    max: 100,
    step: 1,
    compact: true,
    onChange: (val) => {
      card.set(w_loop_count, Number(val));
    },
  });

  const dropdownOrder = Dropdown({
    label: "Order",
    options: [
      { id: "Forward", label: "Forward" },
      { id: "Reverse", label: "Reverse" },
      { id: "Ping-pong", label: "Ping-pong" },
    ],
    value: w_playback_order.value,
    onChange: (val) => {
      card.set(w_playback_order, val);
      updateEstimatedSize?.();
    },
  });

  const timingRow = document.createElement("div");
  timingRow.className = "dsgif-field-row";
  timingRow.append(
    Field({ label: "FPS (custom)", control: stepperFps }).root,
    Field({ label: "Loop count (0=∞)", control: stepperLoop }).root,
    Field({ label: "Playback", control: dropdownOrder }).root,
  );

  const dropdownTimingMode = Dropdown({
    label: "Timing mode",
    options: [
      { id: "Sync speed (Real-time)", label: "Sync speed (Real-time)" },
      { id: "Keep all frames", label: "Keep all frames" },
    ],
    value: w_timing_mode.value || "Sync speed (Real-time)",
    onChange: (val) => {
      card.set(w_timing_mode, val);
      updateEstimatedSize?.();
    },
  });

  const stepperSourceFps = Stepper({
    value: w_source_fps.value ?? 0,
    min: 0,
    max: 240,
    step: 1,
    compact: true,
    onChange: (val) => {
      card.set(w_source_fps, Number(val));
      updateEstimatedSize?.();
    },
  });

  const timingSpeedRow = document.createElement("div");
  timingSpeedRow.className = "dsgif-field-row";
  timingSpeedRow.append(
    Field({ label: "Timing mode", control: dropdownTimingMode }).root,
    Field({ label: "Source FPS (0=auto)", control: stepperSourceFps }).root,
  );

  const timingPill = document.createElement("div");
  timingPill.className = "dsgif-timing-pill";
  const timingPillLabel = document.createElement("span");
  timingPillLabel.textContent = "Playback speed";
  const timingPillVal = document.createElement("span");
  timingPillVal.className = "dsgif-timing-pill-val";
  timingPillVal.textContent = "1.0× Real-time";
  timingPill.append(timingPillLabel, timingPillVal);

  const timingWarn = document.createElement("div");
  timingWarn.className = "dsgif-timing-warn";
  timingWarn.textContent = "⚠️ GIF cannot store more than 50 FPS (delays <20ms play as slow motion in browsers). Output is capped at 50 FPS with real-time speed kept. Use WebP for true 60 FPS.";

  settingsPanel.append(timingRow, timingSpeedRow, timingPill, timingWarn);

  // --- Frames Section ---
  settingsPanel.append(Section({ title: "Frames" }));

  const stepperStart = Stepper({
    value: w_start_frame.value,
    min: 0,
    step: 1,
    compact: true,
    onChange: (val) => {
      card.set(w_start_frame, Number(val));
      updateEstimatedSize?.();
    },
  });

  const stepperEnd = Stepper({
    value: w_end_frame.value,
    min: 0,
    step: 1,
    compact: true,
    onChange: (val) => {
      card.set(w_end_frame, Number(val));
      updateEstimatedSize?.();
    },
  });

  const stepperStep = Stepper({
    value: w_frame_step.value,
    min: 1,
    step: 1,
    compact: true,
    onChange: (val) => {
      card.set(w_frame_step, Number(val));
      updateEstimatedSize?.();
    },
  });

  const framesRow = document.createElement("div");
  framesRow.className = "dsgif-field-row";
  framesRow.append(
    Field({ label: "Start", control: stepperStart }).root,
    Field({ label: "End (0=last)", control: stepperEnd }).root,
    Field({ label: "Every Nth", control: stepperStep }).root,
  );
  settingsPanel.append(framesRow);

  // --- Size Section ---
  settingsPanel.append(Section({ title: "Size" }));

  const stepperMaxSide = Stepper({
    value: w_max_side.value,
    min: 0,
    max: 8192,
    step: 16,
    compact: true,
    onChange: (val) => {
      card.set(w_max_side, Number(val));
      updateEstimatedSize?.();
    },
  });

  const dropdownResample = Dropdown({
    label: "Resample",
    options: [
      { id: "Lanczos", label: "Lanczos" },
      { id: "Bicubic", label: "Bicubic" },
      { id: "Bilinear", label: "Bilinear" },
      { id: "Nearest", label: "Nearest" },
    ],
    value: w_resample.value,
    onChange: (val) => {
      card.set(w_resample, val);
    },
  });

  const sizeRow = document.createElement("div");
  sizeRow.className = "dsgif-field-row";
  sizeRow.append(
    Field({ label: "Max side (0=orig)", control: stepperMaxSide }).root,
    Field({ label: "Filter", control: dropdownResample }).root,
  );
  settingsPanel.append(sizeRow);

  // --- Quality & Compression Section ---
  settingsPanel.append(Section({ title: "Quality & Compression" }));

  const sliderQuality = Slider({
    label: "Quality",
    min: 1,
    max: 100,
    step: 1,
    value: w_quality.value ?? 90,
    onChange: (val) => {
      card.set(w_quality, Number(val));
      updateEstimatedSize();
    },
  });

  const sliderCompression = Slider({
    label: "Compression",
    min: 0,
    max: 100,
    step: 1,
    value: w_compression.value ?? 50,
    onChange: (val) => {
      card.set(w_compression, Number(val));
      updateEstimatedSize();
    },
  });

  const fieldQuality = Field({ label: "Quality", control: sliderQuality });
  const fieldCompression = Field({ label: "Compression", control: sliderCompression });

  const qualCompRow = document.createElement("div");
  qualCompRow.className = "dsgif-field-row";
  qualCompRow.append(fieldQuality.root, fieldCompression.root);
  settingsPanel.append(qualCompRow);

  const sliderColors = Slider({
    label: "Colors",
    min: 2,
    max: 256,
    step: 1,
    value: w_colors.value ?? 256,
    onChange: (val) => {
      card.set(w_colors, Number(val));
      updateEstimatedSize();
    },
  });

  const dropdownDither = Dropdown({
    label: "Dither",
    options: [
      { id: "Bayer", label: "Bayer (Web standard)" },
      { id: "Floyd-Steinberg", label: "Floyd-Steinberg" },
      { id: "None", label: "None" },
    ],
    value: w_dither.value || "Bayer",
    onChange: (val) => {
      card.set(w_dither, val);
      updateEstimatedSize();
    },
  });

  const dropdownPalette = Dropdown({
    label: "Palette",
    options: [
      { id: "Global", label: "Global" },
      { id: "Per frame", label: "Per frame" },
    ],
    value: w_palette.value,
    onChange: (val) => {
      card.set(w_palette, val);
      updateEstimatedSize();
    },
  });

  const toggleOptimize = Toggle({
    label: "Optimize (GIF)",
    checked: Boolean(w_optimize.value),
    onChange: (val) => {
      card.set(w_optimize, Boolean(val));
      updateEstimatedSize();
    },
  });

  const toggleLossless = Toggle({
    label: "Lossless (WebP)",
    checked: Boolean(w_lossless.value),
    onChange: (val) => {
      card.set(w_lossless, Boolean(val));
      updateEstimatedSize();
    },
  });

  const gifQualRow1 = document.createElement("div");
  gifQualRow1.className = "dsgif-field-row";
  gifQualRow1.append(
    Field({ label: "Colors (GIF)", control: sliderColors }).root,
    Field({ label: "Dither (GIF)", control: dropdownDither }).root,
  );

  const gifQualRow2 = document.createElement("div");
  gifQualRow2.className = "dsgif-field-row";
  gifQualRow2.append(
    Field({ label: "Palette (GIF)", control: dropdownPalette }).root,
    toggleOptimize.root,
  );

  const webpQualRow = document.createElement("div");
  webpQualRow.className = "dsgif-field-row";
  webpQualRow.append(toggleLossless.root);

  settingsPanel.append(gifQualRow1, gifQualRow2, webpQualRow);

  function formatEstimatedBytes(bytes) {
    if (!bytes || bytes <= 0) return "~0 B";
    if (bytes < 1024) return `~${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getConnectedInputMeta() {
    const graph = node.graph || app?.graph;
    if (!graph) return null;

    const input = node.inputs?.[0];
    if (!input || input.link == null) return null;

    const link = graph.links?.[input.link];
    if (!link) return null;

    let originNode = graph.getNodeById(link.origin_id);
    if (!originNode) return null;

    // Follow reroutes
    let hops = 0;
    while (originNode && (originNode.type === "Reroute" || originNode.type === "DS_Reroute") && hops++ < 15) {
      const upInput = originNode.inputs?.[0];
      if (!upInput || upInput.link == null) break;
      const upLink = graph.links?.[upInput.link];
      if (!upLink) break;
      originNode = graph.getNodeById(upLink.origin_id);
    }
    if (!originNode) return null;

    const nodeType = String(originNode.type || originNode.comfyClass || "");
    const nodeTitle = originNode.title || nodeType || "Connected Node";

    // 1. DS_LoadVideo
    if (nodeType === "DS_LoadVideo") {
      const meta = originNode._videoMeta || {};
      let s = originNode._dsState;
      if (!s) {
        try {
          const raw = originNode.properties?.ds_load_video_state;
          if (raw) s = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch (_) {}
      }
      s = s || {};

      const metaFps = Number(meta.fps || 0);
      const forceRate = Number(s.force_rate || 0);
      const nthForFps = Math.max(1, Number(s.select_every_nth || 1));
      const baseFps = forceRate > 0 ? forceRate : metaFps;
      // Frames are decimated by select_every_nth, so the real rate of the loaded batch is fps / nth
      let fps = baseFps > 0 ? baseFps / nthForFps : 0;
      let srcW = Number(meta.width || 0);
      let srcH = Number(meta.height || 0);
      let totalF = Number(meta.frame_count || 0);

      // Check HTML video element fallback if metadata is pending
      if ((!srcW || !srcH) && originNode.video?.videoWidth) {
        srcW = originNode.video.videoWidth;
        srcH = originNode.video.videoHeight;
      }
      if (!totalF && originNode.video?.duration && baseFps > 0) {
        totalF = Math.round(originNode.video.duration * baseFps);
      }

      if (srcW > 0 && srcH > 0 && totalF > 0) {
        const skip = Math.max(0, Number(s.skip_first_frames || 0));
        const cap = Math.max(0, Number(s.frame_load_cap || 0));
        const nth = Math.max(1, Number(s.select_every_nth || 1));

        let effectiveF = Math.max(0, totalF - skip);
        if (cap > 0) effectiveF = Math.min(effectiveF, cap);
        effectiveF = Math.max(1, Math.ceil(effectiveF / nth));

        const cw = Number(s.custom_width || 0);
        const ch = Number(s.custom_height || 0);
        let outW = srcW;
        let outH = srcH;
        if (cw > 0 && ch > 0) {
          outW = cw;
          outH = ch;
        } else if (cw > 0) {
          outW = cw;
          outH = Math.round(srcH * (cw / srcW));
        } else if (ch > 0) {
          outH = ch;
          outW = Math.round(srcW * (ch / srcH));
        }

        return {
          sourceName: "DS Load Video",
          width: outW,
          height: outH,
          frames: effectiveF,
          fps: fps > 0 ? fps : 0,
          fpsKnown: fps > 0,
          isDetected: true,
        };
      }
    }

    // 2. DS_LoadImagesFromFolder
    if (nodeType === "DS_LoadImagesFromFolder") {
      let s = null;
      try {
        const raw = originNode.properties?.dsFolderLoaderState;
        if (raw) s = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (_) {}
      const fileCount = s?.selected_files?.length || 0;
      const batchSize = Number(s?.batch_size || 1);
      const count = fileCount > 0 ? fileCount : (batchSize > 1 ? batchSize : 30);
      const longest = Number(s?.resize_config?.longest_side || 1024);
      return {
        sourceName: "DS Load Images",
        width: longest,
        height: longest,
        frames: count,
        fps: 0,
        fpsKnown: false,
        isDetected: true,
      };
    }

    // 3. VHS_LoadVideo or standard LoadVideo
    if (nodeType.toLowerCase().includes("loadvideo") || nodeType.toLowerCase().includes("vhs")) {
      const capW = originNode.widgets?.find((w) => w.name === "frame_load_cap");
      const cap = Number(capW?.value || 0);
      const imgsCount = originNode.imgs?.length || 0;
      const frW = originNode.widgets?.find((w) => w.name === "force_rate");
      const nthW = originNode.widgets?.find((w) => w.name === "select_every_nth");
      const frVal = Number(frW?.value || 0);
      const nthVal = Math.max(1, Number(nthW?.value || 1));
      return {
        sourceName: nodeTitle,
        width: originNode.imgs?.[0]?.naturalWidth || 512,
        height: originNode.imgs?.[0]?.naturalHeight || 512,
        frames: cap > 0 ? cap : (imgsCount > 0 ? imgsCount : 60),
        fps: frVal > 0 ? frVal / nthVal : 0,
        fpsKnown: frVal > 0,
        isDetected: true,
      };
    }

    // 4. Check ComfyUI execution outputs
    const execOut = app?.nodeOutputs?.[originNode.id];
    if (execOut?.images && Array.isArray(execOut.images) && execOut.images.length > 0) {
      return {
        sourceName: nodeTitle,
        width: originNode.imgs?.[0]?.naturalWidth || 512,
        height: originNode.imgs?.[0]?.naturalHeight || 512,
        frames: execOut.images.length,
        fps: 0,
        fpsKnown: false,
        isDetected: true,
      };
    }

    // 5. Check originNode.imgs
    if (originNode.imgs && Array.isArray(originNode.imgs) && originNode.imgs.length > 0) {
      return {
        sourceName: nodeTitle,
        width: originNode.imgs[0].naturalWidth || 512,
        height: originNode.imgs[0].naturalHeight || 512,
        frames: originNode.imgs.length,
        fps: 0,
        fpsKnown: false,
        isDetected: true,
      };
    }

    // 6. Generic node with width/height/batch_size widgets
    const wWidget = originNode.widgets?.find((w) => w.name === "width" || w.name === "custom_width");
    const hWidget = originNode.widgets?.find((w) => w.name === "height" || w.name === "custom_height");
    const bWidget = originNode.widgets?.find((w) => w.name === "batch_size" || w.name === "frames");
    if (wWidget && hWidget) {
      return {
        sourceName: nodeTitle,
        width: Number(wWidget.value || 512),
        height: Number(hWidget.value || 512),
        frames: Number(bWidget?.value || 30),
        fps: 0,
        fpsKnown: false,
        isDetected: true,
      };
    }

    return {
      sourceName: nodeTitle,
      width: 512,
      height: 512,
      frames: 30,
      isDetected: false,
    };
  }

  // --- Dedicated Estimation Card ---
  const estCard = document.createElement("div");
  estCard.className = "dsgif-est-card";

  const estHeader = document.createElement("div");
  estHeader.className = "dsgif-est-header";
  const estLabel = document.createElement("span");
  estLabel.className = "dsgif-est-label";
  estLabel.textContent = "Estimated Size";
  const estVal = document.createElement("span");
  estVal.className = "dsgif-est-val";
  estVal.textContent = "~0 B";
  estHeader.append(estLabel, estVal);

  const estMeta = document.createElement("div");
  estMeta.className = "dsgif-est-meta";
  const estSourceRow = document.createElement("div");
  estSourceRow.className = "dsgif-est-source-row";
  const estSourceTag = document.createElement("span");
  estSourceTag.className = "dsgif-est-source-tag";
  estSourceTag.textContent = "No input detected";
  const estDetailsTag = document.createElement("span");
  estDetailsTag.className = "dsgif-est-details-tag";
  estDetailsTag.textContent = "30 frames · 512×512";
  estSourceRow.append(estSourceTag, estDetailsTag);
  estMeta.append(estSourceRow);

  const estWarn = document.createElement("div");
  estWarn.className = "dsgif-est-warn";
  estWarn.textContent = "⚠️ Large file (>50 MB). Consider reducing 'Max side' (e.g. 512) or switching to WebP.";

  estCard.append(estHeader, estMeta, estWarn);
  settingsPanel.append(estCard);

  function updateEstimatedSize() {
    const upstream = getConnectedInputMeta();

    let srcW = 512;
    let srcH = 512;
    let totalF = 30;
    let sourceLabel = "No input connected";
    let isDetected = false;

    if (upstream && upstream.isDetected) {
      srcW = upstream.width;
      srcH = upstream.height;
      totalF = upstream.frames;
      sourceLabel = upstream.sourceName;
      isDetected = true;
      node._lastWidth = srcW;
      node._lastHeight = srcH;
      node._lastTotalFrames = totalF;
    } else if (node._lastWidth && node._lastHeight && node._lastTotalFrames) {
      srcW = node._lastWidth;
      srcH = node._lastHeight;
      totalF = node._lastTotalFrames;
      sourceLabel = upstream ? upstream.sourceName : "Last executed clip";
      isDetected = true;
    } else if (upstream) {
      sourceLabel = upstream.sourceName;
    }

    const fmt = String(w_format.value || "GIF");
    const q = Math.max(1, Math.min(100, Number(w_quality.value || 90)));
    const comp = Math.max(0, Math.min(100, Number(w_compression.value || 50)));
    const colors = Math.max(2, Math.min(256, Number(w_colors.value || 256)));
    const dither = String(w_dither.value || "Bayer");
    const palette = String(w_palette.value || "Global");
    const maxSide = Math.max(0, Number(w_max_side.value || 0));
    const isLossless = Boolean(w_lossless.value);
    const isOptimize = Boolean(w_optimize.value);
    const order = String(w_playback_order.value || "Forward");
    const step = Math.max(1, Number(w_frame_step.value || 1));
    const startF = Math.max(0, Number(w_start_frame.value || 0));
    const endF = Math.max(0, Number(w_end_frame.value || 0));
    const timingMode = String(w_timing_mode.value || "Sync speed (Real-time)");
    const requestedFps = Math.max(1, Math.min(60, Number(w_fps.value || 24)));
    let targetFps = (fmt === "GIF") ? Math.min(requestedFps, GIF_MAX_FPS) : requestedFps;

    // Source FPS: user override, else auto-detected from the upstream loader. The widget is only
    // auto-updated when it is 0 or still holds the previous auto value (manual edits are respected).
    let srcFps = Number(w_source_fps.value || 0);
    const lastAuto = Number(node.properties?.dsGifAutoSrcFps || 0);
    if (upstream && upstream.fpsKnown && upstream.fps > 0) {
      const detected = Math.round(Number(upstream.fps) * 1000) / 1000;
      if (srcFps === 0 || (lastAuto > 0 && Math.abs(srcFps - lastAuto) < 0.001)) {
        if (Math.abs(srcFps - detected) > 0.001) {
          srcFps = detected;
          card.set(w_source_fps, srcFps);
          stepperSourceFps.setValue(srcFps);
        }
        node.properties = node.properties || {};
        node.properties.dsGifAutoSrcFps = detected;
      }
    } else if (srcFps === 0 && node._lastSourceFps > 0) {
      srcFps = node._lastSourceFps; // estimate only; backend decides at run time
    }
    const inFps = srcFps > 0 ? srcFps / step : 0; // rate after "Every Nth"
    if (timingMode === "Sync speed (Real-time)" && inFps > 0 && inFps < targetFps && Math.abs(inFps - Math.round(inFps)) < 0.01) {
      targetFps = Math.max(1, Math.round(inFps)); // never upsample
    }

    // Downscale calculation
    let w = srcW;
    let h = srcH;
    let isDownscaled = false;
    if (maxSide > 0) {
      const longer = Math.max(w, h);
      if (longer > maxSide) {
        const scale = maxSide / longer;
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        isDownscaled = true;
      }
    }

    // Effective input frames and temporal decimation
    let effEnd = (endF > 0 && endF < totalF) ? endF : totalF;
    let rawFramesCount = Math.max(1, Math.ceil((effEnd - startF) / step));
    let framesCount = rawFramesCount;

    if (timingMode === "Sync speed (Real-time)" && inFps > 0 && Math.abs(inFps - targetFps) > 0.01) {
      const sliceDuration = rawFramesCount / inFps;
      framesCount = Math.max(1, Math.round(sliceDuration * targetFps));
    }

    if (order === "Ping-pong" && framesCount > 1) {
      framesCount = framesCount * 2 - 2;
    }

    // Update timing speed pill
    if (timingPillVal) {
      const clipDurationSec = (inFps > 0) ? (rawFramesCount / inFps) : (framesCount / targetFps);
      if (timingMode === "Sync speed (Real-time)" && srcFps <= 0) {
        timingPillVal.textContent = `Source FPS unknown - all frames kept (set Source FPS for real-time)`;
      } else if (timingMode === "Sync speed (Real-time)" && srcFps > 0) {
        if (Math.abs(inFps - targetFps) > 0.01) {
          timingPillVal.textContent = `1.0× Real-time (${+inFps.toFixed(2)}fps → ${targetFps}fps · ${framesCount} frames · ${clipDurationSec.toFixed(1)}s)`;
        } else {
          timingPillVal.textContent = `1.0× Real-time (${targetFps}fps · ${framesCount} frames · ${clipDurationSec.toFixed(1)}s)`;
        }
      } else {
        const speedRatio = (inFps > 0) ? (targetFps / inFps) : 1.0;
        const speedDesc = speedRatio < 0.99 ? "Slow-motion" : (speedRatio > 1.01 ? "Fast-forward" : "Normal");
        timingPillVal.textContent = `${speedRatio.toFixed(2)}× ${speedDesc} (${framesCount} frames @ ${targetFps}fps · ${(framesCount / targetFps).toFixed(1)}s)`;
      }
    }

    // 60 FPS Warning banner
    if (timingWarn) {
      if (fmt === "GIF" && requestedFps > GIF_MAX_FPS) {
        timingWarn.style.display = "block";
        timingWarn.textContent = "⚠️ GIF cannot store more than 50 FPS (delays <20ms play as slow motion in browsers). Output is capped at 50 FPS with real-time speed kept. Use WebP for true 60 FPS.";
      } else {
        timingWarn.style.display = "none";
      }
    }

    if (node._estOverride) {
      w = node._estOverride.w;
      h = node._estOverride.h;
      framesCount = node._estOverride.frames;
    }

    const pixelsPerFrame = w * h;
    const totalPixels = framesCount * pixelsPerFrame;
    let estBytes = 0;

    if (fmt === "GIF") {
      const baseColors = Math.max(2, Math.min(256, colors));
      const qFactor = q / 100.0;
      const compFactor = 1.0 - (comp / 100.0) * 0.40;
      const effectiveColors = Math.min(baseColors, Math.max(16, Math.round(baseColors * qFactor * compFactor)));
      const colorFactor = Math.pow(effectiveColors / 256, 0.38);

      const ditherLower = dither.toLowerCase();
      let ditherFactor = 0.85;
      if (ditherLower.includes("bayer")) {
        const bayerScale = Math.min(5, Math.max(1, Math.round(1 + (comp / 100.0) * 4)));
        ditherFactor = 0.90 - (bayerScale - 1) * 0.05;
      } else if (ditherLower.includes("floyd")) {
        ditherFactor = 1.25;
      } else {
        ditherFactor = 0.65;
      }

      const paletteFactor = (palette === "Per frame") ? 1.08 : 1.0;
      const compReduction = 1.0 - (comp / 100.0) * 0.30;
      const optFactor = isOptimize ? 0.85 : 1.0;

      const bytesPerPix = 0.33 * colorFactor * ditherFactor * paletteFactor * compReduction * optFactor;
      const paletteOverhead = (palette === "Per frame" ? framesCount : 1) * effectiveColors * 3;
      estBytes = totalPixels * bytesPerPix + paletteOverhead + 1024;
    } else if (fmt === "WebP") {
      if (isLossless) {
        const compReduction = 1.0 - (comp / 100) * 0.25;
        estBytes = totalPixels * 3 * 0.12 * compReduction + 2048;
      } else {
        const qFactor = Math.pow(q / 100, 1.5);
        const compReduction = 1.0 - (comp / 100) * 0.45;
        const bytesPerPix = 3.0 * 0.055 * qFactor * compReduction;
        estBytes = totalPixels * bytesPerPix + 2048;
      }
    } else if (fmt === "APNG") {
      const compReduction = 1.0 - (comp / 100) * 0.30;
      const bytesPerPix = 3.0 * 0.45 * compReduction;
      estBytes = totalPixels * bytesPerPix + (framesCount * 64) + 1024;
    }

    // Cache uncalibrated byte estimate for precise ratio calculation post-execution
    node._rawEstBytes = Math.max(512, Math.round(estBytes));

    const calRatio = Number(node.properties?.dsGifCal?.[fmt] || 0);
    if (calRatio > 0) {
      estBytes *= calRatio;
    }

    const finalBytes = Math.max(512, Math.round(estBytes));
    const estStr = formatEstimatedBytes(finalBytes);
    fieldCompression.setLabel(`Compression · Est: ${estStr}`);

    // Update dedicated estimation card
    estVal.textContent = estStr;
    const isLarge = finalBytes > 50 * 1024 * 1024;
    estVal.classList.toggle("is-large", isLarge);

    if (calRatio > 0) {
      estSourceTag.textContent = `Source: ${sourceLabel} · Calibrated ✨`;
    } else {
      estSourceTag.textContent = isDetected ? `Source: ${sourceLabel}` : "Source: Default (unconnected)";
    }

    const resLabel = isDownscaled ? `${w}×${h} (from ${srcW}×${srcH})` : `${w}×${h}`;
    estDetailsTag.textContent = `${framesCount} frames · ${resLabel} · ${fmt}`;

    if (isLarge) {
      estWarn.style.display = "block";
      if (fmt === "GIF") {
        estWarn.textContent = `⚠️ Large GIF (${estStr}). Consider reducing 'Max side' (e.g. 512) or switching to WebP to reduce size.`;
      } else if (fmt === "APNG") {
        estWarn.textContent = `⚠️ APNG files are uncompressed 24-bit (${estStr}). Consider WebP or GIF.`;
      } else {
        estWarn.textContent = `⚠️ Large file (${estStr}). Consider 'Max side' (e.g. 512) or lower Quality.`;
      }
    } else {
      estWarn.style.display = "none";
    }
  }

  function updateFormatDependencies(fmt) {
    const isGif = fmt === "GIF";
    const isWebP = fmt === "WebP";

    gifQualRow1.style.display = isGif ? "flex" : "none";
    gifQualRow2.style.display = isGif ? "flex" : "none";
    webpQualRow.style.display = isWebP ? "flex" : "none";

    updateEstimatedSize();
  }

  updateFormatDependencies(w_format.value);

  // --- Reset to Defaults Button ---
  const resetBtn = Button({
    label: "Reset to defaults",
    icon: "refresh-cw",
    onClick: (e) => {
      e.stopPropagation();
      card.commit(() => {
        w_save_path.value = "Gif/Gif";
        w_format.value = "GIF";
        w_save_mode.value = "Save + preview";
        w_existing_files.value = "Auto-number";
        w_fps.value = 24;
        w_loop_count.value = 0;
        w_playback_order.value = "Forward";
        w_start_frame.value = 0;
        w_end_frame.value = 0;
        w_frame_step.value = 1;
        w_max_side.value = 0;
        w_resample.value = "Lanczos";
        w_quality.value = 90;
        w_compression.value = 50;
        w_colors.value = 256;
        w_dither.value = "Bayer";
        w_palette.value = "Global";
        w_optimize.value = true;
        w_lossless.value = false;
        w_timing_mode.value = "Sync speed (Real-time)";
        w_source_fps.value = 0;

        for (const w of allWidgets) {
          w.callback?.(w.value, app.canvas, node);
        }
      });
      syncAllUi();
    },
  });
  resetBtn.root.style.width = "100%";
  resetBtn.root.style.height = "28px";
  resetBtn.root.style.minHeight = "28px";
  resetBtn.root.style.marginTop = "8px";
  resetBtn.root.style.fontSize = "11px";
  resetBtn.root.style.fontWeight = "600";
  settingsPanel.append(resetBtn);

  // Append settings panel directly below menu toggle
  card.grow(settingsPanel.root, { minHeight: 80 });

  // Initial display setup for settings panel
  setMenuOpen(isMenuOpen);

  // =========================================================================
  // Item 3: Looping Animation Preview (BELOW Settings)
  // =========================================================================
  const preview = ImagePreview({
    placeholder: "Run the workflow to generate a preview",
    fit: "contain",
  });
  preview.box.tabIndex = 0;
  preview.box.style.outline = "none";

  function togglePause() {
    if (!preview.img.src || preview.img.style.display === "none") return;
    isPaused = !isPaused;
    if (isPaused) {
      if (!pauseCanvas) {
        pauseCanvas = document.createElement("canvas");
        pauseCanvas.style.position = "absolute";
        pauseCanvas.style.top = "0";
        pauseCanvas.style.left = "0";
        pauseCanvas.style.width = "100%";
        pauseCanvas.style.height = "100%";
        pauseCanvas.style.objectFit = "contain";
        pauseCanvas.style.pointerEvents = "none";
        preview.box.appendChild(pauseCanvas);
      }
      pauseCanvas.width = preview.img.naturalWidth || 300;
      pauseCanvas.height = preview.img.naturalHeight || 150;
      const ctx = pauseCanvas.getContext("2d");
      ctx.drawImage(preview.img, 0, 0, pauseCanvas.width, pauseCanvas.height);
      pauseCanvas.style.display = "block";
      preview.img.style.visibility = "hidden";
    } else {
      if (pauseCanvas) {
        pauseCanvas.style.display = "none";
      }
      preview.img.style.visibility = "visible";
    }
  }

  function restartPreview() {
    if (!preview.img.src || preview.img.style.display === "none") return;
    if (isPaused) {
      togglePause();
    }
    try {
      const url = new URL(preview.img.src, window.location.origin);
      url.searchParams.set("t", String(Date.now()));
      preview.img.src = url.toString();
    } catch (_) {}
  }

  preview.box.addEventListener("click", () => {
    restartPreview();
  });

  preview.box.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      e.stopPropagation();
      restartPreview();
    }
  });

  card.grow(preview.root, { minHeight: 140 });

  // =========================================================================
  // Real-Time Progress & Execution Events via WebSocket
  // =========================================================================
  const onCustomProgress = ({ detail }) => {
    if (detail?.node_id && String(detail.node_id) !== String(node.id)) return;
    statusBar.setProgress(detail.percent, detail.text || `Processing ${detail.step}/${detail.total}`);
  };

  const onStandardProgress = ({ detail }) => {
    if (String(detail.node) === String(node.id)) {
      const pct = Math.round((detail.value / detail.max) * 100);
      statusBar.setProgress(pct, `Frame ${detail.value}/${detail.max} (${pct}%)`);
    }
  };

  const onExecuting = ({ detail }) => {
    if (String(detail) === String(node.id)) {
      statusBar.setProgress(0, "Encoding started...");
    }
  };

  const onExecutionError = ({ detail }) => {
    if (String(detail?.node_id) === String(node.id)) {
      const errMsg = detail.exception_message || "Encoding failed";
      statusBar.setStatus(errMsg, "error");
    }
  };

  api.addEventListener("ds_gif_progress", onCustomProgress);
  api.addEventListener("progress", onStandardProgress);
  api.addEventListener("executing", onExecuting);
  api.addEventListener("execution_error", onExecutionError);

  // Synchronize UI from native widgets
  function syncAllUi() {
    inputPath.setValue(w_save_path.value);
    dropdownFormat.setValue(w_format.value);
    dropdownSaveMode.setValue(w_save_mode.value);
    dropdownExisting.setValue(w_existing_files.value);
    stepperFps.setValue(w_fps.value);
    syncFpsPresets(w_fps.value);
    stepperLoop.setValue(w_loop_count.value);
    dropdownOrder.setValue(w_playback_order.value);
    stepperStart.setValue(w_start_frame.value);
    stepperEnd.setValue(w_end_frame.value);
    stepperStep.setValue(w_frame_step.value);
    stepperMaxSide.setValue(w_max_side.value);
    dropdownResample.setValue(w_resample.value);
    sliderColors.setValue(w_colors.value);
    dropdownDither.setValue(w_dither.value);
    dropdownPalette.setValue(w_palette.value);
    sliderQuality.setValue(w_quality.value);
    sliderCompression.setValue(w_compression.value);
    toggleOptimize.setValue(w_optimize.value);
    toggleLossless.setValue(w_lossless.value);
    dropdownTimingMode.setValue(w_timing_mode.value);
    stepperSourceFps.setValue(w_source_fps.value);

    updateFormatDependencies(w_format.value);
    checkTimingWarning();
    updateEstimatedSize();
  }

  function checkTimingWarning() {
    const curFps = Number(w_fps.value);
    const curFmt = w_format.value;
    if (curFmt === "GIF" && curFps > GIF_MAX_FPS) {
      statusBar.setStatus("GIF is limited to 50 FPS; speed is kept real-time (use WebP for 60 FPS)", "idle");
    } else if (lastSavedPath) {
      // keep last saved status
    } else {
      statusBar.setStatus("Ready", "idle");
    }
  }

  function restorePreview(item) {
    if (!item?.filename) return;
    const params = new URLSearchParams({
      filename: item.filename,
      subfolder: item.subfolder || "",
      type: item.type || "output",
      t: String(Date.now()),
    });
    const url = `/view?${params.toString()}`;

    const testImg = new Image();
    testImg.onload = () => {
      preview.setImage(url);
    };
    testImg.onerror = () => {
      preview.clear();
      const placeholder = preview.box.querySelector("span");
      if (placeholder) {
        placeholder.textContent = "Preview unavailable";
      }
      node.properties = node.properties || {};
      node.properties.dsGifLast = null;
    };
    testImg.src = url;
  }

  // Handle workflow configuration & execution
  const baseOnConfigure = node.onConfigure;
  node.onConfigure = function (...args) {
    const r = baseOnConfigure?.apply(this, args);
    if (this.properties?.dsGifMenuOpen !== undefined) {
      setMenuOpen(Boolean(this.properties.dsGifMenuOpen));
    }
    if (this.properties?.dsGifLast) {
      restorePreview(this.properties.dsGifLast);
    }
    syncAllUi();
    updateEstimatedSize();
    return r;
  };

  const origOnConnectionsChange = node.onConnectionsChange;
  node.onConnectionsChange = function (type, slotIndex, isConnected, link_info, input_info) {
    origOnConnectionsChange?.apply(this, arguments);
    updateEstimatedSize();
  };

  const origOnSelected = node.onSelected;
  node.onSelected = function () {
    origOnSelected?.apply(this, arguments);
    updateEstimatedSize();
  };

  const origOnDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function () {
    origOnDrawForeground?.apply(this, arguments);
    const now = Date.now();
    if (!this._lastEstCheck || now - this._lastEstCheck > 1500) {
      this._lastEstCheck = now;
      updateEstimatedSize();
    }
  };

  const origOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    api.removeEventListener("ds_gif_progress", onCustomProgress);
    api.removeEventListener("progress", onStandardProgress);
    api.removeEventListener("executing", onExecuting);
    api.removeEventListener("execution_error", onExecutionError);
    origOnRemoved?.apply(this, arguments);
  };

  node.onExecuted = function (message) {
    if (message?.card_preview?.[0]) {
      const item = message.card_preview[0];
      this.properties = this.properties || {};
      this.properties.dsGifLast = item;
      restorePreview(item);
    }
    if (message?.ds_gif_info?.[0]) {
      const info = message.ds_gif_info[0];
      lastSavedPath = info.path || "";
      const elapsedText = info.elapsed ? ` in ${info.elapsed}` : "";
      const stat = `Saved ${info.path} (${info.frames} frames • ${info.resolution} • ${info.fps} fps • ${info.size}${elapsedText})`;
      statusBar.setStatus(info.warning ? `${stat} ⚠ ${info.warning}` : stat, "success");
      try { statusBar.label.title = info.warning ? `${stat}\n${info.warning}` : stat; } catch (_) {}

      // Save metrics for live estimation calibration
      if (info.width && info.height) {
        node._lastWidth = info.width;
        node._lastHeight = info.height;
      }
      if (info.frames) {
        node._lastTotalFrames = info.frames;
      }
      if (info.source_fps > 0) node._lastSourceFps = Number(info.source_fps);
      if (info.bytes && info.width && info.height && info.frames) {
        // Raw (uncalibrated) estimate for the exact clip just encoded, then store the ratio per format
        const calFmt = info.format || String(w_format.value);
        node._estOverride = { w: info.width, h: info.height, frames: info.frames };
        const savedCal = node.properties?.dsGifCal;
        if (node.properties) node.properties.dsGifCal = { ...(savedCal || {}), [calFmt]: 0 };
        updateEstimatedSize();
        node._estOverride = null;
        if (node._rawEstBytes > 0) {
          const ratio = Math.max(0.02, Math.min(50, info.bytes / node._rawEstBytes));
          node.properties = node.properties || {};
          node.properties.dsGifCal = { ...(node.properties.dsGifCal || {}), [calFmt]: ratio };
        }
      }
      updateEstimatedSize();
    }
  };
}

// Register for both DSGifGenerator and DS_GifGenerator
registerCardNode("DSGifGenerator", buildGifGenerator, { minWidth: 360, width: 440, height: 680 });
registerCardNode("DS_GifGenerator", buildGifGenerator, { minWidth: 360, width: 440, height: 680 });
