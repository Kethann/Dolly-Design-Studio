"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchSettings } from "./search-settings";
import { Glyph } from "./mac";
import { useDialogFocus } from "./dialog-focus";
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
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useDialogFocus(box, onClose);

  const results = useMemo(() => searchSettings(entries, q), [q, entries]);

  const current = Math.min(index, Math.max(0, results.length - 1));
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, q]);

  return (
    <div className={styles.spotBackdrop} onPointerDown={onClose}>
      <div
        ref={box}
        className={styles.spot}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="Search settings"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.target !== input.current) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex(Math.max(0, Math.min(results.length - 1, current + 1)));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex(Math.max(0, current - 1));
          }
          if (e.key === "Enter" && e.target === input.current && results[current]) {
            e.preventDefault();
            onPick(results[current]);
          }
        }}
      >
        <div className={styles.spotField}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 4 4" />
          </svg>
          <input
            ref={input}
            aria-label="Search settings"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${current}` : undefined}
            data-dialog-initial-focus
            value={q}
            placeholder="Search settings — try “password”, “font”, “logo”, “cards”…"
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
          />
          <button type="button" className={styles.spotClose} aria-label="Close settings search" onClick={onClose}>Close</button>
        </div>
        <div ref={list} id={listId} className={styles.spotList} role="listbox" aria-label="Matching settings">
          {results.length === 0 && <p className={styles.spotEmpty} role="status">No settings match “{q}”. Try a feature name, such as budget, tint, rotation or password.</p>}
          {results.map((r, i) => (
            <button
              key={`${r.tab}-${r.section ?? ""}-${i}`}
              type="button"
              role="option"
              id={`${listId}-${i}`}
              tabIndex={-1}
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
