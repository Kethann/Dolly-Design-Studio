"use client";

import { useEffect, useRef, useState } from "react";
import { createMarqueeVelocity, marqueeGlide, marqueeRepeats, wrapMarquee } from "./marqueeMotion";

/**
 * A row that drifts sideways on its own and can be held and dragged either way, like a track: let go and it glides on
 * with the speed you gave it, then settles back into its slow drift. It loops without a seam (the track holds two
 * equal copies and wraps by one), pauses while the pointer rests on it, and a trackpad's sideways swipe moves it too.
 * Up-and-down touches still scroll the page. Speed is in CSS pixels/second, independent of logo count.
 *
 * While the portal is editing the page, the row holds only the real entries (no repeats): it doesn't drift or loop, but it can
 * still be held and dragged (from edge to edge of the entries) to bring any entry into view, and the Edit buttons follow it.
 */
export function useDragMarquee({ pixelsPerSecond, reverse, itemCount }: { pixelsPerSecond: number; reverse?: boolean; itemCount: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [repeats, setRepeats] = useState(2);
  const remeasure = useRef<(() => void) | null>(null);
  const config = useRef({ pixelsPerSecond, reverse, itemCount });
  useEffect(() => {
    // Live portal changes must not reset the track position or interrupt a held drag.
    config.current = { pixelsPerSecond, reverse, itemCount };
    remeasure.current?.();
  }, [pixelsPerSecond, reverse, itemCount]);

  useEffect(() => {
    const vp = viewport.current;
    const tr = track.current;
    if (!vp || !tr) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
    let x = 0;
    let vel = 0; // px/s from a flick, fading out
    let half = 0;
    let sequenceWidth = 0;
    let factor = 1; // 1 = drifting, 0 = still (pointer resting on it, or being dragged)
    let direction = config.current.reverse ? 1 : -1;
    let last = 0;
    let frame = 0;
    let dragging = false;
    let hover = false;
    let onScreen = true;
    let startX = 0;
    let startPos = 0;
    const swipe = createMarqueeVelocity();
    let disposed = false;
    let travelled = 0; // how far the current drag has moved, to tell a drag from a click
    let pointer: number | null = null;
    let startY = 0;
    let all = 0;
    let room = 0;
    let editMode = document.documentElement.hasAttribute("data-dds-edit");
    let clickTimer = 0;
    let clickMarker = "";

    const measure = () => {
      const first = tr.firstElementChild as HTMLElement | null;
      if (!first) return;
      all = tr.getBoundingClientRect().width;
      room = vp.clientWidth;
      // Measure ONE copy in fractional CSS pixels. scrollWidth / 2 rounds and
      // can include overflowing text or differently loaded duplicate images.
      half = first.getBoundingClientRect().width;
      if (!editMode) {
        const sequence = Array.from(first.children).slice(0, config.current.itemCount)
          .reduce((sum, item) => sum + item.getBoundingClientRect().width, 0);
        setRepeats(marqueeRepeats(room, sequence));
        if (sequenceWidth > 0 && sequence !== sequenceWidth && !dragging) x = x / sequenceWidth * sequence;
        sequenceWidth = sequence;
      }
      start();
    };
    const wrap = () => {
      x = wrapMarquee(x, half);
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
          const glide = marqueeGlide(vel, dt);
          x += glide.distance; vel = glide.velocity;
        }
        x = all <= room ? (room - all) / 2 : Math.max(lo, Math.min(0, x));
        if ((x === lo && vel < 0) || (x === 0 && vel > 0) || all <= room) vel = 0;
        const before = tr.style.transform;
        tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
        if (before !== tr.style.transform) window.dispatchEvent(new Event("dds-track-moved")); // the Edit buttons follow
      } else {
        const paused = pointer !== null || hover || Math.abs(vel) > 12;
        factor += ((paused ? 0 : 1) - factor) * Math.min(1, dt * 6);
        if (paused && factor < 0.001) factor = 0;
        if (!dragging) {
          direction += ((config.current.reverse ? 1 : -1) - direction) * (1 - Math.exp(-dt * 8));
          const drift = reduced || !half ? 0 : direction * config.current.pixelsPerSecond;
          const glide = marqueeGlide(vel, dt);
          x += drift * factor * dt + glide.distance; vel = glide.velocity;
        }
        wrap();
        tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      }
      tr.style.willChange = (!editMode && !reduced && pointer === null && !hover) || Math.abs(vel) > 0 ? "transform" : "";
      if (Math.abs(vel) > 0 || (!editMode && !reduced && half > 0 && ((pointer === null && !hover) || factor > 0))) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (disposed || frame || !onScreen || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || pointer !== null || (e.target as Element)?.closest("[data-ed-ui],button,a,input,select,textarea")) return;
      pointer = e.pointerId;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      travelled = 0;
      startPos = x;
      swipe.reset(e.clientX, performance.now());
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
      swipe.sample(e.clientX, performance.now());
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
      vel = moved && !reduced ? swipe.release(performance.now()) : 0;
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
    // Normal pointerup releases capture too. Its later lostpointercapture event must
    // not cancel the glide that was just started; only cancel an active matching drag.
    const cancelPointer = (e: PointerEvent) => { if (pointer !== null && e.pointerId === pointer) cancel(); };
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

    remeasure.current = measure;
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(tr);
    resize.observe(vp);
    if (tr.firstElementChild) resize.observe(tr.firstElementChild);
    tr.addEventListener("load", measure, true);
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
      else { cancelAnimationFrame(frame); frame = 0; vel = 0; hover = false; release(); tr.style.willChange = ""; }
    });
    seen.observe(vp);

    vp.addEventListener("pointerdown", down);
    vp.addEventListener("pointermove", move, { passive: false });
    vp.addEventListener("pointerup", up);
    vp.addEventListener("pointercancel", cancelPointer);
    vp.addEventListener("lostpointercapture", cancelPointer);
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
      disposed = true;
      remeasure.current = null;
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(clickTimer);
      if (clickMarker && document.documentElement.dataset.ddsDragged === clickMarker) delete document.documentElement.dataset.ddsDragged;
      delete vp.dataset.drag;
      resize.disconnect();
      tr.removeEventListener("load", measure, true);
      mode.disconnect();
      seen.disconnect();
      vp.removeEventListener("pointerdown", down);
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", up);
      vp.removeEventListener("pointercancel", cancelPointer);
      vp.removeEventListener("lostpointercapture", cancelPointer);
      vp.removeEventListener("pointerenter", enter);
      vp.removeEventListener("pointerleave", leave);
      vp.removeEventListener("wheel", wheel);
      vp.removeEventListener("dragstart", noNativeDrag);
      vp.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", changeMotion);
      release();
      tr.style.transform = "";
      tr.style.willChange = "";
    };
  }, []);

  return { viewport, track, repeats };
}
