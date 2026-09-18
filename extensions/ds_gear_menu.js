// Deathshot Arsenal — DS Gear Menu
// Floating Node Context Action Bar Hook & Extensible Registry
//
// Injects a branded DS Gear action button into ComfyUI's floating node context toolbar.
// Provides a clean, decoupled registry (window.DSGearMenu) where any node or extension
// can register custom quick-config actions or context menus without modifying the node itself.

import { app } from "../../../scripts/app.js";

const EXTENSION_NAME = "DeathshotArsenal.DSGearMenu";
const TOOLTIP_DEFAULT = "DS Properties / Quick Config";

const GEAR_SVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ds-gear-svg">
  <circle cx="12" cy="12" r="3"></circle>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
</svg>
`;

// Global Registry for Node Gear Actions
class DSGearRegistry {
  constructor() {
    this._registry = new Map();
    this._activePopover = null;
  }

  /**
   * Register a handler for a node type.
   * @param {string} nodeType - Node class type (e.g. "DS_Label", "DS_Prompt")
   * @param {Object|Function} config - Config object or direct onClick function
   *        config: {
   *          tooltip?: string,
   *          icon?: string, // optional custom SVG string
   *          onClick?: (node, canvas, event) => void,
   *          getMenuItems?: (node, canvas) => Array<{ label, icon?, callback?, separator?, active?, danger? }>
   *        }
   */
  register(nodeType, config) {
    if (!nodeType) return;
    const item = typeof config === "function" ? { onClick: config } : (config || {});
    this._registry.set(nodeType, item);
  }

  /**
   * Unregister a node type handler.
   */
  unregister(nodeType) {
    this._registry.delete(nodeType);
  }

  /**
   * Resolve handler for a node or group.
   */
  getHandler(node) {
    if (!node) return null;
    if (node.flags?.ds_group && this._registry.has("ds_group")) {
      return this._registry.get("ds_group");
    }
    const isGroup = node.constructor?.name === "LGraphGroup" || node._is_group || node.isGroup || (node.title !== undefined && Array.isArray(node._nodes));
    if (isGroup) {
      if (node.flags?.ds_group && this._registry.has("ds_group")) {
        return this._registry.get("ds_group");
      }
      if (this._registry.has("LGraphGroup")) {
        return this._registry.get("LGraphGroup");
      }
      if (this._registry.has("ds_group")) {
        return this._registry.get("ds_group");
      }
    }
    const type = node.type || node.comfyClass || node.constructor?.name;
    if (type && this._registry.has(type)) {
      return this._registry.get(type);
    }
    if (node.comfyClass && this._registry.has(node.comfyClass)) {
      return this._registry.get(node.comfyClass);
    }
    if (typeof node._toggleGalleryGearPopover === "function" || typeof node._openGalleryGearPopover === "function") {
      return {
        tooltip: "DS Gallery Settings",
        onClick: (n, canvas, ev) => (n._toggleGalleryGearPopover || n._openGalleryGearPopover).call(n, ev?.currentTarget || ev?.target),
      };
    }
    if (typeof node._toggleResolutionGearPopover === "function" || typeof node._openResolutionGearPopover === "function") {
      return {
        tooltip: "Aspect Ratio Presets",
        onClick: (n, canvas, ev) => (n._toggleResolutionGearPopover || n._openResolutionGearPopover).call(n, ev?.currentTarget || ev?.target),
      };
    }
    if (typeof node._toggleGenerationHubGearPopover === "function" || typeof node._openGenerationHubGearPopover === "function") {
      return {
        tooltip: "DS Generation Hub Settings",
        onClick: (n, canvas, ev) => (n._toggleGenerationHubGearPopover || n._openGenerationHubGearPopover).call(n, ev?.currentTarget || ev?.target),
      };
    }
    return null;
  }

  /**
   * Determine the appropriate tooltip for a selected node.
   */
  getTooltip(node) {
    const handler = this.getHandler(node);
    if (handler && handler.tooltip) {
      return typeof handler.tooltip === "function" ? handler.tooltip(node) : handler.tooltip;
    }
    if (node && (node.flags?.ds_group || node.constructor?.name === "LGraphGroup" || node._is_group || node.isGroup)) {
      return "DS Group Settings";
    }
    return TOOLTIP_DEFAULT;
  }

  /**
   * Handle click on the DS Gear icon.
   */
  handleGearClick(event, selectedNode = null) {
    const node = selectedNode || getPrimarySelectedNode();
    if (!node) return;

    const handler = this.getHandler(node);
    const canvas = app?.canvas;

    if (handler && typeof handler.onClick === "function") {
      handler.onClick(node, canvas, event);
      return;
    }

    if (handler && typeof handler.getMenuItems === "function") {
      const items = handler.getMenuItems(node, canvas);
      if (Array.isArray(items) && items.length > 0) {
        this.openPopover(node, items, event.currentTarget || event.target);
        return;
      }
    }

    // Default fallback for standard nodes: open the DS Node Context Popover
    const defaultItems = this.buildDefaultMenuItems(node);
    this.openPopover(node, defaultItems, event.currentTarget || event.target);
  }

  /**
   * Builds rich default context menu items for standard nodes.
   */
  buildDefaultMenuItems(node) {
    const canvas = app?.canvas;
    const graph = canvas?.graph || app?.graph;
    const items = [];

    // Header info item
    const title = node.title || node.type || "Node";
    const typeStr = node.type || node.comfyClass || "Unknown";
    items.push({
      label: `${title}`,
      description: `Type: ${typeStr} (ID: #${node.id})`,
      disabled: true,
    });
    items.push({ separator: true });

    // Mode toggles
    const mode = node.mode ?? 0;
    items.push({
      label: "Execution Mode",
      submenu: [
        {
          label: "Always Active",
          active: mode === 0,
          callback: () => {
            node.mode = 0;
            dirty(graph);
          },
        },
        {
          label: "Bypass",
          active: mode === 4,
          callback: () => {
            node.mode = 4;
            dirty(graph);
          },
        },
        {
          label: "Mute",
          active: mode === 2,
          callback: () => {
            node.mode = 2;
            dirty(graph);
          },
        },
      ],
    });

    // Quick Color Presets
    const colors = [
      { name: "Default", color: null, bgcolor: null },
      { name: "Cyan", color: "#083344", bgcolor: "#164e63" },
      { name: "Green", color: "#064e3b", bgcolor: "#065f46" },
      { name: "Purple", color: "#3b0764", bgcolor: "#581c87" },
      { name: "Amber", color: "#451a03", bgcolor: "#78350f" },
      { name: "Rose", color: "#4c0519", bgcolor: "#881337" },
      { name: "Dark Blue", color: "#172554", bgcolor: "#1e3a8a" },
    ];

    items.push({
      label: "Node Color Tint",
      submenu: colors.map((c) => ({
        label: c.name,
        colorSwatch: c.bgcolor || "#374151",
        callback: () => {
          node.color = c.color;
          node.bgcolor = c.bgcolor;
          dirty(graph);
        },
      })),
    });

    items.push({ separator: true });

    // Node operations
    items.push({
      label: "Clone / Duplicate",
      callback: () => {
        try {
          const serialized = node.serialize();
          const clone = globalThis.LiteGraph?.createNode?.(node.type);
          if (clone) {
            clone.configure(serialized);
            clone.id = null;
            clone.pos = [(node.pos?.[0] || 0) + 30, (node.pos?.[1] || 0) + 30];
            graph?.add?.(clone);
            canvas?.selectNode?.(clone, false);
            dirty(graph);
          }
        } catch (e) {
          console.error("[DSGearMenu] Duplicate failed:", e);
        }
      },
    });

    items.push({
      label: "Copy Node ID",
      callback: () => {
        try {
          navigator.clipboard?.writeText?.(String(node.id));
        } catch (_) {}
      },
    });

    items.push({
      label: "Collapse / Expand",
      callback: () => {
        node.collapse?.();
        dirty(graph);
      },
    });

    return items;
  }

  /**
   * Opens a sleek custom popover anchored to the target element.
   */
  openPopover(node, items, anchorEl) {
    this.closePopover();

    const popover = document.createElement("div");
    popover.className = "ds-gear-popover";

    // Build menu DOM
    const list = document.createElement("div");
    list.className = "ds-gear-menu-list";

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "ds-gear-menu-separator";
        list.appendChild(sep);
        continue;
      }

      const row = document.createElement("div");
      row.className = "ds-gear-menu-item";
      if (item.disabled) row.classList.add("is-disabled");
      if (item.active) row.classList.add("is-active");
      if (item.danger) row.classList.add("is-danger");

      const labelWrap = document.createElement("div");
      labelWrap.className = "ds-gear-menu-item-content";

      const titleSpan = document.createElement("span");
      titleSpan.className = "ds-gear-menu-item-title";
      titleSpan.textContent = item.label;
      labelWrap.appendChild(titleSpan);

      if (item.description) {
        const descSpan = document.createElement("small");
        descSpan.className = "ds-gear-menu-item-desc";
        descSpan.textContent = item.description;
        labelWrap.appendChild(descSpan);
      }

      if (item.colorSwatch) {
        const swatch = document.createElement("span");
        swatch.className = "ds-gear-menu-swatch";
        swatch.style.backgroundColor = item.colorSwatch;
        row.appendChild(swatch);
      }

      row.appendChild(labelWrap);

      if (item.submenu) {
        const arrow = document.createElement("span");
        arrow.className = "ds-gear-menu-arrow";
        arrow.textContent = "›";
        row.appendChild(arrow);

        // Submenu container
        const subList = document.createElement("div");
        subList.className = "ds-gear-submenu";
        for (const sub of item.submenu) {
          const subRow = document.createElement("div");
          subRow.className = "ds-gear-menu-item";
          if (sub.active) subRow.classList.add("is-active");

          if (sub.colorSwatch) {
            const swatch = document.createElement("span");
            swatch.className = "ds-gear-menu-swatch";
            swatch.style.backgroundColor = sub.colorSwatch;
            subRow.appendChild(swatch);
          }

          const subTitle = document.createElement("span");
          subTitle.className = "ds-gear-menu-item-title";
          subTitle.textContent = sub.label;
          subRow.appendChild(subTitle);

          subRow.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closePopover();
            sub.callback?.();
          });
          subList.appendChild(subRow);
        }
        row.appendChild(subList);

        row.addEventListener("mouseenter", () => {
          const rowRect = row.getBoundingClientRect();
          if (rowRect.right + 180 > window.innerWidth) {
            subList.style.left = "auto";
            subList.style.right = "100%";
            subList.style.marginLeft = "0";
            subList.style.marginRight = "4px";
          } else {
            subList.style.left = "100%";
            subList.style.right = "auto";
            subList.style.marginLeft = "4px";
            subList.style.marginRight = "0";
          }
          subList.classList.add("is-open");
        });
        row.addEventListener("mouseleave", () => {
          subList.classList.remove("is-open");
        });
      } else if (!item.disabled) {
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closePopover();
          item.callback?.();
        });
      }

      list.appendChild(row);
    }

    popover.appendChild(list);
    document.body.appendChild(popover);
    this._activePopover = popover;

    // Position popover relative to anchor
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;

      // Boundary safety check
      if (left + popRect.width > window.innerWidth - 12) {
        left = window.innerWidth - popRect.width - 12;
      }
      if (left < 12) left = 12;
      if (top + popRect.height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - popRect.height - 6);
      }

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    }

    // Dismiss listeners
    const onOutsideClick = (e) => {
      if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
        this.closePopover();
        document.removeEventListener("pointerdown", onOutsideClick, true);
      }
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", onOutsideClick, true);
    }, 10);
  }

  closePopover() {
    if (this._activePopover) {
      this._activePopover.remove();
      this._activePopover = null;
    }
  }
}

// Global singleton instance
const gearRegistry = new DSGearRegistry();
window.DSGearMenu = gearRegistry;
if (!window.DSUI) window.DSUI = {};
window.DSUI.gearMenu = gearRegistry;

function isGroupObject(item) {
  if (!item) return false;
  return Boolean(
    item.constructor?.name === "LGraphGroup" ||
    item._is_group ||
    item.isGroup ||
    item.flags?.ds_group ||
    (item.title !== undefined && Array.isArray(item._nodes) && Array.isArray(item.size))
  );
}

// Helper: Get primary selected node or group on canvas
function getPrimarySelectedNode() {
  const canvas = app?.canvas;
  if (!canvas) return null;

  // 1. Explicit canvas selected group
  if (canvas.selected_group && canvas.selected_group.selected !== false) {
    return canvas.selected_group;
  }

  // 2. Selected items collection (Modern ComfyUI frontend)
  if (canvas.selectedItems && typeof canvas.selectedItems.values === "function") {
    const items = [...canvas.selectedItems.values()].filter((n) => n && n.pos);
    if (items.length > 0) {
      const grp = items.find(isGroupObject);
      if (grp) return grp;
      return items[0];
    }
  }

  // 3. Graph groups check for active selection
  const graph = canvas.graph || app?.graph;
  const groups = graph?.groups || graph?._groups || [];
  const selectedGrp = groups.find((g) => g?.selected);
  if (selectedGrp) return selectedGrp;

  // 4. Selected nodes dictionary
  if (canvas.selected_nodes && typeof canvas.selected_nodes === "object") {
    const nodes = Object.values(canvas.selected_nodes).filter((n) => n && n.pos);
    if (nodes.length > 0) return nodes[0];
  }

  // 5. Current node
  if (canvas.current_node) return canvas.current_node;

  // 6. Graph nodes fallback
  const nodes = (graph?.nodes || []).filter((n) => n?.selected);
  return nodes[0] || null;
}

function dirty(graph) {
  try { graph?.setDirtyCanvas?.(true, true); } catch (_) {}
  try { app?.canvas?.setDirty?.(true, true); } catch (_) {}
}

// Inject button into floating selection toolbar (.selection-toolbox)
const INJECTED_ATTR = "data-ds-gear-injected";

function ensureGearButtonInToolbox(toolboxEl) {
  if (!toolboxEl) return;
  if (toolboxEl.querySelector(`[${INJECTED_ATTR}="true"]`)) {
    // Update tooltip for current selection
    const btn = toolboxEl.querySelector(`[${INJECTED_ATTR}="true"]`);
    const node = getPrimarySelectedNode();
    const tooltip = gearRegistry.getTooltip(node);
    if (btn.getAttribute("title") !== tooltip) {
      btn.setAttribute("title", tooltip);
      btn.setAttribute("aria-label", tooltip);
    }
    return;
  }

  // Find target container inside Panel
  const content =
    toolboxEl.querySelector(".p-panel-content") ||
    toolboxEl.querySelector('[data-pc-section="content"]') ||
    toolboxEl;

  const node = getPrimarySelectedNode();
  const tooltip = gearRegistry.getTooltip(node);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ds-actionbar-gear-btn";
  btn.setAttribute(INJECTED_ATTR, "true");
  btn.setAttribute("title", tooltip);
  btn.setAttribute("aria-label", tooltip);
  btn.innerHTML = GEAR_SVG;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    gearRegistry.handleGearClick(e, getPrimarySelectedNode());
  });

  // Insert cleanly at end of toolbar before node options button if present
  const optionsBtn = content.querySelector('[aria-label="Node options"]') || content.lastElementChild;
  if (optionsBtn && optionsBtn.parentNode === content) {
    content.insertBefore(btn, optionsBtn);
  } else {
    content.appendChild(btn);
  }
}

// Observer for ComfyUI's floating toolbar
function initToolboxObserver() {
  const checkAndInject = () => {
    const toolboxes = document.querySelectorAll('.selection-toolbox, [data-testid="selection-toolbox"]');
    toolboxes.forEach(ensureGearButtonInToolbox);
  };

  const observer = new MutationObserver(() => {
    checkAndInject();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also hook into canvas selection events
  const canvas = app?.canvas;
  if (canvas) {
    const origSelectNode = canvas.selectNode;
    if (typeof origSelectNode === "function") {
      canvas.selectNode = function (...args) {
        const res = origSelectNode.apply(this, args);
        requestAnimationFrame(checkAndInject);
        return res;
      };
    }

    const origDeselectNode = canvas.deselectNode;
    if (typeof origDeselectNode === "function") {
      canvas.deselectNode = function (...args) {
        const res = origDeselectNode.apply(this, args);
        gearRegistry.closePopover();
        return res;
      };
    }
  }
}

// Inject Gear Button Styles
function injectGearStyles() {
  if (document.getElementById("ds-gear-menu-styles")) return;
  const style = document.createElement("style");
  style.id = "ds-gear-menu-styles";
  style.textContent = `
    .ds-actionbar-gear-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      margin: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: #e2e8f0 !important;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
      user-select: none;
      box-sizing: border-box;
      outline: none;
    }

    .ds-actionbar-gear-btn svg {
      stroke: #e2e8f0;
      transition: stroke 0.15s ease, transform 0.25s ease;
    }

    .ds-actionbar-gear-btn:hover {
      background: rgba(255, 255, 255, 0.12) !important;
      color: var(--ds-accent, #67e8f9) !important;
      border-color: var(--ds-accent, #67e8f9) !important;
      transform: scale(1.05);
    }

    .ds-actionbar-gear-btn:hover svg {
      stroke: var(--ds-accent, #67e8f9);
    }

    .ds-actionbar-gear-btn.is-active {
      background: rgba(255, 255, 255, 0.15) !important;
      color: var(--ds-accent, #67e8f9) !important;
      border-color: var(--ds-accent, #67e8f9) !important;
    }

    .ds-actionbar-gear-btn.is-active svg {
      stroke: var(--ds-accent, #67e8f9);
    }

    .selection-toolbox button:has(.ds-gear-svg),
    .selection-toolbox button:has(.ds-actionbar-gear-btn-icon) {
      color: #e2e8f0 !important;
    }

    .selection-toolbox button:has(.ds-gear-svg) svg {
      stroke: #e2e8f0;
    }

    .selection-toolbox button:has(.ds-gear-svg):hover,
    .selection-toolbox button:has(.ds-actionbar-gear-btn-icon):hover {
      color: var(--ds-accent, #67e8f9) !important;
      border-color: var(--ds-accent, #67e8f9) !important;
    }

    .selection-toolbox button:has(.ds-gear-svg):hover svg {
      stroke: var(--ds-accent, #67e8f9);
    }

    .selection-toolbox button.is-active:has(.ds-gear-svg),
    .selection-toolbox button.is-active:has(.ds-actionbar-gear-btn-icon) {
      color: var(--ds-accent, #67e8f9) !important;
      border-color: var(--ds-accent, #67e8f9) !important;
    }

    .selection-toolbox button.is-active:has(.ds-gear-svg) svg {
      stroke: var(--ds-accent, #67e8f9);
    }

    .ds-actionbar-gear-btn:active {
      transform: scale(0.95);
    }

    .ds-gear-svg {
      display: block;
      transition: transform 0.25s ease;
    }

    .ds-actionbar-gear-btn:hover .ds-gear-svg {
      transform: rotate(45deg);
    }

    /* DS Context Popover */
    .ds-gear-popover {
      position: fixed;
      z-index: 99999;
      min-width: 190px;
      max-width: 280px;
      background: var(--ds-bg-surface-elevated, var(--ds-panel-2, #181c24));
      border: 1px solid var(--ds-border-color, var(--ds-border, rgba(255, 255, 255, 0.14)));
      border-radius: 6px;
      box-shadow: var(--ds-shadow-modal, 0 12px 32px rgba(0, 0, 0, 0.5));
      padding: 4px;
      font-family: var(--ds-font, Inter, system-ui, sans-serif);
      font-size: 12px;
      color: var(--ds-text-primary, var(--ds-text, #f8fafc));
      animation: dsPopIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }

    @keyframes dsPopIn {
      from { opacity: 0; transform: scale(0.96) translateY(-4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .ds-gear-menu-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ds-gear-menu-separator {
      height: 1px;
      background: var(--ds-border, rgba(255, 255, 255, 0.1));
      margin: 4px 2px;
    }

    .ds-gear-menu-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
      color: var(--ds-text, #f8fafc);
    }

    .ds-gear-menu-item:hover:not(.is-disabled) {
      background: var(--ds-accent, #67e8f9);
      color: var(--ds-on-accent, #0a0c10);
    }

    .ds-gear-menu-item.is-disabled {
      opacity: 0.65;
      cursor: default;
    }

    .ds-gear-menu-item.is-active {
      font-weight: 600;
      color: var(--ds-accent, #67e8f9);
    }

    .ds-gear-menu-item.is-active:hover {
      color: var(--ds-on-accent, #0a0c10);
    }

    .ds-gear-menu-item-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .ds-gear-menu-item-title {
      font-size: 11.5px;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ds-gear-menu-item-desc {
      font-size: 9.5px;
      opacity: 0.7;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ds-gear-menu-swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      flex-shrink: 0;
    }

    .ds-gear-menu-arrow {
      margin-left: auto;
      font-size: 14px;
      opacity: 0.7;
      padding-left: 6px;
    }

    /* Submenu flyout */
    .ds-gear-submenu {
      display: none;
      position: absolute;
      top: -4px;
      left: 100%;
      margin-left: 4px;
      min-width: 140px;
      background: var(--ds-bg-surface-elevated, var(--ds-panel-2, #181c24));
      border: 1px solid var(--ds-border-color, var(--ds-border, rgba(255, 255, 255, 0.14)));
      border-radius: 6px;
      box-shadow: var(--ds-shadow-modal, 0 12px 32px rgba(0, 0, 0, 0.5));
      padding: 4px;
      z-index: 100000;
    }

    .ds-gear-submenu.is-open {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ds-actionbar-gear-btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ds-accent, #67e8f9);
    }
    .ds-actionbar-gear-btn-icon::before {
      content: "";
      width: 11px;
      height: 11px;
      background-color: #0a0c10;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'/%3E%3C/svg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'/%3E%3C/svg%3E") center / contain no-repeat;
    }
  `;
  document.head.appendChild(style);
}

// Register ComfyUI Web Extension
app.registerExtension({
  name: EXTENSION_NAME,

  commands: [
    {
      id: "DeathshotArsenal.NodeQuickConfig",
      label: "DS Settings",
      icon: "ds-actionbar-gear-btn-icon",
      function: () => {
        const node = getPrimarySelectedNode();
        if (node) {
          const anchor =
            document.querySelector(".ds-actionbar-gear-btn") ||
            document.querySelector('.selection-toolbox [aria-label*="Settings"]') ||
            document.querySelector('.selection-toolbox [title*="Settings"]') ||
            document.querySelector(".selection-toolbox");
          gearRegistry.handleGearClick({ currentTarget: anchor }, node);
        }
      },
    },
  ],

  async setup() {
    injectGearStyles();
    initToolboxObserver();
    console.log("[DS Gear Menu] Action bar hook & registry initialized");
  },

  getSelectionToolboxCommands(item) {
    // Rely on ensureGearButtonInToolbox to inject the styled white gear icon
    return [];
  },
});

export { gearRegistry as DSGearMenu };
