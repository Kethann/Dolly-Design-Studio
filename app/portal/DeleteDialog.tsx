"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { resizedSrc } from "@/lib/images";
import { useEditor } from "./ContentEditor";
import styles from "./content.module.css";

/** Every library picture an item mentions (anything inside it that is a path to an uploaded picture or slate title). */
export function picturesIn(value: unknown, out: Set<string> = new Set()): string[] {
  if (typeof value === "string") {
    const path = value.split("?")[0];
    if (/^\/images\/(uploads|proof-table)\/[^\s]+$/.test(path)) out.add(path);
  } else if (Array.isArray(value)) value.forEach((v) => picturesIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => picturesIn(v, out));
  return [...out];
}

const count = (text: string, part: string) => text.split(part).length - 1;

export interface DeleteAsk {
  /** What is being deleted, in a few words ("the card “Concept”"). */
  what: string;
  /** The item itself: its pictures are offered for deletion too. */
  item: unknown;
  /** Anything outside the site's content that may use the same pictures (for example the other slate titles). */
  elsewhere?: unknown;
  /** Removes the item from the draft. */
  onDelete: () => void;
  note?: string;
}

/**
 * The one "delete this?" step for cards, pages, breakdowns and slate titles. When the item has uploaded pictures that
 * nothing else uses, a tick box offers to delete them from the library as well (they would otherwise stay in the storage).
 */
export function useConfirmDelete(): { ask: (a: DeleteAsk) => void; dialog: ReactNode } {
  const { content, media } = useEditor();
  const [open, setOpen] = useState<DeleteAsk | null>(null);
  const [alsoPictures, setAlso] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const siteJson = JSON.stringify(content);
  const mine = open ? JSON.stringify(open.item) : "";
  const others = open?.elsewhere ? JSON.stringify(open.elsewhere) : "";
  const deletable = open
    ? picturesIn(open.item).filter((src) => media.removable.includes(src) && !(count(siteJson, src) > count(mine, src)) && !others.includes(src))
    : [];

  const close = () => {
    setOpen(null);
    setAlso(false);
    setError("");
  };
  async function confirm() {
    if (!open) return;
    setBusy(true);
    setError("");
    open.onDelete();
    if (alsoPictures) {
      const failed: string[] = [];
      for (const src of deletable) {
        try {
          await media.remove(src);
        } catch {
          failed.push(src);
        }
      }
      if (failed.length) {
        setBusy(false);
        setError(`Deleted, but ${failed.length} picture${failed.length === 1 ? "" : "s"} couldn’t be removed from the library (you can delete ${failed.length === 1 ? "it" : "them"} in the pictures window).`);
        return;
      }
    }
    setBusy(false);
    close();
  }

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.delBackdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
            <div className={styles.delDialog} role="alertdialog" aria-modal="true" aria-label={`Delete ${open.what}?`} onKeyDown={(e) => e.key === "Escape" && !busy && close()}>
              <h3>Delete {open.what}?</h3>
              <p>{open.note ?? "It only disappears from the site when you publish."}</p>
              {deletable.length > 0 && !error && (
                <label className={styles.delCheck}>
                  <input type="checkbox" checked={alsoPictures} onChange={(e) => setAlso(e.target.checked)} disabled={busy} />
                  <span>
                    Also delete {deletable.length === 1 ? "its picture" : `its ${deletable.length} pictures`} from the image library
                    <small>Only pictures nothing else uses. This frees the storage, can’t be undone, and the live site shows the spot empty until you publish.</small>
                  </span>
                </label>
              )}
              {deletable.length > 0 && !error && (
                <span className={styles.delThumbs} aria-hidden="true">
                  {deletable.slice(0, 8).map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny previews
                    <img key={src} src={resizedSrc(src, 120)} alt="" />
                  ))}
                  {deletable.length > 8 && <em>+{deletable.length - 8}</em>}
                </span>
              )}
              {deletable.length === 0 && picturesIn(open.item).length > 0 && (
                <p className={styles.delHint}>Its pictures stay in the library (they are used elsewhere, or came with the site).</p>
              )}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <span className={styles.delActions}>
                <button type="button" onClick={close} disabled={busy}>
                  {error ? "Close" : "Cancel"}
                </button>
                {!error && (
                  <button type="button" data-danger="true" onClick={confirm} disabled={busy} autoFocus>
                    {busy ? "Deleting…" : alsoPictures ? "Delete with pictures" : "Delete"}
                  </button>
                )}
              </span>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { ask: (a) => setOpen(a), dialog };
}
