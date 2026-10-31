import { plainFx } from "./text-effects";

/** Existing cards keep their separate suffix; an explicitly typed decoration takes precedence. */
export function statText(value: number | string, suffix = ""): string {
  const text = String(value);
  if (!text.trim()) return "";
  const plain = plainFx(text).trim();
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(plain) ? text + suffix : text;
}

/** Only simple numbers count up. Marked/custom text uses the existing heading-effect renderer. */
export function statCounter(text: string) {
  const match = /^([+-]?)(\d+(?:\.\d+)?)([+-]?)$/.exec(text);
  if (!match) return null;
  const target = Number(match[1] + match[2]);
  const decimals = match[2].split(".")[1]?.length ?? 0;
  if (!Number.isFinite(target) || Math.abs(target) > Number.MAX_SAFE_INTEGER || decimals > 6) return null;
  return { target, decimals, sign: match[1], suffix: match[3] };
}
