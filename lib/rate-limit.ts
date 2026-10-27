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

/** Failed attempts only (e.g. wrong passwords): a successful sign-in never counts against anyone. */
const failures = new Map<string, number[]>();
const FAIL_MAX = 8;

export function tooManyFailures(key: string): boolean {
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= FAIL_MAX;
}

export function noteFailure(key: string) {
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
}
