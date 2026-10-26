"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { LOGO_BODY_PATH, LOGO_VIEWBOX, STAR_UNIT_PATH } from "@/content/generated/logo-paths";
import styles from "./IntroFirstLight.module.css";

/**
 * The lightweight intro: a star rolls across the dark stage and the logo
 * lights up in its wake. Used on touch devices, under reduced motion, and
 * when WebGL isn't available. Esc jumps to the end.
 */
export function IntroFirstLight({ onDone }: { onDone: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const starRef = useRef<HTMLDivElement>(null);
  const logoLitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const star = starRef.current;
    const lit = logoLitRef.current;
    if (!overlay || !star || !lit) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let finished = false;

    const fadeOut = () => {
      if (finished) return;
      finished = true;
      gsap.to(overlay, { opacity: 0, duration: 0.6, ease: "power2.out", onComplete: onDone });
    };

    const timeline = gsap.timeline({ delay: 0.4, onComplete: () => void gsap.delayedCall(0.35, fadeOut) });
    if (reducedMotion) {
      // No rolling star: show the full logo for a moment, then continue.
      lit.style.clipPath = "inset(0 0% 0 0)";
      star.style.opacity = "0";
      timeline.to({}, { duration: 0.6 });
    } else {
      const travel = { x: -18 };
      timeline
        .to(travel, {
          x: 118,
          duration: 1.8,
          ease: "power2.inOut",
          onUpdate: () => {
            star.style.transform = `translateX(${travel.x}%) rotate(${(travel.x + 18) * 7.2}deg)`;
            lit.style.clipPath = `inset(0 ${100 - Math.min(100, Math.max(0, travel.x))}% 0 0)`;
          },
        })
        .to(star, { opacity: 0, duration: 0.3 }, "-=0.3");
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        timeline.progress(1);
        fadeOut();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      timeline.kill();
      gsap.killTweensOf(overlay);
    };
    // Runs once on mount; onDone is a stable callback from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      <div className={styles.stage}>
        <div className={styles.logoWrap}>
          <svg className={styles.logoDim} viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
            <path d={LOGO_BODY_PATH} fill="var(--ivory)" fillRule="evenodd" />
          </svg>
          <div ref={logoLitRef} className={styles.logoLit} style={{ clipPath: "inset(0 100% 0 0)" }}>
            <svg viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} width="100%" height="100%">
              <path d={LOGO_BODY_PATH} fill="var(--gold-bright)" fillRule="evenodd" />
            </svg>
          </div>
          <div ref={starRef} className={styles.star} style={{ transform: "translateX(-18%)" }}>
            <svg viewBox="-1.3 -1.3 2.6 2.6" width="100%" height="100%">
              <path d={STAR_UNIT_PATH} fill="var(--gold-bright)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
