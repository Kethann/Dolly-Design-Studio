"use client";

import { useEffect, useRef, useState } from "react";
import { PREVIEW_PARAM, type PortalToSite, type SiteToPortal } from "@/lib/intro/preview-protocol";

interface Box {
  /** The marker on the element: "home:founder" (a section) or "projects.3" (an item). */
  key: string;
  kind: "section" | "item";
  label: string;
  /** Where the element is on the PAGE (not on the screen), so the buttons scroll with it. */
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The element's rectangle after every clipping ancestor (overflow hidden / clip) has cut it, or null if it is cut away entirely. */
function visibleRect(el: HTMLElement): DOMRect | null {
  let r = el.getBoundingClientRect();
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (/(hidden|clip|auto|scroll)/.test(o.overflowX + o.overflowY)) {
      const c = p.getBoundingClientRect();
      const left = Math.max(r.left, c.left);
      const right = Math.min(r.right, c.right);
      const top = Math.max(r.top, c.top);
      const bottom = Math.min(r.bottom, c.bottom);
      if (right <= left || bottom <= top) return null;
      r = new DOMRect(left, top, right - left, bottom - top);
    }
  }
  return r;
}

const post = (m: SiteToPortal) => window.parent.postMessage(m, window.location.origin);

/**
 * Only inside the portal's live preview, and only while the portal's Edit mode is on: puts a visible ✎ Edit button on
 * every section and every item (poster, service, card…) of the page, outlines what the pointer is over, and keeps the
 * page from doing its usual things (opening links, sending the form) so it can be clicked about freely.
 *
 * The buttons live in the page's own coordinate space, one frame per element placed exactly over it. They therefore
 * scroll with the page natively (no script runs while scrolling, so nothing lags or jumps), and a section's button
 * rides down its section with plain CSS `position: sticky`. Positions are only re-measured when the layout changes.
 */
export function EditBridge() {
  const [on, setOn] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(PREVIEW_PARAM) || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const msg = e.data as PortalToSite;
      if (msg?.source === "dds-portal" && msg.type === "edit-mode") setOn(msg.on);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!on) {
      delete root.dataset.ddsEdit;
      return;
    }
    root.dataset.ddsEdit = "1";

    const measure = () => {
      frame.current = 0;
      const sx = window.scrollX;
      const sy = window.scrollY;
      const next: Box[] = [];
      document.querySelectorAll<HTMLElement>("[data-ed-section],[data-ed-item]").forEach((el) => {
        const r = visibleRect(el);
        if (!r || r.width < 24 || r.height < 24) return;
        const section = el.dataset.edSection;
        next.push({ key: section ?? el.dataset.edItem!, kind: section ? "section" : "item", label: el.dataset.edLabel ?? "", top: r.top + sy, left: r.left + sx, width: r.width, height: r.height });
      });
      // Only when something moved or resized: an unchanged page needs no redraw.
      setBoxes((old) => (old.length === next.length && old.every((o, i) => o.key === next[i].key && Math.abs(o.top - next[i].top) < 1 && Math.abs(o.left - next[i].left) < 1 && Math.abs(o.width - next[i].width) < 1 && Math.abs(o.height - next[i].height) < 1) ? old : next));
    };
    const schedule = () => {
      if (!frame.current) frame.current = requestAnimationFrame(measure);
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-ed-item],[data-ed-section]") as HTMLElement | null;
      const key = el ? (el.dataset.edItem ?? el.dataset.edSection ?? null) : null;
      setHover((h) => (h === key ? h : key));
    };
    // Nothing on the page does its usual job while editing; pressing a poster opens its editor.
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest("[data-ed-ui]")) return;
      e.preventDefault();
      e.stopPropagation();
      const item = t?.closest<HTMLElement>("[data-ed-item]");
      if (item?.dataset.edItem) post({ source: "dds-site", type: "edit-open", item: item.dataset.edItem });
    };
    const onSubmit = (e: Event) => e.preventDefault();

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    const tick = setInterval(schedule, 1200); // catches reveal animations and images that finish loading
    return () => {
      delete root.dataset.ddsEdit;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      clearInterval(tick);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [on]);

  if (!on) return null;

  return (
    <div data-ed-ui style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 2147483000, fontFamily: "system-ui, sans-serif" }}>
      {boxes.map((b) => {
        const hovered = hover === b.key;
        const isSection = b.kind === "section";
        return (
          <div
            key={b.key}
            style={{
              position: "absolute",
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
              boxSizing: "border-box",
              pointerEvents: "none",
              borderRadius: 10,
              // Outlines only where the pointer is (a dashed line round every section was visual noise).
              border: hovered ? "2px solid #ffd36a" : "2px solid transparent",
              boxShadow: hovered ? "0 0 0 4px rgba(255,211,106,0.18)" : "none",
              transition: "box-shadow 0.15s ease, border-color 0.15s ease",
            }}
          >
            <button
              type="button"
              data-ed-ui
              aria-label={`Edit ${b.label || (isSection ? "this section" : "this item")}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                post(isSection ? { source: "dds-site", type: "edit-open", section: b.key } : { source: "dds-site", type: "edit-open", item: b.key });
              }}
              style={{
                pointerEvents: "auto",
                // A section's button stays in view as the section scrolls (sticky, below the site's menu bar);
                // an item's sits in its top-right corner.
                ...(isSection
                  ? { position: "sticky", top: 84, display: "block", marginLeft: "auto", marginRight: 14, marginTop: 14, padding: "8px 14px" }
                  : { position: "absolute", top: 8, right: 8, padding: "6px 11px" }),
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "linear-gradient(180deg,#ffe9a6,#e8b04b)",
                color: "#2b1503",
                font: "700 12px/1 system-ui, sans-serif",
                letterSpacing: "0.02em",
                boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ✎ Edit{isSection && b.label ? ` ${b.label}` : ""}
            </button>
          </div>
        );
      })}
    </div>
  );
}
