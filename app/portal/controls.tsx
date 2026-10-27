"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./portal.module.css";

export function Section({
  id,
  tag,
  scope,
  title,
  hint,
  children,
}: {
  id?: string;
  tag?: string;
  /** Where the settings take effect: the intro, the page after it, or both. */
  scope?: "Intro" | "Page" | "Intro & page";
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
          {scope && <span className={styles.scope}>Affects: {scope}</span>}
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

/** A row of mutually exclusive options (like a segmented switch). */
export function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <span className={styles.controlLabel}>{label}</span>
      </div>
      <div className={styles.choice} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={styles.choiceOption}
            data-on={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className={styles.controlHint}>{hint}</p>}
    </div>
  );
}

/** A round dial for an angle: drag it, use the arrow keys, or pick a preset. */
export function Dial({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (deg: number) => void }) {
  const id = useId();
  function fromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const deg = (Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
    onChange(deg);
  }
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <span className={styles.controlLabel} id={id}>
          {label}
        </span>
        <output className={styles.controlValue}>{Math.round(value)}°</output>
      </div>
      <div className={styles.dialRow}>
        <div
          className={styles.dial}
          role="slider"
          tabIndex={0}
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(value)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 15 : 5;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange((value + step) % 360);
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange((value - step + 360) % 360);
          }}
        >
          <span className={styles.dialHand} style={{ transform: `rotate(${value}deg)` }} />
        </div>
        <div className={styles.dialPresets}>
          {[0, 45, 90, 180, 270].map((deg) => (
            <button key={deg} type="button" className={styles.dialPreset} data-on={Math.round(value) === deg} onClick={() => onChange(deg)}>
              {deg}°
            </button>
          ))}
        </div>
      </div>
      {hint && <p className={styles.controlHint}>{hint}</p>}
    </div>
  );
}

/** A #rrggbb text box that only commits valid colour codes. */
export function HexInput({ value, label, onChange }: { value: string; label: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : value;
  return (
    <input
      type="text"
      aria-label={label}
      className={styles.hex}
      value={shown}
      spellCheck={false}
      maxLength={7}
      onFocus={() => {
        setText(value);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const next = e.target.value.trim();
        setText(next);
        const hex = next.startsWith("#") ? next : `#${next}`;
        if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase());
      }}
    />
  );
}

/** A colour picker with its hex code beside it. */
export function ColorRow({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <span className={styles.controlLabel}>{label}</span>
        <span className={styles.colorField}>
          <input type="color" aria-label={label} className={styles.swatch} value={value} onChange={(e) => onChange(e.target.value)} />
          <HexInput value={value} label={`${label} code`} onChange={onChange} />
        </span>
      </div>
      {hint && <p className={styles.controlHint}>{hint}</p>}
    </div>
  );
}
