// The "inside" page of each "How we work" card: its own address (/process/<slug>) and a list of cards of its own.
// Kept apart from the home page's card text so the home page's content shape does not change.
import { ZOOM_MAX, ZOOM_MIN } from "./adjust";

export interface ProcessItem {
  /** A picture from the library or an upload ("" = none yet: the card shows its title on a plain tile). */
  image: string;
  title: string;
  note: string;
  /** "fit" shows the whole picture in the frame; "fill" fills the frame (and crops what does not fit). */
  fit: "fit" | "fill";
  /** Zoom (1 = as fitted; below 1 zooms out, above zooms in) and where the picture is centred, as a percentage across and down. */
  imageZoom: number;
  imageX: number;
  imageY: number;
}

export interface ProcessCardExtra {
  /** The page's address: stays the same when the title changes, so links never break. */
  slug: string;
  /** Intro on the inside page (blank = the text shown on the home page card). */
  pageIntro: string;
  /** How big the cards are: small (4 across), medium (3) or large (2). */
  cols: "small" | "medium" | "large";
  /** The frame the pictures sit in. */
  shape: "poster" | "square" | "landscape" | "natural";
  items: ProcessItem[];
}

export const PROCESS_COLS = ["small", "medium", "large"] as const;
export const PROCESS_SHAPES = ["poster", "square", "landscape", "natural"] as const;
export const PROCESS_FITS = ["fit", "fill"] as const;
export const MAX_PROCESS_ITEMS = 40;

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, max = 400) => (typeof x === "string" ? x.replace(/\u0000/g, "").slice(0, max) : "");
const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** One inside card, cleaned: only known words, numbers in range, and pictures that are really on this site. */
export function cleanItem(raw: unknown): ProcessItem | null {
  if (!isObj(raw)) return null;
  const image = str(raw.image, 300);
  return {
    image: image.startsWith("/images/") ? image : "",
    title: str(raw.title, 120).trim(),
    note: str(raw.note, 400).trim(),
    // ("contain" and "cover" are what older saves called them)
    fit: oneOf(raw.fit === "contain" ? "fit" : raw.fit === "cover" ? "fill" : raw.fit, PROCESS_FITS, "fit"),
    imageZoom: num(raw.imageZoom, ZOOM_MIN, ZOOM_MAX, 1),
    imageX: num(raw.imageX, 0, 100, 50),
    imageY: num(raw.imageY, 0, 100, 50),
  };
}

/** The inside-page settings of one card, cleaned. `taken` holds the slugs already given out, so every page has its own. */
export function cleanExtra(card: unknown, title: string, taken: Set<string>): ProcessCardExtra {
  const raw = isObj(card) ? card : {};
  let slug = str(raw.slug, 40).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || taken.has(slug)) {
    const base = slugify(title) || "card";
    slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  }
  taken.add(slug);
  return {
    slug,
    pageIntro: str(raw.pageIntro, 2000),
    cols: oneOf(raw.cols, PROCESS_COLS, "medium"),
    shape: oneOf(raw.shape, PROCESS_SHAPES, "poster"),
    items: (Array.isArray(raw.items) ? raw.items : []).slice(0, MAX_PROCESS_ITEMS).flatMap((it) => cleanItem(it) ?? []),
  };
}

/** Reads the inside-page settings from a card as the site holds it (with the defaults for a card that has none yet). */
export function extraOf(card: unknown): ProcessCardExtra {
  const e = cleanExtra(card, isObj(card) ? str(card.title) : "", new Set());
  return e;
}
