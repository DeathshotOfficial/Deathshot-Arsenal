/**
 * Deathshot Arsenal — DS The Purger Frontend
 * Overhauled Card-based UI architecture with built-in live status bar
 * and targeted resource cleanup.
 */

import { app } from "/scripts/app.js";
import { attachNodeShortcuts } from "../UIElements/shortcuts.js";
import { api } from "/scripts/api.js";
import { createCard } from "../UIElements/card_layout.js";
import { StatusBar, Toggle } from "../UIElements/index.js";

const TYPE = "DS_ThePurger";
const DISPLAY_NAME = "DS The Purger";
const EXT_NAME = "DeathshotArsenal.DS_ThePurger";
const CSS_URL = "/extensions/DeathshotArsenal/The%20Purger/ds_the_purger.css";

const ACTION_DESCRIPTIONS = {
  ALL: "Coordinated ejection of all models, caches, VRAM, and RAM",
  VRAM: "Flush CUDA/MPS caches and release GPU memory allocations",
  RAM: "Force Python garbage collection and trim system working set",
  MODELS: "Eject ComfyUI diffusion models and Deathshot AI LLM/VLM from VRAM",
  CACHE: "Flush disposable framework, LoRA, and node execution caches",
};

// ---------------------------------------------------------------------------
// Global Shared Configuration & State
// ---------------------------------------------------------------------------
let globalConfig = {
  buttons: ["ALL", "VRAM", "RAM", "MODELS", "CACHE"],
  enabled: {
    ALL: true,
    VRAM: true,
    RAM: true,
    MODELS: true,
    CACHE: true,
  },
};

const activePurgerNodes = new Set();
let activeGearPopover = null;

// ---------------------------------------------------------------------------
// CSS Injection
// ---------------------------------------------------------------------------
function ensureCSS() {
  if (!document.querySelector(`link[href*="ds_the_purger.css"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CSS_URL}?v=${Date.now()}`;
    document.head.appendChild(link);
  }
}

// ---------------------------------------------------------------------------
// Config Persistence & Live Sync
// ---------------------------------------------------------------------------
async function fetchConfig() {
  try {
    const res = await fetch("/ds/purger/config", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.buttons && data.enabled) {
        globalConfig = data;
        syncAllNodes();
      }
    }
  } catch (_) {}
}

async function saveConfig(newConfig) {
  globalConfig = newConfig;
  syncAllNodes();
  try {
    await fetch("/ds/purger/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConfig),
    });
  } catch (_) {}
}

function syncAllNodes() {
  for (const node of activePurgerNodes) {
    if (node._dsRefreshButtons) {
      node._dsRefreshButtons();
    }
  }
}

function getVisibleButtons() {
  const list = globalConfig.buttons || ["ALL", "VRAM", "RAM", "MODELS", "CACHE"];
  const enabledMap = globalConfig.enabled || {};
  return list.filter((act) => enabledMap[act] !== false);
}

// ---------------------------------------------------------------------------
// Dynamic Type Resolution & Link Wire Color Synchronization
// ---------------------------------------------------------------------------
function resolveUpstreamType(node) {
  const graph = node?.graph || app?.graph;
  if (!graph || !graph.links) return null;

  let current = node;
  const visited = new Set();

  while (current && !visited.has(current)) {
    visited.add(current);
    const linkId = current.inputs?.[0]?.link;
    if (linkId == null) break;
    const l = graph.links[linkId];
    if (!l) break;
    const prevNode = graph.getNodeById(l.origin_id);
    if (!prevNode) break;

    const prevType = prevNode.type || prevNode.constructor?.type || "";
    if (prevType.includes("Reroute") || prevType === TYPE) {
      const slotType = prevNode.outputs?.[l.origin_slot]?.type;
      if (slotType && slotType !== "*" && slotType !== "0") {
        return slotType;
      }
      current = prevNode;
    } else {
      const originSlot = prevNode.outputs?.[l.origin_slot];
      const type = originSlot?.type;
      if (type && type !== "*" && type !== "0") {
        return type;
      }
      break;
    }
  }
  return null;
}

function resolveDownstreamType(node) {
  const graph = node?.graph || app?.graph;
  if (!graph || !graph.links) return null;

  const queue = [node];
  const visited = new Set([node]);

  while (queue.length > 0) {
    const cur = queue.shift();
    const links = cur.outputs?.[0]?.links || [];
    for (const linkId of links) {
      const l = graph.links[linkId];
      if (!l) continue;
      const targetNode = graph.getNodeById(l.target_id);
      if (!targetNode || visited.has(targetNode)) continue;
      visited.add(targetNode);

      const targetType = targetNode.type || targetNode.constructor?.type || "";
      if (targetType.includes("Reroute") || targetType === TYPE) {
        queue.push(targetNode);
      } else {
        const inputSlot = targetNode.inputs?.[l.target_slot];
        const type = inputSlot?.type;
        if (type && type !== "*" && type !== "0") {
          return type;
        }
      }
    }
  }
  return null;
}

function inferPurgerType(node) {
  return resolveUpstreamType(node) || resolveDownstreamType(node) || "*";
}

function stabilizePurger(node) {
  if (!node) return;
  const graph = node.graph || app?.graph;
  const resolvedType = inferPurgerType(node);
  node._dsPurgerType = resolvedType;

  if (node.inputs && node.inputs[0]) {
    node.inputs[0].type = resolvedType;
  }
  if (node.outputs && node.outputs[0]) {
    node.outputs[0].type = resolvedType;
  }

  const LG = window.LiteGraph;
  if (LG && LG.LGraphCanvas && graph && graph.links) {
    const color = LG.LGraphCanvas.link_type_colors?.[resolvedType] || (resolvedType === "*" ? null : undefined);

    if (node.inputs?.[0]?.link != null) {
      const l = graph.links[node.inputs[0].link];
      if (l) l.color = color;
    }
    if (node.outputs?.[0]?.links) {
      for (const linkId of node.outputs[0].links) {
        const l = graph.links[linkId];
        if (l) l.color = color;
      }
    }
  }

  node.setDirtyCanvas?.(true, true);
}

// ---------------------------------------------------------------------------
// Resource Cleanup Execution & Status Formatting
// ---------------------------------------------------------------------------
function formatPurgeSummary(detail) {
  const act = detail.action || "ALL";
  const elapsed = detail.elapsed_ms || 0;
  const status = detail.status || "PURGED";

  if (status === "FAILED") {
    return `${act} Failed: ${detail.message || "Error"}`;
  }

  const vramReleased = (detail.vram_released_str && detail.vram_released_str !== "0 MB")
    ? detail.vram_released_str
    : "";
  const ramReleased = (detail.ram_released_str && detail.ram_released_str !== "0 MB")
    ? detail.ram_released_str
    : "";
  const freePart = detail.vram_free_str ? ` • ${detail.vram_free_str} Free` : "";

  if (vramReleased && ramReleased) {
    return `Freed: ${vramReleased} VRAM, ${ramReleased} RAM${freePart} (${elapsed}ms)`;
  } else if (vramReleased) {
    return `Freed: ${vramReleased} VRAM${freePart} (${elapsed}ms)`;
  } else if (ramReleased) {
    return `Freed: ${ramReleased} RAM${freePart} (${elapsed}ms)`;
  } else {
    return `${act} Clean${freePart} (${elapsed}ms)`;
  }
}

function handlePurgeResult(node, detail) {
  if (!node || !detail) return;
  const statusBar = node._dsStatusBar;
  if (!statusBar) return;

  const text = formatPurgeSummary(detail);
  const status = detail.status || "PURGED";
  const state = (status === "FAILED") ? "error" : "success";

  statusBar.setStatus(text, state);
  if (statusBar.root) {
    statusBar.root.title = detail.message ? `${text}\n${detail.message}` : text;
  }

  node.properties = node.properties || {};
  node.properties.last_purge_text = text;
  node.properties.last_purge_state = state;
  node.properties.last_purge_info = {
    ...detail,
    summary_text: text,
    timestamp: Date.now(),
  };

  node.setDirtyCanvas?.(true, true);
}

async function triggerEject(node, action) {
  if (!node) return;
  const act = (action || node.properties?.selected_action || "ALL").toUpperCase().trim();

  node.properties = node.properties || {};
  node.properties.selected_action = act;
  if (node._dsUpdateActiveButton) {
    node._dsUpdateActiveButton(act);
  }

  const statusBar = node._dsStatusBar;
  if (statusBar) {
    statusBar.setStatus(`Ejecting ${act}...`, "running");
  }

  app.canvas?.emitBeforeChange?.();
  try {
    const res = await fetch("/ds/purger/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act, node_id: String(node.id) }),
    });

    if (res.ok) {
      const data = await res.json();
      handlePurgeResult(node, data);
    } else {
      if (statusBar) {
        statusBar.setStatus(`Eject failed (${res.status})`, "error");
      }
    }
  } catch (err) {
    if (statusBar) {
      statusBar.setStatus(`Eject error: ${err.message || err}`, "error");
    }
  } finally {
    app.canvas?.emitAfterChange?.();
    node.setDirtyCanvas?.(true, true);
  }
}

// ---------------------------------------------------------------------------
// Card UI Builder
// ---------------------------------------------------------------------------
function buildPurgerCard(node) {
  node.properties = node.properties || {};
  if (!node.properties.selected_action) {
    node.properties.selected_action = "ALL";
  }

  const card = createCard(node, {
    minWidth: 280,
    width: 320,
    lockHeight: true,
  });

  const buttonMap = new Map();
  const btnRowItem = card.row([], { height: 26 });
  const btnRow = btnRowItem.el;

  function renderButtons() {
    btnRow.replaceChildren();
    buttonMap.clear();

    const visible = getVisibleButtons();
    const currentAction = node.properties.selected_action || "ALL";

    for (const act of visible) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ds-ui-btn ds-ui-btn-compact ds-purger-btn";
      btn.textContent = act;
      btn.dataset.action = act;
      btn.title = ACTION_DESCRIPTIONS[act] || `Eject ${act}`;

      const isActive = (act === currentAction);
      if (isActive) {
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
      }

      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerEject(node, act);
      });

      btnRow.appendChild(btn);
      buttonMap.set(act, btn);
    }
  }

  node._dsRefreshButtons = () => {
    renderButtons();
  };

  node._dsUpdateActiveButton = (activeAct) => {
    node.properties = node.properties || {};
    node.properties.selected_action = activeAct;
    for (const [act, btn] of buttonMap.entries()) {
      const isActive = (act === activeAct);
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
    node.setDirtyCanvas?.(true, true);
  };

  renderButtons();

  const statusBar = StatusBar({
    state: node.properties?.last_purge_state || "idle",
    text: node.properties?.last_purge_text || "Ready to eject",
  });

  statusBar.root.addEventListener("pointerdown", (e) => e.stopPropagation());
  statusBar.root.addEventListener("mousedown", (e) => e.stopPropagation());

  node._dsStatusBar = statusBar;
  card.fixed(statusBar.root, { height: 22 });

  node._dsPurgerCard = card;
  return card;
}

// ---------------------------------------------------------------------------
// Toolbar DS Gear Menu Popover
// ---------------------------------------------------------------------------
function closeGearPopover() {
  if (activeGearPopover) {
    activeGearPopover.remove();
    activeGearPopover = null;
  }
}

function openPurgerGearPopover(targetNode, anchorEl) {
  closeGearPopover();

  const popover = document.createElement("div");
  popover.className = "ds-purger-gear-popover";
  popover.dataset.dsThemed = "true";

  window.DSGlobalTheme?.applyToElement?.(popover);

  popover.addEventListener("pointerdown", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());
  popover.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  const renderPopoverContent = () => {
    popover.innerHTML = "";

    const head = document.createElement("div");
    head.className = "ds-purger-popover-head";
    head.innerHTML = `
      <div class="ds-purger-popover-head-left">
        <div class="ds-purger-brand-badge">DS</div>
        <div>
          <div class="ds-purger-popover-title">DS The Purger</div>
          <div class="ds-purger-popover-desc">Enable, disable, and reorder eject actions</div>
        </div>
      </div>
      <button type="button" class="ds-purger-popover-close" title="Close">✕</button>
    `;

    head.querySelector(".ds-purger-popover-close").addEventListener("click", () => {
      closeGearPopover();
    });

    popover.appendChild(head);

    const list = document.createElement("div");
    list.className = "ds-purger-actions-list";

    const buttons = globalConfig.buttons || ["ALL", "VRAM", "RAM", "MODELS", "CACHE"];
    const enabledMap = globalConfig.enabled || {};

    buttons.forEach((act, idx) => {
      const row = document.createElement("div");
      row.className = "ds-purger-settings-row";

      const info = document.createElement("div");
      info.className = "ds-purger-settings-row-text";
      info.innerHTML = `
        <span class="ds-purger-settings-row-label">${act}</span>
        <span class="ds-purger-settings-row-desc">${ACTION_DESCRIPTIONS[act] || act}</span>
      `;

      const rightGroup = document.createElement("div");
      rightGroup.className = "ds-purger-settings-row-right";

      const orderControls = document.createElement("div");
      orderControls.className = "ds-purger-order-controls";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "ds-purger-order-btn";
      upBtn.title = "Move Up";
      upBtn.disabled = idx === 0;
      upBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>`;
      upBtn.addEventListener("click", () => {
        if (idx > 0) {
          const temp = buttons[idx];
          buttons[idx] = buttons[idx - 1];
          buttons[idx - 1] = temp;
          globalConfig.buttons = [...buttons];
          saveConfig(globalConfig);
          renderPopoverContent();
        }
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "ds-purger-order-btn";
      downBtn.title = "Move Down";
      downBtn.disabled = idx === buttons.length - 1;
      downBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>`;
      downBtn.addEventListener("click", () => {
        if (idx < buttons.length - 1) {
          const temp = buttons[idx];
          buttons[idx] = buttons[idx + 1];
          buttons[idx + 1] = temp;
          globalConfig.buttons = [...buttons];
          saveConfig(globalConfig);
          renderPopoverContent();
        }
      });

      orderControls.append(upBtn, downBtn);

      const isEnabled = enabledMap[act] !== false;
      const toggle = Toggle({
        checked: isEnabled,
        onChange: (checked) => {
          globalConfig.enabled[act] = checked;
          saveConfig(globalConfig);
        },
      });

      rightGroup.append(orderControls, toggle.root);
      row.append(info, rightGroup);
      list.appendChild(row);
    });

    popover.appendChild(list);

    const foot = document.createElement("div");
    foot.className = "ds-purger-popover-footer";

    const enableAllBtn = document.createElement("button");
    enableAllBtn.type = "button";
    enableAllBtn.className = "ds-purger-footer-btn";
    enableAllBtn.textContent = "Enable All";
    enableAllBtn.addEventListener("click", () => {
      for (const k of ["ALL", "VRAM", "RAM", "MODELS", "CACHE"]) {
        globalConfig.enabled[k] = true;
      }
      saveConfig(globalConfig);
      renderPopoverContent();
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ds-purger-footer-btn";
    resetBtn.textContent = "Reset Defaults";
    resetBtn.addEventListener("click", () => {
      globalConfig.buttons = ["ALL", "VRAM", "RAM", "MODELS", "CACHE"];
      for (const k of globalConfig.buttons) {
        globalConfig.enabled[k] = true;
      }
      saveConfig(globalConfig);
      renderPopoverContent();
    });

    foot.append(enableAllBtn, resetBtn);
    popover.appendChild(foot);
  };

  renderPopoverContent();
  document.body.appendChild(popover);
  activeGearPopover = popover;

  const pw = 340;
  if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    left = Math.max(16, left);

    let top = rect.bottom + 6;
    if (top + 340 > window.innerHeight - 16) {
      top = Math.max(16, rect.top - 350);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  } else {
    popover.style.left = `${Math.round((window.innerWidth - pw) / 2)}px`;
    popover.style.top = `${Math.round(window.innerHeight / 2 - 160)}px`;
  }

  const onOutsideClick = (e) => {
    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeGearPopover();
      document.removeEventListener("pointerdown", onOutsideClick, true);
    }
  };

  setTimeout(() => {
    document.addEventListener("pointerdown", onOutsideClick, true);
  }, 10);
}

// ---------------------------------------------------------------------------
// Node Installation
// ---------------------------------------------------------------------------
function installPurgerNode(node) {
  if (node._dsPurgerInstalled) return;
  node._dsPurgerInstalled = true;
  node.resizable = true;

  if (!Array.isArray(node.inputs) || node.inputs.length === 0) {
    node.addInput("value", node._dsPurgerType || "*");
  } else if (node.inputs.length > 1) {
    while (node.inputs.length > 1) {
      node.removeInput(node.inputs.length - 1);
    }
  }

  if (!Array.isArray(node.outputs) || node.outputs.length === 0) {
    node.addOutput("value", node._dsPurgerType || "*");
  } else if (node.outputs.length > 1) {
    while (node.outputs.length > 1) {
      node.removeOutput(node.outputs.length - 1);
    }
  }

  if (node.inputs?.[0]) {
    node.inputs[0].name = "value";
  }
  if (node.outputs?.[0]) {
    node.outputs[0].name = "value";
  }

  buildPurgerCard(node);
  activePurgerNodes.add(node);

  requestAnimationFrame(() => {
    stabilizePurger(node);
  });
}

// ---------------------------------------------------------------------------
// ComfyUI Extension Registration
// ---------------------------------------------------------------------------
app.registerExtension({
  name: EXT_NAME,

  async setup() {
    ensureCSS();
    fetchConfig();

    if (window.DSGearMenu?.register) {
      const gearConfig = {
        tooltip: "DS The Purger Settings",
        onClick: (node, canvas, event) => {
          const targetNode = node || app?.canvas?.current_node;
          openPurgerGearPopover(targetNode, event?.currentTarget || event?.target);
        },
      };
      window.DSGearMenu.register(TYPE, gearConfig);
      window.DSGearMenu.register(DISPLAY_NAME, gearConfig);
    }

    // 1. WebSocket listener for live purge result targeted by node_id
    api.addEventListener("ds_purger_status", ({ detail }) => {
      if (!detail || !detail.node_id) return;
      const targetId = String(detail.node_id);
      for (const node of activePurgerNodes) {
        if (String(node.id) === targetId) {
          handlePurgeResult(node, detail);
          node.setDirtyCanvas?.(true, true);
        }
      }
    });

    // 2. ComfyUI workflow execution event listener: target only active node
    api.addEventListener("executing", ({ detail }) => {
      if (detail === null) {
        return;
      }
      const executingId = String(detail);
      for (const node of activePurgerNodes) {
        if (String(node.id) === executingId) {
          const act = node.properties?.selected_action || "ALL";
          if (node._dsStatusBar) {
            node._dsStatusBar.setStatus(`Ejecting ${act}...`, "running");
          }
          node.setDirtyCanvas?.(true, true);
        }
      }
    });

    // 3. Global graph topology listener to refresh link colors & types
    api.addEventListener("graphChanged", () => {
      for (const node of activePurgerNodes) {
        stabilizePurger(node);
      }
    });
  },

  async afterConfigureGraph() {
    for (const node of activePurgerNodes) {
      stabilizePurger(node);
    }
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TYPE) return;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldRemoved = nodeType.prototype.onRemoved;
    const oldConnectionsChange = nodeType.prototype.onConnectionsChange;

    nodeType.prototype.onNodeCreated = function () {
      attachNodeShortcuts(this);
      const r = oldCreated?.apply(this, arguments);
      installPurgerNode(this);
      return r;
    };

    nodeType.prototype.onConfigure = function (info) {
      const r = oldConfigure?.apply(this, arguments);
      installPurgerNode(this);
      if (this.properties?.selected_action && this._dsUpdateActiveButton) {
        this._dsUpdateActiveButton(this.properties.selected_action);
      }
      if (this.properties?.last_purge_text && this._dsStatusBar) {
        this._dsStatusBar.setStatus(
          this.properties.last_purge_text,
          this.properties.last_purge_state || "success"
        );
      }
      setTimeout(() => {
        stabilizePurger(this);
      }, 10);
      return r;
    };

    nodeType.prototype.onConnectionsChange = function () {
      const r = oldConnectionsChange?.apply(this, arguments);
      clearTimeout(this._dsStabilizeTimer);
      this._dsStabilizeTimer = setTimeout(() => {
        stabilizePurger(this);
      }, 0);
      return r;
    };

    nodeType.prototype.onRemoved = function () {
      activePurgerNodes.delete(this);
      if (oldRemoved) return oldRemoved.apply(this, arguments);
    };

    nodeType.prototype._openPurgerGearPopover = function (anchorEl) {
      openPurgerGearPopover(this, anchorEl);
    };

    nodeType.prototype._togglePurgerGearPopover = function (anchorEl) {
      if (activeGearPopover) {
        closeGearPopover();
      } else {
        openPurgerGearPopover(this, anchorEl);
      }
    };
  },
});
