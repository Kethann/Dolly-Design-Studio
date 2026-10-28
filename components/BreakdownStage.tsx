"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Breakdown } from "@/lib/content/types";
import { versionedSrc } from "@/lib/images";
import styles from "./BreakdownStage.module.css";

/** How the exploded stack is turned: edge-on from the side like parts in an exploded diagram, or tilted to show more of each layer. */
const TURNS = { side: "rotateX(8deg) rotateY(-58deg)", angled: "rotateX(20deg) rotateY(-36deg)" } as const;
const SPREADS = { tight: 0.65, normal: 1, wide: 1.4 } as const;

/**
 * One breakdown: the finished artwork, flat. Put the pointer anywhere on it (or tap it) and it falls apart into its
 * layers, one after another, each with a numbered line pointing to a label. Move away and it closes back up.
 */
export function ExplodeStage({
  item,
  openSignal = 0,
  onOpenChange,
}: {
  item: Breakdown;
  /** Changes when something outside (the portal's preview) asks for it to be shown taken apart. */
  openSignal?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const n = item.layers.length;
  const [open, setOpen] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  /** Which row each label sits in: they drop to a lower row rather than overlap. */
  const [rowOf, setRowOf] = useState<number[]>([]);
  const [labelsOn, setLabelsOn] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openSignal > 0) setOpen(true); // eslint-disable-line react-hooks/set-state-in-effect -- asked to open from outside
  }, [openSignal]);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const layerEls = useRef<(HTMLImageElement | null)[]>([]);

  // The stage takes the shape of the artwork (the first layer's canvas).
  const first = item.layers[0]?.image;
  useEffect(() => {
    if (!first) return;
    const img = new Image();
    img.onload = () => img.naturalWidth && setAspect(img.naturalWidth / img.naturalHeight);
    img.src = versionedSrc(first);
  }, [first]);

  // Where each layer ended up on screen: the label lines point there.
  const measure = useCallback(() => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    setSize({ w: box.width, h: box.height });
    const pts = layerEls.current.map((el) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2 - box.left, y: r.top + r.height * 0.8 - box.top } : { x: 0, y: 0 };
    });
    setPoints(pts);

    // Give each label the first row where it doesn't run into one already there.
    const small = box.width < 640;
    const widthOf = (i: number) => (small ? 7.6 : 9.4) * ((item.layers[i]?.label || `Layer ${i + 1}`).length) + (small ? 42 : 50);
    const centre = (i: number) => Math.min(Math.max(pts[i].x, 64), Math.max(64, box.width - 64));
    const placed: { x: number; w: number; row: number }[] = [];
    const rows: number[] = [];
    [...pts.keys()]
      .sort((a, b) => pts[a].x - pts[b].x)
      .forEach((i) => {
        let row = 0;
        while (placed.some((q) => q.row === row && Math.abs(q.x - centre(i)) < (q.w + widthOf(i)) / 2 + 8) && row < 5) row++;
        placed.push({ x: centre(i), w: widthOf(i), row });
        rows[i] = row;
      });
    setRowOf(rows);
  }, [item.layers]);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setLabelsOn(false), 0);
      return () => clearTimeout(t);
    }
    // Labels appear once the layers have settled (the move takes about a second, plus a small delay per layer), and
    // the lines are measured once more a little later in case a slow screen was still catching up.
    const t1 = setTimeout(() => {
      measure();
      setLabelsOn(true);
    }, 1150 + n * 50);
    const t2 = setTimeout(measure, 1700 + n * 50);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, n, measure]);

  useEffect(() => {
    const on = () => open && measure();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [open, measure]);

  // The layers fan out sideways (the stack is turned nearly edge-on), and the whole stack shrinks to leave room: the
  // more layers, the smaller each one and the tighter the spacing, so everything stays inside the viewer.
  const w = size.w || 800;
  const gap = Math.max(60, Math.min(320, (w * 0.84) / (Math.max(1, n - 1) * 0.85))) * SPREADS[item.spread];
  const scale = n <= 2 ? 0.7 : n <= 3 ? 0.62 : n <= 5 ? 0.54 : 0.45;
  const zOf = (i: number) => (open ? (i - (n - 1) / 2) * gap : i * 0.4);

  return (
    <div
      ref={stage}
      className={styles.stage}
      style={{ aspectRatio: String(aspect), marginBottom: !item.labels ? 24 : open && labelsOn ? 44 + (Math.max(0, ...rowOf) + 1) * 46 : undefined }}
      data-open={open}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${item.title}: ${open ? "close the layers" : "show the layers"}`}
      onPointerEnter={(e) => e.pointerType !== "touch" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType !== "touch" && setOpen(false)}
      // A mouse opens it by hovering; on a touch screen, a tap toggles it.
      onPointerUp={(e) => e.pointerType === "touch" && setOpen((v) => !v)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setOpen((v) => !v);
        }
        if (ev.key === "Escape") setOpen(false);
      }}
    >
      <div className={styles.stack} style={{ transform: open ? `scale(${scale}) ${TURNS[item.turn]}` : "none" }}>
        {item.layers.map((layer, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- transparent layer PNGs stacked in 3D
          <img
            key={`${layer.image}-${i}`}
            ref={(el) => {
              layerEls.current[i] = el;
            }}
            src={versionedSrc(layer.image)}
            alt={layer.label || `Layer ${i + 1}`}
            draggable={false}
            className={styles.layer}
            style={{
              transform: `translateZ(${zOf(i)}px)`,
              transitionDelay: open ? `${i * 45}ms` : `${(n - 1 - i) * 30}ms`,
            }}
          />
        ))}
      </div>

      {/* Numbered lines from each layer down to its label. */}
      <div className={styles.labels} data-on={labelsOn && item.labels} aria-hidden={!labelsOn || !item.labels} hidden={!item.labels}>
        <svg className={styles.lines} width={size.w} height={size.h + 300} viewBox={`0 0 ${size.w} ${size.h + 300}`}>
          {points.map((pt, i) => {
            const row = rowOf[i] ?? 0;
            const lineEnd = size.h + 26 + row * 50;
            return (
              <g key={i} style={{ transitionDelay: `${i * 70}ms` }}>
                <line x1={pt.x} y1={pt.y} x2={pt.x} y2={lineEnd} />
                <circle cx={pt.x} cy={pt.y} r="4" />
              </g>
            );
          })}
        </svg>
        {points.map((pt, i) => {
          const row = rowOf[i] ?? 0;
          const x = Math.min(Math.max(pt.x, 64), Math.max(64, size.w - 64));
          return (
            <span key={i} className={styles.tag} style={{ left: x, top: size.h + 26 + row * 50, transitionDelay: `${i * 70}ms` }}>
              <b>{i + 1}</b>
              <span>{item.layers[i]?.label || `Layer ${i + 1}`}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
