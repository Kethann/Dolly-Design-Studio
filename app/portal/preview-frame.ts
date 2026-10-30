interface PendingRoute { current: string | null }

/** Remember navigation even while the iframe is still on about:blank. */
export function requestPreviewRoute(frame: HTMLIFrameElement | null, path: string, pending: PendingRoute) {
  const view = frame?.contentWindow;
  if (!view) { pending.current = path; return; }
  let current = "";
  try { current = view.location.pathname; } catch { /* Wait for the same-origin preview to load. */ }
  pending.current = current === path ? null : path;
  if (pending.current && current.startsWith("/")) view.location.assign(`${path}?portal-preview`);
}

export function finishPreviewLoad(frame: HTMLIFrameElement | null, pending: PendingRoute) {
  const view = frame?.contentWindow;
  if (!view || !pending.current) return;
  try {
    if (view.location.pathname === pending.current) pending.current = null;
    else view.location.replace(`${pending.current}?portal-preview`);
  } catch { /* A later same-origin load can fulfil the request. */ }
}
