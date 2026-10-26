"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { site } from "@/content/site";
import { home } from "@/content/home";
import { useMotion } from "@/lib/motion";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { glassFill } from "@/lib/intro/glass";
import styles from "./Hero.module.css";

// three.js loads on its own, after the page, so it never delays the hero.
const StarField = dynamic(() => import("@/components/StarField").then((m) => m.StarField), { ssr: false });

const GHOST_FRAMES = [
  { top: "14%", left: "8%", depth: 0.04, scale: 1.1 },
  { top: "68%", left: "12%", depth: 0.09, scale: 0.8 },
  { top: "22%", left: "86%", depth: 0.06, scale: 0.9 },
  { top: "72%", left: "84%", depth: 0.03, scale: 1.3 },
  { top: "46%", left: "4%", depth: 0.07, scale: 0.6 },
  { top: "40%", left: "92%", depth: 0.05, scale: 0.7 },
];

export function Hero() {
  const { reducedMotion } = useMotion();
  const { settings } = useIntroSettings();
  const fieldRef = useRef<HTMLDivElement>(null);

  // Gentle parallax on the ghost frames, updated only when the page scrolls.
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    function apply() {
      raf = 0;
      const y = window.scrollY;
      const nodes = fieldRef.current?.children;
      if (!nodes) return;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i] as HTMLElement;
        const f = GHOST_FRAMES[i];
        el.style.transform = `translateY(${y * f.depth}px) scale(${f.scale})`;
      }
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(apply);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <section id="top" className={styles.hero}>
      <StarField />
      <div
        className={styles.glass}
        style={{ backgroundColor: glassFill(settings), "--glass-frost": `${settings.glassFrost}px` } as React.CSSProperties}
        aria-hidden="true"
      />
      <div className={styles.frameField} ref={fieldRef} aria-hidden="true">
        {GHOST_FRAMES.map((f, i) => (
          <div
            key={i}
            className={styles.ghostFrame}
            style={{ top: f.top, left: f.left, transform: `scale(${f.scale})` }}
          />
        ))}
      </div>

      <div className={styles.logoBlock}>
        <h1 className="sr-only">
          {site.name} — {home.hero.screenReaderHeading}
        </h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img id={HERO_LOGO_ID} src="/images/brand/logo.svg" alt={site.name} width={1000} height={516} className={styles.logo} />
        <p className={styles.disciplines}>{home.hero.disciplines.join(" · ")}</p>
      </div>

      <div className={styles.scrollHint} aria-hidden="true" />
    </section>
  );
}
