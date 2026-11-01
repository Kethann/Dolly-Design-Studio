"use client";
import { useEffect, useState } from "react";
import { startVisiblePoll } from "@/lib/visible-poll";
import { LIVE_MS, type VisitorReport } from "@/lib/visitors/model";
import styles from "./visitors.module.css";

const time = (at: number) => new Date(at).toLocaleString();
const duration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
export function VisitorsPanel() {
  const [days, setDays] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [report, setReport] = useState<VisitorReport | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    return startVisiblePoll(async signal => {
      const timeout = AbortSignal.timeout(10000);
      try {
        const p = new URLSearchParams({ days: String(days) }); if (cursor) p.set("before", cursor);
        const response = await fetch(`/api/portal/visitors?${p}`, { cache: "no-store", signal: AbortSignal.any([signal, timeout]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load visitors.");
        if (!signal.aborted) { setReport(data); setError(""); }
      } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : "Could not load visitors. Try again."); }
    }, 30000);
  }, [days, cursor, refresh]);
  return <section className={styles.panel} aria-label="Visitor analytics">
    <p>Consenting visits only—not unique people. Location and device are approximate. “Active recently” means a visible, recently used tab reported in the last 90 seconds; it is not an exact online count.</p>
    <div className={styles.tools}>
      <label>History <select value={days} onChange={e => { setDays(Number(e.target.value)); setCursor(null); setReport(null); }}>
        <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
      </select></label>
      <button type="button" onClick={() => setRefresh(v => v + 1)}>Refresh</button>
    </div>
    {error && <p role="alert">{error} {report && "The data below may be out of date."}</p>}
    {!report && !error && <p role="status">Loading visitor activity…</p>}
    {report && !report.enabled && <p role="status">Tracking is not enabled. Configure VISITOR_ANALYTICS_ENABLED and the VISITORS_DB database using VISITORS.md. No visitor events are collected while disabled.</p>}
    {report?.enabled && <>
      <div className={styles.stats}>
        <div><strong>{report.live}</strong><span>Active recently</span></div>
        <div><strong>{report.total}</strong><span>Recorded visits in range</span></div>
      </div>
      <p>Updated {time(report.at)} · Refreshes every 30 seconds while this window is visible. IPstack: {report.ipstack ? "key configured (lookups depend on plan/quota)" : "not configured; Cloudflare location fallback"}.{report.local && " Local test data only (up to 1,000 records); location is unavailable on localhost."}</p>
      {!report.visits.length && <p>No consenting visits in this range yet. Declined visits, portal previews, blocked analytics and unsupported paths are not counted.</p>}
      <div className={styles.list}>
        {report.visits.map(visit => <details key={visit.id} className={styles.visit}>
          <summary><span>Visit {visit.id.slice(0,8)}{!visit.ended && report.at - visit.lastSeen <= LIVE_MS ? " · Active recently" : ""}</span><span>{visit.current}</span></summary>
          <dl>
            <div><dt>Started / last seen</dt><dd>{time(visit.firstSeen)} / {time(visit.lastSeen)}</dd></div>
            <div><dt>Approximate location</dt><dd>{visit.location} ({visit.locationSource})</dd></div>
            <div><dt>Reported device/browser</dt><dd>{visit.device}</dd></div>
            <div><dt>Estimated active time</dt><dd>{duration(visit.pages.reduce((sum, page) => sum + page.seconds, 0))}</dd></div>
          </dl>
          <p>Pages/sections explored (up to 50 per visit). Depth measures how far the viewport reached, not proof that content was read.</p>
          <ul>{visit.pages.map(page => <li key={page.path}><strong>{page.path}</strong><span>{page.views} view{page.views === 1 ? "" : "s"} · {duration(page.seconds)} active · {page.depth}% reached</span></li>)}</ul>
        </details>)}
      </div>
      <div className={styles.tools}>
        {cursor && <button type="button" onClick={() => { setCursor(null); setReport(null); }}>Back to latest</button>}
        {report.next && <button type="button" onClick={() => { setCursor(report.next); setReport(null); }}>Older visits</button>}
      </div>
    </>}
  </section>;
}
