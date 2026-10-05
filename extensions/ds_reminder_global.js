// Deathshot Arsenal — DS Reminder Global Engine & Toolbar Manager
// Single Source of Truth for persistent reminders across all nodes and workflows.

import { app } from "/scripts/app.js";
import { Toggle } from "/extensions/DeathshotArsenal/UIElements/Controls/Toggle.js";
import { Button } from "/extensions/DeathshotArsenal/UIElements/Controls/Button.js";
import { Stepper } from "/extensions/DeathshotArsenal/UIElements/Controls/Stepper.js";
import { DSIcon, DSIconMarkup } from "/extensions/DeathshotArsenal/Icons/index.js";

function getDSButton(opts = {}) {
  if (typeof Button === "function") return Button(opts);
  if (window.DSUI?.Button) return window.DSUI.Button(opts);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ds-ui-btn" + (opts.variant ? ` ds-ui-btn-${opts.variant}` : "") + (opts.size === "compact" || opts.compact ? " ds-ui-btn-compact" : "");
  if (opts.className) btn.classList.add(...opts.className.split(/\s+/).filter(Boolean));
  if (opts.tooltip) btn.title = opts.tooltip;
  if (opts.icon) {
    const iconEl = typeof DSIcon === "function" ? DSIcon(opts.icon, { size: 13 }) : null;
    if (iconEl) btn.appendChild(iconEl);
  }
  if (opts.label) {
    const span = document.createElement("span");
    span.textContent = opts.label;
    btn.appendChild(span);
  }
  if (opts.onClick) btn.addEventListener("click", (e) => opts.onClick(e));
  return { root: btn, destroy: () => btn.remove() };
}

function getDSStepper(opts = {}) {
  if (typeof Stepper === "function") return Stepper(opts);
  if (window.DSUI?.Stepper) return window.DSUI.Stepper(opts);
  const min = opts.min != null ? Number(opts.min) : 1;
  const max = opts.max != null ? Number(opts.max) : 1440;
  const step = Number(opts.step ?? 1);
  let current = Math.min(max, Math.max(min, Number(opts.value ?? min)));

  const root = document.createElement("div");
  root.className = "ds-ui-stepper";

  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "ds-ui-stepper-btn";
  minusBtn.title = "Decrement";
  minusBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  const input = document.createElement("input");
  input.type = "text";
  input.className = "ds-ui-stepper-value";
  input.value = String(current);

  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "ds-ui-stepper-btn";
  plusBtn.title = "Increment";
  plusBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  root.append(minusBtn, input, plusBtn);

  const emit = (val, fire = true) => {
    current = Math.min(max, Math.max(min, Number(val) || min));
    input.value = String(current);
    if (fire) opts.onChange?.(current);
  };

  minusBtn.addEventListener("click", () => emit(current - step, true));
  plusBtn.addEventListener("click", () => emit(current + step, true));
  input.addEventListener("change", () => emit(Number(input.value) || min, true));

  return {
    root,
    setValue: (val, fire = false) => emit(val, fire),
    getValue: () => current,
    destroy: () => root.remove(),
  };
}

function getDSToggle(opts = {}) {
  if (typeof Toggle === "function") return Toggle(opts);
  if (window.DSUI?.Toggle) return window.DSUI.Toggle(opts);
  const root = document.createElement("div");
  root.className = "ds-ui-toggle-row";
  if (opts.className) root.classList.add(...opts.className.split(/\s+/).filter(Boolean));
  let checked = Boolean(opts.checked);
  const copy = document.createElement("div");
  copy.className = "ds-ui-toggle-copy";
  if (opts.label != null) {
    const lbl = document.createElement("span");
    lbl.className = "ds-ui-toggle-label";
    lbl.textContent = opts.label;
    copy.appendChild(lbl);
  }
  const track = document.createElement("div");
  track.className = "ds-ui-toggle-track";
  track.setAttribute("role", "switch");
  track.setAttribute("aria-checked", checked ? "true" : "false");
  const thumb = document.createElement("div");
  thumb.className = "ds-ui-toggle-thumb";
  track.appendChild(thumb);
  root.append(copy, track);
  const update = () => {
    root.classList.toggle("is-on", checked);
    track.setAttribute("aria-checked", checked ? "true" : "false");
  };
  root.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    checked = !checked;
    update();
    opts.onChange?.(checked);
  });
  update();
  return {
    root,
    track,
    getValue: () => checked,
    setValue: (val) => { checked = Boolean(val); update(); },
    destroy: () => root.remove(),
  };
}

// Emergency purge of any stuck full-screen overlay in the DOM
try {
  const stuck = document.getElementById("ds-reminder-fullscreen-overlay");
  if (stuck) stuck.remove();
} catch (_) {}

const STORAGE_KEY = "DS_REMINDERS_DATA_V1";
const SETTINGS_KEY = "DS_REMINDERS_SETTINGS_V1";

export const SOUND_OPTIONS = [
  { value: "desk_bell", label: "Reception Bell (Crisp)" },
  { value: "chime", label: "Classic Chime" },
  { value: "digital_alarm", label: "Digital Alarm (Urgent)" },
  { value: "radar_blip", label: "Radar Ping" },
  { value: "tubular_bell", label: "Tubular Bell" },
  { value: "zen_bowl", label: "Tibetan Bowl" },
  { value: "victory_fanfare", label: "Victory Fanfare" },
];

// ---------------------------------------------------------------------------
// 1. WEB AUDIO ALERT SYNTHESIZER (Self-contained, Zero external assets)
// ---------------------------------------------------------------------------
class AudioAlertSynth {
  constructor() {
    this.ctx = null;
    this.alertLoopTimer = null;
    this.activeAlertSound = null;
  }

  ensureContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx || this.ctx.state === "closed") {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch (_) {
      return null;
    }
  }

  tone(freq, dur, startTime, gainVal, type = "sine") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainVal), startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(0.05, dur));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.05);
    } catch (_) {}
  }

  chord(freqs, dur, startTime, gainVal, type = "sine") {
    freqs.forEach((f) => this.tone(f, dur, startTime, gainVal / freqs.length, type));
  }

  playSound(soundId = "desk_bell", volume = 0.7) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.02;
    const g = Math.max(0, Math.min(1, Number(volume) || 0.7)) * 0.26;

    try {
      switch (soundId) {
        case "chime":
          this.tone(880, 0.22, now, g, "sine");
          this.tone(1320, 0.4, now + 0.14, g * 0.85, "sine");
          break;
        case "desk_bell":
          this.tone(1568, 0.75, now, g, "sine");
          this.tone(3136, 0.45, now + 0.01, g * 0.4, "sine");
          break;
        case "digital_alarm":
          for (let i = 0; i < 3; i++) {
            this.tone(1864, 0.08, now + i * 0.12, g, "square");
          }
          break;
        case "radar_blip":
          this.tone(2093, 0.12, now, g * 0.9, "triangle");
          this.tone(2793, 0.35, now + 0.08, g * 0.6, "sine");
          break;
        case "tubular_bell":
          this.chord([523.25, 1046.5, 1568, 2637], 1.1, now, g, "sine");
          break;
        case "zen_bowl":
          this.chord([216, 432, 648, 864], 2.0, now, g, "sine");
          break;
        case "victory_fanfare":
          this.tone(523.25, 0.12, now, g, "sine");
          this.tone(659.25, 0.12, now + 0.12, g, "sine");
          this.tone(783.99, 0.12, now + 0.24, g, "sine");
          this.tone(1046.5, 0.4, now + 0.36, g * 1.1, "sine");
          break;
        default:
          this.tone(1320, 0.35, now, g, "sine");
      }
    } catch (e) {
      console.warn("[DS Reminder Audio] Playback failed:", e);
    }
  }

  startAlertLoop(soundId = "desk_bell", volume = 0.7) {
    this.stopAlertLoop();
    this.activeAlertSound = soundId;
    this.playSound(soundId, volume);
    this.alertLoopTimer = setInterval(() => {
      this.playSound(this.activeAlertSound || soundId, volume);
    }, 3500);
  }

  stopAlertLoop() {
    if (this.alertLoopTimer) {
      clearInterval(this.alertLoopTimer);
      this.alertLoopTimer = null;
    }
    this.activeAlertSound = null;
  }
}

export const dsAudio = new AudioAlertSynth();
window.dsAudio = dsAudio;

// ---------------------------------------------------------------------------
// 2. SINGLE SOURCE OF TRUTH: DSReminderStore
// ---------------------------------------------------------------------------
class DSReminderStore {
  constructor() {
    this.reminders = [];
    this.settings = {
      globalFullscreen: true,
      masterVolume: 0.7,
      defaultSound: "desk_bell",
    };
    this.listeners = new Set();
    this.audioSynth = dsAudio;
    this._initialized = false;
    this._loadLocal();
    this._syncFromBackend();
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          this.reminders = parsed
            .map((r) => {
              if (!r || typeof r !== "object") return null;
              // Clean up any stale or past reminders:
              // If it was already triggered or its timestamp passed before ComfyUI was opened, mark completed
              if (r.state === "triggered" || (r.state === "scheduled" && r.targetTimestamp && r.targetTimestamp <= now)) {
                return { ...r, state: "completed", enabled: false };
              }
              return r;
            })
            .filter(Boolean);
          this._saveLocal();
        }
      }
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        if (parsedSettings && typeof parsedSettings === "object") {
          this.settings = { ...this.settings, ...parsedSettings };
        }
      }
      this.settings.globalFullscreen = true;
      this._saveLocal();
    } catch (e) {
      console.warn("[DSReminderStore] LocalStorage load failed:", e);
    }
    this._initialized = true;
  }

  async _syncFromBackend() {
    try {
      const res = await fetch("/ds/reminders");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          if (Array.isArray(json.data.reminders) && json.data.reminders.length > 0) {
            const now = Date.now();
            this.reminders = json.data.reminders
              .map((r) => {
                if (!r || typeof r !== "object") return null;
                if (r.state === "triggered" || (r.state === "scheduled" && r.targetTimestamp && r.targetTimestamp <= now)) {
                  return { ...r, state: "completed" };
                }
                return r;
              })
              .filter(Boolean);
          }
          if (json.data.settings && typeof json.data.settings === "object") {
            this.settings = { ...this.settings, ...json.data.settings };
          }
          if (this.settings.globalFullscreen === undefined) {
            this.settings.globalFullscreen = true;
          }
          this._saveLocal();
          this.dispatch();
        }
      }
    } catch (_) {}
  }

  _saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reminders));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn("[DSReminderStore] LocalStorage save failed:", e);
    }
  }

  _persistBackend() {
    try {
      fetch("/ds/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminders: this.reminders,
          settings: this.settings,
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  save() {
    this._saveLocal();
    this._persistBackend();
    this.dispatch();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(event = { type: "change" }) {
    for (const fn of this.listeners) {
      try {
        fn(event, this);
      } catch (err) {
        console.error("[DSReminderStore] Listener error:", err);
      }
    }
  }

  getReminders() {
    return [...this.reminders];
  }

  getReminder(id) {
    return this.reminders.find((r) => r.id === id) || null;
  }

  addReminder(item) {
    const now = Date.now();
    const mode = item.mode || "duration";
    let targetTimestamp = item.targetTimestamp;

    if (!targetTimestamp) {
      if (mode === "duration") {
        const minutes = Number(item.durationMinutes) || 5;
        targetTimestamp = now + Math.max(5000, minutes * 60 * 1000);
      } else if (mode === "clock") {
        targetTimestamp = this.parseClockTime(item.clockTime);
      } else {
        targetTimestamp = now + 5 * 60 * 1000;
      }
    }

    const reminder = {
      id: item.id || `ds_rem_${now}_${Math.random().toString(36).substring(2, 7)}`,
      title: (item.title || "Reminder").trim(),
      createdAt: now,
      mode,
      durationMinutes: Number(item.durationMinutes) || 5,
      clockTime: item.clockTime || "18:00",
      targetTimestamp,
      enabled: item.enabled !== false,
      state: "scheduled",
      sound: item.sound || this.settings.defaultSound || "desk_bell",
      volume: item.volume ?? this.settings.masterVolume ?? 0.7,
      fullscreen: item.fullscreen !== false,
      lastTriggered: null,
      acknowledgedAt: null,
    };

    this.reminders.push(reminder);
    this.save();
    return reminder;
  }

  updateReminder(id, changes) {
    const idx = this.reminders.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const current = this.reminders[idx];

    let targetTimestamp = current.targetTimestamp;
    const mode = changes.mode || current.mode;

    if (changes.targetTimestamp) {
      targetTimestamp = changes.targetTimestamp;
    } else if (changes.durationMinutes !== undefined || (changes.mode && changes.mode === "duration")) {
      const mins = Number(changes.durationMinutes ?? current.durationMinutes) || 5;
      targetTimestamp = Date.now() + Math.max(5000, mins * 60 * 1000);
    } else if (changes.clockTime !== undefined || (changes.mode && changes.mode === "clock")) {
      targetTimestamp = this.parseClockTime(changes.clockTime ?? current.clockTime);
    }

    const updated = {
      ...current,
      ...changes,
      mode,
      targetTimestamp,
      state: current.state === "completed" || current.state === "triggered" ? "scheduled" : current.state,
    };

    this.reminders[idx] = updated;
    this.save();
    return updated;
  }

  deleteReminder(id) {
    const idx = this.reminders.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.reminders.splice(idx, 1);
    this.save();
    return true;
  }

  toggleReminder(id, enabled) {
    const rem = this.getReminder(id);
    if (!rem) return;
    const nextEnabled = enabled !== undefined ? !!enabled : !rem.enabled;
    const now = Date.now();

    let targetTimestamp = rem.targetTimestamp;
    if (nextEnabled && (rem.state === "completed" || rem.targetTimestamp <= now)) {
      if (rem.mode === "duration") {
        targetTimestamp = now + (Number(rem.durationMinutes) || 5) * 60 * 1000;
      } else {
        targetTimestamp = this.parseClockTime(rem.clockTime);
      }
    }

    rem.enabled = nextEnabled;
    rem.targetTimestamp = targetTimestamp;
    if (!nextEnabled) {
      if (rem.state === "triggered") {
        rem.state = "completed";
        rem.acknowledgedAt = now;
        if (typeof scheduler !== "undefined" && scheduler?._dismissedIds) {
          scheduler._dismissedIds.add(rem.id);
        }
        if (this.getActiveTriggered().length === 0) {
          dsAudio.stopAlertLoop();
          fullscreenOverlay.hide();
        }
      } else {
        rem.state = "disabled";
      }
    } else {
      rem.state = "scheduled";
    }
    this.save();
  }

  reorderReminders(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.reminders.length || toIndex < 0 || toIndex >= this.reminders.length) {
      return;
    }
    const [moved] = this.reminders.splice(fromIndex, 1);
    this.reminders.splice(toIndex, 0, moved);
    this.save();
  }

  acknowledgeReminder(id) {
    const rem = this.getReminder(id);
    if (!rem) return;
    rem.state = "completed";
    rem.acknowledgedAt = Date.now();
    this.save();
    this.dispatch({ type: "acknowledged", reminder: rem });
  }

  snoozeReminder(id, minutes = 5) {
    const rem = this.getReminder(id);
    if (!rem) return;
    const now = Date.now();
    rem.targetTimestamp = now + minutes * 60 * 1000;
    rem.state = "scheduled";
    rem.enabled = true;
    this.save();
    this.dispatch({ type: "snoozed", reminder: rem, minutes });
  }

  setGlobalFullscreen(enabled) {
    this.settings.globalFullscreen = !!enabled;
    this.save();
  }

  parseClockTime(timeStr) {
    const now = new Date();
    const [hStr, mStr] = String(timeStr || "18:00").split(":");
    let hours = parseInt(hStr, 10) || 0;
    let mins = parseInt(mStr, 10) || 0;

    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  getActiveTriggered() {
    return this.reminders.filter((r) => r.state === "triggered" && r.enabled);
  }

  getActiveScheduled() {
    return this.reminders.filter((r) => r.state === "scheduled" && r.enabled);
  }
}

export const reminderStore = new DSReminderStore();
window.DSReminderStore = reminderStore;

// ---------------------------------------------------------------------------
// 3. SCHEDULER & NOTIFICATION ENGINE
// ---------------------------------------------------------------------------
class DSReminderScheduler {
  constructor(store) {
    this.store = store;
    this.timer = null;
    this._dismissedIds = new Set();
    this.start();
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    const now = Date.now();
    const reminders = this.store.getReminders();
    let triggeredAny = false;

    for (const rem of reminders) {
      if (!rem.enabled || rem.state === "disabled" || rem.state === "completed") {
        continue;
      }
      if (rem.state === "scheduled" && rem.targetTimestamp && now >= rem.targetTimestamp) {
        rem.state = "triggered";
        rem.lastTriggered = now;
        triggeredAny = true;
        this.store.dispatch({ type: "trigger", reminder: rem });
      }
    }

    const activeTriggered = this.store.getActiveTriggered();

    if (activeTriggered.length > 0) {
      const topSound = activeTriggered[0].sound || this.store.settings.defaultSound || "desk_bell";
      const topVolume = activeTriggered[0].volume ?? this.store.settings.masterVolume ?? 0.7;
      if (!dsAudio.alertLoopTimer) {
        dsAudio.startAlertLoop(topSound, topVolume);
      }
      const undismissed = activeTriggered.filter(r => !this._dismissedIds.has(r.id) && r.fullscreen !== false);
      const shouldShowFullscreen = this.store.settings.globalFullscreen !== false && undismissed.length > 0;
      if (shouldShowFullscreen) {
        fullscreenOverlay.show(undismissed);
      }
    } else {
      this._dismissedIds.clear();
      dsAudio.stopAlertLoop();
      fullscreenOverlay.hide();
    }

    if (triggeredAny) {
      this.store.save();
    } else {
      this.store.dispatch({ type: "tick" });
    }
  }
}

export const scheduler = new DSReminderScheduler(reminderStore);

// ---------------------------------------------------------------------------
// 4. FULLSCREEN REMINDER OVERLAY
// ---------------------------------------------------------------------------
class FullscreenReminderOverlay {
  constructor() {
    this.el = null;
    this.currentReminders = [];
    this.boundKeyHandler = this.onKeyDown.bind(this);
    if (document.body) {
      this._createDOM();
    } else {
      window.addEventListener("DOMContentLoaded", () => this._createDOM(), { once: true });
    }
  }

  _createDOM() {
    const existing = document.getElementById("ds-reminder-fullscreen-overlay");
    if (existing) {
      existing.remove();
    }

    injectReminderStyles();
    const overlay = document.createElement("div");
    overlay.id = "ds-reminder-fullscreen-overlay";
    overlay.className = "ds-reminder-fs-overlay";
    overlay.setAttribute("data-ds-themed", "true");
    overlay.style.setProperty("display", "none", "important");

    overlay.innerHTML = `
      <div class="ds-reminder-fs-backdrop" title="Click anywhere outside to dismiss"></div>
      <div class="ds-reminder-fs-card" role="dialog" aria-modal="true">
        <button type="button" class="ds-reminder-fs-close-btn" id="ds-reminder-fs-close-btn" title="Dismiss Reminder (Esc)" aria-label="Close">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="ds-icon ds-icon-x">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="ds-reminder-fs-pulse-ring"></div>
        <div class="ds-reminder-fs-icon-wrap">
          <div class="ds-reminder-fs-bell-box">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ds-reminder-fs-bell">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
        </div>
        <div class="ds-reminder-fs-badge">REMINDER DUE</div>
        <div class="ds-reminder-fs-titles-wrap" id="ds-reminder-fs-titles"></div>
        <div class="ds-reminder-fs-actions">
          <button type="button" class="ds-reminder-fs-btn-ack ds-ui-btn ds-ui-btn-primary" id="ds-reminder-fs-ack-btn">
            Acknowledge & Dismiss
          </button>
          <button type="button" class="ds-reminder-fs-btn-snooze ds-ui-btn ds-rem-btn-secondary" id="ds-reminder-fs-snooze-btn">
            Snooze 5 Min
          </button>
        </div>
        <small class="ds-reminder-fs-hint">Press Enter, Space, or Escape to dismiss</small>
      </div>
    `;

    document.body.appendChild(overlay);
    this.el = overlay;

    overlay.querySelector("#ds-reminder-fs-close-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.acknowledgeAll();
    });

    overlay.querySelector("#ds-reminder-fs-ack-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.acknowledgeAll();
    });

    overlay.querySelector("#ds-reminder-fs-snooze-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.snoozeAll();
    });

    // Clicking the backdrop dismisses the alarm cleanly
    overlay.querySelector(".ds-reminder-fs-backdrop")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.acknowledgeAll();
    });
  }

  show(reminders) {
    if (!reminders || reminders.length === 0) {
      this.hide();
      return;
    }

    if (!this.el || !document.body.contains(this.el)) {
      this._createDOM();
    }
    if (!this.el) return;

    this.currentReminders = [...reminders];

    const titlesContainer = this.el.querySelector("#ds-reminder-fs-titles");
    if (titlesContainer) {
      titlesContainer.innerHTML = "";
      for (const r of reminders) {
        if (!r) continue;
        const row = document.createElement("div");
        row.className = "ds-reminder-fs-title-item";
        row.innerHTML = `
          <h1 class="ds-reminder-fs-main-title">${escapeHtml(r.title || "Reminder")}</h1>
          <span class="ds-reminder-fs-time-badge">${fmtClock(r.targetTimestamp || Date.now())}</span>
        `;
        titlesContainer.appendChild(row);
      }
    }

    this.el.setAttribute("data-ds-themed", "true");
    if (window.DSGlobalTheme?.applyToElement) {
      window.DSGlobalTheme.applyToElement(this.el);
      const card = this.el.querySelector(".ds-reminder-fs-card");
      if (card) {
        card.setAttribute("data-ds-themed", "true");
        window.DSGlobalTheme.applyToElement(card);
      }
    }

    this.el.classList.add("is-visible");
    this.el.style.setProperty("display", "flex", "important");
    window.removeEventListener("keydown", this.boundKeyHandler, true);
    window.addEventListener("keydown", this.boundKeyHandler, true);

    const ackBtn = this.el.querySelector("#ds-reminder-fs-ack-btn");
    if (ackBtn) {
      setTimeout(() => ackBtn.focus(), 50);
    }
  }

  hide() {
    dsAudio.stopAlertLoop();
    if (this.el) {
      this.el.classList.remove("is-visible");
      this.el.style.setProperty("display", "none", "important");
    }
    const domEl = document.getElementById("ds-reminder-fullscreen-overlay");
    if (domEl) {
      domEl.classList.remove("is-visible");
      domEl.style.setProperty("display", "none", "important");
    }
    window.removeEventListener("keydown", this.boundKeyHandler, true);
  }

  acknowledgeAll() {
    const now = Date.now();
    for (const r of reminderStore.reminders) {
      if (r.state === "triggered" || (r.state === "scheduled" && r.targetTimestamp && r.targetTimestamp <= now)) {
        r.state = "completed";
        r.enabled = false;
        r.acknowledgedAt = now;
        if (typeof scheduler !== "undefined" && scheduler?._dismissedIds) {
          scheduler._dismissedIds.add(r.id);
        }
      }
    }
    for (const r of this.currentReminders) {
      if (r?.id) {
        reminderStore.acknowledgeReminder(r.id);
        if (typeof scheduler !== "undefined" && scheduler?._dismissedIds) {
          scheduler._dismissedIds.add(r.id);
        }
      }
    }
    reminderStore.save();
    this.currentReminders = [];
    dsAudio.stopAlertLoop();
    this.hide();
  }

  snoozeAll(minutes = 5) {
    const now = Date.now();
    for (const r of reminderStore.reminders) {
      if (r.state === "triggered") {
        r.targetTimestamp = now + minutes * 60 * 1000;
        r.state = "scheduled";
        r.enabled = true;
        if (typeof scheduler !== "undefined" && scheduler?._dismissedIds) {
          scheduler._dismissedIds.add(r.id);
        }
      }
    }
    for (const r of this.currentReminders) {
      if (r?.id) {
        reminderStore.snoozeReminder(r.id, minutes);
        if (typeof scheduler !== "undefined" && scheduler?._dismissedIds) {
          scheduler._dismissedIds.add(r.id);
        }
      }
    }
    reminderStore.save();
    this.currentReminders = [];
    dsAudio.stopAlertLoop();
    this.hide();
  }

  onKeyDown(e) {
    if (this.el && (this.el.classList.contains("is-visible") || this.el.style.display !== "none")) {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        e.stopPropagation();
        this.acknowledgeAll();
      }
    }
  }
}

export const fullscreenOverlay = new FullscreenReminderOverlay();
window.fullscreenOverlay = fullscreenOverlay;
window.dsReminderDismiss = () => fullscreenOverlay.acknowledgeAll();

// ---------------------------------------------------------------------------
// 5. CUSTOM DEATHSHOT DROPDOWN COMPONENT (Zero Native <select>)
// ---------------------------------------------------------------------------
export function createCustomDropdown(options = {}) {
  const items = options.items || [];
  let currentValue = options.value || (items[0]?.value ?? "");

  const root = document.createElement("div");
  root.className = "ds-rem-dropdown";

  const trigger = document.createElement("div");
  trigger.className = "ds-rem-dropdown-trigger";

  const valSpan = document.createElement("span");
  valSpan.className = "ds-rem-dropdown-val";
  const initialItem = items.find((it) => it.value === currentValue) || items[0];
  valSpan.textContent = initialItem?.label || currentValue;

  const arrow = document.createElement("span");
  arrow.className = "ds-rem-dropdown-arrow";
  arrow.innerHTML = `
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;

  trigger.append(valSpan, arrow);
  root.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "ds-rem-dropdown-menu";

  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = `ds-rem-dropdown-item ${it.value === currentValue ? "active" : ""}`;
    row.textContent = it.label;
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      currentValue = it.value;
      valSpan.textContent = it.label;
      menu.querySelectorAll(".ds-rem-dropdown-item").forEach((x) => x.classList.remove("active"));
      row.classList.add("active");
      root.classList.remove("open");
      options.onChange?.(currentValue);
    });
    menu.appendChild(row);
  });

  root.appendChild(menu);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".ds-rem-dropdown.open").forEach((d) => {
      if (d !== root) d.classList.remove("open");
    });
    root.classList.toggle("open");
  });

  const onDocClick = (e) => {
    if (!root.contains(e.target)) root.classList.remove("open");
  };
  document.addEventListener("click", onDocClick);

  return {
    root,
    getValue: () => currentValue,
    setValue: (val) => {
      currentValue = val;
      const it = items.find((x) => x.value === val);
      if (it) valSpan.textContent = it.label;
      menu.querySelectorAll(".ds-rem-dropdown-item").forEach((x) => {
        x.classList.toggle("active", x.textContent === it?.label);
      });
    },
    destroy: () => {
      document.removeEventListener("click", onDocClick);
      root.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// 6. GLOBAL TOOLBAR / MENU INTEGRATION & MANAGER POPOVER (Mounting in Action Dock)
// ---------------------------------------------------------------------------
class DSReminderToolbarManager {
  constructor() {
    this.group = null;
    this.btn = null;
    this.badge = null;
    this.popover = null;
    this.isOpen = false;
    this.draggedId = null;
    this._mountTries = 0;
    this.init();
  }

  init() {
    injectReminderStyles();
    this.mountToolbarButton();
    this.initToolbarObserver();

    reminderStore.subscribe(() => {
      this.updateBadge();
      if (this.isOpen) {
        this.renderPopover();
      }
    });

    if (window.DSGlobalTheme?.subscribe) {
      window.DSGlobalTheme.subscribe(() => {
        if (this.popover) window.DSGlobalTheme.applyToElement(this.popover);
        if (fullscreenOverlay?.el) {
          window.DSGlobalTheme.applyToElement(fullscreenOverlay.el);
          const card = fullscreenOverlay.el.querySelector(".ds-reminder-fs-card");
          if (card) window.DSGlobalTheme.applyToElement(card);
        }
      });
    }

    document.addEventListener("mousedown", (e) => {
      if (this.isOpen && this.popover && !this.popover.contains(e.target) && !this.btn?.contains(e.target)) {
        this.closePopover();
      }
    });
  }

  _createToolbarElements() {
    if (this.group && this.btn) return;

    const group = document.createElement("div");
    group.className = "ds-reminder-toolbar-group";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ds-reminder-toolbar-btn";
    btn.className = "comfyui-button ds-reminder-tb-btn";
    btn.setAttribute("title", "DS Reminder Manager");
    btn.setAttribute("aria-label", "DS Reminder Manager");
    btn.innerHTML = `
      <span class="ds-reminder-tb-icon-box">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ds-reminder-bell-svg">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </span>
      <span class="ds-reminder-tb-badge" id="ds-reminder-tb-badge" style="display:none;">0</span>
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePopover(btn);
    });

    group.appendChild(btn);
    this.group = group;
    this.btn = btn;
    this.badge = btn.querySelector("#ds-reminder-tb-badge");
  }

  mountToolbarButton() {
    const actionDock =
      app.menu?.settingsGroup?.element?.parentElement ||
      document.querySelector(".comfyui-menu") ||
      document.querySelector(".action-bar") ||
      document.querySelector(".comfyui-action-bar") ||
      document.querySelector(".top-bar-button-group") ||
      document.querySelector(".comfy-menu");
    if (!actionDock) {
      if (this._mountTries == null) this._mountTries = 0;
      if (++this._mountTries < 80) {
        setTimeout(() => this.mountToolbarButton(), 150);
      }
      return;
    }

    this._createToolbarElements();

    // Always anchor to the FAR LEFT of the action bar
    if (actionDock.firstChild !== this.group) {
      actionDock.prepend(this.group);
    }

    this.updateBadge();
  }

  initToolbarObserver() {
    const check = () => {
      const actionDock =
        app.menu?.settingsGroup?.element?.parentElement ||
        document.querySelector(".comfyui-menu") ||
        document.querySelector(".action-bar") ||
        document.querySelector(".comfyui-action-bar") ||
        document.querySelector(".top-bar-button-group") ||
        document.querySelector(".comfy-menu");
      if (!actionDock) return;
      if (actionDock.firstChild !== this.group) {
        actionDock.prepend(this.group);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(check, 250);
    setTimeout(check, 700);
    setTimeout(check, 1800);
  }

  updateBadge() {
    if (!this.badge || !this.btn) return;
    const triggered = reminderStore.getActiveTriggered();
    const scheduled = reminderStore.getActiveScheduled();

    if (triggered.length > 0) {
      this.badge.style.display = "inline-flex";
      this.badge.textContent = String(triggered.length);
      this.badge.className = "ds-reminder-tb-badge is-alert";
      this.btn.classList.add("is-trigger-pulsing");
    } else if (scheduled.length > 0) {
      this.badge.style.display = "inline-flex";
      this.badge.textContent = String(scheduled.length);
      this.badge.className = "ds-reminder-tb-badge";
      this.btn.classList.remove("is-trigger-pulsing");
    } else {
      this.badge.style.display = "none";
      this.btn.classList.remove("is-trigger-pulsing");
    }
  }

  togglePopover(anchorEl) {
    if (this.isOpen) {
      this.closePopover();
    } else {
      this.openPopover(anchorEl);
    }
  }

  openPopover(anchorEl) {
    this.closePopover();
    this.btn?.classList.add("is-active");
    const popover = document.createElement("div");
    popover.id = "ds-reminder-global-popover";
    popover.className = "ds-reminder-popover";
    popover.setAttribute("data-ds-themed", "true");
    if (window.DSGlobalTheme?.applyToElement) {
      window.DSGlobalTheme.applyToElement(popover);
    }

    document.body.appendChild(popover);
    this.popover = popover;
    this.isOpen = true;
    this.renderPopover();

    // Position relative to anchor (Upwards if dock is at bottom of screen)
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();

      let top;
      if (rect.top > window.innerHeight / 2) {
        // Upward popover positioning if docked at screen bottom
        top = rect.top - popRect.height - 8;
      } else {
        top = rect.bottom + 8;
      }

      let left = Math.round(rect.left + rect.width / 2 - popRect.width / 2);
      left = Math.max(10, Math.min(window.innerWidth - popRect.width - 10, left));
      top = Math.max(10, Math.min(window.innerHeight - popRect.height - 10, top));

      popover.style.top = `${Math.round(top)}px`;
      popover.style.left = `${Math.round(left)}px`;
    }
  }

  closePopover() {
    this.btn?.classList.remove("is-active");
    if (this.popover) {
      this.popover.remove();
      this.popover = null;
    }
    this.isOpen = false;
  }

  renderPopover() {
    if (!this.popover) return;
    const reminders = reminderStore.getReminders();
    const settings = reminderStore.settings;
    const triggered = reminderStore.getActiveTriggered();

    let alertBannerHtml = "";
    if (triggered.length > 0) {
      alertBannerHtml = `
        <div class="ds-rem-pop-alert-banner">
          <div class="ds-rem-alert-badge">🔔 ${triggered.length} DUE NOW</div>
          <button type="button" class="ds-rem-btn-turn-off-all" id="ds-rem-pop-dismiss-all">Turn Off All</button>
        </div>
      `;
    }

    this.popover.innerHTML = `
      <div class="ds-rem-pop-header">
        <div class="ds-rem-pop-brand">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <strong class="ds-rem-brand-title">DS REMINDER</strong>
        </div>
        <div class="ds-rem-pop-head-actions">
          <div id="ds-rem-pop-add-mount"></div>
          <button type="button" class="ds-rem-pop-close-btn" id="ds-rem-pop-close-btn" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="ds-icon ds-icon-x">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="ds-rem-pop-global-toggle-row">
        <div id="ds-rem-pop-fs-mount" style="width: 100%;"></div>
      </div>

      ${alertBannerHtml}

      <div class="ds-rem-pop-list" id="ds-rem-pop-list"></div>
    `;

    this.popover.querySelector("#ds-rem-pop-close-btn")?.addEventListener("click", () => this.closePopover());

    // UIElements Button for Add Reminder
    const addMount = this.popover.querySelector("#ds-rem-pop-add-mount");
    const addBtn = getDSButton({
      label: "+ Add Reminder",
      size: "compact",
      variant: "primary",
      className: "ds-rem-btn-primary",
      onClick: () => this.openEditorModal(null),
    });
    if (addMount && addBtn?.root) addMount.replaceWith(addBtn.root);

    // UIElements Toggle for Fullscreen Overlay
    const fsMount = this.popover.querySelector("#ds-rem-pop-fs-mount");
    const fsToggle = getDSToggle({
      label: "Fullscreen Overlay",
      checked: settings.globalFullscreen !== false,
      onChange: (val) => {
        reminderStore.setGlobalFullscreen(val);
      },
    });
    if (fsMount && fsToggle?.root) fsMount.replaceWith(fsToggle.root);

    // Dismiss all banner
    this.popover.querySelector("#ds-rem-pop-dismiss-all")?.addEventListener("click", () => {
      fullscreenOverlay.acknowledgeAll();
      this.renderPopover();
    });

    const listEl = this.popover.querySelector("#ds-rem-pop-list");
    if (reminders.length === 0) {
      listEl.innerHTML = `
        <div class="ds-rem-empty-state">
          <span>No reminders saved.</span>
          <small>Click [+ Add Reminder] to create one.</small>
        </div>
      `;
      return;
    }

    reminders.forEach((r, idx) => {
      const itemEl = this.createListItemDOM(r, idx);
      listEl.appendChild(itemEl);
    });
  }

  createListItemDOM(reminder, index) {
    const item = document.createElement("div");
    item.className = `ds-rem-item ${reminder.state === "triggered" ? "is-triggered" : ""} ${!reminder.enabled ? "is-disabled" : ""}`;
    item.draggable = true;
    item.dataset.id = reminder.id;
    item.dataset.index = String(index);

    let metaHtml = "";
    let turnOffBtnHtml = "";
    if (reminder.state === "scheduled") {
      metaHtml = `
        <span class="ds-rem-item-time">⏳ ${fmtCountdownOrClock(reminder)}</span>
        <span class="ds-rem-badge ds-rem-badge-scheduled">ACTIVE</span>
      `;
    } else if (reminder.state === "completed") {
      const timeStr = reminder.targetTimestamp || reminder.lastTriggered ? `Finished ${fmtClock(reminder.targetTimestamp || reminder.lastTriggered)}` : "";
      metaHtml = `
        ${timeStr ? `<span class="ds-rem-item-time">${timeStr}</span>` : ""}
        <span class="ds-rem-badge ds-rem-badge-completed">COMPLETED</span>
      `;
    } else if (reminder.state === "triggered") {
      metaHtml = `
        <span class="ds-rem-badge ds-rem-badge-triggered">DUE NOW</span>
      `;
      turnOffBtnHtml = `
        <button type="button" class="ds-rem-btn-turn-off" title="Turn Off Reminder Alarm">Turn Off</button>
      `;
    } else {
      metaHtml = `
        <span class="ds-rem-badge ds-rem-badge-disabled">PAUSED</span>
      `;
    }

    item.innerHTML = `
      <div class="ds-rem-drag-handle" title="Drag to rearrange">⋮⋮</div>
      <div class="ds-rem-item-toggle-slot"></div>
      <div class="ds-rem-item-content">
        <span class="ds-rem-item-title" title="${escapeHtml(reminder.title)}">${escapeHtml(reminder.title)}</span>
        <div class="ds-rem-item-meta">
          ${metaHtml}
        </div>
      </div>
      <div class="ds-rem-item-actions">
        ${turnOffBtnHtml}
        <button type="button" class="ds-rem-btn-icon ds-rem-btn-edit" title="Edit">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button type="button" class="ds-rem-btn-icon ds-rem-btn-delete" title="Delete">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Item enable toggle using UIElements Toggle
    const toggleSlot = item.querySelector(".ds-rem-item-toggle-slot");
    const itemToggle = getDSToggle({
      checked: reminder.enabled,
      onChange: (checked) => {
        reminderStore.toggleReminder(reminder.id, checked);
      },
    });
    if (toggleSlot && itemToggle?.root) toggleSlot.replaceWith(itemToggle.root);

    // Direct Turn Off button handler for triggered alarms
    item.querySelector(".ds-rem-btn-turn-off")?.addEventListener("click", (e) => {
      e.stopPropagation();
      reminderStore.acknowledgeReminder(reminder.id);
      dsAudio.stopAlertLoop();
      if (typeof scheduler !== "undefined" && scheduler?._dismissedIds) {
        scheduler._dismissedIds.add(reminder.id);
      }
      if (reminderStore.getActiveTriggered().length === 0) {
        fullscreenOverlay.hide();
      }
    });

    item.querySelector(".ds-rem-btn-edit")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openEditorModal(reminder);
    });

    item.querySelector(".ds-rem-btn-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      reminderStore.deleteReminder(reminder.id);
    });

    // Drag-to-Rearrange
    item.addEventListener("dragstart", (e) => {
      this.draggedId = reminder.id;
      item.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", reminder.id);
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
      this.draggedId = null;
      document.querySelectorAll(".ds-rem-item").forEach((el) => {
        el.classList.remove("drag-over-top", "drag-over-bottom");
      });
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        item.classList.add("drag-over-top");
        item.classList.remove("drag-over-bottom");
      } else {
        item.classList.add("drag-over-bottom");
        item.classList.remove("drag-over-top");
      }
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over-top", "drag-over-bottom");
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over-top", "drag-over-bottom");
      const fromId = this.draggedId || e.dataTransfer.getData("text/plain");
      if (!fromId || fromId === reminder.id) return;

      const reminders = reminderStore.getReminders();
      const fromIdx = reminders.findIndex((r) => r.id === fromId);
      const toIdx = reminders.findIndex((r) => r.id === reminder.id);

      if (fromIdx !== -1 && toIdx !== -1) {
        reminderStore.reorderReminders(fromIdx, toIdx);
      }
    });

    return item;
  }

  openEditorModal(existingReminder = null) {
    const isEdit = !!existingReminder;
    const modal = document.createElement("div");
    modal.className = "ds-rem-modal-backdrop";

    const titleVal = existingReminder?.title || "";
    const modeVal = existingReminder?.mode || "duration";
    let durVal = existingReminder?.durationMinutes || 15;
    const clockVal = existingReminder?.clockTime || "18:00";
    let soundVal = existingReminder?.sound || "desk_bell";
    let fsVal = existingReminder ? existingReminder.fullscreen !== false : true;

    modal.innerHTML = `
      <div class="ds-rem-editor-card" data-ds-themed="true">
        <div class="ds-rem-editor-header">
          <strong class="ds-rem-editor-title">${isEdit ? "Edit Reminder" : "Create Reminder"}</strong>
          <button type="button" class="ds-rem-pop-close-btn" id="ds-rem-modal-cancel-x" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="ds-icon ds-icon-x">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="ds-rem-editor-body">
          <label class="ds-rem-form-group">
            <span class="ds-rem-form-label">Description / Task</span>
            <input type="text" class="ds-rem-input" id="ds-rem-input-title" placeholder="e.g. Check the rice, Turn off oven" value="${escapeHtml(titleVal)}" maxlength="140" />
          </label>

          <div class="ds-rem-form-group">
            <span class="ds-rem-form-label">Time Selection Mode</span>
            <div class="ds-rem-segmented-row" id="ds-rem-mode-segmented">
              <button type="button" class="ds-rem-seg-btn ${modeVal === "duration" ? "is-active" : ""}" data-mode="duration">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>Countdown / Duration</span>
              </button>
              <button type="button" class="ds-rem-seg-btn ${modeVal === "clock" ? "is-active" : ""}" data-mode="clock">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 10"></polyline></svg>
                <span>Clock Time</span>
              </button>
            </div>
          </div>

          <div class="ds-rem-tab-content-container">
            <!-- Duration configuration -->
            <div id="ds-rem-duration-panel" class="ds-rem-subpanel ${modeVal === "duration" ? "is-active" : "is-hidden"}">
              <span class="ds-rem-form-label">Duration</span>
              <div class="ds-rem-quick-chips">
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-rem-chip" data-min="1">+1m</button>
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-rem-chip" data-min="5">+5m</button>
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-rem-chip" data-min="10">+10m</button>
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-rem-chip" data-min="15">+15m</button>
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-rem-chip" data-min="30">+30m</button>
                <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-rem-chip" data-min="60">+1h</button>
              </div>
              <div id="ds-rem-stepper-mount" style="width:100%;"></div>
            </div>

            <!-- Clock time configuration -->
            <div id="ds-rem-clock-panel" class="ds-rem-subpanel ${modeVal === "clock" ? "is-active" : "is-hidden"}">
              <span class="ds-rem-form-label">Alarm Time (24h HH:MM)</span>
              <input type="time" class="ds-rem-input ds-rem-time-input" id="ds-rem-input-clock" value="${clockVal}" />
            </div>
          </div>

          <!-- Sound selection (Custom Deathshot Dropdown) -->
          <div class="ds-rem-form-group">
            <span class="ds-rem-form-label">Alert Sound</span>
            <div class="ds-rem-sound-row">
              <div id="ds-rem-sound-dropdown-mount" style="flex:1;"></div>
              <div id="ds-rem-sound-test-mount"></div>
            </div>
          </div>

          <!-- Notification mode toggle (UIElements Toggle) -->
          <div id="ds-rem-modal-fs-mount"></div>
        </div>

        <div class="ds-rem-editor-footer">
          <div id="ds-rem-modal-cancel-mount"></div>
          <div id="ds-rem-modal-save-mount"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    if (window.DSGlobalTheme?.applyToElement) {
      const card = modal.querySelector(".ds-rem-editor-card");
      if (card) window.DSGlobalTheme.applyToElement(card);
    }

    let activeMode = modeVal;
    const durPanel = modal.querySelector("#ds-rem-duration-panel");
    const clockPanel = modal.querySelector("#ds-rem-clock-panel");
    const clockInput = modal.querySelector("#ds-rem-input-clock");
    const titleInput = modal.querySelector("#ds-rem-input-title");

    // Stepper from UIElements
    const stepperMount = modal.querySelector("#ds-rem-stepper-mount");
    const durStepper = getDSStepper({
      value: durVal,
      min: 1,
      max: 1440,
      step: 1,
      onChange: (v) => {
        durVal = v;
      },
    });
    if (stepperMount && durStepper?.root) stepperMount.appendChild(durStepper.root);

    // Quick chips
    modal.querySelectorAll(".ds-rem-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const added = parseInt(chip.dataset.min, 10) || 5;
        durVal = Math.min(1440, (durStepper?.getValue?.() ?? durVal) + added);
        durStepper?.setValue?.(durVal, true);
      });
    });

    // Segmented Mode Switching
    const modeButtons = modal.querySelectorAll("#ds-rem-mode-segmented .ds-rem-seg-btn");
    modeButtons.forEach((b) => {
      b.addEventListener("click", () => {
        modeButtons.forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        activeMode = b.dataset.mode;
        if (activeMode === "duration") {
          durPanel.classList.remove("is-hidden");
          durPanel.classList.add("is-active");
          clockPanel.classList.add("is-hidden");
          clockPanel.classList.remove("is-active");
        } else {
          clockPanel.classList.remove("is-hidden");
          clockPanel.classList.add("is-active");
          durPanel.classList.add("is-hidden");
          durPanel.classList.remove("is-active");
        }
      });
    });

    // Custom Deathshot Dropdown
    const soundMount = modal.querySelector("#ds-rem-sound-dropdown-mount");
    const dropdown = createCustomDropdown({
      items: SOUND_OPTIONS,
      value: soundVal,
      onChange: (v) => {
        soundVal = v;
      },
    });
    soundMount.appendChild(dropdown.root);

    // Test Sound play button from UIElements
    const soundTestMount = modal.querySelector("#ds-rem-sound-test-mount");
    const playBtn = getDSButton({
      icon: "play",
      tooltip: "Test Audio",
      size: "compact",
      className: "ds-rem-btn-test-sound",
      onClick: () => {
        dsAudio.playSound(soundVal, 0.7);
      },
    });
    if (soundTestMount && playBtn?.root) soundTestMount.replaceWith(playBtn.root);

    // Fullscreen Toggle from UIElements
    const modalFsMount = modal.querySelector("#ds-rem-modal-fs-mount");
    const modalFsToggle = getDSToggle({
      label: "Show Fullscreen Overlay on Trigger",
      checked: fsVal,
      onChange: (checked) => {
        fsVal = checked;
      },
    });
    if (modalFsMount && modalFsToggle?.root) modalFsMount.replaceWith(modalFsToggle.root);

    const closeModal = () => {
      dropdown.destroy();
      modal.remove();
    };
    modal.querySelector("#ds-rem-modal-cancel-x")?.addEventListener("click", closeModal);

    // Footer buttons from UIElements
    const cancelMount = modal.querySelector("#ds-rem-modal-cancel-mount");
    const cancelBtn = getDSButton({
      label: "Cancel",
      variant: "secondary",
      className: "ds-rem-btn-secondary",
      onClick: closeModal,
    });
    if (cancelMount && cancelBtn?.root) cancelMount.replaceWith(cancelBtn.root);

    const saveMount = modal.querySelector("#ds-rem-modal-save-mount");
    const saveBtn = getDSButton({
      label: isEdit ? "Save Changes" : "Create Reminder",
      variant: "primary",
      className: "ds-rem-btn-primary",
      onClick: () => {
        const title = (titleInput.value || "Reminder").trim();
        const payload = {
          title,
          mode: activeMode,
          durationMinutes: durVal,
          clockTime: clockInput.value || "18:00",
          sound: soundVal,
          fullscreen: fsVal,
        };

        if (isEdit) {
          reminderStore.updateReminder(existingReminder.id, payload);
        } else {
          reminderStore.addReminder(payload);
        }
        closeModal();
      },
    });
    if (saveMount && saveBtn?.root) saveMount.replaceWith(saveBtn.root);
  }
}

export const toolbarManager = new DSReminderToolbarManager();

// ---------------------------------------------------------------------------
// 8. HELPER UTILITIES
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtClock(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtCountdownOrClock(reminder) {
  if (reminder.state === "completed") return "";
  if (!reminder.enabled) return "Disabled";
  if (reminder.state === "triggered") return "DUE NOW";

  const diffMs = (reminder.targetTimestamp || 0) - Date.now();
  if (diffMs <= 0) return "Due Now";

  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// ---------------------------------------------------------------------------
// 9. GLOBAL STYLES INJECTION (Strict Deathshot Visual Contract)
// ---------------------------------------------------------------------------
function injectReminderStyles() {
  let style = document.getElementById("ds-reminder-global-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "ds-reminder-global-styles";
    document.head.appendChild(style);
  }
  style.textContent = `
    /* Action dock button & Top Action Bar integration */
    .ds-reminder-toolbar-group,
    div.ds-reminder-toolbar-group {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: visible !important;
      background: none !important;
      background-color: transparent !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 4px 0 2px !important;
      outline: none !important;
    }
    .ds-reminder-toolbar-group::before,
    .ds-reminder-toolbar-group::after {
      display: none !important;
      content: none !important;
    }
    .ds-reminder-tb-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      overflow: visible !important;
      min-width: 40px !important;
      height: 38px !important;
      padding: 0 10px !important;
      margin: 0 !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, rgba(255, 255, 255, 0.18))) !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #e2e8f0)) !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      outline: none !important;
      box-shadow: none !important;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
      vertical-align: middle !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
    }
    .ds-reminder-tb-btn:hover,
    .ds-reminder-tb-btn.is-active {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
      box-shadow: none !important;
    }
    .ds-reminder-tb-btn::before,
    .ds-reminder-tb-btn::after {
      display: none !important;
      content: none !important;
    }
    .ds-reminder-tb-icon-box {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 22px !important;
      height: 22px !important;
      color: var(--ds-btn-text, var(--ds-color-text, currentColor)) !important;
      transform-origin: 50% 12% !important;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      will-change: transform;
    }
    .ds-reminder-bell-svg {
      stroke: var(--ds-btn-text, var(--ds-color-text, currentColor)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, currentColor)) !important;
      display: block !important;
      width: 22px !important;
      height: 22px !important;
      transform-origin: 50% 12% !important;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s ease, stroke 0.15s ease !important;
      will-change: transform;
    }
    .ds-reminder-tb-btn:hover .ds-reminder-tb-icon-box,
    .ds-reminder-tb-btn.is-active .ds-reminder-tb-icon-box {
      animation: dsBellRingHover 0.75s ease-in-out infinite alternate !important;
      color: var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-reminder-tb-btn:hover .ds-reminder-bell-svg,
    .ds-reminder-tb-btn.is-active .ds-reminder-bell-svg {
      color: var(--ds-color-accent, #67e8f9) !important;
      stroke: var(--ds-color-accent, #67e8f9) !important;
    }
    @keyframes dsBellRingHover {
      0% { transform: rotate(18deg) scale(1.1); }
      35% { transform: rotate(-16deg) scale(1.1); }
      70% { transform: rotate(14deg) scale(1.08); }
      100% { transform: rotate(-10deg) scale(1.05); }
    }
    .ds-reminder-tb-badge {
      position: absolute !important;
      top: -3px !important;
      right: -2px !important;
      min-width: 15px !important;
      height: 15px !important;
      padding: 0 3px !important;
      border-radius: 999px !important;
      background: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      font-size: 9px !important;
      font-weight: 800 !important;
      line-height: 15px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1.5px solid var(--ds-color-panel-2, #181d26) !important;
      box-sizing: border-box !important;
      z-index: 100 !important;
      pointer-events: none !important;
      box-shadow: 0 0 6px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 50%, transparent) !important;
    }
    .ds-reminder-tb-badge.is-alert {
      background: #ef4444 !important;
      color: #ffffff !important;
      animation: dsRemPulse 1s infinite alternate !important;
    }
    @keyframes dsRemPulse {
      from { transform: scale(1); box-shadow: 0 0 0 rgba(239, 68, 68, 0.4); }
      to { transform: scale(1.18); box-shadow: 0 0 10px rgba(239, 68, 68, 0.9); }
    }
    .ds-reminder-tb-btn.is-trigger-pulsing {
      border-color: #ef4444 !important;
      color: #ef4444 !important;
    }
    .ds-reminder-tb-btn.is-trigger-pulsing .ds-reminder-bell-svg {
      color: #ef4444 !important;
      stroke: #ef4444 !important;
    }
    .ds-reminder-tb-btn.is-trigger-pulsing .ds-reminder-tb-icon-box {
      animation: dsBellRingAlert 0.45s ease-in-out infinite !important;
      color: #ef4444 !important;
    }
    @keyframes dsBellRingAlert {
      0%, 100% { transform: rotate(0deg) scale(1.12); }
      25% { transform: rotate(24deg) scale(1.18); }
      50% { transform: rotate(-24deg) scale(1.18); }
      75% { transform: rotate(16deg) scale(1.12); }
    }
    @keyframes dsRemBorderPulse {
      from { border-color: rgba(239, 68, 68, 0.5); }
      to { border-color: #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.6); }
    }

    /* Official Deathshot Soft-Rectangle Toggle Switch */
    .ds-rem-toggle-btn {
      all: unset !important;
      position: relative !important;
      display: inline-block !important;
      width: 32px !important;
      min-width: 32px !important;
      max-width: 32px !important;
      height: 18px !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      background: transparent !important;
      cursor: pointer !important;
      outline: none !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
    .ds-rem-toggle-track {
      display: block !important;
      width: 32px !important;
      height: 18px !important;
      border-radius: 4px !important;
      background: var(--ds-color-panel-2, #161a23) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      position: relative !important;
      transition: all var(--ds-transition, 120ms ease) !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
    }
    .ds-rem-toggle-btn.is-on .ds-rem-toggle-track {
      background: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      box-shadow: 0 0 8px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 35%, transparent) !important;
    }
    .ds-rem-toggle-thumb {
      position: absolute !important;
      top: 2px !important;
      left: 2px !important;
      width: 12px !important;
      height: 12px !important;
      border-radius: 2px !important;
      background: var(--ds-color-muted-text, #94a3b8) !important;
      transition: transform var(--ds-transition, 120ms ease), background-color var(--ds-transition, 120ms ease) !important;
      pointer-events: none !important;
    }
    .ds-rem-toggle-btn.is-on .ds-rem-toggle-thumb {
      transform: translateX(14px) !important;
      background: var(--ds-color-on-accent, #0a0c10) !important;
    }

    /* Popover */
    .ds-reminder-popover {
      position: fixed !important;
      z-index: 100000 !important;
      width: 380px !important;
      min-width: 380px !important;
      max-width: min(380px, calc(100vw - 20px)) !important;
      max-height: 82vh !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
      background: var(--ds-color-card, #12151c) !important;
      border: 1px solid var(--ds-color-card-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-card, 8px) !important;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
      display: flex !important;
      flex-direction: column !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
      color: var(--ds-color-text, #f8fafc) !important;
      padding: 0 !important;
      overflow: hidden !important;
      animation: dsRemPopIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    @keyframes dsRemPopIn {
      from { opacity: 0; transform: translateY(-4px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .ds-rem-pop-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 10px 14px !important;
      border-bottom: 1px solid var(--ds-color-border, #242a36) !important;
      background: transparent !important;
      gap: 16px !important;
      box-sizing: border-box !important;
    }
    .ds-rem-pop-brand {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 11.5px !important;
      font-weight: 800 !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      letter-spacing: 0.06em !important;
      text-transform: uppercase !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      user-select: none !important;
    }
    .ds-rem-brand-title {
      font-weight: 800 !important;
      white-space: nowrap !important;
    }
    .ds-rem-pop-head-actions {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      flex-shrink: 0 !important;
      margin-left: auto !important;
    }
    .ds-rem-btn-small {
      height: 26px !important;
      padding: 0 10px !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      transition: all 0.12s ease !important;
      white-space: nowrap !important;
      box-sizing: border-box !important;
      user-select: none !important;
    }
    .ds-rem-btn-small:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-pop-close-btn {
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      margin: 0 !important;
      line-height: 1 !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      transition: all 0.12s ease !important;
      user-select: none !important;
      box-sizing: border-box !important;
    }
    .ds-rem-pop-close-btn:hover {
      color: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-pop-close-btn svg {
      display: block !important;
      margin: auto !important;
      pointer-events: none !important;
      stroke: currentColor !important;
    }
    .ds-rem-pop-alert-banner {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 8px 12px !important;
      background: color-mix(in srgb, var(--ds-color-danger, #ef4444) 18%, var(--ds-color-panel-2, #181d26)) !important;
      border-bottom: 1px solid var(--ds-color-danger, #ef4444) !important;
      animation: dsRemBorderPulse 1.2s infinite alternate !important;
      box-sizing: border-box !important;
    }
    .ds-rem-alert-badge {
      font-size: 11px !important;
      font-weight: 800 !important;
      color: var(--ds-color-danger, #ef4444) !important;
      letter-spacing: 0.5px !important;
    }
    .ds-rem-btn-turn-off-all {
      height: 22px !important;
      padding: 0 10px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      background: var(--ds-color-danger, #ef4444) !important;
      color: #fff !important;
      border: 1px solid var(--ds-color-danger, #ef4444) !important;
      cursor: pointer !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
    }
    .ds-rem-btn-turn-off-all:hover {
      background: color-mix(in srgb, var(--ds-color-danger, #ef4444) 85%, black) !important;
      transform: scale(1.03) !important;
    }
    .ds-rem-btn-turn-off {
      height: 22px !important;
      padding: 0 8px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      background: var(--ds-color-danger, #ef4444) !important;
      color: #ffffff !important;
      border: 1px solid var(--ds-color-danger, #ef4444) !important;
      cursor: pointer !important;
      transition: all 0.12s ease !important;
      margin-right: 4px !important;
      flex-shrink: 0 !important;
      box-sizing: border-box !important;
    }
    .ds-rem-btn-turn-off:hover {
      background: color-mix(in srgb, var(--ds-color-danger, #ef4444) 85%, black) !important;
    }
    .ds-rem-pop-global-toggle-row {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 9px 14px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      border-bottom: 1px solid var(--ds-color-border, #242a36) !important;
      background: rgba(0, 0, 0, 0.14) !important;
      color: var(--ds-color-text, #f8fafc) !important;
      box-sizing: border-box !important;
    }
    .ds-rem-pop-global-toggle-row .ds-ui-toggle-row {
      width: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
    }
    .ds-rem-pop-global-toggle-row .ds-rem-toggle-btn {
      margin-left: auto !important;
    }
    .ds-rem-pop-list {
      display: flex !important;
      flex-direction: column !important;
      overflow-y: auto !important;
      max-height: calc(82vh - 85px) !important;
      padding: 8px !important;
      gap: 6px !important;
      box-sizing: border-box !important;
    }
    .ds-rem-empty-state {
      padding: 28px 14px !important;
      text-align: center !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 5px !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      font-size: 11.5px !important;
    }

    /* List item */
    .ds-rem-item {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 10px !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      background: var(--ds-color-panel-2, #181d26) !important;
      box-sizing: border-box !important;
      width: 100% !important;
      min-width: 0 !important;
      transition: background 0.12s ease, border-color 0.12s ease !important;
      user-select: none !important;
    }
    .ds-rem-item:hover {
      border-color: rgba(255, 255, 255, 0.25) !important;
    }
    .ds-rem-item.is-triggered {
      border-color: #ef4444 !important;
      background: rgba(239, 68, 68, 0.14) !important;
    }
    .ds-rem-item.is-disabled {
      opacity: 0.55 !important;
    }
    .ds-rem-item.is-dragging {
      opacity: 0.25 !important;
    }
    .ds-rem-item.drag-over-top {
      border-top: 2px solid var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-rem-item.drag-over-bottom {
      border-bottom: 2px solid var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-rem-drag-handle {
      cursor: grab !important;
      color: var(--ds-color-muted-text, #64748b) !important;
      font-size: 12px !important;
      padding: 2px !important;
      flex: 0 0 auto !important;
      user-select: none !important;
    }
    .ds-rem-drag-handle:active {
      cursor: grabbing !important;
    }
    .ds-rem-item-content {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      gap: 3px !important;
      overflow: hidden !important;
    }
    .ds-rem-item-title {
      font-size: 11.5px !important;
      font-weight: 700 !important;
      color: var(--ds-color-text, #f8fafc) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      line-height: 1.2 !important;
    }
    .ds-rem-item-meta {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      line-height: 1 !important;
    }
    .ds-rem-item-time {
      font-size: 9.5px !important;
      font-family: monospace, var(--ds-font, sans-serif) !important;
      font-weight: 700 !important;
      color: var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-rem-badge {
      font-size: 8px !important;
      padding: 1px 5px !important;
      border-radius: var(--ds-radius-badge, 3px) !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      background: rgba(255, 255, 255, 0.08) !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
    }
    .ds-rem-badge-triggered {
      background: #ef4444 !important;
      color: #ffffff !important;
    }
    .ds-rem-badge-scheduled {
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 15%, transparent) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      border: 1px solid color-mix(in srgb, var(--ds-color-accent, #67e8f9) 30%, transparent) !important;
    }
    .ds-rem-badge-completed {
      background: rgba(34, 197, 94, 0.15) !important;
      color: #4ade80 !important;
    }
    .ds-rem-badge-disabled {
      background: rgba(255, 255, 255, 0.06) !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
    }
    .ds-rem-item-actions {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      flex: 0 0 auto !important;
    }
    .ds-rem-btn-icon {
      width: 24px !important;
      height: 24px !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      display: grid !important;
      place-items: center !important;
      padding: 0 !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
    }
    .ds-rem-btn-icon svg {
      stroke: currentColor !important;
      fill: none !important;
      pointer-events: none !important;
    }
    .ds-rem-btn-icon:hover {
      background: var(--ds-btn-hover, #202633) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-rem-btn-delete:hover {
      border-color: var(--ds-color-danger, #ef4444) !important;
      color: var(--ds-color-danger, #ef4444) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }

    /* Custom Deathshot Dropdown */
    .ds-rem-dropdown {
      position: relative !important;
      width: 100% !important;
      user-select: none !important;
      box-sizing: border-box !important;
    }
    .ds-rem-dropdown-trigger {
      height: 30px !important;
      padding: 0 26px 0 10px !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      position: relative !important;
      transition: border-color 0.15s ease, background 0.15s ease !important;
      box-sizing: border-box !important;
    }
    .ds-rem-dropdown-trigger:hover,
    .ds-rem-dropdown.open .ds-rem-dropdown-trigger {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-dropdown-val {
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .ds-rem-dropdown-arrow {
      position: absolute !important;
      right: 8px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      pointer-events: none !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      transition: transform 0.15s ease !important;
      display: grid !important;
      place-items: center !important;
    }
    .ds-rem-dropdown.open .ds-rem-dropdown-arrow {
      transform: translateY(-50%) rotate(180deg) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-rem-dropdown-menu {
      display: none !important;
      position: absolute !important;
      top: calc(100% + 4px) !important;
      left: 0 !important;
      width: 100% !important;
      max-height: 200px !important;
      overflow-y: auto !important;
      background: var(--ds-color-card, #12151c) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7) !important;
      z-index: 100020 !important;
      padding: 4px !important;
      box-sizing: border-box !important;
    }
    .ds-rem-dropdown.open .ds-rem-dropdown-menu {
      display: block !important;
    }
    .ds-rem-dropdown-item {
      padding: 7px 9px !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      font-size: 11px !important;
      color: var(--ds-color-text, #f8fafc) !important;
      cursor: pointer !important;
      transition: background 0.1s ease, color 0.1s ease !important;
    }
    .ds-rem-dropdown-item:hover {
      background: var(--ds-color-panel-2, #181d26) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
    }
    .ds-rem-dropdown-item.active {
      background: var(--ds-color-panel-2, #181d26) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      font-weight: 700 !important;
    }

    /* Modal dialog */
    .ds-rem-modal-backdrop {
      position: fixed !important;
      inset: 0 !important;
      z-index: 100050 !important;
      background: rgba(0, 0, 0, 0.7) !important;
      backdrop-filter: blur(6px) !important;
      display: grid !important;
      place-items: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
    }
    .ds-rem-editor-card {
      width: 380px !important;
      min-width: 360px !important;
      max-width: 95vw !important;
      min-height: 410px !important;
      background: var(--ds-color-card, #12151c) !important;
      border: 1px solid var(--ds-color-card-border, var(--ds-color-border, #242a36)) !important;
      border-radius: var(--ds-radius-card, 8px) !important;
      box-shadow: 0 20px 50px rgba(0,0,0,0.7) !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      padding: 16px !important;
      color: var(--ds-color-text, #f8fafc) !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
      box-sizing: border-box !important;
      animation: dsRemPopIn 0.15s ease-out !important;
      flex-shrink: 0 !important;
    }
    .ds-rem-editor-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      border-bottom: 1px solid var(--ds-color-border, #242a36) !important;
      padding-bottom: 10px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
    }
    .ds-rem-editor-body {
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
    }
    .ds-rem-form-group {
      display: flex !important;
      flex-direction: column !important;
      gap: 5px !important;
    }
    .ds-rem-form-label {
      font-size: 10px !important;
      font-weight: 800 !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
    }
    .ds-rem-input {
      height: 30px !important;
      padding: 0 10px !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      background: var(--ds-color-panel-2, #181d26) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      color: var(--ds-color-text, #f8fafc) !important;
      font-size: 11.5px !important;
      font-family: inherit !important;
      outline: none !important;
      box-sizing: border-box !important;
      width: 100% !important;
      transition: border-color 0.15s ease !important;
    }
    .ds-rem-input:focus {
      border-color: var(--ds-color-accent, #67e8f9) !important;
    }
    /* Segmented Mode Selection Row */
    .ds-rem-segmented-row {
      display: flex !important;
      gap: 6px !important;
      width: 100% !important;
    }
    .ds-rem-seg-btn {
      flex: 1 !important;
      height: 32px !important;
      font-size: 11.5px !important;
      font-weight: 600 !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-muted-text, #94a3b8)) !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      transition: all 0.12s ease !important;
      user-select: none !important;
      outline: none !important;
      box-sizing: border-box !important;
    }
    .ds-rem-seg-btn svg {
      stroke: currentColor !important;
      pointer-events: none !important;
    }
    .ds-rem-seg-btn:hover:not(.is-active) {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-seg-btn.is-active {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      font-weight: 700 !important;
      box-shadow: 0 2px 8px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 35%, transparent) !important;
    }
    .ds-rem-seg-btn.is-active svg {
      stroke: var(--ds-color-on-accent, #0a0c10) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
    }
    .ds-rem-tab-content-container {
      position: relative !important;
      min-height: 85px !important;
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .ds-rem-subpanel {
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      padding: 0 !important;
      background: transparent !important;
      border: none !important;
      box-sizing: border-box !important;
      min-height: 85px !important;
      justify-content: center !important;
      width: 100% !important;
    }
    .ds-rem-subpanel.is-hidden {
      display: none !important;
    }
    .ds-rem-quick-chips {
      display: flex !important;
      gap: 5px !important;
      flex-wrap: wrap !important;
      margin-bottom: 2px !important;
    }
    .ds-rem-chip {
      height: 24px !important;
      padding: 0 8px !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
      border-radius: var(--ds-radius-control, 4px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
    }
    .ds-rem-chip:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-stepper-row {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: 100% !important;
    }
    .ds-rem-step-btn,
    .ds-rem-editor-card .ds-ui-stepper-btn,
    .ds-reminder-popover .ds-ui-stepper-btn {
      width: 28px !important;
      height: 28px !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      display: grid !important;
      place-items: center !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
    }
    .ds-rem-step-btn svg,
    .ds-rem-editor-card .ds-ui-stepper-btn svg,
    .ds-reminder-popover .ds-ui-stepper-btn svg {
      stroke: currentColor !important;
      pointer-events: none !important;
    }
    .ds-rem-step-btn:hover,
    .ds-rem-editor-card .ds-ui-stepper-btn:hover,
    .ds-reminder-popover .ds-ui-stepper-btn:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-stepper-display {
      flex: 1 !important;
      height: 28px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      background: var(--ds-color-panel-2, #181d26) !important;
      border: 1px solid var(--ds-color-border, #242a36) !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      font-family: monospace, var(--ds-font, sans-serif) !important;
    }
    .ds-rem-stepper-unit {
      font-size: 10px !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      font-weight: 600 !important;
    }
    .ds-rem-sound-row {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: 100% !important;
    }
    .ds-rem-btn-test-sound {
      width: 30px !important;
      height: 30px !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      cursor: pointer !important;
      display: grid !important;
      place-items: center !important;
      transition: all 0.12s ease !important;
      flex: 0 0 30px !important;
      box-sizing: border-box !important;
    }
    .ds-rem-btn-test-sound svg {
      stroke: currentColor !important;
      fill: none !important;
      pointer-events: none !important;
    }
    .ds-rem-btn-test-sound:hover {
      background: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
    }
    .ds-rem-toggle-row {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
      padding: 6px 0 !important;
      box-sizing: border-box !important;
    }
    .ds-rem-toggle-label {
      font-size: 11.5px !important;
      color: var(--ds-color-text, #f8fafc) !important;
      font-weight: 600 !important;
      flex: 1 1 auto !important;
    }
    .ds-rem-toggle-row .ds-rem-toggle-btn {
      margin-left: auto !important;
    }
    .ds-rem-editor-footer {
      display: flex !important;
      justify-content: flex-end !important;
      gap: 8px !important;
      border-top: 1px solid var(--ds-color-border, #242a36) !important;
      padding-top: 12px !important;
    }
    .ds-rem-btn-secondary,
    .ds-rem-editor-card .ds-ui-btn-secondary {
      height: 30px !important;
      padding: 0 14px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
    }
    .ds-rem-btn-secondary:hover,
    .ds-rem-editor-card .ds-ui-btn-secondary:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-rem-btn-primary,
    .ds-rem-editor-card .ds-ui-btn-primary,
    .ds-reminder-popover .ds-ui-btn-primary {
      height: 30px !important;
      padding: 0 16px !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      border-radius: var(--ds-radius-control, 5px) !important;
      background: var(--ds-color-accent, #67e8f9) !important;
      border: 1px solid var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      cursor: pointer !important;
      transition: all 0.12s ease !important;
      position: relative !important;
      box-sizing: border-box !important;
    }
    .ds-rem-btn-primary:hover,
    .ds-rem-editor-card .ds-ui-btn-primary:hover,
    .ds-reminder-popover .ds-ui-btn-primary:hover {
      filter: brightness(1.1) !important;
      box-shadow: 0 0 10px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 40%, transparent) !important;
    }
    .ds-reminder-popover .ds-ui-btn-primary.ds-ui-btn-compact {
      height: 24px !important;
      padding: 0 10px !important;
      font-size: 10.5px !important;
    }

    /* Custom Webkit Scrollbars (Zero Native Scrollbars) */
    .ds-reminder-popover *::-webkit-scrollbar,
    .ds-rem-modal-backdrop *::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    .ds-reminder-popover *::-webkit-scrollbar-track,
    .ds-rem-modal-backdrop *::-webkit-scrollbar-track {
      background: transparent;
    }
    .ds-reminder-popover *::-webkit-scrollbar-thumb,
    .ds-rem-modal-backdrop *::-webkit-scrollbar-thumb {
      background: var(--ds-color-border, rgba(255, 255, 255, 0.18));
      border-radius: 4px;
    }
    .ds-reminder-popover *::-webkit-scrollbar-thumb:hover,
    .ds-rem-modal-backdrop *::-webkit-scrollbar-thumb:hover {
      background: var(--ds-color-accent, #67e8f9);
    }

    /* Fullscreen Overlay */
    .ds-reminder-fs-overlay {
      position: fixed !important;
      inset: 0 !important;
      z-index: 999999 !important;
      display: none !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 0.2s ease-out !important;
    }
    .ds-reminder-fs-overlay.is-visible {
      display: flex !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      animation: dsRemFadeIn 0.2s ease-out !important;
    }
    @keyframes dsRemFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .ds-reminder-fs-backdrop {
      position: absolute !important;
      inset: 0 !important;
      background: rgba(7, 9, 13, 0.85) !important;
      backdrop-filter: blur(16px) !important;
      z-index: 1 !important;
    }
    .ds-reminder-fs-card {
      position: relative !important;
      z-index: 2 !important;
      max-width: 540px !important;
      width: 90% !important;
      background: var(--ds-color-card, #12151c) !important;
      border: 2px solid var(--ds-color-accent, #67e8f9) !important;
      border-radius: var(--ds-radius-card, 12px) !important;
      padding: 28px 24px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      text-align: center !important;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 32px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 30%, transparent) !important;
      animation: dsRemPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .ds-reminder-fs-close-btn {
      position: absolute !important;
      top: 14px !important;
      right: 14px !important;
      width: 30px !important;
      height: 30px !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      margin: 0 !important;
      line-height: 1 !important;
      transition: all 0.15s ease !important;
      z-index: 10 !important;
      outline: none !important;
      box-sizing: border-box !important;
    }
    .ds-reminder-fs-close-btn:hover {
      background: var(--ds-btn-hover, #202633) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      box-shadow: 0 0 8px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 30%, transparent) !important;
    }
    .ds-reminder-fs-close-btn svg {
      display: block !important;
      margin: auto !important;
      pointer-events: none !important;
      stroke: currentColor !important;
    }
    .ds-reminder-fs-card.is-shaking {
      animation: dsRemShake 0.4s ease !important;
    }
    @keyframes dsRemShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .ds-reminder-fs-pulse-ring {
      position: absolute !important;
      top: 22px !important;
      width: 72px !important;
      height: 72px !important;
      border-radius: 50% !important;
      border: 2px solid var(--ds-color-accent, #67e8f9) !important;
      pointer-events: none !important;
      animation: dsRemPulseRing 1.6s cubic-bezier(0.215, 0.61, 0.355, 1) infinite !important;
      z-index: 1 !important;
    }
    @keyframes dsRemPulseRing {
      0% {
        transform: scale(0.95);
        opacity: 0.85;
      }
      70% {
        transform: scale(1.55);
        opacity: 0;
      }
      100% {
        transform: scale(1.6);
        opacity: 0;
      }
    }
    .ds-reminder-fs-icon-wrap {
      width: 72px !important;
      height: 72px !important;
      border-radius: 50% !important;
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 18%, var(--ds-color-card, #12151c)) !important;
      border: 2px solid var(--ds-color-accent, #67e8f9) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      margin-bottom: 14px !important;
      position: relative !important;
      box-shadow: 0 0 28px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 35%, transparent) !important;
      z-index: 2 !important;
    }
    .ds-reminder-fs-bell-box {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      transform-origin: 50% 12% !important;
      animation: dsRemBellRing 1.1s infinite ease-in-out !important;
      will-change: transform;
    }
    .ds-reminder-fs-bell {
      display: block !important;
      width: 38px !important;
      height: 38px !important;
      transform-origin: 50% 12% !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      stroke: currentColor !important;
      filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 50%, transparent)) !important;
    }
    @keyframes dsRemBellRing {
      0%, 100% { transform: rotate(0deg) scale(1); }
      15% { transform: rotate(24deg) scale(1.1); }
      30% { transform: rotate(-22deg) scale(1.1); }
      45% { transform: rotate(16deg) scale(1.05); }
      60% { transform: rotate(-12deg) scale(1.02); }
      75% { transform: rotate(6deg); }
      90% { transform: rotate(-2deg); }
    }
    .ds-reminder-fs-badge {
      font-size: 11px !important;
      font-weight: 800 !important;
      letter-spacing: 1.5px !important;
      text-transform: uppercase !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: color-mix(in srgb, var(--ds-color-accent, #67e8f9) 14%, transparent) !important;
      padding: 4px 12px !important;
      border-radius: 20px !important;
      margin-bottom: 12px !important;
      border: 1px solid color-mix(in srgb, var(--ds-color-accent, #67e8f9) 35%, transparent) !important;
    }
    .ds-reminder-fs-titles-wrap {
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      margin-bottom: 24px !important;
      max-height: 45vh !important;
      overflow-y: auto !important;
    }
    .ds-reminder-fs-main-title {
      font-size: 24px !important;
      font-weight: 800 !important;
      color: var(--ds-color-text, #ffffff) !important;
      margin: 0 !important;
      line-height: 1.25 !important;
      word-break: break-word !important;
      white-space: pre-wrap !important;
      text-transform: uppercase !important;
    }
    .ds-reminder-fs-time-badge {
      font-size: 12px !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      font-family: monospace, var(--ds-font, sans-serif) !important;
      margin-top: 4px !important;
      display: inline-block !important;
    }
    .ds-reminder-fs-actions {
      display: flex !important;
      gap: 12px !important;
      width: 100% !important;
      justify-content: center !important;
      flex-wrap: wrap !important;
    }
    .ds-reminder-fs-btn-ack {
      height: 38px !important;
      padding: 0 24px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      background: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-on-accent, #0a0c10) !important;
      border: 1px solid var(--ds-color-accent, #67e8f9) !important;
      cursor: pointer !important;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--ds-color-accent, #67e8f9) 40%, transparent) !important;
      transition: transform 0.1s ease !important;
    }
    .ds-reminder-fs-btn-ack:hover {
      transform: scale(1.03) !important;
    }
    .ds-reminder-fs-btn-snooze {
      height: 38px !important;
      padding: 0 18px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      border-radius: var(--ds-radius-control, 6px) !important;
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      box-sizing: border-box !important;
    }
    .ds-reminder-fs-btn-snooze:hover {
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-reminder-fs-hint {
      margin-top: 14px !important;
      font-size: 11px !important;
      color: var(--ds-color-muted-text, #94a3b8) !important;
      opacity: 0.7 !important;
    }

    /* Universal fallback: all buttons in reminder containers follow button theme variables */
    .ds-reminder-popover button:not(.ds-rem-btn-primary):not(.ds-ui-btn-primary):not([class*="-primary"]):not(.ds-rem-btn-turn-off):not(.ds-rem-btn-turn-off-all):not(.ds-rem-toggle-btn):not(.is-active):not([aria-pressed="true"]),
    .ds-rem-modal-backdrop button:not(.ds-rem-btn-primary):not(.ds-ui-btn-primary):not([class*="-primary"]):not(.ds-rem-toggle-btn):not(.is-active):not([aria-pressed="true"]),
    .ds-reminder-fs-overlay button:not(.ds-reminder-fs-btn-ack):not(.ds-rem-btn-primary):not(.ds-ui-btn-primary):not([class*="-primary"]):not(.is-active):not([aria-pressed="true"]) {
      background: var(--ds-btn-bg, var(--ds-color-panel-2, #181d26)) !important;
      border: 1px solid var(--ds-btn-border, var(--ds-color-border, #242a36)) !important;
      color: var(--ds-btn-text, var(--ds-color-text, #f8fafc)) !important;
    }
    .ds-reminder-popover button:not(.ds-rem-btn-primary):not(.ds-ui-btn-primary):not([class*="-primary"]):not(.ds-rem-btn-turn-off):not(.ds-rem-btn-turn-off-all):not(.ds-rem-toggle-btn):not(.is-active):not([aria-pressed="true"]):hover,
    .ds-rem-modal-backdrop button:not(.ds-rem-btn-primary):not(.ds-ui-btn-primary):not([class*="-primary"]):not(.ds-rem-toggle-btn):not(.is-active):not([aria-pressed="true"]):hover,
    .ds-reminder-fs-overlay button:not(.ds-reminder-fs-btn-ack):not(.ds-rem-btn-primary):not(.ds-ui-btn-primary):not([class*="-primary"]):not(.is-active):not([aria-pressed="true"]):hover {
      background: var(--ds-btn-hover, #202633) !important;
      border-color: var(--ds-color-accent, #67e8f9) !important;
      color: var(--ds-color-accent, #67e8f9) !important;
    }
  `;
}

// ---------------------------------------------------------------------------
// 10. CONTEXT MENU & CANVAS INTEGRATION FALLBACK
// ---------------------------------------------------------------------------
function installLegacyReminderCanvasMenuFallback() {
  const LG = window.LiteGraph || globalThis.LiteGraph || app?.canvas?.constructor;
  const canvasProto = app?.canvas?.constructor?.prototype || LG?.LGraphCanvas?.prototype;
  if (!canvasProto || canvasProto.__dsaReminderLegacyMenuInstalled) return Boolean(canvasProto?.__dsaReminderLegacyMenuInstalled);

  const originalCanvasMenu = canvasProto.getCanvasMenuOptions;
  if (typeof originalCanvasMenu === "function") {
    canvasProto.getCanvasMenuOptions = function(...args) {
      const options = originalCanvasMenu.apply(this, args);
      if (!Array.isArray(options)) return options;
      const alreadyPresent = options.some(item =>
        item && typeof item === "object" &&
        String(item.content || "").includes("DS Reminder")
      );
      if (!alreadyPresent) {
        options.push(
          null,
          {
            content: "🔔 DS Reminder",
            callback: () => toolbarManager.togglePopover(toolbarManager.btn),
          },
          {
            content: "🔔 + Add Reminder",
            callback: () => toolbarManager.openEditorModal(null),
          }
        );
      }
      return options;
    };
  }

  canvasProto.__dsaReminderLegacyMenuInstalled = true;
  return true;
}

function scheduleLegacyReminderCanvasMenuFallback() {
  if (installLegacyReminderCanvasMenuFallback()) return;
  for (const delay of [0, 100, 400, 1000, 2500]) {
    setTimeout(() => {
      installLegacyReminderCanvasMenuFallback();
    }, delay);
  }
}

// ComfyUI App Extension Registration
app.registerExtension({
  name: "DeathshotArsenal.DSReminderGlobal",

  commands: [
    {
      id: "DeathshotArsenal.DSReminder.Toggle",
      label: "DS Reminder: Toggle Manager",
      icon: "ds-reminder-bell-svg",
      function: () => toolbarManager.togglePopover(toolbarManager.btn),
    },
    {
      id: "DeathshotArsenal.DSReminder.Add",
      label: "DS Reminder: Add Reminder",
      function: () => toolbarManager.openEditorModal(null),
    },
  ],

  menuCommands: [
    {
      path: ["DeathshotArsenal"],
      commands: [
        "DeathshotArsenal.DSReminder.Toggle",
        "DeathshotArsenal.DSReminder.Add",
      ],
    },
  ],

  getCanvasMenuItems(canvas) {
    return [
      null,
      {
        content: "🔔 DS Reminder",
        callback: () => toolbarManager.togglePopover(toolbarManager.btn),
      },
      {
        content: "🔔 + Add Reminder",
        callback: () => toolbarManager.openEditorModal(null),
      },
    ];
  },

  getNodeMenuItems(node) {
    return [
      null,
      {
        content: "🔔 DS Reminder",
        callback: () => toolbarManager.togglePopover(toolbarManager.btn),
      },
      {
        content: "🔔 + Add Reminder",
        callback: () => toolbarManager.openEditorModal(null),
      },
    ];
  },

  async setup() {
    console.log("[DS Reminder] Global reminder engine initialized");
    injectReminderStyles();
    toolbarManager.mountToolbarButton();
    scheduleLegacyReminderCanvasMenuFallback();
    fullscreenOverlay.hide();
  },
});

// Immediate execution for dynamic extension imports
try {
  injectReminderStyles();
  toolbarManager.mountToolbarButton();
  scheduleLegacyReminderCanvasMenuFallback();
  fullscreenOverlay.hide();
} catch (err) {
  console.warn("[DS Reminder] Immediate bootstrap warning:", err);
}

