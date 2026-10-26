import { site } from "@/content/site";
import { home } from "@/content/home";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import { LogoGlow } from "@/components/LogoGlow";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.logoBlock}>
        <h1 className="sr-only">
          {site.name} — {home.hero.screenReaderHeading}
        </h1>
        <div className={styles.logoFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img id={HERO_LOGO_ID} src="/images/brand/logo.svg" alt={site.name} width={1000} height={516} className={styles.logo} />
          <LogoGlow src="/images/brand/logo.svg" />
        </div>
        <p className={styles.disciplines}>{home.hero.disciplines.join(" · ")}</p>
      </div>

      <div className={styles.scrollHint} aria-hidden="true" />
    </section>
  );
}
