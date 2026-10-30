"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteContent } from "@/lib/content/types";
import type { IntroSettings } from "@/lib/intro/settings";
import styles from "./content.module.css";

export function MediaResetPanel({ disabled, onReset }: {
  disabled: boolean;
  onReset: (content: SiteContent, settings: IntroSettings) => void;
}) {
  const [review, setReview] = useState<{ token: string; files: number } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (review) dialog.current?.showModal();
  }, [review]);

  async function prepare() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/media-reset", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReview(data);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t prepare the reset.");
    } finally { setBusy(false); }
  }

  async function reset() {
    if (!review || disabled || confirmation !== "CLEAR MEDIA") return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/media-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: review.token, confirmation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onReset(data.content, data.settings);
      setReview(null);
      setConfirmation("");
      setMessage(`Media cleared. You can upload new pictures into the existing slots. Recovery archive: ${data.backup}.${data.retained ? ` ${data.retained} archived files could not be removed from the library; retry after reloading.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t finish the reset. Reload the portal to check its state.");
      setReview(null);
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.page}>
      <section className={styles.section} data-open="true">
        <div className={styles.sectionBody}>
          <h3>Start with clean media</h3>
          <p className={styles.hint}>Clear project artwork, production logos, collaborator photos and other content pictures. All text and entries stay. The intro, background effects, DDS branding and fonts stay exactly as they are. A recovery archive is saved first.</p>
          {disabled && <p className={styles.hint}>Publish or discard your current edits before resetting media.</p>}
          {!review ? (
            <button type="button" className={styles.pill} disabled={disabled || busy} onClick={prepare}>{busy ? "Preparing…" : "Review media reset"}</button>
          ) : (
            <dialog ref={dialog} className={styles.delDialog} style={{ margin: "auto", border: "1px solid var(--smoke)" }} aria-label="Clear content media" onCancel={(e) => { e.preventDefault(); if (!busy) setReview(null); }}>
              <p>This publishes the empty image slots immediately and removes {review.files} ordinary uploaded files from the library after archiving them. Type <strong>CLEAR MEDIA</strong> to continue.</p>
              <input className={styles.input} aria-label="Type CLEAR MEDIA to confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} autoComplete="off" />
              <span className={styles.delActions}>
                <button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
                <button type="button" data-danger="true" disabled={disabled || busy || confirmation !== "CLEAR MEDIA"} onClick={reset}>{busy ? "Archiving and clearing…" : "Clear media, keep text"}</button>
              </span>
            </dialog>
          )}
          {message && <p className={styles.hint} role="status">{message}</p>}
        </div>
      </section>
    </div>
  );
}
