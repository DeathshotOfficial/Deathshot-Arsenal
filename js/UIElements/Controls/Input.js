/**
 * DeathshotArsenal UI — Input Component
 * Single-line text input control styled with ds_ui theme variables.
 */

export function Input(options = {}) {
  const root = document.createElement("input");
  root.type = options.type || "text";
  root.className = "ds-ui-input";
  if (options.className) {
    root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  }

  if (options.placeholder) root.placeholder = options.placeholder;
  root.autocomplete = "off";
  root.spellcheck = false;

  let committedValue = String(options.value ?? "");
  root.value = committedValue;

  let disabled = Boolean(options.disabled);
  root.disabled = disabled;

  const commit = (fire = true) => {
    const val = root.value;
    if (val !== committedValue) {
      committedValue = val;
      if (fire) options.onChange?.(committedValue, api);
    }
  };

  const revert = () => {
    root.value = committedValue;
    options.onRevert?.(committedValue, api);
  };

  root.addEventListener("input", (e) => {
    options.onInput?.(root.value, api, e);
  });

  root.addEventListener("keydown", (e) => {
    if (disabled) return;
    if (e.key === "Enter") {
      e.stopPropagation();
      commit(true);
      root.blur();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      revert();
      root.blur();
    }
  });

  root.addEventListener("blur", () => {
    if (!disabled) commit(true);
  });

  const api = {
    root,
    getValue: () => root.value,
    setValue(val, fire = false) {
      committedValue = String(val ?? "");
      root.value = committedValue;
      if (fire) options.onChange?.(committedValue, api);
    },
    setDisabled(state) {
      disabled = Boolean(state);
      root.disabled = disabled;
    },
    setError(hasError) {
      if (hasError) {
        root.style.borderColor = "var(--ds-color-danger, #f87171)";
        root.style.boxShadow = "0 0 0 2px color-mix(in srgb, var(--ds-color-danger, #f87171) 25%, transparent)";
      } else {
        root.style.borderColor = "";
        root.style.boxShadow = "";
      }
    },
    commit,
    revert,
    destroy() {
      root.remove();
    },
  };

  return api;
}
