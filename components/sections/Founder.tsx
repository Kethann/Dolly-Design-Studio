"use client";

import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { SocialLogo } from "@/components/SocialLogo";
import styles from "./Founder.module.css";

/** About the founder: a glass profile card (portrait, name, role and a short description) beside the longer bio. */
export function Founder() {
  const { home, site } = useContent();
  const copy = home.founder;
  const initials = site.founder.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <section id="about" className={styles.section} {...edSection("home", "founder", "About the founder")}>
      <div className={`container ${styles.layout}`}>
        <aside className={`glass-panel ${styles.card}`} aria-label={copy.label}>
          {copy.photo ? (
            <div className={styles.photo} data-shape={copy.photoShape} data-size={copy.photoSize}>
              <Image
                src={versionedSrc(copy.photo)}
                alt={copy.photoAlt || site.founder.name}
                fill
                sizes="260px"
                style={{ objectPosition: `${copy.photoX}% ${copy.photoY}%`, transformOrigin: `${copy.photoX}% ${copy.photoY}%`, transform: `scale(${copy.photoZoom})` }}
                {...placeholderProps(copy.photo)}
              />
            </div>
          ) : (
            <div className={styles.monogram} data-shape={copy.photoShape} data-size={copy.photoSize} aria-hidden="true">
              {initials}
            </div>
          )}
          <p className={styles.name} {...tx("site.founder.name")}>{site.founder.name}</p>
          <p className={styles.role} {...tx("site.founder.role")}>{site.founder.role}</p>
          {copy.cardNote && (
            <p className={styles.note} {...tx("home.founder.cardNote")}>
              {copy.cardNote}
            </p>
          )}
        </aside>

        <div className={styles.story}>
          <span className={styles.label} {...tx("home.founder.label")}>{copy.label}</span>
          <h2 className={styles.title} {...tx("site.founder.name")}>{site.founder.name}</h2>
          {copy.paragraphs.map((p, i) => (
            <p key={i} className={styles.body} {...tx("home.founder.paragraphs")}>
              {p}
            </p>
          ))}
          {copy.social.length > 0 && (
            <nav className={styles.social} aria-label={`${site.founder.name} on social media`}>
              {copy.social.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" data-cursor="link" aria-label={s.label} title={s.label}>
                  <SocialLogo label={s.label} />
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
