/**
 * When each act of the Proof Table plays, as fractions of the pinned scroll (see scene.ts). Tweak timings here;
 * how long the whole section is pinned is set in the portal (Titles → Scroll length).
 * The story starts straight on the lit table: the cards drop in, then the camera leans in. The acts fill the whole
 * pinned stretch — the headline completes at ~94% — so there's no dead scrolling on a finished view, only a short beat.
 */
export const STAGES = {
  drops: [0.02, 0.55],
  inspect: [0.48, 0.94],
} as const;
