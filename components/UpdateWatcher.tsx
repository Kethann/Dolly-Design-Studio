"use client";

import { useEffect, useState } from "react";
import styles from "./UpdateWatcher.module.css";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const RESUME = "dds-resume";
/** The version a reload was last tried for (sessionStorage), so a page that comes back unchanged can't loop. */
const TRIED = "dds-update-tried";

/** Remember where the visitor is, so the page can put them back after it reloads itself. */
function rememberPlace() {
  try {
    sessionStorage.setItem(RESUME, JSON.stringify({ url: window.location.pathname + window.location.search, y: Math.round(window.scrollY) }));
  } catch {}
}

/**
 * Keeps an already-open site current. It asks /api/version (never cached) whether a newer deploy is live: as the page opens,
 * when the tab is shown again (a phone restoring a tab from memory included), when the connection returns, and every few
 * minutes. If there is one, the page reloads itself at a moment nothing is lost: as it opens, or as you come back to it.
 * While you're reading it never pulls the page from under you: a small "Updated, tap to refresh" note appears instead, and
 * the next link you press loads the new version in full (instead of mixing old code with new pages). Where you were on the
 * page is kept and the opening isn't replayed (see app/layout.tsx). It reloads once per new version at most, so a copy of the
 * page held somewhere on the way can never set off a loop. (Not in development, where there is no deploy to compare with.)
 */
export function UpdateWatcher({ portal = false }: { portal?: boolean }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (MINE === "dev") return;
    let isStale = false;
    let latest = "";
    let checking: Promise<boolean> | null = null;

    const check = () => {
      if (isStale) return Promise.resolve(true);
      checking ??= (async () => {
        try {
          const res = await fetch("/api/version", { cache: "no-store" });
          const data = (await res.json()) as { id?: string };
          if (data.id && data.id !== MINE) {
            latest = data.id;
            isStale = true;
            setStale(true);
          }
        } catch {
          // offline or a hiccup: try again next time
        }
        checking = null;
        return isStale;
      })();
      return checking;
    };

    /** Loads the new version now, unless that would lose something; once per version, so it can never loop. */
    const reloadNow = () => {
      if (portal || document.querySelector("form :focus")) return;
      try {
        if (sessionStorage.getItem(TRIED) === latest) return;
        sessionStorage.setItem(TRIED, latest);
      } catch {
        return; // can't remember the attempt: the note is the safe way
      }
      rememberPlace();
      window.location.reload(); // a true reload: assigning the same address with a #section in it would only scroll
    };

    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Back after being away: an out-of-date tab refreshes itself now (nothing is being read or typed at this moment).
      const away = hiddenAt > 0 && Date.now() - hiddenAt > 15_000;
      void check().then((old) => { if (old && away) reloadNow(); });
    };
    // A tab the browser kept in memory and has just put back (switching tabs on a phone, the back button): it may be from
    // before the last update, and the visitor has only just arrived on it.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check().then((old) => { if (old) reloadNow(); });
    };
    const onFocus = () => void check();
    // A link pressed while out of date loads the new version whole.
    const onClick = (e: MouseEvent) => {
      if (!isStale || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) return; // same page: a section glide
      e.preventDefault();
      window.location.assign(a.href);
    };

    // As the page opens: a copy from before the last update is swapped for the new one before anyone starts reading.
    const opened = performance.now();
    void check().then((old) => { if (old && performance.now() - opened < 6000) reloadNow(); });
    const timer = window.setInterval(() => void check(), 5 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("click", onClick, true);
    };
  }, [portal]);

  if (!stale) return null;
  return (
    <button
      type="button"
      className={styles.note}
      data-chrome
      onClick={() => {
        if (portal && !window.confirm("Save any portal changes before refreshing. Refresh now?")) return;
        rememberPlace();
        window.location.reload(); // a true reload: assigning the same address with a #section in it would only scroll
      }}
    >
      <span aria-hidden="true">✦</span> {portal ? "Portal updated — save changes, then refresh" : "Updated, tap to refresh"}
    </button>
  );
}
