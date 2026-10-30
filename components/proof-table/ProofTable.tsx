"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { proofTable } from "@/content/proof-table";
import { useContent } from "@/lib/content/context";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { ProofTableFallback } from "./Fallback";
import type { ProofScene } from "./scene";
import { STAGES } from "./stages";
import styles from "./ProofTable.module.css";
import { renderFx } from "@/components/fx/render-fx";
import { createFrameLoop } from "./frame-loop";

type Mode = "pinned" | "static" | "fallback";
const MOBILE_ITEMS = 24; // phones show every card (the grid fits any number to the glass); this only guards against an absurd count

function hasWebGL() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The Proof Table: a scroll-pinned 3D scene (see scene.ts) with the headline revealed beside it at the end.
 * Pinned and scrubbed while you scroll through it; reduced motion shows the final composition; no WebGL shows a
 * CSS 3D version. The cards, their glass and the scroll length come from the portal and update live.
 * The scene is only created once the section is near the viewport, and only draws when something changes.
 */
export function ProofTable() {
  const router = useRouter();
  const { settings } = useIntroSettings();
  const { slate, projects } = useContent();
  const pt = settings.proofTable;
  const [mode, setMode] = useState<Mode>("pinned");
  const [mobile, setMobile] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ProofScene | null>(null);
  const slots = mobile ? pt.items.slice(0, MOBILE_ITEMS) : pt.items;
  const populated = slots.filter((it) => it.src);
  const hasArtwork = populated.length > 0;
  const items = hasArtwork ? populated : slots;
  const itemsRef = useRef(items);
  const lookRef = useRef(pt);
  const projectSlugsRef = useRef(projects.map((project) => project.slug));
  useEffect(() => { projectSlugsRef.current = projects.map((project) => project.slug); }, [projects]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Phones, and tablets held upright, get the stacked layout (headline above, the whole table below it).
    const stacked = window.matchMedia("(max-width: 1000px), (orientation: portrait) and (max-width: 1100px)");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time client capability checks */
    setMobile(stacked.matches);
    const webgl = hasWebGL();
    setMode(!webgl ? "fallback" : reduced.matches ? "static" : "pinned");
    /* eslint-enable react-hooks/set-state-in-effect */
    const follow = () => setMobile(stacked.matches);
    const followMotion = () => setMode(!webgl ? "fallback" : reduced.matches ? "static" : "pinned");
    stacked.addEventListener("change", follow); // turning the tablet over switches layout
    reduced.addEventListener("change", followMotion);
    return () => { stacked.removeEventListener("change", follow); reduced.removeEventListener("change", followMotion); };
  }, []);

  // Live from the portal: new / removed slots and card size swap the cards; the glass restyles in place.
  const itemsKey = JSON.stringify(items);
  useEffect(() => {
    itemsRef.current = items;
    lookRef.current = pt;
    sceneRef.current?.setItems(items, pt.cardSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the items' content, not their identity
  }, [itemsKey, pt.cardSize]);
  useEffect(() => {
    sceneRef.current?.setSlab({ color: pt.slabColor, opacity: pt.slabOpacity });
  }, [pt.slabColor, pt.slabOpacity]);
  useEffect(() => {
    lookRef.current = pt;
    sceneRef.current?.setGlass({ color: pt.glassColor, opacity: pt.glassOpacity, frost: pt.frost, reflection: pt.reflection });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pt.glassColor, pt.glassOpacity, pt.frost, pt.reflection]);

  useEffect(() => {
    if (mode === "fallback" || mobile || !pt.enabled || !hasArtwork) return;
    const section = sectionRef.current!;
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    let scene: ProofScene | null = null;
    let visible = false;
    let shown = 0; // smoothed progress
    let held = 0; // where the scroll says the story is (the shown value eases towards it)
    let disposed = false;
    let loading = false;

    const progress = () => {
      if (mode === "static") return 1;
      const r = section.getBoundingClientRect();
      const span = r.height - stage.clientHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    };

    let lastVars = -1;
    function setVars(p: number) {
      if (p === lastVars) return;
      lastVars = p;
      // Headline lines appear one after another as the camera settles.
      const from = STAGES.inspect[0] + (STAGES.inspect[1] - STAGES.inspect[0]) * 0.55;
      for (let i = 0; i < 5; i++) {
        const r = Math.min(1, Math.max(0, (p - (from + i * 0.03)) / 0.08));
        stage.style.setProperty(`--r${i}`, (r * r * (3 - 2 * r)).toFixed(3));
      }
    }

    const loop = createFrameLoop((dt) => {
      if (!scene) return false;
      // The story follows the scroll, down and up alike: scrolling back up winds it back, and the page never jumps.
      if (mode === "pinned" && section.getBoundingClientRect().top >= window.innerHeight) held = shown = 0;
      held = progress();
      shown += (held - shown) * (1 - Math.exp(-dt * 9));
      if (Math.abs(held - shown) < 0.0004) shown = held;
      shown = Math.min(1, Math.max(0, shown));
      setVars(shown);
      const moving = scene.update(shown, dt);
      canvas.style.cursor = scene.hovered() >= 0 ? "pointer" : "";
      return moving || shown !== held;
    }, () => !!scene && visible && !disposed && !document.hidden);
    const run = loop.wake;

    async function init() {
      if (loading) return;
      loading = true;
      try {
        const { createProofScene } = await import("./scene");
        if (disposed) return;
        const look = lookRef.current;
        scene = createProofScene(canvas, {
          invalidate: run,
          items: itemsRef.current,
          cardSize: look.cardSize,
          slab: { color: look.slabColor, opacity: look.slabOpacity },
          glass: { color: look.glassColor, opacity: look.glassOpacity, frost: look.frost, reflection: look.reflection },
          mobile,
          stage: getComputedStyle(document.documentElement).getPropertyValue("--stage").trim() || "#410000",
        });
      } catch (err) {
        if (disposed) return;
        // The browser would not give this page another graphics context (many tabs open, or the graphics card is busy):
        // show the simple version of the slate instead of a broken one.
        console.warn("[slate] 3D unavailable, showing the simple version", err);
        loading = false;
        setMode("fallback");
        return;
      }
      sceneRef.current = scene;
      const r = canvas.getBoundingClientRect();
      scene.resize(r.width, r.height);
      // Resume at the current scroll position without replaying a rapid catch-up after a resize.
      held = progress();
      shown = held;
      setVars(shown);
      // Off screen: don't draw yet (that would upload everything at once); warm the GPU up in idle moments instead.
      if (visible) scene.update(shown, 0);
      else void scene.warmUp().catch(() => {});
      run();
    }

    const near = new IntersectionObserver(([e]) => e.isIntersecting && init(), { rootMargin: "250% 0px" });
    near.observe(section);
    const inView = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) loop.stop();
      // Left behind above (scrolled back up past its start): rewind, so coming down again replays the drop.
      if (!visible && mode === "pinned" && e.boundingClientRect.top > 0) held = shown = 0;
      run();
    });
    inView.observe(section);
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(r.width, r.height);
    });
    ro.observe(canvas);
    const onVisibility = () => { if (document.hidden) loop.stop(); else run(); };
    window.addEventListener("scroll", run, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    // At the end the cards can be touched: hover stands a card up and it follows the cursor; click opens it.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || mode === "static") return;
      const r = canvas.getBoundingClientRect();
      scene?.pointer(e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = () => scene?.pointer(null, 0);
    let press: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => { press = { x: event.clientX, y: event.clientY }; };
    const onClick = (event: MouseEvent) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) { press = null; return; }
      press = null;
      const rect = canvas.getBoundingClientRect();
      scene?.pointer(null, 0);
      scene?.update(shown, 0);
      scene?.pointer(event.clientX - rect.left, event.clientY - rect.top);
      scene?.update(shown, 0);
      const i = scene ? scene.hovered() : -1;
      const item = itemsRef.current[i];
      if (i >= 0 && item && projectSlugsRef.current.includes(item.slug)) {
        const preview = new URLSearchParams(window.location.search).has("portal-preview") ? "?portal-preview" : "";
        router.push(`/work/${item.slug}${preview}`);
      }
      if (mode === "static") scene?.pointer(null, 0);
    };
    // If the graphics card drops the 3D scene while the page is open, the simple version takes over rather than a frozen picture.
    const onLost = (e: Event) => {
      e.preventDefault();
      setMode("fallback");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      disposed = true;
      loop.dispose();
      window.removeEventListener("scroll", run);
      document.removeEventListener("visibilitychange", onVisibility);
      near.disconnect();
      inView.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("pointerdown", onDown);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [mode, mobile, router, pt.enabled, hasArtwork]);

  if (!pt.enabled) return null;

  const copy = (
    <div className={styles.copy}>
      <span className={styles.overline} style={{ "--r": "var(--r0)" } as React.CSSProperties}>
        {renderFx(slate.overline)}
      </span>
      <h2 className={styles.headline}>
        {slate.headline.map((line, i) => (
          <span key={line} className={styles.line} style={{ "--r": `var(--r${i + 1})` } as React.CSSProperties}>
            {renderFx(line)}
          </span>
        ))}
      </h2>
      <p className={styles.body} style={{ "--r": "var(--r3)" } as React.CSSProperties}>
        {renderFx(slate.body)}
      </p>
      <Link
        href={proofTable.cta.href}
        className={styles.cta}
        data-cursor="link"
        style={{ "--r": "var(--r4)" } as React.CSSProperties}
      >
        {slate.ctaLabel} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );

  if (mode === "fallback" || mobile || !hasArtwork) {
    return (
      <section id={proofTable.id} className={styles.section}>
        <ProofTableFallback items={items} projectSlugs={projects.map((project) => project.slug)} look={pt}>{copy}</ProofTableFallback>
      </section>
    );
  }

  // Pinned for `length` screens of scrolling (a bit shorter on phones).
  const pinned = mode === "pinned" ? { height: `${Math.round((1 + pt.length * (mobile ? 0.75 : 1)) * 100)}svh` } : undefined;
  return (
    <section
      id={proofTable.id}
      ref={sectionRef}
      className={`${styles.section} ${mode === "static" ? styles.still : ""}`}
      style={pinned}
    >
      <div ref={stageRef} className={`${styles.stage} ${mode === "static" ? styles.revealed : ""}`}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        {copy}
        <ul className="sr-only">
          {items.map((it, i) => (
            <li key={`${it.src}-${i}`}>
              <Link href={`/work/${it.slug}`}>{it.alt}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
