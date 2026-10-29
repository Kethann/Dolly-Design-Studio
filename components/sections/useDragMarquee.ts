"use client";

import { useEffect, useRef } from "react";

/**
 * A row that drifts sideways on its own and can be held and dragged either way, like a track: let go and it glides on
 * with the speed you gave it, then settles back into its slow drift. It loops without a seam (the track holds two
 * equal copies and wraps by one), pauses while the pointer rests on it, and a trackpad's sideways swipe moves it too.
 * Up-and-down touches still scroll the page. `seconds` is how long one full copy takes to drift past.
 */
export function useDragMarquee({ seconds, reverse }: { seconds: number; reverse?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vp = viewport.current;
    const tr = track.current;
    if (!vp || !tr) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    const measure = () => {
      half = tr.scrollWidth / 2;
    };
    const wrap = () => {
      if (half > 0) x = ((x % half) - half) % half;
    };
    const editing = () => document.documentElement.hasAttribute("data-dds-edit");

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (editing()) {
        tr.style.transform = ""; // the portal lays every entry out while editing
      } else {
        factor += ((dragging || hover ? 0 : 1) - factor) * Math.min(1, dt * 6);
        if (!dragging) {
          const drift = reduced || !half ? 0 : ((reverse ? 1 : -1) * half) / seconds;
          x += (drift * factor + vel) * dt;
          vel *= Math.exp(-dt * 3.2);
          if (Math.abs(vel) < 1) vel = 0;
        }
        wrap();
        tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      }
      if (onScreen) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      startX = lastX = e.clientX;
      startPos = x;
      lastT = performance.now();
      flick = 0;
      vel = 0;
      vp.dataset.drag = "true";
      try {
        vp.setPointerCapture(e.pointerId);
      } catch {}
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      x = startPos + (e.clientX - startX);
      const now = performance.now();
      const dt = (now - lastT) / 1000;
      if (dt > 0) flick = flick * 0.6 + ((e.clientX - lastX) / dt) * 0.4; // a smoothed speed, so one jittery sample doesn't throw it
      lastX = e.clientX;
      lastT = now;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      delete vp.dataset.drag;
      // Let go while still moving and it glides on; let go while holding still and it simply stays.
      vel = performance.now() - lastT < 90 ? Math.max(-3500, Math.min(3500, flick)) : 0;
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover = true;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover = false;
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || editing()) return; // up and down belongs to the page
      e.preventDefault();
      x -= e.deltaX;
      vel = 0;
    };
    const noNativeDrag = (e: Event) => e.preventDefault();

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(tr);
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
    });
    seen.observe(vp);

    vp.addEventListener("pointerdown", down);
    vp.addEventListener("pointermove", move);
    vp.addEventListener("pointerup", up);
    vp.addEventListener("pointercancel", up);
    vp.addEventListener("pointerenter", enter);
    vp.addEventListener("pointerleave", leave);
    vp.addEventListener("wheel", wheel, { passive: false });
    vp.addEventListener("dragstart", noNativeDrag);
    start();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
      vp.removeEventListener("pointerdown", down);
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", up);
      vp.removeEventListener("pointercancel", up);
      vp.removeEventListener("pointerenter", enter);
      vp.removeEventListener("pointerleave", leave);
      vp.removeEventListener("wheel", wheel);
      vp.removeEventListener("dragstart", noNativeDrag);
      tr.style.transform = "";
    };
  }, [seconds, reverse]);

  return { viewport, track };
}
