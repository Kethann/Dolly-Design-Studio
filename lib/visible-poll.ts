/** Refresh only while visible, with one request at a time and a full interval after it finishes. */
export function startVisiblePoll(task: (signal: AbortSignal) => Promise<unknown> | void, interval: number, immediate = true) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | null = null;
  let stopped = false;
  const schedule = () => {
    if (!stopped && !document.hidden) timer = setTimeout(run, interval);
  };
  async function run() {
    clearTimeout(timer);
    if (stopped || document.hidden || request) return;
    const current = new AbortController();
    request = current;
    try { await task(current.signal); } catch { /* The consumer owns its error UI. */ }
    finally {
      if (request === current) request = null;
      schedule();
    }
  }
  const visible = () => {
    clearTimeout(timer);
    if (document.hidden) request?.abort();
    else void run();
  };
  document.addEventListener("visibilitychange", visible);
  if (immediate) void run(); else schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    request?.abort();
    document.removeEventListener("visibilitychange", visible);
  };
}
