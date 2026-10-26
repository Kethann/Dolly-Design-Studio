"use client";

import { useEffect, useState } from "react";
import { railSections } from "@/content/site";
import styles from "./RightRail.module.css";

/** A right-edge rail of 2:3 mini-frames marking each section; the current one lights up. */
export function RightRail() {
  const [active, setActive] = useState<string | undefined>(railSections[0]?.id);

  useEffect(() => {
    const sections = railSections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <nav className={styles.rail} aria-label="Section progress">
      {railSections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          data-cursor="link"
          aria-label={s.label}
          aria-current={active === s.id ? "true" : undefined}
          className={`${styles.frame} ${active === s.id ? styles.active : ""}`}
        />
      ))}
    </nav>
  );
}
