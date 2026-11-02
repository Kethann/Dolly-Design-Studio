"use client";

import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { SocialLogo } from "@/components/SocialLogo";
import styles from "./Founder.module.css";
import { renderFx, plainFx } from "@/components/fx/render-fx";

/** About the founder: a glass profile card (portrait, name, role and a short description) beside the longer bio. */
export function Founder() {
  const { home, site } = useContent();
  const copy = home.founder;
  const plainName = plainFx(site.founder.name);
  const initials = plainName
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
                alt={copy.photoAlt || plainName}
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
          <p className={styles.name} {...tx("site.founder.name")}>{renderFx(site.founder.name)}</p>
          <p className={styles.role} {...tx("site.founder.role")}>{renderFx(site.founder.role)}</p>
          {copy.cardNote && (
            <p className={styles.note} {...tx("home.founder.cardNote")}>
              {renderFx(copy.cardNote)}
            </p>
          )}
        </aside>

        <div className={styles.story}>
          <span className={styles.label} {...tx("home.founder.label")}>{renderFx(copy.label)}</span>
          <h2 className={styles.title} {...tx("home.founder.heading")}>{renderFx(copy.heading)}</h2>
          {copy.pronunciation && <p className={styles.pronunciation} {...tx("home.founder.pronunciation")}>{renderFx(copy.pronunciation)}</p>}
          {copy.paragraphs.map((p, i) => (
            <p key={i} className={styles.body} {...tx("home.founder.paragraphs")}>
              {renderFx(p)}
            </p>
          ))}
          {copy.social.length > 0 && (
            <nav className={styles.social} aria-label={`${plainName} on social media`}>
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
