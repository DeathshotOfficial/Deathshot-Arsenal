/**
 * DeathshotArsenal UI — Slider Component (Solid Block Slider)
 * Custom solid bar track + soft-cornered solid fill block with label inside track and numeric sync.
 */

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

export function Slider(options = {}) {
  let min = Number(options.min ?? 0);
  let max = Number(options.max ?? 100);
  let step = Number(options.step ?? 1);
  if (!Number.isFinite(step) || step <= 0) step = 1;
  let current = clamp(options.value ?? min, min, max);
  let disabled = Boolean(options.disabled);

  // Root container: Single row containing the slider bar (with label inside) and the number input
  const root = document.createElement("div");
  root.className = "ds-ui-slider";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (disabled) root.dataset.disabled = "true";

  // Solid block bar element
  const bar = document.createElement("div");
  bar.className = "ds-ui-solid-bar";
  bar.tabIndex = disabled ? -1 : 0;
  bar.setAttribute("role", "slider");
  bar.setAttribute("aria-valuemin", String(min));
  bar.setAttribute("aria-valuemax", String(max));
  bar.setAttribute("aria-valuenow", String(current));

  const track = document.createElement("div");
  track.className = "ds-ui-solid-track";

  // Base label inside the track (rendered behind/underneath the advancing fill)
  let labelBase = null;
  let labelFill = null;

  if (options.label != null && String(options.label).trim().length > 0) {
    labelBase = document.createElement("span");
    labelBase.className = "ds-ui-slider-label ds-ui-slider-label-base";
    labelBase.textContent = options.label;
    track.appendChild(labelBase);
  }

  // Solid fill block
  const fill = document.createElement("div");
  fill.className = "ds-ui-solid-fill";

  // Contrasting label inside the fill block (clipped exactly to the fill width)
  if (options.label != null && String(options.label).trim().length > 0) {
    labelFill = document.createElement("span");
    labelFill.className = "ds-ui-slider-label ds-ui-slider-label-fill";
    labelFill.textContent = options.label;
    fill.appendChild(labelFill);
  }

  track.appendChild(fill);
  bar.appendChild(track);
  root.appendChild(bar);

  // Number input (Synchronized numeric box with identical height in the same row)
  let numInput = null;
  if (options.showNumber !== false) {
    numInput = document.createElement("input");
    numInput.type = "text";
    numInput.inputMode = "decimal";
    numInput.className = "ds-ui-slider-number";
    numInput.autocomplete = "off";
    numInput.spellcheck = false;
    numInput.disabled = disabled;
    numInput.value = formatPrecision(current, step);
    root.appendChild(numInput);
  }

  const isOneBased = min === 1 && max > 1;

  // Update visual fill percentage and values
  const updateVisuals = (val) => {
    let pct;
    if (isOneBased) {
      pct = Math.max(0, Math.min(100, (val / max) * 100));
    } else {
      const range = max - min;
      pct = range === 0 ? 0 : Math.max(0, Math.min(100, ((val - min) / range) * 100));
    }
    bar.style.setProperty("--p", `${pct}%`);
    bar.setAttribute("aria-valuenow", String(val));
    if (pct >= 99.9 || val >= max) {
      bar.dataset.full = "true";
      fill.dataset.full = "true";
    } else {
      delete bar.dataset.full;
      delete fill.dataset.full;
    }
    if (numInput) numInput.value = formatPrecision(val, step);
  };

  const emit = (val, source = "pointer") => {
    const cleanVal = Number(formatPrecision(val, step));
    current = cleanVal;
    updateVisuals(cleanVal);
    options.onChange?.(cleanVal, { source, slider: api });
  };

  // Convert client pointer position into clamped, stepped value
  const handlePointer = (e) => {
    if (disabled) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rawPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    let rawVal;
    if (isOneBased) {
      rawVal = rawPct * max;
      const stepped = Math.round(rawVal / step) * step;
      emit(clamp(stepped, min, max), "pointer");
    } else {
      rawVal = min + rawPct * (max - min);
      const stepped = Math.round((rawVal - min) / step) * step + min;
      emit(clamp(stepped, min, max), "pointer");
    }
  };

  let dragging = false;

  bar.addEventListener("pointerdown", (e) => {
    if (disabled || e.button !== 0) return;
    dragging = true;
    bar.setPointerCapture?.(e.pointerId);
    handlePointer(e);
  });

  bar.addEventListener("pointermove", (e) => {
    if (dragging) handlePointer(e);
  });

  const stopDrag = (e) => {
    if (dragging) {
      dragging = false;
      try { bar.releasePointerCapture?.(e.pointerId); } catch (_) { }
    }
  };
  bar.addEventListener("pointerup", stopDrag);
  bar.addEventListener("pointercancel", stopDrag);

  // Bi-directional numeric input event handling
  if (numInput) {
    const commitInput = () => {
      const parsed = parseFloat(numInput.value);
      const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : current;
      emit(next, "input");
      numInput.value = formatPrecision(next, step);
    };

    numInput.addEventListener("change", commitInput);
    numInput.addEventListener("blur", commitInput);
    numInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitInput();
        numInput.blur();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        emit(clamp(current + step, min, max), "keyboard");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        emit(clamp(current - step, min, max), "keyboard");
      }
    });
    numInput.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      numInput.focus();
      numInput.select();
      try {
        numInput.setSelectionRange(0, numInput.value.length);
      } catch (_) {}
    });
    numInput.addEventListener("focus", () => {
      setTimeout(() => {
        try {
          numInput.select();
          numInput.setSelectionRange(0, numInput.value.length);
        } catch (_) {}
      }, 10);
    });
    numInput.addEventListener("wheel", (e) => {
      e.preventDefault();
      emit(clamp(current + (e.deltaY < 0 ? step : -step), min, max), "wheel");
    }, { passive: false });
  }

  // Keyboard accessibility on slider bar
  bar.addEventListener("keydown", (e) => {
    if (disabled) return;
    let next = current;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = clamp(current - step, min, max);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = clamp(current + step, min, max);
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else if (e.key === "PageDown") next = clamp(current - step * 10, min, max);
    else if (e.key === "PageUp") next = clamp(current + step * 10, min, max);
    else return;

    e.preventDefault();
    emit(next, "keyboard");
  });

  updateVisuals(current);

  const api = {
    root,
    bar,
    track,
    fill,
    input: numInput,
    getValue: () => current,
    setValue(val, fire = false) {
      current = clamp(val, min, max);
      updateVisuals(current);
      if (fire) options.onChange?.(current, { source: "program", slider: api });
    },
    setLabel(text) {
      if (labelBase) labelBase.textContent = text ?? "";
      if (labelFill) labelFill.textContent = text ?? "";
    },
    setRange(newMin, newMax, newStep) {
      min = Number(newMin ?? min);
      max = Number(newMax ?? max);
      if (newStep != null) step = Number(newStep);
      current = clamp(current, min, max);
      bar.setAttribute("aria-valuemin", String(min));
      bar.setAttribute("aria-valuemax", String(max));
      updateVisuals(current);
    },
    setDisabled(state) {
      disabled = Boolean(state);
      root.dataset.disabled = disabled ? "true" : "false";
      if (numInput) numInput.disabled = disabled;
      bar.tabIndex = disabled ? -1 : 0;
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
