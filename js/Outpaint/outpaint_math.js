const MAX_OUTPUT_DIMENSION = 16384;
const MAX_OUTPUT_PIXELS = 64000000;

function split(delta, direction, horizontal) {
  delta = Math.max(0, Math.round(delta));
  const d = String(direction || "Both").toLowerCase();
  if (horizontal && d === "left") return [delta, 0];
  if (horizontal && d === "right") return [0, delta];
  if (!horizontal && d === "top") return [delta, 0];
  if (!horizontal && d === "bottom") return [0, delta];
  const a = Math.floor(delta / 2);
  return [a, delta - a];
}

function snapUp(value, multiple) {
  const m = Math.max(1, Math.round(Number(multiple) || 1));
  return Math.max(m, Math.ceil(Number(value) / m) * m);
}

export function calculatePreview(state = {}, iw, ih) {
  iw = Math.max(1, Math.round(Number(iw) || 1));
  ih = Math.max(1, Math.round(Number(ih) || 1));
  const ratioParts = String(state.ratio || "3:2").split(":").map(Number);
  const ratio = ratioParts[0] > 0 && ratioParts[1] > 0 ? ratioParts[0] / ratioParts[1] : 1;
  let left = 0, top = 0, right = 0, bottom = 0;
  let baseW = iw, baseH = ih;
  const anchor = state.mode === "By side" ? "Both" : String(state.direction || "Both");

  if (state.mode === "By side") {
    left = Math.max(0, Math.round(Number(state.pad_left) || 0));
    top = Math.max(0, Math.round(Number(state.pad_top) || 0));
    right = Math.max(0, Math.round(Number(state.pad_right) || 0));
    bottom = Math.max(0, Math.round(Number(state.pad_bottom) || 0));
    baseW = iw + left + right;
    baseH = ih + top + bottom;
  } else {
    const current = iw / ih;
    if (ratio > current) {
      baseW = Math.max(iw, Math.ceil(ih * ratio));
      [left, right] = split(baseW - iw, anchor, true);
    } else if (ratio < current) {
      baseH = Math.max(ih, Math.ceil(iw / ratio));
      [top, bottom] = split(baseH - ih, anchor, false);
    }
  }

  // Precedence: base ratio/manual pixels first, uniform MP scale second, outward snap last.
  const mp = Number(state.target_mp) || 0;
  const scale = mp > 0 ? Math.sqrt((mp * 1000000) / Math.max(1, baseW * baseH)) : 1;
  const imageW = Math.max(1, Math.round(iw * scale));
  const imageH = Math.max(1, Math.round(ih * scale));
  left = Math.max(0, Math.round(left * scale));
  top = Math.max(0, Math.round(top * scale));
  right = Math.max(0, Math.round(right * scale));
  bottom = Math.max(0, Math.round(bottom * scale));

  let totalW = imageW + left + right;
  let totalH = imageH + top + bottom;
  if (state.snap_enabled) {
    const m = Math.max(1, Math.round(Number(state.snap_multiple) || 1));
    const sw = snapUp(totalW, m);
    const sh = snapUp(totalH, m);
    const [dl, dr] = split(sw - totalW, anchor, true);
    const [dt, db] = split(sh - totalH, anchor, false);
    left += dl; right += dr; top += dt; bottom += db;
    totalW = sw; totalH = sh;
  }

  return {
    totalW, totalH, left, top, right, bottom,
    scale,
    safe: totalW <= MAX_OUTPUT_DIMENSION && totalH <= MAX_OUTPUT_DIMENSION && totalW * totalH <= MAX_OUTPUT_PIXELS,
    baseW, baseH,
  };
}
