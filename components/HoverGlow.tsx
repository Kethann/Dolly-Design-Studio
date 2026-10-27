"use client";

import { useEffect, useRef } from "react";
import { useIntroSettings } from "@/lib/intro/settings-context";
import type { GlowPlace } from "@/lib/intro/settings";
import styles from "./HoverGlow.module.css";

/**
 * The cursor glow, for every place ticked in the portal. One controller for the whole page:
 * - logos (an <img> or inline <svg>): a light pool cut to the logo's own shape, with a soft halo;
 * - text (section titles, menu links): the letters near the cursor light up;
 * - posters: a soft sheen of light across the image.
 * The glow eases after the cursor and fades in and out smoothly. Colour, intensity and spread come from the portal.
 */
const PLACES: Record<GlowPlace, { selector: string; kind: "shape" | "text" | "sheen" }> = {
  heroLogo: { selector: '[data-glow="hero-logo"]', kind: "shape" },
  navLogo: { selector: '[data-glow="nav-logo"]', kind: "shape" },
  titles: { selector: "main h2", kind: "text" },
  links: { selector: "header nav a", kind: "text" },
  posters: { selector: '[data-glow="poster"]', kind: "sheen" },
};

function maskOf(el: Element) {
  if (el instanceof HTMLImageElement) return `url("${el.currentSrc || el.src}")`;
  const svg = el.cloneNode(true) as SVGElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg.outerHTML)}")`;
}

export function HoverGlow() {
  const { settings } = useIntroSettings();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { enabled, intensity, spread, color, places } = settings.logoGlow;
  const selector = (Object.keys(PLACES) as GlowPlace[])
    .filter((p) => places[p])
    .map((p) => PLACES[p].selector)
    .join(",");

  // Colour, strength and size, shared by every glow on the page.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--glow-color", color);
    root.setProperty("--glow-intensity", String(intensity));
    root.setProperty("--glow-spread", `${spread}px`);
  }, [color, intensity, spread]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !enabled || !selector || window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    const kindOf = (el: Element) => (Object.values(PLACES).find((p) => el.matches(p.selector))?.kind ?? "text");
    let active: Element | null = null;
    let kind: "shape" | "text" | "sheen" = "text";
    const target = { x: 0, y: 0 };
    const now = { x: 0, y: 0 };
    let raf = 0;

    function release() {
      if (!active) return;
      if (kind === "shape") overlay!.removeAttribute("data-on");
      else active.removeAttribute("data-glow-on");
      active = null;
    }
    function engage(el: Element, x: number, y: number) {
      release();
      active = el;
      kind = kindOf(el);
      const r = el.getBoundingClientRect();
      now.x = target.x = x - r.left;
      now.y = target.y = y - r.top;
      if (kind === "shape") {
        overlay!.style.setProperty("--mask", maskOf(el));
        place();
        overlay!.setAttribute("data-on", "");
      } else {
        const h = el as HTMLElement;
        if (kind === "text") h.setAttribute("data-glow-text", h.textContent?.trim() ?? "");
        else h.setAttribute("data-glow-sheen", "");
        if (getComputedStyle(h).position === "static") h.style.position = "relative";
        place();
        // Next frame, so the glow fades in from the cursor's spot rather than sliding across.
        requestAnimationFrame(() => active === el && h.setAttribute("data-glow-on", ""));
      }
    }
    function place() {
      if (!active) return;
      const el = kind === "shape" ? overlay! : (active as HTMLElement);
      if (kind === "shape") {
        const r = active.getBoundingClientRect();
        el.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
        el.style.width = `${r.width}px`;
        el.style.height = `${r.height}px`;
      }
      el.style.setProperty("--gx", `${now.x}px`);
      el.style.setProperty("--gy", `${now.y}px`);
    }
    function onMove(e: PointerEvent) {
      const hit = e.target instanceof Element ? e.target.closest(selector) : null;
      if (hit && hit !== active) engage(hit, e.clientX, e.clientY);
      if (active) {
        const r = active.getBoundingClientRect();
        // Logos stay lit while the cursor is just around them, so the halo can spill past the edges.
        const margin = kind === "shape" ? spread * 0.5 : 0;
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
        const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
        if (!hit && Math.hypot(dx, dy) > margin) return release();
        target.x = e.clientX - r.left;
        target.y = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(tick);
      }
    }
    function tick() {
      raf = 0;
      if (!active) return;
      now.x += (target.x - now.x) * 0.2;
      now.y += (target.y - now.y) * 0.2;
      place();
      if (Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.3) raf = requestAnimationFrame(tick);
    }
    function onScroll() {
      if (active && kind === "shape") place();
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.documentElement.addEventListener("pointerleave", release);
    return () => {
      release();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.removeEventListener("pointerleave", release);
      cancelAnimationFrame(raf);
    };
  }, [enabled, selector, spread]);

  if (!enabled) return null;
  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      {/* The blur sits outside the logo-shaped mask, so the halo can spread past the letters. */}
      <span className={styles.halo}>
        <span className={styles.shape} />
      </span>
      <span className={`${styles.shape} ${styles.core}`} />
    </div>
  );
}
