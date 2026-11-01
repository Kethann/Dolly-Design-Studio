"use client";
import { useEffect, useRef, useState } from "react";
import { CONSENT_KEY, privacySignal, savedConsent, startVisitorTracking } from "@/lib/visitors/client";
import styles from "./VisitorPrivacy.module.css";

export function VisitorPrivacy({ ready }: { ready: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const choosing = useRef(false);
  const tracker = useRef<ReturnType<typeof startVisitorTracking> | null>(null);
  useEffect(() => {
    if (!ready || window.parent !== window || new URLSearchParams(location.search).has("portal-preview")) return;
    const controller = new AbortController();
    void fetch("/api/visits", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (!data?.enabled || controller.signal.aborted) return;
      setEnabled(true); const stored = privacySignal() ? "deny" : savedConsent(); setChoice(stored); setOpen(stored === null);
    }).catch(() => {});
    return () => controller.abort();
  }, [ready]);
  useEffect(() => {
    if (!enabled || choice !== "allow" || privacySignal()) return;
    const active = startVisitorTracking(); tracker.current = active;
    return () => { active.stop(); };
  }, [enabled, choice]);
  async function choose(next: "allow" | "deny") {
    if (choosing.current) return;
    if (next === "allow" && privacySignal()) { setMessage("Your browser's privacy preference is enabled. Analytics stays off."); return; }
    choosing.current = true; setBusy(true);
    try {
    setChoice(next); setMessage("");
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: next, at: Date.now() })); } catch { /* Applies to this page even if storage is blocked. */ }
    if (next === "deny" && tracker.current) {
      try { await tracker.current.forget(); tracker.current = null; }
      catch (error) { setMessage(error instanceof Error ? error.message : "Tracking is off. Retry deleting this visit."); return; }
    }
    setOpen(false);
    } finally { choosing.current = false; setBusy(false); }
  }
  useEffect(() => {
    const sync = () => { if (savedConsent() !== "allow") { tracker.current?.stop(); setChoice("deny"); } };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, []);
  if (!enabled) return null;
  return <div className={styles.preferences}>
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}>Visitor privacy settings</button>
    {open && <aside className={styles.notice} aria-label="Optional visitor analytics">
      <strong>Help us improve the studio website?</strong>
      <p>With your permission, we record pages and sections viewed, estimated active time and scroll depth, browser/device type, and approximate city/country for up to 30 days. The studio owner can see recent activity.</p>
      <p>Your IP may be sent securely to IPstack for approximate location; raw IPs, form contents and names are not saved in analytics. No tracking starts until you allow it. You can change this choice here.</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => void choose("deny")}>Decline / turn off</button>
        <button type="button" disabled={busy} onClick={() => void choose("allow")}>Allow analytics</button>
        {choice !== null && <button type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </aside>}
  </div>;
}
