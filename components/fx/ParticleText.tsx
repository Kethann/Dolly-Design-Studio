"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ParticleText.module.css";

/** How far (px) from the pointer the dots are pushed about, and how far past the word the canvas reaches so they can fly free. */
const REACH = 120;
const MARGIN = REACH + 20;
/** Never more dots than this for one word, whatever its size. */
const MAX_DOTS = 2600;

interface Dot {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
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
 * size and colour). Put the pointer near and they swirl away from it, leaving a hole like a vortex while the word glows
 * brighter; take it away and every dot springs back home. Falls back to plain text for visitors who ask for less motion.
 *
 *   <ParticleText>cinematic</ParticleText>
 *
 * Where it is used: wrap words in [[double brackets]] in the portal (see renderFx) and render them with renderFx().
 */
export function ParticleText({ children }: { children: string }) {
  const word = String(children);
  const wrap = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** True once the dots are drawn: until then (and without canvas support or with reduced motion) the plain text shows. */
  const [live, setLive] = useState(false);

  useEffect(() => {
    const host = wrap.current;
    const text = ghost.current;
    const cv = canvas.current;
    if (!host || !text || !cv) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let dots: Dot[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let sprite: HTMLCanvasElement | null = null;
    let radius = 1.6;
    let raf = 0;
    let warp = 0;
    let hovering = false;
    let px = -9999;
    let py = -9999;
    let visible = true;
    let disposed = false;
    let touchTimer = 0;

    /** Reads the word's look from the page and turns its pixels into dots. */
    function build() {
      if (disposed) return;
      const rect = text!.getBoundingClientRect();
      w = Math.max(1, Math.ceil(rect.width));
      h = Math.max(1, Math.ceil(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cs = getComputedStyle(text!);
      const fontSize = parseFloat(cs.fontSize) || 40;
      const gap = Math.min(6, Math.max(2.6, fontSize / 15));
      radius = gap * 0.56;

      // The word, drawn on a hidden canvas exactly as the page draws it, then read back pixel by pixel.
      const off = document.createElement("canvas");
      off.width = Math.ceil(w * dpr);
      off.height = Math.ceil(h * dpr);
      const og = off.getContext("2d", { willReadFrequently: true })!;
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
            if (data[i] > 110) list.push({ hx: x, hy: y, x, y, vx: 0, vy: 0, seed: Math.random() });
          }
        }
        if (list.length <= MAX_DOTS) break;
        step *= 1.25; // a very large word: fewer, slightly sparser dots
      }
      radius = step * 0.62;
      dots = list;

      // The canvas reaches past the word on every side so dots can be thrown clear of it.
      cv!.style.left = `${-MARGIN}px`;
      cv!.style.top = `${-MARGIN}px`;
      cv!.style.width = `${w + MARGIN * 2}px`;
      cv!.style.height = `${h + MARGIN * 2}px`;
      cv!.width = Math.ceil((w + MARGIN * 2) * dpr);
      cv!.height = Math.ceil((h + MARGIN * 2) * dpr);
      // The glow takes the word's own colour; a word painted with a gradient has no single colour, so the site's gold is used.
      const c = cs.color.match(/[\d.]+/g) ?? [];
      const solid = c.length >= 3 && (c.length < 4 || Number(c[3]) > 0.2) && Number(c[0]) + Number(c[1]) + Number(c[2]) > 60;
      const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold-bright").trim() || "#ffd37a";
      const tmp = document.createElement("canvas").getContext("2d")!;
      tmp.fillStyle = solid ? cs.color : gold;
      const hex = tmp.fillStyle as string; // normalised to #rrggbb
      const n = parseInt(hex.slice(1, 7), 16);
      sprite = glowSprite(`rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.9)`);
      setLive(true);
      draw();
    }

    function draw() {
      if (!sprite) return;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w + MARGIN * 2, h + MARGIN * 2);
      ctx!.globalCompositeOperation = "lighter";
      // The glow grows and brightens with the warp; at rest a dot is just the letter's own colour.
      const halo = radius * (2.6 + warp * 2.4);
      ctx!.globalAlpha = 0.12 + warp * 0.2;
      for (const d of dots) {
        const s = halo * (0.85 + d.seed * 0.3);
        ctx!.drawImage(sprite, MARGIN + d.x - s, MARGIN + d.y - s, s * 2, s * 2);
      }
      ctx!.globalAlpha = 0.9 + warp * 0.1;
      const core = radius * (1 + warp * 0.35);
      ctx!.fillStyle = "#fff6e2";
      for (const d of dots) {
        ctx!.beginPath();
        ctx!.arc(MARGIN + d.x, MARGIN + d.y, core * (0.9 + d.seed * 0.2), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;
    }

    function step() {
      raf = 0;
      // The warp eases up while the pointer is near and back down when it leaves.
      warp += ((hovering ? 1 : 0) - warp) * 0.08;
      if (Math.abs((hovering ? 1 : 0) - warp) < 0.002) warp = hovering ? 1 : 0;
      let moving = hovering || warp > 0;
      for (const d of dots) {
        const dx = d.x - px;
        const dy = d.y - py;
        const dist = Math.hypot(dx, dy);
        if (hovering && dist < REACH && dist > 0.01) {
          // Pushed straight away from the pointer and swirled round it: a vortex with a hole in the middle.
          const f = (1 - dist / REACH) ** 2;
          d.vx += (dx / dist) * f * 4.2 + (-dy / dist) * f * 3.2;
          d.vy += (dy / dist) * f * 4.2 + (dx / dist) * f * 3.2;
        }
        // And home again, like a spring.
        d.vx += (d.hx - d.x) * 0.08;
        d.vy += (d.hy - d.y) * 0.08;
        d.vx *= 0.85;
        d.vy *= 0.85;
        d.x += d.vx;
        d.y += d.vy;
        if (Math.abs(d.vx) + Math.abs(d.vy) > 0.02 || Math.abs(d.hx - d.x) + Math.abs(d.hy - d.y) > 0.05) moving = true;
        else {
          d.x = d.hx;
          d.y = d.hy;
        }
      }
      draw();
      if (moving && visible) raf = requestAnimationFrame(step);
    }
    const wake = () => {
      if (!raf && visible && dots.length) raf = requestAnimationFrame(step);
    };

    // Where the pointer is, relative to the word. "Near" is anywhere within reach of it, not only exactly on it.
    function point(e: PointerEvent) {
      const r = host!.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      const near = px > -REACH && px < r.width + REACH && py > -REACH && py < r.height + REACH;
      if (near !== hovering) hovering = near;
      if (near) wake();
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen") point(e);
    };
    // A finger has no hover: a touch near the word stirs it, and it settles a moment after the finger lifts.
    const onTouch = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
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
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onTouch, { passive: true });
    window.addEventListener("pointermove", onTouch, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    // Only work while the word is on screen.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) wake();
        else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
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
    void document.fonts?.ready.then(build);
    const ro = new ResizeObserver(rebuild);
    ro.observe(text);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.clearTimeout(touchTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onTouch);
      window.removeEventListener("pointermove", onTouch);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      io.disconnect();
      ro.disconnect();
    };
  }, [word]);

  return (
    <span ref={wrap} className={styles.wrap} data-live={live}>
      {/* The real text: it gives the word its size and place, stays for screen readers and search, and shows until the dots are ready. */}
      <span ref={ghost} className={styles.ghost}>
        {word}
      </span>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
    </span>
  );
}
