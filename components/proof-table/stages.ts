/** When each act of the Proof Table plays, as fractions of the pinned scroll (see scene.ts). Tweak timings here. */
export const STAGES = {
  sheetIn: [0.03, 0.12],
  iron: [0.1, 0.3],
  slab: [0.3, 0.44],
  power: [0.4, 0.52],
  drops: [0.5, 0.75],
  inspect: [0.74, 0.97],
} as const;
