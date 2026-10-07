/**
 * DeathshotArsenal UI — Toggle Component
 * Accessible soft-rectangle toggle switch with label and description.
 */

export function Toggle(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-toggle-row";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  let checked = Boolean(options.checked);
  let disabled = Boolean(options.disabled);

  const copy = document.createElement("div");
  copy.className = "ds-ui-toggle-copy";

  let labelEl = null;
  let descEl = null;

  if (options.label != null) {
    labelEl = document.createElement("span");
    labelEl.className = "ds-ui-toggle-label";
    labelEl.textContent = options.label;
    copy.appendChild(labelEl);
  }

  if (options.description) {
    descEl = document.createElement("span");
    descEl.className = "ds-ui-toggle-desc";
    descEl.textContent = options.description;
    copy.appendChild(descEl);
  }

  const track = document.createElement("div");
  track.className = "ds-ui-toggle-track";
  track.setAttribute("role", "switch");
  track.setAttribute("aria-checked", checked ? "true" : "false");
  track.tabIndex = disabled ? -1 : 0;

  const thumb = document.createElement("div");
  thumb.className = "ds-ui-toggle-thumb";
  track.appendChild(thumb);

  if (options.reverse) {
    root.append(track, copy);
  } else {
    root.append(copy, track);
  }

  const update = (fire = false) => {
    root.classList.toggle("is-on", checked);
    track.setAttribute("aria-checked", checked ? "true" : "false");
    if (fire) options.onChange?.(checked, api);
  };

  const toggle = () => {
    if (disabled) return;
    checked = !checked;
    update(true);
  };

  root.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  track.addEventListener("keydown", (e) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
  });

  update(false);

  const api = {
    root,
    track,
    toggle,
    getValue: () => checked,
    setValue(val, fire = false) {
      checked = Boolean(val);
      update(fire);
    },
    setDisabled(state) {
      disabled = Boolean(state);
      track.tabIndex = disabled ? -1 : 0;
      root.style.opacity = disabled ? "0.45" : "";
      root.style.pointerEvents = disabled ? "none" : "";
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
