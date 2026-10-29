"use client";

import { useContent } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import styles from "./Footer.module.css";

/**
 * The foot of every page: the copyright line and where the studio is. (The page links are not
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
        <span className={`${styles.label} ${styles.place}`}>{site.contact.location}</span>
      </div>
    </footer>
  );
}
