"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Breakdown } from "@/lib/content/types";
import { resizedSrc, srcSetFor, versionedSrc } from "@/lib/images";
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
const SPREAD_MAX = 2.4;

/** Zoom is free over a wide range; nothing clips the picture while it grows, and "Move" slides it anywhere. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const PITCH_LIMIT = 80;
/** Degrees per second while the stack turns by itself. */
const SPIN_SPEED = 28;
/** A pointer must travel this far (px) before a press counts as a drag rather than a click. */
const DRAG_SLOP = 6;
/** The labels sit in rows above the artwork: each row is this tall (px). */
const TAG_ROW = 38;
/** How far the viewer is from the stack (matches the CSS perspective). */
const PERSPECTIVE = 1500;
/** The pause (ms) between one label appearing and the next: quick, so the whole set reads as one sweep. */
const LABEL_STAGGER = 14;
/** After the pointer leaves, how long (ms) before an unpinned stack closes: moving across a gap never flickers it. */
const CLOSE_DELAY = 280;
/** The easing the layers use; the labels use the same, so they glide together. */
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

interface View {
  yaw: number;
  pitch: number;
  zoom: number;
  /** How far the picture has been slid (px), in any direction. */
  panX: number;
  panY: number;
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
const homeView = (turn: Breakdown["turn"]): View => ({ yaw: TURNS[turn].yaw, pitch: TURNS[turn].pitch, zoom: 1, panX: 0, panY: 0 });

/**
 * One breakdown: the finished artwork, flat. Put the pointer on it (or tap it) and it falls apart into its layers, each
 * with a numbered line pointing to a label. Once apart it can be turned all the way round (drag, the arrow buttons or
 * the arrow keys), zoomed as far as you like (the buttons, +/-, a pinch, or Ctrl + wheel), slid anywhere ("Move", or
 * Shift + drag), and shown full screen. Nothing is clipped at the edge of the frame; "Reset" puts it all back.
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
  const home = homeView(item.turn);
  const [open, setOpen] = useState(false);
  /** Once someone has clicked, dragged or used a control, moving the pointer away no longer closes it. */
  const [pinned, setPinned] = useState(false);
  const [view, setView] = useState<View>(home);
  const [spinning, setSpinning] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** What a plain drag does: turn the stack, or slide it. */
  const [dragMode, setDragMode] = useState<"turn" | "move">("turn");
  const [fullscreen, setFullscreen] = useState(false);
  /** Layers switched off (click a numbered label), the layer being pointed at (the others dim), and how far apart they fall. */
  const [hidden, setHidden] = useState<number[]>([]);
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  const [spreadK, setSpreadK] = useState(1);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [aspect, setAspect] = useState(() => shapes.get(item.layers[0]?.image ?? "") ?? 4 / 3);
  /** Whether this breakdown is on or near the screen: only then are its pictures in the page. */
  const [near, setNear] = useState(index < 2); // the first two are in the page from the start, so there is never an empty flash
  /** The stage's size, and the width of the whole column it sits in (the layers fan out across the column, not just the stage). */
  const [size, setSize] = useState({ w: 0, h: 0, col: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  /** The live view while a drag or spin is in progress (written straight to the page, committed to state when it ends). */
  const live = useRef<View>(home);
  const viewRef = useRef(view);
  const openRef = useRef(open);
  const pinnedRef = useRef(pinned);
  const dragModeRef = useRef(dragMode);
  const closeTimer = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, pan: false, startX: 0, startY: 0, pinch: 0, zoom: 1, cx: 0, cy: 0 });

  useEffect(() => {
    viewRef.current = view;
    openRef.current = open;
    pinnedRef.current = pinned;
    dragModeRef.current = dragMode;
  }, [view, open, pinned, dragMode]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

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
    img.src = resizedSrc(first, 64); // only its proportions are needed, not the whole picture
  }, [first, near]);
  const mounted = near || open || fullscreen;

  // The layers fan out sideways (the stack is turned nearly edge-on). How far is worked out from the width of the
  // whole column, not the stage: a tall poster makes a narrow stage, and the layers must still be free to spread out
  // across the page beside it.
  const colW = size.col || size.w || 800;
  const gap = Math.max(40, Math.min(360, (colW * 0.84) / (Math.max(1, n - 1) * 0.85))) * SPREADS[item.spread] * spreadK;
  const baseScale = n <= 2 ? 0.86 : n <= 3 ? 0.78 : n <= 5 ? 0.7 : n <= 9 ? 0.64 : n <= 16 ? 0.58 : 0.48;
  const zOf = (i: number) => (open ? (i - (n - 1) / 2) * gap : i * 0.4);

  const transformFor = useCallback(
    (isOpen: boolean, v: View) => `translate(${v.panX}px, ${v.panY}px) ` + (isOpen ? `scale(${baseScale * v.zoom}) rotateX(${v.pitch}deg) rotateY(${v.yaw}deg)` : `scale(${v.zoom})`),
    [baseScale],
  );

  // ── the view: turning, zooming, sliding, resetting ──────────────────────────────────────────────────────────
  const atHome = Math.abs(view.yaw - home.yaw) < 0.5 && Math.abs(view.pitch - home.pitch) < 0.5 && view.zoom === 1 && view.panX === 0 && view.panY === 0;
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
  const slide = useCallback(
    (dx: number, dy: number) => {
      touched();
      setView((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
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
    setView(homeView(item.turn));
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
    if (openRef.current && pinnedRef.current) collapse();
    else {
      setOpen(true);
      setPinned(true);
    }
  }, [collapse]);

  // Closing for any reason (including the pointer leaving) puts the view back the way it was.
  useEffect(() => {
    if (!open) {
      setHidden([]);
      setFocusLayer(null);
      setSpreadK(1);
      setSpinning(false);
      setDragMode("turn");
      setView(homeView(item.turn));
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

  // ── hover: the whole viewer (controls and stage) is one zone, and closing waits a moment, so crossing the gap
  //    between the controls and the picture never makes it flicker ───────────────────────────────────────────────
  const onZoneEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    if (!pinnedRef.current && !openRef.current) setOpen(true);
  };
  const onZoneLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!pinnedRef.current && pointers.current.size === 0) setOpen(false);
    }, CLOSE_DELAY);
  };

  // ── pointer: drag to turn (or slide), pinch to zoom, click to pin ────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-stage-ui]")) return;
    if (e.button === 1) e.preventDefault(); // middle button slides, it must not start the browser's auto-scroll
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.current?.setPointerCapture(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false;
      g.pan = dragModeRef.current === "move" || e.shiftKey || e.button === 1;
      g.startX = e.clientX;
      g.startY = e.clientY;
      live.current = { ...viewRef.current };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.zoom = viewRef.current.zoom;
      g.cx = (a.x + b.x) / 2;
      g.cy = (a.y + b.y) / 2;
      g.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const g = gesture.current;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Two fingers: spread to zoom, and move together to slide.
      const [a, b] = [...pointers.current.values()];
      live.current.zoom = clamp(g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.pinch), ZOOM_MIN, ZOOM_MAX);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      live.current.panX += cx - g.cx;
      live.current.panY += cy - g.cy;
      g.cx = cx;
      g.cy = cy;
    } else {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_SLOP) return;
      if (!g.moved) {
        g.moved = true;
        setSpinning(false);
        setDragging(true);
        if (!openRef.current) setOpen(true);
        touched();
      }
      if (g.pan) {
        live.current.panX += e.clientX - prev.x;
        live.current.panY += e.clientY - prev.y;
      } else {
        live.current.yaw += (e.clientX - prev.x) * 0.45;
        live.current.pitch = clamp(live.current.pitch - (e.clientY - prev.y) * 0.3, -PITCH_LIMIT, PITCH_LIMIT);
      }
    }
    if (g.moved && stack.current) stack.current.style.transform = transformFor(true, live.current);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // One finger of a pinch lifted: carry on with the other from where it is now.
      const rest = [...pointers.current.values()][0];
      g.startX = rest.x;
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

  // Ctrl + wheel (and a trackpad pinch) zooms; in full screen a plain wheel zooms too (there is no page to scroll).
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || document.fullscreenElement === wrap.current)) return;
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
    const arrow = k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown";
    if (arrow && ev.shiftKey) slide(k === "ArrowLeft" ? -40 : k === "ArrowRight" ? 40 : 0, k === "ArrowUp" ? -40 : k === "ArrowDown" ? 40 : 0);
    else if (k === "Enter" || k === " ") toggleOpen();
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
  // The stage's size, and the column's.
  useEffect(() => {
    const el = stage.current;
    const col = wrap.current;
    if (!el || !col) return;
    const read = () =>
      setSize((s) => {
        const next = { w: el.offsetWidth, h: el.offsetHeight, col: col.clientWidth };
        return Math.abs(s.w - next.w) < 0.5 && Math.abs(s.h - next.h) < 0.5 && Math.abs(s.col - next.col) < 0.5 ? s : next;
      });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(col);
    return () => ro.disconnect();
  }, []);

  // Where each layer will END UP on screen, worked out from the transform itself rather than measured once it has
  // moved: so the labels can start the instant the layers do, instead of waiting for them to settle. (Same maths the
  // browser does: turn, scale, then the perspective of the viewer.)
  const { points, rowOf, centres } = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const { w: sw, h: sh } = size;
    const half = (size.col || sw) / 2;
    if (!sw || !sh) return { points: pts, rowOf: [] as number[], centres: [] as number[] };
    const p = (TURNS[item.turn].pitch * Math.PI) / 180;
    const y = (TURNS[item.turn].yaw * Math.PI) / 180;
    const g = Math.max(40, Math.min(360, ((size.col || sw) * 0.84) / (Math.max(1, n - 1) * 0.85))) * SPREADS[item.spread] * spreadK;
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
    // Each label is placed by its whole width (long names are capped, see .tag span), so none runs off the column.
    const small = sw < 640;
    const widthOf = (i: number) => Math.min(small ? 230 : 330, (small ? 8.6 : 10.4) * (item.layers[i]?.label || `Layer ${i + 1}`).length + (small ? 46 : 54));
    const left = sw / 2 - half + 8;
    const right = sw / 2 + half - 8;
    const cs = pts.map((pt, i) => {
      const w = widthOf(i);
      return right - left <= w ? (left + right) / 2 : Math.min(Math.max(pt.x, left + w / 2), right - w / 2);
    });
    const centre = (i: number) => cs[i];
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
    return { points: pts, rowOf: rows, centres: cs };
  }, [size, n, item.turn, item.spread, item.layers, baseScale, spreadK]);

  // The numbered lines only make sense from the starting angle: turning, zooming or sliding hides them, Reset brings them back.
  const hasLabels = item.labels && points.length === n;
  const labelsOn = open && atHome && !dragging && !spinning && hasLabels;
  const live3d = dragging || spinning;
  /** Room kept above the picture for the labels, always (open or closed, turning or still), so the picture never hops when it opens. */
  const labelSpace = hasLabels ? 14 + (Math.max(0, ...rowOf) + 1) * TAG_ROW : 0;

  return (
    <div
      ref={wrap}
      className={styles.wrap}
      data-fullscreen={fullscreen}
      style={{ "--aspect": String(aspect) } as React.CSSProperties}
      onPointerEnter={onZoneEnter}
      onPointerLeave={onZoneLeave}
    >
      {/* The controls: always visible (they stay at the top of the screen while this breakdown is in view), so the ways of moving the design never have to be guessed. */}
      <div className={styles.controls}>
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
          <button
            type="button"
            onClick={() => {
              setDragMode((m) => (m === "move" ? "turn" : "move"));
              touched();
            }}
            aria-pressed={dragMode === "move"}
            title={dragMode === "move" ? "Dragging slides the picture. Press to go back to turning it." : "Press, then drag to slide the picture anywhere (or hold Shift while dragging)"}
          >
            ✥ Move
          </button>
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
      {/* The second row keeps its place while closed, so opening never pushes the picture down from under the pointer. */}
      {n > 1 && (
        <div className={styles.bar2} role="toolbar" aria-label={`More controls for ${item.title}`} data-stage-ui data-on={open}>
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
      </div>

      <div
        ref={stage}
        className={styles.stage}
        style={{ marginTop: labelSpace || undefined }}
        data-open={open}
        data-live={live3d}
        data-mode={dragMode}
        data-heavy={n > 8}
        role="group"
        tabIndex={0}
        aria-roledescription="3D viewer"
        aria-label={`${item.title}: ${open ? "layers shown. Arrow keys turn it, Shift and arrows slide it, plus and minus zoom, 0 resets, Escape closes" : "press Enter to show the layers"}`}
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
            {mounted &&
              item.layers.map((layer, i) => (
                <Fragment key={`${layer.image}-${i}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- transparent layer PNGs stacked in 3D */}
                  <img
                    src={versionedSrc(layer.image)}
                    srcSet={srcSetFor(layer.image, [640, 1080, 1600, 2400])}
                    sizes="(max-width: 700px) 100vw, 1100px"
                    alt={layer.label || `Layer ${i + 1}`}
                    draggable={false}
                    decoding="async"
                    loading="lazy"
                    className={styles.layer}
                    style={{
                      opacity: hidden.includes(i) ? 0.06 : focusLayer !== null && focusLayer !== i ? 0.3 : 1,
                      transform: `translateZ(${zOf(i)}px)`,
                      transitionDelay: open && !live3d ? `${Math.min(i * 12, 140)}ms` : `${Math.min((n - 1 - i) * 10, 120)}ms`,
                    }}
                  />
                  {/* The layer's back. From behind, the picture would show mirrored; this shows its shape in dark grey instead. */}
                  <span
                    className={styles.layerBack}
                    aria-hidden="true"
                    style={{
                      maskImage: `url("${resizedSrc(layer.image, 1280)}")`,
                      WebkitMaskImage: `url("${resizedSrc(layer.image, 1280)}")`,
                      opacity: hidden.includes(i) ? 0.06 : focusLayer !== null && focusLayer !== i ? 0.3 : 1,
                      transform: `translateZ(${zOf(i)}px) rotateY(180deg)`,
                      transitionDelay: open && !live3d ? `${Math.min(i * 12, 140)}ms` : `${Math.min((n - 1 - i) * 10, 120)}ms`,
                    }}
                  />
                </Fragment>
              ))}
          </div>
        </div>

        {/* One callout per layer: a numbered label above, a dotted line down, a dot on the layer. The three are one
            piece that glides with the layers, so they stay lined up while the layers spread, and the label stays
            centred over its line (it only slides sideways to stay on screen). */}
        <div className={styles.labels} data-on={labelsOn} aria-hidden={!labelsOn} hidden={!item.labels}>
          {points.map((pt, i) => {
            const row = rowOf[i] ?? 0;
            const top = -(12 + row * TAG_ROW);
            const shift = (centres[i] ?? pt.x) - pt.x;
            const d = open && !live3d ? Math.min(i * 12, 140) : 0;
            // The line runs from the middle of the label down to the dot: straight down normally, and at an angle when
            // the label has been held in from the edge of the screen, so the two are always joined.
            const h = Math.max(0, pt.y - top);
            const len = Math.hypot(shift, h);
            const angle = len ? (Math.asin(shift / len) * 180) / Math.PI : 0;
            const glide = `0.5s ${EASE} ${d}ms`;
            return (
              <div
                key={i}
                className={styles.callout}
                style={
                  {
                    left: pt.x,
                    top,
                    height: Math.max(0, pt.y - top),
                    "--shift": `${shift}px`,
                    transition: `left 0.5s ${EASE} ${d}ms, top 0.5s ${EASE} ${d}ms, height 0.5s ${EASE} ${d}ms, opacity 0.16s ease ${labelsOn ? i * LABEL_STAGGER : 0}ms`,
                  } as React.CSSProperties
                }
              >
                <i className={styles.calloutLine} style={{ left: shift, height: len, transform: `rotate(${angle}deg)`, transition: `left ${glide}, height ${glide}, transform ${glide}` }} />
                <i className={styles.calloutDot} />
                <button
                  type="button"
                  data-stage-ui
                  className={styles.tag}
                  data-off={hidden.includes(i)}
                  aria-pressed={!hidden.includes(i)}
                  title={`${item.layers[i]?.label || `Layer ${i + 1}`}: ${hidden.includes(i) ? "click to switch it back on" : "click to switch it off"}`}
                  onPointerEnter={() => setFocusLayer(i)}
                  onPointerLeave={() => setFocusLayer(null)}
                  onFocus={() => setFocusLayer(i)}
                  onBlur={() => setFocusLayer(null)}
                  onClick={() => toggleLayer(i)}
                  style={{ transition: `transform ${glide}, border-color 0.2s ease` }}
                >
                  <b>{i + 1}</b>
                  <span>{item.layers[i]?.label || `Layer ${i + 1}`}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
