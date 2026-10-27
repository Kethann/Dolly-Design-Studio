/**
 * Keeps motion smooth on slower machines: if frames run long for a while, it lowers the rendering
 * resolution a step (never below `min`) instead of letting the animation stutter. It only ever steps
 * down, so it can't oscillate. Call it once per frame with the frame's duration in seconds.
 */
export function createAdaptiveQuality(start: number, apply: (pixelRatio: number) => void, min = 0.75) {
  let pixelRatio = start;
  let total = 0;
  let frames = 0;
  let cooldown = 3; // let the first seconds settle (shader warm-up, image decoding) before judging
  let strikes = 0; // slow windows in a row: one busy moment (loading images while scrolling) isn't a slow device
  return (dt: number) => {
    if (cooldown > 0) {
      cooldown -= dt;
      return;
    }
    // Judge by how many frames are slow, not the average: a one-off hitch (an image upload, a shader compile) must
    // not lower the resolution — each step down reallocates buffers, which is itself a hitch.
    if (dt > 1 / 30) total++;
    frames++;
    if (frames < 60) return;
    const slowShare = total / frames;
    total = 0;
    frames = 0;
    strikes = slowShare > 0.6 ? strikes + 1 : 0;
    if (strikes >= 2 && pixelRatio > min) {
      strikes = 0;
      pixelRatio = Math.max(min, pixelRatio - 0.25);
      apply(pixelRatio);
      cooldown = 1;
    }
  };
}
