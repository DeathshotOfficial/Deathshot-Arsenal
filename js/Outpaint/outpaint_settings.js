import { app } from "/scripts/app.js";
import { openAccentPicker } from "../Control Panel/settings.mjs";

const DEFAULT_RATIOS = ["1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "1:2", "2:1", "9:16", "16:9", "21:9"];
const DEFAULT_MP = [0, 1, 1.5, 2, 2.5, 3];
const OPEN = new Map();

function nodeRect(node) {
  const canvas = app?.canvas?.canvas;
  const ds = app?.canvas?.ds;
  if (!canvas || !ds || !node) return null;
  const r = canvas.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const off = ds.offset || [0, 0];
  return {
    left: r.left + (Number(node.pos?.[0] || 0) + Number(off[0] || 0)) * scale,
    top: r.top + (Number(node.pos?.[1] || 0) + Number(off[1] || 0)) * scale,
    width: Number(node.size?.[0] || 320) * scale,
    height: Number(node.size?.[1] || 450) * scale,
  };
}

function position(node, popup) {
  const nr = nodeRect(node);
  if (!nr) return;
  const margin = 10;
  const gap = 12;
  const pw = popup.offsetWidth || 320;
  const ph = popup.offsetHeight || 480;
  let left = nr.left + nr.width + gap;
  if (left + pw > innerWidth - margin) left = nr.left - pw - gap;
  left = Math.max(margin, Math.min(left, innerWidth - pw - margin));
  let top = nr.top;
  if (top + ph > innerHeight - margin) top = innerHeight - ph - margin;
  top = Math.max(margin, top);
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function close(node) {
  const item = OPEN.get(node?.id);
  if (!item) return;
  item.popup.remove();
  OPEN.delete(node.id);
}

function chip(text, active, onClick, removable = false, onRemove = null) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `ds-op-set-chip${active ? " is-active" : ""}`;
  const label = document.createElement("span");
  label.textContent = text;
  b.append(label);

  if (removable) {
    const x = document.createElement("span");
    x.className = "ds-op-chip-x";
    x.textContent = "×";
    x.title = "Remove preset";
    x.addEventListener("pointerdown", (e) => e.stopPropagation());
    x.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove?.(e);
    });
    b.append(x);
  }

  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return b;
}

export function openSettings(node) {
  close(node);
  const s = node._dsState;
  const popup = document.createElement("section");
  popup.className = "ds-op-settings";
  popup.dataset.dsThemed = "true";

  const head = document.createElement("header");
  head.className = "ds-op-settings-head";
  const titleBox = document.createElement("div");
  const title = document.createElement("div");
  title.className = "ds-op-settings-title";
  title.textContent = "Outpaint Settings";
  const sub = document.createElement("div");
  sub.className = "ds-op-settings-sub";
  sub.textContent = "Preset visibility and megapixel options";
  titleBox.append(title, sub);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ds-op-settings-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => close(node));
  head.append(titleBox, closeBtn);
  popup.append(head);

  const body = document.createElement("div");
  body.className = "ds-op-settings-body";

  // 1. Aspect Ratio Presets
  const ratioLabel = document.createElement("div");
  ratioLabel.className = "ds-op-settings-label";
  const ratioTitle = document.createElement("span");
  ratioTitle.textContent = "ASPECT RATIOS";
  const ratioCount = document.createElement("span");
  ratioLabel.append(ratioTitle, ratioCount);
  body.append(ratioLabel);

  const ratioGrid = document.createElement("div");
  ratioGrid.className = "ds-op-settings-ratios";

  const renderRatios = () => {
    ratioGrid.replaceChildren();
    ratioCount.textContent = `${s.custom_ratios.length} ACTIVE`;
    DEFAULT_RATIOS.forEach((ratio) => {
      const active = s.custom_ratios.includes(ratio);
      ratioGrid.appendChild(
        chip(ratio, active, () => {
          node._dsBeginChange?.();
          if (s.custom_ratios.includes(ratio)) {
            if (s.custom_ratios.length <= 1) return;
            s.custom_ratios = s.custom_ratios.filter((x) => x !== ratio);
            if (s.ratio === ratio) s.ratio = s.custom_ratios[0];
          } else {
            s.custom_ratios = [...s.custom_ratios, ratio];
          }
          node._dsCommit();
          renderRatios();
        })
      );
    });
  };
  renderRatios();
  body.append(ratioGrid);

  // 2. Megapixel Presets
  const mpLabel = document.createElement("div");
  mpLabel.className = "ds-op-settings-label";
  const mpTitle = document.createElement("span");
  mpTitle.textContent = "MEGAPIXEL PRESETS";
  const mpCount = document.createElement("span");
  mpLabel.append(mpTitle, mpCount);
  body.append(mpLabel);

  const mpWrap = document.createElement("div");
  mpWrap.className = "ds-op-settings-mps";

  const renderMP = () => {
    mpWrap.replaceChildren();
    const activeCount = s.custom_mp.filter((v) => Number(v) > 0).length;
    mpCount.textContent = `${activeCount} ACTIVE`;

    [...s.custom_mp]
      .sort((a, b) => Number(a) - Number(b))
      .forEach((value) => {
        const numVal = Number(value);
        const active = Number(s.target_mp) === numVal;
        const isRemovable = numVal !== 0; // All presets except "Off" can be removed

        const b = chip(
          numVal === 0 ? "Off" : `${numVal} MP`,
          active,
          () => {
            node._dsBeginChange?.();
            s.target_mp = numVal;
            node._dsCommit();
            renderMP();
          },
          isRemovable,
          () => {
            node._dsBeginChange?.();
            s.custom_mp = s.custom_mp.filter((v) => Number(v) !== numVal);
            if (Number(s.target_mp) === numVal) {
              s.target_mp = 0;
            }
            node._dsCommit();
            renderMP();
          }
        );
        mpWrap.append(b);
      });
  };
  renderMP();
  body.append(mpWrap);

  // 3. Add Custom Megapixel Preset
  const addRow = document.createElement("div");
  addRow.className = "ds-op-settings-add";
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.placeholder = "e.g. 1.3";
  input.spellcheck = false;

  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Add";

  const addMP = () => {
    const rawVal = parseFloat(input.value.replace(",", "."));
    const value = Math.round(rawVal * 10) / 10;
    if (value > 0 && value <= 100 && Number.isFinite(value)) {
      if (!s.custom_mp.some((v) => Number(v) === value)) {
        node._dsBeginChange?.();
        s.custom_mp = [...s.custom_mp, value].sort((a, b) => a - b);
        node._dsCommit();
        input.value = "";
        renderMP();
      }
    }
  };

  add.addEventListener("click", addMP);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") addMP();
  });
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  add.addEventListener("pointerdown", (e) => e.stopPropagation());
  addRow.append(input, add);
  body.append(addRow);

  // 4. Restore Defaults
  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "ds-op-settings-restore";
  restore.textContent = "Restore default presets";
  restore.addEventListener("click", () => {
    node._dsBeginChange?.();
    s.custom_ratios = [...DEFAULT_RATIOS];
    s.custom_mp = [...DEFAULT_MP];
    if (!s.custom_mp.some((v) => Number(v) === Number(s.target_mp))) {
      s.target_mp = 0;
    }
    if (!s.custom_ratios.includes(s.ratio)) {
      s.ratio = s.custom_ratios[0] || "3:2";
    }
    node._dsCommit();
    renderRatios();
    renderMP();
  });
  body.append(restore);

  // 5. Padding Color Accent
  const accentRow = document.createElement("div");
  accentRow.className = "ds-op-settings-accent-row";
  const accentLabel = document.createElement("span");
  accentLabel.textContent = "PADDING COLOR";
  const accent = document.createElement("button");
  accent.type = "button";
  accent.className = "ds-op-settings-accent";
  accent.style.setProperty("background-color", String(s.fill_color), "important");
  accent.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    node.properties.ds_cp_accent = String(s.fill_color).toLowerCase();
    openAccentPicker(app, node, {
      setAccent: (color) => {
        node._dsBeginChange?.();
        s.fill_color = String(color).toLowerCase();
        node.properties.ds_cp_accent = s.fill_color;
        node._dsCommit();
        accent.style.setProperty("background-color", String(s.fill_color), "important");
      },
    });
  });
  accentRow.append(accentLabel, accent);
  body.append(accentRow);

  popup.append(body);
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  popup.addEventListener("mousedown", (e) => e.stopPropagation());
  document.body.appendChild(popup);
  OPEN.set(node.id, { node, popup });

  try {
    window.DSGlobalTheme?.applyToElement?.(popup);
  } catch (_) {}

  position(node, popup);
  requestAnimationFrame(() => position(node, popup));
}

if (!window.__DS_OUTPAINT_SETTINGS_EVENTS__) {
  window.__DS_OUTPAINT_SETTINGS_EVENTS__ = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      for (const item of OPEN.values()) {
        if (!item.popup.contains(e.target)) close(item.node);
      }
    },
    true
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      for (const item of OPEN.values()) close(item.node);
    }
  });
  window.addEventListener("resize", () => {
    for (const item of OPEN.values()) position(item.node, item.popup);
  });
}