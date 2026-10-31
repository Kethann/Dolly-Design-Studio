"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { glideTo, jumpTo, topOf } from "@/lib/smooth-scroll";
import { hashSection } from "@/lib/navigation-trail";

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
 *   • A link or a fresh load that ends in #section → lands exactly on that section once the page has settled.
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
    const previousRestoration = history.scrollRestoration;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // restored below, exactly
    positions.current = readPositions();
    // An update just reloaded the page (see UpdateWatcher): put the visitor back where they were.
    try {
      const resume = JSON.parse(sessionStorage.getItem("dds-resume") ?? "null") as { url: string; y: number } | null;
      sessionStorage.removeItem("dds-resume");
      if (resume && resume.url === window.location.pathname + window.location.search && !window.location.hash) {
        let tries = 0;
        const put = () => {
          jumpTo(Math.min(resume.y, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)));
          if (Math.abs(window.scrollY - resume.y) > 2 && ++tries < 40) requestAnimationFrame(put);
        };
        requestAnimationFrame(put);
      }
    } catch {}
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
      if ("scrollRestoration" in history) history.scrollRestoration = previousRestoration;
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
      const id = hashSection(window.location.hash);
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
    const id = hashSection(window.location.hash);
    // Arrived by a link (or a fresh load) with no #section: Next puts the page at the top itself.
    if (!arrivedByHistory && !id) return;

    const saved = arrivedByHistory ? positions.current[pageKey()] : undefined;
    const clearBar = pathname !== "/"; // inner pages: land just under the menu bar
    let raf = 0;
    let stop = false;
    const halt = () => {
      stop = true;
    };
    window.addEventListener("wheel", halt, { passive: true });
    window.addEventListener("touchstart", halt, { passive: true });
    window.addEventListener("keydown", halt);
    const started = performance.now();
    const WINDOW_MS = 4000; // how long the landing keeps itself right while the page settles
    const attempt = () => {
      raf = 0;
      const el = id ? document.getElementById(id) : null;
      const age = performance.now() - started;
      if (stop || age > WINDOW_MS) return;
      if (!arrivedByHistory && !el && age > 2500) return;
      const target = saved ?? (el ? topOf(el, clearBar) : 0);
      const reachable = document.documentElement.scrollHeight - window.innerHeight;
      jumpTo(Math.min(target, Math.max(0, reachable)));
      // Until the page has settled (images and the pinned scene change its height late) keep re-aiming. A visitor who
      // scrolls by hand first is never fought: it ends at the first wheel / touch / key.
      if (Math.abs(window.scrollY - target) > 2 || age < 900) raf = requestAnimationFrame(attempt);
    };
    // Whenever the page's height changes during that time, aim again (the loop above may already have rested).
    const ro = new ResizeObserver(() => {
      if (!raf && !stop && performance.now() - started <= WINDOW_MS) raf = requestAnimationFrame(attempt);
    });
    ro.observe(document.body);
    raf = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("wheel", halt);
      window.removeEventListener("touchstart", halt);
      window.removeEventListener("keydown", halt);
    };
  }, [pathname]);

  return null;
}
