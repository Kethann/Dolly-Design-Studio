// Server-only: the portal's activity log — who signed in, and what each person did.
//
// One JSON line per event, kept in .data/activity/ on your computer (git-ignored), or in R2 on Cloudflare. Logging never gets
// in the way: if the log can't be written, the action it describes still goes ahead.
import { randomUUID } from "node:crypto";
import { store } from "@/lib/storage";

/** One file per day (data/activity/2026-10-28.jsonl): small, and works on a disk and in R2 alike. */
const DIR = "data/activity/";
const dayKey = (iso: string) => `${DIR}${iso.slice(0, 10)}.jsonl`;
/** The most days kept; older ones are deleted. */
const KEEP_DAYS = 120;

export type ActivityAction =
  | "sign-in"
  | "sign-in-failed"
  | "sign-out"
  | "code-sent"
  | "code-failed"
  | "password-changed"
  | "password-reset"
  | "password-set-for"
  | "username-changed"
  | "name-changed"
  | "email-changed"
  | "two-step"
  | "signed-out-everywhere"
  | "person-added"
  | "person-removed"
  | "role-changed"
  | "published-content"
  | "published-design"
  | "uploaded-image"
  | "uploaded-font"
  | "uploaded-texture"
  | "deleted-file"
  | "email-test"
  | "replied-enquiry";

export interface ActivityEntry {
  id: string;
  /** ISO time. */
  at: string;
  userId: string;
  username: string;
  name: string;
  action: ActivityAction;
  /** A short plain sentence fragment: what exactly (e.g. "Home page text, Projects"). */
  detail: string;
  /** False for things that failed or were refused (a wrong password, a wrong code). */
  ok: boolean;
  ip: string;
  device: string;
}

/** Which filter tab each action belongs to. */
export const ACTION_GROUPS: Record<string, ActivityAction[]> = {
  "sign-ins": ["sign-in", "sign-in-failed", "sign-out", "code-sent", "code-failed", "signed-out-everywhere"],
  changes: ["published-content", "published-design", "replied-enquiry"],
  uploads: ["uploaded-image", "uploaded-font", "uploaded-texture"],
  account: [
    "password-changed",
    "password-reset",
    "password-set-for",
    "username-changed",
    "name-changed",
    "email-changed",
    "two-step",
    "person-added",
    "person-removed",
    "role-changed",
    "email-test",
  ],
};

/** "Edge on Windows" from a user-agent string: enough to recognise your own devices. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function clientIp(headers: Headers): string {
  // Behind Cloudflare, cf-connecting-ip is set by Cloudflare itself (a visitor cannot fake it); x-forwarded-for can be faked.
  return headers.get("cf-connecting-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** Who did it. The setup login has no stored account, so it is named here. */
export interface Actor {
  id: string;
  username: string;
  name: string;
}

export async function logActivity(input: {
  headers?: Headers;
  actor: Actor;
  action: ActivityAction;
  detail?: string;
  ok?: boolean;
}): Promise<void> {
  try {
    const entry: ActivityEntry = {
      id: randomUUID(),
      at: new Date().toISOString(),
      userId: input.actor.id,
      username: input.actor.username,
      name: input.actor.name,
      action: input.action,
      detail: (input.detail ?? "").slice(0, 300),
      ok: input.ok ?? true,
      ip: input.headers ? clientIp(input.headers) : "unknown",
      device: describeDevice(input.headers?.get("user-agent")),
    };
    const s = await store();
    const key = dayKey(entry.at);
    const earlier = (await s.getText(key)) ?? "";
    await s.putText(key, earlier + JSON.stringify(entry) + "\n", "application/x-ndjson");
    if (!earlier) void dropOldDays();
  } catch (err) {
    console.error("[portal] could not write the activity log", err);
  }
}

/** When a new day starts, forget the days beyond the newest KEEP_DAYS. */
async function dropOldDays() {
  try {
    const s = await store();
    const days = await s.list(DIR);
    for (const key of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) await s.remove(key);
  } catch {}
}

export interface ActivityQuery {
  /** Only this person's entries. */
  userId?: string;
  /** "sign-ins" | "changes" | "uploads" | "account" (see ACTION_GROUPS), or leave out for everything. */
  group?: string;
  /** Matches the person's name or username, what they did, and the device. */
  q?: string;
  limit?: number;
  /** Only entries older than this one (for "load more"). */
  before?: string;
}

/** Newest first. */
export async function readActivity(query: ActivityQuery): Promise<{ entries: ActivityEntry[]; more: boolean }> {
  const s = await store();
  const limit = Math.min(200, Math.max(1, query.limit ?? 60));
  const wanted = query.group ? new Set(ACTION_GROUPS[query.group] ?? []) : null;
  const q = query.q?.trim().toLowerCase();
  const out: ActivityEntry[] = [];
  let skipping = !!query.before;
  let more = false;
  let scanned = 0;

  // Newest day first; within a day, newest line first. Stop once there is a page (and one more to know there's more).
  const days = (await s.list(DIR)).reverse();
  scan: for (const key of days) {
    const lines = ((await s.getText(key)) ?? "").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (++scanned > 20000) break scan;
      let e: ActivityEntry;
      try {
        e = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (skipping) {
        if (e.id === query.before) skipping = false;
        continue;
      }
      if (query.userId && e.userId !== query.userId) continue;
      if (wanted && !wanted.has(e.action)) continue;
      if (q && !`${e.name} ${e.username} ${e.action} ${e.detail} ${e.device} ${e.ip}`.toLowerCase().includes(q)) continue;
      if (out.length >= limit) {
        more = true;
        break scan;
      }
      out.push(e);
    }
  }
  return { entries: out, more };
}
