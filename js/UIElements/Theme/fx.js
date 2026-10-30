/**
 * DS Live Theme Effects — overlay builder.
 * Layer styling and animation live in ds_fx.css; a theme picks its layers
 * with the "fx" field in themes.json (e.g. "orbit breathe").
 */

const FX_LAYERS = [
  "ds-fx-ring",
  "ds-fx-glow",
  "ds-fx-glow ds-fx-glow-b",
  "ds-fx-edge t",
  "ds-fx-edge r",
  "ds-fx-edge b",
  "ds-fx-edge l",
  "ds-fx-band",
  "ds-fx-scan",
  "ds-fx-sheen",
  "ds-fx-motes",
];

export function createFxLayer() {
  const fx = document.createElement("div");
  fx.className = "ds-fx";
  fx.setAttribute("aria-hidden", "true");
  for (const cls of FX_LAYERS) {
    const layer = document.createElement("i");
    layer.className = cls;
    fx.appendChild(layer);
  }
  return fx;
}

export function setFx(fxEl, fx) {
  if (fx) fxEl.dataset.fx = fx;
  else delete fxEl.dataset.fx;
}

/** Put one effects overlay on top of a host element (idempotent). */
export function ensureFxLayer(host, fx) {
  let fxEl = host.querySelector(":scope > .ds-fx");
  if (!fxEl) {
    fxEl = createFxLayer();
    host.appendChild(fxEl);
  }
  setFx(fxEl, fx);
  return fxEl;
}
