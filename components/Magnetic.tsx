"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useMotion } from "@/lib/motion";

/**
 * Wrap a button/link to make it lift and nudge toward the cursor when hovered
 * (the "magnetic" link state from the cursor spec). No-ops on touch and under
 * reduced motion.
 */
export function Magnetic({
  children,
  strength = 0.4,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { isTouch, reducedMotion } = useMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || isTouch || reducedMotion) return;

    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "expo.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "expo.out" });
    const liftTo = gsap.quickTo(el, "y", { duration: 0.3, ease: "expo.out" });

    function onMove(e: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      xTo(relX * strength);
      yTo(relY * strength - 6);
    }
    function onLeave() {
      xTo(0);
      liftTo(0);
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [isTouch, reducedMotion, strength]);

  return (
    <div ref={ref} className={className} data-cursor="link" style={{ display: "inline-block" }}>
      {children}
    </div>
  );
}
