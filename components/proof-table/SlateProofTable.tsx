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
import { visibleGlassTitles } from "@/lib/content/disc";
import { getHandoff, subscribeHandoff } from "@/lib/intro/handoff";
import { titleArtBlob } from "./art-preload";

type Mode = "pinned" | "static" | "fallback";

/** How briskly the story follows the scroll (per second): about as quick to arrive as before, without the jolts. */
const FOLLOW = 16;

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
 * Its code and artwork load while the opening plays, the scene is built in an idle moment right after it (or as the section
 * comes near, if that is sooner), and it only draws when something changes. Each scene gets a canvas of its own: a canvas whose
 * graphics context was released can never be used again, and reusing one is what used to drop phones to the simple version.
 */
export function SlateProofTable() {
  const router = useRouter();
  const { settings } = useIntroSettings();
  const { slate, projects } = useContent();
  const pt = settings.proofTable;
  const [mode, setMode] = useState<Mode>("pinned");
  const [attempt, setAttempt] = useState(0);
  const mobileRef = useRef(false);
  const retries = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ProofScene | null>(null);
  const slots = visibleGlassTitles(pt.items);
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
    mobileRef.current = stacked.matches;
    const webgl = hasWebGL();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability check
    setMode(!webgl ? "fallback" : reduced.matches ? "static" : "pinned");
    // Turning the device over only moves the camera: the running scene stays.
    const follow = () => { mobileRef.current = stacked.matches; sceneRef.current?.setMobile(stacked.matches); };
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
    if (mode === "fallback" || !pt.enabled || !hasArtwork) return;
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("aria-hidden", "true");
    stage.prepend(canvas);
    const builtAt = performance.now();
    // Try again on a new canvas (phones drop graphics contexts when memory is short or the tab sleeps); the simple version is the last resort.
    const rebuild = () => {
      if (performance.now() - builtAt > 30000) retries.current = 0;
      if (retries.current++ < 2) setAttempt((n) => n + 1);
      else setMode("fallback");
    };
    let scene: ProofScene | null = null;
    let visible = false;
    let shown = 0; // smoothed progress
    let held = 0; // where the scroll says the story is (the shown value eases towards it)
    let pace = 0; // how fast shown is moving, in progress per second
    let disposed = false;
    let loading = false;

    const progress = () => {
      if (mode === "static") return 1;
      const r = section.getBoundingClientRect();
      const span = r.height - stage.clientHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    };

    // Stacked layout: the table never reaches the bottom of the screen, so the pinned stage ends a little below its lowest
    // point and the next section follows straight on. The canvas keeps its full height (same framing), faded out at the cut.
    // Only the sticky stage changes height, never the section, so nothing on the page moves.
    const fitStage = () => {
      const full = canvas.clientHeight;
      const lowest = scene && mobileRef.current && mode === "pinned" ? scene.restBottom() : full;
      const cut = Math.ceil(lowest + 40);
      if (cut < full) {
        stage.style.height = `${cut}px`;
        const fade = `linear-gradient(to bottom, #000 ${Math.floor(lowest + 6)}px, transparent ${cut}px)`;
        canvas.style.setProperty("-webkit-mask-image", fade);
        canvas.style.setProperty("mask-image", fade);
      } else {
        stage.style.removeProperty("height");
        canvas.style.removeProperty("-webkit-mask-image");
        canvas.style.removeProperty("mask-image");
      }
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
      if (mode === "pinned" && section.getBoundingClientRect().top >= window.innerHeight) held = shown = pace = 0;
      held = progress();
      // A critically damped follow: the story gathers and sheds speed smoothly however unevenly the scroll arrives (wheel
      // steps, touch momentum), and it never runs past the scroll, so it can't play a moment backwards.
      const before = held - shown;
      pace += (FOLLOW * FOLLOW * before - 2 * FOLLOW * pace) * dt;
      shown += pace * dt;
      if ((held - shown) * before <= 0 || (Math.abs(held - shown) < 0.0004 && Math.abs(pace) < 0.02)) {
        shown = held;
        pace = 0;
      }
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
          mobile: mobileRef.current,
          stage: getComputedStyle(document.documentElement).getPropertyValue("--stage").trim() || "#410000",
        });
      } catch (err) {
        if (disposed) return;
        // The browser would not give this page a graphics context just now (many tabs open, or the graphics card is busy).
        console.warn("[slate] 3D could not start", err);
        loading = false;
        rebuild();
        return;
      }
      sceneRef.current = scene;
      const r = canvas.getBoundingClientRect();
      scene.resize(r.width, r.height);
      fitStage();
      // Resume at the current scroll position without replaying a rapid catch-up after a resize.
      held = progress();
      shown = held;
      pace = 0;
      setVars(shown);
      // Off screen: don't draw yet (that would upload everything at once); warm the GPU up in idle moments instead.
      if (visible) scene.update(shown, 0);
      else void scene.warmUp().catch(() => {});
      run();
    }

    // The required loading happens up front, not in the middle of a scroll.
    void import("./scene").catch(() => {});
    for (const item of itemsRef.current) if (item.src) void titleArtBlob(item.src).catch(() => {});
    let settleTimer = 0;
    let idleCall = 0;
    const buildSoon = () => {
      if (getHandoff().status === "waiting" || settleTimer) return;
      // A moment after the opening has handed over, so its fade to the page stays untouched.
      settleTimer = window.setTimeout(() => {
        if ("requestIdleCallback" in window) idleCall = requestIdleCallback(() => void init(), { timeout: 1500 });
        else void init();
      }, 900);
    };
    const stopWatchingIntro = subscribeHandoff(buildSoon);
    buildSoon();
    const near = new IntersectionObserver(([e]) => e.isIntersecting && init(), { rootMargin: "250% 0px" });
    near.observe(section);
    const inView = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) loop.stop();
      // Left behind above (scrolled back up past its start): rewind, so coming down again replays the drop.
      if (!visible && mode === "pinned" && e.boundingClientRect.top > 0) held = shown = pace = 0;
      run();
    });
    inView.observe(section);
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(r.width, r.height);
      fitStage();
    });
    ro.observe(canvas);
    const onVisibility = () => { if (document.hidden) loop.stop(); else run(); };
    // A finger's first tap stands a card up, as a cursor's hover does, and a second tap on it opens it.
    let tapped = -1;
    let tappedAt = 0;
    let tapTimer = 0;
    const lieDown = () => {
      window.clearTimeout(tapTimer);
      tapped = -1;
      scene?.pointer(null, 0);
    };
    const onScroll = () => {
      if (tapped >= 0 && Math.abs(window.scrollY - tappedAt) > 48) lieDown();
      run();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    // At the end the cards can be touched: hover stands a card up and it follows the cursor; click opens it.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || mode === "static") return;
      const r = canvas.getBoundingClientRect();
      scene?.pointer(e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== "touch") scene?.pointer(null, 0); };
    let press: { x: number; y: number; touch: boolean } | null = null;
    const onDown = (event: PointerEvent) => { press = { x: event.clientX, y: event.clientY, touch: event.pointerType !== "mouse" }; };
    const onClick = (event: MouseEvent) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) { press = null; return; }
      const touch = !!press?.touch;
      press = null;
      const rect = canvas.getBoundingClientRect();
      scene?.pointer(null, 0);
      scene?.update(shown, 0);
      scene?.pointer(event.clientX - rect.left, event.clientY - rect.top);
      scene?.update(shown, 0);
      const i = scene ? scene.hovered() : -1;
      const item = itemsRef.current[i];
      if (touch && i !== tapped) {
        window.clearTimeout(tapTimer);
        tapped = i;
        tappedAt = window.scrollY;
        if (i < 0) scene?.pointer(null, 0);
        else tapTimer = window.setTimeout(lieDown, 5000);
        return;
      }
      if (touch) lieDown();
      if (i >= 0 && item && projectSlugsRef.current.includes(item.slug)) {
        const preview = new URLSearchParams(window.location.search).has("portal-preview") ? "?portal-preview" : "";
        router.push(`/work/${item.slug}${preview}`);
      }
      if (mode === "static") scene?.pointer(null, 0);
    };
    // If the graphics card drops the 3D scene while the page is open, the simple version takes over rather than a frozen picture.
    const onLost = (e: Event) => {
      e.preventDefault();
      rebuild();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      disposed = true;
      window.clearTimeout(tapTimer);
      window.clearTimeout(settleTimer);
      if (idleCall) cancelIdleCallback(idleCall);
      stopWatchingIntro();
      loop.dispose();
      window.removeEventListener("scroll", onScroll);
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
      canvas.remove();
      stage.style.removeProperty("height");
    };
  }, [mode, attempt, router, pt.enabled, hasArtwork]);

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

  if (mode === "fallback" || !hasArtwork) {
    return (
      <section id={proofTable.id} className={styles.section}>
        <ProofTableFallback items={items} projectSlugs={projects.map((project) => project.slug)} look={pt}>{copy}</ProofTableFallback>
      </section>
    );
  }

  // Pinned for `length` screens of scrolling (a bit shorter on phones). Sized in the stylesheet, so the page's height is right
  // from the first paint and nothing below it jumps once the page has started.
  const pinned = mode === "pinned" ? ({ "--slate-length": pt.length } as React.CSSProperties) : undefined;
  return (
    <section
      id={proofTable.id}
      ref={sectionRef}
      className={`${styles.section} ${mode === "static" ? styles.still : mode === "pinned" ? styles.pinned : ""}`}
      style={pinned}
    >
      <div ref={stageRef} className={`${styles.stage} ${mode === "static" ? styles.revealed : ""}`}>
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
