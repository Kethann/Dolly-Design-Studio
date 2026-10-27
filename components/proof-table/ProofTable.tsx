"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { proofTable } from "@/content/proof-table";
import { ProofTableFallback } from "./Fallback";
import type { ProofScene } from "./scene";
import { STAGES } from "./stages";
import styles from "./ProofTable.module.css";

type Mode = "pinned" | "static" | "fallback";
const FRAMES = 240;

function hasWebGL() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * The Proof Table: a scroll-pinned 3D scene (see scene.ts) with the headline revealed beside it at the end.
 * Pinned and scrubbed while you scroll through it; reduced motion shows the final composition; no WebGL shows a
 * CSS 3D version. The scene is only created once the section is near the viewport, and is paused when it's not.
 */
export function ProofTable() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pinned");
  const [mobile, setMobile] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability check
    setMobile(window.matchMedia("(max-width: 767px)").matches);
    setMode(!hasWebGL() ? "fallback" : reduced ? "static" : "pinned");
  }, []);

  useEffect(() => {
    if (mode === "fallback") return;
    const section = sectionRef.current!;
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const items = mobile ? proofTable.items.slice(0, 6) : proofTable.items;
    let scene: ProofScene | null = null;
    let raf = 0;
    let visible = false;
    let shown = 0; // smoothed progress
    let last = performance.now();
    let disposed = false;

    const progress = () => {
      if (mode === "static") return 1;
      const r = section.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    };

    function setVars(p: number) {
      const insp = Math.min(1, Math.max(0, (p - STAGES.inspect[0]) / (STAGES.inspect[1] - STAGES.inspect[0])));
      stage.style.setProperty("--gobo", mobile || mode === "static" ? "0" : (insp * 0.9).toFixed(3));
      stage.style.setProperty("--hud", (1 - insp * 0.7).toFixed(3));
      // Headline lines appear one after another as the camera settles.
      for (let i = 0; i < 5; i++) {
        const r = Math.min(1, Math.max(0, (p - (0.8 + i * 0.03)) / 0.08));
        stage.style.setProperty(`--r${i}`, (r * r * (3 - 2 * r)).toFixed(3));
      }
      if (counterRef.current) counterRef.current.textContent = `${String(1 + Math.round(p * (FRAMES - 1))).padStart(3, "0")} / ${FRAMES}`;
    }

    function frame(now: number) {
      raf = 0;
      if (disposed || !scene || !visible) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = progress();
      shown += (target - shown) * (1 - Math.exp(-dt * 7));
      if (Math.abs(target - shown) < 0.0005) shown = target;
      setVars(shown);
      scene.update(shown, dt);
      raf = requestAnimationFrame(frame);
    }
    const run = () => {
      if (!raf && scene && visible && !disposed) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    async function init() {
      const { createProofScene } = await import("./scene");
      if (disposed || scene) return;
      scene = createProofScene(canvas, {
        items,
        labels: proofTable.labels,
        mobile,
        stage: getComputedStyle(document.documentElement).getPropertyValue("--stage").trim() || "#410000",
      });
      const r = canvas.getBoundingClientRect();
      shown = progress();
      setVars(shown);
      scene.resize(r.width, r.height);
      scene.ready.then(() => scene?.update(shown, 0));
      run();
    }

    const near = new IntersectionObserver(([e]) => e.isIntersecting && init(), { rootMargin: "150% 0px" });
    near.observe(section);
    const inView = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      run();
    });
    inView.observe(section);
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(r.width, r.height);
    });
    ro.observe(canvas);

    // At the end the proofs can be touched: hover tilts a plate, click opens its project.
    let hovered = -1;
    const onMove = (e: PointerEvent) => {
      if (!scene) return;
      const r = canvas.getBoundingClientRect();
      hovered = scene.pointer(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = hovered >= 0 ? "pointer" : "";
    };
    const onLeave = () => {
      hovered = scene ? scene.pointer(null, 0) : -1;
      canvas.style.cursor = "";
    };
    const onClick = () => {
      if (hovered >= 0) router.push(`/work/${items[hovered].slug}`);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      near.disconnect();
      inView.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      scene?.dispose();
    };
  }, [mode, mobile, router]);

  const copy = (
    <div className={styles.copy}>
      <span className={styles.overline} style={{ "--r": "var(--r0)" } as React.CSSProperties}>
        {proofTable.overline}
      </span>
      <h2 className={styles.headline}>
        {proofTable.headline.map((line, i) => (
          <span key={line} className={styles.line} style={{ "--r": `var(--r${i + 1})` } as React.CSSProperties}>
            {line}
          </span>
        ))}
      </h2>
      <p className={styles.body} style={{ "--r": "var(--r3)" } as React.CSSProperties}>
        {proofTable.body}
      </p>
      <Link href={proofTable.cta.href} className={styles.cta} data-cursor="link" style={{ "--r": "var(--r4)" } as React.CSSProperties}>
        {proofTable.cta.label} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );

  if (mode === "fallback") {
    return (
      <section id={proofTable.id} className={styles.section}>
        <ProofTableFallback items={proofTable.items}>{copy}</ProofTableFallback>
      </section>
    );
  }

  return (
    <section
      id={proofTable.id}
      ref={sectionRef}
      className={`${styles.section} ${mode === "pinned" ? (mobile ? styles.pinShort : styles.pin) : styles.still}`}
    >
      <div ref={stageRef} className={`${styles.stage} ${mode === "static" ? styles.revealed : ""}`}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <div className={styles.gobo} aria-hidden="true" />
        <div className={styles.grain} aria-hidden="true" />
        <div className={styles.hud} aria-hidden="true">
          <span>{proofTable.labels.proof}</span>
          <span ref={counterRef}>001 / {FRAMES}</span>
        </div>
        {copy}
        <ul className="sr-only">
          {proofTable.items.map((it) => (
            <li key={it.src}>
              <Link href={`/work/${it.slug}`}>{it.alt}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
