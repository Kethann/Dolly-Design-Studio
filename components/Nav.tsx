"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navItems, site } from "@/content/site";
import { LOGO_BODY_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { glideTo } from "@/lib/smooth-scroll";
import styles from "./Nav.module.css";

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (pathname !== "/") return;
    const sections = navItems.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  /**
   * Already on the home page, a link to it (the logo, or a section) glides there — even when the address already
   * matches, where a plain link would do nothing. Elsewhere, links navigate normally.
   */
  const glideOnHome = (id?: string) => (e: React.MouseEvent) => {
    if (pathname !== "/" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setOpen(false);
    // Next frame, once the mobile menu has closed and the page can scroll again.
    requestAnimationFrame(() => {
      glideTo((id && document.getElementById(id)) || 0);
      window.history.replaceState(window.history.state, "", id ? `/#${id}` : "/");
    });
  };

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={styles.nav}>
      <Link
        href="/"
        className={styles.brand}
        data-cursor="link"
        data-cursor-logo
        aria-label={`${site.name} — home`}
        onClick={glideOnHome()}
      >
        <svg data-glow="nav-logo" className={styles.monogram} viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} aria-hidden="true">
          <path d={LOGO_BODY_PATH} fill="var(--gold-bright)" fillRule="evenodd" />
        </svg>
        <span className={styles.brandName}>{site.shortName}</span>
      </Link>

      <nav className={styles.links} aria-label="Primary">
        {navItems.map((item) => {
          const href = item.id === "work" ? "/work" : `/#${item.id}`;
          const isActive = item.id === "work" ? pathname.startsWith("/work") : pathname === "/" && activeSection === item.id;
          return (
            <Link
              key={item.id}
              href={href}
              data-cursor="link"
              className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              onClick={item.id === "work" ? undefined : glideOnHome(item.id)}
            >
              {item.label}
              <span className={styles.dot} />
            </Link>
          );
        })}
      </nav>

      <div className={styles.right}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-cursor="link"
        >
          <span style={open ? { transform: "translateY(3.25px) rotate(45deg)" } : undefined} />
          <span style={open ? { opacity: 0 } : undefined} />
          <span style={open ? { transform: "translateY(-3.25px) rotate(-45deg)" } : undefined} />
        </button>
      </div>

      {open && (
        <div className={styles.mobileMenu}>
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.id === "work" ? "/work" : `/#${item.id}`}
              className={styles.mobileLink}
              onClick={item.id === "work" ? () => setOpen(false) : glideOnHome(item.id)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
