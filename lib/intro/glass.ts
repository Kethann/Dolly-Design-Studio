import type { IntroSettings } from "./settings";

/** The glass tint as a CSS colour (its colour at its opacity). */
export function glassFill({ glassColor, glassOpacity }: Pick<IntroSettings, "glassColor" | "glassOpacity">) {
  const n = parseInt(glassColor.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${glassOpacity})`;
}
