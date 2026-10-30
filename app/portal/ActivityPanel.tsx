"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry } from "@/lib/portal/activity";
import type { PortalUser } from "@/lib/portal/users";
import styles from "./activity.module.css";
import { startVisiblePoll } from "@/lib/visible-poll";
import { appendUnique } from "./list-state";

type Group = "" | "sign-ins" | "changes" | "uploads" | "account";

const GROUPS: { id: Group; label: string }[] = [
  { id: "", label: "Everything" },
  { id: "sign-ins", label: "Sign-ins" },
  { id: "changes", label: "Published changes" },
  { id: "uploads", label: "Uploads" },
  { id: "account", label: "People & passwords" },
];

/** What happened, as the rest of a sentence that starts with the person's name. */
function what(e: ActivityEntry): string {
  switch (e.action) {
    case "sign-in":
      return "signed in";
    case "sign-in-failed":
      return "tried to sign in, but the username or password was wrong";
    case "sign-out":
      return "signed out";
    case "code-sent":
      return "was emailed a code";
    case "code-failed":
      return "typed a wrong code";
    case "password-changed":
      return "changed their password";
    case "password-reset":
      return "reset their password with an emailed code";
    case "password-set-for":
      return "set a new password for";
    case "username-changed":
      return "changed their username";
    case "name-changed":
      return "changed a name";
    case "email-changed":
      return "changed their email address";
    case "two-step":
      return "changed two-step sign-in";
    case "signed-out-everywhere":
      return "signed out of every other device";
    case "person-added":
      return "added a person:";
    case "person-removed":
      return "removed a person:";
    case "role-changed":
      return "changed a role:";
    case "published-content":
      return "published changes to";
    case "published-design":
      return "published design changes to";
    case "uploaded-image":
      return "uploaded the image";
    case "uploaded-video":
      return "uploaded the video";
    case "uploaded-font":
      return "uploaded the font";
    case "uploaded-texture":
      return "uploaded the star texture";
    case "deleted-file":
      return "deleted the file";
    case "email-test":
      return "sent a test email";
    case "replied-enquiry":
      return "replied to an enquiry:";
    default:
      return e.action;
  }
}

/** A publish that changed nothing you can see. */
const empty = (e: ActivityEntry) => e.action.startsWith("published") && e.detail === "No visible changes";

const ICON: Record<string, string> = {
  "sign-in": "↪",
  "sign-in-failed": "⚠",
  "sign-out": "↩",
  "code-sent": "✉",
  "code-failed": "⚠",
  "published-content": "✎",
  "published-design": "✦",
  "replied-enquiry": "✉",
  "uploaded-image": "▣",
  "uploaded-video": "▶",
  "uploaded-font": "Aa",
  "uploaded-texture": "▣",
};

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 90) return "a minute ago";
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 5400) return "an hour ago";
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const exact = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Who signed in, and what each person did. Owners see everyone; editors see their own. */
export function ActivityPanel({ me }: { me: PortalUser }) {
  const [group, setGroup] = useState<Group>("");
  const [person, setPerson] = useState("");
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [more, setMore] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string; username: string }[]>([]);
  const [scope, setScope] = useState<"everyone" | "you">("you");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [, tick] = useState(0);
  const seq = useRef(0);
  const request = useRef<AbortController | null>(null);
  const browsingOlder = useRef(false);
  const [olderOpen, setOlderOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (append = false, before?: string, signal?: AbortSignal) => {
      if (signal?.aborted || (append && request.current)) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 20_000);
      const my = ++seq.current;
      setLoading(true);
      const params = new URLSearchParams();
      if (group) params.set("group", group);
      if (person) params.set("user", person);
      if (q.trim()) params.set("q", q.trim());
      if (before) params.set("before", before);
      try {
        const res = await fetch(`/api/portal/activity?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { entries: ActivityEntry[]; more: boolean; people: typeof people; scope: "everyone" | "you" };
        if (!Array.isArray(data.entries) || !Array.isArray(data.people)) throw new Error("Incomplete activity response");
        if (my !== seq.current || signal?.aborted) return; // a newer search has taken over
        setEntries((old) => (append ? appendUnique(old, data.entries) : data.entries));
        browsingOlder.current = append;
        setOlderOpen(append);
        setMore(data.more);
        setPeople(data.people);
        setScope(data.scope);
        setState("ready");
      } catch {
        if (my === seq.current && !signal?.aborted) setState("error");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (request.current === controller) { request.current = null; setLoading(false); }
      }
    },
    [group, person, q],
  );

  // Reload when a filter changes (typing in the search waits a moment), and every 30 seconds.
  useEffect(() => {
    browsingOlder.current = false;
    const t = setTimeout(() => load(), q ? 250 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seq is a request generation counter, not a DOM ref; cleanup must invalidate the latest generation.
    return () => { clearTimeout(t); seq.current++; request.current?.abort(); request.current = null; };
  }, [load, q]);
  useEffect(() => {
    return startVisiblePoll(async (signal) => {
      if (request.current || browsingOlder.current) return;
      await load(false, undefined, signal);
      if (signal.aborted) return;
      tick((n) => n + 1);
    }, 30_000, false);
  }, [load]);

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>
        {scope === "everyone" ? "Everything everyone has done in the portal, newest first." : `Your own activity in the portal, newest first. ${me.role === "editor" ? "(Owners can see everyone’s.)" : ""}`}
      </p>

      <div className={styles.chips} role="tablist" aria-label="Filter the activity">
        {GROUPS.map((g) => (
          <button key={g.id || "all"} type="button" role="tab" aria-selected={group === g.id} data-on={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      <div className={styles.tools}>
        <input className={styles.search} placeholder="Search names, what they did, devices…" aria-label="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
        {scope === "everyone" && (
          <select className={styles.person} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Show one person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={styles.refresh} disabled={loading} onClick={() => load()}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {state === "error" && <p className={styles.empty} role="alert">Couldn’t load the activity. Try Refresh.</p>}
      {olderOpen && <p className={styles.lead}>Older activity stays open while you read. Refresh to return to the latest entries.</p>}
      {state === "loading" && <p className={styles.empty}>Loading…</p>}
      {state === "ready" && entries.length === 0 && <p className={styles.empty}>Nothing here yet{q || group || person ? " for those filters" : ""}.</p>}

      <ol className={styles.list} aria-busy={loading}>
        {entries.map((e) => (
          <li key={e.id} className={styles.item} data-ok={e.ok}>
            <span className={styles.icon} aria-hidden="true">
              {ICON[e.action] ?? "•"}
            </span>
            <div className={styles.body}>
              <p className={styles.sentence}>
                <strong>{e.name}</strong> {empty(e) ? "published again, with no visible changes" : what(e)}
                {e.detail && !empty(e) && <em> {e.detail}</em>}
              </p>
              <p className={styles.meta}>
                <time dateTime={e.at} title={exact(e.at)}>
                  {ago(e.at)}
                </time>
                <span>{e.device}</span>
                <span>{e.ip}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>

      {more && (
        <button type="button" className={styles.more} disabled={loading} onClick={() => load(true, entries[entries.length - 1]?.id)}>
          {loading ? "Loading…" : "Show older activity"}
        </button>
      )}
    </div>
  );
}
