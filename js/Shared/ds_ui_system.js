/**
 * DeathshotArsenal UI System
 *
 * Runtime bridge for the centralized DS design system. Geometry, controls and
 * interaction styling live in ./ui; node files should consume that contract.
 */
import { DS_UI_TOKENS, DS_UI_CSS_VARS, DS_UI_ROOTS } from "./ui/ds_design_tokens.js";
import {
  createSlider,
  createToggle,
  upgradeLegacyDSRange,
  createColorPicker,
  createSegmentedGroup,
  createMenu,
  createPreviewCard
} from "./ui/ds_controls.js";
// Load the recreate compatibility whenever the centralized UI system loads.
import "./ds_node_fixer_compat.js";

export {
  DS_UI_TOKENS,
  DS_UI_ROOTS,
  createSlider,
  createToggle,
  upgradeLegacyDSRange,
  createColorPicker,
  createSegmentedGroup,
  createMenu,
  createPreviewCard
};

let installed = false;
let observer = null;

function installStyleSheet() {
  const id = "ds-central-ui-design-system";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.dataset.dsUiSystem = "true";
  link.href = "/extensions/DeathshotArsenal/Shared/ui/ds_design_system.css";
  document.head.appendChild(link);
}

function markLegacyControls(root) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('input[type="range"]').forEach((input) => {
    upgradeLegacyDSRange(input);
  });

  root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    // Preserve purpose-built checkbox widgets that are not settings toggles.
    if (input.classList.contains("ds-thumb-checkbox") || input.classList.contains("mini-toggle")) return;
    input.classList.add("ds-ui-native-checkbox");
  });
}

function startControlObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('[data-ds-themed="true"]')) markLegacyControls(node);
        else if (node.closest?.('[data-ds-themed="true"]')) markLegacyControls(node.closest('[data-ds-themed="true"]'));
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function installDSUISystem() {
  if (!installed) {
    installed = true;
    const root = document.documentElement;
    root.dataset.dsUiSystem = "central-v5";
    for (const [key, value] of Object.entries(DS_UI_CSS_VARS)) root.style.setProperty(key, value);
    installStyleSheet();
    if (document.body) startControlObserver();
    else window.addEventListener("DOMContentLoaded", startControlObserver, { once: true });
  }
}

/**
 * Apply the single shell inset to a real node face. Both native-base nodes and
 * chromeless/baseless nodes intentionally use the exact same inset.
 *
 * The canvas title bar is outside a DOM widget, so this padding only affects
 * the face/body supplied by the node. It never creates a second margin around
 * the LiteGraph node itself.
 */
/**
 * Release LiteGraph's native resize-corner hit areas for a full-size DOM widget.
 *
 * ComfyUI checks getWidgetOnPos() before findResizeDirection(). A DOM widget
 * whose computed bounds reach the node corners can therefore swallow the
 * native resize handles. Keep the native handles authoritative by making the
 * widget report no hit inside any active resize corner. This is deliberately
 * scoped to the node that opts in; it does not monkey-patch LiteGraph globally.
 */
export function protectDSResizeCorners(node) {
  if (!node || node._dsResizeCornersProtected) return;
  const originalGetWidgetOnPos = node.getWidgetOnPos;
  if (typeof originalGetWidgetOnPos !== "function") return;

  node._dsResizeCornersProtected = true;
  node._dsOriginalGetWidgetOnPos = originalGetWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    if (this.resizable !== false && typeof this.findResizeDirection === "function") {
      const direction = this.findResizeDirection(canvasX, canvasY);
      if (direction) return undefined;
    }
    return originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
  };
}

export function normalizeDSWidgetHost(root, node = null, options = {}) {
  if (!root) return;
  installDSUISystem();

  const host = root.parentElement;
  if (host) {
    host.style.boxSizing = "border-box";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.minWidth = "0";
    host.style.minHeight = "0";
    host.style.borderRadius = "8px";
  }

  if (options.shell !== false) {
    const shellMode = node?._dsNodeBaseOptOut ? "bare" : "base";
    root.dataset.dsUiShell = shellMode;
    root.style.boxSizing = "border-box";
    root.style.padding = shellMode === "bare"
      ? `var(--ds-ui-shell-inset-bare, ${DS_UI_TOKENS.shellInsetBare}px)`
      : `var(--ds-ui-shell-inset-base, ${DS_UI_TOKENS.shellInsetBase}px)`;
    root.style.margin = "0";
    root.style.minWidth = "0";
    root.style.minHeight = "0";
  }

  markLegacyControls(root);
}

// Make the component library discoverable to node authors without forcing
// every node to import another file.
if (typeof window !== "undefined") {
  window.DSUI = window.DSUI || {};
  window.DSUI.tokens = DS_UI_TOKENS;
  window.DSUI.createSlider = createSlider;
  window.DSUI.createToggle = createToggle;
  window.DSUI.upgradeLegacyDSRange = upgradeLegacyDSRange;
  window.DSUI.createColorPicker = createColorPicker;
  window.DSUI.createSegmentedGroup = createSegmentedGroup;
  window.DSUI.createMenu = createMenu;
  window.DSUI.createPreviewCard = createPreviewCard;
  window.DSUI.protectResizeCorners = protectDSResizeCorners;
}
