"use client";

import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./Founder.module.css";

/** The studio's social links as their own logos (Instagram, X and IMDb), drawn here so they need no downloads. They are drawn in
 *  one colour (the glass button's own light), not their brand colours. */
function SocialLogo({ label }: { label: string }) {
  const n = label.trim().toLowerCase();
  if (n === "instagram")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
      </svg>
    );
  if (n === "x" || n === "twitter")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  if (n === "imdb")
    return (
      <svg viewBox="0 0 44 22" aria-hidden="true">
        <text x="22" y="17" textAnchor="middle" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="17" fill="currentColor">
          IMDb
        </text>
      </svg>
    );
  return <span>{label}</span>;
}

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
              <Image src={versionedSrc(copy.photo)} alt={copy.photoAlt || site.founder.name} fill sizes="260px" {...placeholderProps(copy.photo)} />
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
          {site.social.length > 0 && (
            <nav className={styles.social} aria-label={`${site.founder.name} on social media`}>
              {site.social.map((s) => (
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
