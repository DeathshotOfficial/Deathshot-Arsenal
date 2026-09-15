import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_RunTimer";
const EXT = "DeathshotArsenal.DS_RunTimer";
const CSS = "/extensions/DeathshotArsenal/Run Timer/ds_run_timer.css";
const BASE_W = 175;
const BASE_H = 42;

const SOUND_OPTIONS = [
  ["chime", "Chime"],
  ["double", "Double Beep"],
  ["digital", "Digital"],
  ["bell", "Bell"],
  ["soft", "Soft Pulse"],
  ["none", "None"]
];

const log = (...a) => { console.info("[DS Run Timer]", ...a); terminalLog("log", a.map(String).join(" ")); };
const warn = (...a) => { console.warn("[DS Run Timer]", ...a); terminalLog("warn", a.map(String).join(" ")); };
const errorLog = (...a) => { console.error("[DS Run Timer]", ...a); terminalLog("error", a.map(String).join(" ")); };
let terminalQueue = Promise.resolve();
function terminalLog(event, detail) {
  // Do not block UI on diagnostics. The backend route is intentionally tiny.
  terminalQueue = terminalQueue.then(() => fetch("/ds/run_timer/log", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, detail })
  }).catch(() => {}));
}

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

function isVue() { return !!window.LiteGraph?.vueNodesMode; }
function graphLoading() { return !!app?.graph?.loading || !!app?.graph?._loading; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function themeVar(name, fallback) {
  try { return window.DSGlobalTheme?.getVar?.(name, fallback) || fallback; }
  catch (_) { return fallback; }
}
function palette() {
  return {
    bg: themeVar("--ds-bg", "#0b0d12"),
    panel: themeVar("--ds-panel", "#171a20"),
    panel2: themeVar("--ds-panel-2", "#20242c"),
    text: themeVar("--ds-text", "#e8ebef"),
    muted: themeVar("--ds-text-muted", "#8d96a3"),
    border: themeVar("--ds-border", "#343a45"),
    accent: themeVar("--ds-accent", "#67e8f9"),
  };
}

const GEAR = `<svg viewBox="0 0 24 24"><path d="M9.7 2.8h4.6l.7 2.2c.5.2 1 .4 1.4.8l2.2-.6 2.3 4-1.6 1.6c.1.5.1 1 0 1.5l1.6 1.6-2.3 4-2.2-.6c-.4.4-.9.6-1.4.8l-.7 2.2H9.7L9 17.9c-.5-.2-1-.4-1.4-.8l-2.2.6-2.3-4 1.6-1.6c-.1-.5-.1-1 0-1.5L3.1 9.2l2.3-4 2.2.6c.4-.4.9-.6 1.4-.8l.7-2.2Z"/><circle cx="12" cy="12" r="3.1"/></svg>`;
const PLAY = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z"/></svg>`;

function rr(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function ensureState(node) {
  node.properties ||= {};
  const defaults = {
    version: 2,
    sound: "chime",
    volume: 0.65,
    soundEnabled: true,
    mute: false,
  };
  let saved = node.properties.ds_run_timer;
  if (!saved || typeof saved !== "object") saved = {};
  node.properties.ds_run_timer = { ...defaults, ...saved };
  return node.properties.ds_run_timer;
}

function saveState(node) {
  node.properties ||= {};
  node.properties.ds_run_timer = { ...ensureState(node) };
  node.setDirtyCanvas?.(true, true);
}

function ensureAudio() {
  if (!window._dsRunTimerAudio) {
    try {
      window._dsRunTimerAudio = new (window.AudioContext || window.webkitAudioContext)();
      log("AudioContext created");
    } catch (e) { errorLog("AudioContext unavailable", e); }
  }
  const a = window._dsRunTimerAudio;
  if (a?.state === "suspended") a.resume().catch(() => {});
  return a;
}

document.addEventListener("pointerdown", () => { ensureAudio(); }, { once: false, passive: true });

function tone(ctx, freq, duration, when, gain, type = "sine") {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function playFinishSound(node) {
  const s = ensureState(node);
  if (!s.soundEnabled || s.mute || s.sound === "none") { log("Finish sound suppressed", s.sound, s.mute); return; }
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.015;
  const g = clamp(Number(s.volume) || 0, 0, 1) * 0.20;
  try {
    if (s.sound === "chime") {
      tone(ctx, 880, .20, now, g, "sine");
      tone(ctx, 1320, .32, now + .13, g * .85, "sine");
    } else if (s.sound === "double") {
      tone(ctx, 660, .12, now, g, "square");
      tone(ctx, 880, .16, now + .17, g, "square");
    } else if (s.sound === "digital") {
      tone(ctx, 1047, .08, now, g, "square");
      tone(ctx, 1319, .08, now + .10, g, "square");
      tone(ctx, 1568, .18, now + .20, g, "square");
    } else if (s.sound === "bell") {
      tone(ctx, 523, .75, now, g, "sine");
      tone(ctx, 1047, .55, now + .02, g * .42, "sine");
    } else if (s.sound === "soft") {
      tone(ctx, 740, .28, now, g, "triangle");
      tone(ctx, 988, .38, now + .20, g * .7, "triangle");
    }
    log("Finish sound played", s.sound, `volume=${s.volume}`);
  } catch (e) { errorLog("Finish sound failed", e); }
}

function allTimers() {
  return (app.graph?._nodes || []).filter(n => n?.type === TYPE || n?.comfyClass === TYPE);
}

function startAll() { allTimers().forEach(n => n.startRun?.()); }
function stopAll(reason) { allTimers().forEach(n => n.stopRun?.(reason)); }

function buttonHit(node, pos) {
  if (!pos || !node._dsTimerHit) return null;
  const [x, y] = pos;
  for (const b of node._dsTimerHit) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function popupTheme(popup) {
  popup.dataset.dsThemed = "true";
  try {
    const root = getComputedStyle(document.documentElement);
    for (const key of ["--ds-bg","--ds-panel","--ds-panel-2","--ds-text","--ds-text-muted","--ds-border","--ds-accent","--ds-font"]) {
      const value = root.getPropertyValue(key).trim();
      if (value) popup.style.setProperty(key, value);
    }
  } catch (_) {}
}

const OPEN_POPUPS = new Map();
let popupGlobalsInstalled = false;

function timerScreenRect(node) {
  const canvas = app?.canvas?.canvas || document.querySelector("canvas");
  const ds = app?.canvas?.ds;
  if (!canvas || !ds) return null;
  const rect = canvas.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const offset = ds.offset || [0, 0];
  return {
    left: rect.left + (Number(node.pos?.[0] || 0) + Number(offset[0] || 0)) * scale,
    top: rect.top + (Number(node.pos?.[1] || 0) + Number(offset[1] || 0)) * scale,
    width: Number(node.size?.[0] || BASE_W) * scale,
    height: Number(node.size?.[1] || BASE_H) * scale,
  };
}

function closeTimerSettings(node) {
  const item = OPEN_POPUPS.get(node?.id);
  if (!item) return;
  item.popup.remove();
  OPEN_POPUPS.delete(node.id);
}

function positionTimerSettings(node, popup) {
  const nr = timerScreenRect(node);
  if (!nr) return;
  const margin = 10;
  const pw = popup.offsetWidth || 300;
  const ph = popup.offsetHeight || 360;
  let left = nr.left + nr.width + 12;
  if (left + pw > innerWidth - margin) left = nr.left - pw - 12;
  left = Math.max(margin, Math.min(left, innerWidth - pw - margin));
  let top = nr.top;
  if (top + ph > innerHeight - margin) top = innerHeight - ph - margin;
  top = Math.max(margin, top);
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function timerSettingButton(label, active, callback, description = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `ds-rt-popup-choice${active ? " active" : ""}`;
  b.innerHTML = `<span class="ds-rt-popup-mark">${active ? "✓" : ""}</span><span class="ds-rt-popup-choice-copy"><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span>`;
  b.addEventListener("pointerdown", e => e.stopPropagation());
  b.addEventListener("click", e => { e.stopPropagation(); callback(); });
  return b;
}

function renderTimerSettings(node, popup) {
  const s = ensureState(node);
  popup.innerHTML = "";

  const head = document.createElement("div");
  head.className = "ds-rt-popup-head";
  head.innerHTML = `<div><div class="ds-rt-popup-brand">DS</div></div><div class="ds-rt-popup-head-copy"><strong>Run Timer</strong><small>Finish notification settings</small></div>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ds-rt-popup-close";
  close.textContent = "×";
  close.title = "Close";
  close.addEventListener("pointerdown", e => e.stopPropagation());
  close.addEventListener("click", () => closeTimerSettings(node));
  head.appendChild(close);
  popup.appendChild(head);

  const body = document.createElement("div");
  body.className = "ds-rt-popup-body";

  const playback = document.createElement("section");
  playback.className = "ds-rt-popup-section";
  playback.innerHTML = `<div class="ds-rt-popup-label">FINISH NOTIFICATION</div>`;
  const enable = timerSettingButton("Play finish sound", !!s.soundEnabled, () => {
    s.soundEnabled = !s.soundEnabled; saveState(node); renderTimerSettings(node, popup); log("soundEnabled", s.soundEnabled);
  }, "Play when the workflow completes");
  const mute = timerSettingButton("Mute audio", !!s.mute, () => {
    s.mute = !s.mute; saveState(node); renderTimerSettings(node, popup); log("mute", s.mute);
  }, "Temporarily suppress sound");
  playback.append(enable, mute);
  body.appendChild(playback);

  const sound = document.createElement("section");
  sound.className = "ds-rt-popup-section";
  sound.innerHTML = `<div class="ds-rt-popup-label">SOUND</div>`;
  const sounds = document.createElement("div");
  sounds.className = "ds-rt-popup-grid";
  for (const [id, label] of SOUND_OPTIONS) {
    sounds.appendChild(timerSettingButton(label, s.sound === id, () => {
      s.sound = id; saveState(node); renderTimerSettings(node, popup); log("sound", id);
    }));
  }
  sound.appendChild(sounds);
  body.appendChild(sound);

  const volume = document.createElement("section");
  volume.className = "ds-rt-popup-section";
  const value = Math.round(clamp(Number(s.volume), 0, 1) * 100);
  volume.innerHTML = `<div class="ds-rt-popup-label-row"><span class="ds-rt-popup-label">VOLUME</span><b>${value}%</b></div>`;
  const range = document.createElement("input");
  range.type = "range"; range.min = "0"; range.max = "100"; range.step = "5"; range.value = String(value);
  range.addEventListener("pointerdown", e => e.stopPropagation());
  range.addEventListener("input", e => {
    s.volume = Number(e.target.value) / 100;
    const out = volume.querySelector("b"); if (out) out.textContent = `${e.target.value}%`;
    saveState(node);
  });
  volume.appendChild(range);
  body.appendChild(volume);

  const test = document.createElement("button");
  test.type = "button";
  test.className = "ds-rt-popup-test";
  test.innerHTML = `${PLAY}<span>Test selected sound</span>`;
  test.addEventListener("pointerdown", e => e.stopPropagation());
  test.addEventListener("click", e => { e.stopPropagation(); playFinishSound(node); });
  body.appendChild(test);
  popup.appendChild(body);
  popupTheme(popup);
  requestAnimationFrame(() => positionTimerSettings(node, popup));
}

function openTimerSettings(node) {
  closeTimerSettings(node);
  const popup = document.createElement("div");
  popup.className = "ds-rt-popup";
  popup.addEventListener("pointerdown", e => e.stopPropagation());
  popup.addEventListener("mousedown", e => e.stopPropagation());
  document.body.appendChild(popup);
  OPEN_POPUPS.set(node.id, { node, popup });
  renderTimerSettings(node, popup);
  if (!popupGlobalsInstalled) {
    popupGlobalsInstalled = true;
    window.addEventListener("pointerdown", e => {
      for (const [id, item] of OPEN_POPUPS) {
        if (!item.popup.contains(e.target)) closeTimerSettings(item.node);
      }
    }, true);
    window.addEventListener("keydown", e => {
      if (e.key === "Escape") for (const item of OPEN_POPUPS.values()) closeTimerSettings(item.node);
    });
    window.addEventListener("resize", () => {
      for (const item of OPEN_POPUPS.values()) positionTimerSettings(item.node, item.popup);
    });
  }
  log("Settings popup opened");
}

function paint(node, ctx) {
  const w = Math.max(130, Number(node.size?.[0]) || BASE_W);
  const h = Math.max(34, Number(node.size?.[1]) || BASE_H);
  const c = palette();
  const st = node._dsTimer || { status: "READY", elapsed: 0, running: false };
  const isRunning = st.status === "RUNNING" || !!st.running;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  // Background pill / box just covering time and gear with some margin
  const radius = Math.min(8, Math.round(h * 0.22));
  const borderColor = isRunning ? c.accent : c.border;
  const borderWidth = isRunning ? 1.5 : 1;
  rr(ctx, 0, 0, w, h, radius, c.bg, borderColor, borderWidth);

  // Subtle accent tint if running
  if (isRunning) {
    ctx.save();
    rr(ctx, 0, 0, w, h, radius);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.5, c.accent + "18");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Gear button on the right (same line, vertically centered)
  const padRight = Math.max(8, Math.round(h * 0.20));
  const gearSize = Math.max(20, Math.min(32, Math.round(h - 14)));
  const gx = w - padRight - gearSize;
  const gy = Math.round((h - gearSize) / 2);

  const isHovered = !!node._dsGearHovered;
  const gearBg = isHovered ? c.panel2 : c.panel;
  const gearStroke = isHovered ? c.accent : (isRunning ? c.accent : c.border);
  rr(ctx, gx, gy, gearSize, gearSize, 5, gearBg, gearStroke, 1);

  // Gear Icon SVG path
  const innerPad = Math.max(3, Math.round(gearSize * 0.16));
  const innerSize = gearSize - innerPad * 2;
  ctx.save();
  ctx.translate(gx + innerPad, gy + innerPad);
  const scale = innerSize / 24;
  ctx.scale(scale, scale);
  ctx.strokeStyle = isHovered ? c.accent : (isRunning ? c.accent : c.muted);
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "none";
  ctx.beginPath();
  ctx.moveTo(9.7, 2.8);
  ctx.lineTo(14.3, 2.8);
  ctx.lineTo(15, 5);
  ctx.bezierCurveTo(15.5, 5.2, 16, 5.4, 16.4, 5.8);
  ctx.lineTo(18.6, 5.2);
  ctx.lineTo(20.9, 9.2);
  ctx.lineTo(19.3, 10.8);
  ctx.bezierCurveTo(19.4, 11.3, 19.4, 11.8, 19.3, 12.3);
  ctx.lineTo(20.9, 13.9);
  ctx.lineTo(18.6, 17.9);
  ctx.lineTo(16.4, 17.3);
  ctx.bezierCurveTo(16, 17.7, 15.5, 17.9, 15, 18.1);
  ctx.lineTo(14.3, 20.3);
  ctx.lineTo(9.7, 20.3);
  ctx.lineTo(9, 18.1);
  ctx.bezierCurveTo(8.5, 17.9, 8, 17.7, 7.6, 17.3);
  ctx.lineTo(5.4, 17.9);
  ctx.lineTo(3.1, 13.9);
  ctx.lineTo(4.7, 12.3);
  ctx.bezierCurveTo(4.6, 11.8, 4.6, 11.3, 4.7, 10.8);
  ctx.lineTo(3.1, 9.2);
  ctx.lineTo(5.4, 5.2);
  ctx.lineTo(7.6, 5.8);
  ctx.bezierCurveTo(8, 5.4, 8.5, 5.2, 9, 5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, 12, 3.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Hit target for gear
  const hitPad = 4;
  node._dsTimerHit = [{
    key: "settings",
    x: gx - hitPad,
    y: gy - hitPad,
    w: gearSize + hitPad * 2,
    h: gearSize + hitPad * 2
  }];

  // Time text on the same line, vertically centered
  const padLeft = Math.max(10, Math.round(h * 0.22));
  const timeX = Math.round((padLeft + gx) / 2);
  const centerY = Math.round(h / 2);
  const fontSize = Math.round(clamp(h * 0.50, 16, 48));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${fontSize}px "Fira Code", Consolas, monospace`;
  ctx.fillStyle = isRunning ? c.accent : c.text;
  ctx.fillText(fmtTime(st.elapsed), timeX, centerY);

  ctx.restore();
}

function syncTimerDisplay(node) {
  if (!node._dsTimerRoot) return;
  const st = node._dsTimer;
  const e = node._dsTimerEls;
  if (!st || !e) return;
  if (e.time) e.time.textContent = fmtTime(st.elapsed);
  node._dsTimerRoot.dataset.state = st.status ? st.status.toLowerCase() : "ready";
}

function makeVueFace(node) {
  if (node._dsTimerRoot) return;
  const root = document.createElement("div");
  root.className = "ds-run-timer-root";
  root.dataset.dsThemed = "true";
  root.innerHTML = `<div class="ds-rt-time" data-el="time">00:00</div><button class="ds-rt-gear" data-action="settings" title="Timer settings">${GEAR}</button>`;
  const els = {
    time: root.querySelector('[data-el="time"]'),
    gear: root.querySelector(".ds-rt-gear")
  };
  node._dsTimerRoot = root;
  node._dsTimerEls = els;
  const widget = node.addDOMWidget("ds_run_timer_ui", "run_timer", root, {
    serialize: false,
    hideOnZoom: false,
    getHeight: () => Math.max(34, Number(node.size?.[1]) || BASE_H),
    getMinHeight: 34
  });
  widget.computeLayoutSize = () => ({ minWidth: 130, minHeight: 34 });
  node._dsTimerWidget = widget;
  els.gear.addEventListener("pointerdown", e => e.stopPropagation());
  els.gear.addEventListener("click", e => { e.stopPropagation(); openTimerSettings(node); });
  refreshSettingsUI(node);
  window.DSGlobalTheme?.bindNode?.(root, node);
  log("Nodes 2.0 face created", node.id);
}

function refreshSettingsUI(node) { ensureState(node); }

app.registerExtension({
  name: EXT,
  setup() {
    log("Extension setup");
    api.addEventListener("execution_start", () => { log("execution_start"); startAll(); });
    api.addEventListener("executing", ({ detail }) => { if (detail === null) { log("executing=null → workflow finished/stopped"); stopAll("finished"); } });
    api.addEventListener("execution_error", ({ detail }) => { log("execution_error"); stopAll("error"); });
    api.addEventListener("execution_interrupted", () => { log("execution_interrupted"); stopAll("interrupted"); });
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;
    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;
    if (nodeType.prototype._dsRunTimerPatched) return;
    nodeType.prototype._dsRunTimerPatched = true;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldResize = nodeType.prototype.onResize;
    const oldMouseDown = nodeType.prototype.onMouseDown;
    const oldMouseMove = nodeType.prototype.onMouseMove;
    const oldMouseUp = nodeType.prototype.onMouseUp;
    const oldRemoved = nodeType.prototype.onRemoved;

    nodeType.prototype.onNodeCreated = function() {
      oldCreated?.apply(this, arguments);
      this.flags = this.flags || {}; this.flags.no_title = true; this.title = ""; this.badges = []; this.resizable = true; this._dsNodeBaseOptOut = true; this.bgcolor = "transparent"; this.color = "transparent"; this.boxcolor = "transparent";
      this.min_size = [130, 34];
      if (!Array.isArray(this.size) || this.size[0] < 1 || this.size[1] < 1) this.size = [BASE_W, BASE_H];
      ensureState(this);
      this._dsTimer = { status:"READY", running:false, startTime:0, elapsed:0, lastRun:0 };
      if (isVue()) makeVueFace(this);
      log("Node created", this.id, `${this.size[0]}x${this.size[1]}`);
      this.setDirtyCanvas?.(true,true);
    };

    nodeType.prototype.onConfigure = function() {
      const r = oldConfigure?.apply(this, arguments);
      this.flags = this.flags || {}; this.flags.no_title = true; this.title = ""; this.resizable = true; this._dsNodeBaseOptOut = true; this.bgcolor = "transparent"; this.color = "transparent"; this.boxcolor = "transparent";
      this.min_size = [130, 34];
      if (this.size && this.size[0] >= 380 && this.size[1] >= 220) {
        this.size = [BASE_W, BASE_H];
      }
      ensureState(this);
      if (!this._dsTimer) this._dsTimer = { status:"READY", running:false, startTime:0, elapsed:0, lastRun:0 };
      if (isVue()) makeVueFace(this);
      refreshSettingsUI(this);
      syncTimerDisplay(this);
      log("Node configured", this.id, `${this.size[0]}x${this.size[1]}`);
      return r;
    };

    nodeType.prototype.onResize = function(size) {
      if (size[0] < 130) size[0] = 130;
      if (size[1] < 34) size[1] = 34;
      const r = oldResize?.apply(this, arguments);
      this.setDirtyCanvas?.(true,false);
      return r;
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
      if (!ctx || isVue() || this.flags?.collapsed) return;
      try { paint(this, ctx); } catch (e) { errorLog("Canvas paint error", e); }
    };

    nodeType.prototype.onMouseDown = function(e,pos) {
      if (!isVue() && pos) {
        const hit = buttonHit(this,pos);
        if (hit?.key === "settings") { openTimerSettings(this); return true; }
      }
      return oldMouseDown ? oldMouseDown.apply(this,arguments) : false;
    };

    nodeType.prototype.onMouseMove = function(e,pos) {
      if (!isVue() && pos) {
        const hit = buttonHit(this, pos);
        const wasHovered = !!this._dsGearHovered;
        this._dsGearHovered = hit?.key === "settings";
        if (wasHovered !== this._dsGearHovered) {
          this.setDirtyCanvas?.(true, false);
        }
      }
      return oldMouseMove ? oldMouseMove.apply(this,arguments) : false;
    };
    nodeType.prototype.onMouseUp = function(e,pos) {
      return oldMouseUp ? oldMouseUp.apply(this,arguments) : false;
    };

    nodeType.prototype.startRun = function() {
      if (this._dsTimer?.running) return;
      this._dsTimer = this._dsTimer || {};
      this._dsTimer.running = true; this._dsTimer.status = "RUNNING"; this._dsTimer.startTime = performance.now(); this._dsTimer.elapsed = 0;
      refreshSettingsUI(this); syncTimerDisplay(this); this.setDirtyCanvas?.(true,true);
      if (!this._dsTimerLoop) this._dsTimerLoop = () => { if (!this._dsTimer?.running) return; this._dsTimer.elapsed = performance.now() - this._dsTimer.startTime; syncTimerDisplay(this); this.setDirtyCanvas?.(true,false); requestAnimationFrame(this._dsTimerLoop); };
      requestAnimationFrame(this._dsTimerLoop);
      log("Timer started", this.id);
    };

    nodeType.prototype.stopRun = function(reason="finished") {
      if (!this._dsTimer?.running) return;
      this._dsTimer.running = false;
      this._dsTimer.elapsed = performance.now() - this._dsTimer.startTime;
      this._dsTimer.lastRun = this._dsTimer.elapsed;
      this._dsTimer.status = reason === "error" ? "STOPPED" : "FINISHED";
      syncTimerDisplay(this); this.setDirtyCanvas?.(true,true);
      if (reason !== "error") playFinishSound(this);
      log("Timer stopped", this.id, reason, fmtTime(this._dsTimer.elapsed));
    };

    nodeType.prototype.onRemoved = function() {
      this._dsTimer && (this._dsTimer.running = false);
      try { this._dsTimerThemeOff?.(); this._dsTimerWidget?.onRemove?.(); this._dsTimerRoot?.remove(); } catch (_) {}
      return oldRemoved?.apply(this,arguments);
    };
  },
  nodeCreated(node) {
    if (node.type !== TYPE && node.comfyClass !== TYPE) return;
    node.flags = node.flags || {}; node.flags.no_title = true; node.title = ""; node.resizable = true; node._dsNodeBaseOptOut = true; node.bgcolor = "transparent"; node.color = "transparent"; node.boxcolor = "transparent";
    node.min_size = [130, 34];
    if (!Array.isArray(node.size) || node.size[0] < 1 || node.size[1] < 1) node.size = [BASE_W, BASE_H];
    ensureState(node);
    if (isVue()) makeVueFace(node);
  }
});
