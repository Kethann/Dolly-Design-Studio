"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./storage.module.css";

interface Item {
  key: string;
  name: string;
  url: string;
  bytes: number;
  usedBy: string[];
}

interface Group {
  id: string;
  label: string;
  deletable: boolean;
  note: string | null;
  bytes: number;
  count: number;
  items: Item[];
}

interface Usage {
  used: number;
  limit: number;
  percent: number;
  where: string;
  groups: Group[];
}

/** From 80% a heads-up is shown once a day; from 85% it is shown every time the portal is opened. */
const WARN = 80;
const URGENT = 85;
const SEEN_KEY = "dds-storage-warned";

/** Each kind of file has its own colour in the bar, like the categories in a phone's storage screen. */
const COLOURS: Record<string, string> = {
  pictures: "#8b5cff",
  fonts: "#38a8ff",
  proof: "#34d6a0",
  textures: "#ffbf4a",
  enquiries: "#ff6a8b",
  activity: "#a3adc2",
  system: "#6b7488",
};

export const formatBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(n ? 1 : 0, Math.round(n / 1024))} KB`);

/** What is stored, measured when the portal opens and again after anything is deleted. */
function useStorage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    fetch("/api/portal/storage?detail=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Usage | null) => {
        if (d && typeof d.percent === "number") setUsage(d);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { usage, failed, reload };
}

/** The segmented bar: one coloured piece per kind of file, the rest left empty. */
function SegmentBar({ usage, tall }: { usage: Usage; tall?: boolean }) {
  return (
    <div
      className={styles.segments}
      data-tall={tall}
      role="progressbar"
      aria-label="Storage used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(usage.percent)}
    >
      {usage.groups
        .filter((g) => g.bytes > 0)
        .map((g) => (
          <i key={g.id} title={`${g.label}: ${formatBytes(g.bytes)}`} style={{ width: `${(g.bytes / usage.limit) * 100}%`, background: COLOURS[g.id] }} />
        ))}
    </div>
  );
}

const levelOf = (percent: number) => (percent >= URGENT ? "urgent" : percent >= WARN ? "warn" : "ok");

/** The storage bar in the middle of the top bar: click it for the full list, with what uses what and a way to delete. */
export function StorageChip() {
  const { usage, failed, reload } = useStorage();
  const [open, setOpen] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);

  if (failed || !usage) return <span className={styles.chip} data-loading="true" aria-hidden="true" />;

  const level = levelOf(usage.percent);
  let banner = level !== "ok" && !bannerHidden;
  if (banner && level === "warn") {
    // The 80–85% heads-up appears once a day, not on every visit.
    try {
      if (localStorage.getItem(SEEN_KEY) === new Date().toDateString()) banner = false;
    } catch {}
  }
  const closeBanner = () => {
    setBannerHidden(true);
    try {
      localStorage.setItem(SEEN_KEY, new Date().toDateString());
    } catch {}
  };

  return (
    <>
      <button type="button" className={styles.chip} data-level={level} onClick={() => setOpen(true)} title={`Storage: ${formatBytes(usage.used)} of ${formatBytes(usage.limit)} used. Click to see what uses it.`}>
        <span className={styles.chipLabel}>Storage</span>
        <SegmentBar usage={usage} />
        <span className={styles.chipPercent}>{usage.percent < 10 ? usage.percent.toFixed(1) : Math.round(usage.percent)}%</span>
      </button>

      {banner && (
        <div className={styles.banner} data-level={level} role="alert">
          <div>
            <strong>
              {level === "urgent" ? "Storage is almost full" : "Storage is getting full"} — {usage.percent.toFixed(1)}% used
            </strong>
            <span>
              {formatBytes(usage.used)} of {formatBytes(usage.limit)} on {usage.where}. {level === "urgent" ? "New uploads may soon fail. " : ""}
              Open the storage bar to remove what you no longer use.
            </span>
          </div>
          <button type="button" onClick={() => { setOpen(true); closeBanner(); }}>
            Review
          </button>
          <button type="button" onClick={closeBanner} aria-label="Dismiss the storage notice">
            {level === "urgent" ? "OK" : "Dismiss"}
          </button>
        </div>
      )}

      {open && <StorageDialog usage={usage} onClose={() => setOpen(false)} onChanged={reload} />}
    </>
  );
}

/** The detail: the bar, then each kind of file with its size, and the files themselves (open a kind to see them). */
function StorageDialog({ usage, onClose, onChanged }: { usage: Usage; onClose: () => void; onChanged: () => void }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  /** The file waiting for the second click ("Yes, delete"). */
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (asking) setAsking(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, onClose]);

  async function remove(item: Item) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/storage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: item.key, confirmed: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn’t delete that file.");
      setGone((g) => new Set(g).add(item.key));
      setAsking(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t delete that file.");
    } finally {
      setBusy(false);
    }
  }

  const level = levelOf(usage.percent);
  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Storage">
        <header className={styles.dialogHead}>
          <div>
            <h2>Storage</h2>
            <p>
              <strong data-level={level}>{usage.percent.toFixed(1)}% used</strong> — {formatBytes(usage.used)} of {formatBytes(usage.limit)} on {usage.where}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" autoFocus>
            ✕
          </button>
        </header>

        <SegmentBar usage={usage} tall />

        <ul className={styles.legend}>
          {usage.groups
            .filter((g) => g.count > 0)
            .map((g) => {
              const open = openGroup === g.id;
              const items = g.items.filter((i) => !gone.has(i.key));
              return (
                <li key={g.id}>
                  <button type="button" className={styles.legendRow} aria-expanded={g.deletable ? open : undefined} disabled={!g.deletable} onClick={() => setOpenGroup(open ? null : g.id)}>
                    <i style={{ background: COLOURS[g.id] }} aria-hidden="true" />
                    <span className={styles.legendName}>
                      {g.label}
                      <small>{g.deletable ? `${items.length} file${items.length === 1 ? "" : "s"}` : g.note}</small>
                    </span>
                    <span className={styles.legendSize}>{formatBytes(g.items.length ? items.reduce((n, i) => n + i.bytes, 0) : g.bytes)}</span>
                    {g.deletable && (
                      <span className={styles.chev} aria-hidden="true">
                        {open ? "⌃" : "⌄"}
                      </span>
                    )}
                  </button>

                  {open && (
                    <ul className={styles.files}>
                      {items.length === 0 && <li className={styles.empty}>Nothing left here.</li>}
                      {items.map((item) => (
                        <li key={item.key} className={styles.file}>
                          <span className={styles.thumb} aria-hidden="true">
                            {g.id === "fonts" ? (
                              "Aa"
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element -- small preview of an uploaded file
                              <img src={item.url} alt="" loading="lazy" />
                            )}
                          </span>
                          <span className={styles.fileInfo}>
                            <strong title={item.name}>{item.name}</strong>
                            <small>
                              {formatBytes(item.bytes)} · {item.usedBy.length ? `Used in: ${item.usedBy.join(", ")}` : "Not used anywhere"}
                            </small>
                          </span>
                          {asking === item.key ? (
                            <span className={styles.confirm} role="group" aria-label={`Delete ${item.name}?`}>
                              <span>{item.usedBy.length ? "It is still in use — delete anyway?" : "Delete for good?"}</span>
                              <button type="button" onClick={() => setAsking(null)} disabled={busy}>
                                Cancel
                              </button>
                              <button type="button" data-danger="true" onClick={() => remove(item)} disabled={busy} autoFocus>
                                {busy ? "Deleting…" : "Yes, delete"}
                              </button>
                            </span>
                          ) : (
                            <button type="button" className={styles.delete} onClick={() => { setError(""); setAsking(item.key); }} aria-label={`Delete ${item.name}`}>
                              Delete
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
        </ul>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.foot}>Deleting is permanent. A picture that is still used somewhere will show as missing there until you choose another.</p>
      </div>
    </div>
  );
}

/** The same bar with the numbers under it (shown in Users & security). */
export function StorageMeter() {
  const { usage, failed } = useStorage();
  if (failed) return <p className={styles.note}>The storage couldn’t be measured right now.</p>;
  if (!usage) return <p className={styles.note}>Checking the storage…</p>;
  return (
    <div className={styles.meter} data-level={levelOf(usage.percent)}>
      <SegmentBar usage={usage} tall />
      <p className={styles.note}>
        <strong>{usage.percent.toFixed(1)}% used</strong> — {formatBytes(usage.used)} of {formatBytes(usage.limit)} on {usage.where}. Click the storage bar at the top to see what uses it.
      </p>
    </div>
  );
}
