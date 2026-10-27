/**
 * When each act of the Proof Table plays, as fractions of the pinned scroll (see scene.ts). Tweak timings here;
 * how long the whole section is pinned is set in the portal (Titles → Scroll length).
 * The story starts straight on the lit table: the cards drop in, then the camera leans in.
 */
export const STAGES = {
  drops: [0.03, 0.58],
  inspect: [0.5, 0.88],
} as const;
