/** Shared by the portal, renderer and standalone demo. Angles are in degrees. */
export const DISC_SLOT_LIMIT = 8;
/** Preserve the complete collection; only the first eight entries occupy the disc. */
export function visibleDiscItems<T>(items: readonly T[]): T[] {
  return items.slice(0, DISC_SLOT_LIMIT);
}
export const DISC_DEFAULTS = {
  spinSpeed: 0.12, focusAngle: -180, focusRadius: 0.67, rayIntensity: 0.8,
  rayLength: 5, bloom: 0.35, desaturation: 0.5, discTilt: -65, slotGap: 3,
  lightIntensity: 1, glowRadius: 0.75, glowThreshold: 0.72,
  saturation: 1, vibrance: 0, slotSize: 1, slotOpacity: 1,
  slotBlur: 1.5, unfocusedBrightness: 0.35,
  discRoll: -65, rayStyle: 1, rayElevation: 2.4, raySpread: 1.1, rayPrism: 0.65,
};
export type DiscControls = typeof DISC_DEFAULTS;
export const DISC_RANGES: Record<keyof DiscControls, readonly [number, number, number]> = {
  spinSpeed: [-0.5, 0.5, 0.01], focusAngle: [-180, 180, 1], focusRadius: [0.48, 0.82, 0.01],
  rayIntensity: [0, 2, 0.05], rayLength: [3, 9, 0.1], bloom: [0, 1.2, 0.05],
  desaturation: [0, 1, 0.05], discTilt: [-75, -20, 1], slotGap: [0.5, 12, 0.5],
  lightIntensity: [0, 2, 0.05], glowRadius: [0, 1, 0.05], glowThreshold: [0.1, 2, 0.05],
  saturation: [0, 2, 0.05], vibrance: [0, 1, 0.05], slotSize: [0.7, 1, 0.05],
  slotOpacity: [0.2, 1, 0.05], slotBlur: [0, 6, 0.25], unfocusedBrightness: [0.05, 1, 0.05],
  discRoll: [-180, 180, 1], rayStyle: [0, 2, 1], rayElevation: [-2, 4, 0.1],
  raySpread: [0.3, 2, 0.05], rayPrism: [0, 1, 0.05],
};
export function sanitizeDisc(input: unknown): DiscControls {
  const src = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out = { ...DISC_DEFAULTS };
  for (const key of Object.keys(out) as (keyof DiscControls)[]) {
    const value = src[key];
    const [min, max] = DISC_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.min(max, Math.max(min, key === "rayStyle" ? Math.round(value) : value));
  }
  return out;
}
export function sectorSize(count: number, gapDegrees: number) {
  const step = Math.PI * 2 / Math.max(1, count);
  return { step, width: step - Math.min(gapDegrees * Math.PI / 180, step * 0.3) };
}

/** Separate plaques leave silver between images, even with only one or two titles. */
export function discPanelLayout(count: number, gapDegrees: number, size: number) {
  const { step, width } = sectorSize(count, gapDegrees);
  const center = 0.67, halfHeight = 0.24 * size;
  const inner = center - halfHeight, outer = center + halfHeight;
  // Fill most of each title's angular allocation, retaining a narrow silver separator.
  const halfAngle = Math.min(0.6, width * 0.48) * size;
  const innerHalfWidth = Math.min(0.28 * size, inner * Math.tan(halfAngle));
  const outerHalfWidth = Math.min(0.36 * size, outer * Math.tan(halfAngle));
  return { step, inner, outer, innerHalfWidth, outerHalfWidth,
    aspect: (innerHalfWidth + outerHalfWidth) / (outer - inner) };
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
  const feather = 0.18 + 0.18 * softness;
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
