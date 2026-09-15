import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const CSS_HREF = "/extensions/DeathshotArsenal/Prompt Scanner/ds_prompt_scanner.css";
if (!document.querySelector(`link[data-ds-prompt-scanner="1"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = CSS_HREF;
  link.dataset.dsPromptScanner = "1";
  document.head.appendChild(link);
}
const log = (...a) => console.log("[DeathshotArsenal][Prompt Scanner]", ...a);
const err = (...a) => console.error("[DeathshotArsenal][Prompt Scanner]", ...a);
const ICONS = {
  upload:'<svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/></svg>',
  prev:'<svg viewBox="0 0 24 24"><path d="m14 5-7 7 7 7"/></svg>',
  next:'<svg viewBox="0 0 24 24"><path d="m10 5 7 7-7 7"/></svg>',
  copy:'<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  scan:'<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 12h8"/></svg>',
  expand:'<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>'
};
async function copyText(v){
  try{await navigator.clipboard.writeText(String(v||""));return true;}catch(_){
    const t=document.createElement("textarea"); t.value=String(v||""); t.style.position="fixed";t.style.left="-9999px";document.body.appendChild(t);t.select();const ok=document.execCommand("copy");t.remove();return ok;
  }
}
function syncWidget(node,w,value){ if(!w)return; w.value=String(value||""); try{w.callback?.(w.value);}catch(_){} node.setDirtyCanvas(true,true); }
function theme(root,node){try{window.DSGlobalTheme?.bindNode?.(root,node);window.DSGlobalTheme?.applyNodeBase?.(node);}catch(_){}}

app.registerExtension({
  name:"DeathshotArsenal.PromptScanner",
  async beforeRegisterNodeDef(nodeType,nodeData){
    if(nodeData.name!=="DS_PromptScanner")return;
    const oldCreated=nodeType.prototype.onNodeCreated, oldConfigure=nodeType.prototype.onConfigure, oldResize=nodeType.prototype.onResize, oldComputeSize=nodeType.prototype.computeSize;
    nodeType.prototype.computeSize=function(out){
      let base;
      try{ base=oldComputeSize ? oldComputeSize.apply(this,arguments) : [560,430]; }catch(_){ base=[560,430]; }
      const w=Math.max(560,Number(base?.[0])||560);
      const h=Math.max(430,Number(base?.[1])||430);
      if(Array.isArray(out)){ out[0]=w; out[1]=h; return out; }
      return [w,h];
    };
    nodeType.prototype.onNodeCreated=function(){
      const result=oldCreated?.apply(this,arguments);
      const node=this; node.resizable=true;
      const MIN_W=560, MIN_H=430, TITLE_H=30;
      const w=node.widgets?.find(x=>x.name==="image");
      if(w){w.hidden=true;w.type="hidden";w.computeSize=()=>[0,0];w.draw=()=>{}; if(w.inputEl)w.inputEl.style.display="none";}
      const s=Array.isArray(node.size)?node.size:[MIN_W,MIN_H];
      node.size=[Math.max(MIN_W,Number(s[0])||MIN_W),Math.max(MIN_H,Number(s[1])||MIN_H)];
      node._dpsBodyW=node.size[0]; node._dpsBodyH=Math.max(400,node.size[1]-TITLE_H);
      node._dpsFiles=[];node._dpsIndex=-1;node._dpsPath=String(w?.value||"");node._dpsPrompt="";
      const root=document.createElement("div");root.className="ds-prompt-scanner-root";root.dataset.dsThemed="true";
      root.innerHTML=`
        <div class="dps-head"><div class="dps-status"><i></i><b data-status>PNG INFO</b></div><span data-file>No image selected</span></div>
        <div class="dps-toolbar">
          <button class="dps-btn dps-upload" data-action="upload">${ICONS.upload}<span>Upload photo</span></button>
          <div class="dps-spacer"></div>
          <button class="dps-icon" data-action="prev" title="Previous image">${ICONS.prev}</button>
          <button class="dps-icon" data-action="next" title="Next image">${ICONS.next}</button>
          <button class="dps-icon" data-action="scan" title="Rescan">${ICONS.scan}</button>
        </div>
        <div class="dps-content">
          <div class="dps-preview"><div class="dps-empty" data-empty><span>No image selected</span><small>Upload a PNG with generation metadata.</small></div><img data-image alt="Selected image"/></div>
          <div class="dps-prompt"><div class="dps-label">PROMPT</div><textarea data-prompt readonly spellcheck="false" placeholder="No prompt found in image metadata..."></textarea></div>
        </div>
        <div class="dps-footer"><span data-hint>Select an image to scan its embedded metadata.</span><button class="dps-btn" data-action="copy">${ICONS.copy}<span>Copy</span></button></div>`;
      node._dpsRoot=root;node._dpsWidget=w;node._dpsStatus=root.querySelector("[data-status]");node._dpsFile=root.querySelector("[data-file]");node._dpsHint=root.querySelector("[data-hint]");node._dpsPromptEl=root.querySelector("[data-prompt]");node._dpsImg=root.querySelector("[data-image]");node._dpsEmpty=root.querySelector("[data-empty]");
      node._dpsImg.addEventListener("load",()=>{node._dpsImg.style.display="block";node._dpsEmpty.style.display="none";});
      node._dpsImg.addEventListener("error",()=>{node._dpsImg.style.display="none";node._dpsEmpty.style.display="flex";err("preview failed",node._dpsPath);});
      root.addEventListener("click",async e=>{
        const b=e.target.closest("button[data-action]");if(!b)return;const a=b.dataset.action;
        if(a==="copy"){node._dpsHint.textContent=await copyText(node._dpsPrompt)?"Prompt copied":"Copy failed";return;}
        if(a==="upload"){
          const input=document.createElement("input");input.type="file";input.accept="image/png,image/webp,image/jpeg";input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{
            node._dpsStatus.textContent="UPLOADING";const fd=new FormData();fd.append("image",f,f.name);log("upload",f.name,f.size);const r=await api.fetchApi("/upload/image",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||`Upload failed (${r.status})`);const p=d.subfolder?`${d.subfolder}/${d.name}`:d.name;await node._dpsSelect(p,true);
          }catch(x){err("upload failed",x);node._dpsStatus.textContent="ERROR";node._dpsHint.textContent=x.message;}};input.click();return;}
        if(a==="scan"){if(node._dpsPath)await node._dpsSelect(node._dpsPath,false);return;}
        if(a==="prev"||a==="next"){
          if(!node._dpsFiles.length&&node._dpsPath)await node._dpsLoadList(node._dpsPath);if(!node._dpsFiles.length)return;
          let i=node._dpsIndex+(a==="next"?1:-1);if(i<0)i=node._dpsFiles.length-1;if(i>=node._dpsFiles.length)i=0;await node._dpsSelect(node._dpsFiles[i],false);
        }
      });
      const dom=node.addDOMWidget("prompt_scanner_ui","div",root,{serialize:false,hideOnZoom:false});
      node._dpsDOM=dom;
      try{
        const parent=root.parentElement;
        if(parent){
          parent.style.height="100%";
          parent.style.minHeight="0";
          parent.style.padding="0";
          parent.style.margin="0";
          parent.style.overflow="hidden";
          parent.style.boxSizing="border-box";
        }
      }catch(_){}
      theme(root,node);log("UI created",node.size);
      setTimeout(()=>{theme(root,node);if(node._dpsPath)node._dpsSelect(node._dpsPath,true);},80);
      return result;
    };
    nodeType.prototype._dpsLoadList=async function(path){
      try{const r=await api.fetchApi(`/ds/prompt_scanner/list?path=${encodeURIComponent(path||"")}`);const d=await r.json();if(!r.ok)throw new Error(d.error||"List failed");this._dpsFiles=d.files||[];this._dpsIndex=this._dpsFiles.indexOf(path);log("list",this._dpsFiles.length,path);}catch(x){err("list failed",x);this._dpsFiles=[];this._dpsIndex=-1;}
    };
    nodeType.prototype._dpsSelect=async function(path,refresh=true){
      if(!path)return;try{this._dpsStatus.textContent="SCANNING";this._dpsFile.textContent=path.split("/").pop();if(refresh||!this._dpsFiles.length)await this._dpsLoadList(path);
        const r=await api.fetchApi(`/ds/prompt_scanner/scan?path=${encodeURIComponent(path)}`);const d=await r.json();if(!r.ok)throw new Error(d.error||"Scan failed");
        this._dpsPath=d.path||path;this._dpsPrompt=String(d.prompt||"");this._dpsPromptEl.value=this._dpsPrompt;this._dpsStatus.textContent=d.has_metadata?"PNG INFO":"NO INFO";this._dpsHint.textContent=this._dpsPrompt?"Prompt extracted from image metadata.":"No prompt metadata found in this image.";this._dpsFile.textContent=d.filename||path.split("/").pop();
        this._dpsImg.style.display="none";this._dpsEmpty.style.display="flex";this._dpsImg.src=`/ds/prompt_scanner/image?path=${encodeURIComponent(this._dpsPath)}&t=${Date.now()}`;this._dpsIndex=this._dpsFiles.indexOf(this._dpsPath);syncWidget(this,this._dpsWidget,this._dpsPath);log("scan success",{path:this._dpsPath,promptLength:this._dpsPrompt.length});
      }catch(x){err("scan failed",x);this._dpsStatus.textContent="ERROR";this._dpsPrompt="";this._dpsPromptEl.value="";this._dpsImg.style.display="none";this._dpsEmpty.style.display="flex";this._dpsHint.textContent=x.message||"Scan failed";}
      this.setDirtyCanvas(true,true);
    };
    nodeType.prototype.onConfigure=function(){const r=oldConfigure?.apply(this,arguments);setTimeout(()=>{const p=String(this._dpsWidget?.value||"");if(p)this._dpsSelect(p,true);},50);return r;};
    nodeType.prototype.onResize=function(size){
      size[0]=Math.max(560,Number(size[0])||560);
      size[1]=Math.max(430,Number(size[1])||430);
      const r=oldResize?.apply(this,[size]);
      size[0]=Math.max(560,Number(size[0])||560);
      size[1]=Math.max(430,Number(size[1])||430);
      this._dpsBodyW=size[0];
      this._dpsBodyH=Math.max(400,size[1]-30);
      if(this._dpsRoot){
        this._dpsRoot.style.width="100%";
        this._dpsRoot.style.height=`${this._dpsBodyH}px`;
        this._dpsRoot.style.minHeight="0";
        this._dpsRoot.style.maxHeight="100%";
      }
      this.setDirtyCanvas(true,true);
      return r;
    };
  }
});
