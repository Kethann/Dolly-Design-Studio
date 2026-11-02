"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { proofTable } from "@/content/proof-table";
import { useContent } from "@/lib/content/context";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { renderFx } from "@/components/fx/render-fx";
import { resizedSrc } from "@/lib/images";
import { sanitizeDisc, visibleGlassTitles, glassBackdropStyle } from "@/lib/content/disc";
import type { DiscScene } from "@/components/disc-hero/scene";
import { DiscDetailCard } from "@/components/disc-hero/DiscDetailCard";
import styles from "@/components/disc-hero/DiscHero.module.css";

/** The existing slate entries remain editable; only their presentation changes. */
export function ProofTable() {
  const { settings } = useIntroSettings();
  const { slate, projects } = useContent();
  const pt = settings.proofTable;
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), frost = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLHeadingElement>(null), body = useRef<HTMLParagraphElement>(null);
  const scene = useRef<DiscScene | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const current = useRef({ pt, projects, paused });
  useEffect(() => { current.current = { pt, projects, paused }; });
  const imagesKey = JSON.stringify(visibleGlassTitles(pt.items).map(it => [it.src, it.film, it.titleColor, it.titleOriginalColor, it.titleGlowColor, it.titleGlowIntensity, it.titleRotation, it.titleScale, it.titleOpacity, it.titleBlend, it.titleAppearance, it.titleImpact]));
  const controlsKey = JSON.stringify(pt.disc);
  useEffect(() => {
    scene.current?.setImages(visibleGlassTitles(pt.items).map(it => ({ src: it.src ? resizedSrc(it.src, 768) : "", label: it.film,
      titleColor: it.titleColor, originalColor: it.titleOriginalColor, glowColor: it.titleGlowColor, glowIntensity: it.titleGlowIntensity, rotation: it.titleRotation,
      scale: it.titleScale, opacity: it.titleOpacity, blend: it.titleBlend, appearance: it.titleAppearance, impact: it.titleImpact })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update artwork only when its content/settings change
  }, [imagesKey]);
  useEffect(() => {
    if (scene.current) { Object.assign(scene.current.controls, sanitizeDisc(pt.disc)); scene.current.invalidate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portal updates are compared by value
  }, [controlsKey]);
  useEffect(() => { scene.current?.setPaused(paused); }, [paused]);

  useEffect(() => {
    if (!pt.enabled) return;
    const host = stage.current!, surface = canvas.current!;
    let disposed = false, loading = false, visible = false, scrollFrame = 0;
    const syncBeamOrigin = () => {
      // A steady off-screen upper-corner source, independent of the rotating circle and text height.
      scene.current?.setBeamOrigin(null, -.09);
    };
    const syncScroll = () => {
      scrollFrame = 0;
      if (!visible || disposed) return;
      const bounds = host.getBoundingClientRect();
      scene.current?.setScrollProgress(Math.max(0, -bounds.top) / Math.max(1, bounds.height * .8));
    };
    const onScroll = () => { if (visible && !scrollFrame) scrollFrame = requestAnimationFrame(syncScroll); };
    const portalPreview = new URLSearchParams(location.search).has("portal-preview");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preview URL
    setPreview(portalPreview);
    async function init() {
      if (loading || disposed) return;
      loading = true;
      try {
        const { createDiscScene } = await import("@/components/disc-hero/scene");
        if (disposed) return;
        const data = current.current;
        scene.current = createDiscScene(surface, visibleGlassTitles(data.pt.items).map(it => ({ src: it.src ? resizedSrc(it.src, 768) : "", label: it.film,
          titleColor: it.titleColor, originalColor: it.titleOriginalColor, glowColor: it.titleGlowColor, glowIntensity: it.titleGlowIntensity, rotation: it.titleRotation,
          scale: it.titleScale, opacity: it.titleOpacity, blend: it.titleBlend, appearance: it.titleAppearance, impact: it.titleImpact })),
          sanitizeDisc(data.pt.disc), () => { scene.current?.dispose(); scene.current = null; if (!disposed) setState("fallback"); }, src => resizedSrc(src, 1920));
        scene.current.setFrostLayer(frost.current);
        scene.current.resize(host.clientWidth, host.clientHeight);
        syncBeamOrigin();
        syncScroll();
        scene.current.setAimGuides(portalPreview);
        scene.current.setPaused(data.paused); scene.current.setActive(visible);
        setState("ready");
      } catch {
        scene.current?.dispose(); scene.current = null;
        if (!disposed) setState("fallback");
      }
    }
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { void init(); near.disconnect(); } }, { rootMargin: "250px" });
    near.observe(host);
    const observer = new IntersectionObserver(([e]) => { visible = e.isIntersecting && e.intersectionRatio >= .18; scene.current?.setActive(visible); syncScroll(); }, { threshold: [0, .18] }); observer.observe(host);
    const resize = new ResizeObserver(() => { scene.current?.resize(host.clientWidth, host.clientHeight); syncBeamOrigin(); });
    resize.observe(host);
    window.addEventListener("scroll", onScroll, { passive: true });
    let press: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { press = { x: e.clientX, y: e.clientY }; };
    const click = (e: MouseEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { press = null; return; }
      press = null;
      const bounds = surface.getBoundingClientRect();
      const index = scene.current?.hit(e.clientX - bounds.left, e.clientY - bounds.top) ?? -1;
      const item = visibleGlassTitles(current.current.pt.items)[index];
      if (item) {
        host.focus({ preventScroll: true });
        setOrigin({ x: (e.clientX - innerWidth / 2) * .35, y: (e.clientY - innerHeight / 2) * .35 });
        scene.current?.setOpen(index); setSelected(index);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons) return;
      const bounds = surface.getBoundingClientRect(), index = scene.current?.hit(e.clientX - bounds.left, e.clientY - bounds.top) ?? -1;
      const item = visibleGlassTitles(current.current.pt.items)[index];
      surface.style.cursor = item ? "pointer" : scene.current?.canDrag(e.clientX - bounds.left, e.clientY - bounds.top) ? "grab" : "default";
      scene.current?.setHover(item ? index : -1);
    };
    surface.addEventListener("pointerdown", down, { passive: true }); surface.addEventListener("click", click); surface.addEventListener("pointermove", move, { passive: true });
    return () => {
      disposed = true; near.disconnect(); observer.disconnect(); resize.disconnect();
      window.removeEventListener("scroll", onScroll); cancelAnimationFrame(scrollFrame);
      surface.removeEventListener("pointerdown", down); surface.removeEventListener("click", click); surface.removeEventListener("pointermove", move);
      scene.current?.dispose(); scene.current = null;
    };
  }, [pt.enabled]);

  if (!pt.enabled) return null;
  const suffix = preview ? "?portal-preview" : "";
  const viewControls = sanitizeDisc(pt.disc);
  const selectedItem = selected === null ? null : visibleGlassTitles(pt.items)[selected];
  const closePreview = (restoreFocus = false) => {
    setSelected(null); scene.current?.setOpen(-1); scene.current?.setHover(-1);
    if (restoreFocus) stage.current?.focus({ preventScroll: true });
  };
  return (
    <section id={proofTable.id} className={styles.section} style={{ ...glassBackdropStyle(viewControls),
      "--disc-copy-x": `${pt.copyX}px`, "--disc-copy-y": `${pt.copyY}px`, "--disc-copy-width": `${pt.copyWidth}px` } as CSSProperties}
      data-projector-side={viewControls.projectorSide} aria-labelledby="disc-slate-title">
      <div className={styles.layout}>
      <div ref={copy} className={styles.copy}>
        <span className={styles.overline}>{renderFx(slate.overline)}</span>
        <h2 ref={headline} id="disc-slate-title" className={styles.headline}>{slate.headline.map((line, i) => <span key={i}>{renderFx(line)}</span>)}</h2>
        <p ref={body} className={styles.body}>{renderFx(slate.body)}</p>
        <Link href={`/work${suffix}`} className={styles.cta}>{slate.ctaLabel} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.visual}>
        <div ref={stage} className={styles.stage} data-disc-state={state} tabIndex={-1}
          onPointerLeave={e => { if (e.pointerType === "mouse") scene.current?.setHover(-1); }}>
          <div ref={frost} className={styles.frost} aria-hidden="true" />
          <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
          {state === "fallback" && <p className={styles.status}>Explore the title collection below.</p>}
        </div>
        {state === "ready" && <div className={styles.sceneControls}><button type="button" className={styles.pause} onClick={() => setPaused(v => !v)} aria-pressed={paused}>{paused ? "Resume circle" : "Pause circle"}</button></div>}
        {state === "fallback" && <details className={styles.collection} open>
          <summary>Explore the collection</summary>
          <ul>{pt.items.map((it, i) => <li key={`${it.slug}-${i}`}>{projects.some(p => p.slug === it.slug)
            ? <Link href={`/work/${it.slug}${suffix}`}>{it.film}</Link>
            : <span>{it.film}</span>}
          </li>)}</ul>
        </details>}
      </div>
      </div>
      {selectedItem && <DiscDetailCard key={`${selected}-${selectedItem.src}`} item={selectedItem} project={projects.find(p => p.slug === selectedItem.slug)} suffix={suffix} origin={origin} onClose={() => closePreview(true)} />}
    </section>
  );
}
