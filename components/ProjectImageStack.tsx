"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { WorkImage } from "@/content/types";
import { edItem } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { adjustStyle } from "@/lib/content/adjust";
import styles from "@/app/work/[slug]/page.module.css";
import { MediaPlaceholder } from "./MediaPlaceholder";

/** Spring for the settle after a drag or a press: quick, with the faintest overshoot. */
const STIFFNESS = 95, DAMPING = 16.5;
/** How far a flick carries on: cards/second multiplied by this, and never more than two cards. */
const THROW = .12, MAX_THROW = 2;

const wrap = (value: number, size: number) => ((value % size) + size) % size;

/** One shared fan for the project page and the poster's centered gallery. */
export function ProjectImageStack({ images, projectIndex, imageOffset = 1, initialIndex, compact = false }: {
  images: WorkImage[]; projectIndex?: number; imageOffset?: number; initialIndex?: number; compact?: boolean;
}) {
  const [active, setActive] = useState(initialIndex ?? Math.floor(images.length / 2));
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; from: number; dragging: boolean; lastX: number; lastAt: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const count = images.length;
  // Where the fan is right now, in cards. It is continuous (and unwrapped), so cards follow the finger and glide.
  const motion = useRef({ position: initialIndex ?? Math.floor(count / 2), velocity: 0, target: initialIndex ?? Math.floor(count / 2), frame: 0, last: 0 });

  /** Places every card from the live position, without a React render. */
  const paint = () => {
    const host = stage.current;
    if (!host) return;
    const { position, velocity } = motion.current;
    const narrow = window.matchMedia("(max-width: 680px)").matches;
    const reach = narrow ? 1.6 : 3.5;
    host.style.setProperty("--stack-lean", `${Math.max(-7, Math.min(7, velocity * 1.5)).toFixed(2)}deg`);
    host.querySelectorAll<HTMLElement>("[data-depth]").forEach((card) => {
      const index = Number(card.dataset.index);
      const offset = count === 2 ? index - position : wrap(index - position + count / 2, count) - count / 2;
      const depth = Math.abs(offset);
      // A card passing round the back of the fan fades out and in again, so wrapping never shows as a jump.
      const seam = count > 2 ? Math.min(1, (count / 2 - depth) / .4 + (count % 2 === 0 && depth === count / 2 ? 0 : .001)) : 1;
      const opacity = Math.max(0, Math.min(seam, reach - depth));
      card.style.setProperty("--stack-offset", offset.toFixed(4));
      card.style.setProperty("--stack-depth", depth.toFixed(4));
      card.style.zIndex = String(1000 - Math.round(depth * 100));
      card.style.opacity = opacity.toFixed(3);
      card.style.pointerEvents = opacity > .4 ? "" : "none";
    });
  };

  const stopMotion = () => {
    cancelAnimationFrame(motion.current.frame);
    motion.current.frame = 0;
    stage.current?.removeAttribute("data-moving");
  };

  /** Eases to the target card, carrying whatever speed the fan already has. */
  const settle = () => {
    const state = motion.current;
    if (!stage.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.position = state.target; state.velocity = 0;
      stopMotion(); paint();
      return;
    }
    if (state.frame) return;
    stage.current?.setAttribute("data-moving", "true");
    state.last = 0;
    const step = (now: number) => {
      const dt = state.last ? Math.min(.032, (now - state.last) / 1000) : 1 / 60;
      state.last = now;
      state.velocity += (STIFFNESS * (state.target - state.position) - DAMPING * state.velocity) * dt;
      state.position += state.velocity * dt;
      if (Math.abs(state.target - state.position) < .0012 && Math.abs(state.velocity) < .012) {
        state.position = state.target; state.velocity = 0;
        state.frame = 0;
        stage.current?.removeAttribute("data-moving");
        paint();
        return;
      }
      paint();
      state.frame = requestAnimationFrame(step);
    };
    state.frame = requestAnimationFrame(step);
  };

  // React writes the resting values on each render; the live position always has the last word, before paint.
  useLayoutEffect(() => {
    stage.current?.setAttribute("data-live", "true");
    paint();
  });
  useEffect(() => {
    const repaint = () => paint(), state = motion.current;
    window.addEventListener("resize", repaint);
    return () => {
      window.removeEventListener("resize", repaint);
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint only reads refs and the card count
  }, [count]);

  if (!count) return null;
  const current = Math.min(active, count - 1);
  const aim = (target: number) => {
    const state = motion.current;
    state.target = count === 2 ? Math.max(0, Math.min(1, target)) : target;
    setActive(wrap(state.target, count));
    settle();
  };
  /** The shortest way round to a card. */
  const goTo = (index: number) => {
    const state = motion.current;
    aim(count === 2 ? index : state.target + wrap(index - state.target + count / 2, count) - count / 2);
  };
  const move = (direction: number) => {
    const state = motion.current;
    if (count === 2) aim(1 - state.target);
    else aim(state.target + direction);
  };
  const resetGesture = () => {
    gesture.current = null;
    stage.current?.removeAttribute("data-dragging");
  };
  /** An interrupted drag commits nothing: the fan glides back to the card it started from. */
  const cancelDrag = () => {
    const start = gesture.current;
    resetGesture();
    if (start?.dragging) { motion.current.velocity = 0; aim(Math.round(start.from)); }
  };
  /** Pixels of drag that move the fan by one card. */
  const cardTravel = () => Math.max(130, (stage.current?.clientWidth ?? 0) * .12);

  return <section className={styles.stackGallery} data-compact={compact || undefined} aria-label="Project artwork gallery">
    <div ref={stage} className={styles.stackStage} data-stack-stage onKeyDown={(event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "Home") goTo(0);
        else if (event.key === "End") goTo(count - 1);
        else move(event.key === "ArrowLeft" ? -1 : 1);
        requestAnimationFrame(() => stage.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true }));
      }
    }} onPointerDown={(event) => {
      if (!event.isPrimary || event.button !== 0 || count < 2) return;
      suppressClickUntil.current = 0;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: motion.current.position, dragging: false, lastX: event.clientX, lastAt: event.timeStamp };
    }} onPointerMove={(event) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!start.dragging && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { resetGesture(); return; }
      if (!start.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        start.dragging = true;
        // Catching a moving fan takes over from wherever it has got to.
        stopMotion();
        start.from = motion.current.position;
        motion.current.velocity = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = "true";
      }
      if (start.dragging) {
        event.preventDefault();
        const state = motion.current, travel = cardTravel();
        let next = start.from - dx / travel;
        // Two cards have ends rather than a loop: pulling past one meets soft resistance.
        if (count === 2) next = next < 0 ? next * .3 : next > 1 ? 1 + (next - 1) * .3 : next;
        const elapsed = Math.max(.004, (event.timeStamp - start.lastAt) / 1000);
        const speed = -(event.clientX - start.lastX) / travel / elapsed;
        state.velocity = state.velocity * .65 + speed * .35;
        state.position = next;
        start.lastX = event.clientX; start.lastAt = event.timeStamp;
        const nearest = wrap(Math.round(next), count);
        if (nearest !== active) setActive(nearest);
        paint();
      }
    }} onPointerUp={(event) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      if (start.dragging) {
        const state = motion.current, dx = event.clientX - start.x;
        suppressClickUntil.current = event.timeStamp + 400;
        // Holding still before letting go means no throw.
        if (event.timeStamp - start.lastAt > 90) state.velocity = 0;
        const base = Math.round(state.position);
        const thrown = Math.max(-MAX_THROW, Math.min(MAX_THROW, state.velocity * THROW));
        let target = Math.round(state.position + thrown);
        // A short deliberate swipe always turns at least one card.
        if (target === Math.round(start.from) && Math.abs(dx) >= 44) target = Math.round(start.from) + (dx < 0 ? 1 : -1);
        aim(Math.max(base - MAX_THROW, Math.min(base + MAX_THROW, target)));
      }
      resetGesture();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={cancelDrag} onLostPointerCapture={(event) => {
      // Touch starts with implicit capture on the card. Its bubbled loss when
      // capture transfers to this stage must not cancel the new horizontal drag.
      if (event.target === event.currentTarget) cancelDrag();
    }}
      onClickCapture={(event) => {
        if (event.detail !== 0 && event.timeStamp < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
      }} onDragStart={event => event.preventDefault()}>
      {images.map((img, index) => {
        const offset = count === 2 ? (index === current ? 0 : current === 0 ? 1 : -1)
          : ((index - current + count + Math.floor(count / 2)) % count) - Math.floor(count / 2);
        const depth = Math.abs(offset);
        // Keep only the visible fan and one card of runway on each side. A large
        // gallery must not request every image or create dozens of GPU layers at once.
        if (depth > 4) return null;
        return <button key={`${img.src}-${index}`} type="button" className={styles.stackCard}
          style={{ "--stack-offset": offset, "--stack-depth": depth, zIndex: count - depth } as CSSProperties}
          data-index={index} data-depth={depth} data-visible={depth <= 3} aria-hidden={depth > 3}
          aria-label={`${img.alt || `Project image ${index + imageOffset + 1}`} (${index + 1} of ${count})`}
          aria-current={offset === 0 ? "true" : undefined} tabIndex={offset === 0 ? 0 : -1}
          onClick={() => goTo(index)}
          {...(offset === 0 && projectIndex !== undefined ? edItem(`projects.${projectIndex}.images`, index + imageOffset, "Picture") : {})}>
          {img.src ? <Image src={versionedSrc(img.src)} style={adjustStyle(img, "src")} alt={img.alt} fill
            draggable={false} loading={depth === 0 ? "eager" : "lazy"} fetchPriority={depth === 0 ? "high" : "auto"}
            sizes="(max-width: 680px) 74vw, (max-width: 1100px) 42vw, 410px" quality={90} {...placeholderProps(img.src)} /> : <MediaPlaceholder />}
        </button>;
      })}
    </div>
    {count > 1 && <div className={styles.stackControls}>
      <button type="button" onClick={() => move(-1)} aria-label="Previous project image">←</button>
      <span aria-live="polite">{current + 1} / {count}</span>
      <button type="button" onClick={() => move(1)} aria-label="Next project image">→</button>
    </div>}
  </section>;
}
