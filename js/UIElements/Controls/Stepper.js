/**
 * DeathshotArsenal UI — Stepper & Spinbox Component
 * Numeric stepper supporting:
 * 1. Horizontal layout: [ - ] [ Value ] [ + ] with soft rounded rectangle buttons
 * 2. Vertical/Spinner layout: [ Value | ^ / v ] with stacked vector chevrons
 * Features hold-to-repeat, double-click select-all, keyboard arrows, and clamp bounds.
 */

import { DSIcon } from "../../Icons/index.js";

function clamp(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    if (fallback != null && Number.isFinite(Number(fallback))) {
      return clamp(fallback, min, max, null);
    }
    return Number.isFinite(min) ? min : 0;
  }
  return Math.min(Number(max), Math.max(Number(min), n));
}

function getPrecision(step, decimals) {
  if (decimals !== undefined && decimals !== null && !isNaN(Number(decimals))) {
    return Math.max(0, Number(decimals));
  }
  const s = String(step ?? 1);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function formatPrecision(val, precision) {
  const n = Number(val);
  if (!Number.isFinite(n)) return "";
  return precision > 0 ? n.toFixed(precision) : String(Math.round(n));
}

export function Stepper(options = {}) {
  const isSpinner =
    options.layout === "spinner" ||
    options.layout === "vertical" ||
    options.variant === "spinner" ||
    options.variant === "vertical" ||
    Boolean(options.arrows || options.spinner);

  const min = options.min != null ? Number(options.min) : -Infinity;
  const max = options.max != null ? Number(options.max) : Infinity;
  const step = Number(options.step ?? 1);
  const precision = getPrecision(step, options.decimals);
  const placeholder = options.placeholder ?? "";
  const fallbackValue = options.fallbackValue;

  let current = clamp(options.value ?? (Number.isFinite(min) ? min : 0), min, max, fallbackValue);
  let disabled = Boolean(options.disabled);
  const isCompact = Boolean(options.compact || options.size === "compact");

  const root = document.createElement("div");
  root.className = "ds-ui-stepper";
  if (isSpinner) {
    root.classList.add("ds-ui-stepper-spinner", "ds-sensei-stepper");
  }
  if (isCompact) root.classList.add("ds-ui-stepper-compact");
  if (options.width) root.style.width = options.width;
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  // Numeric text input
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.className = "ds-ui-stepper-value";
  if (isSpinner) {
    input.classList.add("ds-ui-stepper-spinner-value", "ds-sensei-stepper-input");
  }
  if (isCompact) input.classList.add("ds-ui-stepper-value-compact");
  if (placeholder) {
    input.placeholder = placeholder;
    input.title = placeholder;
  }
  input.value = (options.value === "" && placeholder) ? "" : formatPrecision(current, precision);
  input.disabled = disabled;
  input.autocomplete = "off";
  input.spellcheck = false;

  let minusBtn = null;
  let plusBtn = null;
  let upBtn = null;
  let downBtn = null;
  let btnsWrap = null;

  if (isSpinner) {
    btnsWrap = document.createElement("div");
    btnsWrap.className = "ds-ui-stepper-spinner-btns ds-sensei-stepper-btns";

    upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "ds-ui-stepper-spinner-btn ds-ui-stepper-spinner-btn-up ds-sensei-stepper-btn";
    upBtn.setAttribute("tabindex", "-1");
    upBtn.title = "Increment";
    upBtn.disabled = disabled;
    upBtn.innerHTML = `<svg viewBox="0 0 10 6" width="8" height="5" style="display:block"><path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

    downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "ds-ui-stepper-spinner-btn ds-ui-stepper-spinner-btn-down ds-sensei-stepper-btn";
    downBtn.setAttribute("tabindex", "-1");
    downBtn.title = "Decrement";
    downBtn.disabled = disabled;
    downBtn.innerHTML = `<svg viewBox="0 0 10 6" width="8" height="5" style="display:block"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

    btnsWrap.append(upBtn, downBtn);
    root.append(input, btnsWrap);
  } else {
    // Horizontal layout
    minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "ds-ui-stepper-btn";
    if (isCompact) minusBtn.classList.add("ds-ui-stepper-btn-compact");
    minusBtn.title = "Decrement";
    minusBtn.disabled = disabled;
    minusBtn.appendChild(DSIcon("minus", { size: isCompact ? 10 : 12 }));

    plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "ds-ui-stepper-btn";
    if (isCompact) plusBtn.classList.add("ds-ui-stepper-btn-compact");
    plusBtn.title = "Increment";
    plusBtn.disabled = disabled;
    plusBtn.appendChild(DSIcon("plus", { size: isCompact ? 10 : 12 }));

    root.append(minusBtn, input, plusBtn);
  }

  const getBase = () => {
    const raw = parseFloat(input.value);
    if (!isNaN(raw)) return clamp(raw, min, max, null);
    if (fallbackValue !== undefined && fallbackValue !== null && !isNaN(parseFloat(fallbackValue))) {
      return clamp(parseFloat(fallbackValue), min, max, null);
    }
    return Number.isFinite(min) ? min : 0;
  };

  const emit = (val, fire = true) => {
    current = clamp(val, min, max, fallbackValue);
    input.value = formatPrecision(current, precision);
    if (fire) options.onChange?.(current, api);
  };

  input.addEventListener("change", () => {
    const raw = parseFloat(input.value);
    if (isNaN(raw)) {
      if (placeholder) {
        input.value = "";
        current = getBase();
        if (options.onChange) options.onChange(current, api);
        return;
      }
      emit(getBase(), true);
    } else {
      emit(raw, true);
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = parseFloat(input.value);
      emit(isNaN(raw) ? getBase() : raw, true);
      input.blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const base = getBase();
      const next = clamp(Number((base + step).toFixed(precision)), min, max);
      emit(next, true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const base = getBase();
      const next = clamp(Number((base - step).toFixed(precision)), min, max);
      emit(next, true);
    }
  });

  // Double-click to select all and stop canvas propagation
  const selectAll = (e) => {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    input.focus();
    setTimeout(() => {
      try {
        input.select();
        input.setSelectionRange(0, input.value.length);
      } catch (_) {}
    }, 0);
  };

  input.addEventListener("dblclick", selectAll);
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("focus", (e) => {
    e.stopPropagation();
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

  const stepDelta = (delta) => {
    const base = getBase();
    const next = clamp(Number((base + delta).toFixed(precision)), min, max);
    emit(next, true);
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
    stepDelta(delta);

    repeatTimer = setTimeout(() => {
      repeatInterval = setInterval(() => {
        stepDelta(delta);
      }, 60);
    }, 300);
  };

  const decBtn = isSpinner ? downBtn : minusBtn;
  const incBtn = isSpinner ? upBtn : plusBtn;

  decBtn.addEventListener("pointerdown", (e) => startRepeat(-step, e));
  decBtn.addEventListener("pointerup", stopRepeat);
  decBtn.addEventListener("pointercancel", stopRepeat);
  decBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  incBtn.addEventListener("pointerdown", (e) => startRepeat(step, e));
  incBtn.addEventListener("pointerup", stopRepeat);
  incBtn.addEventListener("pointercancel", stopRepeat);
  incBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  const onWindowPointerUp = (e) => {
    if (repeatTimer || repeatInterval) {
      stopRepeat(e);
    }
  };
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);

  const api = {
    root,
    wrap: root,
    input,
    minusBtn: minusBtn || downBtn,
    plusBtn: plusBtn || upBtn,
    upBtn: upBtn || plusBtn,
    downBtn: downBtn || minusBtn,
    getValue: () => current,
    setValue(val, fire = false) {
      if (val === "" && placeholder) {
        input.value = "";
        current = getBase();
        if (fire) options.onChange?.(current, api);
        return;
      }
      emit(val, fire);
    },
    setDisabled(state) {
      disabled = Boolean(state);
      if (minusBtn) minusBtn.disabled = disabled;
      if (plusBtn) plusBtn.disabled = disabled;
      if (upBtn) upBtn.disabled = disabled;
      if (downBtn) downBtn.disabled = disabled;
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

export function Spinbox(options = {}) {
  return Stepper({ ...options, layout: "spinner" });
}
