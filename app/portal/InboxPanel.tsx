"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Enquiry, EnquiryStatus } from "@/lib/contact/inbox";
import styles from "./activity.module.css";
import inbox from "./inbox.module.css";

type Filter = "" | "new" | "read" | "archived";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "", label: "All" },
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "archived", label: "Archived" },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Enquiries sent through the website's contact form: read them, mark them, archive or delete them, and reply. */
export function InboxPanel({ onCount }: { onCount?: (unread: number) => void }) {
  const [items, setItems] = useState<Enquiry[]>([]);
  const [filter, setFilter] = useState<Filter>("");
  const [q, setQ] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [mailOk, setMailOk] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const res = await fetch("/api/portal/inbox", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { enquiries?: Enquiry[]; mailConfigured?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn’t load the enquiries.");
      if (my !== seq.current) return;
      setItems(data.enquiries ?? []);
      setMailOk(data.mailConfigured !== false);
      setState("ready");
      setError("");
    } catch (err) {
      if (my !== seq.current) return;
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn’t load the enquiries.");
    }
  }, []);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect -- loads the list when the window opens
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((e) => e.status === "new").length;
  useEffect(() => {
    onCount?.(unread);
  }, [unread, onCount]);

  async function call(method: "PATCH" | "DELETE", id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/portal/inbox", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That didn’t work. Try again.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t work. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function mark(id: string, status: EnquiryStatus) {
    const before = items;
    setItems((l) => l.map((e) => (e.id === id ? { ...e, status } : e)));
    if (!(await call("PATCH", id, { status }))) setItems(before);
  }

  async function remove(e: Enquiry) {
    if (!window.confirm(`Delete the enquiry from ${e.name}? This can’t be undone.`)) return;
    if (await call("DELETE", e.id, {})) setItems((l) => l.filter((x) => x.id !== e.id));
  }

  function toggle(e: Enquiry) {
    const opening = openId !== e.id;
    setOpenId(opening ? e.id : null);
    if (opening && e.status === "new") void mark(e.id, "read");
  }

  const needle = q.trim().toLowerCase();
  const shown = items.filter(
    (e) => (!filter || e.status === filter) && (!needle || `${e.name} ${e.email} ${e.phone} ${e.company} ${e.projectType} ${e.message}`.toLowerCase().includes(needle)),
  );

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>
        Messages sent through the contact form on your site, newest first. {unread > 0 ? <strong>{unread} new.</strong> : "Nothing new."}
      </p>
      {!mailOk && <p className={inbox.warn}>Email isn’t set up on this server, so these messages are only saved here. Add the email settings (see People &amp; passwords) to also get them in your inbox.</p>}

      <div className={styles.chips} role="tablist" aria-label="Filter the enquiries">
        {FILTERS.map((f) => (
          <button key={f.id || "all"} type="button" role="tab" aria-selected={filter === f.id} data-on={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className={styles.tools}>
        <input className={styles.search} placeholder="Search names, emails, projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the enquiries" />
        <button type="button" className={styles.refresh} onClick={load}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <p className={inbox.warn} role="alert">
          {error}
        </p>
      )}
      {state === "loading" && <p className={styles.empty}>Loading…</p>}
      {state === "ready" && shown.length === 0 && <p className={styles.empty}>{items.length ? "No enquiries match." : "No enquiries yet. They appear here the moment someone sends the contact form."}</p>}

      <ul className={inbox.list}>
        {shown.map((e) => {
          const open = openId === e.id;
          return (
            <li key={e.id} className={inbox.item} data-status={e.status} data-open={open}>
              <button type="button" className={inbox.head} aria-expanded={open} onClick={() => toggle(e)}>
                <span className={inbox.dot} aria-label={e.status === "new" ? "New" : undefined} />
                <span className={inbox.who}>
                  <strong>{e.name}</strong>
                  <em>
                    {e.projectType}
                    {e.company ? ` · ${e.company}` : ""}
                  </em>
                </span>
                <time dateTime={e.at}>{when(e.at)}</time>
              </button>
              {open && (
                <div className={inbox.body}>
                  <dl>
                    <dt>Email</dt>
                    <dd>
                      <a href={`mailto:${e.email}`}>{e.email}</a>
                    </dd>
                    <dt>Phone</dt>
                    <dd>
                      <a href={`tel:${e.phone}`}>{e.phone}</a>
                    </dd>
                    {e.company && (
                      <>
                        <dt>Company</dt>
                        <dd>{e.company}</dd>
                      </>
                    )}
                    <dt>Budget</dt>
                    <dd>{e.budget || "Not specified"}</dd>
                    <dt>Timeline</dt>
                    <dd>{e.timeline || "Not specified"}</dd>
                  </dl>
                  <p className={inbox.message}>{e.message}</p>
                  <p className={inbox.note} data-ok={e.emailed}>
                    {e.emailed ? "✓ Also emailed to your inbox." : `Not emailed${e.emailNote ? `: ${e.emailNote}` : "."}`}
                  </p>
                  <div className={inbox.actions}>
                    <a className={inbox.reply} href={`mailto:${e.email}?subject=${encodeURIComponent(`Re: your enquiry (${e.projectType})`)}`}>
                      ✉ Reply
                    </a>
                    {e.status !== "new" && (
                      <button type="button" disabled={busy === e.id} onClick={() => mark(e.id, "new")}>
                        Mark as new
                      </button>
                    )}
                    {e.status !== "archived" ? (
                      <button type="button" disabled={busy === e.id} onClick={() => mark(e.id, "archived")}>
                        Archive
                      </button>
                    ) : (
                      <button type="button" disabled={busy === e.id} onClick={() => mark(e.id, "read")}>
                        Move back
                      </button>
                    )}
                    <button type="button" className={inbox.danger} disabled={busy === e.id} onClick={() => remove(e)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
