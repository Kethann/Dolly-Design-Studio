"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Enquiry, EnquiryStatus } from "@/lib/contact/inbox";
import styles from "./activity.module.css";
import inbox from "./inbox.module.css";
import { startVisiblePoll } from "@/lib/visible-poll";
import { rollbackStatus } from "./list-state";

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
  /** The enquiry being answered, what has been typed for each (kept if you switch away and back), and which is sending. */
  const [composeId, setComposeId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [replyError, setReplyError] = useState("");
  const seq = useRef(0);
  const mutation = useRef(false);
  const replying = useRef(false);
  const readRequest = useRef<AbortController | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (mutation.current || replying.current || readRequest.current || signal?.aborted) return;
    const controller = new AbortController();
    readRequest.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 20_000);
    const my = ++seq.current;
    setRefreshing(true);
    try {
      const res = await fetch("/api/portal/inbox", { cache: "no-store", signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as { enquiries?: Enquiry[]; mailConfigured?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn’t load the enquiries.");
      if (!Array.isArray(data.enquiries)) throw new Error("The inbox response was incomplete. Please refresh.");
      if (my !== seq.current || signal?.aborted) return;
      setItems(data.enquiries ?? []);
      setMailOk(data.mailConfigured !== false);
      setState("ready");
      setError("");
    } catch (err) {
      if (my !== seq.current || signal?.aborted) return;
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn’t load the enquiries.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (readRequest.current === controller) { readRequest.current = null; setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    const stop = startVisiblePoll(load, 30_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate the latest request generation when this panel closes.
    return () => { seq.current++; stop(); readRequest.current?.abort(); readRequest.current = null; };
  }, [load]);

  const unread = items.filter((e) => e.status === "new").length;
  useEffect(() => {
    onCount?.(unread);
  }, [unread, onCount]);

  async function call(method: "PATCH" | "DELETE", id: string, body: Record<string, unknown>) {
    mutation.current = true;
    seq.current++;
    readRequest.current?.abort();
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
      mutation.current = false;
      setBusy(null);
    }
  }

  async function mark(id: string, status: EnquiryStatus) {
    if (mutation.current || replying.current) return;
    const original = items.find((item) => item.id === id)?.status;
    if (!original) return;
    setItems((l) => l.map((e) => (e.id === id ? { ...e, status } : e)));
    if (!(await call("PATCH", id, { status }))) setItems((current) => rollbackStatus(current, id, status, original));
  }

  async function remove(e: Enquiry) {
    if (mutation.current || replying.current) return;
    if (!window.confirm(`Delete the enquiry from ${e.name}? This can’t be undone.`)) return;
    if (await call("DELETE", e.id, {})) setItems((l) => l.filter((x) => x.id !== e.id));
  }

  /** Emails the typed words to the person, from the studio's account, and shows the answer under their message. */
  async function sendReply(e: Enquiry) {
    const message = (drafts[e.id] ?? "").trim();
    if (message.length < 2 || replying.current || mutation.current) return;
    replying.current = true;
    seq.current++;
    readRequest.current?.abort();
    setSending(e.id);
    setReplyError("");
    try {
      const res = await fetch("/api/portal/inbox/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, message }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; enquiry?: Enquiry };
      if (data.enquiry?.id === e.id) setItems((l) => l.map((x) => (x.id === e.id ? (data.enquiry as Enquiry) : x)));
      if (!res.ok) throw new Error(data.error || "The reply couldn’t be sent. Try again.");
      if (!data.enquiry || data.enquiry.id !== e.id) throw new Error("The server did not confirm this reply. Refresh the conversation before trying again; your draft is still here.");
      setDrafts((d) => ({ ...d, [e.id]: "" }));
      setComposeId(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "The reply couldn’t be sent. Try again.");
    } finally {
      replying.current = false;
      setSending(null);
    }
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
        <button type="button" className={styles.refresh} disabled={refreshing || !!busy || !!sending} onClick={() => load()}>
          {refreshing ? "Refreshing…" : "↻ Refresh"}
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
                  {(e.replies ?? []).map((r, i) => (
                    <div key={i} className={inbox.sent} data-ok={r.sent}>
                      <div className={inbox.sentHead}>
                        <strong>{r.by}</strong> replied · <time dateTime={r.at}>{when(r.at)}</time>
                        <span>{r.sent ? "✓ Emailed to " + e.email : "Not sent" + (r.note ? `: ${r.note}` : "")}</span>
                      </div>
                      <p>{r.body}</p>
                    </div>
                  ))}
                  {composeId === e.id && (
                    <form
                      className={inbox.compose}
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        void sendReply(e);
                      }}
                    >
                      <label htmlFor={`reply-${e.id}`}>
                        Your reply to <strong>{e.name}</strong> <em>({e.email})</em>
                      </label>
                      <textarea
                        id={`reply-${e.id}`}
                        rows={6}
                        maxLength={5000}
                        autoFocus
                        value={drafts[e.id] ?? ""}
                        placeholder={`Hello ${e.name.split(" ")[0]}, thank you for getting in touch…`}
                        onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                        disabled={sending === e.id}
                      />
                      <p className={inbox.hint}>It is emailed from the studio’s own address, with their message quoted underneath. Their answer comes back to the studio’s inbox.</p>
                      {replyError && (
                        <p className={inbox.warn} role="alert">
                          {replyError}
                        </p>
                      )}
                      <div className={inbox.actions}>
                        <button type="submit" className={inbox.reply} disabled={!!sending || !!busy || (drafts[e.id] ?? "").trim().length < 2 || !mailOk}>
                          {sending === e.id ? "Sending…" : "Send reply"}
                        </button>
                        <button type="button" disabled={sending === e.id} onClick={() => setComposeId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  <div className={inbox.actions}>
                    {composeId !== e.id && (
                      <button
                        type="button"
                        className={inbox.reply}
                        onClick={() => {
                          setReplyError("");
                          setComposeId(e.id);
                        }}
                      >
                        ✉ Reply
                      </button>
                    )}
                    {e.status !== "new" && (
                      <button type="button" disabled={!!busy || !!sending} onClick={() => mark(e.id, "new")}>
                        Mark as new
                      </button>
                    )}
                    {e.status !== "archived" ? (
                      <button type="button" disabled={!!busy || !!sending} onClick={() => mark(e.id, "archived")}>
                        Archive
                      </button>
                    ) : (
                      <button type="button" disabled={!!busy || !!sending} onClick={() => mark(e.id, "read")}>
                        Move back
                      </button>
                    )}
                    <button type="button" className={inbox.danger} disabled={!!busy || !!sending} onClick={() => remove(e)}>
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
