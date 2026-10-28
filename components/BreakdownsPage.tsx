"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExplodeStage } from "@/components/BreakdownStage";
import { useContent, tx } from "@/lib/content/context";
import { glideTo } from "@/lib/smooth-scroll";
import styles from "./BreakdownsPage.module.css";

/**
 * The Breakdowns page: every design the studio has taken apart, one after another down an ordinary page. Each one is
 * the finished artwork; put the cursor on it (or tap it) and it falls apart into labelled layers.
 */
export function BreakdownsPage() {
  const { breakdowns: items, breakdownsPage: t } = useContent();
  const [current, setCurrent] = useState(0);
  const [touch, setTouch] = useState(false);
  /** Which entries are taken apart right now (they glow brighter). */
  const [openSet, setOpenSet] = useState<Record<number, boolean>>({});
  /** Bumped for an entry when the portal asks the preview to show it taken apart. */
  const [signals, setSignals] = useState<Record<number, number>>({});
  const entries = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches); // eslint-disable-line react-hooks/set-state-in-effect -- one-time check of the input device
  }, []);

  const goTo = useCallback((i: number) => {
    const el = entries.current[i];
    if (el) glideTo(el);
  }, []);

  // A link such as /breakdowns#b2 lands on that breakdown.
  useEffect(() => {
    const m = /^#b(\d+)$/.exec(window.location.hash);
    if (!m) return;
    const t = setTimeout(() => goTo(Number(m[1]) - 1), 450);
    return () => clearTimeout(t);
  }, [goTo]);

  // Entries fade up as they arrive, and the side numbers follow where you are.
  useEffect(() => {
    const seen = new IntersectionObserver(
      (list) => {
        for (const e of list) if (e.isIntersecting) (e.target as HTMLElement).dataset.seen = "true";
      },
      { threshold: 0.12 },
    );
    const where = new IntersectionObserver(
      (list) => {
        for (const e of list) if (e.isIntersecting) setCurrent(entries.current.indexOf(e.target as HTMLElement));
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    entries.current.forEach((el) => {
      if (!el) return;
      seen.observe(el);
      where.observe(el);
    });
    return () => {
      seen.disconnect();
      where.disconnect();
    };
  }, [items.length]);

  // The portal's “Show it in the preview”: glide to that breakdown and take it apart.
  useEffect(() => {
    const on = (e: Event) => {
      const i = (e as CustomEvent<number | null>).detail;
      if (typeof i !== "number" || !entries.current[i]) return;
      goTo(i);
      setSignals((s) => ({ ...s, [i]: (s[i] ?? 0) + 1 }));
    };
    window.addEventListener("dds-breakdown", on);
    return () => window.removeEventListener("dds-breakdown", on);
  }, [goTo]);

  const setOpen = useCallback((i: number, open: boolean) => setOpenSet((s) => (s[i] === open ? s : { ...s, [i]: open })), []);

  return (
    <section className={styles.page}>
      <div className={styles.glowTop} aria-hidden="true" />
      <div className="container">
        <Link href="/#process" className={styles.back} data-cursor="link" {...tx("breakdownsPage.backLink")}>
          {t.backLink}
        </Link>
        <header className={styles.hero}>
          <span className={`label gold-text ${styles.label}`} {...tx("breakdownsPage.label")}>
            {t.label}
          </span>
          <h1 className={styles.title} {...tx("breakdownsPage.title")}>
            {t.title}
          </h1>
          <p className={styles.intro} {...tx("breakdownsPage.intro")}>
            {t.intro}
          </p>
          {items.length > 0 && (
            <span className={styles.count}>
              {items.length} {items.length === 1 ? "design" : "designs"} · {items.reduce((n, b) => n + b.layers.length, 0)} layers
            </span>
          )}
        </header>
      </div>

      {items.length === 0 && (
        <div className="container">
          <p className={styles.empty} {...tx("breakdownsPage.empty")}>
            {t.empty}
          </p>
        </div>
      )}

      <div className={styles.list}>
        {items.map((item, i) => (
          <article
            key={i}
            id={`b${i + 1}`}
            ref={(el) => {
              entries.current[i] = el;
            }}
            className={styles.entry}
            data-open={!!openSet[i]}
            aria-label={`Breakdown ${i + 1}: ${item.title}`}
          >
            <span className={styles.ghost} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className={styles.glow} aria-hidden="true" />
            <div className={`container ${styles.row}`}>
              <div className={styles.meta}>
                <span className={styles.step}>
                  {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </span>
                <h2 className={styles.name}>{item.title}</h2>
                <span className={styles.rule} aria-hidden="true" />
                {item.note && <p className={styles.note}>{item.note}</p>}
                {item.description && (
                  <div className={styles.about}>
                    {item.description.split(/\n{2,}/).map((para, k) => (
                      <p key={k}>{para}</p>
                    ))}
                  </div>
                )}
                <span className={styles.layerCount}>{item.layers.length} {item.layers.length === 1 ? "layer" : "layers"}</span>
              </div>
              <div className={styles.visual}>
                <ExplodeStage item={item} openSignal={signals[i] ?? 0} onOpenChange={(o) => setOpen(i, o)} />
              {item.layers.length > 1 && (
                <p className={styles.hint} {...tx(touch ? "breakdownsPage.hintTouch" : "breakdownsPage.hintMouse")}>
                  {touch ? t.hintTouch : t.hintMouse}
                </p>
              )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {items.length > 1 && (
        <nav className={styles.rail} aria-label="Breakdowns">
          {items.map((it, i) => (
            <button key={i} type="button" data-on={i === current} onClick={() => goTo(i)} aria-label={`${it.title} (${i + 1} of ${items.length})`} aria-current={i === current} title={it.title}>
              <span>{i + 1}</span>
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
