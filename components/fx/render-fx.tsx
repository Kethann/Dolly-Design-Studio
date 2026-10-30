import { Fragment, type ReactNode } from "react";
import { ParticleText } from "./ParticleText";
import { decodeEffect } from "@/lib/content/text-effects";
import styles from "./TextEffect.module.css";

/** Legacy [[word]] marks keep the original dots; explicit choices travel with the marked text. */
export { FX_MARK, plainFx } from "@/lib/content/text-effects";

/**
 * Shows the chosen effect on text inside [[double brackets]]; the rest is plain text.
 * This is how a new place gets the effect: render its text with renderFx(), and mark the words in the portal.
 *
 *   <h2>{renderFx(copy.headline)}</h2>
 */
export function renderFx(text: string): ReactNode {
  if (!text.includes("[[")) return text;
  const parts = text.split(/\[\[([^\[\]]+?)\]\]/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const { text: word, effect } = decodeEffect(part);
    if (effect === "particles") return <ParticleText key={i}>{word}</ParticleText>;
    if (effect === "none") return <Fragment key={i}>{word}</Fragment>;
    return <span key={i} className={`${styles.word} ${styles[effect]}`} data-text-effect={effect}>
      {word}{effect === "sheen" && <span aria-hidden="true" className={styles.shine}>{word}</span>}
    </span>;
  });
}
