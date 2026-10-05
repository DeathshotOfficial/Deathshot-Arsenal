import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  Card,
  Button,
  DSIcon,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  installDSUI,
} from "../UIElements/index.js";

installDSUI();

const CSS_HREF = "/extensions/DeathshotArsenal/Prompt Scanner/ds_prompt_scanner.css";
if (!document.querySelector(`link[data-ds-prompt-scanner="1"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  link.dataset.dsPromptScanner = "1";
  document.head.appendChild(link);
}

const log = (...a) => console.log("[DeathshotArsenal][Prompt Scanner]", ...a);
const err = (...a) => console.error("[DeathshotArsenal][Prompt Scanner]", ...a);

async function copyText(v) {
  try {
    await navigator.clipboard.writeText(String(v || ""));
    return true;
  } catch (_) {
    const t = document.createElement("textarea");
    t.value = String(v || "");
    t.style.position = "fixed";
    t.style.left = "-9999px";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

function syncWidget(node, w, value) {
  if (!w) return;
  w.value = String(value || "");
  try {
    w.callback?.(w.value);
  } catch (_) {}
  node.setDirtyCanvas(true, true);
}

function theme(root, node) {
  try {
    window.DSGlobalTheme?.bindNode?.(root, node);
    window.DSGlobalTheme?.applyNodeBase?.(node);
  } catch (_) {}
}

app.registerExtension({
  name: "DeathshotArsenal.PromptScanner",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DS_PromptScanner") return;

    const oldCreated = nodeType.prototype.onNodeCreated;
    const oldConfigure = nodeType.prototype.onConfigure;
    const oldResize = nodeType.prototype.onResize;
    const oldComputeSize = nodeType.prototype.computeSize;

    nodeType.prototype.computeSize = function (out) {
      let base;
      try {
        base = oldComputeSize ? oldComputeSize.apply(this, arguments) : [560, 430];
      } catch (_) {
        base = [560, 430];
      }
      const w = Math.max(560, Number(base?.[0]) || 560);
      const h = Math.max(430, Number(base?.[1]) || 430);
      if (Array.isArray(out)) {
        out[0] = w;
        out[1] = h;
        return out;
      }
      return [w, h];
    };

    nodeType.prototype.onNodeCreated = function () {
      const result = oldCreated?.apply(this, arguments);
      const node = this;
      node.resizable = true;

      const MIN_W = 560;
      const MIN_H = 430;
      const CARD_MARGIN = 5;
      const NATURAL_CARD_HEIGHT = 390;
      const MIN_WIDGET_HEIGHT = NATURAL_CARD_HEIGHT + (CARD_MARGIN * 2);

      // Hide the background string widget for image path
      const w = node.widgets?.find((x) => x.name === "image");
      if (w) {
        w.hidden = true;
        w.type = "hidden";
        w.computeSize = () => [0, 0];
        w.draw = () => {};
        if (w.inputEl) w.inputEl.style.display = "none";
      }

      // Initialize sizing
      const s = Array.isArray(node.size) ? node.size : [MIN_W, MIN_H];
      node.size = [Math.max(MIN_W, Number(s[0]) || MIN_W), Math.max(MIN_H, Number(s[1]) || MIN_H)];

      node._dpsFiles = [];
      node._dpsIndex = -1;
      node._dpsPath = String(w?.value || "");
      node._dpsPrompt = "";
      node._dpsWidget = w;

      // Card as the visual base and DOM widget root
      const card = Card({
        title: "Prompt Scanner",
        icon: "search",
        className: "ds-prompt-scanner-card",
      });
      card.root.dataset.dsThemed = "true";

      // File name badge and status indicator inside the card header
      const headerMeta = document.createElement("div");
      headerMeta.className = "dps-header-meta";

      const fileBadge = document.createElement("span");
      fileBadge.className = "dps-file-badge";
      fileBadge.textContent = "No image selected";
      fileBadge.title = "No image selected";

      const statusPill = document.createElement("div");
      statusPill.className = "dps-status-pill";

      const statusDot = document.createElement("span");
      statusDot.className = "dps-status-dot";
      statusDot.dataset.state = "idle";

      const statusText = document.createElement("span");
      statusText.className = "dps-status-text";
      statusText.textContent = "READY";

      statusPill.append(statusDot, statusText);
      headerMeta.append(fileBadge, statusPill);

      const cardActions = card.head?.querySelector(".ds-ui-card-actions");
      if (cardActions) {
        card.head.insertBefore(headerMeta, cardActions);
      } else if (card.head) {
        card.head.appendChild(headerMeta);
      }

      // Toolbar Controls
      const toolbar = document.createElement("div");
      toolbar.className = "dps-toolbar";

      const uploadBtn = Button({
        icon: "upload",
        label: "Upload photo",
        variant: "primary",
        size: "compact",
        tooltip: "Upload an image with generation metadata",
        onClick: () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/png,image/webp,image/jpeg";
          input.onchange = async () => {
            const f = input.files?.[0];
            if (!f) return;
            try {
              node._dpsSetStatus("UPLOADING", "running");
              if (node._dpsHint) node._dpsHint.textContent = `Uploading ${f.name}...`;
              const fd = new FormData();
              fd.append("image", f, f.name);
              log("uploading", f.name, f.size);
              const r = await api.fetchApi("/upload/image", { method: "POST", body: fd });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || `Upload failed (${r.status})`);
              const p = d.subfolder ? `${d.subfolder}/${d.name}` : d.name;
              await node._dpsSelect(p, true);
            } catch (x) {
              err("upload failed", x);
              node._dpsSetStatus("ERROR", "error");
              if (node._dpsHint) node._dpsHint.textContent = x.message || "Upload failed";
            }
          };
          input.click();
        },
      });

      const prevBtn = Button({
        icon: "chevron-left",
        tooltip: "Previous image",
        size: "compact",
        onClick: async () => {
          if (!node._dpsFiles.length && node._dpsPath) await node._dpsLoadList(node._dpsPath);
          if (!node._dpsFiles.length) return;
          let i = node._dpsIndex - 1;
          if (i < 0) i = node._dpsFiles.length - 1;
          await node._dpsSelect(node._dpsFiles[i], false);
        },
      });

      const nextBtn = Button({
        icon: "chevron-right",
        tooltip: "Next image",
        size: "compact",
        onClick: async () => {
          if (!node._dpsFiles.length && node._dpsPath) await node._dpsLoadList(node._dpsPath);
          if (!node._dpsFiles.length) return;
          let i = node._dpsIndex + 1;
          if (i >= node._dpsFiles.length) i = 0;
          await node._dpsSelect(node._dpsFiles[i], false);
        },
      });

      const counter = document.createElement("span");
      counter.className = "dps-counter";
      counter.textContent = "—";

      const spacer = document.createElement("div");
      spacer.className = "dps-spacer";

      const scanBtn = Button({
        icon: "refresh-cw",
        tooltip: "Rescan image metadata",
        size: "compact",
        onClick: async () => {
          if (node._dpsPath) await node._dpsSelect(node._dpsPath, false);
        },
      });

      toolbar.append(uploadBtn.root, prevBtn.root, nextBtn.root, counter, spacer, scanBtn.root);

      // Content Area
      const content = document.createElement("div");
      content.className = "dps-content";

      // Left: Image Preview
      const previewPane = document.createElement("div");
      previewPane.className = "dps-preview-pane";

      const empty = document.createElement("div");
      empty.className = "dps-empty";
      const emptyIcon = DSIcon("image", { size: 32, color: "var(--ds-color-muted-text, #9ca3af)" });
      const emptyTitle = document.createElement("span");
      emptyTitle.className = "dps-empty-title";
      emptyTitle.textContent = "No image selected";
      const emptyDesc = document.createElement("small");
      emptyDesc.className = "dps-empty-desc";
      emptyDesc.textContent = "Upload or select an image with generation metadata.";
      empty.append(emptyIcon, emptyTitle, emptyDesc);

      const img = document.createElement("img");
      img.alt = "Selected image";

      previewPane.append(empty, img);

      // Right: Prompt Pane
      const promptPane = document.createElement("div");
      promptPane.className = "dps-prompt-pane";

      const promptHeader = document.createElement("div");
      promptHeader.className = "dps-prompt-header";

      const promptTitle = document.createElement("span");
      promptTitle.className = "dps-prompt-title";
      promptTitle.textContent = "PROMPT";

      const charCount = document.createElement("span");
      charCount.className = "dps-char-count";
      charCount.textContent = "0 chars";

      const copyBtn = Button({
        icon: "copy",
        label: "Copy",
        size: "compact",
        tooltip: "Copy prompt to clipboard",
        onClick: async () => {
          if (!node._dpsPrompt) {
            if (node._dpsHint) node._dpsHint.textContent = "No prompt found to copy.";
            return;
          }
          const ok = await copyText(node._dpsPrompt);
          if (ok) {
            copyBtn.setLabel("Copied!");
            copyBtn.setIcon("check");
            setTimeout(() => {
              copyBtn.setLabel("Copy");
              copyBtn.setIcon("copy");
            }, 1500);
            if (node._dpsHint) node._dpsHint.textContent = "Prompt copied to clipboard.";
          } else {
            if (node._dpsHint) node._dpsHint.textContent = "Failed to copy prompt.";
          }
        },
      });

      promptHeader.append(promptTitle, charCount, copyBtn.root);

      const textarea = document.createElement("textarea");
      textarea.readOnly = true;
      textarea.spellcheck = false;
      textarea.placeholder = "No prompt found in image metadata...";

      promptPane.append(promptHeader, textarea);

      content.append(previewPane, promptPane);

      // Footer
      const footer = document.createElement("div");
      footer.className = "dps-footer";

      const hint = document.createElement("span");
      hint.className = "dps-hint";
      hint.textContent = "Select an image to scan its embedded metadata.";

      footer.appendChild(hint);

      // Append all sections into Card body
      card.append(toolbar, content, footer);

      img.addEventListener("load", () => {
        img.style.display = "block";
        empty.style.display = "none";
      });
      img.addEventListener("error", () => {
        img.style.display = "none";
        empty.style.display = "flex";
        err("preview load failed", node._dpsPath);
      });

      node._dpsCard = card;
      node._dpsRoot = card.root;
      node._dpsStatusDot = statusDot;
      node._dpsStatusText = statusText;
      node._dpsFileName = fileBadge;
      node._dpsCounter = counter;
      node._dpsHint = hint;
      node._dpsPromptEl = textarea;
      node._dpsCharCount = charCount;
      node._dpsImg = img;
      node._dpsEmpty = empty;

      node._dpsSetStatus = function (text, state = "idle") {
        if (this._dpsStatusText) this._dpsStatusText.textContent = text;
        if (this._dpsStatusDot) this._dpsStatusDot.dataset.state = state;
      };

      const domWidget = node.addDOMWidget("ds_ui", "custom", card.root, {
        serialize: false,
        margin: CARD_MARGIN,
        getMinHeight: () => MIN_WIDGET_HEIGHT,
        getMaxHeight: () => {
          const widgetY = Number(domWidget?.y ?? (typeof node._getWidgetY === "function" ? node._getWidgetY() : 0)) || (node.inputs?.length ? 60 : 30);
          const nodeHeight = Number(node.size?.[1] ?? 0);
          return Math.max(MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
        },
      });

      node._dpsDOM = domWidget;
      normalizeDSWidgetHost(card.root, node, { shell: false });
      protectDSResizeCorners(node);

      theme(card.root, node);

      setTimeout(() => {
        theme(card.root, node);
        if (node._dpsPath) node._dpsSelect(node._dpsPath, true);
      }, 80);

      return result;
    };

    nodeType.prototype._dpsLoadList = async function (path) {
      try {
        const r = await api.fetchApi(`/ds/prompt_scanner/list?path=${encodeURIComponent(path || "")}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "List failed");
        this._dpsFiles = d.files || [];
        this._dpsIndex = this._dpsFiles.indexOf(path);
        if (this._dpsCounter) {
          this._dpsCounter.textContent = this._dpsFiles.length > 0 && this._dpsIndex >= 0
            ? `${this._dpsIndex + 1} / ${this._dpsFiles.length}`
            : (this._dpsFiles.length > 0 ? `1 / ${this._dpsFiles.length}` : "—");
        }
        log("list", this._dpsFiles.length, path);
      } catch (x) {
        err("list failed", x);
        this._dpsFiles = [];
        this._dpsIndex = -1;
        if (this._dpsCounter) this._dpsCounter.textContent = "—";
      }
    };

    nodeType.prototype._dpsSelect = async function (path, refresh = true) {
      if (!path) return;
      try {
        this._dpsSetStatus("SCANNING", "running");
        const filename = path.split("/").pop();
        if (this._dpsFileName) {
          this._dpsFileName.textContent = filename;
          this._dpsFileName.title = path;
        }

        if (refresh || !this._dpsFiles.length) {
          await this._dpsLoadList(path);
        }

        const r = await api.fetchApi(`/ds/prompt_scanner/scan?path=${encodeURIComponent(path)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Scan failed");

        this._dpsPath = d.path || path;
        this._dpsPrompt = String(d.prompt || "");
        if (this._dpsPromptEl) this._dpsPromptEl.value = this._dpsPrompt;
        if (this._dpsCharCount) this._dpsCharCount.textContent = `${this._dpsPrompt.length} chars`;

        const hasMetadata = Boolean(d.has_metadata);
        const hasPrompt = Boolean(this._dpsPrompt.trim());

        if (hasPrompt) {
          this._dpsSetStatus("PNG INFO", "success");
          if (this._dpsHint) this._dpsHint.textContent = "Prompt extracted from image metadata.";
        } else if (hasMetadata) {
          this._dpsSetStatus("METADATA", "warning");
          if (this._dpsHint) this._dpsHint.textContent = "Metadata found, but no prompt text identified.";
        } else {
          this._dpsSetStatus("NO INFO", "warning");
          if (this._dpsHint) this._dpsHint.textContent = "No generation metadata found in this image.";
        }

        if (this._dpsFileName) {
          const fn = d.filename || path.split("/").pop();
          this._dpsFileName.textContent = fn;
          this._dpsFileName.title = this._dpsPath;
        }

        if (this._dpsImg) {
          this._dpsImg.style.display = "none";
          if (this._dpsEmpty) this._dpsEmpty.style.display = "flex";
          this._dpsImg.src = `/ds/prompt_scanner/image?path=${encodeURIComponent(this._dpsPath)}&t=${Date.now()}`;
        }

        this._dpsIndex = this._dpsFiles.indexOf(this._dpsPath);
        if (this._dpsCounter) {
          this._dpsCounter.textContent = this._dpsFiles.length > 0 && this._dpsIndex >= 0
            ? `${this._dpsIndex + 1} / ${this._dpsFiles.length}`
            : (this._dpsFiles.length > 0 ? `1 / ${this._dpsFiles.length}` : "—");
        }

        syncWidget(this, this._dpsWidget, this._dpsPath);
        log("scan success", { path: this._dpsPath, promptLength: this._dpsPrompt.length });
      } catch (x) {
        err("scan failed", x);
        this._dpsSetStatus("ERROR", "error");
        this._dpsPrompt = "";
        if (this._dpsPromptEl) this._dpsPromptEl.value = "";
        if (this._dpsCharCount) this._dpsCharCount.textContent = "0 chars";
        if (this._dpsImg) this._dpsImg.style.display = "none";
        if (this._dpsEmpty) this._dpsEmpty.style.display = "flex";
        if (this._dpsHint) this._dpsHint.textContent = x.message || "Scan failed";
      }
      this.setDirtyCanvas(true, true);
    };

    nodeType.prototype.onConfigure = function () {
      const r = oldConfigure?.apply(this, arguments);
      setTimeout(() => {
        const p = String(this._dpsWidget?.value || "");
        if (p) this._dpsSelect(p, true);
      }, 50);
      return r;
    };

    nodeType.prototype.onResize = function (size) {
      const MIN_W = 560;
      const MIN_H = 430;
      size[0] = Math.max(MIN_W, Number(size[0]) || MIN_W);
      size[1] = Math.max(MIN_H, Number(size[1]) || MIN_H);

      const r = oldResize?.apply(this, [size]);

      size[0] = Math.max(MIN_W, Number(size[0]) || MIN_W);
      size[1] = Math.max(MIN_H, Number(size[1]) || MIN_H);

      if (this._dpsRoot) {
        this._dpsRoot.style.width = "100%";
        this._dpsRoot.style.height = "100%";
      }

      this.setDirtyCanvas(true, true);
      return r;
    };
  },
});
