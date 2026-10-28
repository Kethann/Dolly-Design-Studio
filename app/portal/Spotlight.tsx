"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Glyph } from "./mac";
import styles from "./mac.module.css";

export interface SpotEntry {
  /** What is shown. */
  label: string;
  /** Smaller line under it (where it lives). */
  sub: string;
  glyph: string;
  /** Extra words that should also find it. */
  keywords: string;
  /** Where it goes: a window, and optionally one section of it. */
  tab: string;
  section?: string;
}

/**
 * Search for any setting: type a word (“password”, “font”, “logo”, “cards”…) and jump straight to the window — and
 * the section inside it — where it lives. Arrow keys and Enter work; Escape closes.
 */
export function Spotlight({ entries, onPick, onClose }: { entries: SpotEntry[]; onPick: (e: SpotEntry) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return entries.slice(0, 40);
    return entries
      .map((e) => {
        const hay = `${e.label} ${e.sub} ${e.keywords}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        // Title matches first, then where it lives, then the fields inside.
        const score = words.reduce((n, w) => n + (e.label.toLowerCase().includes(w) ? 3 : e.sub.toLowerCase().includes(w) ? 2 : 1), 0);
        return { e, score };
      })
      .filter((r): r is { e: SpotEntry; score: number } => !!r)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((r) => r.e);
  }, [q, entries]);

  const current = Math.min(index, Math.max(0, results.length - 1));
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <div className={styles.spotBackdrop} onPointerDown={onClose}>
      <div
        className={styles.spot}
        role="dialog"
        aria-label="Search settings"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex(Math.min(results.length - 1, current + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex(Math.max(0, current - 1));
          }
          if (e.key === "Enter" && results[current]) onPick(results[current]);
        }}
      >
        <div className={styles.spotField}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 4 4" />
          </svg>
          <input
            ref={input}
            value={q}
            placeholder="Search settings — try “password”, “font”, “logo”, “cards”…"
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div ref={list} className={styles.spotList} role="listbox">
          {results.length === 0 && <p className={styles.spotEmpty}>Nothing matches “{q}”.</p>}
          {results.map((r, i) => (
            <button
              key={`${r.tab}-${r.section ?? ""}-${i}`}
              type="button"
              role="option"
              aria-selected={i === current}
              data-i={i}
              className={styles.spotItem}
              data-on={i === current}
              onPointerEnter={() => setIndex(i)}
              onClick={() => onPick(r)}
            >
              <span className={styles.spotIcon}>
                <Glyph name={r.glyph} />
              </span>
              <span className={styles.spotText}>
                <strong>{r.label}</strong>
                <small>{r.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
