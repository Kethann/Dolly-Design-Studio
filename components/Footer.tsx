"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { goToSection, isPlainClick } from "@/lib/section-nav";
import { useContent } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import styles from "./Footer.module.css";

export function Footer() {
  const { site, nav: navItems, footer } = useContent();
  const pathname = usePathname();
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer} {...edSection("site", "menu", "Menu & footer")}>
      <div className={`container ${styles.row}`}>
        <span className={styles.label}>
          © {year} {site.name}. {footer.rights}
        </span>
        <nav className={styles.links} aria-label="Footer">
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.id === "work" ? "/work" : `/#${item.id}`}
              data-cursor="link"
              onClick={(e) => {
                if (item.id === "work" || pathname !== "/" || !isPlainClick(e)) return;
                if (goToSection(item.id)) e.preventDefault();
              }}
            >
              {item.label}
            </Link>
          ))}
          {site.social.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer" data-cursor="link">
              {s.label}
            </a>
          ))}
        </nav>
        <span className={styles.label}>{site.contact.location}</span>
      </div>
    </footer>
  );
}
