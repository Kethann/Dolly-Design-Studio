import { fontById, fontStack, DEFAULT_FONT_ROLES, type CustomFontLike } from "./fonts";
import { PAGE_KEYS } from "./page-key";
import { DEFAULT_GLASS, DEFAULT_MENU_TONES, type GlassLook, type SiteContent, type TextStyle } from "./types";

const FORMAT: Record<string, string> = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };

/** @font-face rules for the fonts the creator uploaded (they only download once something uses them). */
export function fontFaceCss(custom: CustomFontLike[]): string {
  return custom
    .filter((f) => /^c-[a-z0-9-]+$/.test(f.id) && /^\/fonts\/uploads\/[\w.-]+\.(ttf|otf|woff2?)$/i.test(f.url))
    .map((f) => {
      const ext = f.url.split(".").pop()!.toLowerCase();
      return `@font-face{font-family:"${f.id}";src:url("${f.url}") format("${FORMAT[ext]}");font-display:swap}`;
    })
    .join("\n");
}

/** The CSS variables that style the glass (cards, menu strip) from the creator's glass settings. */
export function glassVars(g: GlassLook): string[] {
  const clear = g.effect === "Clear";
  const frosted = g.effect === "Frosted";
  // Always six slots: a shorter list repeats round, and Frosted is all pale whites.
  const pale = ["#ffffff", "#ece8ff", "#d9d4ff", "#f6f2ff", "#f3f0ff", "#e4deff"];
  const own = g.colors.length ? g.colors : DEFAULT_GLASS.colors;
  const six = Array.from({ length: 6 }, (_, i) => (frosted ? pale[i] : own[i % own.length]));
  // The colour under the cursor goes first colour, middle colour, last colour as the cursor crosses the glass (the
  // mixing itself is in globals.css, because it follows the pointer with --mt).
  return [
    ...six.map((c, i) => `--glass-${i + 1}:${c}`),
    // How strong the colour is under the cursor (Tint), how wide the lit area is (Spread), and the glow around the glass.
    `--glass-alpha:${(Math.min(1, g.tint / 0.7) * (clear ? 0.45 : frosted ? 0.6 : 1)).toFixed(2)}`,
    `--glass-radius:${(10 + g.spread * 40).toFixed(1)}%`,
    `--glass-glow-k:${Math.round(g.glow * 100 * (clear ? 0 : frosted ? 0.5 : 1))}`,
    `--glass-glow-r:${Math.round(14 + (g.glow / 0.8) * 36)}px`,
    `--glass-rim-opacity:${clear ? 0.5 : frosted ? 0.75 : 0.95}`,
    `--glass-blur:${g.blur}px`,
  ];
}

const THEME_DEFAULT = { accent: "#e8b04b", accentBright: "#fff195", text: "#f4ede1" };

function rule(style: TextStyle, custom: CustomFontLike[]): string {
  const out: string[] = [];
  const font = fontById(style.font, custom);
  if (font) out.push(`font-family:${fontStack(font)}`);
  if (style.size) {
    // Full size on large screens, easing down to 60% on a phone.
    out.push(`font-size:clamp(${Math.round(style.size * 0.6)}px,${(style.size / 14.4).toFixed(2)}vw,${style.size}px)`);
  }
  if (style.weight) out.push(`font-weight:${style.weight}`);
  if (style.italic) out.push("font-style:italic");
  if (style.color) out.push(`color:${style.color}`);
  if (style.align) out.push(`text-align:${style.align}`);
  if (style.lineHeight) out.push(`line-height:${style.lineHeight}`);
  if (style.tracking !== undefined) out.push(`letter-spacing:${(style.tracking / 100).toFixed(2)}em`);
  return out.join(";");
}

/** The stylesheet for the creator's global fonts and per-text styles. Empty when nothing was changed. */
export function contentCss(c: Pick<SiteContent, "type" | "fonts" | "customFonts" | "theme" | "pages">): string {
  const parts: string[] = [];
  const faces = fontFaceCss(c.customFonts);
  if (faces) parts.push(faces);
  const roots: string[] = [];
  for (const role of ["display", "label", "body"] as const) {
    const id = c.fonts[role];
    const f = fontById(id, c.customFonts);
    if (f && id !== DEFAULT_FONT_ROLES[role]) roots.push(`--font-${role}:${fontStack(f)}`);
  }
  if (c.theme.accent !== THEME_DEFAULT.accent) roots.push(`--gold:${c.theme.accent}`);
  if (c.theme.accentBright !== THEME_DEFAULT.accentBright) roots.push(`--gold-bright:${c.theme.accentBright}`);
  if (c.theme.text !== THEME_DEFAULT.text) roots.push(`--ivory:${c.theme.text}`);
  const g = c.theme.glass;
  if (g && JSON.stringify(g) !== JSON.stringify(DEFAULT_GLASS)) roots.push(...glassVars(g));
  // The menu's lamp colours, where the portal changed them.
  for (const [id, hex] of Object.entries(c.theme.menuTones ?? {})) if (/^[a-z]+$/.test(id) && hex !== DEFAULT_MENU_TONES[id]) roots.push(`--tone-${id}:${hex}`);
  if (roots.length) parts.push(`:root{${roots.join(";")}}`);
  // A page's own fonts and accent apply to that page's content (the menu and footer keep the site's).
  for (const key of PAGE_KEYS) {
    const look = c.pages[key];
    const decl: string[] = [];
    (["display", "label", "body"] as const).forEach((role) => {
      const id = look[role === "display" ? "fontDisplay" : role === "label" ? "fontLabel" : "fontBody"];
      const f = id ? fontById(id, c.customFonts) : undefined;
      if (f) decl.push(`--font-${role}:${fontStack(f)}`);
    });
    if (look.accent) decl.push(`--gold:${look.accent}`, `--gold-bright:color-mix(in srgb,${look.accent} 55%,#ffffff)`);
    if (decl.length) parts.push(`main[data-page="${key}"]{${decl.join(";")}}`);
  }
  for (const [path, style] of Object.entries(c.type)) {
    if (!/^[\w.-]+$/.test(path)) continue;
    const body = rule(style, c.customFonts);
    if (body) parts.push(`html [data-t="${path}"]{${body}}`);
  }
  return parts.join("\n");
}
