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
}

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
