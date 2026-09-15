import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { buildModePanel, previewResize, injectResizePanelCSS } from "../Shared/ds_resize_panel.js";
import { installDSUISystem, normalizeDSWidgetHost } from "../Shared/ds_ui_system.js";

const STATE_WIDGET = "ds_image_loader_state";
const STATE_PROP = "dsImageLoaderState";
const DEFAULT_STATE = {
  version: 1, mode: "off", max_mp: 1.0, longest_side: 1024, scale_factor: 1.0,
  fit_w: 1024, fit_h: 1024, cover_w: 1024, cover_h: 1024,
  ratio_preset: "1:1", ratio_w: 1, ratio_h: 1, ratio_action: "crop",
  pad_color: "#808080", pad_top: 0, pad_bottom: 0, pad_left: 0, pad_right: 0,
  crop_anchor: "center", crop_scale: true, snap: 0, resample: "auto", allow_upscale: true,
};
// Keep the DS loader intentionally focused: the four practical resize modes
// are exposed here. The more complex Pixaroma W×H / ratio / padding modes are
// still understood by the shared resize math for backwards compatibility, but
// are deliberately not exposed in this compact UI.
const MODES = [
  ["off", "Off", "No resize; Snap can still be applied."],
  ["max_mp", "Max MP", "Limit the total pixel count while preserving aspect ratio."],
  ["longest_side", "Longest side", "Set the longest edge while preserving aspect ratio."],
  ["scale_factor", "Scale by ×", "Multiply both dimensions by a scale factor."],
];
const VISIBLE_MODES = new Set(MODES.map(([id]) => id));

function readState(node) {
  try {
    const raw = node.properties?.[STATE_PROP];
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {}
  try {
    const raw = node.widgets?.find(w => w.name === STATE_WIDGET)?.value;
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_STATE };
}

function saveState(node, patch) {
  const state = { ...DEFAULT_STATE, ...readState(node), ...patch };
  const json = JSON.stringify(state);
  node.properties ||= {};
  node.properties[STATE_PROP] = json;
  const widget = node.widgets?.find(w => w.name === STATE_WIDGET);
  if (widget) widget.value = json;
  node.setDirtyCanvas?.(true, true);
  return state;
}

function markWorkflowDirty() {
  try {
    const ct = app?.extensionManager?.workflow?.activeWorkflow?.changeTracker || app?.workflowManager?.activeWorkflow?.changeTracker;
    ct?.captureCanvasState?.();
  } catch {}
}

function splitFilename(path) {
  const n = String(path || "").replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i < 0 ? { subfolder: "", filename: n } : { subfolder: n.slice(0, i), filename: n.slice(i + 1) };
}
function imageURL(path) {
  const p = splitFilename(path);
  const q = new URLSearchParams({ filename: p.filename, type: "input", t: String(Date.now()) });
  if (p.subfolder) q.set("subfolder", p.subfolder);
  return `/view?${q}`;
}
function isImage(v) { return /\.(avif|bmp|gif|jpe?g|png|tiff?|webp)$/i.test(String(v || "")); }

function injectDSLoaderCSS() {
  installDSUISystem();
  if (document.getElementById("ds-image-loader-v2-css")) return;
  const style = document.createElement("style");
  style.id = "ds-image-loader-v2-css";
  style.textContent = `
    .ds-il-root-v2{position:relative;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:var(--ds-ui-inset,6px) var(--ds-ui-inset,6px) 0;overflow:hidden;border-radius:10px;color:var(--ds-text,#e5e7eb);font:10px ui-sans-serif,system-ui,sans-serif;pointer-events:none;}
    .ds-il-root-v2 .ds-il-interactive{pointer-events:auto;}
    .ds-il-filebar{display:flex;gap:5px;align-items:center;min-height:30px;flex:0 0 30px;}
    .ds-il-name{flex:1;min-width:0;height:28px;display:flex;align-items:center;padding:0 8px;background:var(--ds-input-bg,#0e1016);border:1px solid var(--ds-border,#242a36);border-radius:5px;color:var(--ds-text,#e5e7eb);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
    .ds-il-btn{height:28px;min-width:28px;padding:0 8px;border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#161a23);color:var(--ds-text-muted,#a1a8b3);font:600 9px inherit;cursor:pointer;}
    .ds-il-btn:hover{border-color:var(--ds-text-muted,#7f8792);color:var(--ds-text,#fff);background:var(--ds-panel-3,#20252d);}
    .ds-il-upload{min-width:62px;}
    .ds-il-info{height:24px;min-height:24px;flex:0 0 24px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#151a21);font-size:8px;color:var(--ds-text-muted,#8d95a1);}
    .ds-il-info b{color:var(--ds-text,#e5e7eb);font-weight:700;}
    .ds-il-info .arrow{opacity:.5;}
    .ds-il-resize-shell{display:flex;flex-direction:column;gap:var(--ds-ui-gap-md,8px);flex:0 0 auto;min-height:0;overflow:visible;}
    .ds-il-modegrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--ds-ui-gap-sm,6px);}
    .ds-il-mode{height:var(--ds-ui-control-h,30px);min-width:0;border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#161a23);color:var(--ds-text-muted,#a1a8b3);font:600 9px inherit;cursor:pointer;}
    .ds-il-mode:hover{border-color:var(--ds-text-muted,#737b87);color:var(--ds-text,#fff);}
    .ds-il-mode.active{background:color-mix(in srgb,var(--ds-accent,#7f8792) 13%,var(--ds-panel-2,#161a23));border-color:var(--ds-accent,#7f8792);color:var(--ds-text,#fff);box-shadow:inset 0 -2px 0 var(--ds-accent,#7f8792),0 0 0 1px color-mix(in srgb,var(--ds-accent,#7f8792) 10%,transparent);}
    .ds-il-mode.active:hover{background:color-mix(in srgb,var(--ds-accent,#7f8792) 17%,var(--ds-panel-2,#161a23));}
    .ds-il-panelhost{width:100%;margin-top:2px;}
    .ds-il-global{display:flex;flex-direction:column;gap:var(--ds-ui-gap-sm,6px);padding-top:1px;}
    .ds-il-snaprow{display:grid;grid-template-columns:auto repeat(5,minmax(0,1fr));gap:4px;align-items:center;}
    .ds-il-snaplabel{display:flex;align-items:center;gap:4px;padding:0 4px;color:var(--ds-text-muted,#8d95a1);font-size:8px;text-transform:uppercase;letter-spacing:.45px;white-space:nowrap;}
    .ds-il-snaplabel::before{content:"";width:9px;height:9px;border:1.5px solid currentColor;border-radius:50%;display:block;opacity:.75;}
    .ds-il-chip{height:var(--ds-ui-control-h,30px);border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#161a23);color:var(--ds-text-muted,#a1a8b3);font:600 8px inherit;cursor:pointer;}
    .ds-il-chip:hover{color:var(--ds-text,#fff);border-color:var(--ds-text-muted,#737b87);}
    .ds-il-chip.active{background:color-mix(in srgb,var(--ds-accent,#7f8792) 15%,var(--ds-panel-2,#161a23));border-color:var(--ds-accent,#7f8792);color:var(--ds-text,#fff);box-shadow:inset 0 -2px 0 var(--ds-accent,#7f8792),0 0 0 1px color-mix(in srgb,var(--ds-accent,#7f8792) 8%,transparent);}
    .ds-il-chip.active:hover{background:color-mix(in srgb,var(--ds-accent,#7f8792) 19%,var(--ds-panel-2,#161a23));}
    .ds-il-resample{display:grid;grid-template-columns:28px minmax(0,1fr) 28px;gap:4px;}
    .ds-il-resample>button,.ds-il-resample-dd{height:var(--ds-ui-control-h,30px);border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#161a23);color:var(--ds-text-muted,#a1a8b3);cursor:pointer;}
    .ds-il-resample-dd{display:flex;align-items:center;justify-content:space-between;padding:0 9px;font:600 8px inherit;}
    .ds-il-upscale{height:30px;border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#161a23);color:var(--ds-text-muted,#a1a8b3);font:600 9px inherit;cursor:pointer;}
    .ds-il-upscale.on{background:var(--ds-panel-3,#262c34);border-color:var(--ds-text-muted,#69727e);color:var(--ds-text,#fff);}
    .ds-il-preview{position:relative;flex:1 1 0;min-height:120px;width:100%;border:1px solid var(--ds-border,#242a36);border-radius:6px;background:var(--ds-panel,#12151c);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;}
    .ds-il-preview img{display:none;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;}
    .ds-il-placeholder{display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--ds-text-muted,#8d95a1);font-size:9px;user-select:none;}
    .ds-il-placeholder strong{color:var(--ds-text,#d8dde4);font-size:10px;}
    .ds-il-resbadge{position:absolute;right:6px;bottom:5px;padding:2px 5px;border-radius:3px;background:rgba(0,0,0,.6);color:#fff;font-size:8px;pointer-events:none;}
    .ds-il-dropdown{position:fixed;z-index:100001;max-height:360px;overflow:auto;background:var(--ds-panel,#15181e);border:1px solid var(--ds-border,#303640);border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.55);padding:4px;}
    .ds-il-dropdown button{display:block;width:100%;text-align:left;padding:7px 8px;border:0;border-radius:4px;background:transparent;color:var(--ds-text,#ddd);font:9px inherit;cursor:pointer;}
    .ds-il-dropdown button:hover{background:var(--ds-panel-3,#252a31);}
    .ds-il-respopup{position:fixed;z-index:100002;min-width:180px;background:var(--ds-panel,#15181e);border:1px solid var(--ds-border,#303640);border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.55);padding:4px;}
    .ds-il-respopup div{padding:7px 8px;border-radius:4px;cursor:pointer;display:flex;flex-direction:column;gap:2px;}
    .ds-il-respopup div:hover,.ds-il-respopup div.active{background:var(--ds-panel-3,#252a31);}
    .ds-il-respopup b{font-size:9px;color:var(--ds-text,#eee);}.ds-il-respopup span{font-size:8px;color:var(--ds-text-muted,#8d95a1);}
    .ds-il-cover-extra{display:flex;gap:6px;margin-top:6px;}
    .ds-il-fillcrop{flex:1;display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--ds-border,#242a36);border-radius:5px;overflow:hidden;background:var(--ds-panel-2,#161a23);}
    .ds-il-fillcrop div{display:flex;align-items:center;justify-content:center;height:27px;font-size:9px;color:var(--ds-text-muted,#a1a8b3);cursor:pointer;}.ds-il-fillcrop div:hover{background:var(--ds-panel-3,#252a31);color:var(--ds-text,#fff);}.ds-il-fillcrop div.active{background:var(--ds-panel-3,#262c34);color:var(--ds-text,#fff);box-shadow:inset 0 -2px 0 var(--ds-text-muted,#7b8490);}
    .ds-il-anchor{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:3px;width:78px;height:78px;margin:6px auto 0;padding:5px;box-sizing:border-box;border:1px solid var(--ds-border,#242a36);border-radius:5px;background:var(--ds-panel-2,#161a23);}
    .ds-il-anchor-cell{border:0;border-radius:2px;background:var(--ds-panel-3,#252a31);cursor:pointer;}.ds-il-anchor-cell:hover{background:#3a414b;}.ds-il-anchor-cell.active{background:#606a76;}
    .ds-il-inline-label{display:flex;align-items:center;color:var(--ds-text-muted,#a1a8b3);font-size:8px;font-weight:700;text-transform:uppercase;padding:0 5px;white-space:nowrap;}
    .ds-il-wh-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:8px!important;}
    @media (max-width:360px){.ds-il-modegrid{gap:3px}.ds-il-mode{font-size:8px}.ds-il-snaprow{grid-template-columns:repeat(6,1fr)}.ds-il-snaplabel{grid-column:1/-1}.ds-il-preview{min-height:100px}}
  `;
  document.head.appendChild(style);
}

function getImages(node) {
  const w = node._dsILImageWidget;
  const values = Array.isArray(w?.options?.values) ? w.options.values.filter(isImage) : [];
  node._dsILImages = values;
  return values;
}

function setImage(node, filename) {
  const w = node._dsILImageWidget;
  if (!w) return;
  w.value = filename;
  node._dsILSelected = filename;
  w.callback?.(filename);
  node._dsILRefresh?.();
  setTimeout(markWorkflowDirty, 0);
}

async function upload(node, file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Please select an image file.");
  const fd = new FormData();
  fd.append("image", file, file.name || `clipboard-${Date.now()}.png`);
  fd.append("type", "input"); fd.append("overwrite", "true");
  const response = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  if (!response.ok) throw new Error(`Image upload failed (${response.status}).`);
  const data = await response.json();
  if (!data?.name) throw new Error("ComfyUI did not return an uploaded filename.");
  const filename = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  const w = node._dsILImageWidget;
  w.options ||= {}; w.options.values ||= [];
  if (!w.options.values.includes(filename)) w.options.values.push(filename);
  setImage(node, filename);
}

async function pasteImage(node) {
  if (!navigator.clipboard?.read) throw new Error("Clipboard image access is unavailable in this browser.");
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find(t => t.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    await upload(node, new File([blob], `clipboard-${Date.now()}.${type.split("/")[1] || "png"}`, { type }));
    return;
  }
  throw new Error("Your clipboard does not contain an image.");
}

function openImageDropdown(node) {
  document.querySelector(".ds-il-dropdown")?.remove();
  const popup = document.createElement("div"); popup.className="ds-il-dropdown";
  const r=node._dsILName.getBoundingClientRect(); popup.style.left=`${r.left}px`; popup.style.top=`${r.bottom+3}px`; popup.style.width=`${Math.max(240,r.width)}px`;
  for(const fn of getImages(node)){
    const b=document.createElement("button"); b.textContent=fn; b.title=fn; b.onclick=e=>{e.stopPropagation();setImage(node,fn);popup.remove();}; popup.appendChild(b);
  }
  if(!popup.children.length){const empty=document.createElement("div");empty.textContent="No images in input/";empty.style.cssText="padding:10px;color:var(--ds-text-muted,#888);font-size:9px;text-align:center";popup.appendChild(empty);}
  document.body.appendChild(popup);
  const close=e=>{if(!popup.contains(e.target)){popup.remove();document.removeEventListener("pointerdown",close,true)}};setTimeout(()=>document.addEventListener("pointerdown",close,true),0);
}

function renderGlobal(node) {
  const state=readState(node); const wrap=document.createElement("div"); wrap.className="ds-il-global";
  const snap=document.createElement("div"); snap.className="ds-il-snaprow";
  const label=document.createElement("div");label.className="ds-il-snaplabel";label.textContent="Snap";snap.appendChild(label);
  for(const v of [0,8,16,32,64]){const b=document.createElement("button");b.className="ds-il-chip"+(Number(state.snap)===v?" active":"");b.textContent=v?String(v):"Off";b.title=v?`Snap output down to multiples of ${v}px`:`Disable snapping`;b.onclick=e=>{e.stopPropagation();saveState(node,{snap:v});renderResize(node);node._dsILUpdateInfo?.();};snap.appendChild(b)}
  wrap.appendChild(snap);
  const rs=document.createElement("div");rs.className="ds-il-resample";
  const prev=document.createElement("button");prev.textContent="◀";prev.title="Previous resample filter";
  const dd=document.createElement("button");dd.className="ds-il-resample-dd";dd.innerHTML=`<span>Resample: ${({auto:"Auto",nearest:"Nearest",bilinear:"Bilinear",bicubic:"Bicubic",lanczos:"Lanczos"})[state.resample]||"Auto"}</span><span>▼</span>`;
  const next=document.createElement("button");next.textContent="▶";next.title="Next resample filter";rs.append(prev,dd,next);wrap.appendChild(rs);
  const ids=["auto","nearest","bilinear","bicubic","lanczos"];
  const setRes=id=>{saveState(node,{resample:id});renderResize(node);node._dsILUpdateInfo?.();};
  const cycle=d=>{const cur=readState(node).resample;const i=Math.max(0,ids.indexOf(cur));setRes(ids[(i+d+ids.length)%ids.length]);};
  prev.onclick=e=>{e.stopPropagation();cycle(-1)};next.onclick=e=>{e.stopPropagation();cycle(1)};
  dd.onclick=e=>{e.stopPropagation();document.querySelector(".ds-il-respopup")?.remove();const p=document.createElement("div");p.className="ds-il-respopup";const r=dd.getBoundingClientRect();p.style.left=`${r.left}px`;p.style.top=`${r.bottom+3}px`;p.style.width=`${r.width}px`;const hints={auto:"Lanczos when shrinking · Bilinear when growing",nearest:"Pixel-perfect",bilinear:"Fast · smooth",bicubic:"Slower · sharper",lanczos:"Slowest · sharpest"};for(const id of ids){const it=document.createElement("div");it.className=id===readState(node).resample?"active":"";it.innerHTML=`<b>${id[0].toUpperCase()+id.slice(1)}</b><span>${hints[id]}</span>`;it.onclick=x=>{x.stopPropagation();setRes(id);p.remove()};p.appendChild(it)}document.body.appendChild(p);const close=x=>{if(!p.contains(x.target)){p.remove();document.removeEventListener("pointerdown",close,true)}};setTimeout(()=>document.addEventListener("pointerdown",close,true),0)};
  const up=document.createElement("button");up.className="ds-il-upscale"+(state.allow_upscale!==false?" on":"");up.textContent=state.allow_upscale!==false?"Upscaling: On":"Upscaling: Off";up.title="Allow resize modes to enlarge images";up.onclick=e=>{e.stopPropagation();saveState(node,{allow_upscale:!(readState(node).allow_upscale!==false)});renderResize(node);node._dsILUpdateInfo?.()};wrap.appendChild(up);
  return wrap;
}

function renderResize(node) {
  const host=node._dsILPanelHost; if(!host)return;
  host.innerHTML="";
  let state=readState(node);
  // Older workflows may still contain one of the four previously exposed
  // W×H/ratio/pad modes. They are intentionally removed from the compact DS
  // UI; normalize them to Off instead of leaving an invisible/ambiguous mode.
  if(!VISIBLE_MODES.has(state.mode)) {
    state=saveState(node,{mode:"off"});
  }
  const modes=document.createElement("div");modes.className="ds-il-modegrid";
  for(const [id,label,title] of MODES){const b=document.createElement("button");b.type="button";b.className="ds-il-mode"+(state.mode===id?" active":"");b.textContent=label;b.title=title;b.onclick=e=>{e.stopPropagation();saveState(node,{mode:id});renderResize(node);node._dsILUpdateInfo?.();ensureExpandedSize(node);setTimeout(markWorkflowDirty,0)};modes.appendChild(b)}
  host.appendChild(modes);
  if(state.mode!=="off"){
    const panel=buildModePanel(state.mode,node,state,(n,s)=>saveState(n,s),()=>{node._dsILUpdateInfo?.();renderResize(node);ensureExpandedSize(node);setTimeout(markWorkflowDirty,0)},STATE_PROP,{previewMaxW:110,previewMaxH:72,cropOnly:false,inputDims:node._dsILGetDims?.(),oneLine:true});
    if(panel){panel.classList.add("ds-il-panelhost");host.appendChild(panel)}
  }
  host.appendChild(renderGlobal(node));
  // Respect the actual collapsed state.  renderResize() is also called by
  // mode changes and workflow restore; it must never reopen the shell behind
  // the user's back.
  node._dsILResizeShell.style.display = node.properties?.dsImageLoaderExpanded ? "block" : "none";
}

function requiredExpandedHeight(node){
  const panel=node._dsILPanelHost;
  if(!panel)return 0;
  const measured=Math.ceil(panel.scrollHeight);
  const fixed=30+6+24+6+120+18; // filebar + gaps + info + preview floor + node/title breathing room
  return Math.max(480, measured+fixed);
}
function ensureExpandedSize(node){
  if(!node.properties?.dsImageLoaderExpanded)return;
  requestAnimationFrame(()=>{
    const minH=requiredExpandedHeight(node);
    if((Number(node.size?.[1])||0)<minH){
      node.size[1]=minH;
      node.setDirtyCanvas?.(true,true);
    }
  });
}

function setup(node){
  node.title = "DS Load Image";
  node.properties ||= {};
  node.properties.dsDisplayName = "DS Load Image";
  injectDSLoaderCSS();injectResizePanelCSS();
  node.properties ||= {};
  const imageWidget=node.widgets?.find(w=>w.name==="image");
  const stateWidget=node.widgets?.find(w=>w.name===STATE_WIDGET);
  node._dsILImageWidget=imageWidget;
  if(stateWidget && !node.properties[STATE_PROP] && stateWidget.value){try{node.properties[STATE_PROP]=stateWidget.value}catch{}}
  if(!node.properties[STATE_PROP])saveState(node,{});
  for(const w of node.widgets||[]){w.hidden=true;w.computeSize=()=>[0,0];if(w.element){w.element.style.display="none";w.element.style.pointerEvents="none"}}

  const root=document.createElement("div");root.className="ds-il-root-v2";root.dataset.dsThemed="true";
  const filebar=document.createElement("div");filebar.className="ds-il-filebar ds-il-interactive";
  const name=document.createElement("div");name.className="ds-il-name ds-il-interactive";name.textContent=imageWidget?.value||"choose image";name.title=imageWidget?.value||"";
  const uploadBtn=document.createElement("button");uploadBtn.type="button";uploadBtn.className="ds-il-btn ds-il-upload ds-il-interactive";uploadBtn.textContent="Upload";
  const prev=document.createElement("button");prev.type="button";prev.className="ds-il-btn ds-il-interactive";prev.textContent="◀";prev.title="Previous image";
  const next=document.createElement("button");next.type="button";next.className="ds-il-btn ds-il-interactive";next.textContent="▶";next.title="Next image";
  const paste=document.createElement("button");paste.type="button";paste.className="ds-il-btn ds-il-interactive";paste.textContent="⎘";paste.title="Paste image from clipboard";
  const expand=document.createElement("button");expand.type="button";expand.className="ds-il-btn ds-il-interactive";expand.textContent=node.properties.dsImageLoaderExpanded?"▴":"▾";expand.title="Show resize options";
  filebar.append(name,uploadBtn,prev,next,paste,expand);root.appendChild(filebar);

  const info=document.createElement("div");info.className="ds-il-info";info.dataset.dsThemed="true";root.appendChild(info);

  const shell=document.createElement("div");shell.className="ds-il-resize-shell ds-il-interactive";const host=document.createElement("div");host.className="ds-il-panelhost";shell.appendChild(host);root.appendChild(shell);

  const preview=document.createElement("div");preview.className="ds-il-preview ds-il-interactive";
  const img=document.createElement("img");const ph=document.createElement("div");ph.className="ds-il-placeholder";ph.innerHTML="<strong>DS IMAGE LOADER</strong><span>click, drop, or paste</span>";
  const badge=document.createElement("div");badge.className="ds-il-resbadge";badge.textContent="INPUT — × — · OUTPUT — × —";preview.append(img,ph,badge);root.appendChild(preview);
  const fileInput=document.createElement("input");fileInput.type="file";fileInput.accept="image/*";fileInput.style.cssText="position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0";root.appendChild(fileInput);

  // Leave a native LiteGraph resize zone below the DOM widget. Current
  // LiteGraph uses computeLayoutSize() for DOM widgets; getHeight() is only
  // preferred sizing and does not cap the allocated widget height. maxHeight
  // is the supported cap, so the native bottom corners remain hit-testable.
  const widget=node.addDOMWidget("ds_image_loader_ui_v2","custom",root,{
    serialize:false,
    hideOnZoom:false,
    margin:0,
    getMinHeight:()=>180,
    getMaxHeight:()=>Math.max(180,(Number(node.size?.[1])||300)-18)
  });
  normalizeDSWidgetHost(root);
  node._dsILWidget=widget;node._dsILRoot=root;node._dsILPanelHost=host;node._dsILResizeShell=shell;node._dsILPreview=img;node._dsILPlaceholder=ph;node._dsILName=name;node._dsILInfo=info;

  // Fresh LiteGraph nodes start at roughly 210x60. Give only those new nodes
  // the DS default size; never overwrite a size restored from a workflow.
  const sw=Number(node.size?.[0])||0, sh=Number(node.size?.[1])||0;
  if(sw <= 220 && sh <= 80){
    if(node.setSize) node.setSize([360,300]);
    else node.size=[360,300];
  }
  node.shape="round";

  widget.onPointerDown=function(pointer){
    const target=pointer?.eDown?.target;
    return !!target?.closest?.("button,input,select,textarea,.ds-il-name,.ds-il-preview,.ds-il-rp-panel,.ds-il-panelhost");
  };

  const updateInfo=()=>{
    const W=img.naturalWidth||0,H=img.naturalHeight||0,out=previewResize(W,H,readState(node));
    info.innerHTML=W?`<span>INPUT <b>${W} × ${H}</b></span><span class="arrow">→</span><span>OUTPUT <b>${out.w} × ${out.h}</b></span>`:`<span>Load an image to preview output dimensions</span>`;
    badge.textContent=W?`INPUT ${W} × ${H}  ·  OUTPUT ${out.w} × ${out.h}`:"INPUT — × — · OUTPUT — × —";
  };
  node._dsILUpdateInfo=updateInfo;node._dsILGetDims=()=>({w:img.naturalWidth||0,h:img.naturalHeight||0});
  node._dsILRefresh=()=>{const fn=imageWidget?.value||node._dsILSelected||"";if(fn){name.textContent=fn;name.title=fn;img.src=imageURL(fn);img.style.display="block";ph.style.display="none"}else{name.textContent="choose image";name.title="";img.removeAttribute("src");img.style.display="none";ph.style.display="flex"}updateInfo()};

  const openPicker=()=>fileInput.click();uploadBtn.onclick=e=>{e.stopPropagation();openPicker()};name.onclick=e=>{e.stopPropagation();openImageDropdown(node)};preview.onclick=e=>{e.stopPropagation();openPicker()};paste.onclick=async e=>{e.stopPropagation();try{await pasteImage(node)}catch(err){console.error("[DS Image Loader] paste",err);alert(err.message)}};
  fileInput.onchange=async()=>{const f=fileInput.files?.[0];fileInput.value="";if(!f)return;try{await upload(node,f)}catch(err){console.error("[DS Image Loader] upload",err);alert(err.message)}};
  const navigate=d=>{const vals=getImages(node),cur=imageWidget?.value||"";if(vals.length<2)return;const i=vals.indexOf(cur);setImage(node,vals[(i+d+vals.length)%vals.length])};
  prev.onclick=e=>{e.stopPropagation();navigate(-1)};next.onclick=e=>{e.stopPropagation();navigate(1)};
  expand.onclick=e=>{e.stopPropagation();const on=!node.properties.dsImageLoaderExpanded;node.properties.dsImageLoaderExpanded=on;expand.textContent=on?"▴":"▾";expand.title=on?"Hide resize options":"Show resize options";shell.style.display=on?"block":"none";if(on){renderResize(node);ensureExpandedSize(node)}else{renderResize(node)};node.setDirtyCanvas?.(true,true);setTimeout(markWorkflowDirty,0)};
  preview.addEventListener("dragover",e=>{if(e.dataTransfer?.types?.includes("Files")){e.preventDefault();e.dataTransfer.dropEffect="copy"}});
  preview.addEventListener("drop",async e=>{e.preventDefault();e.stopPropagation();const f=e.dataTransfer?.files?.[0];if(f)try{await upload(node,f)}catch(err){alert(err.message)}});
  root.addEventListener("paste",async e=>{const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith("image/"));if(item){e.preventDefault();try{await upload(node,item.getAsFile())}catch(err){console.error(err)}}});
  img.onload=()=>{updateInfo();ensureExpandedSize(node);node.setDirtyCanvas?.(true,true)};
  if(imageWidget){const old=imageWidget.callback;imageWidget.callback=function(v){old?.apply(this,arguments);node._dsILSelected=v;node._dsILRefresh?.();};}
  const oldConfigure=node.onConfigure;node.onConfigure=function(){oldConfigure?.apply(this,arguments);setTimeout(()=>{const sw=this.widgets?.find(w=>w.name===STATE_WIDGET);if(sw?.value&&!this.properties?.[STATE_PROP])this.properties[STATE_PROP]=sw.value;node._dsILRefresh?.();shell.style.display=this.properties.dsImageLoaderExpanded?"block":"none";renderResize(node);ensureExpandedSize(node)},50)};
  const oldRemoved=node.onRemoved;node.onRemoved=function(){document.querySelector(".ds-il-dropdown")?.remove();document.querySelector(".ds-il-respopup")?.remove();if(oldRemoved)oldRemoved.apply(this,arguments)};

  shell.style.display=node.properties.dsImageLoaderExpanded?"block":"none";
  node._dsILRefresh();renderResize(node);if(node.properties.dsImageLoaderExpanded)ensureExpandedSize(node);
  try{window.DSGlobalTheme?.bindNode?.(root,node)}catch{}
}

let activeNode=null;
window.addEventListener("keydown",async e=>{
  if(!activeNode)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="v"&&!/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||"")&&!e.target?.isContentEditable){e.preventDefault();try{await pasteImage(activeNode)}catch(err){console.error("[DS Image Loader] paste",err)}}
  if(e.key!=="PageUp"&&e.key!=="PageDown")return;
  if(/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||"")||e.target?.isContentEditable)return;
  e.preventDefault();const vals=getImages(activeNode),cur=activeNode._dsILImageWidget?.value||"",i=vals.indexOf(cur);if(vals.length)setImage(activeNode,vals[(i+(e.key==="PageDown"?1:-1)+vals.length)%vals.length]);
},true);

app.registerExtension({
  name:"DeathshotArsenal.DSImageLoaderV2",
  beforeRegisterNodeDef(nodeType,nodeData){
    if(nodeData.name!=="DS_ImageLoader")return;
    // Keep the visible frontend title consistent even for workflows that
    // contain an older persisted "DS Image Loader" title.
    try { nodeData.display_name = "DS Load Image"; } catch {}
    try { nodeType.title = "DS Load Image"; } catch {}
    const oldSel=nodeType.prototype.onSelected;nodeType.prototype.onSelected=function(){activeNode=this;return oldSel?.apply(this,arguments)};
    const oldDes=nodeType.prototype.onDeselected;nodeType.prototype.onDeselected=function(){if(activeNode===this)activeNode=null;return oldDes?.apply(this,arguments)};
  },
  nodeCreated(node){if(node.comfyClass==="DS_ImageLoader")setup(node)}
});
