/**
 * DeathshotArsenal UI — VideoPlayerModal Component
 * Fullscreen media player modal with timeline scrubber, audio slider, speed selector,
 * aspect ratio toggles, keyboard shortcuts, and inactivity auto-hide.
 */

import { DSIconMarkup } from "../../Icons/index.js";

const SPECIAL_ICONS = {
  loop: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  backward5: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19l-9-7 9-7v14z"/><path d="M22 19l-9-7 9-7v14z"/></svg>`,
  forward5: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 19l9-7-9-7v14z"/><path d="M2 19l9-7-9-7v14z"/></svg>`,
  pip: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><rect x="12" y="9" width="8" height="6" rx="1" ry="1"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  cover: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  minimize: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const RESUME_PREFIX = "ds_video_resume_";
function getResumeKey(id) {
  if (!id) return null;
  const clean = String(id).replace(/[^a-zA-Z0-9_\-]/g, "_").slice(-120);
  return `${RESUME_PREFIX}${clean}`;
}

function saveResume(id, time, dur, title) {
  const key = getResumeKey(id);
  if (!key) return;
  try {
    if (!Number.isFinite(time) || time < 5) return;
    if (Number.isFinite(dur) && dur > 0 && dur - time < 10) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify({
      time: Math.floor(time),
      duration: Math.floor(dur || 0),
      title: title || "",
      ts: Date.now()
    }));
  } catch (_) {}
}

function getResume(id) {
  const key = getResumeKey(id);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Number.isFinite(data.time) && data.time >= 5) {
      return data;
    }
  } catch (_) {}
  return null;
}

function clearResume(id) {
  const key = getResumeKey(id);
  if (!key) return;
  try { localStorage.removeItem(key); } catch (_) {}
}

export function VideoPlayerModal(options = {}) {
  // Teardown any previously open player modal cleanly
  if (typeof window._dsActiveVideoPlayerModal?.close === "function") {
    try { window._dsActiveVideoPlayerModal.close(); } catch (_) {}
    window._dsActiveVideoPlayerModal = null;
  }
  document.querySelectorAll(".ds-gallery-player-modal, .ds-ui-player-modal").forEach((el) => {
    try { el.remove(); } catch (_) {}
  });

  const items = Array.isArray(options.items) ? options.items : null;
  let currentIndex = Number(options.currentIndex) || 0;
  let currentSrc = options.src || (items ? items[currentIndex]?.url || items[currentIndex]?.src : "");
  let currentTitle = options.title || (items ? items[currentIndex]?.name || items[currentIndex]?.title : "Media Preview") || "Media Preview";
  let isImage = Boolean(options.isImage ?? (items ? items[currentIndex]?.type === "image" : false));

  let isLooping = options.loop !== undefined ? Boolean(options.loop) : true;
  try {
    const savedLoop = localStorage.getItem("ds_video_player_loop");
    if (savedLoop !== null) isLooping = savedLoop === "1";
  } catch (_) {}

  let isCover = false;
  let prevVolume = options.volume != null ? Number(options.volume) : 1.0;
  let hideTimeout = null;
  let isScrubbing = false;
  let wasPlayingBeforeScrub = false;
  let scrubTargetPct = null;
  let lastScrubSeekTime = 0;
  let animFrameId = null;
  let isClosed = false;
  let currentPlayPromise = null;

  const overlay = document.createElement("div");
  overlay.className = "ds-gallery-player-modal ds-ui-player-modal";

  const hasMultiple = items && items.length > 1;

  overlay.innerHTML = `
    <div class="ds-gallery-player-header" data-header>
      <div class="ds-gallery-player-header-left">
        <span class="ds-gallery-player-badge" data-counter style="${hasMultiple ? "" : "display:none;"}">
          ${hasMultiple ? `${currentIndex + 1} / ${items.length}` : ""}
        </span>
        <span class="ds-gallery-player-title" data-title title="${currentTitle}">${currentTitle}</span>
      </div>
      <div class="ds-gallery-player-header-right">
        <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-fit title="Aspect Ratio: Fit / Fill (C)">
          ${SPECIAL_ICONS.fit}
        </button>
        <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-pip title="Picture-in-Picture (P)" style="${isImage ? "display:none;" : ""}">
          ${SPECIAL_ICONS.pip}
        </button>
        <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-minimize title="Minimize to Dock (Pass-Through)" style="${isImage ? "display:none;" : ""}">
          ${SPECIAL_ICONS.minimize}
        </button>
        <a class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-download download="${currentTitle}" href="${currentSrc}" title="Download Media">
          ${DSIconMarkup("download", { size: 14 })}
        </a>
        <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-close title="Close (Esc)">
          ${DSIconMarkup("x", { size: 14 })}
        </button>
      </div>
    </div>

    <div class="ds-gallery-player-pip-dock" data-pip-dock style="display:none;">
      <div class="ds-gallery-player-pip-dock-info">
        <span class="ds-gallery-player-pip-dock-pulse"></span>
        <span class="ds-gallery-player-pip-dock-icon">${SPECIAL_ICONS.pip}</span>
        <span class="ds-gallery-player-pip-dock-title" data-pip-dock-title title="${currentTitle}">${currentTitle}</span>
        <span class="ds-gallery-player-pip-dock-time" data-pip-dock-time>00:00 / 00:00</span>
      </div>
      <div class="ds-gallery-player-pip-dock-actions">
        <button type="button" class="ds-gallery-pip-btn-restore" data-pip-restore title="Restore Full Player">
          ${DSIconMarkup("maximize-2", { size: 12 })}
          <span>Restore</span>
        </button>
        <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-gallery-pip-btn-close" data-pip-close title="Close Video">
          ${DSIconMarkup("x", { size: 12 })}
        </button>
      </div>
    </div>

    <div class="ds-gallery-player-viewport" data-viewport>
      <video class="ds-gallery-player-video" data-video playsinline preload="auto" style="${isImage ? "display:none;" : ""}"></video>
      <img class="ds-gallery-player-video" data-img src="${isImage ? currentSrc : ""}" style="${isImage ? "display:block;" : "display:none;"}" />
      <div class="ds-gallery-player-splash" data-splash>
        ${DSIconMarkup("play", { size: 32 })}
      </div>
      <div class="ds-gallery-player-loading" data-loading style="display:none;">
        <div class="ds-gallery-player-spinner"></div>
        <span>Buffering...</span>
      </div>
      <div class="ds-gallery-continue-badge" data-continue-badge style="display:none;">
        <div class="ds-gallery-continue-content">
          <span class="ds-gallery-continue-icon">${DSIconMarkup("play", { size: 14 })}</span>
          <div class="ds-gallery-continue-text">
            <span class="ds-gallery-continue-label">Resume playback?</span>
            <span class="ds-gallery-continue-time" data-continue-time>00:00</span>
          </div>
          <button type="button" class="ds-gallery-continue-btn" data-btn-continue>
            Continue
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-gallery-continue-close" data-btn-continue-close title="Dismiss">
            ${DSIconMarkup("x", { size: 12 })}
          </button>
        </div>
        <div class="ds-gallery-continue-progress-bar">
          <div class="ds-gallery-continue-progress-fill" data-continue-progress></div>
        </div>
      </div>
      <button type="button" class="ds-gallery-player-nav ds-gallery-player-prev" data-prev title="Previous (Shift+←)" style="${hasMultiple ? "" : "display:none;"}">${DSIconMarkup("chevron-left", { size: 18 })}</button>
      <button type="button" class="ds-gallery-player-nav ds-gallery-player-next" data-next title="Next (Shift+→)" style="${hasMultiple ? "" : "display:none;"}">${DSIconMarkup("chevron-right", { size: 18 })}</button>
    </div>

    <div class="ds-gallery-player-controls-wrap" data-controls-wrap style="${isImage ? "display:none;" : ""}">
      <div class="ds-gallery-player-scrubber-zone" data-scrubber-zone>
        <div class="ds-gallery-player-tooltip" data-scrubber-tooltip>00:00</div>
        <div class="ds-gallery-player-timeline" data-timeline>
          <div class="ds-gallery-player-buffered" data-buffered></div>
          <div class="ds-gallery-player-fill" data-fill>
            <div class="ds-gallery-player-thumb"></div>
          </div>
        </div>
      </div>

      <div class="ds-gallery-player-bar">
        <div class="ds-gallery-player-bar-left">
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only ds-ui-btn-primary" data-btn-play title="Play / Pause (Space)">
            ${DSIconMarkup("play", { size: 14 })}
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-seek-back title="Rewind 5s (←)">
            ${SPECIAL_ICONS.backward5}
          </button>
          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-seek-fwd title="Forward 5s (→)">
            ${SPECIAL_ICONS.forward5}
          </button>
          <div class="ds-gallery-player-time">
            <span data-time-cur class="ds-gallery-time-current">00:00</span>
            <span class="ds-gallery-time-sep">/</span>
            <span data-time-dur class="ds-gallery-time-total">00:00</span>
          </div>
        </div>

        <div class="ds-gallery-player-bar-right">
          <div class="ds-gallery-player-vol-group">
            <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-mute title="Mute / Unmute (M)">
              ${DSIconMarkup("volume-2", { size: 14 })}
            </button>
            <input type="range" class="ds-gallery-player-vol-slider" data-vol-slider min="0" max="1" step="0.05" value="1" title="Volume (↑/↓)">
          </div>

          <button type="button" class="ds-ui-btn ds-ui-btn-compact ${isLooping ? "is-active" : ""}" data-btn-loop title="${isLooping ? "Loop: On (L)" : "Loop: Off (L)"}">
            ${SPECIAL_ICONS.loop}
            <span style="font-size:10px;margin-left:2px;font-weight:700;">Loop</span>
          </button>

          <div class="ds-gallery-player-speed-wrap" data-speed-wrap>
            <button type="button" class="ds-ui-btn ds-ui-btn-compact" data-speed-btn title="Playback Speed">1.0x</button>
            <div class="ds-gallery-player-speed-menu" data-speed-menu>
              <div class="ds-gallery-player-speed-item" data-speed="0.25">0.25x</div>
              <div class="ds-gallery-player-speed-item" data-speed="0.5">0.5x</div>
              <div class="ds-gallery-player-speed-item" data-speed="0.75">0.75x</div>
              <div class="ds-gallery-player-speed-item active" data-speed="1.0">1.0x</div>
              <div class="ds-gallery-player-speed-item" data-speed="1.25">1.25x</div>
              <div class="ds-gallery-player-speed-item" data-speed="1.5">1.5x</div>
              <div class="ds-gallery-player-speed-item" data-speed="2.0">2.0x</div>
            </div>
          </div>

          <button type="button" class="ds-ui-btn ds-ui-btn-compact ds-ui-btn-icon-only" data-btn-fullscreen title="Toggle Fullscreen (F)">
            ${DSIconMarkup("maximize-2", { size: 14 })}
          </button>
        </div>
      </div>
    </div>
  `;

  const video = overlay.querySelector("[data-video]");
  const imgEl = overlay.querySelector("[data-img]");
  const playBtn = overlay.querySelector("[data-btn-play]");
  const muteBtn = overlay.querySelector("[data-btn-mute]");
  const volSlider = overlay.querySelector("[data-vol-slider]");
  const timeCur = overlay.querySelector("[data-time-cur]");
  const timeDur = overlay.querySelector("[data-time-dur]");
  const scrubberZone = overlay.querySelector("[data-scrubber-zone]");
  const scrubberTooltip = overlay.querySelector("[data-scrubber-tooltip]");
  const timeline = overlay.querySelector("[data-timeline]");
  const fill = overlay.querySelector("[data-fill]");
  const buffered = overlay.querySelector("[data-buffered]");
  const titleEl = overlay.querySelector("[data-title]");
  const counterEl = overlay.querySelector("[data-counter]");
  const fitBtn = overlay.querySelector("[data-btn-fit]");
  const pipBtn = overlay.querySelector("[data-btn-pip]");
  const minimizeBtn = overlay.querySelector("[data-btn-minimize]");
  const pipDock = overlay.querySelector("[data-pip-dock]");
  const pipDockTitle = overlay.querySelector("[data-pip-dock-title]");
  const pipDockTime = overlay.querySelector("[data-pip-dock-time]");
  const pipDockRestore = overlay.querySelector("[data-pip-restore]");
  const pipDockClose = overlay.querySelector("[data-pip-close]");
  const continueBadge = overlay.querySelector("[data-continue-badge]");
  const continueTimeEl = overlay.querySelector("[data-continue-time]");
  const continueBtn = overlay.querySelector("[data-btn-continue]");
  const continueCloseBtn = overlay.querySelector("[data-btn-continue-close]");
  const continueProgress = overlay.querySelector("[data-continue-progress]");
  const downloadBtn = overlay.querySelector("[data-btn-download]");
  const loopBtn = overlay.querySelector("[data-btn-loop]");
  const seekBackBtn = overlay.querySelector("[data-btn-seek-back]");
  const seekFwdBtn = overlay.querySelector("[data-btn-seek-fwd]");
  const speedWrap = overlay.querySelector("[data-speed-wrap]");
  const speedBtn = overlay.querySelector("[data-speed-btn]");
  const speedMenu = overlay.querySelector("[data-speed-menu]");
  const fullscreenBtn = overlay.querySelector("[data-btn-fullscreen]");
  const splashEl = overlay.querySelector("[data-splash]");
  const viewport = overlay.querySelector("[data-viewport]");
  const headerEl = overlay.querySelector("[data-header]");
  const controlsWrap = overlay.querySelector("[data-controls-wrap]");

  let isPipMode = false;
  let continueTimer = null;
  let pendingResumeTime = 0;
  let lastSaveResumeTime = 0;

  const setPipMode = (active) => {
    isPipMode = Boolean(active);
    overlay.classList.toggle("is-pip-mode", isPipMode);
    if (isPipMode) {
      pipDock.style.display = "flex";
      pipDockTitle.textContent = currentTitle || "Media Player";
      pipDockTitle.title = currentTitle || "Media Player";
      pipDockTime.textContent = `${formatDuration(video.currentTime || 0)} / ${formatDuration(video.duration || 0)}`;
    } else {
      pipDock.style.display = "none";
    }
  };

  const hideContinueBadge = () => {
    if (continueTimer) {
      clearTimeout(continueTimer);
      continueTimer = null;
    }
    if (continueBadge) {
      continueBadge.style.display = "none";
    }
  };

  const showContinueBadge = (savedTime) => {
    hideContinueBadge();
    if (!Number.isFinite(savedTime) || savedTime < 5) return;
    pendingResumeTime = savedTime;
    if (continueTimeEl) {
      continueTimeEl.textContent = `Resume from ${formatDuration(savedTime)}`;
    }
    if (continueProgress) {
      continueProgress.style.animation = "none";
      void continueProgress.offsetWidth;
      continueProgress.style.animation = "ds-continue-shrink 10s linear forwards";
    }
    if (continueBadge) {
      continueBadge.style.display = "block";
    }
    continueTimer = setTimeout(() => {
      hideContinueBadge();
    }, 10000);
  };

  const syncProgressUI = (curTime, durTime) => {
    const cur = Number.isFinite(curTime) ? curTime : video.currentTime || 0;
    const dur = Number.isFinite(durTime) ? durTime : video.duration || 1;
    const pct = dur > 0 ? Math.max(0, Math.min(100, (cur / dur) * 100)) : 0;
    fill.style.width = `${pct}%`;
    timeCur.textContent = formatDuration(cur);
    if (Number.isFinite(video.duration) && video.duration > 0) {
      timeDur.textContent = formatDuration(video.duration);
    }
    if (isPipMode && pipDockTime) {
      pipDockTime.textContent = `${formatDuration(cur)} / ${formatDuration(Number.isFinite(video.duration) ? video.duration : 0)}`;
    }
  };

  const renderPlayProgress = () => {
    if (!isScrubbing && !video.paused && !video.ended) {
      syncProgressUI();
      animFrameId = requestAnimationFrame(renderPlayProgress);
    } else {
      animFrameId = null;
    }
  };

  const startProgressLoop = () => {
    if (!animFrameId && !isScrubbing && !video.paused && !video.ended) {
      animFrameId = requestAnimationFrame(renderPlayProgress);
    }
  };

  const stopProgressLoop = () => {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };

  const resetHideTimer = () => {
    overlay.classList.remove("is-inactive");
    clearTimeout(hideTimeout);
    if (isScrubbing || isImage) return;
    if (!video.paused) {
      hideTimeout = setTimeout(() => {
        if (!isScrubbing) {
          overlay.classList.add("is-inactive");
        }
      }, 2400);
    }
  };

  overlay.addEventListener("pointermove", resetHideTimer);
  overlay.addEventListener("pointerdown", resetHideTimer);

  headerEl.addEventListener("pointerenter", () => {
    clearTimeout(hideTimeout);
    overlay.classList.remove("is-inactive");
  });
  headerEl.addEventListener("pointerleave", resetHideTimer);

  controlsWrap.addEventListener("pointerenter", () => {
    clearTimeout(hideTimeout);
    overlay.classList.remove("is-inactive");
  });
  controlsWrap.addEventListener("pointerleave", resetHideTimer);

  const showSplash = (isPlay) => {
    if (!splashEl) return;
    splashEl.innerHTML = isPlay ? DSIconMarkup("play", { size: 32 }) : DSIconMarkup("pause", { size: 32 });
    splashEl.classList.remove("is-splashing");
    void splashEl.offsetWidth;
    splashEl.classList.add("is-splashing");
    setTimeout(() => splashEl.classList.remove("is-splashing"), 320);
  };

  const loadingEl = overlay.querySelector("[data-loading]");
  const showLoading = (show) => {
    if (!loadingEl) return;
    loadingEl.style.display = show ? "flex" : "none";
  };

  const safePlay = () => {
    if (isClosed || isImage) return;
    try {
      const p = video.play();
      if (p !== undefined) {
        currentPlayPromise = p;
        p.then(() => {
          if (isClosed) {
            video.pause();
            video.removeAttribute("src");
            video.src = "";
            try { video.load(); } catch (_) {}
          }
        }).catch(() => {
          if (!isClosed && !isImage) {
            video.muted = true;
            video.play().catch(() => {});
          }
        });
      }
    } catch (_) {}
  };

  const loadMedia = (src, title, imgMode = false) => {
    if (isClosed) return;
    stopProgressLoop();
    hideContinueBadge();
    currentSrc = src;
    currentTitle = title || "Media Preview";
    isImage = Boolean(imgMode);

    titleEl.textContent = currentTitle;
    titleEl.title = currentTitle;
    if (pipDockTitle) {
      pipDockTitle.textContent = currentTitle;
      pipDockTitle.title = currentTitle;
    }
    if (hasMultiple) {
      counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
      counterEl.style.display = "inline-block";
    } else {
      counterEl.style.display = "none";
    }

    downloadBtn.href = currentSrc;
    downloadBtn.download = currentTitle;

    if (isImage) {
      showLoading(false);
      video.pause();
      video.removeAttribute("src");
      video.src = "";
      video.style.display = "none";
      imgEl.src = currentSrc;
      imgEl.style.display = "block";
      controlsWrap.style.display = "none";
      pipBtn.style.display = "none";
      if (minimizeBtn) minimizeBtn.style.display = "none";
    } else {
      imgEl.style.display = "none";
      video.style.display = "block";
      controlsWrap.style.display = "flex";
      pipBtn.style.display = document.pictureInPictureEnabled ? "inline-flex" : "none";
      if (minimizeBtn) minimizeBtn.style.display = "inline-flex";

      video.pause();
      video.preload = "auto";
      video.src = currentSrc;
      video.loop = isLooping;
      fill.style.width = "0%";
      buffered.style.width = "0%";
      timeCur.textContent = "00:00";
      timeDur.textContent = "00:00";
      showLoading(true);
      safePlay();

      const savedResume = getResume(currentSrc || currentTitle);
      if (savedResume && savedResume.time >= 5) {
        showContinueBadge(savedResume.time);
      }
    }
    resetHideTimer();
  };

  const togglePlay = () => {
    if (isImage || isClosed) return;
    if (video.paused) {
      safePlay();
      showSplash(true);
    } else {
      video.pause();
      showSplash(false);
    }
  };

  const updateLoopState = () => {
    video.loop = isLooping;
    loopBtn.classList.toggle("is-active", isLooping);
    loopBtn.title = isLooping ? "Loop: On (L)" : "Loop: Off (L)";
    try {
      localStorage.setItem("ds_video_player_loop", isLooping ? "1" : "0");
    } catch (_) {}
  };
  updateLoopState();

  loopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isLooping = !isLooping;
    updateLoopState();
    resetHideTimer();
  });

  fitBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isCover = !isCover;
    video.classList.toggle("is-cover", isCover);
    imgEl.classList.toggle("is-cover", isCover);
    fitBtn.innerHTML = isCover ? SPECIAL_ICONS.cover : SPECIAL_ICONS.fit;
    fitBtn.title = isCover ? "Aspect Ratio: Fill/Crop (C)" : "Aspect Ratio: Fit/Contain (C)";
    resetHideTimer();
  });

  video.addEventListener("enterpictureinpicture", () => {
    setPipMode(true);
  });

  video.addEventListener("leavepictureinpicture", () => {
    setPipMode(false);
  });

  if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
    pipBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          setPipMode(false);
        } else {
          await video.requestPictureInPicture();
          setPipMode(true);
        }
      } catch (_) {}
      resetHideTimer();
    });
  } else {
    pipBtn?.remove();
  }

  minimizeBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function" && !document.pictureInPictureElement) {
      try {
        await video.requestPictureInPicture();
      } catch (_) {}
    }
    setPipMode(true);
  });

  pipDockRestore?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (document.pictureInPictureElement) {
      try { await document.exitPictureInPicture(); } catch (_) {}
    }
    setPipMode(false);
  });

  pipDockClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    closePlayer();
  });

  continueBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pendingResumeTime > 0 && Number.isFinite(pendingResumeTime)) {
      video.currentTime = pendingResumeTime;
      safePlay();
    }
    hideContinueBadge();
  });

  continueCloseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    hideContinueBadge();
  });

  seekBackBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    video.currentTime = Math.max(0, video.currentTime - 5);
    syncProgressUI();
    resetHideTimer();
  });

  seekFwdBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
    syncProgressUI();
    resetHideTimer();
  });

  speedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    speedWrap.classList.toggle("open");
    resetHideTimer();
  });

  speedMenu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-speed]");
    if (!item) return;
    e.stopPropagation();
    const s = parseFloat(item.dataset.speed);
    video.playbackRate = s;
    speedBtn.textContent = `${s}x`;
    speedMenu.querySelectorAll(".ds-gallery-player-speed-item").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    speedWrap.classList.remove("open");
    resetHideTimer();
  });

  const onSpeedOutsideClick = (e) => {
    if (!speedWrap.contains(e.target)) speedWrap.classList.remove("open");
  };
  document.addEventListener("pointerdown", onSpeedOutsideClick);

  const updateVolumeUI = () => {
    volSlider.value = video.muted ? 0 : video.volume;
    muteBtn.innerHTML =
      video.muted || video.volume === 0
        ? DSIconMarkup("volume-x", { size: 14 })
        : DSIconMarkup("volume-2", { size: 14 });
  };

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = prevVolume > 0 ? prevVolume : 0.8;
    } else {
      prevVolume = video.volume > 0 ? video.volume : 0.8;
      video.muted = true;
    }
    updateVolumeUI();
    resetHideTimer();
  });

  volSlider.addEventListener("input", (e) => {
    e.stopPropagation();
    const val = parseFloat(volSlider.value);
    video.volume = val;
    video.muted = val === 0;
    if (val > 0) prevVolume = val;
    updateVolumeUI();
    resetHideTimer();
  });

  const updateFullscreenIcon = () => {
    const isFs = Boolean(document.fullscreenElement);
    fullscreenBtn.innerHTML = isFs
      ? DSIconMarkup("minimize-2", { size: 14 })
      : DSIconMarkup("maximize-2", { size: 14 });
  };

  fullscreenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      overlay.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    resetHideTimer();
  });

  document.addEventListener("fullscreenchange", updateFullscreenIcon);

  video.addEventListener("play", () => {
    playBtn.innerHTML = DSIconMarkup("pause", { size: 14 });
    startProgressLoop();
    resetHideTimer();
  });

  video.addEventListener("pause", () => {
    playBtn.innerHTML = DSIconMarkup("play", { size: 14 });
    stopProgressLoop();
    syncProgressUI();
    clearTimeout(hideTimeout);
    overlay.classList.remove("is-inactive");
    if (!isImage && Number.isFinite(video.currentTime)) {
      saveResume(currentSrc || currentTitle, video.currentTime, video.duration, currentTitle);
    }
  });

  video.addEventListener("ended", () => {
    stopProgressLoop();
    syncProgressUI();
    if (!isImage) {
      clearResume(currentSrc || currentTitle);
    }
    if (!isLooping) {
      playBtn.innerHTML = DSIconMarkup("play", { size: 14 });
      clearTimeout(hideTimeout);
      overlay.classList.remove("is-inactive");
    }
  });

  video.addEventListener("timeupdate", () => {
    if (!isScrubbing && !animFrameId) {
      syncProgressUI();
    }
    const now = performance.now();
    if (now - lastSaveResumeTime > 3000) {
      lastSaveResumeTime = now;
      if (!isImage && !video.paused && Number.isFinite(video.currentTime)) {
        saveResume(currentSrc || currentTitle, video.currentTime, video.duration, currentTitle);
      }
    }
  });

  const onMeta = () => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      timeDur.textContent = formatDuration(video.duration);
    }
    if (!isScrubbing) {
      syncProgressUI();
    }
  };
  video.addEventListener("loadedmetadata", onMeta);
  video.addEventListener("durationchange", onMeta);

  video.addEventListener("progress", () => {
    if (video.buffered.length && Number.isFinite(video.duration) && video.duration > 0) {
      const bEnd = video.buffered.end(video.buffered.length - 1);
      const bPct = Math.min(100, (bEnd / video.duration) * 100);
      buffered.style.width = `${bPct}%`;
    }
  });

  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay();
    resetHideTimer();
  });

  viewport.addEventListener("click", (e) => {
    if (e.target.closest(".ds-gallery-player-nav")) return;
    togglePlay();
    resetHideTimer();
  });

  viewport.addEventListener("dblclick", (e) => {
    if (e.target.closest(".ds-gallery-player-nav")) return;
    if (!document.fullscreenElement) {
      overlay.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  video.addEventListener("waiting", () => showLoading(true));
  video.addEventListener("seeking", () => {
    if (!isScrubbing) showLoading(true);
  });
  video.addEventListener("loadstart", () => showLoading(true));
  video.addEventListener("loadeddata", () => showLoading(false));
  video.addEventListener("canplay", () => showLoading(false));
  video.addEventListener("playing", () => showLoading(false));
  video.addEventListener("seeked", () => {
    showLoading(false);
    if (!isScrubbing) {
      syncProgressUI();
    }
  });
  video.addEventListener("error", () => showLoading(false));

  const updateScrubUI = (pct, r) => {
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const targetTime = pct * dur;
    fill.style.width = `${pct * 100}%`;
    timeCur.textContent = formatDuration(targetTime);
    scrubberTooltip.textContent = formatDuration(targetTime);
    if (r && r.width) {
      scrubberTooltip.style.left = `${Math.round(pct * r.width)}px`;
    }
  };

  scrubberZone.addEventListener("pointermove", (e) => {
    if (isScrubbing) return;
    const r = timeline.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (Number.isFinite(video.duration) && video.duration > 0) {
      scrubberTooltip.textContent = formatDuration(pct * video.duration);
      scrubberTooltip.style.left = `${Math.round(pct * r.width)}px`;
    }
    resetHideTimer();
  });

  const applyScrubFramePreview = (pct) => {
    const now = performance.now();
    // Throttle frame seeks during drag to avoid thrashed Range requests on large files.
    // Only seek if previous seek has settled (!video.seeking) and at least 150ms has passed.
    if (!video.seeking && now - lastScrubSeekTime > 150) {
      lastScrubSeekTime = now;
      const targetTime = pct * (video.duration || 0);
      if (typeof video.fastSeek === "function") {
        try { video.fastSeek(targetTime); } catch (_) { video.currentTime = targetTime; }
      } else {
        video.currentTime = targetTime;
      }
    }
  };

  const handleScrubMove = (e) => {
    const r = timeline.getBoundingClientRect();
    if (!r.width) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    scrubTargetPct = pct;
    updateScrubUI(pct, r);
    applyScrubFramePreview(pct);
  };

  scrubberZone.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    isScrubbing = true;
    overlay.classList.add("is-scrubbing");

    stopProgressLoop();
    wasPlayingBeforeScrub = !video.paused && !video.ended;
    if (wasPlayingBeforeScrub) {
      video.pause();
    }

    handleScrubMove(e);

    const onMove = (ev) => {
      if (!isScrubbing) return;
      handleScrubMove(ev);
    };

    const onUp = (ev) => {
      if (!isScrubbing) return;
      isScrubbing = false;
      overlay.classList.remove("is-scrubbing");

      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const r = timeline.getBoundingClientRect();
      const pct = scrubTargetPct !== null ? scrubTargetPct : (r.width ? Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) : 0);
      scrubTargetPct = null;

      if (Number.isFinite(video.duration) && video.duration > 0) {
        const finalTime = Math.max(0, Math.min(video.duration, pct * video.duration));
        video.currentTime = finalTime;
        updateScrubUI(pct, r);
      }

      if (wasPlayingBeforeScrub && !isClosed) {
        const onSeekedResume = () => {
          video.removeEventListener("seeked", onSeekedResume);
          if (!isClosed && !isScrubbing) {
            safePlay();
            startProgressLoop();
          }
        };
        if (video.seeking) {
          video.addEventListener("seeked", onSeekedResume, { once: true });
          setTimeout(() => {
            if (!isClosed && !isScrubbing && video.paused && wasPlayingBeforeScrub) {
              safePlay();
              startProgressLoop();
            }
          }, 400);
        } else {
          safePlay();
          startProgressLoop();
        }
      }
      resetHideTimer();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  const navigate = (delta) => {
    if (!items || items.length <= 1) return;
    const nextIdx = currentIndex + delta;
    if (nextIdx >= 0 && nextIdx < items.length) {
      currentIndex = nextIdx;
      const nextItem = items[currentIndex];
      const isImg = nextItem.type === "image" || nextItem.url?.endsWith(".png") || nextItem.url?.endsWith(".jpg");
      loadMedia(nextItem.url || nextItem.src, nextItem.name || nextItem.title, isImg);
    }
  };

  overlay.querySelector("[data-prev]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigate(-1);
    resetHideTimer();
  });

  overlay.querySelector("[data-next]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigate(1);
    resetHideTimer();
  });

  const closePlayer = () => {
    if (isClosed) return;
    isClosed = true;
    hideContinueBadge();
    showLoading(false);
    if (window._dsActiveVideoPlayerModal === api) {
      window._dsActiveVideoPlayerModal = null;
    }
    stopProgressLoop();
    clearTimeout(hideTimeout);
    document.removeEventListener("keydown", keyHandler);
    document.removeEventListener("pointerdown", onSpeedOutsideClick);
    document.removeEventListener("fullscreenchange", updateFullscreenIcon);
    if (!isImage && Number.isFinite(video.currentTime)) {
      saveResume(currentSrc || currentTitle, video.currentTime, video.duration, currentTitle);
    }
    if (document.pictureInPictureElement) {
      try { document.exitPictureInPicture(); } catch (_) {}
    }
    try {
      video.pause();
      video.removeAttribute("src");
      video.src = "";
      video.load();
    } catch (_) {}
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    overlay.remove();
    options.onClose?.();
  };

  overlay.querySelector("[data-close]").addEventListener("click", (e) => {
    e.stopPropagation();
    closePlayer();
  });

  const keyHandler = (e) => {
    if (isClosed || !overlay.isConnected) {
      document.removeEventListener("keydown", keyHandler);
      return;
    }
    if (isPipMode || overlay.classList.contains("is-pip-mode")) {
      return;
    }
    const activeTag = e.target?.tagName?.toLowerCase();
    if (activeTag === "input" || activeTag === "textarea" || e.target?.isContentEditable) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePlayer();
    } else if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (e.shiftKey) {
        navigate(-1);
      } else if (!isImage) {
        video.currentTime = Math.max(0, video.currentTime - 5);
        syncProgressUI();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (e.shiftKey) {
        navigate(1);
      } else if (!isImage) {
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        syncProgressUI();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      video.volume = Math.min(1, video.volume + 0.1);
      video.muted = false;
      updateVolumeUI();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      video.volume = Math.max(0, video.volume - 0.1);
      updateVolumeUI();
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      muteBtn.click();
    } else if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      loopBtn.click();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      fullscreenBtn.click();
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      fitBtn.click();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      pipBtn?.click();
    }
    resetHideTimer();
  };

  document.addEventListener("keydown", keyHandler);

  // Initialize media load
  loadMedia(currentSrc, currentTitle, isImage);

  document.body.appendChild(overlay);

  const api = {
    root: overlay,
    video,
    img: imgEl,
    close: closePlayer,
    loadMedia,
    togglePlay,
  };
  window._dsActiveVideoPlayerModal = api;
  return api;
}
