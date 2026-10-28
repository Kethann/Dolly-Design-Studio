"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { glideTo, jumpTo } from "@/lib/smooth-scroll";

const STORE = "dds-scroll-positions";

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

const pageKey = () => window.location.pathname + window.location.search;

/**
 * Makes Back and Forward behave: the browser's own scroll restoration can't be trusted on a page whose height settles
 * late (images, pinned scenes), so the site remembers where you were on each page and puts you back there exactly.
 *
 *   • Back / Forward to another page → the scroll position you left that page at (or its hash section, or the top).
 *   • Back / Forward between sections of the same page (the menu adds a step for each) → glides to that section.
 *
 * Nothing here runs inside the portal's preview.
 */
export function NavHistory() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const popped = useRef(false);
  const positions = useRef<Record<string, number>>({});

  // Remember where you are on each page.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("portal-preview")) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // restored below, exactly
    positions.current = readPositions();
    let raf = 0;
    const save = () => {
      raf = 0;
      positions.current[pageKey()] = Math.round(window.scrollY);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(save);
    };
    const persist = () => {
      try {
        sessionStorage.setItem(STORE, JSON.stringify(positions.current));
      } catch {}
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
      persist();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Back / Forward.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("portal-preview")) return;
    lastPath.current = window.location.pathname;
    const onPop = () => {
      if (window.location.pathname !== lastPath.current) {
        popped.current = true; // another page: restored once it has appeared (below)
        return;
      }
      // The same page: a step between sections.
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      glideTo(el ?? 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A page has appeared after Back / Forward: put the scroll back where it was, waiting for the page to be tall enough.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("portal-preview")) return;
    const arrivedByHistory = popped.current;
    popped.current = false;
    lastPath.current = window.location.pathname;
    if (!arrivedByHistory) return;

    const saved = positions.current[pageKey()];
    const id = decodeURIComponent(window.location.hash.slice(1));
    let raf = 0;
    const started = performance.now();
    const attempt = () => {
      const el = id ? document.getElementById(id) : null;
      const target = saved ?? (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : 0);
      const reachable = document.documentElement.scrollHeight - window.innerHeight;
      jumpTo(Math.min(target, Math.max(0, reachable)));
      // Keep trying until the page is tall enough to reach it (images and pinned scenes settle late), then stop.
      if (Math.abs(window.scrollY - target) > 2 && performance.now() - started < 2500) raf = requestAnimationFrame(attempt);
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
