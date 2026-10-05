/**
 * DeathshotArsenal UI Tokens
 * Single source of truth for geometry, rhythm, and styling variables.
 */

export const DS_TOKENS = Object.freeze({
  // Geometry & Rhythm
  uiMargin: 10,             // 10px outer margin between node boundary and DOM UI
  radiusCard: 8,            // 8px rounded corners for cards/sections
  radiusControl: 5,         // 5px soft rounded corners for controls & buttons
  radiusPopup: 8,           // 8px rounded corners for menus and popovers
  radiusBadge: 4,           // 4px rounded corners for small chips & tags

  // Heights
  controlH: 28,             // Standard control height (28px)
  controlHCompact: 22,      // Compact control height (22px)
  solidBarH: 18,            // Solid block slider height (18px)

  // Gaps
  gapXS: 4,
  gapSM: 6,
  gapMD: 8,
  gapLG: 12,
  gapXL: 16,

  // Padding
  cardPadding: 10,
  controlPadX: 8,

  // Transition & Motion
  transition: "120ms ease",
  transitionFast: "60ms ease",

  // Typography
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSizeTitle: 12,
  fontSizeControl: 11,
  fontSizeLabel: 10,
  fontSizeMeta: 9,
});

export const DS_CSS_VARS = Object.freeze({
  "--ds-ui-margin": `${DS_TOKENS.uiMargin}px`,
  "--ds-radius-card": `${DS_TOKENS.radiusCard}px`,
  "--ds-radius-control": `${DS_TOKENS.radiusControl}px`,
  "--ds-radius-popup": `${DS_TOKENS.radiusPopup}px`,
  "--ds-radius-badge": `${DS_TOKENS.radiusBadge}px`,

  "--ds-control-h": `${DS_TOKENS.controlH}px`,
  "--ds-control-h-compact": `${DS_TOKENS.controlHCompact}px`,
  "--ds-solid-bar-h": `${DS_TOKENS.solidBarH}px`,

  "--ds-gap-xs": `${DS_TOKENS.gapXS}px`,
  "--ds-gap-sm": `${DS_TOKENS.gapSM}px`,
  "--ds-gap-md": `${DS_TOKENS.gapMD}px`,
  "--ds-gap-lg": `${DS_TOKENS.gapLG}px`,
  "--ds-gap-xl": `${DS_TOKENS.gapXL}px`,

  "--ds-card-padding": `${DS_TOKENS.cardPadding}px`,
  "--ds-control-pad-x": `${DS_TOKENS.controlPadX}px`,

  "--ds-transition": DS_TOKENS.transition,
  "--ds-font": DS_TOKENS.fontFamily,
});
