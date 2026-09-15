import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_LoadImage";
const EXT = "DeathshotArsenal.DSLoadImage.Canvas";
const STATE_WIDGET = "ds_load_image_state";
const STATE_PROP = "ds_load_image_state";
const CSS_ID = "ds-load-image-canvas-css-v2";
const CSS_URL = "/extensions/DeathshotArsenal/Load%20Image/ds_load_image.css?v=canvas2";
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
const RESAMPLES = ["auto", "nearest", "bilinear", "bicubic", "lanczos"];
const MODES = [["off", "Off"], ["max_mp", "Max MP"], ["longest_side", "Longest side"], ["scale_factor", "Scale by x"]];
const PRESETS = { max_mp: [0.25, 0.5, 1, 2, 4, 8], longest_side: [512, 768, 1024, 1280, 1536, 2048], scale_factor: [0.25, 0.5, 1, 2, 3, 4] };
const SNAP_VALUES = [0, 8, 16, 32, 64];
const MIN_W = 470, MIN_H = 660, DEFAULT_W = 520, DEFAULT_H = 720;

const STANDARD_RATIOS = [
  [1, 1],
  [5, 4], [4, 5],
  [4, 3], [3, 4],
  [3, 2], [2, 3],
  [16, 10], [10, 16],
  [5, 3], [3, 5],
  [16, 9], [9, 16],
  [21, 9], [9, 21],
  [2, 1], [1, 2],
  [3, 1], [1, 3],
  [4, 1], [1, 4],
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function gcd(a,b){a=Math.abs(Math.round(a));b=Math.abs(Math.round(b));while(b)[a,b]=[b,a%b];return a||1;}

function approximateFraction(val, maxDenom = 16) {
  let [h0, h1] = [0, 1];
  let [k0, k1] = [1, 0];
  let x = val;
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(x);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDenom) break;
    [h0, h1] = [h1, h2];
    [k0, k1] = [k1, k2];
    const diff = x - a;
    if (Math.abs(diff) < 1e-6) break;
    x = 1 / diff;
  }
  return [h1, k1];
}

function ratioText(w, h) {
  if (!(w > 0 && h > 0)) return "—";
  const val = w / h;

  // 1. Match standard aspect ratios within 3.5% tolerance
  // (handles snap quantization and pixel rounding like 704x1024 -> 2:3, 1365x2048 -> 2:3, 1920x1088 -> 16:9)
  let bestStd = null;
  let bestErr = Infinity;
  for (const [rw, rh] of STANDARD_RATIOS) {
    const target = rw / rh;
    const err = Math.abs(val - target) / target;
    if (err < bestErr) {
      bestErr = err;
      bestStd = `${rw}:${rh}`;
    }
  }
  if (bestErr <= 0.035) {
    return bestStd;
  }

  // 2. Exact integer ratio if small numbers
  const g = gcd(w, h);
  const sw = Math.round(w / g);
  const sh = Math.round(h / g);
  if (sw <= 12 && sh <= 12) {
    return `${sw}:${sh}`;
  }

  // 3. Fallback: continued fraction approximation for custom crops (e.g. 7:10)
  const [num, den] = approximateFraction(val, 16);
  if (den > 0 && Math.abs(val - num / den) / val < 0.04) {
    return `${num}:${den}`;
  }

  return sw <= 32 && sh <= 32 ? `${sw}:${sh}` : (val >= 1 ? `${val.toFixed(2).replace(/\.00$/, "")}:1` : `1:${(1 / val).toFixed(2).replace(/\.00$/, "")}`);
}

function snapDimensions(w, h, divisor) {
  divisor = Math.max(0, Math.round(Number(divisor) || 0));
  if (divisor <= 0) return [Math.round(w), Math.round(h)];
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const rw = Math.max(divisor, Math.round(w / divisor) * divisor);
  const rh = Math.max(divisor, Math.round(h / divisor) * divisor);
  const candidates = [];
  for (const cw of [rw - divisor, rw, rw + divisor]) {
    if (cw < divisor) continue;
    const ch = Math.max(divisor, Math.round((cw * h / w) / divisor) * divisor);
    candidates.push([Math.abs(cw - w) + Math.abs(ch - h), cw, ch]);
  }
  for (const ch of [rh - divisor, rh, rh + divisor]) {
    if (ch < divisor) continue;
    const cw = Math.max(divisor, Math.round((ch * w / h) / divisor) * divisor);
    candidates.push([Math.abs(cw - w) + Math.abs(ch - h), cw, ch]);
  }
  candidates.sort((a, b) => a[0] - b[0]);
  return [candidates[0][1], candidates[0][2]];
}

function basename(p){return String(p||"").replace(/\\/g,"/").split("/").pop()||"";}
function folderOf(p){const s=String(p||"").replace(/\\/g,"/");const i=s.lastIndexOf("/");return i>=0?s.slice(0,i):"";}
function stateOf(node){let raw=node?.properties?.[STATE_PROP];if(typeof raw==="string"){try{raw=JSON.parse(raw)}catch{raw=null}}const s={version:1,mode:"off",max_mp:2,longest_side:1536,scale_factor:2,snap:0,resample:"auto",allow_upscale:true,...(raw&&typeof raw==="object"?raw:{})};if(!MODES.some(x=>x[0]===s.mode))s.mode="off";if(!RESAMPLES.includes(s.resample))s.resample="auto";if(!SNAP_VALUES.includes(Number(s.snap)))s.snap=0;s.max_mp=clamp(Number(s.max_mp)||2,.01,64);s.longest_side=clamp(Math.round(Number(s.longest_side)||1536),8,16384);s.scale_factor=clamp(Number(s.scale_factor)||2,.01,8);s.snap=Number(s.snap);s.allow_upscale=!!s.allow_upscale;return s;}
function persist(node, patch={}){const s={...stateOf(node),...patch,version:1};node.properties??={};node.properties[STATE_PROP]=JSON.stringify(s);const w=node.widgets?.find(x=>x?.name===STATE_WIDGET);if(w)w.value=node.properties[STATE_PROP];return s;}
function imageURL(filename,bust=false){const clean=String(filename||"").replace(/\\/g,"/");const parts=clean.split("/");const fn=parts.pop()||"";const q=new URLSearchParams({filename:fn,type:"input"});if(parts.length)q.set("subfolder",parts.join("/"));if(bust)q.set("t",String(Date.now()));try{return api.apiURL?api.apiURL(`/view?${q}`):`/view?${q}`;}catch{return `/view?${q}`;}}
function inputFiles(node){const vals=node._dsLIImageWidget?.options?.values;return Array.isArray(vals)?vals.filter(v=>IMAGE_EXTS.has(String(v).split(".").pop()?.toLowerCase())).slice():[];}
function targetDims(w,h,s){
  if(!(w>0&&h>0))return [0,0];
  let scale=1;
  if(s.mode==="max_mp")scale=Math.sqrt((s.max_mp*1048576)/(w*h));
  else if(s.mode==="longest_side")scale=s.longest_side/Math.max(w,h);
  else if(s.mode==="scale_factor")scale=s.scale_factor;
  if(!s.allow_upscale)scale=Math.min(scale,1);
  let ow=Math.max(1,Math.round(w*scale)),oh=Math.max(1,Math.round(h*scale));
  if(s.snap){
    [ow, oh] = snapDimensions(ow, oh, s.snap);
  }
  return [Math.min(16384,ow),Math.min(16384,oh)];
}
function log(...a){console.log("[DS Load Image]",...a)}
function warn(...a){console.warn("[DS Load Image]",...a)}

function theme(){
  const src=document.documentElement;
  const cs=getComputedStyle(src);
  const body=getComputedStyle(document.body);
  const global=window.DSGlobalTheme;
  const get=(n,f)=>{
    try{const v=global?.getVar?.(n,"");if(v)return String(v).trim();}catch{}
    return cs.getPropertyValue(n).trim()||body.getPropertyValue(n).trim()||f;
  };
  const font=(global?.getConfig?.()?.font)||body.fontFamily||"Inter";
  return{
    bg:get("--ds-bg","#0b0d12"),
    bg2:get("--ds-panel","#12151c"),
    bg3:get("--ds-panel-2","#21252d"),
    input:get("--ds-input-bg","#0e1016"),
    border:get("--ds-border","#343a44"),
    text:get("--ds-text","#e2e8f0"),
    muted:get("--ds-text-muted","#9ca3af"),
    accent:get("--ds-accent","#67e8f9"),
    hover:get("--ds-hover","#1c2130"),
    active:get("--ds-active",get("--ds-hover","#1c2130")),
    btn:get("--ds-btn-bg",get("--ds-panel-2","#21252d")),
    btnHover:get("--ds-panel-3",get("--ds-btn-hover",get("--ds-hover","#2b303a"))),
    scrollbar:get("--ds-scrollbar",get("--ds-border","#343a44")),
    up:get("--ds-success","#34d399"),
    warm:get("--ds-danger","#f87171"),
    font,
  };
}
function rr(ctx,x,y,w,h,r){const q=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();}
function fillStroke(ctx,x,y,w,h,r,fill,stroke,lw=1){rr(ctx,x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
function text(ctx,t,x,y,size,color,weight="700",align="left"){ctx.font=`${weight} ${size}px ${(theme()?.font)||"Inter"},system-ui,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="middle";ctx.fillText(t,x,y);}
function chevron(ctx,x,y,dir,color,size=7,lw=2){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();if(dir==="left"){ctx.moveTo(x+size/2,y-size/2);ctx.lineTo(x-size/2,y);ctx.lineTo(x+size/2,y+size/2)}else{ctx.moveTo(x-size/2,y-size/2);ctx.lineTo(x+size/2,y);ctx.lineTo(x-size/2,y+size/2)}ctx.stroke();ctx.restore();}
function chevronDown(ctx,x,y,color,size=6,lw=1.8){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(x-size/2,y-size/3);ctx.lineTo(x,y+size/3);ctx.lineTo(x+size/2,y-size/3);ctx.stroke();ctx.restore();}
function drawMagnet(ctx,x,y,color,size=10,lw=1.6){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineCap="round";ctx.lineJoin="round";const hw=size*0.4,top=y-size*0.35,bot=y+size*0.35,bend=size*0.32;ctx.beginPath();ctx.moveTo(x-hw,top);ctx.lineTo(x-hw,bot-bend);ctx.quadraticCurveTo(x-hw,bot+bend*0.3,x,bot+bend*0.3);ctx.quadraticCurveTo(x+hw,bot+bend*0.3,x+hw,bot-bend);ctx.lineTo(x+hw,top);ctx.stroke();ctx.beginPath();ctx.moveTo(x-hw-lw*0.3,top);ctx.lineTo(x-hw+lw*2.5,top);ctx.stroke();ctx.beginPath();ctx.moveTo(x+hw-lw*2.5,top);ctx.lineTo(x+hw+lw*0.3,top);ctx.stroke();ctx.restore();}
function fitImage(ctx,img,x,y,w,h){if(!img?.naturalWidth||!img?.naturalHeight||w<=0||h<=0)return;const sc=Math.min(w/img.naturalWidth,h/img.naturalHeight);const dw=img.naturalWidth*sc,dh=img.naturalHeight*sc;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
function hit(node,x,y){const a=node._dsLIHit||{};for(const [k,r] of Object.entries(a)){if(r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return k;}return null;}
function setHit(node,k,x,y,w,h){node._dsLIHit[k]={x,y,w,h};}
function clearHit(node){node._dsLIHit={};}
function popupScreenPoint(node,x,y){const c=app.canvas?.canvas||app.canvas?.element;const ds=app.canvas?.ds;if(!c||!ds)return{x:x,y:y};const r=c.getBoundingClientRect();return{x:r.left+(node.pos[0]+x+ds.offset[0])*ds.scale,y:r.top+(node.pos[1]+y+ds.offset[1])*ds.scale};}

function drawUpDownArrow(ctx,x,y,dir,color,size=7,lw=1.8){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineWidth=lw;
  ctx.lineCap="round";
  ctx.lineJoin="round";
  ctx.beginPath();
  if(dir==="up"){
    ctx.moveTo(x-size/2,y+size/3);
    ctx.lineTo(x,y-size/3);
    ctx.lineTo(x+size/2,y+size/3);
  }else{
    ctx.moveTo(x-size/2,y-size/3);
    ctx.lineTo(x,y+size/3);
    ctx.lineTo(x+size/2,y-size/3);
  }
  ctx.stroke();
  ctx.restore();
}

function drawComparison(ctx,node){
  const t=theme();
  const p=node._dsLIPreview;
  const w=node.size[0];

  // Keep the existing Load Image HUD: two compact square preview cards with
  // a narrow bridge between them. The bridge has no extra outline, so there
  // are only the two actual preview boxes.
  const card=124;
  const gap=4;
  const arrowW=28;
  const hudW=card*2+gap+arrowW;
  const hudH=128;
  const lane=88;
  const area=Math.max(300,w-lane-20);
  const x0=10+Math.max(0,(area-hudW)/2);
  const y0=8;
  const right=x0+card+gap+arrowW;
  node._dsLICompare={x:x0,y:y0,w:hudW,h:hudH};

  // A single fill bridges the cards; no outer stroke / nested box.
  fillStroke(ctx,x0,y0,hudW,hudH,10,t.bg,null,0);

  const cardDraw=(x,label,dw,dh,img,out)=>{
    fillStroke(ctx,x,y0,card,card,8,t.bg,t.border,1);
    text(ctx,label,x+card/2,y0+14,9,t.muted,"800","center");

    const preview=62;
    const px=x+(card-preview)/2;
    const py=y0+25;
    fillStroke(ctx,px,py,preview,preview,5,t.input,t.border,1);
    fitImage(ctx,img,px+2,py+2,preview-4,preview-4);

    text(ctx,`${dw||"—"} × ${dh||"—"}`,x+card/2,y0+98,10,t.text,"850","center");
    text(ctx,ratioText(dw,dh),x+card/2,y0+114,8,t.muted,"700","center");

    if(out&&p){
      const up=p.ow>p.iw||p.oh>p.ih;
      const down=p.ow<p.iw||p.oh<p.ih;
      if(up||down) drawUpDownArrow(ctx,x+card-11,y0+14,up?"up":"down",up?t.up:t.warm,8,1.8);
    }
  };

  cardDraw(x0, "IN", p?.iw, p?.ih, p?.img, false);
  cardDraw(right, "OUT", p?.ow, p?.oh, p?.img, true);

  // Keep the Outpaint-style double-chevron, centered in the exact bridge lane.
  const cx=x0+card+gap+arrowW/2;
  ctx.save();
  ctx.font="900 12px Inter, system-ui, sans-serif";
  ctx.fillStyle=t.accent;
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText("❯❯",cx,y0+hudH/2);
  ctx.restore();
}

function layout(node){const w=node.size[0],h=node.size[1];
  // Comparison HUD is 132px tall; keep a compact 8px rhythm before controls.
  const yFile=144;
  const upload={x:10,y:yFile,w:w-20,h:32};
  const file={x:10,y:yFile+40,w:w-20,h:34};
  const modeY=file.y+52;
  const modeH=32;
  let y=modeY+modeH+8;
  const s=stateOf(node);
  const out={upload,file,mode:{x:10,y:modeY,w:w-20,h:modeH}};
  if(s.mode!=="off"){
    out.presets={x:10,y,w:w-20,h:32}; y+=39;
    out.stepper={x:10,y,w:w-20,h:36}; y+=43;
  }
  out.snap={x:10,y,w:w-20,h:18}; y+=26;
  out.res={x:10,y,w:w-20,h:28}; y+=34;
  out.upscale={x:10,y,w:w-20,h:32}; y+=38;
  out.preview={x:10,y,w:w-20,h:Math.max(140,h-y-10)};
  return out;
}

function drawButton(ctx, r, label, t, active = false, hovered = false, radius = 4) {
  ctx.save();
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  let bg = t.btn;
  let stroke = t.border;
  let textColor = t.text;
  let weight = active ? "700" : "600";

  if (hovered) {
    stroke = t.accent;
    bg = t.btnHover;
  }

  fillStroke(ctx, r.x, r.y, r.w, r.h, rad, bg, stroke, 1);

  if (active) {
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.clip();
    ctx.fillStyle = t.accent;
    ctx.fillRect(r.x, r.y + r.h - 2.5, r.w, 2.5);
    ctx.restore();
  }

  if (label) {
    const fontSize = Math.min(10, Math.max(8.5, r.h * 0.35));
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, fontSize, textColor, weight, "center");
  }
  ctx.restore();
}

function copyThemeVars(el, t) {
  if (!el) return;
  const map = {
    "--ds-bg": t.bg,
    "--ds-panel": t.bg2,
    "--ds-panel-2": t.bg3,
    "--ds-input-bg": t.input,
    "--ds-border": t.border,
    "--ds-text": t.text,
    "--ds-text-muted": t.muted,
    "--ds-accent": t.accent,
    "--ds-hover": t.hover,
    "--ds-active": t.active,
    "--ds-btn-bg": t.btn,
    "--ds-btn-hover": t.btnHover,
    "--ds-scrollbar": t.scrollbar,
    "--ds-success": t.up,
    "--ds-danger": t.warm,
    "--ds-font": t.font,
  };
  Object.entries(map).forEach(([k, v]) => el.style.setProperty(k, v));
  el.dataset.dsThemed = "true";
}

function removeNumericInput(node) {
  if (node?._dsLINumberInput) {
    node._dsLINumberInput.remove();
    node._dsLINumberInput = null;
  }
}

function ensureNumericInput(node, s) {
  let input = node._dsLINumberInput;
  if (input) return input;
  input = document.createElement("input");
  input.className = "ds-li-number-input";
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Load Image numeric value");
  copyThemeVars(input, theme());

  const commit = () => {
    const mode = stateOf(node).mode;
    const limits = { max_mp: [0.01, 64, 0.05], longest_side: [8, 16384, 8], scale_factor: [0.01, 8, 0.05] }[mode];
    if (!limits) return;
    const raw = Number(String(input.value).replace(/[^0-9eE+.-]/g, ""));
    if (!Number.isFinite(raw)) {
      input.value = formatNumeric(stateOf(node), mode);
      return;
    }
    let v = clamp(raw, limits[0], limits[1]);
    v = mode === "longest_side" ? Math.round(v) : Math.round(v * 100) / 100;
    persist(node, { [mode]: v });
    input.value = formatNumeric(stateOf(node), mode);
    refreshPreview(node);
    node.setDirtyCanvas?.(true, true);
  };

  input.addEventListener("pointerdown", e => e.stopPropagation());
  input.addEventListener("mousedown", e => e.stopPropagation());
  input.addEventListener("mouseup", e => e.stopPropagation());
  input.addEventListener("click", e => e.stopPropagation());
  input.addEventListener("dblclick", e => e.stopPropagation());
  input.addEventListener("contextmenu", e => e.stopPropagation());

  input.addEventListener("keydown", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      input.blur();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      input.value = formatNumeric(stateOf(node), stateOf(node).mode);
      input.blur();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepNumber(node, e.key === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1);
      return;
    }
  });
  input.addEventListener("keyup", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  });
  input.addEventListener("keypress", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  });

  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);

  document.body.appendChild(input);
  node._dsLINumberInput = input;
  return input;
}

function positionNumericInput(node, rx, ry, rw, rh) {
  const input = node?._dsLINumberInput;
  const c = app.canvas?.canvas || app.canvas?.element;
  const ds = app.canvas?.ds;
  if (!input || !c || !ds) return;
  const r = c.getBoundingClientRect();
  const scale = Number(ds.scale) || 1;
  const off = ds.offset || [0, 0];
  const screenLeft = r.left + (Number(node.pos?.[0] || 0) + rx + Number(off[0] || 0)) * scale;
  const screenTop = r.top + (Number(node.pos?.[1] || 0) + ry + Number(off[1] || 0)) * scale;
  input.style.left = `${Math.round(screenLeft)}px`;
  input.style.top = `${Math.round(screenTop)}px`;
  input.style.width = `${Math.max(24, Math.round(rw * scale))}px`;
  input.style.height = `${Math.max(16, Math.round(rh * scale))}px`;
  input.style.fontSize = `${Math.max(9, Math.round(11 * scale))}px`;
  copyThemeVars(input, theme());
}

function syncNumericInput(node, s, rx, ry, rw, rh) {
  if (s.mode === "off" || node.flags?.collapsed) {
    if (node._dsLINumberInput) node._dsLINumberInput.style.display = "none";
    return;
  }
  const input = ensureNumericInput(node, s);
  input.style.display = "block";
  positionNumericInput(node, rx, ry, rw, rh);
  if (document.activeElement !== input) {
    input.value = formatNumeric(s, s.mode);
  }
}

function stepNumber(node, dir, mult = 1) {
  const s = stateOf(node);
  const keyName = s.mode;
  const limits = { max_mp: [0.01, 64, 0.05], longest_side: [8, 16384, 8], scale_factor: [0.01, 8, 0.05] }[keyName];
  if (!limits) return;
  let v = Number(s[keyName]) + dir * limits[2] * mult;
  v = clamp(v, limits[0], limits[1]);
  v = keyName === "longest_side" ? Math.round(v) : Math.round(v * 100) / 100;
  persist(node, { [keyName]: v });
  if (node._dsLINumberInput && document.activeElement !== node._dsLINumberInput) {
    node._dsLINumberInput.value = formatNumeric(stateOf(node), keyName);
  }
  node.setDirtyCanvas?.(true, true);
  refreshPreview(node);
}

function formatNumeric(s, mode) {
  const v = Number(s?.[mode]);
  if (!Number.isFinite(v)) return "";
  return mode === "longest_side" ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
}

function drawUI(node, ctx) {
  const t = theme();
  clearHit(node);
  const L = layout(node);
  const s = stateOf(node);
  drawComparison(ctx, node);

  // Upload row: styled cleanly like Outpaint actions
  const isUploadHover = node._dsLIHover === "upload";
  drawButton(ctx, L.upload, "", t, false, isUploadHover, 4);
  const uploadCx = L.upload.x + L.upload.w / 2;
  const uploadColor = isUploadHover ? t.accent : t.text;
  text(ctx, "↑", uploadCx - 44, L.upload.y + L.upload.h / 2, 14, uploadColor, "700", "center");
  text(ctx, "Upload Image", uploadCx + 6, L.upload.y + L.upload.h / 2, 9.5, uploadColor, "600", "center");
  setHit(node, "upload", L.upload.x, L.upload.y, L.upload.w, L.upload.h);

  // File row: square navigation buttons + central picker matching Outpaint button language.
  const prev = { x: L.file.x, y: L.file.y, w: 32, h: L.file.h };
  const next = { x: L.file.x + L.file.w - 32, y: L.file.y, w: 32, h: L.file.h };
  const center = { x: L.file.x + 36, y: L.file.y, w: L.file.w - 72, h: L.file.h };
  const isFileHover = node._dsLIHover === "file";
  const isPrevHover = node._dsLIHover === "prev";
  const isNextHover = node._dsLIHover === "next";

  drawButton(ctx, prev, "", t, false, isPrevHover, 4);
  chevron(ctx, prev.x + prev.w / 2, prev.y + prev.h / 2, "left", isPrevHover ? t.accent : t.text, 7, 1.8);
  setHit(node, "prev", prev.x, prev.y, prev.w, prev.h);

  drawButton(ctx, center, "", t, false, isFileHover, 4);
  const fnLabel = basename(node._dsLIImageWidget?.value) || "Choose image";
  text(ctx, fnLabel, center.x + 10, center.y + center.h / 2, 9.5, isFileHover ? t.accent : t.text, "600", "left");
  chevron(ctx, center.x + center.w - 12, center.y + center.h / 2, "right", isFileHover ? t.accent : t.muted, 6, 1.6);
  setHit(node, "file", center.x, center.y, center.w, center.h);

  drawButton(ctx, next, "", t, false, isNextHover, 4);
  chevron(ctx, next.x + next.w / 2, next.y + next.h / 2, "right", isNextHover ? t.accent : t.text, 7, 1.8);
  setHit(node, "next", next.x, next.y, next.w, next.h);

  text(ctx, "or drop an image anywhere onto this node", L.file.x + L.file.w / 2, L.file.y + L.file.h + 12, 7.5, t.muted, "600", "center");

  // Mode tabs: Outpaint-styled button tabs with 20% accent fill and bottom indicator when active
  const mw = (L.mode.w - 6) / 4;
  MODES.forEach(([id, label], i) => {
    const r = { x: L.mode.x + i * (mw + 2), y: L.mode.y, w: mw, h: L.mode.h };
    drawButton(ctx, r, label, t, s.mode === id, node._dsLIHover === `mode:${id}`, 4);
    setHit(node, `mode:${id}`, r.x, r.y, r.w, r.h);
  });

  // Mode-specific presets and numeric field
  if (s.mode !== "off") {
    const vals = PRESETS[s.mode], cur = Number(s[s.mode]);
    const pw = (L.presets.w - 25) / 6;
    vals.forEach((v, i) => {
      const r = { x: L.presets.x + i * (pw + 5), y: L.presets.y, w: pw, h: L.presets.h };
      const label = s.mode === "max_mp" ? `${v} MP` : s.mode === "scale_factor" ? `${v}x` : String(v);
      const key = `preset:${v}`;
      drawButton(ctx, r, label, t, Math.abs(cur - v) < 1e-9, node._dsLIHover === key, 4);
      setHit(node, key, r.x, r.y, r.w, r.h);
    });

    // Numeric stepper: Outpaint-style container, label, stepper buttons, and real HTML input for typing
    const r = L.stepper;
    const spinW = 32;
    const labelW = Math.min(132, Math.max(112, r.w * 0.32));
    fillStroke(ctx, r.x, r.y, r.w, r.h, 4, t.input, t.border, 1);
    const fieldLabel = s.mode === "max_mp" ? "Max Megapixels" : s.mode === "longest_side" ? "Longest side (px)" : "Scale multiplier";
    text(ctx, fieldLabel, r.x + 10, r.y + r.h / 2, 9, t.muted, "600", "left");
    const unit = s.mode === "max_mp" ? "MP" : s.mode === "scale_factor" ? "x" : "px";
    text(ctx, unit, r.x + r.w - spinW - 8, r.y + r.h / 2, 8.5, t.muted, "600", "right");

    ctx.save();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r.x + labelW, r.y);
    ctx.lineTo(r.x + labelW, r.y + r.h);
    ctx.moveTo(r.x + r.w - spinW, r.y);
    ctx.lineTo(r.x + r.w - spinW, r.y + r.h);
    ctx.stroke();
    ctx.restore();

    const su = { x: r.x + r.w - spinW, y: r.y, w: spinW, h: r.h / 2 };
    const sd = { x: r.x + r.w - spinW, y: r.y + r.h / 2, w: spinW, h: r.h / 2 };
    const isUpH = node._dsLIHover === "stepUp";
    const isDnH = node._dsLIHover === "stepDown";

    drawButton(ctx, su, "", t, false, isUpH, 2);
    drawUpDownArrow(ctx, su.x + spinW / 2, su.y + su.h / 2, "up", isUpH ? t.accent : t.muted, 6, 1.6);
    drawButton(ctx, sd, "", t, false, isDnH, 2);
    drawUpDownArrow(ctx, sd.x + spinW / 2, sd.y + sd.h / 2, "down", isDnH ? t.accent : t.muted, 6, 1.6);

    const inpX = r.x + labelW + 4;
    const inpY = r.y + 3;
    const inpW = r.w - labelW - spinW - 28;
    const inpH = r.h - 6;
    setHit(node, "stepInput", inpX, inpY, inpW, inpH);
    syncNumericInput(node, s, inpX, inpY, inpW, inpH);

    setHit(node, "stepUp", su.x, su.y, su.w, su.h);
    setHit(node, "stepDown", sd.x, sd.y, sd.w, sd.h);
  } else {
    removeNumericInput(node);
  }

  // Snap row: magnet icon + label + compact buttons
  const snapLabelX = L.snap.x;
  drawMagnet(ctx, snapLabelX + 7, L.snap.y + L.snap.h / 2, t.muted, 9, 1.4);
  text(ctx, "SNAP", snapLabelX + 18, L.snap.y + L.snap.h / 2, 7, t.muted, "850", "left");
  const snapBtnStart = snapLabelX + 48;
  const snapBtnGap = 3;
  const sw = (L.snap.w - 48 - snapBtnGap * 4) / 5;
  for (let i = 0; i < 5; i++) {
    const v = SNAP_VALUES[i], r = { x: snapBtnStart + i * (sw + snapBtnGap), y: L.snap.y, w: sw, h: L.snap.h };
    const key = `snap:${v}`;
    drawButton(ctx, r, v ? String(v) : "Off", t, s.snap === v, node._dsLIHover === key, 3);
    setHit(node, key, r.x, r.y, r.w, r.h);
  }

  // Resampler row: centered "Resample: Value" with prev/next buttons
  const rprev = { x: L.res.x, y: L.res.y, w: 26, h: L.res.h };
  const rnext = { x: L.res.x + L.res.w - 26, y: L.res.y, w: 26, h: L.res.h };
  const rsel = { x: L.res.x + 30, y: L.res.y, w: L.res.w - 60, h: L.res.h };

  const isRPrevH = node._dsLIHover === "resPrev";
  const isRNextH = node._dsLIHover === "resNext";
  const isRSelH = node._dsLIHover === "resMenu";

  drawButton(ctx, rprev, "", t, false, isRPrevH, 4);
  chevron(ctx, rprev.x + rprev.w / 2, rprev.y + rprev.h / 2, "left", isRPrevH ? t.accent : t.text, 6, 1.6);
  setHit(node, "resPrev", rprev.x, rprev.y, rprev.w, rprev.h);

  drawButton(ctx, rsel, "", t, false, isRSelH, 4);
  const resLabel = s.resample[0].toUpperCase() + s.resample.slice(1);
  text(ctx, `Resample: ${resLabel}`, rsel.x + rsel.w / 2, rsel.y + rsel.h / 2, 9, isRSelH ? t.accent : t.text, "600", "center");
  chevronDown(ctx, rsel.x + rsel.w - 12, rsel.y + rsel.h / 2, isRSelH ? t.accent : t.muted, 5, 1.4);
  setHit(node, "resMenu", rsel.x, rsel.y, rsel.w, rsel.h);

  drawButton(ctx, rnext, "", t, false, isRNextH, 4);
  chevron(ctx, rnext.x + rnext.w / 2, rnext.y + rnext.h / 2, "right", isRNextH ? t.accent : t.text, 6, 1.6);
  setHit(node, "resNext", rnext.x, rnext.y, rnext.w, rnext.h);

  // Upscale guard: Outpaint-styled button
  const isUpHover = node._dsLIHover === "upscale";
  drawButton(ctx, L.upscale, s.allow_upscale ? "Allow upscale" : "Block upscale", t, s.allow_upscale, isUpHover, 4);
  setHit(node, "upscale", L.upscale.x, L.upscale.y, L.upscale.w, L.upscale.h);

  // Bottom actual image preview
  fillStroke(ctx, L.preview.x, L.preview.y, L.preview.w, L.preview.h, 6, t.input, t.border, 1);
  setHit(node, "preview", L.preview.x, L.preview.y, L.preview.w, L.preview.h);
  const p = node._dsLIPreview;
  if (p?.img) {
    fitImage(ctx, p.img, L.preview.x + 10, L.preview.y + 10, L.preview.w - 20, L.preview.h - 34);
    text(ctx, `${p.iw} × ${p.ih}  →  ${p.ow} × ${p.oh}`, L.preview.x + L.preview.w / 2, L.preview.y + L.preview.h - 12, 8, t.muted, "700", "center");
  } else {
    text(ctx, "Drag & Drop Image Here", L.preview.x + L.preview.w / 2, L.preview.y + L.preview.h / 2 - 7, 11, t.muted, "800", "center");
    text(ctx, "Selected image preview", L.preview.x + L.preview.w / 2, L.preview.y + L.preview.h / 2 + 10, 8, t.muted, "600", "center");
  }
}

function refreshPreview(node) {
  const fn = node._dsLIImageWidget?.value || "";
  if (!fn) {
    node._dsLIPreview = null;
    node._dsLILoadedFile = null;
    node.setDirtyCanvas?.(true, true);
    return;
  }
  // Recalc output dims from already-loaded image when only resize settings changed
  if (node._dsLILoadedFile === fn && node._dsLIPreview?.img?.complete && node._dsLIPreview.img.naturalWidth) {
    const img = node._dsLIPreview.img;
    const iw = img.naturalWidth || 0, ih = img.naturalHeight || 0;
    const [ow, oh] = targetDims(iw, ih, stateOf(node));
    node._dsLIPreview = { img, iw, ih, ow, oh };
    node.setDirtyCanvas?.(true, true);
    return;
  }
  node._dsLILoadedFile = fn;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (node._dsLILoadedFile !== fn) return;
    const iw = img.naturalWidth || 0, ih = img.naturalHeight || 0;
    const [ow, oh] = targetDims(iw, ih, stateOf(node));
    node._dsLIPreview = { img, iw, ih, ow, oh };
    node.setDirtyCanvas?.(true, true);
  };
  img.onerror = e => warn("preview load failed", fn, e);
  img.src = imageURL(fn, true);
}

function setImage(node, filename) {
  const w = node._dsLIImageWidget;
  if (!w) return;
  w.value = filename;
  node._dsLISelected = filename;
  w.callback?.(filename);
  refreshPreview(node);
  node.setDirtyCanvas?.(true, true);
}

function cycleImage(node, d) {
  const all = inputFiles(node);
  if (!all.length) return;
  const cur = node._dsLIImageWidget?.value || "";
  const folder = folderOf(cur);
  const local = all.filter(x => folderOf(x) === folder);
  const pool = local.length ? local : all;
  const i = Math.max(0, pool.indexOf(cur));
  setImage(node, pool[(i + d + pool.length) % pool.length]);
}

async function uploadFile(node, file) {
  if (!file) return;
  const ext = String(file.name || "").split(".").pop()?.toLowerCase();
  if (!IMAGE_EXTS.has(ext)) throw new Error("Unsupported image format.");
  const fd = new FormData();
  fd.append("image", file, file.name || `image-${Date.now()}.png`);
  fd.append("type", "input");
  fd.append("overwrite", "true");
  const res = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
  const data = await res.json();
  if (!data?.name) throw new Error("ComfyUI did not return the uploaded filename.");
  const fn = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  node._dsLIImageWidget.options ??= {};
  node._dsLIImageWidget.options.values ??= [];
  if (!node._dsLIImageWidget.options.values.includes(fn)) node._dsLIImageWidget.options.values.push(fn);
  setImage(node, fn);
}

function openFilePicker(node) {
  let input = document.getElementById("ds-li-file-picker");
  if (!input) {
    input = document.createElement("input");
    input.id = "ds-li-file-picker";
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";
    input.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0";
    document.body.appendChild(input);
  }
  input.onchange = async () => {
    const f = input.files?.[0];
    input.value = "";
    if (f) {
      try {
        await uploadFile(node, f);
      } catch (e) {
        console.error("[DS Load Image] picker", e);
      }
    }
  };
  input.click();
}

function closePopups() {
  document.querySelectorAll(".ds-li-popup").forEach(x => x.remove());
}

function menuPosition(anchorW, node, x, y) {
  const pt = popupScreenPoint(node, x, y);
  return { left: pt.x, top: pt.y, anchorW };
}

function openResampleMenu(node) {
  closePopups();
  const menu = document.createElement("div");
  menu.className = "ds-li-popup ds-li-resmenu";
  copyThemeVars(menu, theme());
  menu.addEventListener("pointerdown", e => e.stopPropagation());
  menu.addEventListener("mousedown", e => e.stopPropagation());

  const notes = {
    auto: "Lanczos down · Bilinear up",
    nearest: "Pixel-perfect",
    bilinear: "Fast · smooth",
    bicubic: "Slower · sharper",
    lanczos: "Slowest · sharpest",
  };

  for (const id of RESAMPLES) {
    const b = document.createElement("button");
    b.className = id === stateOf(node).resample ? "active" : "";
    const strong = document.createElement("b");
    strong.textContent = id[0].toUpperCase() + id.slice(1);
    const small = document.createElement("small");
    small.textContent = notes[id];
    b.append(strong, small);
    b.onclick = e => {
      e.stopPropagation();
      persist(node, { resample: id });
      menu.remove();
      node.setDirtyCanvas?.(true, true);
    };
    menu.appendChild(b);
  }

  document.body.appendChild(menu);
  const a = node._dsLIHit.resMenu;
  const pos = menuPosition(null, node, a.x, a.y + a.h + 4);
  menu.style.left = `${clamp(pos.left, 6, innerWidth - menu.offsetWidth - 6)}px`;
  menu.style.top = `${clamp(pos.top, 6, innerHeight - menu.offsetHeight - 6)}px`;

  setTimeout(() => document.addEventListener("pointerdown", function close(e) {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("pointerdown", close, true);
    }
  }, { once: true, capture: true }), 0);
}

function openImageBrowser(node) {
  closePopups();
  const popup = document.createElement("div");
  popup.className = "ds-li-popup ds-li-browser";
  copyThemeVars(popup, theme());
  popup.innerHTML = `<div class="ds-li-browser-head"><input placeholder="Search images…"><span></span></div><div class="ds-li-list"></div>`;
  document.body.appendChild(popup);

  popup.addEventListener("pointerdown", e => e.stopPropagation());
  popup.addEventListener("mousedown", e => e.stopPropagation());
  popup.addEventListener("wheel", e => e.stopPropagation(), { passive: true });

  const a = node._dsLIHit.file;
  const pos = menuPosition(null, node, a.x, a.y + a.h + 5);
  popup.style.left = `${clamp(pos.left, 6, innerWidth - 406)}px`;
  popup.style.top = `${clamp(pos.top, 6, innerHeight - 460)}px`;

  const input = popup.querySelector("input"), count = popup.querySelector("span"), list = popup.querySelector(".ds-li-list");

  input.addEventListener("pointerdown", e => e.stopPropagation());
  input.addEventListener("mousedown", e => e.stopPropagation());
  input.addEventListener("click", e => e.stopPropagation());
  input.addEventListener("keydown", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      popup.remove();
    }
  });
  input.addEventListener("keyup", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  });
  input.addEventListener("keypress", e => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  });

  const all = inputFiles(node);
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const scored = all.map(fn => ({
      fn,
      score: q ? (fn.toLowerCase().includes(q) ? 0 : (basename(fn).toLowerCase().includes(q) ? 1 : folderOf(fn).toLowerCase().includes(q) ? 2 : 9)) : 0
    })).filter(x => x.score < 9).sort((a, b) => a.score || a.fn.localeCompare(b.fn));

    count.textContent = `${scored.length} images`;
    list.replaceChildren();
    for (const { fn } of scored) {
      const row = document.createElement("button");
      row.className = "ds-li-browser-row" + (fn === node._dsLIImageWidget?.value ? " active" : "");
      const img = document.createElement("img");
      img.src = imageURL(fn);
      img.alt = "";
      const copy = document.createElement("span");
      const b = document.createElement("b");
      b.textContent = basename(fn);
      const small = document.createElement("small");
      small.textContent = folderOf(fn) || "input/";
      copy.append(b, small);
      row.append(img, copy);
      img.onload = () => {
        small.textContent = `${folderOf(fn) || "input/"} · ${img.naturalWidth || 0} × ${img.naturalHeight || 0}`;
      };
      row.onclick = e => {
        e.stopPropagation();
        setImage(node, fn);
        popup.remove();
      };
      list.appendChild(row);
    }
  };
  input.oninput = render;
  render();
  setTimeout(() => input.focus(), 10);

  setTimeout(() => document.addEventListener("pointerdown", function close(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener("pointerdown", close, true);
    }
  }, { once: true, capture: true }), 0);
}

function installDrop() {
  if (window.__dsLoadImageCanvasDrop) return;
  window.__dsLoadImageCanvasDrop = true;
  document.addEventListener("dragover", e => {
    const n = pointNode(e);
    document.querySelectorAll(".ds-li-drop-outline").forEach(x => x.remove());
    if (!n || n.type !== TYPE || !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    showDropOutline(n, true);
  }, true);
  document.addEventListener("drop", async e => {
    const n = pointNode(e);
    if (!n || n.type !== TYPE) return;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    showDropOutline(n, false);
    try {
      await uploadFile(n, f);
    } catch (err) {
      console.error("[DS Load Image] drop", err);
    }
  }, true);
}

function pointNode(e) {
  try {
    const p = app.canvas?.convertEventToCanvasOffset?.(e);
    return p ? app.graph?.getNodeOnPos?.(p[0], p[1]) : null;
  } catch {
    return null;
  }
}

function showDropOutline(node, on) {
  if (!node._dsLIDrop && on) {
    const d = document.createElement("div");
    d.className = "ds-li-drop-outline";
    d.textContent = "📂 Drop Image to Load";
    document.body.appendChild(d);
    node._dsLIDrop = d;
    positionDropOutline(node);
  } else if (!on && node._dsLIDrop) {
    node._dsLIDrop.remove();
    node._dsLIDrop = null;
  }
}

function positionDropOutline(node) {
  if (!node._dsLIDrop) return;
  const c = app.canvas?.canvas;
  if (!c) return;
  const ds = app.canvas?.ds, r = c.getBoundingClientRect();
  if (!ds) return;
  const x = r.left + (node.pos[0] + ds.offset[0]) * ds.scale, y = r.top + (node.pos[1] + ds.offset[1]) * ds.scale;
  node._dsLIDrop.style.left = `${x}px`;
  node._dsLIDrop.style.top = `${y}px`;
  node._dsLIDrop.style.width = `${node.size[0] * ds.scale}px`;
  node._dsLIDrop.style.height = `${node.size[1] * ds.scale}px`;
}

function install(node) {
  if (node._dsLIInstalled) return;
  node._dsLIInstalled = true;
  node.resizable = true;
  node.properties ??= {};
  const w = node.widgets?.find(x => x?.name === "image");
  node._dsLIImageWidget = w;
  for (const ww of node.widgets || []) {
    if (ww.name === STATE_WIDGET) {
      ww.hidden = true;
      ww.computeSize = () => [0, 0];
      continue;
    }
    ww.hidden = true;
    ww.computeSize = () => [0, 0];
    if (ww.element) ww.element.style.display = "none";
  }
  if (!Array.isArray(node.size) || node.size[0] < MIN_W || node.size[1] < MIN_H) node.size = [DEFAULT_W, DEFAULT_H];
  node.size[0] = Math.max(MIN_W, node.size[0]);
  node.size[1] = Math.max(MIN_H, node.size[1]);
  node._dsLIPreview = null;
  const oldImage = w?.callback;
  if (w) w.callback = function (v) {
    oldImage?.apply(this, arguments);
    refreshPreview(node);
    node.setDirtyCanvas?.(true, true);
  };
  node._dsLIOldMouseDown = node.onMouseDown;
  node.onMouseDown = function (e, pos, canvas) {
    const key = hit(node, pos[0], pos[1]);
    if (key) return handleClick(node, key);
    return node._dsLIOldMouseDown?.apply(this, arguments);
  };
  node._dsLIOldMouseMove = node.onMouseMove;
  node.onMouseMove = function (e, pos, canvas) {
    const key = hit(node, pos[0], pos[1]);
    if (key !== this._dsLIHover) {
      this._dsLIHover = key;
      this.setDirtyCanvas?.(true, true);
    }
    return node._dsLIOldMouseMove?.apply(this, arguments);
  };
  node._dsLIOldMouseLeave = node.onMouseLeave;
  node.onMouseLeave = function () {
    if (this._dsLIHover) {
      this._dsLIHover = null;
      this.setDirtyCanvas?.(true, true);
    }
    return node._dsLIOldMouseLeave?.apply(this, arguments);
  };
  node._dsLIOldResize = node.onResize;
  node.onResize = function (size) {
    if (size[0] < MIN_W) size[0] = MIN_W;
    if (size[1] < MIN_H) size[1] = MIN_H;
    return node._dsLIOldResize?.apply(this, arguments);
  };
  const oldRemoved = node.onRemoved;
  node.onRemoved = function () {
    closePopups();
    removeNumericInput(node);
    node._dsLIDrop?.remove();
    node._dsLIDrop = null;
    return oldRemoved?.apply(this, arguments);
  };
  refreshPreview(node);
  installDrop();
}

function handleClick(node, key) {
  const s = stateOf(node);
  if (key === "upload" || key === "preview") {
    openFilePicker(node);
    return true;
  }
  if (key === "stepInput") {
    node._dsLINumberInput?.focus();
    node._dsLINumberInput?.select();
    return true;
  }
  if (key === "file") {
    openImageBrowser(node);
    return true;
  }
  if (key === "prev") {
    cycleImage(node, -1);
    return true;
  }
  if (key === "next") {
    cycleImage(node, 1);
    return true;
  }
  if (key.startsWith("mode:")) {
    persist(node, { mode: key.slice(5) });
    if (key.slice(5) === "off") removeNumericInput(node);
    node.setDirtyCanvas?.(true, true);
    return true;
  }
  if (key.startsWith("preset:")) {
    persist(node, { [s.mode]: Number(key.slice(7)) });
    if (node._dsLINumberInput && document.activeElement !== node._dsLINumberInput) {
      node._dsLINumberInput.value = formatNumeric(stateOf(node), s.mode);
    }
    node.setDirtyCanvas?.(true, true);
    refreshPreview(node);
    return true;
  }
  if (key === "stepUp" || key === "stepDown") {
    stepNumber(node, key === "stepUp" ? 1 : -1);
    return true;
  }
  if (key.startsWith("snap:")) {
    persist(node, { snap: Number(key.slice(5)) });
    node.setDirtyCanvas?.(true, true);
    refreshPreview(node);
    return true;
  }
  if (key === "resPrev" || key === "resNext") {
    const i = RESAMPLES.indexOf(s.resample);
    persist(node, { resample: RESAMPLES[(i + (key === "resPrev" ? -1 : 1) + RESAMPLES.length) % RESAMPLES.length] });
    node.setDirtyCanvas?.(true, true);
    return true;
  }
  if (key === "resMenu") {
    openResampleMenu(node);
    return true;
  }
  if (key === "upscale") {
    persist(node, { allow_upscale: !s.allow_upscale });
    node.setDirtyCanvas?.(true, true);
    refreshPreview(node);
    return true;
  }
  return false;
}

function loadCSS(){if(document.getElementById(CSS_ID))return;const link=document.createElement("link");link.id=CSS_ID;link.rel="stylesheet";link.href=CSS_URL;document.head.appendChild(link);}
function patchType(nodeType,nodeData){if(nodeData.name!==TYPE)return;const created=nodeType.prototype.onNodeCreated;nodeType.prototype.onNodeCreated=function(){const r=created?.apply(this,arguments);install(this);return r};const configured=nodeType.prototype.onConfigure;nodeType.prototype.onConfigure=function(){const r=configured?.apply(this,arguments);install(this);refreshPreview(this);return r};const resize=nodeType.prototype.onResize;nodeType.prototype.onResize=function(size){if(size[0]<MIN_W)size[0]=MIN_W;if(size[1]<MIN_H)size[1]=MIN_H;return resize?.apply(this,arguments)};const draw=nodeType.prototype.onDrawForeground;nodeType.prototype.onDrawForeground=function(ctx){const r=draw?.apply(this,arguments);if(!this.flags?.collapsed)drawUI(this,ctx); else removeNumericInput(this);return r};}

app.registerExtension({name:EXT,setup(){loadCSS();installDrop();log("canvas frontend ready; no DOM widget")},beforeRegisterNodeDef(nodeType,nodeData){patchType(nodeType,nodeData)}});
