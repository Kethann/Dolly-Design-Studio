"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExplodeStage } from "@/components/BreakdownStage";
import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection } from "@/lib/content/tx";
import { glideTo, topOf } from "@/lib/smooth-scroll";
import styles from "./BreakdownsPage.module.css";

/**
 * Moving between breakdowns: on a wide screen a slim column at the right edge (previous, next, and a scrolling list of
 * numbers, however many there are); on a phone a bar along the bottom with previous, next and where you are.
 */
function BreakdownNav({ items, current, onGo }: { items: string[]; current: number; onGo: (i: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const last = items.length - 1;

  // Keep the current number in view inside the column.
  useEffect(() => {
    const box = list.current;
    const btn = box?.children[current] as HTMLElement | undefined;
    if (!box || !btn) return;
    box.scrollTo({ top: btn.offsetTop - box.clientHeight / 2 + btn.offsetHeight / 2, behavior: "smooth" });
  }, [current]);

  return (
    <>
      <nav className={styles.rail} aria-label="Breakdowns">
        <button type="button" className={styles.railStep} onClick={() => onGo(Math.max(0, current - 1))} disabled={current <= 0} aria-label="Previous breakdown" title="Previous breakdown">
          ▲
        </button>
        <div ref={list} className={styles.railList}>
          {items.map((title, i) => (
            <button key={i} type="button" data-on={i === current} onClick={() => onGo(i)} aria-label={`${title} (${i + 1} of ${items.length})`} aria-current={i === current ? "true" : undefined} title={title}>
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
        <button type="button" className={styles.railStep} onClick={() => onGo(Math.min(last, current + 1))} disabled={current >= last} aria-label="Next breakdown" title="Next breakdown">
          ▼
        </button>
      </nav>
      <nav className={styles.dock} aria-label="Breakdowns">
        <button type="button" onClick={() => onGo(Math.max(0, current - 1))} disabled={current <= 0} aria-label="Previous breakdown">
          ‹
        </button>
        <span className={styles.dockText}>
          <b>
            {current + 1} / {items.length}
          </b>
          <span>{items[current]}</span>
        </span>
        <button type="button" onClick={() => onGo(Math.min(last, current + 1))} disabled={current >= last} aria-label="Next breakdown">
          ›
        </button>
      </nav>
    </>
  );
}

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
    if (!el) return;
    // Land just below the menu bar (Lenis ignores CSS scroll-margin, so the offset is worked out here).
    glideTo(topOf(el, true));
  }, []);

  // (A link such as /breakdowns#b2 lands on that breakdown: NavHistory handles every #section arrival.)

  // Entries fade up as they arrive.
  useEffect(() => {
    const seen = new IntersectionObserver(
      (list) => {
        for (const e of list) if (e.isIntersecting) (e.target as HTMLElement).dataset.seen = "true";
      },
      { threshold: 0.12 },
    );
    entries.current.forEach((el) => el && seen.observe(el));
    return () => seen.disconnect();
  }, [items.length]);

  // The side numbers follow where you are: the entry covering the upper-middle of the screen. Measured on scroll (not
  // with observers), so a tall entry can never leave the number stuck or skip one.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.4;
      let best = 0;
      let bestDist = Infinity;
      entries.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dist = r.top <= line && r.bottom >= line ? 0 : Math.min(Math.abs(r.top - line), Math.abs(r.bottom - line));
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setCurrent(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
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
    <section className={styles.page} {...edSection("breakdowns", "all", "Breakdowns")}>
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
            {...edItem("breakdowns", i, item.title)}
            aria-label={`Breakdown ${i + 1}: ${item.title}`}
          >
            <span className={styles.ghost} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className={styles.glow} aria-hidden="true" />
            <div className={`container ${styles.row}`} data-text={item.textPosition}>
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
                <ExplodeStage item={item} index={i} openSignal={signals[i] ?? 0} onOpenChange={setOpen} />
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

      {items.length > 1 && <BreakdownNav items={items.map((b) => b.title)} current={current} onGo={goTo} />}
    </section>
  );
}
