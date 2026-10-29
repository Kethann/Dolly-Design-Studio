"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useContent } from "@/lib/content/context";
import { LOGO_BODY_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { goToSection, isPlainClick } from "@/lib/section-nav";
import { DEFAULT_MENU_TONES } from "@/lib/content/types";
import { NavIcon } from "./NavIcon";
import styles from "./Nav.module.css";

export function Nav() {
  const { site, nav: navItems } = useContent();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const linksRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  /** Where the spotlight sits (over the current item), and whether it may glide there (not on the very first placing). */
  const [beam, setBeam] = useState<{ left: number; width: number; lift: number; animate: boolean } | null>(null);
  /** An item's lamp colour: the portal's, else the one it starts with. */
  const toneOf = (id: string) => `var(--tone-${id}, ${DEFAULT_MENU_TONES[id] ?? "#ffc857"})`;

  // The item for the place you are: the full gallery (and a project on the home page), the Breakdowns page (it belongs to
  // "How we work"), or the home-page section in view.
  const activeId =
    pathname.startsWith("/work") ? "work" : pathname.startsWith("/breakdowns") ? "process" : pathname === "/" ? activeSection || null : null;

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
  }, [pathname, navItems]);

  // Keep the spotlight over the current item, and glide it along when the item changes.
  useEffect(() => {
    const place = (animate: boolean) => {
      const el = activeId ? linkRefs.current[activeId] : null;
      // (lift: how far the bar's top is above the items, so the lamp's light starts at the top of the screen)
      if (el) setBeam({ left: el.offsetLeft, width: el.offsetWidth, lift: (linksRef.current?.getBoundingClientRect().top ?? 0) - (linksRef.current?.closest("header")?.getBoundingClientRect().top ?? 0), animate });
    };
    place(false);
    const raf = requestAnimationFrame(() => place(true));
    const box = linksRef.current;
    const ro = box ? new ResizeObserver(() => place(false)) : null;
    if (box) ro?.observe(box);
    void document.fonts?.ready.then(() => place(false));
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [activeId, navItems]);

  /**
   * Already on the home page, a link to it (the logo, or a section) glides there and adds a step to the browser's
   * history, so Back returns to where you were. Elsewhere, links navigate normally.
   */
  const glideOnHome = (id?: string) => (e: React.MouseEvent) => {
    if (pathname !== "/" || !isPlainClick(e)) return;
    e.preventDefault();
    setOpen(false);
    // Next frame, once the mobile menu has closed and the page can scroll again.
    requestAnimationFrame(() => goToSection(id));
  };

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={styles.nav} data-chrome>
      <Link
        href="/"
        className={styles.brand}
        data-cursor="link"
        data-cursor-logo
        aria-label={`${site.name} — home`}
        onClick={glideOnHome()}
      >
        <svg
          data-glow="nav-logo"
          className={styles.monogram}
          viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
          aria-hidden="true"
        >
          <path d={LOGO_BODY_PATH} fill="var(--gold-bright)" fillRule="evenodd" />
        </svg>
        <span className={styles.brandName}>{site.shortName}</span>
      </Link>

      <nav ref={linksRef} className={styles.links} aria-label="Primary" data-lit={!!activeId}>
        {/* The light under the current item, in that item's own colour. It glides from item to item; the other items dim. */}
        <span
          className={styles.beam}
          data-on={!!activeId && !!beam}
          data-animate={beam?.animate}
          aria-hidden="true"
          style={{ left: beam?.left, width: beam?.width, ["--lift" as string]: `${beam?.lift ?? 0}px`, ["--tone" as string]: toneOf(activeId ?? "agency") }}
        />
        {navItems.map((item) => {
          const href = item.id === "work" ? "/work" : `/#${item.id}`;
          const isActive = item.id === activeId;
          return (
            <Link
              key={item.id}
              ref={(el) => {
                linkRefs.current[item.id] = el;
              }}
              href={href}
              data-cursor="link"
              aria-current={isActive ? "page" : undefined}
              className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              style={{ ["--tone" as string]: toneOf(item.id) }}
              onClick={item.id === "work" ? undefined : glideOnHome(item.id)}
            >
              <NavIcon id={item.id} className={styles.icon} />
              <span>{item.label}</span>
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
              className={`${styles.mobileLink} ${item.id === activeId ? styles.mobileActive : ""}`}
              style={{ ["--tone" as string]: toneOf(item.id) }}
              onClick={item.id === "work" ? () => setOpen(false) : glideOnHome(item.id)}
            >
              <NavIcon id={item.id} className={styles.mobileIcon} />
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
