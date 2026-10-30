export const TEXT_EFFECTS = [
  { id: "particles", label: "Dots", hint: "Small dots scatter gently near the pointer or on touch." },
  { id: "glow", label: "Soft glow", hint: "A soft glow on hover or touch, with no continuous animation." },
  { id: "sheen", label: "Light sweep", hint: "One gentle sweep of light on hover or touch." },
  { id: "outline", label: "Outline", hint: "Crisp outlined letters, without movement." },
  { id: "none", label: "None", hint: "Plain text. Your marked words stay ready for another effect." },
] as const;
export type TextEffect = typeof TEXT_EFFECTS[number]["id"];
export const FX_MARK = /\[\[([^\[\]]+?)\]\]/g;
export function decodeEffect(mark: string): { text: string; effect: TextEffect } {
  const separator = mark.indexOf("|");
  const effect = mark.slice(0, separator);
  return separator > 0 && TEXT_EFFECTS.some((choice) => choice.id === effect)
    ? { text: mark.slice(separator + 1), effect: effect as TextEffect }
    : { text: mark, effect: "particles" };
}
/** Settings travel with their text through saves, copies and card reordering. The editor shows ordinary [[words]]. */
export const editableFx = (text: string) => text.replace(FX_MARK, (_, mark: string) => `[[${decodeEffect(mark).text}]]`);
export const plainFx = (text: string) => text.replace(FX_MARK, (_, mark: string) => decodeEffect(mark).text);
export const selectedEffect = (text: string): TextEffect => {
  const first = new RegExp(FX_MARK).exec(text);
  return first ? decodeEffect(first[1]).effect : "particles";
};
export const applyTextEffect = (text: string, effect: TextEffect) => editableFx(text).replace(FX_MARK, (_, word: string) => `[[${effect === "particles" ? "" : `${effect}|`}${word}]]`);

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
