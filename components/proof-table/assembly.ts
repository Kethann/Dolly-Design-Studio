/** Run the CSS assembly once, only while visible. Release temporary layers when it finishes. */
export function startAssembly(scene: HTMLElement, slab: HTMLElement): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let observer: IntersectionObserver | null = null;
  let onScreen = typeof IntersectionObserver === "undefined";
  let finished = false;

  const detach = () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", update);
    reduced.removeEventListener("change", respectMotion);
    slab.removeEventListener("animationend", ended);
  };
  const finish = () => {
    finished = true;
    scene.dataset.assembly = "done";
    delete scene.dataset.paused;
    detach();
  };
  function update() {
    if (finished) return;
    const running = onScreen && !document.hidden;
    scene.dataset.paused = String(!running);
    if (running) scene.dataset.assembly = "playing";
  }
  function respectMotion() {
    if (reduced.matches) finish();
  }
  function ended(event: AnimationEvent) {
    // Card events bubble; wait for the table's full assembly timeline.
    if (event.target === slab) finish();
  }

  scene.dataset.assembly = "ready";
  if (reduced.matches) finish();
  else {
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", respectMotion);
    slab.addEventListener("animationend", ended);
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        update();
      }, { threshold: 0 });
      observer.observe(scene);
    }
    update();
  }
  return () => {
    finished = true;
    detach();
    delete scene.dataset.assembly;
    delete scene.dataset.paused;
  };
}
