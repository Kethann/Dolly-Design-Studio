"use client";

import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./Founder.module.css";

/** About the founder: a monogram card (until there's a photo) beside a short bio. */
export function Founder() {
  const { home, site } = useContent();
  const copy = home.founder;
  const initials = site.founder.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <section id="about" className={styles.section}>
      <div className={`container ${styles.layout}`}>
        <aside className={styles.card} aria-label={copy.label}>
          {copy.photo ? (
            <div className={styles.photo}>
              <Image src={versionedSrc(copy.photo)} alt={site.founder.name} fill sizes="260px" {...placeholderProps(copy.photo)} />
            </div>
          ) : (
            <div className={styles.monogram} aria-hidden="true">
              {initials}
            </div>
          )}
          <p className={styles.name} {...tx("site.founder.name")}>{site.founder.name}</p>
          <p className={styles.role} {...tx("site.founder.role")}>{site.founder.role}</p>
          <p className={styles.place}>{site.contact.location}</p>
        </aside>

        <div className={styles.story}>
          <span className={styles.label} {...tx("home.founder.label")}>{copy.label}</span>
          <h2 className={styles.title} {...tx("site.founder.name")}>{site.founder.name}</h2>
          {copy.paragraphs.map((p, i) => (
            <p key={i} className={styles.body} {...tx("home.founder.paragraphs")}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
