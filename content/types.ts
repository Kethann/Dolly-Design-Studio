// ─────────────────────────────────────────────────────────────────────────────
// SHAPES OF THE CONTENT — what fields a project, service or testimonial has.
// The category names below are also the filter buttons on the Work page.
// ─────────────────────────────────────────────────────────────────────────────

/** A project's type, one of the site's categories (the creator can add, rename, reorder and remove them in the portal). */
export type Category = string;

/** The categories the site starts with; they become the filter buttons on the Work page, in this order (only ones that have projects are shown). */
export const CATEGORIES: Category[] = [
  "Film Publicity",
  "Re-release",
  "Campaigns",
  "Title Design",
  "Independent",
];

/** Languages a project's films are in — the language filter in "Our projects". */
export type Language = "Telugu" | "Kannada";
export const LANGUAGES: Language[] = ["Telugu", "Kannada"];

export interface WorkImage {
  /** Path inside /public, e.g. "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg" */
  src: string;
  /** Required: describes the image for screen readers and search engines. */
  alt: string;
}

export interface Project {
  /** Used in the web address (/work/<slug>) — lowercase, words joined with hyphens. */
  slug: string;
  title: string;
  /** Film or campaign name, shown under the title. */
  film: string;
  category: Category;
  /** The film's language(s). A project can be in both (e.g. a set of title designs). */
  languages: Language[];
  year: number;
  client: string;
  role: string;
  deliverables: string[];
  /** One or two sentences about the brief. */
  brief: string;
  /** Extra rows on the project page, e.g. { label: "Director", value: "…" }. */
  credits?: { label: string; value: string }[];
  /** First image is the cover. */
  images: WorkImage[];
  /** Show on the home page's "Selected work". */
  featured?: boolean;
  /** Lower numbers appear first. */
  order: number;
}

export interface Service {
  number: string;
  name: string;
  description: string;
  deliverables: string[];
  /** Poster shown when hovering the row, e.g. "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg". */
  sample: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

/** A production house: its logo (leave empty to show the name as text) and its name. */
export interface ClientEntry {
  name: string;
  logo: string;
  /** What the logo shows (optional; the name is used when empty). */
  alt?: string;
}

/** A person the studio has worked with: their photo (a round portrait) and their name. */
export interface CollaboratorEntry {
  name: string;
  photo: string;
  /** What the photo shows (optional). */
  alt?: string;
}
