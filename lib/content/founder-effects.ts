import type { SiteContent } from "./types";
import { applyTextEffect, plainFx, selectedEffect, selectedEffectOptions, type TextEffect, type TextEffectOptions } from "./text-effects";

export const FOUNDER_CARD_TEXT_PATHS = ["site.founder.name", "site.founder.role", "home.founder.cardNote"] as const;
export type FounderCardTextPath = typeof FOUNDER_CARD_TEXT_PATHS[number];

export function isFounderCardText(path: string): path is FounderCardTextPath {
  return FOUNDER_CARD_TEXT_PATHS.includes(path as FounderCardTextPath);
}

/** Keep the three plain values distinct while giving their entire visible text one chosen effect. */
export function setSharedFounderEffect(content: SiteContent, path: FounderCardTextPath, value: string, effect: TextEffect, options: TextEffectOptions): SiteContent {
  const whole = (text: string) => {
    const clean = plainFx(text);
    return clean.trim() ? applyTextEffect(`[[${clean}]]`, effect, options) : "";
  };
  return {
    ...content,
    site: {
      ...content.site,
      founder: {
        name: whole(path === "site.founder.name" ? value : content.site.founder.name),
        role: whole(path === "site.founder.role" ? value : content.site.founder.role),
      },
    },
    home: {
      ...content.home,
      founder: { ...content.home.founder, cardNote: whole(path === "home.founder.cardNote" ? value : content.home.founder.cardNote) },
    },
  };
}

/** Enabling the checkbox adopts the first existing card effect; otherwise it starts as plain text. */
export function enableSharedFounderEffect(content: SiteContent): SiteContent {
  const values = [content.site.founder.name, content.site.founder.role, content.home.founder.cardNote];
  const styled = values.find(value => /\[\[[^\[\]]+?\]\]/.test(value));
  const effect = styled ? selectedEffect(styled) : "none";
  const options = styled ? selectedEffectOptions(styled) : {};
  const next = setSharedFounderEffect(content, "site.founder.name", plainFx(content.site.founder.name), effect, options);
  return { ...next, home: { ...next.home, founder: { ...next.home.founder, cardSharedEffect: true } } };
}
