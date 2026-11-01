import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { store } from "@/lib/storage";
import { describeDevice } from "@/lib/portal/activity";
import { LIVE_MS, RETENTION_MS, timedVisit, type Visit, type VisitInput, type VisitorReport } from "./model";

interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface Database { prepare(sql: string): Statement }
type Runtime = { db: Database | null; cf: Record<string, unknown>; local: boolean; enabled: boolean; key: string; geoLimit: number };
export async function visitorRuntime(): Promise<Runtime> {
  let env: Record<string, unknown> = {}, cf: Record<string, unknown> = {};
  let cloud = process.env.DEPLOY_TARGET === "cloudflare";
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = getCloudflareContext();
    env = context.env as unknown as Record<string, unknown>; cf = context.cf ?? {}; cloud = true;
  } catch { /* Normal local Node server. */ }
  const db = (env.VISITORS_DB as Database | undefined) ?? null;
  const limit = Number(env.IPSTACK_MONTHLY_LIMIT ?? process.env.IPSTACK_MONTHLY_LIMIT ?? 100);
  return { db, cf, local: !cloud, enabled: String(env.VISITOR_ANALYTICS_ENABLED ?? process.env.VISITOR_ANALYTICS_ENABLED) === "true" && (!cloud || !!db), key: String(env.IPSTACK_ACCESS_KEY ?? process.env.IPSTACK_ACCESS_KEY ?? ""), geoLimit: Number.isFinite(limit) ? Math.max(0, Math.min(50000, Math.floor(limit))) : 100 };
}

// Abuse guard is deliberately bounded. Configure a Cloudflare rate-limit rule as well before public activation.
const requests = new Map<string, { at: number; count: number }>();
export function visitorRateLimited(ip: string, now = Date.now()): boolean {
  const key = createHash("sha256").update(ip).digest("hex");
  let hit = requests.get(key);
  if (!hit || now - hit.at > 60_000) { hit = { at: now, count: 0 }; requests.delete(key); requests.set(key, hit); }
  if (requests.size > 2048) requests.delete(requests.keys().next().value!);
  return ++hit.count > 120;
}

export function publicIp(ip: string): boolean {
  if (isIP(ip) === 4) return !/^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01])|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(ip) && Number(ip.split(".")[0]) < 224;
  // Only global unicast IPv6; mapped/local/link-local addresses are never sent to a third party.
  return isIP(ip) === 6 && /^[23][0-9a-f]{0,3}:/i.test(ip);
}
const short = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 80) : "";
export async function visitLocation(runtime: Runtime, ip: string): Promise<Pick<Visit, "location" | "locationSource">> {
  const fallback = [short(runtime.cf.city), short(runtime.cf.region), short(runtime.cf.country)].filter(Boolean).join(", ");
  if (runtime.key && runtime.db && !runtime.local && runtime.geoLimit > 0 && publicIp(ip)) {
    try {
      // Atomic monthly budget shared across Workers and Pages; no surprise quota drain from every heartbeat.
      const month = new Date().toISOString().slice(0, 7);
      const reserved = await runtime.db.prepare("INSERT INTO visitor_geo_usage (month, used) VALUES (?, 1) ON CONFLICT(month) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used").bind(month, runtime.geoLimit).first<{ used: number }>();
      if (!reserved) return { location: fallback || "Unavailable", locationSource: fallback ? "Cloudflare" : "Unavailable" };
      // HTTPS only. Never put this key in a NEXT_PUBLIC variable, log the URL, or downgrade to HTTP.
      const url = new URL(`https://api.ipstack.com/${encodeURIComponent(ip)}`);
      url.searchParams.set("access_key", runtime.key);
      url.searchParams.set("fields", "city,region_name,country_name");
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const data = await response.json();
        const location = [short(data.city), short(data.region_name), short(data.country_name)].filter(Boolean).join(", ");
        if (data.success !== false && location) return { location, locationSource: "IPstack" };
      }
    } catch { /* Quota, HTTPS plan or network failure: preserve the visit using coarse Cloudflare data. */ }
  }
  return { location: fallback || "Unavailable", locationSource: fallback ? "Cloudflare" : "Unavailable" };
}

const DIR = "data/visitors/";
const keyOf = (id: string) => `${DIR}${id}.json`;
async function previousVisit(runtime: Runtime, id: string): Promise<Visit | null> {
  if (runtime.db) {
    const row = await runtime.db.prepare("SELECT data, sequence FROM visitor_sessions WHERE id = ?").bind(id).first<{ data: string; sequence: number }>();
    return row ? { ...JSON.parse(row.data), sequence: row.sequence } : null;
  }
  const raw = await (await store()).getText(keyOf(id));
  return raw ? JSON.parse(raw) : null;
}
// Local development only: serialize file changes. Production uses atomic conditional SQL upserts.
let localQueue: Promise<unknown> = Promise.resolve();
async function inLocalQueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = localQueue.then(fn, fn); localQueue = next.catch(() => {}); return next;
}
export async function recordVisit(runtime: Runtime, input: VisitInput, headers: Headers, now = Date.now()): Promise<void> {
  const save = async () => {
    const previous = await previousVisit(runtime, input.id);
    if (previous && (previous.ended || input.sequence <= previous.sequence || now - previous.firstSeen > 86400_000 || (!input.ended && now - previous.lastSeen < 45_000))) return;
    const ip = runtime.local ? "" : headers.get("cf-connecting-ip") ?? "";
    const place = previous ?? await visitLocation(runtime, ip);
    const visit: Visit = { ...timedVisit(input, previous, now), firstSeen: previous?.firstSeen ?? now, lastSeen: now,
      device: previous?.device ?? describeDevice(headers.get("user-agent")), location: place.location, locationSource: place.locationSource };
    if (runtime.db) {
      await runtime.db.prepare("INSERT INTO visitor_sessions (id, first_seen, last_seen, sequence, data, ended) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, sequence=excluded.sequence, data=excluded.data, ended=excluded.ended WHERE excluded.sequence > visitor_sessions.sequence AND visitor_sessions.ended=0 AND (excluded.last_seen - visitor_sessions.last_seen >= 45000 OR excluded.ended=1)")
        .bind(visit.id, visit.firstSeen, now, visit.sequence, JSON.stringify(visit), visit.ended ? 1 : 0).run();
    } else await (await store()).putText(keyOf(input.id), JSON.stringify(visit));
  };
  if (runtime.local) await inLocalQueue(save); else await save();
}
export async function forgetVisit(runtime: Runtime, id: string): Promise<void> {
  if (runtime.db) {
    // Tombstone defeats an already in-flight heartbeat after withdrawal. Daily cleanup removes it.
    await runtime.db.prepare("INSERT INTO visitor_sessions (id, first_seen, last_seen, sequence, data) VALUES (?, 0, 0, 2147483647, '{}') ON CONFLICT(id) DO UPDATE SET first_seen=0, last_seen=0, sequence=2147483647, data='{}'").bind(id).run();
  } else await inLocalQueue(async () => {
    await (await store()).putText(keyOf(id), JSON.stringify({ id, firstSeen: Date.now(), lastSeen: 0, sequence: 2147483647 }));
  });
}
export async function readVisitors(runtime: Runtime, days: number, cursor: string | null): Promise<VisitorReport> {
  const now = Date.now(), since = now - days * 86400_000;
  const report: VisitorReport = { enabled: runtime.enabled, ipstack: !!runtime.key, local: runtime.local, total: 0, live: 0, visits: [], next: null, at: now };
  if (!runtime.enabled) return report;
  const parts = cursor?.match(/^(\d{13})_([0-9a-f-]{36})$/i);
  const before = parts ? Number(parts[1]) : now + 1, beforeId = parts?.[2] ?? "~";
  if (runtime.db) {
    const counts = await runtime.db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN last_seen >= ? AND ended=0 THEN 1 ELSE 0 END),0) AS live FROM visitor_sessions WHERE last_seen >= ?").bind(now - LIVE_MS, since).first<{ total: number; live: number }>();
    report.total = counts?.total ?? 0; report.live = counts?.live ?? 0;
    const rows = await runtime.db.prepare("SELECT data FROM visitor_sessions WHERE last_seen >= ? AND (last_seen < ? OR (last_seen = ? AND id < ?)) ORDER BY last_seen DESC, id DESC LIMIT 51").bind(since, before, before, beforeId).all<{ data: string }>();
    report.visits = rows.results.map(row => JSON.parse(row.data));
  } else {
    const s = await store();
    const keys = await s.list(DIR);
    const visits: Visit[] = [];
    // Local-only small data set; never scan an R2 bucket for analytics.
    for (const key of keys.slice(0, 1000)) {
      const raw = await s.getText(key); if (!raw) continue;
      const v: Visit = JSON.parse(raw);
      if (v.firstSeen < now - RETENTION_MS) { await s.remove(key); continue; }
      if (v.lastSeen >= since) visits.push(v);
    }
    report.total = visits.length; report.live = visits.filter(v => !v.ended && v.lastSeen >= now - LIVE_MS).length;
    report.visits = visits.filter(v => v.lastSeen < before || (v.lastSeen === before && v.id < beforeId)).sort((a,b) => b.lastSeen - a.lastSeen || b.id.localeCompare(a.id)).slice(0,51);
  }
  if (report.visits.length > 50) { report.visits.pop(); const end = report.visits.at(-1)!; report.next = `${end.lastSeen}_${end.id}`; }
  return report;
}
