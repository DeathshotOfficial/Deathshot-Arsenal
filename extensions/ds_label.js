// Deathshot Arsenal — DS Label Canvas Entity & Modal Editor
//
// Lightweight, slotless canvas annotation entity with rich typography,
// custom 2D Sat/Val + Hue color pickers, Google & local font auto-fetching,
// non-native steppers with continuous hold, live preview, and full persistence.

import { app } from "/scripts/app.js";

const EXTENSION_NAME = "DeathshotArsenal.DSLabel";
const NODE_TYPE = "DS_Label";

const DEFAULT_LABEL_PROPS = {
  text: "Label Deathshot",
  fontFamily: "Inter",
  fontSize: 32,
  bold: false,
  italic: false,
  underline: false,
  textAlign: "center",
  textColor: "#ffffff",
  backgroundColor: "#333333",
  isTransparent: false,
  padding: 12,
  borderRadius: 16,
  opacity: 1.0,
  lineHeight: 1.2,
};

// Popular Google Fonts Catalog + Standard System Fonts
const CURATED_FONTS = [
  // Clean Sans-Serif
  { name: "Inter", category: "Google Font" },
  { name: "Roboto", category: "Google Font" },
  { name: "Poppins", category: "Google Font" },
  { name: "Montserrat", category: "Google Font" },
  { name: "Open Sans", category: "Google Font" },
  { name: "Lato", category: "Google Font" },
  { name: "Raleway", category: "Google Font" },
  { name: "Ubuntu", category: "Google Font" },
  { name: "Outfit", category: "Google Font" },
  { name: "Nunito", category: "Google Font" },
  { name: "Rubik", category: "Google Font" },
  // Display & Bold
  { name: "Bebas Neue", category: "Google Font" },
  { name: "Oswald", category: "Google Font" },
  { name: "Space Grotesk", category: "Google Font" },
  { name: "Syne", category: "Google Font" },
  { name: "Archivo", category: "Google Font" },
  // Monospace
  { name: "Fira Code", category: "Google Font" },
  { name: "JetBrains Mono", category: "Google Font" },
  { name: "Source Code Pro", category: "Google Font" },
  // Serif
  { name: "Playfair Display", category: "Google Font" },
  { name: "Merriweather", category: "Google Font" },
  // System / Local
  { name: "Arial", category: "System" },
  { name: "Helvetica", category: "System" },
  { name: "Segoe UI", category: "System" },
  { name: "SF Pro Display", category: "System" },
  { name: "Consolas", category: "System" },
  { name: "Courier New", category: "System" },
  { name: "Georgia", category: "System" },
  { name: "Impact", category: "System" },
  { name: "Times New Roman", category: "System" },
  { name: "Trebuchet MS", category: "System" },
  { name: "Verdana", category: "System" },
];

const loadedGoogleFonts = new Set(["Inter", "Arial", "sans-serif"]);

// Dynamically load Google Font on demand without reloading page
function loadWebFont(fontFamily) {
  if (!fontFamily || loadedGoogleFonts.has(fontFamily)) return;
  const isGoogle = CURATED_FONTS.some((f) => f.name === fontFamily && f.category === "Google Font");
  if (!isGoogle) return;

  try {
    const linkId = `ds-font-${fontFamily.replace(/\s+/g, "-").toLowerCase()}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
      document.head.appendChild(link);
      loadedGoogleFonts.add(fontFamily);
    }
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`16px "${fontFamily}"`).catch(() => {});
    }
  } catch (err) {
    console.warn("[DSLabel] Could not load web font:", fontFamily, err);
  }
}

// Color conversion helpers
function hexToRgb(hex) {
  let c = (hex || "").replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length >= 6) {
    return {
      r: parseInt(c.slice(0, 2), 16) || 0,
      g: parseInt(c.slice(2, 4), 16) || 0,
      b: parseInt(c.slice(4, 6), 16) || 0,
    };
  }
  return { r: 51, g: 51, b: 51 };
}

function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s, v: v };
}

function hsvToRgb(h, s, v) {
  h = (h % 360 + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;

  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function dirty(graph) {
  try { graph?.setDirtyCanvas?.(true, true); } catch (_) {}
  try { app?.canvas?.setDirty?.(true, true); } catch (_) {}
}

// -----------------------------------------------------------------------------
// DS_Label LiteGraph Node Definition
// -----------------------------------------------------------------------------
function registerDSLabelNodeType() {
  const LiteGraph = globalThis.LiteGraph;
  if (!LiteGraph || !LiteGraph.LGraphNode) return null;

  class DSLabelNode extends LiteGraph.LGraphNode {
    static title_mode = 1;
    static color = "transparent";
    static bgcolor = "transparent";
    static boxcolor = "transparent";
    static isVirtualNode = true;
    static comfyClass = NODE_TYPE;

    constructor() {
      super();
      this.isVirtualNode = true;
      this.comfyClass = NODE_TYPE;
      this.type = NODE_TYPE;
      this.title = "";
      this.title_mode = 1;
      this._dsNodeBaseOptOut = true;
      this.color = "transparent";
      this.bgcolor = "transparent";
      this.boxcolor = "transparent";
      this.size = [280, 80];
      this.inputs = [];
      this.outputs = [];
      this.resizable = true;
      this.flags = { allow_interaction: true, no_title: true };
      this.properties = { ...DEFAULT_LABEL_PROPS };
    }

    get title_mode() { return 1; }
    set title_mode(_) {}

    get renderingColor() { return "transparent"; }
    get renderingBgColor() { return "transparent"; }

    onDrawTitleBar() { return true; }
    drawTitleBarBackground() { return true; }
    onDrawTitleText() { return true; }
    drawTitleText() { return true; }

    snapToGrid(snap) {
      if (!snap || !this.pos) return false;
      this.pos[0] = snap * Math.round(this.pos[0] / snap);
      this.pos[1] = snap * Math.round(this.pos[1] / snap);
      return true;
    }

    onDblClick(event, pos, canvas) {
      openDSLabelModal(this);
      return true;
    }

    onDrawBackground(ctx, canvas) {
      if (this.flags?.collapsed) return;

      const [w, h] = this.size;
      const props = this.properties || {};
      const radius = Math.min(Number(props.borderRadius ?? 16), w / 2, h / 2);
      const opacity = Math.max(0, Math.min(1, Number(props.opacity ?? 1)));

      // Draw background card
      if (!props.isTransparent) {
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(0, 0, w, h, radius);
        } else {
          ctx.rect(0, 0, w, h);
        }
        ctx.fillStyle = props.backgroundColor || "#333333";
        ctx.globalAlpha = opacity;
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        ctx.fill();
        ctx.restore();
      }

      // Selection border indicator
      if (this.is_selected) {
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(0, 0, w, h, radius);
        } else {
          ctx.rect(0, 0, w, h);
        }
        const accent = window.DSGlobalTheme?.getVar?.("--ds-accent", "#67e8f9") || "#67e8f9";
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();

        // Resize handle indicator at bottom-right corner
        ctx.beginPath();
        ctx.arc(w - 6, h - 6, 4, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.restore();
      }
    }

    onDrawForeground(ctx, canvas) {
      if (this.flags?.collapsed) return;

      const [w, h] = this.size;
      const props = this.properties || {};
      const pad = Math.max(0, Number(props.padding ?? 12));
      const fs = Math.max(8, Number(props.fontSize ?? 32));
      const bold = props.bold ? "bold " : "";
      const italic = props.italic ? "italic " : "";
      const font = props.fontFamily || "Inter";
      const opacity = Math.max(0, Math.min(1, Number(props.opacity ?? 1)));
      const lineHeight = Math.max(0.8, Number(props.lineHeight ?? 1.2));
      const align = props.textAlign || "center";

      const text = String(props.text ?? "");
      if (!text) return;

      const lines = text.split("\n");
      const lineSpacing = fs * lineHeight;
      const totalTextH = lines.length * lineSpacing;

      ctx.save();
      ctx.font = `${italic}${bold}${fs}px "${font}", system-ui, sans-serif`;
      ctx.fillStyle = props.textColor || "#ffffff";
      ctx.globalAlpha = opacity;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";

      let curY = h / 2 - ((lines.length - 1) * lineSpacing) / 2;

      let targetX = w / 2;
      if (align === "left") targetX = pad;
      else if (align === "right") targetX = w - pad;

      for (const line of lines) {
        ctx.fillText(line, targetX, curY);

        if (props.underline && line.length > 0) {
          const metrics = ctx.measureText(line);
          let startX = targetX;
          if (align === "center") startX = targetX - metrics.width / 2;
          else if (align === "right") startX = targetX - metrics.width;

          ctx.lineWidth = Math.max(1, fs / 16);
          ctx.strokeStyle = props.textColor || "#ffffff";
          ctx.beginPath();
          const underY = curY + fs * 0.45;
          ctx.moveTo(startX, underY);
          ctx.lineTo(startX + metrics.width, underY);
          ctx.stroke();
        }

        curY += lineSpacing;
      }

      ctx.restore();
    }

    serialize() {
      const data = super.serialize ? super.serialize() : LiteGraph.LGraphNode.prototype.serialize.call(this);
      data.properties = { ...this.properties };
      return data;
    }

    configure(data) {
      if (super.configure) {
        super.configure(data);
      } else {
        LiteGraph.LGraphNode.prototype.configure.call(this, data);
      }
      this.isVirtualNode = true;
      this.comfyClass = NODE_TYPE;
      this.type = NODE_TYPE;
      this.title = "";
      this.title_mode = 1;
      this._dsNodeBaseOptOut = true;
      this.color = "transparent";
      this.bgcolor = "transparent";
      this.boxcolor = "transparent";
      if (data.properties) {
        this.properties = { ...DEFAULT_LABEL_PROPS, ...data.properties };
        if (this.properties.fontFamily) loadWebFont(this.properties.fontFamily);
      }
    }
  }

  DSLabelNode.title = "DS Label";
  DSLabelNode.desc = "Aesthetic slotless canvas annotation entity";
  DSLabelNode.type = NODE_TYPE;
  DSLabelNode.comfyClass = NODE_TYPE;
  DSLabelNode.isVirtualNode = true;
  DSLabelNode.prototype.comfyClass = NODE_TYPE;
  DSLabelNode.prototype.isVirtualNode = true;
  DSLabelNode.title_mode = 1;
  DSLabelNode.color = "transparent";
  DSLabelNode.bgcolor = "transparent";
  DSLabelNode.boxcolor = "transparent";

  LiteGraph.registerNodeType(NODE_TYPE, DSLabelNode);
  return DSLabelNode;
}

// -----------------------------------------------------------------------------
// Continuous-Hold Numeric Stepper Helper (Strictly Non-Native)
// -----------------------------------------------------------------------------
function createStepperControl({ min, max, step, value, onChange, formatFn }) {
  const wrap = document.createElement("div");
  wrap.className = "ds-stepper-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "ds-stepper-input";
  input.inputMode = "decimal";

  const btnCol = document.createElement("div");
  btnCol.className = "ds-stepper-buttons";

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "ds-stepper-btn ds-stepper-up";
  upBtn.setAttribute("tabindex", "-1");
  upBtn.innerHTML = `<svg viewBox="0 0 12 12" width="9" height="9"><path d="M2 8 L6 4 L10 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "ds-stepper-btn ds-stepper-down";
  downBtn.setAttribute("tabindex", "-1");
  downBtn.innerHTML = `<svg viewBox="0 0 12 12" width="9" height="9"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  btnCol.append(upBtn, downBtn);
  wrap.append(input, btnCol);

  let cur = Number(value);

  const syncDisplay = (v) => {
    input.value = formatFn ? formatFn(v) : String(v);
  };

  const update = (v, fire = true) => {
    let next = Number(v);
    if (isNaN(next)) next = min;
    next = Math.max(min, Math.min(max, next));
    if (step < 1) {
      const decimals = (String(step).split(".")[1] || "").length;
      next = Number(next.toFixed(decimals));
    } else {
      next = Math.round(next);
    }
    cur = next;
    syncDisplay(cur);
    if (fire) onChange?.(cur);
  };

  input.addEventListener("change", () => update(parseFloat(input.value) || cur));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); update(cur + step); }
    if (e.key === "ArrowDown") { e.preventDefault(); update(cur - step); }
    if (e.key === "Enter") { input.blur(); }
  });

  // Continuous hold logic
  const attachHold = (btn, delta) => {
    let timer = null;
    let repeat = null;

    const stop = () => {
      clearTimeout(timer);
      clearInterval(repeat);
    };

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      update(cur + delta);
      timer = setTimeout(() => {
        repeat = setInterval(() => update(cur + delta), 45);
      }, 260);
    });

    btn.addEventListener("mouseup", stop);
    btn.addEventListener("mouseleave", stop);
  };

  attachHold(upBtn, step);
  attachHold(downBtn, -step);

  syncDisplay(cur);

  return {
    root: wrap,
    input,
    getValue: () => cur,
    setValue: (v, fire = false) => update(v, fire),
  };
}

// -----------------------------------------------------------------------------
// 2D Canvas Color Picker Engine (Sat/Val Box, Hue Slider, 4x9 Swatch Grid)
// -----------------------------------------------------------------------------
const SWATCHES_4X9 = [
  // Row 1: Neutrals / Monochromes
  ["#ffffff", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#1f2937", "#000000"],
  // Row 2: Primaries & Vibrant
  ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899"],
  // Row 3: Soft Pastels
  ["#fca5a5", "#fdba74", "#fcd34d", "#6ee7b7", "#67e8f9", "#93c5fd", "#a5b4fc", "#c4b5fd", "#f472b6"],
  // Row 4: Deep Tones
  ["#7f1d1d", "#7c2d12", "#78350f", "#064e3b", "#164e63", "#1e3a8a", "#312e81", "#4c1d95", "#831843"],
];

function createColorEngine({ initialColor, onColorChange, showTransparentToggle, isTransparent, onTransparentToggle }) {
  const root = document.createElement("div");
  root.className = "ds-color-engine";

  let rgb = hexToRgb(initialColor || "#ffffff");
  let hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  let transparentState = Boolean(isTransparent);

  const topRow = document.createElement("div");
  topRow.className = "ds-color-top-row";

  // Left Sub-Panel: 2D Sat/Val box + Hue Bar
  const pickerLeft = document.createElement("div");
  pickerLeft.className = "ds-color-picker-left";

  const satValWrap = document.createElement("div");
  satValWrap.className = "ds-satval-wrap";
  const satValCanvas = document.createElement("canvas");
  satValCanvas.className = "ds-satval-canvas";
  satValCanvas.width = 160;
  satValCanvas.height = 110;
  const satValReticle = document.createElement("div");
  satValReticle.className = "ds-satval-reticle";
  satValWrap.append(satValCanvas, satValReticle);

  const hueWrap = document.createElement("div");
  hueWrap.className = "ds-hue-wrap";
  const hueBar = document.createElement("div");
  hueBar.className = "ds-hue-bar";
  const hueScrub = document.createElement("div");
  hueScrub.className = "ds-hue-scrub";
  hueWrap.append(hueBar, hueScrub);

  pickerLeft.append(satValWrap, hueWrap);

  // Right Sub-Panel: 4x9 Swatch Grid
  const pickerRight = document.createElement("div");
  pickerRight.className = "ds-color-picker-right";

  const swatchGrid = document.createElement("div");
  swatchGrid.className = "ds-swatch-grid-4x9";

  for (const row of SWATCHES_4X9) {
    for (const hex of row) {
      const cell = document.createElement("div");
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.className = "ds-swatch-cell";
      cell.style.setProperty("background-color", hex, "important");
      cell.style.setProperty("background", hex, "important");
      cell.setAttribute("title", hex.toUpperCase());
      cell.addEventListener("click", () => {
        applyColor(hex, true);
      });
      swatchGrid.appendChild(cell);
    }
  }
  pickerRight.appendChild(swatchGrid);

  topRow.append(pickerLeft, pickerRight);

  // Bottom Controls Row
  const bottomRow = document.createElement("div");
  bottomRow.className = "ds-color-bottom-row";

  const activeSwatch = document.createElement("div");
  activeSwatch.className = "ds-active-swatch";

  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "ds-hex-input";
  hexInput.maxLength = 9;

  bottomRow.append(activeSwatch, hexInput);

  let transBtn = null;
  if (showTransparentToggle) {
    transBtn = document.createElement("button");
    transBtn.type = "button";
    transBtn.className = "ds-transparent-btn";
    if (transparentState) transBtn.classList.add("is-active");
    transBtn.innerHTML = `
      <span class="ds-checkered-icon"></span>
      <span>Transparent</span>
    `;
    transBtn.addEventListener("click", () => {
      transparentState = !transparentState;
      transBtn.classList.toggle("is-active", transparentState);
      onTransparentToggle?.(transparentState);
    });
    bottomRow.appendChild(transBtn);
  }

  root.append(topRow, bottomRow);

  // Drawing Sat/Val Canvas
  const ctx = satValCanvas.getContext("2d");

  const renderSatVal = () => {
    const w = satValCanvas.width;
    const h = satValCanvas.height;

    // Base Hue
    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, h);

    // Horizontal White Gradient
    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, "rgba(255,255,255,1)");
    whiteGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, w, h);

    // Vertical Black Gradient
    const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, "rgba(0,0,0,0)");
    blackGrad.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, w, h);
  };

  const syncUI = (fire = true) => {
    renderSatVal();

    // Position Reticle
    const rx = hsv.s * satValCanvas.clientWidth;
    const ry = (1 - hsv.v) * satValCanvas.clientHeight;
    satValReticle.style.left = `${rx}px`;
    satValReticle.style.top = `${ry}px`;

    // Position Hue Scrub
    const hy = (hsv.h / 360) * hueBar.clientHeight;
    hueScrub.style.top = `${hy}px`;

    // Compute Hex
    const curRgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const hex = rgbToHex(curRgb.r, curRgb.g, curRgb.b);
    activeSwatch.style.setProperty("background-color", hex, "important");
    activeSwatch.style.setProperty("background", hex, "important");
    hexInput.value = hex.toUpperCase();

    if (fire) onColorChange?.(hex);
  };

  const applyColor = (hex, fire = true) => {
    const parsed = hexToRgb(hex);
    rgb = parsed;
    hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
    syncUI(fire);
  };

  // Dragging Sat/Val Reticle
  let isDraggingSatVal = false;
  const updateSatValFromMouse = (e) => {
    const rect = satValWrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    hsv.s = x / rect.width;
    hsv.v = 1 - (y / rect.height);
    syncUI(true);
  };

  satValWrap.addEventListener("pointerdown", (e) => {
    isDraggingSatVal = true;
    satValWrap.setPointerCapture(e.pointerId);
    updateSatValFromMouse(e);
  });
  satValWrap.addEventListener("pointermove", (e) => {
    if (isDraggingSatVal) updateSatValFromMouse(e);
  });
  satValWrap.addEventListener("pointerup", (e) => {
    isDraggingSatVal = false;
    try { satValWrap.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  // Dragging Hue Scrub
  let isDraggingHue = false;
  const updateHueFromMouse = (e) => {
    const rect = hueBar.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    hsv.h = (y / rect.height) * 360;
    syncUI(true);
  };

  hueWrap.addEventListener("pointerdown", (e) => {
    isDraggingHue = true;
    hueWrap.setPointerCapture(e.pointerId);
    updateHueFromMouse(e);
  });
  hueWrap.addEventListener("pointermove", (e) => {
    if (isDraggingHue) updateHueFromMouse(e);
  });
  hueWrap.addEventListener("pointerup", (e) => {
    isDraggingHue = false;
    try { hueWrap.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  hexInput.addEventListener("change", () => {
    let val = hexInput.value.trim();
    if (!val.startsWith("#")) val = `#${val}`;
    if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
      applyColor(val, true);
    } else {
      syncUI(false);
    }
  });

  requestAnimationFrame(() => syncUI(false));

  return {
    root,
    setColor: (hex) => applyColor(hex, false),
    setTransparent: (trans) => {
      transparentState = Boolean(trans);
      transBtn?.classList.toggle("is-active", transparentState);
    },
  };
}

// -----------------------------------------------------------------------------
// Custom Searchable Font Select Component (Strictly Non-Native)
// -----------------------------------------------------------------------------
function createSearchableFontSelect({ selectedFont, onSelect }) {
  const root = document.createElement("div");
  root.className = "ds-font-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ds-font-select-trigger";
  trigger.innerHTML = `
    <span class="ds-font-select-name">${selectedFont || "Inter"}</span>
    <svg viewBox="0 0 12 12" width="10" height="10" class="ds-chevron-icon"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  `;

  const dropdown = document.createElement("div");
  dropdown.className = "ds-font-dropdown";

  const searchBox = document.createElement("div");
  searchBox.className = "ds-font-search-box";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "ds-font-search-input";
  searchInput.placeholder = "Search fonts...";
  searchBox.appendChild(searchInput);

  const list = document.createElement("div");
  list.className = "ds-font-list";

  dropdown.append(searchBox, list);
  root.append(trigger, dropdown);

  let currentFont = selectedFont || "Inter";
  let allFonts = [...CURATED_FONTS];

  // Attempt to query local system fonts if browser supports API
  if (typeof window.queryLocalFonts === "function") {
    window.queryLocalFonts().then((fonts) => {
      const names = new Set(allFonts.map((f) => f.name.toLowerCase()));
      for (const f of fonts) {
        if (!names.has(f.family.toLowerCase())) {
          names.add(f.family.toLowerCase());
          allFonts.push({ name: f.family, category: "Local System" });
        }
      }
      populateList(searchInput.value);
    }).catch(() => {});
  }

  const populateList = (filterText = "") => {
    list.innerHTML = "";
    const term = filterText.toLowerCase().trim();
    const filtered = allFonts.filter((f) => !term || f.name.toLowerCase().includes(term));

    for (const fontItem of filtered) {
      const item = document.createElement("div");
      item.className = "ds-font-item";
      if (fontItem.name === currentFont) item.classList.add("is-selected");

      const nameSpan = document.createElement("span");
      nameSpan.className = "ds-font-item-name";
      nameSpan.textContent = fontItem.name;
      nameSpan.style.fontFamily = `"${fontItem.name}", system-ui, sans-serif`;

      const badge = document.createElement("span");
      badge.className = "ds-font-item-badge";
      badge.textContent = fontItem.category;

      item.append(nameSpan, badge);

      item.addEventListener("click", () => {
        currentFont = fontItem.name;
        trigger.querySelector(".ds-font-select-name").textContent = currentFont;
        dropdown.classList.remove("is-open");
        loadWebFont(currentFont);
        onSelect?.(currentFont);
      });

      list.appendChild(item);
    }
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle("is-open");
    if (open) {
      searchInput.value = "";
      populateList("");
      searchInput.focus();
    }
  });

  searchInput.addEventListener("input", () => {
    populateList(searchInput.value);
  });

  const onDocClick = (e) => {
    if (!root.contains(e.target)) dropdown.classList.remove("is-open");
  };
  document.addEventListener("pointerdown", onDocClick);

  populateList("");

  return {
    root,
    getValue: () => currentFont,
    setValue: (font) => {
      currentFont = font;
      trigger.querySelector(".ds-font-select-name").textContent = currentFont;
      loadWebFont(font);
    },
    destroy: () => {
      document.removeEventListener("pointerdown", onDocClick);
    },
  };
}

// -----------------------------------------------------------------------------
// DS Label Editor Modal (The 7 Sections)
// -----------------------------------------------------------------------------
let activeModal = null;

function openDSLabelModal(node) {
  if (activeModal) activeModal.close();

  const draft = { ...DEFAULT_LABEL_PROPS, ...(node.properties || {}) };

  const overlay = document.createElement("div");
  overlay.className = "ds-label-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "ds-label-modal ds-label-root";
  modal.dataset.dsThemed = "true";
  try { window.DSGlobalTheme?.applyToElement?.(modal); } catch (_) {}
  const unsubTheme = window.DSGlobalTheme?.subscribe?.(() => {
    try { window.DSGlobalTheme?.applyToElement?.(modal); } catch (_) {}
  });

  // Header
  const header = document.createElement("div");
  header.className = "ds-modal-header";
  header.innerHTML = `
    <span class="ds-modal-title">DS Label Configuration</span>
    <button type="button" class="ds-modal-close" aria-label="Close">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  // Body container (scrollable with custom scrollbars)
  const body = document.createElement("div");
  body.className = "ds-modal-body";

  // Section 1: Scalable Textarea Field
  const sec1 = document.createElement("div");
  sec1.className = "ds-modal-section ds-section-text";
  const textarea = document.createElement("textarea");
  textarea.className = "ds-label-textarea ds-ui-textarea";
  textarea.placeholder = "Enter label text here...";
  textarea.value = draft.text;
  textarea.rows = 2;
  sec1.appendChild(textarea);

  // Section 2: Live Preview Area (Over checkered background)
  const sec2 = document.createElement("div");
  sec2.className = "ds-modal-section ds-section-preview";
  const previewOuter = document.createElement("div");
  previewOuter.className = "ds-preview-stage";
  const previewLabel = document.createElement("div");
  previewLabel.className = "ds-preview-card";
  previewOuter.appendChild(previewLabel);
  sec2.appendChild(previewOuter);

  // Function to live-update preview card
  const updatePreview = () => {
    previewLabel.textContent = draft.text || "Label Preview";
    previewLabel.style.fontFamily = `"${draft.fontFamily}", system-ui, sans-serif`;
    previewLabel.style.fontSize = `${draft.fontSize}px`;
    previewLabel.style.fontWeight = draft.bold ? "bold" : "normal";
    previewLabel.style.fontStyle = draft.italic ? "italic" : "normal";
    previewLabel.style.textDecoration = draft.underline ? "underline" : "none";
    previewLabel.style.textAlign = draft.textAlign;
    previewLabel.style.color = draft.textColor;
    previewLabel.style.backgroundColor = draft.isTransparent ? "transparent" : draft.backgroundColor;
    previewLabel.style.padding = `${draft.padding}px`;
    previewLabel.style.borderRadius = `${draft.borderRadius}px`;
    previewLabel.style.opacity = draft.opacity;
    previewLabel.style.lineHeight = draft.lineHeight;
    previewLabel.style.whiteSpace = "pre-wrap";
  };

  textarea.addEventListener("input", () => {
    draft.text = textarea.value;
    updatePreview();
  });

  // Section 3: Typography & Alignment Controls Row
  const sec3 = document.createElement("div");
  sec3.className = "ds-modal-section ds-section-typography";

  const fontSelect = createSearchableFontSelect({
    selectedFont: draft.fontFamily,
    onSelect: (font) => {
      draft.fontFamily = font;
      updatePreview();
    },
  });

  // Style Toggles Segmented Group: B, I, U
  const styleGroup = document.createElement("div");
  styleGroup.className = "ds-segmented-group ds-style-toggles";

  const btnB = document.createElement("button");
  btnB.type = "button";
  btnB.className = "ds-seg-btn ds-btn-bold";
  btnB.textContent = "B";
  if (draft.bold) btnB.classList.add("is-active");
  btnB.addEventListener("click", () => {
    draft.bold = !draft.bold;
    btnB.classList.toggle("is-active", draft.bold);
    updatePreview();
  });

  const btnI = document.createElement("button");
  btnI.type = "button";
  btnI.className = "ds-seg-btn ds-btn-italic";
  btnI.textContent = "I";
  if (draft.italic) btnI.classList.add("is-active");
  btnI.addEventListener("click", () => {
    draft.italic = !draft.italic;
    btnI.classList.toggle("is-active", draft.italic);
    updatePreview();
  });

  const btnU = document.createElement("button");
  btnU.type = "button";
  btnU.className = "ds-seg-btn ds-btn-underline";
  btnU.textContent = "U";
  if (draft.underline) btnU.classList.add("is-active");
  btnU.addEventListener("click", () => {
    draft.underline = !draft.underline;
    btnU.classList.toggle("is-active", draft.underline);
    updatePreview();
  });

  styleGroup.append(btnB, btnI, btnU);

  // Alignment Segmented Group: Left, Center, Right
  const alignGroup = document.createElement("div");
  alignGroup.className = "ds-segmented-group ds-align-toggles";

  const aligns = [
    { id: "left", icon: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12M2 7h8M2 11h12M2 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
    { id: "center", icon: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12M4 7h8M2 11h12M5 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
    { id: "right", icon: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12M6 7h8M2 11h12M8 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
  ];

  const alignBtns = aligns.map((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ds-seg-btn";
    btn.innerHTML = a.icon;
    if (draft.textAlign === a.id) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      draft.textAlign = a.id;
      alignBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      updatePreview();
    });
    return btn;
  });
  alignGroup.append(...alignBtns);

  sec3.append(fontSelect.root, styleGroup, alignGroup);

  // Section 4: Font Size Control (Dual Slider + Stepper)
  const sec4 = document.createElement("div");
  sec4.className = "ds-modal-section ds-section-fontsize";
  sec4.innerHTML = `<span class="ds-ctrl-label">Font Size:</span>`;

  const fsSlider = document.createElement("input");
  fsSlider.type = "range";
  fsSlider.className = "ds-slider-range";
  fsSlider.min = "8";
  fsSlider.max = "256";
  fsSlider.step = "1";
  fsSlider.value = String(draft.fontSize);

  const fsStepper = createStepperControl({
    min: 8,
    max: 256,
    step: 1,
    value: draft.fontSize,
    onChange: (v) => {
      draft.fontSize = v;
      fsSlider.value = String(v);
      updatePreview();
    },
  });

  fsSlider.addEventListener("input", () => {
    const v = parseInt(fsSlider.value, 10);
    draft.fontSize = v;
    fsStepper.setValue(v, false);
    updatePreview();
  });

  sec4.append(fsSlider, fsStepper.root);

  // Section 5: Tabbed Color Pickers ([Background] & [Text])
  const sec5 = document.createElement("div");
  sec5.className = "ds-modal-section ds-section-colors";

  const colorTabs = document.createElement("div");
  colorTabs.className = "ds-color-tabs";

  const tabBg = document.createElement("button");
  tabBg.type = "button";
  tabBg.className = "ds-color-tab is-active";
  tabBg.textContent = "Background";

  const tabText = document.createElement("button");
  tabText.type = "button";
  tabText.className = "ds-color-tab";
  tabText.textContent = "Text Color";

  colorTabs.append(tabBg, tabText);

  const bgEngine = createColorEngine({
    initialColor: draft.backgroundColor,
    showTransparentToggle: true,
    isTransparent: draft.isTransparent,
    onColorChange: (hex) => {
      draft.backgroundColor = hex;
      updatePreview();
    },
    onTransparentToggle: (isTrans) => {
      draft.isTransparent = isTrans;
      updatePreview();
    },
  });

  const textEngine = createColorEngine({
    initialColor: draft.textColor,
    showTransparentToggle: false,
    onColorChange: (hex) => {
      draft.textColor = hex;
      updatePreview();
    },
  });
  textEngine.root.style.display = "none";

  tabBg.addEventListener("click", () => {
    tabBg.classList.add("is-active");
    tabText.classList.remove("is-active");
    bgEngine.root.style.display = "flex";
    textEngine.root.style.display = "none";
  });

  tabText.addEventListener("click", () => {
    tabText.classList.add("is-active");
    tabBg.classList.remove("is-active");
    bgEngine.root.style.display = "none";
    textEngine.root.style.display = "flex";
  });

  sec5.append(colorTabs, bgEngine.root, textEngine.root);

  // Section 6: Style & Spacing Adjusters
  const sec6 = document.createElement("div");
  sec6.className = "ds-modal-section ds-section-spacing";
  sec6.innerHTML = `<span class="ds-spacing-header">Style & Spacing:</span>`;

  const makeSliderRow = (label, min, max, step, initialVal, unit, onVal) => {
    const row = document.createElement("div");
    row.className = "ds-spacing-row";

    const lbl = document.createElement("span");
    lbl.className = "ds-spacing-label";
    lbl.textContent = label;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "ds-slider-range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initialVal);

    const stepper = createStepperControl({
      min,
      max,
      step,
      value: initialVal,
      formatFn: (v) => `${v}${unit}`,
      onChange: (v) => {
        slider.value = String(v);
        onVal(v);
        updatePreview();
      },
    });

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      stepper.setValue(v, false);
      onVal(v);
      updatePreview();
    });

    row.append(lbl, slider, stepper.root);
    return { row, slider, stepper };
  };

  const padCtrl = makeSliderRow("Padding:", 0, 100, 1, draft.padding, "px", (v) => { draft.padding = v; });
  const radCtrl = makeSliderRow("Radius:", 0, 64, 1, draft.borderRadius, "px", (v) => { draft.borderRadius = v; });
  const opCtrl = makeSliderRow("Opacity:", 0, 100, 1, Math.round(draft.opacity * 100), "%", (v) => { draft.opacity = v / 100; });
  const lhCtrl = makeSliderRow("Line Height:", 0.8, 3.0, 0.05, draft.lineHeight, "", (v) => { draft.lineHeight = v; });

  const spacingGrid = document.createElement("div");
  spacingGrid.className = "ds-spacing-grid-2col";
  spacingGrid.append(padCtrl.row, radCtrl.row, opCtrl.row, lhCtrl.row);

  sec6.append(spacingGrid);

  // Section 7: Action Footer
  const footer = document.createElement("div");
  footer.className = "ds-modal-footer";

  const btnReset = document.createElement("button");
  btnReset.type = "button";
  btnReset.className = "ds-modal-btn ds-btn-reset";
  btnReset.textContent = "Reset";

  btnReset.addEventListener("click", () => {
    Object.assign(draft, DEFAULT_LABEL_PROPS);
    textarea.value = draft.text;
    fontSelect.setValue(draft.fontFamily);
    btnB.classList.toggle("is-active", draft.bold);
    btnI.classList.toggle("is-active", draft.italic);
    btnU.classList.toggle("is-active", draft.underline);
    alignBtns.forEach((b, i) => b.classList.toggle("is-active", aligns[i].id === draft.textAlign));
    fsSlider.value = String(draft.fontSize);
    fsStepper.setValue(draft.fontSize, false);
    bgEngine.setColor(draft.backgroundColor);
    bgEngine.setTransparent(draft.isTransparent);
    textEngine.setColor(draft.textColor);
    padCtrl.slider.value = String(draft.padding);
    padCtrl.stepper.setValue(draft.padding, false);
    radCtrl.slider.value = String(draft.borderRadius);
    radCtrl.stepper.setValue(draft.borderRadius, false);
    opCtrl.slider.value = String(Math.round(draft.opacity * 100));
    opCtrl.stepper.setValue(Math.round(draft.opacity * 100), false);
    lhCtrl.slider.value = String(draft.lineHeight);
    lhCtrl.stepper.setValue(draft.lineHeight, false);
    updatePreview();
  });

  const footerRight = document.createElement("div");
  footerRight.className = "ds-footer-right";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "ds-modal-btn ds-btn-cancel";
  btnCancel.textContent = "Cancel";

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "ds-modal-btn ds-btn-save";
  btnSave.textContent = "Save";

  footerRight.append(btnCancel, btnSave);
  footer.append(btnReset, footerRight);

  body.append(sec1, sec2, sec3, sec4, sec5, sec6);
  modal.append(header, body, footer);
  overlay.appendChild(modal);

  // Close & Save Handlers
  const closeModal = () => {
    try { unsubTheme?.(); } catch (_) {}
    fontSelect.destroy();
    overlay.remove();
    activeModal = null;
  };

  header.querySelector(".ds-modal-close").addEventListener("click", closeModal);
  btnCancel.addEventListener("click", closeModal);

  btnSave.addEventListener("click", () => {
    node.properties = { ...draft };
    if (draft.fontFamily) loadWebFont(draft.fontFamily);
    dirty(node.graph || app?.graph);
    closeModal();
  });

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeModal();
  });

  const onKey = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  activeModal = { close: closeModal };
  document.body.appendChild(overlay);

  updatePreview();
}

// -----------------------------------------------------------------------------
// Canvas Context Menu Integration ("Add DS Label")
// -----------------------------------------------------------------------------
function hookCanvasContextMenu() {
  const LiteGraph = globalThis.LiteGraph;
  if (!LiteGraph?.LGraphCanvas) return;
  if (LiteGraph.LGraphCanvas.prototype._dsLabelHooked) return;
  LiteGraph.LGraphCanvas.prototype._dsLabelHooked = true;

  const origGetCanvasMenuOptions = LiteGraph.LGraphCanvas.prototype.getCanvasMenuOptions;
  LiteGraph.LGraphCanvas.prototype.getCanvasMenuOptions = function () {
    const options = origGetCanvasMenuOptions ? origGetCanvasMenuOptions.apply(this, arguments) : [];

    if (!options.some((o) => o?.content === "Add DS Label")) {
      const labelOption = {
        content: "Add DS Label",
        callback: (value, opt, mouseEvent, prevMenu, gCanvas) => {
          const canvas = gCanvas || this || app?.canvas;
          const graph = canvas?.graph || app?.graph;
          let node = LiteGraph.createNode(NODE_TYPE);
          if (!node) {
            const Ctor = registerDSLabelNodeType();
            if (Ctor) node = new Ctor();
          }
          if (node && graph) {
            let pos = [200, 200];
            if (mouseEvent && canvas?.convertEventToCanvasOffset) {
              pos = canvas.convertEventToCanvasOffset(mouseEvent);
            } else if (mouseEvent && mouseEvent.canvasX != null) {
              pos = [mouseEvent.canvasX, mouseEvent.canvasY];
            } else if (canvas?.last_mouse_position) {
              pos = [...canvas.last_mouse_position];
            }
            node.pos = pos;
            graph.add(node);
            canvas.selectNode?.(node, false);
            dirty(graph);
          }
        },
      };
      options.unshift(labelOption);
    }
    return options;
  };
}

// -----------------------------------------------------------------------------
// Stylesheet Injection for Modal & Non-Native Controls
// -----------------------------------------------------------------------------
function injectLabelStyles() {
  if (document.getElementById("ds-label-styles")) return;
  const style = document.createElement("style");
  style.id = "ds-label-styles";
  style.textContent = `
    /* Modal Backdrop Overlay */
    .ds-label-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      padding: 16px;
      font-family: var(--ds-font, Inter, system-ui, sans-serif);
      box-sizing: border-box;
      user-select: none;
    }

    /* Modal Main Container */
    .ds-label-modal {
      width: 620px;
      max-width: 95vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background-color: var(--ds-bg-surface-elevated, var(--ds-panel-2, #181c24));
      color: var(--ds-text-primary, var(--ds-text, #ffffff));
      border: 1px solid var(--ds-border-color, var(--ds-border, #333333));
      border-radius: 8px;
      box-shadow: var(--ds-shadow-modal, 0 16px 40px rgba(0, 0, 0, 0.55));
      overflow: hidden;
      animation: dsModalFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes dsModalFadeIn {
      from { opacity: 0; transform: scale(0.97) translateY(-8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* Custom Scrollbars (Strictly Non-Native OS Chrome) */
    .ds-label-modal ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .ds-label-modal ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    .ds-label-modal ::-webkit-scrollbar-thumb {
      background: var(--ds-border, rgba(255, 255, 255, 0.2));
      border-radius: 3px;
    }
    .ds-label-modal ::-webkit-scrollbar-thumb:hover {
      background: var(--ds-accent, #67e8f9);
    }

    /* Header */
    .ds-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid var(--ds-border, rgba(255, 255, 255, 0.1));
      background: rgba(0, 0, 0, 0.15);
    }

    .ds-modal-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--ds-accent, #67e8f9);
      letter-spacing: 0.3px;
    }

    .ds-modal-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--ds-text, #9ca3af);
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }
    .ds-modal-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    /* Body */
    .ds-modal-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .ds-modal-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /* Section 1: Textarea */
    .ds-label-textarea {
      width: 100% !important;
      min-height: 48px;
      max-height: 100px;
      background: var(--ds-input-bg, var(--ds-panel, #0e1016)) !important;
      color: var(--ds-text, #ffffff) !important;
      border: 1px solid var(--ds-border, #333333) !important;
      border-radius: 6px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.4;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s;
    }
    .ds-label-textarea:focus {
      border-color: var(--ds-accent, #67e8f9) !important;
    }

    /* Section 2: Live Preview Stage */
    .ds-preview-stage {
      min-height: 84px;
      max-height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid var(--ds-border, #2a2a2a);
      background-color: #1a1a1a;
      background-image:
        linear-gradient(45deg, #222 25%, transparent 25%),
        linear-gradient(-45deg, #222 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #222 75%),
        linear-gradient(-45deg, transparent 75%, #222 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
      overflow: auto;
      box-sizing: border-box;
    }

    .ds-preview-card {
      box-sizing: border-box;
      max-width: 100%;
      word-break: break-word;
      white-space: pre-wrap;
      transition: all 0.1s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* Section 3: Typography Row */
    .ds-section-typography {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }

    /* Custom Searchable Font Select */
    .ds-font-select {
      position: relative;
      flex: 1;
    }

    .ds-font-select-trigger {
      width: 100%;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      background: var(--ds-input-bg, var(--ds-panel, #0e1016)) !important;
      color: var(--ds-text, #ffffff) !important;
      border: 1px solid var(--ds-border, #333333) !important;
      border-radius: 5px;
      font-size: 12px;
      cursor: pointer;
      box-sizing: border-box;
      user-select: none;
    }
    .ds-font-select-trigger:hover {
      border-color: var(--ds-accent, #67e8f9) !important;
    }
    .ds-font-select-name {
      color: var(--ds-text, #ffffff) !important;
    }

    .ds-font-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      width: 100%;
      min-width: 220px;
      max-height: 220px;
      background: var(--ds-panel-2, var(--ds-bg-surface-elevated, #181c24)) !important;
      border: 1px solid var(--ds-border, #333333) !important;
      border-radius: 6px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.75);
      z-index: 100100;
      flex-direction: column;
      overflow: hidden;
      color: var(--ds-text, #ffffff) !important;
    }
    .ds-font-dropdown.is-open {
      display: flex;
    }

    .ds-font-search-box {
      padding: 6px;
      background: var(--ds-panel-2, #181c24) !important;
      border-bottom: 1px solid var(--ds-border, #2a2a2a) !important;
    }
    .ds-font-search-input {
      width: 100% !important;
      height: 26px !important;
      background: var(--ds-input-bg, var(--ds-panel, #0e1016)) !important;
      color: var(--ds-text, #ffffff) !important;
      border: 1px solid var(--ds-border, #333333) !important;
      border-radius: 4px !important;
      padding: 0 8px !important;
      font-size: 12px !important;
      outline: none !important;
      box-sizing: border-box !important;
    }
    .ds-font-search-input:focus {
      border-color: var(--ds-accent, #67e8f9) !important;
    }
    .ds-font-search-input::placeholder {
      color: var(--ds-text-dim, #71717a) !important;
    }

    .ds-font-list {
      overflow-y: auto;
      max-height: 170px;
      display: flex;
      flex-direction: column;
      background: var(--ds-panel-2, #181c24) !important;
    }

    .ds-font-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      color: var(--ds-text, #f8fafc) !important;
      background: transparent;
      transition: background 0.1s, color 0.1s;
    }
    .ds-font-item-name {
      color: var(--ds-text, #f8fafc) !important;
      font-size: 12px;
    }
    .ds-font-item-badge {
      font-size: 9px;
      opacity: 0.7;
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2)) !important;
      color: var(--ds-text-dim, #9ca3af) !important;
      border-radius: 3px;
      padding: 1px 4px;
    }
    .ds-font-item:hover {
      background: var(--ds-accent, #67e8f9) !important;
      color: var(--ds-on-accent, #0a0c10) !important;
    }
    .ds-font-item:hover .ds-font-item-name {
      color: var(--ds-on-accent, #0a0c10) !important;
    }
    .ds-font-item:hover .ds-font-item-badge {
      color: var(--ds-on-accent, #0a0c10) !important;
      border-color: var(--ds-on-accent, #0a0c10) !important;
    }
    .ds-font-item.is-selected {
      background: rgba(255, 255, 255, 0.08) !important;
      color: var(--ds-accent, #67e8f9) !important;
      font-weight: 600;
    }
    .ds-font-item.is-selected .ds-font-item-name {
      color: var(--ds-accent, #67e8f9) !important;
    }
    .ds-font-item.is-selected:hover {
      background: var(--ds-accent, #67e8f9) !important;
      color: var(--ds-on-accent, #0a0c10) !important;
    }
    .ds-font-item.is-selected:hover .ds-font-item-name {
      color: var(--ds-on-accent, #0a0c10) !important;
    }

    /* Segmented Controls (B/I/U & Align) */
    .ds-segmented-group {
      display: inline-flex;
      background: var(--ds-input-bg, #0e1016);
      border: 1px solid var(--ds-border, #333333);
      border-radius: 5px;
      padding: 2px;
      gap: 2px;
      box-sizing: border-box;
    }

    .ds-seg-btn {
      width: 24px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: var(--ds-text, #9ca3af);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .ds-seg-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
    .ds-seg-btn.is-active {
      background: var(--ds-accent, #67e8f9);
      color: var(--ds-on-accent, #0a0c10);
      font-weight: bold;
    }

    /* Section 4 & Sliders */
    .ds-section-fontsize {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
    .ds-ctrl-label {
      font-size: 12px;
      color: var(--ds-text, #e5e7eb);
      min-width: 65px;
    }

    /* Custom Slider Range */
    .ds-slider-range {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--ds-slider-bg, #2a2a2a);
      border-radius: 2px;
      outline: none;
      margin: 0;
    }
    .ds-slider-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--ds-slider-thumb, var(--ds-accent, #67e8f9));
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
      transition: transform 0.1s;
    }
    .ds-slider-range::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Custom Stepper (Strictly Non-Native with Vector Arrows) */
    .ds-stepper-wrap {
      display: flex;
      align-items: center;
      width: 58px;
      height: 24px;
      background: var(--ds-input-bg, var(--ds-panel, #0e1016)) !important;
      border: 1px solid var(--ds-border, #333333) !important;
      border-radius: 4px;
      overflow: hidden;
      box-sizing: border-box;
    }

    .ds-stepper-input {
      width: 40px !important;
      height: 100% !important;
      border: none !important;
      background: transparent !important;
      color: var(--ds-text, #ffffff) !important;
      font-size: 11px;
      text-align: center;
      outline: none;
      padding: 0 2px;
      box-sizing: border-box;
      -moz-appearance: textfield;
      appearance: textfield;
    }
    .ds-stepper-input::-webkit-inner-spin-button,
    .ds-stepper-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .ds-stepper-buttons {
      display: flex;
      flex-direction: column;
      width: 16px;
      height: 100%;
      border-left: 1px solid var(--ds-border, #2a2a2a);
    }

    .ds-stepper-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--ds-text, #9ca3af);
      cursor: pointer;
      padding: 0;
      transition: background 0.1s, color 0.1s;
    }
    .ds-stepper-btn:hover {
      background: var(--ds-accent, #67e8f9);
      color: var(--ds-on-accent, #0a0c10);
    }

    /* Section 5: Color Engine */
    .ds-section-colors {
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--ds-border, #2a2a2a);
      border-radius: 6px;
      padding: 8px;
    }

    .ds-color-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }
    .ds-color-tab {
      flex: 1;
      height: 24px;
      border: 1px solid var(--ds-border, #333333);
      border-radius: 4px;
      background: transparent;
      color: var(--ds-text, #9ca3af);
      font-size: 11.5px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ds-color-tab.is-active {
      background: var(--ds-panel-2, #262c38);
      color: var(--ds-accent, #67e8f9);
      border-color: var(--ds-accent, #67e8f9);
      font-weight: 600;
    }

    .ds-color-engine {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ds-color-top-row {
      display: flex;
      gap: 10px;
    }

    .ds-color-picker-left {
      display: flex;
      gap: 8px;
    }

    .ds-satval-wrap {
      position: relative;
      width: 160px;
      height: 110px;
      border-radius: 4px;
      overflow: hidden;
      cursor: crosshair;
      touch-action: none;
    }
    .ds-satval-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .ds-satval-reticle {
      position: absolute;
      width: 10px;
      height: 10px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .ds-hue-wrap {
      position: relative;
      width: 16px;
      height: 110px;
      cursor: pointer;
      touch-action: none;
    }
    .ds-hue-bar {
      width: 100%;
      height: 100%;
      border-radius: 4px;
      background: linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    }
    .ds-hue-scrub {
      position: absolute;
      left: -2px;
      right: -2px;
      height: 4px;
      border: 1px solid #ffffff;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 2px;
      transform: translateY(-50%);
      pointer-events: none;
    }

    /* 4x9 Swatch Grid */
    .ds-color-picker-right {
      flex: 1;
      display: flex;
      align-items: center;
    }
    .ds-swatch-grid-4x9 {
      display: grid;
      grid-template-columns: repeat(9, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 4px;
      width: 100%;
      height: 110px;
    }
    .ds-swatch-cell {
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      border-radius: 3px;
      cursor: pointer;
      transition: transform 0.1s, border-color 0.1s;
      padding: 0;
      box-sizing: border-box;
      outline: none;
    }
    .ds-swatch-cell:hover {
      transform: scale(1.15);
      border-color: #ffffff !important;
      z-index: 2;
    }

    /* Color Bottom Row */
    .ds-color-bottom-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ds-active-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid var(--ds-border, #333333);
      flex-shrink: 0;
    }
    .ds-hex-input {
      width: 80px !important;
      height: 24px !important;
      background: var(--ds-input-bg, var(--ds-panel, #0e1016)) !important;
      color: var(--ds-text, #ffffff) !important;
      border: 1px solid var(--ds-border, #333333) !important;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11.5px;
      text-align: center;
      outline: none;
    }

    .ds-transparent-btn {
      margin-left: auto;
      height: 24px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      background: transparent;
      border: 1px solid var(--ds-border, #333333);
      border-radius: 4px;
      color: var(--ds-text, #9ca3af);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ds-transparent-btn:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: #ffffff;
    }
    .ds-transparent-btn.is-active {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-weight: 600;
    }
    .ds-checkered-icon {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background:
        linear-gradient(45deg, #444 25%, transparent 25%),
        linear-gradient(-45deg, #444 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #444 75%),
        linear-gradient(-45deg, transparent 75%, #444 75%);
      background-size: 6px 6px;
      background-color: #222;
      position: relative;
    }
    .ds-transparent-btn.is-active .ds-checkered-icon::after {
      content: "";
      position: absolute;
      left: 0;
      top: 5px;
      width: 12px;
      height: 2px;
      background: #ef4444;
      transform: rotate(45deg);
    }

    /* Section 6: Spacing & Style */
    .ds-section-spacing {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ds-spacing-header {
      font-size: 11px;
      font-weight: 600;
      color: var(--ds-text, #9ca3af);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ds-spacing-grid-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 14px;
    }
    .ds-spacing-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ds-spacing-label {
      font-size: 11px;
      width: 72px;
      color: var(--ds-text, #d1d5db);
      flex-shrink: 0;
    }

    /* Section 7: Action Footer */
    .ds-modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-top: 1px solid var(--ds-border, rgba(255, 255, 255, 0.1));
      background: rgba(0, 0, 0, 0.15);
    }
    .ds-footer-right {
      display: flex;
      gap: 8px;
    }

    .ds-modal-btn {
      height: 26px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
      box-sizing: border-box;
      outline: none;
    }

    .ds-btn-reset {
      background: transparent;
      border: 1px solid var(--ds-border, #333333);
      color: var(--ds-text, #9ca3af);
    }
    .ds-btn-reset:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      border-color: #555555;
    }

    .ds-btn-cancel {
      background: transparent;
      border: 1px solid var(--ds-border, #333333);
      color: var(--ds-text, #e5e7eb);
    }
    .ds-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: #555555;
    }

    .ds-btn-save {
      background: var(--ds-accent-primary, var(--ds-accent, #67e8f9));
      color: var(--ds-accent-contrast, var(--ds-on-accent, #0a0c10));
      border: 1px solid var(--ds-accent-primary, var(--ds-accent, #67e8f9));
      font-weight: 600;
    }
    .ds-btn-save:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .ds-btn-save:active {
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);
}

// -----------------------------------------------------------------------------
// Web Extension Registration
// -----------------------------------------------------------------------------
// Register immediately if LiteGraph is already loaded
if (typeof globalThis.LiteGraph !== "undefined") {
  registerDSLabelNodeType();
}

app.registerExtension({
  name: EXTENSION_NAME,

  async init() {
    registerDSLabelNodeType();
  },

  async setup() {
    registerDSLabelNodeType();
    hookCanvasContextMenu();
    injectLabelStyles();

    // Connect with DSGearMenu registry
    const registerGear = () => {
      if (window.DSGearMenu) {
        window.DSGearMenu.register(NODE_TYPE, {
          tooltip: "DS Label Configuration",
          onClick: (node) => {
            openDSLabelModal(node);
          },
        });
        return true;
      }
      return false;
    };
    if (!registerGear()) {
      setTimeout(registerGear, 500);
    }

    const markExisting = () => {
      const graph = app.graph;
      if (!graph || !graph._nodes) return;
      for (const node of graph._nodes) {
        if (node.type === NODE_TYPE || node.constructor?.name === "DSLabelNode") {
          node.isVirtualNode = true;
          node.comfyClass = NODE_TYPE;
        }
      }
    };
    markExisting();
    setTimeout(markExisting, 100);
    setTimeout(markExisting, 1000);

    console.log("[DS Label] Entity & Editor Modal registered");
  },

  nodeCreated(node) {
    if (node.type === NODE_TYPE || node.constructor?.name === "DSLabelNode") {
      node.isVirtualNode = true;
      node.comfyClass = NODE_TYPE;
    }
  },

  async afterConfigureGraph() {
    const graph = app.graph;
    if (!graph || !graph._nodes) return;
    for (const node of graph._nodes) {
      if (node.type === NODE_TYPE || node.constructor?.name === "DSLabelNode") {
        node.isVirtualNode = true;
        node.comfyClass = NODE_TYPE;
      }
    }
  },

  getCanvasMenuItems(canvas) {
    return [
      {
        content: "Add DS Label",
        callback: (item, opt, mouseEvent) => {
          const LiteGraph = globalThis.LiteGraph;
          const graph = canvas?.graph || app?.graph;
          let node = LiteGraph?.createNode?.(NODE_TYPE);
          if (!node) {
            const Ctor = registerDSLabelNodeType();
            if (Ctor) node = new Ctor();
          }
          if (node && graph) {
            let pos = [200, 200];
            if (mouseEvent && canvas?.convertEventToCanvasOffset) {
              pos = canvas.convertEventToCanvasOffset(mouseEvent);
            } else if (canvas?.last_mouse_position) {
              pos = [...canvas.last_mouse_position];
            } else if (canvas?.graph_mouse) {
              pos = [...canvas.graph_mouse];
            } else {
              const offset = canvas?.offset || [0, 0];
              const scale = canvas?.ds?.scale || canvas?.scale || 1;
              const x = (-offset[0] + window.innerWidth / 2) / scale;
              const y = (-offset[1] + window.innerHeight / 2) / scale;
              pos = [Math.round(x - 140), Math.round(y - 40)];
            }
            node.pos = pos;
            graph.add(node);
            canvas?.selectNode?.(node, false);
            dirty(graph);
          }
        },
      },
    ];
  },
});

export { openDSLabelModal };
