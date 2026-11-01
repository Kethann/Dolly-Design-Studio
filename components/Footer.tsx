"use client";

import { useContent } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { CreatorCredit } from "./CreatorCredit";
import styles from "./Footer.module.css";

/**
 * The foot of every page: the editable studio copyright and the separate code-only website credit. (The page links are not
 * repeated here: they are all in the menu bar at the top.)
 */
export function Footer() {
  const { site, footer } = useContent();
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.row}`}>
        <div className={`${styles.label} ${styles.studio}`} {...edSection("site", "menu", "Studio footer")}>
          © {year} {site.name}. {footer.rights}
        </div>
        <CreatorCredit />
      </div>
    </footer>
  );
}
