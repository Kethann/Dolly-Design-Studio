/** Shared by the portal, renderer and standalone demo. Angles are in degrees. */
export const DISC_SLOT_LIMIT = 8;
/** Preserve the complete collection; only the first eight entries occupy the disc. */
export function visibleDiscItems<T>(items: readonly T[]): T[] {
  return items.slice(0, DISC_SLOT_LIMIT);
}
export const DISC_DEFAULTS = {
  glassVersion: 1, entranceDuration: 3.6, circleScale: 1, glassOpacity: 0.22,
  glassTintColor: "#0d1014", shadowColor: "#050407", shadowOpacity: 168 / 255, shadowSpread: 1,
  spinSpeed: 0.09, focusAngle: -43, focusRadius: 0.8, rayIntensity: 0.8,
  rayLength: 5, bloom: 0.35, desaturation: 0.5, discTilt: -12, slotGap: 3,
  lightIntensity: 1, glowRadius: 0.75, glowThreshold: 0.72,
  saturation: 1, vibrance: 0, slotSize: 1, slotOpacity: 1,
  slotBlur: 0, unfocusedBrightness: 0.18,
  discRoll: -8, rayStyle: 0, rayElevation: 2.4, raySpread: 1.1, rayPrism: 0.25,
  rayMotion: 0.45, projectorSide: -1,
  beamGlow: 1, rayStrength: 1, surfaceReflection: 1,
  originOffsetX: 0, originOffsetY: 0,
  tabletFocusAngle: -48, tabletFocusRadius: 0.8, tabletOriginOffsetX: 0, tabletOriginOffsetY: 0,
  mobileFocusAngle: -54, mobileFocusRadius: 0.8, mobileOriginOffsetX: 0, mobileOriginOffsetY: 0,
};
export type DiscControls = typeof DISC_DEFAULTS;
export type DiscNumericKey = { [K in keyof DiscControls]: DiscControls[K] extends number ? K : never }[keyof DiscControls];
export const DISC_RANGES: Record<DiscNumericKey, readonly [number, number, number]> = {
  glassVersion: [1, 1, 1], entranceDuration: [1.5, 6, 0.1], circleScale: [0.85, 1.15, 0.01], glassOpacity: [0, 0.65, 0.01],
  shadowOpacity: [0, 1, 0.01], shadowSpread: [0.5, 1.6, 0.01],
  spinSpeed: [-0.5, 0.5, 0.01], focusAngle: [-180, 180, 1], focusRadius: [0.66, 0.9, 0.01],
  rayIntensity: [0, 3, 0.05], rayLength: [3, 9, 0.1], bloom: [0, 2, 0.05],
  desaturation: [0, 1, 0.05], discTilt: [-30, 0, 1], slotGap: [0.5, 12, 0.5],
  lightIntensity: [0, 2, 0.05], glowRadius: [0, 1, 0.05], glowThreshold: [0.1, 2, 0.05],
  saturation: [0, 2, 0.05], vibrance: [0, 1, 0.05], slotSize: [0.7, 1, 0.05],
  slotOpacity: [0.2, 1, 0.05], slotBlur: [0, 6, 0.25], unfocusedBrightness: [0.05, 1, 0.05],
  discRoll: [-180, 180, 1], rayStyle: [0, 2, 1], rayElevation: [-2, 4, 0.1],
  raySpread: [0.3, 2, 0.05], rayPrism: [0, 1, 0.05],
  rayMotion: [0, 1, 0.05],
  projectorSide: [-1, 1, 2],
  beamGlow: [0, 3, 0.05], rayStrength: [0, 3, 0.05], surfaceReflection: [0, 3, 0.05],
  originOffsetX: [-0.25, 0.25, 0.01], originOffsetY: [-0.25, 0.25, 0.01],
  tabletFocusAngle: [-180, 180, 1], tabletFocusRadius: [0.66, 0.9, 0.01],
  tabletOriginOffsetX: [-0.25, 0.25, 0.01], tabletOriginOffsetY: [-0.25, 0.25, 0.01],
  mobileFocusAngle: [-180, 180, 1], mobileFocusRadius: [0.66, 0.9, 0.01],
  mobileOriginOffsetX: [-0.25, 0.25, 0.01], mobileOriginOffsetY: [-0.25, 0.25, 0.01],
};
export function sanitizeDisc(input: unknown): DiscControls {
  const src = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out = { ...DISC_DEFAULTS };
  for (const key of Object.keys(DISC_RANGES) as DiscNumericKey[]) {
    const value = src[key];
    const [min, max] = DISC_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = key === "projectorSide" ? (value < 0 ? -1 : 1) : Math.min(max, Math.max(min, key === "rayStyle" ? Math.round(value) : value));
  }
  for (const key of ["glassTintColor", "shadowColor"] as const) {
    const value = src[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) out[key] = value.toLowerCase();
  }
  // Old silver-CD poses would put the glass almost edge-on. Migrate presentation only;
  // keep artwork, colours, light strength, ordering and content untouched.
  if (src.glassVersion !== 1) {
    for (const key of ["discTilt", "discRoll", "focusAngle", "focusRadius", "tabletFocusAngle", "tabletFocusRadius", "mobileFocusAngle", "mobileFocusRadius", "originOffsetX", "originOffsetY", "tabletOriginOffsetX", "tabletOriginOffsetY", "mobileOriginOffsetX", "mobileOriginOffsetY", "projectorSide"] as const) out[key] = DISC_DEFAULTS[key];
  }
  return out;
}

/** Scoped CSS values; never let arbitrary saved text become a CSS declaration. */
export function glassBackdropStyle(input: unknown) {
  const disc = sanitizeDisc(input);
  return {
    "--glass-shadow-color": disc.shadowColor,
    "--glass-shadow-opacity": disc.shadowOpacity,
    "--glass-shadow-spread": disc.shadowSpread,
  };
}

/** Zero slope and acceleration at each end, shared by fades and rotation hand-offs. */
export function glassEase(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Reveal the complete circle softly during the establishing beat, before most of the zoom. */
export function glassArrivalOpacity(progress: number) {
  return glassEase(progress / .22);
}

/** Gently gather speed, then settle to the saved rotation without stopping or reversing. */
export function glassArrivalSpinMultiplier(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return t < .24 ? .6 + 1.8 * glassEase(t / .24) : 1 + 1.4 * (1 - glassEase((t - .24) / .76));
}

/** Screen-fraction composition: full circle on arrival, oversized arc behind the copy at rest.
 * Scroll affects only feathering, so reversing the scroll never restarts the entrance. */
export function glassCircleComposition(width: number, height: number, progress: number) {
  // A short establishing beat lets the complete rotating circle register before approaching.
  const t = Math.min(1, Math.max(0, (progress - .12) / .88));
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  const mobile = width <= 640;
  // Keep the approved disc scale, but move its resting rim beneath the copy
  // before it rises through the far-right edge. This gives the pane the broad,
  // lower sweeping curve of the reference rather than a tight arc at right.
  // The arrival and phone framing stay unchanged.
  const endX = mobile ? -.35 : -.26;
  const endY = mobile ? .02 : -.28;
  const endRadius = mobile ? .85 : 1.35;
  const startX = mobile ? .5 : .65;
  const startRadius = Math.min(.29, .38 * Math.max(1, width) / Math.max(1, height));
  return { x: startX + (endX - startX) * eased, y: .46 + (endY - .46) * eased,
    radius: startRadius + (endRadius - startRadius) * eased, reveal: eased };
}

/** Screen fractions: the reference light enters from above the scene, never from an on-screen apex. */
export function glassProjectorOrigin(width: number, side: number, offsetX = 0, offsetY = 0,
  xOverride: number | null = null, yOverride = -.09) {
  const left = width <= 640 ? -.1 : width <= 1024 ? .14 : .3;
  const x = (xOverride ?? (side < 0 ? left : 1 - left)) + offsetX;
  return { x: Math.min(1.4, Math.max(-.4, x)), y: Math.min(-.035, yOverride + offsetY) };
}

export type DiscAimProfile = "mobile" | "tablet" | "desktop";
/** CSS-width profiles keep portal editing and the renderer deterministic across device DPRs. */
export function discAimProfileForWidth(width: number): DiscAimProfile {
  if (Number.isFinite(width) && width <= 640) return "mobile";
  if (Number.isFinite(width) && width <= 1024) return "tablet";
  return "desktop";
}
export function sectorSize(count: number, gapDegrees: number) {
  const step = Math.PI * 2 / Math.max(1, count);
  return { step, width: step - Math.min(gapDegrees * Math.PI / 180, step * 0.3) };
}

/** Transparent title regions distributed evenly near the glass circle's rim. */
export function discPanelLayout(count: number, gapDegrees: number, size: number) {
  const { step, width } = sectorSize(count, gapDegrees);
  const center = 0.8, halfHeight = 0.14 * size;
  const inner = center - halfHeight, outer = center + halfHeight;
  // The invisible placement region stays rectangular so a PNG is never warped into a wedge.
  const halfAngle = Math.min(0.6, width * 0.48) * size;
  const halfWidth = Math.min((outer - inner) * 0.39, 0.28 * size, inner * Math.tan(halfAngle));
  const innerHalfWidth = halfWidth, outerHalfWidth = halfWidth;
  return { step, inner, outer, innerHalfWidth, outerHalfWidth,
    aspect: (outer - inner) / (halfWidth * 2) };
}

/** A title-sized projector window with bounded overscan so outer letters receive soft light too. */
export function discProjectionWindow(layout: ReturnType<typeof discPanelLayout>, radius: number, spread: number) {
  const center = Math.min(layout.outer - 0.015, Math.max(layout.inner + 0.015, radius));
  const scale = Math.min(1.35, Math.max(0.35, spread * 1.14));
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

/** Artwork pigment must materially enter the projector before it can tint the whole beam. */
export function discArtworkPresence(coverage: number) {
  const t = Math.min(1, Math.max(0, (coverage - 0.012) / (0.28 - 0.012)));
  return t * t * (3 - 2 * t);
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
