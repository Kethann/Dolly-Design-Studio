"use client";

import { useEffect } from "react";
import { DEFAULT_GLASS } from "@/lib/content/types";

/** The four glass colours, as the variables that hold them and what each is until the portal changes it. */
const SLOTS = [
  ["a", DEFAULT_GLASS.colorA],
  ["c", DEFAULT_GLASS.colorC],
  ["b", DEFAULT_GLASS.colorB],
  ["d", DEFAULT_GLASS.colorD],
] as const;

/**
 * Tells every glass card where the pointer is on it (as --mx and --my, in percent), so the pool of colour under the
 * cursor follows it, and (as --mt) which mix of the glass colours belongs to that spot. Each card also gets an order of
 * its own for the four colours (and a small turn of the direction), and a new one each time the cursor comes back to it,
 * so no two glass cards look alike and none repeats itself. One listener for the whole page; nothing at all happens
 * until a pointer moves over glass.
 */
export function GlassLight() {
  useEffect(() => {
    let frame = 0;
    let latest: PointerEvent | null = null;
    let current: HTMLElement | null = null;
    let leftAt = 0;
    const turn = new WeakMap<HTMLElement, number>(); // each card's own small turn of the direction, in degrees
    const seen = new WeakSet<HTMLElement>();

    const reshuffle = (card: HTMLElement) => {
      const root = getComputedStyle(document.documentElement).getPropertyValue("--glass-shuffle").trim();
      if (root === "0") {
        for (let i = 1; i <= 4; i++) card.style.removeProperty(`--k${i}`);
        turn.set(card, 0);
        return;
      }
      const order = [0, 1, 2, 3];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      order.forEach((slot, i) => card.style.setProperty(`--k${i + 1}`, `var(--glass-${SLOTS[slot][0]}, ${SLOTS[slot][1]})`));
      turn.set(card, (Math.random() - 0.5) * 140);
    };

    const apply = () => {
      frame = 0;
      const e = latest;
      latest = null;
      const card = e && e.target instanceof Element ? e.target.closest<HTMLElement>(".glass-panel") : null;
      if (!e || !card) return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // A card is mixed afresh when the cursor first comes to it, and again when it comes back after a moment away.
      if (card !== current) {
        if (!seen.has(card) || performance.now() - leftAt > 500) reshuffle(card);
        seen.add(card);
        current = card;
      }
      // How far along the colours this spot is (0 = the first colour, 100 = the last).
      const a = (((parseFloat(getComputedStyle(card).getPropertyValue("--glass-angle")) || 135) + (turn.get(card) ?? 0)) * Math.PI) / 180;
      const fx = (e.clientX - r.left) / r.width - 0.5;
      const fy = (e.clientY - r.top) / r.height - 0.5;
      const along = (fx * Math.sin(a) - fy * Math.cos(a)) / (Math.abs(Math.sin(a)) + Math.abs(Math.cos(a)));
      card.style.setProperty("--ma", `${Math.round(((0.5 + along) * 360 + (turn.get(card) ?? 0) * 2) % 360)}deg`); // turns the colour sweep inside the circle
      card.style.setProperty("--mt", `${Math.min(100, Math.max(0, (0.5 + along) * 100)).toFixed(1)}%`);
      card.style.setProperty("--mx", `${Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)).toFixed(1)}%`);
      card.style.setProperty("--my", `${Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".glass-panel")) {
        if (current) {
          current = null;
          leftAt = performance.now();
        }
        return;
      }
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
