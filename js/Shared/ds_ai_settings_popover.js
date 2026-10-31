/**
 * Deathshot Arsenal — Centralized AI Settings Popover
 * Tabs: [ LM Studio (opt-in) | Built In | Settings (supplied by the node) ]
 * Strictly adheres to DeathshotArsenal UIElements (Toggle, Spinbox, Dropdown, Button)
 * and DS CSS design tokens.
 */

import {
  Button,
  Dropdown,
  Input,
  InputRow,
  Spinbox,
  DSIconMarkup,
} from "../UIElements/index.js";

let _activeAIPopover = null;
let _cachedHW = null;
let _popoverRO = null;

function ensureStyles() {
  if (document.getElementById("ds-ai-settings-popover-styles")) return;
  const style = document.createElement("style");
  style.id = "ds-ai-settings-popover-styles";
  style.textContent = `
    .ds-sensei-gear-popover.ds-ai-gear-popover {
      position: fixed;
      width: 380px;
      max-width: calc(100vw - 30px);
      max-height: calc(100vh - 30px);
      box-sizing: border-box;
      background: var(--ds-color-panel-2, var(--ds-panel-2, #181c24));
      border: 1px solid var(--ds-color-border, var(--ds-border, color-mix(in srgb, var(--ds-color-text) 14%, transparent)));
      border-radius: var(--ds-radius-card, 8px);
      box-shadow: var(--ds-shadow, 0 16px 40px rgba(0, 0, 0, 0.65));
      z-index: 100020;
      display: flex;
      flex-direction: column;
      font-family: var(--ds-font-family, Inter, "Segoe UI", system-ui, -apple-system, sans-serif);
      color: var(--ds-color-text, #e2e8f0);
      overflow: hidden;
      animation: ds-ai-pop-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes ds-ai-pop-in {
      from { opacity: 0; transform: scale(0.96) translateY(-4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .ds-ai-gear-popover .ds-sensei-gear-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--ds-color-text) 8%, transparent);
      background: color-mix(in srgb, var(--ds-color-text) 2%, transparent);
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-sensei-gear-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
      background: var(--ds-accent, #67e8f9);
      color: var(--ds-on-accent, #0a0c10);
      letter-spacing: 0.5px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-title {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--ds-color-text);
      display: block;
      line-height: 1.2;
    }
    .ds-ai-gear-popover .ds-sensei-gear-sub {
      font-size: 10px;
      color: color-mix(in srgb, var(--ds-color-text) 50%, transparent);
      display: block;
      line-height: 1.2;
      margin-top: 1px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-tabs {
      display: flex;
      gap: 4px;
      background: var(--ds-color-panel-2, color-mix(in srgb, var(--ds-color-base) 35%, transparent));
      padding: 3px;
      border-radius: var(--ds-radius-control, 6px);
      border: 1px solid var(--ds-color-border, color-mix(in srgb, var(--ds-color-text) 8%, transparent));
      margin: 0 14px 10px 14px;
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-sensei-gear-tab-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--ds-color-muted-text, rgba(248, 250, 252, 0.65));
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--ds-radius-control, 4px);
      cursor: pointer;
      transition: all var(--ds-transition, 120ms ease);
    }
    .ds-ai-gear-popover .ds-sensei-gear-tab-btn:hover {
      color: var(--ds-color-text, #f8fafc);
      background: var(--ds-btn-hover, color-mix(in srgb, var(--ds-color-text) 6%, transparent));
    }
    .ds-ai-gear-popover .ds-sensei-gear-tab-btn.is-active {
      color: var(--ds-color-accent, #67e8f9);
      background: var(--ds-color-panel-2, color-mix(in srgb, var(--ds-color-text) 10%, transparent));
      border-color: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 40%, transparent);
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body {
      padding: 12px 14px;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1 1 auto;
      min-height: 0;
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body::-webkit-scrollbar {
      width: 5px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--ds-color-text) 20%, transparent);
      border-radius: 4px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--ds-color-text) 35%, transparent);
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body > * {
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--ds-color-text) 3%, transparent);
      border: 1px solid color-mix(in srgb, var(--ds-color-text) 8%, transparent);
      border-radius: 6px;
      font-size: 11px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ds-color-muted-text);
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-dot.is-loaded {
      background: var(--ds-color-success);
      box-shadow: 0 0 8px color-mix(in srgb, var(--ds-color-success) 60%, transparent);
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-dot.is-idle {
      background: var(--ds-color-muted-text);
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .ds-ai-gear-popover .ds-sensei-gear-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
      width: 100%;
    }
    .ds-ai-gear-popover .ds-sensei-gear-label {
      font-size: 10.5px;
      font-weight: 700;
      color: color-mix(in srgb, var(--ds-color-text) 65%, transparent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-section-label {
      font-size: 10.5px;
      font-weight: 800;
      color: var(--ds-accent, #67e8f9);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-top: 4px;
      border-bottom: 1px solid color-mix(in srgb, var(--ds-color-text) 8%, transparent);
      padding-bottom: 3px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-row-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-hw-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--ds-color-text) 3%, transparent);
      border: 1px solid color-mix(in srgb, var(--ds-color-text) 7%, transparent);
      border-radius: 6px;
      font-size: 11px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-hw-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }
    .ds-ai-gear-popover .ds-sensei-gear-hw-left {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--ds-color-muted-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ds-ai-gear-popover .ds-sensei-gear-hw-warn {
      display: none;
      align-items: flex-start;
      gap: 6px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--ds-color-warning, #facc15) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--ds-color-warning, #facc15) 30%, transparent);
      border-radius: 6px;
      font-size: 10.5px;
      line-height: 1.35;
      color: var(--ds-color-warning, #facc15);
    }
    .ds-ai-gear-popover .ds-sensei-gear-hw-warn.is-visible {
      display: flex;
    }
    .ds-ai-gear-popover .ds-sensei-autotune-btn {
      height: 20px;
      padding: 0 7px;
      font-size: 10px;
      font-weight: 700;
      color: var(--ds-accent, #67e8f9);
      background: color-mix(in srgb, var(--ds-color-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--ds-color-accent) 25%, transparent);
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ds-ai-gear-popover .ds-sensei-autotune-btn:hover {
      background: color-mix(in srgb, var(--ds-color-accent) 24%, transparent);
    }
    .ds-ai-gear-popover .ds-sensei-gear-behavior-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      background: color-mix(in srgb, var(--ds-color-text) 2%, transparent);
      border: 1px solid color-mix(in srgb, var(--ds-color-text) 7%, transparent);
      border-radius: 6px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-unload-btn {
      margin-top: 6px;
      width: 100%;
    }
    .ds-ai-gear-popover .ds-ai-textarea {
      width: 100%;
      min-height: 140px;
      box-sizing: border-box;
      background: color-mix(in srgb, var(--ds-color-base) 35%, transparent);
      border: 1px solid color-mix(in srgb, var(--ds-color-text) 12%, transparent);
      border-radius: 6px;
      color: var(--ds-color-text);
      font-family: inherit;
      font-size: 11px;
      line-height: 1.4;
      padding: 8px 10px;
      resize: vertical;
      outline: none;
    }
    .ds-ai-gear-popover .ds-ai-textarea:focus {
      border-color: var(--ds-accent, #67e8f9);
    }
    .ds-ai-gear-popover input[type="number"],
    .ds-ai-gear-popover .ds-sensei-input,
    .ds-ai-gear-popover .ds-ai-seed-input {
      -moz-appearance: textfield !important;
      appearance: textfield !important;
    }
    .ds-ai-gear-popover input[type="number"]::-webkit-inner-spin-button,
    .ds-ai-gear-popover input[type="number"]::-webkit-outer-spin-button,
    .ds-ai-gear-popover .ds-sensei-input::-webkit-inner-spin-button,
    .ds-ai-gear-popover .ds-sensei-input::-webkit-outer-spin-button,
    .ds-ai-gear-popover .ds-ai-seed-input::-webkit-inner-spin-button,
    .ds-ai-gear-popover .ds-ai-seed-input::-webkit-outer-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
      display: none !important;
    }
    .ds-ai-gear-popover .ds-ai-field-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }
    .ds-ai-gear-popover .ds-ai-row-3col {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
      width: 100%;
    }
    .ds-ai-gear-popover .ds-ai-mode-notice {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      padding: 4px 8px;
      font-size: 10px;
      color: var(--ds-color-muted-text);
      border: 1px solid var(--ds-color-border);
      border-radius: var(--ds-radius-control, 5px);
    }
    .ds-ai-gear-popover .ds-ai-mode-notice svg {
      color: var(--ds-color-accent);
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-ai-lm-offline {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1.4;
      border: 1px solid color-mix(in srgb, var(--ds-color-danger) 40%, transparent);
      border-radius: var(--ds-radius-control, 5px);
      background: color-mix(in srgb, var(--ds-color-danger) 12%, transparent);
    }
    .ds-ai-gear-popover .ds-ai-lm-offline-title {
      color: var(--ds-color-danger);
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

let _onClose = null;

export function closeAIPopover() {
  if (_popoverRO) {
    _popoverRO.disconnect();
    _popoverRO = null;
  }
  if (_activeAIPopover) {
    _activeAIPopover.remove();
    _activeAIPopover = null;
  }
  window._dsUpdateActiveAIPopover = null;
  const onClose = _onClose;
  _onClose = null;
  onClose?.();
}

export async function fetchLMStudioModels(ip = "127.0.0.1", port = 1234) {
  try {
    const r = await fetch(`/ds/prompt_sensei/lm_studio/models?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`);
    if (r.ok) return await r.json();
  } catch (e) {
    console.error("[DS AI] Error fetching LM Studio models:", e);
  }
  return { ok: false, error: "LM Studio unavailable", address: `${ip}:${port}`, models: [] };
}

function field(label) {
  const el = document.createElement("div");
  el.className = "ds-sensei-gear-field";
  if (label) el.innerHTML = `<label class="ds-sensei-gear-label">${label}</label>`;
  return el;
}

function sectionLabel(text) {
  const el = document.createElement("div");
  el.className = "ds-sensei-gear-section-label";
  el.textContent = text;
  return el;
}

function spinField(label, options) {
  const f = field(label);
  f.appendChild(Spinbox({ width: "100%", ...options }).wrap);
  return f;
}

function row(className, ...children) {
  const el = document.createElement("div");
  el.className = className;
  el.append(...children);
  return el;
}

// Seed input with a Roll button; returns { root, input }.
function seedField(target, onChange) {
  const f = field();
  const input = InputRow({
    value: target.seed ?? 123456,
    mono: true,
    className: "ds-ai-seed-row",
    onChange: (val) => {
      target.seed = parseInt(val) || 0;
      onChange();
    },
    actions: [Button({
      icon: "dice",
      label: "Roll",
      compact: true,
      onClick: () => {
        target.seed = Math.floor(Math.random() * 2147483647);
        input.setValue(target.seed);
        onChange();
      },
    })],
  });
  f.innerHTML = `<label class="ds-sensei-gear-label">Seed</label>`;
  f.appendChild(input.root);
  return { root: f, input };
}

// VRAM plan for llama.cpp GPU offload; the vision projector is counted only when it loads.
function calcPlan(hw, modelMeta, ctxLen, withVision) {
  if (!hw || !hw.has_gpu || !hw.total_vram_mb) {
    return { recommended: 0, totalLayers: 32, fits100Percent: false, totalRequiredGB: 0, totalVramGB: 0, safeLayers: 0, hasGpu: false };
  }
  const totalVramGB = hw.total_vram_mb / 1024;
  const usableVramGB = Math.max(0.5, totalVramGB - 0.6);
  const modelSizeGB = Number(modelMeta?.size_gb) || 4.5;
  const totalLayers = Number(modelMeta?.total_layers) || 32;
  const mmprojGB = withVision ? (Number(modelMeta?.mmproj_size_gb) || (modelMeta?.has_vision ? 0.4 : 0)) : 0;
  const baseVramGB = (mmprojGB > 0 ? mmprojGB + 0.15 : 0) + (ctxLen / 4096) * 0.35 + 0.25;
  const totalRequiredGB = modelSizeGB + baseVramGB;
  const round = (v) => Math.round(v * 10) / 10;

  if (totalRequiredGB <= usableVramGB) {
    return { recommended: -1, totalLayers, fits100Percent: true, totalRequiredGB: round(totalRequiredGB), totalVramGB: round(totalVramGB), safeLayers: totalLayers, hasGpu: true };
  }
  const weightPerLayerGB = Math.max(0.01, (modelSizeGB * 0.94) / totalLayers);
  const safeLayers = Math.max(0, Math.min(totalLayers, Math.floor(Math.max(0.2, usableVramGB - baseVramGB) / weightPerLayerGB)));
  return { recommended: safeLayers, totalLayers, fits100Percent: false, totalRequiredGB: round(totalRequiredGB), totalVramGB: round(totalVramGB), safeLayers, hasGpu: true };
}

function findModel(models, id) {
  const cur = String(id || "").replace(/\\/g, "/").toLowerCase();
  if (!cur) return null;
  const base = cur.split("/").pop();
  return models.find((m) => String(m.id).replace(/\\/g, "/").toLowerCase() === cur)
    || models.find((m) => {
      const mid = String(m.id).replace(/\\/g, "/").toLowerCase();
      return mid.endsWith("/" + base) || m.name?.toLowerCase() === base.replace(/\.gguf$/i, "");
    })
    || null;
}

function renderBuiltInPanel(scroll, bi, { onChange, vision }) {
  // 1. Status banner
  const statusCard = document.createElement("div");
  statusCard.className = "ds-sensei-gear-status-card";
  statusCard.innerHTML = `
    <span class="ds-sensei-gear-status-dot is-idle"></span>
    <span class="ds-sensei-gear-status-text">○ Checking model status...</span>
  `;
  scroll.appendChild(statusCard);

  const refreshStatus = async () => {
    try {
      const st = await (await fetch("/ds/ai/status")).json();
      const dot = statusCard.querySelector(".ds-sensei-gear-status-dot");
      const txt = statusCard.querySelector(".ds-sensei-gear-status-text");
      if (st.loaded) {
        dot.className = "ds-sensei-gear-status-dot is-loaded";
        txt.innerHTML = `<strong style="color:var(--ds-color-accent)">Loaded:</strong> ${st.model_name || "Active"} · ${st.vram_free_mb || 0} MB free (${st.has_vision ? "Vision" : "Text Only"})`;
      } else {
        dot.className = "ds-sensei-gear-status-dot is-idle";
        txt.textContent = "○ No model loaded in VRAM";
      }
    } catch (_) {}
  };
  refreshStatus();

  // 2. Model
  const modelField = field();
  const modelHdr = row("ds-ai-field-head");
  modelHdr.innerHTML = `<label class="ds-sensei-gear-label">GGUF Model</label>`;
  const rescanBtn = Button({ icon: "refresh-cw", label: "Rescan", compact: true });
  modelHdr.appendChild(rescanBtn.root);
  modelField.appendChild(modelHdr);

  let models = [];
  const modelDd = Dropdown({
    value: bi.model || "",
    options: bi.model ? [{ id: bi.model, label: String(bi.model).split(/[/\\]/).pop().replace(/\.gguf$/i, "") }] : [],
    placeholder: "Scanning models in ComfyUI/models/LLM & LM Studio...",
    onChange: (val) => {
      bi.model = val;
      onChange();
      updateHWWarn();
    },
  });
  modelDd.root.style.width = "100%";
  modelField.appendChild(modelDd.root);

  const withVision = vision?.() ?? false;
  const modeNotice = document.createElement("div");
  modeNotice.className = "ds-ai-mode-notice";
  modeNotice.innerHTML = withVision
    ? `${DSIconMarkup("eye", { size: 11 })}<span><strong>Vision:</strong> the projector loads with the model for image input.</span>`
    : `${DSIconMarkup("check", { size: 11 })}<span><strong>Text-only:</strong> never loads the vision projector. A model another DS node already loaded is reused without reloading.</span>`;
  modelField.appendChild(modeNotice);
  scroll.appendChild(modelField);

  // 3. Hardware & auto-tune
  const hwCard = document.createElement("div");
  hwCard.className = "ds-sensei-gear-hw-card";
  hwCard.innerHTML = `
    <div class="ds-sensei-gear-hw-top">
      <div class="ds-sensei-gear-hw-left">
        ${DSIconMarkup("cpu", { size: 13 })}
        <span class="ds-sensei-hw-name">Detecting GPU...</span>
      </div>
    </div>
  `;
  const tuneBtn = Button({ label: "Auto-Tune", compact: true, className: "ds-sensei-autotune-btn" });
  tuneBtn.root.style.display = "none";
  hwCard.querySelector(".ds-sensei-gear-hw-top").appendChild(tuneBtn.root);
  scroll.appendChild(hwCard);

  const hwWarn = document.createElement("div");
  hwWarn.className = "ds-sensei-gear-hw-warn";
  scroll.appendChild(hwWarn);

  let gpuStepper = null;
  const plan = () => calcPlan(_cachedHW, findModel(models, bi.model), bi.context_length || 4096, withVision);

  const updateHWWarn = () => {
    const p = plan();
    tuneBtn.setLabel(`Auto-Tune (${p.recommended === -1 ? "ALL" : p.recommended})`);
    const curLayers = bi.n_gpu_layers ?? -1;
    if (!_cachedHW || !p.hasGpu) {
      hwWarn.innerHTML = `${DSIconMarkup("alert-circle", { size: 12 })}<span>No dedicated GPU detected. Set GPU Layers to 0 (CPU Only).</span>`;
      hwWarn.classList.toggle("is-visible", Boolean(_cachedHW) && curLayers !== 0);
      return;
    }
    if (!p.fits100Percent && (curLayers === -1 || curLayers > p.safeLayers + 2)) {
      const name = findModel(models, bi.model)?.name || "Selected model";
      hwWarn.innerHTML = `${DSIconMarkup("alert-circle", { size: 12 })}<span><strong>${name}</strong> requires ~${p.totalRequiredGB}GB VRAM for 100% offload, exceeding your ${p.totalVramGB}GB VRAM. Recommended: <strong>${p.recommended} layers</strong>.</span>`;
      hwWarn.classList.add("is-visible");
    } else {
      hwWarn.classList.remove("is-visible");
    }
  };

  tuneBtn.root.addEventListener("click", () => {
    bi.n_gpu_layers = plan().recommended;
    gpuStepper?.setValue(bi.n_gpu_layers);
    onChange();
    updateHWWarn();
  });

  const loadModels = async () => {
    try {
      const data = await (await fetch("/ds/ai/models")).json();
      if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
        models = data.models;
        modelDd.setOptions(models.map((m) => ({
          id: m.id,
          label: `${m.root && m.root !== "ComfyUI" ? `[${m.root}] ` : ""}${m.name} (${m.size_gb} GB)${m.has_vision ? " 👁️ Vision" : ""}`,
        })));
        const match = findModel(models, bi.model) || models[0];
        if (match.id !== bi.model) {
          bi.model = match.id;
          onChange();
        }
        modelDd.setValue(bi.model);
      }
      updateHWWarn();
    } catch (_) {}
  };

  const loadHW = async () => {
    try {
      if (!_cachedHW) _cachedHW = await (await fetch("/ds/ai/hardware")).json();
      const hw = _cachedHW;
      hwCard.querySelector(".ds-sensei-hw-name").textContent = !hw.has_gpu || !hw.total_vram_mb
        ? `CPU Only (${Math.round((hw.system_ram_mb || 0) / 1024)}GB RAM)`
        : `${hw.gpu_name} (${(hw.total_vram_mb / 1024).toFixed(1)}GB VRAM)`;
      tuneBtn.root.style.display = "";
      updateHWWarn();
    } catch (_) {}
  };

  rescanBtn.root.addEventListener("click", () => {
    loadModels();
    refreshStatus();
  });
  loadModels();
  loadHW();

  // 4. Sampling
  scroll.appendChild(sectionLabel("Sampling"));
  scroll.appendChild(row("ds-sensei-gear-row-2col",
    spinField("Temperature", { value: bi.temperature ?? 0.8, min: 0, max: 2, step: 0.05, decimals: 2, onChange: (v) => { bi.temperature = parseFloat(v) ?? 0.8; onChange(); } }),
    spinField("Max Tokens", { value: bi.max_tokens ?? 2048, min: 64, max: 8192, step: 128, decimals: 0, onChange: (v) => { bi.max_tokens = parseInt(v) || 2048; onChange(); } }),
  ));

  const gpuField = field("GPU Layers (-1=All)");
  gpuStepper = Spinbox({
    value: bi.n_gpu_layers ?? -1, min: -1, max: 128, step: 1, decimals: 0, width: "100%",
    onChange: (v) => {
      bi.n_gpu_layers = isNaN(parseInt(v)) ? -1 : parseInt(v);
      onChange();
      updateHWWarn();
    },
  });
  gpuField.appendChild(gpuStepper.wrap);
  scroll.appendChild(row("ds-sensei-gear-row-2col",
    spinField("Context Length", { value: bi.context_length ?? 4096, min: 1024, max: 32768, step: 1024, decimals: 0, onChange: (v) => { bi.context_length = parseInt(v) || 4096; onChange(); updateHWWarn(); } }),
    gpuField,
  ));

  // 5. Advanced sampling
  scroll.appendChild(sectionLabel("Advanced Sampling"));
  scroll.appendChild(row("ds-ai-row-3col",
    spinField("Top P", { value: bi.top_p ?? 0.9, min: 0, max: 1, step: 0.05, decimals: 2, onChange: (v) => { bi.top_p = parseFloat(v) ?? 0.9; onChange(); } }),
    spinField("Top K", { value: bi.top_k ?? 40, min: 0, max: 200, step: 5, decimals: 0, onChange: (v) => { bi.top_k = parseInt(v) ?? 40; onChange(); } }),
    spinField("Rep. Pen.", { value: bi.repetition_penalty ?? 1.1, min: 1, max: 2, step: 0.05, decimals: 2, onChange: (v) => { bi.repetition_penalty = parseFloat(v) ?? 1.1; onChange(); } }),
  ));

  const seed = seedField(bi, onChange);
  scroll.appendChild(seed.root);

  const unloadBtn = Button({
    icon: "trash-2",
    label: "Unload Model Now",
    className: "ds-sensei-gear-unload-btn",
    onClick: async () => {
      unloadBtn.setDisabled(true);
      try { await fetch("/ds/ai/unload", { method: "POST" }); } catch (_) {}
      unloadBtn.setDisabled(false);
      refreshStatus();
    },
  });
  scroll.appendChild(unloadBtn.root);

  return { setSeed: (v) => seed.input.setValue(v) };
}

function renderLMStudioPanel(scroll, lm, { onChange, switchToBuiltIn }) {
  const modelField = field("Model");
  const modelDd = Dropdown({
    value: lm.model || "",
    options: lm.model ? [{ id: lm.model, label: lm.model }] : [],
    placeholder: "Select LM Studio Model...",
    onChange: (val) => {
      lm.model = val;
      onChange();
    },
  });
  modelDd.root.style.width = "100%";
  modelField.appendChild(modelDd.root);

  const offline = document.createElement("div");
  offline.className = "ds-ai-lm-offline";
  offline.style.display = "none";
  modelField.appendChild(offline);
  scroll.appendChild(modelField);

  fetchLMStudioModels(lm.ip, lm.port).then((res) => {
    if (res.ok && res.models?.length > 0) {
      const llm = res.models.filter((m) => !/(embed|nomic-embed|bge-)/i.test(m));
      const list = llm.length > 0 ? llm : res.models;
      modelDd.setOptions(list.map((m) => ({ id: m, label: m })));
      if (!lm.model) {
        lm.model = list[0];
        modelDd.setValue(lm.model);
        onChange();
      }
      return;
    }
    offline.style.display = "";
    offline.innerHTML = `
      <div class="ds-ai-lm-offline-title">LM Studio server offline</div>
      <div>No response on <code>${lm.ip}:${lm.port}</code>. If you have local GGUF models, use the <strong>Built In</strong> tab.</div>
    `;
    offline.appendChild(Button({ label: "Switch to Built In", compact: true, variant: "primary", onClick: switchToBuiltIn }).root);
  });

  const ip = Input({ value: lm.ip || "127.0.0.1", onChange: (v) => { lm.ip = v.trim() || "127.0.0.1"; onChange(); } });
  const port = Input({ type: "number", value: lm.port || 1234, onChange: (v) => { lm.port = parseInt(v) || 1234; onChange(); } });
  const ipField = field("IP Address");
  ipField.appendChild(ip.root);
  const portField = field("Port");
  portField.appendChild(port.root);
  scroll.appendChild(row("ds-sensei-gear-row-2col", ipField, portField));

  scroll.appendChild(sectionLabel("Sampling"));
  scroll.appendChild(row("ds-sensei-gear-row-2col",
    spinField("Max Tokens", { value: lm.max_tokens ?? 2048, min: 1, max: 131072, step: 128, decimals: 0, onChange: (v) => { lm.max_tokens = parseInt(v) || 2048; onChange(); } }),
    spinField("Temperature", { value: lm.temperature ?? 0.7, min: 0, max: 2, step: 0.05, decimals: 2, onChange: (v) => { lm.temperature = parseFloat(v) ?? 0.7; onChange(); } }),
  ));

  const timeout = Input({ type: "number", value: lm.timeout ?? 300, onChange: (v) => { lm.timeout = Math.max(5, parseInt(v) || 300); onChange(); } });
  const timeoutField = field("Timeout (s)");
  timeoutField.appendChild(timeout.root);
  scroll.appendChild(row("ds-sensei-gear-row-2col", seedField(lm, onChange).root, timeoutField));
}

const TAB_INFO = {
  lm_studio: { label: "LM Studio", icon: "link", sub: "LM Studio Configuration" },
  built_in: { label: "Built In", icon: "cpu", sub: "Built-In LLM Configuration" },
  settings: { label: "Settings", icon: "settings", sub: "Node & Behavior Settings" },
};

/**
 * Shared AI settings popover for nodes that run an LLM.
 *   builtIn        settings object for the built-in llama.cpp backend (edited in place)
 *   lmStudio       optional LM Studio settings object; adds the LM Studio tab
 *   vision         optional () => boolean, whether the vision projector loads (VRAM plan)
 *   tab            initial tab; onTabChange(tab) reports switches
 *   onChange       called after every edit
 *   renderSettings (scroll) => void, the node's own Settings tab
 *   onClose        called when the popover closes
 */
export function openAISettingsPopover({
  node,
  anchorEl,
  title,
  badge = "AI",
  builtIn,
  lmStudio = null,
  vision = null,
  tab = "built_in",
  onTabChange = null,
  onChange = () => {},
  renderSettings,
  onClose = null,
}) {
  closeAIPopover();
  ensureStyles();
  _onClose = onClose;

  const tabs = lmStudio ? ["lm_studio", "built_in", "settings"] : ["built_in", "settings"];
  let activeTab = tabs.includes(tab) ? tab : "built_in";
  let builtInPanel = null;

  const popover = document.createElement("div");
  popover.className = "ds-sensei-gear-popover ds-ai-gear-popover";
  popover.dataset.dsThemed = "true";
  _activeAIPopover = popover;

  // Keep clicks inside the popover away from the canvas and the outside-click handler.
  popover.addEventListener("pointerdown", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());
  popover.addEventListener("click", (e) => e.stopPropagation());

  const switchTab = (next) => {
    activeTab = next;
    onTabChange?.(next);
    render();
  };

  const render = () => {
    popover.replaceChildren();
    builtInPanel = null;

    const head = document.createElement("div");
    head.className = "ds-sensei-gear-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-sensei-gear-title-wrap";
    titleWrap.innerHTML = `
      <span class="ds-sensei-gear-badge">${badge}</span>
      <div>
        <strong class="ds-sensei-gear-title">${title}</strong>
        <small class="ds-sensei-gear-sub">${TAB_INFO[activeTab].sub}</small>
      </div>
    `;
    head.append(titleWrap, Button({ icon: "x", compact: true, tooltip: "Close", onClick: closeAIPopover }).root);
    popover.appendChild(head);

    const tabStrip = document.createElement("div");
    tabStrip.className = "ds-sensei-gear-tabs";
    for (const id of tabs) {
      tabStrip.appendChild(Button({
        label: TAB_INFO[id].label,
        icon: TAB_INFO[id].icon,
        compact: true,
        active: id === activeTab,
        className: "ds-sensei-gear-tab-btn",
        onClick: () => switchTab(id),
      }).root);
    }
    popover.appendChild(tabStrip);

    const scroll = document.createElement("div");
    scroll.className = "ds-sensei-gear-scroll-body";
    popover.appendChild(scroll);

    if (activeTab === "lm_studio") renderLMStudioPanel(scroll, lmStudio, { onChange, switchToBuiltIn: () => switchTab("built_in") });
    else if (activeTab === "built_in") builtInPanel = renderBuiltInPanel(scroll, builtIn, { onChange, vision });
    else renderSettings?.(scroll);

    adjustPosition();
  };

  document.body.appendChild(popover);
  render();

  // Lets a node push a seed it rolled itself into the open popover.
  window._dsUpdateActiveAIPopover = {
    node,
    setSeed: (newSeed) => {
      builtIn.seed = newSeed;
      builtInPanel?.setSeed(newSeed);
    },
  };

  // Next to the anchor, else beside the node; shifted up rather than clipped.
  function adjustPosition() {
    if (!popover.isConnected) return;
    const pw = Math.min(380, window.innerWidth - 30);
    popover.style.width = `${pw}px`;

    const scrollBody = popover.querySelector(".ds-sensei-gear-scroll-body");
    const nonScrollH = popover.offsetHeight - (scrollBody ? scrollBody.clientHeight : 0);
    const neededH = (scrollBody ? scrollBody.scrollHeight : popover.scrollHeight) + Math.max(0, nonScrollH);
    const desiredH = Math.min(neededH, window.innerHeight - 30);

    let left = Math.max(15, window.innerWidth - pw - 25);
    let top = 60;
    const anchorRect = anchorEl && document.body.contains(anchorEl) ? anchorEl.getBoundingClientRect() : null;

    if (anchorRect) {
      left = anchorRect.left + pw > window.innerWidth - 15 ? Math.max(15, anchorRect.right - pw) : anchorRect.left;
      top = anchorRect.bottom + desiredH <= window.innerHeight - 15 ? anchorRect.bottom + 8 : anchorRect.top;
    } else if (node?.pos && window.app?.canvas?.ds) {
      const { ds, canvas } = window.app.canvas;
      const cRect = canvas.getBoundingClientRect();
      const screenX = cRect.left + (node.pos[0] + ds.offset[0]) * ds.scale;
      const nodeW = (node.size?.[0] ?? 420) * ds.scale;
      top = cRect.top + (node.pos[1] + ds.offset[1]) * ds.scale;
      left = screenX + nodeW + 16;
      if (left + pw > window.innerWidth - 15) {
        left = screenX - pw - 16 >= 15 ? screenX - pw - 16 : Math.max(15, window.innerWidth - pw - 15);
      }
    }

    left = Math.max(15, Math.min(left, window.innerWidth - pw - 15));
    if (top + desiredH > window.innerHeight - 15) top = window.innerHeight - desiredH - 15;
    top = Math.max(15, top);

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.style.maxHeight = `${Math.round(Math.max(200, window.innerHeight - top - 15))}px`;
  }

  requestAnimationFrame(adjustPosition);
  if (window.ResizeObserver) {
    _popoverRO = new ResizeObserver(adjustPosition);
    _popoverRO.observe(popover);
  }

  const onOutside = (e) => {
    if (e.target.closest?.(".ds-ui-popup, .ds-ui-modal-overlay")) return;
    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      document.removeEventListener("pointerdown", onOutside);
      window.removeEventListener("keydown", onKeyDown, true);
      if (_activeAIPopover === popover) closeAIPopover();
    }
  };
  const onKeyDown = (e) => {
    if (e.key !== "Escape") return;
    document.removeEventListener("pointerdown", onOutside);
    window.removeEventListener("keydown", onKeyDown, true);
    if (_activeAIPopover === popover) closeAIPopover();
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside);
    window.addEventListener("keydown", onKeyDown, true);
  }, 20);
}
