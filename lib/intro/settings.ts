// The creator-tunable look of the star intro and the lasting background stars.
// Shared by the server (reads/writes content/intro-settings.json), the site and the portal.

export interface StarColor {
  hex: string;
  /** Relative share of stars in this colour (normalised against the other colours). */
  share: number;
}

export interface FieldSettings {
  /** Stars that stay behind the hero after the reveal. */
  count: number;
  /** 0..1: how much they float and turn, like stars on water. */
  motion: number;
  /** 0..1: how strongly the cursor sends ripples through them. */
  cursor: number;
  /** 0..1: how soft the farther stars go (depth of field). */
  depthBlur: number;
  /** Large stars peeking in from the corners, turning slowly (0–2). */
  cornerStars: number;
  /** Size of those big stars (1 = default). */
  cornerSize: number;
  /** Size of the back stars (1 = default). */
  size: number;
}

export interface FrontSettings {
  /** Stars in front of the glass: nearer, so bigger, and crisp unless blurred. */
  count: number;
  /** 0..6 px: optional softness for the front stars. */
  blur: number;
  /** Size of the front stars (1 = default). */
  size: number;
}

export interface IntroSettings {
  enabled: boolean;
  /** Page and intro background. */
  background: string;
  /** The dark tinted glass between the background stars and the logo. */
  glassColor: string;
  /** 0..0.85: how strongly the glass tints what's behind it. */
  glassOpacity: number;
  /** 0..8 px: how frosted (blurred) the glass is. */
  glassFrost: number;
  /** Glow during the intro. 1 = the original intro's glow; 0.5 = half. */
  glow: number;
  /** Glow of the stars on the page after the reveal (used when `glowLinked` is off). */
  pageGlow: number;
  /** One glow for both the intro and the page. */
  glowLinked: boolean;
  /** Colour of the glints, glitter and the reveal wave's light. */
  glowColor: string;
  /** Glowing stars glint in their own colour instead of the glow colour. */
  glowMatchStar: boolean;
  /** Multiplier on every star's size. */
  starSize: number;
  /** Multiplier on how deep the star facets are cut. */
  starDepth: number;
  /** Multiplier on how far in front of / behind the logo the stars spread. */
  spaceDepth: number;
  /** 0..1: strength of the brushed-metal texture. */
  metallic: number;
  /** Percentage of stars that glow. */
  glowingShare: number;
  /** Stars that form the logo. */
  formationCount: number;
  colors: StarColor[];
  /** The stars behind the glass (plus the corner stars). */
  field: FieldSettings;
  /** The stars in front of the glass. */
  front: FrontSettings;
}

export const DEFAULT_INTRO_SETTINGS: IntroSettings = {
  enabled: true,
  background: "#410000",
  glassColor: "#120204",
  glassOpacity: 0.38,
  glassFrost: 3,
  glow: 0.5,
  pageGlow: 0.5,
  glowLinked: true,
  glowColor: "#ffcf7a",
  glowMatchStar: false,
  starSize: 1,
  starDepth: 1,
  spaceDepth: 1,
  metallic: 0.55,
  glowingShare: 12,
  formationCount: 700,
  colors: [
    { hex: "#d9a43f", share: 45 },
    { hex: "#c7ccd4", share: 30 },
    { hex: "#f2ede3", share: 25 },
  ],
  field: { count: 36, motion: 0.5, cursor: 0.5, depthBlur: 0.5, cornerStars: 2, cornerSize: 1, size: 1 },
  front: { count: 10, blur: 0, size: 1 },
};

export const LIMITS = {
  glow: [0, 1.5],
  starSize: [0.5, 2],
  starDepth: [0.3, 2.5],
  spaceDepth: [0.4, 1.6],
  metallic: [0, 1],
  glowingShare: [0, 60],
  formationCount: [200, 1200],
  colorShare: [1, 100],
  colorCount: [1, 6],
  fieldCount: [0, 120],
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

function num(value: unknown, [min, max]: readonly [number, number], fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function hex(value: unknown, fallback: string) {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

/** Turns anything (a saved file, a request body, a postMessage) into valid settings, filling gaps with defaults. */
export function sanitizeIntroSettings(input: unknown): IntroSettings {
  const d = DEFAULT_INTRO_SETTINGS;
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const field = (src.field && typeof src.field === "object" ? src.field : {}) as Record<string, unknown>;
  const front = (src.front && typeof src.front === "object" ? src.front : {}) as Record<string, unknown>;

  const rawColors = Array.isArray(src.colors) ? src.colors.slice(0, LIMITS.colorCount[1]) : [];
  const colors = rawColors
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
    .filter((c): c is Record<string, unknown> => !!c && typeof c.hex === "string" && HEX.test(c.hex.trim()))
    .map((c) => ({ hex: hex(c.hex, "#ffffff"), share: num(c.share, LIMITS.colorShare, 25) }));

  return {
    enabled: bool(src.enabled, d.enabled),
    background: hex(src.background, d.background),
    glassColor: hex(src.glassColor, d.glassColor),
    glassOpacity: num(src.glassOpacity, [0, 0.85], d.glassOpacity),
    glassFrost: num(src.glassFrost, [0, 8], d.glassFrost),
    glow: num(src.glow, LIMITS.glow, d.glow),
    pageGlow: num(src.pageGlow, LIMITS.glow, d.pageGlow),
    glowLinked: bool(src.glowLinked, d.glowLinked),
    glowColor: hex(src.glowColor, d.glowColor),
    glowMatchStar: bool(src.glowMatchStar, d.glowMatchStar),
    starSize: num(src.starSize, LIMITS.starSize, d.starSize),
    starDepth: num(src.starDepth, LIMITS.starDepth, d.starDepth),
    spaceDepth: num(src.spaceDepth, LIMITS.spaceDepth, d.spaceDepth),
    metallic: num(src.metallic, LIMITS.metallic, d.metallic),
    glowingShare: num(src.glowingShare, LIMITS.glowingShare, d.glowingShare),
    formationCount: Math.round(num(src.formationCount, LIMITS.formationCount, d.formationCount)),
    colors: colors.length ? colors : d.colors.map((c) => ({ ...c })),
    field: {
      count: Math.round(num(field.count, LIMITS.fieldCount, d.field.count)),
      motion: num(field.motion, [0, 1], d.field.motion),
      cursor: num(field.cursor, [0, 1], d.field.cursor),
      depthBlur: num(field.depthBlur, [0, 1], d.field.depthBlur),
      cornerStars: Math.round(num(field.cornerStars, [0, 2], d.field.cornerStars)),
      cornerSize: num(field.cornerSize, [0.5, 1.8], d.field.cornerSize),
      size: num(field.size, [0.4, 2.5], d.field.size),
    },
    front: {
      count: Math.round(num(front.count, [0, 40], d.front.count)),
      blur: num(front.blur, [0, 6], d.front.blur),
      size: num(front.size, [0.4, 2.5], d.front.size),
    },
  };
}

/** The glow the stars on the page use after the reveal. */
export const pageGlowOf = (s: IntroSettings) => (s.glowLinked ? s.glow : s.pageGlow);

/** Each colour's share as a fraction of the whole (sums to 1). */
export function colorFractions(colors: StarColor[]): number[] {
  const total = colors.reduce((sum, c) => sum + c.share, 0) || 1;
  return colors.map((c) => c.share / total);
}

/** Picks a colour index for a star, weighted by the colours' shares. `r` is a 0..1 random number. */
export function pickColorIndex(fractions: number[], r: number): number {
  let acc = 0;
  for (let i = 0; i < fractions.length; i++) {
    acc += fractions[i];
    if (r < acc) return i;
  }
  return fractions.length - 1;
}
