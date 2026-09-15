import { calculatePreview } from "./outpaint_math.js";

function readSize(image) {
  if (!image) return [0, 0];
  const target = image?.img || image?.image || image;
  return [
    Number(target?.naturalWidth || target?.width || target?.videoWidth || 0),
    Number(target?.naturalHeight || target?.height || target?.videoHeight || 0),
  ];
}

export function createPreview(container, getState) {
  let canvas, empty, labels, resolution, resizeObserver;
  let image = null;
  let state = getState?.() || {};

  const make = (cls, text = "") => {
    const el = document.createElement("div");
    el.className = cls;
    if (text) el.textContent = text;
    return el;
  };

  function mount() {
    container.replaceChildren();
    canvas = document.createElement("canvas");
    canvas.className = "ds-op-canvas";
    empty = make("ds-op-empty");
    empty.append(make("ds-op-empty-title", "Connect an IMAGE input"), make("ds-op-empty-sub", "The outpaint canvas will appear here."));
    labels = {
      left: make("ds-op-measure"), top: make("ds-op-measure"), right: make("ds-op-measure"), bottom: make("ds-op-measure"),
    };
    resolution = make("ds-op-resolution");
    container.append(canvas, empty, labels.left, labels.top, labels.right, labels.bottom, resolution);
    resizeObserver = new ResizeObserver(() => render());
    resizeObserver.observe(container);
    render();
  }

  function render() {
    if (!canvas) return;
    state = getState?.() || state || {};
    const [iw, ih] = readSize(image);
    const hasImage = iw > 0 && ih > 0;
    empty.style.display = hasImage ? "none" : "flex";
    canvas.style.display = hasImage ? "block" : "none";
    resolution.style.display = hasImage ? "block" : "none";
    Object.values(labels).forEach((el) => { el.style.display = "none"; });
    if (!hasImage) return;

    // clientWidth/clientHeight are the untransformed layout size. The whole
    // Outpaint node overlay is scaled by the graph separately, so using the
    // layout size here prevents a second zoom from shrinking the preview.
    const cssW = Math.max(32, container.clientWidth);
    const cssH = Math.max(32, container.clientHeight);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    const dims = calculatePreview(state, iw, ih);
    if (!dims.safe) {
      canvas.style.display = "none";
      Object.values(labels).forEach((el) => { el.style.display = "none"; });
      empty.style.display = "flex";
      empty.querySelector(".ds-op-empty-title").textContent = "Output too large";
      empty.querySelector(".ds-op-empty-sub").textContent = `${dims.totalW} × ${dims.totalH} exceeds the safe canvas limit.`;
      resolution.style.display = "none";
      return;
    }
    empty.querySelector(".ds-op-empty-title").textContent = "Connect an IMAGE input";
    empty.querySelector(".ds-op-empty-sub").textContent = "The outpaint canvas will appear here.";
    const inset = 10;
    const scale = Math.min(
      Math.max(1, cssW - inset * 2) / Math.max(1, dims.totalW),
      Math.max(1, cssH - inset * 2) / Math.max(1, dims.totalH),
    );
    const drawW = dims.totalW * scale;
    const drawH = dims.totalH * scale;
    const ox = (cssW - drawW) / 2;
    const oy = (cssH - drawH) / 2;
    const imageW = Math.max(1, dims.totalW - dims.left - dims.right);
    const imageH = Math.max(1, dims.totalH - dims.top - dims.bottom);
    const imageX = ox + dims.left * scale;
    const imageY = oy + dims.top * scale;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(String(state.fill_color || "")) ? state.fill_color : "#808080";
    ctx.fillRect(ox, oy, drawW, drawH);
    const drawTarget = image?.img || image?.image || image;
    try { ctx.drawImage(drawTarget, imageX, imageY, imageW * scale, imageH * scale); } catch (_) {}

    const show = (key, x, y) => {
      const value = Number(dims[key]) || 0;
      if (value <= 0) return;
      const el = labels[key];
      el.textContent = `${Math.round(value)} px`;
      el.style.display = "flex";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    if (dims.left > 0) show("left", ox + dims.left * scale / 2, oy + drawH / 2);
    if (dims.right > 0) show("right", ox + drawW - dims.right * scale / 2, oy + drawH / 2);
    if (dims.top > 0) show("top", ox + drawW / 2, oy + dims.top * scale / 2);
    if (dims.bottom > 0) show("bottom", ox + drawW / 2, oy + drawH - dims.bottom * scale / 2);
    resolution.textContent = `${dims.totalW} × ${dims.totalH}`;
  }

  return {
    mount,
    setState(nextState, nextImage) {
      state = nextState || getState?.() || {};
      image = nextImage || null;
      render();
    },
    destroy() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      container.replaceChildren();
      canvas = empty = labels = resolution = null;
      image = null;
    },
  };
}
