// DeathshotArsenal/js/Load Images From Folder/ds_load_images_from_folder.js
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { installDSUISystem, normalizeDSWidgetHost, protectDSResizeCorners } from "../Shared/ds_ui_system.js";
import { browseFolderOS } from "./os_dialog_bridge.js";
import { openGalleryModal } from "./gallery_modal.js";
import {
  RESIZE_MODES,
  renderResizePanel,
  computeOutputDimensions
} from "./resize_panel.js";

const STATE_WIDGET = "ds_folder_loader_state";
const STATE_PROP = "dsFolderLoaderState";

const DEFAULT_STATE = {
  folder_path: "",
  selected_files: [],
  current_index: 1,
  batch_size: 1,
  execution_mode: "sequential", // "sequential" | "batch"
  include_subfolders: true,
  keep_folder_structure: false,
  sort_by: "name",
  sort_dir: "asc",
  resize_config: {
    mode: "off", // Default is Off per PRD & user requirement
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
  installDSUISystem();

  let link = document.getElementById("ds-load-images-from-folder-link");
  if (!link) {
    link = document.createElement("link");
    link.id = "ds-load-images-from-folder-link";
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Load%20Images%20From%20Folder/folder_loader.css?v=" + Date.now();
    document.head.appendChild(link);
  }

  let style = document.getElementById("ds-load-images-from-folder-css");
  if (!style) {
    style = document.createElement("style");
    style.id = "ds-load-images-from-folder-css";
    document.head.appendChild(style);
  }

  style.textContent = `
    .ds-fl-root {
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 8px 18px;
      overflow: hidden;
      border-radius: 8px;
      color: var(--ds-text, #e5e7eb);
      font: 10px ui-sans-serif, system-ui, -apple-system, sans-serif;
      pointer-events: none;
    }
    .ds-fl-root * { box-sizing: border-box; }
    .ds-fl-interactive { pointer-events: auto; }
    .ds-fl-status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-height: 25px;
      background: var(--ds-panel-2, #141720);
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 5px;
      padding: 0 8px;
      font-size: 9px;
    }
    .ds-fl-status-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
    }
    .ds-fl-badge {
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 15%, var(--ds-panel-2, #141720));
      border: 1px solid color-mix(in srgb, var(--ds-accent, #67e8f9) 40%, transparent);
      color: var(--ds-accent, #67e8f9);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 750;
      font-size: 8.5px;
      white-space: nowrap;
    }
    .ds-fl-filename {
      color: var(--ds-text, #e5e7eb);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .ds-fl-dim-badge {
      color: var(--ds-text-muted, #9ca3af);
      font-size: 8.5px;
      white-space: nowrap;
      font-family: monospace;
    }
    .ds-fl-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      flex: 0 0 auto;
    }
    .ds-fl-input {
      flex: 1;
      min-width: 0;
      height: 28px;
      padding: 0 8px;
      background: var(--ds-input-bg, #0d1017);
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 5px;
      color: var(--ds-text, #e5e7eb);
      font: 9.5px inherit;
      outline: none;
      transition: border-color 0.12s ease;
    }
    .ds-fl-input:focus {
      border-color: var(--ds-accent, #67e8f9) !important;
    }
    .ds-fl-btn {
      height: 28px;
      min-width: 28px;
      padding: 0 10px;
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 5px;
      background: var(--ds-panel-2, #161a23);
      color: var(--ds-text-muted, #a1a8b3);
      font: 700 9px inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      white-space: nowrap;
      user-select: none;
      transition: all 0.12s ease;
    }
    .ds-fl-btn:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-text, #fff);
      background: var(--ds-panel-3, #20252d);
    }
    .ds-fl-btn:active {
      transform: scale(0.98);
    }
    .ds-fl-btn-primary {
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 14%, var(--ds-panel-2, #161a23));
      border-color: color-mix(in srgb, var(--ds-accent, #67e8f9) 50%, var(--ds-border, #242a36));
      color: var(--ds-text, #fff);
      width: 100%;
      font-weight: 750;
      letter-spacing: 0.02em;
    }
    .ds-fl-btn-primary:hover {
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 24%, var(--ds-panel-2, #161a23));
      border-color: var(--ds-accent, #67e8f9);
    }
    .ds-fl-exec-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
    }
    .ds-fl-label {
      font-size: 8.5px;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ds-text-muted, #9ca3af);
      white-space: nowrap;
    }
    .ds-fl-select {
      appearance: none !important;
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      height: 28px;
      padding: 0 24px 0 8px !important;
      border: 1px solid var(--ds-border, #242a36) !important;
      border-radius: 5px;
      background-color: var(--ds-input-bg, #0d1017) !important;
      color: var(--ds-text, #e5e7eb) !important;
      font: 600 9px inherit;
      cursor: pointer;
      outline: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238d96a3' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important;
      background-position: right 7px center !important;
      transition: border-color 0.12s ease;
    }
    .ds-fl-select:focus,
    .ds-fl-select:hover {
      border-color: var(--ds-accent, #67e8f9) !important;
    }
    .ds-fl-select option {
      background-color: var(--ds-panel, #12151c);
      color: var(--ds-text, #e5e7eb);
      padding: 6px 8px;
    }
    .ds-fl-stepper {
      display: inline-flex;
      align-items: center;
      height: 28px;
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 5px;
      background: var(--ds-input-bg, #0d1017);
      overflow: hidden;
    }
    .ds-fl-stepper-val {
      width: 36px;
      height: 100%;
      text-align: center;
      background: transparent;
      border: none;
      color: var(--ds-text, #fff);
      font: 600 9px inherit;
      outline: none;
    }
    .ds-fl-stepper-btns {
      display: flex;
      flex-direction: column;
      height: 100%;
      border-left: 1px solid var(--ds-border, #242a36);
    }
    .ds-fl-step-btn {
      width: 16px;
      height: 50%;
      border: none;
      background: var(--ds-panel-2, #161a23);
      color: var(--ds-text-muted, #8b939e);
      font-size: 7px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.1s ease;
    }
    .ds-fl-step-btn:hover {
      background: var(--ds-panel-3, #222834);
      color: var(--ds-accent, #67e8f9);
    }
    .ds-fl-stop-btn {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.45);
      color: #f87171;
      font-weight: 750;
      display: none;
    }
    .ds-fl-stop-btn.active {
      display: inline-flex;
    }
    .ds-fl-stop-btn:hover {
      background: rgba(239, 68, 68, 0.3);
      border-color: #ef4444;
      color: #fff;
    }
    .ds-fl-resize-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--ds-panel-2, #131720);
      border: 1px solid var(--ds-border, #232834);
      border-radius: 6px;
      padding: 6px 8px;
    }
    .ds-fl-resize-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
    }
    .ds-fl-resize-panel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .ds-fl-chips-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .ds-fl-chip {
      height: 22px;
      padding: 0 7px;
      border: 1px solid var(--ds-border, #262c3a);
      border-radius: 4px;
      background: var(--ds-panel, #161a24);
      color: var(--ds-text-muted, #9ca3af);
      font: 700 8.5px inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s ease;
      white-space: nowrap;
    }
    .ds-fl-chip:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-text, #fff);
      background: var(--ds-panel-3, #222938);
    }
    .ds-fl-chip.active {
      gap: 6px;
    }
    .ds-fl-wh-preview-box {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 4px;
      background: var(--ds-input-bg, #0d1017);
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 5px;
    }
    .ds-fl-aspect-rect {
      width: 42px;
      height: 28px;
      background: rgba(103, 232, 249, 0.1);
      border: 1.5px dashed var(--ds-accent, #67e8f9);
      border-radius: 3px;
      transition: all 0.2s ease;
    }
    .ds-fl-compass {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: auto auto auto;
      gap: 4px;
      align-items: center;
      justify-items: center;
    }
    .ds-fl-compass-top { grid-column: 2; grid-row: 1; }
    .ds-fl-compass-left { grid-column: 1; grid-row: 2; }
    .ds-fl-compass-center {
      grid-column: 2;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      font-size: 8px;
      color: var(--ds-text-muted, #9ca3af);
      text-align: center;
    }
    .ds-fl-compass-right { grid-column: 3; grid-row: 2; }
    .ds-fl-compass-bottom { grid-column: 2; grid-row: 3; }
    .ds-fl-compass-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--ds-border, #242a36);
    }
    .ds-fl-color-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 24px;
      padding: 0 7px;
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 4px;
      background: var(--ds-panel-3, #1b2029);
      color: var(--ds-text, #e5e7eb);
      font: 700 8px inherit;
      cursor: pointer;
    }
    .ds-fl-color-swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .ds-fl-preview-zone {
      position: relative;
      flex: 1 1 0;
      min-height: 120px;
      width: 100%;
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 6px;
      background: var(--ds-panel, #12151c);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
      margin-bottom: 2px;
    }
    .ds-fl-preview-zone.drag-over {
      border-color: var(--ds-accent, #67e8f9);
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 8%, var(--ds-panel, #12151c));
    }
    .ds-fl-preview-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      pointer-events: none;
      display: none;
    }
    .ds-fl-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      color: var(--ds-text-muted, #8d95a1);
      font-size: 9px;
      user-select: none;
      text-align: center;
      padding: 10px;
    }
    .ds-fl-placeholder strong {
      color: var(--ds-text, #d8dde4);
      font-size: 10px;
    }
    .ds-fl-resbadge {
      position: absolute;
      right: 6px;
      bottom: 5px;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      font-size: 8px;
      font-family: monospace;
      pointer-events: none;
    }
    /* Switch Toggle */
    .ds-ui-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      padding: 3px 0;
      cursor: pointer;
      color: var(--ds-text, #e5e7eb);
      font: 700 9px inherit;
      user-select: none;
    }
    .ds-ui-toggle-track {
      position: relative;
      width: 28px;
      height: 15px;
      border: 1px solid var(--ds-border, #353b46);
      border-radius: 999px;
      background: var(--ds-panel-2, #161a23);
      transition: background 0.15s ease, border-color 0.15s ease;
      display: inline-block;
      flex-shrink: 0;
    }
    .ds-ui-toggle-thumb {
      position: absolute;
      top: 50%;
      left: 2px;
      width: 9px;
      height: 9px;
      transform: translateY(-50%);
      border-radius: 50%;
      background: var(--ds-text-muted, #9ca3af);
      transition: left 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      display: block;
    }
    .ds-ui-toggle.is-on .ds-ui-toggle-track {
      border-color: var(--ds-accent, #67e8f9);
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 20%, var(--ds-panel-2, #161a23));
    }
    .ds-ui-toggle.is-on .ds-ui-toggle-thumb {
      left: 15px;
      background: var(--ds-accent, #67e8f9);
      box-shadow: 0 0 6px var(--ds-accent, #67e8f9);
    }
    .ds-ui-toggle-label {
      color: var(--ds-text-muted, #a1a8b3);
      font-size: 9px;
    }
    .ds-ui-toggle.is-on .ds-ui-toggle-label {
      color: var(--ds-text, #fff);
    }
    .ds-fl-dropdown {
      position: relative;
      height: 28px;
      cursor: pointer;
      user-select: none;
    }
    .ds-fl-dropdown-display {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 24px 0 8px;
      background: var(--ds-input-bg, #0d1017);
      border: 1px solid var(--ds-border, #242a36);
      border-radius: 5px;
      color: var(--ds-text, #e5e7eb);
      font: 600 9px inherit;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238d96a3' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 7px center;
      transition: border-color 0.12s ease;
    }
    .ds-fl-dropdown-display:hover,
    .ds-fl-dropdown.open .ds-fl-dropdown-display {
      border-color: var(--ds-accent, #67e8f9);
    }
    .ds-fl-dropdown-menu {
      position: absolute;
      top: calc(100% + 2px);
      left: 0;
      right: 0;
      z-index: 99999;
      max-height: 240px;
      overflow-y: auto;
      background: var(--ds-panel, #151821);
      border: 1px solid var(--ds-border, #303746);
      border-radius: 5px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      display: none;
      padding: 3px 0;
    }
    .ds-fl-dropdown.open .ds-fl-dropdown-menu {
      display: block;
    }
    .ds-fl-dropdown-item {
      padding: 5px 8px;
      font: 600 9px inherit;
      color: var(--ds-text, #e5e7eb);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.08s ease;
    }
    .ds-fl-dropdown-item:hover {
      background: var(--ds-panel-3, #222938);
    }
    .ds-fl-dropdown-item.active {
      color: var(--ds-accent, #67e8f9);
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 12%, var(--ds-panel, #151821));
    }

    /* Deathshot Arsenal Modal Pill Switch Toggle */
    .ds-fl-toggle {
      display: inline-flex !important;
      align-items: center !important;
      gap: 10px !important;
      height: 28px !important;
      padding: 0 14px 0 10px !important;
      margin: 0 !important;
      background: var(--ds-panel-2, #161a23) !important;
      border: 1px solid var(--ds-border, #353b46) !important;
      border-radius: 999px !important;
      cursor: pointer !important;
      color: var(--ds-text, #e5e7eb) !important;
      font: 700 9.5px inherit !important;
      user-select: none !important;
      line-height: 1 !important;
      vertical-align: middle !important;
      transition: all 0.15s ease !important;
      white-space: nowrap !important;
      box-sizing: border-box !important;
      width: auto !important;
      max-width: fit-content !important;
      flex: 0 0 auto !important;
    }
    .ds-fl-toggle:hover {
      border-color: var(--ds-accent, #67e8f9) !important;
      background: var(--ds-panel-3, var(--ds-hover, #202634)) !important;
    }
    .ds-fl-toggle.is-on {
      border-color: var(--ds-accent, #67e8f9) !important;
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 14%, var(--ds-panel-2, #161a23)) !important;
    }
    .ds-fl-toggle-track {
      position: relative !important;
      width: 28px !important;
      min-width: 28px !important;
      height: 16px !important;
      border: 1px solid var(--ds-border, #353b46) !important;
      border-radius: 999px !important;
      background: var(--ds-input-bg, #0d1017) !important;
      transition: background 0.15s ease, border-color 0.15s ease !important;
      display: inline-block !important;
      flex-shrink: 0 !important;
      margin: 0 !important;
      box-sizing: border-box !important;
    }
    .ds-fl-toggle.is-on .ds-fl-toggle-track {
      border-color: var(--ds-accent, #67e8f9) !important;
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 30%, var(--ds-panel-2, #161a23)) !important;
    }
    .ds-fl-toggle-thumb {
      position: absolute !important;
      top: 50% !important;
      left: 2px !important;
      width: 10px !important;
      height: 10px !important;
      transform: translateY(-50%) !important;
      border-radius: 50% !important;
      background: var(--ds-text-muted, #9ca3af) !important;
      transition: left 0.15s ease, background 0.15s ease, box-shadow 0.15s ease !important;
      display: block !important;
    }
    .ds-fl-toggle.is-on .ds-fl-toggle-thumb {
      left: 14px !important;
      background: var(--ds-accent, #67e8f9) !important;
      box-shadow: 0 0 6px var(--ds-accent, #67e8f9) !important;
    }
    .ds-fl-toggle-label {
      color: var(--ds-text-muted, #a1a8b3) !important;
      font-size: 10px !important;
      font-weight: 600 !important;
      line-height: 1 !important;
      white-space: nowrap !important;
      user-select: none !important;
      margin: 0 !important;
    }
    .ds-fl-toggle.is-on .ds-fl-toggle-label {
      color: var(--ds-text, #fff) !important;
      font-weight: 700 !important;
    }

    /* Node Widget Switch Toggle */
    .ds-ui-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      padding: 4px 0;
      margin: 0;
      cursor: pointer;
      color: var(--ds-text, #e5e7eb);
      font: 700 9.5px inherit;
      user-select: none;
      line-height: 1;
      vertical-align: middle;
    }
    .ds-ui-toggle:hover .ds-ui-toggle-track {
      border-color: var(--ds-accent, #67e8f9);
    }
    .ds-ui-toggle-track {
      position: relative;
      width: 28px;
      height: 15px;
      border: 1px solid var(--ds-border, #353b46);
      border-radius: 999px;
      background: var(--ds-panel-2, #161a23);
      transition: background 0.15s ease, border-color 0.15s ease;
      display: inline-block;
      flex-shrink: 0;
    }
    .ds-ui-toggle-thumb {
      position: absolute;
      top: 50%;
      left: 2px;
      width: 9px;
      height: 9px;
      transform: translateY(-50%);
      border-radius: 50%;
      background: var(--ds-text-muted, #9ca3af);
      transition: left 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      display: block;
    }
    .ds-ui-toggle.is-on .ds-ui-toggle-track {
      border-color: var(--ds-accent, #67e8f9);
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 25%, var(--ds-panel-2, #161a23));
    }
    .ds-ui-toggle.is-on .ds-ui-toggle-thumb {
      left: 15px;
      background: var(--ds-accent, #67e8f9);
      box-shadow: 0 0 6px var(--ds-accent, #67e8f9);
    }
    .ds-ui-toggle-label {
      color: var(--ds-text-muted, #a1a8b3);
      font-size: 9.5px;
      line-height: 15px;
      white-space: nowrap;
    }
    .ds-ui-toggle.is-on .ds-ui-toggle-label {
      color: var(--ds-text, #fff);
    }

    /* Gallery Modal Dialog */
    .ds-fl-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      font: 11px ui-sans-serif, system-ui, sans-serif;
      color: var(--ds-text, #e5e7eb);
    }
    .ds-fl-modal {
      width: min(920px, 94vw);
      height: min(660px, 88vh);
      background: var(--ds-panel, #151821);
      border: 1px solid var(--ds-border, #303746);
      border-radius: 10px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--ds-text, #e5e7eb);
    }
    .ds-fl-modal-head {
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      border-bottom: 1px solid var(--ds-border, #29303d);
      background: var(--ds-panel-2, #181d28);
    }
    .ds-fl-modal-title {
      font-size: 12px;
      font-weight: 750;
      color: var(--ds-text, #fff);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ds-fl-modal-close {
      width: 26px;
      height: 26px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ds-text-muted, #9ca3af);
      font-size: 16px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    }
    .ds-fl-modal-close:hover {
      background: var(--ds-panel-3, var(--ds-hover, rgba(0,0,0,0.1)));
      border-color: var(--ds-border, #303746);
      color: var(--ds-text, #fff);
    }
    .ds-fl-modal-toolbar {
      padding: 12px 20px;
      border-bottom: 1px solid var(--ds-border, #29303d);
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--ds-panel, #151821);
    }
    .ds-fl-tool-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .ds-fl-tool-left, .ds-fl-tool-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ds-fl-grid-wrap {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      background: var(--ds-bg, var(--ds-panel, #12151c));
    }
    .ds-fl-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(115px, 1fr));
      gap: 12px;
    }
    .ds-fl-card {
      position: relative;
      height: 120px;
      background: var(--ds-panel-2, #161a24);
      border: 1px solid var(--ds-border, #242a38);
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      transition: all 0.12s ease;
      user-select: none;
    }
    .ds-fl-card:hover {
      border-color: var(--ds-accent, #67e8f9);
      transform: translateY(-1px);
    }
    .ds-fl-card.selected {
      border-color: var(--ds-accent, #67e8f9);
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 14%, var(--ds-panel-2, #161a24));
      box-shadow: 0 0 0 1px var(--ds-accent, #67e8f9);
    }
    .ds-fl-card-thumb-wrap {
      flex: 1;
      width: 100%;
      position: relative;
      overflow: hidden;
      background: var(--ds-input-bg, var(--ds-panel-3, #0a0c10));
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ds-fl-card-thumb {
      max-width: 100%;
      max-height: 100%;
      object-fit: cover;
      pointer-events: none;
    }
    .ds-fl-card-check {
      position: absolute;
      top: 5px;
      left: 5px;
      z-index: 2;
      width: 16px;
      height: 16px;
      background: color-mix(in srgb, var(--ds-panel, #000) 65%, transparent);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.4));
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ds-text, #fff);
      font-size: 10px;
      font-weight: 800;
    }
    .ds-fl-card.selected .ds-fl-card-check {
      background: var(--ds-accent, #67e8f9);
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-panel, #000);
    }
    .ds-fl-card-name {
      height: 24px;
      padding: 0 8px;
      display: flex;
      align-items: center;
      font-size: 8.5px;
      color: var(--ds-text, #cbd5e1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: var(--ds-panel-2, #161a24);
      border-top: 1px solid var(--ds-border, rgba(255, 255, 255, 0.05));
    }
    .ds-fl-card.selected .ds-fl-card-name {
      color: var(--ds-accent, #67e8f9);
      font-weight: 700;
    }
    .ds-fl-modal-foot {
      height: 52px;
      padding: 0 20px;
      border-top: 1px solid var(--ds-border, #29303d);
      background: var(--ds-panel-2, #181d28);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Corner Resize Handle */
    .ds-fl-resize-handle {
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ds-text-muted, #6b7280);
      cursor: nwse-resize;
      pointer-events: auto;
      user-select: none;
      z-index: 10;
      opacity: 0.6;
      transition: opacity 0.15s ease, color 0.15s ease;
    }
    .ds-fl-resize-handle:hover,
    .ds-fl-resize-handle.is-active {
      opacity: 1;
      color: var(--ds-accent, #67e8f9);
    }
  `;
}

function cleanPath(p) {
  return String(p || "").trim().replace(/^["']|["']$/g, "");
}

function createDropdown(items, defaultValue, onChange) {
  // items: [{value: string, label: string}, ...]
  const wrap = document.createElement("div");
  wrap.className = "ds-fl-dropdown ds-fl-interactive";

  const display = document.createElement("div");
  display.className = "ds-fl-dropdown-display";

  const menu = document.createElement("div");
  menu.className = "ds-fl-dropdown-menu";

  let currentValue = defaultValue;

  const renderItems = () => {
    menu.innerHTML = "";
    for (const item of items) {
      const el = document.createElement("div");
      el.className = `ds-fl-dropdown-item ${item.value === currentValue ? 'active' : ''}`;
      el.textContent = item.label;
      el.dataset.value = item.value;
      el.onclick = (e) => {
        e.stopPropagation();
        currentValue = item.value;
        display.textContent = item.label;
        wrap.classList.remove("open");
        renderItems();
        onChange?.(item.value);
      };
      menu.appendChild(el);
    }
  };

  // Set initial display text
  const initial = items.find(i => i.value === defaultValue);
  display.textContent = initial ? initial.label : (items[0]?.label || "");

  display.onclick = (e) => {
    e.stopPropagation();
    // Close any other open dropdowns
    document.querySelectorAll(".ds-fl-dropdown.open").forEach(d => {
      if (d !== wrap) d.classList.remove("open");
    });
    wrap.classList.toggle("open");
  };

  // Close on outside click
  const closeHandler = (e) => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove("open");
    }
  };
  document.addEventListener("pointerdown", closeHandler);

  wrap.append(display, menu);
  renderItems();

  // Public API to set value programmatically
  wrap._dsSetValue = (val) => {
    currentValue = val;
    const found = items.find(i => i.value === val);
    display.textContent = found ? found.label : val;
    renderItems();
  };
  wrap._dsGetValue = () => currentValue;
  wrap._dsCleanup = () => document.removeEventListener("pointerdown", closeHandler);

  return wrap;
}

function readState(node) {
  try {
    const raw = node.properties?.[STATE_PROP];
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { }
  try {
    const raw = node.widgets?.find(w => w.name === STATE_WIDGET)?.value;
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { }
  return { ...DEFAULT_STATE };
}

function saveState(node, patch) {
  const cur = readState(node);
  const state = { ...cur, ...patch };
  if (patch.resize_config) {
    state.resize_config = { ...cur.resize_config, ...patch.resize_config };
  }
  const json = JSON.stringify(state);
  node.properties ||= {};
  node.properties[STATE_PROP] = json;

  let widget = node.widgets?.find(w => w.name === STATE_WIDGET);
  if (!widget && node.addWidget) {
    widget = node.addWidget("text", STATE_WIDGET, json, () => { }, { hidden: true });
    widget.hidden = true;
    widget.computeSize = () => [0, 0];
  } else if (widget) {
    widget.value = json;
  }

  node.setDirtyCanvas?.(true, true);
  return state;
}

function markWorkflowDirty() {
  try {
    const ct = app?.extensionManager?.workflow?.activeWorkflow?.changeTracker ||
      app?.workflowManager?.activeWorkflow?.changeTracker;
    ct?.captureCanvasState?.();
  } catch { }
}

function setupNode(node) {
  if (!node) return;
  const isTarget = node.type === "DS_LoadImagesFromFolder" ||
    node.comfyClass === "DS_LoadImagesFromFolder" ||
    node.constructor?.comfyClass === "DS_LoadImagesFromFolder";
  if (!isTarget) return;
  if (node._dsFolderLoaderSetup) return;
  node._dsFolderLoaderSetup = true;

  node.title = "DS Load Images From Folder";
  node.properties ||= {};
  node.properties.dsDisplayName = "DS Load Images From Folder";
  node.shape = 2; // LiteGraph.ROUND_SHAPE
  node.resizable = true;
  node.min_size = [380, 480];

  // Recover from any prior runaway height loop
  const curW = Number(node.size?.[0]) || 0;
  const curH = Number(node.size?.[1]) || 0;
  if (curW < 380 || curH < 440) {
    if (node.setSize) node.setSize([400, 500]);
    else node.size = [400, 500];
  } else if (curH > 900) {
    const safeW = Math.max(380, curW);
    if (node.setSize) node.setSize([safeW, 500]);
    else node.size = [safeW, 500];
  }

  injectCSS();

  // Ensure state widget exists and hide it from canvas
  node.widgets ||= [];
  let stateWidget = node.widgets.find(w => w?.name === STATE_WIDGET);
  if (!stateWidget && node.addWidget) {
    stateWidget = node.addWidget("text", STATE_WIDGET, "{}", () => { }, { hidden: true });
  }
  if (stateWidget && !node.properties[STATE_PROP] && stateWidget.value && stateWidget.value !== "{}") {
    try { node.properties[STATE_PROP] = stateWidget.value; } catch { }
  }
  if (!node.properties[STATE_PROP]) {
    saveState(node, {});
  }
  function hideWidget(w) {
    if (!w) return;
    w.hidden = true;
    w.computeSize = () => [0, 0];
    w.draw = () => { };
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

  // Root DOM Container
  const root = document.createElement("div");
  root.className = "ds-fl-root";
  root.dataset.dsThemed = "true";

  // 1. Status Bar
  const statusBar = document.createElement("div");
  statusBar.className = "ds-fl-status-bar ds-fl-interactive";
  statusBar.innerHTML = `
    <div class="ds-fl-status-left">
      <span class="ds-fl-badge" data-index-badge>Current: 1 / 0</span>
      <span style="opacity:.5;font-size:8px;">──►</span>
      <span class="ds-fl-filename" data-filename>(No image)</span>
    </div>
    <span class="ds-fl-dim-badge" data-dim-badge>— × —</span>
  `;
  root.appendChild(statusBar);

  const indexBadge = statusBar.querySelector("[data-index-badge]");
  const filenameEl = statusBar.querySelector("[data-filename]");
  const dimBadge = statusBar.querySelector("[data-dim-badge]");

  // 2. Folder Path Row
  const pathRow = document.createElement("div");
  pathRow.className = "ds-fl-row ds-fl-interactive";
  pathRow.innerHTML = `
    <input type="text" class="ds-fl-input" data-path-input placeholder="Folder Path: Type, paste or browse...">
    <button class="ds-fl-btn" data-browse title="Browse folders on disk">📁 Browse</button>
  `;
  root.appendChild(pathRow);

  const pathInput = pathRow.querySelector("[data-path-input]");
  const browseBtn = pathRow.querySelector("[data-browse]");

  // 3. Gallery Modal Trigger Button
  const galleryBtn = document.createElement("button");
  galleryBtn.className = "ds-fl-btn ds-fl-btn-primary ds-fl-interactive";
  galleryBtn.innerHTML = `<span>🖼 Select images : 0</span>`;
  root.appendChild(galleryBtn);

  // 4. Execution Controls Row
  const execRow = document.createElement("div");
  execRow.className = "ds-fl-exec-row ds-fl-interactive";

  const execLabel = document.createElement("span");
  execLabel.className = "ds-fl-label";
  execLabel.textContent = "EXECUTION:";

  const execDropdown = createDropdown(
    [
      { value: "sequential", label: "Sequential (1-by-1)" },
      { value: "batch", label: "Batch Mode" },
    ],
    "sequential",
    (val) => {
      saveState(node, { execution_mode: val });
      markWorkflowDirty();
    }
  );
  execDropdown.style.flex = "1";
  execDropdown.style.minWidth = "0";

  const batchLabel = document.createElement("span");
  batchLabel.className = "ds-fl-label";
  batchLabel.textContent = "BATCH:";

  const batchStepper = document.createElement("div");
  batchStepper.className = "ds-fl-stepper";
  batchStepper.innerHTML = `
    <input type="text" class="ds-fl-stepper-val" data-batch-size value="1" style="width:26px;">
    <div class="ds-fl-stepper-btns">
      <button class="ds-fl-step-btn" data-bs-up>▲</button>
      <button class="ds-fl-step-btn" data-bs-down>▼</button>
    </div>
  `;

  const stopBtnEl = document.createElement("button");
  stopBtnEl.className = "ds-fl-btn ds-fl-stop-btn";
  stopBtnEl.dataset.stop = "";
  stopBtnEl.title = "Stop auto-feeder loop";
  stopBtnEl.textContent = "⏹ Stop";

  execRow.append(execLabel, execDropdown, batchLabel, batchStepper, stopBtnEl);
  root.appendChild(execRow);

  const batchSizeInput = batchStepper.querySelector("[data-batch-size]");
  const bsUp = batchStepper.querySelector("[data-bs-up]");
  const bsDown = batchStepper.querySelector("[data-bs-down]");
  const stopBtn = stopBtnEl;

  // 5. Resize Section
  const resizeBox = document.createElement("div");
  resizeBox.className = "ds-fl-resize-box ds-fl-interactive";

  const resizeRow = document.createElement("div");
  resizeRow.className = "ds-fl-row";

  const resizeLabel = document.createElement("span");
  resizeLabel.className = "ds-fl-label";
  resizeLabel.textContent = "RESIZE:";

  const resizeDropdown = createDropdown(
    RESIZE_MODES.map(m => ({ value: m.id, label: m.label })),
    "off",
    (val) => {
      const state = readState(node);
      const cfg = { ...state.resize_config, mode: val };
      saveState(node, { resize_config: cfg });
      renderResizeSubpanel();
      updateDimensions();
      markWorkflowDirty();
    }
  );
  resizeDropdown.style.flex = "1";
  resizeDropdown.style.minWidth = "0";

  resizeRow.append(resizeLabel, resizeDropdown);

  const resizeSubpanel = document.createElement("div");
  resizeSubpanel.className = "ds-fl-resize-panel";
  resizeSubpanel.dataset.resizeSubpanel = "";

  resizeBox.append(resizeRow, resizeSubpanel);
  root.appendChild(resizeBox);

  // 6. Current Image Preview & Drop Target Zone
  const previewZone = document.createElement("div");
  previewZone.className = "ds-fl-preview-zone ds-fl-interactive";
  previewZone.innerHTML = `
    <img class="ds-fl-preview-img" data-img alt="Active Preview">
    <div class="ds-fl-placeholder" data-ph>
      <strong>CURRENT IMAGE PREVIEW & DROP TARGET ZONE</strong>
      <span>Type or browse folder, or drop folder here</span>
    </div>
    <div class="ds-fl-resbadge" data-resbadge>OUTPUT — × —</div>
  `;
  root.appendChild(previewZone);

  const previewImg = previewZone.querySelector("[data-img]");
  const previewPh = previewZone.querySelector("[data-ph]");
  const resBadge = previewZone.querySelector("[data-resbadge]");

  // 7. Dedicated corner resize handle for direct dragging on DOM widget
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "ds-fl-resize-handle ds-fl-interactive";
  resizeHandle.dataset.resizeHandle = "true";
  resizeHandle.title = "Drag to resize node";
  resizeHandle.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="21" y1="15" x2="15" y2="21"></line>
      <line x1="21" y1="9" x2="9" y2="21"></line>
      <line x1="21" y1="3" x2="3" y2="21"></line>
    </svg>
  `;
  root.appendChild(resizeHandle);

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    resizeHandle.classList.add("is-active");
    try { resizeHandle.setPointerCapture(event.pointerId); } catch (_) { }

    const startX = event.clientX;
    const startY = event.clientY;
    const startW = Number(node.size?.[0]) || 400;
    const startH = Number(node.size?.[1]) || 500;
    const scale = app?.canvas?.ds?.scale || 1;

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / scale;
      const dy = (moveEvent.clientY - startY) / scale;
      const newW = Math.max(380, startW + dx);
      const newH = Math.max(480, startH + dy);

      if (node.setSize) node.setSize([newW, newH]);
      else if (node.size) {
        node.size[0] = newW;
        node.size[1] = newH;
      }
      node.setDirtyCanvas?.(true, true);
    };

    const onUp = (upEvent) => {
      resizeHandle.classList.remove("is-active");
      try { resizeHandle.releasePointerCapture(upEvent.pointerId); } catch (_) { }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (typeof node.onResize === "function") node.onResize(node.size);
      node.setDirtyCanvas?.(true, true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  // Attach DOM Widget to Node with stable static declared sizing
  const widget = node.addDOMWidget("ds_folder_loader_ui", "custom", root, {
    serialize: false,
    hideOnZoom: false,
    margin: 0,
    getMinHeight: () => 260,
    getMaxHeight: () => Math.max(260, (Number(node.size?.[1]) || 500) - 18),
  });

  // Declare stable, constant minimum requirements so LiteGraph NEVER runs away
  widget.computeLayoutSize = () => ({
    minHeight: 260,
    minWidth: 380,
  });

  normalizeDSWidgetHost(root, null, { shell: false });
  protectDSResizeCorners(node);

  widget.onPointerDown = function (pointer) {
    const e = pointer?.eDown || pointer?.e;
    const target = pointer?.eDown?.target || e?.target;

    // 1. Yield to LiteGraph if clicking near bottom edge or bottom-right corner
    if (e && node.size) {
      const rect = root.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const fromBottom = rect.bottom - e.clientY;
      if (fromBottom <= 22 || (fromRight <= 26 && fromBottom <= 26)) {
        return false; // Yield to LiteGraph resize handle!
      }
    }

    // 2. Only intercept pointer events for interactive form elements and controls
    return !!target?.closest?.(
      "button, input, select, textarea, .ds-fl-dropdown, .ds-fl-step-btn, .ds-fl-chip, .ds-ui-toggle, [data-resize-handle], .ds-fl-preview-zone"
    );
  };

  // State sync and UI Refresh helpers
  const refreshUI = () => {
    const state = readState(node);
    pathInput.value = state.folder_path || "";
    execDropdown._dsSetValue(state.execution_mode || "sequential");
    batchSizeInput.value = state.batch_size || 1;
    resizeDropdown._dsSetValue(state.resize_config?.mode || "off");

    const total = (state.selected_files || []).length;
    let idx = state.current_index || 1;
    if (idx > total) idx = Math.max(1, total);
    if (idx < 1) idx = 1;

    galleryBtn.innerHTML = `<span>🖼 Select images : ${total}</span>`;
    indexBadge.textContent = total > 0 ? `Current: ${idx} / ${total}` : "Current: 0 / 0";

    if (total > 0 && idx <= total) {
      const activeRel = state.selected_files[idx - 1];
      filenameEl.textContent = state.keep_folder_structure ? activeRel : (activeRel.split("/").pop() || activeRel);
      filenameEl.title = activeRel;

      const full = state.folder_path ? `${state.folder_path}/${activeRel}` : "";
      previewImg.src = `/ds/thumbnail?path=${encodeURIComponent(full)}`;
      previewImg.style.display = "block";
      previewPh.style.display = "none";
    } else {
      filenameEl.textContent = "(No image)";
      previewImg.removeAttribute("src");
      previewImg.style.display = "none";
      previewPh.style.display = "flex";
      dimBadge.textContent = "— × —";
      resBadge.textContent = "OUTPUT — × —";
    }

    // Toggle stop button visibility
    if (node._dsAutoFeedActive) {
      stopBtn.classList.add("active");
    } else {
      stopBtn.classList.remove("active");
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

  // Immediate path updating on user typing
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

  browseBtn.onclick = (e) => {
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
  };

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
        const allRels = (data.files || []).map(f => f.rel_path);
        saveState(node, { selected_files: allRels, current_index: 1 });
        refreshUI();
      }
    } catch (err) {
      console.warn("[DS Load Images From Folder] Auto-scan error:", err);
    }
  };

  galleryBtn.onclick = (e) => {
    e.stopPropagation();
    // ALWAYS pull current typed path directly so typing then clicking works immediately!
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
  };

  const updateBatchSize = (v) => {
    const val = Math.max(1, Math.min(100, parseInt(v) || 1));
    batchSizeInput.value = val;
    saveState(node, { batch_size: val });
    markWorkflowDirty();
  };

  bsUp.onclick = (e) => {
    e.stopPropagation();
    updateBatchSize((parseInt(batchSizeInput.value) || 1) + 1);
  };
  bsDown.onclick = (e) => {
    e.stopPropagation();
    updateBatchSize((parseInt(batchSizeInput.value) || 1) - 1);
  };
  batchSizeInput.onchange = () => updateBatchSize(batchSizeInput.value);

  stopBtn.onclick = (e) => {
    e.stopPropagation();
    node._dsAutoFeedActive = false;
    stopBtn.classList.remove("active");
  };

  // Drag and drop target handling on node
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

    // Check if there are more images to process
    if (curIdx + step <= total) {
      node._dsAutoFeedActive = true;
      const nextIdx = curIdx + step;
      saveState(node, { current_index: nextIdx });
      refreshUI();

      // Trigger next execution in loop
      setTimeout(() => {
        if (node._dsAutoFeedActive) {
          app.queuePrompt(0);
        }
      }, 80);
    } else {
      // Loop finished!
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
    execDropdown._dsCleanup?.();
    resizeDropdown._dsCleanup?.();
    if (oldRemoved) oldRemoved.apply(this, arguments);
  };

  const oldResize = node.onResize;
  node.onResize = function (size) {
    try { if (oldResize) oldResize.apply(this, arguments); } catch (_) { }
    this.setDirtyCanvas?.(true, true);
  };

  const oldConfigure = node.onConfigure;
  node.onConfigure = function () {
    try { oldConfigure?.apply(this, arguments); } catch (_) { }
    setTimeout(() => {
      try {
        const sw = this.widgets?.find(w => w.name === STATE_WIDGET);
        if (sw?.value && !this.properties?.[STATE_PROP]) {
          this.properties[STATE_PROP] = sw.value;
        }
        const curH = Number(this.size?.[1]) || 0;
        if (curH > 900) {
          const safeW = Math.max(380, Number(this.size?.[0]) || 400);
          if (this.setSize) this.setSize([safeW, 500]);
          else this.size = [safeW, 500];
        }
        refreshUI();
        this.setDirtyCanvas?.(true, true);
      } catch (_) { }
    }, 40);
  };

  // Initial render
  node._dsFLRefreshUI = refreshUI;
  refreshUI();
  try { window.DSGlobalTheme?.bindNode?.(root, node); } catch { }
}

app.registerExtension({
  name: "DeathshotArsenal.DSLoadImagesFromFolder",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_LoadImagesFromFolder") return;
    try { nodeData.display_name = "DS Load Images From Folder"; } catch { }
    try { nodeType.title = "DS Load Images From Folder"; } catch { }
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
