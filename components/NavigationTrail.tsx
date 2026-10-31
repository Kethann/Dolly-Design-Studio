"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useContent } from "@/lib/content/context";
import { extraOf } from "@/lib/content/process";
import { plainFx } from "@/lib/content/text-effects";
import { advanceTrail, defaultTrail, HOME_SECTIONS, readTrail, trailHref, trailPath } from "@/lib/navigation-trail";
import { isPlainClick } from "@/lib/section-nav";
import styles from "./NavigationTrail.module.css";

type Trail = { route: string; paths: string[]; preview: boolean };
const TrailContext = createContext<Trail | null>(null);
const PrepareContext = createContext<(destination: string, section?: string) => void>(() => {});
export const useTrailNavigation = () => useContext(PrepareContext);
const STATE_KEY = "ddsNavigationTrail";

/** A short trail per browser history entry, not an ever-growing analytics/history log. */
export function NavigationTrailProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<Trail | null>(null);
  const latest = useRef<Trail | null>(null);
  const pending = useRef<{ to: string; paths: string[]; time: number } | null>(null);
  const prepare = useCallback((href: string, section?: string) => {
    const destination = trailPath(href), route = trailPath(location.pathname + location.hash);
    if (!destination || !route || destination === route) return;
    let paths = latest.current?.route === route ? latest.current.paths : defaultTrail(route);
    if (location.pathname === "/" && section && HOME_SECTIONS[section]) paths = advanceTrail(paths, `/#${section}`);
    pending.current = { to: destination, paths: advanceTrail(paths, destination), time: performance.now() };
  }, []);
  useEffect(() => {
    const arrive = () => {
      const route = trailPath(location.pathname + location.hash);
      if (!route) return;
      const next = pending.current;
      const paths = next?.to === route && performance.now() - next.time < 120_000
        ? next.paths : readTrail(history.state?.[STATE_KEY], route) ?? defaultTrail(route);
      pending.current = null;
      const value = { route, paths, preview: new URLSearchParams(location.search).has("portal-preview") };
      latest.current = value;
      setState(value);
      // Keep Next's internal history fields intact. Reload and browser Back/Forward retain this entry's trail.
      history.replaceState({ ...history.state, [STATE_KEY]: paths }, "");
    };
    arrive();
    window.addEventListener("popstate", arrive);
    window.addEventListener("hashchange", arrive);
    return () => { window.removeEventListener("popstate", arrive); window.removeEventListener("hashchange", arrive); };
  }, [pathname]);
  useEffect(() => {
    const capture = (event: MouseEvent) => {
      if (!isPlainClick(event) || document.documentElement.dataset.ddsDragged) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("[data-ed-ui]")) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      let to: URL;
      try { to = new URL(link.href, location.href); } catch { return; }
      if (to.origin !== location.origin) return;
      // A manually scrolled home page may still have an older hash in the address bar.
      prepare(to.pathname + to.hash, link.closest("section[id]")?.id);
    };
    // Observe; never cancel links or compete with the portal's navigation handler.
    window.addEventListener("click", capture, true);
    return () => window.removeEventListener("click", capture, true);
  }, [prepare]);
  return <PrepareContext.Provider value={prepare}><TrailContext.Provider value={state}>{children}</TrailContext.Provider></PrepareContext.Provider>;
}

/** Clear, clickable parents with a safe fallback when a page was opened directly. */
export function NavigationTrail() {
  const pathname = usePathname();
  const state = useContext(TrailContext);
  const { projects, home } = useContent();
  const paths = state?.route.split("#")[0] === pathname ? state.paths : defaultTrail(pathname);
  const preview = state?.preview ?? false;
  const label = (path: string) => {
    if (path === "/") return "Home";
    if (path === "/work") return "All work";
    if (path === "/breakdowns") return "Breakdowns";
    if (path.startsWith("/#")) return HOME_SECTIONS[path.slice(2)] ?? "Home";
    if (path.startsWith("/work/")) return plainFx(projects.find(p => p.slug === path.slice(6))?.title ?? "Project");
    return plainFx(home.process.cards.find(c => extraOf(c).slug === path.slice(9))?.title ?? "How we work");
  };
  // Deleted draft entries must not leave clickable links to pages that no longer exist.
  const visible = paths.filter((p, i) => i === paths.length - 1 || !p.startsWith("/work/") && !p.startsWith("/process/")
    || p.startsWith("/work/") && projects.some(project => project.slug === p.slice(6))
    || p.startsWith("/process/") && home.process.cards.some(c => extraOf(c).slug === p.slice(9)));
  const parent = visible.at(-2) ?? "/";
  return <nav className={styles.trail} aria-label="Breadcrumb" data-navigation-trail>
    <Link href={trailHref(parent, preview)} className={styles.back} aria-label={`Back to ${label(parent)}`} title={`Back to ${label(parent)}`} data-cursor="link"><span aria-hidden="true">←</span></Link>
    <ol>{visible.map((path, i) => <li key={path}>
      {i > 0 && <span className={styles.separator} aria-hidden="true">›</span>}
      {i === visible.length - 1 ? <span className={styles.current} aria-current="page">{label(path)}</span>
        : <Link href={trailHref(path, preview)} data-cursor="link">{label(path)}</Link>}
    </li>)}</ol>
  </nav>;
}
