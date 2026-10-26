/**
 * The intro's beats, in seconds of real (wall-clock) time. Every visual is a
 * pure function of `t`, so the whole show stays in sync and Esc can simply
 * jump `t` forward to the hand-off.
 */
export const T = {
  /** Opening glint at the centre of the logo. */
  sparkStart: 0.1,
  sparkPeak: 0.45,
  sparkEnd: 1.1,
  /** Camera finishes its slow push-in. */
  cameraSettle: 4.2,

  /** Big star swoops in from the side… */
  bigStarEnter: 2.8,
  /** …lands with weight (squash, ripple, glitter splash)… */
  bigStarLanded: 4.0,
  /** …settles… */
  landSettled: 4.45,
  /** …flips once so its facets flash… */
  glintDone: 4.8,
  /** …lifts off and swoops into the logo's edge already moving… */
  atEdge: 5.55,
  /** …rolls across, revealing the logo behind it… */
  rollDone: 7.05,
  /** …loops up and descends onto the logo's own star… */
  docked: 7.85,
  /** …springs into place and hands over to the flat star glyph. */
  handoverStart: 8.1,
  settled: 8.45,

  /** A sheen of light sweeps across the finished logo. */
  sheenStart: 8.5,
  sheenEnd: 9.3,
  /** Cross-fade to the real page. */
  fadeStart: 9.45,
  end: 10.2,
} as const;
