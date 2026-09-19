/**
 * DeathshotArsenal — DS Film Grain
 * GPU-accelerated GLSL shader film grain with real-time WebGL live preview.
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_FilmGrain";
const EXT_NAME = "DeathshotArsenal.DSFilmGrain";
const DEFAULT_SIZE = [340, 480];
const MIN_SIZE = [300, 420];
const CSS_ID = "ds-film-grain-css";

function log(...args) { console.log("[DS Film Grain]", ...args); }
function error(...args) { console.error("[DS Film Grain]", ...args); }
function url(path) { try { return api.apiURL ? api.apiURL(path) : path; } catch { return path; } }

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

let cssPromise = null;
function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.getElementById(CSS_ID)) return resolve();
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Film Grain/ds_film_grain.css?v=2";
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  return cssPromise;
}

// --- GLSL SHADER DEFINITIONS (WebGL2 / ES 3.0) ---

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
    v_texCoord = (a_position + 1.0) * 0.5;
    v_texCoord.y = 1.0 - v_texCoord.y;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform sampler2D u_image0;
uniform vec2 u_resolution;
uniform float u_float0; // grain amount      [0.0 – 1.0]
uniform float u_float1; // grain size        [0.01 – 2.0]
uniform float u_float2; // color amount      [0.0 – 1.0]
uniform float u_float3; // shadow focus      [0.0 – 1.0]
uniform int   u_int0;   // noise mode        [0 or 1]

in vec2 v_texCoord;
layout(location = 0) out vec4 fragColor0;

uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

uint hash2d(uvec2 p) {
    return pcg(p.x + pcg(p.y));
}

float hashf(uvec2 p) {
    return float(hash2d(p)) / float(0xffffffffu);
}

float hashf(uvec2 p, uint offset) {
    return float(pcg(hash2d(p) + offset)) / float(0xffffffffu);
}

float toGaussian(uvec2 p) {
    float sum = hashf(p, 0u) + hashf(p, 1u) + hashf(p, 2u) + hashf(p, 3u);
    return (sum - 2.0) * 0.7;
}

float toGaussian(uvec2 p, uint offset) {
    float sum = hashf(p, offset) + hashf(p, offset + 1u) 
              + hashf(p, offset + 2u) + hashf(p, offset + 3u);
    return (sum - 2.0) * 0.7;
}

float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    uvec2 ui = uvec2(i);
    float a = toGaussian(ui);
    float b = toGaussian(ui + uvec2(1u, 0u));
    float c = toGaussian(ui + uvec2(0u, 1u));
    float d = toGaussian(ui + uvec2(1u, 1u));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float smoothNoise(vec2 p, uint offset) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    uvec2 ui = uvec2(i);
    float a = toGaussian(ui, offset);
    float b = toGaussian(ui + uvec2(1u, 0u), offset);
    float c = toGaussian(ui + uvec2(0u, 1u), offset);
    float d = toGaussian(ui + uvec2(1u, 1u), offset);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec4 color = texture(u_image0, v_texCoord);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec2 grainUV = v_texCoord * u_resolution / max(u_float1, 0.01);
    uvec2 grainPixel = uvec2(grainUV);
    
    float g;
    vec3 grainRGB;
    
    if (u_int0 == 1) {
        g = toGaussian(grainPixel);
        grainRGB = vec3(
            toGaussian(grainPixel, 100u),
            toGaussian(grainPixel, 200u),
            toGaussian(grainPixel, 300u)
        );
    } else {
        g = smoothNoise(grainUV);
        grainRGB = vec3(
            smoothNoise(grainUV, 100u),
            smoothNoise(grainUV, 200u),
            smoothNoise(grainUV, 300u)
        );
    }
    
    float lumWeight = mix(1.0, 1.0 - luma, clamp(u_float3, 0.0, 1.0));
    float strength = u_float0 * 0.15;
    vec3 grainColor = mix(vec3(g), grainRGB, clamp(u_float2, 0.0, 1.0));
    
    color.rgb += grainColor * strength * lumWeight;
    fragColor0 = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
`;

let activeFragmentShader = FRAGMENT_SHADER_SRC;

// --- WEBGL2 RENDERER CLASS ---

class WebGLFilmGrainRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    // Prefer WebGL2 for native ES 3.0 support
    this.gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, alpha: false });
    this.program = null;
    this.uniforms = {};
    this.texture = null;
    this.imageLoaded = false;
    this.imgWidth = 0;
    this.imgHeight = 0;
    this.hasError = false;
    this.errorMessage = "";

    if (!this.gl) {
      this.hasError = true;
      this.errorMessage = "WebGL2 not supported";
      error(this.errorMessage);
      return;
    }

    this.init();
  }

  init() {
    const gl = this.gl;
    try {
      const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fs = this.compileShader(gl.FRAGMENT_SHADER, activeFragmentShader);

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
      }

      this.program = prog;

      // Fullscreen quad buffer
      const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(prog, "a_position");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // Cache uniforms
      this.uniforms = {
        u_image0: gl.getUniformLocation(prog, "u_image0"),
        u_resolution: gl.getUniformLocation(prog, "u_resolution"),
        u_float0: gl.getUniformLocation(prog, "u_float0"), // amount
        u_float1: gl.getUniformLocation(prog, "u_float1"), // size
        u_float2: gl.getUniformLocation(prog, "u_float2"), // color
        u_float3: gl.getUniformLocation(prog, "u_float3"), // shadow focus
        u_int0: gl.getUniformLocation(prog, "u_int0"),     // mode
      };

      // Create texture
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      log("WebGL2 Film Grain shader ready");
    } catch (e) {
      this.hasError = true;
      this.errorMessage = e.message || "Shader init failed";
      error("Shader init failed:", e);
    }
  }

  compileShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }

  setImage(imageElement) {
    if (!this.gl || this.hasError || !imageElement) return;
    const gl = this.gl;
    try {
      this.imgWidth = imageElement.naturalWidth || imageElement.width || 512;
      this.imgHeight = imageElement.naturalHeight || imageElement.height || 512;

      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);

      this.imageLoaded = true;
      this.canvas.width = Math.min(this.imgWidth, 1024);
      this.canvas.height = Math.round(this.canvas.width * (this.imgHeight / this.imgWidth));
    } catch (e) {
      error("Texture upload failed:", e);
    }
  }

  render(params) {
    if (!this.gl || this.hasError || !this.imageLoaded) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.u_image0, 0);

    gl.uniform2f(this.uniforms.u_resolution, this.imgWidth || this.canvas.width, this.imgHeight || this.canvas.height);
    gl.uniform1f(this.uniforms.u_float0, params.amount);
    gl.uniform1f(this.uniforms.u_float1, params.size);
    gl.uniform1f(this.uniforms.u_float2, params.color);
    gl.uniform1f(this.uniforms.u_float3, params.shadow);
    gl.uniform1i(this.uniforms.u_int0, params.mode === "Grainy" ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy() {
    if (!this.gl) return;
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.program) this.gl.deleteProgram(this.program);
  }
}

// --- DEATHSHOT SIGNATURE HORIZONTAL BAR SLIDER FACTORY ---

function createBarSlider(options) {
  const min = Number(options.min ?? 0);
  const max = Number(options.max ?? 1);
  const step = Number(options.step ?? 0.01);
  const labelText = options.label || "";
  let currentValue = clamp(Number(options.value ?? min), min, max);

  const row = document.createElement("div");
  row.className = "ds-fg-bar-row";
  row.tabIndex = 0;

  const fill = document.createElement("div");
  fill.className = "ds-fg-bar-fill";

  // Layer 1: Text visible over unfilled track
  const trackLayer = document.createElement("div");
  trackLayer.className = "ds-fg-bar-text-layer ds-fg-bar-layer-track";
  const lblTrack = document.createElement("span");
  lblTrack.className = "ds-fg-bar-label";
  lblTrack.textContent = labelText;
  const valTrack = document.createElement("span");
  valTrack.className = "ds-fg-bar-value";
  trackLayer.append(lblTrack, valTrack);

  // Layer 2: Text visible over active filled accent
  const fillLayer = document.createElement("div");
  fillLayer.className = "ds-fg-bar-text-layer ds-fg-bar-layer-fill";
  const lblFill = document.createElement("span");
  lblFill.className = "ds-fg-bar-label";
  lblFill.textContent = labelText;
  const valFill = document.createElement("span");
  valFill.className = "ds-fg-bar-value";
  fillLayer.append(lblFill, valFill);

  row.append(fill, trackLayer, fillLayer);

  const format = (v) => Number(v).toFixed(2);

  const updateVisuals = (v) => {
    const p = max > min ? clamp(((v - min) / (max - min)) * 100, 0, 100) : 0;
    fill.style.width = `${p}%`;
    trackLayer.style.clipPath = `inset(0 0 0 ${p}%)`;
    fillLayer.style.clipPath = `inset(0 calc(100% - ${p}%) 0 0)`;
    const text = format(v);
    valTrack.textContent = text;
    valFill.textContent = text;
  };

  updateVisuals(currentValue);

  let isDragging = false;

  const handlePointer = (e) => {
    const rect = row.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    let next = min + ratio * (max - min);
    if (step > 0) next = Math.round(next / step) * step;
    next = clamp(next, min, max);
    currentValue = next;
    updateVisuals(currentValue);
    options.onChange?.(currentValue);
  };

  row.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (row.querySelector(".ds-fg-bar-edit-input")) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    row.setPointerCapture(e.pointerId);
    handlePointer(e);
  });

  row.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    handlePointer(e);
  });

  const stopDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { row.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  row.addEventListener("pointerup", stopDrag);
  row.addEventListener("pointercancel", stopDrag);

  // Direct numeric editing on double-click
  row.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (row.querySelector(".ds-fg-bar-edit-input")) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ds-fg-bar-edit-input";
    input.value = currentValue.toFixed(2);
    row.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const finish = (save) => {
      if (committed) return;
      committed = true;
      if (save) {
        const parsed = parseFloat(input.value);
        if (!isNaN(parsed)) {
          currentValue = clamp(parsed, min, max);
          updateVisuals(currentValue);
          options.onChange?.(currentValue);
        }
      }
      input.remove();
    };

    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") finish(true);
      else if (ev.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  });

  return {
    root: row,
    getValue: () => currentValue,
    setValue: (val, fire = false) => {
      currentValue = clamp(Number(val), min, max);
      updateVisuals(currentValue);
      if (fire) options.onChange?.(currentValue);
    }
  };
}

// --- NODE STATE & SERIALIZATION ---

function getNodeState(node) {
  return node._dsFilmGrainState || (node._dsFilmGrainState = {
    amount: 0.30,
    size: 0.50,
    color: 0.00,
    shadow: 0.00,
    mode: "Smooth",
    imgUrl: "",
    dims: null,
    renderer: null,
  });
}

function syncWidgetsFromState(node) {
  const s = getNodeState(node);
  const findWidget = (name) => (node.widgets || []).find((w) => w.name === name);

  const wAmount = findWidget("grain_amount");
  if (wAmount) wAmount.value = s.amount;
  const wSize = findWidget("grain_size");
  if (wSize) wSize.value = s.size;
  const wColor = findWidget("color_amount");
  if (wColor) wColor.value = s.color;
  const wShadow = findWidget("shadow_focus");
  if (wShadow) wShadow.value = s.shadow;
  const wMode = findWidget("grain_mode");
  if (wMode) wMode.value = s.mode;
}

function hideNativeWidgets(node) {
  const names = ["grain_amount", "grain_size", "color_amount", "shadow_focus", "grain_mode"];
  (node.widgets || []).forEach((w) => {
    if (names.includes(w.name)) {
      w.hidden = true;
      w.computeSize = () => [0, 0];
    }
  });
}

function persistState(node) {
  const s = getNodeState(node);
  node.properties = node.properties || {};
  node.properties.ds_film_grain_amount = s.amount;
  node.properties.ds_film_grain_size = s.size;
  node.properties.ds_film_grain_color = s.color;
  node.properties.ds_film_grain_shadow = s.shadow;
  node.properties.ds_film_grain_mode = s.mode;
  if (s.imgUrl) node.properties.ds_film_grain_last_url = s.imgUrl;
  if (s.dims) node.properties.ds_film_grain_last_dims = s.dims;
  syncWidgetsFromState(node);
}

// --- DOM BUILDER ---

function buildUI(node) {
  const root = document.createElement("div");
  root.className = "ds-fg-root";
  root.dataset.dsThemed = "true";

  root.innerHTML = `
    <div class="ds-fg-header">
      <div class="ds-fg-title-box">
        <span class="ds-fg-badge">GLSL</span>
        <span class="ds-fg-title">DS FILM GRAIN</span>
      </div>
      <div class="ds-fg-status is-idle">
        <span class="ds-fg-status-dot"></span>
        <span class="ds-fg-status-text">READY</span>
      </div>
    </div>
    <div class="ds-fg-viewport">
      <canvas class="ds-fg-canvas is-hidden"></canvas>
      <div class="ds-fg-placeholder">
        <div class="ds-fg-placeholder-icon">🎞️</div>
        <strong>NO IMAGE CONNECTED</strong>
        <span>Queue workflow to initialize GPU grain preview</span>
      </div>
      <div class="ds-fg-hud-dims" hidden></div>
    </div>
    <div class="ds-fg-controls"></div>
  `;

  const canvas = root.querySelector(".ds-fg-canvas");
  const placeholder = root.querySelector(".ds-fg-placeholder");
  const hudDims = root.querySelector(".ds-fg-hud-dims");
  const controlsStack = root.querySelector(".ds-fg-controls");
  const statusEl = root.querySelector(".ds-fg-status");
  const statusText = root.querySelector(".ds-fg-status-text");

  const s = getNodeState(node);
  s.renderer = new WebGLFilmGrainRenderer(canvas);

  if (s.renderer.hasError) {
    statusEl.className = "ds-fg-status is-error";
    statusText.textContent = "SHADER ERR";
    placeholder.querySelector("strong").textContent = "SHADER FAILED";
    placeholder.querySelector("span").textContent = s.renderer.errorMessage;
  }

  const triggerLiveRender = () => {
    if (!s.renderer || s.renderer.hasError) return;
    s.renderer.render({
      amount: s.amount,
      size: s.size,
      color: s.color,
      shadow: s.shadow,
      mode: s.mode
    });
    node.setDirtyCanvas?.(true, true);
  };

  // Build Deathshot Bar Sliders
  const sAmount = createBarSlider({
    label: "Grain Amount",
    min: 0.00,
    max: 1.00,
    step: 0.01,
    value: s.amount,
    onChange: (val) => {
      s.amount = val;
      persistState(node);
      triggerLiveRender();
    }
  });

  const sSize = createBarSlider({
    label: "Grain Size",
    min: 0.01,
    max: 2.00,
    step: 0.01,
    value: s.size,
    onChange: (val) => {
      s.size = val;
      persistState(node);
      triggerLiveRender();
    }
  });

  const sColor = createBarSlider({
    label: "Color Amount",
    min: 0.00,
    max: 1.00,
    step: 0.01,
    value: s.color,
    onChange: (val) => {
      s.color = val;
      persistState(node);
      triggerLiveRender();
    }
  });

  const sShadow = createBarSlider({
    label: "Shadow Focus",
    min: 0.00,
    max: 1.00,
    step: 0.01,
    value: s.shadow,
    onChange: (val) => {
      s.shadow = val;
      persistState(node);
      triggerLiveRender();
    }
  });

  controlsStack.append(sAmount.root, sSize.root, sColor.root, sShadow.root);

  // Grain Mode Buttons
  const modeWrap = document.createElement("div");
  modeWrap.className = "ds-fg-mode-wrap";

  const modeTitle = document.createElement("div");
  modeTitle.className = "ds-fg-mode-title";
  modeTitle.textContent = "Grain Mode";

  const modeButtons = document.createElement("div");
  modeButtons.className = "ds-fg-mode-buttons";

  const btnSmooth = document.createElement("button");
  btnSmooth.type = "button";
  btnSmooth.className = `ds-fg-mode-btn ${s.mode === "Smooth" ? "is-active" : ""}`;
  btnSmooth.textContent = "Smooth";

  const btnGrainy = document.createElement("button");
  btnGrainy.type = "button";
  btnGrainy.className = `ds-fg-mode-btn ${s.mode === "Grainy" ? "is-active" : ""}`;
  btnGrainy.textContent = "Grainy";

  const setMode = (mode) => {
    s.mode = mode;
    btnSmooth.classList.toggle("is-active", mode === "Smooth");
    btnGrainy.classList.toggle("is-active", mode === "Grainy");
    persistState(node);
    triggerLiveRender();
  };

  btnSmooth.addEventListener("click", (e) => {
    e.stopPropagation();
    setMode("Smooth");
  });

  btnGrainy.addEventListener("click", (e) => {
    e.stopPropagation();
    setMode("Grainy");
  });

  modeButtons.append(btnSmooth, btnGrainy);
  modeWrap.append(modeTitle, modeButtons);
  controlsStack.appendChild(modeWrap);

  node._dsFilmGrainControls = {
    sAmount,
    sSize,
    sColor,
    sShadow,
    setMode,
    canvas,
    placeholder,
    hudDims,
    statusEl,
    statusText,
    triggerLiveRender
  };

  return root;
}

function loadPreviewImage(node, imgPath, dims) {
  const s = getNodeState(node);
  const ctrl = node._dsFilmGrainControls;
  if (!ctrl) return;

  s.imgUrl = imgPath;
  s.dims = dims;
  persistState(node);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctrl.placeholder.classList.add("is-hidden");
    ctrl.canvas.classList.remove("is-hidden");
    ctrl.statusEl.className = "ds-fg-status";
    ctrl.statusText.textContent = "GPU LIVE";

    if (dims && dims.length === 2) {
      ctrl.hudDims.textContent = `${dims[0]} × ${dims[1]}`;
      ctrl.hudDims.hidden = false;
    }

    s.renderer.setImage(img);
    ctrl.triggerLiveRender();
  };
  img.onerror = () => {
    ctrl.placeholder.classList.remove("is-hidden");
    ctrl.canvas.classList.add("is-hidden");
    ctrl.statusEl.className = "ds-fg-status is-error";
    ctrl.statusText.textContent = "LOAD ERR";
  };
  img.src = url(imgPath);
}

// --- NODE INSTALLATION ---

function install(node) {
  if (node._dsFilmGrainInstalled) return;
  node._dsFilmGrainInstalled = true;
  node.resizable = true;

  if (!Array.isArray(node.size) || node.size[0] < MIN_SIZE[0] || node.size[1] < MIN_SIZE[1]) {
    node.size = [...DEFAULT_SIZE];
  }

  const s = getNodeState(node);
  if (node.properties?.ds_film_grain_amount !== undefined) s.amount = Number(node.properties.ds_film_grain_amount);
  if (node.properties?.ds_film_grain_size !== undefined) s.size = Number(node.properties.ds_film_grain_size);
  if (node.properties?.ds_film_grain_color !== undefined) s.color = Number(node.properties.ds_film_grain_color);
  if (node.properties?.ds_film_grain_shadow !== undefined) s.shadow = Number(node.properties.ds_film_grain_shadow);
  if (node.properties?.ds_film_grain_mode) s.mode = node.properties.ds_film_grain_mode;

  const root = buildUI(node);
  node._dsFilmGrainRoot = root;

  window.DSGlobalTheme?.bindNode?.(root, node);
  hideNativeWidgets(node);

  if (typeof node.addDOMWidget === "function") {
    node._dsFilmGrainWidget = node.addDOMWidget("ds_film_grain_ui", "div", root, {
      serialize: false,
      hideOnZoom: false,
      margin: 4,
      getMinHeight: () => MIN_SIZE[1] - 30,
      getHeight: () => Math.max(MIN_SIZE[1] - 30, (Number(node.size?.[1]) || DEFAULT_SIZE[1]) - 30),
    });
  }

  hideNativeWidgets(node);
  persistState(node);

  if (node.properties?.ds_film_grain_last_url) {
    setTimeout(() => {
      loadPreviewImage(node, node.properties.ds_film_grain_last_url, node.properties.ds_film_grain_last_dims);
    }, 100);
  }
}

// --- EXTENSION REGISTRATION ---

app.registerExtension({
  name: EXT_NAME,
  async setup() {
    await loadCss();

    try {
      const resp = await api.fetchApi("/ds/film_grain/shader");
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && data.shader) {
          activeFragmentShader = data.shader;
          log("Dynamically loaded latest Film Grain shader from ComfyUI blueprint");
        }
      }
    } catch (_) {}

    api.addEventListener("executed", (e) => {
      const data = e.detail;
      const outputs = data?.output?.film_grain;
      if (!outputs?.length) return;

      let node = app.graph?.getNodeById?.(data.node);
      if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(data.node));
      if (!node || node.type !== TYPE) return;

      const item = outputs[0];
      if (item.preview?.filename) {
        const fullUrl = `/view?filename=${encodeURIComponent(item.preview.filename)}&type=${item.preview.type || "temp"}&subfolder=${encodeURIComponent(item.preview.subfolder || "")}&t=${Date.now()}`;
        loadPreviewImage(node, fullUrl, item.dims);
      }
    });

    log("DS Film Grain extension registered");
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;

    const oldCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const res = oldCreated?.apply(this, arguments);
      install(this);
      return res;
    };

    const oldConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const res = oldConfigure?.apply(this, arguments);
      if (!this.properties) this.properties = {};
      const s = getNodeState(this);

      if (this.properties.ds_film_grain_amount !== undefined) s.amount = Number(this.properties.ds_film_grain_amount);
      if (this.properties.ds_film_grain_size !== undefined) s.size = Number(this.properties.ds_film_grain_size);
      if (this.properties.ds_film_grain_color !== undefined) s.color = Number(this.properties.ds_film_grain_color);
      if (this.properties.ds_film_grain_shadow !== undefined) s.shadow = Number(this.properties.ds_film_grain_shadow);
      if (this.properties.ds_film_grain_mode) s.mode = this.properties.ds_film_grain_mode;

      const ctrl = this._dsFilmGrainControls;
      if (ctrl) {
        ctrl.sAmount.setValue(s.amount);
        ctrl.sSize.setValue(s.size);
        ctrl.sColor.setValue(s.color);
        ctrl.sShadow.setValue(s.shadow);
        ctrl.setMode(s.mode);
      }

      hideNativeWidgets(this);
      syncWidgetsFromState(this);

      if (this.properties.ds_film_grain_last_url) {
        setTimeout(() => {
          loadPreviewImage(this, this.properties.ds_film_grain_last_url, this.properties.ds_film_grain_last_dims);
        }, 100);
      }

      return res;
    };

    const oldResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (size[0] < MIN_SIZE[0]) size[0] = MIN_SIZE[0];
      if (size[1] < MIN_SIZE[1]) size[1] = MIN_SIZE[1];
      return oldResize?.apply(this, arguments);
    };

    const oldRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const s = getNodeState(this);
      if (s.renderer) {
        s.renderer.destroy();
        s.renderer = null;
      }
      return oldRemoved?.apply(this, arguments);
    };
  },
});
