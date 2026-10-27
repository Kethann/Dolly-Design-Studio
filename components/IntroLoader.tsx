"use client";

import { useEffect, useRef, useState } from "react";
import { STAR_UNIT_PATH } from "@/content/generated/logo-paths";
import { introProgress, onIntroProgress } from "@/lib/intro/loading";
import styles from "./IntroLoader.module.css";

/**
 * While the intro loads: the logo's star, faceted in gold, turning slowly in the centre, a fine gold ring around it
 * that fills as things load, and the percentage, upright and clear, on the star. The number counts up smoothly towards
 * what has really loaded (and creeps forward while a download is in flight); at 100% the loader fades away as the
 * intro's stars appear. Rendered on the server, so it's there from the very first paint; the spin is pure CSS, so it
 * keeps turning even while the scene is being built.
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
      const pct = Math.floor(shown * 100);
      if (numberRef.current && numberRef.current.textContent !== String(pct)) numberRef.current.textContent = String(pct);
      rootRef.current?.style.setProperty("--progress", shown.toFixed(3));
      rootRef.current?.setAttribute("aria-valuenow", String(pct));
      if (shown >= 1) {
        rootRef.current?.setAttribute("data-done", "");
        doneTimer = window.setTimeout(() => setGone(true), 800);
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
      aria-valuenow={0}
    >
      <div className={styles.mark}>
        {/* The ring: a faint track and a gold arc that fills with the progress. */}
        <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
          <circle className={styles.ringTrack} cx="50" cy="50" r="47" />
          <circle className={styles.ringFill} cx="50" cy="50" r="47" pathLength="100" />
        </svg>
        {/* The star: two gold tones split down its facets, like the 3D stars, with a bright edge. */}
        <svg className={styles.star} viewBox="-1.12 -1.12 2.24 2.24" aria-hidden="true">
          <defs>
            <linearGradient id="loader-gold" x1="0.15" y1="0" x2="0.85" y2="1">
              <stop offset="0" stopColor="#fff4cc" />
              <stop offset="0.48" stopColor="#f0c564" />
              <stop offset="0.52" stopColor="#c98f33" />
              <stop offset="1" stopColor="#8a5a1c" />
            </linearGradient>
            <radialGradient id="loader-sheen" cx="0.35" cy="0.3" r="0.7">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d={STAR_UNIT_PATH} fill="url(#loader-gold)" stroke="#fff1c2" strokeWidth="0.025" strokeLinejoin="round" />
          <path d={STAR_UNIT_PATH} fill="url(#loader-sheen)" />
        </svg>
        <span className={styles.percent}>
          <span ref={numberRef}>0</span>
          <small>%</small>
        </span>
      </div>
      <p className={styles.caption}>Loading</p>
    </div>
  );
}
