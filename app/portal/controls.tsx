"use client";

import { useId, type ReactNode } from "react";
import styles from "./portal.module.css";

export function Section({
  id,
  tag,
  title,
  hint,
  children,
}: {
  id?: string;
  tag?: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>
          {tag && <span className={styles.sectionTag}>{tag}</span>}
          {title}
        </h2>
        {hint && <p className={styles.sectionHint}>{hint}</p>}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <label htmlFor={id} className={styles.controlLabel}>
          {label}
        </label>
        <output htmlFor={id} className={styles.controlValue}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className={styles.controlHint}>{hint}</p>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <label htmlFor={id} className={styles.controlLabel}>
          {label}
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          className={styles.switch}
          data-on={checked}
          onClick={() => onChange(!checked)}
        >
          <span className={styles.switchKnob} />
        </button>
      </div>
      {hint && <p className={styles.controlHint}>{hint}</p>}
    </div>
  );
}

export const percent = (v: number) => `${Math.round(v * 100)}%`;
