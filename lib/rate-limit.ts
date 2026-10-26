// A tiny in-memory rate limiter. Good enough to stop a form from being spammed
// on a single server instance; it does not share state across serverless
// regions or restarts. If the studio outgrows this, swap it for a Redis- or
// Upstash-backed limiter without changing the route's call site.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_HITS;
}
