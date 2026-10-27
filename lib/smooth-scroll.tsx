"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { useMotion } from "./motion";

let active: Lenis | null = null;

/** Jump straight to a scroll position (no easing), cancelling any smooth scroll in flight. */
export function jumpTo(y: number) {
  if (active) active.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo({ top: y, behavior: "instant" });
}

/** Mounts Lenis smooth scroll once, disabled entirely under reduced motion. */
export function SmoothScroll() {
  const { reducedMotion } = useMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });
    active = lenis;

    let raf = 0;
    function loop(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      if (active === lenis) active = null;
    };
  }, [reducedMotion]);

  return null;
}
