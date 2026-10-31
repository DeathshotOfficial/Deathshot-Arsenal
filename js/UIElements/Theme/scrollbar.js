/**
 * DS overlay scrollbar.
 * Native scrollbars inside DS surfaces are zero-width (see the engine CSS), so they never take
 * layout space. One shared thumb is drawn over whichever DS scroll area the pointer is in,
 * only while it is hovered or scrolled, and can be dragged.
 */

const SCOPE = '[data-ds-face="true"], [data-ds-themed="true"], .ds-ui-popup, .ds-ui-modal';
const HIDE_DELAY = 700;

function scrollableAncestor(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      return el.closest(SCOPE) ? el : null;
    }
  }
  return null;
}

export function installOverlayScrollbar() {
  const thumb = document.createElement("div");
  thumb.className = "ds-sb-thumb";
  document.body.appendChild(thumb);

  let target = null;
  let hovered = false;
  let dragging = null;
  let hideTimer = 0;
  let frame = 0;

  const place = () => {
    frame = 0;
    if (!target || !target.isConnected || target.scrollHeight <= target.clientHeight + 1) {
      thumb.classList.remove("is-visible");
      return;
    }
    const rect = target.getBoundingClientRect();
    // DOM widgets are scaled with the canvas; size the thumb in the area's own scale.
    const scale = rect.height / target.offsetHeight || 1;
    const viewH = target.clientHeight * scale;
    const thumbH = Math.max(24 * scale, viewH * (target.clientHeight / target.scrollHeight));
    const range = target.scrollHeight - target.clientHeight;
    const top = rect.top + (target.scrollTop / range) * (viewH - thumbH);
    const width = Math.max(3, 5 * scale);
    thumb.style.transform = `translate(${rect.left + target.clientWidth * scale - width - 2 * scale}px, ${top}px)`;
    thumb.style.width = `${width}px`;
    thumb.style.height = `${thumbH}px`;
    thumb.classList.add("is-visible");
    // Follow scrolling and canvas pan/zoom for as long as the thumb is shown.
    frame = requestAnimationFrame(place);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (hovered || dragging) return;
      target = null;
    }, HIDE_DELAY);
  };

  document.addEventListener("pointerover", (e) => {
    if (dragging || e.target === thumb) return;
    const next = scrollableAncestor(e.target);
    hovered = Boolean(next);
    if (next) {
      target = next;
      clearTimeout(hideTimer);
      schedule();
    } else if (target) {
      hideSoon();
    }
  }, true);

  thumb.addEventListener("pointerenter", () => { hovered = true; clearTimeout(hideTimer); });
  thumb.addEventListener("pointerleave", () => { hovered = false; hideSoon(); });
  thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumb.setPointerCapture(e.pointerId);
    dragging = { y: e.clientY, scrollTop: target.scrollTop };
    thumb.classList.add("is-dragging");
  });
  thumb.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = target.getBoundingClientRect();
    const range = target.scrollHeight - target.clientHeight;
    const travel = rect.height - thumb.offsetHeight;
    target.scrollTop = dragging.scrollTop + ((e.clientY - dragging.y) / travel) * range;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = null;
    thumb.classList.remove("is-dragging");
    if (!hovered) hideSoon();
  };
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);
}
