/**
 * DeathshotArsenal UI Design Tokens
 * ONE source of truth for DS DOM UI geometry and interaction styling.
 */
export const DS_UI_TOKENS = Object.freeze({
  // Distance from a node's visual edge to its UI face. The same value is used
  // for native-base and chromeless/baseless nodes.
  // Separate anchors for native-base and chromeless nodes. They intentionally
  // resolve to the same thickness today, but are distinct tokens so the
  // geometry can evolve without coupling the two shell types.
  shellInsetBase: 6,
  shellInsetBare: 6,
  shellInset: 6,
  edgeInset: 6,
  gapXS: 3,
  gapSM: 5,
  gapMD: 7,
  gapLG: 9,
  panelPad: 7,
  controlH: 28,
  numberH: 28,
  radius: 6,
  controlRadius: 5,
  border: 1,
  sliderTrackH: 6,
  sliderThumb: 14,
  toggleW: 34,
  toggleH: 20,
  toggleThumb: 14,
  resizeSafe: 14,
  transition: "120ms ease",
});

export const DS_UI_CSS_VARS = Object.freeze({
  "--ds-ui-shell-inset": `${DS_UI_TOKENS.shellInset}px`,
  "--ds-ui-shell-inset-base": `${DS_UI_TOKENS.shellInsetBase}px`,
  "--ds-ui-shell-inset-bare": `${DS_UI_TOKENS.shellInsetBare}px`,
  "--ds-ui-edge-inset": `${DS_UI_TOKENS.edgeInset}px`,
  "--ds-ui-inset": `${DS_UI_TOKENS.shellInset}px`,
  "--ds-ui-gap-xs": `${DS_UI_TOKENS.gapXS}px`,
  "--ds-ui-gap-sm": `${DS_UI_TOKENS.gapSM}px`,
  "--ds-ui-gap-md": `${DS_UI_TOKENS.gapMD}px`,
  "--ds-ui-gap-lg": `${DS_UI_TOKENS.gapLG}px`,
  "--ds-ui-panel-pad": `${DS_UI_TOKENS.panelPad}px`,
  "--ds-ui-control-h": `${DS_UI_TOKENS.controlH}px`,
  "--ds-ui-number-h": `${DS_UI_TOKENS.numberH}px`,
  "--ds-ui-radius": `${DS_UI_TOKENS.radius}px`,
  "--ds-ui-control-radius": `${DS_UI_TOKENS.controlRadius}px`,
  "--ds-ui-border": `${DS_UI_TOKENS.border}px`,
  "--ds-ui-slider-track-h": `${DS_UI_TOKENS.sliderTrackH}px`,
  "--ds-ui-slider-thumb": `${DS_UI_TOKENS.sliderThumb}px`,
  "--ds-ui-toggle-w": `${DS_UI_TOKENS.toggleW}px`,
  "--ds-ui-toggle-h": `${DS_UI_TOKENS.toggleH}px`,
  "--ds-ui-toggle-thumb": `${DS_UI_TOKENS.toggleThumb}px`,
  "--ds-ui-resize-safe": `${DS_UI_TOKENS.resizeSafe}px`,
  "--ds-ui-transition": DS_UI_TOKENS.transition,
});

export const DS_UI_ROOTS = [
  ".ds-isa-root", ".ds-ip-root", ".ds-ic-root", ".ds-il-root-v2",
  ".ds-prompt-root", ".ds-cards-root", ".ds-prompt-scanner-root", ".ds-qs-root",
  ".ds-res-root", ".ds-style-root", ".ds-sysdash-root", ".ds-theme-mgr-root",
  ".ds-hw-root", ".ds-run-timer-root", ".ds-viewer-wrapper", ".ds-video-timing",
  ".ds-gs-node",
].join(",");
