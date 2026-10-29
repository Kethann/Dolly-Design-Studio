"use client";

import { useContent } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import styles from "./Footer.module.css";

/**
 * The foot of every page: the copyright line, the studio's social links and where it is. (The page links are not
 * repeated here: they are all in the menu bar at the top.)
 */
export function Footer() {
  const { site, footer } = useContent();
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer} {...edSection("site", "menu", "Menu & footer")}>
      <div className={`container ${styles.row}`}>
        <span className={styles.label}>
          © {year} {site.name}. {footer.rights}
        </span>
        {site.social.length > 0 && (
          <nav className={styles.links} aria-label="Social links">
            {site.social.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" data-cursor="link">
                {s.label}
              </a>
            ))}
          </nav>
        )}
        <span className={`${styles.label} ${styles.place}`}>{site.contact.location}</span>
      </div>
    </footer>
  );
}
