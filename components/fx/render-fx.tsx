import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ParticleText } from "./ParticleText";
import { FilterText } from "./FilterText";
import { decodeEffect, effectStyle } from "@/lib/content/text-effects";
import styles from "./TextEffect.module.css";

/** Legacy [[word]] marks keep the original dots; explicit choices travel with the marked text. */
export { FX_MARK, plainFx } from "@/lib/content/text-effects";

/**
 * Shows the chosen effect on text inside [[double brackets]]; the rest is plain text.
 * This is how a new place gets the effect: render its text with renderFx(), and mark the words in the portal.
 *
 *   <h2>{renderFx(copy.headline)}</h2>
 */
/** Whole characters, so a letter with combining marks (Telugu, for one) is never pulled apart. */
function characters(word: string): string[] {
  return typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word), (part) => part.segment)
    : Array.from(word);
}

export function renderFx(text: string): ReactNode {
  if (!text.includes("[[")) return text;
  const parts = text.split(/\[\[([^\[\]]+?)\]\]/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const { text: word, effect, options } = decodeEffect(part);
    const style = effectStyle(options) as CSSProperties;
    // One canvas per word, so a marked phrase still wraps on a narrow screen.
    if (effect === "particles") return <Fragment key={i}>{word.split(/(\s+)/).map((piece, j) => (piece.trim() ? <ParticleText key={j} color={options.color} options={options}>{piece}</ParticleText> : piece))}</Fragment>;
    if (effect === "liquify" || effect === "neon" || effect === "bubble") return <FilterText key={i} effect={effect} options={options} style={style}>{word}</FilterText>;
    if (effect === "wave") {
      let index = 0;
      return <span key={i} style={style} className={`${styles.word} ${styles.wave}`} data-text-effect={effect} aria-label={word}>
        {word.split(/(\s+)/).map((piece, j) => (piece.trim()
          ? <span key={j} aria-hidden="true" className={styles.waveWord}>{characters(piece).map((letter, k) => <span key={k} className={styles.letter} style={{ "--i": index++ } as CSSProperties}>{letter}</span>)}</span>
          : piece))}
      </span>;
    }
    if (effect === "none") return options.color ? <span key={i} className={styles.word} style={style}>{word}</span> : <Fragment key={i}>{word}</Fragment>;
    return <span key={i} style={style} className={`${styles.word} ${styles[effect]}`} data-text-effect={effect} data-fx-trigger={options.glowMode}>
      {word}
      {effect === "sheen" && <span aria-hidden="true" className={styles.shine}>{word}</span>}
      {effect === "slate" && <span aria-hidden="true" className={styles.clapper} />}
      {effect === "split" && <><span aria-hidden="true" className={styles.splitA}>{word}</span><span aria-hidden="true" className={styles.splitB}>{word}</span></>}
    </span>;
  });
}
