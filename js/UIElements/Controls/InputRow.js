/**
 * DeathshotArsenal UI — InputRow Component
 * Boxed control-height row: optional label, a bare text input and trailing
 * compact action buttons (e.g. seed: value + randomize + mode).
 */

export function InputRow(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-input-row";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  if (options.label) {
    const label = document.createElement("span");
    label.className = "ds-ui-input-row-label";
    label.textContent = options.label;
    root.appendChild(label);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "ds-ui-input-row-field";
  input.spellcheck = false;
  input.autocomplete = "off";
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.mono) input.classList.add("is-mono");
  input.value = String(options.value ?? "");
  input.addEventListener("input", () => options.onInput?.(input.value, api));
  input.addEventListener("change", () => options.onChange?.(input.value, api));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  root.appendChild(input);

  const actions = document.createElement("span");
  actions.className = "ds-ui-input-row-actions";
  for (const action of options.actions || []) {
    actions.appendChild(action?.root ?? action);
  }
  if (actions.childElementCount) root.appendChild(actions);

  const api = {
    root,
    input,
    getValue: () => input.value,
    setValue(val) {
      input.value = String(val ?? "");
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
