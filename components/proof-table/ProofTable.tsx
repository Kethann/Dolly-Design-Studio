"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { proofTable } from "@/content/proof-table";
import { useContent } from "@/lib/content/context";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { renderFx } from "@/components/fx/render-fx";
import { resizedSrc } from "@/lib/images";
import { sanitizeDisc, visibleDiscItems } from "@/lib/content/disc";
import type { DiscScene } from "@/components/disc-hero/scene";
import styles from "@/components/disc-hero/DiscHero.module.css";

/** The existing slate entries remain editable; only their presentation changes. */
export function ProofTable() {
  const router = useRouter();
  const { settings } = useIntroSettings();
  const { slate, projects } = useContent();
  const pt = settings.proofTable;
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<DiscScene | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState(false);
  const current = useRef({ pt, projects, paused });
  useEffect(() => { current.current = { pt, projects, paused }; });
  const imagesKey = JSON.stringify(visibleDiscItems(pt.items).map(it => [it.src, it.film, it.tint]));
  const controlsKey = JSON.stringify(pt.disc);
  useEffect(() => {
    scene.current?.setImages(visibleDiscItems(pt.items).map(it => ({ src: it.src ? resizedSrc(it.src, 768) : "", label: it.film, tint: it.tint })));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preview URL
    setPreview(new URLSearchParams(location.search).has("portal-preview"));
    async function init() {
      if (loading || disposed) return;
      loading = true;
      try {
        const { createDiscScene } = await import("@/components/disc-hero/scene");
        if (disposed) return;
        const data = current.current;
        scene.current = createDiscScene(surface, visibleDiscItems(data.pt.items).map(it => ({ src: it.src ? resizedSrc(it.src, 768) : "", label: it.film, tint: it.tint })),
          sanitizeDisc(data.pt.disc), () => { scene.current?.dispose(); scene.current = null; if (!disposed) setState("fallback"); });
        scene.current.resize(host.clientWidth, host.clientHeight);
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
    const resize = new ResizeObserver(() => scene.current?.resize(host.clientWidth, host.clientHeight)); resize.observe(host);
    let press: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { press = { x: e.clientX, y: e.clientY }; };
    const click = (e: MouseEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { press = null; return; }
      press = null;
      const bounds = surface.getBoundingClientRect();
      const index = scene.current?.hit(e.clientX - bounds.left, e.clientY - bounds.top) ?? -1;
      const item = current.current.pt.items[index];
      if (item && current.current.projects.some(p => p.slug === item.slug)) {
        router.push(`/work/${item.slug}${new URLSearchParams(location.search).has("portal-preview") ? "?portal-preview" : ""}`);
      }
    };
    const move = (e: PointerEvent) => {
      const bounds = surface.getBoundingClientRect(), index = scene.current?.hit(e.clientX - bounds.left, e.clientY - bounds.top) ?? -1;
      const item = current.current.pt.items[index];
      surface.style.cursor = item && current.current.projects.some(p => p.slug === item.slug) ? "pointer" : "default";
    };
    surface.addEventListener("pointerdown", down, { passive: true }); surface.addEventListener("click", click); surface.addEventListener("pointermove", move, { passive: true });
    return () => {
      disposed = true; near.disconnect(); observer.disconnect(); resize.disconnect();
      surface.removeEventListener("pointerdown", down); surface.removeEventListener("click", click); surface.removeEventListener("pointermove", move);
      scene.current?.dispose(); scene.current = null;
    };
  }, [pt.enabled, router]);

  if (!pt.enabled) return null;
  const suffix = preview ? "?portal-preview" : "";
  const viewControls = sanitizeDisc(pt.disc);
  return (
    <section id={proofTable.id} className={styles.section} aria-labelledby="disc-slate-title">
      <div className={`container ${styles.layout}`}>
      <div className={styles.copy}>
        <span className={styles.overline}>{renderFx(slate.overline)}</span>
        <h2 id="disc-slate-title" className={styles.headline}>{slate.headline.map((line, i) => <span key={i}>{renderFx(line)}</span>)}</h2>
        <p className={styles.body}>{renderFx(slate.body)}</p>
        <Link href={`/work${suffix}`} className={styles.cta}>{slate.ctaLabel} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.visual}>
        <div ref={stage} className={styles.stage} data-disc-state={state}>
          <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
          {state !== "ready" && <div className={styles.staticDisc} aria-hidden="true" style={{ transform: `translate(-50%,-50%) rotate(${-viewControls.discRoll}deg) scaleY(${Math.cos(viewControls.discTilt * Math.PI / 180)})` }}><span>DOLLY DESIGN STUDIO · TITLE COLLECTION</span></div>}
          {state === "ready" && <button type="button" className={styles.pause} onClick={() => setPaused(v => !v)} aria-pressed={paused}>{paused ? "Resume disc" : "Pause disc"}</button>}
          {state === "fallback" && <p className={styles.status}>Explore the title collection below.</p>}
        </div>
        <details className={styles.collection} open={state === "fallback" || undefined}>
          <summary>Explore the collection <span>{pt.items.length} titles</span></summary>
          <ul>{pt.items.map((it, i) => <li key={`${it.slug}-${i}`}>{projects.some(p => p.slug === it.slug)
            ? <Link href={`/work/${it.slug}${suffix}`}>{it.film}<span>{it.tag} · {it.year}</span></Link>
            : <span>{it.film}<small>{it.tag} · {it.year}</small></span>}</li>)}</ul>
        </details>
      </div>
      </div>
    </section>
  );
}
