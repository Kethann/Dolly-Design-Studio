"use client";

import { useEffect, useRef } from "react";

/**
 * A row that drifts sideways on its own and can be held and dragged either way, like a track: let go and it glides on
 * with the speed you gave it, then settles back into its slow drift. It loops without a seam (the track holds two
 * equal copies and wraps by one), pauses while the pointer rests on it, and a trackpad's sideways swipe moves it too.
 * Up-and-down touches still scroll the page. `seconds` is how long one full copy takes to drift past.
 *
 * While the portal is editing the page, the row holds only the real entries (no repeats): it doesn't drift or loop, but it can
 * still be held and dragged (from edge to edge of the entries) to bring any entry into view, and the Edit buttons follow it.
 */
export function useDragMarquee({ seconds, reverse }: { seconds: number; reverse?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vp = viewport.current;
    const tr = track.current;
    if (!vp || !tr) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
    let x = 0;
    let vel = 0; // px/s from a flick, fading out
    let half = 0;
    let factor = 1; // 1 = drifting, 0 = still (pointer resting on it, or being dragged)
    let last = 0;
    let frame = 0;
    let dragging = false;
    let hover = false;
    let onScreen = true;
    let startX = 0;
    let startPos = 0;
    let lastX = 0;
    let lastT = 0;
    let flick = 0;
    let travelled = 0; // how far the current drag has moved, to tell a drag from a click
    let pointer: number | null = null;
    let startY = 0;
    let all = 0;
    let room = 0;
    let editMode = document.documentElement.hasAttribute("data-dds-edit");
    let clickTimer = 0;
    let clickMarker = "";

    const measure = () => {
      all = tr.scrollWidth;
      room = vp.clientWidth;
      half = all / 2;
      start();
    };
    const wrap = () => {
      if (half > 0) x = ((x % half) - half) % half;
    };

    const tick = (now: number) => {
      frame = 0;
      if (!onScreen || document.hidden) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (editMode) {
        // Only the real entries, held still: dragging moves along them from the first to the last, never past either end.
        const lo = Math.min(0, room - all);
        if (!dragging) {
          x += vel * dt;
          vel *= Math.exp(-dt * 3.2);
          if (Math.abs(vel) < 1) vel = 0;
        }
        x = all <= room ? (room - all) / 2 : Math.max(lo, Math.min(0, x));
        if ((x === lo && vel < 0) || (x === 0 && vel > 0) || all <= room) vel = 0;
        const before = tr.style.transform;
        tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
        if (before !== tr.style.transform) window.dispatchEvent(new Event("dds-track-moved")); // the Edit buttons follow
      } else {
        const paused = pointer !== null || hover;
        factor += ((paused ? 0 : 1) - factor) * Math.min(1, dt * 6);
        if (paused && factor < 0.001) factor = 0;
        if (!dragging) {
          const drift = reduced || !half ? 0 : ((reverse ? 1 : -1) * half) / seconds;
          x += (drift * factor + vel) * dt;
          vel *= Math.exp(-dt * 3.2);
          if (Math.abs(vel) < 1) vel = 0;
        }
        wrap();
        tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      }
      tr.style.willChange = (!editMode && !reduced && pointer === null && !hover) || Math.abs(vel) > 0 ? "transform" : "";
      if (Math.abs(vel) > 0 || (!editMode && !reduced && half > 0 && ((pointer === null && !hover) || factor > 0))) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame || !onScreen || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || pointer !== null || (e.target as Element)?.closest("[data-ed-ui],button,a,input,select,textarea")) return;
      pointer = e.pointerId;
      dragging = false;
      startX = lastX = e.clientX;
      startY = e.clientY;
      travelled = 0;
      startPos = x;
      lastT = performance.now();
      flick = 0;
      vel = 0;
      factor = 0;
      start();
      try {
        vp.setPointerCapture(e.pointerId);
      } catch {}
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { cancel(); return; }
        dragging = true;
        vp.dataset.drag = "true";
      }
      e.preventDefault();
      x = startPos + (e.clientX - startX);
      travelled = Math.max(travelled, Math.abs(e.clientX - startX));
      const now = performance.now();
      const dt = (now - lastT) / 1000;
      if (dt > 0) flick = flick * 0.6 + ((e.clientX - lastX) / dt) * 0.4; // a smoothed speed, so one jittery sample doesn't throw it
      lastX = e.clientX;
      lastT = now;
      start();
    };
    const release = () => {
      const id = pointer;
      pointer = null;
      dragging = false;
      delete vp.dataset.drag;
      if (id !== null && vp.hasPointerCapture(id)) vp.releasePointerCapture(id);
    };
    const suppressClick = () => {
      window.clearTimeout(clickTimer);
      clickMarker = String(performance.now());
      document.documentElement.dataset.ddsDragged = clickMarker;
      clickTimer = window.setTimeout(() => {
        if (document.documentElement.dataset.ddsDragged === clickMarker) delete document.documentElement.dataset.ddsDragged;
      }, 100);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const moved = dragging;
      if (moved) x = startPos + (e.clientX - startX);
      release();
      // A drag must not count as a click on the entry under the pointer (the editing page opens an entry on a click).
      if (travelled > 4) {
        suppressClick();
      }
      // Let go while still moving and it glides on; let go while holding still and it simply stays.
      vel = moved && !reduced && performance.now() - lastT < 90 ? Math.max(-1800, Math.min(1800, flick)) : 0;
      start();
    };
    const cancel = () => {
      if (pointer !== null) {
        if (travelled > 4) suppressClick();
        release();
      }
      vel = 0;
      start();
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") { hover = true; start(); }
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") { hover = false; start(); }
    };
    const wheel = (e: WheelEvent) => {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (!e.shiftKey && Math.abs(dx) <= Math.abs(e.deltaY)) return; // up and down belongs to the page
      e.preventDefault();
      x -= dx * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? room : 1);
      vel = 0;
      start();
    };
    const key = (e: KeyboardEvent) => {
      if (e.target !== vp) return;
      if (e.key === "Escape") { cancel(); return; }
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      x = e.key === "Home" ? 0 : e.key === "End" ? Math.min(0, room - all) : x + (e.key === "ArrowLeft" ? 1 : -1) * Math.min(320, room * 0.7);
      vel = 0;
      start();
    };
    const visibility = () => {
      if (document.hidden) {
        cancel(); cancelAnimationFrame(frame); frame = 0; tr.style.willChange = "";
      } else start();
    };
    const changeMotion = () => { reduced = motion.matches; vel = 0; start(); };
    const noNativeDrag = (e: Event) => e.preventDefault();

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(tr);
    resize.observe(vp);
    const mode = new MutationObserver(() => {
      const next = document.documentElement.hasAttribute("data-dds-edit");
      if (next === editMode) return;
      editMode = next;
      cancel(); x = 0; measure();
    });
    mode.observe(document.documentElement, { attributes: true, attributeFilter: ["data-dds-edit"] });
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else { cancelAnimationFrame(frame); frame = 0; vel = 0; release(); tr.style.willChange = ""; }
    });
    seen.observe(vp);

    vp.addEventListener("pointerdown", down);
    vp.addEventListener("pointermove", move, { passive: false });
    vp.addEventListener("pointerup", up);
    vp.addEventListener("pointercancel", cancel);
    vp.addEventListener("lostpointercapture", cancel);
    vp.addEventListener("pointerenter", enter);
    vp.addEventListener("pointerleave", leave);
    vp.addEventListener("wheel", wheel, { passive: false });
    vp.addEventListener("dragstart", noNativeDrag);
    vp.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", changeMotion);
    start();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(clickTimer);
      if (clickMarker && document.documentElement.dataset.ddsDragged === clickMarker) delete document.documentElement.dataset.ddsDragged;
      delete vp.dataset.drag;
      resize.disconnect();
      mode.disconnect();
      seen.disconnect();
      vp.removeEventListener("pointerdown", down);
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", up);
      vp.removeEventListener("pointercancel", cancel);
      vp.removeEventListener("lostpointercapture", cancel);
      vp.removeEventListener("pointerenter", enter);
      vp.removeEventListener("pointerleave", leave);
      vp.removeEventListener("wheel", wheel);
      vp.removeEventListener("dragstart", noNativeDrag);
      vp.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", changeMotion);
      tr.style.transform = "";
      tr.style.willChange = "";
    };
  }, [seconds, reverse]);

  return { viewport, track };
}
