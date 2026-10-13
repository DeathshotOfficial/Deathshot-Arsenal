// card_layout.js - shared "Node Base -> Card -> UI" layout for every DeathshotArsenal node.
//
//   NODE BASE  (the ComfyUI node itself - the only size authority)
//   └── CARD   (the DOM widget element; exactly NODE_TO_CARD px from every node edge)
//       ├── row      fixed height, width follows the node
//       ├── grow     width AND height follow the node
//       └── row ...
//
// Geometry:
//   * addDOMWidget margin = NODE_TO_CARD (ComfyUI default is 10, which stacks with custom margins).
//   * The card fills its widget rect, has padding = CARD_TO_UI and an inset box-shadow border,
//     so UI sits exactly NODE_TO_CARD + CARD_TO_UI from the node edge.
//   * widgets_start_y is overridden to remove ComfyUI's extra 2px above the first widget.
//   * Minimum node size comes from the declared row heights through node.computeSize().
//   * The card is click-through and ignored by the canvas widget hit-test so the 15px
//     resize corners and node dragging by the card padding keep working.
//   * Values changed from the card go through card.set() so undo/redo and autosave record them.

import { app } from "../../../scripts/app.js";
import { Card } from "./Core/Card.js";
import { attachNodeShortcuts, recordCanvasChange } from "./shortcuts.js";

export const LAYOUT = {
  NODE_TO_CARD: 5,
  CARD_TO_UI: 10,
  GAP: 6,
  ROW_HEIGHT: 28,
  MIN_WIDTH: 280,
  HEAD_HEIGHT: 32,
};

const P = "dsui";

const CSS = `
.dom-widget:has(> .${P}-card) { pointer-events: none !important; }

.${P}-card.ds-ui-card {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--ds-color-card-border, var(--ds-color-border, #242a36));
  pointer-events: none;
}
.${P}-card > .ds-ui-card-head {
  box-sizing: border-box;
  flex: 0 0 var(--${P}-head);
  height: var(--${P}-head);
  margin: 0;
  padding: 0 var(--${P}-pad);
  pointer-events: none;
}
.${P}-card > .ds-ui-card-head .ds-ui-card-actions {
  pointer-events: auto;
}
.${P}-card > .ds-ui-card-body {
  box-sizing: border-box;
  flex: 1 1 0;
  min-height: 0;
  margin: 0;
  padding: var(--${P}-pad);
  display: flex;
  flex-direction: column;
  gap: var(--${P}-gap);
  pointer-events: none;
}
.${P}-card.has-head > .ds-ui-card-body { padding-top: var(--${P}-gap); }
.${P}-card.is-collapsed > .ds-ui-card-body { display: none; }
.${P}-card .ds-ui-card-body > * {
  box-sizing: border-box;
  margin: 0;
  min-width: 0;
  min-height: 0;
  pointer-events: auto;
}
.${P}-card .ds-ui-card-body > .${P}-row { display: flex; gap: var(--${P}-gap); pointer-events: none; }
:where(.${P}-row > *) {
  box-sizing: border-box;
  margin: 0;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  pointer-events: auto;
}
.${P}-card .ds-ui-card-body > .${P}-grow { flex: 1 1 0; }
.${P}-card .ds-ui-card-body > .${P}-passive { pointer-events: none; }

.${P}-card textarea { resize: none; }
`;

function injectCSS() {
  if (document.getElementById(`${P}-style`)) return;
  const style = document.createElement("style");
  style.id = `${P}-style`;
  style.textContent = CSS;
  document.head.append(style);
}

function bodyTop(node) {
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const inputs = (node.inputs ?? []).filter((i) => !i.widget).length;
  const outputs = (node.outputs ?? []).length;
  const rows = Math.max(inputs, outputs);
  return rows ? rows * slotH + (node.constructor.slot_start_y || 0) : 0;
}

/** Hide a native (Python-defined) widget so the card drives it. The value is still saved and sent to Python. */
export function useNativeWidget(node, name) {
  const w = node.widgets?.find((x) => x.name === name);
  if (!w) throw new Error(`[${P}] widget "${name}" not found on ${node.type}`);
  w.hidden = true;
  w.computeSize = () => [0, -4];
  return w;
}

/**
 * Create the card on a node. Call once inside onNodeCreated.
 * options:
 *   minWidth     minimum node width                        (default LAYOUT.MIN_WIDTH)
 *   width        initial node width for new nodes          (default minWidth)
 *   height       initial node height for new nodes         (default = minimum)
 *   gap          space between rows                        (default LAYOUT.GAP)
 *   lockHeight   true -> node height always equals the fitted height (fixed/dynamic nodes)
 *   title, icon, actions, collapsible, collapsed   passed to the DS Card() header
 */
export function createCard(node, options = {}) {
  injectCSS();

  const nodeToCard = LAYOUT.NODE_TO_CARD;
  const cardToUi = LAYOUT.CARD_TO_UI;
  const gap = options.gap ?? LAYOUT.GAP;
  const minWidth = options.minWidth ?? LAYOUT.MIN_WIDTH;
  const lockHeight = options.lockHeight ?? false;

  const items = [];
  const hasHead = Boolean(
    options.title || options.icon || options.collapsible || options.actions?.length,
  );

  // The DS Card is the DOM widget root; rows are appended to its body.
  const ds = Card({
    title: options.title,
    icon: options.icon,
    actions: options.actions,
    collapsible: options.collapsible,
    collapsed: options.collapsed,
    className: `${P}-card${hasHead ? " has-head" : ""}`,
    onCollapseChange: () => card.relayout({ shrink: true }),
  });
  const el = ds.root;
  const host = ds.body;
  el.style.setProperty(`--${P}-pad`, `${cardToUi}px`);
  el.style.setProperty(`--${P}-gap`, `${gap}px`);
  el.style.setProperty(`--${P}-head`, `${LAYOUT.HEAD_HEIGHT}px`);

  attachNodeShortcuts(node, el);

  const minCardHeight = () => {
    if (hasHead && el.classList.contains("is-collapsed")) return LAYOUT.HEAD_HEIGHT;
    const shown = items.filter((i) => i.visible);
    const content = shown.reduce((sum, i) => sum + (i.grow ? i.minHeight : i.height), 0);
    const top = hasHead ? LAYOUT.HEAD_HEIGHT + gap : cardToUi;
    return top + content + gap * Math.max(0, shown.length - 1) + cardToUi;
  };

  const widget = node.addDOMWidget("card", "card", el, {
    margin: nodeToCard,
    serialize: false,
    getMinHeight: () => minCardHeight() + 2 * nodeToCard,
  });
  widget.serialize = false;

  Object.defineProperty(node, "widgets_start_y", {
    configurable: true,
    get() { return bodyTop(this); },
    set() {},
  });

  const baseComputeSize = node.computeSize;
  node.computeSize = function (out) {
    const size = baseComputeSize.call(this, out);
    size[0] = Math.max(size[0], minWidth);
    const layoutWidgets = this.getLayoutWidgets?.() ?? this.widgets.filter((w) => !w.hidden);
    if (layoutWidgets.length === 1 && layoutWidgets[0] === widget) {
      size[1] = bodyTop(this) + minCardHeight() + 2 * nodeToCard;
    }
    return size;
  };

  // Card hit box covers the whole node body; hand those clicks back to the canvas
  // so corner resizing and node dragging work. HTML controls get their own events.
  const baseGetWidgetOnPos = node.getWidgetOnPos;
  node.getWidgetOnPos = function (...args) {
    const hit = baseGetWidgetOnPos.apply(this, args);
    return hit === widget ? undefined : hit;
  };

  // Vertical lock: height follows content, width stays user-controlled.
  if (lockHeight) {
    const baseOnResize = node.onResize;
    node.onResize = function (size) {
      const min = this.computeSize();
      size[0] = Math.max(size[0], min[0]);
      size[1] = min[1];
      return baseOnResize?.call(this, size);
    };
  }

  let configured = false;
  const baseOnConfigure = node.onConfigure;
  node.onConfigure = function (...args) {
    configured = true;
    const r = baseOnConfigure?.apply(this, args);
    requestAnimationFrame(() => card.relayout({ shrink: lockHeight }));
    return r;
  };

  function add(child, spec) {
    const item = { el: child, visible: true, ...spec };
    if (spec.grow) {
      child.classList.add(`${P}-grow`);
      child.style.minHeight = `${spec.minHeight}px`;
    } else {
      child.style.height = `${spec.height}px`;
      child.style.flex = `0 0 ${spec.height}px`;
    }
    if (spec.interactive === false) child.classList.add(`${P}-passive`);
    item.show = (visible = true) => {
      item.visible = visible;
      child.style.display = visible ? "" : "none";
      card.relayout({ shrink: lockHeight });
    };
    item.hide = () => item.show(false);
    items.push(item);
    host.append(child);
    card.relayout({ shrink: lockHeight });
    return item;
  }

  const card = {
    el,
    ds,
    widget,

    /** Fixed-height row. Items share the width equally. Fixed-width item: item.style.flex = "0 0 60px". */
    row(children, { height = LAYOUT.ROW_HEIGHT } = {}) {
      const row = document.createElement("div");
      row.className = `${P}-row`;
      row.append(...[].concat(children));
      return add(row, { height });
    },

    /** One element on its own fixed-height row, full content width. */
    fixed(child, { height = LAYOUT.ROW_HEIGHT, interactive = true } = {}) {
      return add(child, { height, interactive });
    },

    /** Area that grows in width AND height (preview, textarea). interactive:false lets clicks reach the canvas. */
    grow(child, { minHeight = 100, interactive = true } = {}) {
      return add(child, { grow: true, minHeight, interactive });
    },

    /** Set a node widget value from the card UI so undo/redo, modified state and autosave see it. */
    set(w, value) {
      card.commit(() => {
        w.value = value;
        w.callback?.(w.value, app.canvas, node);
      });
    },

    /** Wrap any other change made from the card (see 4.2 item 4). */
    commit(fn) {
      recordCanvasChange(() => {
        fn();
      });
      node.setDirtyCanvas?.(true, true);
    },

    /** Make the node at least as big as the card needs. shrink:true also shrinks the height to the minimum. */
    relayout({ shrink = false } = {}) {
      const min = node.computeSize();
      node.setSize([
        Math.max(node.size[0], min[0]),
        shrink ? min[1] : Math.max(node.size[1], min[1]),
      ]);
      node.setDirtyCanvas?.(true, true);
    },
  };

  requestAnimationFrame(() => {
    if (configured) return;
    const min = node.computeSize();
    node.setSize([
      Math.max(options.width ?? minWidth, min[0]),
      lockHeight ? min[1] : Math.max(options.height ?? 0, min[1]),
    ]);
    node.setDirtyCanvas?.(true, true);
  });

  return card;
}

/** Register a card UI for one Python node class. */
export function registerCardNode(nodeName, build, options = {}) {
  app.registerExtension({
    name: `${P}.${nodeName}`,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name !== nodeName) return;
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function (...args) {
        const r = onNodeCreated?.apply(this, args);
        const card = createCard(this, options);
        this.card = card;
        build(this, card);
        return r;
      };
    },
  });
}
