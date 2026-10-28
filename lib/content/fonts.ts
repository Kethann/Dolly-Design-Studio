/** The typefaces the creator can pick from. `var` is the CSS variable next/font defines in app/layout.tsx. */
export interface FontChoice {
  id: string;
  label: string;
  var: string;
  fallback: string;
  /** Uploaded fonts are loaded from here with an @font-face rule; built-in ones come from next/font. */
  url?: string;
}

export const FONTS: FontChoice[] = [
  { id: "lemon-bold", label: "Lemon Milk Bold — headings", var: "--font-lemon-bold", fallback: "Georgia, serif" },
  { id: "lemon-light", label: "Lemon Milk Light — text", var: "--font-lemon-light", fallback: "Inter, sans-serif" },
  { id: "lemon-italic", label: "Lemon Milk Italic — subheadings", var: "--font-lemon-italic", fallback: "Inter, sans-serif" },
  { id: "bodoni", label: "Bodoni Moda — classic serif", var: "--font-bodoni", fallback: "Georgia, serif" },
  { id: "playfair", label: "Playfair Display — editorial serif", var: "--font-playfair", fallback: "Georgia, serif" },
  { id: "cormorant", label: "Cormorant Garamond — fine serif", var: "--font-cormorant", fallback: "Georgia, serif" },
  { id: "syne", label: "Syne — bold geometric", var: "--font-syne", fallback: "Inter, sans-serif" },
  { id: "space", label: "Space Grotesk — modern sans", var: "--font-space", fallback: "Inter, sans-serif" },
  { id: "oswald", label: "Oswald — tall condensed", var: "--font-oswald", fallback: "Impact, sans-serif" },
  { id: "inter", label: "Inter — clean sans", var: "--font-inter", fallback: '"Helvetica Neue", sans-serif' },
  { id: "dmsans", label: "DM Sans — friendly sans", var: "--font-dmsans", fallback: "Inter, sans-serif" },
];

export interface CustomFontLike {
  id: string;
  label: string;
  url: string;
}

/** The built-in fonts followed by the ones the creator uploaded. */
export const allFonts = (custom: CustomFontLike[] = []): FontChoice[] => [
  ...FONTS,
  ...custom.map((c) => ({ id: c.id, label: `${c.label} — your font`, var: "", fallback: "Georgia, serif", url: c.url })),
];

export const fontById = (id: string | undefined, custom: CustomFontLike[] = []) => allFonts(custom).find((f) => f.id === id);

export const fontStack = (f: FontChoice) => (f.url ? `"${f.id}", ${f.fallback}` : `var(${f.var}), ${f.fallback}`);

/** Where the three global font roles start out (they match globals.css). */
export const DEFAULT_FONT_ROLES = { display: "lemon-bold", label: "lemon-italic", body: "lemon-light" } as const;
