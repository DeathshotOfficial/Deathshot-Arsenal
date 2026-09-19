/* ============================================================
   DS Randomizer - DeathshotArsenal
   Custom DOM Randomizer Node Extension
   ============================================================ */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// Load CSS stylesheet
const CSS_HREF = "/extensions/DeathshotArsenal/Randomizer/ds_randomizer.css";
const CSS_FALLBACK = new URL("./ds_randomizer.css", import.meta.url).href;

if (!document.querySelector(`link[data-ds-randomizer-css], link[href*="ds_randomizer.css"]`)) {
  const cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = CSS_HREF;
  cssLink.onerror = () => {
    cssLink.href = CSS_FALLBACK;
  };
  cssLink.dataset.dsRandomizerCss = "true";
  document.head.appendChild(cssLink);
}

const ICONS = {
  shuffle: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>`,
  dice: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M12 12h.01M8 8h.01M8 16h.01M16 8h.01M16 16h.01"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5"/></svg>`,
  rotateCcw: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  clear: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>`,
  link: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
};

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
  widget.computeSize = () => [0, 0];
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
    if (w.name === "ds_randomizer_widget" || w.type === "custom") continue;
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
      // Migrate connected link to standard 'text' input
      node.inputs[textIndex].link = stLink;
      if (app?.graph?.links?.[stLink]) {
        app.graph.links[stLink].target_slot = textIndex;
      }
    }
    // Remove obsolete input socket
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
    (inp) => inp && (inp.name === "text" || inp.name === "source_text") && inp.link != null
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

  // 1. If DS_Prompt, check effective text (includes trigger words) or base prompt
  if (origin.properties?.ds_prompt_effective_text) {
    return String(origin.properties.ds_prompt_effective_text).trim();
  }
  if (origin.properties?.ds_prompt_text) {
    return String(origin.properties.ds_prompt_text).trim();
  }
  if (origin._dsPromptValue) {
    return String(origin._dsPromptValue).trim();
  }
  // 2. Check preview properties
  if (origin.properties?.ds_randomizer_preview) {
    return String(origin.properties.ds_randomizer_preview).trim();
  }
  // 3. Check widget values (text, prompt)
  const textWidget = (origin.widgets || []).find(
    (w) => w?.name === "text" || w?.name === "prompt"
  );
  if (textWidget && typeof textWidget.value === "string" && textWidget.value.trim()) {
    return textWidget.value.trim();
  }
  // 4. Check custom DOM textarea in custom nodes
  if (origin._dsRoot) {
    const ta = origin._dsRoot.querySelector("textarea");
    if (ta && ta.value && ta.value.trim()) {
      return ta.value.trim();
    }
  }
  return "";
}

app.registerExtension({
  name: "DeathshotArsenal.Randomizer",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_Randomizer") return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    const originalConfigure = nodeType.prototype.configure;
    const originalExecuted = nodeType.prototype.onExecuted;
    const originalConnections = nodeType.prototype.onConnectionsChange;
    const originalSerialize = nodeType.prototype.serialize;
    const originalOnSerialize = nodeType.prototype.onSerialize;
    const originalAddWidget = nodeType.prototype.addWidget;
    const originalOnWidgetAdded = nodeType.prototype.onWidgetAdded;

    // Prevent any dynamically added widgets (e.g., control_after_generate) from showing
    nodeType.prototype.addWidget = function (type, name) {
      const widget = originalAddWidget ? originalAddWidget.apply(this, arguments) : null;
      if (widget && name !== "ds_randomizer_widget" && type !== "custom") {
        hideNativeWidget(widget);
      }
      return widget;
    };

    nodeType.prototype.onWidgetAdded = function (widget) {
      if (originalOnWidgetAdded) originalOnWidgetAdded.apply(this, arguments);
      if (widget && widget.name !== "ds_randomizer_widget" && widget.type !== "custom") {
        hideNativeWidget(widget);
      }
    };

    nodeType.prototype.onNodeCreated = function () {
      if (originalCreated) originalCreated.apply(this, arguments);

      cleanupObsoleteInputs(this);

      this.size = this.size || [440, 620];
      if (this.size[0] < 440) this.size[0] = 440;
      if (this.size[1] < 620) this.size[1] = 620;

      // Ensure properties container
      this.properties = this.properties || {};
      this.properties.ds_randomizer_state = this.properties.ds_randomizer_state || {
        enabled_categories: ["hair", "lighting", "location", "clothing"],
        options: { age_range: { preset: "any" } },
      };
      this.properties.ds_randomizer_preview = this.properties.ds_randomizer_preview || "";

      // Ensure state widget exists and hide ALL native widgets
      ensureStateWidget(this);
      hideAllNativeWidgets(this);

      // Build DOM Root
      const root = document.createElement("div");
      root.className = "ds-randomizer-root";
      this._dsRoot = root;

      // Hook up theme system
      if (window.DSGlobalTheme?.bindNode) {
        window.DSGlobalTheme.bindNode(root, this);
      }

      // State references
      const self = this;
      let categoriesCatalog = { groups: [], categories: [] };
      let activeGroup = "all";

      // -------------------------------------------------------------
      // 1. TOOLBAR
      // -------------------------------------------------------------
      const toolbar = document.createElement("div");
      toolbar.className = "ds-randomizer-toolbar";

      const title = document.createElement("div");
      title.className = "ds-randomizer-title";
      title.innerHTML = `<span class="ds-randomizer-title-icon">${ICONS.dice}</span><span>DS Randomizer</span>`;

      const statusNotice = document.createElement("span");
      statusNotice.className = "ds-rand-status";

      const showStatus = (msg) => {
        statusNotice.textContent = msg;
        statusNotice.classList.add("is-visible");
        clearTimeout(statusNotice._timer);
        statusNotice._timer = setTimeout(() => {
          statusNotice.classList.remove("is-visible");
        }, 1600);
      };

      const actions = document.createElement("div");
      actions.className = "ds-randomizer-actions";

      // Regenerate / Preview Button
      const regenBtn = document.createElement("button");
      regenBtn.type = "button";
      regenBtn.className = "ds-rand-btn is-accent";
      regenBtn.title = "Generate live randomized preview";
      regenBtn.innerHTML = `${ICONS.shuffle}<span>Preview</span>`;
      regenBtn.onclick = async () => {
        try {
          regenBtn.classList.add("is-loading");
          let promptText = (srcTextarea.value || "").trim();
          if (!promptText) {
            promptText = resolveUpstreamPrompt(self);
          }
          if (!promptText) {
            showStatus("No Prompt Text");
            return;
          }

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
            showStatus("Variation Generated");
          }
        } catch (e) {
          console.error("[DS Randomizer] Preview error:", e);
          showStatus("Preview Error");
        } finally {
          regenBtn.classList.remove("is-loading");
        }
      };

      // Reset History Button
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "ds-rand-icon-btn";
      resetBtn.title = "Reset non-repetition history";
      resetBtn.innerHTML = ICONS.rotateCcw;
      resetBtn.onclick = async () => {
        try {
          await fetch("/ds/randomizer/reset_history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(self.id) }),
          });
          showStatus("History Reset");
        } catch (e) {
          console.error("[DS Randomizer] Reset history error:", e);
        }
      };

      // Copy Source Prompt Button
      const copySrcBtn = document.createElement("button");
      copySrcBtn.type = "button";
      copySrcBtn.className = "ds-rand-icon-btn";
      copySrcBtn.title = "Copy source prompt";
      copySrcBtn.innerHTML = ICONS.copy;
      copySrcBtn.onclick = async () => {
        const textToCopy = (srcTextarea.value || "").trim() || resolveUpstreamPrompt(self);
        const ok = await copyToClipboard(textToCopy);
        if (ok) showStatus("Copied Prompt");
      };

      // Clear Source Prompt Button
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "ds-rand-icon-btn";
      clearBtn.title = "Clear source prompt";
      clearBtn.innerHTML = ICONS.clear;
      clearBtn.onclick = () => {
        if (!srcTextarea.value || confirm("Clear source prompt?")) {
          srcTextarea.value = "";
          syncSourceText("");
          showStatus("Cleared");
        }
      };

      actions.appendChild(regenBtn);
      actions.appendChild(resetBtn);
      actions.appendChild(copySrcBtn);
      actions.appendChild(clearBtn);

      toolbar.appendChild(title);
      toolbar.appendChild(statusNotice);
      toolbar.appendChild(actions);
      root.appendChild(toolbar);

      // -------------------------------------------------------------
      // 2. SECTION A: SOURCE PROMPT
      // -------------------------------------------------------------
      const srcSection = document.createElement("div");
      srcSection.className = "ds-rand-section";
      srcSection.style.flex = "1 1 0";

      const srcHeader = document.createElement("div");
      srcHeader.className = "ds-rand-section-header";

      const srcHeaderLeft = document.createElement("div");
      srcHeaderLeft.style.display = "flex";
      srcHeaderLeft.style.alignItems = "center";
      srcHeaderLeft.style.gap = "6px";

      const srcHeaderTitle = document.createElement("span");
      srcHeaderTitle.textContent = "Source Prompt (Template)";

      const wiredBadge = document.createElement("span");
      wiredBadge.className = "ds-rand-wired-badge";
      wiredBadge.style.display = "none";
      wiredBadge.innerHTML = `${ICONS.link}<span>Wired</span>`;

      srcHeaderLeft.appendChild(srcHeaderTitle);
      srcHeaderLeft.appendChild(wiredBadge);
      srcHeader.appendChild(srcHeaderLeft);

      const srcWrap = document.createElement("div");
      srcWrap.className = "ds-rand-textarea-wrap";

      const promptWidget = (this.widgets || []).find((w) => w.name === "prompt" || w.name === "text");

      const srcTextarea = document.createElement("textarea");
      srcTextarea.className = "ds-rand-textarea";
      srcTextarea.placeholder = "Enter your prompt template here (e.g. Portrait of a 25-year-old woman with long hair, wearing a jacket, in a coffee shop)...";
      srcTextarea.value = self.properties.ds_randomizer_source ?? promptWidget?.value ?? "";

      function syncSourceText(val) {
        if (promptWidget) promptWidget.value = val;
        self.properties.ds_randomizer_source = val;
      }

      srcTextarea.oninput = () => syncSourceText(srcTextarea.value);

      function updateWiredStatus() {
        const conn = getUpstreamConnection(self);
        if (conn) {
          const originTitle = conn.originNode.title || conn.originNode.type || "Upstream";
          wiredBadge.innerHTML = `${ICONS.link}<span>Wired: ${originTitle}</span>`;
          wiredBadge.style.display = "inline-flex";

          const upstreamPrompt = resolveUpstreamPrompt(self);
          if (upstreamPrompt) {
            srcTextarea.value = upstreamPrompt;
            self.properties.ds_randomizer_source = upstreamPrompt;
          }
          srcTextarea.readOnly = true;
          srcTextarea.classList.add("is-wired");
          srcTextarea.placeholder = `Connected to upstream (${originTitle}). Incoming text takes precedence on execution and live preview.`;
        } else {
          wiredBadge.style.display = "none";
          srcTextarea.readOnly = false;
          srcTextarea.classList.remove("is-wired");
          srcTextarea.placeholder = "Enter your prompt template here (e.g. Portrait of a 25-year-old woman with long hair, wearing a jacket, in a coffee shop)...";
        }
      }
      self._updateWiredStatus = updateWiredStatus;

      srcWrap.appendChild(srcTextarea);
      srcSection.appendChild(srcHeader);
      srcSection.appendChild(srcWrap);
      root.appendChild(srcSection);

      // -------------------------------------------------------------
      // 3. SECTION B: RANDOMIZATION CATEGORIES
      // -------------------------------------------------------------
      const catPanel = document.createElement("div");
      catPanel.className = "ds-rand-categories-panel";

      // 1. Group Tabs (Header Track)
      const tabsHeader = document.createElement("div");
      tabsHeader.className = "ds-rand-tabs-header";

      const tabsWrap = document.createElement("div");
      tabsWrap.className = "ds-rand-group-tabs";
      tabsHeader.appendChild(tabsWrap);
      catPanel.appendChild(tabsHeader);

      // 2. Clear Visual Partition Divider Line
      const partitionLine = document.createElement("div");
      partitionLine.className = "ds-rand-partition-divider";
      catPanel.appendChild(partitionLine);

      // 3. Sub-Options Box (Distinct container for active tab's sub-options)
      const suboptionsBox = document.createElement("div");
      suboptionsBox.className = "ds-rand-suboptions-box";

      const suboptionsHeader = document.createElement("div");
      suboptionsHeader.className = "ds-rand-suboptions-header";

      const suboptionsTitleRow = document.createElement("div");
      suboptionsTitleRow.className = "ds-rand-suboptions-title-row";

      const suboptionsLabel = document.createElement("span");
      suboptionsLabel.className = "ds-rand-suboptions-label";
      suboptionsLabel.textContent = "ALL ATTRIBUTES";

      const catCountBadge = document.createElement("span");
      catCountBadge.className = "ds-rand-badge";
      catCountBadge.textContent = "0 active";

      suboptionsTitleRow.appendChild(suboptionsLabel);
      suboptionsTitleRow.appendChild(catCountBadge);
      suboptionsHeader.appendChild(suboptionsTitleRow);

      const catQuickActions = document.createElement("div");
      catQuickActions.className = "ds-rand-chips-actions";

      const selectAllBtn = document.createElement("button");
      selectAllBtn.type = "button";
      selectAllBtn.className = "ds-rand-micro-btn";
      selectAllBtn.textContent = "Select All";
      selectAllBtn.onclick = () => {
        const visibleCats = getVisibleCategoryIds();
        const cur = new Set(self.properties.ds_randomizer_state.enabled_categories || []);
        for (const cid of visibleCats) cur.add(cid);
        self.properties.ds_randomizer_state.enabled_categories = Array.from(cur);
        saveState();
        renderChips();
      };

      const clearAllBtn = document.createElement("button");
      clearAllBtn.type = "button";
      clearAllBtn.className = "ds-rand-micro-btn";
      clearAllBtn.textContent = "Clear All";
      clearAllBtn.onclick = () => {
        const visibleCats = new Set(getVisibleCategoryIds());
        const cur = (self.properties.ds_randomizer_state.enabled_categories || []).filter(
          (cid) => !visibleCats.has(cid)
        );
        self.properties.ds_randomizer_state.enabled_categories = cur;
        saveState();
        renderChips();
      };

      catQuickActions.appendChild(selectAllBtn);
      catQuickActions.appendChild(clearAllBtn);
      suboptionsHeader.appendChild(catQuickActions);
      suboptionsBox.appendChild(suboptionsHeader);

      // Chips Grid inside the sub-options box
      const chipsGrid = document.createElement("div");
      chipsGrid.className = "ds-rand-chips-grid";
      suboptionsBox.appendChild(chipsGrid);

      // Category Options Panel (e.g. Age Range presets)
      const optionsPanel = document.createElement("div");
      optionsPanel.className = "ds-rand-options-panel";
      optionsPanel.style.display = "none";
      suboptionsBox.appendChild(optionsPanel);

      catPanel.appendChild(suboptionsBox);
      root.appendChild(catPanel);

      // -------------------------------------------------------------
      // 4. SECTION C: PREVIEW
      // -------------------------------------------------------------
      const prevSection = document.createElement("div");
      prevSection.className = "ds-rand-section";
      prevSection.style.flex = "1 1 0";

      const prevHeader = document.createElement("div");
      prevHeader.className = "ds-rand-section-header";

      const prevLabel = document.createElement("span");
      prevLabel.textContent = "Generated Preview (Output)";

      const copyPrevBtn = document.createElement("button");
      copyPrevBtn.type = "button";
      copyPrevBtn.className = "ds-rand-copy-btn";
      copyPrevBtn.title = "Copy generated variation";
      copyPrevBtn.innerHTML = `${ICONS.copy}<span>Copy</span>`;
      copyPrevBtn.onclick = async () => {
        const ok = await copyToClipboard(previewTextarea.value);
        if (ok) showStatus("Copied Preview");
      };

      prevHeader.appendChild(prevLabel);
      prevHeader.appendChild(copyPrevBtn);

      const prevWrap = document.createElement("div");
      prevWrap.className = "ds-rand-textarea-wrap";

      const previewTextarea = document.createElement("textarea");
      previewTextarea.className = "ds-rand-textarea is-preview";
      previewTextarea.setAttribute("readonly", "true");
      previewTextarea.placeholder = "The randomized variation will appear here on queue or preview...";
      previewTextarea.value = self.properties.ds_randomizer_preview || "";

      prevWrap.appendChild(previewTextarea);
      prevSection.appendChild(prevHeader);
      prevSection.appendChild(prevWrap);
      root.appendChild(prevSection);

      this._dsPreviewTextarea = previewTextarea;

      // -------------------------------------------------------------
      // HELPER METHODS & STATE SYNC
      // -------------------------------------------------------------
      function saveState() {
        const stateWidget = ensureStateWidget(self);
        if (stateWidget) {
          stateWidget.value = JSON.stringify(self.properties.ds_randomizer_state);
        }
        updateBadge();
        renderOptions();
      }

      function updateBadge() {
        const count = (self.properties.ds_randomizer_state.enabled_categories || []).length;
        catCountBadge.textContent = `${count} active`;
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
        tabsWrap.innerHTML = "";
        const allTab = document.createElement("button");
        allTab.type = "button";
        allTab.className = `ds-rand-tab ${activeGroup === "all" ? "is-active" : ""}`;
        allTab.textContent = "All";
        allTab.onclick = () => {
          activeGroup = "all";
          renderTabs();
          renderChips();
        };
        tabsWrap.appendChild(allTab);

        for (const grp of categoriesCatalog.groups) {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.className = `ds-rand-tab ${activeGroup === grp.id ? "is-active" : ""}`;
          tab.textContent = grp.name;
          tab.onclick = () => {
            activeGroup = grp.id;
            renderTabs();
            renderChips();
          };
          tabsWrap.appendChild(tab);
        }

        const activeGroupObj = (categoriesCatalog.groups || []).find((g) => g.id === activeGroup);
        suboptionsLabel.textContent =
          activeGroup === "all"
            ? "ALL ATTRIBUTES"
            : `${activeGroupObj ? activeGroupObj.name.toUpperCase() : activeGroup.toUpperCase()} ATTRIBUTES`;
      }

      function renderChips() {
        chipsGrid.innerHTML = "";
        const enabledSet = new Set(self.properties.ds_randomizer_state.enabled_categories || []);
        const cats = categoriesCatalog.categories.filter(
          (c) => activeGroup === "all" || c.group === activeGroup
        );

        for (const cat of cats) {
          const chip = document.createElement("button");
          chip.type = "button";
          const isActive = enabledSet.has(cat.id);
          chip.className = `ds-rand-chip ${isActive ? "is-active" : ""}`;
          chip.title = `${cat.name} (${cat.entries_count || 0} variations)`;
          chip.textContent = cat.name;

          chip.onclick = () => {
            const list = self.properties.ds_randomizer_state.enabled_categories || [];
            if (enabledSet.has(cat.id)) {
              self.properties.ds_randomizer_state.enabled_categories = list.filter((id) => id !== cat.id);
            } else {
              self.properties.ds_randomizer_state.enabled_categories = [...list, cat.id];
            }
            saveState();
            renderChips();
          };

          chipsGrid.appendChild(chip);
        }
        updateBadge();
        renderOptions();
      }

      function renderOptions() {
        const enabled = self.properties.ds_randomizer_state.enabled_categories || [];
        const hasAge = enabled.includes("age_range");

        if (!hasAge) {
          optionsPanel.style.display = "none";
          return;
        }

        optionsPanel.style.display = "flex";
        optionsPanel.innerHTML = "";

        const label = document.createElement("span");
        label.className = "ds-rand-options-label";
        label.textContent = "Age Range:";
        optionsPanel.appendChild(label);

        const ageOpts = [
          { id: "any", label: "Any (18+)" },
          { id: "18_24", label: "18–24" },
          { id: "25_35", label: "25–35" },
          { id: "36_50", label: "36–50" },
          { id: "50_plus", label: "50+" },
        ];

        const curPreset = self.properties.ds_randomizer_state.options?.age_range?.preset || "any";

        for (const opt of ageOpts) {
          const optChip = document.createElement("button");
          optChip.type = "button";
          optChip.className = `ds-rand-opt-chip ${curPreset === opt.id ? "is-selected" : ""}`;
          optChip.textContent = opt.label;
          optChip.onclick = () => {
            self.properties.ds_randomizer_state.options = self.properties.ds_randomizer_state.options || {};
            self.properties.ds_randomizer_state.options.age_range = { preset: opt.id };
            saveState();
          };
          optionsPanel.appendChild(optChip);
        }
      }

      // Fetch category catalog from backend
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

        // Fallback catalog if backend is not yet contacted
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

      loadCatalog();
      updateWiredStatus();

      // Mount DOM widget to LiteGraph node
      this.addDOMWidget("ds_randomizer_widget", "custom", root, {
        serialize: false,
        hideOnZoom: false,
      });

      // Initial clean pass to guarantee no native widgets are drawn on canvas
      hideAllNativeWidgets(this);
    };

    // Connections change - detect wired upstream prompt
    nodeType.prototype.onConnectionsChange = function () {
      if (originalConnections) originalConnections.apply(this, arguments);
      cleanupObsoleteInputs(this);
      if (typeof this._updateWiredStatus === "function") {
        this._updateWiredStatus();
      }
      hideAllNativeWidgets(this);
    };

    // Serialization: guarantee randomizer_state is included
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

    // Configure / Graph Restore
    nodeType.prototype.configure = function (info) {
      if (originalConfigure) originalConfigure.apply(this, arguments);

      cleanupObsoleteInputs(this);
      ensureStateWidget(this);
      hideAllNativeWidgets(this);

      const promptWidget = (this.widgets || []).find((w) => w.name === "prompt" || w.name === "text");
      const stateWidget = (this.widgets || []).find((w) => w.name === "randomizer_state");

      if (stateWidget && stateWidget.value && stateWidget.value !== "{}") {
        try {
          const parsed = JSON.parse(stateWidget.value);
          if (parsed && typeof parsed === "object") {
            this.properties = this.properties || {};
            this.properties.ds_randomizer_state = parsed;
          }
        } catch (_) {}
      } else if (this.properties?.ds_randomizer_state && stateWidget) {
        stateWidget.value = JSON.stringify(this.properties.ds_randomizer_state);
      }

      if (this.properties?.ds_randomizer_preview && this._dsPreviewTextarea) {
        this._dsPreviewTextarea.value = this.properties.ds_randomizer_preview;
      }

      if (typeof this._updateWiredStatus === "function") {
        this._updateWiredStatus();
      } else if (this._dsRoot) {
        const textarea = this._dsRoot.querySelector(".ds-rand-textarea:not(.is-preview)");
        if (textarea) {
          textarea.value = this.properties?.ds_randomizer_source ?? promptWidget?.value ?? "";
        }
      }
    };

    // Handle ComfyUI execution results
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
        // 1. Detect if any DS_ImageCheckpoint or gate node is in 'continue' mode
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

        // 2. Index DS_Randomizer nodes in the graph
        const randIndex = new Map();
        if (app?.graph) {
          for (const n of (app.graph._nodes || app.graph.nodes || [])) {
            if (n && (n.comfyClass === "DS_Randomizer" || n.type === "DS_Randomizer")) {
              randIndex.set(String(n.id), n);
            }
          }
        }

        // 3. Coordinate seed per DS_Randomizer
        for (const id in out) {
          const entry = out[id];
          if (entry?.class_type === "DS_Randomizer") {
            const node = randIndex.get(String(id));
            entry.inputs = entry.inputs || {};

            if (isContinuing) {
              // CONTINUE / UPSCALE STAGE: Preserve the exact seed so the upscaler gets the identical prompt!
              const stableSeed = node?._dsLastRunSeed || entry.inputs.seed || 1;
              entry.inputs.seed = stableSeed;
            } else {
              // FRESH QUEUE or REGENERATE: Assign a fresh random seed to trigger new variation
              const freshSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
              if (node) {
                node._dsLastRunSeed = freshSeed;
                const seedWidget = (node.widgets || []).find((w) => w?.name === "seed");
                if (seedWidget) seedWidget.value = freshSeed;
              }
              entry.inputs.seed = freshSeed;
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
