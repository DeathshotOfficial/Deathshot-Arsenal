// Deathshot Arsenal — DS Reminder Global Engine & Toolbar Manager
// Single Source of Truth for persistent reminders across all nodes and workflows.

import { app } from "/scripts/app.js";

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
          this.reminders = parsed;
        }
      }
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        if (parsedSettings && typeof parsedSettings === "object") {
          this.settings = { ...this.settings, ...parsedSettings };
        }
      }
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
            this.reminders = json.data.reminders;
          }
          if (json.data.settings && typeof json.data.settings === "object") {
            this.settings = { ...this.settings, ...json.data.settings };
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
    rem.state = nextEnabled ? "scheduled" : "disabled";
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
      const shouldShowFullscreen = this.store.settings.globalFullscreen && activeTriggered.some((r) => r.fullscreen !== false);
      if (shouldShowFullscreen) {
        fullscreenOverlay.show(activeTriggered);
      }
    } else {
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
    this._createDOM();
  }

  _createDOM() {
    if (document.getElementById("ds-reminder-fullscreen-overlay")) return;
    injectReminderStyles();
    const overlay = document.createElement("div");
    overlay.id = "ds-reminder-fullscreen-overlay";
    overlay.className = "ds-reminder-fs-overlay";
    overlay.setAttribute("data-ds-themed", "true");
    overlay.style.display = "none";

    overlay.innerHTML = `
      <div class="ds-reminder-fs-backdrop"></div>
      <div class="ds-reminder-fs-card" role="dialog" aria-modal="true">
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
          <button type="button" class="ds-reminder-fs-btn-ack ds-ui-button" id="ds-reminder-fs-ack-btn">
            Acknowledge & Dismiss
          </button>
          <button type="button" class="ds-reminder-fs-btn-snooze ds-ui-button" id="ds-reminder-fs-snooze-btn">
            Snooze 5 Min
          </button>
        </div>
        <small class="ds-reminder-fs-hint">Press Enter or Space to acknowledge</small>
      </div>
    `;

    document.body.appendChild(overlay);
    this.el = overlay;

    overlay.querySelector("#ds-reminder-fs-ack-btn")?.addEventListener("click", () => {
      this.acknowledgeAll();
    });

    overlay.querySelector("#ds-reminder-fs-snooze-btn")?.addEventListener("click", () => {
      this.snoozeAll();
    });

    overlay.querySelector(".ds-reminder-fs-backdrop")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = overlay.querySelector(".ds-reminder-fs-card");
      if (card) {
        card.classList.add("is-shaking");
        setTimeout(() => card.classList.remove("is-shaking"), 400);
      }
    });
  }

  show(reminders) {
    this._createDOM();
    if (!this.el) return;
    this.currentReminders = [...reminders];

    const titlesContainer = this.el.querySelector("#ds-reminder-fs-titles");
    if (titlesContainer) {
      titlesContainer.innerHTML = "";
      for (const r of reminders) {
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

    this.el.style.display = "flex";
    window.addEventListener("keydown", this.boundKeyHandler, true);

    const ackBtn = this.el.querySelector("#ds-reminder-fs-ack-btn");
    if (ackBtn) {
      setTimeout(() => ackBtn.focus(), 50);
    }
  }

  hide() {
    if (!this.el) return;
    this.el.style.display = "none";
    window.removeEventListener("keydown", this.boundKeyHandler, true);
  }

  acknowledgeAll() {
    for (const r of this.currentReminders) {
      reminderStore.acknowledgeReminder(r.id);
    }
    dsAudio.stopAlertLoop();
    this.hide();
  }

  snoozeAll() {
    for (const r of this.currentReminders) {
      reminderStore.snoozeReminder(r.id, 5);
    }
    dsAudio.stopAlertLoop();
    this.hide();
  }

  onKeyDown(e) {
    if (this.el && this.el.style.display !== "none") {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.acknowledgeAll();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.acknowledgeAll();
      }
    }
  }
}

export const fullscreenOverlay = new FullscreenReminderOverlay();

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
        if (this.btn) window.DSGlobalTheme.applyToElement(this.btn);
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
    group.className = "comfyui-button-group ds-reminder-toolbar-group";
    group.setAttribute("data-ds-themed", "true");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ds-reminder-toolbar-btn";
    btn.className = "comfyui-button ds-reminder-tb-btn";
    btn.setAttribute("title", "DS Reminder Manager");
    btn.setAttribute("aria-label", "DS Reminder Manager");
    btn.setAttribute("data-ds-themed", "true");
    btn.innerHTML = `
      <span class="ds-reminder-tb-icon-box">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ds-reminder-bell-svg">
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
    if (window.DSGlobalTheme?.applyToElement) {
      window.DSGlobalTheme.applyToElement(btn);
    }
  }

  mountToolbarButton() {
    if (this.btn?.isConnected && this.group?.isConnected) return;

    this._createToolbarElements();

    // Action bar integration:
    // app.menu.settingsGroup is the gear-icon group on the floating action bar.
    // Inserting before it places our button cleanly alongside native and extension tools.
    const settingsGroupEl = app.menu?.settingsGroup?.element;
    if (!settingsGroupEl) {
      if (this._mountTries == null) this._mountTries = 0;
      if (++this._mountTries < 40) {
        setTimeout(() => this.mountToolbarButton(), 250);
        return;
      }
    } else if (settingsGroupEl.parentElement) {
      settingsGroupEl.before(this.group);
      this.updateBadge();
      return;
    }

    // Fallback search if settingsGroup was not found or has different DOM
    const allButtons = Array.from(document.querySelectorAll("button, .p-button, [role='button']"));
    const managerBtn = allButtons.find((b) => {
      const txt = (b.textContent || "").trim();
      return txt.includes("Manager") || b.id === "cm-manager-button" || b.classList.contains("cm-manager-button");
    });
    const runBtn = allButtons.find((b) => {
      const txt = (b.textContent || "").trim();
      return txt.startsWith("Run") || b.getAttribute("aria-label")?.includes("Queue");
    });

    const targetHost =
      (managerBtn && managerBtn.parentElement) ||
      (runBtn && runBtn.parentElement) ||
      document.querySelector(".comfyui-menu .action-bar") ||
      document.querySelector(".comfyui-action-bar") ||
      document.querySelector('[data-testid="action-bar"]') ||
      document.querySelector(".action-bar") ||
      document.querySelector(".comfy-menu");

    if (targetHost && !this.group.isConnected) {
      if (managerBtn && managerBtn.parentElement === targetHost) {
        targetHost.insertBefore(this.group, managerBtn);
      } else if (runBtn && runBtn.parentElement === targetHost) {
        targetHost.insertBefore(this.group, runBtn);
      } else {
        targetHost.appendChild(this.group);
      }
    }

    this.updateBadge();
  }

  initToolbarObserver() {
    const check = () => {
      if (!this.btn?.isConnected || !this.group?.isConnected) {
        this.mountToolbarButton();
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(check, 500);
    setTimeout(check, 1500);
    setTimeout(check, 3000);
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
    const popover = document.createElement("div");
    popover.id = "ds-reminder-global-popover";
    popover.className = "ds-reminder-popover ds-ui-section";
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

    this.popover.innerHTML = `
      <div class="ds-rem-pop-header">
        <div class="ds-rem-pop-brand">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <strong>DS REMINDER</strong>
        </div>
        <div class="ds-rem-pop-head-actions">
          <button type="button" class="ds-rem-btn-small" id="ds-rem-pop-add-btn">+ Add Reminder</button>
          <button type="button" class="ds-rem-pop-close-btn" id="ds-rem-pop-close-btn" title="Close">✕</button>
        </div>
      </div>

      <div class="ds-rem-pop-global-toggle-row">
        <span>Fullscreen Overlay</span>
        <button type="button" class="ds-rem-switch ${settings.globalFullscreen ? "is-on" : ""}" id="ds-rem-pop-fs-toggle" role="switch" aria-checked="${settings.globalFullscreen}">
          <span class="ds-rem-switch-track"><span class="ds-rem-switch-thumb"></span></span>
        </button>
      </div>

      <div class="ds-rem-pop-list" id="ds-rem-pop-list"></div>
    `;

    this.popover.querySelector("#ds-rem-pop-close-btn")?.addEventListener("click", () => this.closePopover());
    this.popover.querySelector("#ds-rem-pop-add-btn")?.addEventListener("click", () => {
      this.openEditorModal(null);
    });

    const fsToggle = this.popover.querySelector("#ds-rem-pop-fs-toggle");
    fsToggle?.addEventListener("click", () => {
      reminderStore.setGlobalFullscreen(!settings.globalFullscreen);
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
    } else {
      metaHtml = `
        <span class="ds-rem-badge ds-rem-badge-disabled">PAUSED</span>
      `;
    }

    item.innerHTML = `
      <div class="ds-rem-drag-handle" title="Drag to rearrange">⋮⋮</div>
      <button type="button" class="ds-rem-switch ${reminder.enabled ? "is-on" : ""}" role="switch" title="${reminder.enabled ? "Disable" : "Enable"}">
        <span class="ds-rem-switch-track"><span class="ds-rem-switch-thumb"></span></span>
      </button>
      <div class="ds-rem-item-content">
        <span class="ds-rem-item-title" title="${escapeHtml(reminder.title)}">${escapeHtml(reminder.title)}</span>
        <div class="ds-rem-item-meta">
          ${metaHtml}
        </div>
      </div>
      <div class="ds-rem-item-actions">
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

    item.querySelector(".ds-rem-switch")?.addEventListener("click", (e) => {
      e.stopPropagation();
      reminderStore.toggleReminder(reminder.id);
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
      <div class="ds-rem-editor-card ds-ui-section">
        <div class="ds-rem-editor-header">
          <strong>${isEdit ? "Edit Reminder" : "Create Reminder"}</strong>
          <button type="button" class="ds-rem-pop-close-btn" id="ds-rem-modal-cancel-x">✕</button>
        </div>
        <div class="ds-rem-editor-body">
          <label class="ds-rem-form-group">
            <span class="ds-rem-form-label">Description / Task</span>
            <input type="text" class="ds-rem-input" id="ds-rem-input-title" placeholder="e.g. Check the rice, Turn off oven" value="${escapeHtml(titleVal)}" maxlength="140" />
          </label>

          <div class="ds-rem-form-group">
            <span class="ds-rem-form-label">Time Selection Mode</span>
            <div class="ds-rem-segmented-row" id="ds-rem-mode-segmented">
              <button type="button" class="ds-rem-seg-btn ${modeVal === "duration" ? "is-active" : ""}" data-mode="duration">Countdown / Duration</button>
              <button type="button" class="ds-rem-seg-btn ${modeVal === "clock" ? "is-active" : ""}" data-mode="clock">Clock Time</button>
            </div>
          </div>

          <!-- Duration configuration -->
          <div id="ds-rem-duration-panel" class="ds-rem-subpanel" style="display:${modeVal === "duration" ? "flex" : "none"}">
            <span class="ds-rem-form-label">Duration</span>
            <div class="ds-rem-quick-chips">
              <button type="button" class="ds-rem-chip" data-min="1">+1m</button>
              <button type="button" class="ds-rem-chip" data-min="5">+5m</button>
              <button type="button" class="ds-rem-chip" data-min="10">+10m</button>
              <button type="button" class="ds-rem-chip" data-min="15">+15m</button>
              <button type="button" class="ds-rem-chip" data-min="30">+30m</button>
              <button type="button" class="ds-rem-chip" data-min="60">+1h</button>
            </div>
            <div class="ds-rem-stepper-row">
              <button type="button" class="ds-rem-step-btn" id="ds-step-dec" title="Decrease">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <div class="ds-rem-stepper-display">
                <span id="ds-step-num">${durVal}</span>
                <span class="ds-rem-stepper-unit">min</span>
              </div>
              <button type="button" class="ds-rem-step-btn" id="ds-step-inc" title="Increase">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
          </div>

          <!-- Clock time configuration -->
          <div id="ds-rem-clock-panel" class="ds-rem-subpanel" style="display:${modeVal === "clock" ? "flex" : "none"}">
            <span class="ds-rem-form-label">Alarm Time (24h HH:MM)</span>
            <input type="time" class="ds-rem-input ds-rem-time-input" id="ds-rem-input-clock" value="${clockVal}" />
          </div>

          <!-- Sound selection (Custom Deathshot Dropdown) -->
          <div class="ds-rem-form-group">
            <span class="ds-rem-form-label">Alert Sound</span>
            <div class="ds-rem-sound-row">
              <div id="ds-rem-sound-dropdown-mount" style="flex:1;"></div>
              <button type="button" class="ds-rem-btn-test-sound" id="ds-rem-test-sound" title="Test Audio">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
            </div>
          </div>

          <!-- Notification mode toggle (Switch on the FAR RIGHT) -->
          <div class="ds-rem-toggle-row">
            <span class="ds-rem-toggle-label">Show Fullscreen Overlay on Trigger</span>
            <button type="button" class="ds-rem-switch ${fsVal ? "is-on" : ""}" id="ds-rem-input-fs" role="switch" aria-checked="${fsVal}">
              <span class="ds-rem-switch-track"><span class="ds-rem-switch-thumb"></span></span>
            </button>
          </div>
        </div>

        <div class="ds-rem-editor-footer">
          <button type="button" class="ds-rem-btn-secondary" id="ds-rem-modal-cancel">Cancel</button>
          <button type="button" class="ds-rem-btn-primary" id="ds-rem-modal-save">${isEdit ? "Save Changes" : "Create Reminder"}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let activeMode = modeVal;
    const durPanel = modal.querySelector("#ds-rem-duration-panel");
    const clockPanel = modal.querySelector("#ds-rem-clock-panel");
    const modeButtons = modal.querySelectorAll("#ds-rem-mode-segmented button");
    const stepNum = modal.querySelector("#ds-step-num");
    const clockInput = modal.querySelector("#ds-rem-input-clock");
    const titleInput = modal.querySelector("#ds-rem-input-title");
    const fsToggle = modal.querySelector("#ds-rem-input-fs");

    // Stepper buttons
    modal.querySelector("#ds-step-dec")?.addEventListener("click", () => {
      durVal = Math.max(1, durVal - 1);
      stepNum.textContent = String(durVal);
    });
    modal.querySelector("#ds-step-inc")?.addEventListener("click", () => {
      durVal = Math.min(1440, durVal + 1);
      stepNum.textContent = String(durVal);
    });

    // Quick chips
    modal.querySelectorAll(".ds-rem-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        durVal = parseInt(chip.dataset.min, 10) || 5;
        stepNum.textContent = String(durVal);
      });
    });

    // Mode segmented
    modeButtons.forEach((b) => {
      b.addEventListener("click", () => {
        modeButtons.forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        activeMode = b.dataset.mode;
        durPanel.style.display = activeMode === "duration" ? "flex" : "none";
        clockPanel.style.display = activeMode === "clock" ? "flex" : "none";
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

    // Fullscreen Toggle
    fsToggle?.addEventListener("click", () => {
      fsVal = !fsVal;
      fsToggle.classList.toggle("is-on", fsVal);
      fsToggle.setAttribute("aria-checked", String(fsVal));
    });

    // Audio Test
    modal.querySelector("#ds-rem-test-sound")?.addEventListener("click", () => {
      dsAudio.playSound(soundVal, 0.7);
    });

    const closeModal = () => {
      dropdown.destroy();
      modal.remove();
    };
    modal.querySelector("#ds-rem-modal-cancel")?.addEventListener("click", closeModal);
    modal.querySelector("#ds-rem-modal-cancel-x")?.addEventListener("click", closeModal);

    modal.querySelector("#ds-rem-modal-save")?.addEventListener("click", () => {
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
    });
  }
}

export const toolbarManager = new DSReminderToolbarManager();

// ---------------------------------------------------------------------------
// 7. GEAR MENU / SELECTION TOOLBOX INTEGRATION
// ---------------------------------------------------------------------------
function registerReminderGearIntegration() {
  if (window.DSGearMenu?.register) {
    const config = {
      tooltip: "DS Reminder Manager",
      onClick: (node, canvas, event) => {
        toolbarManager.togglePopover(event?.currentTarget || event?.target || toolbarManager.btn);
      },
      getMenuItems: () => {
        const reminders = reminderStore.getReminders();
        const items = [
          { label: "DS Reminder Manager", description: `${reminders.length} saved reminders`, disabled: true },
          { separator: true },
          {
            label: "+ Add New Reminder",
            callback: () => toolbarManager.openEditorModal(null),
          },
          {
            label: "Open Global Manager",
            callback: () => toolbarManager.openPopover(toolbarManager.btn),
          },
        ];
        return items;
      },
    };
    window.DSGearMenu.register("DS_Reminder", config);
    window.DSGearMenu.register("DS Reminder", config);
  }
}

setTimeout(registerReminderGearIntegration, 150);
setTimeout(registerReminderGearIntegration, 800);

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
  if (document.getElementById("ds-reminder-global-styles")) return;
  const style = document.createElement("style");
  style.id = "ds-reminder-global-styles";
  style.textContent = `
    /* Action dock button & Top Action Bar integration */
    .ds-reminder-toolbar-group {
      display: inline-flex !important;
      align-items: center !important;
      overflow: visible !important;
      margin: 0 4px 0 2px !important;
      padding-right: 3px !important;
    }
    .ds-reminder-tb-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      overflow: visible !important;
      height: 28px !important;
      padding: 0 7px !important;
      margin: 0 !important;
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.16)) !important;
      border-radius: 5px !important;
      background: var(--ds-panel-2, #181d26) !important;
      color: #e2e8f0 !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      outline: none !important;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
      vertical-align: middle !important;
      font-family: var(--ds-font, Inter, system-ui, sans-serif) !important;
    }
    .ds-reminder-tb-btn:hover {
      border-color: var(--ds-accent) !important;
      color: var(--ds-accent) !important;
      background: var(--ds-btn-hover, #202633) !important;
    }
    .ds-reminder-tb-icon-box {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      transform-origin: 50% 12% !important;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      will-change: transform;
    }
    .ds-reminder-bell-svg {
      stroke: currentColor !important;
      display: block !important;
      width: 16px !important;
      height: 16px !important;
      transform-origin: 50% 12% !important;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s ease !important;
      will-change: transform;
    }
    .ds-reminder-tb-btn:hover .ds-reminder-tb-icon-box {
      animation: dsBellRingHover 0.75s ease-in-out infinite alternate !important;
      color: var(--ds-accent) !important;
    }
    .ds-reminder-tb-btn:hover .ds-reminder-bell-svg {
      color: var(--ds-accent) !important;
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
      background: var(--ds-accent) !important;
      color: var(--ds-on-accent, #ffffff) !important;
      font-size: 9px !important;
      font-weight: 800 !important;
      line-height: 15px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1.5px solid var(--ds-panel, #12161e) !important;
      box-sizing: border-box !important;
      z-index: 100 !important;
      pointer-events: none !important;
      box-shadow: 0 0 6px color-mix(in srgb, var(--ds-accent) 50%, transparent) !important;
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
      animation: dsRemBorderPulse 1s infinite alternate;
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

    /* Custom Standalone Switch (Strict 32x18 Fixed Geometry) */
    .ds-rem-switch {
      flex: 0 0 32px !important;
      width: 32px !important;
      height: 18px !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      background: transparent !important;
      cursor: pointer;
      outline: none;
      display: inline-block;
      box-sizing: border-box;
    }
    .ds-rem-switch-track {
      display: block;
      width: 32px;
      height: 18px;
      border-radius: 999px;
      background: var(--ds-panel, #11141c);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
      position: relative;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      box-sizing: border-box;
    }
    .ds-rem-switch.is-on .ds-rem-switch-track {
      background: color-mix(in srgb, var(--ds-accent, #67e8f9) 25%, var(--ds-panel, #11141c));
      border-color: var(--ds-accent, #67e8f9);
      box-shadow: 0 0 6px color-mix(in srgb, var(--ds-accent, #67e8f9) 30%, transparent);
    }
    .ds-rem-switch-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--ds-text-muted, #94a3b8);
      transition: left 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    }
    .ds-rem-switch.is-on .ds-rem-switch-thumb {
      left: 16px;
      background: var(--ds-accent, #67e8f9);
      box-shadow: 0 0 6px var(--ds-accent, #67e8f9);
    }

    /* Popover */
    .ds-reminder-popover {
      position: fixed;
      z-index: 100000;
      width: 330px;
      max-width: 90vw;
      max-height: 82vh;
      background: var(--ds-panel-2, #181d26);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.14));
      border-radius: 6px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65);
      display: flex;
      flex-direction: column;
      font-family: var(--ds-font, Inter, system-ui, sans-serif);
      color: var(--ds-text, #f8fafc);
      padding: 0;
      overflow: hidden;
      animation: dsRemPopIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes dsRemPopIn {
      from { opacity: 0; transform: translateY(-4px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .ds-rem-pop-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-bottom: 1px solid var(--ds-border, rgba(255, 255, 255, 0.1));
      background: rgba(0,0,0,0.18);
    }
    .ds-rem-pop-brand {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      font-weight: 700;
      color: var(--ds-accent, #67e8f9);
      letter-spacing: 0.5px;
    }
    .ds-rem-pop-head-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ds-rem-btn-small {
      height: 24px;
      padding: 0 8px;
      font-size: 10.5px;
      font-weight: 600;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      border-radius: 4px;
      color: var(--ds-text, #f8fafc);
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .ds-rem-btn-small:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-accent, #67e8f9);
      background: var(--ds-btn-hover, #202633);
    }
    .ds-rem-pop-close-btn {
      width: 20px;
      height: 20px;
      border: none;
      background: transparent;
      color: var(--ds-text-muted, #94a3b8);
      cursor: pointer;
      font-size: 11px;
      display: grid;
      place-items: center;
      border-radius: 3px;
    }
    .ds-rem-pop-close-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
    }
    .ds-rem-pop-global-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      font-size: 11px;
      border-bottom: 1px solid var(--ds-border, rgba(255, 255, 255, 0.08));
      background: rgba(0,0,0,0.06);
      color: var(--ds-text, #f8fafc);
    }
    .ds-rem-pop-global-toggle-row .ds-rem-switch {
      margin-left: auto;
    }
    .ds-rem-pop-list {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      max-height: calc(82vh - 85px);
      padding: 6px;
      gap: 5px;
    }
    .ds-rem-empty-state {
      padding: 24px 12px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--ds-text-muted, #94a3b8);
      font-size: 11.5px;
    }

    /* List item (Single row, completely non-overlapping) */
    .ds-rem-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.1));
      background: var(--ds-panel, #12161e);
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      transition: background 0.12s ease, border-color 0.12s ease;
      user-select: none;
    }
    .ds-rem-item:hover {
      border-color: rgba(255, 255, 255, 0.25);
    }
    .ds-rem-item.is-triggered {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.12);
    }
    .ds-rem-item.is-disabled {
      opacity: 0.55;
    }
    .ds-rem-item.is-dragging {
      opacity: 0.25;
    }
    .ds-rem-item.drag-over-top {
      border-top: 2px solid var(--ds-accent, #67e8f9);
    }
    .ds-rem-item.drag-over-bottom {
      border-bottom: 2px solid var(--ds-accent, #67e8f9);
    }
    .ds-rem-drag-handle {
      cursor: grab;
      color: var(--ds-text-muted, #64748b);
      font-size: 11px;
      padding: 2px;
      flex: 0 0 auto;
    }
    .ds-rem-drag-handle:active {
      cursor: grabbing;
    }
    .ds-rem-item-content {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      gap: 2px;
      overflow: hidden;
    }
    .ds-rem-item-title {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--ds-text, #f8fafc);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }
    .ds-rem-item-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      line-height: 1;
    }
    .ds-rem-item-time {
      font-size: 9.5px;
      font-family: monospace;
      font-weight: 700;
      color: var(--ds-accent, #67e8f9);
    }
    .ds-rem-badge {
      font-size: 8px;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--ds-text-muted, #94a3b8);
    }
    .ds-rem-badge-triggered {
      background: #ef4444;
      color: #fff;
    }
    .ds-rem-badge-scheduled {
      background: color-mix(in srgb, var(--ds-accent) 15%, transparent);
      color: var(--ds-accent);
      border: 1px solid color-mix(in srgb, var(--ds-accent) 30%, transparent);
    }
    .ds-rem-badge-completed {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }
    .ds-rem-item-actions {
      display: flex;
      align-items: center;
      gap: 3px;
      flex: 0 0 auto;
    }
    .ds-rem-btn-icon {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ds-text-muted, #94a3b8);
      cursor: pointer;
      display: grid;
      place-items: center;
      padding: 0;
      transition: all 0.12s ease;
    }
    .ds-rem-btn-icon:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--ds-text, #f8fafc);
      border-color: var(--ds-border, rgba(255, 255, 255, 0.2));
    }
    .ds-rem-btn-delete:hover {
      border-color: #ef4444;
      color: #ef4444;
    }

    /* Custom Deathshot Dropdown */
    .ds-rem-dropdown {
      position: relative;
      width: 100%;
      user-select: none;
      box-sizing: border-box;
    }
    .ds-rem-dropdown-trigger {
      height: 28px;
      padding: 0 24px 0 10px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      border-radius: 5px;
      color: var(--ds-text, #f8fafc);
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      position: relative;
      transition: border-color 0.15s ease, background 0.15s ease;
      box-sizing: border-box;
    }
    .ds-rem-dropdown-trigger:hover,
    .ds-rem-dropdown.open .ds-rem-dropdown-trigger {
      border-color: var(--ds-accent, #67e8f9);
      background: var(--ds-btn-hover, #1a202c);
    }
    .ds-rem-dropdown-val {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ds-rem-dropdown-arrow {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--ds-text-muted, #94a3b8);
      transition: transform 0.15s ease;
      display: grid;
      place-items: center;
    }
    .ds-rem-dropdown.open .ds-rem-dropdown-arrow {
      transform: translateY(-50%) rotate(180deg);
      color: var(--ds-accent, #67e8f9);
    }
    .ds-rem-dropdown-menu {
      display: none;
      position: absolute;
      top: calc(100% + 3px);
      left: 0;
      width: 100%;
      max-height: 200px;
      overflow-y: auto;
      background: var(--ds-panel-2, #181d26);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.18));
      border-radius: 5px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
      z-index: 100020;
      padding: 4px;
      box-sizing: border-box;
    }
    .ds-rem-dropdown.open .ds-rem-dropdown-menu {
      display: block;
    }
    .ds-rem-dropdown-item {
      padding: 6px 8px;
      border-radius: 3px;
      font-size: 11px;
      color: var(--ds-text, #f8fafc);
      cursor: pointer;
      transition: background 0.1s ease, color 0.1s ease;
    }
    .ds-rem-dropdown-item:hover {
      background: var(--ds-btn-hover, #202633);
      color: var(--ds-accent, #67e8f9);
    }
    .ds-rem-dropdown-item.active {
      background: var(--ds-panel, #12161e);
      color: var(--ds-accent, #67e8f9);
      font-weight: 600;
    }

    /* Modal dialog */
    .ds-rem-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100050;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(5px);
      display: grid;
      place-items: center;
      padding: 16px;
      box-sizing: border-box;
    }
    .ds-rem-editor-card {
      width: 360px;
      max-width: 95vw;
      background: var(--ds-panel-2, #181d26);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.18));
      border-radius: 7px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      color: var(--ds-text, #f8fafc);
      font-family: var(--ds-font, Inter, system-ui, sans-serif);
      box-sizing: border-box;
      animation: dsRemPopIn 0.15s ease-out;
    }
    .ds-rem-editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--ds-border, rgba(255, 255, 255, 0.1));
      padding-bottom: 8px;
      font-size: 13px;
    }
    .ds-rem-editor-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ds-rem-form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ds-rem-form-label {
      font-size: 10.5px;
      font-weight: 600;
      color: var(--ds-text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .ds-rem-input {
      height: 28px;
      padding: 0 8px;
      border-radius: 5px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      color: var(--ds-text, #f8fafc);
      font-size: 11.5px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      width: 100%;
      transition: border-color 0.15s ease;
    }
    .ds-rem-input:focus {
      border-color: var(--ds-accent, #67e8f9);
    }
    .ds-rem-segmented-row {
      display: flex;
      gap: 5px;
    }
    .ds-rem-seg-btn {
      flex: 1;
      height: 26px;
      font-size: 10.5px;
      font-weight: 600;
      border-radius: 5px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      color: var(--ds-text-muted, #94a3b8);
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .ds-rem-seg-btn:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-text, #f8fafc);
    }
    .ds-rem-seg-btn.is-active {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-accent, #67e8f9);
      background: var(--ds-panel-2, #181d26);
      position: relative;
    }
    .ds-rem-seg-btn.is-active::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 6px;
      right: 6px;
      height: 2px;
      background: var(--ds-accent, #67e8f9);
      border-radius: 1px;
    }
    .ds-rem-subpanel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      background: rgba(0,0,0,0.18);
      border-radius: 5px;
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.08));
    }
    .ds-rem-quick-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .ds-rem-chip {
      height: 22px;
      padding: 0 7px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 4px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.14));
      color: var(--ds-text-muted, #cbd5e1);
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .ds-rem-chip:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-accent, #67e8f9);
      background: var(--ds-btn-hover, #1f2530);
    }
    .ds-rem-stepper-row {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    }
    .ds-rem-step-btn {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      color: var(--ds-text, #f8fafc);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: all 0.12s ease;
    }
    .ds-rem-step-btn:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-accent, #67e8f9);
    }
    .ds-rem-stepper-display {
      flex: 1;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      border-radius: 5px;
      font-size: 12px;
      font-weight: 700;
      color: var(--ds-accent, #67e8f9);
      font-family: monospace;
    }
    .ds-rem-stepper-unit {
      font-size: 10px;
      color: var(--ds-text-muted, #94a3b8);
      font-weight: 500;
    }
    .ds-rem-sound-row {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    }
    .ds-rem-btn-test-sound {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      color: var(--ds-accent, #67e8f9);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: all 0.12s ease;
      flex: 0 0 28px;
    }
    .ds-rem-btn-test-sound:hover {
      background: var(--ds-accent, #67e8f9);
      color: var(--ds-on-accent, #0a0c10);
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
      color: var(--ds-text, #f8fafc) !important;
      font-weight: 500 !important;
      flex: 1 1 auto !important;
    }
    .ds-rem-toggle-row .ds-rem-switch {
      margin-left: auto !important;
    }
    .ds-rem-editor-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      border-top: 1px solid var(--ds-border, rgba(255, 255, 255, 0.1));
      padding-top: 10px;
    }
    .ds-rem-btn-secondary {
      height: 28px;
      padding: 0 12px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 5px;
      background: var(--ds-panel, #12161e);
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.15));
      color: var(--ds-text, #f8fafc);
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .ds-rem-btn-secondary:hover {
      border-color: var(--ds-accent, #67e8f9);
      color: var(--ds-accent, #67e8f9);
    }
    .ds-rem-btn-primary {
      height: 28px;
      padding: 0 14px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 5px;
      background: var(--ds-panel-2, #181d26);
      border: 1px solid var(--ds-accent, #67e8f9);
      color: var(--ds-accent, #67e8f9);
      cursor: pointer;
      transition: all 0.12s ease;
      position: relative;
    }
    .ds-rem-btn-primary:hover {
      background: var(--ds-accent, #67e8f9);
      color: var(--ds-on-accent, #0a0c10);
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
      background: var(--ds-border, rgba(255, 255, 255, 0.18));
      border-radius: 4px;
    }
    .ds-reminder-popover *::-webkit-scrollbar-thumb:hover,
    .ds-rem-modal-backdrop *::-webkit-scrollbar-thumb:hover {
      background: var(--ds-accent, #67e8f9);
    }

    /* Fullscreen Overlay */
    .ds-reminder-fs-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--ds-font, Inter, system-ui, sans-serif);
      animation: dsRemFadeIn 0.2s ease-out;
    }
    @keyframes dsRemFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .ds-reminder-fs-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(7, 9, 13, 0.85);
      backdrop-filter: blur(16px);
      z-index: 1;
    }
    .ds-reminder-fs-card {
      position: relative;
      z-index: 2;
      max-width: 540px;
      width: 90%;
      background: var(--ds-panel-2, #181d26);
      border: 2px solid var(--ds-accent);
      border-radius: 12px;
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 32px color-mix(in srgb, var(--ds-accent) 30%, transparent);
      animation: dsRemPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ds-reminder-fs-card.is-shaking {
      animation: dsRemShake 0.4s ease;
    }
    @keyframes dsRemShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .ds-reminder-fs-pulse-ring {
      position: absolute;
      top: 22px;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2px solid var(--ds-accent);
      pointer-events: none;
      animation: dsRemPulseRing 1.6s cubic-bezier(0.215, 0.61, 0.355, 1) infinite !important;
      z-index: 1;
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
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--ds-accent) 18%, var(--ds-panel-2, #181d26));
      border: 2px solid var(--ds-accent);
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: var(--ds-accent);
      margin-bottom: 14px;
      position: relative;
      box-shadow: 0 0 28px color-mix(in srgb, var(--ds-accent) 35%, transparent);
      z-index: 2;
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
      color: var(--ds-accent) !important;
      stroke: currentColor !important;
      filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--ds-accent) 50%, transparent));
    }
    @keyframes dsRemBellRing {
      0%, 100% {
        transform: rotate(0deg) scale(1);
      }
      15% {
        transform: rotate(24deg) scale(1.1);
      }
      30% {
        transform: rotate(-22deg) scale(1.1);
      }
      45% {
        transform: rotate(16deg) scale(1.05);
      }
      60% {
        transform: rotate(-12deg) scale(1.02);
      }
      75% {
        transform: rotate(6deg);
      }
      90% {
        transform: rotate(-2deg);
      }
    }
    .ds-reminder-fs-badge {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--ds-accent);
      background: color-mix(in srgb, var(--ds-accent) 14%, transparent);
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 12px;
      border: 1px solid color-mix(in srgb, var(--ds-accent) 35%, transparent);
    }
    .ds-reminder-fs-titles-wrap {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
      max-height: 45vh;
      overflow-y: auto;
    }
    .ds-reminder-fs-main-title {
      font-size: 24px;
      font-weight: 800;
      color: var(--ds-text, #ffffff);
      margin: 0;
      line-height: 1.25;
      word-break: break-word;
      white-space: pre-wrap;
      text-transform: uppercase;
    }
    .ds-reminder-fs-time-badge {
      font-size: 12px;
      color: var(--ds-text-muted, #94a3b8);
      font-family: monospace;
      margin-top: 4px;
      display: inline-block;
    }
    .ds-reminder-fs-actions {
      display: flex;
      gap: 12px;
      width: 100%;
      justify-content: center;
      flex-wrap: wrap;
    }
    .ds-reminder-fs-btn-ack {
      height: 38px !important;
      padding: 0 24px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      border-radius: 6px !important;
      background: var(--ds-accent) !important;
      color: var(--ds-on-accent, #ffffff) !important;
      border: 1px solid var(--ds-accent) !important;
      cursor: pointer;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--ds-accent) 40%, transparent);
      transition: transform 0.1s ease;
    }
    .ds-reminder-fs-btn-ack:hover {
      transform: scale(1.03);
    }
    .ds-reminder-fs-btn-snooze {
      height: 38px !important;
      padding: 0 18px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      border-radius: 6px !important;
      background: var(--ds-panel, #12161e) !important;
      border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2)) !important;
      color: var(--ds-text, #f8fafc) !important;
      cursor: pointer;
    }
    .ds-reminder-fs-btn-snooze:hover {
      border-color: var(--ds-accent) !important;
      color: var(--ds-accent) !important;
    }
    .ds-reminder-fs-hint {
      margin-top: 14px;
      font-size: 11px;
      color: var(--ds-text-muted, #94a3b8);
      opacity: 0.7;
    }
  `;
  document.head.appendChild(style);
}

// Ensure styles are available immediately
injectReminderStyles();

// ComfyUI App Extension Registration
app.registerExtension({
  name: "DeathshotArsenal.DSReminderGlobal",
  async setup() {
    console.log("[DS Reminder] Global reminder engine initialized");
    injectReminderStyles();
    toolbarManager.mountToolbarButton();
  },
});
