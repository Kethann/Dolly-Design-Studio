"use client";

import { useEffect } from "react";
import { DEFAULT_GLASS } from "@/lib/content/types";

/** The glass colours, as the variables that hold them and what each is until the portal changes them. */
const SLOTS = DEFAULT_GLASS.colors.map((color, i) => [i + 1, color] as const);

/** The patches of colour on a card: the six glass colours, four shades blended from them, and then those colours again, so
 * the colours repeat across the glass. */
const BLOBS = 16;

/** Where each patch sits on a card: a tile of a 4 × 4 grid for each, shuffled, and nudged a little off its centre. */
function scatter(): { x: number; y: number }[] {
  const tiles = Array.from({ length: BLOBS }, (_, i) => i);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.map((t) => ({
    x: ((t % 4) + 0.5) * 25 + (Math.random() - 0.5) * 20,
    y: (Math.floor(t / 4) + 0.5) * 25 + (Math.random() - 0.5) * 20,
  }));
}

/**
 * The colours of the glass cards. Each card holds all the glass colours, spread over it in places (and an order) of its
 * own that change from time to time; this puts them there (as --k1…--k6 and --bx1/--by1…), tells the card where the
 * pointer is (--mx, --my) and which colour is on the glass right there (--spot-c), so the small circle under the cursor,
 * and the glow around the glass, are in that colour. One listener for the whole page; nothing at all happens until a
 * pointer moves over glass.
 */
export function GlassLight() {
  useEffect(() => {
    let frame = 0;
    let latest: PointerEvent | null = null;
    let current: HTMLElement | null = null;
    let leftAt = 0;
    let drift = 0;
    const places = new WeakMap<HTMLElement, { x: number; y: number }[]>();
    const orders = new WeakMap<HTMLElement, number[]>();

    /** Gives the card a new arrangement: the order of the colours, or only where they sit. */
    const arrange = (card: HTMLElement, newOrder: boolean) => {
      const fixed = getComputedStyle(document.documentElement).getPropertyValue("--glass-shuffle").trim() === "0";
      let order = orders.get(card);
      if (!order || newOrder) {
        order = SLOTS.map((_, i) => i);
        if (!fixed) {
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
        }
        orders.set(card, order);
        order.forEach((slot, i) => card.style.setProperty(`--k${i + 1}`, `var(--glass-${SLOTS[slot][0]}, ${SLOTS[slot][1]})`));
      }
      const spots = fixed
        ? Array.from({ length: BLOBS }, (_, i) => ({ x: ((i % 4) + 0.5) * 25, y: (Math.floor(i / 4) + 0.5) * 25 }))
        : scatter();
      places.set(card, spots);
      spots.forEach((p, i) => {
        card.style.setProperty(`--bx${i + 1}`, `${p.x.toFixed(1)}%`);
        card.style.setProperty(`--by${i + 1}`, `${p.y.toFixed(1)}%`);
      });
    };

    const stopDrift = () => {
      if (drift) window.clearInterval(drift);
      drift = 0;
    };

    const apply = () => {
      frame = 0;
      const e = latest;
      latest = null;
      const card = e && e.target instanceof Element ? e.target.closest<HTMLElement>(".glass-panel") : null;
      if (!e || !card) return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // A card gets a fresh arrangement when the cursor first comes to it, and again when it comes back after a moment
      // away; while the cursor stays, the colours slowly move about.
      if (card !== current) {
        stopDrift();
        if (!places.has(card) || performance.now() - leftAt > 500) arrange(card, true);
        current = card;
        drift = window.setInterval(() => arrange(card, false), 3500);
      }
      const px = ((e.clientX - r.left) / r.width) * 100;
      const py = ((e.clientY - r.top) / r.height) * 100;
      card.style.setProperty("--mx", `${Math.min(100, Math.max(0, px)).toFixed(1)}%`);
      card.style.setProperty("--my", `${Math.min(100, Math.max(0, py)).toFixed(1)}%`);
      // The colour on the glass right here: the nearest of the colours' places (in pixels, so a wide card isn't skewed).
      const spots = places.get(card);
      if (spots) {
        let best = 0;
        let bestD = Infinity;
        spots.forEach((p, i) => {
          const d = Math.hypot(((px - p.x) / 100) * r.width, ((py - p.y) / 100) * r.height);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        card.style.setProperty("--spot-c", `var(--k${(best % 10) + 1})`); // the later patches repeat the first ten colours
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".glass-panel")) {
        if (current) {
          current = null;
          leftAt = performance.now();
          stopDrift();
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
      stopDrift();
    };
  }, []);
  return null;
}
