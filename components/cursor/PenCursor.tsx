"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useMotion } from "@/lib/motion";
import { NIB_PATH, NIB_VIEWBOX } from "@/content/generated/nib-path";
import { sharedLabels } from "@/content/pages";
import styles from "./PenCursor.module.css";

/**
 * The pen cursor: the nib traced from the studio's logo, pinned exactly to the
 * pointer (no lag), plus a gold frame that snaps around posters on hover.
 * The page itself is never dimmed — everything stays fully visible.
 */
export function PenCursor() {
  const { reducedMotion, isTouch } = useMotion();

  const penRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"idle" | "link" | "poster">("idle");
  const [visible, setVisible] = useState(false);

  const enabled = !isTouch && !reducedMotion;

  // Hide the native cursor only while the pen is active.
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("has-follow-spot");
    return () => document.documentElement.classList.remove("has-follow-spot");
  }, [enabled]);

  // Pin the pen to the raw pointer position every move — no easing, so it never trails or drifts.
  useEffect(() => {
    if (!enabled) return;
    function onMove(e: PointerEvent) {
      const pen = penRef.current;
      if (pen) pen.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      setVisible(true);
    }
    function onLeave() {
      setVisible(false);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [enabled]);

  // Delegated hover detection for data-cursor="poster" | "link" elements.
  useEffect(() => {
    if (!enabled) return;
    const resolve = (el: EventTarget | null) =>
      el instanceof Element ? el.closest<HTMLElement>("[data-cursor]") : null;

    function onOver(e: PointerEvent) {
      const target = resolve(e.target);
      if (!target) return;
      const kind = target.dataset.cursor === "poster" ? "poster" : "link";
      setState(kind);
      if (kind === "poster" && frameRef.current) {
        const r = target.getBoundingClientRect();
        gsap.to(frameRef.current, {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          opacity: 1,
          duration: 0.4,
          ease: "expo.out",
        });
      }
      if (labelRef.current) labelRef.current.textContent = target.dataset.cursorLabel ?? sharedLabels.posterHover;
    }

    function onOut(e: PointerEvent) {
      const leaving = resolve(e.target);
      if (!leaving || leaving === resolve(e.relatedTarget)) return;
      setState("idle");
      if (frameRef.current) gsap.to(frameRef.current, { opacity: 0, duration: 0.25 });
    }

    // Scrolling moves posters out from under a fixed frame — drop it.
    function onScroll() {
      if (frameRef.current) gsap.to(frameRef.current, { opacity: 0, duration: 0.15 });
    }

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      <div ref={frameRef} className={styles.posterFrame} />
      <div ref={penRef} className={styles.pen} style={{ opacity: visible ? 1 : 0 }}>
        <div className={`${styles.nib} ${state !== "idle" ? styles.nibActive : ""}`}>
          <svg viewBox={NIB_VIEWBOX} width="30">
            <path d={NIB_PATH} fill="var(--gold-bright)" />
          </svg>
        </div>
        <span ref={labelRef} className={`${styles.label} ${state === "poster" ? styles.labelVisible : ""}`} />
      </div>
    </div>
  );
}
