// Deathshot Arsenal — DS Reminder Node Frontend
import { app } from "/scripts/app.js";

const TYPE = "DS_Reminder";
const EXT_NAME = "DeathshotArsenal.DS_Reminder";
const CSS_PATH = "/extensions/DeathshotArsenal/Reminder/ds_reminder.css";

// Inject CSS
(function injectCSS() {
  const existing = document.querySelector('link[href*="ds_reminder.css"]');
  if (existing) {
    existing.href = `${CSS_PATH}?v=${Date.now()}`;
  } else {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CSS_PATH}?v=${Date.now()}`;
    document.head.appendChild(link);
  }
})();

const DEFAULT_PRESETS = [
  { label: "Rice", minutes: 15, title: "Check the rice", sound: "desk_bell" },
  { label: "Oven", minutes: 30, title: "Turn off oven", sound: "chime" },
  { label: "Gen", minutes: 5, title: "Check generation", sound: "digital_alarm" },
  { label: "GPU", minutes: 10, title: "Check GPU temp", sound: "radar_blip" },
  { label: "Break", minutes: 45, title: "Take a break", sound: "zen_bowl" },
  { label: "Water", minutes: 20, title: "Drink water", sound: "tubular_bell" },
];

const SOUND_OPTIONS = [
  { value: "desk_bell", label: "Reception Bell (Crisp)" },
  { value: "chime", label: "Classic Chime" },
  { value: "digital_alarm", label: "Digital Alarm (Urgent)" },
  { value: "radar_blip", label: "Radar Ping" },
  { value: "tubular_bell", label: "Tubular Bell" },
  { value: "zen_bowl", label: "Tibetan Bowl" },
  { value: "victory_fanfare", label: "Victory Fanfare" },
];

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtClock(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtCountdown(reminder) {
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

function createDropdownWidget(options = {}) {
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

app.registerExtension({
  name: EXT_NAME,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE && nodeData.name !== "DS Reminder") return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const res = origOnNodeCreated?.apply(this, arguments);

      this.size = this.size || [330, 340];
      if (this.size[0] < 280) this.size[0] = 330;
      if (this.size[1] < 200) this.size[1] = 340;

      const root = document.createElement("div");
      root.className = "ds-reminder-node-root";
      root.setAttribute("data-ds-themed", "true");
      this._dsRoot = root;
      this._dsActiveDrawer = null;

      // Immediate theme application
      if (window.DSGlobalTheme?.applyToElement) {
        window.DSGlobalTheme.applyToElement(root);
      }

      // Add DOM Widget to Node
      this._dsWidget = this.addDOMWidget("ds_reminder_widget", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 180,
        getHeight: () => Math.max(160, (Number(this.size?.[1]) || 340) - 28),
      });

      this._dsSyncHostHeight = () => {
        const nodeH = Math.max(200, Number(this.size?.[1]) || 340);
        const widgetH = Math.max(160, nodeH - 28);
        if (this._dsWidget) {
          this._dsWidget.computedHeight = widgetH;
        }
        root.style.height = `${widgetH}px`;
        root.style.maxHeight = `${widgetH}px`;
      };
      this._dsSyncHostHeight();

      // Render Node Content
      this._dsRender();

      // Subscribe to Central Store
      this._dsUnsub = window.DSReminderStore?.subscribe?.(() => {
        this._dsRenderList();
        this._dsUpdateHeader();
      });

      // Bind Theme
      setTimeout(() => {
        try {
          if (window.DSGlobalTheme) {
            this._dsThemeUnsub = window.DSGlobalTheme.bindNode?.(root, this);
            window.DSGlobalTheme.applyNodeBase?.(this);
          }
        } catch (_) {}
        this.setDirtyCanvas(true, true);
      }, 0);

      return res;
    };

    const origOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function () {
      origOnResize?.apply(this, arguments);
      this._dsSyncHostHeight?.();
    };

    const origOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._dsThemeUnsub?.();
      this._dsUnsub?.();
      origOnRemoved?.apply(this, arguments);
    };

    // Full Render of Node Body
    nodeType.prototype._dsRender = function () {
      const root = this._dsRoot;
      if (!root) return;
      root.innerHTML = `
        <div class="ds-reminder-node-head">
          <div class="ds-reminder-status-pill">
            <span class="ds-reminder-status-dot" id="ds-node-status-dot"></span>
            <span id="ds-node-count-label">0 ACTIVE</span>
          </div>
          <button type="button" class="ds-reminder-btn-add" id="ds-node-btn-add">
            <span>+ Add Reminder</span>
          </button>
        </div>

        <div class="ds-reminder-presets-strip">
          <span class="ds-reminder-preset-label">Presets:</span>
          <div id="ds-node-presets-container" style="display:inline-flex;gap:5px;"></div>
        </div>

        <div class="ds-reminder-node-list" id="ds-node-list"></div>
      `;

      // Mount Presets
      const presetsWrap = root.querySelector("#ds-node-presets-container");
      if (presetsWrap) {
        DEFAULT_PRESETS.forEach((p) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ds-reminder-preset-chip";
          btn.textContent = `${p.label} (${p.minutes}m)`;
          btn.title = `Create reminder: ${p.title} (${p.minutes} mins)`;
          btn.addEventListener("click", () => {
            if (window.DSReminderStore) {
              window.DSReminderStore.addReminder({
                title: p.title,
                mode: "duration",
                durationMinutes: p.minutes,
                sound: p.sound,
                fullscreen: true,
              });
            }
          });
          presetsWrap.appendChild(btn);
        });
      }

      // Add Button Click
      root.querySelector("#ds-node-btn-add")?.addEventListener("click", () => {
        this._dsOpenDrawer(null);
      });

      this._dsUpdateHeader();
      this._dsRenderList();
    };

    // Header updates (Active count & pulsing status dot)
    nodeType.prototype._dsUpdateHeader = function () {
      const root = this._dsRoot;
      if (!root || !window.DSReminderStore) return;

      const triggered = window.DSReminderStore.getActiveTriggered();
      const scheduled = window.DSReminderStore.getActiveScheduled();
      const dot = root.querySelector("#ds-node-status-dot");
      const label = root.querySelector("#ds-node-count-label");

      if (label) {
        label.textContent = `${scheduled.length} ACTIVE`;
      }
      if (dot) {
        if (triggered.length > 0) {
          dot.className = "ds-reminder-status-dot is-alert";
        } else {
          dot.className = "ds-reminder-status-dot";
        }
      }
    };

    // Render Reminder List (Non-overlapping, visible titles)
    nodeType.prototype._dsRenderList = function () {
      const root = this._dsRoot;
      if (!root || !window.DSReminderStore) return;

      const listEl = root.querySelector("#ds-node-list");
      if (!listEl) return;

      const reminders = window.DSReminderStore.getReminders();
      if (reminders.length === 0) {
        listEl.innerHTML = `
          <div class="ds-reminder-empty">
            <span>No reminders scheduled</span>
            <small>Click a preset above or [+ Add Reminder]</small>
          </div>
        `;
        return;
      }

      listEl.innerHTML = "";
      reminders.forEach((r) => {
        const row = document.createElement("div");
        row.className = `ds-rem-node-row ${r.state === "triggered" ? "is-triggered" : ""} ${!r.enabled ? "is-disabled" : ""}`;

        let subText = "";
        if (r.state === "scheduled") {
          subText = `Target: ${fmtClock(r.targetTimestamp)}`;
        } else if (r.state === "completed") {
          subText = r.targetTimestamp || r.lastTriggered ? `Finished ${fmtClock(r.targetTimestamp || r.lastTriggered)}` : "";
        } else if (r.state === "triggered") {
          subText = "Alarm sounding";
        } else {
          subText = "Paused";
        }

        row.innerHTML = `
          <button type="button" class="ds-rem-switch ${r.enabled ? "is-on" : ""}" role="switch" aria-checked="${r.enabled}" title="${r.enabled ? "Disable" : "Enable"}">
            <span class="ds-rem-switch-track"><span class="ds-rem-switch-thumb"></span></span>
          </button>
          <div class="ds-rem-row-info">
            <div class="ds-rem-row-title" title="${escapeHtml(r.title)}">${escapeHtml(r.title || "Reminder")}</div>
            ${subText ? `<div class="ds-rem-row-sub">${subText}</div>` : ""}
          </div>
          <div class="ds-rem-row-status">
            ${r.state === "scheduled" ? `<span class="ds-rem-row-time">⏳ ${fmtCountdown(r)}</span>` : ""}
            <span class="ds-rem-row-badge badge-${r.state}">${r.state === "scheduled" ? "ACTIVE" : r.state.toUpperCase()}</span>
          </div>
          <div class="ds-rem-row-actions">
            <button type="button" class="ds-rem-row-btn ds-rem-btn-edit" title="Edit">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="ds-rem-row-btn is-delete ds-rem-btn-del" title="Delete">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        // Switch toggle
        row.querySelector(".ds-rem-switch")?.addEventListener("click", (e) => {
          e.stopPropagation();
          window.DSReminderStore?.toggleReminder(r.id);
        });

        // Edit
        row.querySelector(".ds-rem-btn-edit")?.addEventListener("click", (e) => {
          e.stopPropagation();
          this._dsOpenDrawer(r);
        });

        // Delete
        row.querySelector(".ds-rem-btn-del")?.addEventListener("click", (e) => {
          e.stopPropagation();
          window.DSReminderStore?.deleteReminder(r.id);
        });

        listEl.appendChild(row);
      });
    };

    // In-Node Drawer for Create & Edit (Custom Deathshot Dropdown & Stepper)
    nodeType.prototype._dsOpenDrawer = function (existingReminder = null) {
      const root = this._dsRoot;
      if (!root) return;

      if (this._dsActiveDrawer) {
        this._dsActiveDrawer.remove();
        this._dsActiveDrawer = null;
      }

      const isEdit = !!existingReminder;
      const titleVal = existingReminder?.title || "";
      const modeVal = existingReminder?.mode || "duration";
      let durVal = existingReminder?.durationMinutes || 15;
      const clockVal = existingReminder?.clockTime || "18:00";
      let soundVal = existingReminder?.sound || "desk_bell";
      let fsVal = existingReminder ? existingReminder.fullscreen !== false : true;

      const drawer = document.createElement("div");
      drawer.className = "ds-reminder-inline-drawer";

      drawer.innerHTML = `
        <div class="ds-reminder-drawer-head">
          <span>${isEdit ? "Edit Reminder" : "New Reminder"}</span>
          <button type="button" class="ds-rem-row-btn" id="ds-drw-close" title="Close">✕</button>
        </div>
        <div class="ds-reminder-drawer-body">
          <label class="ds-rem-form-group">
            <span class="ds-rem-form-label">Description / Task</span>
            <input type="text" class="ds-rem-input" id="ds-drw-title" placeholder="e.g. Check oven" value="${escapeHtml(titleVal)}" maxlength="140" />
          </label>

          <div class="ds-rem-form-group">
            <span class="ds-rem-form-label">Mode</span>
            <div class="ds-rem-segmented-row" id="ds-drw-mode-row">
              <button type="button" class="ds-rem-seg-btn ${modeVal === "duration" ? "is-active" : ""}" data-mode="duration">Duration</button>
              <button type="button" class="ds-rem-seg-btn ${modeVal === "clock" ? "is-active" : ""}" data-mode="clock">Clock Time</button>
            </div>
          </div>

          <div id="ds-drw-duration-box" class="ds-rem-subpanel" style="display:${modeVal === "duration" ? "flex" : "none"}">
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
              <button type="button" class="ds-rem-step-btn" id="ds-node-step-dec" title="Decrease">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <div class="ds-rem-stepper-display">
                <span id="ds-node-step-num">${durVal}</span>
                <span class="ds-rem-stepper-unit">min</span>
              </div>
              <button type="button" class="ds-rem-step-btn" id="ds-node-step-inc" title="Increase">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
          </div>

          <div id="ds-drw-clock-box" class="ds-rem-subpanel" style="display:${modeVal === "clock" ? "flex" : "none"}">
            <span class="ds-rem-form-label">Alarm Time (24h HH:MM)</span>
            <input type="time" class="ds-rem-input ds-rem-time-input" id="ds-drw-clock-input" value="${clockVal}" />
          </div>

          <div class="ds-rem-form-group">
            <span class="ds-rem-form-label">Alert Sound</span>
            <div class="ds-rem-sound-row">
              <div id="ds-node-sound-mount" style="flex:1;"></div>
              <button type="button" class="ds-rem-btn-test-sound" id="ds-drw-test-sound" title="Test Audio">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
            </div>
          </div>

          <div class="ds-rem-toggle-row">
            <span class="ds-rem-toggle-label">Show Fullscreen Overlay on Trigger</span>
            <button type="button" class="ds-rem-switch ${fsVal ? "is-on" : ""}" id="ds-drw-fs" role="switch" aria-checked="${fsVal}">
              <span class="ds-rem-switch-track"><span class="ds-rem-switch-thumb"></span></span>
            </button>
          </div>
        </div>

        <div class="ds-reminder-drawer-foot">
          <button type="button" class="ds-rem-btn-secondary" id="ds-drw-cancel">Cancel</button>
          <button type="button" class="ds-rem-btn-primary" id="ds-drw-save">${isEdit ? "Save Changes" : "Create Reminder"}</button>
        </div>
      `;

      root.appendChild(drawer);
      this._dsActiveDrawer = drawer;

      let activeMode = modeVal;
      const modeButtons = drawer.querySelectorAll("#ds-drw-mode-row button");
      const durBox = drawer.querySelector("#ds-drw-duration-box");
      const clockBox = drawer.querySelector("#ds-drw-clock-box");
      const stepNum = drawer.querySelector("#ds-node-step-num");
      const clockInput = drawer.querySelector("#ds-drw-clock-input");
      const titleInput = drawer.querySelector("#ds-drw-title");
      const fsToggle = drawer.querySelector("#ds-drw-fs");

      // Stepper
      drawer.querySelector("#ds-node-step-dec")?.addEventListener("click", () => {
        durVal = Math.max(1, durVal - 1);
        stepNum.textContent = String(durVal);
      });
      drawer.querySelector("#ds-node-step-inc")?.addEventListener("click", () => {
        durVal = Math.min(1440, durVal + 1);
        stepNum.textContent = String(durVal);
      });

      // Quick chips
      drawer.querySelectorAll(".ds-rem-chip").forEach((c) => {
        c.addEventListener("click", () => {
          durVal = parseInt(c.dataset.min, 10) || 5;
          stepNum.textContent = String(durVal);
        });
      });

      // Mode switch
      modeButtons.forEach((b) => {
        b.addEventListener("click", () => {
          modeButtons.forEach((x) => x.classList.remove("is-active"));
          b.classList.add("is-active");
          activeMode = b.dataset.mode;
          durBox.style.display = activeMode === "duration" ? "flex" : "none";
          clockBox.style.display = activeMode === "clock" ? "flex" : "none";
        });
      });

      // Custom Sound Dropdown (Zero Native <select>)
      const soundMount = drawer.querySelector("#ds-node-sound-mount");
      const dropdown = createDropdownWidget({
        items: SOUND_OPTIONS,
        value: soundVal,
        onChange: (v) => {
          soundVal = v;
        },
      });
      soundMount.appendChild(dropdown.root);

      // Fullscreen switch
      fsToggle?.addEventListener("click", () => {
        fsVal = !fsVal;
        fsToggle.classList.toggle("is-on", fsVal);
        fsToggle.setAttribute("aria-checked", String(fsVal));
      });

      // Sound test
      drawer.querySelector("#ds-drw-test-sound")?.addEventListener("click", () => {
        window.dsAudio?.playSound?.(soundVal, 0.7);
      });

      const closeDrawer = () => {
        dropdown.destroy();
        drawer.remove();
        this._dsActiveDrawer = null;
      };

      drawer.querySelector("#ds-drw-close")?.addEventListener("click", closeDrawer);
      drawer.querySelector("#ds-drw-cancel")?.addEventListener("click", closeDrawer);

      drawer.querySelector("#ds-drw-save")?.addEventListener("click", () => {
        const title = (titleInput.value || "Reminder").trim();
        const payload = {
          title,
          mode: activeMode,
          durationMinutes: durVal,
          clockTime: clockInput.value || "18:00",
          sound: soundVal,
          fullscreen: fsVal,
        };

        if (window.DSReminderStore) {
          if (isEdit) {
            window.DSReminderStore.updateReminder(existingReminder.id, payload);
          } else {
            window.DSReminderStore.addReminder(payload);
          }
        }
        closeDrawer();
      });
    };
  },
});
