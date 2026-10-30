"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./mac.module.css";

// ── icons ───────────────────────────────────────────────────────────────────────────────────────────────────────

const PATHS: Record<string, ReactNode> = {
  // pages
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.6V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.6" />
      <path d="M10 20v-5.2a2 2 0 0 1 4 0V20" />
    </>
  ),
  work: (
    <>
      <rect x="3.5" y="4.5" width="7" height="10" rx="1.4" />
      <rect x="13.5" y="4.5" width="7" height="6" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="6" rx="1.4" opacity="0.6" />
      <rect x="3.5" y="17.5" width="7" height="2" rx="1" opacity="0.6" />
    </>
  ),
  breakdowns: (
    <>
      <path d="m12 3.5 8 3.6-8 3.6-8-3.6z" />
      <path d="m4 11.6 8 3.6 8-3.6" opacity="0.7" />
      <path d="m4 16.1 8 3.6 8-3.6" opacity="0.4" />
    </>
  ),
  site: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <path d="M3.5 9.5h17" />
      <path d="M7 14h6M7 16.6h4" opacity="0.7" />
      <circle cx="6.8" cy="7.3" r="0.5" />
      <circle cx="9" cy="7.3" r="0.5" />
    </>
  ),
  slate: (
    <>
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="m4 10 1.6-4.4 3.6.9L7.8 10M9.4 6.6l3.6.9-1.4 2.5M13.2 7.5l3.6.9-1.4 1.6" />
    </>
  ),
  // library
  media: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17 4.8-4.4 3.4 3 2.6-2.4 4.2 3.8" />
    </>
  ),
  type: (
    <>
      <path d="M3.5 18 8.5 6l5 12M5.3 14h6.4" />
      <path d="M15 18c0-3 1.5-4 3-4s2 .9 2 2.2V18M20 16.2c-3 0-5 .6-5 1.9 0 1 .9 1.4 2 1.4 1.5 0 3-.9 3-2.3" />
    </>
  ),
  // page look
  background: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <path d="M3.5 15c4-5 7 1 10-3s4-1 7-2.5" />
      <circle cx="16.5" cy="8.5" r="1.3" opacity="0.7" />
    </>
  ),
  drop: <path d="M12 3.8c3.2 4.2 6 6.7 6 10.2a6 6 0 0 1-12 0c0-3.5 2.8-6 6-10.2zM9.5 14.5a2.6 2.6 0 0 0 2.2 2.4" />,
  glass: (
    <>
      <rect x="4.5" y="4" width="15" height="16" rx="2.6" />
      <path d="m9 17 7-9M7.5 12.5 12 7" opacity="0.7" />
      <path d="M15.5 16.5 17 15" opacity="0.5" />
    </>
  ),
  // stars
  colours: (
    <>
      <path d="M12 4a8 8 0 1 0 0 16c1.3 0 2-.8 2-1.7 0-1.4-1-1.5-1-2.6 0-1 .8-1.7 1.9-1.7H17a3 3 0 0 0 3-3C20 6.5 16.4 4 12 4z" />
      <circle cx="8" cy="11" r="1.1" />
      <circle cx="11" cy="7.8" r="1.1" />
      <circle cx="15" cy="8.5" r="1.1" />
    </>
  ),
  finish: (
    <>
      <path d="M10 4.5 11.7 9l4.5 1.7-4.5 1.7L10 17l-1.7-4.6L3.8 10.7 8.3 9z" />
      <path d="M18 3.5v3M16.5 5h3M17.5 14v3.5M15.8 15.8h3.4" opacity="0.7" />
    </>
  ),
  layers: (
    <>
      <path d="m9 4 1.5 4L14.5 9.5 10.5 11 9 15 7.5 11 3.5 9.5 7.5 8z" />
      <path d="m17.5 11 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" opacity="0.7" />
      <path d="m16 4 .6 1.4L18 6l-1.4.6L16 8l-.6-1.4L14 6l1.4-.6z" opacity="0.5" />
    </>
  ),
  motion: (
    <>
      <path d="M3.5 8c2.2-2.4 4.3 2.4 6.5 0s4.3-2.4 6.5 0 3 .4 4-.5" />
      <path d="M3.5 13c2.2-2.4 4.3 2.4 6.5 0s4.3-2.4 6.5 0 3 .4 4-.5" opacity="0.7" />
      <path d="M3.5 18c2.2-2.4 4.3 2.4 6.5 0s4.3-2.4 6.5 0 3 .4 4-.5" opacity="0.4" />
    </>
  ),
  // animation
  intro: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
      <path d="m10.3 9.2 4.6 2.8-4.6 2.8z" />
    </>
  ),
  cursor: (
    <>
      <path d="M6 4.5 18 11l-5.4 1.5L10.2 18z" />
      <path d="m13 13.5 3.5 3.5" opacity="0.7" />
    </>
  ),
  playback: (
    <>
      <path d="M4 17.5h16" />
      <circle cx="10" cy="17.5" r="2" />
      <path d="M7.5 7.5v6l5-3z" />
    </>
  ),
  // studio
  inbox: (
    <>
      <path d="M4 13.5 6.5 6h11l2.5 7.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 13.5h4.6l1 2.4h4.8l1-2.4H20" opacity="0.7" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5 19.5c.9-3.6 3.7-5.3 7-5.3s6.1 1.7 7 5.3" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
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
  /** A short name shown under the icon. */
  short: string;
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
  badges,
  open,
  minimized,
  disabled,
  onToggle,
}: {
  groups: DockGroup[];
  /** A small number on an icon (e.g. unread enquiries). */
  badges?: Record<string, number>;
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
    <nav className={styles.dockWrap} aria-label="Portal tools">
      <div className={styles.dock}>
        {groups.map((g, gi) => (
          <div key={g.name} className={styles.dockSection}>
            {gi > 0 && <span className={styles.divider} aria-hidden="true" />}
            <div className={styles.dockBlock} role="group" aria-label={g.name}>
              <span className={styles.groupName}>{g.name}</span>
              <div className={styles.dockGroup}>
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
                      {!!badges?.[it.id] && (
                        <span className={styles.badge} aria-label={`${badges[it.id]} new`}>
                          {badges[it.id] > 9 ? "9+" : badges[it.id]}
                        </span>
                      )}
                      <span className={styles.itemLabel}>{it.short}</span>
                      <span className={styles.tip}>{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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

/** Menu bar: logo, pull-down menus (Desktop · View · Window), then whatever goes on the right (search, status, publish). */
export function MenuBar({ menus, children }: { menus: MenuDef[]; children: ReactNode }) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (openMenu === null) return;
    const away = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      barRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus();
      setOpenMenu(null);
    };
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
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              setOpenMenu(i);
              requestAnimationFrame(() => barRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
            }}
            onPointerEnter={() => openMenu !== null && setOpenMenu(i)}
          >
            {m.label}
          </button>
          {openMenu === i && (
            <div className={styles.menuPanel} role="menu" aria-label={m.label} onKeyDown={(event) => {
              if (event.key === "Tab") { setOpenMenu(null); return; }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
              const index = items.indexOf(event.target as HTMLButtonElement);
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }}>
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
    </header>
  );
}
