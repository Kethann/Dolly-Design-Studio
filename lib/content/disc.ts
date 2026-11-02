/** Shared by the portal, renderer and standalone demo. Angles are in degrees. */
export const DISC_SLOT_LIMIT = 16;
/** The glass renders a curated subset; the scrolling title collection retains every saved title. */
export function visibleGlassTitles<T extends { onGlass?: boolean }>(items: readonly T[]): T[] {
  return items.filter(item => item.onGlass !== false).slice(0, DISC_SLOT_LIMIT);
}
/** Each saved title gets a position on the disc, up to the collection's safe rendering limit. */
export function visibleDiscItems<T>(items: readonly T[]): T[] {
  return items.slice(0, DISC_SLOT_LIMIT);
}
/** Safari/image fallbacks need not expose the global ImageBitmap constructor. */
export function releaseDiscImage(image: { close: () => void } | { src: string }) {
  if ("close" in image) image.close();
  else image.src = "";
}
/** Canvas-edge blend in CSS pixels, independent of DPR and render quality.
 * Keep the main sweep intact; only the copy-side and bottom boundary soften.
 */
export function discViewportFeather(width: number, height: number) {
  const w = Number.isFinite(width) ? Math.max(1, width) : 1;
  const h = Number.isFinite(height) ? Math.max(1, height) : 1;
  return {
    side: Math.min(.24, Math.min(240, Math.max(72, w * .18)) / w),
    bottom: Math.min(.20, Math.min(110, Math.max(48, h * .14)) / h),
  };
}
/** Choices for the portal's Glass design tools. Saved as plain words so a preset can never become code. */
export const GLASS_EFFECTS = ["clear", "frosted", "liquid", "ribbed", "hammered", "crystal", "bubble"] as const;
export const GLASS_PATTERNS = ["none", "rings", "rays", "grid", "dots", "waves", "diamonds", "image"] as const;
export const GLASS_EDGES = ["classic", "double", "dashed", "beaded", "film", "rope", "scallop", "gear", "image"] as const;
export const GLASS_PATTERN_FITS = ["tile", "cover"] as const;
export type GlassEffect = typeof GLASS_EFFECTS[number];
export type GlassPattern = typeof GLASS_PATTERNS[number];
export type GlassEdge = typeof GLASS_EDGES[number];
export type GlassPatternFit = typeof GLASS_PATTERN_FITS[number];
/** Everything the Glass design tools own. The defaults draw nothing extra, so existing sites look the same. */
export const GLASS_DESIGN_DEFAULTS = {
  glassEffect: "clear" as GlassEffect, glassEffectAmount: 0.6, glassEffectScale: 1, glassEffectFlow: 0.4,
  patternKind: "none" as GlassPattern, patternImage: "", patternFit: "tile" as GlassPatternFit, patternColor: "#dcecff",
  patternAmount: 0.4, patternScale: 1, patternGlass: 1,
  edgeStyle: "classic" as GlassEdge, edgeImage: "", edgeColor: "#dcecff",
  edgeWidth: 0.35, edgeRepeats: 72, edgeBrightness: 1, edgeGlass: 0.6,
  ringMarks: 2, ringMarkSize: 1,
  pictureImage: "", pictureSize: 0.4, pictureDistance: 0.6, pictureAngle: -45, pictureRotation: 0,
  pictureOpacity: 0.9, pictureGlass: 0.6, pictureFollow: 1,
};
export type GlassDesign = typeof GLASS_DESIGN_DEFAULTS;
/** One-click starting points. They never touch uploaded images or the picture on the glass. */
export const GLASS_LOOKS: { id: string; label: string; patch: Partial<GlassDesign> }[] = [
  { id: "clear", label: "Clear", patch: { glassEffect: "clear", patternKind: "none", edgeStyle: "classic" } },
  { id: "frosted", label: "Frosted", patch: { glassEffect: "frosted", glassEffectAmount: 0.6, patternKind: "none", edgeStyle: "double", edgeWidth: 0.3 } },
  { id: "liquid", label: "Liquid", patch: { glassEffect: "liquid", glassEffectAmount: 0.65, glassEffectScale: 1, patternKind: "none", edgeStyle: "classic" } },
  { id: "bubble", label: "Soap bubble", patch: { glassEffect: "bubble", glassEffectAmount: 0.7, glassEffectScale: 1, patternKind: "none", edgeStyle: "classic" } },
  { id: "fluted", label: "Fluted", patch: { glassEffect: "ribbed", glassEffectAmount: 0.55, patternKind: "none", edgeStyle: "double", edgeWidth: 0.45 } },
  { id: "film", label: "Film reel", patch: { glassEffect: "clear", patternKind: "rings", patternAmount: 0.3, patternScale: 1.4, edgeStyle: "film", edgeWidth: 0.7, edgeRepeats: 72 } },
  { id: "jewel", label: "Crystal", patch: { glassEffect: "crystal", glassEffectAmount: 0.55, patternKind: "none", edgeStyle: "beaded", edgeWidth: 0.4, edgeRepeats: 96 } },
  { id: "art-deco", label: "Art deco", patch: { glassEffect: "hammered", glassEffectAmount: 0.35, patternKind: "rays", patternAmount: 0.3, patternScale: 1, edgeStyle: "scallop", edgeWidth: 0.4, edgeRepeats: 48 } },
];
/** The design values on their own, so resetting the circle can leave a design (and its uploads) alone. */
export function glassDesignOf(disc: GlassDesign): GlassDesign {
  return Object.fromEntries(Object.keys(GLASS_DESIGN_DEFAULTS).map(key => [key, disc[key as keyof GlassDesign]])) as GlassDesign;
}
const DISC_IMAGE_PATH = /^\/images\/[\w\-./]+$/;
const DISC_WHOLE_NUMBERS = new Set<string>(["rayStyle", "ringMarks", "edgeRepeats", "pictureFollow"]);
export const DISC_DEFAULTS = {
  glassVersion: 1, glassFinishVersion: 1, entranceDuration: 3.6, circleScale: 1, glassOpacity: 0.06, edgeThickness: 0.08,
  glassTintColor: "#d8e8f4", shadowColor: "#050407", shadowOpacity: 0, shadowSpread: 1,
  spinSpeed: 0.09, focusAngle: -43, focusRadius: 0.8, rayIntensity: 1,
  rayLength: 5, bloom: 0.35, desaturation: 0.5, discTilt: -12, slotGap: 3,
  lightIntensity: 1, glowRadius: 0.75, glowThreshold: 0.72,
  saturation: 1, vibrance: 0, slotSize: 1, slotOpacity: 1, slotRotation: 0,
  slotBlur: 0, unfocusedBrightness: 0.18,
  discRoll: -8, rayStyle: 0, rayElevation: 2.4, raySpread: 1.1, landingSpread: 1.35, rayPrism: 0.25,
  rayMotion: 0.45, projectorSide: -1,
  beamGlow: 1.1, beamWidth: 1, rayStrength: 1.1, surfaceReflection: 1,
  originGlow: 1, titleGlass: 1, edgeLines: 1,
  originOffsetX: 0, originOffsetY: 0,
  tabletFocusAngle: -48, tabletFocusRadius: 0.8, tabletOriginOffsetX: 0, tabletOriginOffsetY: 0,
  mobileFocusAngle: -54, mobileFocusRadius: 0.8, mobileOriginOffsetX: 0, mobileOriginOffsetY: 0,
  ...GLASS_DESIGN_DEFAULTS,
};
export type DiscControls = typeof DISC_DEFAULTS;
export type DiscNumericKey = { [K in keyof DiscControls]: DiscControls[K] extends number ? K : never }[keyof DiscControls];
export const DISC_RANGES: Record<DiscNumericKey, readonly [number, number, number]> = {
  glassVersion: [1, 1, 1], glassFinishVersion: [1, 1, 1], entranceDuration: [1.5, 6, 0.1], circleScale: [0.85, 1.15, 0.01], glassOpacity: [0, 0.65, 0.01],
  edgeThickness: [0.01, 1, 0.01],
  shadowOpacity: [0, 1, 0.01], shadowSpread: [0.5, 1.6, 0.01],
  spinSpeed: [-0.5, 0.5, 0.01], focusAngle: [-180, 180, 1], focusRadius: [0.66, 0.9, 0.01],
  rayIntensity: [0, 3, 0.05], rayLength: [3, 9, 0.1], bloom: [0, 2, 0.05],
  desaturation: [0, 1, 0.05], discTilt: [-30, 0, 1], slotGap: [0.5, 12, 0.5],
  lightIntensity: [0, 2, 0.05], glowRadius: [0, 1, 0.05], glowThreshold: [0.1, 2, 0.05],
  saturation: [0, 2, 0.05], vibrance: [0, 1, 0.05], slotSize: [0.7, 1, 0.05], slotRotation: [-180, 180, 1],
  slotOpacity: [0.2, 1, 0.05], slotBlur: [0, 6, 0.25], unfocusedBrightness: [0.05, 1, 0.05],
  discRoll: [-180, 180, 1], rayStyle: [0, 2, 1], rayElevation: [-2, 4, 0.1],
  raySpread: [0.3, 2, 0.05], landingSpread: [0.3, 2.4, 0.05], rayPrism: [0, 1, 0.05],
  rayMotion: [0, 1, 0.05],
  projectorSide: [-1, 1, 2],
  beamGlow: [0, 3, 0.05], beamWidth: [0.25, 2, 0.05], rayStrength: [0, 3, 0.05], surfaceReflection: [0, 3, 0.05],
  originGlow: [0, 3, 0.05], titleGlass: [0, 2, 0.05], edgeLines: [0, 2, 0.05],
  originOffsetX: [-0.25, 0.25, 0.01], originOffsetY: [-0.25, 0.25, 0.01],
  tabletFocusAngle: [-180, 180, 1], tabletFocusRadius: [0.66, 0.9, 0.01],
  tabletOriginOffsetX: [-0.25, 0.25, 0.01], tabletOriginOffsetY: [-0.25, 0.25, 0.01],
  mobileFocusAngle: [-180, 180, 1], mobileFocusRadius: [0.66, 0.9, 0.01],
  mobileOriginOffsetX: [-0.25, 0.25, 0.01], mobileOriginOffsetY: [-0.25, 0.25, 0.01],
  glassEffectAmount: [0, 1, 0.01], glassEffectScale: [0.4, 2.5, 0.05], glassEffectFlow: [0, 1, 0.05],
  patternAmount: [0, 1, 0.01], patternScale: [0.4, 3, 0.05], patternGlass: [0, 1, 0.01],
  edgeWidth: [0, 1, 0.01], edgeRepeats: [12, 240, 1], edgeBrightness: [0, 2, 0.05], edgeGlass: [0, 1, 0.01],
  ringMarks: [0, 12, 1], ringMarkSize: [0.4, 3, 0.05],
  pictureSize: [0.1, 1.6, 0.01], pictureDistance: [0, 0.95, 0.01], pictureAngle: [-180, 180, 1], pictureRotation: [-180, 180, 1],
  pictureOpacity: [0, 1, 0.01], pictureGlass: [0, 1, 0.01], pictureFollow: [0, 1, 1],
};
export function sanitizeDisc(input: unknown): DiscControls {
  const src = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out = { ...DISC_DEFAULTS };
  for (const key of Object.keys(DISC_RANGES) as DiscNumericKey[]) {
    const value = src[key];
    const [min, max] = DISC_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = key === "projectorSide" ? (value < 0 ? -1 : 1) : Math.min(max, Math.max(min, DISC_WHOLE_NUMBERS.has(key) ? Math.round(value) : value));
  }
  for (const key of ["glassTintColor", "shadowColor", "patternColor", "edgeColor"] as const) {
    const value = src[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) out[key] = value.toLowerCase();
  }
  if ((GLASS_EFFECTS as readonly unknown[]).includes(src.glassEffect)) out.glassEffect = src.glassEffect as GlassEffect;
  if ((GLASS_PATTERNS as readonly unknown[]).includes(src.patternKind)) out.patternKind = src.patternKind as GlassPattern;
  if ((GLASS_EDGES as readonly unknown[]).includes(src.edgeStyle)) out.edgeStyle = src.edgeStyle as GlassEdge;
  if ((GLASS_PATTERN_FITS as readonly unknown[]).includes(src.patternFit)) out.patternFit = src.patternFit as GlassPatternFit;
  for (const key of ["patternImage", "edgeImage", "pictureImage"] as const) {
    const value = src[key];
    if (typeof value === "string" && DISC_IMAGE_PATH.test(value) && !value.includes("..")) out[key] = value;
  }
  // Retire the old smoked defaults once. Keep deliberate colours and optional
  // shadow edits made in the new editor; never migrate the disc's pose here.
  if (src.glassFinishVersion !== 1) {
    if (src.glassTintColor === undefined || out.glassTintColor === "#0d1014") out.glassTintColor = DISC_DEFAULTS.glassTintColor;
    if (src.glassOpacity === .22) out.glassOpacity = DISC_DEFAULTS.glassOpacity;
    if (src.shadowOpacity === 168 / 255) out.shadowOpacity = 0;
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

// [stage aspect, centre x, centre y, radius in stage heights], calibrated with
// the renderer's 36-degree camera and default glass tilt/roll.
const GLASS_REFERENCE_FRAMES = [
  [1.2, -.2774, -.2865, 1.5002],
  [882 / 501, .0331, -.6068, 1.7031],
  [1920 / 938, .1587, -.7229, 1.7463],
  [2.4, .2749, -.7873, 1.7512],
] as const;

/** Screen-fraction composition: full circle on arrival, oversized arc behind the copy at rest.
 * Scroll affects only feathering, so reversing the scroll never restarts the entrance. */
export function glassCircleComposition(width: number, height: number, progress: number) {
  // A short establishing beat lets the complete rotating circle register before approaching.
  const t = Math.min(1, Math.max(0, (progress - .12) / .88));
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  const mobile = width <= 640;
  // Fit the perspective-projected rim to the reference at the upper-right,
  // middle-right and lower-middle of the STAGE, never to the copy's dimensions.
  // Radius is in stage-height units: one fixed radius would crop the circle
  // differently on a wide desktop and a narrow tablet.
  const aspect = Math.max(1.2, Math.min(2.4, width / Math.max(1, height)));
  const frames = GLASS_REFERENCE_FRAMES;
  const upper = frames.findIndex(frame => frame[0] >= aspect);
  const a = frames[Math.max(0, upper - 1)], b = frames[Math.max(0, upper)];
  const blend = a === b ? 0 : (aspect - a[0]) / (b[0] - a[0]);
  const fitted = (index: 1 | 2 | 3) => a[index] + (b[index] - a[index]) * blend;
  const endX = mobile ? -.35 : fitted(1);
  const endY = mobile ? .02 : fitted(2);
  const endRadius = mobile ? .85 : fitted(3);
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
  // Keep the saved/default 3-degree appearance. More gap reduces the complete
  // artwork footprint, not only a wedge width already limited by the aspect cap.
  size *= width / sectorSize(count, DISC_DEFAULTS.slotGap).width;
  const center = 0.8, halfHeight = 0.14 * size;
  const inner = center - halfHeight, outer = center + halfHeight;
  // The invisible placement region stays rectangular so a PNG is never warped into a wedge.
  const halfAngle = Math.min(0.6, width * 0.48) * size;
  const halfWidth = Math.min((outer - inner) * 0.39, 0.28 * size, inner * Math.tan(halfAngle));
  const innerHalfWidth = halfWidth, outerHalfWidth = halfWidth;
  return { step, inner, outer, innerHalfWidth, outerHalfWidth,
    aspect: (outer - inner) / (halfWidth * 2) };
}

/** Fit each title's visible aspect into the same rotation-safe sector footprint.
 * The disc and neighbouring slots do not grow when a new title is uploaded. */
export function discFittedTitleLayout(panel: ReturnType<typeof discPanelLayout>, imageAspect: number) {
  const halfRadial = (panel.outer - panel.inner) / 2;
  const budget = Math.hypot(halfRadial, panel.innerHalfWidth);
  const aspect = Number.isFinite(imageAspect) ? Math.min(10, Math.max(.1, imageAspect)) : panel.aspect;
  const halfWidth = budget / Math.hypot(aspect, 1);
  const halfHeight = halfWidth * aspect;
  const center = (panel.inner + panel.outer) / 2;
  return { ...panel, inner: center - halfHeight, outer: center + halfHeight,
    innerHalfWidth: halfWidth, outerHalfWidth: halfWidth, aspect };
}

/** Transparent padding is not title artwork; leave a small antialiasing margin. */
export function discTitleInkBounds(pixels: ArrayLike<number>, width: number, height: number) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return { x: 0, y: 0, width, height };
  const margin = Math.max(2, Math.round(Math.min(width, height) * .015));
  left = Math.max(0, left - margin); top = Math.max(0, top - margin);
  right = Math.min(width - 1, right + margin); bottom = Math.min(height - 1, bottom + margin);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Rotate artwork about its own centre, then place it around the glass. */
export function discTitlePoint(layout: ReturnType<typeof discPanelLayout>, u: number, v: number, orbit: number, rotation = 0, out = { x: 0, y: 0 }, scale = 1) {
  const center = (layout.inner + layout.outer) / 2;
  const x = (u - .5) * (layout.outer - layout.inner) * scale, y = (v - .5) * layout.innerHalfWidth * 2 * scale;
  const c = Math.cos(rotation), s = Math.sin(rotation), oc = Math.cos(orbit), os = Math.sin(orbit);
  const radial = center + x * c - y * s, tangent = x * s + y * c;
  out.x = radial * oc - tangent * os;
  out.y = radial * os + tangent * oc;
  return out;
}

function projectionWindow(layout: ReturnType<typeof discPanelLayout>, radius: number, spread: number, maxScale: number) {
  const center = Math.min(layout.outer - 0.015, Math.max(layout.inner + 0.015, radius));
  const scale = Math.min(maxScale, Math.max(0.35, spread * 1.14));
  const halfHeight = Math.min(center - layout.inner, layout.outer - center) * scale;
  const inner = center - halfHeight, outer = center + halfHeight;
  const widthAt = (r: number) => layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * (r - layout.inner) / (layout.outer - layout.inner);
  return { ...layout, inner, outer, innerHalfWidth: widthAt(inner) * scale, outerHalfWidth: widthAt(outer) * scale, center };
}

/** Existing bounded beam footprint and surface reflection. */
export function discProjectionWindow(layout: ReturnType<typeof discPanelLayout>, radius: number, spread: number) {
  return projectionWindow(layout, radius, spread, 1.35);
}

/** Wider title reveal on the glass, centred on the existing beam landing. */
export function discLandingWindow(layout: ReturnType<typeof discPanelLayout>, radius: number, spread: number) {
  return projectionWindow(layout, radius, spread, 1.75);
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
export function discProjectionCoverage(layout: ReturnType<typeof discPanelLayout>, window: ReturnType<typeof discProjectionWindow>, angle: number, softness: number, rotation = 0, scale = 1) {
  const point = { x: 0, y: 0 };
  let coverage = 0;
  for (let row = 0; row < 5; row++) {
    const t = (row + .5) / 5;
    for (let col = 0; col < 5; col++) {
      discTitlePoint(layout, t, (col + .5) / 5, angle, rotation, point, scale);
      coverage += discProjectionMask(point.x, point.y, window, softness);
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
