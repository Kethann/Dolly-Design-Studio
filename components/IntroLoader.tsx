"use client";

import { useEffect, useRef, useState } from "react";
import { STAR_UNIT_PATH } from "@/content/generated/logo-paths";
import { introProgress, onIntroProgress } from "@/lib/intro/loading";
import { useIntroSettings } from "@/lib/intro/settings-context";
import styles from "./IntroLoader.module.css";

/** Rim of each of the star's ten facets (five arms, two halves each), as angles around the centre. */
const FACETS = Array.from({ length: 10 }, (_, i) => {
  const a1 = ((-90 + i * 36) * Math.PI) / 180;
  const a2 = ((-90 + (i + 1) * 36) * Math.PI) / 180;
  const far = (a: number) => `${(Math.cos(a) * 1.6).toFixed(3)},${(Math.sin(a) * 1.6).toFixed(3)}`;
  return { points: `0,0 ${far(a1)} ${far(a2)}`, light: i % 2 === 0 };
});

/** Concentric machining rings, like the spun-metal texture on the 3D stars (fixed, so server and client agree). */
const RINGS = Array.from({ length: 22 }, (_, i) => ({
  r: 0.06 + i * 0.05,
  w: 0.004 + ((i * 7) % 5) * 0.003,
  o: 0.07 + ((i * 11) % 6) * 0.03,
  dark: i % 3 === 0,
}));

/** A fixed scatter of tiny specks over the star (deterministic, so server and client agree). */
const SPECKS = Array.from({ length: 150 }, (_, i) => {
  const a = i * 2.399963; // golden angle
  const r = Math.sqrt((i + 0.5) / 150) * 1.05;
  return { x: +(Math.cos(a) * r).toFixed(3), y: +(Math.sin(a) * r).toFixed(3), r: 0.006 + ((i * 7) % 4) * 0.003, o: 0.12 + ((i * 13) % 5) * 0.06 };
});

/** The ring, drawn in one SVG so the track, the fading tail and the dot share exactly one centre and turn as a single piece. */
const RING_R = 48.5;
const TAIL_STEP = 4; // degrees per segment
const TAIL_SEGMENTS = 66; // 264°: the tail fades out over three quarters of the way round
const polar = (deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(Math.cos(a) * RING_R).toFixed(3)} ${(Math.sin(a) * RING_R).toFixed(3)}`;
};
/** Segment j runs from j steps behind the head to j+1 steps behind it (the ring turns clockwise, so "behind" is anticlockwise). */
const TAIL = Array.from({ length: TAIL_SEGMENTS }, (_, j) => {
  const t = j / TAIL_SEGMENTS;
  return {
    d: `M ${polar(-j * TAIL_STEP)} A ${RING_R} ${RING_R} 0 0 0 ${polar(-(j + 1) * TAIL_STEP - 0.4)}`,
    o: +(0.95 * Math.pow(1 - t, 1.7)).toFixed(3),
    hot: t < 0.25,
  };
});

/**
 * While the intro loads: a faceted, spun-metal gold star — the same look as the stars on the page — turning slowly in
 * the centre, inside a ring tight around it. A glowing point leads round the ring and the rest of the circle follows behind it as
 * a fading tail, turning without a pause. No numbers. When everything has loaded the loader fades away as the intro's
 * stars appear. Rendered on the server, so it's there from the very first paint; both spins are pure CSS, so they keep
 * turning smoothly even while the scene is being built.
 */
/** The loading step after which the loader fades away (the 3D intro's shaders are compiled), and how long the fade takes (matches the CSS). */
const READY = 0.92;
const FADE_MS = 700;

export function IntroLoader() {
  const [gone, setGone] = useState(false);
  const { preview, settings } = useIntroSettings();
  const { color, glow } = settings.cursor;
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
      const pct = String(Math.floor((target >= READY ? 1 : shown) * 100));
      if (rootRef.current?.getAttribute("aria-valuenow") !== pct) rootRef.current?.setAttribute("aria-valuenow", pct);
      // The loader goes as soon as the last loading step is done (the shaders are compiled: the first frame is a moment away),
      // not after the reading has crept up to 100% and the first frame is on screen. It is then gone before the intro's stars
      // and their glow appear, so the two never overlap.
      if (target >= READY) {
        // Fade out from however visible it is right now (it may still be fading in on a fast load), so there is no jump.
        if (rootRef.current) {
          rootRef.current.style.setProperty("--loader-from", getComputedStyle(rootRef.current).opacity);
          rootRef.current.setAttribute("data-done", "");
        }
        doneTimer = window.setTimeout(() => setGone(true), FADE_MS + 50);
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

  if (gone || preview) return null; // the portal's preview has no loader
  return (
    <div
      ref={rootRef}
      className={`intro-loader ${styles.loader}`}
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      style={{ "--pen-size": 0.75, "--pen-color": color, "--pen-glow": glow } as React.CSSProperties}
    >
      <div className={styles.mark}>
        {/* The ring, tight around the star: a hairline track, and a comet — a glowing dot at the head, the circle fading out
            behind it — turning round it. */}
        <div className={styles.ring} aria-hidden="true">
          <svg className={styles.track} viewBox="-50 -50 100 100">
            <circle r={RING_R} fill="none" stroke="rgba(244,237,225,0.12)" strokeWidth="2" />
          </svg>
          <div className={styles.comet}>
            <svg viewBox="-50 -50 100 100">
              <defs>
                <radialGradient id="loader-dot" cx="0.4" cy="0.35" r="0.7">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="0.55" stopColor="var(--pen-color, #fff195)" />
                  <stop offset="1" stopColor="#e8b04b" />
                </radialGradient>
              </defs>
              <g fill="none" strokeWidth="2">
                {TAIL.map((seg, i) => (
                  <path key={i} d={seg.d} stroke={seg.hot ? "#fff1b8" : "#f0c564"} strokeOpacity={seg.o} />
                ))}
              </g>
              {/* The dot sits exactly on the ring's line, with a soft halo (plain circles: no filter to repaint). */}
              <g transform={`translate(0 ${-RING_R})`}>
                <circle r="7" fill="var(--pen-glow, #ffd36a)" opacity="0.16" />
                <circle r="4.6" fill="var(--pen-color, #fff195)" opacity="0.4" />
                <circle r="2.9" fill="url(#loader-dot)" />
              </g>
            </svg>
          </div>
        </div>

        {/* The star: facets lit alternately, with spun-metal rings and fine grain over them, like the 3D stars. */}
        <svg className={styles.star} viewBox="-1.12 -1.12 2.24 2.24" aria-hidden="true">
          <defs>
            <clipPath id="loader-star">
              <path d={STAR_UNIT_PATH} />
            </clipPath>
            <linearGradient id="loader-lit" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff2c4" />
              <stop offset="0.55" stopColor="#e9b855" />
              <stop offset="1" stopColor="#b9822c" />
            </linearGradient>
            <linearGradient id="loader-shade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#c58f35" />
              <stop offset="1" stopColor="#6d4313" />
            </linearGradient>
            <radialGradient id="loader-sheen" cx="0.32" cy="0.28" r="0.75">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g clipPath="url(#loader-star)">
            {FACETS.map((f, i) => (
              <polygon key={i} points={f.points} fill={f.light ? "url(#loader-lit)" : "url(#loader-shade)"} />
            ))}
            <g fill="none">
              {RINGS.map((ring, i) => (
                <circle
                  key={i}
                  r={ring.r}
                  stroke={ring.dark ? "#3b2208" : "#fff6d6"}
                  strokeOpacity={ring.o}
                  strokeWidth={ring.w}
                />
              ))}
            </g>
            {/* Fine grain: a fixed scatter of specks (no filter, so the turning star never needs repainting). */}
            <g fill="#fff6d6">
              {SPECKS.map((sp, i) => (
                <circle key={i} cx={sp.x} cy={sp.y} r={sp.r} opacity={sp.o} />
              ))}
            </g>
            <rect x="-1.2" y="-1.2" width="2.4" height="2.4" fill="url(#loader-sheen)" />
          </g>
          {/* Bright edge on every facet line. */}
          <path d={STAR_UNIT_PATH} fill="none" stroke="#fff1c2" strokeOpacity="0.85" strokeWidth="0.02" strokeLinejoin="round" />
          <g stroke="#fff1c2" strokeOpacity="0.28" strokeWidth="0.008" clipPath="url(#loader-star)">
            {FACETS.map((f, i) => (
              <line key={i} x1="0" y1="0" x2={f.points.split(" ")[1].split(",")[0]} y2={f.points.split(" ")[1].split(",")[1]} />
            ))}
          </g>
        </svg>
      </div>
      <p className={styles.caption}>Loading</p>
    </div>
  );
}
