"use client";

import { useEffect, useRef, useState } from "react";
import { STAR_UNIT_PATH } from "@/content/generated/logo-paths";
import { introProgress, onIntroProgress } from "@/lib/intro/loading";
import styles from "./IntroLoader.module.css";

/**
 * While the intro loads: the logo's star turning slowly in the centre, with the loading percentage on it. The number
 * counts up smoothly towards what has really loaded (and creeps forward while a download is in flight), and at 100%
 * the loader fades away as the intro's stars appear. Rendered on the server, so it's there from the very first paint;
 * the spin is pure CSS, so it keeps turning even while the scene is being built.
 */
export function IntroLoader() {
  const [gone, setGone] = useState(false);
  const numberRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let target = introProgress();
    let shown = 0;
    let raf = 0;
    let doneTimer = 0;
    const started = performance.now();
    const off = onIntroProgress((p) => (target = p));
    const tick = (now: number) => {
      // While waiting on a step, creep slowly towards it (never past 58% before the code has actually arrived).
      const creep = target < 0.6 ? 0.58 * (1 - Math.exp(-(now - started) / 1600)) : target;
      const goal = Math.max(target, creep);
      shown += (goal - shown) * 0.12;
      if (goal >= 1 && 1 - shown < 0.004) shown = 1;
      if (numberRef.current) numberRef.current.textContent = String(Math.floor(shown * 100));
      rootRef.current?.style.setProperty("--progress", shown.toFixed(3));
      if (shown >= 1) {
        rootRef.current?.setAttribute("data-done", "");
        doneTimer = window.setTimeout(() => setGone(true), 700);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      off();
      cancelAnimationFrame(raf);
      clearTimeout(doneTimer);
    };
  }, []);

  if (gone) return null;
  return (
    <div
      ref={rootRef}
      className={`intro-loader ${styles.loader}`}
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.mark}>
        <svg className={styles.star} viewBox="-1.12 -1.12 2.24 2.24" aria-hidden="true">
          <defs>
            <linearGradient id="loader-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff1c2" />
              <stop offset="0.45" stopColor="#e8b04b" />
              <stop offset="1" stopColor="#9c6a22" />
            </linearGradient>
          </defs>
          <path d={STAR_UNIT_PATH} fill="url(#loader-gold)" />
        </svg>
        <span className={styles.percent}>
          <span ref={numberRef}>0</span>
          <small>%</small>
        </span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} />
      </div>
    </div>
  );
}
