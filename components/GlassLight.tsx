"use client";

import { useEffect } from "react";

/**
 * Tells every glass card where the pointer is on it (as --mx and --my, in percent), so the colour that lights up on the
 * glass can follow the cursor. One listener for the whole page; nothing at all happens until a pointer moves over glass.
 */
export function GlassLight() {
  useEffect(() => {
    let frame = 0;
    let latest: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const e = latest;
      latest = null;
      const card = e && e.target instanceof Element ? e.target.closest<HTMLElement>(".glass-panel") : null;
      if (!e || !card) return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      card.style.setProperty("--mx", `${Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)).toFixed(1)}%`);
      card.style.setProperty("--my", `${Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".glass-panel")) return;
      latest = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
