/* ============================================================
   DS Dev Spawner - Deathshot Arsenal
   Development tool: Spawns all Deathshot Arsenal nodes onto an empty canvas.
   Only works when the canvas is empty before.
   ============================================================ */

import { app } from "/scripts/app.js";

const TYPE = "DS_DevSpawner";
const EXT_NAME = "DeathshotArsenal.DS_DevSpawner";
const CSS_URL = "/extensions/DeathshotArsenal/Dev%20Spawner/ds_dev_spawner.css";

// Ensure stylesheet is loaded
if (!document.querySelector(`link[href*="ds_dev_spawner.css"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_URL;
  document.head.appendChild(link);
}

// Complete list of known Deathshot Arsenal node types
const KNOWN_DS_NODES = [
  "DS_GenerationHub",
  "DS_AIPromptSensei",
  "DS_GroupSwitch",
  "DS_Switch",
  "DS_AnySwitch",
  "DS_PipeIn",
  "DS_PipeOut",
  "DS_Reroute",
  "DS_Seed",
  "DS_Prompt",
  "DS_PromptCards",
  "DS_PromptScanner",
  "DS_ShowText",
  "DS_LoRaLoader",
  "DS_LoadImage",
  "DS_LoadImagesFromFolder",
  "DS_LoadVideo",
  "DS_ImagePreview",
  "DS_ImageCompare",
  "DS_ImageCheckpoint",
  "DS_ImageSaveAdvance",
  "DS_VideoSave",
  "DS_VideoTiming",
  "DS_Resolution",
  "DS_Interpolation",
  "DS_Randomizer",
  "DS_Outpaint",
  "DS_OutpaintStitch",
  "DS_FilmGrain",
  "DS_HardwareMonitor",
  "DS_RunTimer",
  "DS_Notes",
  "DS_Label",
  "DS_Gallery",
  "DS_VersionCheck",
  "DS_ThePurger",
];

/**
 * Returns all registered Deathshot node types, combining the known list
 * with dynamic discovery of any `DS_` node in LiteGraph (excluding the dev spawner).
 */
function getDeathshotNodeTypes() {
  const typeSet = new Set(KNOWN_DS_NODES);
  const reg = window.LiteGraph?.registered_node_types || {};
  for (const key of Object.keys(reg)) {
    if (key.startsWith("DS_") && key !== TYPE) {
      typeSet.add(key);
    }
  }
  typeSet.delete(TYPE);
  return Array.from(typeSet);
}

/**
 * Checks if the canvas has no other nodes besides the spawner and its currently spawned nodes.
 */
function checkCanvasEmpty(spawnerNode) {
  const spawnedSet = new Set(spawnerNode._spawnedNodeIds || []);
  const allNodes = app.graph?._nodes || [];
  const otherNodes = allNodes.filter(
    (n) => n && n.id !== spawnerNode.id && !spawnedSet.has(n.id)
  );
  return {
    empty: otherNodes.length === 0,
    count: otherNodes.length,
    otherNodes,
  };
}

/**
 * Spawns all Deathshot Arsenal nodes arranged in a balanced multi-column grid.
 */
function spawnAllNodes(spawnerNode) {
  const types = getDeathshotNodeTypes();
  console.log(`[DS Dev Spawner] Spawning ${types.length} Deathshot Arsenal nodes...`);

  const spawnerPos = spawnerNode.pos || [100, 100];
  const spawnerSize = spawnerNode.size || [300, 220];

  const startX = spawnerPos[0] + spawnerSize[0] + 80;
  const startY = spawnerPos[1];

  // Distribute across 6 balanced columns
  const COLS = 6;
  const COL_WIDTH = 380;
  const COL_GAP = 50;
  const ROW_GAP = 40;
  const colHeights = new Array(COLS).fill(startY);

  const spawnedIds = [];

  for (const type of types) {
    try {
      const node = window.LiteGraph?.createNode?.(type);
      if (!node) {
        console.warn(`[DS Dev Spawner] Could not create node of type: ${type}`);
        continue;
      }

      // Find column with minimal current vertical height
      let bestCol = 0;
      for (let c = 1; c < COLS; c++) {
        if (colHeights[c] < colHeights[bestCol]) {
          bestCol = c;
        }
      }

      const x = startX + bestCol * (COL_WIDTH + COL_GAP);
      const y = colHeights[bestCol];

      node.pos = [x, y];
      app.graph.add(node);
      node.pos = [x, y];

      // Approximate or computed height for spacing
      const nodeHeight = Math.max(Number(node.size?.[1]) || 160, 120);
      colHeights[bestCol] += nodeHeight + ROW_GAP;

      spawnedIds.push(node.id);
    } catch (err) {
      console.error(`[DS Dev Spawner] Error spawning ${type}:`, err);
    }
  }

  spawnerNode._spawnedNodeIds = spawnedIds;

  app.graph?.afterChange?.();
  app.canvas?.setDirty?.(true, true);

  // Zoom / fit view so developer can see the entire catalog
  setTimeout(() => {
    try {
      if (typeof app.canvas?.fitToScreen === "function") {
        app.canvas.fitToScreen();
      }
    } catch (_) {}
  }, 100);

  return spawnedIds;
}

/**
 * Removes all nodes previously spawned by this node.
 */
function despawnAllNodes(spawnerNode) {
  if (!spawnerNode._spawnedNodeIds || !spawnerNode._spawnedNodeIds.length) return;
  console.log(`[DS Dev Spawner] Despawning ${spawnerNode._spawnedNodeIds.length} nodes...`);

  for (const id of spawnerNode._spawnedNodeIds) {
    const node = app.graph?.getNodeById?.(id);
    if (node) {
      app.graph.remove(node);
    }
  }

  spawnerNode._spawnedNodeIds = [];
  app.graph?.afterChange?.();
  app.canvas?.setDirty?.(true, true);
}

// SVG Icons
const ICONS = {
  skull: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a3 3 0 0 0 1.56-5.58 8 8 0 1 0-11.12 0A3 3 0 0 0 8 20"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  detach: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="21 15 21 21 15 21"/><polyline points="3 9 3 3 9 3"/></svg>`,
};

app.registerExtension({
  name: EXT_NAME,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE && nodeData.name !== "DS Dev Spawner") return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const res = origOnNodeCreated?.apply(this, arguments);

      this.size = this.size || [300, 220];
      if (this.size[0] < 280) this.size[0] = 300;
      if (this.size[1] < 200) this.size[1] = 220;

      this._spawnedNodeIds = [];
      this.serialize_widgets = false;

      const root = document.createElement("div");
      root.className = "ds-dev-spawner-root";
      root.setAttribute("data-ds-themed", "true");
      this._dsRoot = root;

      if (window.DSGlobalTheme?.applyToElement) {
        window.DSGlobalTheme.applyToElement(root);
      }

      // Add DOM Widget
      this._dsWidget = this.addDOMWidget("ds_dev_spawner_ui", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 170,
        getHeight: () => Math.max(170, (Number(this.size?.[1]) || 220) - 28),
      });

      // Render UI
      this._dsRenderUI();

      // Hook up theme binding
      setTimeout(() => {
        try {
          if (window.DSGlobalTheme) {
            window.DSGlobalTheme.bindNode?.(root, this);
            window.DSGlobalTheme.applyNodeBase?.(this);
          }
        } catch (_) {}
      }, 50);

      // Periodically refresh canvas status when node is on screen
      this._dsStatusInterval = setInterval(() => {
        if (!this._dsRoot || !document.contains(this._dsRoot)) {
          clearInterval(this._dsStatusInterval);
          return;
        }
        this._dsUpdateStatus();
      }, 1000);

      return res;
    };

    const origOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      if (this._dsStatusInterval) clearInterval(this._dsStatusInterval);
      return origOnRemoved?.apply(this, arguments);
    };

    nodeType.prototype._dsRenderUI = function () {
      const root = this._dsRoot;
      if (!root) return;

      const totalNodes = getDeathshotNodeTypes().length;

      root.innerHTML = `
        <div class="ds-dev-header">
          <div class="ds-dev-title-wrap">
            <span class="ds-dev-icon">${ICONS.skull}</span>
            <span class="ds-dev-title">DS Dev Spawner</span>
          </div>
          <span class="ds-dev-badge-count" title="Total registered Deathshot nodes">${totalNodes} Nodes</span>
        </div>

        <div class="ds-dev-status-card state-ready" id="ds-dev-status">
          <span class="ds-dev-status-indicator"></span>
          <span class="ds-dev-status-text" id="ds-dev-status-text">Checking canvas...</span>
        </div>

        <div class="ds-dev-toggle-row">
          <div class="ds-dev-toggle-info">
            <span class="ds-dev-toggle-label">Spawn All DS Nodes</span>
            <span class="ds-dev-toggle-sub">Requires empty canvas</span>
          </div>
          <label class="ds-dev-switch">
            <input type="checkbox" id="ds-dev-toggle-input">
            <span class="ds-dev-slider"></span>
          </label>
        </div>

        <div class="ds-dev-actions">
          <button type="button" class="ds-dev-btn" id="ds-dev-btn-fit" title="Fit all nodes to view">
            ${ICONS.fit} Fit View
          </button>
          <button type="button" class="ds-dev-btn" id="ds-dev-btn-detach" title="Detach spawned nodes from this spawner so they stay">
            ${ICONS.detach} Detach
          </button>
          <button type="button" class="ds-dev-btn btn-danger" id="ds-dev-btn-clear" style="grid-column: span 2;" title="Remove other nodes to make canvas empty">
            ${ICONS.trash} Wipe Canvas to Empty
          </button>
        </div>

        <div class="ds-dev-footer">
          <span>Dev Utility Node</span>
          <span>Deathshot Arsenal</span>
        </div>
      `;

      const toggleInput = root.querySelector("#ds-dev-toggle-input");
      const btnFit = root.querySelector("#ds-dev-btn-fit");
      const btnDetach = root.querySelector("#ds-dev-btn-detach");
      const btnClear = root.querySelector("#ds-dev-btn-clear");

      // Handle Toggle Change
      toggleInput.addEventListener("change", (e) => {
        const wantsOn = e.target.checked;
        if (wantsOn) {
          // Check if canvas is empty before
          const state = checkCanvasEmpty(this);
          if (!state.empty) {
            // Block and revert toggle
            e.target.checked = false;
            this._dsSetStatus(
              "blocked",
              `Blocked: Canvas must be empty before spawning (${state.count} other node${state.count === 1 ? "" : "s"} present).`
            );
            return;
          }

          // Canvas is empty: proceed with spawn
          const spawned = spawnAllNodes(this);
          this._dsSetStatus("active", `Active: ${spawned.length} DS nodes spawned on canvas.`);
        } else {
          // Despawn
          despawnAllNodes(this);
          this._dsUpdateStatus();
        }
      });

      // Fit View
      btnFit.addEventListener("click", () => {
        try {
          if (typeof app.canvas?.fitToScreen === "function") {
            app.canvas.fitToScreen();
          }
        } catch (_) {}
      });

      // Detach Nodes
      btnDetach.addEventListener("click", () => {
        if (!this._spawnedNodeIds || !this._spawnedNodeIds.length) {
          this._dsSetStatus("ready", "No spawned nodes to detach.");
          return;
        }
        const count = this._spawnedNodeIds.length;
        this._spawnedNodeIds = [];
        toggleInput.checked = false;
        this._dsSetStatus("ready", `Detached ${count} nodes. They will now remain on canvas.`);
      });

      // Wipe Canvas to Empty (except this spawner)
      btnClear.addEventListener("click", () => {
        const allNodes = (app.graph?._nodes || []).slice();
        let removed = 0;
        for (const n of allNodes) {
          if (n && n.id !== this.id) {
            app.graph.remove(n);
            removed++;
          }
        }
        this._spawnedNodeIds = [];
        toggleInput.checked = false;
        app.graph?.afterChange?.();
        app.canvas?.setDirty?.(true, true);
        this._dsSetStatus("ready", `Canvas cleared (${removed} node${removed === 1 ? "" : "s"} removed). Ready to spawn.`);
      });

      this._dsUpdateStatus();
    };

    nodeType.prototype._dsSetStatus = function (stateClass, text) {
      const card = this._dsRoot?.querySelector("#ds-dev-status");
      const label = this._dsRoot?.querySelector("#ds-dev-status-text");
      if (!card || !label) return;

      card.className = `ds-dev-status-card state-${stateClass}`;
      label.textContent = text;
    };

    nodeType.prototype._dsUpdateStatus = function () {
      if (!this._dsRoot) return;
      const toggleInput = this._dsRoot.querySelector("#ds-dev-toggle-input");

      if (this._spawnedNodeIds && this._spawnedNodeIds.length > 0) {
        if (toggleInput && !toggleInput.checked) toggleInput.checked = true;
        this._dsSetStatus("active", `Active: ${this._spawnedNodeIds.length} DS nodes spawned.`);
        return;
      }

      const state = checkCanvasEmpty(this);
      if (state.empty) {
        if (toggleInput && toggleInput.checked) toggleInput.checked = false;
        this._dsSetStatus("ready", "Canvas is empty. Toggle ON to spawn all nodes.");
      } else {
        if (toggleInput && toggleInput.checked) toggleInput.checked = false;
        this._dsSetStatus("blocked", `Canvas not empty (${state.count} other node${state.count === 1 ? "" : "s"}). Clear first.`);
      }
    };
  },
});
