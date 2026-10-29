"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./mac.module.css";

// ── icons ───────────────────────────────────────────────────────────────────────────────────────────────────────

const PATHS: Record<string, ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  work: (
    <>
      <rect x="4" y="5" width="7" height="7" rx="1.2" />
      <rect x="13" y="5" width="7" height="7" rx="1.2" />
      <rect x="4" y="14" width="7" height="5" rx="1.2" />
      <rect x="13" y="14" width="7" height="5" rx="1.2" />
    </>
  ),
  site: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.6 2.4 2.6 13.6 0 16M12 4c-2.6 2.4-2.6 13.6 0 16" />
    </>
  ),
  projects: (
    <>
      <path d="M4 9h16v10H4zM4 9l2.5-4.5 3 .8L7 9.5M10 5.3l3-.5L11 9M14 4.8l3-.4L15 9" />
      <path d="M8 13h8" />
    </>
  ),
  slate: (
    <>
      <path d="M4 8l16-3v5H4z" />
      <rect x="4" y="10" width="16" height="9" rx="1.5" />
      <path d="M8 14h8" />
    </>
  ),
  media: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 5-4.5 3.5 3L16 13l4 4" />
    </>
  ),
  type: (
    <>
      <path d="M4 18 9 6l5 12M5.8 14h6.4" />
      <path d="M15 18c0-3 1.5-4 3-4s2 .9 2 2.2V18M20 16.2c-3 0-5 .6-5 1.9 0 1 .9 1.4 2 1.4 1.5 0 3-.9 3-2.3" />
    </>
  ),
  background: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M4 15c4-5 7 1 10-3s4-1 6-2" />
    </>
  ),
  glass: <path d="M12 4l7 5v6l-7 5-7-5V9zM12 4v16M5 9l14 6M19 9 5 15" />,
  colours: (
    <>
      <path d="M12 4a8 8 0 1 0 0 16c1.3 0 2-.8 2-1.7 0-1.4-1-1.5-1-2.6 0-1 .8-1.7 1.9-1.7H17a3 3 0 0 0 3-3C20 6.5 16.4 4 12 4z" />
      <circle cx="8" cy="11" r="1.1" />
      <circle cx="11" cy="7.8" r="1.1" />
      <circle cx="15" cy="8.5" r="1.1" />
    </>
  ),
  finish: <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8zM18 4v3M16.5 5.5h3M6 17v3M4.5 18.5h3" />,
  layers: (
    <>
      <path d="m12 4 8 4-8 4-8-4z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
  motion: <path d="M4 9c3-3 5 3 8 0s5-3 8 0M4 14c3-3 5 3 8 0s5-3 8 0M4 19c3-3 5 3 8 0s5-3 8 0" />,
  intro: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m10 8.5 5 3.5-5 3.5z" />
    </>
  ),
  cursor: <path d="M6 4l12 7-5.2 1.4L10.6 18z" />,
  playback: (
    <>
      <path d="M4 17h16" />
      <circle cx="9" cy="17" r="2" />
      <path d="M7 8l7 4-7 4z" />
    </>
  ),
  breakdowns: (
    <>
      <rect x="3.5" y="9" width="8" height="8" rx="1.2" />
      <rect x="8.5" y="5" width="8" height="8" rx="1.2" />
      <rect x="13.5" y="11" width="7" height="8" rx="1.2" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13l2.4-7h11.2L20 13v5H4z" />
      <path d="M4 13h4.5l1 2.5h5l1-2.5H20" />
    </>
  ),
  activity: (
    <>
      <path d="M4 6h16M4 12h10M4 18h13" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="9" r="3.4" />
      <path d="M5 19c.8-3.4 3.6-5 7-5s6.2 1.6 7 5" />
    </>
  ),
};

export function Glyph({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.site}
    </svg>
  );
}

// ── the dock ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DockItem {
  id: string;
  label: string;
  glyph: string;
  /** The icon's neon colour is the first of these. */
  tint: [string, string];
}

export interface DockGroup {
  name: string;
  items: DockItem[];
}

/**
 * The floating dock: dark liquid-glass tiles with a neon line icon each, in groups. Only the tile under the pointer
 * reacts: it swells and rises from the dock's baseline while its neighbours stay exactly where they are, and a light
 * follows the pointer across its glass. A dot under an icon means its window is open; a hollow ring means it is
 * minimised.
 */
export function Dock({
  groups,
  open,
  minimized,
  disabled,
  onToggle,
}: {
  groups: DockGroup[];
  open: Set<string>;
  minimized: Set<string>;
  disabled?: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  /** The light on the glass follows the pointer. */
  function shine(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--px", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--py", `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  return (
    <nav className={styles.dockWrap} aria-label="Portal apps">
      <div className={styles.dock}>
        {groups.map((g, gi) => (
          <div key={g.name} className={styles.dockGroup}>
            {gi > 0 && <span className={styles.divider} aria-hidden="true" />}
            {g.items.map((it) => {
              const isOpen = open.has(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  data-dock-item
                  className={styles.dockItem}
                  data-open={isOpen}
                  data-min={minimized.has(it.id)}
                  disabled={disabled?.(it.id)}
                  aria-label={it.label}
                  aria-pressed={isOpen}
                  style={{ "--accent": it.tint[0] } as React.CSSProperties}
                  onPointerMove={shine}
                  onClick={() => onToggle(it.id)}
                >
                  <span className={styles.tile}>
                    <Glyph name={it.glyph} />
                  </span>
                  <span className={styles.tip}>{it.label}</span>
                  <span className={styles.dot} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

// ── the menu bar ────────────────────────────────────────────────────────────────────────────────────────────────

export interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** A thin rule above this item. */
  divider?: boolean;
  /** Small text on the right (e.g. a state). */
  hint?: string;
}

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

const clockText = (d: Date) => {
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
  return `${day.replace(/^(\w+) /, "$1, ")}, ${time}`;
};

/** Menu bar: logo, pull-down menus (Desktop · View · Window), then whatever goes on the right. */
export function MenuBar({ menus, children }: { menus: MenuDef[]; children: ReactNode }) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock only exists in the browser
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (openMenu === null) return;
    const away = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [openMenu]);

  return (
    <header ref={barRef} className={styles.menubar}>
      <span className={styles.menuLogo} aria-hidden="true">
        ★
      </span>
      {menus.map((m, i) => (
        <div key={m.label} className={styles.menuWrap}>
          <button
            type="button"
            className={styles.menuTitle}
            data-first={i === 0}
            data-open={openMenu === i}
            aria-haspopup="menu"
            aria-expanded={openMenu === i}
            onClick={() => setOpenMenu(openMenu === i ? null : i)}
            onPointerEnter={() => openMenu !== null && setOpenMenu(i)}
          >
            {m.label}
          </button>
          {openMenu === i && (
            <div className={styles.menuPanel} role="menu">
              {m.items.map((it, j) => (
                <div key={j}>
                  {it.divider && <hr className={styles.menuRule} />}
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpenMenu(null);
                      it.onClick?.();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.hint && <small>{it.hint}</small>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <span className={styles.menuSpacer} />
      {children}
      <time className={styles.clock}>{now ? clockText(now) : ""}</time>
    </header>
  );
}

// ── a window ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface WinState {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  min: boolean;
  max: boolean;
}

export const MENUBAR_H = 36;

/** A draggable, resizable liquid-glass window with the red / yellow / green buttons. */
export function Win({
  title,
  glyph,
  tint,
  state,
  onFocus,
  onClose,
  onChange,
  children,
}: {
  title: string;
  glyph: string;
  tint: [string, string];
  state: WinState;
  onFocus: () => void;
  onClose: () => void;
  onChange: (patch: Partial<WinState>) => void;
  children: ReactNode;
}) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // "Large" docks the window down the left side, full height; the live preview is framed beside it. A minimised
  // window drops back to its small floating place as a title bar.
  const large = state.max && !state.min;
  const style: React.CSSProperties = large
    ? { zIndex: state.z }
    : {
        left: state.x,
        top: state.y,
        width: state.w,
        height: state.min ? undefined : state.h,
        zIndex: state.z,
      };
  return (
    <section className={styles.win} data-min={state.min} data-max={large} style={style} aria-label={title} onPointerDown={onFocus}>
      <header
        className={styles.bar}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button") || large) return;
          drag.current = { dx: e.clientX - state.x, dy: e.clientY - state.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const x = Math.min(window.innerWidth - 90, Math.max(90 - state.w, e.clientX - drag.current.dx));
          const y = Math.min(window.innerHeight - 60, Math.max(MENUBAR_H, e.clientY - drag.current.dy));
          onChange({ x, y });
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => onChange({ max: !large, min: false })}
      >
        <span className={styles.lights}>
          <button type="button" className={styles.light} data-c="close" aria-label={`Close ${title}`} onClick={onClose} />
          {/* Yellow: large → small floating window → just a title bar → small again. Green: large ⇄ small. */}
          <button
            type="button"
            className={styles.light}
            data-c="min"
            aria-label={large ? "Make smaller" : state.min ? "Restore" : "Fold up"}
            title={large ? "Make smaller" : state.min ? "Restore" : "Fold up"}
            onClick={() => onChange(large ? { max: false, min: false } : { min: !state.min })}
          />
          <button
            type="button"
            className={styles.light}
            data-c="max"
            aria-label={large ? "Make smaller" : "Make large"}
            title={large ? "Make smaller" : "Make large"}
            onClick={() => onChange({ max: !large, min: false })}
          />
        </span>
        <span className={styles.barTitle}>
          <span className={styles.barIcon} style={{ "--accent": tint[0] } as React.CSSProperties}>
            <Glyph name={glyph} />
          </span>
          {title}
        </span>
      </header>
      {(large || !state.min) && <div className={styles.winBody}>{children}</div>}
    </section>
  );
}
