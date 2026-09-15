import { app } from "/scripts/app.js";

const MAX_LORAS = 32;
const STORAGE_KEY = "DS_LoRaLoader.settings.v1";
const CSS_HREF = "/extensions/DeathshotArsenal/LoRa%20Loader/ds_lora_loader.css?v=14";

if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

const DEFAULT_SETTINGS = {
  defaultStrength: 0.5,
  strengthStep: 0.05,
  separateClipStrength: false,
  triggerSeparator: ", ",
  memoryMode: "Standard",
  hideExtension: true,
  civitaiLookup: true,
  showThumbnails: true,
  civitaiApiKey: "",
  siteMode: "Standard",
  allowNsfwPreviews: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return {...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {})};
  } catch { return {...DEFAULT_SETTINGS}; }
}
function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function defaultRow(settings) {
  const def = Number(settings?.defaultStrength) || 0.5;
  return {
    id: `lora-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    modelStrength: def,
    clipStrength: def,
    videoStrength: 1.0,
    audioStrength: 1.0,
    enabled: true,
    selectedTriggers: [],
  };
}
function cleanRow(row, settings, i) {
  const r = row && typeof row === "object" ? row : {};
  const def = Number(settings?.defaultStrength) || 0.5;
  const strength = Number.isFinite(Number(r.modelStrength ?? r.strength)) ? Number(r.modelStrength ?? r.strength) : def;
  return {
    id: String(r.id || `lora-${i + 1}-${Date.now()}`),
    name: String(r.name || ""),
    modelStrength: strength,
    clipStrength: Number.isFinite(Number(r.clipStrength)) ? Number(r.clipStrength) : strength,
    videoStrength: Number.isFinite(Number(r.videoStrength)) ? Number(r.videoStrength) : 1.0,
    audioStrength: Number.isFinite(Number(r.audioStrength)) ? Number(r.audioStrength) : 1.0,
    enabled: r.enabled !== false,
    selectedTriggers: Array.isArray(r.selectedTriggers) ? r.selectedTriggers.map(String) : [],
  };
}

function decodeState(raw) {
  try {
    const st = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    if (!st || typeof st !== "object") throw new Error();
    const settings = {...loadSettings(), ...(st.settings || {})};
    const rows = Array.isArray(st.rows) ? st.rows.slice(0, MAX_LORAS).map((r,i)=>cleanRow(r, settings, i)) : [];
    const mode = st.mode === "video" ? "video" : "image";
    return {version: 1, mode, masterEnabled: st.masterEnabled !== false, rows, settings};
  } catch {
    return {version: 1, mode: "image", masterEnabled: true, rows: [], settings: loadSettings()};
  }
}

function compileTriggers(node) {
  if (!node?._dsLora || !node._dsLora.masterEnabled) return "";
  const sep = node._dsLora.settings?.triggerSeparator ?? ", ";
  const parts = [];
  for (const row of node._dsLora.rows || []) {
    if (!row.enabled || !row.name) continue;
    for (const tag of row.selectedTriggers || []) {
      const s = String(tag).trim();
      if (s) parts.push(s);
    }
  }
  const seen = new Set();
  const unique = [];
  for (const t of parts) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(t);
    }
  }
  return unique.join(sep);
}

function notifyDownstream(node) {
  const graph = node?.graph || app?.graph;
  if (!graph || graph.is_loading || !node?.outputs) return;
  for (const out of node.outputs) {
    if (out.name === "triggers" && out.links) {
      for (const linkId of out.links) {
        const link = graph.links?.[linkId];
        if (link) {
          const target = graph.getNodeById?.(link.target_id);
          if (target) {
            try {
              target.onInputChanged?.(link.target_slot);
              target.onConnectionsChange?.();
              target._dsUpdatePrompt?.();
              target._dsUpdateEffectivePrompt?.();
              target._dsRender?.();
              target.setDirtyCanvas?.(true, true);
            } catch {}
          }
        }
      }
    }
  }
  try { graph.setDirtyCanvas?.(true, true); } catch {}
}

function serialize(node) {
  if (!node?._dsLora) return;
  const graph = node.graph || app?.graph;
  if (graph?.is_loading) return; // Prevent overwriting during workflow load

  const triggerStr = compileTriggers(node);
  const state = {
    version: 1,
    mode: node._dsLora.mode || "image",
    masterEnabled: node._dsLora.masterEnabled,
    rows: (node._dsLora.rows || []).map(clone),
    settings: {...loadSettings(), ...node._dsLora.settings, civitaiApiKey: undefined},
  };
  delete state.settings.civitaiApiKey;

  node.properties = node.properties || {};
  node.properties.ds_lora_state = state;
  node.properties.triggers = triggerStr;
  node.properties.lora_triggers = triggerStr;

  node.triggers = triggerStr;
  node.lora_triggers = triggerStr;

  if (node.outputs) {
    for (let i = 0; i < node.outputs.length; i++) {
      if (node.outputs[i].name === "triggers") {
        node.outputs[i]._data = triggerStr;
        node.outputs[i].value = triggerStr;
      }
    }
  }

  const hidden = ensureHiddenWidget(node);
  if (hidden) hidden.value = JSON.stringify(state);

  notifyDownstream(node);
  try { node.setDirtyCanvas?.(true, true); } catch {}
  // Notify ComfyUI that workflow changed so auto-save writes to localStorage
  try { graph?.afterChange?.(); } catch {}
}

function ensureHiddenWidget(node) {
  let w = node.widgets?.find(x => x.name === "LoaderState");
  if (!w) {
    w = {
      name: "LoaderState",
      type: "hidden",
      value: "{}",
      serialize: true,
      computeSize: () => [0, -4],
      draw: () => {},
    };
    node.widgets ||= [];
    node.widgets.push(w);
  }
  w.type = "hidden";
  w.hidden = true;
  w.computeSize = () => [0, -4];
  w.draw = () => {};
  w.serialize = true;
  return w;
}

function displayName(name, hideExtension) {
  if (!name) return "Select a LoRA…";
  return hideExtension ? name.replace(/\.safetensors$/i, "") : name;
}

async function getLoras() {
  try {
    const r = await fetch("/ds/loras", {cache:"no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[DS LoRa Loader] failed to list loras:", e);
    return [];
  }
}

async function fetchMetadata(node, row, forceOnline=false) {
  if (!row.name) return {ok:false, error:"Choose a LoRA first.", trainedWords:[]};
  const settings = {...DEFAULT_SETTINGS, ...loadSettings(), ...node._dsLora.settings};
  try {
    const r = await fetch("/ds/lora_metadata", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        name: row.name,
        apiKey: settings.civitaiApiKey || "",
        forceOnline,
        allowNsfw: !!settings.allowNsfwPreviews,
        siteMode: settings.siteMode || "Standard",
      }),
    });
    return await r.json();
  } catch (e) {
    return {ok:false, error:String(e), trainedWords:[], source:"offline"};
  }
}

function themeSource(source) {
  let el = source;
  while (el) {
    const cs = getComputedStyle(el);
    if (cs.getPropertyValue("--ds-accent").trim() || el.dataset?.dsTheme || el.dataset?.dsThemed === "true") {
      return { el, cs };
    }
    el = el.parentElement;
  }
  const themed = document.querySelector('[data-ds-theme], [data-ds-node-base="true"]');
  return themed ? { el: themed, cs: getComputedStyle(themed) } : { el: source, cs: getComputedStyle(source) };
}

function accentCss(el, node) {
  if (!el) return;
  const { cs } = themeSource(node?._dsLora?.dom || el);
  const accent = cs.getPropertyValue("--ds-accent").trim();
  if (accent) el.style.setProperty("--ds-lora-accent", accent);
}

function inheritThemeVars(source, target) {
  if (!source || !target) return;
  target.dataset.dsThemed = "true";
  const { cs } = themeSource(source);
  const vars = [
    "--ds-accent", "--ds-text", "--ds-text-muted", "--ds-border",
    "--ds-panel", "--ds-panel-2", "--ds-input-bg", "--ds-hover",
    "--ds-btn-bg", "--ds-btn-hover", "--ds-ui-border", "--ds-font",
    "--ds-font-family", "--ds-font-size", "--ds-scrollbar", "--ds-bg",
    "--ds-error", "--ds-selection", "--ds-accent-contrast"
  ];
  for (const name of vars) {
    const value = cs.getPropertyValue(name).trim();
    if (value) target.style.setProperty(name, value);
  }
  const accent = cs.getPropertyValue("--ds-accent").trim();
  if (accent) target.style.setProperty("--ds-lora-accent", accent);
}

function placeSidePanel(panel, anchor, preferred = "right") {
  const rect = anchor?.getBoundingClientRect?.();
  const width = panel.offsetWidth || 380;
  const gap = 10;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let side = preferred;
  let left = rect ? rect.right + gap : Math.max(12, (viewportW - width) / 2);
  if (rect && left + width > viewportW - 10) {
    side = "left";
    left = rect.left - width - gap;
  }
  if (left < 10) {
    side = "right";
    left = rect ? rect.right + gap : 10;
    if (left + width > viewportW - 10) left = Math.max(10, viewportW - width - 10);
  }
  const panelH = panel.offsetHeight || 380;
  let top = rect ? rect.top : 20;
  if (top + panelH > viewportH - 12) {
    top = Math.max(12, viewportH - panelH - 12);
  }
  if (top < 12) top = 12;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.dataset.side = side;
}

function installOutsideClose(panel, anchor, onClose) {
  const handler = e => {
    if (panel.contains(e.target) || anchor?.contains?.(e.target)) return;
    onClose();
    document.removeEventListener("pointerdown", handler, true);
  };
  requestAnimationFrame(() => document.addEventListener("pointerdown", handler, true));
  return handler;
}

function makeButton(content, cls, fn) {
  const b = document.createElement("button");
  b.type = "button";
  if (typeof content === "string" && content.includes("<svg")) {
    b.innerHTML = content;
  } else {
    b.textContent = content;
  }
  b.className = cls;
  b.addEventListener("pointerdown", e => e.stopPropagation());
  b.addEventListener("click", e => { e.stopPropagation(); fn(e); });
  return b;
}

const INFO_ICON_SVG = `<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"></circle><line x1="10" y1="9.2" x2="10" y2="14.5"></line><circle cx="10" cy="5.8" r="0.75" fill="currentColor"></circle></svg>`;

function renderRow(node, row, index, allLoras) {
  const root = document.createElement("div");
  root.className = "ds-lora-row" + (row.enabled ? "" : " is-off") + (!node._dsLora.masterEnabled ? " is-master-bypassed" : "");
  root.dataset.id = row.id;
  root.draggable = true;

  const handle = document.createElement("span");
  handle.className = "ds-lora-drag";
  handle.textContent = "≡";
  handle.title = "Drag to reorder";

  const selector = document.createElement("div");
  selector.className = "ds-lora-selector";
  const selectBtn = document.createElement("button");
  selectBtn.type = "button"; selectBtn.className = "ds-lora-select";
  selectBtn.textContent = displayName(row.name, node._dsLora.settings.hideExtension);
  selectBtn.title = row.name || "Choose LoRA";
  selector.appendChild(selectBtn);

  const menu = document.createElement("div");
  menu.className = "ds-lora-menu";
  menu.hidden = true;
  const search = document.createElement("input");
  search.className = "ds-lora-search";
  search.placeholder = "Search LoRAs…";
  const list = document.createElement("div");
  list.className = "ds-lora-options";
  menu.append(search, list);
  menu.dataset.dsThemed = "true";
  document.body.appendChild(menu);
  inheritThemeVars(root, menu);

  let outsideHandler = null;
  const closeMenu = () => {
    menu.hidden = true;
    if (outsideHandler) { document.removeEventListener("pointerdown", outsideHandler, true); outsideHandler = null; }
  };
  const fillOptions = (term="") => {
    list.textContent = "";
    const q = term.trim().toLowerCase();
    const filtered = allLoras.filter(x => String(x).toLowerCase().includes(q)).slice(0, 250);
    if (!filtered.length) {
      const empty = document.createElement("div"); empty.className="ds-lora-option is-empty"; empty.textContent="No LoRAs found"; list.appendChild(empty);
      return;
    }
    for (const name of filtered) {
      const item = document.createElement("button");
      item.type="button"; item.className="ds-lora-option";
      item.textContent = displayName(name, node._dsLora.settings.hideExtension);
      item.title = name;
      item.addEventListener("click", e => {
        e.stopPropagation(); row.name=name; row.selectedTriggers=[]; selectBtn.textContent=displayName(name,node._dsLora.settings.hideExtension); selectBtn.title=name;
        closeMenu(); node._dsRender(); serialize(node);
      });
      list.appendChild(item);
    }
  };
  selectBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (!menu.hidden) { closeMenu(); return; }
    inheritThemeVars(root, menu);
    menu.style.width=`${Math.max(260, Math.min(420, root.getBoundingClientRect().width))}px`;
    menu.hidden=false;
    placeSidePanel(menu, selectBtn, "right");
    search.value=""; fillOptions(); search.focus();
    outsideHandler = installOutsideClose(menu, selectBtn, closeMenu);
  });
  search.addEventListener("input", ()=>fillOptions(search.value));
  root.appendChild(handle); root.appendChild(selector);

  const strengthWrap = document.createElement("div");
  strengthWrap.className = "ds-lora-strengths";
  const makeNum = (label, key, tooltip) => {
    const wrap=document.createElement("label"); wrap.className="ds-lora-num";
    wrap.title = tooltip || label;
    const lab=document.createElement("span"); lab.textContent=label;
    const shell=document.createElement("span"); shell.className="ds-lora-number-shell";
    const val = row[key] != null ? row[key] : (key === "videoStrength" || key === "audioStrength" ? 1.0 : 0.5);
    const inp=document.createElement("input"); inp.type="number"; inp.step="any"; inp.min="-10"; inp.max="10"; inp.value=String(val);
    inp.addEventListener("pointerdown",e=>e.stopPropagation());
    const commit=(n)=>{ if(Number.isFinite(n)){row[key]=Math.min(10,Math.max(-10,n));inp.value=String(row[key]);serialize(node);}};
    inp.addEventListener("change",()=>commit(Number(inp.value)));
    const stepper=document.createElement("span"); stepper.className="ds-lora-stepper";
    const stepVal = Number(node._dsLora.settings.strengthStep ?? .05);
    const up=makeButton("▲","ds-lora-step",()=>commit(Number(row[key] != null ? row[key] : val) + stepVal));
    const down=makeButton("▼","ds-lora-step",()=>commit(Number(row[key] != null ? row[key] : val) - stepVal));
    up.title=`Increase ${label}`; down.title=`Decrease ${label}`;
    stepper.append(up,down); shell.append(inp,stepper); wrap.append(lab,shell); return wrap;
  };
  if (node._dsLora.mode === "video") {
    strengthWrap.append(
      makeNum("S", "modelStrength", "Overall LoRA strength"),
      makeNum("V", "videoStrength", "Video branch strength"),
      makeNum("A", "audioStrength", "Audio branch strength")
    );
  } else if (node._dsLora.settings.separateClipStrength) {
    strengthWrap.append(
      makeNum("M", "modelStrength", "Model strength"),
      makeNum("C", "clipStrength", "CLIP strength")
    );
  } else {
    strengthWrap.append(makeNum("S", "modelStrength", "LoRA strength"));
  }

  const info = makeButton(INFO_ICON_SVG,"ds-lora-icon",()=>openTriggerModal(node,row,info));
  info.title="Trigger words & Civitai metadata";
  const toggle = makeButton(row.enabled ? "ON" : "OFF","ds-lora-toggle",()=>{row.enabled=!row.enabled; node._dsRender(); serialize(node);});
  toggle.classList.toggle("is-on", row.enabled && node._dsLora.masterEnabled);
  toggle.classList.toggle("is-row-off", !row.enabled);
  if (!node._dsLora.masterEnabled) toggle.classList.add("is-master-bypassed");
  toggle.title = node._dsLora.masterEnabled
    ? (row.enabled ? "LoRA enabled" : "LoRA bypassed")
    : (row.enabled ? "Saved as ON, but currently bypassed by ALL OFF" : "LoRA bypassed");
  const remove = makeButton("✖","ds-lora-remove",()=>{ if(node._dsLora.rows.length>1){node._dsLora.rows.splice(index,1); node._dsRender(); resizeNode(node,true); serialize(node);} });
  remove.title="Remove LoRA";
  root.append(strengthWrap,info,toggle,remove);

  root.addEventListener("dragstart", e => {
    node._dsLora.dragIndex=index;
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain", String(index));
  });
  root.addEventListener("dragover", e => { e.preventDefault(); root.classList.add("is-dragover"); });
  root.addEventListener("dragleave", () => root.classList.remove("is-dragover"));
  root.addEventListener("drop", e => {
    e.preventDefault(); root.classList.remove("is-dragover");
    const from=node._dsLora.dragIndex; if(!Number.isInteger(from)||from===index) return;
    const [moved]=node._dsLora.rows.splice(from,1); node._dsLora.rows.splice(index,0,moved);
    node._dsRender(); serialize(node);
  });
  root.addEventListener("dragend", ()=>{node._dsLora.dragIndex=null; root.classList.remove("is-dragover");});

  root._destroy=()=>{closeMenu();};
  return root;
}

function openTriggerModal(node,row,anchorEl) {
  const settings = {...DEFAULT_SETTINGS,...loadSettings(),...node._dsLora.settings};
  const modal=document.createElement("div"); modal.className="ds-lora-popover-host";
  const panel=document.createElement("div"); panel.className="ds-lora-modal ds-lora-side-panel";
  
  const head=document.createElement("div"); head.className="ds-lora-modal-head";
  const title=document.createElement("strong"); title.textContent=displayName(row.name,settings.hideExtension);
  const close=makeButton("×","ds-lora-close",()=>{ serialize(node); modal.remove(); });
  head.append(title,close);

  const body=document.createElement("div"); body.className="ds-lora-modal-body";
  const status=document.createElement("div"); status.className="ds-lora-status"; status.textContent="Loading metadata…";
  const tagsTitle=document.createElement("div"); tagsTitle.className="ds-lora-section-title"; tagsTitle.innerHTML=`<span>TRIGGER WORDS</span>`;
  const quick=document.createElement("div"); quick.className="ds-lora-quick";
  const allBtn=makeButton("all","ds-lora-quick-btn",()=>{ for(const t of tags) row.selectedTriggers=[...new Set([...row.selectedTriggers,t])]; renderTags(); serialize(node); });
  const noneBtn=makeButton("none","ds-lora-quick-btn",()=>{row.selectedTriggers=[];renderTags(); serialize(node);});
  const onlineBtn=settings.civitaiLookup?makeButton("from Civitai","ds-lora-quick-btn",async()=>{status.textContent="Looking up Civitai…"; const m=await fetchMetadata(node,row,true); tags=Array.from(new Set([...(m.trainedWords||[]),...tags])); if(m.images?.[0]) thumb.src=m.images[0]; status.textContent=m.ok?"Found on Civitai. Saved next to the file.":"Civitai lookup unavailable; using offline metadata."; renderTags(); serialize(node); }):null;
  quick.append(allBtn,noneBtn); if(onlineBtn)quick.append(onlineBtn);
  const tagsWrap=document.createElement("div"); tagsWrap.className="ds-lora-tags";
  let tags=[];
  const renderTags=()=>{
    tagsWrap.textContent="";
    for(const t of tags){
      const isSel = row.selectedTriggers.includes(t);
      const b=makeButton((isSel?"✓ ":"")+t,"ds-lora-tag",()=>{
        if(row.selectedTriggers.includes(t)) row.selectedTriggers=row.selectedTriggers.filter(x=>x!==t);
        else row.selectedTriggers.push(t);
        serialize(node);
        renderTags();
      });
      b.classList.toggle("is-selected", isSel);
      tagsWrap.appendChild(b);
    }
  };
  const addRow=document.createElement("div"); addRow.className="ds-lora-add-trigger";
  const custom=document.createElement("input"); custom.placeholder="add your own trigger word…";
  const add=makeButton("Add","ds-lora-add-btn",()=>{
    const v=custom.value.trim();
    if(v){
      tags=Array.from(new Set([...tags,v]));
      row.selectedTriggers.push(v);
      custom.value="";
      serialize(node);
      renderTags();
    }
  });
  addRow.append(custom,add);
  const thumb=document.createElement("img"); thumb.className="ds-lora-thumb"; thumb.hidden=true; thumb.alt="";
  thumb.onload = () => {
    placeSidePanel(panel, node._dsLora.dom, "right");
  };
  body.append(status,tagsTitle,quick,tagsWrap,addRow,thumb);

  const foot=document.createElement("div"); foot.className="ds-lora-modal-foot";
  const done=makeButton("Done","ds-lora-done",()=>{
    serialize(node);
    node._dsRender();
    modal.remove();
  });
  foot.appendChild(done);

  panel.append(head,body,foot); 
  modal.appendChild(panel); 
  document.body.appendChild(modal);

  inheritThemeVars(node._dsLora.dom, panel);
  accentCss(panel,node);

  const onKey = (e) => {
    if (e.key === "Escape") {
      serialize(node);
      node._dsRender();
      modal.remove();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  modal.addEventListener("pointerdown",e=>{if(e.target===modal){ serialize(node); node._dsRender(); modal.remove(); }});
  requestAnimationFrame(()=>placeSidePanel(panel, node._dsLora.dom, "right"));
  installOutsideClose(panel, node._dsLora.dom, ()=>{ serialize(node); node._dsRender(); modal.remove(); });

  (async()=>{
    const m=await fetchMetadata(node,row,false); 
    tags=Array.from(new Set(m.trainedWords||[])); 
    if(settings.showThumbnails && m.images?.[0]){
      thumb.src=m.images[0];
      thumb.hidden=false;
    } 
    status.textContent=m.ok?(m.source==="cache"?"Found in local cache.":m.source==="safetensors"?"Found in safetensors metadata.":"Found on Civitai. Saved next to the file."):(m.error||"No trigger words in this file - add your own below, or try Civitai."); 
    renderTags();
  })();
}

function renderSettingsModal(node,anchorEl) {
  const settings={...DEFAULT_SETTINGS,...loadSettings(),...node._dsLora.settings};
  const modal=document.createElement("div");modal.className="ds-lora-popover-host";
  const panel=document.createElement("div");panel.className="ds-lora-settings ds-lora-side-panel";
  const head=document.createElement("div");head.className="ds-lora-modal-head";head.innerHTML="<strong>DS LoRa Loader — Settings</strong>";
  head.appendChild(makeButton("×","ds-lora-close",()=>modal.remove()));
  const body=document.createElement("div");body.className="ds-lora-settings-body";
  const field=(label,input)=>{const w=document.createElement("label");w.className="ds-lora-setting";const s=document.createElement("span");s.textContent=label;w.append(s,input);return w;};
  const num=(label,key,min,max,step)=>{
    const shell=document.createElement("span"); shell.className="ds-lora-setting-number";
    const i=document.createElement("input"); i.type="number"; i.min=min; i.max=max; i.step=step; i.value=settings[key];
    const commit=(n)=>{if(Number.isFinite(n)){settings[key]=Math.min(max,Math.max(min,n));i.value=String(settings[key]);}};
    i.addEventListener("change",()=>commit(Number(i.value)));
    const stepper=document.createElement("span"); stepper.className="ds-lora-setting-stepper";
    const up=makeButton("▲","ds-lora-step",()=>commit(Number(settings[key])+Number(step)));
    const down=makeButton("▼","ds-lora-step",()=>commit(Number(settings[key])-Number(step)));
    stepper.append(up,down); shell.append(i,stepper); return field(label,shell);
  };
  body.append(num("Default strength (new LoRAs)","defaultStrength",-10,10,.01));
  body.append(num("Strength step (arrows)","strengthStep",.001,5,.001));
  const sep=document.createElement("input");sep.type="text";sep.value=settings.triggerSeparator;body.append(field("Trigger words separator",sep));
  const bool=(label,key)=>{
    const button=document.createElement("button"); button.type="button"; button.className="ds-lora-switch"; button.setAttribute("role","switch");
    const track=document.createElement("span"); track.className="ds-lora-switch-track";
    const thumb=document.createElement("span"); thumb.className="ds-lora-switch-thumb"; track.appendChild(thumb);
    const sync=()=>{const on=!!settings[key]; button.setAttribute("aria-checked",String(on)); button.classList.toggle("is-on",on);};
    button.appendChild(track); button.addEventListener("click",()=>{settings[key]=!settings[key];sync();}); sync();
    body.append(field(label,button)); return button;
  };
  const sepClip=bool("Separate model / clip strength", "separateClipStrength");
  bool("Hide .safetensors extension","hideExtension");
  const lookup=bool("Civitai lookup button","civitaiLookup");
  bool("Show preview thumbnails","showThumbnails");
  bool("Allow adult preview images","allowNsfwPreviews");
  const makeSelect=(values,key)=>{
    const wrap=document.createElement("span"); wrap.className="ds-lora-select-wrap";
    const button=document.createElement("button"); button.type="button"; button.className="ds-lora-themed-select";
    button.textContent=settings[key];
    const menu=document.createElement("div"); menu.className="ds-lora-select-menu"; menu.hidden=true;
    inheritThemeVars(node._dsLora.dom, menu);
    for(const x of values){
      const option=document.createElement("button"); option.type="button"; option.className="ds-lora-select-option"; option.textContent=x;
      option.classList.toggle("is-selected", x===settings[key]);
      option.addEventListener("click",e=>{e.stopPropagation(); settings[key]=x; button.textContent=x; for(const b of menu.querySelectorAll(".ds-lora-select-option")) b.classList.toggle("is-selected",b.textContent===x); menu.hidden=true;});
      menu.appendChild(option);
    }
    button.addEventListener("click",e=>{
      e.stopPropagation();
      inheritThemeVars(node._dsLora.dom, menu);
      menu.hidden=!menu.hidden;
      if(!menu.hidden){
        document.body.appendChild(menu);
        placeSidePanel(menu, button, "right");
        const close=e2=>{if(menu.contains(e2.target)||button.contains(e2.target))return;menu.hidden=true;document.removeEventListener("pointerdown",close,true);};
        requestAnimationFrame(()=>document.addEventListener("pointerdown",close,true));
      }
    });
    wrap.appendChild(button);
    return [wrap,{get value(){return settings[key];},menu,button}];
  };
  const [memWrap,mem]=makeSelect(["Standard","Fast","Lowest"],"memoryMode"); body.append(field("LoRa memory use",memWrap));
  const [siteWrap,site]=makeSelect(["Standard","Unrestricted"],"siteMode"); body.append(field("Ask this site first",siteWrap));
  const key=document.createElement("input");key.type="password";key.value=loadSettings().civitaiApiKey||"";key.placeholder="optional";body.append(field("Civitai API key (saved on this computer)",key));
  
  const foot=document.createElement("div");foot.className="ds-lora-modal-foot";
  const footer=makeButton("Save","ds-lora-save",()=>{settings.triggerSeparator=sep.value;settings.separateClipStrength=sepClip.getAttribute("aria-checked")==="true";settings.memoryMode=mem.value;settings.siteMode=site.value;settings.civitaiApiKey=key.value;settings.civitaiLookup=lookup.getAttribute("aria-checked")==="true";saveSettings(settings);node._dsLora.settings={...settings};node._dsRender();resizeNode(node,false);serialize(node);modal.remove();});
  foot.appendChild(footer);
  panel.append(head,body,foot);modal.appendChild(panel);document.body.appendChild(modal);
  inheritThemeVars(node._dsLora.dom, panel);
  accentCss(panel,node);
  requestAnimationFrame(()=>placeSidePanel(panel, node._dsLora.dom, "right"));
  installOutsideClose(panel, node._dsLora.dom, ()=>modal.remove());
}

function contentHeight(node) {
  const rowCount = Math.max(1, node._dsLora?.rows?.length || 0);
  return 52 + rowCount * 40;
}

function syncHost(node) {
  const dom = node._dsLora?.dom;
  if (!dom) return;
  const host = dom.parentElement;
  if (!host) return;
  host.style.borderRadius = "8px";
  host.style.overflow = "visible";
  const ch = contentHeight(node);
  host.style.height = `${ch}px`;
  host.style.minHeight = `${ch}px`;
  host.style.maxHeight = "none";
}

function resizeNode(node, shrink=false) {
  const ch = contentHeight(node);
  const minH = Math.max(125, ch + 76);
  const currentH = Number(node.size?.[1]) || minH;
  const nextH = shrink ? minH : Math.max(currentH, minH);
  const minW = node._dsLora?.mode === "video" ? 440 : 380;
  const w = Math.max(minW, Number(node.size?.[0]) || 430);

  // Directly set node.size so LiteGraph canvas base shrinks immediately.
  // Note: LiteGraph's default setSize() uses Math.max(this.size[1], h), which prevents shrinking.
  if (Array.isArray(node.size)) {
    node.size[0] = w;
    node.size[1] = nextH;
  } else {
    node.size = [w, nextH];
  }

  if (typeof node.setSize === "function") {
    try { node.setSize([w, nextH]); } catch {}
  }

  // Force size again in case setSize had Math.max clamp
  if (Array.isArray(node.size)) {
    node.size[0] = w;
    node.size[1] = nextH;
  }

  if (node._dsLora?.widget) {
    node._dsLora.widget.computedHeight = ch;
    node._dsLora.widget.computeSize = () => [w, ch];
    node._dsLora.widget.computeLayoutSize = () => ({
      minHeight: ch,
      maxHeight: ch,
      minWidth: minW,
    });
  }

  syncHost(node);
  try { node.setDirtyCanvas?.(true, true); } catch {}
  try { (node.graph || app?.graph)?.setDirtyCanvas?.(true, true); } catch {}
}

function renderRoot(node) {
  if (node._dsLora.rootRows) for(const r of node._dsLora.rootRows) r._destroy?.();
  node._dsLora.rootRows=[];
  const root=node._dsLora.dom;
  root.textContent="";
  accentCss(root,node);

  root.classList.toggle("is-master-off", !node._dsLora.masterEnabled);

  // 1. Add button floats into the dead-band between slot 0 & slot 1
  const add=makeButton("+ Add LoRA","ds-lora-add-top",()=>{
    if(node._dsLora.rows.length>=MAX_LORAS)return;
    node._dsLora.rows.push(defaultRow(node._dsLora.settings));
    node._dsRender(); resizeNode(node,true); serialize(node);
  });
  root.appendChild(add);

  // 2. Subheader grid: Left (Master + Count), Center (Image/Video modes), Right (Gear)
  const top = document.createElement("div");
  top.className = "ds-lora-subheader";

  // Left cell: Master switch + Active count
  const subLeft = document.createElement("div");
  subLeft.className = "ds-lora-sub-left";
  const master = makeButton(node._dsLora.masterEnabled ? "ALL ON" : "ALL OFF", "ds-lora-master", () => {
    node._dsLora.masterEnabled = !node._dsLora.masterEnabled;
    node._dsRender();
    serialize(node);
  });
  master.classList.toggle("is-on", node._dsLora.masterEnabled);
  master.classList.toggle("is-off", !node._dsLora.masterEnabled);

  const totalRows = (node._dsLora.rows || []).length;
  const activeRows = node._dsLora.masterEnabled ? (node._dsLora.rows || []).filter(r => r.enabled !== false).length : 0;
  const countSpan = document.createElement("span");
  countSpan.className = "ds-lora-subtitle" + (!node._dsLora.masterEnabled ? " is-bypassed" : "");
  countSpan.textContent = `${activeRows}/${totalRows} Active`;
  countSpan.title = node._dsLora.masterEnabled ? `${activeRows} active out of ${totalRows} LoRAs added` : "All LoRAs bypassed (master switch is OFF)";
  subLeft.append(master, countSpan);

  // Center cell: Segmented Mode buttons (Image vs. Video) — strictly centered
  const subCenter = document.createElement("div");
  subCenter.className = "ds-lora-sub-center";
  const modeGroup = document.createElement("div");
  modeGroup.className = "ds-lora-modes";

  const imgBtn = makeButton("Image", "ds-lora-mode-btn" + (node._dsLora.mode !== "video" ? " is-active" : ""), () => {
    if (node._dsLora.mode !== "image") {
      node._dsLora.mode = "image";
      node._dsRender();
      resizeNode(node, true);
      serialize(node);
    }
  });
  imgBtn.title = "Image mode (overall LoRA strength)";

  const vidBtn = makeButton("Video", "ds-lora-mode-btn" + (node._dsLora.mode === "video" ? " is-active" : ""), () => {
    if (node._dsLora.mode !== "video") {
      node._dsLora.mode = "video";
      if (Array.isArray(node.size) && node.size[0] < 440) {
        node.size[0] = 440;
      }
      node._dsRender();
      resizeNode(node, true);
      serialize(node);
    }
  });
  vidBtn.title = "Video mode (S overall strength, V video multiplier, A audio multiplier)";
  modeGroup.append(imgBtn, vidBtn);
  subCenter.appendChild(modeGroup);

  // Right cell: Settings gear button
  const subRight = document.createElement("div");
  subRight.className = "ds-lora-sub-right";
  const settingsBtn = makeButton("⚙", "ds-lora-settings-btn", () => renderSettingsModal(node, settingsBtn));
  settingsBtn.title = "Settings";
  subRight.appendChild(settingsBtn);

  top.append(subLeft, subCenter, subRight);
  root.appendChild(top);

  // 3. Rows start right under subheader with a clean, minimal gap
  const rows=document.createElement("div");
  rows.className="ds-lora-rows";
  for(let i=0;i<node._dsLora.rows.length;i++){
    const r=renderRow(node,node._dsLora.rows[i],i,node._dsLora.allLoras);
    rows.appendChild(r);
    node._dsLora.rootRows.push(r);
  }
  root.appendChild(rows);

  syncHost(node);
  requestAnimationFrame(() => syncHost(node));
}

app.registerExtension({
  name:"DeathshotArsenal.DSLoRaLoader",
  async beforeRegisterNodeDef(nodeType,nodeData) {
    if(nodeData.name!=="DS_LoRaLoader") return;
    const originalCreated=nodeType.prototype.onNodeCreated;
    const originalConfigure=nodeType.prototype.onConfigure;
    const originalRemoved=nodeType.prototype.onRemoved;
    const originalSerialize=nodeType.prototype.serialize;
    const originalConnectionsChange=nodeType.prototype.onConnectionsChange;
    const originalGetOutputData=nodeType.prototype.getOutputData;
    const originalComputeSize=nodeType.prototype.computeSize;
    const originalResize=nodeType.prototype.onResize;

    nodeType.prototype._dsRender=()=>{};

    nodeType.prototype.computeSize = function (out) {
      const minW = this._dsLora?.mode === "video" ? 440 : 380;
      const w = Math.max(minW, Number(this.size?.[0]) || 430);
      const h = Math.max(125, contentHeight(this) + 76);
      if (Array.isArray(out)) {
        out[0] = w;
        out[1] = h;
        return out;
      }
      return [w, h];
    };

    nodeType.prototype.onResize = function (size) {
      const minW = this._dsLora?.mode === "video" ? 440 : 380;
      if (Array.isArray(size)) {
        size[0] = Math.max(minW, Number(size[0]) || minW);
        const minH = Math.max(125, contentHeight(this) + 76);
        size[1] = Math.max(minH, Number(size[1]) || minH);
      }
      syncHost(this);
      return originalResize ? originalResize.apply(this, arguments) : undefined;
    };

    nodeType.prototype.getOutputData=function(slot) {
      if (slot === 2 || this.outputs?.[slot]?.name === "triggers") {
        return compileTriggers(this);
      }
      return originalGetOutputData ? originalGetOutputData.apply(this, arguments) : this.outputs?.[slot]?._data;
    };

    nodeType.prototype.onConnectionsChange=function() {
      const graph = this.graph || app?.graph;
      if (graph && !graph.is_loading) {
        serialize(this);
      }
      return originalConnectionsChange?.apply(this, arguments);
    };

    nodeType.prototype.onNodeCreated=function() {
      const r=originalCreated?.apply(this,arguments);
      this.resizable=true;
      this.properties=this.properties||{};
      ensureHiddenWidget(this);

      const graph = this.graph || app?.graph;
      const state = this.properties.ds_lora_state || this.widgets?.find(w=>w.name==="LoaderState")?.value;
      const decoded = decodeState(state);
      this._dsLora={...decoded,allLoras:[],rootRows:[],dragIndex:null};
      this._dsLora.mode = decoded.mode || "image";
      this._dsLora.settings={...loadSettings(),...decoded.settings};
      this._dsLora.settings.civitaiApiKey=loadSettings().civitaiApiKey;

      // Always load in with 1 initial field if empty so new nodes never spawn empty
      if (!this._dsLora.rows || !this._dsLora.rows.length) {
        this._dsLora.rows = [defaultRow(this._dsLora.settings)];
      }

      this._dsRender=()=>renderRoot(this);
      const dom=document.createElement("div");
      dom.className="ds-lora-root";
      this._dsLora.dom=dom;
      const w=this.addDOMWidget("ds_lora_ui","ds_lora_ui",dom,{
        serialize: false,
        getMinHeight: () => contentHeight(this),
        getHeight: () => contentHeight(this),
        getMaxHeight: () => contentHeight(this),
      });
      w.serialize=false;
      w.getMinHeight=()=>contentHeight(this);
      w.getHeight=()=>contentHeight(this);
      w.getMaxHeight=()=>contentHeight(this);
      w.computeLayoutSize=()=>({
        minHeight: contentHeight(this),
        maxHeight: contentHeight(this),
        minWidth: this._dsLora?.mode === "video" ? 440 : 380,
      });
      w.computeSize=()=>[Math.max(this._dsLora?.mode === "video" ? 440 : 380, this.size?.[0]||430), contentHeight(this)];
      this._dsLora.widget=w;

      // Override instance setSize so LiteGraph's default Math.max clamp does not freeze height
      this.setSize = function(size) {
        const minW = this._dsLora?.mode === "video" ? 440 : 380;
        const width = Math.max(minW, Number(size?.[0]) || Number(this.size?.[0]) || 430);
        const minH = Math.max(125, contentHeight(this) + 76);
        const height = Math.max(minH, Number(size?.[1]) || minH);
        this.size[0] = width;
        this.size[1] = height;
        syncHost(this);
      };

      if (!Array.isArray(this.size)) this.size=[430,0];
      this.size[0]=Math.max(this._dsLora.mode === "video" ? 440 : 380, Number(this.size[0])||430);
      this.size[1]=contentHeight(this) + 76;
      this._dsLora.reload=async()=>{this._dsLora.allLoras=await getLoras();this._dsRender();};
      this._dsLora.reload();
      this._dsRender();
      resizeNode(this, true);

      // Serialize initial state including default row
      if (!graph?.is_loading) {
        serialize(this);
      }
      return r;
    };

    nodeType.prototype.onConfigure=function(info) {
      const r=originalConfigure?.apply(this,arguments);
      this.properties=this.properties||{};
      ensureHiddenWidget(this);

      // Deep read from all available persisted locations in info & properties
      const rawState =
        info?.properties?.ds_lora_state ||
        info?.widgets_values_named?.LoaderState ||
        info?.widgets_values?.[0] ||
        this.properties?.ds_lora_state ||
        this.widgets?.find(w=>w.name==="LoaderState")?.value;

      const decoded=decodeState(rawState);
      this._dsLora=this._dsLora || {};
      this._dsLora.masterEnabled=decoded.masterEnabled;
      this._dsLora.mode=decoded.mode || "image";
      this._dsLora.rows=decoded.rows;
      if (!this._dsLora.rows.length && !rawState) {
        this._dsLora.rows = [defaultRow(this._dsLora.settings)];
      }
      this._dsLora.settings={...loadSettings(),...decoded.settings,civitaiApiKey:loadSettings().civitaiApiKey};
      this._dsLora.allLoras=this._dsLora.allLoras||[];
      this._dsRender=this._dsRender||(()=>renderRoot(this));

      // Override instance setSize so LiteGraph's default Math.max clamp does not freeze height
      this.setSize = function(size) {
        const minW = this._dsLora?.mode === "video" ? 440 : 380;
        const width = Math.max(minW, Number(size?.[0]) || Number(this.size?.[0]) || 430);
        const minH = Math.max(125, contentHeight(this) + 76);
        const height = Math.max(minH, Number(size?.[1]) || minH);
        this.size[0] = width;
        this.size[1] = height;
        syncHost(this);
      };

      // Make sure the lora list is ready for name mapping
      if (!this._dsLora.allLoras.length) {
        getLoras().then(loras => {
          if (this._dsLora) {
            this._dsLora.allLoras = loras;
            this._dsRender();
          }
        });
      }

      this._dsRender();
      resizeNode(this, true);
      syncHost(this);

      // Keep triggers active immediately on load
      const triggerStr = compileTriggers(this);
      this.properties.ds_lora_state = {
        version: 1,
        mode: this._dsLora.mode || "image",
        masterEnabled: this._dsLora.masterEnabled,
        rows: this._dsLora.rows.map(clone),
        settings: {...loadSettings(), ...this._dsLora.settings, civitaiApiKey: undefined}
      };
      this.properties.triggers = triggerStr;
      this.properties.lora_triggers = triggerStr;
      this.triggers = triggerStr;
      this.lora_triggers = triggerStr;

      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i].name === "triggers") {
            this.outputs[i]._data = triggerStr;
            this.outputs[i].value = triggerStr;
          }
        }
      }

      return r;
    };

    nodeType.prototype.serialize=function() {
      serialize(this);
      const data = originalSerialize ? originalSerialize.apply(this, arguments) : {};
      data.properties = data.properties || {};
      if (this.properties?.ds_lora_state) {
        data.properties.ds_lora_state = clone(this.properties.ds_lora_state);
      }
      data.properties.triggers = this.properties.triggers || "";
      data.properties.lora_triggers = this.properties.lora_triggers || "";
      return data;
    };

    nodeType.prototype.getExtraMenuOptions=function(canvas,options) {
      const base = options.slice();
      options.length = 0;
      options.push(...base);
      options.push({content:"LoRa Loader settings",callback:()=>renderSettingsModal(this)});
      options.push({content:"Refresh LoRA list",callback:()=>this._dsLora?.reload?.()});
      options.push({content:"+ Add LoRA",callback:()=>{if(this._dsLora?.rows?.length<MAX_LORAS){this._dsLora.rows.push(defaultRow(this._dsLora.settings));this._dsRender();resizeNode(this,true);serialize(this);}}});
    };

    nodeType.prototype.onRemoved=function() {
      try{for(const r of this._dsLora?.rootRows||[])r._destroy?.();this._dsLora?.dom?.remove?.();this._dsLora=null;}catch{}
      originalRemoved?.apply(this,arguments);
    };
  }
});