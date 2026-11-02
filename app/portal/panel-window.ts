import { constrainWindow, moveWindow, resizeWindow, type ResizeEdge, type WindowRect } from "./window-geometry";

const geometryKeys = ["left", "top", "width", "height"] as const;
const interactive = "button,a,input,select,textarea,[contenteditable=true]";

/** Pointer capture and a temporary iframe shield keep dragging continuous over the live preview. */
export function bindPanelWindow(box: HTMLElement) {
  let custom: WindowRect | null = null;
  let restore: WindowRect | null = null;
  let restingRect: WindowRect | null = null;
  let full = false;
  let gesture: { id: number; x: number; y: number; rect: WindowRect; previous: WindowRect | null; wasFull: boolean; edge?: ResizeEdge; capture: HTMLElement; moved?: boolean } | null = null;
  const view = (margin = 8): WindowRect => {
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const pad = Math.min(margin, width / 4, height / 4);
    return { x: (viewport?.offsetLeft ?? 0) + pad, y: (viewport?.offsetTop ?? 0) + pad, width: Math.max(1, width - pad * 2), height: Math.max(1, height - pad * 2) };
  };
  const measure = (): WindowRect => {
    const rect = box.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  function paint(rect: WindowRect) {
    box.setAttribute("data-window-custom", "");
    box.style.left = `${rect.x}px`; box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`; box.style.height = `${rect.height}px`;
  }
  function clearGeometry() {
    box.removeAttribute("data-window-custom");
    geometryKeys.forEach(key => box.style.removeProperty(key));
  }
  function fitDefault() {
    // Measure the CSS layout again, not the temporary keyboard/zoom fit. This
    // restores the original auto-height when the visible viewport grows back.
    clearGeometry();
    const rect = measure(), bounds = view();
    if (rect.x < bounds.x || rect.y < bounds.y || rect.x + rect.width > bounds.x + bounds.width || rect.y + rect.height > bounds.y + bounds.height) {
      paint(constrainWindow(rect, bounds));
    }
  }
  function controls() {
    box.toggleAttribute("data-window-fullscreen", full);
    const button = box.querySelector<HTMLButtonElement>('[data-window-action="maximize"]');
    if (button) {
      const label = full ? "Restore window size" : "Maximize window";
      button.setAttribute("aria-label", label); button.setAttribute("aria-pressed", String(full)); button.title = label;
      const icon = button.querySelector("span");
      if (icon) icon.textContent = full ? "❐" : "□";
    }
  }
  function reset(fit = true) {
    full = false; custom = null; restore = null; restingRect = null;
    clearGeometry();
    controls();
    if (fit) fitDefault();
  }
  function maximize() {
    if (full) {
      full = false;
      if (restore) { custom = restore; paint(moveWindow(custom, view())); controls(); }
      else reset();
    } else {
      restore = custom;
      restingRect = measure();
      full = true;
      paint(view(0)); controls();
    }
  }
  function end(cancel = false) {
    if (!gesture) return;
    const active = gesture;
    gesture = null;
    if (cancel) {
      if (active.wasFull) { full = true; custom = active.previous; paint(view(0)); controls(); }
      else if (active.previous) { custom = active.previous; paint(moveWindow(custom, view())); }
      else reset();
    }
    box.removeAttribute("data-window-dragging");
    document.documentElement.removeAttribute("data-portal-window-drag");
    if (active.capture.hasPointerCapture(active.id)) active.capture.releasePointerCapture(active.id);
  }
  const down = (event: PointerEvent) => {
    if (gesture || !event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return;
    const edge = event.target.closest<HTMLElement>("[data-window-resize]");
    const header = event.target.closest<HTMLElement>("[data-window-titlebar]");
    if (full && edge) return;
    if (!edge && (!header || event.target.closest(interactive))) return;
    const capture = edge ?? header!;
    event.preventDefault();
    capture.focus({ preventScroll: true });
    const rect = measure();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, rect, previous: custom, wasFull: full, edge: edge?.dataset.windowResize as ResizeEdge | undefined, capture };
    // Shield the preview from the first movement, even if pointer capture is unavailable.
    box.setAttribute("data-window-dragging", "");
    document.documentElement.setAttribute("data-portal-window-drag", "");
    try { capture.setPointerCapture(event.pointerId); } catch { /* Window listeners still handle release. */ }
  };
  const move = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    // Recover a release lost outside the browser/over an iframe. A later hover
    // must not carry the window along with it.
    if (event.type === "pointermove" && event.buttons === 0) { end(); return; }
    event.preventDefault();
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    gesture.moved = true;
    // Like a desktop window, dragging a maximized title bar restores it under
    // the pointer. A click alone must not change its size or lose form state.
    if (full) {
      const ratio = Math.max(0, Math.min(1, (gesture.x - gesture.rect.x) / gesture.rect.width));
      const restored = constrainWindow(restingRect ?? gesture.rect, view());
      gesture.rect = { ...restored, x: event.clientX - restored.width * ratio,
        y: event.clientY - Math.max(0, Math.min(36, gesture.y - gesture.rect.y)) };
      gesture.x = event.clientX; gesture.y = event.clientY;
      full = false; controls();
      custom = moveWindow(gesture.rect, view());
      gesture.rect = custom;
      paint(custom);
      return;
    }
    custom = gesture.edge ? resizeWindow(gesture.rect, gesture.edge, dx, dy, view())
      : moveWindow({ ...gesture.rect, x: gesture.rect.x + dx, y: gesture.rect.y + dy }, view());
    paint(custom);
    if (!gesture.edge) {
      // Rebase at the clamped position: reversing direction at a boundary
      // responds immediately, without having to undo off-screen pointer travel.
      gesture.rect = custom; gesture.x = event.clientX; gesture.y = event.clientY;
    }
  };
  const up = (event: PointerEvent) => {
    if (gesture?.id !== event.pointerId) return;
    // Some cancelled touch/pen releases report 0,0; retain the last real move.
    if (!(gesture.moved && event.clientX === 0 && event.clientY === 0)) move(event);
    end();
  };
  const cancelPointer = (event: PointerEvent) => { if (gesture?.id === event.pointerId) end(); };
  const blur = () => end();
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest<HTMLElement>("[data-window-action]")?.dataset.windowAction;
    if (action === "reset") reset();
    if (action === "maximize") maximize();
  };
  const doubleClick = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("[data-window-titlebar]") && !event.target.closest(interactive)) maximize();
  };
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && (gesture || full)) {
      event.preventDefault(); event.stopPropagation();
      if (gesture) end(true); else maximize();
      return;
    }
    if (full || gesture || event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLElement)) return;
    const edge = event.target.dataset.windowResize as ResizeEdge | undefined;
    if (!edge && !event.target.hasAttribute("data-window-titlebar")) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 40 : 10;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const rect = measure();
    custom = edge ? resizeWindow(rect, edge, dx, dy, view()) : moveWindow({ ...rect, x: rect.x + dx, y: rect.y + dy }, view());
    paint(custom);
  };
  const resize = () => {
    // Pinch zoom/keyboard viewport events during a drag terminate it at the
    // visible position; explicit Escape remains the only rollback gesture.
    end();
    if (full) paint(view(0));
    else if (custom) paint(constrainWindow(custom, view()));
    else fitDefault();
  };
  box.addEventListener("pointerdown", down);
  box.addEventListener("lostpointercapture", cancelPointer);
  box.addEventListener("click", click);
  box.addEventListener("dblclick", doubleClick);
  box.addEventListener("keydown", key);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancelPointer);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
  fitDefault();
  return () => {
    end();
    box.removeEventListener("pointerdown", down);
    box.removeEventListener("lostpointercapture", cancelPointer);
    box.removeEventListener("click", click);
    box.removeEventListener("dblclick", doubleClick);
    box.removeEventListener("keydown", key);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancelPointer);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("scroll", resize);
    reset(false);
  };
}
