// DeathshotArsenal/js/Load Images From Folder/resize_panel.js

export const RESIZE_MODES = [
  { id: "off", label: "Off (full size)" },
  { id: "max_mp", label: "Max megapixels (cap pixels)" },
  { id: "longest_side", label: "Longest side (cap long edge)" },
  { id: "scale_by", label: "Scale by (× factor)" },
  { id: "fit_inside", label: "Fit inside (W×H box)" },
  { id: "crop_to_fill", label: "Crop to fill (W×H exact)" },
  { id: "match_aspect_ratio", label: "Match aspect ratio (crop / pad)" },
  { id: "pad", label: "Pad (add borders)" },
];

export const RATIO_PRESETS = [
  { id: "1:1", w: 1, h: 1 },
  { id: "16:9", w: 16, h: 9 },
  { id: "9:16", w: 9, h: 16 },
  { id: "2:1", w: 2, h: 1 },
  { id: "3:2", w: 3, h: 2 },
  { id: "2:3", w: 2, h: 3 },
  { id: "4:3", w: 4, h: 3 },
  { id: "3:4", w: 3, h: 4 },
  { id: "4:5", w: 4, h: 5 },
  { id: "21:9", w: 21, h: 9 },
  { id: "5:4", w: 5, h: 4 },
  { id: "custom", w: 1, h: 1 },
];

export function computeOutputDimensions(origW, origH, config = {}) {
  const W = Number(origW) || 1024;
  const H = Number(origH) || 1024;
  const mode = config.mode || "off";

  if (mode === "off") {
    return { w: W, h: H };
  }

  if (mode === "max_mp") {
    const mp = Math.max(0.01, Number(config.max_mp || 1.0));
    const factor = Math.sqrt((mp * 1000000.0) / Math.max(1, W * H));
    return { w: Math.max(8, Math.round(W * factor)), h: Math.max(8, Math.round(H * factor)) };
  }

  if (mode === "longest_side") {
    const target = Math.max(8, Number(config.longest_side || 1024));
    const factor = target / Math.max(W, H);
    return { w: Math.max(8, Math.round(W * factor)), h: Math.max(8, Math.round(H * factor)) };
  }

  if (mode === "scale_by") {
    const f = Math.max(0.01, Number(config.scale_factor || 1.0));
    return { w: Math.max(8, Math.round(W * f)), h: Math.max(8, Math.round(H * f)) };
  }

  if (mode === "fit_inside") {
    const tw = Math.max(8, Number(config.fit_w || 1024));
    const th = Math.max(8, Number(config.fit_h || 1024));
    const f = Math.min(tw / W, th / H);
    return { w: Math.max(8, Math.round(W * f)), h: Math.max(8, Math.round(H * f)) };
  }

  if (mode === "crop_to_fill" || mode === "cover") {
    const tw = Math.max(8, Number(config.cover_w || 1024));
    const th = Math.max(8, Number(config.cover_h || 1024));
    return { w: tw, h: th };
  }

  if (mode === "match_aspect_ratio" || mode === "match_ratio") {
    const rw = Math.max(1, Number(config.ratio_w || 1));
    const rh = Math.max(1, Number(config.ratio_h || 1));
    const targetRatio = rw / rh;
    const curRatio = W / H;
    const action = String(config.ratio_action || "crop").toLowerCase();

    if (action === "crop") {
      if (curRatio > targetRatio) {
        return { w: Math.max(8, Math.round(H * targetRatio)), h: H };
      } else {
        return { w: W, h: Math.max(8, Math.round(W / targetRatio)) };
      }
    } else {
      // pad
      if (curRatio > targetRatio) {
        return { w: W, h: Math.max(8, Math.round(W / targetRatio)) };
      } else {
        return { w: Math.max(8, Math.round(H * targetRatio)), h: H };
      }
    }
  }

  if (mode === "pad") {
    const pl = Math.max(0, Number(config.pad_left || 0));
    const pr = Math.max(0, Number(config.pad_right || 0));
    const pt = Math.max(0, Number(config.pad_top || 0));
    const pb = Math.max(0, Number(config.pad_bottom || 0));
    return { w: W + pl + pr, h: H + pt + pb };
  }

  return { w: W, h: H };
}

function openColorPickerModal({ initialColor, onPick }) {
  document.querySelector(".ds-fl-color-modal")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "ds-fl-modal-backdrop ds-fl-color-modal";
  backdrop.innerHTML = `
    <div style="width:260px;background:var(--ds-panel,#151821);border:1px solid var(--ds-border,#303746);border-radius:8px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6);">
      <div style="font-weight:700;margin-bottom:8px;font-size:11px;">Padding Border Color</div>
      <input type="color" data-color style="width:100%;height:38px;padding:0;border:1px solid #333;background:transparent;border-radius:4px;cursor:pointer;" value="${initialColor || '#808080'}">
      <input type="text" data-hex style="width:100%;margin-top:8px;height:26px;border:1px solid var(--ds-border,#333);background:var(--ds-input-bg,#0d1017);color:var(--ds-text,#fff);border-radius:4px;text-align:center;font-size:10px;" value="${initialColor || '#808080'}">
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:10px;">
        <button data-cancel class="ds-fl-btn">Cancel</button>
        <button data-apply class="ds-fl-btn ds-fl-btn-primary">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const colorInput = backdrop.querySelector("[data-color]");
  const hexInput = backdrop.querySelector("[data-hex]");
  colorInput.addEventListener("input", () => hexInput.value = colorInput.value);
  hexInput.addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test(hexInput.value.trim())) {
      colorInput.value = hexInput.value.trim();
    }
  });

  const close = () => backdrop.remove();
  backdrop.querySelector("[data-cancel]").onclick = close;
  backdrop.querySelector("[data-apply]").onclick = () => {
    onPick?.(colorInput.value);
    close();
  };
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });
}

function createStepper(value, { min = 1, max = 16384, step = 1, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "ds-fl-stepper ds-fl-interactive";
  wrap.style.flex = "1";
  wrap.style.minWidth = "0";
  wrap.innerHTML = `
    <input type="text" class="ds-fl-stepper-val" value="${value}" style="flex:1;min-width:0;width:auto;text-align:left;padding:0 8px;">
    <div class="ds-fl-stepper-btns">
      <button class="ds-fl-step-btn" data-up>▲</button>
      <button class="ds-fl-step-btn" data-down>▼</button>
    </div>
  `;

  const input = wrap.querySelector(".ds-fl-stepper-val");
  const up = wrap.querySelector("[data-up]");
  const down = wrap.querySelector("[data-down]");

  const update = (newVal) => {
    const clamped = Math.max(min, Math.min(max, newVal));
    input.value = clamped;
    onChange?.(clamped);
  };

  up.onclick = (e) => {
    e.stopPropagation();
    const cur = parseFloat(input.value) || 0;
    update(cur + step);
  };

  down.onclick = (e) => {
    e.stopPropagation();
    const cur = parseFloat(input.value) || 0;
    update(cur - step);
  };

  input.onchange = () => {
    const cur = parseFloat(input.value) || 0;
    update(cur);
  };

  return { el: wrap, input, update };
}

export function renderResizePanel(container, config, onChange, currentDims = { w: 1024, h: 1024 }) {
  container.innerHTML = "";
  const mode = config.mode || "off";

  // Mode 1: Off
  if (mode === "off") {
    const d = document.createElement("div");
    d.style.cssText = "font-size:8.5px;color:var(--ds-text-muted,#8d95a1);padding:4px 0;";
    d.textContent = "Images are loaded in their original full size without resizing.";
    container.appendChild(d);
    return;
  }

  // Mode 2: Max megapixels
  if (mode === "max_mp") {
    const row = document.createElement("div");
    row.className = "ds-fl-row ds-fl-interactive";
    row.style.marginTop = "6px";
    row.innerHTML = `<span class="ds-fl-label" style="min-width:85px;">Max MP:</span>`;
    const stepper = createStepper(config.max_mp || 1.0, {
      min: 0.1, max: 64, step: 0.25,
      onChange: (val) => {
        config.max_mp = val;
        grid.querySelectorAll(".ds-fl-chip").forEach(c => {
          c.classList.toggle("active", parseFloat(c.textContent) === val);
        });
        onChange?.({ ...config, max_mp: val });
      }
    });
    row.appendChild(stepper.el);

    const presets = [0.25, 0.5, 1, 2, 4, 8];
    const grid = document.createElement("div");
    grid.className = "ds-fl-chip-grid ds-fl-interactive";
    for (const mp of presets) {
      const chip = document.createElement("button");
      chip.className = `ds-fl-chip ${Number(config.max_mp) === mp ? 'active' : ''}`;
      chip.textContent = `${mp} MP`;
      chip.onclick = (e) => {
        e.stopPropagation();
        grid.querySelectorAll(".ds-fl-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        config.max_mp = mp;
        stepper.update(mp);
      };
      grid.appendChild(chip);
    }
    container.appendChild(grid);
    container.appendChild(row);
    return;
  }

  // Mode 3: Longest side
  if (mode === "longest_side") {
    const row = document.createElement("div");
    row.className = "ds-fl-row ds-fl-interactive";
    row.style.marginTop = "6px";
    row.innerHTML = `<span class="ds-fl-label" style="min-width:85px;">Longest side:</span>`;
    const stepper = createStepper(config.longest_side || 1024, {
      min: 64, max: 16384, step: 64,
      onChange: (val) => {
        config.longest_side = val;
        grid.querySelectorAll(".ds-fl-chip").forEach(c => {
          c.classList.toggle("active", parseInt(c.textContent) === val);
        });
        onChange?.({ ...config, longest_side: val });
      }
    });
    row.appendChild(stepper.el);

    const presets = [512, 768, 1024, 1280, 1536, 2048];
    const grid = document.createElement("div");
    grid.className = "ds-fl-chip-grid ds-fl-interactive";
    for (const sz of presets) {
      const chip = document.createElement("button");
      chip.className = `ds-fl-chip ${Number(config.longest_side) === sz ? 'active' : ''}`;
      chip.textContent = `${sz}`;
      chip.onclick = (e) => {
        e.stopPropagation();
        grid.querySelectorAll(".ds-fl-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        config.longest_side = sz;
        stepper.update(sz);
      };
      grid.appendChild(chip);
    }
    container.appendChild(grid);
    container.appendChild(row);
    return;
  }

  // Mode 4: Scale by
  if (mode === "scale_by") {
    const row = document.createElement("div");
    row.className = "ds-fl-row ds-fl-interactive";
    row.style.marginTop = "6px";
    row.innerHTML = `<span class="ds-fl-label" style="min-width:85px;">Multiplier:</span>`;
    const stepper = createStepper(config.scale_factor || 1.0, {
      min: 0.1, max: 8.0, step: 0.1,
      onChange: (val) => {
        config.scale_factor = val;
        grid.querySelectorAll(".ds-fl-chip").forEach(c => {
          c.classList.toggle("active", parseFloat(c.textContent) === val);
        });
        onChange?.({ ...config, scale_factor: val });
      }
    });
    row.appendChild(stepper.el);

    const presets = [0.25, 0.5, 1, 2, 3, 4];
    const grid = document.createElement("div");
    grid.className = "ds-fl-chip-grid ds-fl-interactive";
    for (const sc of presets) {
      const chip = document.createElement("button");
      chip.className = `ds-fl-chip ${Number(config.scale_factor) === sc ? 'active' : ''}`;
      chip.textContent = `${sc}×`;
      chip.onclick = (e) => {
        e.stopPropagation();
        grid.querySelectorAll(".ds-fl-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        config.scale_factor = sc;
        stepper.update(sc);
      };
      grid.appendChild(chip);
    }
    container.appendChild(grid);
    container.appendChild(row);
    return;
  }

  // Mode 5 & Mode 6: Fit inside / Crop to fill
  if (mode === "fit_inside" || mode === "crop_to_fill" || mode === "cover") {
    const isFit = (mode === "fit_inside");
    const wKey = isFit ? "fit_w" : "cover_w";
    const hKey = isFit ? "fit_h" : "cover_h";
    const curW = config[wKey] || 1024;
    const curH = config[hKey] || 1024;

    const row = document.createElement("div");
    row.className = "ds-fl-wh-row ds-fl-interactive";

    const wBox = document.createElement("div");
    wBox.style.cssText = "display:flex;align-items:center;gap:4px;flex:1;min-width:0;";
    wBox.innerHTML = `<span class="ds-fl-label">W:</span>`;
    const stepW = createStepper(curW, {
      min: 64, max: 8192, step: 64,
      onChange: (v) => { config[wKey] = v; onChange?.({ ...config, [wKey]: v }); }
    });
    wBox.appendChild(stepW.el);

    const swapBtn = document.createElement("button");
    swapBtn.className = "ds-fl-btn";
    swapBtn.style.cssText = "min-width:26px;flex:0 0 26px;margin:0 2px;";
    swapBtn.textContent = "⇆";
    swapBtn.title = "Swap Width and Height";
    swapBtn.onclick = (e) => {
      e.stopPropagation();
      const temp = config[wKey] || 1024;
      config[wKey] = config[hKey] || 1024;
      config[hKey] = temp;
      onChange?.({ ...config });
    };

    const hBox = document.createElement("div");
    hBox.style.cssText = "display:flex;align-items:center;gap:4px;flex:1;min-width:0;";
    hBox.innerHTML = `<span class="ds-fl-label">H:</span>`;
    const stepH = createStepper(curH, {
      min: 64, max: 8192, step: 64,
      onChange: (v) => { config[hKey] = v; onChange?.({ ...config, [hKey]: v }); }
    });
    hBox.appendChild(stepH.el);

    row.append(wBox, swapBtn, hBox);
    container.appendChild(row);

    // Aspect ratio preview box
    const prevRow = document.createElement("div");
    prevRow.className = "ds-fl-wh-preview-box ds-fl-interactive";
    prevRow.style.marginTop = "6px";
    const rect = document.createElement("div");
    rect.className = "ds-fl-aspect-rect";
    const aspect = curW / curH;
    if (aspect >= 1) {
      rect.style.width = "48px";
      rect.style.height = `${Math.max(14, Math.round(48 / aspect))}px`;
    } else {
      rect.style.height = "36px";
      rect.style.width = `${Math.max(14, Math.round(36 * aspect))}px`;
    }
    const label = document.createElement("span");
    label.style.cssText = "font-size:8.5px;color:var(--ds-text-muted,#9ca3af);";
    label.textContent = `${curW} × ${curH} (${aspect >= 1 ? aspect.toFixed(2) + ':1' : '1:' + (1/aspect).toFixed(2)})`;
    prevRow.append(rect, label);
    container.appendChild(prevRow);
    return;
  }

  // Mode 7: Match aspect ratio
  if (mode === "match_aspect_ratio" || mode === "match_ratio") {
    const grid = document.createElement("div");
    grid.className = "ds-fl-interactive";
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:4px;";

    for (const item of RATIO_PRESETS) {
      const chip = document.createElement("button");
      chip.className = `ds-fl-chip ${config.ratio_preset === item.id ? 'active' : ''}`;
      chip.textContent = item.id;
      chip.onclick = (e) => {
        e.stopPropagation();
        grid.querySelectorAll(".ds-fl-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        config.ratio_preset = item.id;
        if (item.id !== "custom") {
          config.ratio_w = item.w;
          config.ratio_h = item.h;
        }
        onChange?.({ ...config });
      };
      grid.appendChild(chip);
    }
    container.appendChild(grid);

    // Custom Ratio Inputs
    if (config.ratio_preset === "custom") {
      const customRow = document.createElement("div");
      customRow.className = "ds-fl-row ds-fl-interactive";
      customRow.style.marginTop = "6px";
      customRow.innerHTML = `<span class="ds-fl-label">Custom Ratio:</span>`;
      const stepW = createStepper(config.ratio_w || 1, {
        min: 1, max: 100, step: 1,
        onChange: (v) => { config.ratio_w = v; onChange?.({ ...config, ratio_w: v }); }
      });
      const swap = document.createElement("button");
      swap.className = "ds-fl-btn";
      swap.textContent = "⇆";
      swap.onclick = (e) => {
        e.stopPropagation();
        const t = config.ratio_w || 1;
        config.ratio_w = config.ratio_h || 1;
        config.ratio_h = t;
        onChange?.({ ...config });
      };
      const stepH = createStepper(config.ratio_h || 1, {
        min: 1, max: 100, step: 1,
        onChange: (v) => { config.ratio_h = v; onChange?.({ ...config, ratio_h: v }); }
      });
      customRow.append(stepW.el, swap, stepH.el);
      container.appendChild(customRow);
    }

    // Sub-mode toggle: [ Crop | Pad ]
    const toggleRow = document.createElement("div");
    toggleRow.className = "ds-fl-row ds-fl-interactive";
    toggleRow.style.marginTop = "6px";
    toggleRow.innerHTML = `
      <div style="display:flex;border:1px solid var(--ds-border,#242a36);border-radius:5px;overflow:hidden;flex:1;">
        <button data-crop class="ds-fl-btn" style="flex:1;border:none;border-radius:0;${config.ratio_action !== 'pad' ? 'background:var(--ds-active,#253044);color:#fff;' : ''}">Crop</button>
        <button data-pad class="ds-fl-btn" style="flex:1;border:none;border-radius:0;${config.ratio_action === 'pad' ? 'background:var(--ds-active,#253044);color:#fff;' : ''}">Pad</button>
      </div>
    `;

    toggleRow.querySelector("[data-crop]").onclick = (e) => {
      e.stopPropagation();
      config.ratio_action = "crop";
      onChange?.({ ...config, ratio_action: "crop" });
    };

    toggleRow.querySelector("[data-pad]").onclick = (e) => {
      e.stopPropagation();
      config.ratio_action = "pad";
      onChange?.({ ...config, ratio_action: "pad" });
    };

    if (config.ratio_action === "pad") {
      const colorBtn = document.createElement("button");
      colorBtn.className = "ds-fl-color-btn";
      colorBtn.innerHTML = `<div class="ds-fl-color-swatch" style="background:${config.pad_color || '#808080'};"></div><span>Color</span>`;
      colorBtn.onclick = (e) => {
        e.stopPropagation();
        openColorPickerModal({
          initialColor: config.pad_color || "#808080",
          onPick: (c) => {
            config.pad_color = c;
            onChange?.({ ...config, pad_color: c });
          }
        });
      };
      toggleRow.appendChild(colorBtn);
    }

    container.appendChild(toggleRow);
    return;
  }

  // Mode 8: Pad
  if (mode === "pad") {
    const compass = document.createElement("div");
    compass.className = "ds-fl-compass ds-fl-interactive";

    // Top
    const topStep = createStepper(config.pad_top || 0, {
      min: 0, max: 4096, step: 16,
      onChange: (v) => { config.pad_top = v; onChange?.({ ...config, pad_top: v }); }
    });
    topStep.el.classList.add("ds-fl-compass-top");

    // Left
    const leftStep = createStepper(config.pad_left || 0, {
      min: 0, max: 4096, step: 16,
      onChange: (v) => { config.pad_left = v; onChange?.({ ...config, pad_left: v }); }
    });
    leftStep.el.classList.add("ds-fl-compass-left");

    // Center output size label
    const center = document.createElement("div");
    center.className = "ds-fl-compass-center";
    const outDims = computeOutputDimensions(currentDims.w, currentDims.h, config);
    center.innerHTML = `<span>OUTPUT SIZE</span><b style="color:var(--ds-text,#fff);font-size:9px;">${outDims.w} × ${outDims.h}</b>`;

    // Right
    const rightStep = createStepper(config.pad_right || 0, {
      min: 0, max: 4096, step: 16,
      onChange: (v) => { config.pad_right = v; onChange?.({ ...config, pad_right: v }); }
    });
    rightStep.el.classList.add("ds-fl-compass-right");

    // Bottom
    const bottomStep = createStepper(config.pad_bottom || 0, {
      min: 0, max: 4096, step: 16,
      onChange: (v) => { config.pad_bottom = v; onChange?.({ ...config, pad_bottom: v }); }
    });
    bottomStep.el.classList.add("ds-fl-compass-bottom");

    compass.append(topStep.el, leftStep.el, center, rightStep.el, bottomStep.el);
    container.appendChild(compass);

    // Compass bottom actions: Reset & Color picker
    const foot = document.createElement("div");
    foot.className = "ds-fl-compass-foot ds-fl-interactive";
    const resetBtn = document.createElement("button");
    resetBtn.className = "ds-fl-btn";
    resetBtn.textContent = "↺ RESET";
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      config.pad_top = 0;
      config.pad_bottom = 0;
      config.pad_left = 0;
      config.pad_right = 0;
      onChange?.({ ...config, pad_top: 0, pad_bottom: 0, pad_left: 0, pad_right: 0 });
    };

    const colorBtn = document.createElement("button");
    colorBtn.className = "ds-fl-color-btn";
    colorBtn.innerHTML = `<div class="ds-fl-color-swatch" style="background:${config.pad_color || '#808080'};"></div><span>■ COLOR</span>`;
    colorBtn.onclick = (e) => {
      e.stopPropagation();
      openColorPickerModal({
        initialColor: config.pad_color || "#808080",
        onPick: (c) => {
          config.pad_color = c;
          onChange?.({ ...config, pad_color: c });
        }
      });
    };

    foot.append(resetBtn, colorBtn);
    container.appendChild(foot);
  }
}
