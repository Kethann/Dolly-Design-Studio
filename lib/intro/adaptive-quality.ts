/**
 * Keeps motion smooth on slower machines: if frames run long for a while, it lowers the rendering
 * resolution a step (never below `min`) instead of letting the animation stutter. It only ever steps
 * down, so it can't oscillate. Call it once per frame with the frame's duration in seconds.
 */
export function createAdaptiveQuality(start: number, apply: (pixelRatio: number) => void, min = 0.75) {
  let pixelRatio = start;
  let total = 0;
  let frames = 0;
  let cooldown = 1; // let the first second settle (shader warm-up, image decoding) before judging
  return (dt: number) => {
    if (cooldown > 0) {
      cooldown -= dt;
      return;
    }
    total += dt;
    frames++;
    if (frames < 45) return;
    const average = total / frames;
    total = 0;
    frames = 0;
    if (average > 1 / 42 && pixelRatio > min) {
      pixelRatio = Math.max(min, pixelRatio - 0.25);
      apply(pixelRatio);
      cooldown = 1;
    }
  };
}
