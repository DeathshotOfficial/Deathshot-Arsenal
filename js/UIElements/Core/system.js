/**
 * DeathshotArsenal UI System — Core System Utilities
 * Boundary margin normalization, host cleanup, and LiteGraph resize corner protection.
 */

/**
 * Release LiteGraph's native resize-corner hit areas for a full-size DOM widget.
 * ComfyUI checks getWidgetOnPos() before findResizeDirection(). A DOM widget
 * whose computed bounds reach the node corners can swallow native resize handles.
 * This keeps native handles authoritative by reporting no widget hit inside active corners.
 */
export function protectDSResizeCorners(node) {
  if (!node || node._dsResizeCornersProtected) return;
  const originalGetWidgetOnPos = node.getWidgetOnPos;
  if (typeof originalGetWidgetOnPos !== "function") return;

  node._dsResizeCornersProtected = true;
  node._dsOriginalGetWidgetOnPos = originalGetWidgetOnPos;
  node.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
    if (this.resizable !== false) {
      const localX = canvasX - this.pos[0];
      const localY = canvasY - this.pos[1];
      const w = this.size[0];
      const h = this.size[1];

      // Release corners (24px) and bottom edge (14px) for LiteGraph native resize handles
      if (
        (localX >= w - 24 && localY >= h - 24) || // bottom-right corner
        (localX <= 24 && localY >= h - 24) ||      // bottom-left corner
        (localY >= h - 14)                         // bottom margin
      ) {
        return undefined;
      }
    }
    return originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
  };
}

/**
 * Apply the unified 10px shell inset and clean host styling to a node face DOM widget.
 */
export function normalizeDSWidgetHost(root, node = null, options = {}) {
  if (!root) return;

  const styleHost = (hostEl) => {
    if (!hostEl) return;
    hostEl.style.boxSizing = "border-box";
    hostEl.style.margin = "0";
    hostEl.style.padding = "0";
    hostEl.style.minWidth = "0";
    hostEl.style.minHeight = "0";
    hostEl.style.pointerEvents = "none";
    hostEl.style.background = "transparent";
    hostEl.style.backgroundColor = "transparent";
    hostEl.style.overflow = "hidden";
  };

  styleHost(root.parentElement);

  if (options.shell !== false) {
    const shellMode = node?._dsNodeBaseOptOut ? "bare" : "base";
    root.dataset.dsUiShell = shellMode;
    root.dataset.dsUiHost = "true";
    root.style.boxSizing = "border-box";
    root.style.padding = "0 var(--ds-ui-margin, 10px) var(--ds-ui-margin, 10px) var(--ds-ui-margin, 10px)";
    root.style.margin = "0";
    root.style.minWidth = "0";
    root.style.minHeight = "0";
    root.style.pointerEvents = "none";
    root.style.background = "transparent";
    root.style.backgroundColor = "transparent";
  }

  // Ensure card inside root has pointer-events: auto
  const card = root.querySelector(".ds-ui-card") || root.firstElementChild;
  if (card) {
    card.style.pointerEvents = "auto";
  }

  // Re-apply to parent after DOM widget attaches to DOM
  requestAnimationFrame(() => {
    styleHost(root.parentElement);
    if (root.parentElement?.parentElement) {
      root.parentElement.parentElement.style.pointerEvents = "none";
    }
  });
}
