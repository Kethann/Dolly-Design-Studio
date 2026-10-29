import { Fragment, type ReactNode } from "react";
import { ParticleText } from "./ParticleText";

/** The marker the portal uses: [[word]] turns the word into the particle effect. */
export const FX_MARK = /\[\[(.+?)\]\]/g;

/**
 * Shows a piece of text with the particle effect on every word inside [[double brackets]]; the rest is plain text.
 * This is how a new place gets the effect: render its text with renderFx(), and mark the words in the portal.
 *
 *   <h2>{renderFx(copy.headline)}</h2>
 */
export function renderFx(text: string): ReactNode {
  if (!text.includes("[[")) return text;
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return parts.map((part, i) => (i % 2 === 1 ? <ParticleText key={i}>{part}</ParticleText> : <Fragment key={i}>{part}</Fragment>));
}

/** The text with the markers taken out (for the page title, search and anywhere plain words are needed). */
export const plainFx = (text: string) => text.replace(FX_MARK, "$1");
