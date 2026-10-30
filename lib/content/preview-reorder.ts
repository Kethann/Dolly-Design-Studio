import type { SiteToPortal } from "@/lib/intro/preview-protocol";

export function itemPosition(key: string) {
  const match = /^(.+)\.(\d+)$/.exec(key);
  return match ? { list: match[1], index: Number(match[2]) } : null;
}

/** Dedicated handles leave the cards themselves available for navigation and touch scrolling. */
export function bindPreviewReorder(post: (message: SiteToPortal) => void, announce: (message: string) => void) {
  const items = (list: string) => Array.from(document.querySelectorAll<HTMLElement>("[data-ed-item]:not([data-ed-dup])"))
    .filter((item) => itemPosition(item.dataset.edItem ?? "")?.list === list && item.getBoundingClientRect().width > 0)
    .sort((a, b) => itemPosition(a.dataset.edItem!)!.index - itemPosition(b.dataset.edItem!)!.index);
  let drag: { handle: HTMLElement; source: HTMLElement; siblings: HTMLElement[]; list: string; from: number; pointer: number; x: number; y: number; startX: number; startY: number; moved: boolean; target: HTMLElement | null; badge: HTMLElement } | null = null;
  let frame = 0;
  let lastPoint = "";
  let lastTime = 0;
  let settling: { source: HTMLElement; expected: string; positions: Map<HTMLElement, DOMRect> } | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingFocus: string | null = null;
  const animations = new Set<Animation>();
  const clearSettle = () => {
    clearTimeout(settleTimer);
    settling = null;
    pendingFocus = null;
    focusObserver.disconnect();
  };
  const prepareSettle = (source: HTMLElement, siblings: HTMLElement[], list: string, to: number) => {
    clearTimeout(settleTimer);
    for (const animation of animations) animation.cancel();
    animations.clear();
    // Keep only visible cards, with a bounded layer budget for very dense galleries.
    // Offscreen images never acquire an animation layer or a retained rectangle.
    const positions = new Map<HTMLElement, DOMRect>();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const item of siblings) {
        const rect = item.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth) positions.set(item, rect);
        if (positions.size >= 24) break;
      }
    }
    settling = { source, expected: `${list}.${to}`, positions };
    focusObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ed-reorder", "data-ed-item"] });
    settleTimer = setTimeout(clearSettle, 4000);
  };
  const settleCards = () => {
    if (!settling || (settling.source.isConnected && settling.source.dataset.edItem !== settling.expected)) return;
    const positions = settling.positions;
    settling = null;
    clearTimeout(settleTimer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Read every position first; only transforms animate, never the grid's layout.
    const moves = Array.from(positions, ([item, before]) => ({ item, before, after: item.getBoundingClientRect() }));
    for (const { item, before, after } of moves) {
      if (!item.isConnected || after.bottom < 0 || after.top > innerHeight || after.right < 0 || after.left > innerWidth) continue;
      const dx = before.left - after.left, dy = before.top - after.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      const animation = item.animate([
        { translate: `${dx}px ${dy}px` }, { translate: "0px 0px" },
      ], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      animations.add(animation);
      void animation.finished.then(() => {
        animations.delete(animation);
        if (!animations.size) window.dispatchEvent(new Event("dds-track-moved"));
      }, () => animations.delete(animation));
    }
  };
  const finish = (commit: boolean) => {
    if (!drag) return;
    const active = drag;
    drag = null;
    cancelAnimationFrame(frame);
    frame = 0;
    delete active.source.dataset.edDragging;
    if (active.target) delete active.target.dataset.edDrop;
    active.badge.remove();
    if (active.handle.hasPointerCapture(active.pointer)) active.handle.releasePointerCapture(active.pointer);
    const to = itemPosition(active.target?.dataset.edItem ?? "")?.index;
    if (commit && active.moved && active.source.isConnected && active.target?.isConnected && to !== undefined && to !== active.from) {
      prepareSettle(active.source, active.siblings, active.list, to);
      post({ source: "dds-site", type: "edit-reorder", list: active.list, from: active.from, to });
      announce("Card order changed in your draft. Use Undo to restore it, or Save & publish to keep it.");
    } else if (active.moved) announce("Move cancelled. Card order unchanged.");
    window.dispatchEvent(new Event("dds-track-moved"));
  };
  const tick = (time: number) => {
    frame = 0;
    if (!drag) return;
    if (!drag.source.isConnected || document.hidden) { finish(false); return; }
    if (drag.moved) {
      // Ease into edge scrolling at the same speed on 60 Hz and high-refresh displays.
      const dt = Math.min(32, lastTime ? time - lastTime : 16) / 1000;
      lastTime = time;
      const edge = 72;
      const strength = drag.y < edge ? -Math.min(1, (edge - drag.y) / edge) : drag.y > innerHeight - edge ? Math.min(1, (drag.y - innerHeight + edge) / edge) : 0;
      const dy = Math.sign(strength) * strength * strength * 480 * dt;
      const oldScroll = window.scrollY;
      if (dy) window.scrollBy({ top: dy, behavior: "instant" });
      const scrolling = oldScroll !== window.scrollY;
      const point = `${drag.x},${drag.y},${window.scrollX},${window.scrollY}`;
      if (point === lastPoint) { if (scrolling) frame = requestAnimationFrame(tick); return; }
      lastPoint = point;
      let nearest: HTMLElement | null = null;
      let distance = 32 * 32;
      for (const item of drag.siblings) {
        if (!item.isConnected) continue;
        const r = item.getBoundingClientRect();
        const dx = Math.max(r.left - drag.x, 0, drag.x - r.right);
        const dy = Math.max(r.top - drag.y, 0, drag.y - r.bottom);
        const d = dx * dx + dy * dy;
        if (d <= distance) { nearest = item; distance = d; }
      }
      if (nearest !== drag.target) {
        if (drag.target) delete drag.target.dataset.edDrop;
        drag.target = nearest;
        if (nearest && nearest !== drag.source) nearest.dataset.edDrop = "1";
      }
      drag.badge.style.transform = `translate3d(${Math.min(innerWidth - 160, Math.max(8, drag.x + 14))}px, ${Math.max(8, drag.y - 52)}px, 0)`;
      const label = nearest && nearest !== drag.source ? `Place at ${itemPosition(nearest.dataset.edItem!)!.index + 1}` : "Drag onto another card";
      if (drag.badge.textContent !== label) drag.badge.textContent = label;
      if (scrolling) frame = requestAnimationFrame(tick);
    }
  };
  const down = (event: PointerEvent) => {
    const handle = (event.target as Element | null)?.closest<HTMLElement>("[data-ed-reorder]");
    const position = itemPosition(handle?.dataset.edReorder ?? "");
    if (!handle || !position || event.button !== 0 || !event.isPrimary || drag || settling) return;
    const siblings = items(position.list);
    const source = siblings.find((item) => item.dataset.edItem === handle.dataset.edReorder);
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    const badge = document.createElement("div");
    badge.className = "dds-reorder-badge";
    badge.dataset.edUi = "";
    badge.hidden = true;
    document.body.append(badge);
    lastPoint = "";
    lastTime = 0;
    drag = { handle, source, siblings, ...position, from: position.index, pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, target: null, badge };
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    event.preventDefault();
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6) {
      drag.moved = true; drag.badge.hidden = false; drag.source.dataset.edDragging = "1";
    }
    if (drag.moved && !frame) frame = requestAnimationFrame(tick);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointer) return;
    drag.x = event.clientX; drag.y = event.clientY;
    cancelAnimationFrame(frame);
    tick(performance.now()); // Resolve the actual release position, even between animation frames.
    finish(true);
  };
  const cancel = () => finish(false);
  const visibilityChanged = () => {
    if (!document.hidden) return;
    finish(false);
    clearSettle();
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
  const contentChanged = (event: MessageEvent) => {
    if (event.origin === window.location.origin && event.source === window.parent && event.data?.source === "dds-portal" && event.data.type === "content") finish(false);
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" && drag) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
    const handle = (event.target as Element | null)?.closest<HTMLElement>("[data-ed-reorder]");
    const position = itemPosition(handle?.dataset.edReorder ?? "");
    if (!handle || !position || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (drag || settling) return;
    const siblings = items(position.list);
    const current = siblings.findIndex((item) => item.dataset.edItem === handle.dataset.edReorder);
    const to = itemPosition(siblings[current + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1)]?.dataset.edItem ?? "")?.index;
    if (to === undefined) return;
    pendingFocus = `${position.list}.${to}`;
    prepareSettle(siblings[current], siblings, position.list, to);
    post({ source: "dds-site", type: "edit-reorder", list: position.list, from: position.index, to });
    announce(`Card moved to position ${to + 1} in your draft. Save & publish to keep the order.`);
  };
  const focusObserver = new MutationObserver(() => {
    settleCards();
    if (settling) return;
    // Follow the moved card only after its draft update; stay disconnected at idle.
    if (pendingFocus) {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-ed-reorder]")).find((item) => item.dataset.edReorder === pendingFocus);
      target?.focus({ preventScroll: true });
    }
    clearSettle();
  });
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move, { passive: false });
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("lostpointercapture", cancel);
  document.addEventListener("keydown", keyboard, true);
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("blur", cancel);
  window.addEventListener("message", contentChanged);
  return () => {
    finish(false); clearSettle();
    for (const animation of animations) animation.cancel();
    animations.clear();
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    document.removeEventListener("lostpointercapture", cancel);
    document.removeEventListener("keydown", keyboard, true);
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("message", contentChanged);
  };
}
