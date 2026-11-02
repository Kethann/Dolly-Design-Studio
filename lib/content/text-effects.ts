export const TEXT_EFFECTS = [
  { id: "particles", label: "Dots", hint: "Small dots scatter gently near the pointer or on touch." },
  { id: "glow", label: "Soft glow", hint: "A soft glow on hover or touch, with no continuous animation." },
  { id: "sheen", label: "Light sweep", hint: "One gentle sweep of light on hover or touch." },
  { id: "outline", label: "Outline", hint: "Crisp outlined letters that can fill in on hover." },
  { id: "slate", label: "Film slate", hint: "A clapperboard snaps shut over the word on hover or touch." },
  { id: "liquify", label: "Liquify", hint: "The letters melt and ripple like liquid, then settle back." },
  { id: "neon", label: "Neon melt", hint: "Bright melting neon colours with a soft glow." },
  { id: "bubble", label: "Glass bubble", hint: "Rounded, glossy soap-bubble glass letters." },
  { id: "flow", label: "Colour flow", hint: "A band of colours flows through the letters." },
  { id: "split", label: "Colour split", hint: "The letters split into two colours, like a film-print misprint." },
  { id: "wave", label: "Letter wave", hint: "The letters rise one after another." },
  { id: "none", label: "None", hint: "Plain text. Your marked words stay ready for another effect." },
] as const;
export type TextEffect = typeof TEXT_EFFECTS[number]["id"];
export const PARTICLE_DEFAULTS = { particleSize: 1, particleScatter: 16, particleSpeed: 1, particleGlow: .4 };
export const PARTICLE_RANGES = { particleSize: [.5, 1.6], particleScatter: [0, 40], particleSpeed: [.5, 2], particleGlow: [0, 1] } as const;
export const PARTICLE_PRESETS = [
  { label: "Nano", options: { particleSize: .7, particleScatter: 8, particleSpeed: .8, particleGlow: .2 } },
  { label: "Soft", options: PARTICLE_DEFAULTS },
  { label: "Lively", options: { particleSize: 1.15, particleScatter: 28, particleSpeed: 1.2, particleGlow: .6 } },
] as const;
export interface TextEffectOptions {
  color?: string;
  /** Optional text paint used only while a glow word is hovered or touched. */
  hoverColor?: string;
  particleColor?: string;
  particleSize?: number;
  particleScatter?: number;
  particleSpeed?: number;
  particleGlow?: number;
  glowColor?: string;
  glowStrength?: number;
  glowRadius?: number;
  glowMode?: "hover" | "always";
  /** Up to three colours, an overall strength, a size and a speed; each effect names them in EFFECT_CONTROLS. */
  colorA?: string;
  colorB?: string;
  colorC?: string;
  fxAmount?: number;
  fxSize?: number;
  fxSpeed?: number;
}
export const FX_RANGES = { fxAmount: [0, 1], fxSize: [.25, 3], fxSpeed: [.25, 3] } as const;
type FxColour = "colorA" | "colorB" | "colorC";
type FxSlider = keyof typeof FX_RANGES;
/** What each effect can change, with the values it uses until the user changes them. The portal builds its controls from this. */
export const EFFECT_CONTROLS: Partial<Record<TextEffect, { colours: { key: FxColour; label: string; value: string }[]; sliders: { key: FxSlider; label: string; value: number; hint?: string }[]; always?: boolean }>> = {
  sheen: { colours: [{ key: "colorA", label: "Light colour", value: "#ffffff" }], sliders: [{ key: "fxSpeed", label: "Speed", value: 1 }], always: true },
  outline: { colours: [{ key: "colorA", label: "Fill on hover", value: "#fff195" }], sliders: [{ key: "fxAmount", label: "Line weight", value: .4 }] },
  slate: { colours: [{ key: "colorA", label: "Board colour", value: "#0d0d10" }, { key: "colorB", label: "Stripe colour", value: "#f6f1e4" }, { key: "colorC", label: "Text on the board", value: "#f6f1e4" }],
    sliders: [{ key: "fxAmount", label: "How far it opens", value: .6 }, { key: "fxSpeed", label: "Speed", value: 1 }], always: true },
  liquify: { colours: [], sliders: [{ key: "fxAmount", label: "Melt strength", value: .5 }, { key: "fxSize", label: "Ripple size", value: 1, hint: "Small is a fine shimmer; large is slow, heavy waves." }, { key: "fxSpeed", label: "Flow speed", value: 1 }], always: true },
  neon: { colours: [{ key: "colorA", label: "Colour 1", value: "#ff4fb4" }, { key: "colorB", label: "Colour 2", value: "#ffe14d" }, { key: "colorC", label: "Colour 3", value: "#35d6ff" }],
    sliders: [{ key: "fxAmount", label: "Melt strength", value: .35 }, { key: "fxSize", label: "Glow size", value: 1 }, { key: "fxSpeed", label: "Flow speed", value: 1 }], always: true },
  bubble: { colours: [{ key: "colorA", label: "Colour 1", value: "#d7c2ff" }, { key: "colorB", label: "Colour 2", value: "#a9f0ff" }, { key: "colorC", label: "Colour 3", value: "#ffc6ec" }],
    sliders: [{ key: "fxSize", label: "Roundness", value: 1, hint: "Higher makes fatter, softer letters from a regular font." }, { key: "fxAmount", label: "Gloss", value: .7 }], always: true },
  flow: { colours: [{ key: "colorA", label: "Colour 1", value: "#ffd36a" }, { key: "colorB", label: "Colour 2", value: "#ff5fa2" }, { key: "colorC", label: "Colour 3", value: "#6ad7ff" }], sliders: [{ key: "fxSpeed", label: "Speed", value: 1 }], always: true },
  split: { colours: [{ key: "colorA", label: "Colour 1", value: "#ff2f6e" }, { key: "colorB", label: "Colour 2", value: "#2fe6ff" }], sliders: [{ key: "fxAmount", label: "Split distance", value: .5 }, { key: "fxSpeed", label: "Speed", value: 1 }], always: true },
  wave: { colours: [{ key: "colorA", label: "Colour while moving", value: "#ffd36a" }], sliders: [{ key: "fxAmount", label: "Height", value: .5 }, { key: "fxSpeed", label: "Speed", value: 1 }] },
};

/** Only bounded numbers and six-digit colours may reach CSS or the particle renderer. */
export function cleanEffectOptions(input: unknown): TextEffectOptions {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const result: TextEffectOptions = {};
  for (const key of ["color", "hoverColor", "glowColor", "particleColor", "colorA", "colorB", "colorC"] as const) {
    if (typeof source[key] === "string" && /^#[0-9a-f]{6}$/i.test(source[key])) result[key] = source[key].toLowerCase();
  }
  for (const key of Object.keys(PARTICLE_RANGES) as (keyof typeof PARTICLE_RANGES)[]) {
    const value = source[key], [min, max] = PARTICLE_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
  }
  for (const [key, min, max] of [["glowStrength", 0, 1], ["glowRadius", 1, 32], ["fxAmount", ...FX_RANGES.fxAmount], ["fxSize", ...FX_RANGES.fxSize], ["fxSpeed", ...FX_RANGES.fxSpeed]] as const) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
  }
  if (source.glowMode === "hover" || source.glowMode === "always") result.glowMode = source.glowMode;
  return result;
}

export function effectStyle(input: TextEffectOptions): Record<string, string> {
  const options = cleanEffectOptions(input);
  return {
    ...(options.color ? { "--fx-color": options.color } : {}),
    ...(options.hoverColor ? { "--fx-hover-color": options.hoverColor } : {}),
    ...(options.glowColor ? { "--fx-glow-color": options.glowColor } : {}),
    ...(options.glowStrength !== undefined ? { "--fx-glow-opacity": `${options.glowStrength * 100}%` } : {}),
    ...(options.glowRadius !== undefined ? { "--fx-glow-radius": `${options.glowRadius}px` } : {}),
    ...(options.colorA ? { "--fx-a": options.colorA } : {}),
    ...(options.colorB ? { "--fx-b": options.colorB } : {}),
    ...(options.colorC ? { "--fx-c": options.colorC } : {}),
    ...(options.fxAmount !== undefined ? { "--fx-amount": String(options.fxAmount) } : {}),
    ...(options.fxSize !== undefined ? { "--fx-size": String(options.fxSize) } : {}),
    ...(options.fxSpeed !== undefined ? { "--fx-speed": String(options.fxSpeed) } : {}),
  };
}
export const FX_MARK = /\[\[([^\[\]]+?)\]\]/g;
export function decodeEffect(mark: string): { text: string; effect: TextEffect; options: TextEffectOptions } {
  const separator = mark.indexOf("|");
  const [effect, ...settings] = mark.slice(0, separator).split(";");
  if (separator <= 0 || !TEXT_EFFECTS.some((choice) => choice.id === effect)) return { text: mark, effect: "particles", options: {} };
  const options: Record<string, unknown> = {};
  for (const setting of settings) {
    const [key, value] = setting.split("=");
    if (["color", "hoverColor", "glowColor", "glowMode", "particleColor", "colorA", "colorB", "colorC"].includes(key)) options[key] = value;
    if (["glowStrength", "glowRadius", ...Object.keys(FX_RANGES), ...Object.keys(PARTICLE_RANGES)].includes(key) && value?.trim()) options[key] = Number(value);
  }
  return { text: mark.slice(separator + 1), effect: effect as TextEffect, options: cleanEffectOptions(options) };
}
/** Settings travel with their text through saves, copies and card reordering. The editor shows ordinary [[words]]. */
export const editableFx = (text: string) => text.replace(FX_MARK, (_, mark: string) => `[[${decodeEffect(mark).text}]]`);
export const plainFx = (text: string) => text.replace(FX_MARK, (_, mark: string) => decodeEffect(mark).text);
export const selectedEffect = (text: string): TextEffect => {
  const first = new RegExp(FX_MARK).exec(text);
  return first ? decodeEffect(first[1]).effect : "particles";
};
export const selectedEffectOptions = (text: string): TextEffectOptions => {
  const first = new RegExp(FX_MARK).exec(text);
  return first ? decodeEffect(first[1]).options : {};
};
export const applyTextEffect = (text: string, effect: TextEffect, options: TextEffectOptions = selectedEffectOptions(text)) => {
  const settings = Object.entries(cleanEffectOptions(options)).map(([key, value]) => `;${key}=${value}`).join("");
  const prefix = effect === "particles" && !settings ? "" : `${effect}${settings}|`;
  return editableFx(text).replace(FX_MARK, (_, word: string) => `[[${prefix}${word}]]`);
};

/** Mark a selection or the final word; never create nested markers or swallow punctuation. */
export function markEffectWords(text: string, start = 0, end = 0): string {
  const selection = text.slice(start, end);
  if (selection.trim()) {
    for (const match of text.matchAll(new RegExp(FX_MARK))) {
      if (start < match.index! + match[0].length && end > match.index!) return text;
    }
    if (/\[\[|\]\]/.test(selection)) return text;
    const left = start + selection.length - selection.trimStart().length;
    return text.slice(0, left) + `[[${selection.trim()}]]` + text.slice(left + selection.trim().length);
  }
  if (new RegExp(FX_MARK).test(text)) return text;
  return text.replace(/([^\s.,!?:;]+)([\s.,!?:;]*)$/, "[[$1]]$2");
}
