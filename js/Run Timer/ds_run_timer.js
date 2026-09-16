import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_RunTimer";
const EXT = "DeathshotArsenal.DS_RunTimer";
const CSS = "/extensions/DeathshotArsenal/Run Timer/ds_run_timer.css";
const BASE_W = 175;
const BASE_H = 42;

const SOUND_OPTIONS = [
  // Bells & Chimes
  ["chime", "Classic Chime", "2-tone bell", "chimes"],
  ["tubular_bell", "Tubular Bell", "Rich brass chime", "chimes"],
  ["church_bell", "Church Bell", "Deep cathedral", "chimes"],
  ["windchime", "Wind Chimes", "Sparkling cascade", "chimes"],
  ["zen_bowl", "Tibetan Bowl", "Deep meditation", "chimes"],
  ["desk_bell", "Reception Bell", "High crisp ding", "chimes"],
  ["crystal_ping", "Crystal Glass", "Pure harmonic tap", "chimes"],
  ["bicycle_bell", "Bicycle Bell", "Rapid double ding", "chimes"],
  ["clock_chime", "Clock Tower", "Warm Westminster", "chimes"],
  ["temple_gong", "Temple Gong", "Low lingering bronze", "chimes"],

  // 8-Bit & Retro Arcade
  ["digital_arp", "8-Bit Arp", "Fast retro run", "retro"],
  ["coin_collect", "Coin Collect", "Arcade gold ping", "retro"],
  ["level_up", "Level Up", "Ascending sparkle", "retro"],
  ["power_up", "Power Up", "8-bit power surge", "retro"],
  ["retro_jump", "Arcade Jump", "Classic platformer", "retro"],
  ["game_over", "Retro Blip", "8-bit status pulse", "retro"],
  ["laser_blaster", "Laser Blaster", "Space arcade shot", "retro"],
  ["high_score", "High Score", "Victory fanfare 8-bit", "retro"],
  ["warp_pipe", "Warp Pipe", "Descending blip sweep", "retro"],
  ["secret_reveal", "Secret Chime", "Mystery solved chirp", "retro"],

  // Tactical & Sci-Fi
  ["double_beep", "Double Beep", "Tactical prompt", "scifi"],
  ["triple_beep", "Digital Alarm", "Triple urgency pulse", "scifi"],
  ["radar_blip", "Radar Ping", "Cockpit avionics", "scifi"],
  ["sonar_echo", "Submarine Sonar", "Deep ocean ping", "scifi"],
  ["scifi_warp", "Sci-Fi Warp", "Laser frequency sweep", "scifi"],
  ["cyber_swell", "Cyber Swell", "Futuristic filter port", "scifi"],
  ["airlock_chime", "Airlock Chime", "Spaceship hatch tone", "scifi"],
  ["sub_bass_drop", "Sub Bass Drop", "Cinematic 808 drop", "scifi"],
  ["teleport_beam", "Teleport Beam", "Energy beam sweep", "scifi"],
  ["morse_alert", "Telemetry Morse", "High-tech data blips", "scifi"],

  // Organic & Acoustic
  ["marimba_bounce", "Marimba", "Warm wooden chord", "acoustic"],
  ["kalimba_pluck", "Kalimba", "Thumb piano resonance", "acoustic"],
  ["harp_gliss", "Harp Gliss", "Celestial sweep", "acoustic"],
  ["celesta_ping", "Celesta", "Enchanted fairy bell", "acoustic"],
  ["xylophone_hit", "Xylophone", "Bright percussion hit", "acoustic"],
  ["music_box", "Music Box", "Nostalgic mechanical", "acoustic"],
  ["water_droplet", "Water Droplet", "Organic liquid pop", "acoustic"],
  ["bubble_pop", "Bubble Pop", "Double bubbly burst", "acoustic"],
  ["bamboo_click", "Bamboo Click", "Woodblock tap", "acoustic"],
  ["guitar_harmonic", "Guitar Chime", "Acoustic open chord", "acoustic"],

  // Modern UI & Alerts
  ["victory_fanfare", "Victory Fanfare", "Triumphant major triad", "modern"],
  ["ding_dong", "Smart Doorbell", "Modern two-tone chime", "modern"],
  ["camera_shutter", "Camera Click", "Tactile snapshot", "modern"],
  ["cork_pop", "Bottle Pop", "Champagne celebratory", "modern"],
  ["magic_sparkle", "Magic Sparkle", "Enchanted shimmer", "modern"],
  ["app_ping", "Notification Ping", "Clean smartphone tap", "modern"],
  ["cash_register", "Cash Register", "Ka-ching metallic", "modern"],
  ["soft_ambient", "Soft Ambient", "Warm gentle swell", "modern"],
  ["orchestral_hit", "Orchestra Hit", "Dramatic chord strike", "modern"],
  ["positive_prompt", "Success Tone", "Confirmed checkmark", "modern"],

  ["none", "None (Mute)", "Silent completion", "all"]
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

function chord(ctx, freqs, duration, when, gain, type = "sine") {
  const perGain = gain / Math.max(1, Math.sqrt(freqs.length));
  for (const f of freqs) {
    tone(ctx, f, duration, when, perGain, type);
  }
}

function arp(ctx, freqs, step, when, gain, type = "square") {
  freqs.forEach((f, i) => {
    tone(ctx, f, step * 1.6, when + i * step, gain, type);
  });
}

function noiseSnap(ctx, when, gain, duration = 0.05, freq = 800) {
  try {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(freq, when);
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
      // 1-10: Bells & Chimes
      case "chime":
        tone(ctx, 880, .20, now, g, "sine");
        tone(ctx, 1320, .35, now + .14, g * .85, "sine");
        break;
      case "tubular_bell":
        chord(ctx, [523.25, 1046.5, 1568, 2637], .9, now, g, "sine");
        break;
      case "church_bell":
        chord(ctx, [261.63, 523.25, 784, 1046], 1.5, now, g, "triangle");
        break;
      case "windchime":
        arp(ctx, [1760, 2093, 2349, 2637, 3136], .05, now, g * .8, "sine");
        break;
      case "zen_bowl":
        chord(ctx, [216, 432, 648, 864], 1.9, now, g, "sine");
        break;
      case "desk_bell":
        tone(ctx, 1568, .7, now, g, "sine");
        tone(ctx, 3136, .5, now + .01, g * .4, "sine");
        break;
      case "crystal_ping":
        tone(ctx, 2093, .65, now, g * .85, "sine");
        tone(ctx, 4186, .45, now + .02, g * .4, "sine");
        break;
      case "bicycle_bell":
        tone(ctx, 1046.5, .06, now, g, "sine");
        tone(ctx, 1318.5, .06, now + .05, g, "sine");
        tone(ctx, 1046.5, .06, now + .14, g, "sine");
        tone(ctx, 1318.5, .15, now + .19, g, "sine");
        break;
      case "clock_chime":
        arp(ctx, [659.25, 523.25, 587.33, 392], .18, now, g * .9, "sine");
        break;
      case "temple_gong":
        chord(ctx, [110, 220, 330, 440], 2.2, now, g * 1.1, "sine");
        break;

      // 11-20: 8-Bit & Retro Arcade
      case "digital_arp":
        arp(ctx, [1047, 1319, 1568, 2093], .055, now, g * .85, "square");
        break;
      case "coin_collect":
        tone(ctx, 987.77, .065, now, g * .85, "square");
        tone(ctx, 1318.51, .32, now + .065, g * .95, "square");
        break;
      case "level_up":
        arp(ctx, [587.33, 740, 880, 1175], .07, now, g * .9, "triangle");
        tone(ctx, 1760, .30, now + .28, g * .8, "sine");
        break;
      case "power_up":
        sweep(ctx, 220, 880, .18, now, g * .85, "sawtooth");
        chord(ctx, [523.25, 659.25, 784], .25, now + .16, g * .9, "square");
        break;
      case "retro_jump":
        sweep(ctx, 150, 620, .13, now, g, "square");
        break;
      case "game_over":
        arp(ctx, [880, 784, 659], .12, now, g * .9, "square");
        break;
      case "laser_blaster":
        sweep(ctx, 2400, 160, .14, now, g, "sawtooth");
        break;
      case "high_score":
        arp(ctx, [523.25, 659.25, 784, 1046.5, 1318.5], .08, now, g * .9, "square");
        break;
      case "warp_pipe":
        arp(ctx, [900, 720, 540, 360, 200], .05, now, g * .85, "triangle");
        break;
      case "secret_reveal":
        arp(ctx, [587, 554, 493, 392, 440, 493, 587], .06, now, g * .85, "triangle");
        break;

      // 21-30: Tactical & Sci-Fi
      case "double_beep":
        tone(ctx, 740, .09, now, g, "square");
        tone(ctx, 880, .14, now + .13, g, "square");
        break;
      case "triple_beep":
        tone(ctx, 1000, .065, now, g, "square");
        tone(ctx, 1000, .065, now + .10, g, "square");
        tone(ctx, 1000, .12, now + .20, g, "square");
        break;
      case "radar_blip":
        tone(ctx, 1760, .07, now, g, "square");
        tone(ctx, 1760, .09, now + .11, g, "square");
        break;
      case "sonar_echo":
        tone(ctx, 1200, 1.2, now, g, "sine");
        tone(ctx, 1206, 1.2, now, g * .4, "sine");
        break;
      case "scifi_warp":
        sweep(ctx, 1900, 200, .24, now, g, "sawtooth");
        break;
      case "cyber_swell":
        sweep(ctx, 300, 1600, .32, now, g * .8, "sawtooth");
        sweep(ctx, 305, 1620, .32, now, g * .5, "sawtooth");
        break;
      case "airlock_chime":
        chord(ctx, [440, 660, 880], .45, now, g, "sine");
        break;
      case "sub_bass_drop":
        sweep(ctx, 165, 38, .60, now, g * 1.3, "sine");
        break;
      case "teleport_beam":
        sweep(ctx, 250, 2400, .28, now, g * .8, "sawtooth");
        break;
      case "morse_alert":
        tone(ctx, 1200, .05, now, g, "sine");
        tone(ctx, 1200, .05, now + .09, g, "sine");
        tone(ctx, 1200, .14, now + .18, g, "sine");
        break;

      // 31-40: Organic & Acoustic
      case "marimba_bounce":
        chord(ctx, [587.33, 784, 987.77], .25, now, g, "triangle");
        break;
      case "kalimba_pluck":
        tone(ctx, 659.25, .28, now, g, "triangle");
        tone(ctx, 987.77, .38, now + .08, g * .85, "sine");
        break;
      case "harp_gliss":
        arp(ctx, [523.25, 587.33, 659.25, 783.99, 880, 1046.5], .045, now, g * .75, "sine");
        break;
      case "celesta_ping":
        chord(ctx, [1046.5, 1318.5, 1568], .45, now, g * .8, "sine");
        break;
      case "xylophone_hit":
        chord(ctx, [880, 1175, 1760], .22, now, g, "triangle");
        break;
      case "music_box":
        arp(ctx, [1318.5, 1568, 2093], .09, now, g * .75, "sine");
        break;
      case "water_droplet":
        sweep(ctx, 350, 980, .13, now, g, "sine");
        break;
      case "bubble_pop":
        sweep(ctx, 420, 850, .08, now, g, "sine");
        sweep(ctx, 520, 1150, .09, now + .09, g * .85, "sine");
        break;
      case "bamboo_click":
        noiseSnap(ctx, now, g * 1.1, .04, 1100);
        tone(ctx, 980, .03, now, g * .3, "triangle");
        break;
      case "guitar_harmonic":
        chord(ctx, [329.63, 493.88, 659.25, 987.77], .55, now, g * .85, "sine");
        break;

      // 41-50: Modern UI & Alerts
      case "victory_fanfare":
        chord(ctx, [523.25, 659.25, 784, 1046.5], .45, now, g, "triangle");
        tone(ctx, 1318.5, .55, now + .08, g * .9, "sine");
        break;
      case "ding_dong":
        tone(ctx, 784, .25, now, g * .9, "sine");
        tone(ctx, 659.25, .60, now + .22, g * .95, "sine");
        break;
      case "camera_shutter":
        noiseSnap(ctx, now, g, .03, 1200);
        noiseSnap(ctx, now + .07, g * .9, .04, 1400);
        break;
      case "cork_pop":
        sweep(ctx, 180, 550, .04, now, g * 1.2, "sine");
        noiseSnap(ctx, now + .02, g * .8, .05, 900);
        break;
      case "magic_sparkle":
        arp(ctx, [1568, 1760, 2093, 2637, 3136], .04, now, g * .7, "sine");
        break;
      case "app_ping":
        tone(ctx, 1400, .12, now, g, "sine");
        break;
      case "cash_register":
        noiseSnap(ctx, now, g * .9, .05, 1800);
        tone(ctx, 987.77, .08, now + .03, g * .85, "sine");
        tone(ctx, 1318.5, .35, now + .09, g, "sine");
        break;
      case "soft_ambient":
        chord(ctx, [440, 659.25], .45, now, g * .8, "triangle");
        break;
      case "orchestral_hit":
        chord(ctx, [261.63, 329.63, 392, 523.25], .55, now, g, "sawtooth");
        break;
      case "positive_prompt":
        tone(ctx, 587.33, .10, now, g * .85, "sine");
        tone(ctx, 880, .28, now + .09, g, "sine");
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

  const popupWidth = 360;
  const gap = 16;
  const margin = 16;
  const needed = popupWidth + gap + margin;

  const spaceRight = window.innerWidth - nr.right;

  // Guarantee room on the RIGHT side of the node
  if (spaceRight < needed) {
    const ds = app?.canvas?.ds;
    if (ds && ds.offset && ds.scale) {
      const shift = (needed - spaceRight + 24) / ds.scale;
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
  const pw = popup.offsetWidth || 360;
  const ph = popup.offsetHeight || 480;

  // Strictly and unconditionally place on the RIGHT of the node
  let left = nr.right + gap;

  // If extending past the right screen boundary, pan canvas to make room rather than flipping to left!
  if (left + pw > window.innerWidth - margin) {
    const overflow = (left + pw) - (window.innerWidth - margin);
    const ds = app?.canvas?.ds;
    if (ds && ds.offset && ds.scale && overflow > 0) {
      ds.offset[0] -= (overflow + 16) / ds.scale;
      try {
        app?.canvas?.setDirty?.(true, true);
        app?.canvas?.draw?.(true, true);
      } catch (_) {}
      const updatedNr = timerScreenRect(node);
      if (updatedNr) left = updatedNr.right + gap;
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
  sound.innerHTML = `<div class="ds-rt-popup-label-row"><span class="ds-rt-popup-label">ALERT SOUND (${SOUND_OPTIONS.length} PRESETS)</span></div>`;

  const filterRow = document.createElement("div");
  filterRow.className = "ds-rt-popup-filters";
  const categories = [
    ["all", "All (51)"],
    ["chimes", "Bells"],
    ["retro", "8-Bit"],
    ["scifi", "Sci-Fi"],
    ["acoustic", "Acoustic"],
    ["modern", "Modern"]
  ];

  const sounds = document.createElement("div");
  sounds.className = "ds-rt-popup-grid";

  categories.forEach(([catId, catLabel]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `ds-rt-filter-chip${catId === "all" ? " active" : ""}`;
    chip.textContent = catLabel;
    chip.addEventListener("pointerdown", e => e.stopPropagation());
    chip.addEventListener("mousedown", e => e.stopPropagation());
    chip.addEventListener("click", e => {
      e.stopPropagation();
      filterRow.querySelectorAll(".ds-rt-filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      sounds.querySelectorAll(".ds-rt-popup-choice").forEach(btn => {
        const match = catId === "all" || btn.dataset.category === catId || btn.dataset.soundId === "none";
        btn.style.display = match ? "flex" : "none";
      });
    });
    filterRow.appendChild(chip);
  });
  sound.appendChild(filterRow);

  for (const [id, label, desc, cat] of SOUND_OPTIONS) {
    const btn = timerSettingButton(label, s.sound === id, () => {
      sounds.querySelectorAll(".ds-rt-popup-choice").forEach(el => {
        const isMatch = el.dataset.soundId === id;
        el.classList.toggle("active", isMatch);
        const m = el.querySelector(".ds-rt-popup-mark");
        if (m) m.textContent = isMatch ? "✓" : "";
      });
      s.sound = id;
      saveState(node);
      playSoundById(id, s.volume);
      log("sound selected", id);
    }, desc, id);
    btn.dataset.category = cat || "all";
    sounds.appendChild(btn);
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
