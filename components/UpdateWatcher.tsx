"use client";

import { useEffect, useState } from "react";
import styles from "./UpdateWatcher.module.css";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const RESUME = "dds-resume";

/** Remember where the visitor is, so the page can put them back after it reloads itself. */
function rememberPlace() {
  try {
    sessionStorage.setItem(RESUME, JSON.stringify({ url: window.location.pathname + window.location.search, y: Math.round(window.scrollY) }));
  } catch {}
}

/**
 * Keeps an already-open site current. It asks /api/version (never cached) whether a newer deploy is live: when the tab is
 * shown again, when the connection returns, and every few minutes. If there is one, the next link you press loads the new
 * version in full (instead of mixing old code with new pages), a tab you were away from refreshes by itself when you come
 * back, and a small "Updated, tap to refresh" note appears otherwise. Where you were on the page is kept.
 * (Not in development, where there is no deploy to compare with.)
 */
export function UpdateWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (MINE === "dev") return;
    let isStale = false;
    let checking = false;

    const check = async () => {
      if (isStale || checking) return;
      checking = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const data = (await res.json()) as { id?: string };
        if (data.id && data.id !== MINE) {
          isStale = true;
          setStale(true);
        }
      } catch {
        // offline or a hiccup: try again next time
      }
      checking = false;
    };

    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Back after being away: a stale tab refreshes itself now (nothing is being read or typed at this moment).
      if (isStale && hiddenAt && Date.now() - hiddenAt > 15_000 && !document.querySelector("form :focus")) {
        rememberPlace();
        window.location.assign(window.location.href);
      } else void check();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check();
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

    void check();
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
  }, []);

  if (!stale) return null;
  return (
    <button
      type="button"
      className={styles.note}
      data-chrome
      onClick={() => {
        rememberPlace();
        window.location.assign(window.location.href);
      }}
    >
      <span aria-hidden="true">✦</span> Updated, tap to refresh
    </button>
  );
}
