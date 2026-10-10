/**
 * Deathshot Arsenal — Centralized AI Settings Popover
 * Full 2-Tab Popover: [ 🧠 Built In | ⚙ Settings ]
 * Strictly adheres to DeathshotArsenal UIElements (Toggle, Spinbox, Dropdown, Button)
 * and DS CSS design tokens.
 */

import {
  Button,
  Dropdown,
  Spinbox,
  Toggle,
  DSIcon,
  DSIconMarkup,
} from "../UIElements/index.js";

let _activeAIPopover = null;
let _cachedHW = null;
let _popoverRO = null;

const DEFAULT_SYSTEM_PROMPT = `You are an elite prompt refinement and variation engine for advanced image/video generation models.
Your task is to rewrite a given prompt by randomizing ONLY the specifically requested semantic categories, while preserving all other elements of the prompt intact.

CRITICAL RULES:
0. ABSOLUTE MANDATORY DIRECTIVE — NO THINKING / NO CHAIN-OF-THOUGHT:
   - Thinking mode is STRICTLY DISABLED for all models.
   - DO NOT output "Thinking Process:", do NOT output <think> tags, and do NOT output analysis, planning, breakdowns, or internal reasoning steps.
   - Output ONLY the final edited prompt text directly. The very first character of your response MUST be the first character of the prompt.
1. SEMANTIC PHRASE RECOGNITION:
   - Understand complete descriptive phrases as single attributes. For example, if "hair" or "hair_color" is selected, the phrase "long wavy natural red hair" must be recognized in its entirety and replaced with a cohesive new hair description (e.g., "short messy lavender-tinted curls", "sleek raven-black straight bob", "waist-length braided neon turquoise hair").
2. TARGETED RANDOMIZATION ONLY:
   - Only modify, replace, or enhance parts of the prompt that directly belong to the SELECTED TARGET CATEGORIES.
   - Do NOT alter unselected elements (e.g., if "clothing" is NOT selected, keep "blue summer dress" exactly as-is; if "camera" is NOT selected, keep "cinematic 35mm photograph" exactly as-is).
3. CONTEXTUAL WEAVING OF MISSING ATTRIBUTES:
   - If a selected category is NOT present in the source prompt, naturally and seamlessly weave a vivid, fitting detail for that category into the prompt without disrupting the grammar or flow.
4. MAXIMUM CREATIVE DIVERSITY:
   - Use your extensive knowledge to introduce diverse, vivid, high-fidelity styles, materials, palettes, lighting scenarios, and environments beyond standard basic dictionaries.
5. CLEAN, RAW OUTPUT:
   - Return ONLY the final modified prompt text.
   - Absolutely NO conversational filler, NO intros ("Here is your prompt:"), NO explanations, NO quotes, and NO markdown code fences.`;

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
      background: var(--ds-bg-surface-elevated, var(--ds-panel-2, #181c24));
      border: 1px solid var(--ds-border-color, var(--ds-border, rgba(255, 255, 255, 0.14)));
      border-radius: var(--ds-radius-card, 8px);
      box-shadow: var(--ds-shadow-modal, 0 16px 40px rgba(0, 0, 0, 0.65));
      z-index: 100020;
      display: flex;
      flex-direction: column;
      font-family: var(--ds-font-family, Inter, "Segoe UI", system-ui, -apple-system, sans-serif);
      color: var(--ds-text-primary, #e2e8f0);
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
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
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
      color: #fff;
      display: block;
      line-height: 1.2;
    }
    .ds-ai-gear-popover .ds-sensei-gear-sub {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      display: block;
      line-height: 1.2;
      margin-top: 1px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-tabs {
      display: flex;
      gap: 4px;
      background: var(--ds-color-panel-2, rgba(0, 0, 0, 0.35));
      padding: 3px;
      border-radius: var(--ds-radius-control, 6px);
      border: 1px solid var(--ds-color-border, rgba(255, 255, 255, 0.08));
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
      border-radius: var(--ds-radius-tab, 4px);
      cursor: pointer;
      transition: all var(--ds-transition, 120ms ease);
    }
    .ds-ai-gear-popover .ds-sensei-gear-tab-btn:hover {
      color: var(--ds-color-text, #f8fafc);
      background: var(--ds-color-surface-hover, rgba(255, 255, 255, 0.06));
    }
    .ds-ai-gear-popover .ds-sensei-gear-tab-btn.is-active {
      color: var(--ds-color-accent, #67e8f9);
      background: var(--ds-color-surface, rgba(255, 255, 255, 0.1));
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
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.35);
    }
    .ds-ai-gear-popover .ds-sensei-gear-scroll-body > * {
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      font-size: 11px;
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
      flex-shrink: 0;
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-dot.is-loaded {
      background: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
    }
    .ds-ai-gear-popover .ds-sensei-gear-status-dot.is-idle {
      background: #64748b;
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
      color: rgba(255, 255, 255, 0.65);
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
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
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
      color: #cbd5e1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ds-ai-gear-popover .ds-sensei-gear-hw-warn {
      display: none;
      align-items: flex-start;
      gap: 6px;
      padding: 8px 10px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 6px;
      font-size: 10.5px;
      line-height: 1.35;
      color: #fbbf24;
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
      background: rgba(103, 232, 249, 0.12);
      border: 1px solid rgba(103, 232, 249, 0.25);
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ds-ai-gear-popover .ds-sensei-autotune-btn:hover {
      background: rgba(103, 232, 249, 0.24);
    }
    .ds-ai-gear-popover .ds-sensei-gear-behavior-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.07);
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
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      color: #e2e8f0;
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
  `;
  document.head.appendChild(style);
}

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
}

export async function openAISettingsPopover({
  node,
  anchorEl,
  title = "DS Randomizer — AI Settings",
  getSettings,
  saveSettings,
}) {
  closeAIPopover();
  ensureStyles();

  const currentSettings = {
    model: "",
    temperature: 0.80,
    max_tokens: 2048,
    context_length: 4096,
    n_gpu_layers: -1,
    top_p: 0.90,
    top_k: 40,
    repetition_penalty: 1.10,
    seed: 123456,
    auto_unload: true,
    auto_load: true,
    pause_for_edit: false,
    free_comfy_memory: true,
    randomize_seed: true,
    system_prompt: "",
    require_vision: false,
    variation_cache: true,
    cache_size: 10,
    contextual_coherence: true,
    ...(getSettings?.() || {}),
  };

  let activeTab = "built_in"; // "built_in" or "settings"

  const sync = () => {
    saveSettings?.(currentSettings);
  };

  const popover = document.createElement("div");
  popover.className = "ds-sensei-gear-popover ds-ai-gear-popover";
  popover.dataset.dsThemed = "true";
  _activeAIPopover = popover;

  // CRITICAL: Stop propagation so clicks inside popover don't trigger canvas click or auto-close!
  popover.addEventListener("pointerdown", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());
  popover.addEventListener("click", (e) => e.stopPropagation());

  // Function to render content based on active tab
  const renderPopover = () => {
    popover.innerHTML = "";

    // ── 1. Header ──
    const head = document.createElement("div");
    head.className = "ds-sensei-gear-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-sensei-gear-title-wrap";
    titleWrap.innerHTML = `
      <span class="ds-sensei-gear-badge">AI</span>
      <div>
        <strong class="ds-sensei-gear-title">${title}</strong>
        <small class="ds-sensei-gear-sub">${activeTab === "built_in" ? "Built-In LLM Configuration" : "Behavior & System Prompt Settings"}</small>
      </div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
    closeBtn.title = "Close";
    closeBtn.appendChild(DSIcon("x", { size: 14 }));
    closeBtn.onclick = closeAIPopover;

    head.append(titleWrap, closeBtn);
    popover.appendChild(head);

    // ── 2. Tabs Strip [ 🧠 Built In | ⚙ Settings ] ──
    const tabStrip = document.createElement("div");
    tabStrip.className = "ds-sensei-gear-tabs";

    const biTabBtn = document.createElement("button");
    biTabBtn.type = "button";
    biTabBtn.className = `ds-sensei-gear-tab-btn ${activeTab === "built_in" ? "is-active" : ""}`;
    biTabBtn.innerHTML = `<span>🧠 Built In</span>`;
    biTabBtn.onclick = () => {
      activeTab = "built_in";
      renderPopover();
    };

    const setTabBtn = document.createElement("button");
    setTabBtn.type = "button";
    setTabBtn.className = `ds-sensei-gear-tab-btn ${activeTab === "settings" ? "is-active" : ""}`;
    setTabBtn.innerHTML = `<span>⚙ Settings</span>`;
    setTabBtn.onclick = () => {
      activeTab = "settings";
      renderPopover();
    };

    tabStrip.append(biTabBtn, setTabBtn);
    popover.appendChild(tabStrip);

    // ── 3. Scroll Body ──
    const scroll = document.createElement("div");
    scroll.className = "ds-sensei-gear-scroll-body";
    popover.appendChild(scroll);

    if (activeTab === "built_in") {
      renderBuiltInTab(scroll);
    } else {
      renderSettingsTab(scroll);
    }

    adjustPosition();
  };

  // ─────────────────────────────────────────────────────────────
  // TAB 1: BUILT IN LLM
  // ─────────────────────────────────────────────────────────────
  const renderBuiltInTab = (scroll) => {
    // 1. Status Banner Card
    const statusCard = document.createElement("div");
    statusCard.className = "ds-sensei-gear-status-card";
    statusCard.innerHTML = `
      <span class="ds-sensei-gear-status-dot is-idle"></span>
      <span class="ds-sensei-gear-status-text">○ Checking model status...</span>
    `;
    scroll.appendChild(statusCard);

    const refreshStatus = async () => {
      try {
        const res = await fetch("/ds/ai/status");
        const st = await res.json();
        const dot = statusCard.querySelector(".ds-sensei-gear-status-dot");
        const txt = statusCard.querySelector(".ds-sensei-gear-status-text");
        if (!dot || !txt) return;

        if (st.loaded) {
          dot.className = "ds-sensei-gear-status-dot is-loaded";
          const visInfo = st.has_vision ? " · Vision" : " · Text Only";
          txt.innerHTML = `<strong style="color:var(--ds-accent,#67e8f9)">Loaded:</strong> ${st.model_name || "Active"} · ${st.vram_free_mb || 0} MB free <span style="color:rgba(255,255,255,0.5)">(${visInfo.trim()})</span>`;
        } else {
          dot.className = "ds-sensei-gear-status-dot is-idle";
          txt.textContent = "○ No model loaded in VRAM";
        }
      } catch (_) {}
    };
    refreshStatus();

    // 2. GGUF Model Field
    const modelField = document.createElement("div");
    modelField.className = "ds-sensei-gear-field";

    const modelHdr = document.createElement("div");
    modelHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";

    const modelLbl = document.createElement("label");
    modelLbl.className = "ds-sensei-gear-label";
    modelLbl.textContent = "GGUF Model";

    const rescanBtn = document.createElement("button");
    rescanBtn.type = "button";
    rescanBtn.className = "ds-sensei-btn-compact ds-sensei-gear-rescan-btn";
    rescanBtn.style.cssText = "height:18px;line-height:18px;padding:0 6px;font-size:10px;font-weight:700;color:var(--ds-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;";
    rescanBtn.innerHTML = `${DSIconMarkup("refresh-cw", { size: 10 })}<span>Rescan</span>`;

    modelHdr.append(modelLbl, rescanBtn);
    modelField.appendChild(modelHdr);

    let cachedModels = [];

    const modelDd = Dropdown({
      value: currentSettings.model || "",
      options: currentSettings.model ? [{ id: currentSettings.model, label: String(currentSettings.model).split(/[/\\]/).pop().replace(/\.gguf$/i, "") }] : [],
      placeholder: "Scanning models in ComfyUI/models/LLM & LM Studio...",
      onChange: (val) => {
        currentSettings.model = val;
        sync();
        updateHWWarn();
      },
    });
    modelDd.root.style.width = "100%";
    modelField.appendChild(modelDd.root);

    const modeNotice = document.createElement("div");
    modeNotice.style.cssText = "font-size:10px;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:6px;margin-top:4px;padding:4px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:4px;";
    modeNotice.innerHTML = `${DSIconMarkup("check", { size: 11, color: "var(--ds-accent, #67e8f9)" })}<span><strong>Pure Text Prompt Mode:</strong> Image & vision projectors are never loaded, keeping VRAM/RAM minimal.</span>`;
    modelField.appendChild(modeNotice);

    scroll.appendChild(modelField);

    // 3. Hardware Detection Card & Auto-Tune
    const hwCard = document.createElement("div");
    hwCard.className = "ds-sensei-gear-hw-card";
    hwCard.innerHTML = `
      <div class="ds-sensei-gear-hw-top">
        <div class="ds-sensei-gear-hw-left">
          ${DSIconMarkup("cpu", { size: 13, color: "var(--ds-accent, #67e8f9)" })}
          <span class="ds-sensei-hw-name">Detecting GPU...</span>
        </div>
        <button type="button" class="ds-sensei-btn-compact ds-sensei-autotune-btn" style="display:none;">
          💡 Auto-Tune
        </button>
      </div>
    `;
    scroll.appendChild(hwCard);

    const hwWarn = document.createElement("div");
    hwWarn.className = "ds-sensei-gear-hw-warn";
    scroll.appendChild(hwWarn);

    const calcPlan = (hw, modelMeta, ctxLen = 4096) => {
      if (!hw || !hw.has_gpu || !hw.total_vram_mb) {
        return { recommended: 0, totalLayers: 32, fits100Percent: false, totalRequiredGB: 0, usableVramGB: 0, totalVramGB: 0, safeLayers: 0, hasGpu: false };
      }
      const totalVramGB = (hw.total_vram_mb || 0) / 1024;
      const osReserveGB = 0.6;
      const usableVramGB = Math.max(0.5, totalVramGB - osReserveGB);
      const modelSizeGB = Number(modelMeta?.size_gb) || 4.5;
      const totalLayers = Number(modelMeta?.total_layers) || 32;

      const kvCacheGB = (ctxLen / 4096) * 0.35;
      const computeOverheadGB = 0.25;
      const baseVramGB = kvCacheGB + computeOverheadGB;
      const totalRequiredGB = modelSizeGB + baseVramGB;

      if (totalRequiredGB <= usableVramGB) {
        return {
          recommended: -1,
          totalLayers,
          fits100Percent: true,
          totalRequiredGB: Math.round(totalRequiredGB * 10) / 10,
          usableVramGB: Math.round(usableVramGB * 10) / 10,
          totalVramGB: Math.round(totalVramGB * 10) / 10,
          safeLayers: totalLayers,
          hasGpu: true,
        };
      }

      const weightBudgetGB = Math.max(0.2, usableVramGB - baseVramGB);
      const weightPerLayerGB = Math.max(0.01, (modelSizeGB * 0.94) / totalLayers);
      const safeLayers = Math.max(0, Math.min(totalLayers, Math.floor(weightBudgetGB / weightPerLayerGB)));

      return {
        recommended: safeLayers > 0 ? safeLayers : 0,
        totalLayers,
        fits100Percent: false,
        totalRequiredGB: Math.round(totalRequiredGB * 10) / 10,
        usableVramGB: Math.round(usableVramGB * 10) / 10,
        totalVramGB: Math.round(totalVramGB * 10) / 10,
        safeLayers,
        hasGpu: true,
      };
    };

    const getModelMeta = () => {
      const cur = String(currentSettings.model || "").replace(/\\/g, "/").toLowerCase();
      const curBase = cur.split("/").pop();
      return cachedModels.find((m) => {
        const id = String(m.id).replace(/\\/g, "/").toLowerCase();
        return id === cur || id.endsWith("/" + curBase) || m.name?.toLowerCase() === curBase.replace(/\.gguf$/i, "");
      }) || null;
    };

    const updateHWWarn = () => {
      const modelMeta = getModelMeta();
      const plan = calcPlan(_cachedHW, modelMeta, currentSettings.context_length || 4096);
      const tuneBtn = hwCard.querySelector(".ds-sensei-autotune-btn");
      if (tuneBtn) {
        const rec = plan.recommended === -1 ? "ALL" : plan.recommended;
        tuneBtn.innerHTML = `💡 Auto-Tune (${rec})`;
      }

      const curLayers = currentSettings.n_gpu_layers ?? -1;
      if (!_cachedHW || !plan.hasGpu) {
        if (curLayers !== 0) {
          hwWarn.innerHTML = `${DSIconMarkup("alert-circle", { size: 12, color: "#f59e0b" })}<span>No dedicated GPU detected. Set GPU Layers to 0 (CPU Only).</span>`;
          hwWarn.classList.add("is-visible");
        } else {
          hwWarn.classList.remove("is-visible");
        }
        return;
      }

      if (!plan.fits100Percent && (curLayers === -1 || curLayers > plan.safeLayers + 2)) {
        const mName = modelMeta?.name || "Selected model";
        hwWarn.innerHTML = `${DSIconMarkup("alert-circle", { size: 12, color: "#f59e0b" })}<span><strong>${mName}</strong> requires ~${plan.totalRequiredGB}GB VRAM for 100% offload, exceeding your ${plan.totalVramGB}GB VRAM. Recommended: <strong>${plan.recommended} layers</strong>.</span>`;
        hwWarn.classList.add("is-visible");
      } else {
        hwWarn.classList.remove("is-visible");
      }
    };

    let gpuStepper = null;

    const onAutoTune = () => {
      const modelMeta = getModelMeta();
      const plan = calcPlan(_cachedHW, modelMeta, currentSettings.context_length || 4096);
      currentSettings.n_gpu_layers = plan.recommended;
      if (gpuStepper) gpuStepper.setValue(plan.recommended);
      sync();
      updateHWWarn();
    };

    const loadModels = async () => {
      try {
        const res = await fetch("/ds/ai/models");
        const data = await res.json();
        if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
          cachedModels = data.models;
          const opts = data.models.map((m) => {
            const rootTag = m.root && m.root !== "ComfyUI" ? `[${m.root}] ` : "";
            const vis = m.has_vision ? " 👁️ Vision" : "";
            return {
              id: m.id,
              label: `${rootTag}${m.name} (${m.size_gb} GB)${vis}`,
            };
          });
          modelDd.setOptions(opts);

          if (!currentSettings.model || !opts.some((o) => o.id === currentSettings.model)) {
            currentSettings.model = opts[0].id;
            modelDd.setValue(opts[0].id);
            sync();
          }
        }
        updateHWWarn();
      } catch (_) {}
    };

    const loadHW = async () => {
      try {
        const res = await fetch("/ds/ai/hardware");
        const hw = await res.json();
        _cachedHW = hw;
        const nameEl = hwCard.querySelector(".ds-sensei-hw-name");
        const btn = hwCard.querySelector(".ds-sensei-autotune-btn");
        if (nameEl) {
          if (!hw.has_gpu || !hw.total_vram_mb) {
            nameEl.textContent = `CPU Only (${Math.round((hw.system_ram_mb || 0) / 1024)}GB RAM)`;
          } else {
            nameEl.textContent = `${hw.gpu_name} (${(hw.total_vram_mb / 1024).toFixed(1)}GB VRAM)`;
          }
        }
        if (btn) {
          btn.style.display = "inline-flex";
          btn.onclick = onAutoTune;
        }
        updateHWWarn();
      } catch (_) {}
    };

    rescanBtn.onclick = () => {
      loadModels();
      refreshStatus();
    };

    loadModels();
    loadHW();

    // 4. Sampling Section
    const sampHdr = document.createElement("div");
    sampHdr.className = "ds-sensei-gear-section-label";
    sampHdr.textContent = "Sampling";
    scroll.appendChild(sampHdr);

    const sampRow1 = document.createElement("div");
    sampRow1.className = "ds-sensei-gear-row-2col";

    // Temperature
    const tempField = document.createElement("div");
    tempField.className = "ds-sensei-gear-field";
    tempField.innerHTML = `<label class="ds-sensei-gear-label">Temperature</label>`;
    const tempSt = Spinbox({
      value: currentSettings.temperature ?? 0.8,
      min: 0.0,
      max: 2.0,
      step: 0.05,
      decimals: 2,
      width: "100%",
      onChange: (v) => {
        currentSettings.temperature = parseFloat(v) ?? 0.8;
        sync();
      },
    });
    tempField.appendChild(tempSt.wrap);

    // Max Tokens
    const maxTokField = document.createElement("div");
    maxTokField.className = "ds-sensei-gear-field";
    maxTokField.innerHTML = `<label class="ds-sensei-gear-label">Max Tokens</label>`;
    const maxTokSt = Spinbox({
      value: currentSettings.max_tokens ?? 2048,
      min: 64,
      max: 8192,
      step: 128,
      decimals: 0,
      width: "100%",
      onChange: (v) => {
        currentSettings.max_tokens = parseInt(v) || 2048;
        sync();
      },
    });
    maxTokField.appendChild(maxTokSt.wrap);

    sampRow1.append(tempField, maxTokField);
    scroll.appendChild(sampRow1);

    // Context & GPU Layers
    const sampRow2 = document.createElement("div");
    sampRow2.className = "ds-sensei-gear-row-2col";

    const ctxField = document.createElement("div");
    ctxField.className = "ds-sensei-gear-field";
    ctxField.innerHTML = `<label class="ds-sensei-gear-label">Context Length</label>`;
    const ctxSt = Spinbox({
      value: currentSettings.context_length ?? 4096,
      min: 1024,
      max: 32768,
      step: 1024,
      decimals: 0,
      width: "100%",
      onChange: (v) => {
        currentSettings.context_length = parseInt(v) || 4096;
        sync();
        updateHWWarn();
      },
    });
    ctxField.appendChild(ctxSt.wrap);

    const gpuField = document.createElement("div");
    gpuField.className = "ds-sensei-gear-field";
    gpuField.innerHTML = `<label class="ds-sensei-gear-label">GPU Layers (-1=All)</label>`;
    gpuStepper = Spinbox({
      value: currentSettings.n_gpu_layers ?? -1,
      min: -1,
      max: 128,
      step: 1,
      decimals: 0,
      width: "100%",
      onChange: (v) => {
        currentSettings.n_gpu_layers = isNaN(parseInt(v)) ? -1 : parseInt(v);
        sync();
        updateHWWarn();
      },
    });
    gpuField.appendChild(gpuStepper.wrap);

    sampRow2.append(ctxField, gpuField);
    scroll.appendChild(sampRow2);

    // 5. Advanced Sampling Section
    const advHdr = document.createElement("div");
    advHdr.className = "ds-sensei-gear-section-label";
    advHdr.textContent = "Advanced Sampling";
    scroll.appendChild(advHdr);

    const advRow = document.createElement("div");
    advRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;width:100%;box-sizing:border-box;";

    const topPField = document.createElement("div");
    topPField.className = "ds-sensei-gear-field";
    topPField.innerHTML = `<label class="ds-sensei-gear-label">Top P</label>`;
    const topPSt = Spinbox({
      value: currentSettings.top_p ?? 0.90,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      decimals: 2,
      width: "100%",
      onChange: (v) => {
        currentSettings.top_p = parseFloat(v) ?? 0.90;
        sync();
      },
    });
    topPField.appendChild(topPSt.wrap);

    const topKField = document.createElement("div");
    topKField.className = "ds-sensei-gear-field";
    topKField.innerHTML = `<label class="ds-sensei-gear-label">Top K</label>`;
    const topKSt = Spinbox({
      value: currentSettings.top_k ?? 40,
      min: 0,
      max: 200,
      step: 5,
      decimals: 0,
      width: "100%",
      onChange: (v) => {
        currentSettings.top_k = parseInt(v) ?? 40;
        sync();
      },
    });
    topKField.appendChild(topKSt.wrap);

    const repField = document.createElement("div");
    repField.className = "ds-sensei-gear-field";
    repField.innerHTML = `<label class="ds-sensei-gear-label">Rep. Pen.</label>`;
    const repSt = Spinbox({
      value: currentSettings.repetition_penalty ?? 1.10,
      min: 1.0,
      max: 2.0,
      step: 0.05,
      decimals: 2,
      width: "100%",
      onChange: (v) => {
        currentSettings.repetition_penalty = parseFloat(v) ?? 1.10;
        sync();
      },
    });
    repField.appendChild(repSt.wrap);

    advRow.append(topPField, topKField, repField);
    scroll.appendChild(advRow);

    // Seed Field
    const seedField = document.createElement("div");
    seedField.className = "ds-sensei-gear-field";
    const sHdr = document.createElement("div");
    sHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";
    const sLbl = document.createElement("label");
    sLbl.className = "ds-sensei-gear-label";
    sLbl.textContent = "Seed";

    const diceBtn = document.createElement("button");
    diceBtn.type = "button";
    diceBtn.className = "ds-sensei-btn-compact";
    diceBtn.style.cssText = "height:16px;line-height:16px;padding:0 6px;font-size:10px;font-weight:700;color:var(--ds-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;";
    diceBtn.textContent = "🎲 Roll";

    sHdr.append(sLbl, diceBtn);
    seedField.appendChild(sHdr);

    const seedInp = document.createElement("input");
    seedInp.type = "number";
    seedInp.className = "ds-sensei-input ds-ai-seed-input";
    seedInp.style.cssText = "width:100%;box-sizing:border-box;min-width:0;text-align:center;";
    seedInp.value = currentSettings.seed ?? 123456;
    seedInp.onchange = () => {
      currentSettings.seed = parseInt(seedInp.value) || 0;
      sync();
    };
    diceBtn.onclick = () => {
      const r = Math.floor(Math.random() * 2147483647);
      currentSettings.seed = r;
      seedInp.value = r;
      sync();
    };
    seedField.appendChild(seedInp);
    scroll.appendChild(seedField);

    // Unload Model Now Button
    const unloadBtn = document.createElement("button");
    unloadBtn.type = "button";
    unloadBtn.className = "ds-ui-btn ds-ui-btn-secondary ds-sensei-gear-unload-btn";
    unloadBtn.innerHTML = `${DSIconMarkup("trash-2", { size: 12, color: "var(--ds-color-danger, #f87171)" })}<span>Unload Model Now</span>`;
    unloadBtn.onclick = async () => {
      unloadBtn.disabled = true;
      try {
        await fetch("/ds/ai/unload", { method: "POST" });
        refreshStatus();
      } catch (_) {}
      unloadBtn.disabled = false;
    };
    scroll.appendChild(unloadBtn);
  };

  // ─────────────────────────────────────────────────────────────
  // TAB 2: SETTINGS (Behavior Toggles & Custom System Prompt)
  // ─────────────────────────────────────────────────────────────
  const renderSettingsTab = (scroll) => {
    // 1. Behavior & Execution Toggles
    const behLbl = document.createElement("div");
    behLbl.className = "ds-sensei-gear-section-label";
    behLbl.textContent = "Workflow & Behavior Options";
    scroll.appendChild(behLbl);

    const behBox = document.createElement("div");
    behBox.className = "ds-sensei-gear-behavior-box";

    // Auto-load on Queue
    const autoLoadToggle = Toggle({
      label: "Auto-load & randomize on workflow Queue",
      description: "When Queue is clicked, automatically runs AI randomization.",
      checked: currentSettings.auto_load !== false,
      onChange: (checked) => {
        currentSettings.auto_load = checked;
        sync();
      },
    });
    behBox.appendChild(autoLoadToggle.root);

    // Pause for edit
    const pauseToggle = Toggle({
      label: "Pause for edit before workflow execution",
      description: "When OFF: unloads LLM and continues workflow without pausing.",
      checked: Boolean(currentSettings.pause_for_edit),
      onChange: (checked) => {
        currentSettings.pause_for_edit = checked;
        sync();
      },
    });
    behBox.appendChild(pauseToggle.root);

    // Auto-unload after generation
    const autoUnloadToggle = Toggle({
      label: "Auto-unload model after prompt creation",
      description: "Frees LLM VRAM immediately so diffusion has 100% memory.",
      checked: currentSettings.auto_unload !== false,
      onChange: (checked) => {
        currentSettings.auto_unload = checked;
        sync();
      },
    });
    behBox.appendChild(autoUnloadToggle.root);

    // Free ComfyUI models before loading
    const freeComfyToggle = Toggle({
      label: "Free ComfyUI models before loading LLM",
      description: "Soft unloads cached diffusion models before allocating LLM VRAM.",
      checked: currentSettings.free_comfy_memory !== false,
      onChange: (checked) => {
        currentSettings.free_comfy_memory = checked;
        sync();
      },
    });
    behBox.appendChild(freeComfyToggle.root);

    // Randomize seed each generation
    const randSeedToggle = Toggle({
      label: "Randomize seed each generation",
      description: "Generates a fresh random variation on every queue run.",
      checked: currentSettings.randomize_seed !== false,
      onChange: (checked) => {
        currentSettings.randomize_seed = checked;
        sync();
      },
    });
    behBox.appendChild(randSeedToggle.root);

    scroll.appendChild(behBox);

    // 2. Custom System Prompt Section
    const sysLbl = document.createElement("div");
    sysLbl.className = "ds-sensei-gear-section-label";
    sysLbl.style.marginTop = "8px";
    sysLbl.textContent = "System Prompt";
    scroll.appendChild(sysLbl);

    const sysDesc = document.createElement("small");
    sysDesc.style.cssText = "color:rgba(255,255,255,0.5);font-size:10px;line-height:1.3;display:block;";
    sysDesc.textContent = "Custom instructions governing LLM semantic parsing and randomization.";
    scroll.appendChild(sysDesc);

    const sysTa = document.createElement("textarea");
    sysTa.className = "ds-ai-textarea";
    sysTa.placeholder = "Enter custom system prompt (leave empty for default)...";
    sysTa.value = currentSettings.system_prompt || DEFAULT_SYSTEM_PROMPT;
    sysTa.onchange = () => {
      currentSettings.system_prompt = sysTa.value.trim();
      sync();
    };
    scroll.appendChild(sysTa);

    const sysActions = document.createElement("div");
    sysActions.style.cssText = "display:flex;justify-content:flex-end;gap:6px;width:100%;margin-top:2px;";

    const resetSysBtn = Button({
      label: "Reset Default System Prompt",
      size: "compact",
      icon: "refresh-cw",
      tooltip: "Restore default AI Randomizer system prompt",
      onClick: () => {
        currentSettings.system_prompt = DEFAULT_SYSTEM_PROMPT;
        sysTa.value = DEFAULT_SYSTEM_PROMPT;
        sync();
      },
    });
    sysActions.appendChild(resetSysBtn.root);
    scroll.appendChild(sysActions);

    // ── Randomizer-specific settings (only rendered for DS Randomizer node) ──
    if (title && title.includes("Randomizer")) {
      const randLbl = document.createElement("div");
      randLbl.className = "ds-sensei-gear-section-label";
      randLbl.style.marginTop = "10px";
      randLbl.textContent = "Variation & Coherence";
      scroll.appendChild(randLbl);

      const randBox = document.createElement("div");
      randBox.className = "ds-sensei-gear-behavior-box";

      // Feature A: Variation Cache toggle
      const varCacheToggle = Toggle({
        label: "Variation Cache (no repeats)",
        description: "Tracks used values per category and tells the LLM to avoid them (10-run batches).",
        checked: currentSettings.variation_cache !== false,
        onChange: (checked) => {
          currentSettings.variation_cache = checked;
          sync();
        },
      });
      randBox.appendChild(varCacheToggle.root);

      // Feature B: Contextual Coherence toggle
      const coherenceToggle = Toggle({
        label: "Contextual Coherence",
        description: "Instructs the LLM to reason about pose, height, surfaces and clothing before choosing values.",
        checked: currentSettings.contextual_coherence !== false,
        onChange: (checked) => {
          currentSettings.contextual_coherence = checked;
          sync();
        },
      });
      randBox.appendChild(coherenceToggle.root);

      scroll.appendChild(randBox);

      // Clear Cache button — wired to new route, separate from DB shuffle-bag reset
      const clearCacheActions = document.createElement("div");
      clearCacheActions.style.cssText = "display:flex;justify-content:flex-start;gap:6px;width:100%;margin-top:4px;";

      const clearCacheBtn = Button({
        label: "Clear Variation Cache",
        size: "compact",
        icon: "trash-2",
        variant: "danger",
        tooltip: "Reset the per-category variation history for this node",
        onClick: async () => {
          try {
            const nodeId = node?.id != null ? String(node.id) : "";
            await fetch("/ds/randomizer/ai_reset_history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ node_id: nodeId }),
            });
            clearCacheBtn.setLabel("Cleared!");
            setTimeout(() => clearCacheBtn.setLabel("Clear Variation Cache"), 1800);
          } catch (_) {
            clearCacheBtn.setLabel("Error");
            setTimeout(() => clearCacheBtn.setLabel("Clear Variation Cache"), 1800);
          }
        },
      });
      clearCacheActions.appendChild(clearCacheBtn.root);
      scroll.appendChild(clearCacheActions);
    }
  };

  // Initial render
  document.body.appendChild(popover);
  renderPopover();

  // Register active popover reference for live seed sync
  window._dsUpdateActiveAIPopover = {
    node,
    setSeed: (newSeed) => {
      currentSettings.seed = newSeed;
      const seedInp = popover.querySelector(".ds-ai-seed-input");
      if (seedInp) seedInp.value = newSeed;
    },
  };

  // Position relative to anchor or node with anti-clipping upward shift
  function adjustPosition() {
    if (!popover.isConnected) return;
    const pw = Math.min(380, window.innerWidth - 30);
    popover.style.width = `${pw}px`;

    const scrollBody = popover.querySelector(".ds-sensei-gear-scroll-body");
    const nonScrollH = popover.offsetHeight - (scrollBody ? scrollBody.clientHeight : 0);
    const neededContentH = (scrollBody ? scrollBody.scrollHeight : popover.scrollHeight) + Math.max(0, nonScrollH);

    const maxScreenH = window.innerHeight - 30; // 15px margin top and bottom
    const desiredH = Math.min(neededContentH, maxScreenH);

    let idealLeft = 20;
    let idealTop = 20;

    const nodeEl = node?._dsCard || node?._domRoot;
    const nodeRect = (nodeEl && document.body.contains(nodeEl)) ? nodeEl.getBoundingClientRect() : null;
    const validAnchor = anchorEl && document.body.contains(anchorEl);
    const anchorRect = validAnchor ? anchorEl.getBoundingClientRect() : null;

    if (anchorRect) {
      idealLeft = anchorRect.left;
      if (idealLeft + pw > window.innerWidth - 15) {
        idealLeft = Math.max(15, anchorRect.right - pw);
      }
      if (anchorRect.bottom + desiredH <= window.innerHeight - 15) {
        idealTop = anchorRect.bottom + 8;
      } else {
        idealTop = anchorRect.top;
      }
    } else if (nodeRect) {
      if (nodeRect.right + pw + 16 <= window.innerWidth) {
        idealLeft = nodeRect.right + 12;
      } else if (nodeRect.left - pw - 16 >= 15) {
        idealLeft = nodeRect.left - pw - 12;
      } else {
        idealLeft = Math.max(15, window.innerWidth - pw - 15);
      }
      idealTop = nodeRect.top;
    } else if (node && node.pos) {
      try {
        const canvas = window.app?.canvas;
        const cRect = canvas?.canvas ? canvas.canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const scale = canvas?.ds?.scale ?? canvas?.scale ?? 1;
        const offset = canvas?.ds?.offset ?? canvas?.offset ?? [0, 0];
        const screenX = cRect.left + (node.pos[0] + offset[0]) * scale;
        const screenY = cRect.top + (node.pos[1] + offset[1]) * scale;
        const nodeW = (node.size ? node.size[0] : 420) * scale;

        idealLeft = screenX + nodeW + 16;
        if (idealLeft + pw > window.innerWidth - 15) {
          if (screenX - pw - 16 >= 15) idealLeft = screenX - pw - 16;
          else idealLeft = Math.max(15, window.innerWidth - pw - 15);
        }
        idealTop = screenY;
      } catch (_) {
        idealLeft = Math.max(15, window.innerWidth - pw - 25);
        idealTop = 60;
      }
    } else {
      idealLeft = Math.max(15, window.innerWidth - pw - 25);
      idealTop = 60;
    }

    idealLeft = Math.max(15, Math.min(idealLeft, window.innerWidth - pw - 15));

    // Shift upward into empty space above when needed so NO clipping or deformation occurs:
    let targetTop = idealTop;
    if (targetTop + desiredH > window.innerHeight - 15) {
      targetTop = window.innerHeight - desiredH - 15;
    }
    targetTop = Math.max(15, targetTop);

    const nextLeft = `${Math.round(idealLeft)}px`;
    const nextTop = `${Math.round(targetTop)}px`;
    const availableH = Math.max(200, window.innerHeight - targetTop - 15);
    const nextMaxH = `${Math.round(availableH)}px`;

    if (popover.style.left !== nextLeft) popover.style.left = nextLeft;
    if (popover.style.top !== nextTop) popover.style.top = nextTop;
    if (popover.style.maxHeight !== nextMaxH) popover.style.maxHeight = nextMaxH;
  }

  adjustPosition();
  requestAnimationFrame(adjustPosition);
  setTimeout(adjustPosition, 100);

  if (window.ResizeObserver) {
    if (_popoverRO) _popoverRO.disconnect();
    const scrollBody = popover.querySelector(".ds-sensei-gear-scroll-body");
    if (scrollBody) {
      _popoverRO = new ResizeObserver(() => {
        adjustPosition();
      });
      _popoverRO.observe(scrollBody);
    }
  }

  // Dismiss listeners with safe dropdown tolerance
  const onOutside = (e) => {
    // If click was inside a floating dropdown menu, DO NOT CLOSE
    if (
      e.target.closest?.(".ds-ui-dropdown-menu") ||
      e.target.closest?.(".ds-ui-dropdown-popover") ||
      e.target.closest?.(".ds-sensei-menu-popover") ||
      e.target.closest?.(".ds-ai-gear-popover")
    ) {
      return;
    }

    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeAIPopover();
      document.removeEventListener("pointerdown", onOutside);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") closeAIPopover();
  };

  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside);
    window.addEventListener("keydown", onKeyDown, true);
  }, 20);
}
