/**
 * DeathshotArsenal Smart Contrast Engine
 * Computes luminance and determines high-contrast text & shadow tokens.
 */

export function parseColor(color) {
  if (!color || typeof color !== "string") return null;
  const s = color.trim();
  if (!s || s === "transparent") return null;

  // #RRGGBB
  let m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];

  // #RGB
  m = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(s);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];

  // rgb(...) / rgba(...)
  if (s.startsWith("rgb")) {
    const nums = s.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return [Math.round(Number(nums[0])), Math.round(Number(nums[1])), Math.round(Number(nums[2]))];
    }
  }

  // Common fallbacks
  if (s.toLowerCase() === "white") return [255, 255, 255];
  if (s.toLowerCase() === "black") return [0, 0, 0];

  return null;
}

export function getRelativeLuminance(color) {
  const rgb = parseColor(color);
  if (!rgb) return 0.2;
  const toLinear = (v) => {
    const val = v / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

/**
 * Returns smart contrast tokens based on background, card, and accent colors.
 */
export function computeSmartContrast(accentHex, cardHex, bgHex) {
  const accentLum = getRelativeLuminance(accentHex || "#67e8f9");
  const cardLum = getRelativeLuminance(cardHex || "#12151c");

  const isBrightAccent = accentLum > 0.40;
  const onAccent = isBrightAccent ? "#0a0c10" : "#ffffff";
  const onAccentMuted = isBrightAccent ? "rgba(10, 12, 16, 0.72)" : "rgba(255, 255, 255, 0.75)";
  const onAccentShadow = isBrightAccent ? "0 1px 0 rgba(255, 255, 255, 0.35)" : "0 1px 2px rgba(0, 0, 0, 0.70)";

  const isLightCard = cardLum > 0.45;
  const textColor = isLightCard ? "#0f172a" : "#f1f5f9";
  const textMuted = isLightCard ? "#64748b" : "#94a3b8";

  return {
    "--ds-color-on-accent": onAccent,
    "--ds-color-on-accent-muted": onAccentMuted,
    "--ds-color-on-accent-shadow": onAccentShadow,
    "--ds-color-text": textColor,
    "--ds-color-muted-text": textMuted,
    "--ds-on-accent": onAccent,
    "--ds-on-accent-shadow": onAccentShadow,
    "--ds-text": textColor,
    "--ds-text-muted": textMuted,
  };
}
