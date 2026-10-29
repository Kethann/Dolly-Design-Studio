"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Breakdown } from "@/lib/content/types";
import { versionedSrc } from "@/lib/images";
import styles from "./BreakdownStage.module.css";

/** How the exploded stack starts out: edge-on from the side like parts in an exploded diagram, or tilted to show more of each layer. */
const TURNS = { side: { pitch: 8, yaw: -58 }, angled: { pitch: 20, yaw: -36 } } as const;
const SPREADS = { tight: 0.65, normal: 1, wide: 1.4 } as const;

/** Ready-made angles to look at the stack from. */
const VIEWS = [
  ["front", "Front", { yaw: 0, pitch: 0 }],
  ["side", "Side", { yaw: -58, pitch: 8 }],
  ["angled", "Angled", { yaw: -36, pitch: 20 }],
  ["top", "Top", { yaw: -24, pitch: 68 }],
] as const;
const SPREAD_MIN = 0.4;
const SPREAD_MAX = 2;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PITCH_LIMIT = 80;
/** Degrees per second while the stack turns by itself. */
const SPIN_SPEED = 28;
/** A pointer must travel this far (px) before a press counts as a drag rather than a click. */
const DRAG_SLOP = 6;
/** The labels sit in rows above the artwork: each row is this tall (px), and the first row's top edge is this far above it. */
const TAG_ROW = 50;
const TAG_H = 32;
/** How far the viewer is from the stack (matches the CSS perspective). */
const PERSPECTIVE = 1500;
/** The pause (ms) between one label appearing and the next: quick, so the whole set reads as one sweep. */
const LABEL_STAGGER = 45;

interface View {
  yaw: number;
  pitch: number;
  zoom: number;
}

/**
 * What the browser has already told us about each artwork's shape, kept for the life of the page: coming back to a
 * breakdown (or scrolling it out of range and back) never has to load an image again just to learn its proportions,
 * so nothing shifts. Small (one number per picture) and cleared by closing the tab.
 */
const shapes = new Map<string, number>();

/** How far (px) beyond the screen a breakdown still keeps its pictures loaded; further away they are let go, so 30 big stacks never sit in memory at once. */
const KEEP_NEAR = 1800;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * One breakdown: the finished artwork, flat. Put the pointer on it (or tap it) and it falls apart into its layers, each
 * with a numbered line pointing to a label. Once apart it can be turned all the way round (drag, the arrow buttons or
 * the arrow keys), zoomed (the buttons, +/-, a pinch, or Ctrl + wheel) and shown full screen; "Reset" puts it back.
 */
export const ExplodeStage = memo(function ExplodeStage({
  item,
  index = 0,
  openSignal = 0,
  onOpenChange,
}: {
  item: Breakdown;
  /** Which breakdown this is (passed back to onOpenChange, so the page can hand every stage the same function). */
  index?: number;
  /** Changes when something outside (the portal's preview) asks for it to be shown taken apart. */
  openSignal?: number;
  onOpenChange?: (index: number, open: boolean) => void;
}) {
  const n = item.layers.length;
  const home: View = { yaw: TURNS[item.turn].yaw, pitch: TURNS[item.turn].pitch, zoom: 1 };
  const [open, setOpen] = useState(false);
  /** Once someone has clicked, dragged or used a control, moving the pointer away no longer closes it. */
  const [pinned, setPinned] = useState(false);
  const [view, setView] = useState<View>(home);
  const [spinning, setSpinning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** Layers switched off (click a numbered label), the layer being pointed at (the others dim), and how far apart they fall. */
  const [hidden, setHidden] = useState<number[]>([]);
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  const [spreadK, setSpreadK] = useState(1);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [aspect, setAspect] = useState(() => shapes.get(item.layers[0]?.image ?? "") ?? 4 / 3);
  /** Whether this breakdown is on or near the screen: only then are its pictures in the page. */
  const [near, setNear] = useState(index < 2); // the first two are in the page from the start, so there is never an empty flash
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const layerEls = useRef<(HTMLImageElement | null)[]>([]);
  /** The live view while a drag or spin is in progress (written straight to the page, committed to state when it ends). */
  const live = useRef<View>(home);
  const viewRef = useRef(view);
  const openRef = useRef(open);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, pinch: 0, zoom: 1 });

  useEffect(() => {
    viewRef.current = view;
    openRef.current = open;
  }, [view, open]);

  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      setPinned(true);
    }
  }, [openSignal]);
  useEffect(() => {
    onOpenChange?.(index, open);
  }, [open, index, onOpenChange]);
  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled);
    const on = () => setFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Keep the pictures only while the breakdown is on or near the screen (and always while it is open or full screen).
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((list) => setNear(list[list.length - 1].isIntersecting), { rootMargin: `${KEEP_NEAR}px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The stage takes the shape of the artwork (the first layer's canvas): looked up once, then remembered.
  const first = item.layers[0]?.image;
  useEffect(() => {
    if (!first || !near) return;
    const known = shapes.get(first);
    if (known) {
      setAspect(known);
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!img.naturalWidth) return;
      shapes.set(first, img.naturalWidth / img.naturalHeight);
      setAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = versionedSrc(first);
  }, [first, near]);
  const mounted = near || open || fullscreen;

  // The layers fan out sideways (the stack is turned nearly edge-on), and the whole stack shrinks to leave room: the
  // more layers, the smaller each one and the tighter the spacing, so everything stays inside the viewer.
  const w = size.w || 800;
  const gap = Math.max(40, Math.min(320, (w * 0.84) / (Math.max(1, n - 1) * 0.85))) * SPREADS[item.spread] * spreadK;
  const baseScale = n <= 2 ? 0.74 : n <= 3 ? 0.66 : n <= 5 ? 0.58 : n <= 9 ? 0.5 : n <= 16 ? 0.42 : 0.35;
  const zOf = (i: number) => (open ? (i - (n - 1) / 2) * gap : i * 0.4);

  const transformFor = useCallback((isOpen: boolean, v: View) => (isOpen ? `scale(${baseScale * v.zoom}) rotateX(${v.pitch}deg) rotateY(${v.yaw}deg)` : `scale(${v.zoom})`), [baseScale]);

  // ── the view: turning, zooming, resetting ───────────────────────────────────────────────────────────────────
  const atHome = Math.abs(view.yaw - home.yaw) < 0.5 && Math.abs(view.pitch - home.pitch) < 0.5 && view.zoom === 1;
  const touched = useCallback(() => setPinned(true), []);
  const turn = useCallback(
    (dYaw: number, dPitch = 0) => {
      setSpinning(false);
      setOpen(true);
      touched();
      setView((v) => ({ ...v, yaw: v.yaw + dYaw, pitch: clamp(v.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT) }));
    },
    [touched],
  );
  const zoomBy = useCallback(
    (factor: number) => {
      touched();
      setView((v) => ({ ...v, zoom: clamp(+(v.zoom * factor).toFixed(3), ZOOM_MIN, ZOOM_MAX) }));
    },
    [touched],
  );
  const reset = useCallback(() => {
    setSpinning(false);
    setHidden([]);
    setFocusLayer(null);
    setSpreadK(1);
    setView({ yaw: TURNS[item.turn].yaw, pitch: TURNS[item.turn].pitch, zoom: 1 });
  }, [item.turn]);
  /** Jump to one of the ready-made angles. */
  const goView = useCallback(
    (yaw: number, pitch: number) => {
      setSpinning(false);
      setOpen(true);
      touched();
      setView((v) => ({ ...v, yaw, pitch }));
    },
    [touched],
  );
  const toggleLayer = useCallback((i: number) => setHidden((h) => (h.includes(i) ? h.filter((x) => x !== i) : [...h, i])), []);
  const collapse = useCallback(() => {
    reset();
    setPinned(false);
    setOpen(false);
  }, [reset]);
  const toggleSpin = useCallback(() => {
    touched();
    setOpen(true);
    setSpinning((s) => !s);
  }, [touched]);
  const toggleOpen = useCallback(() => {
    if (openRef.current && pinned) collapse();
    else {
      setOpen(true);
      setPinned(true);
    }
  }, [pinned, collapse]);

  // Closing for any reason (including the pointer leaving) puts the view back the way it was.
  useEffect(() => {
    if (!open) {
      setHidden([]);
      setFocusLayer(null);
      setSpreadK(1);
      setSpinning(false);
      setView({ yaw: TURNS[item.turn].yaw, pitch: TURNS[item.turn].pitch, zoom: 1 });
    }
  }, [open, item.turn]);
  // …and so does choosing another viewing angle for this breakdown in the portal.
  useEffect(() => {
    setView((v) => ({ ...v, yaw: TURNS[item.turn].yaw, pitch: TURNS[item.turn].pitch }));
  }, [item.turn]);

  // Turning by itself: written straight to the page every frame; the state catches up when it stops.
  useEffect(() => {
    if (!spinning || !open) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSpinning(false);
      return;
    }
    live.current = { ...viewRef.current };
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      live.current.yaw += ((now - last) / 1000) * SPIN_SPEED;
      last = now;
      if (stack.current) stack.current.style.transform = transformFor(true, live.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setView({ ...live.current });
    };
  }, [spinning, open, transformFor]);

  // ── pointer: hover to open, drag to turn, pinch to zoom, click to pin ────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-stage-ui]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.current?.setPointerCapture(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false;
      g.startX = e.clientX;
      g.startY = e.clientY;
      live.current = { ...viewRef.current };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.zoom = viewRef.current.zoom;
      g.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const g = gesture.current;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      live.current.zoom = clamp(g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.pinch), ZOOM_MIN, ZOOM_MAX);
    } else {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_SLOP) return;
      if (!g.moved) {
        g.moved = true;
        setSpinning(false);
        setDragging(true);
        if (!openRef.current) setOpen(true);
        touched();
      }
      live.current.yaw += (e.clientX - prev.x) * 0.45;
      live.current.pitch = clamp(live.current.pitch - (e.clientY - prev.y) * 0.3, -PITCH_LIMIT, PITCH_LIMIT);
    }
    if (g.moved && stack.current) stack.current.style.transform = transformFor(true, live.current);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // One finger of a pinch lifted: carry on turning with the other from where it is now.
      g.startX = [...pointers.current.values()][0].x;
      return;
    }
    if (g.moved) {
      setDragging(false);
      setView({ ...live.current });
      touched();
    } else if (e.pointerType === "touch" || e.pointerType === "pen" || e.button === 0) {
      toggleOpen(); // a click or a tap
    }
  };

  // Ctrl + wheel (and a trackpad pinch) zooms; a plain wheel still scrolls the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setOpen(true);
      zoomBy(Math.exp(-e.deltaY * 0.0025));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if ((ev.target as HTMLElement).closest("[data-stage-ui]")) return;
    const k = ev.key;
    if (k === "Enter" || k === " ") toggleOpen();
    else if (k === "Escape") collapse();
    else if (k === "ArrowLeft") turn(-15);
    else if (k === "ArrowRight") turn(15);
    else if (k === "ArrowUp") turn(0, 10);
    else if (k === "ArrowDown") turn(0, -10);
    else if (k === "+" || k === "=") zoomBy(1.2);
    else if (k === "-" || k === "_") zoomBy(1 / 1.2);
    else if (k === "0") reset();
    else return;
    ev.preventDefault();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.current?.requestFullscreen?.().catch(() => {});
  };

  // ── the label lines ──────────────────────────────────────────────────────────────────────────────────────────
  // The stage's size (it follows the column and the screen).
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const read = () => setSize((s) => (Math.abs(s.w - el.offsetWidth) < 0.5 && Math.abs(s.h - el.offsetHeight) < 0.5 ? s : { w: el.offsetWidth, h: el.offsetHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Where each layer will END UP on screen, worked out from the transform itself rather than measured once it has
  // moved: so the labels can start the instant the layers do, instead of waiting for them to settle. (Same maths the
  // browser does: turn, scale, then the perspective of the viewer.)
  const { points, rowOf } = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const { w: sw, h: sh } = size;
    if (!sw || !sh) return { points: pts, rowOf: [] as number[] };
    const p = (TURNS[item.turn].pitch * Math.PI) / 180;
    const y = (TURNS[item.turn].yaw * Math.PI) / 180;
    const g = Math.max(40, Math.min(320, (sw * 0.84) / (Math.max(1, n - 1) * 0.85))) * SPREADS[item.spread] * spreadK;
    for (let i = 0; i < n; i++) {
      const z0 = (i - (n - 1) / 2) * g;
      const ly = -sh * 0.3; // a point a fifth of the way down the layer
      // rotateY, then rotateX, then scale
      const x1 = z0 * Math.sin(y);
      const z1 = z0 * Math.cos(y);
      const y2 = ly * Math.cos(p) - z1 * Math.sin(p);
      const z2 = ly * Math.sin(p) + z1 * Math.cos(p);
      const k = baseScale;
      const depth = PERSPECTIVE / (PERSPECTIVE - z2 * k);
      pts.push({ x: sw / 2 + x1 * k * depth, y: sh * 0.4 + (y2 * k + sh * 0.1) * depth });
    }

    // Give each label the first row where it doesn't run into one already there.
    const small = sw < 640;
    const widthOf = (i: number) => (small ? 7.6 : 9.4) * (item.layers[i]?.label || `Layer ${i + 1}`).length + (small ? 42 : 50);
    const centre = (i: number) => Math.min(Math.max(pts[i].x, 64), Math.max(64, sw - 64));
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
    return { points: pts, rowOf: rows };
  }, [size, n, item.turn, item.spread, item.layers, baseScale, spreadK]);

  // The numbered lines only make sense from the starting angle: turning or zooming hides them, Reset brings them back.
  const labelsOn = open && atHome && !dragging && !spinning && item.labels && points.length === n;
  const linesShown = labelsOn;
  const live3d = dragging || spinning;

  return (
    <div ref={wrap} className={styles.wrap} data-fullscreen={fullscreen} style={{ "--aspect": String(aspect) } as React.CSSProperties}>
      {/* The controls: always visible, so the ways of moving the design never have to be guessed. */}
      {n > 0 && (
        <div className={styles.bar} role="toolbar" aria-label={`Controls for ${item.title}`} data-stage-ui>
          <button type="button" className={styles.btnMain} onClick={toggleOpen} aria-pressed={open} title={open ? "Put the layers back together" : "Take the design apart into layers"}>
            {open ? "Close layers" : "Show layers"}
          </button>
          <span className={styles.group} role="group" aria-label="Turn">
            <button type="button" onClick={() => turn(-45)} aria-label="Turn left" title="Turn left (←)">
              ⟲
            </button>
            <button type="button" onClick={toggleSpin} aria-pressed={spinning} aria-label={spinning ? "Stop turning" : "Turn all the way round"} title={spinning ? "Stop turning" : "Turn all the way round"}>
              {spinning ? "❚❚" : "360°"}
            </button>
            <button type="button" onClick={() => turn(45)} aria-label="Turn right" title="Turn right (→)">
              ⟳
            </button>
          </span>
          <span className={styles.group} role="group" aria-label="Zoom">
            <button type="button" onClick={() => zoomBy(1 / 1.25)} disabled={view.zoom <= ZOOM_MIN} aria-label="Zoom out" title="Zoom out (−)">
              −
            </button>
            <output className={styles.zoomValue} aria-live="polite">
              {Math.round(view.zoom * 100)}%
            </output>
            <button type="button" onClick={() => zoomBy(1.25)} disabled={view.zoom >= ZOOM_MAX} aria-label="Zoom in" title="Zoom in (+)">
              +
            </button>
          </span>
          <button type="button" onClick={reset} disabled={atHome && !spinning && spreadK === 1 && hidden.length === 0} title="Back to the starting view (0)">
            Reset
          </button>
          {canFullscreen && (
            <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen} title={fullscreen ? "Leave full screen" : "Full screen"}>
              {fullscreen ? "Exit full screen" : "Full screen"}
            </button>
          )}
        </div>
      )}
      {n > 1 && open && (
        <div className={styles.bar2} role="toolbar" aria-label={`More controls for ${item.title}`} data-stage-ui>
          <span className={styles.group} role="group" aria-label="Look from">
            {VIEWS.map(([key, name, v]) => (
              <button key={key} type="button" onClick={() => goView(v.yaw, v.pitch)} aria-pressed={Math.abs(view.yaw - v.yaw) < 0.5 && Math.abs(view.pitch - v.pitch) < 0.5} title={`Look from the ${name.toLowerCase()}`}>
                {name}
              </button>
            ))}
          </span>
          <label className={styles.spread}>
            <span>Spread</span>
            <input type="range" min={SPREAD_MIN} max={SPREAD_MAX} step={0.05} value={spreadK} onChange={(e) => setSpreadK(Number(e.target.value))} aria-label="How far apart the layers are" />
          </label>
          <button type="button" onClick={() => setHidden([])} disabled={hidden.length === 0} title="Switch every layer back on">
            {hidden.length ? `Show all layers (${hidden.length} off)` : "All layers on"}
          </button>
          <span className={styles.tipText}>Click a numbered label to switch that layer off or on</span>
        </div>
      )}

      <div
        ref={stage}
        className={styles.stage}
        style={{ marginTop: labelsOn ? 20 + (Math.max(0, ...rowOf) + 1) * TAG_ROW : undefined }}
        data-open={open}
        data-live={live3d}
        data-zoomed={view.zoom > 1}
        data-heavy={n > 8}
        role="group"
        tabIndex={0}
        aria-roledescription="3D viewer"
        aria-label={`${item.title}: ${open ? "layers shown. Arrow keys turn it, plus and minus zoom, 0 resets, Escape closes" : "press Enter to show the layers"}`}
        onPointerEnter={(e) => e.pointerType === "mouse" && !pinned && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && !pointers.current.size && setOpen(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (gesture.current.moved && pointers.current.size === 0) {
            setDragging(false);
            setView({ ...live.current });
          }
        }}
        onKeyDown={onKeyDown}
      >
        <div className={styles.viewport}>
          <div ref={stack} className={styles.stack} style={{ transform: transformFor(open, view) }}>
            {mounted && item.layers.map((layer, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- transparent layer PNGs stacked in 3D
              <img
                key={`${layer.image}-${i}`}
                ref={(el) => {
                  layerEls.current[i] = el;
                }}
                src={versionedSrc(layer.image)}
                alt={layer.label || `Layer ${i + 1}`}
                draggable={false}
                decoding="async"
                loading="lazy"
                className={styles.layer}
                style={{
                  opacity: hidden.includes(i) ? 0.06 : focusLayer !== null && focusLayer !== i ? 0.3 : 1,
                  transform: `translateZ(${zOf(i)}px)`,
                  transitionDelay: open && !live3d ? `${Math.min(i * 22, 360)}ms` : `${Math.min((n - 1 - i) * 14, 240)}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Numbered lines from each layer down to its label. */}
        <div className={styles.labels} data-on={linesShown} aria-hidden={!linesShown} hidden={!item.labels}>
          <svg className={styles.lines} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
            {points.map((pt, i) => {
              const row = rowOf[i] ?? 0;
              const tagBottom = -(14 + row * TAG_ROW);
              return (
                <g key={i} style={{ transitionDelay: linesShown ? `${i * LABEL_STAGGER}ms` : "0ms" }}>
                  <line x1={pt.x} y1={tagBottom} x2={pt.x} y2={pt.y} />
                  <circle cx={pt.x} cy={pt.y} r="4" />
                </g>
              );
            })}
          </svg>
          {points.map((pt, i) => {
            const row = rowOf[i] ?? 0;
            const x = Math.min(Math.max(pt.x, 64), Math.max(64, size.w - 64));
            return (
              <button
                key={i}
                type="button"
                data-stage-ui
                className={styles.tag}
                data-off={hidden.includes(i)}
                aria-pressed={!hidden.includes(i)}
                title={hidden.includes(i) ? "Switch this layer back on" : "Switch this layer off"}
                style={{ left: x, top: -(14 + row * TAG_ROW + TAG_H), transitionDelay: linesShown ? `${i * LABEL_STAGGER}ms` : "0ms" }}
                onPointerEnter={() => setFocusLayer(i)}
                onPointerLeave={() => setFocusLayer(null)}
                onFocus={() => setFocusLayer(i)}
                onBlur={() => setFocusLayer(null)}
                onClick={() => toggleLayer(i)}
              >
                <b>{i + 1}</b>
                <span>{item.layers[i]?.label || `Layer ${i + 1}`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
