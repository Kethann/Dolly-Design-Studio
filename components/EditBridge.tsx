"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { bindPreviewNavigation } from "@/lib/content/preview-navigation";
import { bindPreviewReorder, itemPosition } from "@/lib/content/preview-reorder";
import "./EditBridge.css";
import { PREVIEW_PARAM, type PortalToSite, type SiteToPortal } from "@/lib/intro/preview-protocol";

/** A list's container, and where its "＋ Add" button goes (below it, centred). */
interface ListBox {
  list: string;
  label: string;
  top: number;
  left: number;
  count: number;
  max: number;
}

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
  marquee: boolean;
}

/** The element's rectangle after every clipping ancestor (overflow hidden / clip) has cut it, or null if it is cut away entirely. */
function visibleRect(el: HTMLElement, clips: Map<HTMLElement, DOMRect | null>): DOMRect | null {
  let r = el.getBoundingClientRect();
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    if (!clips.has(p)) {
      const o = getComputedStyle(p);
      clips.set(p, /(hidden|clip|auto|scroll)/.test(o.overflowX + o.overflowY) ? p.getBoundingClientRect() : null);
    }
    const c = clips.get(p);
    if (c) {
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
 * keeps ordinary card clicks, links and filters working. Only explicit Edit buttons open editors; form submission is blocked.
 *
 * The buttons live in the page's own coordinate space, one frame per element placed exactly over it. They therefore
 * scroll with the page natively (no script runs while scrolling, so nothing lags or jumps), and a section's button
 * rides down its section with plain CSS `position: sticky`. Positions are only re-measured when the layout changes.
 */
export function EditBridge() {
  const [on, setOn] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [lists, setLists] = useState<ListBox[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const frame = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const listCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const box of boxes) {
      const position = box.kind === "item" ? itemPosition(box.key) : null;
      if (position) counts.set(position.list, (counts.get(position.list) ?? 0) + 1);
    }
    return counts;
  }, [boxes]);

  useEffect(() => {
    if (on) return bindPreviewReorder(post, setAnnouncement);
  }, [on]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(PREVIEW_PARAM) || window.parent === window) return;
    return bindPreviewNavigation((href) => router.push(href));
  }, [router]);

  // Tell the portal which page the preview is on, so its page tabs always match what is shown (even after a card was pressed).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(PREVIEW_PARAM) || window.parent === window) return;
    post({ source: "dds-site", type: "route", path: pathname });
  }, [pathname]);

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
      if (document.hidden) return;
      const clips = new Map<HTMLElement, DOMRect | null>();
      const sx = window.scrollX;
      const sy = window.scrollY;
      const next: Box[] = [];
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const dialog = dialogs[dialogs.length - 1];
      document.querySelectorAll<HTMLElement>("[data-ed-section],[data-ed-item]").forEach((el) => {
        if (dialog && !dialog.contains(el)) return;
        const r = visibleRect(el, clips);
        if (!r || r.width < 24 || r.height < 24) return;
        const section = el.dataset.edSection;
        if (!section && r.width < 82) return; // A clipped sliver cannot fit a usable Edit button.
        next.push({ key: section ?? el.dataset.edItem!, kind: section ? "section" : "item", label: el.dataset.edLabel ?? "", top: r.top + sy, left: r.left + sx, width: r.width, height: r.height, marquee: !!el.closest("[data-marquee]") });
      });
      const nextLists: ListBox[] = [];
      const explicitAdds = new Set(Array.from(document.querySelectorAll<HTMLElement>("[data-ed-add-list]"), (control) => control.dataset.edAddList));
      document.querySelectorAll<HTMLElement>("[data-ed-list]").forEach((el) => {
        if (dialog && !dialog.contains(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) return;
        const list = el.dataset.edList!;
        if (explicitAdds.has(list)) return;
        nextLists.push({
          list,
          label: el.dataset.edListLabel ?? "item",
          top: r.bottom + sy + 12,
          left: r.left + sx + r.width / 2,
          count: el.querySelectorAll(`[data-ed-item^="${list}."]:not([data-ed-dup])`).length,
          max: Number(el.dataset.edListMax) || 0,
        });
      });
      setLists((old) => (old.length === nextLists.length && old.every((o, i) => o.list === nextLists[i].list && o.count === nextLists[i].count && o.label === nextLists[i].label && o.max === nextLists[i].max && Math.abs(o.top - nextLists[i].top) < 1 && Math.abs(o.left - nextLists[i].left) < 1) ? old : nextLists));
      // Only when something moved or resized: an unchanged page needs no redraw.
      setBoxes((old) => (old.length === next.length && old.every((o, i) => o.key === next[i].key && o.label === next[i].label && o.kind === next[i].kind && Math.abs(o.top - next[i].top) < 1 && Math.abs(o.left - next[i].left) < 1 && Math.abs(o.width - next[i].width) < 1 && Math.abs(o.height - next[i].height) < 1) ? old : next));
    };
    const schedule = () => {
      if (!document.hidden && !frame.current) frame.current = requestAnimationFrame(measure);
    };
    let hoverKey: string | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-ed-item],[data-ed-section]") as HTMLElement | null;
      const key = el ? (el.dataset.edItem ?? el.dataset.edSection ?? null) : null;
      if (key !== hoverKey) { hoverKey = key; setHover(key); }
    };
    const onSubmit = (e: Event) => e.preventDefault();

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("dds-track-moved", schedule); // a track was dragged: the Edit buttons follow it
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    const mo = new MutationObserver((records) => {
      // Overlay labels and buttons do not change the content's layout.
      if (records.some((record) => !(record.target instanceof Element && record.target.closest("[data-ed-ui]")))) schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const tick = setInterval(() => { if (!document.hidden) schedule(); }, 1200); // catches reveal animations and images that finish loading
    return () => {
      delete root.dataset.ddsEdit;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      clearInterval(tick);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
      window.removeEventListener("dds-track-moved", schedule);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [on]);

  if (!on) return null;

  return (
    <div data-ed-ui style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 2147483000, fontFamily: "system-ui, sans-serif" }}>
      <span role="status" className="dds-reorder-status">{announcement}</span>
      {boxes.map((b) => {
        const hovered = hover === b.key;
        const isSection = b.kind === "section";
        const position = !isSection ? itemPosition(b.key) : null;
        const reorderable = position && (listCounts.get(position.list) ?? 0) > 1;
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
            {reorderable && (b.width >= 130 || b.height >= 110) && <button type="button" className="dds-reorder-handle" data-ed-ui data-ed-reorder={b.key}
              style={b.marquee ? { top: -52 } : b.width < 130 ? { top: 58 } : undefined}
              aria-label={`Reorder ${b.label || "card"}. Drag to a card, or use arrow keys.`}
              title="Drag onto a card to change the order. Arrow keys also move the card."
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
            >{b.width < 155 ? "⠿" : "⠿ Move"}</button>}
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
                minHeight: 44,
                // A section's button stays in view as the section scrolls (sticky, below the site's menu bar);
                // an item's sits in its top-right corner.
                ...(isSection
                  ? { position: "sticky", top: 84, display: "block", marginLeft: "auto", marginRight: 14, marginTop: 14, padding: "8px 14px" }
                  : { position: "absolute", top: b.marquee ? -52 : 8, right: 8, padding: "6px 11px" }),
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
      {lists.map((l) => {
        const full = l.max > 0 && l.count >= l.max;
        return (
          <button
            key={l.list}
            type="button"
            data-ed-ui
            disabled={full}
            aria-label={`Add a ${l.label}`}
            title={full ? `The most is ${l.max}` : `Add a new ${l.label}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              post({ source: "dds-site", type: "edit-add", list: l.list });
            }}
            style={{
              position: "absolute",
              left: l.left,
              top: l.top,
              transform: "translateX(-50%)",
              pointerEvents: "auto",
              padding: "9px 16px",
              borderRadius: 999,
              border: "1.5px solid #ffd36a",
              background: "rgba(34,20,10,0.92)",
              color: "#ffe9a6",
              font: "700 12px/1 system-ui, sans-serif",
              letterSpacing: "0.02em",
              boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
              cursor: full ? "not-allowed" : "pointer",
              opacity: full ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            ＋ Add a {l.label}
          </button>
        );
      })}
    </div>
  );
}
