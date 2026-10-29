"use client";

import { useEffect, useState } from "react";
import styles from "./storage.module.css";

interface Usage {
  used: number;
  limit: number;
  percent: number;
  where: string;
}

/** From 80% a heads-up is shown once a day; from 85% it is shown every time the portal is opened. */
const WARN = 80;
const URGENT = 85;
const SEEN_KEY = "dds-storage-warned";

export const formatBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function useUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/portal/storage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Usage | null) => live && d && typeof d.percent === "number" && setUsage(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return usage;
}

/** The usage bar with the numbers under it (shown in Users & security). */
export function StorageMeter() {
  const usage = useUsage();
  if (!usage) return <p className={styles.note}>Checking the storage…</p>;
  const level = usage.percent >= URGENT ? "urgent" : usage.percent >= WARN ? "warn" : "ok";
  return (
    <div className={styles.meter} data-level={level}>
      <div className={styles.bar} role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage.percent)}>
        <i style={{ width: `${Math.max(1, usage.percent)}%` }} />
      </div>
      <p className={styles.note}>
        <strong>{usage.percent.toFixed(1)}% used</strong> — {formatBytes(usage.used)} of {formatBytes(usage.limit)} on {usage.where}.
      </p>
    </div>
  );
}

/** Opens with the portal: a banner when the storage is nearly full (see the limits above). */
export function StorageWatch() {
  const usage = useUsage();
  const [hidden, setHidden] = useState(false);
  if (!usage || hidden || usage.percent < WARN) return null;
  const urgent = usage.percent >= URGENT;
  if (!urgent) {
    // The 80–85% heads-up appears once a day, not on every visit.
    try {
      const today = new Date().toDateString();
      if (localStorage.getItem(SEEN_KEY) === today) return null;
    } catch {}
  }
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(SEEN_KEY, new Date().toDateString());
    } catch {}
  };
  return (
    <div className={styles.banner} data-level={urgent ? "urgent" : "warn"} role="alert">
      <div>
        <strong>{urgent ? "Storage is almost full" : "Storage is getting full"} — {usage.percent.toFixed(1)}% used</strong>
        <span>
          {formatBytes(usage.used)} of {formatBytes(usage.limit)} on {usage.where}.{" "}
          {urgent ? "New uploads may soon fail. Remove pictures you no longer use, or add more storage." : "Consider removing pictures you no longer use."}
        </span>
      </div>
      <button type="button" onClick={close} aria-label="Dismiss the storage notice">
        {urgent ? "OK" : "Dismiss"}
      </button>
    </div>
  );
}
