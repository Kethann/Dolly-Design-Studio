/** Preserve normal frame timing, but never skip whole animation beats after a GPU/main-thread stall. */
export function createIntroFrameClock() {
  let previous: number | null = null;
  return {
    reset() { previous = null; },
    step(now: number) {
      if (!Number.isFinite(now)) return 0;
      if (previous === null) { previous = now; return 0; }
      if (now < previous) return 0;
      const elapsed = (now - previous) / 1000;
      previous = now;
      return Math.min(elapsed, 0.1);
    },
  };
}
