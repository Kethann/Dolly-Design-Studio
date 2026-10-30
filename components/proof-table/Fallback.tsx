/* eslint-disable @next/next/no-img-element -- transparent title art, laid out by CSS 3D transforms */
"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { ProofItem } from "@/content/proof-table";
import { resizedSrc, srcSetFor } from "@/lib/images";
import styles from "./ProofTable.module.css";
import { startAssembly } from "./assembly";
import { bindGlassHover } from "./hover";
import Link from "next/link";
import type { ProofTableSettings } from "@/lib/intro/settings";

/** Empty/no-WebGL slate: turn from side view to straight as the glass cards assemble. */
export function ProofTableFallback({ items, children, projectSlugs = [], look }: { items: ProofItem[]; children: React.ReactNode; projectSlugs?: string[]; look?: ProofTableSettings }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const slabRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    const slab = slabRef.current;
    if (scene && slab) {
      const stopAssembly = startAssembly(scene, slab);
      const stopHover = bindGlassHover(scene);
      return () => { stopAssembly(); stopHover(); };
    }
  }, []);

  // Every insertion stays inside the table's turn: start at 10%, finish by 82%, then settle straight.
  const duration = 1800;
  const insertDuration = duration * 0.28;

  return (
    <div className={`${styles.stage} ${styles.revealed} ${styles.fbStage}`}>
      <div ref={sceneRef} className={styles.fbScene} data-assembly="ready" data-paused="true" style={{ "--assembly-duration": `${duration}ms`, "--insert-duration": `${insertDuration}ms`, ...(look ? {
        "--slab-tint": look.slabColor, "--slab-opacity": `${look.slabOpacity * 100}%`,
        "--glass-tint": look.glassColor, "--glass-opacity": `${look.glassOpacity * 100}%`,
        "--glass-sheen": 0.04 + look.reflection * 0.16,
        "--glass-frost": look.frost * 0.18,
        "--card-width": `${(0.72 + look.cardSize * 0.28) * 100}%`,
      } : {}) } as CSSProperties}>
        <div ref={slabRef} className={styles.fbSlab}>
          {items.map((it, i) => {
            const card = <div className={`${styles.fbPlate} ${it.type === "title-png" ? styles.fbSmoky : ""}`} style={{ "--insert-delay": `${Math.round(duration * (0.1 + (i / Math.max(1, items.length - 1)) * 0.44))}ms`, "--insert-x": `${i % 2 === 0 ? -32 : 32}px` } as CSSProperties}>
              {it.src ? <img src={resizedSrc(it.src, 640)} srcSet={srcSetFor(it.src, [160, 320, 640, 960])} sizes="auto, (max-width: 520px) 45vw, (max-width: 1000px) 30vw, 240px" alt="" loading="lazy" decoding="async" /> : <span className={styles.fbEmpty} aria-hidden="true" />}
              <span>
                {it.tag} · {it.film} · {it.year}
              </span>
            </div>;
            return projectSlugs.includes(it.slug)
              ? <Link key={`${it.slug}-${i}`} href={`/work/${it.slug}`} className={styles.fbSlot} data-slate-slot aria-label={`View ${it.film}`}>{card}</Link>
              : <div key={`${it.slug}-${i}`} className={styles.fbSlot} data-slate-slot>{card}</div>;
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
