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
  /** 0..1: how much they float. */
  motion: number;
  /** 0..1: how strongly they respond to the cursor. */
  cursor: number;
  /** Faint lines linking the cursor to the nearest stars. */
  lines: boolean;
}

export interface IntroSettings {
  enabled: boolean;
  /** Page and intro background. */
  background: string;
  /** 1 = the original intro's glow; 0.5 = half. */
  glow: number;
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
  field: FieldSettings;
}

export const DEFAULT_INTRO_SETTINGS: IntroSettings = {
  enabled: true,
  background: "#410000",
  glow: 0.5,
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
  field: { count: 36, motion: 0.3, cursor: 0.5, lines: true },
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

  const rawColors = Array.isArray(src.colors) ? src.colors.slice(0, LIMITS.colorCount[1]) : [];
  const colors = rawColors
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
    .filter((c): c is Record<string, unknown> => !!c && typeof c.hex === "string" && HEX.test(c.hex.trim()))
    .map((c) => ({ hex: hex(c.hex, "#ffffff"), share: num(c.share, LIMITS.colorShare, 25) }));

  return {
    enabled: bool(src.enabled, d.enabled),
    background: hex(src.background, d.background),
    glow: num(src.glow, LIMITS.glow, d.glow),
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
      lines: bool(field.lines, d.field.lines),
    },
  };
}

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
