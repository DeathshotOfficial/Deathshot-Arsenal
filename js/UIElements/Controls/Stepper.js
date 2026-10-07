/**
 * DeathshotArsenal UI — Stepper Component
 * Numeric stepper with [ - ] [ Value ] [ + ] soft rounded rectangle buttons and hold-to-repeat.
 */

import { DSIcon } from "../../Icons/index.js";

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return Number(min) || 0;
  return Math.min(Number(max), Math.max(Number(min), n));
}

function formatPrecision(val, step) {
  const s = String(step ?? 1);
  const dot = s.indexOf(".");
  const p = dot < 0 ? 0 : s.length - dot - 1;
  return Number(val).toFixed(p);
}

export function Stepper(options = {}) {
  const min = options.min != null ? Number(options.min) : -Infinity;
  const max = options.max != null ? Number(options.max) : Infinity;
  const step = Number(options.step ?? 1);
  let current = clamp(options.value ?? (Number.isFinite(min) ? min : 0), min, max);
  let disabled = Boolean(options.disabled);
  const isCompact = Boolean(options.compact || options.size === "compact");

  const root = document.createElement("div");
  root.className = "ds-ui-stepper";
  if (isCompact) root.classList.add("ds-ui-stepper-compact");
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  // Minus button
  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "ds-ui-stepper-btn";
  if (isCompact) minusBtn.classList.add("ds-ui-stepper-btn-compact");
  minusBtn.title = "Decrement";
  minusBtn.disabled = disabled;
  minusBtn.appendChild(DSIcon("minus", { size: isCompact ? 10 : 12 }));

  // Numeric text input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ds-ui-stepper-value";
  if (isCompact) input.classList.add("ds-ui-stepper-value-compact");
  input.value = formatPrecision(current, step);
  input.disabled = disabled;
  input.autocomplete = "off";
  input.spellcheck = false;

  // Plus button
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "ds-ui-stepper-btn";
  if (isCompact) plusBtn.classList.add("ds-ui-stepper-btn-compact");
  plusBtn.title = "Increment";
  plusBtn.disabled = disabled;
  plusBtn.appendChild(DSIcon("plus", { size: isCompact ? 10 : 12 }));

  root.append(minusBtn, input, plusBtn);

  const emit = (val, fire = true) => {
    current = clamp(val, min, max);
    input.value = formatPrecision(current, step);
    if (fire) options.onChange?.(current, api);
  };

  input.addEventListener("change", () => {
    emit(Number(input.value) || 0, true);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      emit(Number(input.value) || 0, true);
      input.blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      emit(current + step, true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      emit(current - step, true);
    }
  });

  // Double-click to select all
  const selectAll = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    input.focus();
    input.select();
    try {
      input.setSelectionRange(0, input.value.length);
    } catch (_) {}
  };

  input.addEventListener("dblclick", selectAll);
  input.addEventListener("focus", () => {
    setTimeout(() => {
      try {
        input.select();
        input.setSelectionRange(0, input.value.length);
      } catch (_) {}
    }, 10);
  });

  // Hold to repeat logic with pointer capture
  let repeatTimer = null;
  let repeatInterval = null;
  let activePointerId = null;
  let activeTarget = null;

  const stopRepeat = (e) => {
    if (repeatTimer) {
      clearTimeout(repeatTimer);
      repeatTimer = null;
    }
    if (repeatInterval) {
      clearInterval(repeatInterval);
      repeatInterval = null;
    }
    if (activeTarget && activePointerId != null) {
      try {
        if (activeTarget.hasPointerCapture(activePointerId)) {
          activeTarget.releasePointerCapture(activePointerId);
        }
      } catch (_) {}
    }
    activePointerId = null;
    activeTarget = null;
  };

  const startRepeat = (delta, e) => {
    if (disabled) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      activePointerId = e.pointerId;
      activeTarget = e.currentTarget;
      try {
        activeTarget.setPointerCapture(activePointerId);
      } catch (_) {}
    }

    stopRepeat();
    emit(current + delta, true);

    repeatTimer = setTimeout(() => {
      repeatInterval = setInterval(() => {
        emit(current + delta, true);
      }, 60);
    }, 300);
  };

  minusBtn.addEventListener("pointerdown", (e) => startRepeat(-step, e));
  minusBtn.addEventListener("pointerup", stopRepeat);
  minusBtn.addEventListener("pointercancel", stopRepeat);

  plusBtn.addEventListener("pointerdown", (e) => startRepeat(step, e));
  plusBtn.addEventListener("pointerup", stopRepeat);
  plusBtn.addEventListener("pointercancel", stopRepeat);

  const onWindowPointerUp = (e) => {
    if (repeatTimer || repeatInterval) {
      stopRepeat(e);
    }
  };
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);

  const api = {
    root,
    input,
    minusBtn,
    plusBtn,
    getValue: () => current,
    setValue(val, fire = false) {
      emit(val, fire);
    },
    setDisabled(state) {
      disabled = Boolean(state);
      minusBtn.disabled = disabled;
      plusBtn.disabled = disabled;
      input.disabled = disabled;
    },
    destroy() {
      stopRepeat();
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
      root.remove();
    },
  };

  return api;
}
