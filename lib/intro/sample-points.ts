// Turns the studio's real logo artwork into "slots" for the intro's stars to
// settle into. Runs on an offscreen <canvas>, client-side only.

/** A slot in logo space: u, v in 0..1 (u left→right, v top→bottom). */
export interface LogoSlot {
  u: number;
  v: number;
}

/**
 * Fills `pathD` (an SVG path traced from the logo) onto an offscreen canvas,
 * collects every filled pixel on a grid, then picks `count` of them at random.
 * Random picks leave gaps on purpose — the stars suggest the logo rather than
 * filling it completely, and the big star's sweep reveals the crisp version.
 */
export function sampleLogoSlots(pathD: string, viewBoxWidth: number, viewBoxHeight: number, count: number): LogoSlot[] {
  const width = 800;
  const height = Math.round((width * viewBoxHeight) / viewBoxWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.scale(width / viewBoxWidth, height / viewBoxHeight);
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D(pathD), "evenodd");

  const { data } = ctx.getImageData(0, 0, width, height);
  const filled: LogoSlot[] = [];
  const step = 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 128) filled.push({ u: x / width, v: y / height });
    }
  }
  if (!filled.length) return [];

  // Partial Fisher–Yates: unique random picks while there are enough candidates.
  const picks: LogoSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i < filled.length) {
      const j = i + Math.floor(Math.random() * (filled.length - i));
      [filled[i], filled[j]] = [filled[j], filled[i]];
      picks.push(filled[i]);
    } else {
      picks.push(filled[Math.floor(Math.random() * filled.length)]);
    }
  }
  return picks;
}
