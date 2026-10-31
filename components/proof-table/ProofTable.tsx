"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { proofTable } from "@/content/proof-table";
import { useContent } from "@/lib/content/context";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { renderFx } from "@/components/fx/render-fx";
import { resizedSrc } from "@/lib/images";
import { DISC_SLOT_LIMIT, sanitizeDisc, visibleDiscItems } from "@/lib/content/disc";
import type { DiscScene } from "@/components/disc-hero/scene";
import { DiscDetailCard } from "@/components/disc-hero/DiscDetailCard";
import styles from "@/components/disc-hero/DiscHero.module.css";

/** The existing slate entries remain editable; only their presentation changes. */
export function ProofTable() {
  const { settings } = useIntroSettings();
  const { slate, projects } = useContent();
  const pt = settings.proofTable;
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLHeadingElement>(null), body = useRef<HTMLParagraphElement>(null);
  const scene = useRef<DiscScene | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const current = useRef({ pt, projects, paused });
  useEffect(() => { current.current = { pt, projects, paused }; });
  const imagesKey = JSON.stringify(visibleDiscItems(pt.items).map(it => [it.src, it.film, it.titleColor, it.titleGlowColor, it.titleGlowIntensity]));
  const controlsKey = JSON.stringify(pt.disc);
  useEffect(() => {
    scene.current?.setImages(visibleDiscItems(pt.items).map(it => ({ src: it.src ? resizedSrc(it.src, 768) : "", label: it.film,
      titleColor: it.titleColor, glowColor: it.titleGlowColor, glowIntensity: it.titleGlowIntensity })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when slot content changes
  }, [imagesKey]);
  useEffect(() => {
    if (scene.current) { Object.assign(scene.current.controls, sanitizeDisc(pt.disc)); scene.current.invalidate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portal updates are compared by value
  }, [controlsKey]);
  useEffect(() => { scene.current?.setPaused(paused); }, [paused]);

  useEffect(() => {
    if (!pt.enabled) return;
    const host = stage.current!, surface = canvas.current!;
    let disposed = false, loading = false, visible = false;
    const syncBeamOrigin = () => {
      const copyBounds = copy.current?.getBoundingClientRect(), titleBounds = headline.current?.getBoundingClientRect(), bodyBounds = body.current?.getBoundingClientRect();
      const stageBounds = host.getBoundingClientRect();
      if (!copyBounds || !titleBounds || !bodyBounds || stageBounds.width <= 0 || stageBounds.height <= 0) return;
      // Begin just beneath the final heading line, then let the volumetric shader ease the light
      // into view before it reaches the description. On stacked mobile the source stays off screen.
      const titleGap = Math.max(0, bodyBounds.top - titleBounds.bottom);
      const originY = titleBounds.bottom + Math.min(14, Math.max(4, titleGap * .22));
      const stacked = stageBounds.top >= bodyBounds.bottom;
      const sourceX = stacked ? null : (copyBounds.left + copyBounds.width / 2 - stageBounds.left) / stageBounds.width;
      scene.current?.setBeamOrigin(sourceX, (originY - stageBounds.top) / stageBounds.height);
    };
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
        scene.current = createDiscScene(surface, visibleDiscItems(data.pt.items).map(it => ({ src: it.src ? resizedSrc(it.src, 768) : "", label: it.film,
          titleColor: it.titleColor, glowColor: it.titleGlowColor, glowIntensity: it.titleGlowIntensity })),
          sanitizeDisc(data.pt.disc), () => { scene.current?.dispose(); scene.current = null; if (!disposed) setState("fallback"); });
        scene.current.resize(host.clientWidth, host.clientHeight);
        syncBeamOrigin();
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
    const observer = new IntersectionObserver(([e]) => { visible = e.isIntersecting; scene.current?.setActive(visible); }); observer.observe(host);
    const resize = new ResizeObserver(() => { scene.current?.resize(host.clientWidth, host.clientHeight); syncBeamOrigin(); });
    resize.observe(host);
    if (copy.current) resize.observe(copy.current);
    if (headline.current) resize.observe(headline.current);
    if (body.current) resize.observe(body.current);
    let press: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { press = { x: e.clientX, y: e.clientY }; };
    const click = (e: MouseEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { press = null; return; }
      press = null;
      const bounds = surface.getBoundingClientRect();
      const index = scene.current?.hit(e.clientX - bounds.left, e.clientY - bounds.top) ?? -1;
      const item = current.current.pt.items[index];
      if (item) {
        previewTrigger.current = null;
        host.focus({ preventScroll: true });
        setOrigin({ x: (e.clientX - innerWidth / 2) * .35, y: (e.clientY - innerHeight / 2) * .35 });
        scene.current?.setOpen(index); setSelected(index);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons) return;
      const bounds = surface.getBoundingClientRect(), index = scene.current?.hit(e.clientX - bounds.left, e.clientY - bounds.top) ?? -1;
      const item = current.current.pt.items[index];
      surface.style.cursor = item ? "pointer" : "default";
      scene.current?.setHover(item ? index : -1);
    };
    surface.addEventListener("pointerdown", down, { passive: true }); surface.addEventListener("click", click); surface.addEventListener("pointermove", move, { passive: true });
    return () => {
      disposed = true; near.disconnect(); observer.disconnect(); resize.disconnect();
      surface.removeEventListener("pointerdown", down); surface.removeEventListener("click", click); surface.removeEventListener("pointermove", move);
      scene.current?.dispose(); scene.current = null;
    };
  }, [pt.enabled]);

  if (!pt.enabled) return null;
  const suffix = preview ? "?portal-preview" : "";
  const viewControls = sanitizeDisc(pt.disc);
  const selectedItem = selected === null ? null : visibleDiscItems(pt.items)[selected];
  const closePreview = (restoreFocus = false) => {
    setSelected(null); scene.current?.setOpen(-1); scene.current?.setHover(-1);
    if (restoreFocus) (previewTrigger.current?.isConnected ? previewTrigger.current : stage.current)?.focus({ preventScroll: true });
  };
  return (
    <section id={proofTable.id} className={styles.section} data-projector-side={viewControls.projectorSide} aria-labelledby="disc-slate-title">
      <div className={`container ${styles.layout}`}>
      <div ref={copy} className={styles.copy}>
        <span className={styles.overline}>{renderFx(slate.overline)}</span>
        <h2 ref={headline} id="disc-slate-title" className={styles.headline}>{slate.headline.map((line, i) => <span key={i}>{renderFx(line)}</span>)}</h2>
        <p ref={body} className={styles.body}>{renderFx(slate.body)}</p>
        <Link href={`/work${suffix}`} className={styles.cta}>{slate.ctaLabel} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.visual}>
        <div ref={stage} className={styles.stage} data-disc-state={state} tabIndex={-1}
          onPointerLeave={e => { if (e.pointerType === "mouse") scene.current?.setHover(-1); }}>
          <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
          {state === "fallback" && <p className={styles.status}>Explore the title collection below.</p>}
        </div>
        {state === "ready" && <div className={styles.sceneControls}><button type="button" className={styles.pause} onClick={() => setPaused(v => !v)} aria-pressed={paused}>{paused ? "Resume disc" : "Pause disc"}</button></div>}
        <details className={styles.collection} open={state === "fallback" || undefined}>
          <summary>Explore the collection <span>{pt.items.length} titles</span></summary>
          <ul>{pt.items.map((it, i) => <li key={`${it.slug}-${i}`}>{projects.some(p => p.slug === it.slug)
            ? <Link href={`/work/${it.slug}${suffix}`}>{it.film}</Link>
            : <span>{it.film}</span>}
            {i < DISC_SLOT_LIMIT && state === "ready" && <button type="button" className={styles.previewButton} aria-label={`Preview ${it.film}`} aria-pressed={selected === i}
              onClick={e => { previewTrigger.current = e.currentTarget; e.currentTarget.focus({ preventScroll: true }); setOrigin({ x: 0, y: 40 }); setSelected(i); scene.current?.setOpen(i); }}>Preview artwork</button>}
          </li>)}</ul>
        </details>
      </div>
      </div>
      {selectedItem && <DiscDetailCard key={`${selected}-${selectedItem.src}`} item={selectedItem} project={projects.find(p => p.slug === selectedItem.slug)} suffix={suffix} origin={origin} onClose={() => closePreview(true)} />}
    </section>
  );
}
