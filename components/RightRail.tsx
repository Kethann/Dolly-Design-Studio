"use client";

import { useEffect, useState } from "react";
import { railSections } from "@/content/site";
import { goToSection, isPlainClick } from "@/lib/section-nav";
import styles from "./RightRail.module.css";

/** A right-edge rail of 2:3 mini-frames marking each section; the current one lights up. */
export function RightRail() {
  const [active, setActive] = useState<string | undefined>(railSections[0]?.id as string | undefined);

  useEffect(() => {
    // The lit frame is the last section that has started above the reading line (a little above the middle of the screen),
    // worked out from where the sections actually are. It is re-worked on every scroll, on resize, when the page is shown
    // again (back/forward) and whenever the page's height changes (images and fonts arriving), so it can never be left
    // pointing at the wrong section, however fast the page is scrolled or jumped.
    let raf = 0;
    const find = () => {
      raf = 0;
      const line = window.innerHeight * 0.45;
      let current: string | undefined = railSections[0]?.id;
      for (const s of railSections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      // At the very bottom of the page the last section is the current one, even if it is too short to reach the line.
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) current = railSections[railSections.length - 1]?.id ?? current;
      setActive(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(find);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("hashchange", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("load", schedule);
      window.removeEventListener("hashchange", schedule);
      ro.disconnect();
    };
  }, []);

  return (
    <nav className={styles.rail} aria-label="Section progress">
      {railSections.map((s) => (
        <a
          key={s.id}
          href={`/#${s.id}`}
          data-cursor="link"
          onClick={(e) => {
            if (!isPlainClick(e)) return;
            if (goToSection(s.id)) e.preventDefault();
          }}
          aria-label={s.label}
          aria-current={active === s.id ? "true" : undefined}
          className={`${styles.frame} ${active === s.id ? styles.active : ""}`}
        />
      ))}
    </nav>
  );
}
