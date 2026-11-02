"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./portal.module.css";

/** Plain words for where a setting shows up. */
const SCOPE_WORDS = { Intro: "the opening animation", Page: "the page", "Intro & page": "the opening and the page" } as const;

export function Section({
  id,
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
          {title}
          {scope && <span className={styles.scope}>Changes {SCOPE_WORDS[scope]}</span>}
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
  editable = false,
  inputScale = 1,
  inputUnit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
  /** Opt-in exact entry; scale displays stored fractions as familiar percentages. */
  editable?: boolean;
  inputScale?: number;
  inputUnit?: string;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <label htmlFor={id} className={styles.controlLabel}>
          {label}
        </label>
        {editable ? <span className={styles.exactValue}>
          <input key={`${value}-${inputScale}`} type="number" aria-label={`${label} — exact value${inputUnit ? ` (${inputUnit})` : ""}`}
            title="Type a value, then press Enter or leave the field to apply"
            min={Number((min * inputScale).toFixed(6))} max={Number((max * inputScale).toFixed(6))}
            step={Number((step * inputScale).toFixed(6))} defaultValue={Number((value * inputScale).toFixed(6))}
            onBlur={event => {
              const raw = event.currentTarget.value.trim();
              if (raw === String(Number((value * inputScale).toFixed(6)))) return;
              const number = raw === "" ? NaN : Number(raw) / inputScale;
              const next = Number.isFinite(number) ? Number(Math.min(max, Math.max(min, min + Math.round((number - min) / step) * step)).toFixed(6)) : value;
              event.currentTarget.value = String(Number((next * inputScale).toFixed(6)));
              if (next !== value) onChange(next);
            }}
            onKeyDown={event => {
              if (event.key === "Escape") event.currentTarget.value = String(Number((value * inputScale).toFixed(6)));
              if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
            }} />
          {inputUnit && <span aria-hidden="true">{inputUnit}</span>}
        </span> : <output htmlFor={id} className={styles.controlValue}>
          {format(value)}
        </output>}
      </div>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p id={`${id}-hint`} className={styles.controlHint}>{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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
          aria-label={label}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-checked={checked}
          className={styles.switch}
          data-on={checked}
          onClick={() => onChange(!checked)}
        >
          <span className={styles.switchKnob} />
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className={styles.controlHint}>{hint}</p>}
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
  const id = useId();
  const selected = options.some(option => option.value === value) ? value : options[0]?.value;
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <span className={styles.controlLabel}>{label}</span>
      </div>
      <div className={styles.choice} role="radiogroup" aria-label={label} aria-describedby={hint ? `${id}-hint` : undefined}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
          const at = buttons.indexOf(event.target as HTMLButtonElement);
          if (at < 0 || !buttons.length) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
            : (at + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next].focus();
          onChange(options[next].value);
        }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            tabIndex={selected === o.value ? 0 : -1}
            className={styles.choiceOption}
            data-on={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p id={`${id}-hint`} className={styles.controlHint}>{hint}</p>}
    </div>
  );
}

/** A round dial for an angle: drag it, use the arrow keys, or pick a preset. */
export function Dial({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (deg: number) => void;
}) {
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
          aria-valuetext={`${Math.round(value)} degrees`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
          }}
          onKeyDown={(e) => {
            if (!["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const step = e.shiftKey ? 15 : 5;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange((value + step) % 360);
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange((value - step + 360) % 360);
            if (e.key === "Home") onChange(0);
            if (e.key === "End") onChange(359);
          }}
        >
          <span className={styles.dialHand} style={{ transform: `rotate(${value}deg)` }} />
        </div>
        <div className={styles.dialPresets}>
          {[0, 45, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              className={styles.dialPreset}
              data-on={Math.round(value) === deg}
              onClick={() => onChange(deg)}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>
      {hint && <p id={`${id}-hint`} className={styles.controlHint}>{hint}</p>}
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
export function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.control}>
      <div className={styles.controlRow}>
        <span className={styles.controlLabel}>{label}</span>
        <span className={styles.colorField}>
          <input
            type="color"
            aria-label={label}
            className={styles.swatch}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <HexInput value={value} label={`${label} code`} onChange={onChange} />
        </span>
      </div>
      {hint && <p className={styles.controlHint}>{hint}</p>}
    </div>
  );
}
