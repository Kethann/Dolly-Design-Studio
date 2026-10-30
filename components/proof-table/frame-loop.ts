/** Sleep between interactions; resume with a bounded delta rather than catching up hidden time. */
export function createFrameLoop(tick: (dt: number) => boolean, canRun: () => boolean) {
  let frame = 0;
  let last = 0;
  let disposed = false;
  const draw = (now: number) => {
    frame = 0;
    if (disposed || !canRun()) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (tick(dt) && !frame && !disposed && canRun()) frame = requestAnimationFrame(draw);
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; };
  return {
    wake: () => {
      if (frame || disposed || !canRun()) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    },
    stop,
    dispose: () => { disposed = true; stop(); },
  };
}
