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

/** True when this page is the live preview inside the creator portal. */
const inPortalPreview = () =>
  typeof window !== "undefined" && window.parent !== window && new URLSearchParams(window.location.search).has("portal-preview");

/**
 * The portal's preview stays where the portal puts it: wheel, touch and keys do nothing, so the site can't be
 * scrolled away by accident behind the windows. The portal still moves it (jumps to a section) from outside.
 */
function usePreviewScrollLock() {
  useEffect(() => {
    if (!inPortalPreview()) return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const keys = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (keys.has(e.key) && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) stop(e);
    };
    window.addEventListener("wheel", stop, { capture: true, passive: false });
    window.addEventListener("touchmove", stop, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("wheel", stop, { capture: true });
      window.removeEventListener("touchmove", stop, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);
}

/** Mounts Lenis smooth scroll once, disabled entirely under reduced motion. */
export function SmoothScroll() {
  const { reducedMotion } = useMotion();
  usePreviewScrollLock();

  useEffect(() => {
    if (reducedMotion) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });
    active = lenis;

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
