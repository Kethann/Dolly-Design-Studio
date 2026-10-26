/**
 * The intro's beats, in seconds of real (wall-clock) time. Every visual is a
 * pure function of `t`, so the whole show stays in sync, Esc can simply jump
 * `t` forward to the hand-off, and the portal preview can hold any frame.
 */
export const T = {
  /** Stars stream in from the corners from the very first frame; the camera finishes its slow push-in. */
  cameraSettle: 3.6,

  /** The big star flies in out of deep space… */
  bigStarEnter: 2.3,
  /** …and sets down exactly on the logo's own star… */
  docked: 3.9,
  /** …springs to rest, then starts to shiver… */
  shiverStart: 4.2,
  /** …and releases a wave that ripples out across the logo, revealing it. */
  waveStart: 4.75,
  waveEnd: 6.0,
  /** The big star flattens into the logo's flat star as the wave leaves. */
  handoverStart: 4.85,
  settled: 5.3,

  /** Most of the background stars drift away; a few stay with the page. */
  thinStart: 5.6,
  thinEnd: 6.9,

  /** A sheen of light sweeps across the finished logo. */
  sheenStart: 6.0,
  sheenEnd: 6.8,
  /** The dark glass settles over the background stars, matching the page's glass exactly. */
  glassStart: 5.6,
  /** The page (with its glass and the handed-over stars) fades in, still hidden under the intro… */
  revealAt: 6.4,
  /** …so when the intro dissolves into it, everything underneath is already in place and moving. */
  fadeStart: 7.0,
  end: 8.0,
} as const;
