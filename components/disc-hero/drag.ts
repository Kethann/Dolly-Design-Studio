/** Pointer-only state: no React renders, momentum timers or document-wide move listeners. */
export function bindCircleDrag(surface: HTMLCanvasElement, rotation: {
  begin(x: number, y: number): boolean;
  move(x: number, y: number): void;
  end(): void;
}) {
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;
  let suppressClick = false;
  const down = (event: PointerEvent) => {
    if (press || !event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const bounds = surface.getBoundingClientRect();
    if (!rotation.begin(event.clientX - bounds.left, event.clientY - bounds.top)) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    surface.style.cursor = "grabbing";
    // Capture maintains control outside the circle. pan-y still allows native page scrolling.
    surface.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 8) return;
    press.moved = suppressClick = true;
    const bounds = surface.getBoundingClientRect();
    rotation.move(event.clientX - bounds.left, event.clientY - bounds.top);
  };
  const finish = (event?: PointerEvent) => {
    if (!press || (event && event.pointerId !== press.id)) return;
    const id = press.id;
    // Clear first: releasePointerCapture can dispatch lostpointercapture immediately.
    press = null;
    rotation.end();
    surface.style.cursor = "grab";
    if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation(); // A drag must never open a movie detail card.
  };
  const hidden = () => { if (document.hidden) finish(); };
  const blur = () => finish();
  surface.addEventListener("pointerdown", down, { passive: true });
  surface.addEventListener("pointermove", move, { passive: true });
  surface.addEventListener("pointerup", finish);
  surface.addEventListener("pointercancel", finish);
  surface.addEventListener("lostpointercapture", finish);
  surface.addEventListener("click", click, true);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", blur);
  document.addEventListener("visibilitychange", hidden);
  return () => {
    finish();
    surface.removeEventListener("pointerdown", down);
    surface.removeEventListener("pointermove", move);
    surface.removeEventListener("pointerup", finish);
    surface.removeEventListener("pointercancel", finish);
    surface.removeEventListener("lostpointercapture", finish);
    surface.removeEventListener("click", click, true);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", blur);
    document.removeEventListener("visibilitychange", hidden);
  };
}
