"use client";

import { useEffect, useRef, useState } from "react";
import { cleanEffectOptions, PARTICLE_DEFAULTS, type TextEffectOptions } from "@/lib/content/text-effects";
import styles from "./ParticleText.module.css";

/** A small hover area and just enough canvas space for the gentle scatter and glow. */
const REACH = 85;
const MARGIN = 24;
/** Never more dots than this for one word, whatever its size. */
const MAX_DOTS = 2600;
// Oversized editable headings stay readable as ordinary text instead of allocating huge canvases.
const MAX_SURFACE_PIXELS = 2_000_000;
const MAX_SURFACE_SIDE = 4096;

interface Dot {
  hx: number;
  hy: number;
  x: number;
  y: number;
  /** Fixed random offsets: each dot drifts slightly in its own direction, never orbits the pointer. */
  driftX: number;
  driftY: number;
  /** A little variety in how bright and how big each dot is. */
  seed: number;
}

/** One soft round glow, drawn once and stamped for every dot (far cheaper than a shadow on each). */
function glowSprite(color: string) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, "0.28)"));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * A word made of dots. The dots are the word's own letters (sampled from the text as the page shows it, in its own font,
 * size and colour). Put the pointer near and they scatter gently in random directions with a soft glow;
 * take it away and every dot eases back home. Falls back to plain text for visitors who ask for less motion.
 *
 *   <ParticleText>cinematic</ParticleText>
 *
 * Where it is used: wrap words in [[double brackets]] in the portal (see renderFx) and render them with renderFx().
 */
export function ParticleText({ children, color, options }: { children: string; color?: string; options?: TextEffectOptions }) {
  const word = String(children);
  const settings = cleanEffectOptions(options);
  const particleColor = settings.particleColor;
  const dotSize = settings.particleSize ?? PARTICLE_DEFAULTS.particleSize;
  const scatter = settings.particleScatter ?? PARTICLE_DEFAULTS.particleScatter;
  const speed = settings.particleSpeed ?? PARTICLE_DEFAULTS.particleSpeed;
  const glow = settings.particleGlow ?? PARTICLE_DEFAULTS.particleGlow;
  const renderKey = JSON.stringify([word, color, particleColor, dotSize, scatter, speed, glow]);
  const wrap = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** True once the dots are drawn: until then (and without canvas support or with reduced motion) the plain text shows. */
  const [liveWord, setLiveWord] = useState<string | null>(null);
  /** True only while the dots are showing (the pointer is on the word, and until they have settled again); otherwise the word is plain text. */
  const [activeWord, setActiveWord] = useState<string | null>(null);
  // Editing a highlighted word must immediately reveal its new text while its new canvas is prepared.
  const live = liveWord === renderKey;
  const active = activeWord === renderKey && live;

  useEffect(() => {
    const host = wrap.current;
    const text = ghost.current;
    const cv = canvas.current;
    if (!host || !text || !cv) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let dots: Dot[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let sprite: HTMLCanvasElement | null = null;
    let radius = 1;
    let coreColor = "#fff6e2";
    let raf = 0;
    let lastFrame = 0;
    let warp = 0;
    let hovering = false;
    let shown = false;
    const show = (on: boolean) => {
      if (shown === on) return;
      shown = on;
      if (!disposed) setActiveWord(on ? renderKey : null);
    };
    let px = -9999;
    let py = -9999;
    let visible = false;
    let disposed = false;
    let fontsReady = false;
    let builtKey = "";
    let touchTimer = 0;
    let pointerFrame = 0;
    let lastPointer: PointerEvent | null = null;

    /** Reads the word's look from the page and turns its pixels into dots. */
    function build() {
      if (disposed || !visible || document.hidden || motion.matches || !fontsReady) return;
      const rect = text!.getBoundingClientRect();
      w = Math.max(1, Math.ceil(rect.width));
      h = Math.max(1, Math.ceil(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cs = getComputedStyle(text!);
      const surfaceWidth = Math.ceil((w + MARGIN * 2) * dpr);
      const surfaceHeight = Math.ceil((h + MARGIN * 2) * dpr);
      if (rect.width <= 0 || rect.height <= 0 || surfaceWidth > MAX_SURFACE_SIDE || surfaceHeight > MAX_SURFACE_SIDE || surfaceWidth * surfaceHeight > MAX_SURFACE_PIXELS) {
        release();
        return;
      }
      const key = [w, h, dpr, cs.font, cs.letterSpacing, cs.color].join("|");
      if (key === builtKey) return;
      const fontSize = parseFloat(cs.fontSize) || 40;
      const gap = Math.min(6, Math.max(2.6, fontSize / 15));

      // The word, drawn on a hidden canvas exactly as the page draws it, then read back pixel by pixel.
      const off = document.createElement("canvas");
      off.width = Math.ceil(w * dpr);
      off.height = Math.ceil(h * dpr);
      const og = off.getContext("2d", { willReadFrequently: true });
      if (!og) { release(); return; }
      og.scale(dpr, dpr);
      og.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      og.textBaseline = "alphabetic";
      og.fillStyle = "#fff";
      const spacing = parseFloat(cs.letterSpacing);
      if (Number.isFinite(spacing) && "letterSpacing" in og) (og as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
      const m = og.measureText(word);
      const ascent = m.actualBoundingBoxAscent || fontSize * 0.8;
      const descent = m.actualBoundingBoxDescent || fontSize * 0.2;
      og.fillText(word, 0, (h - (ascent + descent)) / 2 + ascent);
      const data = og.getImageData(0, 0, off.width, off.height).data;

      let step = gap;
      let list: Dot[] = [];
      for (let tries = 0; tries < 4; tries++) {
        list = [];
        for (let y = step / 2; y < h; y += step) {
          for (let x = step / 2; x < w; x += step) {
            const i = (Math.floor(y * dpr) * off.width + Math.floor(x * dpr)) * 4 + 3;
            if (data[i] > 110) list.push({ hx: x, hy: y, x, y, driftX: (Math.random() * 2 - 1) * scatter, driftY: (Math.random() * 2 - 1) * scatter, seed: Math.random() });
          }
        }
        if (list.length <= MAX_DOTS) break;
        step *= 1.25; // a very large word: fewer, slightly sparser dots
      }
      // Finer pinpoints without adding particles or increasing the canvas budget.
      radius = Math.min(0.7, step * 0.16) * dotSize;
      // Keep a hard bound even for unusually dense fonts after the sampling retries.
      dots = list.length <= MAX_DOTS ? list : Array.from({ length: MAX_DOTS }, (_, i) => list[Math.floor(i * list.length / MAX_DOTS)]);
      off.width = off.height = 0;

      // Leave a little room around the letters for the subtle scatter.
      cv!.style.left = `${-MARGIN}px`;
      cv!.style.top = `${-MARGIN}px`;
      cv!.style.width = `${w + MARGIN * 2}px`;
      cv!.style.height = `${h + MARGIN * 2}px`;
      cv!.width = surfaceWidth;
      cv!.height = surfaceHeight;
      // The glow takes the word's own colour; a word painted with a gradient has no single colour, so the site's gold is used.
      const c = cs.color.match(/[\d.]+/g) ?? [];
      const solid = c.length >= 3 && (c.length < 4 || Number(c[3]) > 0.2) && (!!color || Number(c[0]) + Number(c[1]) + Number(c[2]) > 60);
      const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold-bright").trim() || "#ffd37a";
      // Read one pixel to normalize CSS colours safely, including rgba and wide-gamut colours.
      off.width = off.height = 1;
      og.fillStyle = particleColor ?? (solid ? cs.color : gold);
      og.fillRect(0, 0, 1, 1);
      const [red, green, blue] = og.getImageData(0, 0, 1, 1).data;
      off.width = off.height = 0;
      coreColor = `rgb(${red},${green},${blue})`;
      if (sprite) sprite.width = sprite.height = 0;
      sprite = glowSprite(`rgba(${red},${green},${blue},0.9)`);
      builtKey = key;
      setLiveWord(renderKey);
      draw();
    }

    function draw() {
      if (!sprite) return;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w + MARGIN * 2, h + MARGIN * 2);
      ctx!.globalCompositeOperation = "lighter";
      // Small, steady cores with a restrained halo keep the lettering readable.
      const halo = radius * (2 + warp * 0.25);
      ctx!.globalAlpha = (0.06 + warp * 0.05) * (glow / PARTICLE_DEFAULTS.particleGlow);
      if (glow > 0) for (const d of dots) {
        const s = halo * (0.85 + d.seed * 0.3);
        ctx!.drawImage(sprite, MARGIN + d.x - s, MARGIN + d.y - s, s * 2, s * 2);
      }
      ctx!.globalAlpha = 0.9 + warp * 0.1;
      const core = radius;
      ctx!.fillStyle = coreColor;
      for (const d of dots) {
        ctx!.beginPath();
        ctx!.arc(MARGIN + d.x, MARGIN + d.y, core * (0.9 + d.seed * 0.2), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;
    }

    function step(now: number) {
      raf = 0;
      if (disposed || !visible || document.hidden || motion.matches) return;
      const dt = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      const warpEase = 1 - Math.exp(-5 * speed * dt), dotEase = 1 - Math.exp(-9 * speed * dt);
      // The warp eases up while the pointer is near and back down when it leaves.
      warp += ((hovering ? 1 : 0) - warp) * warpEase;
      if (Math.abs((hovering ? 1 : 0) - warp) < 0.002) warp = hovering ? 1 : 0;
      let moving = warp !== (hovering ? 1 : 0);
      for (const d of dots) {
        const influence = Math.max(0, 1 - Math.hypot(d.hx - px, d.hy - py) / REACH) ** 2;
        const targetX = d.hx + d.driftX * influence * warp;
        const targetY = d.hy + d.driftY * influence * warp;
        // Ease directly toward a bounded offset, without spin, repulsion or spring overshoot.
        d.x += (targetX - d.x) * dotEase;
        d.y += (targetY - d.y) * dotEase;
        if (Math.abs(targetX - d.x) + Math.abs(targetY - d.y) > 0.02) moving = true;
        else {
          d.x = targetX;
          d.y = targetY;
        }
      }
      draw();
      // Everything is home again and the glow is gone: back to the ordinary text.
      if (!moving && !hovering && warp === 0) show(false);
      if (moving && visible) raf = requestAnimationFrame(step);
    }
    const wake = () => {
      if (!raf && visible && !document.hidden && !motion.matches && dots.length) { lastFrame = 0; raf = requestAnimationFrame(step); }
    };

    // Where the pointer is, relative to the word. "Near" is anywhere within reach of it, not only exactly on it.
    function point(e: PointerEvent) {
      if (!visible || document.hidden || motion.matches || !dots.length) return;
      const r = host!.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      // The dots begin when the pointer is on the word; once they are showing, they keep reacting while it is within reach.
      const slack = shown ? REACH : 14;
      const near = px > -slack && px < r.width + slack && py > -slack && py < r.height + slack;
      if (near !== hovering) {
        hovering = near;
        wake(); // let the dots settle, and the word go back to plain text
      }
      if (near) {
        if (!shown) {
          show(true);
          draw();
        }
        wake();
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!visible || document.hidden || motion.matches || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
      lastPointer = e;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (lastPointer) point(lastPointer);
      });
    };
    // A finger has no hover: a touch near the word stirs it, and it settles a moment after the finger lifts.
    const onTouch = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !visible || document.hidden || motion.matches) return;
      point(e);
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => {
        hovering = false;
        wake();
      }, 700);
    };
    const onLeave = () => {
      hovering = false;
      wake();
    };
    const suspend = () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pointerFrame);
      raf = pointerFrame = 0;
      lastFrame = 0;
      lastPointer = null;
      hovering = false;
      warp = 0;
      show(false);
      for (const dot of dots) { dot.x = dot.hx; dot.y = dot.hy; }
    };
    function release() {
      suspend();
      window.clearTimeout(touchTimer);
      dots = [];
      if (sprite) sprite.width = sprite.height = 0;
      sprite = null;
      cv!.width = cv!.height = 0;
      builtKey = "";
      if (!disposed) setLiveWord(null);
    }
    const onVisibility = () => { if (document.hidden) release(); else build(); };
    const onMotion = () => { if (motion.matches) release(); else build(); };
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onTouch, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    // Only work while the word is on screen.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) build();
        else release();
      },
      { rootMargin: "120px" },
    );
    io.observe(host);

    // Built once the fonts are ready, and again whenever the word changes size (another screen width, a new font size).
    let timer = 0;
    const rebuild = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 80);
    };
    void document.fonts.ready.then(() => { fontsReady = true; build(); });
    const ro = new ResizeObserver(rebuild);
    ro.observe(text);

    return () => {
      disposed = true;
      release();
      window.clearTimeout(timer);
      window.clearTimeout(touchTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onTouch);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      io.disconnect();
      ro.disconnect();
    };
  }, [word, color, particleColor, dotSize, scatter, speed, glow, renderKey]);

  return (
    <span ref={wrap} className={styles.wrap} style={color ? { color } : undefined} data-live={live} data-active={active}>
      {/* The real text: it gives the word its size and place, stays for screen readers and search, and shows until the dots are ready. */}
      <span ref={ghost} className={styles.ghost}>
        {word}
      </span>
      <canvas ref={canvas} className={styles.canvas} width={0} height={0} aria-hidden="true" />
    </span>
  );
}
