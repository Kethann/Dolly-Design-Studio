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
}

/** The glass: a gradient between two colours, how strong it is, how blurred, and what kind of finish it has. */
export interface GlassLook {
  /** The glass takes three colours across it: this one on one side, the middle colour, then the last on the far side. */
  colorA: string;
  colorC: string;
  colorB: string;
  /** A fourth, light colour (white by default) for the sparkle. */
  colorD: string;
  /** Each glass card mixes the four colours in an order of its own, and changes it each time the cursor comes back. */
  shuffle: boolean;
  /** Direction of the gradient, 0–360 degrees. */
  angle: number;
  /** How strongly the colours tint the glass, 0–0.7. */
  tint: number;
  /** How much of what is behind the glass is blurred, 0–30 px. */
  blur: number;
  /** How wide the lit area around the cursor is, 0–1. */
  spread: number;
  /** The glow around the glass while it is lit, 0–0.8. */
  glow: number;
  /** Neon: glowing gradient rim. Frosted: milky white rim, no glow. Clear: almost see-through. */
  effect: "Neon" | "Frosted" | "Clear";
}

export const GLASS_EFFECTS: GlassLook["effect"][] = ["Neon", "Frosted", "Clear"];

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
  home: Widen<typeof home>;
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

/** The glass as the site first has it: the Google Gemini gradient (blue, violet, rose) with a white sparkle. */
export const DEFAULT_GLASS: GlassLook = { colorA: "#4285f4", colorC: "#9b72cb", colorB: "#d96570", colorD: "#f4f0ff", shuffle: true, angle: 135, tint: 0.7, blur: 14, spread: 0.3, glow: 0.3, effect: "Neon" };

/** Earlier looks of the glass (saved settings in one of these move to the current default). */
export const OLD_GLASS = { colorA: "#8b5cff", colorB: "#38a8ff" };
export const OLD_GEMINI = { colorA: "#4285f4", colorC: "#9b72cb", colorB: "#d96570" };

/** Ready-made sets of four colours to pick from in the portal: first, middle, last and the light sparkle. */
export const GLASS_PRESETS: { name: string; colors: [string, string, string, string] }[] = [
  { name: "Gemini", colors: ["#4285f4", "#9b72cb", "#d96570", "#f4f0ff"] },
  { name: "Neon", colors: ["#8b5cff", "#5f7dff", "#38d6ff", "#f2f7ff"] },
  { name: "Sunset", colors: ["#ff8a3d", "#ff3d8b", "#8b3dff", "#fff0e6"] },
  { name: "Aurora", colors: ["#2de2a6", "#38a8ff", "#9b5cff", "#f0fff9"] },
  { name: "Ocean", colors: ["#00d4ff", "#3a7bff", "#7a5cff", "#eefaff"] },
  { name: "Gold", colors: ["#ffd36a", "#ff9a3d", "#ff5c8a", "#fffbe8"] },
];
