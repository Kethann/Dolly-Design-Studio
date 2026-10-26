"use client";

import { useEffect, useRef } from "react";
import { useIntroSettings } from "@/lib/intro/settings-context";
import styles from "./LogoGlow.module.css";

/**
 * A glow that follows the cursor over the logo: the letters near the cursor light up (a highlight cut to the
 * logo's own shape), with a soft halo spreading around them. It eases after the cursor and fades out when the
 * cursor moves away. Colour, intensity and spread come from the portal.
 */
export function LogoGlow({ src }: { src: string }) {
  const { settings } = useIntroSettings();
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, intensity, spread, color } = settings.logoGlow;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    const target = { x: 0, y: 0, on: 0 };
    const now = { x: 0, y: 0, on: 0 };
    let raf = 0;

    function onMove(e: PointerEvent) {
      const r = el!.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      // Lit while the cursor is over the logo or just around it.
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      target.on = Math.hypot(dx, dy) < spread * 0.5 ? 1 : 0;
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick() {
      raf = 0;
      now.x += (target.x - now.x) * 0.18;
      now.y += (target.y - now.y) * 0.18;
      now.on += (target.on - now.on) * 0.12;
      el!.style.setProperty("--gx", `${now.x}px`);
      el!.style.setProperty("--gy", `${now.y}px`);
      el!.style.setProperty("--on", now.on.toFixed(3));
      if (Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.5 || Math.abs(target.on - now.on) > 0.01) {
        raf = requestAnimationFrame(tick);
      }
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled, spread]);

  if (!enabled) return null;
  return (
    <div
      ref={ref}
      className={styles.glow}
      aria-hidden="true"
      style={
        {
          "--mask": `url(${src})`,
          "--color": color,
          "--intensity": intensity,
          "--spread": `${spread}px`,
        } as React.CSSProperties
      }
    >
      {/* The blur sits outside the logo-shaped mask, so the halo can spread past the letters. */}
      <span className={styles.halo}>
        <span className={styles.shape} />
      </span>
      <span className={`${styles.shape} ${styles.core}`} />
    </div>
  );
}
