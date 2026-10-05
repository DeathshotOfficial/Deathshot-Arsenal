/**
 * DeathshotArsenal UI — VideoPreview Component
 * Contained frame with custom play/pause, timeline scrubber, and time display.
 */

import { DSIcon } from "../../Icons/index.js";

function formatTime(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export function VideoPreview(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-preview-container";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  const box = document.createElement("div");
  box.className = "ds-ui-image-preview-box";
  if (options.height) box.style.height = typeof options.height === "number" ? `${options.height}px` : options.height;

  const video = document.createElement("video");
  video.style.maxWidth = "100%";
  video.style.maxHeight = "100%";
  video.style.display = "none";
  video.loop = Boolean(options.loop);
  video.muted = Boolean(options.muted);
  if (options.src) {
    video.src = options.src;
    video.style.display = "block";
  }
  box.appendChild(video);

  const placeholder = document.createElement("span");
  placeholder.textContent = options.placeholder || "No Video Loaded";
  placeholder.style.color = "var(--ds-color-muted-text, #9ca3af)";
  placeholder.style.fontSize = "10px";
  placeholder.style.fontWeight = "600";
  if (options.src) placeholder.style.display = "none";
  box.appendChild(placeholder);

  root.appendChild(box);

  // Custom Controls Bar
  const controlsBar = document.createElement("div");
  controlsBar.className = "ds-ui-preview-footer";
  controlsBar.style.gap = "6px";

  // Play/Pause button
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
  let playIcon = DSIcon("play", { size: 12 });
  playBtn.appendChild(playIcon);

  // Scrubber bar
  const timeline = document.createElement("div");
  timeline.className = "ds-ui-solid-bar";
  timeline.style.height = "10px";
  timeline.style.flex = "1";

  const track = document.createElement("div");
  track.className = "ds-ui-solid-track";

  const fill = document.createElement("div");
  fill.className = "ds-ui-solid-fill";
  track.appendChild(fill);
  timeline.appendChild(track);

  // Time text
  const timeText = document.createElement("span");
  timeText.className = "ds-ui-preview-badge";
  timeText.textContent = "0:00 / 0:00";

  controlsBar.append(playBtn, timeline, timeText);
  root.appendChild(controlsBar);

  const updatePlayState = () => {
    playBtn.replaceChildren(DSIcon(video.paused ? "play" : "pause", { size: 12 }));
  };

  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.paused) video.play();
    else video.pause();
  });

  video.addEventListener("play", updatePlayState);
  video.addEventListener("pause", updatePlayState);

  video.addEventListener("timeupdate", () => {
    const cur = video.currentTime || 0;
    const dur = video.duration || 0;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    timeline.style.setProperty("--p", `${pct}%`);
    timeText.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  });

  timeline.addEventListener("pointerdown", (e) => {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0 || !video.duration) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
  });

  const api = {
    root,
    video,
    setVideo(url, metadata = "") {
      if (url) {
        video.src = url;
        video.style.display = "block";
        placeholder.style.display = "none";
      } else {
        video.src = "";
        video.style.display = "none";
        placeholder.style.display = "block";
      }
    },
    play: () => video.play(),
    pause: () => video.pause(),
    destroy() {
      video.pause();
      video.src = "";
      root.remove();
    },
  };

  return api;
}
