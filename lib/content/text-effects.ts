export const TEXT_EFFECTS = [
  { id: "particles", label: "Dots", hint: "Small dots scatter gently near the pointer or on touch." },
  { id: "glow", label: "Soft glow", hint: "A soft glow on hover or touch, with no continuous animation." },
  { id: "sheen", label: "Light sweep", hint: "One gentle sweep of light on hover or touch." },
  { id: "outline", label: "Outline", hint: "Crisp outlined letters, without movement." },
  { id: "none", label: "None", hint: "Plain text. Your marked words stay ready for another effect." },
] as const;
export type TextEffect = typeof TEXT_EFFECTS[number]["id"];
export const PARTICLE_DEFAULTS = { particleSize: 1, particleScatter: 4, particleSpeed: 1, particleGlow: .4 };
export const PARTICLE_RANGES = { particleSize: [.5, 1.6], particleScatter: [0, 8], particleSpeed: [.5, 2], particleGlow: [0, 1] } as const;
export const PARTICLE_PRESETS = [
  { label: "Nano", options: { particleSize: .7, particleScatter: 2, particleSpeed: .8, particleGlow: .2 } },
  { label: "Soft", options: PARTICLE_DEFAULTS },
  { label: "Lively", options: { particleSize: 1.15, particleScatter: 6, particleSpeed: 1.2, particleGlow: .6 } },
] as const;
export interface TextEffectOptions {
  color?: string;
  particleColor?: string;
  particleSize?: number;
  particleScatter?: number;
  particleSpeed?: number;
  particleGlow?: number;
  glowColor?: string;
  glowStrength?: number;
  glowRadius?: number;
  glowMode?: "hover" | "always";
}

/** Only bounded numbers and six-digit colours may reach CSS or the particle renderer. */
export function cleanEffectOptions(input: unknown): TextEffectOptions {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const result: TextEffectOptions = {};
  for (const key of ["color", "glowColor", "particleColor"] as const) {
    if (typeof source[key] === "string" && /^#[0-9a-f]{6}$/i.test(source[key])) result[key] = source[key].toLowerCase();
  }
  for (const key of Object.keys(PARTICLE_RANGES) as (keyof typeof PARTICLE_RANGES)[]) {
    const value = source[key], [min, max] = PARTICLE_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
  }
  for (const [key, min, max] of [["glowStrength", 0, 1], ["glowRadius", 1, 32]] as const) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
  }
  if (source.glowMode === "hover" || source.glowMode === "always") result.glowMode = source.glowMode;
  return result;
}

export function effectStyle(input: TextEffectOptions): Record<string, string> {
  const options = cleanEffectOptions(input);
  return {
    ...(options.color ? { color: options.color } : {}),
    ...(options.glowColor ? { "--fx-glow-color": options.glowColor } : {}),
    ...(options.glowStrength !== undefined ? { "--fx-glow-opacity": `${options.glowStrength * 100}%` } : {}),
    ...(options.glowRadius !== undefined ? { "--fx-glow-radius": `${options.glowRadius}px` } : {}),
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
    if (["color", "glowColor", "glowMode", "particleColor"].includes(key)) options[key] = value;
    if (["glowStrength", "glowRadius", ...Object.keys(PARTICLE_RANGES)].includes(key) && value?.trim()) options[key] = Number(value);
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
