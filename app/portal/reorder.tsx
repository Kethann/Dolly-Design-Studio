"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import styles from "./reorder.module.css";

/** Moves the item at `from` so it ends up at `to`, everything between shifting along. */
export const moveTo = <T,>(list: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
};

/** The nearest ancestor that scrolls, so a long list can be dragged past what is on screen. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Drag to put things in order. Give the list's box `ref`, spread `item(i)` on each of its direct children, and put `grip(i)`
 * inside each one: pressing the grip and dragging (mouse, finger or pen) shows where it will land, and letting go drops it
 * there. With the grip focused, the up and down arrow keys move it one place. `onMove(from, to)` does the actual re-ordering.
 */
export function useReorder<E extends HTMLElement = HTMLDivElement>(onMove: (from: number, to: number) => void): {
  /** Goes on the list's box (a callback, so nothing reads a ref while drawing). */
  attach: (el: E | null) => void;
  item: (i: number) => { "data-reorder": number; "data-reorder-state"?: "dragging" | "before" | "after" };
  grip: (i: number, count: number) => ReactNode;
} {
  const [box, setBox] = useState<E | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const active = useRef<{ pointerId: number; from: number; over: number } | null>(null);
  // While dragging, the whole screen shows the "grabbing" hand.
  useEffect(() => {
    if (!drag) return;
    const was = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    const cancel = (event: globalThis.PointerEvent) => {
      if (active.current?.pointerId !== event.pointerId) return;
      active.current = null;
      setDrag(null);
    };
    const blur = () => { active.current = null; setDrag(null); };
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    return () => {
      document.body.style.cursor = was;
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
    };
  }, [drag]);

  const item = (i: number) => ({
    "data-reorder": i,
    "data-reorder-state": drag ? (drag.from === i ? ("dragging" as const) : drag.over === i && drag.over !== drag.from ? (drag.over > drag.from ? ("after" as const) : ("before" as const)) : undefined) : undefined,
  });

  const grip = (i: number, count: number) => {
    const onPointerDown = (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !e.isPrimary || count < 2 || active.current) return;
      e.preventDefault();
      active.current = { pointerId: e.pointerId, from: i, over: i };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* The drag still ends on pointer release. */ }
      setDrag({ from: i, over: i });
    };
    const updateOver = (e: PointerEvent<HTMLElement>) => {
      const current = active.current;
      if (!current || current.pointerId !== e.pointerId || !box) return;
      // A long list scrolls when the pointer nears its top or bottom edge.
      const sp = scrollParent(box);
      if (sp) {
        const r = sp.getBoundingClientRect();
        if (e.clientY < r.top + 48) sp.scrollTop -= 14;
        else if (e.clientY > r.bottom - 48) sp.scrollTop += 14;
      }
      // The item under the pointer that belongs to THIS list (not one inside it, such as a card's own pictures).
      let el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-reorder]") ?? null;
      while (el && el.parentElement !== box) el = el.parentElement?.closest<HTMLElement>("[data-reorder]") ?? null;
      // A release just beyond the list should still land at its nearest end.
      if (!el) {
        const items = Array.from(box.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-reorder"));
        if (items.length) {
          const first = items[0].getBoundingClientRect();
          const last = items[items.length - 1].getBoundingClientRect();
          if (e.clientY < first.top) el = items[0];
          else if (e.clientY > last.bottom) el = items[items.length - 1];
        }
      }
      if (!el) return;
      const over = Number(el.dataset.reorder);
      if (Number.isFinite(over) && over !== current.over) {
        current.over = over;
        setDrag({ from: current.from, over });
      }
    };
    const finish = (e: PointerEvent<HTMLElement>, commit: boolean) => {
      const d = active.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (commit) updateOver(e);
      active.current = null;
      setDrag(null);
      if (commit && d && d.from !== d.over) onMove(d.from, d.over);
    };
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "ArrowUp" && i > 0) {
        e.preventDefault();
        onMove(i, i - 1);
      } else if (e.key === "ArrowDown" && i < count - 1) {
        e.preventDefault();
        onMove(i, i + 1);
      }
    };
    return (
      <span
        className={styles.grip}
        role="button"
        tabIndex={count < 2 ? -1 : 0}
        aria-label="Drag to change the order (or press the up and down arrow keys)"
        title={count < 2 ? "Add another to be able to reorder" : "Drag to change the order"}
        data-disabled={count < 2}
        onPointerDown={onPointerDown}
        onPointerMove={updateOver}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
        onLostPointerCapture={(e) => finish(e, false)}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        ⋮⋮
      </span>
    );
  };

  return { attach: setBox, item, grip };
}
