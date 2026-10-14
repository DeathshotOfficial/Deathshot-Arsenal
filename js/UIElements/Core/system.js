/**
 * DeathshotArsenal UI System — Core System Utilities
 * Boundary margin normalization, host cleanup, LiteGraph resize corner protection,
 * and DOM-to-Canvas navigation bridge (mouse wheel zoom + click-and-drag pan/move).
 */

const DS_FLOATING_OVERLAY_SELECTOR = [
  ".ds-ui-popup",
  ".ds-civitai-modal",
  ".ds-civitai-modal-host",
  ".ds-gallery-lightbox",
  ".ds-gallery-player-modal",
  ".ds-gallery-player-pip-dock",
  ".ds-cp-accent-picker",
  ".ds-ui-color-picker-popover",
  ".ds-gear-popover",
  ".ds-outpaint-popover",
  ".ds-prompt-modal-backdrop",
  ".litecontextmenu",
  ".comfy-modal",
  "[role='dialog']",
].join(", ");

const DS_INTERACTIVE_CONTROL_SELECTOR = [
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "a[href]",
  "summary",
  "audio",
  "video[controls]",
  "[contenteditable='true']",
  "[role='button']",
  "[role='slider']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='spinbutton']",
  "[role='textbox']",
  "[data-interactive='true']",
  ".ds-ui-btn",
  ".ds-ui-input",
  ".ds-ui-textarea",
  ".ds-ui-dropdown",
  ".ds-ui-dropdown-trigger",
  ".ds-ui-dropdown-menu",
  ".ds-ui-popup-item",
  ".ds-ui-slider-bar",
  ".ds-ui-solid-bar",
  ".ds-ui-slider-number",
  ".ds-ui-stepper",
  ".ds-ui-stepper-btn",
  ".ds-ui-stepper-spinner",
  ".ds-ui-stepper-spinner-btn",
  ".ds-ui-stepper-value",
  ".ds-ui-stepper-spinner-value",
  ".ds-ui-arrow-selector",
  ".ds-ui-arrow-btn",
  ".ds-ui-toggle-row",
  ".ds-ui-toggle-track",
  ".ds-ui-color-picker",
  ".ds-ui-color-swatch",
  ".ds-ui-color-trigger",
  ".ds-res-slider",
  ".ds-compare-puck",
  ".ds-compare-divider",
  ".ds-lv-progress-wrap",
  ".ds-gallery-player-scrubber-zone",
].join(", ");

const DS_INTERACTIVE_CURSORS = new Set([
  "pointer",
  "text",
  "vertical-text",
  "grab",
  "grabbing",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
  "col-resize",
  "row-resize",
  "move",
  "crosshair",
  "cell",
]);

function isDSDomWidget(widget) {
  if (!widget) return false;
  return Boolean(
    widget.element ||
    widget.dom ||
    widget.type === "custom" ||
    widget.type === "DOM" ||
    widget.type === "HTML" ||
    widget.name === "card" ||
    String(widget.name || "").endsWith("_ui")
  );
}

/**
 * Release LiteGraph's native resize-corner hit areas and node body drag/pan
 * for a full-size DOM widget.
 * ComfyUI checks getWidgetOnPos() before findResizeDirection() and before
 * initiating node dragging / canvas panning. A DOM widget whose computed bounds
 * cover the node face would otherwise swallow native resize handles and clicks
 * that pass through non-interactable DOM areas.
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

      // Release native bottom-right corner (20px) and bottom edge (12px) for LiteGraph native resize handle
      if (
        (localX >= w - 20 && localY >= h - 20) ||
        (localY >= h - 12)
      ) {
        return undefined;
      }
    }
    const hit = originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled);
    // DOM widgets handle their own interactive elements in HTML; any click that reaches
    // the underlying LiteGraph canvas should drag the node or pan the canvas.
    if (isDSDomWidget(hit)) {
      return undefined;
    }
    return hit;
  };
}

function getGraphCanvasElement() {
  return (
    window.app?.canvas?.canvas ||
    document.getElementById("graph-canvas") ||
    document.querySelector("canvas.lgraphcanvas") ||
    null
  );
}

function getDSNodeDomRoot(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest(DS_FLOATING_OVERLAY_SELECTOR)) return null;

  const domWidget = target.closest(".dom-widget");
  if (domWidget) {
    if (
      domWidget.querySelector(
        "[data-ds-themed='true'], [data-ds-ui-host='true'], .ds-ui-card, [class*='ds-']"
      ) ||
      target.closest("[data-ds-themed='true'], [data-ds-ui-host='true'], .ds-ui-card, [class*='ds-']")
    ) {
      return domWidget;
    }
    return null;
  }

  return target.closest("[data-ds-ui-host='true'], .ds-ui-card");
}

function canElementScrollOnAxis(el, delta, axis) {
  if (!el || !delta) return false;
  const style = window.getComputedStyle(el);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") {
    return false;
  }
  const scrollPos = axis === "y" ? el.scrollTop : el.scrollLeft;
  const clientSize = axis === "y" ? el.clientHeight : el.clientWidth;
  const scrollSize = axis === "y" ? el.scrollHeight : el.scrollWidth;
  if (scrollSize <= clientSize + 2) return false;

  if (delta < 0) {
    return scrollPos > 0.5;
  }
  return scrollPos + clientSize < scrollSize - 0.5;
}

function findActiveScrollableAncestor(target, rootBoundary, deltaX, deltaY) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.tagName === "TEXTAREA") {
      // Unfocused textareas should not trap canvas wheel zoom; focused textareas scroll when overflowing
      if (document.activeElement === el) {
        if (canElementScrollOnAxis(el, deltaY, "y") || canElementScrollOnAxis(el, deltaX, "x")) {
          return el;
        }
      }
    } else if (
      el !== rootBoundary &&
      !el.classList.contains("dom-widget") &&
      el.dataset?.dsUiHost !== "true"
    ) {
      if (canElementScrollOnAxis(el, deltaY, "y") || canElementScrollOnAxis(el, deltaX, "x")) {
        return el;
      }
    }
    if (el === rootBoundary) break;
    el = el.parentElement;
  }
  return null;
}

function isFocusedWheelInput(target) {
  if (!(target instanceof Element)) return false;
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  if (active.tagName === "INPUT" && !active.readOnly && !active.disabled) {
    const type = (active.type || "text").toLowerCase();
    if (type !== "button" && type !== "checkbox" && type !== "radio" && type !== "file") {
      if (active === target || active.contains(target)) {
        return true;
      }
    }
  }
  return false;
}

function isInteractiveDSElement(target, rootBoundary) {
  if (!(target instanceof Element)) return false;

  const explicitPassive = target.closest("[data-interactive='false'], .dsui-passive");
  if (explicitPassive) return false;

  // Image Compare viewport: only interactive when Split mode is active with loaded images (ew-resize)
  const compareViewport = target.closest(".ds-ui-compare-viewport");
  if (compareViewport) {
    if (target.closest(".ds-compare-placeholder")) return false;
    const stage = compareViewport.querySelector(".ds-compare-stage");
    if (!stage || stage.style.display === "none") return false;
    const cursor = compareViewport.style.cursor || window.getComputedStyle(compareViewport).cursor;
    return cursor === "ew-resize" || Boolean(target.closest(".ds-compare-puck, .ds-compare-divider"));
  }

  // Standard interactive controls & DS control classes
  const matchedControl = target.closest(DS_INTERACTIVE_CONTROL_SELECTOR);
  if (matchedControl && (!rootBoundary || rootBoundary.contains(matchedControl))) {
    if (matchedControl.tagName === "LABEL") {
      const hasInput = Boolean(
        matchedControl.querySelector("input, select, textarea, button") ||
        matchedControl.htmlFor
      );
      if (hasInput) return true;
    } else {
      return true;
    }
  }

  // Inspect ancestors up to the card shell for custom interactive widgets (e.g., gallery tiles, prompt cards, canvas tools)
  let el = target;
  while (el && el !== rootBoundary && el !== document.body) {
    if (
      el.classList.contains("ds-ui-card") ||
      el.classList.contains("ds-ui-card-body") ||
      el.classList.contains("ds-ui-card-head") ||
      el.classList.contains("dom-widget") ||
      el.dataset?.dsUiHost === "true"
    ) {
      break;
    }

    if (el.tagName === "CANVAS") {
      const pe = window.getComputedStyle(el).pointerEvents;
      if (pe !== "none") return true;
    }

    if (el.draggable === true || el.getAttribute("draggable") === "true") {
      return true;
    }

    const inlineCursor = el.style?.cursor;
    if (inlineCursor && DS_INTERACTIVE_CURSORS.has(inlineCursor)) {
      return true;
    }

    const computedCursor = window.getComputedStyle(el).cursor;
    if (computedCursor && DS_INTERACTIVE_CURSORS.has(computedCursor)) {
      return true;
    }

    el = el.parentElement;
  }

  return false;
}

function dispatchClonedWheelToCanvas(canvasEl, e) {
  const rect = canvasEl.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  const cloned = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    detail: e.detail,
    screenX: e.screenX,
    screenY: e.screenY,
    clientX: e.clientX,
    clientY: e.clientY,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    button: e.button,
    buttons: e.buttons,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaZ: e.deltaZ,
    deltaMode: e.deltaMode,
  });

  Object.defineProperties(cloned, {
    offsetX: { value: offsetX, configurable: true },
    offsetY: { value: offsetY, configurable: true },
    layerX: { value: offsetX, configurable: true },
    layerY: { value: offsetY, configurable: true },
    wheelDelta: { value: e.wheelDelta ?? -e.deltaY * 3, configurable: true },
    wheelDeltaY: { value: e.wheelDeltaY ?? -e.deltaY * 3, configurable: true },
    wheelDeltaX: { value: e.wheelDeltaX ?? -e.deltaX * 3, configurable: true },
  });

  canvasEl.dispatchEvent(cloned);
}

function dispatchClonedPointerOrMouseToCanvas(canvasEl, e, overrideType = null) {
  const type = overrideType || e.type;
  const rect = canvasEl.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  const whichVal = e.which || (typeof e.button === "number" ? e.button + 1 : 1);

  const baseInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    detail: e.detail,
    screenX: e.screenX,
    screenY: e.screenY,
    clientX: e.clientX,
    clientY: e.clientY,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    button: e.button,
    buttons: e.buttons,
  };

  let cloned;
  if (type.startsWith("pointer") && typeof PointerEvent !== "undefined") {
    cloned = new PointerEvent(type, {
      ...baseInit,
      pointerId: e.pointerId ?? 1,
      width: e.width ?? 1,
      height: e.height ?? 1,
      pressure: e.pressure ?? (e.buttons ? 0.5 : 0),
      tangentialPressure: e.tangentialPressure ?? 0,
      tiltX: e.tiltX ?? 0,
      tiltY: e.tiltY ?? 0,
      twist: e.twist ?? 0,
      pointerType: e.pointerType || "mouse",
      isPrimary: e.isPrimary ?? true,
    });
  } else {
    cloned = new MouseEvent(type, baseInit);
  }

  Object.defineProperties(cloned, {
    which: { value: whichVal, configurable: true },
    offsetX: { value: offsetX, configurable: true },
    offsetY: { value: offsetY, configurable: true },
    layerX: { value: offsetX, configurable: true },
    layerY: { value: offsetY, configurable: true },
  });

  canvasEl.dispatchEvent(cloned);
}

/**
 * Install global capture-phase listeners that bridge mouse-wheel zooming and
 * non-interactive click-and-drag panning / node moving from DS DOM widgets to
 * ComfyUI's underlying LiteGraph `<canvas id="graph-canvas">`.
 */
export function installDSCanvasNavigationBridge() {
  if (typeof window === "undefined" || window.__dsCanvasNavBridgeInstalled) return;
  window.__dsCanvasNavBridgeInstalled = true;

  let isSpaceHeld = false;
  let activeDragSession = null;

  const endDragSession = () => {
    activeDragSession = null;
    document.body?.classList.remove("ds-canvas-dragging");
  };

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code === "Space") {
        const tag = document.activeElement?.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          document.activeElement?.isContentEditable;
        if (!isEditable) {
          isSpaceHeld = true;
        }
      }
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.code === "Space") {
        isSpaceHeld = false;
      }
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    "blur",
    () => {
      isSpaceHeld = false;
      endDragSession();
    },
    { capture: true, passive: true }
  );

  // 1. Mouse Wheel Zoom Forwarding (Capture Phase)
  window.addEventListener(
    "wheel",
    (e) => {
      const canvasEl = getGraphCanvasElement();
      if (!canvasEl || e.target === canvasEl) return;

      const dsRoot = getDSNodeDomRoot(e.target);
      if (!dsRoot) return;

      // Ctrl/Meta + wheel always zooms the canvas
      if (!e.ctrlKey && !e.metaKey) {
        if (isFocusedWheelInput(e.target)) {
          return;
        }
        const scrollable = findActiveScrollableAncestor(e.target, dsRoot, e.deltaX, e.deltaY);
        if (scrollable) {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();
      dispatchClonedWheelToCanvas(canvasEl, e);
    },
    { capture: true, passive: false }
  );

  // 2. Click-and-Drag Canvas Pan & Node Move Forwarding (Capture Phase)
  const shouldForwardPressToCanvas = (e, dsRoot) => {
    // Middle-click (button 1) or Right-click (button 2) or Space+drag or Read-Only mode always pans/menus on canvas
    if (
      e.button === 1 ||
      e.button === 2 ||
      isSpaceHeld ||
      Boolean(window.app?.canvas?.read_only)
    ) {
      return true;
    }
    if (e.button !== 0) return false;
    return !isInteractiveDSElement(e.target, dsRoot);
  };

  window.addEventListener(
    "pointerdown",
    (e) => {
      const canvasEl = getGraphCanvasElement();
      if (!canvasEl || e.target === canvasEl) return;

      const dsRoot = getDSNodeDomRoot(e.target);
      if (!dsRoot) return;

      if (!shouldForwardPressToCanvas(e, dsRoot)) return;

      // Allow stationary click on preview containers (e.g., empty Load Image or Load Video viewport)
      // while enabling canvas/node drag as soon as the pointer moves > 4px.
      const deferPointerLock =
        e.button === 0 &&
        !isSpaceHeld &&
        Boolean(e.target instanceof Element && e.target.closest(".ds-li-preview-container, .ds-lv-viewport"));

      let handledByCanvas = false;
      const lgCanvas = window.app?.canvas;
      const origProcessMouseDown = lgCanvas?.processMouseDown;
      if (lgCanvas && typeof origProcessMouseDown === "function") {
        lgCanvas.processMouseDown = function (...args) {
          handledByCanvas = true;
          return origProcessMouseDown.apply(this, args);
        };
      }

      try {
        dispatchClonedPointerOrMouseToCanvas(canvasEl, e, "pointerdown");
      } finally {
        if (lgCanvas && origProcessMouseDown) {
          lgCanvas.processMouseDown = origProcessMouseDown;
        }
      }

      activeDragSession = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        button: e.button,
        handledMouseDown: handledByCanvas,
        deferPointerLock,
        pointerLocked: !deferPointerLock,
      };

      if (!deferPointerLock) {
        document.body?.classList.add("ds-canvas-dragging");
        e.stopPropagation();
        if (e.button === 1) {
          e.preventDefault();
        }
      }
    },
    { capture: true }
  );

  window.addEventListener(
    "mousedown",
    (e) => {
      const canvasEl = getGraphCanvasElement();
      if (!canvasEl || e.target === canvasEl) return;

      const dsRoot = getDSNodeDomRoot(e.target);
      if (!dsRoot && !activeDragSession) return;

      if (!activeDragSession) {
        if (!dsRoot || !shouldForwardPressToCanvas(e, dsRoot)) return;
        activeDragSession = {
          pointerId: null,
          startX: e.clientX,
          startY: e.clientY,
          button: e.button,
          handledMouseDown: false,
          deferPointerLock: false,
          pointerLocked: true,
        };
        document.body?.classList.add("ds-canvas-dragging");
      }

      if (!activeDragSession.handledMouseDown) {
        activeDragSession.handledMouseDown = true;
        dispatchClonedPointerOrMouseToCanvas(canvasEl, e, "mousedown");
      }

      if (activeDragSession.pointerLocked) {
        e.stopPropagation();
        if (e.button === 1) {
          e.preventDefault();
        }
      }
    },
    { capture: true }
  );

  window.addEventListener(
    "pointermove",
    (e) => {
      if (!activeDragSession) return;
      if (activeDragSession.deferPointerLock && !activeDragSession.pointerLocked) {
        const dx = e.clientX - activeDragSession.startX;
        const dy = e.clientY - activeDragSession.startY;
        if (dx * dx + dy * dy > 16) {
          activeDragSession.pointerLocked = true;
          document.body?.classList.add("ds-canvas-dragging");
        }
        const canvasEl = getGraphCanvasElement();
        if (canvasEl && e.target !== canvasEl) {
          dispatchClonedPointerOrMouseToCanvas(canvasEl, e, "pointermove");
        }
      }
    },
    { capture: true, passive: true }
  );

  const handleRelease = (e, eventType) => {
    if (!activeDragSession) return;
    const wasDeferredAndUnlocked =
      activeDragSession.deferPointerLock && !activeDragSession.pointerLocked;
    if (wasDeferredAndUnlocked) {
      const canvasEl = getGraphCanvasElement();
      if (canvasEl && e.target !== canvasEl) {
        dispatchClonedPointerOrMouseToCanvas(canvasEl, e, eventType);
      }
    }
    if (eventType === "mouseup" || eventType === "pointercancel") {
      endDragSession();
    } else if (eventType === "pointerup") {
      // Keep ds-canvas-dragging through the immediately following mouseup compatibility event
      requestAnimationFrame(() => endDragSession());
    }
  };

  window.addEventListener("pointerup", (e) => handleRelease(e, "pointerup"), {
    capture: true,
    passive: true,
  });
  window.addEventListener("mouseup", (e) => handleRelease(e, "mouseup"), {
    capture: true,
    passive: true,
  });
  window.addEventListener("pointercancel", (e) => handleRelease(e, "pointercancel"), {
    capture: true,
    passive: true,
  });
  window.addEventListener("mouseleave", () => endDragSession(), { capture: true, passive: true });
  window.addEventListener("pointerleave", () => endDragSession(), { capture: true, passive: true });

  // Forward right-click contextmenu on non-interactive node areas to LiteGraph canvas
  window.addEventListener(
    "contextmenu",
    (e) => {
      const canvasEl = getGraphCanvasElement();
      if (!canvasEl || e.target === canvasEl) return;

      const dsRoot = getDSNodeDomRoot(e.target);
      if (!dsRoot) return;

      const tag = e.target instanceof Element ? e.target.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      dispatchClonedPointerOrMouseToCanvas(canvasEl, e, "contextmenu");
    },
    { capture: true }
  );
}

/**
 * Apply the unified 10px shell inset and clean host styling to a node face DOM widget.
 */
export function normalizeDSWidgetHost(root, node = null, options = {}) {
  if (!root) return;

  installDSCanvasNavigationBridge();
  if (node) {
    protectDSResizeCorners(node);
  }

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

  // Ensure card inside root has pointer-events: auto (unless root itself intentionally opted out)
  const card = root.classList?.contains("ds-ui-card")
    ? root
    : (root.querySelector(".ds-ui-card") || root.firstElementChild);
  if (card && root.style.pointerEvents !== "none") {
    card.style.pointerEvents = "auto";
  }

  // Re-apply to parent after DOM widget attaches to DOM
  requestAnimationFrame(() => {
    styleHost(root.parentElement);
    if (root.parentElement?.parentElement && root.parentElement.parentElement.id !== "graph-canvas") {
      root.parentElement.parentElement.style.pointerEvents = "none";
    }
    // Re-assert pointer-events:auto on the card itself after parent override
    const cardEl = root.classList?.contains("ds-ui-card")
      ? root
      : (root.querySelector(".ds-ui-card") || root.firstElementChild);
    if (cardEl && (cardEl !== root || options.shell === false)) {
      cardEl.style.pointerEvents = "auto";
    }
  });
}

if (typeof window !== "undefined") {
  installDSCanvasNavigationBridge();
}

