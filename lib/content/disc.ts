/** Shared by the portal, renderer and standalone demo. Angles are in degrees. */
export const DISC_SLOT_LIMIT = 8;
/** Preserve the complete collection; only the first eight entries occupy the disc. */
export function visibleDiscItems<T>(items: readonly T[]): T[] {
  return items.slice(0, DISC_SLOT_LIMIT);
}
export const DISC_DEFAULTS = {
  spinSpeed: 0.12, focusAngle: -25, focusRadius: 0.67, rayIntensity: 0.8,
  rayLength: 5, bloom: 0.35, desaturation: 0.5, discTilt: -65, slotGap: 3,
  lightIntensity: 1, glowRadius: 0.75, glowThreshold: 0.72,
  saturation: 1, vibrance: 0, slotSize: 1, slotOpacity: 1,
  slotBlur: 1.5, unfocusedBrightness: 0.35,
  discRoll: -65, rayStyle: 1, rayElevation: 2.4, raySpread: 1.1, rayPrism: 0.65,
  rayMotion: 0.45, projectorSide: -1,
  beamGlow: 1, rayStrength: 1, surfaceReflection: 1,
};
export type DiscControls = typeof DISC_DEFAULTS;
export const DISC_RANGES: Record<keyof DiscControls, readonly [number, number, number]> = {
  spinSpeed: [-0.5, 0.5, 0.01], focusAngle: [-180, 180, 1], focusRadius: [0.48, 0.82, 0.01],
  rayIntensity: [0, 3, 0.05], rayLength: [3, 9, 0.1], bloom: [0, 2, 0.05],
  desaturation: [0, 1, 0.05], discTilt: [-75, -20, 1], slotGap: [0.5, 12, 0.5],
  lightIntensity: [0, 2, 0.05], glowRadius: [0, 1, 0.05], glowThreshold: [0.1, 2, 0.05],
  saturation: [0, 2, 0.05], vibrance: [0, 1, 0.05], slotSize: [0.7, 1, 0.05],
  slotOpacity: [0.2, 1, 0.05], slotBlur: [0, 6, 0.25], unfocusedBrightness: [0.05, 1, 0.05],
  discRoll: [-180, 180, 1], rayStyle: [0, 2, 1], rayElevation: [-2, 4, 0.1],
  raySpread: [0.3, 2, 0.05], rayPrism: [0, 1, 0.05],
  rayMotion: [0, 1, 0.05],
  projectorSide: [-1, 1, 2],
  beamGlow: [0, 3, 0.05], rayStrength: [0, 3, 0.05], surfaceReflection: [0, 3, 0.05],
};
export function sanitizeDisc(input: unknown): DiscControls {
  const src = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out = { ...DISC_DEFAULTS };
  for (const key of Object.keys(out) as (keyof DiscControls)[]) {
    const value = src[key];
    const [min, max] = DISC_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = key === "projectorSide" ? (value < 0 ? -1 : 1) : Math.min(max, Math.max(min, key === "rayStyle" ? Math.round(value) : value));
  }
  return out;
}
export function sectorSize(count: number, gapDegrees: number) {
  const step = Math.PI * 2 / Math.max(1, count);
  return { step, width: step - Math.min(gapDegrees * Math.PI / 180, step * 0.3) };
}

/** Separate rectangular cards leave silver between images, even with only one or two titles. */
export function discPanelLayout(count: number, gapDegrees: number, size: number) {
  const { step, width } = sectorSize(count, gapDegrees);
  const center = 0.67, halfHeight = 0.24 * size;
  const inner = center - halfHeight, outer = center + halfHeight;
  // Keep both sides parallel: the artwork is a real rectangular card, not a stretched sector.
  // The angular allocation still limits its width so neighbouring cards cannot overlap.
  const halfAngle = Math.min(0.6, width * 0.48) * size;
  const halfWidth = Math.min((outer - inner) * 0.39, 0.28 * size, inner * Math.tan(halfAngle));
  const innerHalfWidth = halfWidth, outerHalfWidth = halfWidth;
  return { step, inner, outer, innerHalfWidth, outerHalfWidth,
    aspect: halfWidth * 2 / (outer - inner) };
}

/** A fixed, slot-sized projector window. Spread may soften/widen it, never spill beyond the plaque. */
export function discProjectionWindow(layout: ReturnType<typeof discPanelLayout>, radius: number, spread: number) {
  const center = Math.min(layout.outer - 0.015, Math.max(layout.inner + 0.015, radius));
  const scale = Math.min(0.94, Math.max(0.25, spread * 0.86));
  const halfHeight = Math.min(center - layout.inner, layout.outer - center) * scale;
  const inner = center - halfHeight, outer = center + halfHeight;
  const widthAt = (r: number) => layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * (r - layout.inner) / (layout.outer - layout.inner);
  return { ...layout, inner, outer, innerHalfWidth: widthAt(inner) * scale, outerHalfWidth: widthAt(outer) * scale, center };
}

/** Fixed-window illumination, shared with the fragment shader's feather profile. */
function projectionFeather(edge: number, softness: number) {
  const feather = 0.32 + 0.26 * softness;
  const t = Math.min(1, Math.max(0, (edge - (1 - feather)) / feather));
  return Math.min(1, Math.max(0, 1 - t * t * t * (t * (t * 6 - 15) + 10)));
}
export function discProjectionMask(x: number, y: number, window: ReturnType<typeof discProjectionWindow>, softness: number) {
  const radial = (x - window.inner) / (window.outer - window.inner);
  const halfWidth = window.innerHalfWidth + (window.outerHalfWidth - window.innerHalfWidth) * Math.min(1, Math.max(0, radial));
  return projectionFeather(Math.abs(radial * 2 - 1), softness) * projectionFeather(Math.abs(y) / halfWidth, softness);
}

/** Small fixed sample grid estimates how much artwork is inside the light for a smooth colour handoff. */
export function discProjectionCoverage(layout: ReturnType<typeof discPanelLayout>, window: ReturnType<typeof discProjectionWindow>, angle: number, softness: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let coverage = 0;
  for (let row = 0; row < 5; row++) {
    const t = (row + .5) / 5;
    const x = layout.inner + (layout.outer - layout.inner) * t;
    const halfWidth = layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * t;
    for (let col = 0; col < 5; col++) {
      const y = ((col + .5) / 5 * 2 - 1) * halfWidth;
      coverage += discProjectionMask(x * c - y * s, x * s + y * c, window, softness);
    }
  }
  return coverage / 25;
}

/** Largest upright image rectangle centred inside a projected convex plaque. No crop or stretch.
 * Coordinates are NDC; viewportAspect converts the source aspect ratio to that coordinate space. */
export function discArtworkFrame(points: readonly { x: number; y: number }[], imageAspect: number, viewportAspect: number) {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const aspect = Math.max(.001, imageAspect / viewportAspect);
  let halfWidth = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const nx = b.y - a.y, ny = a.x - b.x;
    const distance = Math.abs(nx * (x - a.x) + ny * (y - a.y));
    const denominator = Math.abs(nx) + Math.abs(ny) / aspect;
    if (denominator > 1e-8) halfWidth = Math.min(halfWidth, distance / denominator);
  }
  halfWidth = Number.isFinite(halfWidth) ? Math.max(.00001, halfWidth * .94) : .00001;
  return { x, y, halfWidth, halfHeight: halfWidth / aspect };
}

/** Ignore transparent/black padding; favour real pigments over white lettering.
 * A tiny thumbnail is sufficient and avoids retaining source-sized pixel buffers. */
export function discImageColour(rgba: ArrayLike<number>) {
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const red = rgba[i] / 255, green = rgba[i + 1] / 255, blue = rgba[i + 2] / 255;
    const maximum = Math.max(red, green, blue), chroma = maximum - Math.min(red, green, blue);
    const weight = rgba[i + 3] / 255 * maximum * (.12 + chroma * 3);
    r += red * weight; g += green * weight; b += blue * weight; total += weight;
  }
  return total > .0001 ? [r / total, g / total, b / total] : [.5, .5, .5];
}

/** Four bounded brightness bands, sampled once from the same tiny thumbnail as colour.
 * Alpha is optical coverage: transparent pixels cannot brighten the projected haze. */
export function discImageBands(rgba: ArrayLike<number>, width: number): [number, number, number, number] {
  const sums = [0, 0, 0, 0], counts = [0, 0, 0, 0];
  width = Math.max(1, Math.floor(width) || 1);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const band = Math.min(3, Math.floor(((i / 4) % width) * 4 / width));
    const light = (.2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2]) / 255 * rgba[i + 3] / 255;
    sums[band] += light; counts[band]++;
  }
  // Keep the lamp present even for black title artwork; white frames carry denser light.
  return sums.map((sum, i) => .35 + .65 * Math.sqrt(counts[i] ? sum / counts[i] : 0)) as [number, number, number, number];
}
