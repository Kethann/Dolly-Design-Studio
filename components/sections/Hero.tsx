"use client";

import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import styles from "./Hero.module.css";

export function Hero() {
  const { site, home } = useContent();
  return (
    <section id="top" className={styles.hero} {...edSection("home", "intro", "Under the logo")}>
      <div className={styles.logoBlock}>
        <h1 className="sr-only">
          {site.name} — {home.hero.screenReaderHeading}
        </h1>
        <div className={styles.logoFrame} data-cursor-logo>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img id={HERO_LOGO_ID} src="/images/brand/logo.svg" alt={site.name} width={1000} height={516} className={styles.logo} data-glow="hero-logo" />
        </div>
        <p className={styles.disciplines} {...tx("home.hero.disciplines")}>{home.hero.disciplines.join(" · ")}</p>
      </div>

      <div className={styles.scrollHint} aria-hidden="true" />
    </section>
  );
}
