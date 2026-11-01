"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { bindPanelWindow } from "./panel-window";
import edit from "./edit.module.css";
import styles from "./window.module.css";

export function usePanelWindow(ref: RefObject<HTMLElement | null>) {
  useEffect(() => { if (ref.current) return bindPanelWindow(ref.current); }, [ref]);
}

export function WindowActions() {
  return <div className={styles.actions}>
    <button type="button" data-window-action="reset" aria-label="Reset window position and size" title="Reset position and size"><span aria-hidden="true">↺</span></button>
    <button type="button" data-window-action="maximize" aria-label="Maximize window" aria-pressed="false" title="Maximize window"><span aria-hidden="true">□</span></button>
  </div>;
}

export function WindowHandles() {
  return <>{(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map(edge =>
    <button key={edge} type="button" className={styles.handle} data-window-resize={edge} tabIndex={edge === "se" ? 0 : -1} aria-label="Resize window using arrow keys" title="Drag to resize; arrow keys resize, Shift for larger steps" />
  )}</>;
}

export function PanelWindow({ title, hint, children, onClose }: { title: string; hint?: string; children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLElement>(null);
  usePanelWindow(box);
  return <section ref={box} className={`${edit.sheet} ${styles.window}`} aria-labelledby="sheet-title">
    <header className={`${edit.head} ${styles.titlebar}`} data-window-titlebar role="group" tabIndex={0} aria-label={`Move ${title} window using arrow keys`} title="Drag to move; double-click to maximize or restore">
      <div className={edit.headText}>
        <h2 id="sheet-title" className={edit.title}>{title}</h2>
        {hint && <p className={edit.hint}>{hint}</p>}
      </div>
      <WindowActions />
      <button type="button" className={edit.close} aria-label="Close" onClick={onClose}>×</button>
    </header>
    <div className={edit.sheetBody}>{children}</div>
    <WindowHandles />
  </section>;
}
