import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE_NAME = "DS_HardwareMonitor";
const CSS = "/extensions/DeathshotArsenal/Hardware Monitor/ds_hardware_monitor.css";
const BASE_W = 560;
const BASE_H = 340;
const COMPACT_BASE_H = 54;
const getCompactH = node => Math.round(COMPACT_BASE_H * (Number(node?.properties?.scale) || 1.0));
const MIN_S = 0.50;
const MAX_S = 4.0;

const DEFAULT_DISPLAY = {
  cpu: true,
  ram: true,
  gpu: true,
  vram: true,
  cpu_fan: false,
  gpu_fan: true,
  temperature: true,
  power: true,
  peak: true,
  free_vram: true,
  unload_model: true,
};

const ALL_ELEMENTS = [
  { id: "cpu", label: "CPU" },
  { id: "ram", label: "RAM" },
  { id: "gpu", label: "GPU" },
  { id: "vram", label: "VRAM" },
  { id: "cpu_fan", label: "CPU Fan" },
  { id: "gpu_fan", label: "GPU Fan" },
  { id: "temperature", label: "Temp" },
  { id: "power", label: "Power" },
  { id: "peak", label: "Peak" },
  { id: "free_vram", label: "Free VRAM" },
  { id: "unload_model", label: "Unload Model" },
];

function getDisplayConfig(node) {
  node.properties = node.properties || {};
  if (!node.properties.display || typeof node.properties.display !== "object") {
    node.properties.display = { ...DEFAULT_DISPLAY };
  } else {
    for (const key of Object.keys(DEFAULT_DISPLAY)) {
      if (node.properties.display[key] === undefined) {
        node.properties.display[key] = DEFAULT_DISPLAY[key];
      }
    }
  }
  if (node.properties.compact_mode === undefined) {
    node.properties.compact_mode = false;
  }
  if (node.properties.scale === undefined) {
    node.properties.scale = 1.0;
  }
  return node.properties.display;
}

const log = (...a) => console.info("[DS Hardware Monitor]", ...a);
const warn = (...a) => console.warn("[DS Hardware Monitor]", ...a);
const err = (...a) => console.error("[DS Hardware Monitor]", ...a);

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(v) || 0));
const fmt = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "—";
const level = v => clamp(v) >= 90 ? "critical" : clamp(v) >= 75 ? "warning" : "normal";
const isVue = () => !!window.LiteGraph?.vueNodesMode;
const graphLoading = () => !!app?.graph?.loading || !!app?.graph?._loading;

function themeVar(name, fallback) {
  try { return window.DSGlobalTheme?.getVar?.(name, fallback) || fallback; }
  catch (_) { return fallback; }
}

const ICONS = {
  cpu: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v4M15 1v4M9 19v4M15 19v-4M1 9h4M1 15h4M19 9h-4M19 15h-4"/></svg>',
  ram: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h2v4H7m4-4h2v4h-2m4-4h2v4h-2M7 3v3m5-3v3m5-3v3M7 18v3m5-3v3m5-3v3"/></svg>',
  gpu: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4zM8 9h8v6H8zM2 10v4m20-4v4M7 18v3m10-3v3"/></svg>',
  vram: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8v6H8zM2 9v6m20-6v6"/></svg>',
  fan: '<svg viewBox="0 0 24 24"><path d="M12 12c2.5 0 4.5-1.5 4.5-3.5S14.5 5 12 5s-2.5 1.5-2.5 3.5S11 12 12 12z"/><path d="M12 12c0 2.5 1.5 4.5 3.5 4.5s3.5-2 3.5-4.5-1.5-2.5-3.5-2.5S12 11 12 12z"/><path d="M12 12c-2.5 0-4.5 1.5-4.5 3.5s2 3.5 4.5 3.5 2.5-1.5 2.5-3.5S13 12 12 12z"/><path d="M12 12c0-2.5-1.5-4.5-3.5-4.5S5 9.5 5 12s1.5 2.5 3.5 2.5S12 13 12 12z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="m13 2-9 12h7l-1 8 9-12h-7z"/></svg>',
  eject: '<svg viewBox="0 0 24 24"><path d="M4 15h16M6 15l6-8 6 8M5 19h14"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.8-4L3 10m0-5v5h5M4 13a8 8 0 0 0 14.8 4L21 14m0 5v-5h-5"/></svg>'
};

function rr(ctx,x,y,w,h,r,fill,stroke,lw=1) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x,y,w,h,r); else ctx.rect(x,y,w,h);
  if (fill) { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=lw; ctx.stroke(); }
}

function drawIcon(ctx, kind, x, y, size, color) {
  ctx.save(); ctx.translate(x,y); ctx.scale(size/24,size/24);
  ctx.strokeStyle=color; ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.fillStyle="none";
  ctx.beginPath();
  if(kind==="cpu") {
    ctx.rect(7,7,10,10);
    [[9,1,9,5],[15,1,15,5],[9,19,9,23],[15,19,15,23],[1,9,5,9],[1,15,5,15],[19,9,23,9],[19,15,23,15]].forEach(a=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);});
  } else if(kind==="ram") {
    ctx.rect(3,6,18,12);
    [[7,3,7,6],[12,3,12,6],[17,3,17,6],[7,18,7,21],[12,18,12,21],[17,18,17,21]].forEach(a=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);});
    ctx.rect(7,10,2,4);ctx.rect(11,10,2,4);ctx.rect(15,10,2,4);
  } else if(kind==="fan") {
    ctx.arc(12, 12, 3, 0, Math.PI * 2);
    [[12,9,12,3],[12,15,12,21],[9,12,3,12],[15,12,21,12]].forEach(a=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);});
  } else {
    ctx.rect(4,6,16,12);ctx.rect(8,9,8,6);
    [[2,10,2,14],[22,10,22,14],[7,18,7,21],[17,18,17,21]].forEach(a=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);});
  }
  ctx.stroke(); ctx.restore();
}

function palette() {
  return {
    bg: themeVar("--ds-bg", "#0c0c0e"),
    panel: themeVar("--ds-panel", "#181a20"),
    panel2: themeVar("--ds-panel-2", "#20232a"),
    text: themeVar("--ds-text", "#e7e9ed"),
    muted: themeVar("--ds-text-muted", "#8e96a3"),
    border: themeVar("--ds-border", "#343841"),
    accent: themeVar("--ds-accent", "#45e6a0"),
    btn: themeVar("--ds-btn-bg", themeVar("--ds-panel", "#181a20")),
    btnHover: themeVar("--ds-btn-hover", themeVar("--ds-panel-2", "#20232a")),
    warning: themeVar("--ds-warning", "#f3b548"),
    danger: themeVar("--ds-danger", "#ff5f6d"),
  };
}

function installBodyHook() {
  if (window._dsHwBodyHookInstalled) return;
  const proto = window.LGraphCanvas?.prototype;
  if (!proto || typeof proto.drawNode !== "function") {
    warn("LGraphCanvas.drawNode unavailable; classic body hook not installed");
    return;
  }
  window._dsHwBodyHookInstalled = true;
  const original = proto.drawNode;
  proto.drawNode = function(node, ctx) {
    if (ctx && node && (node.type === NODE_NAME || node.comfyClass === NODE_NAME)) {
      const p = palette();
      const oldBg=node.bgcolor, oldColor=node.color, oldBox=node.boxcolor, oldShadow=ctx.shadowColor;
      const LG=window.LiteGraph||{}; const oldR=LG.ROUND_RADIUS;
      node.bgcolor=p.bg; node.color=p.bg; node.boxcolor=p.border; ctx.shadowColor="rgba(0,0,0,0)";
      if (LG) LG.ROUND_RADIUS=10;
      try { return original.apply(this, arguments); }
      finally { node.bgcolor=oldBg; node.color=oldColor; node.boxcolor=oldBox; ctx.shadowColor=oldShadow; if(LG)LG.ROUND_RADIUS=oldR; }
    }
    return original.apply(this, arguments);
  };
  log("Classic canvas body hook installed");
}

function buttonRects(node) { return node._dsHwHit || []; }
function localPos(pos) { return pos ? [Number(pos[0])||0, Number(pos[1])||0] : null; }
function hitButton(node,pos) {
  const p=localPos(pos); if(!p)return null;
  return buttonRects(node).find(r=>p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h) || null;
}

function paintNormal(node, ctx) {
  const w = Math.max(1, Number(node.size?.[0]) || BASE_W);
  const h = Math.max(1, Number(node.size?.[1]) || BASE_H);
  const s = Math.max(MIN_S, Math.min(MAX_S, w / BASE_W));
  const c = palette();
  const pad = 14 * s, gap = 9 * s;
  const disp = getDisplayConfig(node);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();

  rr(ctx, 0, 0, w, h, 10 * s, c.bg, c.border, Math.max(1, s));
  ctx.textBaseline = "middle";

  // Top header: LIVE badge + device name
  ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(pad + 7 * s, pad + 7 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.text; ctx.font = `800 ${14 * s}px Inter,Segoe UI,system-ui,sans-serif`; ctx.fillText("LIVE", pad + 20 * s, pad + 7 * s);
  ctx.fillStyle = c.muted; ctx.textAlign = "right"; ctx.font = `650 ${12 * s}px Inter,Segoe UI,system-ui,sans-serif`;
  ctx.fillText(node._dsHw?.device || "Detecting GPU…", w - pad, pad + 7 * s); ctx.textAlign = "left";

  // Visible metric cards
  const candidateCards = [
    { id: "cpu", kind: "cpu", label: "CPU", val: node._dsHw?.cpu || 0, sub: node._dsHw?.cpuSub || "—", hasBar: true },
    { id: "ram", kind: "ram", label: "RAM", val: node._dsHw?.ram || 0, sub: node._dsHw?.ramSub || "—", hasBar: true },
    { id: "gpu", kind: "gpu", label: "GPU LOAD", val: node._dsHw?.gpu || 0, sub: node._dsHw?.gpuSub || "—", hasBar: true },
    { id: "vram", kind: "vram", label: "VRAM", val: node._dsHw?.vram || 0, sub: node._dsHw?.vramSub || "—", hasBar: true },
    {
      id: "cpu_fan", kind: "fan", label: "CPU FAN",
      val: node._dsHw?.cpuFanSupported && node._dsHw?.cpuFanVal ? node._dsHw.cpuFanVal : 0,
      valText: node._dsHw?.cpuFanSupported && node._dsHw?.cpuFanVal ? `${node._dsHw.cpuFanVal} RPM` : "N/A",
      sub: node._dsHw?.cpuFanSupported ? "Active fan speed" : "Fan monitor not supported on your PC",
      hasBar: false
    },
    {
      id: "gpu_fan", kind: "fan", label: "GPU FAN",
      val: node._dsHw?.gpuFanSupported && node._dsHw?.gpuFanVal ? node._dsHw.gpuFanVal : 0,
      valText: node._dsHw?.gpuFanSupported && node._dsHw?.gpuFanVal ? (node._dsHw.gpuFanVal > 100 ? `${Math.round(node._dsHw.gpuFanVal)} RPM` : `${Math.round(node._dsHw.gpuFanVal)}%`) : "N/A",
      sub: node._dsHw?.gpuFanSupported ? "Active fan speed" : "Fan monitor not supported on your PC",
      hasBar: false
    }
  ];

  const cards = candidateCards.filter(card => Boolean(disp[card.id]));
  const top = pad + 28 * s, footerH = 51 * s, cardsTop = top + 8 * s;
  const cardsAvailH = Math.max(40 * s, h - pad - cardsTop - footerH - 10 * s);

  node._dsHwHit = [];

  const cardCount = cards.length;
  if (cardCount > 0) {
    let cols = 2, rows = Math.ceil(cardCount / cols);
    if (cardCount === 1) { cols = 1; rows = 1; }
    else if (cardCount >= 5) { cols = 3; rows = Math.ceil(cardCount / cols); }

    const cardW = Math.max(30 * s, (w - 2 * pad - (cols - 1) * gap) / cols);
    const cardH = Math.max(30 * s, (cardsAvailH - (rows - 1) * gap) / rows);

    cards.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (cardW + gap);
      const y = cardsTop + row * (cardH + gap);
      const lv = card.hasBar ? level(card.val) : "normal";
      const border = lv === "warning" ? c.warning : lv === "critical" ? c.danger : c.border;

      rr(ctx, x, y, cardW, cardH, 9 * s, c.panel, border, 1.2 * s);
      drawIcon(ctx, card.kind, x + 16 * s, y + 16 * s, 17 * s, c.muted);

      ctx.fillStyle = c.muted; ctx.font = `750 ${13 * s}px Inter,Segoe UI,system-ui,sans-serif`;
      ctx.fillText(card.label, x + 40 * s, y + 24 * s);

      ctx.fillStyle = c.text; ctx.textAlign = "right"; ctx.font = `900 ${22 * s}px Inter,Segoe UI,system-ui,sans-serif`;
      const valDisplay = card.valText != null ? card.valText : `${Math.round(card.val)}%`;
      ctx.fillText(valDisplay, x + cardW - 16 * s, y + 24 * s);
      ctx.textAlign = "left";

      if (card.hasBar) {
        const tx = x + 16 * s, ty = y + 52 * s, tw = Math.max(10 * s, cardW - 32 * s), th = 12 * s;
        rr(ctx, tx, ty, tw, th, 6 * s, c.panel2);
        ctx.fillStyle = lv === "warning" ? c.warning : lv === "critical" ? c.danger : c.accent;
        if (card.val > 0) rr(ctx, tx, ty, Math.max(2 * s, tw * clamp(card.val) / 100), th, 6 * s, ctx.fillStyle);
      }

      ctx.fillStyle = c.muted;
      ctx.font = `${card.sub.includes("not supported") ? "italic " : ""}500 ${9.5 * s}px Inter,Segoe UI,system-ui,sans-serif`;
      ctx.fillText(card.sub, x + 16 * s, y + cardH - 14 * s);
    });
  }

  // Footer: Stats and Actions
  const fy = h - pad - 44 * s, fh = 44 * s, hg = 7 * s;

  const healthItems = [];
  if (disp.temperature) healthItems.push([node._dsHw?.temp || "—", "TEMP"]);
  if (disp.power) healthItems.push([node._dsHw?.power || "—", "POWER"]);
  if (disp.peak) healthItems.push([node._dsHw?.peak || "—", "PEAK"]);

  const actionItems = [];
  if (disp.free_vram) actionItems.push(["free", "Free VRAM"]);
  if (disp.unload_model) actionItems.push(["unload", "Unload models"]);
  actionItems.push(["refresh", "↻"]);

  const hasHealth = healthItems.length > 0;
  const hasActions = actionItems.length > 0;

  let healthW = 0;
  if (hasHealth && hasActions) {
    healthW = (w - 2 * pad) * 0.42;
  } else if (hasHealth) {
    healthW = w - 2 * pad;
  }

  if (hasHealth) {
    const cellW = Math.max(20 * s, (healthW - (healthItems.length - 1) * hg) / healthItems.length);
    healthItems.forEach((v, i) => {
      const x = pad + i * (cellW + hg);
      rr(ctx, x, fy, cellW, fh, 8 * s, c.panel, c.border, s);
      ctx.fillStyle = c.text; ctx.font = `900 ${14 * s}px Inter,Segoe UI,system-ui,sans-serif`;
      ctx.fillText(v[0], x + 10 * s, fy + 16 * s);
      ctx.fillStyle = c.muted; ctx.font = `800 ${8 * s}px Inter,Segoe UI,system-ui,sans-serif`;
      ctx.fillText(v[1], x + 10 * s, fy + 31 * s);
    });
  }

  if (hasActions) {
    const actionX = hasHealth ? pad + healthW + gap : pad;
    const actionW = Math.max(40 * s, w - pad - actionX);
    const bw = Math.max(20 * s, (actionW - (actionItems.length - 1) * gap) / actionItems.length);

    actionItems.forEach((b, i) => {
      const x = actionX + i * (bw + gap);
      const hot = node._dsHwHover === b[0];
      const pressed = node._dsHwPressed === b[0];
      rr(ctx, x, fy, bw, fh, 8 * s, pressed ? c.accent : hot ? c.btnHover : c.btn, c.border, s);
      ctx.fillStyle = pressed ? c.bg : hot ? c.accent : c.text;
      ctx.font = `800 ${11 * s}px Inter,Segoe UI,system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(b[1], x + bw / 2, fy + fh / 2);
      ctx.textAlign = "left";
      node._dsHwHit.push({ key: b[0], x, y: fy, w: bw, h: fh });
    });
  }

  ctx.restore();
}

function paintCompact(node, ctx) {
  const s = Number(node.properties?.scale) || 1.0;
  const compactH = getCompactH(node);
  const w = Math.max(Math.round(240 * s), Number(node.size?.[0]) || Math.round(BASE_W * s));
  const h = compactH;
  const c = palette();
  const disp = getDisplayConfig(node);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();

  rr(ctx, 0, 0, w, h, 7 * s, c.bg, c.border, 1);
  node._dsHwHit = [];

  const barElements = [];
  if (disp.cpu) {
    barElements.push({
      key: "cpu", label: "CPU", val: node._dsHw?.cpu || 0,
      textVal: `${Math.round(node._dsHw?.cpu || 0)}%`
    });
  }
  if (disp.ram) {
    const rUsed = node._dsHw?.ramUsed != null ? fmt(node._dsHw.ramUsed, 1) : "—";
    const rTotal = node._dsHw?.ramTotal != null ? fmt(node._dsHw.ramTotal, 0) : "—";
    barElements.push({
      key: "ram", label: "RAM", val: node._dsHw?.ram || 0,
      textVal: `${rUsed}/${rTotal}G`
    });
  }
  if (disp.gpu) {
    barElements.push({
      key: "gpu", label: "GPU", val: node._dsHw?.gpu || 0,
      textVal: `${Math.round(node._dsHw?.gpu || 0)}%`
    });
  }
  if (disp.vram) {
    const vUsed = node._dsHw?.vramUsed != null ? fmt(node._dsHw.vramUsed, 1) : "—";
    const vTotal = node._dsHw?.vramTotal != null ? fmt(node._dsHw.vramTotal, 0) : "—";
    barElements.push({
      key: "vram", label: "VRAM", val: node._dsHw?.vram || 0,
      textVal: `${vUsed}/${vTotal}G`
    });
  }

  const statElements = [];
  if (disp.cpu_fan) {
    if (node._dsHw?.cpuFanSupported && node._dsHw?.cpuFanVal) {
      statElements.push({ label: "CPU FAN", val: `${node._dsHw.cpuFanVal} RPM`, supported: true });
    } else {
      statElements.push({ label: "CPU FAN", val: "Fan monitor not supported on your PC", supported: false });
    }
  }
  if (disp.gpu_fan) {
    if (node._dsHw?.gpuFanSupported && node._dsHw?.gpuFanVal) {
      const valStr = node._dsHw.gpuFanVal > 100 ? `${Math.round(node._dsHw.gpuFanVal)} RPM` : `${Math.round(node._dsHw.gpuFanVal)}%`;
      statElements.push({ label: "GPU FAN", val: valStr, supported: true });
    } else {
      statElements.push({ label: "GPU FAN", val: "Fan monitor not supported on your PC", supported: false });
    }
  }
  if (disp.temperature) statElements.push({ label: "TEMP", val: node._dsHw?.temp || "—", supported: true });
  if (disp.power) statElements.push({ label: "POWER", val: node._dsHw?.power || "—", supported: true });
  if (disp.peak) statElements.push({ label: "PEAK", val: node._dsHw?.peak || "—", supported: true });

  const btnElements = [];
  if (disp.free_vram) {
    btnElements.push({ key: "free", label: "Free VRAM" });
  }
  if (disp.unload_model) {
    btnElements.push({ key: "unload", label: "Unload Model" });
  }

  const padX = Math.round(12 * s);
  const sepW = Math.round(14 * s);
  let fixedWidthTotal = 0;

  statElements.forEach(item => {
    ctx.font = `bold ${Math.round(10.5 * s)}px Inter,Segoe UI,sans-serif`;
    const lblW = ctx.measureText(item.label).width;
    ctx.font = item.supported ? `800 ${Math.round(12 * s)}px Inter,Segoe UI,sans-serif` : `italic ${Math.round(9.5 * s)}px Inter,Segoe UI,sans-serif`;
    const valW = ctx.measureText(item.val).width;
    item._w = Math.round(lblW + valW + 10 * s);
    fixedWidthTotal += item._w;
  });

  btnElements.forEach(btn => {
    ctx.font = `800 ${Math.round(11.5 * s)}px Inter,Segoe UI,sans-serif`;
    const tw = ctx.measureText(btn.label).width;
    btn._w = Math.round(tw + 20 * s);
    fixedWidthTotal += btn._w;
  });

  let barPrefixTotal = 0;
  barElements.forEach(bar => {
    ctx.font = `800 ${Math.round(10.5 * s)}px Inter,Segoe UI,sans-serif`;
    const lw = ctx.measureText(bar.label).width;
    ctx.font = `750 ${Math.round(11.5 * s)}px Inter,Segoe UI,sans-serif`;
    const vw = ctx.measureText(bar.textVal).width;
    bar._prefixW = Math.round(lw + vw + 10 * s);
    barPrefixTotal += bar._prefixW;
  });

  const totalSections = barElements.length + statElements.length + btnElements.length;
  const totalSeparators = Math.max(0, totalSections - 1);
  const availW = Math.max(40 * s, w - 2 * padX - (totalSeparators * sepW));
  const remainingForBars = Math.max(0, availW - fixedWidthTotal - barPrefixTotal);

  let barTrackW = Math.round(36 * s);
  if (barElements.length > 0) {
    barTrackW = Math.max(Math.round(24 * s), Math.floor(remainingForBars / barElements.length));
  }

  let curX = padX;
  const midY = Math.round(h / 2);

  // Draw Bars (dynamically stretched)
  barElements.forEach((bar, i) => {
    const lv = level(bar.val);
    const isWarn = lv === "warning", isCrit = lv === "critical";
    const barColor = isCrit ? c.danger : isWarn ? c.warning : c.accent;

    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(10.5 * s)}px Inter,Segoe UI,sans-serif`;
    ctx.fillStyle = c.muted;
    ctx.fillText(bar.label, curX, midY);

    const lw = ctx.measureText(bar.label).width;
    ctx.font = `750 ${Math.round(11.5 * s)}px Inter,Segoe UI,sans-serif`;
    ctx.fillStyle = isCrit ? c.danger : isWarn ? c.warning : c.text;
    ctx.fillText(bar.textVal, curX + lw + Math.round(4 * s), midY);

    const tx = curX + bar._prefixW;
    const th = Math.round(8 * s);
    const ty = Math.round(midY - th / 2);
    const tw = barTrackW;

    rr(ctx, tx, ty, tw, th, th / 2, c.panel2);
    if (bar.val > 0) {
      const fillW = Math.max(2 * s, tw * clamp(bar.val) / 100);
      rr(ctx, tx, ty, fillW, th, th / 2, barColor);
    }

    curX += bar._prefixW + barTrackW;

    if (i < barElements.length - 1 || statElements.length > 0 || btnElements.length > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(curX + sepW / 2, midY - Math.round(10 * s));
      ctx.lineTo(curX + sepW / 2, midY + Math.round(10 * s));
      ctx.stroke();
      curX += sepW;
    }
  });

  // Draw Stats
  statElements.forEach((stat, i) => {
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(10.5 * s)}px Inter,Segoe UI,sans-serif`;
    ctx.fillStyle = c.muted;
    ctx.fillText(stat.label, curX, midY);

    const lw = ctx.measureText(stat.label).width;
    if (stat.supported) {
      ctx.font = `800 ${Math.round(12 * s)}px Inter,Segoe UI,sans-serif`;
      ctx.fillStyle = c.text;
      ctx.fillText(stat.val, curX + lw + Math.round(5 * s), midY);
    } else {
      ctx.font = `italic ${Math.round(9.5 * s)}px Inter,Segoe UI,sans-serif`;
      ctx.fillStyle = "rgba(142, 150, 163, 0.7)";
      ctx.fillText(stat.val, curX + lw + Math.round(5 * s), midY);
    }

    curX += stat._w;

    if (i < statElements.length - 1 || btnElements.length > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(curX + sepW / 2, midY - Math.round(10 * s));
      ctx.lineTo(curX + sepW / 2, midY + Math.round(10 * s));
      ctx.stroke();
      curX += sepW;
    }
  });

  // Draw Buttons
  btnElements.forEach(btn => {
    const bw = btn._w;
    const bh = Math.round(28 * s);
    const by = Math.round(midY - bh / 2);
    const hot = node._dsHwHover === btn.key;
    const pressed = node._dsHwPressed === btn.key;

    rr(ctx, curX, by, bw, bh, 5 * s, pressed ? c.accent : hot ? c.btnHover : c.panel2, hot ? c.accent : c.border, 1);
    ctx.fillStyle = pressed ? c.bg : hot ? c.accent : c.text;
    ctx.font = `800 ${Math.round(11.5 * s)}px Inter,Segoe UI,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, curX + bw / 2, midY);
    ctx.textAlign = "left";

    node._dsHwHit.push({ key: btn.key, x: curX, y: by, w: bw, h: bh });
    curX += bw + sepW;
  });

  ctx.restore();
}

function paint(node, ctx) {
  if (node.properties?.compact_mode) {
    paintCompact(node, ctx);
  } else {
    paintNormal(node, ctx);
  }
}

function setHover(node,pos) {
  const r=hitButton(node,pos); const key=r?.key || null;
  if(key!==node._dsHwHover){node._dsHwHover=key;node.setDirtyCanvas?.(true,false);}
}

async function action(node,name) {
  log("Action requested:",name,node.id);
  node._dsHwAction=name;
  node.setDirtyCanvas?.(true,false);
  try {
    if(name==="refresh") {
      await fetchStats(node,true);
    } else {
      const r=await fetch("/ds/hardware_monitor/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:name})});
      const data=await r.json().catch(()=>({}));
      log("Action response:",name,r.status,data);
      if(!r.ok) warn("Action failed:",name,data?.error||r.statusText);
      else setTimeout(()=>fetchStats(node,true),150);
    }
  } catch(e) { err("Action error",name,e); }
  setTimeout(()=>{ if(node._dsHwAction===name){node._dsHwAction=null;node._dsHwPressed=null;node.setDirtyCanvas?.(true,false);} }, name==="refresh"?300:900);
}

async function fetchStats(node,verbose=false) {
  try {
    const r=await fetch("/ds/hardware_monitor/stats",{cache:"no-store"});
    if(!r.ok){warn("Stats HTTP",r.status);return;}
    const d=await r.json();applyData(node,d);if(verbose)log("Stats:",d);
  } catch(e){err("Stats fetch error",e);}
}

function applyData(node, d) {
  if (!d) return;
  node._dsHw = node._dsHw || {};
  const total = Number(d.vram_total_gb) || 0, used = Number(d.vram_used_gb) || 0;
  const ramTotal = Number(d.ram_total_gb) || 0, ramUsed = Number(d.ram_used_gb) || 0;

  // Capability-aware fan speed resolution
  let cpuFanText = "Fan monitor not supported on your PC";
  let cpuFanVal = null;
  if (d.cpu_fan_supported && d.cpu_fan != null) {
    cpuFanVal = d.cpu_fan;
    cpuFanText = `${d.cpu_fan} RPM`;
  }

  let gpuFanText = "Fan monitor not supported on your PC";
  let gpuFanVal = null;
  if (d.gpu_fan_supported && d.gpu_fan != null) {
    gpuFanVal = d.gpu_fan;
    gpuFanText = d.gpu_fan > 100 ? `${Math.round(d.gpu_fan)} RPM` : `${Math.round(d.gpu_fan)}%`;
  }

  Object.assign(node._dsHw, {
    cpu: clamp(d.cpu),
    ram: clamp(d.ram),
    ramUsed: ramUsed,
    ramTotal: ramTotal,
    gpu: clamp(d.gpu),
    vram: total ? clamp(used / total * 100) : 0,
    vramUsed: used,
    vramTotal: total,
    vramFree: Number(d.vram_free_gb) || 0,
    device: d.gpu_name || "GPU telemetry unavailable",
    cpuSub: `${fmt(d.cpu)}% utilization`,
    ramSub: `${fmt(ramUsed)} / ${fmt(ramTotal)} GB`,
    gpuSub: d.gpu_available
      ? `${d.gpu_vendor || "GPU"} · ${d.gpu_temp != null ? Math.round(d.gpu_temp) + "°C" : "—"} · ${d.gpu_power != null ? fmt(d.gpu_power, 0) + " W" : "—"}`
      : "GPU telemetry unavailable",
    vramSub: total ? `${fmt(used)} / ${fmt(total)} GB used` : `VRAM unavailable`,
    temp: d.gpu_temp != null ? `${Math.round(d.gpu_temp)}°` : "—",
    power: d.gpu_power != null ? `${fmt(d.gpu_power, 0)}W` : "—",
    peak: d.peak_vram_gb != null ? `${fmt(d.peak_vram_gb)}GB` : "—",
    freeVram: d.vram_free_gb != null ? `${fmt(d.vram_free_gb)}GB` : "—",
    cpuFan: cpuFanText,
    cpuFanVal: cpuFanVal,
    cpuFanSupported: Boolean(d.cpu_fan_supported),
    gpuFan: gpuFanText,
    gpuFanVal: gpuFanVal,
    gpuFanSupported: Boolean(d.gpu_fan_supported),
  });

  if (isVue()) updateVue(node);
  else node.setDirtyCanvas?.(true, false);
}

// ---------------------------------------------------------------------------
// Dedicated Deathshot Hardware Monitor Settings Popover
// ---------------------------------------------------------------------------
let activeHwSettingsPopover = null;

function closeHwSettingsPopover() {
  if (activeHwSettingsPopover) {
    activeHwSettingsPopover.remove();
    activeHwSettingsPopover = null;
  }
}

function openHwSettingsPopover(node, anchorEl) {
  closeHwSettingsPopover();
  if (!node) return;

  const popover = document.createElement("div");
  popover.className = "ds-hw-settings-popover";
  popover.addEventListener("pointerdown", e => e.stopPropagation());
  popover.addEventListener("mousedown", e => e.stopPropagation());
  popover.addEventListener("click", e => e.stopPropagation());

  const disp = getDisplayConfig(node);

  const render = () => {
    popover.innerHTML = "";

    // 1. Header
    const head = document.createElement("div");
    head.className = "ds-hw-popover-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-hw-popover-title-wrap";
    titleWrap.innerHTML = `
      <span class="ds-hw-popover-badge">DS</span>
      <div>
        <strong class="ds-hw-popover-title">DS Hardware Monitor</strong>
        <small class="ds-hw-popover-subtitle">Display & Visibility Controls</small>
      </div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ds-hw-popover-close";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", closeHwSettingsPopover);

    head.appendChild(titleWrap);
    head.appendChild(closeBtn);
    popover.appendChild(head);

    // 2. Mode Section: Compact Mode & Scale Slider
    const modeSection = document.createElement("div");
    modeSection.className = "ds-hw-popover-mode-section";

    // Compact Mode Toggle Row (switch aligned to the far right)
    const modeRow = document.createElement("div");
    const isCompact = Boolean(node.properties.compact_mode);
    modeRow.className = `ds-hw-toggle-row ds-hw-mode-row ${isCompact ? "is-on" : ""}`;

    modeRow.innerHTML = `
      <div class="ds-hw-toggle-info">
        <strong>Compact Mode</strong>
        <small>Horizontal status strip layout</small>
      </div>
      <span class="ds-hw-switch"><span class="ds-hw-switch-thumb"></span></span>
    `;

    modeRow.addEventListener("click", e => {
      e.stopPropagation();
      node.properties.compact_mode = !node.properties.compact_mode;
      syncNodeDimensions(node);
      render();
    });
    modeSection.appendChild(modeRow);

    // Uniform Scale Slider Row
    const scale = Number(node.properties.scale) || 1.0;
    const scaleBox = document.createElement("div");
    scaleBox.className = "ds-hw-scale-box";
    scaleBox.innerHTML = `
      <div class="ds-hw-scale-header">
        <div class="ds-hw-toggle-info">
          <strong>Node Scale</strong>
          <small>Resize node and text proportionally</small>
        </div>
        <span class="ds-hw-scale-val">${Math.round(scale * 100)}%</span>
      </div>
      <div class="ds-hw-scale-slider-row">
        <button type="button" class="ds-hw-scale-step-btn" data-step="-0.05" title="Decrease scale">−</button>
        <input type="range" class="ds-hw-scale-range" min="0.7" max="2.2" step="0.05" value="${scale}">
        <button type="button" class="ds-hw-scale-step-btn" data-step="0.05" title="Increase scale">+</button>
        <div class="ds-hw-scale-presets">
          <button type="button" class="ds-hw-scale-preset ${Math.abs(scale - 0.8) < 0.04 ? "is-active" : ""}" data-scale="0.8">0.8x</button>
          <button type="button" class="ds-hw-scale-preset ${Math.abs(scale - 1.0) < 0.04 ? "is-active" : ""}" data-scale="1.0">1.0x</button>
          <button type="button" class="ds-hw-scale-preset ${Math.abs(scale - 1.2) < 0.04 ? "is-active" : ""}" data-scale="1.2">1.2x</button>
          <button type="button" class="ds-hw-scale-preset ${Math.abs(scale - 1.5) < 0.04 ? "is-active" : ""}" data-scale="1.5">1.5x</button>
        </div>
      </div>
    `;

    const slider = scaleBox.querySelector(".ds-hw-scale-range");
    const valLabel = scaleBox.querySelector(".ds-hw-scale-val");

    const updateSliderFill = (inputEl, val) => {
      const min = Number(inputEl.min) || 0.7;
      const max = Number(inputEl.max) || 2.2;
      const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
      inputEl.style.setProperty("--ds-slider-pct", `${pct}%`);
    };

    updateSliderFill(slider, scale);

    slider.addEventListener("input", e => {
      const v = Number(Number(e.target.value).toFixed(2));
      node.properties.scale = v;
      valLabel.textContent = `${Math.round(v * 100)}%`;
      updateSliderFill(slider, v);
      syncNodeDimensions(node);
    });
    slider.addEventListener("change", () => {
      render();
    });

    scaleBox.querySelectorAll(".ds-hw-scale-step-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const delta = Number(btn.dataset.step);
        const cur = Number(node.properties.scale) || 1.0;
        const v = Math.max(0.7, Math.min(2.2, Number((cur + delta).toFixed(2))));
        node.properties.scale = v;
        slider.value = v;
        valLabel.textContent = `${Math.round(v * 100)}%`;
        updateSliderFill(slider, v);
        syncNodeDimensions(node);
        render();
      });
    });

    scaleBox.querySelectorAll(".ds-hw-scale-preset").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        node.properties.scale = Number(btn.dataset.scale);
        syncNodeDimensions(node);
        render();
      });
    });

    modeSection.appendChild(scaleBox);
    popover.appendChild(modeSection);

    // 3. Section Label: DISPLAY METRICS
    const secLabel = document.createElement("div");
    secLabel.className = "ds-hw-popover-sec-label";
    secLabel.textContent = "DISPLAY METRICS";
    popover.appendChild(secLabel);

    // 4. Metrics Chips Grid (3 Columns)
    const grid = document.createElement("div");
    grid.className = "ds-hw-chips-grid";

    ALL_ELEMENTS.forEach(item => {
      const active = Boolean(disp[item.id]);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `ds-hw-chip ${active ? "is-active" : ""}`;
      chip.innerHTML = `
        <span class="ds-hw-chip-check">${active ? "✓" : ""}</span>
        <span class="ds-hw-chip-label">${item.label}</span>
      `;

      chip.addEventListener("click", e => {
        e.stopPropagation();
        disp[item.id] = !disp[item.id];
        node.setDirtyCanvas?.(true, true);
        if (node.graph) node.graph.change?.();
        if (isVue()) updateVue(node);
        render();
      });

      grid.appendChild(chip);
    });
    popover.appendChild(grid);

    // 5. Footer Quick Actions
    const foot = document.createElement("div");
    foot.className = "ds-hw-popover-footer";

    const showAllBtn = document.createElement("button");
    showAllBtn.type = "button";
    showAllBtn.className = "ds-hw-btn-ghost";
    showAllBtn.textContent = "Show All";
    showAllBtn.addEventListener("click", () => {
      ALL_ELEMENTS.forEach(item => { disp[item.id] = true; });
      node.setDirtyCanvas?.(true, true);
      if (node.graph) node.graph.change?.();
      if (isVue()) updateVue(node);
      render();
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ds-hw-btn-ghost";
    resetBtn.textContent = "Reset Defaults";
    resetBtn.addEventListener("click", () => {
      Object.assign(disp, DEFAULT_DISPLAY);
      node.properties.compact_mode = false;
      node.properties.scale = 1.0;
      syncNodeDimensions(node);
      render();
    });

    foot.appendChild(showAllBtn);
    foot.appendChild(resetBtn);
    popover.appendChild(foot);
  };

  render();
  document.body.appendChild(popover);
  activeHwSettingsPopover = popover;

  const pw = 360;
  if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    if (left < 16) left = 16;
    let top = rect.bottom + 6;
    if (top + 420 > window.innerHeight - 16) {
      top = Math.max(16, rect.top - 430);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  } else {
    const canvas = app?.canvas;
    if (canvas && node.pos) {
      const screenPos = canvas.ds ? canvas.ds.toScreen(node.pos[0], node.pos[1]) : [node.pos[0], node.pos[1]];
      let left = Math.round(screenPos[0] + (node.size[0] || BASE_W) / 2 - pw / 2);
      let top = Math.round(screenPos[1] - 20);
      left = Math.max(16, Math.min(window.innerWidth - pw - 16, left));
      top = Math.max(16, Math.min(window.innerHeight - 440, top));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    } else {
      popover.style.left = `${Math.round(window.innerWidth / 2 - pw / 2)}px`;
      popover.style.top = `${Math.round(window.innerHeight / 2 - 200)}px`;
    }
  }

  const onOutsideClick = e => {
    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeHwSettingsPopover();
      document.removeEventListener("pointerdown", onOutsideClick, true);
    }
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutsideClick, true);
  }, 10);
}

function registerGearMenu() {
  if (window.DSGearMenu?.register) {
    window.DSGearMenu.register(NODE_NAME, {
      tooltip: "DS Hardware Monitor Settings",
      onClick: (node, canvas, event) => {
        openHwSettingsPopover(node, event?.currentTarget || event?.target);
      },
    });
  }
}

function syncNodeDimensions(node) {
  const s = Number(node.properties?.scale) || 1.0;
  const isCompact = Boolean(node.properties?.compact_mode);
  const compactH = getCompactH(node);

  if (isCompact) {
    if (!node._dsNormalSize && Array.isArray(node.size) && node.size[1] > 70) {
      node._dsNormalSize = [node.size[0], node.size[1]];
    }
    const currentW = Math.max(Math.round(260 * s), Number(node.size?.[0]) || Math.round(BASE_W * s));
    node.size = [currentW, compactH];
    node.min_size = [Math.round(240 * s), compactH];
  } else {
    node.size = [Math.round(BASE_W * s), Math.round(BASE_H * s)];
    node.min_size = [Math.round(BASE_W * MIN_S), Math.round(BASE_H * MIN_S)];
    syncScale(node);
  }
  if (isVue()) {
    updateVueFaceMode(node);
  }
  node.setDirtyCanvas?.(true, true);
  if (node.graph) {
    node.graph.change?.();
  }
}

function makeVueFace(node) {
  if (node._dsHwRoot) return;
  const root = document.createElement("div");
  root.className = "ds-hw-root";
  root.dataset.dsThemed = "true";
  if (node.properties?.compact_mode) root.classList.add("is-compact");

  root.innerHTML = `
    <div class="ds-hw-top">
      <div class="ds-hw-live"><i></i><span>LIVE</span></div>
      <div class="ds-hw-gpuname" data-el="device">Detecting GPU…</div>
    </div>
    <div class="ds-hw-metrics">
      <section class="ds-hw-metric" data-card="cpu">
        <div class="ds-hw-label">${ICONS.cpu}<span>CPU</span><b data-el="cpu">—</b></div>
        <div class="ds-hw-track"><i data-bar="cpu"></i></div>
        <small data-el="cpuSub">Waiting for telemetry</small>
      </section>
      <section class="ds-hw-metric" data-card="ram">
        <div class="ds-hw-label">${ICONS.ram}<span>RAM</span><b data-el="ram">—</b></div>
        <div class="ds-hw-track"><i data-bar="ram"></i></div>
        <small data-el="ramSub">Waiting for telemetry</small>
      </section>
      <section class="ds-hw-metric" data-card="gpu">
        <div class="ds-hw-label">${ICONS.gpu}<span>GPU LOAD</span><b data-el="gpu">—</b></div>
        <div class="ds-hw-track"><i data-bar="gpu"></i></div>
        <small data-el="gpuSub">Detecting GPU…</small>
      </section>
      <section class="ds-hw-metric" data-card="vram">
        <div class="ds-hw-label">${ICONS.vram}<span>VRAM</span><b data-el="vram">—</b></div>
        <div class="ds-hw-track"><i data-bar="vram"></i></div>
        <small data-el="vramSub">Detecting VRAM…</small>
      </section>
    </div>
    <div class="ds-hw-footer">
      <div class="ds-hw-health">
        <span data-card="temp"><b data-el="temp">—</b><em>TEMP</em></span>
        <span data-card="power"><b data-el="power">—</b><em>POWER</em></span>
        <span data-card="peak"><b data-el="peak">—</b><em>PEAK</em></span>
      </div>
      <div class="ds-hw-actions">
        <button data-action="free">${ICONS.bolt}<span>Free VRAM</span></button>
        <button data-action="unload">${ICONS.eject}<span>Unload models</span></button>
        <button class="ds-hw-icon" data-action="refresh">${ICONS.refresh}</button>
      </div>
    </div>
  `;

  const els = Object.fromEntries([...root.querySelectorAll("[data-el]")].map(e => [e.dataset.el, e]));
  const bars = Object.fromEntries([...root.querySelectorAll("[data-bar]")].map(e => [e.dataset.bar, e]));
  const cards = Object.fromEntries([...root.querySelectorAll("[data-card]")].map(e => [e.dataset.card, e]));
  const widget = node.addDOMWidget("ds_hardware_monitor_ui", "hardware_monitor", root, {
    serialize: false,
    hideOnZoom: false,
    getHeight: () => node.properties?.compact_mode ? getCompactH(node) : Math.max(1, Math.round((node.size?.[0] || BASE_W) * BASE_H / BASE_W)),
    getMinHeight: () => node.properties?.compact_mode ? getCompactH(node) : Math.round(BASE_H * MIN_S)
  });
  widget.computeLayoutSize = () => ({
    minHeight: node.properties?.compact_mode ? getCompactH(node) : Math.round(BASE_H * MIN_S),
    minWidth: Math.round(BASE_W * MIN_S)
  });

  node._dsHwRoot = root;
  node._dsHwWidget = widget;
  node._dsHwEls = { els, bars, cards };
  node._dsHwThemeOff = window.DSGlobalTheme?.bindNode?.(root, node) || null;

  root.querySelectorAll("[data-action]").forEach(btn =>
    btn.addEventListener("click", e => {
      e.stopPropagation();
      action(node, btn.dataset.action === "free" ? "free_vram" : btn.dataset.action === "unload" ? "unload_models" : "refresh");
    })
  );
  log("Nodes 2.0 face created", node.id);
}

function updateVueFaceMode(node) {
  if (!node._dsHwRoot) return;
  const isCompact = Boolean(node.properties?.compact_mode);
  node._dsHwRoot.classList.toggle("is-compact", isCompact);
}

function updateVue(node) {
  const x = node._dsHwEls;
  if (!x || !node._dsHw) return;
  const disp = getDisplayConfig(node);

  updateVueFaceMode(node);

  for (const k of ["cpu", "ram", "gpu", "vram"]) {
    const visible = Boolean(disp[k]);
    if (x.cards[k]) x.cards[k].style.display = visible ? "" : "none";
    if (visible && x.bars[k] && x.els[k]) {
      const v = clamp(node._dsHw[k]);
      x.bars[k].style.width = `${v}%`;
      x.cards[k].dataset.level = level(v);
      x.els[k].textContent = `${Math.round(v)}%`;
    }
  }

  for (const k of ["device", "cpuSub", "ramSub", "gpuSub", "vramSub", "temp", "power", "peak"]) {
    if (x.els[k]) x.els[k].textContent = node._dsHw[k] ?? "—";
  }

  if (x.cards["temp"]) x.cards["temp"].style.display = disp.temperature ? "" : "none";
  if (x.cards["power"]) x.cards["power"].style.display = disp.power ? "" : "none";
  if (x.cards["peak"]) x.cards["peak"].style.display = disp.peak ? "" : "none";

  const freeBtn = node._dsHwRoot?.querySelector('[data-action="free"]');
  if (freeBtn) freeBtn.style.display = disp.free_vram ? "" : "none";
  const unloadBtn = node._dsHwRoot?.querySelector('[data-action="unload"]');
  if (unloadBtn) unloadBtn.style.display = disp.unload_model ? "" : "none";
}

function removeVueFace(node) {
  try {
    node._dsHwThemeOff?.();
    node._dsHwWidget?.onRemove?.();
  } catch (e) { warn("Vue face cleanup", e); }
  if (Array.isArray(node.widgets)) {
    const i = node.widgets.indexOf(node._dsHwWidget);
    if (i >= 0) node.widgets.splice(i, 1);
  }
  try {
    node._dsHwRoot?.closest?.(".dom-widget")?.remove();
    node._dsHwRoot?.remove();
  } catch (_) {}
  node._dsHwThemeOff = null;
  node._dsHwRoot = null;
  node._dsHwWidget = null;
  node._dsHwEls = null;
}

function applyResizeAspect(node) {
  const sNode = Number(node.properties?.scale) || 1.0;
  const compactH = getCompactH(node);
  if (node.properties?.compact_mode) {
    node.size[1] = compactH;
    node.size[0] = Math.max(Math.round(240 * sNode), Number(node.size?.[0]) || Math.round(240 * sNode));
    return;
  }
  const proposedW = Math.max(1, Number(node.size?.[0]) || BASE_W);
  const proposedH = Math.max(1, Number(node.size?.[1]) || BASE_H);
  const s = Math.max(MIN_S, Math.min(MAX_S, Math.max(proposedW / BASE_W, proposedH / BASE_H)));
  const w = Math.round(BASE_W * s), h = Math.round(BASE_H * s);
  node._dsHwScale = s;
  node.properties.scale = Number(s.toFixed(2));
  if (Math.abs(proposedW - w) > 0.5) node.size[0] = w;
  if (Math.abs(proposedH - h) > 0.5) node.size[1] = h;
}

function syncScale(node) {
  if (node.properties?.compact_mode) return;
  const h = Number(node.size?.[1]) || BASE_H;
  node._dsHwScale = Math.max(MIN_S, Math.min(MAX_S, h / BASE_H));
}

app.registerExtension({
  name: "DeathshotArsenal.HardwareMonitor",
  init() {
    registerGearMenu();
  },
  setup() {
    installBodyHook();
    registerGearMenu();
    log("Extension setup");
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    registerGearMenu();

    const LG = window.LiteGraph || {};
    nodeType.title_mode = LG.NO_TITLE != null ? LG.NO_TITLE : 1;
    if (nodeType.prototype._dsHwPatched) return;
    nodeType.prototype._dsHwPatched = true;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldResize = nodeType.prototype.onResize;
    const oldMouseDown = nodeType.prototype.onMouseDown;
    const oldMouseMove = nodeType.prototype.onMouseMove;
    const oldMouseUp = nodeType.prototype.onMouseUp;
    const oldRemoved = nodeType.prototype.onRemoved;
    const oldGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;

    nodeType.prototype.onNodeCreated = function() {
      oldCreated?.apply(this, arguments);
      this.flags = this.flags || {};
      this.flags.no_title = true;
      this.badges = [];
      this.title = "";
      this.resizable = true;

      getDisplayConfig(this);
      const s = Number(this.properties.scale) || 1.0;
      const compactH = getCompactH(this);
      if (this.properties.compact_mode) {
        this.size = [Math.max(Math.round(260 * s), Number(this.size?.[0]) || Math.round(BASE_W * s)), compactH];
        this.min_size = [Math.round(240 * s), compactH];
      } else {
        if (!Array.isArray(this.size) || this.size[0] < 1 || this.size[1] < 1) this.size = [Math.round(BASE_W * s), Math.round(BASE_H * s)];
        this.min_size = [Math.round(BASE_W * MIN_S), Math.round(BASE_H * MIN_S)];
      }

      this._dsHw = this._dsHw || {};
      this._dsHwScale = 1;
      this._dsHwHover = null;
      this._dsHwPressed = null;

      if (isVue()) makeVueFace(this);
      fetchStats(this);
      log("Node created", this.id, "size", this.size);
    };

    nodeType.prototype.onConfigure = function() {
      const r = oldConfigure?.apply(this, arguments);
      this.flags = this.flags || {};
      this.flags.no_title = true;
      this.badges = [];
      this.title = "";
      this.resizable = true;

      getDisplayConfig(this);
      const s = Number(this.properties.scale) || 1.0;
      const compactH = getCompactH(this);
      if (this.properties.compact_mode) {
        this.size = [Math.max(Math.round(240 * s), Number(this.size?.[0]) || Math.round(BASE_W * s)), compactH];
        this.min_size = [Math.round(240 * s), compactH];
      } else {
        this.min_size = [Math.round(BASE_W * MIN_S), Math.round(BASE_H * MIN_S)];
        syncScale(this);
      }

      if (isVue()) makeVueFace(this);
      fetchStats(this);
      log("Node configured", this.id, "size", this.size);
      return r;
    };

    nodeType.prototype.onResize = function(size) {
      const s = Number(this.properties?.scale) || 1.0;
      const compactH = getCompactH(this);
      if (this.properties?.compact_mode) {
        this.size[1] = compactH;
        this.size[0] = Math.max(Math.round(240 * s), Number(size?.[0]) || this.size[0]);
        this.setDirtyCanvas?.(true, false);
        return;
      }
      if (!isVue() && !graphLoading()) applyResizeAspect(this);
      const r = oldResize?.apply(this, arguments);
      this._dsHwScale = Math.max(MIN_S, Math.min(MAX_S, (Number(this.size?.[1]) || BASE_H) / BASE_H));
      this.properties.scale = Number(this._dsHwScale.toFixed(2));
      this.setDirtyCanvas?.(true, false);
      return r;
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
      if (!ctx || isVue() || this.flags?.collapsed) return;
      if (this.properties?.compact_mode) {
        this.size[1] = getCompactH(this);
      } else {
        if (!graphLoading() && app.canvas?.resizing_node === this) applyResizeAspect(this);
        else if (!graphLoading()) syncScale(this);
      }
      try { paint(this, ctx); } catch (e) { err("Canvas paint error", e); }
    };

    nodeType.prototype.onMouseDown = function(e, pos) {
      if (!isVue() && pos) {
        const hit = hitButton(this, pos);
        if (hit) {
          this._dsHwPressed = hit.key;
          this._dsHwHover = hit.key;
          this.setDirtyCanvas?.(true, false);
          action(this, hit.key === "free" ? "free_vram" : hit.key === "unload" ? "unload_models" : "refresh");
          return true;
        }
      }
      return oldMouseDown ? oldMouseDown.apply(this, arguments) : false;
    };

    nodeType.prototype.onMouseMove = function(e, pos) {
      if (!isVue() && pos) setHover(this, pos);
      return oldMouseMove ? oldMouseMove.apply(this, arguments) : false;
    };

    nodeType.prototype.onMouseUp = function(e, pos) {
      if (!isVue()) {
        this._dsHwPressed = null;
        if (pos) setHover(this, pos);
        else { this._dsHwHover = null; this.setDirtyCanvas?.(true, false); }
      }
      return oldMouseUp ? oldMouseUp.apply(this, arguments) : false;
    };

    nodeType.prototype.onDblClick = function() {
      openHwSettingsPopover(this);
      return true;
    };

    nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
      oldGetExtraMenuOptions?.apply(this, arguments);
      options = options || [];
      const isCompact = Boolean(this.properties?.compact_mode);
      options.push(
        null,
        {
          content: "⚙ Hardware Monitor Settings...",
          callback: () => {
            openHwSettingsPopover(this);
          },
        },
        {
          content: (isCompact ? "✓ " : "○ ") + "Compact Mode",
          callback: () => {
            this.properties.compact_mode = !this.properties.compact_mode;
            syncNodeDimensions(this);
          },
        },
        null
      );
    };

    nodeType.prototype.onRemoved = function() {
      closeHwSettingsPopover();
      removeVueFace(this);
      try { this._dsHwThemeOff?.(); } catch (_) {}
      return oldRemoved?.apply(this, arguments);
    };
  },
  nodeCreated(node) {
    if (node.type !== NODE_NAME && node.comfyClass !== NODE_NAME) return;
    registerGearMenu();
    node.flags = node.flags || {};
    node.flags.no_title = true;
    node.badges = [];
    node.title = "";
    node.resizable = true;

    getDisplayConfig(node);
    const s = Number(node.properties.scale) || 1.0;
    const compactH = getCompactH(node);
    if (node.properties.compact_mode) {
      node.size = [Math.max(Math.round(260 * s), Number(node.size?.[0]) || Math.round(BASE_W * s)), compactH];
      node.min_size = [Math.round(240 * s), compactH];
    } else {
      node.min_size = [Math.round(BASE_W * MIN_S), Math.round(BASE_H * MIN_S)];
    }

    if (!node._dsHwThemeOff && window.DSGlobalTheme?.subscribe) {
      node._dsHwThemeOff = window.DSGlobalTheme.subscribe(() => node.setDirtyCanvas?.(true, false));
    }
    fetchStats(node);
  }
});

setInterval(() => {
  try {
    for (const n of app.graph?._nodes || []) {
      if (n?.type === NODE_NAME || n?.comfyClass === NODE_NAME) fetchStats(n);
    }
  } catch (e) { err("Polling loop error", e); }
}, 1000);
