// Deathshot Arsenal — Hardware & Performance Monitor (Action Bar Strip)
// Dockable compact monitor strip for Hardware, LLM, and Queue-aware Timer.
// Linux & Windows compatible.

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

(() => {
  if (window.__DS_HPM_INITIALIZED__) return;
  window.__DS_HPM_INITIALIZED__ = true;

  const SETTINGS_KEY = "DS_HPM_SETTINGS_V1";
  const STATE_KEY = "DS_HPM_STATE_V1";
  const RUN_HISTORY_KEY = "DS_HPM_RUN_HISTORY_V1";
  const LLM_STATE_KEY = "DS_HPM_LLM_STATE_V1";

  // Default settings
  let settings = {
    enabled: true,
    showHardware: true,
    showLLM: true,
    showTimer: true,
    gpuIndex: 0,
    ollamaUrl: "http://127.0.0.1:11434",
    llamacppUrl: "http://127.0.0.1:8080",
    lmstudioUrl: "http://127.0.0.1:1234",
  };

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch (_) {}

  // State store
  const state = {
    docked: true,
    floatLeft: 100,
    floatTop: 60,
    hwStatic: {
      cpu_model: "CPU",
      cpu_physical_cores: 1,
      cpu_logical_cores: 1,
      ram_total_gb: 16.0,
      gpu_available: false,
      gpu_name: "No GPU",
      vram_total_gb: 0.0,
    },
    hwDynamic: {
      cpu: 0,
      ram: 0,
      ram_used_gb: 0,
      ram_free_gb: 0,
      gpu_available: false,
      gpu: null,
      vram_used_gb: null,
      vram_free_gb: null,
      gpu_temp: null,
      gpu_power: null,
      gpu_clock: null,
      vram_pct: 0,
      vram_headroom_pct: 100,
    },
    llm: {
      status: "idle",
      model_name: "",
      model_meta: "Local inference",
      speed_tk_s: 0,
      tokens: 0,
      ttft_sec: null,
      elapsed_sec: 0,
      sparkline: [],
      avg_tk_s: 0,
      backend: "None detected",
    },
    timer: {
      status: "idle",
      activePromptId: null,
      queueNumber: "--",
      elapsedSec: 0,
      isPaused: false,
      pauseStart: 0,
      totalPausedMs: 0,
      startTime: 0,
      executedNodesCount: 0,
      intervalId: null,
      checkpointSplitMs: 0,
      hasCheckpointSplit: false,
      checkpointPausePending: false,
      isContinuation: false,
      continuationStartTime: 0,
      baseCheckpointMs: 0,
    },
    runHistory: [],
  };

  try {
    const rawState = localStorage.getItem(STATE_KEY);
    if (rawState) {
      const s = JSON.parse(rawState);
      if (typeof s.docked === "boolean") state.docked = s.docked;
      if (typeof s.left === "number") state.floatLeft = s.left;
      if (typeof s.top === "number") state.floatTop = s.top;
      if (typeof s.checkpointSplitMs === "number" && s.checkpointSplitMs > 0) {
        state.timer.checkpointSplitMs = s.checkpointSplitMs;
        state.timer.hasCheckpointSplit = true;
      }
    }
  } catch (_) {}

  try {
    const rawHist = localStorage.getItem(RUN_HISTORY_KEY);
    if (rawHist) state.runHistory = JSON.parse(rawHist);
  } catch (_) {}

  try {
    const rawLLM = localStorage.getItem(LLM_STATE_KEY);
    if (rawLLM) {
      const l = JSON.parse(rawLLM);
      if (l && typeof l === "object") {
        state.llm = { ...state.llm, ...l, status: "idle" };
      }
    }
  } catch (_) {}

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function saveLLMState() {
    try {
      localStorage.setItem(LLM_STATE_KEY, JSON.stringify(state.llm));
    } catch (_) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
    fetch("/ds/hpm/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: settings.enabled,
        gpu_index: settings.gpuIndex,
        llm_urls: {
          ollama: settings.ollamaUrl,
          llamacpp: settings.llamacppUrl,
          lmstudio: settings.lmstudioUrl,
        },
      }),
    }).catch(() => {});
    applyVisibility();
  }

  function saveState() {
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          docked: state.docked,
          left: state.floatLeft,
          top: state.floatTop,
          checkpointSplitMs: state.timer.checkpointSplitMs || 0,
        })
      );
    } catch (_) {}
  }

  function saveRunHistory() {
    try {
      localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(state.runHistory));
    } catch (_) {}
  }

  // Hardware thresholds from PRD
  const HW_THRESHOLDS = {
    cpu: { warn: 55, danger: 80 },
    ram: { warn: 62, danger: 82 },
    gpu: { warn: 55, danger: 82 },
    vram: { warn: 65, danger: 87 },
  };

  function getLevelClass(pct, metricKey) {
    if (pct == null || isNaN(pct)) return "";
    const th = HW_THRESHOLDS[metricKey];
    if (!th) return "hpm-level-low";
    if (pct >= th.danger) return "hpm-level-high";
    if (pct >= th.warn) return "hpm-level-mid";
    return "hpm-level-low";
  }

  // ---------------------------------------------------------------------------
  // Stylesheet Injection
  // ---------------------------------------------------------------------------
  function injectStyles() {
    const existing = document.getElementById("ds-hpm-styles");
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = "ds-hpm-styles";
    style.textContent = `
      .hpm-monitor-group {
        --hpm-bg: var(--comfy-menu-bg, var(--ds-color-base, #141619));
        --hpm-bar: var(--comfy-menu-bg, var(--ds-color-card, #25282d));
        --hpm-bar-border: var(--border-color, var(--ds-color-border, rgba(127,127,127,0.25)));
        --hpm-text: var(--input-text, var(--fg-color, var(--ds-color-text, #edf0f4)));
        --hpm-muted: var(--descrip-text, var(--ds-color-muted-text, #89929c));
        --hpm-panel: var(--comfy-menu-bg, var(--content-bg, var(--ds-color-card, #191c20)));
        --hpm-panel-border: var(--border-color, var(--ds-color-card-border, rgba(127,127,127,0.3)));
        --hpm-sub-box: var(--comfy-input-bg, var(--ds-color-panel-2, color-mix(in srgb, var(--hpm-text) 6%, var(--hpm-panel))));
        --hpm-sub-border: color-mix(in srgb, var(--hpm-text) 14%, transparent);
        --hpm-teal: var(--ds-color-accent, #5bd6c4);
        --hpm-green: var(--ds-color-success, #65d99b);
        --hpm-amber: var(--ds-color-warning, #efc36b);
        --hpm-red: var(--ds-color-danger, #ff737b);
        --hpm-purple: #b69cff;

        display: inline-flex !important;
        align-items: center !important;
        height: 38px !important;
        min-height: 38px !important;
        max-height: 38px !important;
        box-sizing: border-box !important;
        gap: 2px !important;
        padding: 0 4px 0 2px !important;
        margin: 0 4px 0 2px !important;
        position: relative !important;
        flex: 0 0 auto !important;
        width: max-content !important;
        max-width: calc(100vw - 16px) !important;
        background: var(--hpm-bar) !important;
        border: 1px solid var(--hpm-bar-border) !important;
        border-radius: 8px !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif !important;
        color: var(--hpm-text) !important;
        overflow: visible !important;
        touch-action: pan-y !important;
        user-select: none !important;
        z-index: 50 !important;
      }

      .hpm-monitor-group *,
      .hpm-panel-wrap * {
        box-sizing: border-box !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif !important;
      }

      .hpm-dock-grip {
        width: 14px !important;
        min-width: 14px !important;
        height: 32px !important;
        padding: 0 2px !important;
        border: 0 !important;
        border-radius: 4px !important;
        background: transparent !important;
        color: var(--hpm-muted) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: grab !important;
        touch-action: none !important;
        flex: 0 0 14px !important;
        transition: color .15s ease, background .15s ease !important;
      }
      .hpm-dock-grip:hover, .hpm-dock-grip:focus-visible {
        background: color-mix(in srgb, var(--hpm-text) 10%, transparent) !important;
        color: var(--hpm-text) !important;
        outline: none !important;
      }
      .hpm-dock-grip:active { cursor: grabbing !important; }
      .hpm-dock-grip svg {
        display: block !important;
        pointer-events: none !important;
      }

      .hpm-metric {
        height: 34px !important;
        display: flex !important;
        align-items: center !important;
        position: relative !important;
        border-radius: 6px !important;
        color: var(--hpm-text) !important;
        cursor: default !important;
        outline: none !important;
        transition: background .16s ease, box-shadow .16s ease !important;
        box-sizing: border-box !important;
        flex: 0 0 auto !important;
      }
      .hpm-metric:hover, .hpm-metric:focus-visible, .hpm-metric:focus-within {
        background: color-mix(in srgb, var(--hpm-text) 10%, transparent) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hpm-text) 8%, transparent) !important;
      }

      /* Fixed dimension sections */
      .hpm-metric.hpm-hw {
        width: 274px !important;
        min-width: 274px !important;
        flex: 0 0 274px !important;
        gap: 5px !important;
        padding: 0 5px !important;
      }
      .hpm-metric.hpm-llm {
        width: 158px !important;
        min-width: 158px !important;
        flex: 0 0 158px !important;
        gap: 6px !important;
        padding: 0 7px !important;
      }
      .hpm-metric.hpm-timer {
        width: 82px !important;
        min-width: 82px !important;
        flex: 0 0 82px !important;
        gap: 5px !important;
        padding: 0 6px !important;
      }

      .hpm-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 16px !important;
        min-width: 16px !important;
        flex: 0 0 16px !important;
        color: var(--hpm-teal) !important;
      }
      .hpm-metric.hpm-llm .hpm-icon { color: var(--hpm-purple) !important; }
      .hpm-metric.hpm-timer .hpm-icon { color: var(--hpm-amber) !important; }
      .hpm-icon svg {
        width: 16px !important;
        height: 16px !important;
        display: block !important;
        stroke: currentColor !important;
        fill: none !important;
        stroke-width: 1.7 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
      }

      /* Hardware readings row container */
      .hpm-hw-readings {
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
        width: 242px !important;
        min-width: 242px !important;
        flex: 0 0 242px !important;
        white-space: nowrap !important;
      }
      .hpm-hw-reading {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 2px !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        flex: 0 0 auto !important;
        white-space: nowrap !important;
        overflow: visible !important;
      }

      /* Generous fixed slot widths with guaranteed clearance */
      .hpm-hw-reading[data-kind="cpu"] { width: 52px !important; min-width: 52px !important; flex: 0 0 52px !important; }
      .hpm-hw-reading[data-kind="ram"] { width: 54px !important; min-width: 54px !important; flex: 0 0 54px !important; }
      .hpm-hw-reading[data-kind="gpu"] { width: 52px !important; min-width: 52px !important; flex: 0 0 52px !important; }
      .hpm-hw-reading[data-kind="vram"] { width: 68px !important; min-width: 68px !important; flex: 0 0 68px !important; }

      .hpm-hw-reading[data-kind="cpu"] .hpm-unit { width: 20px !important; flex: 0 0 20px !important; }
      .hpm-hw-reading[data-kind="ram"] .hpm-unit { width: 22px !important; flex: 0 0 22px !important; }
      .hpm-hw-reading[data-kind="gpu"] .hpm-unit { width: 20px !important; flex: 0 0 20px !important; }
      .hpm-hw-reading[data-kind="vram"] .hpm-unit { width: 28px !important; flex: 0 0 28px !important; }

      .hpm-unit {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        font-size: 9px !important;
        font-weight: 700 !important;
        line-height: 1 !important;
        letter-spacing: normal !important;
        text-transform: none !important;
        margin: 0 !important;
        padding: 0 !important;
        color: var(--hpm-muted) !important;
        user-select: none !important;
      }

      .hpm-live-value {
        display: inline-block !important;
        text-align: right !important;
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding: 0 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        font-size: 11px !important;
        line-height: 1 !important;
        font-weight: 800 !important;
        font-variant-numeric: tabular-nums !important;
        font-feature-settings: "tnum" 1 !important;
        letter-spacing: 0 !important;
        transition: color .4s ease, text-shadow .4s ease !important;
      }
      .hpm-hw-reading[data-kind="cpu"] .hpm-live-value { width: 30px !important; flex: 0 0 30px !important; }
      .hpm-hw-reading[data-kind="ram"] .hpm-live-value { width: 30px !important; flex: 0 0 30px !important; }
      .hpm-hw-reading[data-kind="gpu"] .hpm-live-value { width: 30px !important; flex: 0 0 30px !important; }
      .hpm-hw-reading[data-kind="vram"] .hpm-live-value { width: 38px !important; flex: 0 0 38px !important; }

      .hpm-level-low { color: var(--hpm-green) !important; text-shadow: 0 0 7px rgba(101,217,155,.22) !important; }
      .hpm-level-mid { color: var(--hpm-amber) !important; text-shadow: 0 0 7px rgba(239,195,107,.22) !important; }
      .hpm-level-high { color: var(--hpm-red) !important; text-shadow: 0 0 8px rgba(255,115,123,.3) !important; }

      .hpm-metric.hpm-llm .hpm-metric-text {
        display: flex !important;
        align-items: center !important;
        gap: 3px !important;
        min-width: 0 !important;
        flex: 0 0 auto !important;
        white-space: nowrap !important;
        font-size: 11px !important;
      }
      .hpm-metric.hpm-llm .hpm-live-speed {
        display: inline-block !important;
        width: 28px !important;
        flex: 0 0 28px !important;
        font-size: 11px !important;
        font-weight: 750 !important;
        text-align: right !important;
        font-variant-numeric: tabular-nums !important;
        line-height: 1 !important;
        color: var(--hpm-text) !important;
      }
      .hpm-metric.hpm-llm .hpm-unit-speed {
        width: 22px !important;
        flex: 0 0 22px !important;
        margin: 0 !important;
        font-size: 9px !important;
        font-weight: 700 !important;
        color: var(--hpm-muted) !important;
        line-height: 1 !important;
      }
      .hpm-metric.hpm-llm .hpm-dot-sep {
        width: 6px !important;
        flex: 0 0 6px !important;
        text-align: center !important;
        color: var(--hpm-muted) !important;
        font-size: 11px !important;
      }
      .hpm-metric.hpm-llm .hpm-live-tokens {
        display: inline-block !important;
        width: 30px !important;
        flex: 0 0 30px !important;
        font-size: 11px !important;
        font-weight: 750 !important;
        text-align: right !important;
        font-variant-numeric: tabular-nums !important;
        line-height: 1 !important;
        color: var(--hpm-text) !important;
      }
      .hpm-metric.hpm-llm .hpm-unit-tokens {
        width: 20px !important;
        flex: 0 0 20px !important;
        margin: 0 !important;
        font-size: 9px !important;
        font-weight: 700 !important;
        color: var(--hpm-muted) !important;
        line-height: 1 !important;
      }

      .hpm-metric.hpm-timer .hpm-metric-text {
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
        min-width: 0 !important;
        flex: 0 0 auto !important;
        white-space: nowrap !important;
      }
      .hpm-metric.hpm-timer .hpm-live-timer {
        display: inline-block !important;
        width: 36px !important;
        text-align: right !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        font-variant-numeric: tabular-nums !important;
        line-height: 1 !important;
        color: var(--hpm-text) !important;
        transition: color .2s ease !important;
      }
      .hpm-metric.hpm-timer .hpm-live-timer.hpm-timer-rewind {
        color: var(--hpm-amber) !important;
        text-shadow: 0 0 10px rgba(239,195,107,.7) !important;
        animation: hpmRewindPulse .22s ease-in-out infinite alternate !important;
      }
      @keyframes hpmRewindPulse {
        0% { transform: scale(1); filter: brightness(1); }
        100% { transform: scale(1.1); filter: brightness(1.25); }
      }
      .hpm-tiny-dot {
        width: 6px !important;
        min-width: 6px !important;
        height: 6px !important;
        flex: 0 0 6px !important;
        border-radius: 50% !important;
        background: var(--hpm-green) !important;
        box-shadow: 0 0 8px rgba(101,217,155,.36) !important;
        display: inline-block !important;
        opacity: 0.2 !important;
        transition: opacity .2s ease, background .2s ease, box-shadow .2s ease !important;
      }
      .hpm-tiny-dot.is-active {
        opacity: 1 !important;
      }
      .hpm-tiny-dot.hpm-dot-rewind {
        background: var(--hpm-amber) !important;
        box-shadow: 0 0 10px rgba(239,195,107,.8) !important;
        opacity: 1 !important;
      }
      .hpm-tiny-dot.is-paused {
        background: var(--hpm-amber) !important;
        box-shadow: 0 0 8px rgba(239,195,107,.5) !important;
        opacity: 1 !important;
        animation: hpmDotPulse 1.2s ease-in-out infinite !important;
      }
      @keyframes hpmDotPulse {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 1; }
      }

      .hpm-divider {
        flex: 0 0 1px !important;
        width: 1px !important;
        height: 24px !important;
        margin: 0 1px !important;
        background: var(--hpm-bar-border) !important;
      }

      /* Hover Panels */
      .hpm-panel-wrap {
        position: absolute !important;
        top: 100% !important;
        left: 0;
        right: auto;
        z-index: 200 !important;
        padding-top: 7px !important;
        white-space: normal !important;
        opacity: 0 !important;
        visibility: hidden !important;
        transform: translateY(-5px) !important;
        transition: opacity .16s ease, transform .18s ease, visibility .16s !important;
        pointer-events: none !important;
      }
      .hpm-metric.hpm-hw .hpm-panel-wrap { width: 290px; }
      .hpm-metric.hpm-llm .hpm-panel-wrap { width: 286px; }
      .hpm-metric.hpm-timer .hpm-panel-wrap { width: 308px; }

      .hpm-panel-wrap.hpm-align-right {
        left: auto !important;
        right: 0 !important;
      }
      .hpm-metric.hpm-timer .hpm-panel-wrap.hpm-align-right {
        left: auto !important;
        right: 0 !important;
      }

      .hpm-live-speed.is-idle-val, .hpm-live-tokens.is-idle-val {
        opacity: 0.85 !important;
      }
      .hpm-live-pill.is-paused {
        background: rgba(239, 195, 107, 0.18) !important;
        color: var(--hpm-amber) !important;
        border-color: rgba(239, 195, 107, 0.4) !important;
      }
      .hpm-tiny-dot.is-paused {
        opacity: 0.7 !important;
        background: var(--hpm-amber) !important;
      }

      .hpm-panel-wrap.is-open {
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateY(0) !important;
        pointer-events: auto !important;
      }
      .hpm-panel-wrap.hpm-opens-up {
        top: auto !important;
        bottom: 100% !important;
        padding-top: 0 !important;
        padding-bottom: 7px !important;
        transform: translateY(5px) !important;
      }
      .hpm-panel-wrap.hpm-opens-up.is-open {
        transform: translateY(0) !important;
      }

      .hpm-panel {
        padding: 13px !important;
        background: var(--hpm-panel) !important;
        border: 1px solid var(--hpm-panel-border) !important;
        border-radius: 11px !important;
        box-shadow: 0 18px 45px rgba(0,0,0,.65), 0 2px 8px rgba(0,0,0,.25) !important;
        backdrop-filter: blur(18px) !important;
        box-sizing: border-box !important;
      }
      .hpm-panel.hpm-panel-scroll {
        overflow-y: auto !important;
        overscroll-behavior: contain !important;
        scrollbar-width: thin !important;
        scrollbar-color: color-mix(in srgb, var(--hpm-text) 30%, transparent) transparent !important;
      }
      .hpm-panel.hpm-panel-scroll::-webkit-scrollbar { width: 6px !important; }
      .hpm-panel.hpm-panel-scroll::-webkit-scrollbar-track { background: transparent !important; border-radius: 99px !important; }
      .hpm-panel.hpm-panel-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--hpm-text) 25%, transparent) !important; border-radius: 99px !important; }
      .hpm-panel.hpm-panel-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--hpm-text) 45%, transparent) !important; }

      .hpm-panel-top {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 12px !important;
      }
      .hpm-panel-title {
        display: flex !important;
        align-items: center !important;
        gap: 7px !important;
        font-size: 11px !important;
        font-weight: 750 !important;
        letter-spacing: .08em !important;
        text-transform: uppercase !important;
        color: var(--hpm-text) !important;
      }
      .hpm-live-pill {
        font-size: 9px !important;
        text-transform: uppercase !important;
        letter-spacing: .08em !important;
        font-weight: 800 !important;
        color: var(--hpm-green) !important;
        border: 1px solid color-mix(in srgb, var(--hpm-green) 38%, transparent) !important;
        background: color-mix(in srgb, var(--hpm-green) 16%, transparent) !important;
        padding: 3px 6px !important;
        border-radius: 999px !important;
      }
      .hpm-live-pill.is-idle {
        color: var(--hpm-muted) !important;
        border-color: var(--hpm-sub-border) !important;
        background: var(--hpm-sub-box) !important;
      }
      .hpm-live-pill.is-paused {
        color: var(--hpm-amber) !important;
        border-color: color-mix(in srgb, var(--hpm-amber) 38%, transparent) !important;
        background: color-mix(in srgb, var(--hpm-amber) 16%, transparent) !important;
      }

      .hpm-panel-sub {
        font-size: 10px !important;
        color: var(--hpm-muted) !important;
        line-height: 1.45 !important;
      }

      /* Resource bars */
      .hpm-resource { margin-top: 12px !important; }
      .hpm-resource:first-of-type { margin-top: 0 !important; }
      .hpm-resource-head {
        display: flex !important;
        align-items: baseline !important;
        justify-content: space-between !important;
        margin-bottom: 6px !important;
        font-size: 11px !important;
      }
      .hpm-resource-name { color: var(--hpm-text) !important; font-weight: 650 !important; }
      .hpm-resource-values {
        font-size: 10px !important;
        color: var(--hpm-muted) !important;
        font-variant-numeric: tabular-nums !important;
      }
      .hpm-resource-values b { font-size: 11px !important; color: var(--hpm-text) !important; }

      .hpm-track {
        height: 5px !important;
        border-radius: 999px !important;
        background: color-mix(in srgb, var(--hpm-text) 14%, transparent) !important;
        overflow: hidden !important;
        box-shadow: inset 0 1px 2px rgba(0,0,0,.15) !important;
      }
      .hpm-fill {
        height: 100 !important;
        height: 100% !important;
        width: var(--w, 0%) !important;
        border-radius: inherit !important;
        background: var(--c, var(--hpm-teal)) !important;
        box-shadow: 0 0 12px color-mix(in srgb, var(--c, var(--hpm-teal)) 27%, transparent) !important;
        transition: width .7s ease, background-color .55s ease, box-shadow .55s ease !important;
      }

      .hpm-resource-foot {
        display: flex !important;
        justify-content: space-between !important;
        color: var(--hpm-muted) !important;
        font-size: 9px !important;
        margin-top: 4px !important;
      }

      .hpm-panel-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 7px !important;
        margin-top: 12px !important;
      }
      .hpm-statbox {
        border: 1px solid var(--hpm-sub-border) !important;
        background: var(--hpm-sub-box) !important;
        border-radius: 8px !important;
        padding: 8px 9px !important;
        min-width: 0 !important;
      }
      .hpm-statbox .hpm-k {
        font-size: 9px !important;
        color: var(--hpm-muted) !important;
        margin-bottom: 4px !important;
      }
      .hpm-statbox .hpm-v {
        font-size: 14px !important;
        font-weight: 750 !important;
        color: var(--hpm-text) !important;
        font-variant-numeric: tabular-nums !important;
        white-space: nowrap !important;
      }
      .hpm-statbox .hpm-s {
        font-size: 9px !important;
        color: var(--hpm-muted) !important;
        margin-top: 3px !important;
      }

      .hpm-panel-foot {
        border-top: 1px solid var(--hpm-sub-border) !important;
        padding-top: 9px !important;
        margin-top: 11px !important;
        color: var(--hpm-muted) !important;
        font-size: 9px !important;
        line-height: 1.5 !important;
      }
      .hpm-panel-foot strong { color: var(--hpm-text) !important; font-weight: 650 !important; }

      /* LLM specific */
      .hpm-model-box {
        background: color-mix(in srgb, var(--hpm-purple) 10%, var(--hpm-sub-box)) !important;
        border: 1px solid color-mix(in srgb, var(--hpm-purple) 25%, var(--hpm-sub-border)) !important;
        border-radius: 8px !important;
        padding: 10px !important;
        margin-bottom: 9px !important;
      }
      .hpm-model-label {
        font-size: 9px !important;
        color: var(--hpm-purple) !important;
        text-transform: uppercase !important;
        letter-spacing: .08em !important;
        margin-bottom: 5px !important;
        font-weight: 700 !important;
      }
      .hpm-model-name {
        font-size: 12px !important;
        font-weight: 750 !important;
        color: var(--hpm-text) !important;
        overflow-wrap: anywhere !important;
      }
      .hpm-model-meta {
        font-size: 10px !important;
        color: var(--hpm-muted) !important;
        margin-top: 4px !important;
      }
      .hpm-throughput {
        margin-top: 11px !important;
        border: 1px solid var(--hpm-sub-border) !important;
        border-radius: 8px !important;
        padding: 8px 9px !important;
        background: var(--hpm-sub-box) !important;
      }
      .hpm-throughput-head {
        display: flex !important;
        justify-content: space-between !important;
        color: var(--hpm-muted) !important;
        font-size: 9px !important;
        margin-bottom: 6px !important;
      }
      .hpm-throughput-head b { color: var(--hpm-text) !important; font-size: 10px !important; }
      .hpm-spark {
        height: 34px !important;
        display: flex !important;
        gap: 3px !important;
        align-items: flex-end !important;
        overflow: hidden !important;
      }
      .hpm-spark i {
        flex: 1 !important;
        min-width: 3px !important;
        border-radius: 3px 3px 1px 1px !important;
        background: linear-gradient(180deg, var(--hpm-purple), color-mix(in srgb, var(--hpm-purple) 50%, transparent)) !important;
        opacity: .88 !important;
        transition: height .3s ease !important;
      }

      /* Timer specific */
      .hpm-run-list {
        margin-top: 8px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 3px !important;
      }
      .hpm-run-row {
        display: grid !important;
        grid-template-columns: 24px 1fr auto !important;
        align-items: center !important;
        gap: 7px !important;
        border: 1px solid transparent !important;
        border-radius: 6px !important;
        padding: 5px 7px !important;
        font-size: 10px !important;
        color: var(--hpm-text) !important;
        font-variant-numeric: tabular-nums !important;
      }
      .hpm-run-row .hpm-num { color: var(--hpm-muted) !important; }
      .hpm-run-row .hpm-run-date { color: var(--hpm-muted) !important; }
      .hpm-run-row .hpm-duration { font-weight: 700 !important; color: var(--hpm-text) !important; }
      .hpm-run-row.hpm-best {
        background: color-mix(in srgb, var(--hpm-green) 12%, var(--hpm-sub-box)) !important;
        border-color: color-mix(in srgb, var(--hpm-green) 35%, transparent) !important;
      }
      .hpm-run-row.hpm-best .hpm-num,
      .hpm-run-row.hpm-best .hpm-duration { color: var(--hpm-green) !important; }
      .hpm-best-tag {
        font-size: 8px !important;
        color: var(--hpm-green) !important;
        background: color-mix(in srgb, var(--hpm-green) 18%, transparent) !important;
        border: 1px solid color-mix(in srgb, var(--hpm-green) 35%, transparent) !important;
        border-radius: 4px !important;
        padding: 1px 4px !important;
        text-transform: uppercase !important;
        letter-spacing: .07em !important;
        margin-left: 5px !important;
      }

      /* Docking & Floating */
      .hpm-monitor-group.is-floating {
        position: fixed !important;
        z-index: 9999 !important;
        width: max-content !important;
        max-width: calc(100vw - 16px) !important;
        box-shadow: 0 14px 36px rgba(0,0,0,.5), 0 0 0 1px var(--hpm-bar-border) !important;
        background: var(--hpm-panel) !important;
        cursor: grab !important;
        transition: none !important;
      }
      .hpm-monitor-group.is-dragging {
        user-select: none !important;
        opacity: .95 !important;
        z-index: 10000 !important;
        cursor: grabbing !important;
        transition: none !important;
      }
      .hpm-monitor-group.is-dragging * {
        cursor: grabbing !important;
      }
      .hpm-monitor-group.is-dragging .hpm-panel-wrap {
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .hpm-dock-placeholder {
        appearance: none !important;
        -webkit-appearance: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 32px !important;
        width: 32px !important;
        min-width: 32px !important;
        height: 38px !important;
        min-height: 38px !important;
        max-height: 38px !important;
        margin: 0 4px 0 2px !important;
        padding: 0 !important;
        border: 1px dashed color-mix(in srgb, var(--hpm-teal) 60%, var(--hpm-bar-border)) !important;
        border-radius: 8px !important;
        background: color-mix(in srgb, var(--hpm-teal) 14%, var(--hpm-bar)) !important;
        color: var(--hpm-teal) !important;
        font: 700 15px/1 system-ui !important;
        cursor: pointer !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hpm-teal) 10%, transparent) !important;
      }
      .hpm-dock-placeholder:hover,
      .hpm-dock-placeholder:focus-visible,
      .hpm-dock-placeholder.dock-hot {
        outline: none !important;
        background: color-mix(in srgb, var(--hpm-teal) 25%, var(--hpm-bar)) !important;
        border-color: var(--hpm-teal) !important;
        color: var(--hpm-text) !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--hpm-teal) 30%, transparent) !important;
      }

      @media(prefers-reduced-motion: reduce) {
        .hpm-monitor-group, .hpm-monitor-group * {
          transition: none !important;
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Build DOM Elements
  // ---------------------------------------------------------------------------
  function buildMonitorDOM() {
    const group = document.createElement("div");
    group.className = "hpm-monitor-group";
    group.setAttribute("aria-label", "Hardware, LLM and execution monitors");

    group.innerHTML = `
      <button class="hpm-dock-grip" type="button" aria-label="Drag to undock or reposition monitor" title="Drag to move; drop back onto action bar to dock. Click to toggle dock." tabindex="0">
        <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true">
          <circle cx="2.5" cy="2.5" r="1.35"/>
          <circle cx="7.5" cy="2.5" r="1.35"/>
          <circle cx="2.5" cy="8" r="1.35"/>
          <circle cx="7.5" cy="8" r="1.35"/>
          <circle cx="2.5" cy="13.5" r="1.35"/>
          <circle cx="7.5" cy="13.5" r="1.35"/>
        </svg>
      </button>

      <!-- Hardware section -->
      <div class="hpm-metric hpm-hw" tabindex="0" aria-label="Hardware usage details">
        <span class="hpm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>
        </span>
        <span class="hpm-hw-readings">
          <span class="hpm-hw-reading" data-kind="cpu" title="CPU utilization"><span class="hpm-unit">CPU</span><b class="hpm-live-value">--%</b></span>
          <span class="hpm-hw-reading" data-kind="ram" title="System RAM used"><span class="hpm-unit">RAM</span><b class="hpm-live-value">--%</b></span>
          <span class="hpm-hw-reading" data-kind="gpu" title="GPU utilization"><span class="hpm-unit">GPU</span><b class="hpm-live-value">--%</b></span>
          <span class="hpm-hw-reading" data-kind="vram" title="GPU memory used"><span class="hpm-unit">VRAM</span><b class="hpm-live-value">--G</b></span>
        </span>
        <div class="hpm-panel-wrap">
          <section class="hpm-panel" aria-label="Hardware details">
            <div class="hpm-panel-top">
              <div class="hpm-panel-title">
                <span class="hpm-icon"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg></span>
                System resources
              </div>
              <span class="hpm-live-pill">Live</span>
            </div>
            <div class="hpm-panel-sub" id="hpm-hw-sub">Current load · local machine</div>
            <div class="hpm-resource" data-hw-res="cpu">
              <div class="hpm-resource-head"><span class="hpm-resource-name" id="hpm-cpu-cores">CPU · cores</span><span class="hpm-resource-values"><b>0%</b> used</span></div>
              <div class="hpm-track"><div class="hpm-fill" style="--w:0%;--c:var(--hpm-teal)"></div></div>
              <div class="hpm-resource-foot"><span>CPU load</span><span id="hpm-cpu-avail">100% available</span></div>
            </div>
            <div class="hpm-resource" data-hw-res="ram">
              <div class="hpm-resource-head"><span class="hpm-resource-name">System RAM</span><span class="hpm-resource-values"><b id="hpm-ram-val">0 / 0 GB</b></span></div>
              <div class="hpm-track"><div class="hpm-fill" style="--w:0%;--c:var(--hpm-green)"></div></div>
              <div class="hpm-resource-foot"><span id="hpm-ram-used">0 GB used</span><span id="hpm-ram-free">0 GB free</span></div>
            </div>
            <div class="hpm-resource" data-hw-res="gpu">
              <div class="hpm-resource-head"><span class="hpm-resource-name" id="hpm-gpu-name">GPU</span><span class="hpm-resource-values"><b id="hpm-gpu-val">0% load</b></span></div>
              <div class="hpm-track"><div class="hpm-fill" style="--w:0%;--c:#70a8ff"></div></div>
              <div class="hpm-resource-foot"><span id="hpm-gpu-stats">-- MHz · -- °C</span><span id="hpm-gpu-headroom">--% headroom</span></div>
            </div>
            <div class="hpm-resource" data-hw-res="vram">
              <div class="hpm-resource-head"><span class="hpm-resource-name">GPU VRAM</span><span class="hpm-resource-values"><b id="hpm-vram-val">0 / 0 GB</b></span></div>
              <div class="hpm-track"><div class="hpm-fill" style="--w:0%;--c:var(--hpm-amber)"></div></div>
              <div class="hpm-resource-foot"><span id="hpm-vram-alloc">0 GB allocated</span><span id="hpm-vram-free">0 GB free</span></div>
            </div>
            <div class="hpm-panel-grid">
              <div class="hpm-statbox"><div class="hpm-k">GPU power</div><div class="hpm-v" id="hpm-stat-power">-- W</div><div class="hpm-s">Board estimate</div></div>
              <div class="hpm-statbox"><div class="hpm-k">GPU temperature</div><div class="hpm-v" id="hpm-stat-temp">-- °C</div><div class="hpm-s" id="hpm-stat-temp-msg">Thermal normal</div></div>
            </div>
            <div class="hpm-panel-foot" id="hpm-vram-warn-foot" style="display:none;">
              VRAM is getting tight. <strong id="hpm-vram-avail-bold">0.9 GB available</strong>.
            </div>
          </section>
        </div>
      </div>

      <span class="hpm-divider hpm-div-1" aria-hidden="true"></span>

      <!-- LLM section -->
      <div class="hpm-metric hpm-llm" tabindex="0" aria-label="LLM performance details">
        <span class="hpm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v2a3 3 0 0 0 3 3h1V9H8a4 4 0 0 1 8 0h-1v6h1a3 3 0 0 0 3-3v-2a7 7 0 0 0-7-7Z"/><path d="M9 18h3a3 3 0 0 0 3-3M12 21v-3"/></svg>
        </span>
        <span class="hpm-metric-text">
          <b class="hpm-live-speed">--</b><span class="hpm-unit-speed">tk/s</span><span class="hpm-dot-sep">·</span><b class="hpm-live-tokens">--</b><span class="hpm-unit-tokens">tok</span>
        </span>
        <div class="hpm-panel-wrap">
          <section class="hpm-panel" aria-label="LLM performance details">
            <div class="hpm-panel-top">
              <div class="hpm-panel-title">
                <span class="hpm-icon"><svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v2a3 3 0 0 0 3 3h1V9H8a4 4 0 0 1 8 0h-1v6h1a3 3 0 0 0 3-3v-2a7 7 0 0 0-7-7Z"/><path d="M9 18h3a3 3 0 0 0 3-3M12 21v-3"/></svg></span>
                LLM performance
              </div>
              <span class="hpm-live-pill is-idle" id="hpm-llm-pill">Idle</span>
            </div>
            <div class="hpm-model-box">
              <div class="hpm-model-label">Loaded model</div>
              <div class="hpm-model-name" id="hpm-llm-model-name">None loaded</div>
              <div class="hpm-model-meta" id="hpm-llm-model-meta">Local inference</div>
            </div>
            <div class="hpm-panel-grid" style="margin-top:0;">
              <div class="hpm-statbox"><div class="hpm-k">Generation speed</div><div class="hpm-v" id="hpm-llm-speed">-- <span style="font-size:10px;color:var(--hpm-muted)">tk/s</span></div><div class="hpm-s">Output rate</div></div>
              <div class="hpm-statbox"><div class="hpm-k">Generated tokens</div><div class="hpm-v" id="hpm-llm-tokens">--</div><div class="hpm-s">Response count</div></div>
              <div class="hpm-statbox"><div class="hpm-k">Time to first token</div><div class="hpm-v" id="hpm-llm-ttft">-- s</div><div class="hpm-s">Prompt processing</div></div>
              <div class="hpm-statbox"><div class="hpm-k">Elapsed</div><div class="hpm-v" id="hpm-llm-elapsed">00:00</div><div class="hpm-s">Request duration</div></div>
            </div>
            <div class="hpm-throughput">
              <div class="hpm-throughput-head"><span>Recent token throughput</span><b id="hpm-llm-avg-speed">-- tk/s avg.</b></div>
              <div class="hpm-spark" id="hpm-llm-spark" aria-label="Throughput graph"></div>
            </div>
            <div class="hpm-panel-foot" id="hpm-llm-foot">
              Connected backend: <strong id="hpm-llm-backend-name">None detected</strong>
            </div>
          </section>
        </div>
      </div>

      <span class="hpm-divider hpm-div-2" aria-hidden="true"></span>

      <!-- Workflow timer section -->
      <div class="hpm-metric hpm-timer" tabindex="0" aria-label="Workflow timer and recent run details">
        <span class="hpm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8.2"/><path d="M9 2h6M12 4.8V2M12 8v5l3.2 2"/></svg>
        </span>
        <span class="hpm-metric-text">
          <b class="hpm-live-timer">00:00</b><span class="hpm-tiny-dot" title="Workflow running status"></span>
        </span>
        <div class="hpm-panel-wrap">
          <section class="hpm-panel" aria-label="Workflow timer history">
            <div class="hpm-panel-top">
              <div class="hpm-panel-title">
                <span class="hpm-icon" style="color:var(--hpm-amber)"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8.2"/><path d="M9 2h6M12 4.8V2M12 8v5l3.2 2"/></svg></span>
                Workflow runs
              </div>
              <span class="hpm-live-pill is-idle" id="hpm-timer-pill">Idle</span>
            </div>
            <div class="hpm-panel-grid" style="margin-top:0;">
              <div class="hpm-statbox"><div class="hpm-k">Current queue</div><div class="hpm-v" id="hpm-timer-queue">--</div><div class="hpm-s" id="hpm-timer-elapsed-sub">Elapsed 00:00</div></div>
              <div class="hpm-statbox"><div class="hpm-k">Average duration</div><div class="hpm-v" id="hpm-timer-avg">00:00</div><div class="hpm-s">Last 10 completed</div></div>
            </div>
            <div class="hpm-panel-sub" style="margin-top:13px;display:flex;justify-content:space-between;">
              <span>RECENT COMPLETED RUNS</span><span>TIME</span>
            </div>
            <div class="hpm-run-list" id="hpm-run-list"></div>
            <div class="hpm-panel-foot">
              <strong>Queue-aware timing:</strong> Pause time is excluded. History is saved only when queue execution fully completes.
            </div>
          </section>
        </div>
      </div>
    `;

    return group;
  }

  // ---------------------------------------------------------------------------
  // Popover Positioning with Edge Detection
  // ---------------------------------------------------------------------------
  function positionPanel(metricEl) {
    const wrap = metricEl.querySelector(".hpm-panel-wrap");
    const panel = wrap?.querySelector(".hpm-panel");
    if (!wrap || !panel) return;

    wrap.classList.remove("hpm-opens-up");
    panel.style.maxHeight = "";
    panel.classList.remove("hpm-panel-scroll");
    panel.style.overflowY = "";

    if (!wrap.dataset.preferredWidth) {
      wrap.dataset.preferredWidth = String(parseFloat(getComputedStyle(wrap).width) || 290);
    }
    const gutter = 10;
    const preferredWidth = Number(wrap.dataset.preferredWidth) || 290;
    const wrapWidth = Math.max(1, Math.min(preferredWidth, window.innerWidth - gutter * 2));
    wrap.style.setProperty("width", wrapWidth + "px", "important");

    const anchor = metricEl.getBoundingClientRect();
    const maxLeft = Math.max(gutter, window.innerWidth - wrapWidth - gutter);
    const panelLeft = clamp(anchor.left, gutter, maxLeft);
    const relLeft = Math.round(panelLeft - anchor.left);
    wrap.style.setProperty("left", relLeft + "px", "important");
    wrap.style.setProperty("right", "auto", "important");

    if (panelLeft < anchor.left) {
      wrap.classList.add("hpm-align-right");
    } else {
      wrap.classList.remove("hpm-align-right");
    }

    const panelHeight = panel.scrollHeight + 14;
    const below = Math.max(0, window.innerHeight - anchor.bottom - 12);
    const above = Math.max(0, anchor.top - 12);
    const opensUp = panelHeight > below && (above > below || below < 180);
    if (opensUp) wrap.classList.add("hpm-opens-up");

    const available = Math.max(90, Math.min(window.innerHeight - 20, (opensUp ? above : below) - 10));
    if (panel.scrollHeight > available) {
      panel.style.setProperty("max-height", available + "px", "important");
      panel.style.setProperty("overflow-y", "auto", "important");
      panel.classList.add("hpm-panel-scroll");
    }
  }

  // ---------------------------------------------------------------------------
  // Manager Class
  // ---------------------------------------------------------------------------
  class DSMonitorManager {
    constructor() {
      this.group = null;
      this.placeholder = null;
      this.drag = null;
      this.suppressClickUntil = 0;
      this.panelTimers = new Map();
      this.init();
    }

    init() {
      injectStyles();
      this.group = buildMonitorDOM();
      this.bindEvents();
      this.mount();
      this.fetchInitialStats();
      this.initWebSocketListeners();
      this.initExecutionListeners();
      this.renderRunHistory();
      this.updateLLMUI(state.llm);
      this.updateTimerUI();
      this.startHeartbeat();
      applyVisibility();

      window.addEventListener("resize", () => {
        if (this.group.classList.contains("is-floating")) {
          const r = this.group.getBoundingClientRect();
          this.group.style.left = clamp(r.left, 8, window.innerWidth - r.width - 8) + "px";
          this.group.style.top = clamp(r.top, 8, window.innerHeight - r.height - 8) + "px";
        }
        this.group.querySelectorAll(".hpm-metric").forEach(positionPanel);
      });
      window.addEventListener("scroll", () => {
        this.group.querySelectorAll(".hpm-metric").forEach(positionPanel);
      }, true);
    }

    bindEvents() {
      const grip = this.group.querySelector(".hpm-dock-grip");

      // Hover / focus panel handlers with smooth open/close delay
      this.group.querySelectorAll(".hpm-metric").forEach((metric) => {
        const wrap = metric.querySelector(".hpm-panel-wrap");

        const openPanel = () => {
          positionPanel(metric);
          clearTimeout(this.panelTimers.get(metric));
          const t = setTimeout(() => {
            positionPanel(metric);
            wrap?.classList.add("is-open");
          }, 60);
          this.panelTimers.set(metric, t);
        };

        const closePanel = () => {
          clearTimeout(this.panelTimers.get(metric));
          const t = setTimeout(() => {
            wrap?.classList.remove("is-open");
          }, 120);
          this.panelTimers.set(metric, t);
        };

        metric.addEventListener("pointerenter", openPanel);
        metric.addEventListener("pointerleave", closePanel);
        metric.addEventListener("focusin", openPanel);
        metric.addEventListener("focusout", (e) => {
          if (!metric.contains(e.relatedTarget)) closePanel();
        });
      });

      // Smooth, jitter-free dragging on window with RAF and zero layout-thrashing
      let rafId = null;
      let cachedDockArea = null;

      const getDockSnapBounds = () => {
        const bounds = { placeholder: null, bar: null };
        if (this.placeholder) {
          bounds.placeholder = this.placeholder.getBoundingClientRect();
        }
        const bar = this.getActionDock();
        if (bar) {
          bounds.bar = bar.getBoundingClientRect();
        }
        return bounds;
      };

      const checkDockOverlap = (rect, bounds) => {
        if (!bounds) bounds = getDockSnapBounds();
        if (bounds.placeholder) {
          const p = bounds.placeholder;
          if (rect.right > p.left && rect.left < p.right && rect.bottom > p.top && rect.top < p.bottom) {
            return true;
          }
        }
        if (bounds.bar) {
          const b = bounds.bar;
          const overlapX = Math.max(0, Math.min(rect.right, b.right) - Math.max(rect.left, b.left));
          const overlapY = Math.max(0, Math.min(rect.bottom, b.bottom) - Math.max(rect.top, b.top));
          if (overlapX >= Math.min(64, (rect.width || 200) * 0.2) && overlapY >= 14) {
            return true;
          }
        }
        return false;
      };

      const onMove = (e) => {
        if (!this.drag) return;
        const dist = Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY);
        if (dist < 4 && !this.drag.moved) return;
        this.drag.moved = true;
        this.drag.lastClientX = e.clientX;
        this.drag.lastClientY = e.clientY;

        if (!this.group.classList.contains("is-floating")) {
          this.undock();
          cachedDockArea = getDockSnapBounds();
        }

        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!this.drag || !this.drag.moved) return;

            this.group.classList.add("is-dragging");

            const left = clamp(this.drag.lastClientX - this.drag.offsetX, 8, window.innerWidth - this.drag.width - 8);
            const top = clamp(this.drag.lastClientY - this.drag.offsetY, 8, window.innerHeight - this.drag.height - 8);
            this.group.style.left = left + "px";
            this.group.style.top = top + "px";

            if (this.placeholder) {
              const r = { left, top, right: left + this.drag.width, bottom: top + this.drag.height, width: this.drag.width, height: this.drag.height };
              const isHot = checkDockOverlap(r, cachedDockArea);
              this.placeholder.classList.toggle("dock-hot", isHot);
            }
          });
        }
      };

      const onUp = (e) => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        if (!this.drag) return;
        const cur = this.drag;
        this.drag = null;

        if (cur.moved && this.group.classList.contains("is-floating")) {
          const left = clamp((cur.lastClientX || cur.startX) - cur.offsetX, 8, window.innerWidth - cur.width - 8);
          const top = clamp((cur.lastClientY || cur.startY) - cur.offsetY, 8, window.innerHeight - cur.height - 8);
          const rect = { left, top, right: left + cur.width, bottom: top + cur.height, width: cur.width, height: cur.height };

          if (checkDockOverlap(rect, cachedDockArea)) {
            this.dock();
          } else {
            this.group.classList.remove("is-dragging");
            // Edge snap applied only upon drop (within 18px of screen edges)
            const snap = 18;
            let finalLeft = rect.left, finalTop = rect.top;
            if (finalLeft < snap) finalLeft = 8;
            else if (window.innerWidth - rect.right < snap) finalLeft = window.innerWidth - rect.width - 8;
            if (finalTop < snap) finalTop = 8;
            else if (window.innerHeight - rect.bottom < snap) finalTop = window.innerHeight - rect.height - 8;

            this.group.style.left = clamp(finalLeft, 8, window.innerWidth - rect.width - 8) + "px";
            this.group.style.top = clamp(finalTop, 8, window.innerHeight - rect.height - 8) + "px";
            state.floatLeft = parseFloat(this.group.style.left);
            state.floatTop = parseFloat(this.group.style.top);
            saveState();
          }
        } else {
          this.group.classList.remove("is-dragging");
        }

        this.suppressClickUntil = cur.moved ? performance.now() + 350 : 0;
        cachedDockArea = null;
        this.group.querySelectorAll(".hpm-metric").forEach(positionPanel);
      };

      const startDrag = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = this.group.getBoundingClientRect();
        this.drag = {
          startX: e.clientX,
          startY: e.clientY,
          lastClientX: e.clientX,
          lastClientY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          width: rect.width,
          height: rect.height,
          moved: false,
        };

        cachedDockArea = getDockSnapBounds();

        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp, { passive: false });
        window.addEventListener("pointercancel", onUp, { passive: false });
      };

      grip.addEventListener("pointerdown", startDrag);

      // Also allow dragging anywhere on the floating bar background when floating
      this.group.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (!this.group.classList.contains("is-floating")) return;
        if (e.target.closest("button, .hpm-panel-wrap, input, select")) return;
        startDrag(e);
      });

      grip.addEventListener("click", (e) => {
        if (performance.now() < this.suppressClickUntil) {
          this.suppressClickUntil = 0;
          e.preventDefault();
          return;
        }
        this.toggleDock();
      });

      // Keyboard navigation
      grip.addEventListener("keydown", (e) => {
        if (this.group.classList.contains("is-floating") && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          const r = this.group.getBoundingClientRect();
          const step = e.shiftKey ? 24 : 8;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          this.group.style.left = clamp(r.left + dx, 8, window.innerWidth - r.width - 8) + "px";
          this.group.style.top = clamp(r.top + dy, 8, window.innerHeight - r.height - 8) + "px";
          state.floatLeft = parseFloat(this.group.style.left);
          state.floatTop = parseFloat(this.group.style.top);
          saveState();
          this.group.querySelectorAll(".hpm-metric").forEach(positionPanel);
        }
      });
    }

    overlapsDockArea(rect) {
      if (this.placeholder) {
        const p = this.placeholder.getBoundingClientRect();
        if (rect.right > p.left && rect.left < p.right && rect.bottom > p.top && rect.top < p.bottom) {
          return true;
        }
      }
      const bar = this.getActionDock();
      if (bar) {
        const b = bar.getBoundingClientRect();
        const overlapX = Math.max(0, Math.min(rect.right, b.right) - Math.max(rect.left, b.left));
        const overlapY = Math.max(0, Math.min(rect.bottom, b.bottom) - Math.max(rect.top, b.top));
        if (overlapX >= Math.min(64, (rect.width || 200) * 0.2) && overlapY >= 14) return true;
      }
      return false;
    }

    getActionDock() {
      return (
        app.menu?.settingsGroup?.element?.parentElement ||
        document.querySelector(".comfyui-menu") ||
        document.querySelector(".action-bar") ||
        document.querySelector(".comfyui-action-bar") ||
        document.querySelector(".top-bar-button-group") ||
        document.querySelector(".comfy-menu")
      );
    }

    getReminderAnchor() {
      return (
        document.querySelector(".ds-reminder-toolbar-group") ||
        document.getElementById("ds-reminder-toolbar-btn")?.closest(".ds-reminder-toolbar-group") ||
        document.getElementById("ds-reminder-toolbar-btn")
      );
    }

    mount() {
      const actionDock = this.getActionDock();
      if (!actionDock) {
        setTimeout(() => this.mount(), 150);
        return;
      }

      if (state.docked) {
        // Must be on the FAR LEFT of the action bar, before the reminder bell
        if (actionDock.firstChild !== this.group) {
          actionDock.prepend(this.group);
        }
        const reminder = this.getReminderAnchor();
        if (reminder && this.group.nextSibling !== reminder) {
          this.group.after(reminder);
        }
      } else {
        if (!this.placeholder) this.placeholder = this.makePlaceholder();
        if (actionDock.firstChild !== this.placeholder) {
          actionDock.prepend(this.placeholder);
        }
        if (!document.body.contains(this.group)) {
          document.body.appendChild(this.group);
        }
        this.group.classList.add("is-floating");
        this.group.style.position = "fixed";
        this.group.style.left = clamp(state.floatLeft, 8, window.innerWidth - 300) + "px";
        this.group.style.top = clamp(state.floatTop, 8, window.innerHeight - 50) + "px";
      }

      // Defensive observer to re-ensure placement on DOM changes
      if (!this._domObserver) {
        this._domObserver = new MutationObserver(() => {
          const dock = this.getActionDock();
          if (!dock) return;
          if (state.docked) {
            if (dock.firstChild !== this.group) {
              dock.prepend(this.group);
            }
            const rem = this.getReminderAnchor();
            if (rem && this.group.nextSibling !== rem) {
              this.group.after(rem);
            }
          } else {
            if (this.placeholder && dock.firstChild !== this.placeholder) {
              dock.prepend(this.placeholder);
            }
          }
        });
        this._domObserver.observe(document.body, { childList: true, subtree: true });
      }
    }

    makePlaceholder() {
      if (this.placeholder) return this.placeholder;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hpm-dock-placeholder";
      btn.textContent = "↧";
      btn.title = "Dock monitor back into the action bar";
      btn.setAttribute("aria-label", "Dock monitor back into the action bar");
      btn.addEventListener("click", () => this.dock());
      this.placeholder = btn;
      return btn;
    }

    dock() {
      const actionDock = this.getActionDock();
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.before(this.group);
        this.placeholder.remove();
        this.placeholder = null;
      } else if (actionDock) {
        actionDock.prepend(this.group);
      }

      const reminder = this.getReminderAnchor();
      if (reminder && this.group.nextSibling !== reminder) {
        this.group.after(reminder);
      }

      this.group.classList.remove("is-floating", "is-dragging");
      for (const p of ["position", "left", "top", "width", "zIndex", "margin"]) {
        this.group.style[p] = "";
      }
      state.docked = true;
      saveState();
    }

    undock() {
      if (this.group.classList.contains("is-floating")) return;
      const rect = this.group.getBoundingClientRect();
      const placeholder = this.makePlaceholder();
      this.group.before(placeholder);
      document.body.appendChild(this.group);
      this.group.classList.add("is-floating");
      this.group.style.position = "fixed";
      this.group.style.left = clamp(rect.left, 8, window.innerWidth - rect.width - 8) + "px";
      this.group.style.top = clamp(rect.top + 44, 8, window.innerHeight - rect.height - 8) + "px";
      state.docked = false;
      state.floatLeft = parseFloat(this.group.style.left);
      state.floatTop = parseFloat(this.group.style.top);
      saveState();
    }

    toggleDock() {
      if (state.docked) this.undock();
      else this.dock();
    }

    // -------------------------------------------------------------------------
    // Telemetry & Backend Fetching
    // -------------------------------------------------------------------------
    async fetchInitialStats() {
      try {
        const res = await fetch("/ds/hpm/stats", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.static) {
            state.hwStatic = { ...state.hwStatic, ...data.static };
            this.updateStaticUI();
          }
          if (data.hw) this.updateHardwareUI(data.hw);
          if (data.llm) this.updateLLMUI(data.llm);
        }
      } catch (_) {}
    }

    startHeartbeat() {
      setInterval(() => {
        if (!settings.enabled) return;
        fetch("/ds/hpm/ping", { method: "POST" }).catch(() => {});
      }, 6000);
    }

    getModelFromGraph() {
      try {
        if (!app?.graph?._nodes) return "";
        for (const n of app.graph._nodes) {
          if (!n) continue;
          if (n.type === "DS_AIPromptSensei" || n.comfyClass === "DS_AIPromptSensei") {
            const modWidget = n.widgets?.find(w => w.name === "model" || w.name === "builtin_model" || w.name === "model_name");
            if (modWidget && modWidget.value) {
              const val = String(modWidget.value).replace(/\.gguf$/i, "").split(/[/\\]/).pop();
              if (val) return val;
            }
            if (n._sstate?.built_in?.model) {
              const val = String(n._sstate.built_in.model).replace(/\.gguf$/i, "").split(/[/\\]/).pop();
              if (val) return val;
            }
          }
          if (n.type === "DS_ImageDescriber" || n.comfyClass === "DS_ImageDescriber") {
            const modWidget = n.widgets?.find(w => w.name === "model" || w.name === "model_name");
            if (modWidget && modWidget.value) {
              const val = String(modWidget.value).replace(/\.gguf$/i, "").split(/[/\\]/).pop();
              if (val) return val;
            }
          }
        }
      } catch (_) {}
      return "";
    }

    isCheckpointContinuation() {
      if (window._dsCheckpointContinuing) return true;
      if (app?.graph) {
        const all = app.graph._nodes || app.graph.nodes || [];
        for (const n of all) {
          if (n?._dsICSubmitMode === "continue" || n?._dsICActiveMode === "continue") {
            return true;
          }
        }
      }
      return false;
    }

    isCheckpointActivePause() {
      return Boolean(state.timer.checkpointPausePending || window._dsCheckpointActivePause);
    }

    animateRollback(fromSec, targetSec, onComplete) {
      if (this._rollbackRaf) {
        cancelAnimationFrame(this._rollbackRaf);
        this._rollbackRaf = null;
      }
      const liveTimer = this.group?.querySelector(".hpm-live-timer");
      const dot = this.group?.querySelector(".hpm-tiny-dot");
      if (liveTimer) liveTimer.classList.add("hpm-timer-rewind");
      if (dot) dot.classList.add("hpm-dot-rewind");

      const delta = Math.abs(fromSec - targetSec);
      const durationMs = Math.min(650, Math.max(320, delta * 12));
      const startT = performance.now();

      const tick = (now) => {
        const progress = Math.min(1, (now - startT) / durationMs);
        const ease = 1 - Math.pow(1 - progress, 3);
        const curSec = Math.round(fromSec - (fromSec - targetSec) * ease);
        if (liveTimer) liveTimer.textContent = formatMMSS(curSec);

        if (progress < 1) {
          this._rollbackRaf = requestAnimationFrame(tick);
        } else {
          this._rollbackRaf = null;
          if (liveTimer) {
            liveTimer.classList.remove("hpm-timer-rewind");
            liveTimer.textContent = formatMMSS(targetSec);
          }
          if (dot) dot.classList.remove("hpm-dot-rewind");
          if (typeof onComplete === "function") onComplete();
        }
      };

      this._rollbackRaf = requestAnimationFrame(tick);
    }

    initWebSocketListeners() {
      api.addEventListener("ds_hpm.telemetry", (e) => {
        const payload = e.detail;
        if (!payload) return;
        if (payload.hw) this.updateHardwareUI(payload.hw);
        if (payload.llm) {
          // Never let an empty or 0-metric background heartbeat overwrite active or completed LLM telemetry
          const hasData = payload.llm.status === "active" || (payload.llm.tokens > 0 && payload.llm.speed_tk_s > 0);
          if (hasData) {
            this.updateLLMUI(payload.llm);
          }
        }
      });

      api.addEventListener("ds_hpm.llm", (e) => {
        if (e.detail) this.updateLLMUI(e.detail);
      });

      // Hook directly into AI Prompt Sensei live progress events
      api.addEventListener("ds_sensei_progress", (e) => {
        const d = e?.detail;
        if (!d) return;

        const tokens = Number(d.tokens) || 0;
        const speed = Number(d.speed) || 0;
        const elapsed = Number(d.elapsed) || 0;
        const stage = d.stage || "";
        const isGenerating = stage === "generating" || stage === "loading" || stage === "loaded";
        const isCompleted = stage === "completed" || stage === "finished";

        if (tokens > 0 || speed > 0 || isGenerating || isCompleted) {
          let mod = d.model;
          if (!mod || mod === "AI Prompt Sensei" || mod === "Image Describer") {
            mod = (state.llm.model_name && state.llm.model_name !== "AI Prompt Sensei" && state.llm.model_name !== "Image Describer")
              ? state.llm.model_name
              : (this.getModelFromGraph() || "Local GGUF");
          }
          this.updateLLMUI({
            status: isGenerating ? "active" : "idle",
            model_name: mod,
            model_meta: "GGUF · GPU offload · local inference",
            speed_tk_s: speed,
            tokens: tokens,
            elapsed_sec: elapsed,
            backend: "AI Prompt Sensei",
          });
        }
      });

      // Hook into Image Describer progress events
      api.addEventListener("ds_image_describer_progress", (e) => {
        const d = e?.detail;
        if (!d) return;
        const tokens = Number(d.tokens) || 0;
        const speed = Number(d.speed) || 0;
        const elapsed = Number(d.elapsed) || 0;
        if (tokens > 0 || speed > 0) {
          let mod = d.model;
          if (!mod || mod === "Image Describer" || mod === "AI Prompt Sensei") {
            mod = (state.llm.model_name && state.llm.model_name !== "AI Prompt Sensei" && state.llm.model_name !== "Image Describer")
              ? state.llm.model_name
              : (this.getModelFromGraph() || "Local Vision Model");
          }
          this.updateLLMUI({
            status: d.stage === "completed" ? "idle" : "active",
            model_name: mod,
            speed_tk_s: speed,
            tokens: tokens,
            elapsed_sec: elapsed,
            backend: "Image Describer",
          });
        }
      });
    }

    // -------------------------------------------------------------------------
    // Execution & Queue-aware Timer
    // -------------------------------------------------------------------------
    initExecutionListeners() {
      // Listen for custom checkpoint continue event dispatched from ds_image_checkpoint.js
      window.addEventListener("ds_checkpoint_continue", () => {
        window._dsCheckpointContinuing = true;
        window._dsCheckpointActivePause = false;
        state.timer.checkpointPausePending = false;
      });

      api.addEventListener("execution_start", (e) => {
        const promptId = e.detail?.prompt_id;
        if (!promptId) return;

        const isContinuing = this.isCheckpointContinuation();

        if (isContinuing) {
          // Checkpoint continuation:
          // Resume from checkpointSplitMs!
          const baseMs = (state.timer.hasCheckpointSplit && state.timer.checkpointSplitMs > 0)
            ? state.timer.checkpointSplitMs
            : 0;
          const targetSec = Math.floor(baseMs / 1000);
          const fromSec = state.timer.elapsedSec || targetSec;

          state.timer.isContinuation = true;
          state.timer.baseCheckpointMs = baseMs;
          state.timer.continuationStartTime = performance.now();
          state.timer.activePromptId = promptId;
          state.timer.queueNumber = promptId.slice(-4);
          state.timer.status = "running";
          state.timer.isPaused = false;
          state.timer.pauseStart = 0;
          state.timer.totalPausedMs = 0;
          state.timer.checkpointPausePending = false;
          window._dsCheckpointContinuing = false;
          window._dsCheckpointActivePause = false;

          const startCounting = () => {
            state.timer.continuationStartTime = performance.now();
            state.timer.elapsedSec = targetSec;
            this.startTimerTicker();
            this.updateTimerUI();
          };

          if (fromSec > targetSec) {
            // Animate rolling back time from previous completed run down to checkpoint split!
            this.animateRollback(fromSec, targetSec, startCounting);
          } else {
            startCounting();
          }
          return;
        }

        // Standard fresh workflow queue execution:
        if (this._rollbackRaf) {
          cancelAnimationFrame(this._rollbackRaf);
          this._rollbackRaf = null;
        }
        const liveTimer = this.group?.querySelector(".hpm-live-timer");
        if (liveTimer) liveTimer.classList.remove("hpm-timer-rewind");
        const dot = this.group?.querySelector(".hpm-tiny-dot");
        if (dot) dot.classList.remove("hpm-dot-rewind");

        state.timer.isContinuation = false;
        state.timer.baseCheckpointMs = 0;
        state.timer.activePromptId = promptId;
        state.timer.status = "running";
        state.timer.startTime = performance.now();
        state.timer.totalPausedMs = 0;
        state.timer.isPaused = false;
        state.timer.pauseStart = 0;
        state.timer.lastSegmentEnd = 0;
        state.timer.executedNodesCount = 0;
        state.timer.queueNumber = promptId.slice(-4);
        state.timer.checkpointSplitMs = 0;
        state.timer.hasCheckpointSplit = false;
        state.timer.checkpointPausePending = false;

        this.startTimerTicker();
        this.updateTimerUI();
      });

      api.addEventListener("executing", (e) => {
        let node = null;
        let promptId = null;

        if (e.detail === null || e.detail === undefined) {
          node = null;
        } else if (typeof e.detail === "object") {
          node = e.detail.node !== undefined ? e.detail.node : null;
          promptId = e.detail.prompt_id;
        } else {
          node = e.detail;
        }

        if (promptId && !state.timer.activePromptId) {
          state.timer.activePromptId = promptId;
          state.timer.queueNumber = promptId.slice(-4);
        }

        if (node !== null && node !== undefined) {
          state.timer.executedNodesCount++;
          if (state.timer.status !== "running") {
            state.timer.status = "running";
            if (!state.timer.startTime) state.timer.startTime = performance.now();
            this.startTimerTicker();
            this.updateTimerUI();
          }
        } else {
          // node === null is ComfyUI's completion signal for the current prompt.
          if (state.timer.checkpointPausePending) {
            this.pauseTimerAtCheckpoint();
          } else if (state.timer.status === "running") {
            this.finishRun(true);
          }
        }

        if (state.timer.isPaused && !state.timer.checkpointPausePending) {
          state.timer.totalPausedMs += performance.now() - state.timer.pauseStart;
          state.timer.isPaused = false;
        }
      });

      api.addEventListener("executed", (e) => {
        state.timer.executedNodesCount++;

        // Detect DS Image Checkpoint execution
        const d = e.detail;
        const frames = d?.output?.ds_image_checkpoint;
        if (frames && frames.length > 0) {
          const mode = frames[0].mode; // "pause" | "pass" | "continue"
          const now = performance.now();

          if (mode === "pause") {
            // Reached checkpoint in pause mode! Upstream done!
            const netMs = state.timer.startTime > 0
              ? Math.max(0, now - state.timer.startTime - state.timer.totalPausedMs)
              : (state.timer.elapsedSec * 1000);
            state.timer.checkpointSplitMs = netMs;
            state.timer.hasCheckpointSplit = true;
            state.timer.checkpointPausePending = true;
            state.timer.checkpointNodeId = d.node;
            window._dsCheckpointActivePause = true;
            saveState();
          } else if (mode === "pass") {
            // Reached checkpoint in pass mode! Passing through downstream!
            const netMs = state.timer.startTime > 0
              ? Math.max(0, now - state.timer.startTime - state.timer.totalPausedMs)
              : (state.timer.elapsedSec * 1000);
            state.timer.checkpointSplitMs = netMs;
            state.timer.hasCheckpointSplit = true;
            state.timer.checkpointPausePending = false;
            state.timer.checkpointNodeId = d.node;
            window._dsCheckpointActivePause = false;
            saveState();
          } else if (mode === "continue") {
            // Reached checkpoint during a continuation prompt!
            state.timer.checkpointPausePending = false;
            window._dsCheckpointActivePause = false;
          }
        }

        if (state.timer.status !== "running" && state.timer.status !== "paused") {
          state.timer.status = "running";
          if (!state.timer.startTime) state.timer.startTime = performance.now();
          this.startTimerTicker();
          this.updateTimerUI();
        }
      });

      api.addEventListener("status", (e) => {
        const queueRemaining = e.detail?.status?.exec_info?.queue_remaining;
        if (queueRemaining === 0) {
          if (state.timer.checkpointPausePending) {
            this.pauseTimerAtCheckpoint();
          } else if (state.timer.status === "running") {
            this.finishRun(true);
          }
        }
      });

      api.addEventListener("ds_image_describer_status", (e) => {
        const st = String(e.detail?.status || "");
        if (st.includes("Paused") || st.includes("waiting")) {
          if (!state.timer.isPaused) {
            state.timer.isPaused = true;
            state.timer.pauseStart = performance.now();
          }
        } else if (st.includes("Resumed") || st.includes("Done")) {
          if (state.timer.isPaused) {
            state.timer.totalPausedMs += performance.now() - state.timer.pauseStart;
            state.timer.isPaused = false;
          }
        }
      });

      api.addEventListener("execution_success", (e) => {
        const promptId = e.detail?.prompt_id;
        if (promptId && state.timer.activePromptId && promptId !== state.timer.activePromptId) return;
        if (state.timer.checkpointPausePending) {
          this.pauseTimerAtCheckpoint();
        } else {
          this.finishRun(true);
        }
      });

      api.addEventListener("execution_error", () => this.finishRun(false));
      api.addEventListener("execution_interrupted", () => this.finishRun(false));
    }

    pauseTimerAtCheckpoint() {
      if (this._rollbackRaf) {
        cancelAnimationFrame(this._rollbackRaf);
        this._rollbackRaf = null;
      }
      if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
      }
      state.timer.status = "paused";
      state.timer.isPaused = true;
      state.timer.checkpointPausePending = false;
      const splitSec = Math.floor((state.timer.checkpointSplitMs || 0) / 1000);
      if (splitSec > 0) state.timer.elapsedSec = splitSec;
      if (!state.timer.pauseStart) state.timer.pauseStart = performance.now();
      state.timer.lastSegmentEnd = performance.now();
      this.updateTimerUI();
    }

    startTimerTicker() {
      if (state.timer.intervalId) clearInterval(state.timer.intervalId);
      state.timer.intervalId = setInterval(() => {
        if (state.timer.status !== "running") return;
        if (this._rollbackRaf) return;
        const now = performance.now();
        const currentPause = state.timer.isPaused ? (now - state.timer.pauseStart) : 0;

        let netMs = 0;
        if (state.timer.isContinuation) {
          const downstreamNetMs = Math.max(0, now - state.timer.continuationStartTime - state.timer.totalPausedMs - currentPause);
          netMs = (state.timer.baseCheckpointMs || 0) + downstreamNetMs;
        } else {
          netMs = Math.max(0, now - state.timer.startTime - state.timer.totalPausedMs - currentPause);
        }
        state.timer.elapsedSec = Math.floor(netMs / 1000);
        this.updateTimerUI();
      }, 500);
    }

    finishRun(isSuccess) {
      if (this._rollbackRaf) {
        cancelAnimationFrame(this._rollbackRaf);
        this._rollbackRaf = null;
      }
      if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
      }
      if (state.timer.isPaused) {
        state.timer.totalPausedMs += performance.now() - state.timer.pauseStart;
        state.timer.isPaused = false;
        state.timer.pauseStart = 0;
      }
      state.timer.checkpointPausePending = false;
      window._dsCheckpointActivePause = false;
      window._dsCheckpointContinuing = false;

      let netMs = 0;
      if (state.timer.isContinuation) {
        const downstreamNetMs = Math.max(0, performance.now() - state.timer.continuationStartTime - state.timer.totalPausedMs);
        netMs = (state.timer.baseCheckpointMs || 0) + downstreamNetMs;
      } else {
        netMs = Math.max(0, performance.now() - state.timer.startTime - state.timer.totalPausedMs);
      }

      const finalSec = Math.max(1, state.timer.elapsedSec || Math.round(netMs / 1000));
      state.timer.elapsedSec = finalSec;
      state.timer.status = "idle";
      state.timer.isContinuation = false;
      state.timer.lastSegmentEnd = performance.now();
      this.updateTimerUI();

      if (isSuccess && state.timer.executedNodesCount > 0 && finalSec > 0) {
        const promptId = state.timer.activePromptId || `run-${Date.now().toString(36)}`;
        state.timer.lastCompletedRun = {
          promptId: promptId,
          durationSec: finalSec,
          finishTime: performance.now(),
        };

        const now = new Date();
        const dateStr = `Today · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        state.runHistory.unshift({
          promptId: promptId,
          dateStr: dateStr,
          durationSec: finalSec,
          durationStr: formatMMSS(finalSec),
        });
        if (state.runHistory.length > 10) state.runHistory = state.runHistory.slice(0, 10);
        saveRunHistory();
        this.renderRunHistory();
      }
    }

    // -------------------------------------------------------------------------
    // UI Renderers
    // -------------------------------------------------------------------------
    updateStaticUI() {
      const s = state.hwStatic;
      const coresEl = this.group.querySelector("#hpm-cpu-cores");
      if (coresEl) {
        coresEl.textContent = `CPU · ${s.cpu_physical_cores} cores / ${s.cpu_logical_cores} threads`;
      }
      const gpuNameEl = this.group.querySelector("#hpm-gpu-name");
      if (gpuNameEl) {
        gpuNameEl.textContent = `GPU · ${s.gpu_name || "NVIDIA GPU"}`;
      }
      const hwSub = this.group.querySelector("#hpm-hw-sub");
      if (hwSub) {
        hwSub.textContent = `Current load · ${s.cpu_model || "Local machine"}`;
      }
    }

    updateHardwareUI(hw) {
      state.hwDynamic = { ...state.hwDynamic, ...hw };
      const d = state.hwDynamic;
      const s = state.hwStatic;

      // Integer percentages to guarantee fit and match PRD specification
      const cpuInt = Math.round(d.cpu || 0);
      const ramInt = Math.round(d.ram || 0);
      const gpuInt = (d.gpu_available && d.gpu != null) ? Math.round(d.gpu) : null;
      const vramPctInt = Math.round(d.vram_pct || 0);

      // Row live numbers
      const cpuVal = this.group.querySelector('.hpm-hw-reading[data-kind="cpu"] .hpm-live-value');
      if (cpuVal) {
        cpuVal.textContent = cpuInt + "%";
        cpuVal.className = "hpm-live-value " + getLevelClass(cpuInt, "cpu");
      }

      const ramVal = this.group.querySelector('.hpm-hw-reading[data-kind="ram"] .hpm-live-value');
      if (ramVal) {
        ramVal.textContent = ramInt + "%";
        ramVal.className = "hpm-live-value " + getLevelClass(ramInt, "ram");
      }

      const gpuVal = this.group.querySelector('.hpm-hw-reading[data-kind="gpu"] .hpm-live-value');
      if (gpuVal) {
        if (d.gpu_available && gpuInt != null) {
          gpuVal.textContent = gpuInt + "%";
          gpuVal.className = "hpm-live-value " + getLevelClass(gpuInt, "gpu");
        } else {
          gpuVal.textContent = "n/a";
          gpuVal.className = "hpm-live-value";
          gpuVal.style.color = "var(--hpm-muted)";
        }
      }

      const vramVal = this.group.querySelector('.hpm-hw-reading[data-kind="vram"] .hpm-live-value');
      if (vramVal) {
        if (d.gpu_available && d.vram_used_gb != null) {
          vramVal.textContent = d.vram_used_gb.toFixed(1) + "G";
          vramVal.className = "hpm-live-value " + getLevelClass(vramPctInt, "vram");
        } else {
          vramVal.textContent = "n/a";
          vramVal.className = "hpm-live-value";
          vramVal.style.color = "var(--hpm-muted)";
        }
      }

      // Panel: CPU
      const cpuRes = this.group.querySelector('[data-hw-res="cpu"]');
      if (cpuRes) {
        const valB = cpuRes.querySelector(".hpm-resource-values b");
        if (valB) valB.textContent = cpuInt + "% used";
        const fill = cpuRes.querySelector(".hpm-fill");
        if (fill) {
          fill.style.setProperty("--w", cpuInt + "%");
          fill.style.setProperty("--c", getFillColor(cpuInt, "cpu"));
        }
        const avail = cpuRes.querySelector("#hpm-cpu-avail");
        if (avail) avail.textContent = Math.max(0, 100 - cpuInt) + "% available";
      }

      // Panel: RAM
      const ramRes = this.group.querySelector('[data-hw-res="ram"]');
      if (ramRes) {
        const valB = ramRes.querySelector("#hpm-ram-val");
        const total = d.ram_total_gb || s.ram_total_gb || 16;
        if (valB) valB.textContent = `${d.ram_used_gb.toFixed(1)} / ${total.toFixed(1)} GB`;
        const fill = ramRes.querySelector(".hpm-fill");
        if (fill) {
          fill.style.setProperty("--w", ramInt + "%");
          fill.style.setProperty("--c", getFillColor(ramInt, "ram"));
        }
        const usedEl = ramRes.querySelector("#hpm-ram-used");
        if (usedEl) usedEl.textContent = `${d.ram_used_gb.toFixed(1)} GB used`;
        const freeEl = ramRes.querySelector("#hpm-ram-free");
        if (freeEl) freeEl.textContent = `${d.ram_free_gb.toFixed(1)} GB free`;
      }

      // Panel: GPU
      const gpuRes = this.group.querySelector('[data-hw-res="gpu"]');
      if (gpuRes) {
        const valB = gpuRes.querySelector("#hpm-gpu-val");
        const fill = gpuRes.querySelector(".hpm-fill");
        if (d.gpu_available && gpuInt != null) {
          if (valB) valB.textContent = gpuInt + "% load";
          if (fill) {
            fill.style.setProperty("--w", gpuInt + "%");
            fill.style.setProperty("--c", getFillColor(gpuInt, "gpu"));
          }
          const stats = gpuRes.querySelector("#hpm-gpu-stats");
          if (stats) stats.textContent = `${d.gpu_clock || "--"} MHz · ${d.gpu_temp || "--"} °C`;
          const headroom = gpuRes.querySelector("#hpm-gpu-headroom");
          if (headroom) headroom.textContent = Math.max(0, 100 - gpuInt) + "% headroom";
        } else {
          if (valB) valB.textContent = "Unavailable";
          if (fill) fill.style.setProperty("--w", "0%");
        }
      }

      // Panel: VRAM
      const vramRes = this.group.querySelector('[data-hw-res="vram"]');
      if (vramRes) {
        const valB = vramRes.querySelector("#hpm-vram-val");
        const total = d.vram_total_gb || s.vram_total_gb || 0;
        const fill = vramRes.querySelector(".hpm-fill");
        if (d.gpu_available && d.vram_used_gb != null) {
          if (valB) valB.textContent = `${d.vram_used_gb.toFixed(1)} / ${total.toFixed(1)} GB`;
          if (fill) {
            fill.style.setProperty("--w", vramPctInt + "%");
            fill.style.setProperty("--c", getFillColor(vramPctInt, "vram"));
          }
          const alloc = vramRes.querySelector("#hpm-vram-alloc");
          if (alloc) alloc.textContent = `${d.vram_used_gb.toFixed(1)} GB allocated`;
          const free = vramRes.querySelector("#hpm-vram-free");
          if (free) free.textContent = `${(d.vram_free_gb ?? Math.max(0, total - d.vram_used_gb)).toFixed(1)} GB free`;
        } else {
          if (valB) valB.textContent = "Unavailable";
          if (fill) fill.style.setProperty("--w", "0%");
        }
      }

      // Stat boxes: Power & Temp
      const powerEl = this.group.querySelector("#hpm-stat-power");
      if (powerEl) powerEl.textContent = d.gpu_power != null ? `${d.gpu_power} W` : "-- W";

      const tempEl = this.group.querySelector("#hpm-stat-temp");
      const tempMsg = this.group.querySelector("#hpm-stat-temp-msg");
      if (tempEl) tempEl.textContent = d.gpu_temp != null ? `${d.gpu_temp} °C` : "-- °C";
      if (tempMsg && d.gpu_temp != null) {
        tempMsg.textContent = d.gpu_temp >= 83 ? "Near thermal limit" : "Below thermal limit";
      }

      // VRAM Warning footer
      const warnFoot = this.group.querySelector("#hpm-vram-warn-foot");
      const warnAvailBold = this.group.querySelector("#hpm-vram-avail-bold");
      if (warnFoot && warnAvailBold) {
        if (vramPctInt >= HW_THRESHOLDS.vram.warn && d.vram_free_gb != null) {
          warnFoot.style.display = "block";
          warnAvailBold.textContent = `${d.vram_free_gb.toFixed(1)} GB available`;
        } else {
          warnFoot.style.display = "none";
        }
      }
    }

    updateLLMUI(llm) {
      if (!llm || typeof llm !== "object") return;

      const prev = state.llm;
      const isIncomingActive = llm.status === "active";
      const hasIncomingMetrics = (Number(llm.tokens) > 0 || Number(llm.speed_tk_s) > 0);

      let merged = { ...prev };

      if (isIncomingActive) {
        merged.status = "active";
        if (llm.model_name && llm.model_name !== "AI Prompt Sensei" && llm.model_name !== "Image Describer") {
          merged.model_name = llm.model_name;
        }
        if (llm.model_meta) merged.model_meta = llm.model_meta;
        if (llm.speed_tk_s !== undefined) merged.speed_tk_s = Number(llm.speed_tk_s) || 0;
        if (llm.tokens !== undefined) merged.tokens = Number(llm.tokens) || 0;
        if (llm.elapsed_sec !== undefined) merged.elapsed_sec = Number(llm.elapsed_sec) || 0;
        if (llm.ttft_sec !== undefined) merged.ttft_sec = llm.ttft_sec;
        if (llm.backend) merged.backend = llm.backend;
        if (Array.isArray(llm.sparkline) && llm.sparkline.length) merged.sparkline = llm.sparkline;
        if (llm.avg_tk_s !== undefined) merged.avg_tk_s = Number(llm.avg_tk_s) || 0;
      } else {
        merged.status = "idle";
        if (llm.model_name && llm.model_name !== "AI Prompt Sensei" && llm.model_name !== "Image Describer") {
          merged.model_name = llm.model_name;
        }
        if (llm.backend) merged.backend = llm.backend;
        if (hasIncomingMetrics) {
          if (Number(llm.speed_tk_s) > 0) merged.speed_tk_s = Number(llm.speed_tk_s);
          if (Number(llm.tokens) > 0) merged.tokens = Number(llm.tokens);
          if (Number(llm.elapsed_sec) > 0) merged.elapsed_sec = Number(llm.elapsed_sec);
          if (llm.ttft_sec != null) merged.ttft_sec = llm.ttft_sec;
          if (Array.isArray(llm.sparkline) && llm.sparkline.length) merged.sparkline = llm.sparkline;
          if (Number(llm.avg_tk_s) > 0) merged.avg_tk_s = Number(llm.avg_tk_s);
        }
        // When incoming has no metrics, keep previous metrics visible (dimmed)
      }

      state.llm = merged;
      saveLLMState();

      const l = state.llm;
      const isIdle = l.status !== "active";

      // Row live values: keep last completed metrics visible, never wipe to "--"
      const speedEl = this.group.querySelector(".hpm-live-speed");
      if (speedEl) {
        speedEl.textContent = l.speed_tk_s > 0 ? l.speed_tk_s.toFixed(1) : "--";
        speedEl.classList.toggle("is-idle-val", isIdle);
      }

      const tokEl = this.group.querySelector(".hpm-live-tokens");
      if (tokEl) {
        if (l.tokens >= 1000) tokEl.textContent = (l.tokens / 1000).toFixed(1) + "k";
        else if (l.tokens > 0) tokEl.textContent = String(l.tokens);
        else tokEl.textContent = "--";
        tokEl.classList.toggle("is-idle-val", isIdle);
      }

      // Panel
      const pill = this.group.querySelector("#hpm-llm-pill");
      if (pill) {
        pill.textContent = l.status === "active" ? "Active" : "Idle";
        pill.classList.toggle("is-idle", l.status !== "active");
      }

      const modelName = this.group.querySelector("#hpm-llm-model-name");
      if (modelName) {
        const resolvedName = (l.model_name && l.model_name !== "AI Prompt Sensei" && l.model_name !== "Image Describer")
          ? l.model_name
          : (this.getModelFromGraph() || "None loaded");
        modelName.textContent = resolvedName;
      }

      const modelMeta = this.group.querySelector("#hpm-llm-model-meta");
      if (modelMeta) modelMeta.textContent = l.model_meta || "Local inference";

      const speedStat = this.group.querySelector("#hpm-llm-speed");
      if (speedStat) speedStat.innerHTML = `${l.speed_tk_s > 0 ? l.speed_tk_s.toFixed(1) : "--"} <span style="font-size:10px;color:var(--hpm-muted)">tk/s</span>`;

      const tokensStat = this.group.querySelector("#hpm-llm-tokens");
      if (tokensStat) tokensStat.textContent = l.tokens > 0 ? l.tokens.toLocaleString() : "--";

      const ttftStat = this.group.querySelector("#hpm-llm-ttft");
      if (ttftStat) ttftStat.textContent = l.ttft_sec != null ? `${l.ttft_sec.toFixed(2)} s` : "-- s";

      const elapsedStat = this.group.querySelector("#hpm-llm-elapsed");
      if (elapsedStat) elapsedStat.textContent = formatMMSS(l.elapsed_sec);

      const avgSpeed = this.group.querySelector("#hpm-llm-avg-speed");
      if (avgSpeed) avgSpeed.textContent = `${l.avg_tk_s > 0 ? l.avg_tk_s.toFixed(1) : (l.speed_tk_s > 0 ? l.speed_tk_s.toFixed(1) : "--")} tk/s avg.`;

      const backendName = this.group.querySelector("#hpm-llm-backend-name");
      if (backendName) backendName.textContent = l.backend || "AI Prompt Sensei";

      // Render Sparkline
      const spark = this.group.querySelector("#hpm-llm-spark");
      if (spark) {
        if (!Array.isArray(l.sparkline) || l.sparkline.length === 0) {
          if (l.speed_tk_s > 0) l.sparkline = [l.speed_tk_s];
        }
        if (Array.isArray(l.sparkline) && l.sparkline.length > 0) {
          spark.innerHTML = "";
          const maxVal = Math.max(10, ...l.sparkline);
          for (const val of l.sparkline) {
            const bar = document.createElement("i");
            const pct = Math.max(8, Math.min(100, Math.round((val / maxVal) * 100)));
            bar.style.height = pct + "%";
            spark.appendChild(bar);
          }
        }
      }
    }

    updateTimerUI() {
      const t = state.timer;
      const timerLive = this.group.querySelector(".hpm-live-timer");
      if (timerLive && !this._rollbackRaf) timerLive.textContent = formatMMSS(t.elapsedSec);

      const dot = this.group.querySelector(".hpm-tiny-dot");
      if (dot && !this._rollbackRaf) {
        dot.classList.toggle("is-active", t.status === "running");
        dot.classList.toggle("is-paused", t.status === "paused" || t.isPaused);
      }

      const pill = this.group.querySelector("#hpm-timer-pill");
      if (pill) {
        pill.textContent = t.status === "running" ? (t.isPaused ? "Paused" : "Running") : (t.status === "paused" ? "Paused" : "Idle");
        pill.classList.toggle("is-idle", t.status !== "running" && t.status !== "paused");
        pill.classList.toggle("is-paused", t.status === "paused" || t.isPaused);
      }

      const queueEl = this.group.querySelector("#hpm-timer-queue");
      if (queueEl) queueEl.textContent = (t.status === "running" || t.status === "paused") ? `#${t.queueNumber}` : "--";

      const elapsedSub = this.group.querySelector("#hpm-timer-elapsed-sub");
      if (elapsedSub) elapsedSub.textContent = `Elapsed ${formatMMSS(t.elapsedSec)}`;
    }

    renderRunHistory() {
      const list = this.group.querySelector("#hpm-run-list");
      if (!list) return;
      list.innerHTML = "";

      if (state.runHistory.length === 0) {
        list.innerHTML = `<div style="font-size:10px;color:var(--hpm-muted);text-align:center;padding:8px;">No completed runs yet</div>`;
        const avgEl = this.group.querySelector("#hpm-timer-avg");
        if (avgEl) avgEl.textContent = "00:00";
        return;
      }

      let bestIdx = 0;
      let minDur = Infinity;
      let sumDur = 0;
      state.runHistory.forEach((r, idx) => {
        sumDur += r.durationSec;
        if (r.durationSec < minDur) {
          minDur = r.durationSec;
          bestIdx = idx;
        }
      });

      const avgSec = Math.round(sumDur / state.runHistory.length);
      const avgEl = this.group.querySelector("#hpm-timer-avg");
      if (avgEl) avgEl.textContent = formatMMSS(avgSec);

      state.runHistory.forEach((r, idx) => {
        const row = document.createElement("div");
        const isBest = idx === bestIdx;
        row.className = "hpm-run-row" + (isBest ? " hpm-best" : "");
        row.innerHTML = `
          <span class="hpm-num">${String(idx + 1).padStart(2, "0")}</span>
          <span class="hpm-run-date">${r.dateStr}${isBest ? ' <span class="hpm-best-tag">Best</span>' : ""}</span>
          <span class="hpm-duration">${r.durationStr}</span>
        `;
        list.appendChild(row);
      });
    }
  }

  function getFillColor(pct, kind) {
    const th = HW_THRESHOLDS[kind];
    if (!th) return "var(--hpm-teal)";
    if (pct >= th.danger) return "var(--hpm-red)";
    if (pct >= th.warn) return "var(--hpm-amber)";
    return kind === "gpu" ? "#70a8ff" : "var(--hpm-green)";
  }

  function formatMMSS(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function applyVisibility() {
    const group = document.querySelector(".hpm-monitor-group");
    if (!group) return;
    group.style.display = settings.enabled ? "inline-flex" : "none";

    const hw = group.querySelector(".hpm-hw");
    const d1 = group.querySelector(".hpm-div-1");
    if (hw) hw.style.display = settings.showHardware ? "flex" : "none";
    if (d1) d1.style.display = settings.showHardware && (settings.showLLM || settings.showTimer) ? "block" : "none";

    const llm = group.querySelector(".hpm-llm");
    const d2 = group.querySelector(".hpm-div-2");
    if (llm) llm.style.display = settings.showLLM ? "flex" : "none";
    if (d2) d2.style.display = settings.showLLM && settings.showTimer ? "block" : "none";

    const tm = group.querySelector(".hpm-timer");
    if (tm) tm.style.display = settings.showTimer ? "flex" : "none";
  }

  // ---------------------------------------------------------------------------
  // Register with ComfyUI Extension Framework
  // ---------------------------------------------------------------------------
  app.registerExtension({
    name: "DeathshotArsenal.HardwarePerformanceMonitor",
    async setup() {
      const mgr = new DSMonitorManager();

      // Register ComfyUI Settings
      if (app.ui?.settings?.addSetting) {
        app.ui.settings.addSetting({
          id: "DS.HPM.Enable",
          name: "DS Hardware Monitor: Enable Strip",
          type: "boolean",
          defaultValue: settings.enabled,
          onChange: (v) => {
            settings.enabled = Boolean(v);
            saveSettings();
          },
        });
        app.ui.settings.addSetting({
          id: "DS.HPM.ShowHW",
          name: "DS Hardware Monitor: Show Hardware Section",
          type: "boolean",
          defaultValue: settings.showHardware,
          onChange: (v) => {
            settings.showHardware = Boolean(v);
            saveSettings();
          },
        });
        app.ui.settings.addSetting({
          id: "DS.HPM.ShowLLM",
          name: "DS Hardware Monitor: Show LLM Section",
          type: "boolean",
          defaultValue: settings.showLLM,
          onChange: (v) => {
            settings.showLLM = Boolean(v);
            saveSettings();
          },
        });
        app.ui.settings.addSetting({
          id: "DS.HPM.ShowTimer",
          name: "DS Hardware Monitor: Show Timer Section",
          type: "boolean",
          defaultValue: settings.showTimer,
          onChange: (v) => {
            settings.showTimer = Boolean(v);
            saveSettings();
          },
        });
        app.ui.settings.addSetting({
          id: "DS.HPM.GPUIndex",
          name: "DS Hardware Monitor: GPU Index",
          type: "number",
          defaultValue: settings.gpuIndex,
          onChange: (v) => {
            settings.gpuIndex = Number(v) || 0;
            saveSettings();
          },
        });
      }
    },
  });
})();
