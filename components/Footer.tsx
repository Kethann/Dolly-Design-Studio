import Link from "next/link";
import { navItems, site } from "@/content/site";
import { footer } from "@/content/pages";
import styles from "./Footer.module.css";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.row}`}>
        <span className={styles.label}>
          © {year} {site.name}. {footer.rights}
        </span>
        <nav className={styles.links} aria-label="Footer">
          {navItems.map((item) => (
            <Link key={item.id} href={item.id === "work" ? "/work" : `/#${item.id}`} data-cursor="link">
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
