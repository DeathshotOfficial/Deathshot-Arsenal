// DeathshotArsenal/js/Version Check/ds_version_check.js
import { app } from "/scripts/app.js";

const TYPE = "DS_VersionCheck";
const EXT = "DeathshotArsenal.DS_VersionCheck";
const CSS = "/extensions/DeathshotArsenal/Version%20Check/ds_version_check.css";
const BASE_W = 270;
const BASE_H = 185;

if (!document.querySelector(`link[href*="ds_version_check.css"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

function isVue() {
  return !!window.LiteGraph?.vueNodesMode;
}

function themeVar(name, fallback) {
  try {
    return window.DSGlobalTheme?.getVar?.(name, fallback) || fallback;
  } catch (_) {
    return fallback;
  }
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

function rr(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

async function fetchVersions(node) {
  if (node._dsLoading) return;
  node._dsLoading = true;
  node.setDirtyCanvas?.(true, false);

  try {
    const res = await fetch("/ds/version_check");
    if (res.ok) {
      const data = await res.json();
      node._dsVersions = {
        comfyui: data.comfyui || "---",
        frontend: data.frontend || "---",
        pytorch: data.pytorch || "---",
        deathshot: data.deathshot || "1.0",
      };
      node._dsLoading = false;
      syncDisplay(node);
      node.setDirtyCanvas?.(true, false);
      return;
    }
  } catch (_) {}

  // Fallback to ComfyUI's standard /system_stats route
  try {
    const res = await fetch("/system_stats");
    if (res.ok) {
      const data = await res.json();
      const sys = data.system || {};
      node._dsVersions = {
        comfyui: sys.comfyui_version || "---",
        frontend: sys.required_frontend_version || "---",
        pytorch: sys.pytorch_version || "---",
        deathshot: "1.0",
      };
      node._dsLoading = false;
      syncDisplay(node);
      node.setDirtyCanvas?.(true, false);
      return;
    }
  } catch (_) {}

  node._dsLoading = false;
  node._dsVersions = node._dsVersions || {
    comfyui: "---",
    frontend: "---",
    pytorch: "---",
    deathshot: "1.0",
  };
  syncDisplay(node);
  node.setDirtyCanvas?.(true, false);
}

function copyVersionsToClipboard(node) {
  const v = node._dsVersions || {};
  const text = [
    `ComfyUI: ${v.comfyui || "---"}`,
    `Frontend: ${v.frontend || "---"}`,
    `PyTorch: ${v.pytorch || "---"}`,
    `Deathshot Arsenal: ${v.deathshot || "1.0"}`,
  ].join("\n");

  const onSuccess = () => {
    node._dsCopied = true;
    syncDisplay(node);
    node.setDirtyCanvas?.(true, false);
    setTimeout(() => {
      node._dsCopied = false;
      syncDisplay(node);
      node.setDirtyCanvas?.(true, false);
    }, 1600);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
  } else {
    fallbackCopy(text, onSuccess);
  }
}

function fallbackCopy(text, cb) {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    el.remove();
    cb?.();
  } catch (_) {}
}

function paint(node, ctx) {
  const w = Math.max(200, Number(node.size?.[0]) || BASE_W);
  const h = Math.max(160, Number(node.size?.[1]) || BASE_H);
  const c = palette();
  const v = node._dsVersions || {
    comfyui: "...",
    frontend: "...",
    pytorch: "...",
    deathshot: "1.0",
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  // Outer container card
  rr(ctx, 0, 0, w, h, 10, c.bg, c.border, 1);

  const padX = 16;
  let curY = 16;

  // Header: ●  Version Check Deathshot Arsenal
  const dotX = padX + 4;
  const dotY = curY + 6;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = c.accent;
  ctx.fill();

  // Dot soft glow
  ctx.beginPath();
  ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
  ctx.fillStyle = c.accent + "33";
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "800 11.5px Inter, -apple-system, system-ui, sans-serif";
  ctx.fillStyle = c.text;
  ctx.fillText("Version Check Deathshot Arsenal", dotX + 12, dotY);

  curY += 22;

  // Header underline
  ctx.beginPath();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.moveTo(padX, curY);
  ctx.lineTo(w - padX, curY);
  ctx.stroke();

  curY += 12;

  // 4 rows of version pairs
  const rows = [
    ["ComfyUI", v.comfyui || "---"],
    ["Frontend", v.frontend || "---"],
    ["PyTorch", v.pytorch || "---"],
    ["Deathshot Arsenal", v.deathshot || "1.0"],
  ];

  const availableRowSpace = h - curY - 44;
  const rowStep = Math.max(18, Math.min(26, availableRowSpace / 4));

  for (let i = 0; i < rows.length; i++) {
    const [label, val] = rows[i];
    const rowY = curY + i * rowStep + rowStep / 2;

    // Label
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = c.muted;
    ctx.fillText(label, padX, rowY);

    // Value
    ctx.textAlign = "right";
    ctx.font = "bold 11px \"Fira Code\", Consolas, monospace";
    ctx.fillStyle = c.text;
    ctx.fillText(String(val), w - padX, rowY);
  }

  // Buttons: [ Copy ]  [ Refresh ]
  const btnH = 26;
  const btnY = h - 14 - btnH;
  const btnGap = 8;
  const totalBtnW = w - padX * 2;
  const btnW = Math.floor((totalBtnW - btnGap) / 2);

  const copyX = padX;
  const refreshX = copyX + btnW + btnGap;

  const hoverBtn = node._dsHoverBtn;

  // Copy button
  const copyHover = hoverBtn === "copy";
  const copyActive = !!node._dsCopied;
  rr(ctx, copyX, btnY, btnW, btnH, 5, copyHover || copyActive ? c.panel2 : c.panel, copyHover || copyActive ? c.accent : c.border, 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 10.5px Inter, system-ui, sans-serif";
  ctx.fillStyle = copyHover || copyActive ? c.accent : c.text;
  ctx.fillText(copyActive ? "COPIED! ✓" : "Copy", copyX + btnW / 2, btnY + btnH / 2);

  // Refresh button
  const refreshHover = hoverBtn === "refresh";
  const refreshing = !!node._dsLoading;
  rr(ctx, refreshX, btnY, btnW, btnH, 5, refreshHover ? c.panel2 : c.panel, refreshHover ? c.accent : c.border, 1);
  ctx.fillStyle = refreshHover ? c.accent : c.text;
  ctx.fillText(refreshing ? "Refreshing..." : "Refresh", refreshX + btnW / 2, btnY + btnH / 2);

  // Save button hits for interaction
  node._dsButtons = [
    { key: "copy", x: copyX, y: btnY, w: btnW, h: btnH },
    { key: "refresh", x: refreshX, y: btnY, w: btnW, h: btnH },
  ];

  ctx.restore();
}

function buttonHit(node, pos) {
  if (!pos || !node._dsButtons) return null;
  const [x, y] = pos;
  for (const b of node._dsButtons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function syncDisplay(node) {
  if (!node._dsVCRoot) return;
  const v = node._dsVersions || {};
  const els = node._dsVCEls;
  if (!els) return;

  if (els.comfyui) els.comfyui.textContent = v.comfyui || "---";
  if (els.frontend) els.frontend.textContent = v.frontend || "---";
  if (els.pytorch) els.pytorch.textContent = v.pytorch || "---";
  if (els.deathshot) els.deathshot.textContent = v.deathshot || "1.0";
  if (els.copy) els.copy.textContent = node._dsCopied ? "COPIED! ✓" : "Copy";
  if (els.copy) els.copy.classList.toggle("active", !!node._dsCopied);
  if (els.refresh) els.refresh.textContent = node._dsLoading ? "Refreshing..." : "Refresh";
}

function makeVueFace(node) {
  if (node._dsVCRoot) return;
  const root = document.createElement("div");
  root.className = "ds-version-check-root";
  root.dataset.dsThemed = "true";

  root.innerHTML = `
    <div class="ds-vc-header">
      <span class="ds-vc-dot"></span>
      <span>Version Check Deathshot Arsenal</span>
    </div>
    <div class="ds-vc-rows">
      <div class="ds-vc-row">
        <span class="ds-vc-label">ComfyUI</span>
        <span class="ds-vc-val" data-el="comfyui">...</span>
      </div>
      <div class="ds-vc-row">
        <span class="ds-vc-label">Frontend</span>
        <span class="ds-vc-val" data-el="frontend">...</span>
      </div>
      <div class="ds-vc-row">
        <span class="ds-vc-label">PyTorch</span>
        <span class="ds-vc-val" data-el="pytorch">...</span>
      </div>
      <div class="ds-vc-row">
        <span class="ds-vc-label">Deathshot Arsenal</span>
        <span class="ds-vc-val" data-el="deathshot">1.0</span>
      </div>
    </div>
    <div class="ds-vc-actions">
      <button class="ds-vc-btn" data-action="copy" type="button">Copy</button>
      <button class="ds-vc-btn" data-action="refresh" type="button">Refresh</button>
    </div>
  `;

  const els = {
    comfyui: root.querySelector('[data-el="comfyui"]'),
    frontend: root.querySelector('[data-el="frontend"]'),
    pytorch: root.querySelector('[data-el="pytorch"]'),
    deathshot: root.querySelector('[data-el="deathshot"]'),
    copy: root.querySelector('[data-action="copy"]'),
    refresh: root.querySelector('[data-action="refresh"]'),
  };

  node._dsVCRoot = root;
  node._dsVCEls = els;

  els.copy?.addEventListener("pointerdown", (e) => e.stopPropagation());
  els.copy?.addEventListener("click", (e) => {
    e.stopPropagation();
    copyVersionsToClipboard(node);
  });

  els.refresh?.addEventListener("pointerdown", (e) => e.stopPropagation());
  els.refresh?.addEventListener("click", (e) => {
    e.stopPropagation();
    fetchVersions(node);
  });

  const widget = node.addDOMWidget("ds_version_check_ui", "version_check", root, {
    serialize: false,
    hideOnZoom: false,
    getHeight: () => Math.max(175, Number(node.size?.[1]) || BASE_H),
    getMinHeight: 175,
  });
  widget.computeLayoutSize = () => ({ minWidth: 240, minHeight: 175 });
  node._dsVCWidget = widget;

  window.DSGlobalTheme?.bindNode?.(root, node);
  syncDisplay(node);
}

app.registerExtension({
  name: EXT,
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TYPE) return;
    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldResize = nodeType.prototype.onResize;
    const oldMouseDown = nodeType.prototype.onMouseDown;
    const oldMouseMove = nodeType.prototype.onMouseMove;
    const oldMouseUp = nodeType.prototype.onMouseUp;

    nodeType.prototype.onNodeCreated = function () {
      oldCreated?.apply(this, arguments);
      this.flags = this.flags || {};
      this.flags.no_title = true;
      this.title = "";
      this.badges = [];
      this.resizable = true;
      this._dsNodeBaseOptOut = true;
      this.bgcolor = "transparent";
      this.color = "transparent";
      this.boxcolor = "transparent";
      this.min_size = [240, 175];
      if (!Array.isArray(this.size) || this.size[0] < 1 || this.size[1] < 1) {
        this.size = [BASE_W, BASE_H];
      }

      if (isVue()) makeVueFace(this);
      fetchVersions(this);

      // Subscribe to theme updates
      if (!this._dsThemeSubscribed && window.DSGlobalTheme?.subscribe) {
        this._dsThemeSubscribed = true;
        window.DSGlobalTheme.subscribe(() => {
          this.setDirtyCanvas?.(true, true);
        });
      }

      this.setDirtyCanvas?.(true, true);
    };

    nodeType.prototype.onConfigure = function () {
      const r = oldConfigure?.apply(this, arguments);
      this.flags = this.flags || {};
      this.flags.no_title = true;
      this.title = "";
      this.resizable = true;
      this._dsNodeBaseOptOut = true;
      this.bgcolor = "transparent";
      this.color = "transparent";
      this.boxcolor = "transparent";
      this.min_size = [240, 175];

      if (isVue()) makeVueFace(this);
      fetchVersions(this);
      return r;
    };

    nodeType.prototype.onResize = function (size) {
      if (size[0] < 240) size[0] = 240;
      if (size[1] < 175) size[1] = 175;
      const r = oldResize?.apply(this, arguments);
      this.setDirtyCanvas?.(true, false);
      return r;
    };

    nodeType.prototype.onDrawForeground = function (ctx) {
      if (!ctx || isVue() || this.flags?.collapsed) return;
      try {
        paint(this, ctx);
      } catch (e) {
        console.error("[DS Version Check] paint error", e);
      }
    };

    nodeType.prototype.onMouseDown = function (e, pos) {
      if (!isVue() && pos) {
        const hit = buttonHit(this, pos);
        if (hit?.key === "copy") {
          copyVersionsToClipboard(this);
          return true;
        }
        if (hit?.key === "refresh") {
          fetchVersions(this);
          return true;
        }
      }
      return oldMouseDown ? oldMouseDown.apply(this, arguments) : false;
    };

    nodeType.prototype.onMouseMove = function (e, pos) {
      if (!isVue() && pos) {
        const hit = buttonHit(this, pos);
        const next = hit ? hit.key : null;
        if (this._dsHoverBtn !== next) {
          this._dsHoverBtn = next;
          this.setDirtyCanvas?.(true, false);
        }
      }
      return oldMouseMove ? oldMouseMove.apply(this, arguments) : false;
    };

    nodeType.prototype.onMouseUp = function (e, pos) {
      return oldMouseUp ? oldMouseUp.apply(this, arguments) : false;
    };
  },
  nodeCreated(node) {
    if (node.type !== TYPE && node.comfyClass !== TYPE) return;
    node.flags = node.flags || {};
    node.flags.no_title = true;
    node.title = "";
    node.resizable = true;
    node._dsNodeBaseOptOut = true;
    node.bgcolor = "transparent";
    node.color = "transparent";
    node.boxcolor = "transparent";
    node.min_size = [240, 175];
    if (!Array.isArray(node.size) || node.size[0] < 1 || node.size[1] < 1) {
      node.size = [BASE_W, BASE_H];
    }
    if (isVue()) makeVueFace(node);
    fetchVersions(node);
  },
});
