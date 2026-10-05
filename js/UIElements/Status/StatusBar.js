/**
 * DeathshotArsenal UI — StatusBar Component
 * Compact status & progress indicator for background tasks and node operations.
 */

import { DSIcon } from "../../Icons/index.js";

export function StatusBar(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-status-bar";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  let currentState = options.state || "idle"; // "idle" | "running" | "success" | "error"
  let currentText = options.text || "Ready";
  let currentProgress = options.progress != null ? Number(options.progress) : null;

  // Status indicator dot
  const dot = document.createElement("span");
  dot.className = "ds-ui-status-dot";

  // Label text
  const label = document.createElement("span");
  label.className = "ds-ui-status-label";
  label.textContent = currentText;

  // Mini progress track
  const progressTrack = document.createElement("div");
  progressTrack.className = "ds-ui-status-track";

  const progressFill = document.createElement("div");
  progressFill.className = "ds-ui-status-fill";
  progressTrack.appendChild(progressFill);

  // Percentage badge
  const percentBadge = document.createElement("span");
  percentBadge.className = "ds-ui-status-percent";
  percentBadge.style.display = "none";

  root.append(dot, label, progressTrack, percentBadge);

  const applyState = () => {
    root.dataset.state = currentState;
    label.textContent = currentText;

    if (currentProgress != null && currentState === "running") {
      progressTrack.style.display = "block";
      progressFill.style.width = `${Math.min(100, Math.max(0, currentProgress))}%`;
      progressFill.classList.remove("is-indeterminate");
      percentBadge.style.display = "inline-block";
      percentBadge.textContent = `${Math.round(currentProgress)}%`;
    } else if (currentState === "running") {
      progressTrack.style.display = "block";
      progressFill.style.width = "100%";
      progressFill.classList.add("is-indeterminate");
      percentBadge.style.display = "none";
    } else {
      progressTrack.style.display = "none";
      progressFill.classList.remove("is-indeterminate");
      percentBadge.style.display = "none";
    }
  };

  applyState();

  const api = {
    root,
    label,
    dot,
    progressTrack,
    progressFill,
    percentBadge,
    setStatus(text, state = "idle") {
      currentText = text;
      currentState = state;
      applyState();
    },
    setProgress(percent, text = null) {
      currentProgress = percent != null ? Number(percent) : null;
      if (text != null) currentText = text;
      if (currentState !== "running") currentState = "running";
      applyState();
    },
    reset(text = "Ready") {
      currentState = "idle";
      currentText = text;
      currentProgress = null;
      applyState();
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
