const ANCHORS = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

export function applyInlineLabel(panel, mode) {
  const labels = { max_mp: "Max MP", longest_side: "Longest side", scale_factor: "Scale ×" };
  const label = labels[mode];
  if (!label) return;
  panel.querySelector(".pix-li-panel-label")?.remove();
  const num = panel.querySelector(".pix-li-numinput");
  if (!num || num.querySelector(".ds-il-inline-label")) return;
  const lab = document.createElement("span");
  lab.className = "ds-il-inline-label";
  lab.textContent = label;
  num.insertBefore(lab, num.firstChild);
  num.classList.add("ds-il-num-labeled");
}

export function applyWHLayout(panel) {
  const fields = [...panel.querySelectorAll(".pix-li-wh-field")];
  fields.forEach((f, i) => {
    f.querySelector(".pix-li-wh-label")?.remove();
    const num = f.querySelector(".pix-li-numinput");
    if (num && !num.querySelector(".ds-il-inline-label")) {
      const lab = document.createElement("span");
      lab.className = "ds-il-inline-label";
      lab.textContent = i === 0 ? "W" : "H";
      num.insertBefore(lab, num.firstChild);
      num.classList.add("ds-il-num-labeled");
    }
  });
  panel.querySelector(".pix-li-wh-rect-label")?.remove();
  const row = panel.querySelector(".pix-li-wh-row");
  const swap = panel.querySelector(".pix-li-swap");
  const preview = panel.querySelector(".pix-li-wh-preview");
  if (row && fields.length === 2 && preview && !panel.querySelector(".ds-il-wh-grid")) {
    const grid = document.createElement("div");
    grid.className = "ds-il-wh-grid";
    const col = document.createElement("div");
    col.className = "ds-il-wh-col";
    col.append(fields[0], fields[1]);
    if (swap) col.append(swap);
    grid.append(col, preview);
    row.replaceWith(grid);
  }
}

export function applyCoverControls(node, panel, readState, writeState, onChange) {
  const swap = panel.querySelector(".pix-li-swap");
  if (swap && !panel.querySelector(".ds-il-fillcrop")) {
    const row = document.createElement("div");
    row.className = "ds-il-swaprow";
    const toggle = document.createElement("div");
    toggle.className = "ds-il-fillcrop";
    const fill = document.createElement("div"); fill.textContent = "Fill"; fill.title = "Scale to fill exactly, then crop overflow"; fill.dataset.cropScale = "1";
    const crop = document.createElement("div"); crop.textContent = "Crop"; crop.title = "Crop without scaling"; crop.dataset.cropScale = "0";
    toggle.append(fill, crop);
    row.append(swap, toggle);
    swap.replaceWith(row);
    const refresh = () => {
      const state = readState(node);
      const on = state.crop_scale !== false;
      fill.classList.toggle("active", on);
      crop.classList.toggle("active", !on);
    };
    toggle.addEventListener("click", e => {
      const opt = e.target.closest("[data-crop-scale]");
      if (!opt) return;
      e.stopPropagation();
      writeState(node, { ...readState(node), crop_scale: opt.dataset.cropScale === "1" });
      refresh();
      onChange?.();
    });
    refresh();
  }

  const preview = panel.querySelector(".pix-li-wh-preview");
  if (preview && !panel.querySelector(".ds-il-anchor")) {
    const grid = document.createElement("div");
    grid.className = "ds-il-anchor";
    grid.title = "Crop anchor — choose which part of the image is kept";
    const current = readState(node).crop_anchor || "center";
    for (const a of ANCHORS) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ds-il-anchor-cell" + (a === current ? " active" : "");
      cell.dataset.anchor = a;
      cell.title = a.replace("-", " ");
      grid.appendChild(cell);
    }
    preview.replaceWith(grid);
    grid.addEventListener("click", e => {
      const cell = e.target.closest(".ds-il-anchor-cell");
      if (!cell) return;
      e.stopPropagation();
      writeState(node, { ...readState(node), crop_anchor: cell.dataset.anchor });
      for (const c of grid.children) c.classList.toggle("active", c === cell);
      onChange?.();
    });
  }
}
