/** A stationary hit area keeps floating cards from repeatedly losing hover at their edges. */
export function bindGlassHover(scene: HTMLElement) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
  let frame = 0;
  let slot: HTMLElement | null = null;
  let x = 0;
  let y = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (slot) {
      delete slot.dataset.floating;
      slot.style.removeProperty("--glass-rx");
      slot.style.removeProperty("--glass-ry");
    }
    slot = null;
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType === "touch" || motion.matches || !fine.matches || document.hidden || scene.dataset.assembly !== "done") return;
    const next = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-slate-slot]") : null;
    if (!next || !scene.contains(next)) { reset(); return; }
    if (slot !== next) { reset(); slot = next; }
    x = event.clientX;
    y = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (x - rect.left) / Math.max(1, rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (y - rect.top) / Math.max(1, rect.height) * 2 - 1));
      slot.style.setProperty("--glass-rx", `${(-ny * 3).toFixed(2)}deg`);
      slot.style.setProperty("--glass-ry", `${(nx * 3).toFixed(2)}deg`);
      slot.dataset.floating = "true";
    });
  };
  scene.addEventListener("pointermove", move, { passive: true });
  scene.addEventListener("pointerleave", reset);
  scene.addEventListener("pointercancel", reset);
  document.addEventListener("visibilitychange", reset);
  motion.addEventListener("change", reset);
  fine.addEventListener("change", reset);
  return () => {
    reset();
    scene.removeEventListener("pointermove", move);
    scene.removeEventListener("pointerleave", reset);
    scene.removeEventListener("pointercancel", reset);
    document.removeEventListener("visibilitychange", reset);
    motion.removeEventListener("change", reset);
    fine.removeEventListener("change", reset);
  };
}
