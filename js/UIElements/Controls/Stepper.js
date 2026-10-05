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

  const root = document.createElement("div");
  root.className = "ds-ui-stepper";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  // Minus button
  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "ds-ui-stepper-btn";
  minusBtn.title = "Decrement";
  minusBtn.disabled = disabled;
  minusBtn.appendChild(DSIcon("minus", { size: 12 }));

  // Numeric text input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ds-ui-stepper-value";
  input.value = formatPrecision(current, step);
  input.disabled = disabled;

  // Plus button
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "ds-ui-stepper-btn";
  plusBtn.title = "Increment";
  plusBtn.disabled = disabled;
  plusBtn.appendChild(DSIcon("plus", { size: 12 }));

  root.append(minusBtn, input, plusBtn);

  const emit = (val, fire = true) => {
    current = clamp(val, min, max);
    input.value = formatPrecision(current, step);
    if (fire) options.onChange?.(current, api);
  };

  input.addEventListener("change", () => {
    emit(Number(input.value) || 0, true);
  });

  // Hold to repeat logic
  let repeatTimer = null;
  let repeatInterval = null;

  const startRepeat = (delta) => {
    if (disabled) return;
    emit(current + delta, true);
    repeatTimer = setTimeout(() => {
      let speed = 100;
      repeatInterval = setInterval(() => {
        emit(current + delta, true);
      }, speed);
    }, 350);
  };

  const stopRepeat = () => {
    clearTimeout(repeatTimer);
    clearInterval(repeatInterval);
    repeatTimer = null;
    repeatInterval = null;
  };

  minusBtn.addEventListener("pointerdown", () => startRepeat(-step));
  minusBtn.addEventListener("pointerup", stopRepeat);
  minusBtn.addEventListener("pointerleave", stopRepeat);

  plusBtn.addEventListener("pointerdown", () => startRepeat(step));
  plusBtn.addEventListener("pointerup", stopRepeat);
  plusBtn.addEventListener("pointerleave", stopRepeat);

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
      root.remove();
    },
  };

  return api;
}
