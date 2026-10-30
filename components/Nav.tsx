"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useContent } from "@/lib/content/context";
import { LOGO_BODY_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { glideLock, glideLocked, goToSection, isPlainClick } from "@/lib/section-nav";
import { freezeScroll, releaseScroll } from "@/lib/smooth-scroll";
import { DEFAULT_MENU_TONES } from "@/lib/content/types";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { NavIcon } from "./NavIcon";
import styles from "./Nav.module.css";

/** The corner logo's own shape, as a mask: the colour effect is cut to the letters, so it lights the logo and nothing around it. */
const LOGO_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}'><path d='${LOGO_BODY_PATH}' fill-rule='evenodd'/></svg>`,
)}")`;

/** How far the glass pane reaches past the menu items on each side, and how far its sides sweep in towards the bottom. */
const PANE_EXT = 30;
const PANE_SWEEP = 22;

/** The glass pane's outline: flush along the top, sides that slant in (a slim, nearly straight cut), and a straight bottom. */
function panePath(w: number, h: number, close: boolean) {
  const f = PANE_SWEEP;
  const d = `M 0 0 C ${(0.1 * f).toFixed(1)} ${(0.35 * h).toFixed(1)} ${(0.55 * f).toFixed(1)} ${(0.85 * h).toFixed(1)} ${f} ${h} L ${(w - f).toFixed(1)} ${h} C ${(w - 0.55 * f).toFixed(1)} ${(0.85 * h).toFixed(1)} ${(w - 0.1 * f).toFixed(1)} ${(0.35 * h).toFixed(1)} ${w} 0`;
  return close ? `${d} Z` : d;
}

export function Nav() {
  const { site, nav: navItems } = useContent();
  const pathname = usePathname();
  const { settings } = useIntroSettings();
  // The portal's "Corner logo (top left)" glow switch decides whether the logo takes the colour effect when the cursor is on it.
  const logoGlowOn = settings.logoGlow.enabled && settings.logoGlow.places.navLogo;
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  /** The corner logo: hidden on the first section of the home page (the big logo is there), then eased in. */
  const [pastFirst, setPastFirst] = useState(false);
  const logoShown = pathname !== "/" || pastFirst;
  const linksRef = useRef<HTMLElement>(null);
  /** The size of the glass pane behind the menu items: sized to them, so its shape is exact at every width. */
  const [pane, setPane] = useState<{ w: number; h: number; pad: number } | null>(null);
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
    // Every section of the home page, and the menu item each one belongs to ("" = none: the intro, and the making stills).
    // The projects slate belongs to "Projects".
    const ITEM_OF: Record<string, string> = { top: "", agency: "agency", clients: "clients", about: "about", collaborations: "work", work: "work", process: "process", making: "", services: "services", contact: "contact" };
    const sections = Object.keys(ITEM_OF).map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!sections.length) return;
    // The section across the reading line (just above the middle of the screen) is the one you are in. Worked out from where
    // the sections are, so even a very tall section (the pinned slate) is found correctly.
    let settle = 0;
    const find = () => {
      // Pressed an item and the page is gliding there: the highlight is already on it and stays (checked once more when the glide ends).
      if (glideLocked()) {
        setActiveSection(ITEM_OF[glideLock.id] ?? "");
        window.clearTimeout(settle);
        settle = window.setTimeout(find, Math.max(40, glideLock.until - performance.now() + 40));
        return;
      }
      const line = window.innerHeight * 0.45;
      const here = sections.find((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= line && r.bottom > line;
      });
      // In a gap between two sections (the numbers under the agency text) the highlight stays where it was, rather than going out and coming back.
      setActiveSection((prev) => (here ? (ITEM_OF[here.id] ?? "") : prev));
    };
    const io = new IntersectionObserver(find, { rootMargin: "-40% 0px -50% 0px", threshold: [0, 1] });
    sections.forEach((s) => io.observe(s));
    const ro = new ResizeObserver(find); // the page's height changed (images and fonts arriving)
    ro.observe(document.body);
    window.addEventListener("scroll", find, { passive: true });
    window.addEventListener("resize", find);
    window.addEventListener("pageshow", find);
    find();
    return () => {
      window.clearTimeout(settle);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", find);
      window.removeEventListener("resize", find);
      window.removeEventListener("pageshow", find);
    };
  }, [pathname, navItems]);

  useEffect(() => {
    if (pathname !== "/") return;
    // On the home page the logo appears once the second section is reached (the first section's bottom is above the middle
    // of the screen), and goes again if you come back to the top.
    const check = () => {
      const first = document.getElementById("top");
      setPastFirst(!first || first.getBoundingClientRect().bottom < window.innerHeight * 0.55);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [pathname]);

  useEffect(() => {
    const box = linksRef.current;
    if (!box) return;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(box.closest("header") ?? box).getPropertyValue("--nav-pad")) || 24;
      setPane({ w: box.offsetWidth + 2 * PANE_EXT, h: box.offsetHeight + pad, pad });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

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

  // While the mobile menu is open the page behind it must not scroll (Lenis would keep scrolling a page that only has overflow hidden).
  useEffect(() => {
    if (!open) return;
    freezeScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseScroll();
    };
  }, [open]);

  // Any change of page (a link, Back, Forward) closes the menu.
  useEffect(() => {
    setOpen(false); // eslint-disable-line react-hooks/set-state-in-effect -- close the menu when the page changes
  }, [pathname]);

  // A menu left open when the window grows past the phone layout would leave the page frozen with no menu visible.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 860px)");
    const close = () => mq.matches && setOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  return (
    <header className={styles.nav} data-chrome>
      <Link
        href="/"
        className={styles.brand}
        data-cursor="link"
        data-cursor-logo
        data-shown={logoShown}
        tabIndex={logoShown ? undefined : -1}
        aria-hidden={logoShown ? undefined : true}
        aria-label={`${site.name} — home`}
        onClick={glideOnHome()}
      >
        {/* The logo carries the random glass colours: where the cursor is on it, the letters glow in the colour there. */}
        <span className={`${logoGlowOn ? "glass-glow " : ""}${styles.brandGlow}`} style={{ ["--logo-mask" as string]: LOGO_MASK }}>
          <svg className={styles.monogram} viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} aria-hidden="true">
            <path d={LOGO_BODY_PATH} fill="var(--gold-bright)" fillRule="evenodd" />
          </svg>
        </span>
      </Link>

      <nav ref={linksRef} className={styles.links} aria-label="Primary" data-lit={!!activeId}>
        {/* The pane of glass behind the items: it hangs from the top of the screen, its sides slant in, and its bottom
            stops just under the glowing line. It is drawn to the exact size of the menu (a clipped frosted layer, an outline
            and a soft shadow). */}
        {pane && (
          <>
            <span className={styles.pane} aria-hidden="true" style={{ left: -PANE_EXT, top: -pane.pad, width: pane.w, height: pane.h, clipPath: `path("${panePath(pane.w, pane.h, true)}")` }} />
            <svg className={styles.paneEdge} aria-hidden="true" style={{ left: -PANE_EXT, top: -pane.pad, width: pane.w, height: pane.h + 24 }} viewBox={`0 0 ${pane.w} ${pane.h + 24}`}>
              <defs>
<linearGradient id="nav-pane-edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={pane.w} y2="0">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
                  <stop offset="0.1" stopColor="#fff" stopOpacity="0.28" />
                  <stop offset="0.5" stopColor="#fff" stopOpacity="0.16" />
                  <stop offset="0.9" stopColor="#fff" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0.75" />
                </linearGradient>
                <filter id="nav-pane-shadow" x="-10%" y="-10%" width="120%" height="160%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
              </defs>
              <path d={panePath(pane.w, pane.h, true)} transform="translate(0 12)" fill="rgba(0,0,0,0.42)" filter="url(#nav-pane-shadow)" />
              <path d={panePath(pane.w, pane.h, false)} fill="none" stroke="url(#nav-pane-edge)" strokeWidth="1.2" strokeLinecap="round" />
              <path d={panePath(pane.w, pane.h, false)} fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="1" strokeLinecap="round" transform="translate(0 -2)" />
            </svg>
          </>
        )}
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
