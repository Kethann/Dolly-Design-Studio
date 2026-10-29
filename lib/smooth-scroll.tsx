"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { useMotion } from "./motion";

let active: Lenis | null = null;
/** Where the glide in progress is heading (cleared when it arrives, or when the visitor scrolls by hand). */
let glideGoal: number | HTMLElement | null = null;

/**
 * Jump straight to a scroll position (no easing). A glide already on its way is not lost: after the jump it carries on
 * to where it was going (the slate's "skip back over the pinned scene" jump must not stop a Back or menu glide halfway).
 */
export function jumpTo(y: number) {
  const goal = glideGoal;
  if (active) active.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo({ top: y, behavior: "instant" });
  if (goal !== null) glideTo(goal);
}

/** Glide to a position or an element (smooth, unless the visitor prefers reduced motion). */
export function glideTo(target: number | HTMLElement) {
  glideGoal = target;
  if (active) {
    active.scrollTo(target, {
      duration: 1.2,
      easing: (t) => 1 - Math.pow(1 - t, 4),
      onComplete: () => {
        if (glideGoal === target) glideGoal = null;
      },
    });
    return;
  }
  glideGoal = null; // no smooth-scroll engine: the browser's own glide, nothing to resume
  const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: reduced ? "instant" : "smooth" });
}

/** Freeze / release page scrolling (the mobile menu, dialogs). Lenis keeps scrolling a page that only has `overflow: hidden`. */
let freezes = 0;
export function freezeScroll() {
  if (freezes++ === 0) {
    active?.stop();
    document.documentElement.style.overflow = "hidden";
  }
}
export function releaseScroll() {
  if (freezes === 0) return;
  if (--freezes === 0) {
    document.documentElement.style.overflow = "";
    active?.start();
  }
}

/** Where on the page an element sits, just below the fixed menu bar when `clearBar` is set. */
export function topOf(el: HTMLElement, clearBar = false) {
  const bar = clearBar ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72 : 0;
  return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - (bar ? bar + 20 : 0)));
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
    if (freezes > 0) lenis.stop();

    // If the visitor scrolls by hand, a glide in progress is theirs to override: forget where it was heading.
    const release = () => {
      glideGoal = null;
    };
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("keydown", release);

    let raf = 0;
    function loop(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release);
      glideGoal = null;
      lenis.destroy();
      if (active === lenis) active = null;
    };
  }, [reducedMotion]);

  return null;
}
