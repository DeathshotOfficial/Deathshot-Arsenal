import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DS_ImageCheckpoint";
const EXT = "DeathshotArsenal.DSImageCheckpoint";
const STATE_PROP = "ds_image_checkpoint_mode";
const DEFAULT_SIZE = [620, 620];
const MIN_SIZE = [460, 430];
const CSS_ID = "ds-image-checkpoint-css-v5";
const HIDDEN_INPUT = "PauseState";
const STOP_ICON = '<span class="ds-stop-square"></span>';

function log(...a) { console.log("[DS Image Checkpoint]", ...a); }
function error(...a) { console.error("[DS Image Checkpoint]", ...a); }
function apiUrl(path) { try { return api.apiURL ? api.apiURL(path) : path; } catch (_) { return path; } }

let cssPromise;
function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.getElementById(CSS_ID)) return resolve();
    const link = document.createElement("link");
    link.id = CSS_ID; link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Image Checkpoint/ds_image_checkpoint.css?v=5";
    link.onload = resolve; link.onerror = resolve;
    document.head.appendChild(link);
  });
  return cssPromise;
}

function stateOf(node) {
  return node._dsICState || (node._dsICState = {
    mode: node.properties?.[STATE_PROP] === "pass" ? "pass" : "pause",
    status: "ready", previewUrl: "", width: 0, height: 0,
    hasSnapshot: false, busy: false, flashTimer: null, saveConfirmTimer: null,
  });
}
function rootOf(node) { return node._dsICRoot; }
function persist(node) {
  node.properties ??= {};
  node.properties[STATE_PROP] = stateOf(node).mode;
  node.properties.ds_image_checkpoint_version = 3;
}

function setStatus(node, status, text) {
  const s = stateOf(node); s.status = status;
  const root = rootOf(node); if (!root) return;
  const el = root.querySelector(".ds-ic-status");
  if (el) { el.dataset.state = status; const t = el.querySelector(".ds-ic-status-text"); if (t) t.textContent = text; }
  renderButtons(node);
}
function toast(node, text) {
  const el = rootOf(node)?.querySelector(".ds-ic-toast"); if (!el) return;
  el.textContent = text; el.classList.add("show");
  clearTimeout(stateOf(node).flashTimer);
  stateOf(node).flashTimer = setTimeout(() => el.classList.remove("show"), 1700);
}
function setModeUI(node, mode, save = true) {
  const s = stateOf(node); s.mode = mode === "pass" ? "pass" : "pause";
  if (save) persist(node);
  const root = rootOf(node); if (!root) return;
  root.querySelectorAll(".ds-ic-tab").forEach(b => b.classList.toggle("active", b.dataset.mode === s.mode));
  const helper = root.querySelector(".ds-ic-helper");
  if (helper) helper.textContent = s.mode === "pause"
    ? "PAUSE · Run ends here after capturing the image."
    : "PASS · Run the complete workflow without stopping here.";
  if (s.mode === "pass" && s.status === "paused") setStatus(node, "ready", "READY");
  renderButtons(node);
  node.setDirtyCanvas?.(true, true);
}
function renderButtons(node) {
  const s = stateOf(node), root = rootOf(node); if (!root) return;
  const cont = root.querySelector(".ds-ic-continue"), regen = root.querySelector(".ds-ic-regenerate");
  const has = s.hasSnapshot;
  const isPause = s.mode === "pause";

  if (regen) {
    if (s.busy && node._dsICActiveMode === "pause") {
      regen.disabled = false;
      regen.classList.add("is-stopping");
      regen.innerHTML = `${STOP_ICON} &nbsp; STOP`;
    } else {
      regen.classList.remove("is-stopping");
      regen.disabled = !isPause || s.busy;
      regen.innerHTML = "↻ &nbsp; REGENERATE";
    }
  }

  if (cont) {
    if (s.busy && node._dsICActiveMode === "continue") {
      cont.disabled = false;
      cont.classList.add("is-stopping");
      cont.innerHTML = `${STOP_ICON} &nbsp; STOP`;
    } else {
      cont.classList.remove("is-stopping");
      cont.disabled = !isPause || !has || s.busy;
      cont.innerHTML = "▶ &nbsp; CONTINUE";
    }
  }

  ["copy", "open", "save"].forEach(k => {
    const b = root.querySelector(`.ds-ic-${k}`);
    if (b) b.disabled = !has;
  });
}
function setPreview(node, width, height) {
  const s = stateOf(node); s.width = Number(width) || 0; s.height = Number(height) || 0;
  s.previewUrl = apiUrl(`/ds/image_checkpoint/preview?node=${encodeURIComponent(node.id)}&t=${Date.now()}`);
  // Persist dimensions so the preview can be restored after workflow switch
  node.properties ??= {};
  node.properties.ds_ic_last_width = s.width;
  node.properties.ds_ic_last_height = s.height;
  const root = rootOf(node); if (!root) return;
  const img = root.querySelector(".ds-ic-image"), ph = root.querySelector(".ds-ic-placeholder"), dims = root.querySelector(".ds-ic-dims");
  if (dims) dims.textContent = s.width && s.height ? `${s.width} × ${s.height}` : "";
  img.onload = () => {
    img.hidden = false;
    ph.hidden = true;
    s.hasSnapshot = true;
    if (s.mode === "pause" && !s.busy) setStatus(node, "paused", "PAUSED · READY");
    else renderButtons(node);
    node.setDirtyCanvas?.(true, true);
  };
  img.onerror = () => {
    img.hidden = true;
    ph.hidden = false;
    ph.innerHTML = `<strong>PREVIEW EXPIRED</strong><span>Run again in Pause mode to capture a new image.</span>`;
    s.hasSnapshot = false;
    renderButtons(node);
  };
  img.src = s.previewUrl;
}

function showSaveConfirmation(node, { ok, filename, path, error: errMsg }) {
  const root = rootOf(node); if (!root) return;
  const container = root.querySelector(".ds-ic-actions"); if (!container) return;
  const s = stateOf(node);
  if (s.saveConfirmTimer) {
    clearTimeout(s.saveConfirmTimer);
    s.saveConfirmTimer = null;
  }
  const old = container.querySelector(".ds-save-confirm");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = `ds-save-confirm ${ok ? "ds-save-confirm-success" : "ds-save-confirm-error"}`;
  try { window.DSGlobalTheme?.applyToElement?.(overlay); } catch (_) {}

  const safeFile = filename ? String(filename) : (ok ? "image.png" : "file");
  const safePath = path ? String(path) : "";
  const safeErr = errMsg ? String(errMsg) : "Could not save file";

  if (ok) {
    overlay.title = safePath ? `${safeFile} → ${safePath}` : safeFile;
    overlay.innerHTML = `
      <span class="ds-save-confirm-icon">✓</span>
      <span class="ds-save-confirm-title">Saved</span>
      <span class="ds-save-confirm-sep">·</span>
      <span class="ds-save-confirm-name" title="${safeFile}">${safeFile}</span>
      ${safePath ? `<span class="ds-save-confirm-sep">·</span><span class="ds-save-confirm-path" title="${safePath}">${safePath}</span>` : ""}
    `;
  } else {
    overlay.title = safeErr;
    overlay.innerHTML = `
      <span class="ds-save-confirm-icon">✕</span>
      <span class="ds-save-confirm-title">Save failed</span>
      <span class="ds-save-confirm-sep">·</span>
      <span class="ds-save-confirm-name" title="${safeErr}">${safeErr}</span>
    `;
  }

  container.appendChild(overlay);
  s.saveConfirmTimer = setTimeout(() => {
    overlay.remove();
    s.saveConfirmTimer = null;
  }, 2000);
}

function isLink(v) {
  return Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "number";
}
function buildConsumers(out) {
  const c = new Map();
  for (const id in out) for (const k in (out[id]?.inputs || {})) {
    const v = out[id].inputs[k]; if (!isLink(v)) continue;
    const origin = String(v[0]); if (!c.has(origin)) c.set(origin, new Set()); c.get(origin).add(String(id));
  }
  return c;
}
function collectDownstream(consumers, startId) {
  const seen = new Set(), stack = [String(startId)];
  while (stack.length) { const cur = stack.pop(); for (const n of (consumers.get(cur) || [])) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen;
}
function addAncestors(out, keep) {
  const stack = [...keep];
  while (stack.length) { const cur = stack.pop(); for (const k in (out[cur]?.inputs || {})) { const v = out[cur].inputs[k]; if (!isLink(v)) continue; const o = String(v[0]); if (out[o] && !keep.has(o)) { keep.add(o); stack.push(o); } } }
}
function makeIsOutput() {
  const reg = window.LiteGraph?.registered_node_types; if (!reg) return null;
  return classType => !!(classType && reg[classType]?.nodeData?.output_node);
}
function buildNodeIndex() {
  const index = new Map();
  const visit = graph => { if (!graph) return; for (const n of (graph._nodes || graph.nodes || [])) { if (!n) continue; if (n.comfyClass === TYPE || n.type === TYPE) index.set(String(n.id), n); const inner = n.subgraph || n.graph || n._graph; if (inner && inner !== graph) visit(inner); } };
  visit(app.graph); return index;
}
function findNode(index, id) { const s = String(id); if (index.has(s)) return index.get(s); const tail = s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : null; return tail && index.has(tail) ? index.get(tail) : null; }
function collectGates(out) {
  const index = buildNodeIndex(), gates = [];
  for (const id in out) {
    const entry = out[id]; if (!entry || entry.class_type !== TYPE) continue;
    const node = findNode(index, id); const oneShot = node?._dsICSubmitMode;
    const mode = oneShot === "continue" || oneShot === "pause" ? oneShot : (node?.properties?.[STATE_PROP] === "pass" ? "pass" : "pause");
    gates.push({ id, entry, mode });
  }
  return gates;
}
function applyGateMode(out, id, entry, mode, isOutput) {
  entry.inputs ??= {};
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (mode === "pause") {
    const downstream = collectDownstream(buildConsumers(out), id);
    for (const d of downstream) delete out[d];
    entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: "pause", nonce });
    return;
  }
  if (mode === "pass") { entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: "pass" }); return; }

  const gateSrc = isLink(entry.inputs.image) ? [String(entry.inputs.image[0]), Number(entry.inputs.image[1])] : null;
  delete entry.inputs.image;
  entry.inputs[HIDDEN_INPUT] = JSON.stringify({ mode: "continue", nonce });
  const consumers = buildConsumers(out), downstream = collectDownstream(consumers, id);
  if (gateSrc) for (const dId of downstream) for (const k in (out[dId]?.inputs || {})) {
    const v = out[dId].inputs[k];
    if (isLink(v) && String(v[0]) === gateSrc[0] && Number(v[1]) === gateSrc[1]) out[dId].inputs[k] = [String(id), 0];
  }
  const keep = new Set(downstream); keep.add(String(id)); addAncestors(out, keep);
  const upstream = new Set(); if (gateSrc) { upstream.add(gateSrc[0]); addAncestors(out, upstream); }
  const postConsumers = buildConsumers(out), pullsUpstream = new Set(), stack = [...upstream];
  while (stack.length) for (const c of (postConsumers.get(String(stack.pop())) || [])) if (!pullsUpstream.has(c)) { pullsUpstream.add(c); stack.push(c); }
  for (const nid of Object.keys(out)) { const s = String(nid); if (keep.has(s) || !pullsUpstream.has(s)) continue; if (!isOutput || isOutput(out[nid]?.class_type)) delete out[nid]; }
}

async function queueWithMode(node, mode) {
  const all = app.graph?._nodes || app.graph?.nodes || [];
  for (const n of all) if (n !== node) n._dsICSubmitMode = null;
  node._dsICSubmitMode = mode;
  node._dsICActiveMode = mode;
  const s = stateOf(node);
  s.busy = true;
  setStatus(node, "busy", mode === "continue" ? "CONTINUING…" : "REGENERATING…");
  log("queue", mode, "node", node.id);
  try {
    await app.queuePrompt(0, 1);
  } catch (e) {
    error("queue failed", e);
    toast(node, `Queue failed: ${e.message}`);
    s.busy = false;
    node._dsICActiveMode = null;
    node._dsICSubmitMode = null;
    setStatus(node, s.hasSnapshot ? "paused" : "ready", s.hasSnapshot ? "PAUSED · READY" : "READY");
  } finally {
    node._dsICSubmitMode = null;
  }
}
async function abortExecution(node, actionName) {
  log("aborting", actionName, "node", node?.id);
  try {
    if (typeof api.interrupt === "function") {
      await api.interrupt();
    } else {
      await api.fetchApi("/interrupt", { method: "POST" });
    }
  } catch (e) {
    error("interrupt failed", e);
  }
}
async function continueExecution(node) {
  const s = stateOf(node);
  if (s.mode !== "pause" || !s.hasSnapshot || s.busy) return;
  window._dsCheckpointContinuing = true;
  await queueWithMode(node, "continue");
}
async function regenerate(node) {
  const s = stateOf(node);
  if (s.mode !== "pause" || s.busy) return;
  window._dsCheckpointContinuing = false;
  await queueWithMode(node, "pause");
}
async function copyPreview(node) {
  const s = stateOf(node); if (!s.hasSnapshot) return toast(node, "No image yet");
  try { const r = await fetch(s.previewUrl, {cache:"no-store"}); if (!r.ok) throw new Error(); const blob = await r.blob(); if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard not supported"); await navigator.clipboard.write([new ClipboardItem({"image/png": blob.type === "image/png" ? blob : new Blob([blob], {type:"image/png"})})]); toast(node, "Copied to clipboard"); }
  catch (e) { error("copy failed", e); toast(node, "Copy failed"); }
}
function openPreview(node) { const s = stateOf(node); if (!s.hasSnapshot) return toast(node, "No image yet"); const w = window.open(s.previewUrl, "_blank", "noopener,noreferrer"); if (!w) toast(node, "Popup blocked"); }
async function savePreview(node) {
  const s = stateOf(node);
  if (!s.hasSnapshot) return toast(node, "No image yet");
  const root = rootOf(node);
  const saveBtn = root?.querySelector(".ds-ic-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "SAVING…";
  }
  try {
    const r = await api.fetchApi("/ds/image_checkpoint/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: String(node.id), filename: `DS_ImageCheckpoint_${node.id}` }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) {
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    showSaveConfirmation(node, { ok: true, filename: d.filename, path: d.path });
    log("saved", d.path);
  } catch (e) {
    error("save failed", e);
    showSaveConfirmation(node, { ok: false, error: e.message || "Save failed", filename: `DS_ImageCheckpoint_${node.id}` });
  } finally {
    if (saveBtn) {
      saveBtn.disabled = !s.hasSnapshot;
      saveBtn.textContent = "SAVE OUTPUT";
    }
  }
}

function buildUI(node) {
  const root = document.createElement("div"); root.className = "ds-ic-root"; root.dataset.dsThemed = "true";
  root.innerHTML = `
    <div class="ds-ic-header"><div class="ds-ic-brand">DS</div><div class="ds-ic-title">IMAGE CHECKPOINT</div><div class="ds-ic-status" data-state="ready"><span class="ds-ic-status-dot"></span><span class="ds-ic-status-text">READY</span></div></div>
    <div class="ds-ic-tabs"><button class="ds-ic-tab active" data-mode="pause">PAUSE</button><button class="ds-ic-tab" data-mode="pass">PASS</button></div>
    <div class="ds-ic-caption"><span class="ds-ic-helper">PAUSE · Run ends here after capturing the image.</span><span class="ds-ic-dims"></span></div>
    <div class="ds-ic-controls"><button class="ds-ic-btn ds-ic-regenerate">↻ &nbsp; REGENERATE</button><button class="ds-ic-btn primary ds-ic-continue" disabled>▶ &nbsp; CONTINUE</button></div>
    <div class="ds-ic-actions"><button class="ds-ic-action ds-ic-copy" disabled>COPY</button><button class="ds-ic-action ds-ic-open" disabled>OPEN</button><button class="ds-ic-action ds-ic-save" disabled>SAVE OUTPUT</button></div>
    <div class="ds-ic-preview"><img class="ds-ic-image" alt="Checkpoint preview" hidden draggable="false"><div class="ds-ic-placeholder"><strong>PAUSED &amp; READY</strong><span>Run the workflow to inspect the image here.</span></div><div class="ds-ic-toast"></div></div>
  `;
  root.querySelectorAll(".ds-ic-tab").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();setModeUI(node,b.dataset.mode,true);}));
  root.querySelector(".ds-ic-continue").addEventListener("click", e => {
    e.stopPropagation();
    const s = stateOf(node);
    if (s.busy && node._dsICActiveMode === "continue") {
      const btn = root.querySelector(".ds-ic-continue");
      if (btn) btn.innerHTML = `${STOP_ICON} &nbsp; STOPPING…`;
      toast(node, "Aborting continuation…");
      abortExecution(node, "continue");
      return;
    }
    continueExecution(node);
  });
  root.querySelector(".ds-ic-regenerate").addEventListener("click", e => {
    e.stopPropagation();
    const s = stateOf(node);
    if (s.busy && node._dsICActiveMode === "pause") {
      const btn = root.querySelector(".ds-ic-regenerate");
      if (btn) btn.innerHTML = `${STOP_ICON} &nbsp; STOPPING…`;
      toast(node, "Aborting generation…");
      abortExecution(node, "regenerate");
      return;
    }
    regenerate(node);
  });
  root.querySelector(".ds-ic-copy").addEventListener("click",e=>{e.stopPropagation();copyPreview(node);});
  root.querySelector(".ds-ic-open").addEventListener("click",e=>{e.stopPropagation();openPreview(node);});
  root.querySelector(".ds-ic-save").addEventListener("click",e=>{e.stopPropagation();savePreview(node);});
  return root;
}
function installNode(node) {
  if (node._dsICInstalled) return; node._dsICInstalled=true; node.resizable=true;
  node.properties ??= {};
  if (!Array.isArray(node.size) || node.size[0] < MIN_SIZE[0] || node.size[1] < MIN_SIZE[1]) node.size=[...DEFAULT_SIZE];
  const s=stateOf(node); s.mode=node.properties[STATE_PROP]==="pass"?"pass":"pause";
  const root=buildUI(node); node._dsICRoot=root;
  window.DSGlobalTheme?.bindNode?.(root,node);
  if (typeof node.addDOMWidget === "function") {
    const widget=node.addDOMWidget("ds_image_checkpoint_ui","div",root,{serialize:false,hideOnZoom:false,margin:4,getMinHeight:()=>MIN_SIZE[1]-45,getHeight:()=>Math.max(1,(Number(node.size?.[1])||DEFAULT_SIZE[1])-45)});
    node._dsICWidget=widget;
  }
  setModeUI(node,s.mode,false); setStatus(node,"ready","READY");
  log("node installed",node.id,"native base retained");
}

function onExecutionDone() {
  const all = app.graph?._nodes || app.graph?.nodes || [];
  for (const n of all) {
    if (n.type === TYPE || n.comfyClass === TYPE) {
      const s = stateOf(n);
      if (s.busy) {
        s.busy = false;
        n._dsICActiveMode = null;
        if (s.mode === "pause" && s.hasSnapshot) {
          setStatus(n, "paused", "PAUSED · READY");
        } else {
          setStatus(n, "ready", s.mode === "pass" ? "PASSED" : "READY");
        }
      }
    }
  }
}

app.registerExtension({
  name: EXT,
  async setup(){
    await loadCss();
    api.addEventListener("execution_start", () => {
      const all = app.graph?._nodes || app.graph?.nodes || [];
      for (const n of all) {
        if (n && (n.type === TYPE || n.comfyClass === TYPE)) {
          n._dsICExecutedInRun = false;
        }
      }
    });
    api.addEventListener("executed", e=>{
      const d=e.detail, frames=d?.output?.ds_image_checkpoint; if(!frames?.length) return;
      let node=app.graph?.getNodeById?.(d.node); if(!node) node=(app.graph?._nodes||[]).find(n=>String(n.id)===String(d.node)); if(!node||(node.type!==TYPE && node.comfyClass!==TYPE)) return;
      node._dsICExecutedInRun = true;
      const f=frames[0]; if(f.width && f.height) setPreview(node,f.width,f.height);
      const s=stateOf(node);
      if(s.mode==="pause") {
        setStatus(node,"paused","PAUSED · READY");
        window._dsCheckpointActivePause = true;
      }
      else setStatus(node,"ready",f.mode==="pass"?"PASSED":"READY");
      log("executed",{node:d.node,mode:f.mode,width:f.width,height:f.height});
    });
    api.addEventListener("execution_success", onExecutionDone);
    api.addEventListener("execution_error", onExecutionDone);
    api.addEventListener("execution_interrupted", () => {
      onExecutionDone();
      log("execution interrupted");
    });
    api.addEventListener("executing", ({ detail }) => {
      if (detail === null) onExecutionDone();
    });
    log("extension ready");
  },
  async beforeRegisterNodeDef(nodeType,nodeData){
    if(nodeData.name!==TYPE) return;
    // IMPORTANT: this node intentionally keeps the native ComfyUI title/base.
    // It has IMAGE input/output, so it is not a baseless display node.
    const oldCreated=nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated=function(){const r=oldCreated?.apply(this,arguments);installNode(this);return r;};
    const oldConfigure=nodeType.prototype.onConfigure; nodeType.prototype.onConfigure=function(){const r=oldConfigure?.apply(this,arguments); if(!this.properties)this.properties={}; const s=stateOf(this); s.mode=this.properties[STATE_PROP]==="pass"?"pass":"pause"; setModeUI(this,s.mode,false); setStatus(this,"ready","READY");
      // Restore preview image if we have saved dimensions from before the workflow switch
      const lw = this.properties.ds_ic_last_width;
      const lh = this.properties.ds_ic_last_height;
      if (lw && lh) { setTimeout(() => setPreview(this, lw, lh), 80); }
      return r;};
    const oldResize=nodeType.prototype.onResize; nodeType.prototype.onResize=function(size){if(size[0]<MIN_SIZE[0])size[0]=MIN_SIZE[0];if(size[1]<MIN_SIZE[1])size[1]=MIN_SIZE[1];return oldResize?.apply(this,arguments);};
    const oldRemoved=nodeType.prototype.onRemoved; nodeType.prototype.onRemoved=function(){clearTimeout(this._dsICState?.flashTimer);clearTimeout(this._dsICState?.saveConfirmTimer);return oldRemoved?.apply(this,arguments);};
  }
});

const originalGraphToPrompt=app.graphToPrompt.bind(app);
app.graphToPrompt=async function(...args){
  const result=await originalGraphToPrompt(...args);
  try{
    const out=result?.output;
    if(out)for(const g of collectGates(out)){
      g.entry.inputs??={};
      g.entry.inputs[HIDDEN_INPUT]=JSON.stringify({mode:g.mode, nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`});
    }
  }catch(e){error("prompt mode injection failed; sending unchanged prompt",e);}
  return result;
};

if(!api._dsImageCheckpointQueueWrappedV3){
  api._dsImageCheckpointQueueWrappedV3=true;
  const originalQueuePrompt=api.queuePrompt.bind(api);
  api.queuePrompt=async function(...args){
    try{const out=args[1]?.output;if(out){const isOutput=makeIsOutput();const gates=collectGates(out);const rank={continue:0,pause:1,pass:2};gates.sort((a,b)=>rank[a.mode]-rank[b.mode]);for(const g of gates)if(out[g.id])applyGateMode(out,g.id,g.entry,g.mode,isOutput);}}
    catch(e){error("submit-time prune failed; sending original prompt",e);}
    return originalQueuePrompt(...args);
  };
}
