/** Keep the rendered origin inside one measured copy, even after a long drag. */
export function wrapMarquee(x: number, width: number) {
  return width > 0 ? -(((-x % width) + width) % width) : 0;
}

/** Each identical copy must cover the viewport before it is safe to wrap. */
export function marqueeRepeats(viewport: number, sequence: number) {
  return sequence > 0 ? Math.max(2, Math.ceil(viewport / sequence) + 1) : 2;
}

/** Recent pointer samples, bounded independently of pointer-event frequency. */
export function createMarqueeVelocity() {
  const samples: { x: number; time: number }[] = [];
  let direction = 0;
  return {
    reset(x: number, time: number) { samples.length = 0; samples.push({ x, time }); direction = 0; },
    sample(x: number, time: number) {
      const previous = samples.at(-1);
      if (!Number.isFinite(x) || !Number.isFinite(time) || (previous && time <= previous.time)) return;
      const dx = previous ? x - previous.x : 0;
      const nextDirection = Math.abs(dx) > .5 ? Math.sign(dx) : direction;
      // A deliberate reversal or pause must not inherit the earlier flick's speed.
      if (previous && (time - previous.time > 120 || (direction && nextDirection !== direction))) {
        samples.length = 0; samples.push(previous);
      }
      direction = nextDirection;
      samples.push({ x, time });
      while (samples.length > 2 && (samples.length > 24 || samples[1].time < time - 80)) samples.shift();
    },
    release(time: number) {
      const first = samples[0], last = samples.at(-1);
      if (!first || !last || last.time <= first.time || time - last.time >= 120) return 0;
      const velocity = (last.x - first.x) * 1000 / (last.time - first.time);
      const fresh = Math.exp(-Math.max(0, time - last.time) / 65);
      return Math.max(-2600, Math.min(2600, velocity)) * fresh;
    },
  };
}

/** Analytic friction: the same glide distance at 30, 60 and 120 Hz. */
export function marqueeGlide(velocity: number, dt: number) {
  const decay = Math.exp(-Math.max(0, dt) * 3.8);
  const next = velocity * decay;
  return { distance: velocity * (1 - decay) / 3.8, velocity: Math.abs(next) < 2 ? 0 : next };
}
