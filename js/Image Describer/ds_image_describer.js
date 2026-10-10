/**
 * Deathshot Arsenal — DS Image Describer
 * Local Multimodal Vision Prompt Extraction Node.
 * Adheres strictly to the Card-as-Base pattern (Guide-ComfyUI_Card_Layout_Template)
 * and unified UIElements design system.
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  DSIcon,
  DSIconMarkup,
  Field,
  Dropdown,
  Spinbox,
  Toggle,
  Button,
  installDSUI,
} from "../UIElements/index.js";

installDSUI();

// ---------------------------------------------------------------------------
// Stylesheet Loader
// ---------------------------------------------------------------------------
const CSS_ID = "ds-image-describer-css";
if (!document.getElementById(CSS_ID)) {
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = "/extensions/DeathshotArsenal/Image Describer/ds_image_describer.css";
  document.head.appendChild(link);
}

const NODE_TYPE = "DS_ImageDescriber";
const DISPLAY_NAME = "DS Image Describer";

const LAYOUT = {
  NODE_TO_CARD: 5,   // 5px margin between node border and card
  CARD_TO_UI: 10,    // 10px padding inside card
  GAP: 8,            // 8px gap between rows
  MIN_WIDTH: 488,    // Exact minimum width so control buttons never overlap
  MIN_HEIGHT: 380,   // Default minimum node height
};

const DEFAULT_SETTINGS = {
  model: "",
  temperature: 0.8,
  max_new_tokens: 2048,
  n_ctx: 4096,
  gpu_layers: -1,
  top_p: 0.90,
  top_k: 40,
  repeat_penalty: 1.10,
  min_p: 0.05,
  max_image_side: 1024,
  seed: -1,
  randomize_seed: true,
  detail_level: "Detailed",
  output_style: "Natural prose",
  prefix: "",
  suffix: "",
  cleanup_markdown: true,
  system_prompt: "",
  mode: "Auto",
  pause_to_edit: false,
  pause_timeout: 0,
  auto_unload: true,
  free_comfy_models: false,
  pass_through_image: false,
  debug_logging: false,
};

function copyToClipboard(text) {
  if (!text) return Promise.resolve(false);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

function showToast(message, duration = 2000) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
    "background:var(--ds-color-card, #12151c);color:var(--ds-color-accent, #67e8f9);padding:8px 16px;border-radius:6px;" +
    "font-size:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.6);" +
    "border:1px solid var(--ds-color-accent, #67e8f9);z-index:99999;pointer-events:none;transition:opacity 0.2s ease;";
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function hideAllNativeWidgets(node, keepWidget = null) {
  if (!Array.isArray(node.widgets)) return;
  for (const w of node.widgets) {
    if (w === keepWidget) continue;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    if (w.element) {
      w.element.style.display = "none";
      w.element.style.visibility = "hidden";
      w.element.style.pointerEvents = "none";
    }
    if (w.inputEl) {
      w.inputEl.style.display = "none";
      w.inputEl.style.visibility = "hidden";
      w.inputEl.style.pointerEvents = "none";
    }
  }
}

function bodyTop(node) {
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const titleH = globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  const slotStartY = node.constructor.slot_start_y ?? titleH;
  const inputs = (node.inputs ?? []).filter((i) => !i.widget).length;
  const outputs = (node.outputs ?? []).length;
  const rows = Math.max(inputs, outputs);
  return rows ? rows * slotH + slotStartY : titleH;
}

// ---------------------------------------------------------------------------
// Card Layout Builder
// ---------------------------------------------------------------------------
function createDescriberCard(node) {
  const nodeToCard = LAYOUT.NODE_TO_CARD;
  const cardToUi = LAYOUT.CARD_TO_UI;
  const gap = LAYOUT.GAP;
  const minWidth = LAYOUT.MIN_WIDTH;

  const el = document.createElement("div");
  el.className = "ds-describer-card";
  el.dataset.dsThemed = "true";

  const items = [];

  const minCardHeight = () => {
    const shown = items.filter((i) => i.visible);
    const content = shown.reduce((sum, i) => sum + (i.grow ? (i.minHeight || 100) : (i.height || 28)), 0);
    return 2 * cardToUi + content + gap * Math.max(0, shown.length - 1);
  };

  const widget = node.addDOMWidget("ds_describer_card", "custom", el, {
    margin: nodeToCard,
    serialize: false,
    getMinHeight: () => minCardHeight() + 2 * nodeToCard,
  });
  widget.serialize = false;

  // Align card start directly below sockets
  Object.defineProperty(node, "widgets_start_y", {
    configurable: true,
    get() {
      return bodyTop(this);
    },
    set() {},
  });

  // Calculate node minimum and fitted size
  const baseComputeSize = node.computeSize;
  node.computeSize = function (out) {
    const size = baseComputeSize.call(this, out);
    size[0] = Math.max(size[0], minWidth);
    const layoutWidgets = this.getLayoutWidgets?.() ?? this.widgets.filter((w) => !w.hidden);
    if (layoutWidgets.length === 1 && layoutWidgets[0] === widget) {
      size[1] = bodyTop(this) + minCardHeight() + 2 * nodeToCard;
    }
    return size;
  };

  // Click-through on empty card space for resizing handles
  const baseGetWidgetOnPos = node.getWidgetOnPos;
  node.getWidgetOnPos = function (...args) {
    const hit = baseGetWidgetOnPos.apply(this, args);
    return hit === widget ? undefined : hit;
  };

  let configured = false;
  const baseOnConfigure = node.onConfigure;
  node.onConfigure = function (...args) {
    configured = true;
    const r = baseOnConfigure?.apply(this, args);
    requestAnimationFrame(() => card.relayout());
    return r;
  };

  function add(child, spec = {}) {
    const item = { el: child, visible: true, ...spec };
    if (spec.grow) {
      child.classList.add("ds-describer-grow");
      child.style.minHeight = `${spec.minHeight || 100}px`;
    } else if (spec.height) {
      child.style.height = `${spec.height}px`;
      child.style.flex = `0 0 ${spec.height}px`;
    }
    item.show = (visible = true) => {
      item.visible = visible;
      child.style.display = visible ? "" : "none";
      card.relayout();
    };
    item.hide = () => item.show(false);
    items.push(item);
    el.append(child);
    card.relayout();
    return item;
  }

  const card = {
    el,
    widget,
    row(children, { height = 28 } = {}) {
      const rowEl = document.createElement("div");
      rowEl.style.display = "flex";
      rowEl.style.gap = `${gap}px`;
      rowEl.append(...[].concat(children));
      return add(rowEl, { height });
    },
    fixed(child, { height = 28 } = {}) {
      return add(child, { height });
    },
    grow(child, { minHeight = 120 } = {}) {
      return add(child, { grow: true, minHeight });
    },
    set(w, value) {
      if (!w) return;
      card.commit(() => {
        w.value = value;
        w.callback?.(w.value, app.canvas, node);
      });
    },
    commit(fn) {
      app.canvas?.emitBeforeChange?.();
      try {
        fn();
      } finally {
        app.canvas?.emitAfterChange?.();
        node.setDirtyCanvas?.(true, true);
      }
    },
    relayout({ shrink = false } = {}) {
      const min = node.computeSize();
      node.setSize([
        Math.max(node.size[0], min[0]),
        shrink ? min[1] : Math.max(node.size[1], min[1]),
      ]);
      node.setDirtyCanvas?.(true, true);
    },
  };

  requestAnimationFrame(() => {
    if (configured) return;
    const min = node.computeSize();
    node.setSize([
      Math.max(node.size?.[0] || LAYOUT.MIN_WIDTH, min[0]),
      Math.max(node.size?.[1] || LAYOUT.MIN_HEIGHT, min[1]),
    ]);
    node.setDirtyCanvas?.(true, true);
  });

  return card;
}

// ---------------------------------------------------------------------------
// Extension Registration
// ---------------------------------------------------------------------------
app.registerExtension({
  name: "DeathshotArsenal.ImageDescriber",

  async setup() {
    // Register with Deathshot Arsenal Floating Action Toolbar
    if (window.DSGearMenu?.register) {
      const gearConfig = {
        tooltip: "DS Image Describer Settings",
        onClick: (n, canvas, ev) => {
          const targetNode = n || app?.canvas?.current_node;
          if (targetNode?._openDescriberSettings) {
            targetNode._openDescriberSettings(ev?.currentTarget || ev?.target);
          }
        },
      };
      window.DSGearMenu.register(NODE_TYPE, gearConfig);
      window.DSGearMenu.register(DISPLAY_NAME, gearConfig);
    }
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function (...args) {
      const r = onNodeCreated?.apply(this, args);
      const node = this;

      // Initialize Card Surface
      const card = createDescriberCard(node);
      node.card = card;

      // Hide all native inputs to keep margin pristine
      hideAllNativeWidgets(node, card.widget);

      const wText = node.widgets?.find((w) => w.name === "text");
      const wState = node.widgets?.find((w) => w.name === "describer_state");

      // Load settings from widget state or defaults
      let currentSettings = { ...DEFAULT_SETTINGS };
      try {
        if (wState?.value) {
          const parsed = typeof wState.value === "string" ? JSON.parse(wState.value) : wState.value;
          currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
        }
      } catch (_) {}

      function saveSettings() {
        if (wState) {
          card.set(wState, JSON.stringify(currentSettings));
        }
        syncBadges();
      }

      // State variables
      let isRunning = false;
      let isPaused = false;
      let lastGeneratedText = wText?.value || "";
      let availableModels = [];
      let systemPromptPresets = {};
      let localImageBase64 = null;
      let activeSettingsPopup = null;

      // ---------------------------------------------------------------------
      // ROW 1: Header (Sparkles Icon, Title, Model Badge)
      // ---------------------------------------------------------------------
      const headerEl = document.createElement("div");
      headerEl.className = "ds-describer-header";

      const titleGroup = document.createElement("div");
      titleGroup.className = "ds-describer-title-group";
      titleGroup.appendChild(DSIcon("sparkles", { size: 14 }));
      const titleSpan = document.createElement("span");
      titleSpan.textContent = "DS Image Describer";
      titleGroup.appendChild(titleSpan);

      const badgesGroup = document.createElement("div");
      badgesGroup.className = "ds-describer-header-badges";

      const modelBadge = document.createElement("div");
      modelBadge.className = "ds-describer-model-badge";
      badgesGroup.appendChild(modelBadge);

      headerEl.appendChild(titleGroup);
      headerEl.appendChild(badgesGroup);
      card.fixed(headerEl, { height: 26 });

      function formatModelName(key) {
        if (!key) return "Auto Model";
        const base = key.split("/").pop().split("\\").pop().replace(".gguf", "");
        return base.length > 22 ? base.slice(0, 20) + "…" : base;
      }

      function syncBadges() {
        modelBadge.textContent = formatModelName(currentSettings.model);
        modelBadge.title = currentSettings.model || "Auto Detect Vision Model";
      }
      syncBadges();

      // ---------------------------------------------------------------------
      // ROW 2: Status Bar (State Pill + Live Telemetry)
      // ---------------------------------------------------------------------
      const statusBarEl = document.createElement("div");
      statusBarEl.className = "ds-describer-status-bar";

      const statusPill = document.createElement("div");
      statusPill.className = "ds-describer-status-pill status-idle";
      statusPill.textContent = "Idle";

      const metricsWrap = document.createElement("div");
      metricsWrap.className = "ds-describer-metrics";

      const tokensMetric = document.createElement("span");
      tokensMetric.className = "ds-describer-metric-item";
      tokensMetric.textContent = "0 tok";

      const speedMetric = document.createElement("span");
      speedMetric.className = "ds-describer-metric-item";
      speedMetric.textContent = "0.0 tok/s";

      const elapsedMetric = document.createElement("span");
      elapsedMetric.className = "ds-describer-metric-item";
      elapsedMetric.textContent = "0.0s";

      metricsWrap.append(tokensMetric, speedMetric, elapsedMetric);
      statusBarEl.append(statusPill, metricsWrap);
      card.fixed(statusBarEl, { height: 28 });

      // ---------------------------------------------------------------------
      // ROW 3: Controls (Run/Stop, Rerun, Continue, Copy, Clear, Kill LLM)
      // ---------------------------------------------------------------------
      const controlsEl = document.createElement("div");
      controlsEl.className = "ds-describer-controls";

      // Run / Stop Button
      const runBtn = document.createElement("button");
      runBtn.type = "button";
      runBtn.className = "ds-ui-btn ds-ui-btn-primary";
      runBtn.innerHTML = `${DSIconMarkup("play", { size: 12 })} Run`;
      runBtn.addEventListener("click", onRunStopClick);

      // Rerun Button
      const rerunBtn = document.createElement("button");
      rerunBtn.type = "button";
      rerunBtn.className = "ds-ui-btn ds-ui-btn-secondary";
      rerunBtn.innerHTML = `${DSIconMarkup("rotate-cw", { size: 11 })} Rerun`;
      rerunBtn.title = "Clear cache & re-analyze with current settings";
      rerunBtn.addEventListener("click", onRerunClick);

      // Continue Button (active when paused)
      const continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "ds-ui-btn ds-ui-btn-secondary ds-describer-btn-continue";
      continueBtn.innerHTML = `${DSIconMarkup("continue", { size: 11 })} Continue`;
      continueBtn.title = "Resume paused workflow execution with current prompt";
      continueBtn.addEventListener("click", onContinueClick);

      // Copy Button
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "ds-ui-btn ds-ui-btn-secondary";
      copyBtn.innerHTML = `${DSIconMarkup("copy", { size: 11 })} Copy`;
      copyBtn.title = "Copy prompt to clipboard";
      copyBtn.addEventListener("click", async () => {
        const txt = textareaEl.value;
        const ok = await copyToClipboard(txt);
        showToast(ok ? "Prompt copied to clipboard!" : "Failed to copy prompt");
      });

      // Clear Button
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "ds-ui-btn ds-ui-btn-secondary";
      clearBtn.innerHTML = `${DSIconMarkup("trash-2", { size: 11 })} Clear`;
      clearBtn.title = "Clear prompt field";
      clearBtn.addEventListener("click", () => {
        if (!textareaEl.value) return;
        card.set(wText, "");
        textareaEl.value = "";
        updateWordCount();
        showToast("Prompt cleared");
      });

      // Kill LLM Button
      const killBtn = document.createElement("button");
      killBtn.type = "button";
      killBtn.className = "ds-ui-btn ds-ui-btn-secondary";
      killBtn.innerHTML = `${DSIconMarkup("power", { size: 11 })} Kill LLM`;
      killBtn.title = "Stop generation and eject model from VRAM immediately";
      killBtn.addEventListener("click", onKillLLMClick);

      controlsEl.append(runBtn, rerunBtn, continueBtn, copyBtn, clearBtn, killBtn);
      card.fixed(controlsEl, { height: 28 });

      // ---------------------------------------------------------------------
      // ROW 4: Image Thumbnail (Click to Upload & Drag-and-Drop)
      // ---------------------------------------------------------------------
      const previewContainer = document.createElement("div");
      previewContainer.className = "ds-describer-preview-container";

      const previewHead = document.createElement("div");
      previewHead.className = "ds-describer-preview-head";
      previewHead.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px;">
          ${DSIconMarkup("image", { size: 12 })} Input Preview
        </span>
        <span style="cursor:pointer;opacity:0.85;">Click to Upload or Drop Image</span>
      `;

      // Hidden file input for click-to-upload
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      const thumbnailEl = document.createElement("div");
      thumbnailEl.className = "ds-describer-thumbnail";
      thumbnailEl.textContent = "Click to Upload Image / Drop Test Image Here";

      const thumbOverlay = document.createElement("div");
      thumbOverlay.className = "ds-describer-thumb-overlay";
      thumbOverlay.style.display = "none";
      thumbnailEl.appendChild(thumbOverlay);

      function handleFileSelected(file) {
        if (file && file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            localImageBase64 = evt.target.result;
            thumbnailEl.style.backgroundImage = `url("${localImageBase64}")`;
            thumbnailEl.textContent = "";
            thumbnailEl.appendChild(thumbOverlay);
            thumbOverlay.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
            thumbOverlay.style.display = "block";
            showToast(`Loaded ${file.name}`);
          };
          reader.readAsDataURL(file);
        }
      }

      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        handleFileSelected(file);
      });

      // Click anywhere on preview to trigger upload dialog
      thumbnailEl.addEventListener("click", () => fileInput.click());
      previewHead.addEventListener("click", () => fileInput.click());

      // Drag and drop
      thumbnailEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        thumbnailEl.classList.add("drag-over");
      });
      thumbnailEl.addEventListener("dragleave", () => {
        thumbnailEl.classList.remove("drag-over");
      });
      thumbnailEl.addEventListener("drop", (e) => {
        e.preventDefault();
        thumbnailEl.classList.remove("drag-over");
        const file = e.dataTransfer?.files?.[0];
        handleFileSelected(file);
      });

      previewContainer.append(previewHead, thumbnailEl);
      card.fixed(previewContainer, { height: 135 });

      // ---------------------------------------------------------------------
      // ROW 5: Large Prompt Textarea (Grow Area)
      // ---------------------------------------------------------------------
      const editorGrowEl = document.createElement("div");
      editorGrowEl.className = "ds-describer-editor-grow";

      const textareaWrap = document.createElement("div");
      textareaWrap.className = "ds-describer-textarea-wrap";

      const textareaEl = document.createElement("textarea");
      textareaEl.className = "ds-describer-textarea";
      textareaEl.placeholder = "Prompt description will be generated here or enter text directly...";
      textareaEl.value = wText?.value || "";

      textareaEl.addEventListener("input", () => {
        card.set(wText, textareaEl.value);
        updateWordCount();
      });

      textareaWrap.appendChild(textareaEl);

      // Footer with word count & restore
      const footerEl = document.createElement("div");
      footerEl.className = "ds-describer-footer";

      const countEl = document.createElement("div");
      countEl.className = "ds-describer-word-count";
      countEl.textContent = "0 words · 0 chars";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "ds-describer-restore-btn";
      restoreBtn.textContent = "Restore generated text";
      restoreBtn.style.display = "none";
      restoreBtn.addEventListener("click", () => {
        if (lastGeneratedText) {
          textareaEl.value = lastGeneratedText;
          card.set(wText, lastGeneratedText);
          updateWordCount();
          restoreBtn.style.display = "none";
          showToast("Restored generated prompt");
        }
      });

      footerEl.append(countEl, restoreBtn);
      editorGrowEl.append(textareaWrap, footerEl);
      card.grow(editorGrowEl, { minHeight: 120 });

      // ---------------------------------------------------------------------
      // Telemetry & State Helpers
      // ---------------------------------------------------------------------
      function updateWordCount() {
        const val = (textareaEl.value || "").trim();
        const chars = val.length;
        const words = val ? val.split(/\s+/).length : 0;
        countEl.textContent = `${words} words · ${chars} chars`;

        if (lastGeneratedText && val !== lastGeneratedText) {
          restoreBtn.style.display = "inline-block";
        } else {
          restoreBtn.style.display = "none";
        }
      }
      updateWordCount();

      function setStatus(state, msg) {
        statusPill.className = `ds-describer-status-pill status-${state.toLowerCase().split(" ")[0]}`;
        statusPill.textContent = state;
        if (msg) statusPill.title = msg;
      }

      function updateMetrics({ tokens = 0, maxTokens = null, speed = 0, elapsed = 0, ttft = null }) {
        tokensMetric.textContent = maxTokens ? `${tokens}/${maxTokens} tok` : `${tokens} tok`;
        speedMetric.textContent = `${Number(speed).toFixed(1)} tok/s`;
        elapsedMetric.textContent = `${Number(elapsed).toFixed(1)}s`;
        if (ttft) {
          elapsedMetric.title = `TTFT: ${Number(ttft).toFixed(2)}s`;
        }
      }

      // ---------------------------------------------------------------------
      // Button Actions
      // ---------------------------------------------------------------------
      async function onRunStopClick() {
        if (isRunning) {
          try {
            await fetch("/ds/describer/kill", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ node_id: node.id }),
            });
            setStatus("Stopped", "Generation stopped by user");
            isRunning = false;
            runBtn.innerHTML = `${DSIconMarkup("play", { size: 12 })} Run`;
            textareaEl.classList.remove("is-generating");
          } catch (e) {
            console.error("[Image Describer] Stop error:", e);
          }
          return;
        }

        if (localImageBase64) {
          runStandaloneGeneration(localImageBase64);
        } else if (app.queuePrompt) {
          app.queuePrompt(0, { batchCount: 1 });
        }
      }

      async function onRerunClick() {
        if (currentSettings.randomize_seed) {
          currentSettings.seed = Math.floor(Math.random() * 1000000000);
          saveSettings();
        }
        if (localImageBase64) {
          runStandaloneGeneration(localImageBase64);
        } else if (app.queuePrompt) {
          app.queuePrompt(0, { batchCount: 1 });
        }
      }

      async function onContinueClick() {
        if (!isPaused) {
          showToast("Node is not waiting in paused state");
          return;
        }
        try {
          await fetch("/ds/describer/continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: node.id, text: textareaEl.value }),
          });
          isPaused = false;
          continueBtn.classList.remove("is-active-pause");
          setStatus("Done", "Workflow execution resumed");
          showToast("Resuming workflow execution...");
        } catch (e) {
          console.error("[Image Describer] Continue error:", e);
        }
      }

      async function onKillLLMClick() {
        try {
          setStatus("Unloading", "Ejecting model from VRAM...");
          const res = await fetch("/ds/describer/unload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: node.id }),
          });
          const data = await res.json();
          setStatus("Idle", "Model ejected from VRAM");
          const vramMb = data.vram?.available_mb;
          showToast(vramMb ? `LLM unloaded! Free VRAM: ${vramMb} MB` : "LLM unloaded from VRAM");
        } catch (e) {
          console.error("[Image Describer] Kill LLM error:", e);
        }
      }

      async function runStandaloneGeneration(imgB64) {
        isRunning = true;
        setStatus("Loading model", "Loading vision model...");
        runBtn.innerHTML = `${DSIconMarkup("stop", { size: 12 })} Stop`;
        textareaEl.classList.add("is-generating");

        try {
          const res = await fetch("/ds/describer/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              node_id: node.id,
              image_base64: imgB64,
              settings: currentSettings,
            }),
          });
          const data = await res.json();
          if (data.ok && data.prompt) {
            textareaEl.value = data.prompt;
            lastGeneratedText = data.prompt;
            card.set(wText, data.prompt);
            updateWordCount();
            setStatus("Done", "Generation complete");
            updateMetrics({
              tokens: data.tokens,
              speed: data.speed,
              elapsed: data.elapsed,
              ttft: data.ttft,
            });
          } else if (data.error) {
            setStatus("Error", data.error);
            showToast(`Generation failed: ${data.error}`);
          }
        } catch (e) {
          setStatus("Error", String(e));
        } finally {
          isRunning = false;
          runBtn.innerHTML = `${DSIconMarkup("play", { size: 12 })} Run`;
          textareaEl.classList.remove("is-generating");
        }
      }

      // ---------------------------------------------------------------------
      // Helper: Spinbox Field Wrapper
      // ---------------------------------------------------------------------
      function mkSpinField(label, options) {
        const field = document.createElement("div");
        field.className = "ds-describer-gear-field";
        const lbl = document.createElement("label");
        lbl.className = "ds-describer-gear-label";
        lbl.textContent = label;
        const st = Spinbox({ ...options, width: "100%" });
        field.append(lbl, st.root);
        return { field, spinbox: st };
      }

      // ---------------------------------------------------------------------
      // Settings Popup (Docks strictly on the SIDE of the Node)
      // ---------------------------------------------------------------------
      function closeSettings() {
        if (activeSettingsPopup) {
          if (activeSettingsPopup.rafId) cancelAnimationFrame(activeSettingsPopup.rafId);
          if (activeSettingsPopup.onOutside) document.removeEventListener("pointerdown", activeSettingsPopup.onOutside);
          activeSettingsPopup.popup.remove();
          activeSettingsPopup = null;
        }
      }

      function openSettings() {
        if (activeSettingsPopup) {
          closeSettings();
          return;
        }

        const popup = document.createElement("div");
        popup.className = "ds-describer-settings-popup";
        popup.dataset.dsThemed = "true";
        popup.addEventListener("pointerdown", (e) => e.stopPropagation());
        popup.addEventListener("mousedown", (e) => e.stopPropagation());
        popup.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

        // Head
        const head = document.createElement("div");
        head.className = "ds-describer-settings-head";
        head.innerHTML = `<span>DS Image Describer Settings</span>`;
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
        closeBtn.innerHTML = DSIconMarkup("x", { size: 12 });
        closeBtn.addEventListener("click", closeSettings);
        head.appendChild(closeBtn);

        // Tabs
        const tabsEl = document.createElement("div");
        tabsEl.className = "ds-describer-gear-tabs";
        const tabModel = document.createElement("button");
        tabModel.type = "button";
        tabModel.className = "ds-describer-gear-tab-btn is-active";
        tabModel.textContent = "Model & Sampling";
        const tabControl = document.createElement("button");
        tabControl.type = "button";
        tabControl.className = "ds-describer-gear-tab-btn";
        tabControl.textContent = "Workflow & Execution";
        tabsEl.append(tabModel, tabControl);

        const bodyEl = document.createElement("div");
        bodyEl.className = "ds-describer-settings-body";

        function renderTab(tabIndex) {
          bodyEl.replaceChildren();

          if (tabIndex === 0) {
            // Model Dropdown (1 per row)
            const modelOptions = [
              { id: "", value: "", label: "Auto Detect Vision Model" },
              ...availableModels.map((m) => ({
                id: m.id,
                value: m.id,
                label: `${m.name} ${m.has_vision ? "★ [Vision]" : ""}`,
              })),
            ];
            const ddModel = Dropdown({
              label: "Vision Model (GGUF)",
              options: modelOptions,
              value: currentSettings.model,
              onChange: (val) => {
                currentSettings.model = val;
                saveSettings();
              },
            });
            bodyEl.appendChild(ddModel.root);

            // Detail Preset Dropdown (1 per row)
            const ddDetail = Dropdown({
              label: "Detail Level Preset",
              options: [
                { id: "Detailed", value: "Detailed", label: "Detailed (Default)" },
                { id: "Concise", value: "Concise", label: "Concise" },
                { id: "Exhaustive", value: "Exhaustive", label: "Exhaustive" },
              ],
              value: currentSettings.detail_level,
              onChange: (val) => {
                currentSettings.detail_level = val;
                saveSettings();
              },
            });
            bodyEl.appendChild(ddDetail.root);

            // Output Style Dropdown (1 per row)
            const ddStyle = Dropdown({
              label: "Output Style",
              options: [
                { id: "Natural prose", value: "Natural prose", label: "Natural prose" },
                { id: "Comma-separated tags", value: "Comma-separated tags", label: "Comma-separated tags" },
                { id: "Both", value: "Both", label: "Both (Prose + Tags)" },
              ],
              value: currentSettings.output_style,
              onChange: (val) => {
                currentSettings.output_style = val;
                saveSettings();
              },
            });
            bodyEl.appendChild(ddStyle.root);

            // Sampling Section
            const sampHdr = document.createElement("div");
            sampHdr.className = "ds-describer-gear-section-label";
            sampHdr.textContent = "Sampling";
            bodyEl.appendChild(sampHdr);

            // Temperature & Max Tokens (2 columns)
            const sampRow1 = document.createElement("div");
            sampRow1.className = "ds-describer-gear-row-2col";

            const tempField = mkSpinField("Temperature", {
              value: currentSettings.temperature ?? 0.8,
              min: 0.0,
              max: 2.0,
              step: 0.05,
              decimals: 2,
              onChange: (v) => {
                currentSettings.temperature = parseFloat(v) ?? 0.8;
                saveSettings();
              },
            });

            const maxTokField = mkSpinField("Max Tokens", {
              value: currentSettings.max_new_tokens ?? 2048,
              min: 64,
              max: 8192,
              step: 128,
              decimals: 0,
              onChange: (v) => {
                currentSettings.max_new_tokens = parseInt(v) || 2048;
                saveSettings();
              },
            });

            sampRow1.append(tempField.field, maxTokField.field);
            bodyEl.appendChild(sampRow1);

            // Context Length & GPU Layers (2 columns)
            const sampRow2 = document.createElement("div");
            sampRow2.className = "ds-describer-gear-row-2col";

            const ctxField = mkSpinField("Context Length", {
              value: currentSettings.n_ctx ?? 4096,
              min: 1024,
              max: 32768,
              step: 1024,
              decimals: 0,
              onChange: (v) => {
                currentSettings.n_ctx = parseInt(v) || 4096;
                saveSettings();
              },
            });

            const gpuField = mkSpinField("GPU Layers (-1=All)", {
              value: currentSettings.gpu_layers ?? -1,
              min: -1,
              max: 128,
              step: 1,
              decimals: 0,
              onChange: (v) => {
                currentSettings.gpu_layers = isNaN(parseInt(v)) ? -1 : parseInt(v);
                saveSettings();
              },
            });

            sampRow2.append(ctxField.field, gpuField.field);
            bodyEl.appendChild(sampRow2);

            // Advanced Sampling Section
            const advHdr = document.createElement("div");
            advHdr.className = "ds-describer-gear-section-label";
            advHdr.textContent = "Advanced Sampling";
            bodyEl.appendChild(advHdr);

            // Top-P, Top-K, Rep. Penalty (3 columns)
            const advRow = document.createElement("div");
            advRow.className = "ds-describer-gear-row-3col";

            const topPField = mkSpinField("Top P", {
              value: currentSettings.top_p ?? 0.90,
              min: 0.0,
              max: 1.0,
              step: 0.05,
              decimals: 2,
              onChange: (v) => {
                currentSettings.top_p = parseFloat(v) ?? 0.90;
                saveSettings();
              },
            });

            const topKField = mkSpinField("Top K", {
              value: currentSettings.top_k ?? 40,
              min: 0,
              max: 200,
              step: 5,
              decimals: 0,
              onChange: (v) => {
                currentSettings.top_k = parseInt(v) ?? 40;
                saveSettings();
              },
            });

            const repField = mkSpinField("Rep. Penalty", {
              value: currentSettings.repeat_penalty ?? 1.10,
              min: 1.0,
              max: 2.0,
              step: 0.05,
              decimals: 2,
              onChange: (v) => {
                currentSettings.repeat_penalty = parseFloat(v) ?? 1.10;
                saveSettings();
              },
            });

            advRow.append(topPField.field, topKField.field, repField.field);
            bodyEl.appendChild(advRow);

            // Min-P & Max Image Side (2 columns)
            const advRow2 = document.createElement("div");
            advRow2.className = "ds-describer-gear-row-2col";

            const minPField = mkSpinField("Min P", {
              value: currentSettings.min_p ?? 0.05,
              min: 0.0,
              max: 1.0,
              step: 0.01,
              decimals: 2,
              onChange: (v) => {
                currentSettings.min_p = parseFloat(v) ?? 0.05;
                saveSettings();
              },
            });

            const maxSideField = mkSpinField("Max Image Side (px)", {
              value: currentSettings.max_image_side ?? 1024,
              min: 256,
              max: 2048,
              step: 64,
              decimals: 0,
              onChange: (v) => {
                currentSettings.max_image_side = parseInt(v) || 1024;
                saveSettings();
              },
            });

            advRow2.append(minPField.field, maxSideField.field);
            bodyEl.appendChild(advRow2);

            // Seed Field with Roll Button
            const seedField = document.createElement("div");
            seedField.className = "ds-describer-gear-field";
            const sHdr = document.createElement("div");
            sHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";
            const sLbl = document.createElement("label");
            sLbl.className = "ds-describer-gear-label";
            sLbl.textContent = "Seed";

            const rollBtn = document.createElement("button");
            rollBtn.type = "button";
            rollBtn.style.cssText = "height:18px;line-height:18px;padding:0 6px;font-size:10px;font-weight:700;color:var(--ds-color-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;";
            rollBtn.innerHTML = `🎲 <span>Roll</span>`;

            sHdr.append(sLbl, rollBtn);
            seedField.appendChild(sHdr);

            const seedInput = document.createElement("input");
            seedInput.type = "number";
            seedInput.className = "ds-ui-input";
            seedInput.style.textAlign = "center";
            seedInput.value = currentSettings.seed ?? -1;
            seedInput.placeholder = "-1 for random";
            seedInput.addEventListener("change", () => {
              currentSettings.seed = parseInt(seedInput.value) || -1;
              saveSettings();
            });

            rollBtn.addEventListener("click", () => {
              const newSeed = Math.floor(Math.random() * 1000000000);
              seedInput.value = newSeed;
              currentSettings.seed = newSeed;
              saveSettings();
              showToast(`New Seed: ${newSeed}`);
            });

            seedField.appendChild(seedInput);
            bodyEl.appendChild(seedField);

            // Prompt Customization Section
            const promptHdr = document.createElement("div");
            promptHdr.className = "ds-describer-gear-section-label";
            promptHdr.textContent = "Prompt Customization";
            bodyEl.appendChild(promptHdr);

            const inputPrefix = document.createElement("input");
            inputPrefix.className = "ds-ui-input";
            inputPrefix.value = currentSettings.prefix || "";
            inputPrefix.placeholder = "e.g. cinematic photograph, masterwork";
            inputPrefix.addEventListener("change", () => {
              currentSettings.prefix = inputPrefix.value;
              saveSettings();
            });
            const fieldPrefix = Field({ label: "Prefix (Prepended to prompt)", control: inputPrefix });
            bodyEl.appendChild(fieldPrefix.root);

            const inputSuffix = document.createElement("input");
            inputSuffix.className = "ds-ui-input";
            inputSuffix.value = currentSettings.suffix || "";
            inputSuffix.placeholder = "e.g. 35mm film grain, 4k";
            inputSuffix.addEventListener("change", () => {
              currentSettings.suffix = inputSuffix.value;
              saveSettings();
            });
            const fieldSuffix = Field({ label: "Suffix (Appended to prompt)", control: inputSuffix });
            bodyEl.appendChild(fieldSuffix.root);

            // System Prompt Editor
            const txtSys = document.createElement("textarea");
            txtSys.className = "ds-describer-sys-textarea";
            txtSys.value = currentSettings.system_prompt || "";
            txtSys.placeholder = "Leave blank to use default system prompt for active preset...";
            txtSys.addEventListener("change", () => {
              currentSettings.system_prompt = txtSys.value;
              saveSettings();
            });

            const resetSysBtn = Button({
              label: "Reset System Prompt to Preset Default",
              variant: "secondary",
              size: "compact",
              onClick: () => {
                const preset = systemPromptPresets[currentSettings.detail_level || "Detailed"] || "";
                txtSys.value = preset;
                currentSettings.system_prompt = preset;
                saveSettings();
                showToast("System prompt reset");
              },
            });

            const sysWrap = document.createElement("div");
            sysWrap.style.display = "flex";
            sysWrap.style.flexDirection = "column";
            sysWrap.style.gap = "4px";
            sysWrap.append(txtSys, resetSysBtn.root);

            const fieldSys = Field({ label: "System Prompt Override", control: sysWrap });
            bodyEl.appendChild(fieldSys.root);
          } else {
            // Execution Mode
            const ddMode = Dropdown({
              label: "Execution Mode",
              options: [
                { id: "Auto", value: "Auto", label: "Auto (Re-analyze on change, reuse otherwise)" },
                { id: "Always re-analyze", value: "Always re-analyze", label: "Always re-analyze on every run" },
                { id: "Use text only", value: "Use text only", label: "Use text only (Never run LLM)" },
              ],
              value: currentSettings.mode,
              onChange: (val) => {
                currentSettings.mode = val;
                saveSettings();
              },
            });
            bodyEl.appendChild(ddMode.root);

            // Workflow Box: Pause & Timeout
            const box1 = document.createElement("div");
            box1.className = "ds-describer-gear-box";

            const tgPause = Toggle({
              label: "Pause to Edit Prompt",
              value: currentSettings.pause_to_edit,
              onChange: (val) => {
                currentSettings.pause_to_edit = val;
                saveSettings();
              },
            });

            const timeoutField = mkSpinField("Pause Timeout (0 = Forever, seconds)", {
              value: currentSettings.pause_timeout || 0,
              min: 0,
              max: 3600,
              step: 5,
              decimals: 0,
              onChange: (v) => {
                currentSettings.pause_timeout = parseInt(v) || 0;
                saveSettings();
              },
            });

            box1.append(tgPause.root, timeoutField.field);
            bodyEl.appendChild(box1);

            // Memory Box: Unload & Free
            const box2 = document.createElement("div");
            box2.className = "ds-describer-gear-box";

            const tgUnload = Toggle({
              label: "Auto Unload Model After Run",
              value: currentSettings.auto_unload,
              onChange: (val) => {
                currentSettings.auto_unload = val;
                saveSettings();
              },
            });

            const tgFree = Toggle({
              label: "Free ComfyUI Models Before Run (Low VRAM)",
              value: currentSettings.free_comfy_models,
              onChange: (val) => {
                currentSettings.free_comfy_models = val;
                saveSettings();
              },
            });

            const ejectBtn = Button({
              label: "Eject LLM from VRAM Now",
              icon: "trash",
              variant: "danger",
              onClick: async () => {
                await killActiveGeneration(true);
                showToast("LLM model unloaded & VRAM cleared!");
              },
            });
            ejectBtn.root.style.marginTop = "6px";

            box2.append(tgUnload.root, tgFree.root, ejectBtn.root);
            bodyEl.appendChild(box2);

            // Pipeline Box: Pass-through & Debug
            const box3 = document.createElement("div");
            box3.className = "ds-describer-gear-box";

            const tgPass = Toggle({
              label: "Pass-through Input Image to Output",
              value: currentSettings.pass_through_image,
              onChange: (val) => {
                currentSettings.pass_through_image = val;
                saveSettings();
              },
            });

            const tgDebug = Toggle({
              label: "Debug Logging",
              value: currentSettings.debug_logging,
              onChange: (val) => {
                currentSettings.debug_logging = val;
                saveSettings();
              },
            });

            box3.append(tgPass.root, tgDebug.root);
            bodyEl.appendChild(box3);

            // Open Log Viewer Button
            const logBtn = Button({
              label: "Open Realtime Log Viewer",
              icon: "terminal",
              variant: "secondary",
              onClick: openLogViewerModal,
            });
            logBtn.root.style.marginTop = "6px";
            bodyEl.appendChild(logBtn.root);
          }
        }

        tabModel.addEventListener("click", () => {
          tabModel.classList.add("is-active");
          tabControl.classList.remove("is-active");
          renderTab(0);
        });

        tabControl.addEventListener("click", () => {
          tabControl.classList.add("is-active");
          tabModel.classList.remove("is-active");
          renderTab(1);
        });

        renderTab(0);
        popup.append(head, tabsEl, bodyEl);
        document.body.appendChild(popup);

        // Position popup strictly to the side of the node
        function positionPopup() {
          if (!popup.isConnected) return;
          const canvasEl = app?.canvas?.canvas || document.querySelector("canvas#graph-canvas") || document.querySelector("canvas");
          const ds = app?.canvas?.ds || window.app?.canvas?.ds;
          if (!canvasEl || !ds || !node?.pos || !node?.size) return;
          const cr = canvasEl.getBoundingClientRect();
          const scale = Number(ds.scale) || 1;
          const offset = ds.offset || [0, 0];
          const left = cr.left + (Number(node.pos[0] || 0) + Number(offset[0] || 0)) * scale;
          const top = cr.top + (Number(node.pos[1] || 0) + Number(offset[1] || 0)) * scale;
          const width = Number(node.size[0] || 488) * scale;
          const height = Number(node.size[1] || 380) * scale;
          const nr = { left, top, width, height, right: left + width, bottom: top + height };

          const pw = Math.max(popup.offsetWidth || 0, 440);
          const ph = Math.max(popup.offsetHeight || 0, 480);
          const margin = 12;
          const gap = 12;

          const spaceRight = window.innerWidth - nr.right - margin;
          const spaceLeft = nr.left - margin;

          let popLeft;
          if (spaceRight >= pw + gap) {
            popLeft = nr.right + gap;
          } else if (spaceLeft >= pw + gap) {
            popLeft = nr.left - pw - gap;
          } else if (spaceRight >= spaceLeft) {
            popLeft = nr.right + gap;
          } else {
            popLeft = nr.left - pw - gap;
          }

          popLeft = Math.max(margin, Math.min(popLeft, window.innerWidth - pw - margin));

          let popTop = nr.top;
          if (popTop + ph > window.innerHeight - margin) {
            popTop = window.innerHeight - ph - margin;
          }
          popTop = Math.max(margin, popTop);

          popup.style.left = `${Math.round(popLeft)}px`;
          popup.style.top = `${Math.round(popTop)}px`;
        }

        positionPopup();

        let rafId = null;
        function followLoop() {
          if (!popup.isConnected) return;
          positionPopup();
          rafId = requestAnimationFrame(followLoop);
        }
        rafId = requestAnimationFrame(followLoop);

        const onOutside = (e) => {
          if (!popup.contains(e.target) && !e.target.closest(".ds-floating-toolbar, .ds-gear-menu, #ds-gear-menu")) {
            closeSettings();
          }
        };
        setTimeout(() => {
          document.addEventListener("pointerdown", onOutside);
        }, 50);

        activeSettingsPopup = { popup, rafId, onOutside };
      }

      node._openDescriberSettings = openSettings;

      // ---------------------------------------------------------------------
      // Log Viewer Modal (Draggable)
      // ---------------------------------------------------------------------
      async function openLogViewerModal() {
        const modal = document.createElement("div");
        modal.className = "ds-describer-log-modal";
        modal.dataset.dsThemed = "true";

        const head = document.createElement("div");
        head.className = "ds-describer-log-head";
        head.innerHTML = `<span>DS Image Describer Log Stream</span>`;
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
        closeBtn.innerHTML = DSIconMarkup("x", { size: 12 });
        closeBtn.addEventListener("click", () => modal.remove());
        head.appendChild(closeBtn);

        // Make modal draggable by header
        let isDragging = false;
        let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
        head.addEventListener("mousedown", (e) => {
          if (e.target.closest("button")) return;
          isDragging = true;
          const rect = modal.getBoundingClientRect();
          startX = e.clientX;
          startY = e.clientY;
          initialLeft = rect.left;
          initialTop = rect.top;
          modal.style.transform = "none";
          modal.style.left = `${rect.left}px`;
          modal.style.top = `${rect.top}px`;

          const onMouseMove = (ev) => {
            if (!isDragging) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            modal.style.left = `${Math.max(10, Math.min(window.innerWidth - 100, initialLeft + dx))}px`;
            modal.style.top = `${Math.max(10, Math.min(window.innerHeight - 50, initialTop + dy))}px`;
          };

          const onMouseUp = () => {
            isDragging = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          };

          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);
        });

        const content = document.createElement("div");
        content.className = "ds-describer-log-content";
        content.textContent = "Loading logs...";

        modal.append(head, content);
        document.body.appendChild(modal);

        try {
          const res = await fetch("/ds/describer/logs");
          const data = await res.json();
          if (data.ok && Array.isArray(data.logs)) {
            content.replaceChildren();
            data.logs.forEach((item) => {
              const line = document.createElement("div");
              line.className = `ds-log-item level-${item.level}`;
              line.textContent = item.formatted || `[${item.time}] [${item.level}] ${item.message}`;
              content.appendChild(line);
            });
            content.scrollTop = content.scrollHeight;
          } else {
            content.textContent = "No log records found.";
          }
        } catch (e) {
          content.textContent = `Error fetching logs: ${e}`;
        }
      }

      // ---------------------------------------------------------------------
      // Initial Data Fetching (Models & Presets)
      // ---------------------------------------------------------------------
      async function loadInitialData() {
        try {
          const [resModels, resPresets] = await Promise.all([
            fetch("/ds/describer/models").then((r) => r.json()).catch(() => ({ models: [] })),
            fetch("/ds/describer/presets").then((r) => r.json()).catch(() => ({ presets: {} })),
          ]);
          if (resModels.models) availableModels = resModels.models;
          if (resPresets.presets) systemPromptPresets = resPresets.presets;
          syncBadges();
        } catch (_) {}
      }
      loadInitialData();

      // ---------------------------------------------------------------------
      // WebSocket Event Listeners
      // ---------------------------------------------------------------------
      function matchesNode(detail) {
        return !detail?.node_id || String(detail.node_id) === String(node.id);
      }

      api.addEventListener("ds_describer_status", ({ detail }) => {
        if (!matchesNode(detail)) return;
        setStatus(detail.status || "Writing prompt", detail.message);
        if (detail.tokens !== undefined) {
          updateMetrics({
            tokens: detail.tokens,
            speed: detail.speed,
            elapsed: detail.elapsed,
          });
        }
      });

      api.addEventListener("ds_describer_progress", ({ detail }) => {
        if (!matchesNode(detail)) return;
        isRunning = true;
        setStatus("Writing prompt", "Generating prompt...");
        if (detail.text) {
          textareaEl.value = detail.text;
          updateWordCount();
        }
        updateMetrics({
          tokens: detail.tokens,
          maxTokens: detail.max_tokens,
          speed: detail.speed,
          elapsed: detail.elapsed,
        });
      });

      api.addEventListener("ds_describer_paused", ({ detail }) => {
        if (!matchesNode(detail)) return;
        isPaused = true;
        setStatus("Paused (waiting for you)", "Workflow paused for prompt editing");
        continueBtn.classList.add("is-active-pause");
        if (detail.text) {
          textareaEl.value = detail.text;
          card.set(wText, detail.text);
          updateWordCount();
        }
        showToast("Workflow paused! Edit the prompt and click Continue.", 3500);
      });

      api.addEventListener("ds_describer_done", ({ detail }) => {
        if (!matchesNode(detail)) return;
        isRunning = false;
        isPaused = false;
        continueBtn.classList.remove("is-active-pause");
        runBtn.innerHTML = `${DSIconMarkup("play", { size: 12 })} Run`;
        textareaEl.classList.remove("is-generating");
        setStatus("Done", "Analysis complete");
        if (detail.text) {
          textareaEl.value = detail.text;
          lastGeneratedText = detail.text;
          card.set(wText, detail.text);
          updateWordCount();
        }
        updateMetrics({
          tokens: detail.tokens,
          speed: detail.speed,
          elapsed: detail.elapsed,
          ttft: detail.ttft,
        });
      });

      // ---------------------------------------------------------------------
      // Lifecycle Hooks
      // ---------------------------------------------------------------------
      const onConfigure = node.onConfigure;
      node.onConfigure = function (...args) {
        const res = onConfigure?.apply(this, args);
        hideAllNativeWidgets(node, card.widget);
        try {
          if (wState?.value) {
            const parsed = typeof wState.value === "string" ? JSON.parse(wState.value) : wState.value;
            currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
          }
        } catch (_) {}
        syncBadges();
        if (wText && textareaEl.value !== wText.value) {
          textareaEl.value = wText.value || "";
          updateWordCount();
        }
        return res;
      };

      const onExecuted = node.onExecuted;
      node.onExecuted = function (message) {
        onExecuted?.apply(this, arguments);
        const img = message?.describer_preview?.[0];
        if (img) {
          const q = new URLSearchParams({ ...img, rand: Math.random() });
          thumbnailEl.style.backgroundImage = `url("/view?${q}")`;
          thumbnailEl.textContent = "";
          thumbnailEl.appendChild(thumbOverlay);
          thumbOverlay.textContent = "Input Image";
          thumbOverlay.style.display = "block";
        }
        if (message?.prompt?.[0]) {
          textareaEl.value = message.prompt[0];
          lastGeneratedText = message.prompt[0];
          card.set(wText, message.prompt[0]);
          updateWordCount();
        }
      };

      return r;
    };
  },
});
