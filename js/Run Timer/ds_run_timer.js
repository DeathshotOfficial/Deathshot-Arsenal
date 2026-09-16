import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_RunTimer";
const EXT = "DeathshotArsenal.DS_RunTimer";
const CSS = "/extensions/DeathshotArsenal/Run Timer/ds_run_timer.css";
const BASE_W = 175;
const BASE_H = 42;

const SOUND_OPTIONS = [
  ["chime", "Chime", "Classic 2-tone"],
  ["fanfare", "Fanfare", "Victory triad"],
  ["double", "Double Beep", "Tactical prompt"],
  ["digital", "8-Bit Arp", "Retro arcade"],
  ["bell", "Tubular Bell", "Rich brass chime"],
  ["soft", "Soft Pulse", "Gentle ambient"],
  ["sonar", "Sonar Ping", "Submarine echo"],
  ["zen", "Singing Bowl", "Deep meditation"],
  ["marimba", "Marimba", "Warm wood bounce"],
  ["crystal", "Glass Ping", "High crystal tap"],
  ["laser", "Sci-Fi Warp", "Laser sweep"],
  ["bubble", "Water Drop", "Liquid pop"],
  ["levelup", "Level Up", "Ascending sparkle"],
  ["harp", "Harp Gliss", "Celestial sweep"],
  ["shutter", "Camera Click", "Tactile mechanical"],
  ["bass_drop", "Sub Bass", "Deep 808 drop"],
  ["teleport", "Cyber Swell", "Futuristic filter"],
  ["coin", "Coin Collect", "Arcade gold ping"],
  ["gong", "Temple Gong", "Low metallic ring"],
  ["radar", "Radar Blip", "Cockpit avionics"],
  ["kalimba", "Kalimba", "Thumb piano"],
  ["positive", "Ding Dong", "Warm two-tone"],
  ["alarm", "Digital Alarm", "Triple alert"],
  ["orchestra", "Orchestra Hit", "Major chord hit"],
  ["none", "None", "Mute / Silent"]
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

const existingCssLink = document.querySelector('link[href*="ds_run_timer.css"]');
if (existingCssLink) {
  existingCssLink.href = `${CSS}?v=${Date.now()}`;
} else {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${CSS}?v=${Date.now()}`;
  document.head.appendChild(link);
}

function registerTimerGearMenu() {
  if (window.DSGearMenu?.register) {
    window.DSGearMenu.register(TYPE, {
      tooltip: "Run Timer Settings",
      onClick: (node, canvas, event) => {
        if (isTimerSettingsOpen(node)) {
          closeTimerSettings(node);
        } else {
          openTimerSettings(node);
        }
      },
    });
    return true;
  }
  return false;
}

if (!registerTimerGearMenu()) {
  setTimeout(registerTimerGearMenu, 250);
  setTimeout(registerTimerGearMenu, 1000);
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
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function sweep(ctx, startFreq, endFreq, duration, when, gain, type = "sawtooth") {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + duration);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function noiseSnap(ctx, when, gain, duration = 0.05) {
  try {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(800, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(when);
  } catch (_) {}
}

function playSoundById(soundId, volume = 0.65) {
  if (!soundId || soundId === "none") return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.015;
  const g = clamp(Number(volume) || 0, 0, 1) * 0.22;

  try {
    switch (soundId) {
      case "chime":
        tone(ctx, 880, .20, now, g, "sine");
        tone(ctx, 1320, .35, now + .14, g * .85, "sine");
        break;
      case "fanfare":
        tone(ctx, 523.25, .10, now, g * .8, "triangle");
        tone(ctx, 659.25, .10, now + .09, g * .8, "triangle");
        tone(ctx, 783.99, .10, now + .18, g * .9, "triangle");
        tone(ctx, 1046.5, .32, now + .27, g * 1.0, "sine");
        break;
      case "double":
        tone(ctx, 740, .09, now, g, "square");
        tone(ctx, 880, .14, now + .13, g, "square");
        break;
      case "digital":
        tone(ctx, 1047, .06, now, g * .8, "square");
        tone(ctx, 1319, .06, now + .06, g * .8, "square");
        tone(ctx, 1568, .06, now + .12, g * .8, "square");
        tone(ctx, 2093, .16, now + .18, g * .9, "square");
        break;
      case "bell":
        tone(ctx, 523, .85, now, g, "sine");
        tone(ctx, 1047, .65, now + .02, g * .5, "sine");
        tone(ctx, 1568, .40, now + .03, g * .25, "sine");
        break;
      case "soft":
        tone(ctx, 440, .30, now, g * .7, "triangle");
        tone(ctx, 660, .45, now + .18, g * .7, "triangle");
        break;
      case "sonar":
        tone(ctx, 1200, 1.1, now, g * .9, "sine");
        tone(ctx, 1206, 1.1, now, g * .4, "sine");
        break;
      case "zen":
        tone(ctx, 216, 1.6, now, g * .8, "sine");
        tone(ctx, 432, 1.4, now, g * .5, "sine");
        tone(ctx, 648, 1.1, now, g * .3, "sine");
        break;
      case "marimba":
        tone(ctx, 587, .18, now, g * .9, "triangle");
        tone(ctx, 784, .18, now + .10, g * .9, "triangle");
        tone(ctx, 988, .28, now + .20, g * .95, "triangle");
        break;
      case "crystal":
        tone(ctx, 2093, .65, now, g * .8, "sine");
        tone(ctx, 4186, .45, now + .02, g * .35, "sine");
        break;
      case "laser":
        sweep(ctx, 1800, 220, .22, now, g * .9, "sawtooth");
        break;
      case "bubble":
        sweep(ctx, 350, 980, .14, now, g * .9, "sine");
        break;
      case "levelup":
        tone(ctx, 587, .07, now, g * .8, "square");
        tone(ctx, 740, .07, now + .07, g * .8, "square");
        tone(ctx, 880, .07, now + .14, g * .85, "square");
        tone(ctx, 1175, .28, now + .21, g * 1.0, "triangle");
        break;
      case "harp":
        [523, 587, 659, 784, 880, 1046].forEach((f, i) => tone(ctx, f, .35, now + i * .05, g * .7, "sine"));
        break;
      case "shutter":
        noiseSnap(ctx, now, g * .9, .03);
        noiseSnap(ctx, now + .07, g * .8, .04);
        tone(ctx, 1200, .03, now, g * .4, "sine");
        break;
      case "bass_drop":
        sweep(ctx, 160, 42, .55, now, g * 1.2, "sine");
        break;
      case "teleport":
        sweep(ctx, 300, 1600, .32, now, g * .7, "sawtooth");
        sweep(ctx, 305, 1620, .32, now, g * .5, "sawtooth");
        break;
      case "coin":
        tone(ctx, 987.77, .07, now, g * .85, "square");
        tone(ctx, 1318.51, .32, now + .07, g * .95, "square");
        break;
      case "gong":
        tone(ctx, 110, 1.8, now, g * .8, "sine");
        tone(ctx, 225, 1.5, now, g * .5, "triangle");
        tone(ctx, 350, 1.1, now, g * .3, "sine");
        break;
      case "radar":
        tone(ctx, 1760, .08, now, g, "square");
        tone(ctx, 1760, .08, now + .12, g, "square");
        break;
      case "kalimba":
        tone(ctx, 659, .28, now, g * .9, "triangle");
        tone(ctx, 988, .35, now + .08, g * .85, "sine");
        break;
      case "positive":
        tone(ctx, 784, .25, now, g * .85, "sine");
        tone(ctx, 659, .55, now + .22, g * .95, "sine");
        break;
      case "alarm":
        tone(ctx, 1000, .07, now, g, "square");
        tone(ctx, 1000, .07, now + .11, g, "square");
        tone(ctx, 1000, .07, now + .22, g, "square");
        break;
      case "orchestra":
        tone(ctx, 261.63, .45, now, g * .7, "sawtooth");
        tone(ctx, 329.63, .45, now, g * .7, "sawtooth");
        tone(ctx, 392.00, .45, now, g * .7, "sawtooth");
        tone(ctx, 523.25, .55, now, g * .85, "sine");
        break;
      default:
        tone(ctx, 880, .20, now, g, "sine");
        tone(ctx, 1320, .32, now + .13, g * .85, "sine");
        break;
    }
    log("Played sound", soundId, `volume=${volume}`);
  } catch (e) {
    errorLog("Play sound failed", soundId, e);
  }
}

function playFinishSound(node) {
  const s = ensureState(node);
  if (!s.soundEnabled || s.mute || s.sound === "none") {
    log("Finish sound suppressed", s.sound, s.mute);
    return;
  }
  playSoundById(s.sound, s.volume);
}

function allTimers() {
  return (app.graph?._nodes || []).filter(n => n?.type === TYPE || n?.comfyClass === TYPE);
}

function startAll() { allTimers().forEach(n => n.startRun?.()); }
function stopAll(reason) { allTimers().forEach(n => n.stopRun?.(reason)); }

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
let timerFollowRaf = null;

function timerScreenRect(node) {
  if (!node) return null;
  const canvasEl = app?.canvas?.canvas || document.querySelector("canvas#graph-canvas") || document.querySelector("canvas");
  const ds = app?.canvas?.ds;
  if (!canvasEl || !ds || !Array.isArray(node.pos) || !Array.isArray(node.size)) return null;

  const cr = canvasEl.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const offset = ds.offset || [0, 0];
  const left = cr.left + (Number(node.pos[0] || 0) + Number(offset[0] || 0)) * scale;
  const top = cr.top + (Number(node.pos[1] || 0) + Number(offset[1] || 0)) * scale;
  const width = Math.max(130, Number(node.size[0] || BASE_W)) * scale;
  const height = Math.max(34, Number(node.size[1] || BASE_H)) * scale;

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function isTimerSettingsOpen(node) {
  return OPEN_POPUPS.has(node?.id);
}

function closeTimerSettings(node) {
  const item = OPEN_POPUPS.get(node?.id);
  if (!item) return;
  try { item.popup.remove(); } catch (_) {}
  OPEN_POPUPS.delete(node.id);
}

function ensureTimerFollowLoop() {
  if (timerFollowRaf != null) return;
  const loop = () => {
    if (OPEN_POPUPS.size === 0) {
      timerFollowRaf = null;
      return;
    }
    for (const item of OPEN_POPUPS.values()) {
      positionTimerSettings(item.node, item.popup);
    }
    timerFollowRaf = requestAnimationFrame(loop);
  };
  timerFollowRaf = requestAnimationFrame(loop);
}

function ensureSideRoom(app, node) {
  const nr = timerScreenRect(node);
  if (!nr) return;

  const popupWidth = 340;
  const gap = 16;
  const margin = 16;
  const needed = popupWidth + gap + margin;

  const spaceRight = window.innerWidth - nr.right;

  // We strictly want the menu on the RIGHT of the node.
  // If not enough room on the right, pan canvas left so there is plenty of room on the right!
  if (spaceRight < needed) {
    const ds = app?.canvas?.ds;
    if (ds && ds.offset && ds.scale) {
      const shift = (needed - spaceRight) / ds.scale;
      ds.offset[0] -= shift;
      try {
        app?.canvas?.setDirty?.(true, true);
        app?.canvas?.draw?.(true, true);
      } catch (_) {}
    }
  }
}

function positionTimerSettings(node, popup) {
  const nr = timerScreenRect(node);
  if (!nr) return;
  const margin = 12;
  const gap = 14;
  const pw = popup.offsetWidth || 340;
  const ph = popup.offsetHeight || 440;

  // Always position to the RIGHT of the node
  let left = nr.right + gap;

  // Only if right placement exceeds the viewport width:
  if (left + pw > window.innerWidth - margin) {
    if (window.innerWidth - nr.right < 80 && (nr.left - pw - gap >= margin)) {
      left = nr.left - pw - gap;
    } else {
      left = Math.max(margin, window.innerWidth - pw - margin);
    }
  }

  // Vertical placement: align top with node top, clamped to viewport
  let top = nr.top;
  if (top + ph > window.innerHeight - margin) {
    top = window.innerHeight - ph - margin;
  }
  top = Math.max(margin, top);

  const newLeft = `${Math.round(left)}px`;
  const newTop = `${Math.round(top)}px`;
  if (popup.style.left !== newLeft) popup.style.left = newLeft;
  if (popup.style.top !== newTop) popup.style.top = newTop;
}

function timerSettingButton(label, active, callback, description = "", soundId = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `ds-rt-popup-choice${active ? " active" : ""}`;
  if (soundId) b.dataset.soundId = soundId;
  b.innerHTML = `<span class="ds-rt-popup-mark">${active ? "✓" : ""}</span><span class="ds-rt-popup-choice-copy"><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span>`;
  b.addEventListener("pointerdown", e => e.stopPropagation());
  b.addEventListener("mousedown", e => e.stopPropagation());
  b.addEventListener("mouseup", e => e.stopPropagation());
  b.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    callback(b);
  });
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
  close.addEventListener("mousedown", e => e.stopPropagation());
  close.addEventListener("click", (e) => { e.stopPropagation(); closeTimerSettings(node); });
  head.appendChild(close);
  popup.appendChild(head);

  const body = document.createElement("div");
  body.className = "ds-rt-popup-body";

  const playback = document.createElement("section");
  playback.className = "ds-rt-popup-section";
  playback.innerHTML = `<div class="ds-rt-popup-label">FINISH NOTIFICATION</div>`;

  const enable = timerSettingButton("Play finish sound", !!s.soundEnabled, (btn) => {
    s.soundEnabled = !s.soundEnabled;
    btn.classList.toggle("active", s.soundEnabled);
    const m = btn.querySelector(".ds-rt-popup-mark");
    if (m) m.textContent = s.soundEnabled ? "✓" : "";
    saveState(node);
    log("soundEnabled", s.soundEnabled);
  }, "Play when the workflow completes");

  const mute = timerSettingButton("Mute audio", !!s.mute, (btn) => {
    s.mute = !s.mute;
    btn.classList.toggle("active", s.mute);
    const m = btn.querySelector(".ds-rt-popup-mark");
    if (m) m.textContent = s.mute ? "✓" : "";
    saveState(node);
    log("mute", s.mute);
  }, "Temporarily suppress sound");

  playback.append(enable, mute);
  body.appendChild(playback);

  const sound = document.createElement("section");
  sound.className = "ds-rt-popup-section";
  sound.innerHTML = `<div class="ds-rt-popup-label">ALERT SOUND (${SOUND_OPTIONS.length} PRESETS)</div>`;
  const sounds = document.createElement("div");
  sounds.className = "ds-rt-popup-grid";

  for (const [id, label, desc] of SOUND_OPTIONS) {
    sounds.appendChild(timerSettingButton(label, s.sound === id, () => {
      // Instant selection without recreating the whole popup DOM
      sounds.querySelectorAll(".ds-rt-popup-choice").forEach(el => {
        const isMatch = el.dataset.soundId === id;
        el.classList.toggle("active", isMatch);
        const m = el.querySelector(".ds-rt-popup-mark");
        if (m) m.textContent = isMatch ? "✓" : "";
      });
      s.sound = id;
      saveState(node);
      // Instant audible feedback!
      playSoundById(id, s.volume);
      log("sound selected", id);
    }, desc, id));
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
  range.addEventListener("mousedown", e => e.stopPropagation());
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
  test.addEventListener("mousedown", e => e.stopPropagation());
  test.addEventListener("click", e => {
    e.stopPropagation();
    playSoundById(s.sound, s.volume);
  });
  body.appendChild(test);
  popup.appendChild(body);
  popupTheme(popup);
  positionTimerSettings(node, popup);
  requestAnimationFrame(() => positionTimerSettings(node, popup));
}

function openTimerSettings(node) {
  closeTimerSettings(node);
  ensureSideRoom(app, node);
  const popup = document.createElement("div");
  popup.className = "ds-rt-popup";
  popup.addEventListener("pointerdown", e => e.stopPropagation());
  popup.addEventListener("mousedown", e => e.stopPropagation());
  document.body.appendChild(popup);
  OPEN_POPUPS.set(node.id, { node, popup });
  renderTimerSettings(node, popup);
  ensureTimerFollowLoop();
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

  // Background pill / box
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

  node._dsTimerHit = null;

  // Time text cleanly centered horizontally and vertically
  const timeX = Math.round(w / 2);
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
  root.innerHTML = `<div class="ds-rt-time" data-el="time">00:00</div>`;
  const els = {
    time: root.querySelector('[data-el="time"]'),
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
  refreshSettingsUI(node);
  window.DSGlobalTheme?.bindNode?.(root, node);
  log("Nodes 2.0 face created", node.id);
}

function refreshSettingsUI(node) { ensureState(node); }

app.registerExtension({
  name: EXT,
  setup() {
    log("Extension setup");
    registerTimerGearMenu();
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
      return oldMouseDown ? oldMouseDown.apply(this,arguments) : false;
    };

    nodeType.prototype.onMouseMove = function(e,pos) {
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
      closeTimerSettings(this);
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
