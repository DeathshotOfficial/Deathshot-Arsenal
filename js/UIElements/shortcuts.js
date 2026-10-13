/**
 * DeathshotArsenal Unified Keyboard Shortcuts & Undo/Redo Engine
 * Provides consistent, accurate shortcuts across all DeathshotArsenal nodes:
 * - Ctrl+Z: Undo (text edit undo in text inputs; graph/node undo everywhere)
 * - Ctrl+Y / Ctrl+Shift+Z: Redo (text edit redo or graph/node redo)
 * - Ctrl+Enter / Cmd+Enter: Queue workflow (even while typing in inputs)
 * - Ctrl+Shift+Enter: Queue workflow to front
 * - Ctrl+C: Copy selected node (or copy text if text is selected)
 * - Ctrl+V: Paste node (or paste text if inside editable input)
 * - Ctrl+Shift+V: Paste node with links/connections
 * - Ctrl+D: Duplicate selected node(s)
 * - Delete / Backspace: Delete selected node(s) (native character deletion in text inputs)
 * - Ctrl+A: Select all nodes (or select all text in input)
 * - Ctrl+M: Mute / Unmute selected node(s)
 * - Ctrl+B: Bypass / Unbypass selected node(s)
 * - Escape: Blur active input/modal and return focus to canvas
 * - Arrow keys: Nudge selected node(s) by 10px (50px with Shift)
 * - Ctrl+S: Save workflow
 *
 * Fully decoupled from the DS Snap feature: works whether Snap is ON or OFF.
 */

import { app } from "../../../scripts/app.js";

/**
 * Execute a ComfyUI command across different frontend versions
 */
export async function executeCommand(commandId) {
  try {
    if (window.comfyAPI?.command?.execute) {
      return await window.comfyAPI.command.execute(commandId);
    }
    if (app?.extensionManager?.command?.execute) {
      return await app.extensionManager.command.execute(commandId);
    }
    if (app?.extensionManager?.commandStore?.execute) {
      return await app.extensionManager.commandStore.execute(commandId);
    }
    if (app?.commands?.execute) {
      return await app.commands.execute(commandId);
    }
  } catch (err) {
    console.debug(`[DS Shortcuts] executeCommand(${commandId}) failed:`, err);
  }
  return false;
}

/**
 * Safely record a canvas/graph mutation so ComfyUI's ChangeTracker creates a valid undo checkpoint
 */
export function recordCanvasChange(fn) {
  const canvas = app?.canvas;
  const graph = canvas?.graph || app?.graph;
  canvas?.emitBeforeChange?.();
  graph?.beforeChange?.();
  try {
    if (typeof fn === "function") fn();
  } finally {
    graph?.afterChange?.();
    canvas?.emitAfterChange?.();
    canvas?.setDirty?.(true, true);
    try {
      const tracker = app?.workflowManager?.activeWorkflow?.changeTracker;
      tracker?.captureCanvasState?.();
    } catch (_) {}
  }
}

/**
 * Notify ComfyUI change tracker to capture current canvas state
 */
export function captureChange(description = "") {
  try {
    const tracker = app?.workflowManager?.activeWorkflow?.changeTracker;
    if (tracker?.captureCanvasState) {
      tracker.captureCanvasState();
    }
    if (app?.canvas?.graph) {
      app.canvas.graph.change?.();
      app.canvas.setDirty?.(true, true);
    }
  } catch (_) {}
}

/**
 * Execute Undo across ComfyUI, LiteGraph, and DS Snap
 */
export async function executeUndo() {
  // 1. If DS Snap has recorded moves and is enabled, let it undo
  try {
    if (window.__ds_snap_history && window.__ds_snap_history.undoStack?.length > 0) {
      if (window.__ds_snap_history.undo(app?.canvas)) {
        return true;
      }
    }
  } catch (_) {}

  // 2. Try ComfyUI command
  try {
    const ok = await executeCommand("Comfy.Undo");
    if (ok) {
      app?.canvas?.setDirty?.(true, true);
      return true;
    }
  } catch (_) {}

  // 3. Try ComfyUI ChangeTracker (active workflow)
  try {
    const tracker = app?.workflowManager?.activeWorkflow?.changeTracker
      || window.comfyAPI?.changeTracker?.ChangeTracker?.getActiveTracker?.();
    if (tracker && typeof tracker.undo === "function") {
      await tracker.undo();
      app?.canvas?.setDirty?.(true, true);
      return true;
    }
  } catch (_) {}

  // 4. Try app.canvasHistory
  try {
    if (app?.canvasHistory && typeof app.canvasHistory.undo === "function") {
      await app.canvasHistory.undo();
      app?.canvas?.setDirty?.(true, true);
      return true;
    }
  } catch (_) {}

  // 5. Fallback dirty refresh
  app?.canvas?.setDirty?.(true, true);
  return false;
}

/**
 * Execute Redo across ComfyUI, LiteGraph, and DS Snap
 */
export async function executeRedo() {
  // 1. If DS Snap has redo stack, try it
  try {
    if (window.__ds_snap_history && window.__ds_snap_history.redoStack?.length > 0) {
      if (window.__ds_snap_history.redo(app?.canvas)) {
        return true;
      }
    }
  } catch (_) {}

  // 2. Try ComfyUI command
  try {
    const ok = await executeCommand("Comfy.Redo");
    if (ok) {
      app?.canvas?.setDirty?.(true, true);
      return true;
    }
  } catch (_) {}

  // 3. Try ComfyUI ChangeTracker
  try {
    const tracker = app?.workflowManager?.activeWorkflow?.changeTracker
      || window.comfyAPI?.changeTracker?.ChangeTracker?.getActiveTracker?.();
    if (tracker && typeof tracker.redo === "function") {
      await tracker.redo();
      app?.canvas?.setDirty?.(true, true);
      return true;
    }
  } catch (_) {}

  // 4. Try app.canvasHistory
  try {
    if (app?.canvasHistory && typeof app.canvasHistory.redo === "function") {
      await app.canvasHistory.redo();
      app?.canvas?.setDirty?.(true, true);
      return true;
    }
  } catch (_) {}

  app?.canvas?.setDirty?.(true, true);
  return false;
}

// Expose globally for DS Snap interoperability
if (typeof window !== "undefined") {
  window.__ds_executeUndo = executeUndo;
  window.__ds_executeRedo = executeRedo;
}

/**
 * Queue prompt execution
 */
export async function executeQueuePrompt(front = false) {
  try {
    if (front) {
      if (await executeCommand("Comfy.QueuePromptFront")) return true;
      if (typeof app?.queuePrompt === "function") {
        await app.queuePrompt(-1);
        return true;
      }
    } else {
      if (await executeCommand("Comfy.QueuePrompt")) return true;
      if (typeof app?.queuePrompt === "function") {
        await app.queuePrompt(0);
        return true;
      }
    }
  } catch (err) {
    console.error("[DS Shortcuts] Queue prompt error:", err);
  }
  return false;
}

/**
 * Get currently selected nodes or target node
 */
export function getSelectedNodes(fallbackNode = null) {
  const canvas = app?.canvas;
  const nodes = [];
  if (canvas?.selected_nodes) {
    for (const id in canvas.selected_nodes) {
      const n = canvas.selected_nodes[id];
      if (n) nodes.push(n);
    }
  } else if (canvas?.selectedItems) {
    for (const item of canvas.selectedItems) {
      if (item && item.pos && item.size) nodes.push(item);
    }
  }
  if (!nodes.length && fallbackNode) {
    nodes.push(fallbackNode);
  }
  return nodes;
}

/**
 * Copy selected nodes
 */
export async function executeCopy() {
  if (await executeCommand("Comfy.Canvas.CopySelected")) return true;
  if (app?.canvas?.copyToClipboard) {
    app.canvas.copyToClipboard();
    return true;
  }
  return false;
}

/**
 * Paste nodes from clipboard
 */
export async function executePaste(connectInputs = false) {
  if (await executeCommand(connectInputs ? "Comfy.Canvas.PasteFromClipboardWithConnect" : "Comfy.Canvas.PasteFromClipboard")) {
    return true;
  }
  if (app?.canvas?.pasteFromClipboard) {
    recordCanvasChange(() => {
      app.canvas.pasteFromClipboard({ connectInputs });
    });
    return true;
  }
  return false;
}

/**
 * Duplicate selected node(s)
 */
export async function executeDuplicate(fallbackNode = null) {
  const canvas = app?.canvas;
  if (!canvas) return false;
  const selected = getSelectedNodes(fallbackNode);
  if (!selected.length) return false;

  recordCanvasChange(() => {
    canvas.copyToClipboard?.();
    canvas.pasteFromClipboard?.({ connectInputs: false });
  });
  return true;
}

/**
 * Delete selected node(s)
 */
export async function executeDelete(fallbackNode = null) {
  if (await executeCommand("Comfy.Canvas.DeleteSelectedItems")) return true;
  const canvas = app?.canvas;
  if (!canvas) return false;
  recordCanvasChange(() => {
    if (typeof canvas.deleteSelectedItems === "function") {
      canvas.deleteSelectedItems();
    } else if (typeof canvas.deleteSelected === "function") {
      canvas.deleteSelected();
    }
  });
  return true;
}

/**
 * Select all nodes
 */
export async function executeSelectAll() {
  if (await executeCommand("Comfy.Canvas.SelectAll")) return true;
  if (app?.canvas?.selectAll) {
    app.canvas.selectAll();
    app.canvas.setDirty?.(true, true);
    return true;
  }
  return false;
}

/**
 * Deselect all and blur active element
 */
export function executeDeselectAll() {
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  const canvas = app?.canvas;
  if (canvas) {
    canvas.deselectAll?.();
    canvas.selectedItems?.clear?.();
    canvas.setDirty?.(true, true);
  }
}

/**
 * Toggle Mute mode on selected node(s)
 */
export async function executeToggleMute(fallbackNode = null) {
  if (await executeCommand("Comfy.Canvas.ToggleSelectedNodes.Mute")) return true;
  const nodes = getSelectedNodes(fallbackNode);
  if (!nodes.length) return false;
  recordCanvasChange(() => {
    for (const n of nodes) {
      n.mode = n.mode === 2 ? 0 : 2; // 2 = LiteGraph.NEVER / Muted
    }
  });
  return true;
}

/**
 * Toggle Bypass mode on selected node(s)
 */
export async function executeToggleBypass(fallbackNode = null) {
  if (await executeCommand("Comfy.Canvas.ToggleSelectedNodes.Bypass")) return true;
  const nodes = getSelectedNodes(fallbackNode);
  if (!nodes.length) return false;
  recordCanvasChange(() => {
    for (const n of nodes) {
      n.mode = n.mode === 4 ? 0 : 4; // 4 = LiteGraph.BYPASS
    }
  });
  return true;
}

/**
 * Move / Nudge selected node(s) by arrow keys
 */
export function executeMoveSelected(dx, dy, fallbackNode = null) {
  const nodes = getSelectedNodes(fallbackNode);
  if (!nodes.length) return false;
  recordCanvasChange(() => {
    for (const n of nodes) {
      if (n.pos) {
        n.pos[0] = Math.round((Number(n.pos[0]) || 0) + dx);
        n.pos[1] = Math.round((Number(n.pos[1]) || 0) + dy);
        n.setDirtyCanvas?.(true, true);
      }
    }
  });
  return true;
}

/**
 * Check if the active target is an editable input or textarea
 */
export function isEditableTarget(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "TEXTAREA") return !el.readOnly && !el.disabled;
  if (tag === "INPUT") {
    const type = (el.type || "").toLowerCase();
    if (["text", "search", "password", "number", "email", "url", ""].includes(type)) {
      return !el.readOnly && !el.disabled;
    }
  }
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Attach full text history undo/redo stack to any textarea or text input
 */
export function attachTextHistory(inputEl, onChange = null) {
  if (!inputEl || inputEl.__ds_text_history) return inputEl.__ds_text_history;

  const history = {
    stack: [inputEl.value || ""],
    index: 0,
    max: 50,
    timer: null,
  };

  const pushSnapshot = (val) => {
    if (val === history.stack[history.index]) return;
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(val);
    if (history.stack.length > history.max) history.stack.shift();
    history.index = history.stack.length - 1;
  };

  inputEl.addEventListener("input", () => {
    clearTimeout(history.timer);
    history.timer = setTimeout(() => {
      pushSnapshot(inputEl.value);
    }, 250);
  });

  inputEl.__ds_text_undo = () => {
    if (history.index > 0) {
      history.index--;
      inputEl.value = history.stack[history.index];
      onChange?.(inputEl.value);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  };

  inputEl.__ds_text_redo = () => {
    if (history.index < history.stack.length - 1) {
      history.index++;
      inputEl.value = history.stack[history.index];
      onChange?.(inputEl.value);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  };

  inputEl.__ds_text_history = history;
  return history;
}

/**
 * Main Keyboard Shortcut Handler for nodes and node elements
 */
export function handleNodeKeyDown(e, node = null) {
  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  const key = e.key;
  const target = e.target;
  const isEditable = isEditableTarget(target);

  // 1. Queue Prompt: Ctrl+Enter / Cmd+Enter (Works EVERYWHERE, even inside textareas)
  if (isCtrlOrMeta && key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    executeQueuePrompt(e.shiftKey);
    return true;
  }

  // 2. Undo: Ctrl+Z / Cmd+Z (without Shift)
  if (isCtrlOrMeta && !e.shiftKey && (key === "z" || key === "Z")) {
    e.preventDefault();
    e.stopPropagation();

    // If typing inside an editable field, try text undo first
    if (isEditable) {
      if (typeof target.__ds_text_undo === "function" && target.__ds_text_undo()) {
        return true;
      }
      try {
        const valBefore = target.value;
        const res = document.execCommand("undo");
        if (res && target.value !== valBefore) {
          return true;
        }
      } catch (_) {}
    }

    // Fall back to graph / node undo
    executeUndo();
    return true;
  }

  // 3. Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
  if ((isCtrlOrMeta && e.shiftKey && (key === "z" || key === "Z")) || (isCtrlOrMeta && (key === "y" || key === "Y"))) {
    e.preventDefault();
    e.stopPropagation();

    if (isEditable) {
      if (typeof target.__ds_text_redo === "function" && target.__ds_text_redo()) {
        return true;
      }
      try {
        const valBefore = target.value;
        const res = document.execCommand("redo");
        if (res && target.value !== valBefore) {
          return true;
        }
      } catch (_) {}
    }

    executeRedo();
    return true;
  }

  // 4. Copy: Ctrl+C / Cmd+C
  if (isCtrlOrMeta && !e.shiftKey && (key === "c" || key === "C")) {
    if (isEditable) {
      const sel = window.getSelection()?.toString() || "";
      const hasTextSelection = sel.length > 0 || (target.selectionStart !== target.selectionEnd);
      if (hasTextSelection) {
        return false; // Allow native text copy
      }
    }
    e.preventDefault();
    e.stopPropagation();
    executeCopy();
    return true;
  }

  // 5. Paste: Ctrl+V / Cmd+V
  if (isCtrlOrMeta && (key === "v" || key === "V")) {
    if (isEditable) {
      return false; // Allow native text paste
    }
    e.preventDefault();
    e.stopPropagation();
    executePaste(e.shiftKey);
    return true;
  }

  // 6. Duplicate: Ctrl+D / Cmd+D
  if (isCtrlOrMeta && !e.shiftKey && (key === "d" || key === "D")) {
    e.preventDefault();
    e.stopPropagation();
    executeDuplicate(node);
    return true;
  }

  // 7. Delete / Backspace
  if (key === "Delete" || key === "Backspace") {
    if (isEditable) {
      return false; // Allow native text deletion
    }
    e.preventDefault();
    e.stopPropagation();
    executeDelete(node);
    return true;
  }

  // 8. Select All: Ctrl+A / Cmd+A
  if (isCtrlOrMeta && !e.shiftKey && (key === "a" || key === "A")) {
    if (isEditable) {
      return false; // Allow native select all in input
    }
    e.preventDefault();
    e.stopPropagation();
    executeSelectAll();
    return true;
  }

  // 9. Mute: Ctrl+M / Cmd+M
  if (isCtrlOrMeta && !e.shiftKey && (key === "m" || key === "M")) {
    e.preventDefault();
    e.stopPropagation();
    executeToggleMute(node);
    return true;
  }

  // 10. Bypass: Ctrl+B / Cmd+B
  if (isCtrlOrMeta && !e.shiftKey && (key === "b" || key === "B")) {
    e.preventDefault();
    e.stopPropagation();
    executeToggleBypass(node);
    return true;
  }

  // 11. Escape
  if (key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    executeDeselectAll();
    return true;
  }

  // 12. Save Workflow: Ctrl+S / Cmd+S
  if (isCtrlOrMeta && !e.shiftKey && (key === "s" || key === "S")) {
    e.preventDefault();
    e.stopPropagation();
    executeCommand("Comfy.SaveWorkflow");
    return true;
  }

  // 13. Arrow Key Nudge (When not typing in text input, stepper, or slider)
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
    if (isEditable || target.tagName === "SELECT" || target.classList?.contains("ds-ui-slider-bar")) {
      return false; // Allow native control navigation
    }
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 50 : 10;
    let dx = 0;
    let dy = 0;
    if (key === "ArrowUp") dy = -step;
    if (key === "ArrowDown") dy = step;
    if (key === "ArrowLeft") dx = -step;
    if (key === "ArrowRight") dx = step;
    executeMoveSelected(dx, dy, node);
    return true;
  }

  return false;
}

/**
 * Attach shortcut listeners directly to a node and its DOM element
 */
export function attachNodeShortcuts(node, rootElement = null, options = {}) {
  // If rootElement not provided, try to find node's DOM widget or card
  if (!rootElement && node) {
    rootElement = node.card?.el || node.widgets?.find((w) => w?.element)?.element || null;
  }

  // Also hook node.onKeyDown on the LiteGraph node instance so canvas selection works
  if (node && !node.__ds_shortcuts_attached) {
    node.__ds_shortcuts_attached = true;
    const origOnKeyDown = node.onKeyDown;
    node.onKeyDown = function (e) {
      if (handleNodeKeyDown(e, this)) return true;
      return origOnKeyDown?.call(this, e);
    };
  }

  if (!rootElement) return;

  // Make root focusable if needed
  if (!rootElement.hasAttribute("tabindex")) {
    rootElement.setAttribute("tabindex", "-1");
  }

  const listener = (e) => {
    handleNodeKeyDown(e, node);
  };

  rootElement.addEventListener("keydown", listener, false);

  // Auto-attach text history to any existing textareas inside root
  const textareas = rootElement.querySelectorAll("textarea, input[type='text']");
  for (const ta of textareas) {
    attachTextHistory(ta);
  }

  // Observer for dynamically added textareas
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.tagName === "TEXTAREA" || (node.tagName === "INPUT" && node.type === "text")) {
            attachTextHistory(node);
          } else {
            const nested = node.querySelectorAll?.("textarea, input[type='text']") || [];
            for (const n of nested) attachTextHistory(n);
          }
        }
      }
    }
  });

  observer.observe(rootElement, { childList: true, subtree: true });

  // Store cleanup on node
  if (node) {
    const origOnRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
      observer.disconnect();
      rootElement.removeEventListener("keydown", listener, false);
      return origOnRemoved?.apply(this, args);
    };
  }
}

/**
 * Install global capture listener for all DeathshotArsenal shortcuts
 * Ensures shortcuts trigger reliably regardless of snap state
 */
let globalInstalled = false;
export function installGlobalShortcuts() {
  if (globalInstalled || typeof window === "undefined") return;
  globalInstalled = true;

  window.addEventListener(
    "keydown",
    (e) => {
      // Check if target is inside a DeathshotArsenal node or popover
      const target = e.target;
      const insideDS = target?.closest?.(
        "[class*='ds-'], [class*='dsui'], .dom-widget, [data-ds-ui-host]"
      );

      // Check if active selected node is a DeathshotArsenal node
      const canvas = app?.canvas;
      const selected = getSelectedNodes();
      const hasDSSelected = selected.some(
        (n) => n?.type?.startsWith?.("DS") || n?.type?.startsWith?.("Deathshot") || n?.card
      );

      if (insideDS || hasDSSelected) {
        handleNodeKeyDown(e, selected[0] || null);
      }
    },
    true // Capture phase: intercepts before ComfyUI ignores inputs
  );
}

// Auto-install global shortcuts upon module load
if (typeof window !== "undefined") {
  installGlobalShortcuts();
}
