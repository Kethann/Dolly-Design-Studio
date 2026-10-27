/**
 * When each act of the Proof Table plays, as fractions of the pinned scroll (see scene.ts). Tweak timings here;
 * how long the whole section is pinned is set in the portal (Titles → Scroll length).
 */
export const STAGES = {
  sheetIn: [0, 0.05],
  iron: [0.03, 0.18],
  slab: [0.16, 0.28],
  power: [0.24, 0.34],
  drops: [0.32, 0.66],
  inspect: [0.6, 0.9],
} as const;
