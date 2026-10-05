/**
 * DeathshotArsenal Unified Icon System
 * Single source of truth for Lucide SVG icons across all nodes.
 */

import { LUCIDE_ICONS } from "./lucide_svgs.js";

/**
 * Creates an SVG icon element.
 * @param {string} name - Lucide icon name (e.g. "chevron-down", "pipette", "sliders")
 * @param {Object} options - { size = 14, color = "currentColor", strokeWidth = 2, className = "" }
 * @returns {SVGElement}
 */
export function DSIcon(name, options = {}) {
  const size = options.size ?? 14;
  const color = options.color ?? "currentColor";
  const strokeWidth = options.strokeWidth ?? 2;
  const extraClass = options.className ? ` ${options.className}` : "";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", String(strokeWidth));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", `ds-icon ds-icon-${name}${extraClass}`);
  svg.setAttribute("aria-hidden", "true");

  const inner = LUCIDE_ICONS[name] || LUCIDE_ICONS["sparkles"] || '<circle cx="12" cy="12" r="10"/>';
  svg.innerHTML = inner;

  return svg;
}

/**
 * Returns raw SVG markup string for contexts needing HTML strings.
 */
export function DSIconMarkup(name, options = {}) {
  const size = options.size ?? 14;
  const color = options.color ?? "currentColor";
  const strokeWidth = options.strokeWidth ?? 2;
  const extraClass = options.className ? ` ${options.className}` : "";
  const inner = LUCIDE_ICONS[name] || LUCIDE_ICONS["sparkles"] || '<circle cx="12" cy="12" r="10"/>';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="ds-icon ds-icon-${name}${extraClass}" aria-hidden="true">${inner}</svg>`;
}

export function hasIcon(name) {
  return Boolean(LUCIDE_ICONS[name]);
}

// Bind globally to window
if (typeof window !== "undefined") {
  window.DSIcon = DSIcon;
  window.DSIconMarkup = DSIconMarkup;
}
