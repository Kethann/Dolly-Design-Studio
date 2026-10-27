/**
 * How far the intro has got in loading (0..1), for the loader's percentage. Each step reports when it's really done:
 *   0.60  the 3D intro's code has arrived
 *   0.75  its scene is built
 *   0.92  its shaders are compiled
 *   1.00  its first frame is on screen (or the intro isn't playing at all) — the loader then fades away
 */
let progress = 0;
const listeners = new Set<(p: number) => void>();

export function reportIntroProgress(p: number) {
  if (p <= progress) return; // it only ever moves forward
  progress = Math.min(1, p);
  listeners.forEach((fn) => fn(progress));
}

export function introProgress() {
  return progress;
}

export function onIntroProgress(fn: (p: number) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
