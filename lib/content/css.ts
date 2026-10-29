import { fontById, fontStack, DEFAULT_FONT_ROLES, type CustomFontLike } from "./fonts";
import { PAGE_KEYS } from "./page-key";
import { DEFAULT_GLASS, type GlassLook, type SiteContent, type TextStyle } from "./types";

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
  const mix = (hex: string, pct: number) => `color-mix(in srgb,${hex} ${Math.round(Math.min(100, Math.max(0, pct)))}%,transparent)`;
  const clear = g.effect === "Clear";
  const frosted = g.effect === "Frosted";
  const t = g.tint * (clear ? 0.35 : 1);
  const deg = `${g.angle}deg`;
  const rimA = frosted ? "rgba(255,255,255,0.55)" : g.colorA;
  const rimB = frosted ? "rgba(255,255,255,0.18)" : g.colorB;
  const glow = frosted || clear ? 0 : g.glow;
  return [
    `--glass-a:${g.colorA}`,
    `--glass-fill:linear-gradient(${deg},${mix(g.colorA, t * 100)},${mix(g.colorB, t * 100 * 0.42)} 55%,${mix(g.colorA, t * 100 * 0.7)}),${frosted ? "rgba(236,232,255,0.1)" : "rgba(16,10,44,0.4)"}`,
    `--glass-border:${frosted ? "rgba(255,255,255,0.3)" : mix(g.colorA, clear ? 20 : 40)}`,
    `--glass-rim:linear-gradient(${deg},${rimA},rgba(255,255,255,0.35) 38%,${rimB} 70%,${rimA})`,
    `--glass-rim-opacity:${clear ? 0.4 : frosted ? 0.7 : 0.85}`,
    `--glass-glow:0 0 26px ${mix(g.colorA, glow * 100)}`,
    `--glass-blur:${g.blur}px`,
    `--glass-sheen:radial-gradient(120% 85% at 0% 0%,${mix(g.colorA, clear ? 12 : 38)},transparent 62%),radial-gradient(90% 70% at 100% 100%,${mix(g.colorB, clear ? 8 : 26)},transparent 70%)`,
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
