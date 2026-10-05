import { app } from "/scripts/app.js";

function getScreenRectForNode(node) {
  if (!node) return null;
  const canvasEl = app?.canvas?.canvas || window.app?.canvas?.canvas || document.querySelector("canvas#graph-canvas") || document.querySelector("canvas");
  const ds = app?.canvas?.ds || window.app?.canvas?.ds;
  if (canvasEl && ds && Array.isArray(node.pos) && Array.isArray(node.size)) {
    const cr = canvasEl.getBoundingClientRect();
    const scale = Number(ds.scale) || 1;
    const offset = ds.offset || [0, 0];
    const left = cr.left + (Number(node.pos[0] || 0) + Number(offset[0] || 0)) * scale;
    const top = cr.top + (Number(node.pos[1] || 0) + Number(offset[1] || 0)) * scale;
    const width = Number(node.size[0] || 260) * scale;
    const height = Number(node.size[1] || 200) * scale;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  return null;
}

const ACTIVE_NODE_POPUPS = new Set();
let followRaf = null;

function ensureFollowLoop() {
  if (followRaf != null) return;
  const loop = () => {
    if (ACTIVE_NODE_POPUPS.size === 0) {
      followRaf = null;
      return;
    }
    for (const p of ACTIVE_NODE_POPUPS) {
      p.reposition();
    }
    followRaf = requestAnimationFrame(loop);
  };
  followRaf = requestAnimationFrame(loop);
}

export function Popup(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-popup";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (options.width) root.style.width = typeof options.width === "number" ? `${options.width}px` : options.width;
  if (options.maxHeight) root.style.maxHeight = typeof options.maxHeight === "number" ? `${options.maxHeight}px` : options.maxHeight;

  let isOpen = false;
  let clickAwayHandler = null;

  root.addEventListener("pointerdown", (e) => e.stopPropagation());
  root.addEventListener("mousedown", (e) => e.stopPropagation());

  const reposition = (anchorOrPos = options.anchor) => {
    if (!root.isConnected) return;

    // 1. If options.node is provided, dock side-by-side next to the node or parent popup
    const targetNode = options.node || (anchorOrPos?.pos && anchorOrPos?.size ? anchorOrPos : null);
    if (targetNode) {
      const nr = getScreenRectForNode(targetNode);
      if (nr) {
        const pw = Math.max(root.offsetWidth || 0, 240);
        const ph = Math.max(root.offsetHeight || 0, 260);
        const margin = 12;
        const gap = 12;

        // If the anchor is inside another popup (e.g. settings dialog), dock relative to that popup
        const parentPopup = anchorOrPos instanceof HTMLElement ? anchorOrPos.closest(".ds-op-settings, .ds-cp-settings, .ds-ui-popup") : null;
        const targetRect = (parentPopup && parentPopup !== root && parentPopup.isConnected)
          ? parentPopup.getBoundingClientRect()
          : nr;

        const spaceRight = window.innerWidth - targetRect.right - margin;
        const spaceLeft = targetRect.left - margin;

        let left;
        if (spaceRight >= pw + gap) {
          left = targetRect.right + gap;
        } else if (spaceLeft >= pw + gap) {
          left = targetRect.left - pw - gap;
        } else if (spaceRight >= spaceLeft) {
          left = targetRect.right + gap;
        } else {
          left = targetRect.left - pw - gap;
        }

        let top = targetRect.top;
        if (top + ph > window.innerHeight - margin) {
          top = window.innerHeight - ph - margin;
        }
        top = Math.max(margin, top);

        root.style.left = `${Math.round(left)}px`;
        root.style.top = `${Math.round(top)}px`;
        return;
      }
    }

    if (!anchorOrPos) return;

    let x = 0;
    let y = 0;

    if (anchorOrPos instanceof HTMLElement) {
      const rect = anchorOrPos.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + (options.offset ?? 4);

      // If opening below would overflow screen bottom, open above
      const popupH = root.offsetHeight || 180;
      if (y + popupH > window.innerHeight && rect.top - popupH > 0) {
        y = Math.max(8, rect.top - popupH - (options.offset ?? 4));
      }
    } else if (typeof anchorOrPos.x === "number" && typeof anchorOrPos.y === "number") {
      x = anchorOrPos.x;
      y = anchorOrPos.y;
    }

    const popupW = root.offsetWidth || 180;
    const safeLeft = Math.max(8, Math.min(window.innerWidth - popupW - 8, x));
    const safeTop = Math.max(8, Math.min(window.innerHeight - 40, y));

    root.style.left = `${safeLeft}px`;
    root.style.top = `${safeTop}px`;
  };

  const show = (anchor = options.anchor) => {
    if (isOpen) return;
    isOpen = true;
    document.body.appendChild(root);
    reposition(anchor);

    // Frame-delayed positioning to get exact offsetWidth/Height
    requestAnimationFrame(() => reposition(anchor));

    if (options.node || (anchor?.pos && anchor?.size)) {
      ACTIVE_NODE_POPUPS.add(api);
      ensureFollowLoop();
    }

    if (options.closeOnClickOutside !== false) {
      setTimeout(() => {
        clickAwayHandler = (e) => {
          if (!root.contains(e.target) && (!options.anchor?.contains || !options.anchor.contains(e.target))) {
            hide();
          }
        };
        document.addEventListener("pointerdown", clickAwayHandler, true);
      }, 10);
    }

    options.onOpen?.(api);
  };

  const hide = () => {
    if (!isOpen) return;
    isOpen = false;
    ACTIVE_NODE_POPUPS.delete(api);
    if (clickAwayHandler) {
      document.removeEventListener("pointerdown", clickAwayHandler, true);
      clickAwayHandler = null;
    }
    root.remove();
    options.onClose?.(api);
  };

  const api = {
    root,
    show,
    hide,
    reposition,
    isOpen: () => isOpen,
    destroy: () => {
      hide();
      root.remove();
    },
  };

  return api;
}
