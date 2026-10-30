"use client";

import type { SiteToPortal } from "@/lib/intro/preview-protocol";
import styles from "./PreviewControls.module.css";

const send = (message: SiteToPortal) => {
  if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
};

/** In-flow controls stay beside their content and never cover a card's normal click target. */
export function AddContent({ list, label, count, max }: { list: string; label: string; count: number; max?: number }) {
  const full = max !== undefined && count >= max;
  return (
    <div className={styles.controls} data-ed-ui data-ed-add-list={list}>
      <button type="button" disabled={full} onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        send({ source: "dds-site", type: "edit-add", list });
      }}>＋ {label}</button>
      {full && <span role="status">Limit of {max} reached. Remove an item to add another.</span>}
    </div>
  );
}

export function EditContent({ item, label }: { item: string; label: string }) {
  return (
    <div className={styles.controls} data-ed-ui>
      <button type="button" onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        send({ source: "dds-site", type: "edit-open", item });
      }}>✎ {label}</button>
    </div>
  );
}
