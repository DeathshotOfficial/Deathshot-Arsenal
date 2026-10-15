import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { registerCardNode, LAYOUT } from "../UIElements/card_layout.js";
import { Button } from "../UIElements/Controls/Button.js";
import { TextPreview } from "../UIElements/Text/TextPreview.js";

const BANNER_ART = ` ____  ____    ____ _____ ____  ___ ____  ____  _____ ____ 
 DS STRIPPER // metadata eraser                      v1.0`;

const CSS = `
.ds-stripper-log-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.ds-stripper-log-preview .ds-ui-text-preview {
  flex: 1 1 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    color-mix(in srgb, var(--ds-color-accent, #67e8f9) 2.5%, transparent) 2px,
    color-mix(in srgb, var(--ds-color-accent, #67e8f9) 2.5%, transparent) 4px
  ), var(--ds-input-bg, var(--ds-color-panel-2, #161a23));
  border: 1px solid var(--ds-color-border, #242a36);
  border-radius: var(--ds-radius-control, 5px);
  color: var(--ds-color-text, #e5e7eb);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.45;
  padding: 8px 10px;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: text;
  white-space: pre-wrap;
  word-break: break-all;
  outline: none;
}
.ds-stripper-log-preview .ds-ui-text-preview:focus {
  border-color: var(--ds-color-accent, #67e8f9);
}
.ds-stripper-line {
  display: block;
  margin: 0;
  min-height: 16px;
  line-height: 1.45;
}
.ds-stripper-separator {
  display: block;
  color: var(--ds-color-muted-text, #9ca3af);
  opacity: 0.4;
  margin: 4px 0;
  user-select: none;
}
.ds-stripper-banner {
  display: block;
  color: var(--ds-color-accent, #67e8f9);
  font-weight: bold;
  line-height: 1.25;
  margin-bottom: 6px;
  user-select: text;
}
.ds-stripper-time {
  color: var(--ds-color-muted-text, #9ca3af);
  margin-right: 6px;
  user-select: text;
}
.ds-stripper-kind {
  font-weight: 600;
  margin-right: 6px;
  user-select: text;
}
.ds-stripper-kind-sys { color: var(--ds-color-muted-text, #9ca3af); }
.ds-stripper-kind-load,
.ds-stripper-kind-scan,
.ds-stripper-kind-wipe,
.ds-stripper-kind-vrfy,
.ds-stripper-kind-queued,
.ds-stripper-kind-pass { color: var(--ds-color-accent, #67e8f9); }
.ds-stripper-kind-save,
.ds-stripper-kind-ok { color: var(--ds-color-success, #34d399); }
.ds-stripper-kind-warn { color: var(--ds-color-warning, #facc15); }
.ds-stripper-kind-fail { color: var(--ds-color-danger, #f87171); font-weight: bold; }

.ds-stripper-content {
  color: var(--ds-color-text, #e5e7eb);
  user-select: text;
}
.ds-stripper-cursor {
  display: inline-block;
  color: var(--ds-color-accent, #67e8f9);
  animation: ds-stripper-blink 1s steps(2, start) infinite;
  vertical-align: baseline;
  margin-left: 2px;
  font-size: 11px;
}
.ds-stripper-glitch {
  animation: ds-stripper-glitch-anim 250ms ease;
}
@keyframes ds-stripper-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes ds-stripper-glitch-anim {
  0% { opacity: 0.3; transform: translateX(-2px); }
  30% { opacity: 1; transform: translateX(2px); }
  60% { opacity: 0.7; transform: translateX(-1px); }
  100% { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .ds-stripper-cursor { animation: none; opacity: 1; }
  .ds-stripper-glitch { animation: none; }
}
`;

function injectStripperCSS() {
  if (document.getElementById("ds-stripper-style")) return;
  const style = document.createElement("style");
  style.id = "ds-stripper-style";
  style.textContent = CSS;
  document.head.append(style);
}

function getLocalTimeString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#0123456789";

function createTerminal(boxEl) {
  injectStripperCSS();

  boxEl.replaceChildren();
  boxEl.tabIndex = 0;

  const contentContainer = document.createElement("div");
  contentContainer.className = "ds-stripper-log-content";
  boxEl.appendChild(contentContainer);

  const cursorEl = document.createElement("span");
  cursorEl.className = "ds-stripper-cursor";
  cursorEl.textContent = "█";
  boxEl.appendChild(cursorEl);

  let linesHistory = [];
  const MAX_LINES = 500;

  let queue = [];
  let isRunningAnimation = false;
  let rafId = null;
  let userScrolledUp = false;
  let lastProgressItem = null;
  let lastRunId = null;

  const prefersReducedMotion = () => {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  };

  boxEl.addEventListener("scroll", () => {
    const distanceToBottom = boxEl.scrollHeight - boxEl.scrollTop - boxEl.clientHeight;
    userScrolledUp = distanceToBottom > 30;
  });

  function maybeScrollToBottom() {
    if (!userScrolledUp) {
      boxEl.scrollTop = boxEl.scrollHeight;
    }
  }

  function appendRenderedLine(lineEl) {
    contentContainer.appendChild(lineEl);
    while (contentContainer.children.length > MAX_LINES) {
      contentContainer.removeChild(contentContainer.firstChild);
      linesHistory.shift();
    }
    maybeScrollToBottom();
  }

  function renderLineInstant(item) {
    if (item.type === "banner") {
      const banner = document.createElement("div");
      banner.className = "ds-stripper-banner";
      banner.textContent = item.text;
      appendRenderedLine(banner);
      linesHistory.push(item.text);
      return;
    }

    if (item.type === "separator") {
      const sep = document.createElement("div");
      sep.className = "ds-stripper-separator";
      sep.textContent = "─".repeat(50);
      appendRenderedLine(sep);
      linesHistory.push("─".repeat(50));
      return;
    }

    const line = document.createElement("div");
    line.className = "ds-stripper-line";

    const timeSpan = document.createElement("span");
    timeSpan.className = "ds-stripper-time";
    timeSpan.textContent = `[${item.time}]`;
    line.appendChild(timeSpan);

    const kindSpan = document.createElement("span");
    const kindLower = item.kind.toLowerCase().trim();
    kindSpan.className = `ds-stripper-kind ds-stripper-kind-${kindLower}`;
    const displayKind = item.kind === "OK" ? " OK " : item.kind.padEnd(4, " ").slice(0, 4);
    kindSpan.textContent = `[${displayKind}]`;
    line.appendChild(kindSpan);

    const contentSpan = document.createElement("span");
    contentSpan.className = "ds-stripper-content";
    contentSpan.textContent = item.text;
    line.appendChild(contentSpan);

    if (item.kind === "OK" && !prefersReducedMotion()) {
      line.classList.add("ds-stripper-glitch");
    }

    appendRenderedLine(line);
    linesHistory.push(`[${item.time}] [${displayKind}] ${item.text}`);
  }

  function processQueue() {
    if (queue.length === 0) {
      isRunningAnimation = false;
      rafId = null;
      return;
    }

    isRunningAnimation = true;

    if (prefersReducedMotion() || queue.length > 100) {
      while (queue.length > 0) {
        renderLineInstant(queue.shift());
      }
      isRunningAnimation = false;
      rafId = null;
      return;
    }

    const item = queue.shift();

    if (item.type === "banner" || item.type === "separator") {
      renderLineInstant(item);
      rafId = requestAnimationFrame(processQueue);
      return;
    }

    if (item.isProgress && lastProgressItem && lastProgressItem.el?.isConnected) {
      lastProgressItem.contentEl.textContent = item.text;
      maybeScrollToBottom();
      rafId = requestAnimationFrame(processQueue);
      return;
    }

    const line = document.createElement("div");
    line.className = "ds-stripper-line";

    const timeSpan = document.createElement("span");
    timeSpan.className = "ds-stripper-time";
    timeSpan.textContent = `[${item.time}]`;
    line.appendChild(timeSpan);

    const kindSpan = document.createElement("span");
    const kindLower = item.kind.toLowerCase().trim();
    kindSpan.className = `ds-stripper-kind ds-stripper-kind-${kindLower}`;
    const displayKind = item.kind === "OK" ? " OK " : item.kind.padEnd(4, " ").slice(0, 4);
    kindSpan.textContent = `[${displayKind}]`;
    line.appendChild(kindSpan);

    const contentSpan = document.createElement("span");
    contentSpan.className = "ds-stripper-content";
    line.appendChild(contentSpan);

    if (item.kind === "OK") {
      line.classList.add("ds-stripper-glitch");
    }

    appendRenderedLine(line);
    linesHistory.push(`[${item.time}] [${displayKind}] ${item.text}`);

    if (item.isProgress) {
      lastProgressItem = { el: line, contentEl: contentSpan };
    } else {
      lastProgressItem = null;
    }

    const fullText = item.text;
    const isSaveLine = item.kind === "SAVE";
    let charIndex = 0;
    let scrambleFrames = isSaveLine ? 6 : 0;
    const fastForward = queue.length > 20;
    const stepSize = fastForward ? 8 : (isSaveLine ? 2 : 1);

    function stepTyping() {
      if (scrambleFrames > 0) {
        scrambleFrames--;
        let scrambled = "";
        for (let i = 0; i < fullText.length; i++) {
          if (fullText[i] === " " || fullText[i] === "/") {
            scrambled += fullText[i];
          } else {
            scrambled += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
        }
        contentSpan.textContent = scrambled;
        maybeScrollToBottom();
        rafId = requestAnimationFrame(stepTyping);
        return;
      }

      if (charIndex < fullText.length) {
        charIndex = Math.min(fullText.length, charIndex + stepSize);
        contentSpan.textContent = fullText.slice(0, charIndex);
        maybeScrollToBottom();
        rafId = requestAnimationFrame(stepTyping);
      } else {
        contentSpan.textContent = fullText;
        maybeScrollToBottom();
        rafId = requestAnimationFrame(processQueue);
      }
    }

    rafId = requestAnimationFrame(stepTyping);
  }

  function enqueue(item) {
    queue.push(item);
    if (!isRunningAnimation) {
      processQueue();
    }
  }

  const api = {
    addLine(kind, text, time = null) {
      const isProgress = (kind === "WIPE" && text.includes("[█"));
      enqueue({
        type: "line",
        kind: kind.trim(),
        text: String(text ?? ""),
        time: time || getLocalTimeString(),
        isProgress,
      });
    },

    addSeparator(runId) {
      if (lastRunId !== null && lastRunId !== runId) {
        enqueue({ type: "separator" });
      }
      lastRunId = runId;
    },

    clear() {
      if (rafId) cancelAnimationFrame(rafId);
      queue = [];
      isRunningAnimation = false;
      rafId = null;
      lastProgressItem = null;
      contentContainer.replaceChildren();
      linesHistory = [];
      userScrolledUp = false;
      api.addLine("SYS", "log cleared");
    },

    resetToReady() {
      if (rafId) cancelAnimationFrame(rafId);
      queue = [];
      isRunningAnimation = false;
      rafId = null;
      lastProgressItem = null;
      contentContainer.replaceChildren();
      linesHistory = [];
      userScrolledUp = false;
      renderLineInstant({ type: "banner", text: BANNER_ART });
      renderLineInstant({ type: "line", kind: "SYS", text: "ready", time: getLocalTimeString() });
    },

    skipAnimation() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      while (queue.length > 0) {
        renderLineInstant(queue.shift());
      }
      isRunningAnimation = false;
      maybeScrollToBottom();
    },

    scrollToBottom() {
      userScrolledUp = false;
      boxEl.scrollTop = boxEl.scrollHeight;
    },

    async copyAll() {
      const fullLogText = linesHistory.join("\n");
      try {
        await navigator.clipboard.writeText(fullLogText);
      } catch (err) {
        console.warn("[DS Stripper] Clipboard copy failed:", err);
      }
    },

    getAllText() {
      return linesHistory.join("\n");
    },
  };

  // Keyboard navigation and shortcuts
  boxEl.addEventListener("keydown", (e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      e.stopPropagation();
      api.clear();
      return;
    }

    if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      e.stopPropagation();
      api.copyAll();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      api.skipAnimation();
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      api.scrollToBottom();
      return;
    }
  });

  api.resetToReady();
  return api;
}

registerCardNode("DSStripper", (node, card) => {
  let queuedRuns = 0;

  const stripButton = Button({
    label: "Strip Meta Data",
    variant: "primary",
    onClick: async () => {
      const hasInputs = Array.isArray(node.inputs) && node.inputs.some((inp) => inp.link != null);
      if (!hasInputs) {
        terminal.addLine("WARN", "No input linked to 'Images'. Connect an image or use 'Upload Video'.");
        return;
      }

      queuedRuns++;
      updateButtonLabel();
      terminal.addLine("QUEUED", "Queueing workflow execution...");

      try {
        if (app.queuePrompt) {
          await app.queuePrompt(0, 1, { queueNodeIds: [node.id], partialExecutionTargets: [node.id] });
        }
      } catch (err) {
        try {
          await app.queuePrompt(0);
        } catch (queueErr) {
          terminal.addLine("FAIL", `Queue failed: ${queueErr.message || queueErr}`);
          queuedRuns = Math.max(0, queuedRuns - 1);
          updateButtonLabel();
        }
      }
    },
  });

  function updateButtonLabel() {
    if (queuedRuns > 0) {
      stripButton.setLabel(`Stripping... (${queuedRuns} queued)`);
    } else {
      stripButton.setLabel("Strip Meta Data");
    }
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi,video/*";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  let isUploadingVideo = false;

  const uploadVideoButton = Button({
    label: "Upload Video",
    variant: "secondary",
    onClick: () => {
      if (isUploadingVideo) return;
      fileInput.value = "";
      fileInput.click();
    },
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    isUploadingVideo = true;
    uploadVideoButton.setDisabled?.(true);
    uploadVideoButton.setLabel("Stripping Video...");
    terminal.addSeparator("video");
    terminal.addLine("SYS", `Selected video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    terminal.addLine("LOAD", "Uploading to video stripper...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("node_id", String(node.id));

      const resp = await fetch("/ds/stripper/strip_video", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${resp.status}`);
      }

      const res = await resp.json();
      if (res.logs && Array.isArray(res.logs)) {
        const curText = terminal.getAllText();
        for (const line of res.logs) {
          if (!curText.includes(line)) {
            const m = line.match(/^\[(.*?)\]\s+\[(.*?)\]\s+(.*)$/);
            if (m) terminal.addLine(m[2].trim(), m[3], m[1]);
          }
        }
      }
    } catch (err) {
      terminal.addLine("FAIL", `Video stripping failed: ${err.message || err}`);
    } finally {
      isUploadingVideo = false;
      uploadVideoButton.setDisabled?.(false);
      uploadVideoButton.setLabel("Upload Video");
      fileInput.value = "";
    }
  });

  const textPreview = TextPreview({
    copyable: false,
    className: "ds-stripper-log-preview",
  });

  card.row([stripButton.root, uploadVideoButton.root]);
  card.grow(textPreview.root, { minHeight: 140 });

  const terminal = createTerminal(textPreview.box);
  node.stripperTerminal = terminal;
  card.ds._node = node;

  // Live log listener from Python PromptServer
  const handleLogEvent = (event) => {
    const data = event.detail;
    if (!data || String(data.node) !== String(node.id)) return;

    if (data.run != null) {
      terminal.addSeparator(data.run);
    }

    terminal.addLine(data.kind || "SYS", data.text || "", data.time);

    if (data.kind === "OK" || data.kind === "FAIL") {
      queuedRuns = Math.max(0, queuedRuns - 1);
      updateButtonLabel();
    }
  };

  api.addEventListener("deathshotarsenal.stripper.log", handleLogEvent);

  // Global execution complete fallback
  const handleStatusEvent = (event) => {
    const queueRemaining = event.detail?.exec_info?.queue_remaining ?? 0;
    if (queueRemaining === 0 && queuedRuns > 0) {
      queuedRuns = 0;
      updateButtonLabel();
    }
  };
  api.addEventListener("status", handleStatusEvent);

  // Authoritative result handler
  const baseOnExecuted = node.onExecuted;
  node.onExecuted = function (message) {
    baseOnExecuted?.apply(this, arguments);

    if (message?.card_log && Array.isArray(message.card_log)) {
      const existingText = terminal.getAllText();
      for (const rawLine of message.card_log) {
        if (!existingText.includes(rawLine)) {
          const match = rawLine.match(/^\[(.*?)\]\s+\[(.*?)\]\s+(.*)$/);
          if (match) {
            terminal.addLine(match[2].trim(), match[3], match[1]);
          } else {
            terminal.addLine("SYS", rawLine);
          }
        }
      }
    }
    queuedRuns = 0;
    updateButtonLabel();
  };

  // Reset to banner and ready on configure
  const baseOnConfigure = node.onConfigure;
  node.onConfigure = function () {
    const r = baseOnConfigure?.apply(this, arguments);
    terminal.resetToReady();
    queuedRuns = 0;
    updateButtonLabel();
    return r;
  };

  // Cleanup on remove
  const baseOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    try { fileInput.remove(); } catch (_) {}
    api.removeEventListener("deathshotarsenal.stripper.log", handleLogEvent);
    api.removeEventListener("status", handleStatusEvent);
    return baseOnRemoved?.apply(this, arguments);
  };
}, {
  title: "Stripper",
  minWidth: 320,
  width: 420,
  height: 360,
  actions: [
    {
      icon: "trash-2",
      tooltip: "Clear log",
      onClick: (e, cardApi) => {
        const targetNode = cardApi?._node || app.graph?._nodes?.find((n) => n.card?.ds === cardApi) || null;
        if (targetNode?.stripperTerminal) {
          targetNode.stripperTerminal.clear();
        }
      },
    },
    {
      icon: "copy",
      tooltip: "Copy log",
      onClick: async (e, cardApi) => {
        const targetNode = cardApi?._node || app.graph?._nodes?.find((n) => n.card?.ds === cardApi) || null;
        if (targetNode?.stripperTerminal) {
          await targetNode.stripperTerminal.copyAll();
        }
      },
    },
  ],
});
