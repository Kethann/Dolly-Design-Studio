/** A safety deadline measured only while the page is visible. Returns an idempotent cancel function. */
export function visibleTimeout(callback: () => void, delay: number) {
  let remaining = delay;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  function cancel() {
    cancelled = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", change);
  }
  function arm() {
    if (cancelled || document.hidden) return;
    started = performance.now();
    timer = setTimeout(() => { cancel(); callback(); }, Math.max(0, remaining));
  }
  function change() {
    if (document.hidden) {
      if (timer !== undefined) remaining -= Math.max(0, performance.now() - started);
      clearTimeout(timer);
      timer = undefined;
    } else if (timer === undefined) arm();
  }
  document.addEventListener("visibilitychange", change);
  arm();
  return cancel;
}
