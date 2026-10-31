import type { home } from "@/content/home";
import type { site } from "@/content/site";
import type { breakdownsPage, footer, notFoundPage, projectPage, workPage } from "@/content/pages";
import type { ClientEntry, CollaboratorEntry, Project, Service, Testimonial } from "@/content/types";

/** `as const` content turned back into plain, editable types. */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Widen<U>[]
        : T extends object
          ? { -readonly [K in keyof T]: Widen<T[K]> }
          : T;

/** How one piece of text looks. Anything left out keeps the site's own styling. */
export interface TextStyle {
  font?: string;
  /** Largest size in px (it shrinks smoothly on small screens). */
  size?: number;
  weight?: number;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  /** Line height as a multiple of the size. */
  lineHeight?: number;
  /** Letter spacing in 1/100 em. */
  tracking?: number;
}

/** A font the creator uploaded (served from /fonts/uploads). */
export interface CustomFont {
  id: string;
  label: string;
  url: string;
}

/** The site's three brand colours. */
export interface Theme {
  /** Gold accents: small headings, lines, buttons. */
  accent: string;
  /** The bright gold used for highlights and the logo. */
  accentBright: string;
  /** Normal text. */
  text: string;
  /** The look of the glass cards (the numbers, the founder) and the strip behind the menu. */
  glass: GlassLook;
  /** The colour of the lamp light that falls on each menu item while it is the page you are on (by the item's id). */
  menuTones: Record<string, string>;
}

/** The glass: a gradient between two colours, how strong it is, how blurred, and what kind of finish it has. */
export interface GlassLook {
  /** From two to six colours. Each glass card mixes all of them, in an order of its own. */
  colors: string[];
  /** Each glass card mixes the colours in an order of its own, and changes it each time the cursor comes back. */
  shuffle: boolean;
  /** How strongly the colours tint the glass, 0–0.7. */
  tint: number;
  /** How much of what is behind the glass is blurred, 0–30 px. */
  blur: number;
  /** How wide the lit area around the cursor is, 0–1. */
  spread: number;
  /** The glow around the glass while it is lit, 0–0.8. */
  glow: number;
  /** Neon: full colour. Clear: a faint hint of colour. */
  effect: "Neon" | "Clear";
}

export const GLASS_EFFECTS: GlassLook["effect"][] = ["Neon", "Clear"];

/** How the poster gallery looks: one place to change every gallery on the site. */
export interface GalleryLayout {
  columns: "Auto" | "2" | "3" | "4";
  shape: "Poster (tall)" | "Square" | "Landscape";
  showDetails: boolean;
  showFilters: boolean;
}

/** One layer of a breakdown (a transparent PNG from the design file) and what it is called. */
export interface BreakdownLayer {
  image: string;
  label: string;
}

/**
 * A "breakdown": the finished artwork, which falls apart into its layers (listed bottom → top) when you hover it.
 */
export interface Breakdown {
  title: string;
  /** One line under the title in the viewer, e.g. what was made or how long it took. */
  note: string;
  /** A longer description shown beside the artwork on the Breakdowns page (blank lines make paragraphs). */
  description: string;
  layers: BreakdownLayer[];
  /** How far apart the layers fall. */
  spread: "tight" | "normal" | "wide";
  /** Which way the stack is turned: edge-on from the side, or tilted so you see more of each layer. */
  turn: "side" | "angled";
  /** Show the numbered label lines. */
  labels: boolean;
  /** Where the title and text sit next to the picture on the Breakdowns page. */
  textPosition: "left" | "right" | "top" | "bottom";
}

export type PageKey = "home" | "work" | "breakdowns" | "project" | "notFound";

/**
 * How one page differs from the rest of the site. Anything left empty simply follows the site's own fonts, colours
 * and background.
 */
export interface PageLook {
  /** Font ids (see fonts.ts, or an uploaded font's id) for headings, subheadings and text on this page. "" = the site's. */
  fontDisplay: string;
  fontLabel: string;
  fontBody: string;
  /** This page's accent colour (hex), or "" for the site's. */
  accent: string;
  /** A picture behind this page's content, or "". */
  backdrop: string;
  /** How much of the page background colour is laid over that picture (0 = the picture as it is, 1 = hidden). */
  backdropDim: number;
}

export interface SlateText {
  overline: string;
  headline: string[];
  body: string;
  ctaLabel: string;
}

/** Everything the creator can edit from the portal: text, lists, images, fonts. */
export interface SiteContent {
  site: Widen<typeof site>;
  nav: { id: string; label: string }[];
  home: Omit<Widen<typeof home>, "stats"> & { stats: { value: number | string; suffix: string; label: string }[] };
  services: Service[];
  clients: ClientEntry[];
  collaborators: CollaboratorEntry[];
  testimonials: Testimonial[];
  projects: Project[];
  /** The project types, in the order of the filter buttons on the gallery. */
  categories: string[];
  work: Widen<typeof workPage>;
  breakdownsPage: Widen<typeof breakdownsPage>;
  projectPage: Widen<typeof projectPage>;
  notFound: Widen<typeof notFoundPage>;
  footer: Widen<typeof footer>;
  slate: SlateText;
  /** Look of individual texts, keyed by their path (e.g. "home.manifesto.body"). */
  type: Record<string, TextStyle>;
  /** The three typefaces the site is built from. */
  fonts: { display: string; label: string; body: string };
  /** Fonts the creator uploaded; they can be chosen anywhere a font can. */
  customFonts: CustomFont[];
  theme: Theme;
  galleryLayout: GalleryLayout;
  /** The layered artworks the “Breakdowns” card opens. */
  breakdowns: Breakdown[];
  /** The look of each page on its own: fonts, accent colour and a backdrop picture. */
  pages: Record<PageKey, PageLook>;
}

/** How many colours the glass can mix. */
export const GLASS_COLOR_COUNT = [2, 6] as const;

/** The glass as the site first has it: the Gemini mesh gradient: peach-orange, hot pink, magenta, violet, deep blue and cyan. */
export const DEFAULT_GLASS: GlassLook = {
  colors: ["#ff8a4c", "#ff2d8a", "#d21fd8", "#7b2cff", "#2259ff", "#19e3ff"],
  shuffle: true,
  tint: 0.7,
  blur: 14,
  spread: 0.3,
  glow: 0.5,
  effect: "Neon",
};

/** Earlier looks of the glass (saved settings in one of these move to the current default). */
export const OLD_GLASS = { colorA: "#8b5cff", colorB: "#38a8ff" };
export const OLD_GEMINI = { colorA: "#4285f4", colorC: "#9b72cb" };
/** The six colours the glass had just before the mesh gradient. */
export const OLD_SIX = ["#1e4fd8", "#6d5bff", "#7fd4ff", "#ffffff", "#ff6ec7", "#e8648a"];

/** Ready-made sets of six colours to pick from in the portal. */
export const GLASS_PRESETS: { name: string; colors: string[] }[] = [
  { name: "Gemini", colors: ["#ff8a4c", "#ff2d8a", "#d21fd8", "#7b2cff", "#2259ff", "#19e3ff"] },
  { name: "Nebula", colors: ["#1b2bd9", "#3a5bff", "#6a8bff", "#b44dff", "#e04dff", "#5ad0ff"] },
  { name: "Candy", colors: ["#ff7ab6", "#ff9a8b", "#c58bff", "#8fb6ff", "#6ee7ff", "#ffb86b"] },
  { name: "Neon", colors: ["#8b5cff", "#5f7dff", "#38d6ff", "#2d6bff", "#ff4fd8", "#b04dff"] },
  { name: "Sunset", colors: ["#ff8a3d", "#ff3d8b", "#8b3dff", "#ffb347", "#ffcf5c", "#ff5c5c"] },
  { name: "Aurora", colors: ["#2de2a6", "#38a8ff", "#9b5cff", "#18c9a0", "#7dffcf", "#4d6bff"] },
  { name: "Ocean", colors: ["#00d4ff", "#3a7bff", "#7a5cff", "#0099cc", "#00a3c4", "#1b3fd1"] },
  { name: "Gold", colors: ["#ffd36a", "#ff9a3d", "#ff5c8a", "#ffcc4d", "#ffb14d", "#e84a7f"] },
];

/** The lamp colour of each menu item, until the portal changes it. */
export const DEFAULT_MENU_TONES: Record<string, string> = {
  agency: "#ffc857",
  clients: "#3ddcff",
  about: "#ff6ec7",
  work: "#9b6bff",
  process: "#4d8bff",
  services: "#3df2b0",
  contact: "#ff7a59",
};
