"use client";

import { useEffect, useRef } from "react";
import styles from "./ScrollProgress.module.css";

/**
 * A thin gold gradient line across the top of the page that fills as you
 * scroll — complete when you reach the bottom. Replaces the native scrollbar.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let shown = -1;

    function update() {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (Math.abs(progress - shown) < 0.0005) return;
      shown = progress;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Page height changes as images load or content reveals — keep the line accurate.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={styles.track} data-chrome aria-hidden="true">
      <div ref={barRef} className={styles.bar} data-scroll-progress="" />
    </div>
  );
}
