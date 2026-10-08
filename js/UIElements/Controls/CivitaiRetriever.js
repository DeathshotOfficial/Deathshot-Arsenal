/**
 * DeathshotArsenal Unified UI — Civitai Trigger Words Retriever
 * Centralized online trigger retrieval & trigger selector for ALL nodes.
 * Queries civitai.com & civitai.red directly, extracts strict trainedWords,
 * avoids tag pollution or hardcoded fallbacks, and syncs across all nodes.
 */

import { DSIcon, DSIconMarkup } from "../../Icons/index.js";
import { Button } from "./Button.js";

const SETTINGS_KEY = "DS_Civitai.settings.v1";
const LEGACY_SETTINGS_KEY = "DS_LoRaLoader.settings.v1";

let _activeCivitaiModal = null;

/**
 * Retrieve saved CivitAI preferences (API key, site mode, etc.)
 */
export function getCivitaiSettings() {
  const defaults = {
    civitaiApiKey: "",
    siteMode: "Standard", // 'Standard' (civitai.com) or 'Unrestricted' (civitai.red)
    allowNsfwPreviews: true,
    showThumbnails: true,
  };

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    }
  } catch (_) { }

  // Fallback to legacy key
  try {
    const legacyRaw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      return {
        ...defaults,
        civitaiApiKey: parsed.civitaiApiKey || "",
        siteMode: parsed.siteMode || "Standard",
        allowNsfwPreviews: parsed.allowNsfwPreviews ?? true,
        showThumbnails: parsed.showThumbnails ?? true,
      };
    }
  } catch (_) { }

  return defaults;
}

/**
 * Save CivitAI preferences and mirror to legacy key for compatibility.
 */
export function saveCivitaiSettings(newSettings = {}) {
  try {
    const current = getCivitaiSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

    // Mirror to legacy key so older loaders don't lose API key
    try {
      const legacyRaw = localStorage.getItem(LEGACY_SETTINGS_KEY);
      const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : {};
      legacyParsed.civitaiApiKey = updated.civitaiApiKey;
      legacyParsed.siteMode = updated.siteMode;
      localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(legacyParsed));
    } catch (_) { }

    return updated;
  } catch (_) {
    return newSettings;
  }
}

/**
 * Clean display name for a LoRA file path.
 */
function cleanLoRaName(path) {
  if (!path) return "LoRA Model";
  const name = String(path).split(/[\\/]/).pop() || "";
  return name.replace(/\.(safetensors|pt|ckpt|bin)$/i, "");
}

/**
 * Query backend CivitAI retriever endpoint.
 */
export async function retrieveCivitaiMetadata({
  name,
  forceOnline = false,
  apiKey = null,
  siteMode = null,
  allowNsfw = true,
} = {}) {
  if (!name) {
    return { ok: false, error: "No LoRA model specified.", trainedWords: [], hasTriggers: false };
  }

  const settings = getCivitaiSettings();
  const activeKey = apiKey !== null ? apiKey : settings.civitaiApiKey;
  const activeSiteMode = siteMode !== null ? siteMode : settings.siteMode;

  const payload = {
    name,
    forceOnline: Boolean(forceOnline),
    apiKey: activeKey || "",
    siteMode: activeSiteMode || "Standard",
    allowNsfw: Boolean(allowNsfw),
  };

  const endpoints = ["/ds/civitai/retrieve", "/ds/lora_metadata"];
  let lastError = null;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      lastError = err;
    }
  }

  return {
    ok: false,
    error: lastError ? String(lastError?.message || lastError) : "Failed to reach server.",
    trainedWords: [],
    hasTriggers: false,
    source: "error",
  };
}

/**
 * Open Centralized CivitAI Trigger Words Modal
 * Usable by LoRa Loader, AI Prompt Sensei, Generation Hub, or any custom node.
 */
export function openCivitaiRetrieverModal(options = {}) {
  const {
    node,
    loraName,
    selectedTriggers = [],
    anchorEl = null,
    onApply = null,
    onClose = null,
  } = options;

  if (_activeCivitaiModal) {
    _activeCivitaiModal.close();
    _activeCivitaiModal = null;
  }

  const settings = getCivitaiSettings();
  let currentTriggers = Array.from(selectedTriggers || []);
  let availableTriggers = [];
  let currentImages = [];
  let isRetrieving = false;
  let showSettings = false;
  let modelVerifiedNoTriggers = false;

  // Outer host
  const modal = document.createElement("div");
  modal.className = "ds-civitai-modal-host";

  // Panel
  const panel = document.createElement("div");
  panel.className = "ds-civitai-modal";
  panel.style.width = "460px";
  panel.style.maxWidth = "calc(100vw - 32px)";

  // 1. Header
  const head = document.createElement("div");
  head.className = "ds-civitai-modal-head";

  const titleGroup = document.createElement("div");
  titleGroup.className = "ds-civitai-modal-title-group";

  const titleIcon = DSIcon("sparkles", { size: 14 });
  const titleText = document.createElement("span");
  titleText.className = "ds-civitai-modal-title";
  titleText.textContent = cleanLoRaName(loraName);
  titleText.title = loraName || "";

  const siteBadge = document.createElement("span");
  siteBadge.className = "ds-civitai-site-badge";
  siteBadge.textContent = settings.siteMode === "Unrestricted" ? "civitai.red" : "civitai.com";

  titleGroup.append(titleIcon, titleText, siteBadge);

  const headActions = document.createElement("div");
  headActions.style.display = "flex";
  headActions.style.alignItems = "center";
  headActions.style.gap = "4px";

  const settingsBtn = Button({
    icon: "gear",
    compact: true,
    tooltip: "CivitAI API Settings",
    onClick: () => {
      showSettings = !showSettings;
      settingsDrawer.style.display = showSettings ? "flex" : "none";
    },
  });

  const closeBtn = Button({
    icon: "x",
    compact: true,
    tooltip: "Close",
    onClick: () => closeModal(true),
  });

  headActions.append(settingsBtn.root, closeBtn.root);
  head.append(titleGroup, headActions);

  // 2. Settings Drawer (Collapsible)
  const settingsDrawer = document.createElement("div");
  settingsDrawer.className = "ds-civitai-settings-drawer";
  settingsDrawer.style.display = "none";

  const apiKeyRow = document.createElement("div");
  apiKeyRow.className = "ds-civitai-settings-row";

  const apiKeyLabel = document.createElement("span");
  apiKeyLabel.textContent = "CivitAI API Key";
  apiKeyLabel.style.fontSize = "11px";
  apiKeyLabel.style.color = "var(--ds-color-muted-text, #9ca3af)";

  const apiKeyInput = document.createElement("input");
  apiKeyInput.type = "password";
  apiKeyInput.className = "ds-civitai-input";
  apiKeyInput.placeholder = "Paste your CivitAI API token...";
  apiKeyInput.value = settings.civitaiApiKey || "";
  apiKeyInput.onchange = () => {
    saveCivitaiSettings({ civitaiApiKey: apiKeyInput.value.trim() });
  };

  apiKeyRow.append(apiKeyLabel, apiKeyInput);

  const siteModeRow = document.createElement("div");
  siteModeRow.className = "ds-civitai-settings-row";

  const siteModeLabel = document.createElement("span");
  siteModeLabel.textContent = "CivitAI Domain";
  siteModeLabel.style.fontSize = "11px";
  siteModeLabel.style.color = "var(--ds-color-muted-text, #9ca3af)";

  const siteModeSelect = document.createElement("select");
  siteModeSelect.className = "ds-civitai-input";
  siteModeSelect.style.cursor = "pointer";

  const optCom = document.createElement("option");
  optCom.value = "Standard";
  optCom.textContent = "civitai.com (Standard)";
  const optRed = document.createElement("option");
  optRed.value = "Unrestricted";
  optRed.textContent = "civitai.red (Unrestricted / NSFW)";

  siteModeSelect.append(optCom, optRed);
  siteModeSelect.value = settings.siteMode === "Unrestricted" ? "Unrestricted" : "Standard";
  siteModeSelect.onchange = () => {
    const updated = saveCivitaiSettings({ siteMode: siteModeSelect.value });
    siteBadge.textContent = updated.siteMode === "Unrestricted" ? "civitai.red" : "civitai.com";
  };

  siteModeRow.append(siteModeLabel, siteModeSelect);
  settingsDrawer.append(apiKeyRow, siteModeRow);

  // 3. Body
  const body = document.createElement("div");
  body.className = "ds-civitai-modal-body";

  // Action / Status Bar
  const actionBar = document.createElement("div");
  actionBar.className = "ds-civitai-action-bar";

  const statusText = document.createElement("div");
  statusText.className = "ds-civitai-status-text";
  statusText.textContent = "Checking cache...";

  const retrieveBtn = Button({
    icon: "download",
    label: "Retrieve from CivitAI",
    compact: true,
    variant: "primary",
    onClick: () => doFetch(true),
  });

  actionBar.append(statusText, retrieveBtn.root);

  // Quick Action Buttons Row (All / None)
  const quickRow = document.createElement("div");
  quickRow.className = "ds-civitai-quick-row";

  const allBtn = Button({
    label: "All",
    compact: true,
    onClick: () => {
      currentTriggers = Array.from(new Set([...currentTriggers, ...availableTriggers]));
      renderChips();
    },
  });

  const noneBtn = Button({
    label: "None",
    compact: true,
    onClick: () => {
      currentTriggers = [];
      renderChips();
    },
  });

  const countBadge = document.createElement("span");
  countBadge.className = "ds-civitai-count-badge";

  quickRow.append(allBtn.root, noneBtn.root, countBadge);

  // Chips Container
  const chipsWrap = document.createElement("div");
  chipsWrap.className = "ds-civitai-chips-wrap";

  // Thumbnail Container
  const thumbWrap = document.createElement("div");
  thumbWrap.className = "ds-civitai-thumb-wrap";
  thumbWrap.style.display = "none";

  const thumbImg = document.createElement("img");
  thumbImg.className = "ds-civitai-thumb-img";
  thumbImg.alt = "CivitAI Preview";
  thumbWrap.appendChild(thumbImg);

  body.append(actionBar, quickRow, chipsWrap, thumbWrap);

  // 4. Footer
  const foot = document.createElement("div");
  foot.className = "ds-civitai-modal-foot";

  const cancelBtn = Button({
    label: "Cancel",
    compact: true,
    onClick: () => closeModal(false),
  });

  const applyBtn = Button({
    label: "Apply",
    compact: true,
    variant: "primary",
    onClick: () => closeModal(true),
  });

  foot.append(cancelBtn.root, applyBtn.root);

  panel.append(head, settingsDrawer, body, foot);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  // Positioning
  const positionModal = () => {
    if (!panel.isConnected) return;
    const pw = panel.offsetWidth || 460;
    const ph = panel.offsetHeight || 480;

    let nodeRect = null;
    let anchorRect = null;

    if (anchorEl && document.body.contains(anchorEl)) {
      anchorRect = anchorEl.getBoundingClientRect();
    }

    if (node) {
      const nodeEl = node._domCard || node._domRoot || node._dsLora?.card || node.dom;
      if (nodeEl && document.body.contains(nodeEl)) {
        nodeRect = nodeEl.getBoundingClientRect();
      }
    }

    if (!nodeRect && anchorEl && document.body.contains(anchorEl)) {
      const nodeCard = anchorEl.closest?.(".ds-sensei-root, .ds-sensei-container, .ds-sensei-card, .ds-hub-container, .ds-lora-card, .ds-card, .ds-node-root");
      if (nodeCard && document.body.contains(nodeCard)) {
        nodeRect = nodeCard.getBoundingClientRect();
      }
    }

    if (!nodeRect && node?.pos && window.app?.canvas?.ds) {
      try {
        const ds = window.app.canvas.ds;
        const canvasEl = window.app.canvas.canvas;
        const cRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 };
        const screenX = cRect.left + (node.pos[0] + ds.offset[0]) * ds.scale;
        const screenY = cRect.top + (node.pos[1] + ds.offset[1]) * ds.scale;
        const nodeW = (node.size ? node.size[0] : 420) * ds.scale;
        const nodeH = (node.size ? node.size[1] : 500) * ds.scale;
        nodeRect = {
          left: screenX,
          top: screenY,
          right: screenX + nodeW,
          bottom: screenY + nodeH,
          width: nodeW,
          height: nodeH,
        };
      } catch (_) {}
    }

    const margin = 14;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const targetRect = nodeRect || anchorRect;

    if (targetRect) {
      // Preferred side: Right side of the node
      let left = targetRect.right + margin;
      if (left + pw > viewportW - margin) {
        // If right side doesn't fit, check if left side of node has enough space
        if (targetRect.left - pw - margin >= margin) {
          left = targetRect.left - pw - margin;
        } else {
          // Clamp inside viewport
          left = Math.max(margin, viewportW - pw - margin);
        }
      }
      left = Math.max(margin, Math.min(left, viewportW - pw - margin));

      // Vertical position: align near the clicked row (anchor) or top of node card
      let top = anchorRect ? anchorRect.top - 20 : targetRect.top;
      if (top + ph > viewportH - margin) {
        top = Math.max(margin, viewportH - ph - margin);
      }
      top = Math.max(margin, top);

      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
    } else {
      // Center
      panel.style.left = `${Math.max(margin, Math.round((viewportW - pw) / 2))}px`;
      panel.style.top = `${Math.max(margin, Math.round((viewportH - ph) / 2))}px`;
    }
  };

  // Render trigger chips
  const renderChips = () => {
    chipsWrap.textContent = "";

    const activeCount = availableTriggers.filter((t) => currentTriggers.includes(t)).length;
    countBadge.textContent = `${activeCount} / ${availableTriggers.length} active`;
    quickRow.style.display = availableTriggers.length > 0 ? "flex" : "none";

    if (!availableTriggers.length) {
      const empty = document.createElement("div");
      empty.className = "ds-civitai-empty-state";
      if (isRetrieving) {
        empty.innerHTML = `
          <span class="ds-civitai-spinner">⏳</span>
          <span>Querying civitai.com and civitai.red...</span>
        `;
      } else if (modelVerifiedNoTriggers) {
        empty.innerHTML = `
          <span style="font-weight:650;color:var(--ds-color-accent, #67e8f9);font-size:12px;">✓ Verified on CivitAI</span>
          <span style="font-size:11.5px;color:var(--ds-color-text, #e5e7eb);line-height:1.4;">
            This LoRA is a slider / weight adjustment model and has <strong>no trigger words</strong>.
          </span>
          <span style="font-size:10.5px;color:var(--ds-color-muted-text, #9ca3af);">
            Control its effect directly using the strength slider.
          </span>
        `;
      } else {
        empty.innerHTML = `
          <span>No trigger words in cache.</span>
          <span style="font-size:10.5px;color:var(--ds-color-muted-text, #9ca3af);">
            Click <strong>Retrieve from CivitAI</strong> to fetch online.
          </span>
        `;
      }
      chipsWrap.appendChild(empty);
      positionModal();
      return;
    }

    for (const tag of availableTriggers) {
      const isSelected = currentTriggers.includes(tag);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ds-civitai-tag-chip" + (isSelected ? " is-selected" : "");
      chip.innerHTML = `${isSelected ? "✓ " : ""}${tag}`;
      chip.title = tag;

      chip.onclick = () => {
        if (currentTriggers.includes(tag)) {
          currentTriggers = currentTriggers.filter((t) => t !== tag);
        } else {
          currentTriggers.push(tag);
        }
        renderChips();
      };

      chipsWrap.appendChild(chip);
    }

    positionModal();
  };

  // Update thumbnail
  const updateThumbnail = (images) => {
    if (settings.showThumbnails && Array.isArray(images) && images.length && images[0]) {
      thumbImg.onload = () => {
        positionModal();
      };
      thumbImg.src = images[0];
      thumbWrap.style.display = "flex";
    } else {
      thumbWrap.style.display = "none";
    }
    positionModal();
  };

  // Main Fetch Logic
  const doFetch = async (forceOnline = false) => {
    isRetrieving = true;
    if (forceOnline) {
      retrieveBtn.setDisabled(true);
      retrieveBtn.setLabel("Retrieving...");
      statusText.innerHTML = `
        <span class="ds-civitai-spinner">⏳</span>
        <span>Querying CivitAI (${settings.siteMode === "Unrestricted" ? "civitai.red" : "civitai.com"})...</span>
      `;
    } else {
      statusText.textContent = "Checking cache...";
    }
    renderChips();

    try {
      const data = await retrieveCivitaiMetadata({
        name: loraName,
        forceOnline,
        apiKey: settings.civitaiApiKey,
        siteMode: settings.siteMode,
        allowNsfw: settings.allowNsfwPreviews,
      });

      isRetrieving = false;
      const words = Array.isArray(data?.trainedWords)
        ? data.trainedWords.filter((w) => String(w).trim()).map((w) => String(w).trim())
        : [];

      availableTriggers = words;
      currentImages = Array.isArray(data?.images) ? data.images : [];
      updateThumbnail(currentImages);

      if (data?.ok) {
        if (words.length > 0) {
          modelVerifiedNoTriggers = false;
          statusText.textContent = `✓ Found ${words.length} trigger word${words.length > 1 ? "s" : ""} on CivitAI.`;
          // If no triggers were previously selected, select all retrieved triggers automatically
          if (forceOnline && currentTriggers.length === 0) {
            currentTriggers = [...words];
          } else {
            // Keep only triggers that are valid or keep user choices
            const valid = new Set(words);
            currentTriggers = currentTriggers.filter((t) => valid.has(t));
            if (forceOnline && currentTriggers.length === 0) {
              currentTriggers = [...words];
            }
          }
        } else {
          // Model was found on CivitAI, but it has no trigger words (e.g. slider)
          modelVerifiedNoTriggers = true;
          statusText.textContent = "ℹ Found on CivitAI (Slider / No trigger words).";
          currentTriggers = [];
        }
      } else {
        modelVerifiedNoTriggers = false;
        if (forceOnline) {
          statusText.textContent = data?.error || "⚠ Model not found on CivitAI (.com / .red).";
        } else {
          statusText.textContent = "No cache found. Click 'Retrieve from CivitAI' to fetch.";
        }
      }

      renderChips();
    } catch (err) {
      isRetrieving = false;
      statusText.textContent = `Request error: ${err?.message || err}`;
      renderChips();
    } finally {
      retrieveBtn.setDisabled(false);
      retrieveBtn.setLabel("Retrieve from CivitAI");
      positionModal();
    }
  };

  // Close & cleanup
  const closeModal = (apply = true) => {
    if (_activeCivitaiModal === modalHelper) {
      _activeCivitaiModal = null;
    }
    if (apply && onApply) {
      onApply(currentTriggers, { trainedWords: availableTriggers, images: currentImages });
    }
    if (!apply && onClose) {
      onClose();
    }
    window.removeEventListener("resize", positionModal);
    modal.remove();
    document.removeEventListener("pointerdown", outsideHandler, true);
    document.removeEventListener("keydown", escHandler, true);
  };

  // Outside click & ESC handlers
  const outsideHandler = (e) => {
    if (!panel.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeModal(true);
    }
  };

  const escHandler = (e) => {
    if (e.key === "Escape") {
      closeModal(true);
    }
  };

  window.addEventListener("resize", positionModal);

  setTimeout(() => {
    document.addEventListener("pointerdown", outsideHandler, true);
    document.addEventListener("keydown", escHandler, true);
  }, 20);

  const modalHelper = {
    modal,
    panel,
    close: () => closeModal(false),
  };
  _activeCivitaiModal = modalHelper;

  // Initial display & cache check
  positionModal();
  doFetch(false);

  return modalHelper;
}

// Make accessible on window for easy cross-module consumption
if (typeof window !== "undefined") {
  window.DSCivitaiRetriever = {
    open: openCivitaiRetrieverModal,
    retrieve: retrieveCivitaiMetadata,
    getSettings: getCivitaiSettings,
    saveSettings: saveCivitaiSettings,
  };
}
