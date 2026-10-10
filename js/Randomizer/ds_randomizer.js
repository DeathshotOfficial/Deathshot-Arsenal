/**
 * DeathshotArsenal — DS Randomizer Node Extension
 * Overhauled to strict UIElements Design System.
 * Clean, flat 2-section hierarchy: Attribute Selection (Top) + Generated Prompt (Bottom).
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  Card,
  Button,
  DSIcon,
  DSIconMarkup,
  installDSUI,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
} from "../UIElements/index.js";
import { openAISettingsPopover } from "../Shared/ds_ai_settings_popover.js";

installDSUI();

const TYPE = "DS_Randomizer";
const EXT = "DeathshotArsenal.Randomizer";
const CSS_HREF = "/extensions/DeathshotArsenal/Randomizer/ds_randomizer.css";
const CSS_FALLBACK = new URL("./ds_randomizer.css", import.meta.url).href;

if (!document.querySelector(`link[data-ds-randomizer-css], link[href*="ds_randomizer.css"]`)) {
  const cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = `${CSS_HREF}?v=${Date.now()}`;
  cssLink.onerror = () => {
    cssLink.href = CSS_FALLBACK;
  };
  cssLink.dataset.dsRandomizerCss = "true";
  document.head.appendChild(cssLink);
}

const MIN_NODE_WIDTH = 420;
const DEFAULT_NODE_WIDTH = 460;
const DEFAULT_NODE_HEIGHT = 520;
const CARD_MARGIN = 5;
const BOTTOM_GAP = 5;
const NATURAL_CARD_HEIGHT = 380;
const MIN_WIDGET_HEIGHT = NATURAL_CARD_HEIGHT + (CARD_MARGIN * 2);

function getGroupLabel(grp) {
  if (!grp) return "";
  if (grp.id === "camera") return "Camera";
  if (grp.id === "character") return "Character";
  if (grp.id === "clothing") return "Clothing";
  if (grp.id === "environment") return "Environment";
  return grp.name ? grp.name.split("/")[0].trim() : String(grp.id || "");
}

async function copyToClipboard(text) {
  const val = String(text ?? "");
  if (!val) return false;
  try {
    await navigator.clipboard.writeText(val);
    return true;
  } catch (_) {
    try {
      const area = document.createElement("textarea");
      area.value = val;
      area.style.position = "fixed";
      area.style.left = "-10000px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }
}

function hideNativeWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  widget.options = widget.options || {};
  widget.options.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  for (const el of [widget.inputEl, widget.element]) {
    if (el?.style) {
      el.style.display = "none";
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
      el.style.width = "0";
      el.style.height = "0";
      el.style.margin = "0";
      el.style.padding = "0";
    }
  }
}

function hideAllNativeWidgets(node) {
  if (!node?.widgets) return;
  for (const w of node.widgets) {
    if (w.name === "ds_randomizer_ui" || w.name === "ds_randomizer_widget" || w.type === "custom") continue;
    hideNativeWidget(w);
  }
}

function ensureStateWidget(node) {
  let stateWidget = (node.widgets || []).find((w) => w?.name === "randomizer_state");
  if (!stateWidget && typeof node.addWidget === "function") {
    stateWidget = node.addWidget("text", "randomizer_state", "{}", () => {}, {
      serialize: true,
    });
  }
  if (stateWidget) {
    hideNativeWidget(stateWidget);
    stateWidget.serialize = true;
  }
  return stateWidget;
}

function cleanupObsoleteInputs(node) {
  if (!node?.inputs) return;
  const stIndex = node.inputs.findIndex((inp) => inp && inp.name === "source_text");
  if (stIndex !== -1) {
    const textIndex = node.inputs.findIndex((inp) => inp && inp.name === "text");
    const stLink = node.inputs[stIndex].link;
    if (stLink != null && textIndex !== -1 && node.inputs[textIndex].link == null) {
      node.inputs[textIndex].link = stLink;
      if (app?.graph?.links?.[stLink]) {
        app.graph.links[stLink].target_slot = textIndex;
      }
    }
    if (typeof node.removeInput === "function") {
      node.removeInput(stIndex);
    } else {
      node.inputs.splice(stIndex, 1);
    }
    if (typeof node.setDirtyCanvas === "function") {
      node.setDirtyCanvas(true, true);
    }
  }
}

function getUpstreamConnection(node) {
  if (!node?.inputs) return null;
  const input = node.inputs.find(
    (inp) => inp && (inp.name === "text" || inp.name === "source_text" || inp.name === "prompt") && inp.link != null
  );
  if (!input || input.link == null || !app?.graph?.links) return null;
  const link = app.graph.links[input.link];
  if (!link) return null;
  const originNode = app.graph.getNodeById(link.origin_id);
  if (!originNode) return null;
  return { input, link, originNode };
}

function resolveUpstreamPrompt(node) {
  const conn = getUpstreamConnection(node);
  if (!conn || !conn.originNode) return "";
  const origin = conn.originNode;

  if (origin.properties?.ds_prompt_effective_text) {
    return String(origin.properties.ds_prompt_effective_text).trim();
  }
  if (origin.properties?.ds_prompt_text) {
    return String(origin.properties.ds_prompt_text).trim();
  }
  if (origin._dsPromptValue) {
    return String(origin._dsPromptValue).trim();
  }
  if (origin.properties?.ds_randomizer_preview) {
    return String(origin.properties.ds_randomizer_preview).trim();
  }
  const textWidget = (origin.widgets || []).find(
    (w) => w?.name === "text" || w?.name === "prompt"
  );
  if (textWidget && typeof textWidget.value === "string" && textWidget.value.trim()) {
    return textWidget.value.trim();
  }
  if (origin._dsRoot) {
    const ta = origin._dsRoot.querySelector("textarea");
    if (ta && ta.value && ta.value.trim()) {
      return ta.value.trim();
    }
  }
  return "";
}

function protectRandomizerResizeCorners(node) {
  if (!node || node._dsRandomizerResizeCornersProtected) return;
  const originalGetWidgetOnPos = node.getWidgetOnPos;
  if (typeof originalGetWidgetOnPos !== "function") return;

  node._dsRandomizerResizeCornersProtected = true;
  node._dsRandomizerOriginalGetWidgetOnPos = originalGetWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    if (this.resizable !== false) {
      const localX = Number(canvasX) - Number(this.pos?.[0] ?? 0);
      const localY = Number(canvasY) - Number(this.pos?.[1] ?? 0);
      const width = Number(this.size?.[0]) || 0;
      const height = Number(this.size?.[1]) || 0;
      const handle = Number(this.constructor?.resizeHandleSize) || 15;

      const inLeft = localX <= handle;
      const inRight = localX >= width - handle;
      const inTop = localY <= handle;
      const inBottom = localY >= height - handle;

      if ((inLeft || inRight) && (inTop || inBottom)) {
        return undefined;
      }
    }

    return originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
  };
}

function getRandomizerWidgetY(node) {
  const widget = node?._dsRandomizerDOMWidget;
  const y = Number(widget?.y);
  if (Number.isFinite(y) && y >= 0) return y;
  const lastY = Number(widget?.last_y);
  if (Number.isFinite(lastY) && lastY >= 0) return lastY;
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const inCount = (node?.inputs ?? []).filter((i) => !i.widget).length;
  const outCount = (node?.outputs ?? []).length;
  const rows = Math.max(inCount, outCount, 1);
  return rows * slotH + 28;
}

app.registerExtension({
  name: EXT,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.configure;
    const originalExecuted = nodeType.prototype.onExecuted;
    const originalConnections = nodeType.prototype.onConnectionsChange;
    const originalSerialize = nodeType.prototype.serialize;
    const originalOnSerialize = nodeType.prototype.onSerialize;
    const originalAddWidget = nodeType.prototype.addWidget;
    const originalOnWidgetAdded = nodeType.prototype.onWidgetAdded;
    const originalResize = nodeType.prototype.onResize;
    const originalSetSize = nodeType.prototype.setSize;
    const originalComputeSize = nodeType.prototype.computeSize;

    nodeType.prototype.computeSize = function (out) {
      const size = originalComputeSize ? originalComputeSize.apply(this, arguments) : [MIN_NODE_WIDTH, DEFAULT_NODE_HEIGHT];
      const widgetY = getRandomizerWidgetY(this);
      const minH = Math.ceil(widgetY + MIN_WIDGET_HEIGHT + BOTTOM_GAP);
      size[0] = Math.max(Number(size[0]) || MIN_NODE_WIDTH, MIN_NODE_WIDTH);
      size[1] = Math.max(Number(size[1]) || minH, minH);
      return size;
    };

    nodeType.prototype.onResize = function (size) {
      if (size) {
        const widgetY = getRandomizerWidgetY(this);
        const minH = Math.ceil(widgetY + MIN_WIDGET_HEIGHT + BOTTOM_GAP);
        size[0] = Math.max(Number(size[0]) || MIN_NODE_WIDTH, MIN_NODE_WIDTH);
        size[1] = Math.max(Number(size[1]) || minH, minH);
      }
      const res = originalResize ? originalResize.apply(this, arguments) : undefined;
      this.setDirtyCanvas?.(true, true);
      return res;
    };

    nodeType.prototype.setSize = function (size) {
      const widgetY = getRandomizerWidgetY(this);
      const minH = Math.ceil(widgetY + MIN_WIDGET_HEIGHT + BOTTOM_GAP);
      const w = Math.max(Number(size?.[0]) || MIN_NODE_WIDTH, MIN_NODE_WIDTH);
      const h = Math.max(Number(size?.[1]) || minH, minH);
      this.size = [w, h];
      const res = originalSetSize ? originalSetSize.call(this, [w, h]) : undefined;
      this.setDirtyCanvas?.(true, true);
      return res;
    };

    nodeType.prototype.addWidget = function (type, name) {
      const widget = originalAddWidget ? originalAddWidget.apply(this, arguments) : null;
      if (widget && name !== "ds_randomizer_ui" && name !== "ds_randomizer_widget" && type !== "custom") {
        hideNativeWidget(widget);
      }
      return widget;
    };

    nodeType.prototype.onWidgetAdded = function (widget) {
      if (originalOnWidgetAdded) originalOnWidgetAdded.apply(this, arguments);
      if (widget && widget.name !== "ds_randomizer_ui" && widget.name !== "ds_randomizer_widget" && widget.type !== "custom") {
        hideNativeWidget(widget);
      }
    };

    nodeType.prototype.onNodeCreated = function () {
      if (originalCreated) originalCreated.apply(this, arguments);

      cleanupObsoleteInputs(this);

      this.resizable = true;
      protectDSResizeCorners(this);
      protectRandomizerResizeCorners(this);

      this.size = this.size || [DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT];
      if (this.size[0] < MIN_NODE_WIDTH) this.size[0] = MIN_NODE_WIDTH;
      if (this.size[1] < DEFAULT_NODE_HEIGHT) this.size[1] = DEFAULT_NODE_HEIGHT;

      this.properties = this.properties || {};
      this.properties.ds_randomizer_state = this.properties.ds_randomizer_state || {
        enabled_categories: ["hair_color", "lighting", "location", "clothing"],
        options: { age_range: { preset: "any" } },
      };
      this.properties.ds_randomizer_preview = this.properties.ds_randomizer_preview || "";
      this.properties.ds_randomizer_ai_enabled = Boolean(this.properties.ds_randomizer_ai_enabled);

      let preferredModel = "";
      try {
        preferredModel = localStorage.getItem("DS_AI_preferred_model") || "";
      } catch (_) {}

      this.properties.ds_randomizer_ai_settings = this.properties.ds_randomizer_ai_settings || {
        model: preferredModel,
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
      };

      ensureStateWidget(this);
      hideAllNativeWidgets(this);

      const self = this;
      let categoriesCatalog = { groups: [], categories: [] };
      let activeGroup = "all";

      // Floating Toolbar Gear Popover hook (via window.DSGearMenu)
      this._toggleRandomizerGearPopover = function (anchor) {
        openAISettingsPopover({
          node: self,
          anchorEl: anchor,
          title: "DS Randomizer — AI Settings",
          getSettings: () => self.properties.ds_randomizer_ai_settings,
          saveSettings: (newSettings) => {
            self.properties.ds_randomizer_ai_settings = { ...newSettings };
            if (newSettings.model) {
              try {
                localStorage.setItem("DS_AI_preferred_model", newSettings.model);
              } catch (_) {}
            }
            saveState();
          },
        });
      };
      this._openRandomizerGearPopover = this._toggleRandomizerGearPopover;

      // The Card itself is the visible container surface
      const card = Card({ className: "ds-randomizer-card" });
      const cardEl = card.root;
      cardEl.dataset.dsThemed = "true";
      this._dsCard = cardEl;

      normalizeDSWidgetHost(cardEl, this, { shell: false });

      // -------------------------------------------------------------
      // 1. TOOLBAR / HEADER (Positioned at the TOP of the card)
      // -------------------------------------------------------------
      const head = document.createElement("div");
      head.className = "ds-ui-card-head ds-rand-card-head";

      const titleGroup = document.createElement("div");
      titleGroup.className = "ds-rand-title-group";

      const titleText = document.createElement("span");
      titleText.className = "ds-ui-card-title";
      titleText.textContent = "DS Randomizer";

      const wiredTag = document.createElement("span");
      wiredTag.className = "ds-rand-wired-tag";
      wiredTag.style.display = "none";

      const statusNotice = document.createElement("span");
      statusNotice.className = "ds-rand-status";

      titleGroup.append(titleText, wiredTag, statusNotice);

      const showStatus = (msg) => {
        statusNotice.textContent = msg;
        statusNotice.classList.add("is-visible");
        clearTimeout(statusNotice._timer);
        statusNotice._timer = setTimeout(() => {
          statusNotice.classList.remove("is-visible");
        }, 1600);
      };
      this._dsShowStatus = showStatus;

      const actions = document.createElement("div");
      actions.className = "ds-rand-card-actions";

      // ── AI Action Sliding Shelf (Run, Regenerate, Kill LLM) ──
      const aiShelf = document.createElement("div");
      aiShelf.className = "ds-rand-ai-shelf";

      const runAI = async (isRegen = false) => {
        const targetBtn = isRegen ? rerunBtn : runBtn;
        try {
          targetBtn.root.classList.add("is-loading");
          showStatus("AI Generating...");
          const promptText = resolveUpstreamPrompt(self) || previewTextarea?.value || "";
          const shouldRandomize = self.properties.ds_randomizer_ai_settings?.randomize_seed !== false;
          let runSeed;
          if (isRegen || shouldRandomize) {
            runSeed = Math.floor(Math.random() * 2147483647);
            if (self.properties.ds_randomizer_ai_settings) {
              self.properties.ds_randomizer_ai_settings.seed = runSeed;
            }
          } else {
            runSeed = Number(self.properties.ds_randomizer_ai_settings?.seed) || 123456;
          }

          const res = await fetch("/ds/ai/randomize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: promptText,
              enabled_categories: self.properties.ds_randomizer_state.enabled_categories || [],
              options: self.properties.ds_randomizer_state.options || {},
              ai_settings: {
                ...(self.properties.ds_randomizer_ai_settings || {}),
                require_vision: false,
              },
              seed: runSeed,
              node_id: String(self.id),
            }),
          });
          const data = await res.json();
          if (data.ok && data.prompt !== undefined) {
            if (previewTextarea) previewTextarea.value = data.prompt;
            self.properties.ds_randomizer_preview = data.prompt;
            self.properties.ds_randomizer_state.preview_prompt = data.prompt;
            saveState();
            // Build status: elapsed + cache badge + repeat note
            const elapsed = data.elapsed || 0;
            const cs = data.cache_stats || {};
            const note = data.status_note || "";
            let statusMsg = `AI Done (${elapsed}s)`;
            if (cs.total_entries !== undefined && cs.batch_size) {
              statusMsg += ` \u00b7 cache ${cs.total_entries}/${cs.batch_size}`;
            }
            if (note) statusMsg += note;
            showStatus(statusMsg);
          } else {
            showStatus(data.error ? "AI Error" : "Failed");
            console.error("[DS Randomizer] AI Error:", data.error);
          }
        } catch (e) {
          console.error("[DS Randomizer] AI Exception:", e);
          showStatus("AI Failed");
        } finally {
          targetBtn.root.classList.remove("is-loading");
        }
      };

      const runBtn = Button({
        label: "Run",
        icon: "play",
        variant: "primary",
        size: "compact",
        tooltip: "Run AI prompt randomization with selected categories",
        onClick: () => runAI(false),
      });

      const rerunBtn = Button({
        label: "Regen",
        icon: "refresh-cw",
        size: "compact",
        tooltip: "Regenerate with fresh AI random variation",
        onClick: () => runAI(true),
      });

      const killBtn = Button({
        label: "Kill LLM",
        icon: "trash-2",
        variant: "danger",
        size: "compact",
        tooltip: "Cancel active generation & unload LLM from VRAM",
        onClick: async () => {
          showStatus("Unloading...");
          try {
            await fetch("/ds/ai/kill", { method: "POST" });
            await fetch("/ds/ai/unload", { method: "POST" });
            showStatus("LLM Unloaded");
          } catch (_) {
            showStatus("Unload Error");
          }
        },
      });

      aiShelf.append(runBtn.root, rerunBtn.root, killBtn.root);

      // ── AI Toggle Button (Placed before Preview) ──
      let aiActive = Boolean(self.properties.ds_randomizer_ai_enabled);
      const aiBtn = Button({
        label: "AI",
        icon: "cpu",
        size: "compact",
        active: aiActive,
        className: "ds-rand-ai-toggle-btn",
        tooltip: "Toggle AI-powered prompt randomization",
        onClick: () => {
          aiActive = !aiActive;
          self.properties.ds_randomizer_ai_enabled = aiActive;
          aiBtn.setActive(aiActive);
          if (aiActive) {
            aiShelf.classList.add("is-open");
          } else {
            aiShelf.classList.remove("is-open");
          }
          saveState();
        },
      });

      if (aiActive) {
        aiShelf.classList.add("is-open");
      }

      self._dsUpdateAIUI = () => {
        aiActive = Boolean(self.properties.ds_randomizer_ai_enabled);
        aiBtn.setActive(aiActive);
        if (aiActive) {
          aiShelf.classList.add("is-open");
        } else {
          aiShelf.classList.remove("is-open");
        }
      };

      // ── Classical Regenerate / Preview Button ──
      const regenBtn = Button({
        label: "Preview",
        icon: "refresh-cw",
        variant: "primary",
        size: "compact",
        tooltip: "Generate live randomized preview (Database)",
        onClick: async () => {
          try {
            regenBtn.root.classList.add("is-loading");
            const promptText = resolveUpstreamPrompt(self);

            const res = await fetch("/ds/randomizer/preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: promptText,
                enabled_categories: self.properties.ds_randomizer_state.enabled_categories || [],
                options: self.properties.ds_randomizer_state.options || {},
                node_id: String(self.id),
              }),
            });
            const data = await res.json();
            if (data.preview !== undefined) {
              previewTextarea.value = data.preview;
              self.properties.ds_randomizer_preview = data.preview;
              showStatus("Preview Generated");
            }
          } catch (e) {
            console.error("[DS Randomizer] Preview error:", e);
            showStatus("Preview Error");
          } finally {
            regenBtn.root.classList.remove("is-loading");
          }
        },
      });

      actions.append(aiShelf, aiBtn.root, regenBtn.root);
      head.append(titleGroup, actions);
      cardEl.insertBefore(head, card.body);

      // -------------------------------------------------------------
      // 2. CARD BODY: STRICT 2-SECTION HIERARCHY
      // -------------------------------------------------------------
      const body = card.body;
      body.classList.add("ds-rand-card-body");

      // =============================================================
      // SECTION 1: ATTRIBUTE SELECTION (TOP SECTION)
      // =============================================================
      const attrSection = document.createElement("div");
      attrSection.className = "ds-rand-attr-section";

      // 1.1 Category Tabs Row (All, Camera, Character, Clothing, Environment)
      const tabsRow = document.createElement("div");
      tabsRow.className = "ds-rand-tabs-row";
      attrSection.appendChild(tabsRow);

      // 1.2 Sub-Header Row: Section Label + Active Count on Left, Actions on Right
      const subHeader = document.createElement("div");
      subHeader.className = "ds-rand-sub-header";

      const subLeft = document.createElement("div");
      subLeft.className = "ds-rand-sub-left";

      const subLabel = document.createElement("span");
      subLabel.className = "ds-rand-sub-label";
      subLabel.textContent = "ALL ATTRIBUTES";

      const catCountBadge = document.createElement("span");
      catCountBadge.className = "ds-rand-count-pill";
      catCountBadge.textContent = "0 active";

      subLeft.append(subLabel, catCountBadge);

      const subActions = document.createElement("div");
      subActions.className = "ds-rand-sub-actions";

      const selectAllBtn = Button({
        label: "Select All",
        size: "compact",
        tooltip: "Select all categories in this tab",
        onClick: () => {
          const visibleCats = getVisibleCategoryIds();
          const cur = new Set(self.properties.ds_randomizer_state.enabled_categories || []);
          for (const cid of visibleCats) cur.add(cid);
          self.properties.ds_randomizer_state.enabled_categories = Array.from(cur);
          self.properties.ds_randomizer_state.preview_prompt = "";
          self.properties.ds_randomizer_preview = "";
          saveState();
          renderChips();
        },
      });

      const clearAllBtn = Button({
        label: "Clear All",
        size: "compact",
        tooltip: "Clear categories in this tab",
        onClick: () => {
          const visibleCats = new Set(getVisibleCategoryIds());
          const cur = (self.properties.ds_randomizer_state.enabled_categories || []).filter(
            (cid) => !visibleCats.has(cid)
          );
          self.properties.ds_randomizer_state.enabled_categories = cur;
          self.properties.ds_randomizer_state.preview_prompt = "";
          self.properties.ds_randomizer_preview = "";
          saveState();
          renderChips();
        },
      });

      subActions.append(selectAllBtn.root, clearAllBtn.root);
      subHeader.append(subLeft, subActions);
      attrSection.appendChild(subHeader);

      // 1.3 Age Options Shelf (ONLY for Age Range when enabled, pure UIElements Buttons)
      const optionsShelf = document.createElement("div");
      optionsShelf.className = "ds-rand-options-shelf";
      optionsShelf.style.display = "none";
      attrSection.appendChild(optionsShelf);

      // 1.4 Chips Grid (Expands to fill all remaining height of Section 1)
      const chipsGrid = document.createElement("div");
      chipsGrid.className = "ds-rand-chips-grid";
      this._dsChipsGrid = chipsGrid;
      attrSection.appendChild(chipsGrid);

      body.appendChild(attrSection);

      // =============================================================
      // SECTION 2: GENERATED PROMPT (BOTTOM SECTION)
      // =============================================================
      const genSection = document.createElement("div");
      genSection.className = "ds-rand-gen-section";

      const genHeader = document.createElement("div");
      genHeader.className = "ds-rand-gen-header";

      const genTitleGroup = document.createElement("div");
      genTitleGroup.className = "ds-rand-gen-title-group";

      const genIcon = DSIcon("file-text", { size: 12, color: "var(--ds-color-accent, #67e8f9)" });
      const genTitle = document.createElement("span");
      genTitle.className = "ds-rand-gen-title";
      genTitle.textContent = "Generated Prompt";

      genTitleGroup.append(genIcon, genTitle);

      const genActions = document.createElement("div");
      genActions.className = "ds-rand-gen-actions";

      const copyBtn = Button({
        label: "Copy",
        icon: "copy",
        size: "compact",
        tooltip: "Copy generated prompt",
        onClick: async () => {
          const val = previewTextarea.value || "";
          const ok = await copyToClipboard(val);
          if (ok) {
            showStatus("Copied Prompt");
            copyBtn.setLabel("Copied!");
            copyBtn.setIcon("check");
            setTimeout(() => {
              copyBtn.setLabel("Copy");
              copyBtn.setIcon("copy");
            }, 1400);
          }
        },
      });

      const clearBtn = Button({
        icon: "trash-2",
        size: "compact",
        tooltip: "Clear preview",
        onClick: () => {
          previewTextarea.value = "";
          self.properties.ds_randomizer_preview = "";
          showStatus("Cleared");
        },
      });

      genActions.append(copyBtn.root, clearBtn.root);
      genHeader.append(genTitleGroup, genActions);
      genSection.appendChild(genHeader);

      const prevWrap = document.createElement("div");
      prevWrap.className = "ds-rand-textarea-wrap";

      const previewTextarea = document.createElement("textarea");
      previewTextarea.className = "ds-ui-text-editor ds-rand-textarea";
      previewTextarea.placeholder = "Randomized prompt will appear here on queue or preview...";
      previewTextarea.value = self.properties.ds_randomizer_preview || "";
      this._dsPreviewTextarea = previewTextarea;

      prevWrap.appendChild(previewTextarea);
      genSection.appendChild(prevWrap);
      body.appendChild(genSection);

      // Prevent canvas dragging or shortcuts when selecting text in preview
      const stopCanvas = (event) => event.stopPropagation();
      previewTextarea.addEventListener("pointerdown", stopCanvas);
      previewTextarea.addEventListener("mousedown", stopCanvas);
      previewTextarea.addEventListener("keydown", stopCanvas);
      previewTextarea.addEventListener("wheel", stopCanvas, { passive: true });

      // -------------------------------------------------------------
      // 3. HELPER METHODS & STATE SYNC
      // -------------------------------------------------------------
      function saveState() {
        self.properties.ds_randomizer_state = self.properties.ds_randomizer_state || {};
        self.properties.ds_randomizer_state.ai_enabled = Boolean(self.properties.ds_randomizer_ai_enabled);
        self.properties.ds_randomizer_state.ai_settings = self.properties.ds_randomizer_ai_settings || {};
        const stateWidget = ensureStateWidget(self);
        if (stateWidget) {
          stateWidget.value = JSON.stringify(self.properties.ds_randomizer_state);
        }
        updateBadge();
        renderOptions();
        self.setDirtyCanvas?.(true, true);
      }

      function updateBadge() {
        const enabledList = self.properties.ds_randomizer_state.enabled_categories || [];
        const totalCount = enabledList.length;
        if (activeGroup === "all") {
          catCountBadge.textContent = `${totalCount} active`;
          catCountBadge.title = `${totalCount} active categories total`;
        } else {
          const tabCats = new Set(
            (categoriesCatalog.categories || [])
              .filter((c) => c.group === activeGroup)
              .map((c) => c.id)
          );
          const tabActiveCount = enabledList.filter((id) => tabCats.has(id)).length;
          catCountBadge.textContent = `${tabActiveCount} active`;
          catCountBadge.title = `${tabActiveCount} active in this tab (${totalCount} total across all tabs)`;
        }
      }

      function updateSubHeaderLabel() {
        if (activeGroup === "all") {
          subLabel.textContent = "ALL ATTRIBUTES";
        } else {
          const grp = (categoriesCatalog.groups || []).find((g) => g.id === activeGroup);
          const shortName = grp ? getGroupLabel(grp) : activeGroup;
          subLabel.textContent = `${shortName.toUpperCase()} ATTRIBUTES`;
        }
      }

      function getVisibleCategoryIds() {
        if (activeGroup === "all") {
          return categoriesCatalog.categories.map((c) => c.id);
        }
        return categoriesCatalog.categories
          .filter((c) => c.group === activeGroup)
          .map((c) => c.id);
      }

      function renderTabs() {
        tabsRow.replaceChildren();

        const allBtn = Button({
          label: "All",
          size: "compact",
          active: activeGroup === "all",
          className: "ds-rand-tab-btn",
          onClick: () => {
            activeGroup = "all";
            renderTabs();
            renderChips();
            renderOptions();
          },
        });
        tabsRow.appendChild(allBtn.root);

        for (const grp of categoriesCatalog.groups) {
          const shortName = getGroupLabel(grp);
          const tabBtn = Button({
            label: shortName,
            size: "compact",
            active: activeGroup === grp.id,
            className: "ds-rand-tab-btn",
            tooltip: grp.name || shortName,
            onClick: () => {
              activeGroup = grp.id;
              renderTabs();
              renderChips();
              renderOptions();
            },
          });
          tabsRow.appendChild(tabBtn.root);
        }

        updateSubHeaderLabel();
      }

      function renderChips() {
        chipsGrid.replaceChildren();
        const enabledSet = new Set(self.properties.ds_randomizer_state.enabled_categories || []);
        const cats = categoriesCatalog.categories.filter(
          (c) => activeGroup === "all" || c.group === activeGroup
        );

        for (const cat of cats) {
          const isActive = enabledSet.has(cat.id);
          const chipBtn = Button({
            label: cat.name,
            size: "compact",
            active: isActive,
            className: "ds-rand-chip-btn",
            tooltip: `${cat.name} (${cat.entries_count || 0} variations)`,
            onClick: () => {
              const list = self.properties.ds_randomizer_state.enabled_categories || [];
              if (enabledSet.has(cat.id)) {
                self.properties.ds_randomizer_state.enabled_categories = list.filter((id) => id !== cat.id);
              } else {
                self.properties.ds_randomizer_state.enabled_categories = [...list, cat.id];
              }
              self.properties.ds_randomizer_state.preview_prompt = "";
              self.properties.ds_randomizer_preview = "";
              saveState();
              renderChips();
            },
          });
          chipsGrid.appendChild(chipBtn.root);
        }
        updateBadge();
        renderOptions();
      }

      function renderOptions() {
        const enabled = self.properties.ds_randomizer_state.enabled_categories || [];
        const isAgeActive = enabled.includes("age_range");
        const isTabRelevant = activeGroup === "all" || activeGroup === "character";

        // Strictly hide when age is not enabled or viewing unrelated tab
        if (!isAgeActive || !isTabRelevant) {
          optionsShelf.classList.remove("is-visible");
          optionsShelf.style.display = "none";
          optionsShelf.replaceChildren();
          return;
        }

        optionsShelf.classList.add("is-visible");
        optionsShelf.style.display = "flex";
        optionsShelf.replaceChildren();

        const row = document.createElement("div");
        row.className = "ds-rand-opt-row";

        const label = document.createElement("span");
        label.className = "ds-rand-opt-label";
        label.textContent = "AGE TARGET:";
        row.appendChild(label);

        const pillsWrap = document.createElement("div");
        pillsWrap.className = "ds-rand-opt-pills";

        const ageCat = (categoriesCatalog.categories || []).find((c) => c.id === "age_range");
        const options = ageCat?.options || [
          { id: "any", label: "Any", desc: "Any age (18+)" },
          { id: "18_24", label: "18-24", desc: "18-24 (Young Adult)" },
          { id: "25_35", label: "25-35", desc: "25-35 (Adult)" },
          { id: "36_50", label: "36-50", desc: "36-50 (Mature)" },
          { id: "50_plus", label: "50+", desc: "50+ (Senior)" },
        ];

        const curPreset = self.properties.ds_randomizer_state.options?.age_range?.preset || "any";

        for (const opt of options) {
          const isSelected = curPreset === opt.id;
          const optLabel = opt.label.replace(/\s*\([^)]*\)/, "").trim() || opt.label;
          const optTooltip = opt.desc || opt.label;
          const optBtn = Button({
            label: optLabel,
            size: "compact",
            active: isSelected,
            className: "ds-rand-opt-btn",
            tooltip: optTooltip,
            onClick: () => {
              self.properties.ds_randomizer_state.options = self.properties.ds_randomizer_state.options || {};
              self.properties.ds_randomizer_state.options.age_range = { preset: opt.id };
              saveState();
              renderOptions();
            },
          });
          pillsWrap.appendChild(optBtn.root);
        }
        row.appendChild(pillsWrap);
        optionsShelf.appendChild(row);
      }

      function updateWiredStatus() {
        const conn = getUpstreamConnection(self);
        if (conn) {
          const originTitle = conn.originNode.title || conn.originNode.type || "Upstream";
          wiredTag.innerHTML = `${DSIconMarkup("link", { size: 10 })}<span>Wired: ${originTitle}</span>`;
          wiredTag.style.display = "inline-flex";
          wiredTag.title = `Connected to upstream (${originTitle}). Incoming text is analyzed and randomized.`;
          titleText.style.display = "none";
        } else {
          wiredTag.style.display = "none";
          titleText.style.display = "inline";
        }
      }
      self._updateWiredStatus = updateWiredStatus;

      async function loadCatalog() {
        try {
          const res = await fetch("/ds/randomizer/categories");
          if (res.ok) {
            categoriesCatalog = await res.json();
            renderTabs();
            renderChips();
            saveState();
            return;
          }
        } catch (_) {}

        categoriesCatalog = {
          groups: [
            { id: "character", name: "Character" },
            { id: "environment", name: "Environment" },
            { id: "camera", name: "Camera" },
            { id: "clothing", name: "Clothing" },
          ],
          categories: [
            { id: "age_range", name: "Age Range", group: "character" },
            { id: "hair", name: "Hair", group: "character" },
            { id: "hair_color", name: "Hair Color", group: "character" },
            { id: "hair_length", name: "Hair Length", group: "character" },
            { id: "hair_type", name: "Hair Type", group: "character" },
            { id: "hair_style", name: "Hair Style", group: "character" },
            { id: "expression", name: "Expression", group: "character" },
            { id: "location", name: "Location", group: "environment" },
            { id: "lighting", name: "Lighting", group: "environment" },
            { id: "time", name: "Time", group: "environment" },
            { id: "camera_angle", name: "Camera Angle", group: "camera" },
            { id: "shot_type", name: "Shot Type", group: "camera" },
            { id: "clothing", name: "Clothing", group: "clothing" },
            { id: "style", name: "Style", group: "clothing" },
          ],
        };
        renderTabs();
        renderChips();
        saveState();
      }

      self._dsRenderTabs = renderTabs;
      self._dsRenderChips = renderChips;
      self._dsRenderOptions = renderOptions;
      self._dsUpdateBadge = updateBadge;

      loadCatalog();
      updateWiredStatus();

      // Mount the Card element directly as the DOM widget surface
      this._dsRandomizerDOMWidget = this.addDOMWidget("ds_randomizer_ui", "custom", cardEl, {
        serialize: false,
        hideOnZoom: false,
        margin: CARD_MARGIN,
        getMinHeight: () => MIN_WIDGET_HEIGHT,
        getMaxHeight: () => {
          const y = getRandomizerWidgetY(this);
          const nodeHeight = Number(this.size?.[1]) || 0;
          const available = nodeHeight - y - BOTTOM_GAP;
          return Math.max(
            MIN_WIDGET_HEIGHT,
            available + BOTTOM_GAP,
          );
        },
      });

      hideAllNativeWidgets(this);

      try {
        window.DSGlobalTheme?.bindNode?.(cardEl, this);
      } catch (_) {}
    };

    nodeType.prototype.onConnectionsChange = function () {
      if (originalConnections) originalConnections.apply(this, arguments);
      cleanupObsoleteInputs(this);
      if (typeof this._updateWiredStatus === "function") {
        this._updateWiredStatus();
      }
      hideAllNativeWidgets(this);
    };

    nodeType.prototype.onSerialize = function (info) {
      if (originalOnSerialize) originalOnSerialize.apply(this, arguments);
      const sw = ensureStateWidget(this);
      if (sw && this.properties?.ds_randomizer_state) {
        sw.value = JSON.stringify(this.properties.ds_randomizer_state);
      }
    };

    nodeType.prototype.serialize = function () {
      const data = originalSerialize ? originalSerialize.apply(this, arguments) : {};
      const sw = ensureStateWidget(this);
      if (sw && this.properties?.ds_randomizer_state) {
        sw.value = JSON.stringify(this.properties.ds_randomizer_state);
      }
      return data;
    };

    nodeType.prototype.configure = function (info) {
      if (originalConfigure) originalConfigure.apply(this, arguments);

      cleanupObsoleteInputs(this);
      ensureStateWidget(this);
      hideAllNativeWidgets(this);

      const stateWidget = (this.widgets || []).find((w) => w.name === "randomizer_state");

      if (stateWidget && stateWidget.value && stateWidget.value !== "{}") {
        try {
          const parsed = JSON.parse(stateWidget.value);
          if (parsed && typeof parsed === "object") {
            this.properties = this.properties || {};
            // Clean up any stale legacy options so only age_range persists
            const cleanOptions = {};
            if (parsed.options?.age_range) {
              cleanOptions.age_range = parsed.options.age_range;
            }
            parsed.options = cleanOptions;
            this.properties.ds_randomizer_state = parsed;
          }
        } catch (_) {}
      } else if (this.properties?.ds_randomizer_state && stateWidget) {
        stateWidget.value = JSON.stringify(this.properties.ds_randomizer_state);
      }

      if (this.properties?.ds_randomizer_state) {
        if (typeof this.properties.ds_randomizer_state.ai_enabled === "boolean") {
          this.properties.ds_randomizer_ai_enabled = this.properties.ds_randomizer_state.ai_enabled;
        }
        if (this.properties.ds_randomizer_state.ai_settings) {
          this.properties.ds_randomizer_ai_settings = { ...this.properties.ds_randomizer_state.ai_settings };
        }
      }
      if (typeof this._dsUpdateAIUI === "function") {
        this._dsUpdateAIUI();
      }

      if (this.properties?.ds_randomizer_preview && this._dsPreviewTextarea) {
        this._dsPreviewTextarea.value = this.properties.ds_randomizer_preview;
      }

      if (typeof this._dsRenderTabs === "function") {
        this._dsRenderTabs();
      }
      if (typeof this._dsRenderChips === "function") {
        this._dsRenderChips();
      }
      if (typeof this._dsRenderOptions === "function") {
        this._dsRenderOptions();
      }
      if (typeof this._dsUpdateBadge === "function") {
        this._dsUpdateBadge();
      }

      if (typeof this._updateWiredStatus === "function") {
        this._updateWiredStatus();
      }
    };

    nodeType.prototype.onExecuted = function (message) {
      if (originalExecuted) originalExecuted.apply(this, arguments);

      const raw = message?.prompt_preview ?? message?.ui?.prompt_preview;
      const preview = Array.isArray(raw) ? raw[0] : raw;
      if (typeof preview === "string" && this._dsPreviewTextarea) {
        this._dsPreviewTextarea.value = preview;
        this.properties = this.properties || {};
        this.properties.ds_randomizer_preview = preview;
      }
    };
  },
});

// ============================================================
// Global Execution Listener
// Listens for backend execution completions and instantly updates
// canvas DOM textareas and open AI settings popovers.
// ============================================================
if (api && !api._dsRandomizerExecutedWrapped) {
  api._dsRandomizerExecutedWrapped = true;
  api.addEventListener("executed", ({ detail }) => {
    if (!detail) return;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (
        (n.type === "DS_Randomizer" || n.comfyClass === "DS_Randomizer") &&
        String(n.id) === String(detail.node)
      ) {
        const raw =
          detail.output?.prompt_preview ??
          detail.output?.ui?.prompt_preview ??
          detail.output?.text;
        const preview = Array.isArray(raw) ? raw[0] : raw;
        if (typeof preview === "string" && preview.trim()) {
          if (n._dsPreviewTextarea) {
            n._dsPreviewTextarea.value = preview;
          }
          n.properties = n.properties || {};
          n.properties.ds_randomizer_preview = preview;
          if (n.properties.ds_randomizer_state) {
            n.properties.ds_randomizer_state.preview_prompt = preview;
          }
          if (typeof n._dsShowStatus === "function") {
            n._dsShowStatus("Generated");
          }
        }
        const runSeed = detail.output?.seed?.[0] ?? detail.output?.ui?.seed?.[0];
        if (runSeed && n.properties?.ds_randomizer_ai_settings) {
          n.properties.ds_randomizer_ai_settings.seed = runSeed;
          if (window._dsUpdateActiveAIPopover?.node === n) {
            window._dsUpdateActiveAIPopover.setSeed(runSeed);
          }
        }
      }
    }
  });
}

// ============================================================
// Multi-Stage & Checkpoint Queue Hook
// Guarantees prompt stability during 'Continue' / Upscale runs
// while generating fresh variations on 'Queue' / 'Regenerate'
// ============================================================
if (api && !api._dsRandomizerQueueWrapped) {
  api._dsRandomizerQueueWrapped = true;
  const originalQueuePrompt = api.queuePrompt.bind(api);
  api.queuePrompt = async function (...args) {
    try {
      const out = args[1]?.output;
      if (out) {
        let isContinuing = false;
        for (const id in out) {
          const entry = out[id];
          if (entry?.class_type === "DS_ImageCheckpoint") {
            try {
              const state = JSON.parse(entry.inputs?.PauseState || "{}");
              if (state?.mode === "continue") {
                isContinuing = true;
                break;
              }
            } catch (_) {}
          }
        }
        if (!isContinuing && app?.graph) {
          const all = app.graph._nodes || app.graph.nodes || [];
          for (const n of all) {
            if (n?._dsICSubmitMode === "continue" || n?._dsICActiveMode === "continue") {
              isContinuing = true;
              break;
            }
          }
        }

        const randIndex = new Map();
        if (app?.graph) {
          for (const n of (app.graph._nodes || app.graph.nodes || [])) {
            if (n && (n.comfyClass === "DS_Randomizer" || n.type === "DS_Randomizer")) {
              randIndex.set(String(n.id), n);
            }
          }
        }

        for (const id in out) {
          const entry = out[id];
          if (entry?.class_type === "DS_Randomizer") {
            const node = randIndex.get(String(id));
            entry.inputs = entry.inputs || {};

            const isWiredSeed = Array.isArray(entry.inputs.seed);
            if (!isWiredSeed) {
              if (isContinuing) {
                const stableSeed = node?._dsLastRunSeed || entry.inputs.seed || 1;
                entry.inputs.seed = stableSeed;
              } else {
                const freshSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
                if (node) {
                  node._dsLastRunSeed = freshSeed;
                  if (node.properties?.ds_randomizer_ai_settings) {
                    node.properties.ds_randomizer_ai_settings.seed = freshSeed;
                  }
                  if (window._dsUpdateActiveAIPopover?.node === node) {
                    window._dsUpdateActiveAIPopover.setSeed(freshSeed);
                  }
                  const seedWidget = (node.widgets || []).find((w) => w?.name === "seed");
                  if (seedWidget) seedWidget.value = freshSeed;
                }
                entry.inputs.seed = freshSeed;
              }
            }

            if (node?.properties?.ds_randomizer_state) {
              node.properties.ds_randomizer_state.ai_enabled = Boolean(node.properties.ds_randomizer_ai_enabled);
              node.properties.ds_randomizer_state.ai_settings = node.properties.ds_randomizer_ai_settings || {};
              const isPauseForEdit = Boolean(node.properties.ds_randomizer_ai_settings?.pause_for_edit);
              if (isPauseForEdit && node.properties.ds_randomizer_preview) {
                node.properties.ds_randomizer_state.preview_prompt = node.properties.ds_randomizer_preview;
              } else if (!isPauseForEdit) {
                // When pause_for_edit is OFF: clear stale preview so every queue generates fresh AI variation
                node.properties.ds_randomizer_state.preview_prompt = "";
              }
              entry.inputs.randomizer_state = JSON.stringify(node.properties.ds_randomizer_state);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[DS Randomizer] Queue hook warning:", e);
    }
    return originalQueuePrompt(...args);
  };
}
