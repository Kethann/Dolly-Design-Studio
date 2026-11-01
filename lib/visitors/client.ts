import { MAX_PAGES, publicVisitPath, type VisitPage } from "./model";

export const CONSENT_KEY = "dds-visitor-consent-v1";
export function privacySignal(): boolean {
  return navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
export function savedConsent(): "allow" | "deny" | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null");
    return saved && Date.now() - saved.at < 90 * 86400_000 && ["allow", "deny"].includes(saved.choice) ? saved.choice : null;
  } catch { return null; }
}

/** One anonymous, in-memory visit. No fingerprint, persistent visitor ID, mouse recording or form interception. */
export function startVisitorTracking() {
  let id = crypto.randomUUID(), sequence = 0, pages: VisitPage[] = [], current = "";
  let started = Date.now();
  let lastTick = performance.now(), lastActive = Date.now(), lastSent = 0, stopped = false, ended = false;
  let pending: AbortController | null = null, failures = 0;
  const activity = () => {
    if ((Date.now() - lastActive > 30 * 60_000 || Date.now() - started > 86400_000) && !pending) { id = crypto.randomUUID(); pages = []; current = ""; sequence = 0; lastSent = 0; started = Date.now(); }
    lastActive = Date.now();
  };
  const events = ["pointerdown", "keydown", "scroll"] as const;
  for (const event of events) window.addEventListener(event, activity, { passive: true });
  const visible = () => { lastTick = performance.now(); if (!document.hidden) activity(); };
  document.addEventListener("visibilitychange", visible);
  function sample() {
    const now = performance.now();
    const seconds = Math.min(5, Math.max(0, Math.round((now - lastTick) / 1000))); lastTick = now;
    if (document.hidden || Date.now() - lastActive > 120_000 || privacySignal()) return false;
    let path = publicVisitPath(location.pathname);
    let depth = Math.round(100 * (scrollY + innerHeight) / Math.max(innerHeight, document.documentElement.scrollHeight));
    if (location.pathname === "/") {
      for (const section of document.querySelectorAll<HTMLElement>("main section[id]")) {
        const r = section.getBoundingClientRect();
        if (r.top <= innerHeight * .45 && r.bottom > innerHeight * .45) {
          path = publicVisitPath(`/#${section.id}`) ?? path;
          depth = Math.round(100 * (innerHeight - r.top) / Math.max(innerHeight, r.height)); break;
        }
      }
    }
    if (!path) return false;
    let page = pages.find(p => p.path === path);
    if (!page) {
      if (pages.length === MAX_PAGES) pages.shift();
      page = { path, seconds: 0, depth: 0, views: 0 }; pages.push(page);
    }
    if (current !== path) page.views = Math.min(1000, page.views + 1);
    current = path; page.seconds = Math.min(86400, page.seconds + seconds); page.depth = Math.max(page.depth, Math.min(100, Math.max(0, depth)));
    return true;
  }
  async function tick() {
    if (stopped || ended || !sample() || pending || Date.now() - lastSent < Math.min(300_000, 60_000 * 2 ** failures)) return;
    lastSent = Date.now(); const controller = new AbortController(); pending = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, id, sequence: ++sequence, current, pages }), signal: controller.signal });
      failures = response.ok ? 0 : Math.min(3, failures + 1);
    } catch { failures = Math.min(3, failures + 1); }
    finally { clearTimeout(timeout); if (pending === controller) pending = null; }
  }
  const finish = () => {
    if (stopped || ended || !pages.length || privacySignal()) return;
    sample(); ended = true;
    const payload = JSON.stringify({ consent: true, id, sequence: ++sequence, current, pages, ended: true });
    // Best effort: captures short visits too. Never block navigation or retry indefinitely.
    if (navigator.sendBeacon) navigator.sendBeacon("/api/visits", new Blob([payload], { type: "application/json" }));
  };
  const restore = (event: PageTransitionEvent) => {
    if (!event.persisted || stopped) return;
    id = crypto.randomUUID(); sequence = 0; pages = []; current = ""; lastSent = 0; ended = false; started = Date.now(); activity();
  };
  window.addEventListener("pagehide", finish);
  window.addEventListener("pageshow", restore);
  const timer = setInterval(() => { void tick(); }, 5000);
  void tick();
  return {
    stop() {
      stopped = true; clearInterval(timer); pending?.abort();
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pagehide", finish); window.removeEventListener("pageshow", restore);
    },
    async forget() {
      this.stop();
      const response = await fetch("/api/visits", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Tracking is off, but the current visit could not be deleted. Please retry.");
    },
  };
}
