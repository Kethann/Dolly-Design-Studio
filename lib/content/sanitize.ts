import { CATEGORIES, LANGUAGES, LEGACY_CATEGORIES } from "@/content/types";
import { CARD_LINK_BY_ICON, CARD_LINK_VALUES, CARD_OPENS_OWN_PAGE } from "./card-links";
import { cleanExtra } from "./process";
import { ZOOM_MAX, ZOOM_MIN, cleanAdjust } from "./adjust";
import { DEFAULT_GLASS, DEFAULT_MENU_TONES, GLASS_COLOR_COUNT, GLASS_EFFECTS, OLD_GEMINI, OLD_GLASS, OLD_SIX, type GlassLook } from "./types";
import { MAX_CATEGORIES, MAX_CATEGORY_LENGTH } from "./limits";
import { defaultContent } from "./defaults";
import { fontById } from "./fonts";
import { MAX_BREAKDOWNS, MAX_BREAKDOWN_LAYERS } from "./limits";
import type { Breakdown, CustomFont, SiteContent, TextStyle } from "./types";

const MAX_TEXT = 8000;
const MAX_ITEMS = 300;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Copies plain JSON only: bounded strings, lists and depth, nothing executable. */
function clean(x: unknown, depth = 0): unknown {
  if (typeof x === "string") return x.slice(0, MAX_TEXT);
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x === "boolean") return x;
  if (depth > 6) return null;
  if (Array.isArray(x)) return x.slice(0, MAX_ITEMS).map((v) => clean(v, depth + 1));
  if (isObj(x)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x).slice(0, 80)) if (/^[\w.-]{1,80}$/.test(k)) out[k] = clean(v, depth + 1);
    return out;
  }
  return null;
}

/** Fills in what's missing from the defaults and keeps each value the same kind of thing the default is. */
function merge(def: unknown, inp: unknown, key = ""): unknown {
  if (Array.isArray(def)) return Array.isArray(inp) ? clean(inp) : def;
  if (isObj(def)) {
    if (key === "type") return inp; // free-form map, cleaned separately
    const src = isObj(inp) ? inp : {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(def)) out[k] = merge(def[k], src[k], k);
    return out;
  }
  if (typeof def === "string") return typeof inp === "string" ? inp.slice(0, MAX_TEXT) : def;
  if (typeof def === "number") return typeof inp === "number" && Number.isFinite(inp) ? inp : def;
  if (typeof def === "boolean") return typeof inp === "boolean" ? inp : def;
  return def;
}

const num = (x: unknown, min: number, max: number) =>
  typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : undefined;

function cleanStyle(x: unknown, custom: CustomFont[]): TextStyle | null {
  if (!isObj(x)) return null;
  const s: TextStyle = {};
  if (typeof x.font === "string" && fontById(x.font, custom)) s.font = x.font;
  const size = num(x.size, 8, 240);
  if (size !== undefined) s.size = Math.round(size);
  const weight = num(x.weight, 100, 900);
  if (weight !== undefined) s.weight = Math.round(weight / 100) * 100;
  if (x.italic === true) s.italic = true;
  if (typeof x.color === "string" && /^#[0-9a-f]{6}$/i.test(x.color)) s.color = x.color;
  if (x.align === "left" || x.align === "center" || x.align === "right") s.align = x.align;
  const lh = num(x.lineHeight, 0.8, 3);
  if (lh !== undefined) s.lineHeight = Math.round(lh * 100) / 100;
  const tr = num(x.tracking, -10, 60);
  if (tr !== undefined) s.tracking = Math.round(tr);
  return Object.keys(s).length ? s : null;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()) : []);

/** The creator's content, made safe: defaults for anything missing, bounded sizes, valid projects and styles. */
export function sanitizeContent(input: unknown): SiteContent {
  const def = defaultContent();
  const merged = merge(def, input) as SiteContent;
  const src = isObj(input) ? input : {};

  // Menu: the destinations are fixed, only the words change.
  const navIn = Array.isArray(src.nav) ? src.nav : [];
  merged.nav = def.nav.map((n) => {
    const found = navIn.find((m) => isObj(m) && m.id === n.id);
    const label = isObj(found) && typeof found.label === "string" ? found.label.trim() : "";
    return { id: n.id, label: label ? label.slice(0, 40) : n.label };
  });

  // Categories: short unique names; at least one (the defaults come back if the list is emptied).
  const catSeen = new Set<string>();
  const cats = (Array.isArray(src.categories) ? src.categories : [])
    .flatMap((c) => (typeof c === "string" ? [c.replace(/\s+/g, " ").trim().slice(0, MAX_CATEGORY_LENGTH)] : []))
    .filter((c) => c && !catSeen.has(c.toLowerCase()) && !!catSeen.add(c.toLowerCase()))
    .slice(0, MAX_CATEGORIES);
  // Content saved while the site still had the original project types moves to the new ones, and its projects with it.
  const migrate = cats.length > 0 && cats.every((c) => c.toLowerCase() in LEGACY_CATEGORIES);
  merged.categories = cats.length && !migrate ? cats : [...CATEGORIES];
  const typeOf = (raw: string) => (migrate ? (LEGACY_CATEGORIES[raw.toLowerCase()] ?? raw) : raw);

  // Projects: each needs a title, an address and at least one image; the address stays unique.
  const seen = new Set<string>();
  merged.projects = (merged.projects as unknown[]).flatMap((raw, i) => {
    if (!isObj(raw)) return [];
    const title = str(raw.title).trim();
    const images = (Array.isArray(raw.images) ? raw.images : []).filter(
      (im): im is { src: string; alt: string } => isObj(im) && typeof im.src === "string" && im.src.startsWith("/images/"),
    );
    if (!title || !images.length) return [];
    let slug = slugify(str(raw.slug) || title) || `project-${i + 1}`;
    while (seen.has(slug)) slug += "-2";
    seen.add(slug);
    const credits = (Array.isArray(raw.credits) ? raw.credits : []).flatMap((c) =>
      isObj(c) && typeof c.label === "string" && typeof c.value === "string" && c.label.trim()
        ? [{ label: c.label, value: c.value }]
        : [],
    );
    return [
      {
        slug,
        title,
        film: str(raw.film, title),
        category: merged.categories.includes(typeOf(str(raw.category))) ? typeOf(str(raw.category)) : merged.categories[0],
        languages: strs(raw.languages).filter((l) => (LANGUAGES as string[]).includes(l)),
        year: typeof raw.year === "number" && Number.isFinite(raw.year) ? Math.round(raw.year) : new Date().getFullYear(),
        client: str(raw.client),
        role: str(raw.role),
        deliverables: strs(raw.deliverables),
        brief: str(raw.brief),
        ...(credits.length ? { credits } : {}),
        images: images.map((im) => ({ src: im.src, alt: typeof im.alt === "string" && im.alt ? im.alt : title, ...cleanAdjust(im, "src") })),
        ...(raw.featured === true ? { featured: true } : {}),
        order: i + 1,
      },
    ];
  }) as SiteContent["projects"];

  // Services are numbered by their position.
  merged.services = (merged.services as unknown[]).flatMap((raw, i) => {
    if (!isObj(raw)) return [];
    return [
      {
        number: String(i + 1).padStart(2, "0"),
        name: str(raw.name),
        description: str(raw.description),
        deliverables: strs(raw.deliverables),
        sample: str(raw.sample).startsWith("/images/") ? str(raw.sample) : def.services[0].sample,
        ...cleanAdjust(raw, "sample"),
        details: str(raw.details).slice(0, 4000),
        gallery: (Array.isArray(raw.gallery) ? raw.gallery : []).slice(0, 12).flatMap((g: unknown) => {
          if (!isObj(g) || !str(g.src).startsWith("/images/")) return [];
          return [{ src: str(g.src), alt: str(g.alt).slice(0, 200), ...cleanAdjust(g, "src") }];
        }),
      },
    ];
  });

  // Plain lists of words: no blanks.
  merged.clients = (merged.clients as unknown[]).flatMap((raw) => {
    if (typeof raw === "string") return raw.trim() ? [{ name: raw.trim(), logo: "" }] : [];
    if (!isObj(raw)) return [];
    const name = str(raw.name).trim();
    const logo = str(raw.logo);
    const alt = str(raw.alt).trim().slice(0, 200);
    return name ? [{ name, logo: logo.startsWith("/images/") ? logo : "", ...(alt ? { alt } : {}) }] : [];
  });
  merged.collaborators = (merged.collaborators as unknown[]).flatMap((raw) => {
    if (typeof raw === "string") return raw.trim() ? [{ name: raw.trim(), photo: "" }] : [];
    if (!isObj(raw)) return [];
    const name = str(raw.name).trim();
    const photo = str(raw.photo);
    const alt = str(raw.alt).trim().slice(0, 200);
    return name ? [{ name, photo: photo.startsWith("/images/") ? photo : "", ...(alt ? { alt } : {}), ...cleanAdjust(raw, "photo") }] : [];
  });

  // Uploaded fonts: only files this portal stored, with safe ids.
  merged.customFonts = (Array.isArray(src.customFonts) ? src.customFonts : [])
    .slice(0, 30)
    .flatMap((raw): CustomFont[] => {
      if (!isObj(raw)) return [];
      const id = str(raw.id);
      const url = str(raw.url);
      if (!/^c-[a-z0-9-]{1,40}$/.test(id) || !/^\/fonts\/uploads\/[\w.-]+\.(ttf|otf|woff2?)$/i.test(url)) return [];
      return [{ id, url, label: str(raw.label).trim().slice(0, 60) || id }];
    });

  // Brand colours must be real colours.
  const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  for (const k of ["accent", "accentBright", "text"] as const) {
    if (!isHex(merged.theme[k])) merged.theme[k] = def.theme[k];
    else merged.theme[k] = merged.theme[k].toLowerCase();
  }

  // The glass: real colours, and every number kept inside its range.
  const gIn = isObj(src.theme) && isObj(src.theme.glass) ? src.theme.glass : {};
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const dg = DEFAULT_GLASS;
  // The colours: a list of two to six. Glass saved in an earlier look (four named colours, or the first violet-and-blue)
  // moves to the new default; a custom set keeps its colours.
  const hexOr = (x: unknown) => (isHex(x) ? x.toLowerCase() : "");
  let glassColors = (Array.isArray(gIn.colors) ? gIn.colors : []).map(hexOr).filter(Boolean).slice(0, GLASS_COLOR_COUNT[1]);
  if (glassColors.length < GLASS_COLOR_COUNT[0]) {
    const [a, c, b] = [hexOr(gIn.colorA), hexOr(gIn.colorC), hexOr(gIn.colorB)];
    const earlier = (a === OLD_GLASS.colorA && b === OLD_GLASS.colorB) || (a === OLD_GEMINI.colorA && c === OLD_GEMINI.colorC);
    const own = [a, c, b, hexOr(gIn.colorD)].filter(Boolean);
    glassColors = earlier || own.length < GLASS_COLOR_COUNT[0] ? [...dg.colors] : own;
  }
  if (glassColors.join() === OLD_SIX.join()) glassColors = [...dg.colors]; // the default just before the mesh gradient
  // No white in the glass: pale colours (every part at least 205 of 255) are taken out; too few left means the default set.
  const notPale = glassColors.filter((c) => Math.min(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)) < 205);
  glassColors = notPale.length >= GLASS_COLOR_COUNT[0] ? notPale : [...dg.colors];
  merged.theme.glass = {
    colors: glassColors,
    shuffle: typeof gIn.shuffle === "boolean" ? gIn.shuffle : dg.shuffle,
    tint: Math.round(num(gIn.tint, 0, 0.7, dg.tint) * 100) / 100,
    blur: Math.round(num(gIn.blur, 0, 30, dg.blur)),
    spread: Math.round(num(gIn.spread, 0, 1, dg.spread) * 100) / 100,
    glow: Math.round(num(gIn.glow, 0, 0.8, dg.glow) * 100) / 100,
    effect: (GLASS_EFFECTS as unknown[]).includes(gIn.effect) ? (gIn.effect as GlassLook["effect"]) : dg.effect,
  };

  // Social links: a name and a real web address (https:// or http://), at most eight. Anything else is left out, so a
  // link on the site can never be something that runs code.
  const socialIn = isObj(src.site) && Array.isArray((src.site as Record<string, unknown>).social) ? ((src.site as Record<string, unknown>).social as unknown[]) : null;
  if (socialIn) {
    merged.site.social = socialIn.flatMap((it) => {
      if (!isObj(it)) return [];
      const label = str(it.label).trim().slice(0, 30);
      const href = str(it.href).trim().slice(0, 300);
      return label && /^https?:\/\/[^\s]+$/i.test(href) ? [{ label, href }] : [];
    }).slice(0, 8) as typeof merged.site.social;
  }

  // The menu's lamp colours: one real colour for each menu item.
  const tonesIn = isObj(src.theme) && isObj(src.theme.menuTones) ? src.theme.menuTones : {};
  merged.theme.menuTones = Object.fromEntries(Object.entries(DEFAULT_MENU_TONES).map(([id, d]) => [id, isHex(tonesIn[id]) ? (tonesIn[id] as string).toLowerCase() : d]));

  // Cards saved before “opens the breakdown viewer” existed: the one with the layers icon does.
  merged.home.process.cards = merged.home.process.cards.map((c) => {
    const old = c as { opensBreakdowns?: unknown; opens?: unknown; linkText?: unknown; icon?: string };
    const breakdowns = "Opens the Breakdowns page";
    const opens =
      typeof old.opens === "string" && CARD_LINK_VALUES.includes(old.opens)
        ? old.opens
        : old.opensBreakdowns === true
          ? breakdowns
          : (CARD_LINK_BY_ICON[old.icon ?? ""] ?? "Does nothing");
    // A card with no page address yet was saved before the inside pages existed: it now opens its own page.
    const firstTime = !(typeof (c as { slug?: unknown }).slug === "string" && (c as { slug?: string }).slug);
    const finalOpens = firstTime ? CARD_OPENS_OWN_PAGE : opens;
    return {
      ...c,
      // kept for older saved content: true when this card opens the Breakdowns page
      opensBreakdowns: finalOpens === breakdowns,
      opens: finalOpens,
      linkText: firstTime ? "" : typeof old.linkText === "string" ? old.linkText.trim().slice(0, 40) : "",
    };
  });
  // Each card's inside page: its own address (never two the same), its settings and its list of cards.
  const takenSlugs = new Set<string>();
  merged.home.process.cards = merged.home.process.cards.map((c) => ({ ...c, ...cleanExtra(c, str(c.title), takenSlugs) }));

  // Picture shapes and sizes: only the known words, so a stale or odd value can never reach the page.
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const SHAPES = ["round", "rounded", "square"] as const;
  const SIZES = ["small", "medium", "large"] as const;
  merged.home.founder.photoShape = oneOf(merged.home.founder.photoShape, SHAPES, "round");
  merged.home.founder.photoSize = oneOf(merged.home.founder.photoSize, SIZES, "medium");
  const f = merged.home.founder;
  f.photoZoom = num(f.photoZoom, ZOOM_MIN, ZOOM_MAX, 1);
  f.photoX = num(f.photoX, 0, 100, 50);
  f.photoY = num(f.photoY, 0, 100, 50);
  merged.home.clients.portraitShape = oneOf(merged.home.clients.portraitShape, SHAPES, "round");
  merged.home.clients.portraitSize = oneOf(merged.home.clients.portraitSize, SIZES, "large");
  merged.home.clients.logoSize = oneOf(merged.home.clients.logoSize, SIZES, "large");
  if (merged.home.founder.photo && !merged.home.founder.photo.startsWith("/images/")) merged.home.founder.photo = "";

  // Breakdowns: a title, and layers that are pictures from the library (a layer without one is left out).
  merged.breakdowns = (Array.isArray(src.breakdowns) ? src.breakdowns : []).slice(0, MAX_BREAKDOWNS).flatMap((raw): Breakdown[] => {
    if (!isObj(raw)) return [];
    const layers = (Array.isArray(raw.layers) ? raw.layers : []).slice(0, MAX_BREAKDOWN_LAYERS).flatMap((l) => {
      if (!isObj(l) || typeof l.image !== "string" || !l.image.startsWith("/images/")) return [];
      return [{ image: l.image, label: str(l.label).trim().slice(0, 60) }];
    });
    return [
          {
            title: str(raw.title).trim().slice(0, 80) || "Breakdown",
            note: str(raw.note).trim().slice(0, 140),
            description: str(raw.description).replace(/\r\n?/g, "\n").trim().slice(0, 1200),
            layers,
            spread: raw.spread === "tight" || raw.spread === "wide" ? raw.spread : "normal",
            turn: raw.turn === "angled" ? "angled" : "side",
            labels: raw.labels !== false,
            textPosition: raw.textPosition === "right" || raw.textPosition === "top" || raw.textPosition === "bottom" ? raw.textPosition : "left",
          },
        ];
  });

  // Each page's own look: real fonts, a real colour, a picture from the library, a sensible dimming.
  for (const k of ["home", "work", "breakdowns", "project", "notFound"] as const) {
    const look = merged.pages[k];
    for (const f of ["fontDisplay", "fontLabel", "fontBody"] as const) {
      if (look[f] && !fontById(look[f], merged.customFonts)) look[f] = "";
    }
    look.accent = isHex(look.accent) ? look.accent.toLowerCase() : "";
    if (!look.backdrop.startsWith("/images/")) look.backdrop = "";
    look.backdropDim = Math.min(0.95, Math.max(0, Number.isFinite(look.backdropDim) ? look.backdropDim : 0.55));
  }

  // The gallery layout: only the offered choices.
  const gl = merged.galleryLayout;
  if (!["Auto", "2", "3", "4"].includes(gl.columns)) gl.columns = def.galleryLayout.columns;
  if (!["Poster (tall)", "Square", "Landscape"].includes(gl.shape)) gl.shape = def.galleryLayout.shape;

  // Text styles: known fonts, bounded numbers, safe keys.
  const types: SiteContent["type"] = {};
  if (isObj(src.type)) {
    for (const [k, v] of Object.entries(src.type).slice(0, 400)) {
      if (!/^[\w.-]{1,80}$/.test(k)) continue;
      const st = cleanStyle(v, merged.customFonts);
      if (st) types[k] = st;
    }
  }
  merged.type = types;

  for (const role of ["display", "label", "body"] as const) {
    if (!fontById(merged.fonts[role], merged.customFonts)) merged.fonts[role] = def.fonts[role];
  }
  return merged;
}
