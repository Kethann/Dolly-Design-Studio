import { proofTable as proofTableContent, type ProofItem } from "@/content/proof-table";
import { DISC_DEFAULTS, sanitizeDisc, type DiscControls } from "@/lib/content/disc";
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

export const ART_STYLES = ["waves", "silk", "halo", "minimal", "dots", "bubbles"] as const;

/** Home-page sections that can each have their own Dots / Bubbles colours (they blend as you scroll). */
export const ART_SECTIONS = ["top", "agency", "clients", "about", "work", "process", "services", "contact"] as const;
export type ArtSection = (typeof ART_SECTIONS)[number];

/** Page groups that can each have their own Dots colours. */
export const ART_PAGES = ["home", "work", "project"] as const;
export type ArtPage = (typeof ART_PAGES)[number];
export type ArtStyle = (typeof ART_STYLES)[number];

/** The premium backdrop behind the stars: a deep gradient with sweeping layered curves and fine gold lines. */
export interface ArtSettings {
  /** Off = the plain background colour, as before. */
  enabled: boolean;
  style: ArtStyle;
  /** 0..1: how deep the shadows, folds and vignette go. */
  depth: number;
  /** Which arrangement of curves, lines and light (reshuffled from the portal). */
  seed: number;
  /** Light end of the gradient and the raised bands (the background colour sits in the middle). */
  tone: string;
  /** Dark end of the gradient. */
  shadow: string;
  /** Rotation of the whole design, in degrees. */
  rotation: number;
  /** 0..1: softness (blur) of the lines and edges during the intro… */
  softIntro: number;
  /** …and on the page after it. */
  softPage: number;
  /** Colour of the fine lines, the edges of the curves and their glints. */
  gold: string;
  /** 0..1: how strongly the gold lines and edges show. */
  lines: number;
  /** 0..1: how much the lines and curves drift. */
  motion: number;
  /** Dots and Bubbles styles: the two gradient colours, per page group (home page, work gallery, project pages). */
  dots: Record<ArtPage, { a: string; b: string }>;
  /** Bubbles style: how many bubbles (0..1) and how big (1 = default). */
  bubbles: { count: number; size: number };
  /** Dots style: how dense the dot grid is and how big the dots are (1 = default). */
  dotGrid: { density: number; size: number };
  /** Home page: a colour pair per section; neighbouring sections blend smoothly into each other. */
  sections: Record<ArtSection, { a: string; b: string }>;
}

/** How the stars stream out of the core behind the logo (at the top of the page). */
export interface StreamSettings {
  /** 0..1: how fast they stream out. */
  speed: number;
  /** 0..1: how fast they tumble. */
  spin: number;
  /** 0..1: how often they flip right over (0 = never). */
  flips: number;
  /** 0..1: how strongly they head for the corners rather than straight out to the sides. */
  corners: number;
}

/** Places on the page the cursor glow can light up. */
export const GLOW_PLACES = ["heroLogo", "navLogo", "titles", "links", "posters"] as const;
export type GlowPlace = (typeof GLOW_PLACES)[number];

export interface SweepSettings {
  /** Star size (1 = a little taller than the logo). */
  size: number;
  /** Seconds the star takes to cross (it must finish before the page appears). */
  duration: number;
  /** Turns while crossing (negative = the other way). */
  spin: number;
  /** 0..1: how far it tilts in 3D as it passes, catching the light on its facets. */
  tilt: number;
  /** 0..1: how thick the star is (0 = nearly flat, a minimal cut-out). */
  depth: number;
  /** 0..1: how wide the bevelled rim around its face is (0 = a hairline). */
  bevel: number;
  /** 0..1: how thick its side wall is (0 = a razor edge). */
  edge: number;
  /** 0..1: how pronounced its facets are (0 = a smooth flat crown, 1 = a sharp gem cut). */
  facets: number;
  /** 0..1: arm width (0 = thin and sharp, 1 = broad and stubby). */
  arms: number;
  /** 0..1: the brushed-metal texture on its facets. */
  texture: number;
  /** 0..1: how much its polished gold reflects. */
  shine: number;
  /** 0..1: a soft warm glow from the star and along the reveal edge. */
  glow: number;
  /** How much bigger it is when it leaves than when it enters. */
  grow: number;
  /** Width (px) of the soft edge where the logo appears behind the star. */
  feather: number;
  /** How far the star shapes it leaves behind bloom open (0 = only exactly where it passed). */
  bloom: number;
  /** "rtl": enters from the right, leaves left; "ltr": the other way. */
  direction: "rtl" | "ltr";
  /** An uploaded image laid over the star like a pattern overlay. */
  pattern: StarPattern;
}

export type PatternBlend = "normal" | "multiply" | "overlay" | "screen" | "soft-light";
export const PATTERN_BLENDS: PatternBlend[] = ["normal", "multiply", "overlay", "screen", "soft-light"];

export interface StarPattern {
  /** The image (an upload in /images/textures/), or null for none. */
  src: string | null;
  blend: PatternBlend;
  /** 0..1: how strongly it shows (like a layer's opacity). */
  amount: number;
  /** Size of one tile: 1 = one tile across the whole star; smaller repeats it. */
  scale: number;
  /** Turn of the pattern, in degrees. */
  rotation: number;
  /** 0..1: how deeply it's pressed into the metal, so it catches the light. */
  relief: number;
  /** A colour laid over the pattern, and how much of it. */
  tint: string;
  tintAmount: number;
}

const DEFAULT_PATTERN: StarPattern = {
  src: null,
  blend: "overlay",
  amount: 0.8,
  scale: 1,
  rotation: 0,
  relief: 0.4,
  tint: "#ffffff",
  tintAmount: 0,
};

function sanitizePattern(input: unknown, d: StarPattern): StarPattern {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const image =
    typeof src.src === "string" && /^\/images\/textures\/[\w\-.]+$/.test(src.src) && !src.src.includes("..") ? src.src : null;
  return {
    src: src.src === null ? null : (image ?? d.src),
    blend: PATTERN_BLENDS.includes(src.blend as PatternBlend) ? (src.blend as PatternBlend) : d.blend,
    amount: num(src.amount, [0, 1], d.amount),
    scale: num(src.scale, [0.1, 4], d.scale),
    rotation: num(src.rotation, [-180, 180], d.rotation),
    relief: num(src.relief, [0, 1], d.relief),
    tint: hex(src.tint, d.tint),
    tintAmount: num(src.tintAmount, [0, 1], d.tintAmount),
  };
}

function sanitizeSweep(input: unknown, d: SweepSettings): SweepSettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    size: num(src.size, [0.5, 2], d.size),
    duration: num(src.duration, [1.2, 2.4], d.duration),
    spin: num(src.spin, [-2, 2], d.spin),
    tilt: num(src.tilt, [0, 1], d.tilt),
    depth: num(src.depth, [0, 1], d.depth),
    bevel: num(src.bevel, [0, 1], d.bevel),
    edge: num(src.edge, [0, 1], d.edge),
    facets: num(src.facets, [0, 1], d.facets),
    arms: num(src.arms, [0, 1], d.arms),
    texture: num(src.texture, [0, 1], d.texture),
    shine: num(src.shine, [0, 1], d.shine),
    glow: num(src.glow, [0, 1], d.glow),
    grow: num(src.grow, [1, 1.8], d.grow),
    feather: num(src.feather, [6, 120], d.feather),
    bloom: num(src.bloom, [0, 2], d.bloom),
    direction: src.direction === "ltr" ? "ltr" : src.direction === "rtl" ? "rtl" : d.direction,
    pattern: sanitizePattern(src.pattern, d.pattern),
  };
}

export interface ProofTableSettings {
  enabled: boolean;
  /** CD presentation. Legacy table controls remain readable for older saved drafts. */
  disc: DiscControls;
  /** How long the section stays pinned, in screen heights (shorter = the story plays faster). */
  length: number;
  /** Card width (1 = the widest that fits). */
  cardSize: number;
  glassColor: string;
  /** 0..1: how see-through the glass plates are (1 = solid). */
  glassOpacity: number;
  /** 0..1: frosted blur of the glass. */
  frost: number;
  /** 0..1: how strongly the glass reflects (shine and mirrored room light). */
  reflection: number;
  /** The slim glass slab the cards lie on. */
  slabColor: string;
  /** 0..1: how see-through the slab is (1 = solid). */
  slabOpacity: number;
  /** The title cards, in drop order. */
  items: ProofItem[];
}

export const PROOF_LIMITS = { items: 16 } as const;

const str = (v: unknown, fallback: string, max = 80) => (typeof v === "string" ? v.slice(0, max) : fallback);

function sanitizeProofTable(input: unknown, d: ProofTableSettings): ProofTableSettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const items = Array.isArray(src.items)
    ? src.items
        .slice(0, PROOF_LIMITS.items)
        .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
        .filter((it) => typeof it.src === "string" && (it.src === "" || (/^\/images\/[\w\-./]+$/.test(it.src) && !it.src.includes(".."))))
        .map((it): ProofItem => ({
          src: it.src as string,
          type: it.type === "poster" ? "poster" : "title-png",
          film: str(it.film, "Untitled"),
          year: Math.round(num(it.year, [1950, 2100], new Date().getFullYear())),
          tag: str(it.tag, "Title", 30),
          slug: /^[a-z0-9-]{1,80}$/.test(String(it.slug)) ? String(it.slug) : "title-designs",
          alt: str(it.alt, str(it.film, "Title design"), 160),
          ...(typeof it.tint === "string" && /^#[0-9a-f]{6}$/i.test(it.tint) ? { tint: it.tint.toLowerCase() } : {}),
        }))
    : d.items;
  return {
    enabled: bool(src.enabled, d.enabled),
    disc: sanitizeDisc(src.disc),
    length: num(src.length, [0.8, 4], d.length),
    cardSize: num(src.cardSize, [0.25, 1], d.cardSize),
    glassColor: hex(src.glassColor, d.glassColor),
    glassOpacity: num(src.glassOpacity, [0.15, 1], d.glassOpacity),
    frost: num(src.frost, [0, 1], d.frost),
    reflection: num(src.reflection, [0, 1], d.reflection),
    slabColor: hex(src.slabColor, d.slabColor),
    slabOpacity: num(src.slabOpacity, [0.05, 1], d.slabOpacity),
    items,
  };
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
  /** How the logo appears: light rippling out from the star ("wave"), or the whole logo glowing into being ("glow"). */
  revealStyle: "wave" | "glow" | "sweep";
  /** The sweep reveal (revealStyle "sweep"): the big star crossing the logo. */
  sweep: SweepSettings;
  /** Stars that form the logo. */
  formationCount: number;
  /** The intro's stars: size of the logo-forming stars (on top of the overall star size)… */
  introStarSize: number;
  /** …the brushed-metal texture of all the intro's stars… */
  introMetallic: number;
  /** …and how strongly their metal reflects light. */
  introShine: number;
  /** 0..1: depth of field during the intro (the logo plane stays in focus). */
  introBlur: number;
  /** Background stars drifting around during the intro. */
  introAmbient: number;
  /** 0..1: how widely the formation stars sweep in (and how staggered their arrivals are). */
  scatter: number;
  /** 0..1: how loosely they settle around the letters (0 = exactly on the artwork). */
  disperse: number;
  /** How strongly the metal reflects light (separate from the glow). */
  shine: number;
  /** Big stars (the intro's hero star and the page's corner stars): how strongly their metal reflects light… */
  bigShine: number;
  /** …and how much they glow. */
  bigGlow: number;
  colors: StarColor[];
  /** The stars behind the glass (plus the corner stars). */
  field: FieldSettings;
  /** The stars in front of the glass. */
  front: FrontSettings;
  /** The premium gradient backdrop. */
  art: ArtSettings;
  /** How the background stars move (in the intro and on the page). */
  stream: StreamSettings;
  /** The glow that follows the cursor, in each place ticked. */
  logoGlow: { enabled: boolean; intensity: number; spread: number; color: string; places: Record<GlowPlace, boolean> };
  /** The cursor: normal (the usual arrow) or the pen, and the pen's colour, size, glow and the colour it turns over a logo. */
  cursor: { style: "pen" | "normal"; color: string; size: number; glow: number; logoColor: string };
  /** The title disc (collaborations section); preserves the legacy slate entries. */
  proofTable: ProofTableSettings;
  /** A soft pool of dark glass behind the logo that the stars stream out of. */
  dial: DialSettings;
}

export interface DialSettings {
  enabled: boolean;
  /** Radius, as a share of the screen height. */
  size: number;
  /** 0..1: how dark the glass gets at its centre. */
  darkness: number;
}

export const DEFAULT_INTRO_SETTINGS: IntroSettings = {
  enabled: true,
  background: "#410000",
  glassColor: "#120204",
  glassOpacity: 0.5,
  glassFrost: 3,
  glow: 0.3,
  pageGlow: 0.3,
  glowLinked: true,
  glowColor: "#ffcf7a",
  glowMatchStar: false,
  starSize: 1,
  starDepth: 1,
  spaceDepth: 1,
  metallic: 0.55,
  glowingShare: 4,
  revealStyle: "wave",
  sweep: {
    size: 1,
    duration: 1.9,
    spin: 0.35,
    tilt: 0.35,
    depth: 0.5,
    bevel: 0.5,
    edge: 0.5,
    facets: 0.6,
    arms: 0.4,
    texture: 0.6,
    shine: 0.6,
    glow: 0.35,
    grow: 1.3,
    feather: 30,
    bloom: 0.9,
    direction: "rtl",
    pattern: DEFAULT_PATTERN,
  },
  formationCount: 450,
  introStarSize: 0.75,
  introMetallic: 0.2,
  introShine: 0.5,
  introBlur: 0,
  introAmbient: 140,
  scatter: 0.5,
  disperse: 0.03,
  shine: 0.55,
  bigShine: 1,
  bigGlow: 1,
  colors: [
    { hex: "#d9a43f", share: 45 },
    { hex: "#c7ccd4", share: 30 },
    { hex: "#f2ede3", share: 25 },
  ],
  field: { count: 48, motion: 0.5, cursor: 0.5, depthBlur: 0.5, cornerStars: 2, cornerSize: 1, size: 1 },
  front: { count: 12, blur: 0, size: 1 },
  stream: { speed: 0.4, spin: 0.4, flips: 0.35, corners: 0.5 },
  dial: { enabled: true, size: 0.6, darkness: 0.35 },
  logoGlow: {
    enabled: true,
    intensity: 0.7,
    spread: 180,
    color: "#ffe7a0",
    places: { heroLogo: true, navLogo: true, titles: false, links: false, posters: false },
  },
  cursor: { style: "normal", color: "#fff195", size: 1, glow: 0.3, logoColor: "#ffffff" },
  proofTable: {
    enabled: true,
    disc: { ...DISC_DEFAULTS },
    length: 1.3,
    cardSize: 1,
    glassColor: "#1c1630",
    glassOpacity: 0.34,
    frost: 0.15,
    reflection: 0.85,
    slabColor: "#5fd3e6",
    slabOpacity: 0.24,
    items: proofTableContent.items,
  },
  art: {
    enabled: true,
    style: "waves",
    depth: 0.6,
    seed: 7,
    tone: "#8c1c22",
    shadow: "#190002",
    rotation: 0,
    dots: {
      home: { a: "#1b8fb3", b: "#d23ac0" },
      work: { a: "#1b8fb3", b: "#d23ac0" },
      project: { a: "#1b8fb3", b: "#d23ac0" },
    },
    bubbles: { count: 0.45, size: 1 },
    dotGrid: { density: 1, size: 1 },
    sections: {
      top: { a: "#1b8fb3", b: "#d23ac0" },
      agency: { a: "#3a4fd8", b: "#c23aa0" },
      work: { a: "#1b8fb3", b: "#7a3ad2" },
      process: { a: "#2a9d8f", b: "#3a6fd8" },
      services: { a: "#c2502a", b: "#d23a7a" },
      about: { a: "#6a3ad2", b: "#d23ac0" },
      clients: { a: "#1b8fb3", b: "#d2a03a" },
      contact: { a: "#d23ac0", b: "#3a4fd8" },
    },
    softIntro: 0.1,
    softPage: 0.1,
    gold: "#d9a648",
    lines: 0.6,
    motion: 0.4,
  },
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
  const art = (src.art && typeof src.art === "object" ? src.art : {}) as Record<string, unknown>;
  const stream = (src.stream && typeof src.stream === "object" ? src.stream : {}) as Record<string, unknown>;
  const dial = (src.dial && typeof src.dial === "object" ? src.dial : {}) as Record<string, unknown>;
  const logoGlow = (src.logoGlow && typeof src.logoGlow === "object" ? src.logoGlow : {}) as Record<string, unknown>;
  const places = (logoGlow.places && typeof logoGlow.places === "object" ? logoGlow.places : {}) as Record<string, unknown>;
  const cursor = (src.cursor && typeof src.cursor === "object" ? src.cursor : {}) as Record<string, unknown>;

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
    revealStyle:
      src.revealStyle === "glow" || src.revealStyle === "wave" || src.revealStyle === "sweep" ? src.revealStyle : d.revealStyle,
    sweep: sanitizeSweep(src.sweep, d.sweep),
    formationCount: Math.round(num(src.formationCount, LIMITS.formationCount, d.formationCount)),
    introStarSize: num(src.introStarSize, [0.3, 1.6], d.introStarSize),
    introMetallic: num(src.introMetallic, [0, 1], d.introMetallic),
    introShine: num(src.introShine, [0.2, 1.5], d.introShine),
    introBlur: num(src.introBlur, [0, 1], d.introBlur),
    introAmbient: Math.round(num(src.introAmbient, [0, 400], d.introAmbient)),
    scatter: num(src.scatter, [0, 1], d.scatter),
    disperse: num(src.disperse, [0, 1], d.disperse),
    shine: num(src.shine, [0.2, 1.5], d.shine),
    bigShine: num(src.bigShine, [0.2, 1.8], d.bigShine),
    bigGlow: num(src.bigGlow, [0, 2], d.bigGlow),
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
    stream: {
      speed: num(stream.speed, [0, 1], d.stream.speed),
      spin: num(stream.spin, [0, 1], d.stream.spin),
      flips: num(stream.flips, [0, 1], d.stream.flips),
      corners: num(stream.corners, [0, 1], d.stream.corners),
    },
    logoGlow: {
      enabled: bool(logoGlow.enabled, d.logoGlow.enabled),
      intensity: num(logoGlow.intensity, [0, 1], d.logoGlow.intensity),
      spread: num(logoGlow.spread, [60, 400], d.logoGlow.spread),
      color: hex(logoGlow.color, d.logoGlow.color),
      places: Object.fromEntries(GLOW_PLACES.map((p) => [p, bool(places[p], d.logoGlow.places[p])])) as Record<
        GlowPlace,
        boolean
      >,
    },
    proofTable: sanitizeProofTable(src.proofTable, d.proofTable),
    cursor: {
      style: cursor.style === "pen" ? "pen" : "normal",
      color: hex(cursor.color, d.cursor.color),
      size: num(cursor.size, [0.6, 2], d.cursor.size),
      glow: num(cursor.glow, [0, 1], d.cursor.glow),
      logoColor: hex(cursor.logoColor, d.cursor.logoColor),
    },
    dial: {
      enabled: bool(dial.enabled, d.dial.enabled),
      size: num(dial.size, [0.2, 0.7], d.dial.size),
      darkness: num(dial.darkness, [0, 1], d.dial.darkness),
    },
    art: {
      enabled: bool(art.enabled, d.art.enabled),
      style: ART_STYLES.includes(art.style as ArtStyle) ? (art.style as ArtStyle) : d.art.style,
      depth: num(art.depth, [0, 1], d.art.depth),
      seed: Math.round(num(art.seed, [0, 1e9], d.art.seed)),
      tone: hex(art.tone, d.art.tone),
      shadow: hex(art.shadow, d.art.shadow),
      rotation: ((num(art.rotation, [-720, 720], d.art.rotation) % 360) + 360) % 360,
      softIntro: num(art.softIntro, [0, 1], d.art.softIntro),
      softPage: num(art.softPage, [0, 1], d.art.softPage),
      bubbles: {
        count: num((art.bubbles as Record<string, unknown> | undefined)?.count, [0.05, 0.95], d.art.bubbles.count),
        size: num((art.bubbles as Record<string, unknown> | undefined)?.size, [0.3, 2], d.art.bubbles.size),
      },
      dotGrid: {
        density: num((art.dotGrid as Record<string, unknown> | undefined)?.density, [0.4, 2], d.art.dotGrid.density),
        size: num((art.dotGrid as Record<string, unknown> | undefined)?.size, [0.3, 2.5], d.art.dotGrid.size),
      },
      dots: Object.fromEntries(
        ART_PAGES.map((page) => {
          const src =
            (art.dots && typeof art.dots === "object" ? (art.dots as Record<string, Record<string, unknown>>)[page] : null) ?? {};
          return [page, { a: hex(src.a, d.art.dots[page].a), b: hex(src.b, d.art.dots[page].b) }];
        }),
      ) as Record<ArtPage, { a: string; b: string }>,
      sections: Object.fromEntries(
        ART_SECTIONS.map((id) => {
          const src =
            (art.sections && typeof art.sections === "object"
              ? (art.sections as Record<string, Record<string, unknown>>)[id]
              : null) ?? {};
          return [id, { a: hex(src.a, d.art.sections[id].a), b: hex(src.b, d.art.sections[id].b) }];
        }),
      ) as Record<ArtSection, { a: string; b: string }>,
      gold: hex(art.gold, d.art.gold),
      lines: num(art.lines, [0, 1], d.art.lines),
      motion: num(art.motion, [0, 1], d.art.motion),
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
