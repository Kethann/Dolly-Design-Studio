"use client";

import { TEXT_EFFECTS, type TextEffect } from "@/lib/content/text-effects";
import styles from "./content.module.css";

/** Static samples show the look without running five animations or canvases in every editor field. */
export function EffectChoices({ value, disabled, onChange }: { value: TextEffect; disabled: boolean; onChange: (effect: TextEffect) => void }) {
  return <div className={styles.effectChoices} role="radiogroup" aria-label="Text effect">
    {TEXT_EFFECTS.map((choice, index) => <button key={choice.id} type="button" role="radio"
      aria-label={choice.label} aria-checked={value === choice.id} disabled={disabled}
      data-effect-value={choice.id} tabIndex={value === choice.id ? 0 : -1} title={choice.hint}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onChange(choice.id)}
      onKeyDown={(event) => {
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? TEXT_EFFECTS.length - 1 : (index + direction + TEXT_EFFECTS.length) % TEXT_EFFECTS.length;
        onChange(TEXT_EFFECTS[next].id);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>
      <span aria-hidden="true" className={styles.effectSample} data-sample={choice.id}>Aa</span>
      <span>{choice.label}</span>
    </button>)}
  </div>;
}
