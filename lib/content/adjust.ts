// How a picture sits in its frame, set in the portal: zoomed in or out (100% = as fitted, either side of it) and moved left /
// right and up / down. Kept beside the picture as three numbers named after it ("photo" gives photoZoom, photoX, photoY), so
// any picture on the site can have them. Shared by the site (to draw it) and the sanitizer (to keep the numbers in range).
import type { CSSProperties } from "react";

/** Out to a quarter of the size, in to four times it. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const read = (o: unknown) => (typeof o === "object" && o !== null ? (o as Record<string, unknown>) : {});

export function adjustOf(o: unknown, prefix: string) {
  const r = read(o);
  return { zoom: num(r[`${prefix}Zoom`], ZOOM_MIN, ZOOM_MAX, 1), x: num(r[`${prefix}X`], 0, 100, 50), y: num(r[`${prefix}Y`], 0, 100, 50) };
}

/** Only the numbers that differ from "as fitted, centred", so saved content stays small. */
export function cleanAdjust(o: unknown, prefix: string): Record<string, number> {
  const a = adjustOf(o, prefix);
  const out: Record<string, number> = {};
  if (a.zoom !== 1) out[`${prefix}Zoom`] = Math.round(a.zoom * 100) / 100;
  if (a.x !== 50) out[`${prefix}X`] = Math.round(a.x);
  if (a.y !== 50) out[`${prefix}Y`] = Math.round(a.y);
  return out;
}

/** The inline style that applies them to a picture inside an overflow-hidden frame (nothing at all when it is as fitted). */
export function adjustStyle(o: unknown, prefix: string): CSSProperties | undefined {
  const a = adjustOf(o, prefix);
  if (a.zoom === 1 && a.x === 50 && a.y === 50) return undefined;
  return { objectPosition: `${a.x}% ${a.y}%`, transformOrigin: `${a.x}% ${a.y}%`, transform: a.zoom !== 1 ? `scale(${a.zoom})` : undefined };
}

/** The zoom slider has 100% in its middle: left of it zooms out, right of it zooms in. Position 0–100 ⇄ zoom. */
export const zoomToPos = (z: number) => (z <= 1 ? ((z - ZOOM_MIN) / (1 - ZOOM_MIN)) * 50 : 50 + ((z - 1) / (ZOOM_MAX - 1)) * 50);
export function posToZoom(p: number) {
  if (Math.abs(p - 50) < 1.5) return 1; // a little pull towards exactly 100%
  const z = p <= 50 ? ZOOM_MIN + (p / 50) * (1 - ZOOM_MIN) : 1 + ((p - 50) / 50) * (ZOOM_MAX - 1);
  return Math.round(z * 100) / 100;
}
