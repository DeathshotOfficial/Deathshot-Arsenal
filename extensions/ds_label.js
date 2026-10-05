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
  // Display & Futuristic
  { name: "Bebas Neue", category: "Google Font" },
  { name: "Oswald", category: "Google Font" },
  { name: "Space Grotesk", category: "Google Font" },
  { name: "Syne", category: "Google Font" },
  { name: "Archivo", category: "Google Font" },
  { name: "Orbitron", category: "Google Font" },
  { name: "Rajdhani", category: "Google Font" },
  { name: "Righteous", category: "Google Font" },
  { name: "Cinzel", category: "Google Font" },
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

    getExtraMenuOptions(canvas, options) {
      if (!Array.isArray(options)) return;
      options.unshift(
        {
          content: "Edit DS Label...",
          callback: () => openDSLabelModal(this),
        },
        {
          content: "Copy Label Text",
          callback: () => {
            const txt = this.properties?.text || "";
            if (navigator?.clipboard?.writeText) {
              navigator.clipboard.writeText(txt);
            }
          },
        },
        null
      );
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
// Continuous-Hold Numeric Stepper Helper with Strictly Centered Values
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
  let isEditing = false;

  const syncDisplay = (v) => {
    if (!isEditing && formatFn) {
      input.value = formatFn(v);
    } else {
      input.value = String(v);
    }
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

  input.addEventListener("focus", () => {
    isEditing = true;
    input.value = String(cur);
    input.select();
  });

  input.addEventListener("blur", () => {
    isEditing = false;
    update(parseFloat(input.value) || cur);
  });

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
        repeat = setInterval(() => update(cur + delta), 40);
      }, 240);
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
  satValCanvas.width = 170;
  satValCanvas.height = 115;
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
    transBtn.className = "ds-ui-btn ds-transparent-btn";
    if (transparentState) transBtn.classList.add("is-active");
    transBtn.innerHTML = `
      <span class="ds-checkered-icon"></span>
      <span>Transparent Background</span>
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
// Custom Searchable Font Select Component
// -----------------------------------------------------------------------------
function createSearchableFontSelect({ selectedFont, onSelect }) {
  const root = document.createElement("div");
  root.className = "ds-font-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ds-ui-btn ds-font-select-trigger";
  trigger.innerHTML = `
    <span class="ds-font-select-name" style="font-family: '${selectedFont || "Inter"}', system-ui, sans-serif;">${selectedFont || "Inter"}</span>
    <svg viewBox="0 0 12 12" width="10" height="10" class="ds-chevron-icon"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  `;

  const dropdown = document.createElement("div");
  dropdown.className = "ds-font-dropdown";

  const searchBox = document.createElement("div");
  searchBox.className = "ds-font-search-box";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "ds-font-search-input";
  searchInput.placeholder = "Search Google & system fonts...";
  searchBox.appendChild(searchInput);

  const list = document.createElement("div");
  list.className = "ds-font-list";

  dropdown.append(searchBox, list);
  root.append(trigger, dropdown);

  let currentFont = selectedFont || "Inter";
  let allFonts = [...CURATED_FONTS];

  // Query local system fonts if supported
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

      item.addEventListener("mouseenter", () => {
        loadWebFont(fontItem.name);
      });

      item.addEventListener("click", () => {
        currentFont = fontItem.name;
        const nameEl = trigger.querySelector(".ds-font-select-name");
        nameEl.textContent = currentFont;
        nameEl.style.fontFamily = `"${currentFont}", system-ui, sans-serif`;
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
      const nameEl = trigger.querySelector(".ds-font-select-name");
      if (nameEl) {
        nameEl.textContent = currentFont;
        nameEl.style.fontFamily = `"${currentFont}", system-ui, sans-serif`;
      }
      loadWebFont(font);
    },
    destroy: () => {
      document.removeEventListener("pointerdown", onDocClick);
    },
  };
}

// -----------------------------------------------------------------------------
// DS Label Editor Modal (Multi-Card Architecture)
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

  // Modal Header
  const header = document.createElement("div");
  header.className = "ds-modal-header";
  header.innerHTML = `
    <div class="ds-modal-title-wrap">
      <div class="ds-modal-icon-badge">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 7 4 4 20 4 20 7"></polyline>
          <line x1="9" y1="20" x2="15" y2="20"></line>
          <line x1="12" y1="4" x2="12" y2="20"></line>
        </svg>
      </div>
      <div>
        <div class="ds-modal-title">DS Label Configuration</div>
        <div class="ds-modal-subtitle">Canvas Banner & Typography Studio</div>
      </div>
    </div>
    <button type="button" class="ds-modal-close" aria-label="Close" title="Close (Esc)">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  // Body container (Multi-Card vertical stack with 10px gaps)
  const body = document.createElement("div");
  body.className = "ds-label-modal-body";

  // CARD 1: Content & Live Stage
  const card1 = document.createElement("div");
  card1.className = "ds-ui-card ds-label-card";
  card1.innerHTML = `
    <div class="ds-ui-card-head">
      <div class="ds-ui-card-title-group">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--ds-color-accent, #67e8f9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <span class="ds-ui-card-title">Label Content & Live Preview</span>
      </div>
    </div>
  `;
  const card1Body = document.createElement("div");
  card1Body.className = "ds-ui-card-body";

  const textarea = document.createElement("textarea");
  textarea.className = "ds-label-textarea ds-ui-textarea";
  textarea.placeholder = "Enter label text... (supports multi-line text)";
  textarea.value = draft.text;
  textarea.rows = 2;

  const previewOuter = document.createElement("div");
  previewOuter.className = "ds-preview-stage";
  const previewLabel = document.createElement("div");
  previewLabel.className = "ds-preview-card";
  const previewBadge = document.createElement("div");
  previewBadge.className = "ds-preview-badge";

  previewOuter.append(previewLabel, previewBadge);
  card1Body.append(textarea, previewOuter);
  card1.appendChild(card1Body);

  // Live preview update routine
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

    previewBadge.textContent = `${draft.fontFamily} • ${draft.fontSize}px • ${Math.round(draft.opacity * 100)}%`;
  };

  textarea.addEventListener("input", () => {
    draft.text = textarea.value;
    updatePreview();
  });

  // CARD 2: Typography & Alignment
  const card2 = document.createElement("div");
  card2.className = "ds-ui-card ds-label-card";
  card2.innerHTML = `
    <div class="ds-ui-card-head">
      <div class="ds-ui-card-title-group">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--ds-color-accent, #67e8f9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>
        <span class="ds-ui-card-title">Typography & Formatting</span>
      </div>
    </div>
  `;
  const card2Body = document.createElement("div");
  card2Body.className = "ds-ui-card-body";

  const typoRow = document.createElement("div");
  typoRow.className = "ds-typography-row";

  const fontSelect = createSearchableFontSelect({
    selectedFont: draft.fontFamily,
    onSelect: (font) => {
      draft.fontFamily = font;
      updatePreview();
    },
  });

  // Style Toggles: B, I, U
  const styleGroup = document.createElement("div");
  styleGroup.className = "ds-segmented-group ds-style-toggles";

  const btnB = document.createElement("button");
  btnB.type = "button";
  btnB.className = "ds-ui-btn ds-seg-btn ds-btn-bold";
  btnB.textContent = "B";
  btnB.title = "Toggle Bold";
  if (draft.bold) btnB.classList.add("is-active");
  btnB.addEventListener("click", () => {
    draft.bold = !draft.bold;
    btnB.classList.toggle("is-active", draft.bold);
    updatePreview();
  });

  const btnI = document.createElement("button");
  btnI.type = "button";
  btnI.className = "ds-ui-btn ds-seg-btn ds-btn-italic";
  btnI.textContent = "I";
  btnI.title = "Toggle Italic";
  if (draft.italic) btnI.classList.add("is-active");
  btnI.addEventListener("click", () => {
    draft.italic = !draft.italic;
    btnI.classList.toggle("is-active", draft.italic);
    updatePreview();
  });

  const btnU = document.createElement("button");
  btnU.type = "button";
  btnU.className = "ds-ui-btn ds-seg-btn ds-btn-underline";
  btnU.textContent = "U";
  btnU.title = "Toggle Underline";
  if (draft.underline) btnU.classList.add("is-active");
  btnU.addEventListener("click", () => {
    draft.underline = !draft.underline;
    btnU.classList.toggle("is-active", draft.underline);
    updatePreview();
  });

  styleGroup.append(btnB, btnI, btnU);

  // Alignment Toggles: Left, Center, Right
  const alignGroup = document.createElement("div");
  alignGroup.className = "ds-segmented-group ds-align-toggles";

  const aligns = [
    { id: "left", label: "Align Left", icon: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12M2 7h8M2 11h12M2 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
    { id: "center", label: "Align Center", icon: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12M4 7h8M2 11h12M5 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
    { id: "right", label: "Align Right", icon: `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12M6 7h8M2 11h12M8 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
  ];

  const alignBtns = aligns.map((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ds-ui-btn ds-seg-btn";
    btn.title = a.label;
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

  typoRow.append(fontSelect.root, styleGroup, alignGroup);

  // Font Size Slider & Stepper Row
  const fsRow = document.createElement("div");
  fsRow.className = "ds-ctrl-row";

  const fsLabel = document.createElement("span");
  fsLabel.className = "ds-ctrl-label";
  fsLabel.textContent = "Font Size:";

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
    formatFn: (v) => `${v}px`,
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

  fsRow.append(fsLabel, fsSlider, fsStepper.root);
  card2Body.append(typoRow, fsRow);
  card2.appendChild(card2Body);

  // CARD 3: Color Studio
  const card3 = document.createElement("div");
  card3.className = "ds-ui-card ds-label-card";
  card3.innerHTML = `
    <div class="ds-ui-card-head">
      <div class="ds-ui-card-title-group">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--ds-color-accent, #67e8f9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"></path>
        </svg>
        <span class="ds-ui-card-title">Color Studio</span>
      </div>
    </div>
  `;
  const card3Body = document.createElement("div");
  card3Body.className = "ds-ui-card-body";

  const colorTabs = document.createElement("div");
  colorTabs.className = "ds-color-tabs";

  const tabBg = document.createElement("button");
  tabBg.type = "button";
  tabBg.className = "ds-ui-btn ds-color-tab is-active";
  tabBg.innerHTML = `<span class="ds-tab-swatch" id="ds-tab-swatch-bg"></span><span>Background</span>`;

  const tabText = document.createElement("button");
  tabText.type = "button";
  tabText.className = "ds-ui-btn ds-color-tab";
  tabText.innerHTML = `<span class="ds-tab-swatch" id="ds-tab-swatch-text"></span><span>Text Color</span>`;

  colorTabs.append(tabBg, tabText);

  const bgEngine = createColorEngine({
    initialColor: draft.backgroundColor,
    showTransparentToggle: true,
    isTransparent: draft.isTransparent,
    onColorChange: (hex) => {
      draft.backgroundColor = hex;
      updateTabSwatches();
      updatePreview();
    },
    onTransparentToggle: (isTrans) => {
      draft.isTransparent = isTrans;
      updateTabSwatches();
      updatePreview();
    },
  });

  const textEngine = createColorEngine({
    initialColor: draft.textColor,
    showTransparentToggle: false,
    onColorChange: (hex) => {
      draft.textColor = hex;
      updateTabSwatches();
      updatePreview();
    },
  });
  textEngine.root.style.display = "none";

  const updateTabSwatches = () => {
    const swBg = tabBg.querySelector("#ds-tab-swatch-bg");
    const swTxt = tabText.querySelector("#ds-tab-swatch-text");
    if (swBg) {
      if (draft.isTransparent) {
        swBg.style.background = "repeating-conic-gradient(#555 0% 25%, #222 0% 50%) 50% / 6px 6px";
      } else {
        swBg.style.background = draft.backgroundColor;
      }
    }
    if (swTxt) {
      swTxt.style.background = draft.textColor;
    }
  };
  updateTabSwatches();

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

  card3Body.append(colorTabs, bgEngine.root, textEngine.root);
  card3.appendChild(card3Body);

  // CARD 4: Geometry, Spacing & Opacity
  const card4 = document.createElement("div");
  card4.className = "ds-ui-card ds-label-card";
  card4.innerHTML = `
    <div class="ds-ui-card-head">
      <div class="ds-ui-card-title-group">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--ds-color-accent, #67e8f9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        <span class="ds-ui-card-title">Geometry, Spacing & Opacity</span>
      </div>
    </div>
  `;
  const card4Body = document.createElement("div");
  card4Body.className = "ds-ui-card-body";

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
  const lhCtrl = makeSliderRow("Line Height:", 0.8, 3.0, 0.05, draft.lineHeight, "x", (v) => { draft.lineHeight = v; });

  const spacingGrid = document.createElement("div");
  spacingGrid.className = "ds-spacing-grid-2col";
  spacingGrid.append(padCtrl.row, radCtrl.row, opCtrl.row, lhCtrl.row);

  card4Body.append(spacingGrid);
  card4.appendChild(card4Body);

  // Modal Footer (Action Buttons)
  const footer = document.createElement("div");
  footer.className = "ds-modal-footer";

  const btnReset = document.createElement("button");
  btnReset.type = "button";
  btnReset.className = "ds-ui-btn ds-ui-btn-secondary ds-btn-reset";
  btnReset.innerHTML = `
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M8 16H3v5"></path>
    </svg>
    <span>Reset Defaults</span>
  `;

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
    updateTabSwatches();
    updatePreview();
  });

  const footerRight = document.createElement("div");
  footerRight.className = "ds-footer-right";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "ds-ui-btn ds-ui-btn-secondary ds-btn-cancel";
  btnCancel.textContent = "Cancel";

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "ds-ui-btn ds-ui-btn-primary ds-btn-save";
  btnSave.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>Save Label</span>
  `;

  footerRight.append(btnCancel, btnSave);
  footer.append(btnReset, footerRight);

  body.append(card1, card2, card3, card4);
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
    app.canvas?.emitBeforeChange?.();
    node.properties = { ...draft };
    if (draft.fontFamily) loadWebFont(draft.fontFamily);
    app.canvas?.emitAfterChange?.();
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
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      btnSave.click();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  activeModal = { close: closeModal };
  document.body.appendChild(overlay);

  updatePreview();
}

// -----------------------------------------------------------------------------
// Stylesheet Injection for Modal & Controls
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
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 16px;
      font-family: var(--ds-font, Inter, system-ui, -apple-system, sans-serif);
      box-sizing: border-box;
      user-select: none;
    }

    /* Modal Main Container */
    .ds-label-modal {
      width: 660px;
      max-width: 95vw;
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      background-color: var(--ds-color-card, #12151c);
      color: var(--ds-color-text, #e5e7eb);
      border: 1px solid var(--ds-color-card-border, #242a36);
      border-radius: var(--ds-radius-card, 8px);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05);
      overflow: hidden;
      animation: dsModalFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes dsModalFadeIn {
      from { opacity: 0; transform: scale(0.97) translateY(-6px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* Modal Header */
    .ds-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--ds-color-border, #242a36);
      background: var(--ds-color-panel-2, #161a23);
    }

    .ds-modal-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ds-modal-icon-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--ds-radius-control, 5px);
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 15%, transparent);
      color: var(--ds-color-accent, #67e8f9);
      border: 1px solid color-mix(in srgb, var(--ds-color-accent, #67e8f9) 30%, transparent);
    }

    .ds-modal-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--ds-color-text, #e5e7eb);
    }

    .ds-modal-subtitle {
      font-size: 10.5px;
      color: var(--ds-color-muted-text, #9ca3af);
    }

    .ds-modal-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ds-color-muted-text, #9ca3af);
      cursor: pointer;
      border-radius: var(--ds-radius-control, 5px);
      transition: all 0.15s ease;
    }
    .ds-modal-close:hover {
      background: var(--ds-color-panel-2, #1e2433);
      color: var(--ds-color-text, #ffffff);
      border-color: var(--ds-color-border, #374151);
    }

    /* Modal Body (Multi-Card Container) */
    .ds-label-modal-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: calc(90vh - 120px);
    }

    /* Custom Scrollbars */
    .ds-label-modal-body::-webkit-scrollbar,
    .ds-font-list::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .ds-label-modal-body::-webkit-scrollbar-track,
    .ds-font-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .ds-label-modal-body::-webkit-scrollbar-thumb,
    .ds-font-list::-webkit-scrollbar-thumb {
      background: var(--ds-color-border, #242a36);
      border-radius: 3px;
    }
    .ds-label-modal-body::-webkit-scrollbar-thumb:hover,
    .ds-font-list::-webkit-scrollbar-thumb:hover {
      background: var(--ds-color-accent, #67e8f9);
    }

    /* Section Card */
    .ds-label-card {
      box-sizing: border-box;
      background: var(--ds-color-card, #12151c);
      border: 1px solid var(--ds-color-card-border, #242a36);
      border-radius: var(--ds-radius-card, 8px);
      padding: var(--ds-card-padding, 10px);
      display: flex;
      flex-direction: column;
      gap: var(--ds-gap-sm, 6px);
      width: 100%;
    }

    .ds-label-card .ds-ui-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
    }

    .ds-label-card .ds-ui-card-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .ds-label-card .ds-ui-card-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ds-color-text, #e5e7eb);
    }

    .ds-label-card .ds-ui-card-body {
      display: flex;
      flex-direction: column;
      gap: var(--ds-gap-sm, 6px);
      width: 100%;
    }

    /* CARD 1: Textarea & Live Stage */
    .ds-label-textarea {
      width: 100% !important;
      min-height: 52px;
      max-height: 120px;
      background: var(--ds-color-panel-2, #161a23) !important;
      color: var(--ds-color-text, #ffffff) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 5px);
      padding: 8px 10px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.4;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
      transition: border-color var(--ds-transition, 120ms ease), box-shadow var(--ds-transition, 120ms ease);
    }
    .ds-label-textarea:focus {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      box-shadow: 0 0 0 2px var(--ds-color-focus-ring, rgba(103, 232, 249, 0.25));
    }

    .ds-preview-stage {
      position: relative;
      min-height: 90px;
      max-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      border-radius: var(--ds-radius-control, 5px);
      border: 1px solid var(--ds-color-border, #242a36);
      background-color: #11141b;
      background-image:
        linear-gradient(45deg, #1b202c 25%, transparent 25%),
        linear-gradient(-45deg, #1b202c 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #1b202c 75%),
        linear-gradient(-45deg, transparent 75%, #1b202c 75%);
      background-size: 14px 14px;
      background-position: 0 0, 0 7px, 7px -7px, -7px 0px;
      overflow: auto;
      box-sizing: border-box;
    }

    .ds-preview-card {
      box-sizing: border-box;
      max-width: 100%;
      word-break: break-word;
      white-space: pre-wrap;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .ds-preview-badge {
      position: absolute;
      bottom: 4px;
      right: 6px;
      font-size: 9.5px;
      color: var(--ds-color-muted-text, #9ca3af);
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      padding: 2px 6px;
      border-radius: var(--ds-radius-badge, 4px);
      pointer-events: none;
    }

    /* CARD 2: Typography Row */
    .ds-typography-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .ds-font-select {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    .ds-font-select-trigger {
      width: 100%;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      background: var(--ds-color-panel-2, #161a23) !important;
      color: var(--ds-color-text, #ffffff) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 5px);
      font-size: 12px;
      cursor: pointer;
      box-sizing: border-box;
      user-select: none;
      transition: border-color var(--ds-transition, 120ms ease);
    }
    .ds-font-select-trigger:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
    }

    .ds-font-select-name {
      color: var(--ds-color-text, #ffffff) !important;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 6px;
    }

    .ds-font-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      width: 100%;
      min-width: 240px;
      max-height: 240px;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 6px);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8);
      z-index: 100100;
      flex-direction: column;
      overflow: hidden;
    }
    .ds-font-dropdown.is-open {
      display: flex;
    }

    .ds-font-search-box {
      padding: 6px;
      background: var(--ds-color-card, #12151c) !important;
      border-bottom: 1px solid var(--ds-color-border, #242a36) !important;
    }
    .ds-font-search-input {
      width: 100% !important;
      height: 26px !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      color: var(--ds-color-text, #ffffff) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: 4px !important;
      padding: 0 8px !important;
      font-size: 11.5px !important;
      outline: none !important;
      box-sizing: border-box !important;
    }
    .ds-font-search-input:focus {
      border-color: var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-font-search-input::placeholder {
      color: var(--ds-color-muted-text, #9ca3af) !important;
    }

    .ds-font-list {
      overflow-y: auto;
      max-height: 180px;
      display: flex;
      flex-direction: column;
    }

    .ds-font-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      color: var(--ds-color-text, #f8fafc) !important;
      background: transparent;
      transition: background 0.1s, color 0.1s;
    }
    .ds-font-item-name {
      color: var(--ds-color-text, #f8fafc) !important;
      font-size: 12px;
    }
    .ds-font-item-badge {
      font-size: 9px;
      border: 1px solid var(--ds-color-border, rgba(255, 255, 255, 0.15)) !important;
      color: var(--ds-color-muted-text, #9ca3af) !important;
      border-radius: 3px;
      padding: 1px 5px;
    }
    .ds-font-item:hover {
      background: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
    }
    .ds-font-item:hover .ds-font-item-name,
    .ds-font-item:hover .ds-font-item-badge {
      color: var(--ds-color-on-accent, #0a0c10) !important;
      border-color: var(--ds-color-on-accent, #0a0c10) !important;
    }
    .ds-font-item.is-selected {
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 15%, transparent) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      font-weight: 600;
    }
    .ds-font-item.is-selected .ds-font-item-name {
      color: var(--ds-color-accent, #67e8f9) !important;
    }

    /* Segmented Groups (B/I/U & Alignment) */
    .ds-segmented-group {
      display: inline-flex;
      background: var(--ds-color-panel-2, #161a23);
      border: 1px solid var(--ds-color-border, #242a36);
      border-radius: var(--ds-radius-control, 5px);
      padding: 2px;
      gap: 2px;
      box-sizing: border-box;
    }

    .ds-seg-btn {
      width: 26px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none !important;
      border-radius: 3px !important;
      background: transparent !important;
      color: var(--ds-color-muted-text, #9ca3af) !important;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--ds-transition, 120ms ease);
      padding: 0 !important;
    }
    .ds-seg-btn:hover {
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 20%, transparent) !important;
      color: var(--ds-color-text, #ffffff) !important;
    }
    .ds-seg-btn.is-active {
      background: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      font-weight: bold;
    }

    /* Row Layouts with Sliders & Steppers */
    .ds-ctrl-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .ds-ctrl-label {
      font-size: 11.5px;
      color: var(--ds-color-text, #e5e7eb);
      min-width: 65px;
    }

    .ds-slider-range {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--ds-color-panel-2, #161a23);
      border: 1px solid var(--ds-color-border, #242a36);
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
      background: var(--ds-color-accent, #67e8f9);
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.6);
      transition: transform 0.1s ease;
    }
    .ds-slider-range::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Continuous Hold Stepper with Strictly Centered Values */
    .ds-stepper-wrap {
      display: flex;
      align-items: center;
      width: 64px;
      height: 24px;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 4px);
      overflow: hidden;
      box-sizing: border-box;
    }

    .ds-stepper-input {
      width: 44px !important;
      height: 100% !important;
      border: none !important;
      background: transparent !important;
      color: var(--ds-color-text, #ffffff) !important;
      font-size: 11px;
      text-align: center !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
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
      width: 18px;
      height: 100%;
      border-left: 1px solid var(--ds-color-border, #242a36);
    }

    .ds-stepper-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--ds-color-muted-text, #9ca3af);
      cursor: pointer;
      padding: 0;
      transition: all 0.1s ease;
    }
    .ds-stepper-btn:hover {
      background: var(--ds-color-accent, #67e8f9);
      color: var(--ds-color-on-accent, #0a0c10);
    }

    /* CARD 3: Color Engine */
    .ds-color-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
    }
    .ds-color-tab {
      flex: 1;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      color: var(--ds-color-muted-text, #9ca3af) !important;
      font-size: 11.5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ds-color-tab.is-active {
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 15%, transparent) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      font-weight: 600;
    }

    .ds-tab-swatch {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.4);
      display: inline-block;
    }

    .ds-color-engine {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ds-color-top-row {
      display: flex;
      gap: 12px;
    }

    .ds-color-picker-left {
      display: flex;
      gap: 8px;
    }

    .ds-satval-wrap {
      position: relative;
      width: 170px;
      height: 115px;
      border-radius: var(--ds-radius-control, 4px);
      overflow: hidden;
      cursor: crosshair;
      touch-action: none;
      border: 1px solid var(--ds-color-border, #242a36);
    }
    .ds-satval-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .ds-satval-reticle {
      position: absolute;
      width: 11px;
      height: 11px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .ds-hue-wrap {
      position: relative;
      width: 18px;
      height: 115px;
      cursor: pointer;
      touch-action: none;
      border: 1px solid var(--ds-color-border, #242a36);
      border-radius: var(--ds-radius-control, 4px);
    }
    .ds-hue-bar {
      width: 100%;
      height: 100%;
      border-radius: 3px;
      background: linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    }
    .ds-hue-scrub {
      position: absolute;
      left: -2px;
      right: -2px;
      height: 4px;
      border: 1px solid #ffffff;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 2px;
      transform: translateY(-50%);
      pointer-events: none;
    }

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
      height: 115px;
    }
    .ds-swatch-cell {
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 3px;
      cursor: pointer;
      transition: transform 0.1s ease, border-color 0.1s ease;
      padding: 0;
      box-sizing: border-box;
      outline: none;
    }
    .ds-swatch-cell:hover {
      transform: scale(1.18);
      border-color: #ffffff !important;
      z-index: 2;
    }

    .ds-color-bottom-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ds-active-swatch {
      width: 26px;
      height: 26px;
      border-radius: var(--ds-radius-control, 4px);
      border: 1px solid var(--ds-color-border, #242a36);
      flex-shrink: 0;
    }
    .ds-hex-input {
      width: 84px !important;
      height: 26px !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      color: var(--ds-color-text, #ffffff) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 4px);
      font-family: monospace;
      font-size: 11.5px;
      text-align: center;
      outline: none;
      box-sizing: border-box;
      transition: border-color var(--ds-transition, 120ms ease);
    }
    .ds-hex-input:focus {
      border-color: var(--ds-color-accent, #67e8f9) !important;
    }

    .ds-transparent-btn {
      margin-left: auto;
      height: 26px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 4px);
      color: var(--ds-color-muted-text, #9ca3af) !important;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ds-transparent-btn:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-text, #ffffff) !important;
    }
    .ds-transparent-btn.is-active {
      border-color: var(--ds-color-danger, #ef4444) !important;
      background: color-mix(in srgb, var(--ds-color-danger, #ef4444) 15%, transparent) !important;
      color: var(--ds-color-danger, #ef4444) !important;
      font-weight: 600;
    }
    .ds-checkered-icon {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background:
        linear-gradient(45deg, #555 25%, transparent 25%),
        linear-gradient(-45deg, #555 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #555 75%),
        linear-gradient(-45deg, transparent 75%, #555 75%);
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

    /* CARD 4: Geometry & Spacing Grid */
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
      width: 76px;
      color: var(--ds-color-text, #d1d5db);
      flex-shrink: 0;
    }

    /* Modal Footer */
    .ds-modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-top: 1px solid var(--ds-color-border, #242a36);
      background: var(--ds-color-panel-2, #161a23);
    }
    .ds-footer-right {
      display: flex;
      gap: 8px;
    }

    .ds-modal-footer .ds-ui-btn {
      height: 28px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 500;
      border-radius: var(--ds-radius-control, 5px);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      user-select: none;
      box-sizing: border-box;
      outline: none;
    }

    .ds-btn-reset {
      background: transparent !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      color: var(--ds-color-muted-text, #9ca3af) !important;
    }
    .ds-btn-reset:hover {
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 15%, transparent) !important;
      color: var(--ds-color-text, #ffffff) !important;
      border-color: var(--ds-color-border-hover, #374151) !important;
    }

    .ds-btn-cancel {
      background: transparent !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      color: var(--ds-color-text, #e5e7eb) !important;
    }
    .ds-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.08) !important;
      border-color: var(--ds-color-border-hover, #374151) !important;
    }

    .ds-btn-save {
      background: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      border: 1px solid var(--ds-color-accent, #67e8f9) !important;
      font-weight: 700 !important;
    }
    .ds-btn-save:hover {
      background: var(--ds-color-accent-hover, #22d3ee) !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 35%, transparent);
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
