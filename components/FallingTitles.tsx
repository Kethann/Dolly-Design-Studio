"use client";

import { useEffect, useRef } from "react";
import Matter from "matter-js";
import styles from "./FallingTitles.module.css";

export interface TitleCard {
  title: string;
  sub: string;
  /** Poster shown faintly behind the title. */
  image?: string;
}

/**
 * Film-title cards that drop in from above the section when it scrolls into view, tumble, and pile up on the
 * floor like a spilled stack of credit cards. Real rigid-body physics (matter-js); you can grab and toss the cards.
 * Each card is drawn once to its own sprite (dark glass, gold edge, faint poster, the title in gold), then moved
 * every frame with a light sheen that follows its tilt, so it catches the light as it turns.
 */
const RATIO = 1.586; // a credit card
const STEP = 1000 / 60;

interface Sprite {
  canvas: HTMLCanvasElement;
  draw: () => void;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeSprite(card: TitleCard, w: number, h: number, dpr: number, fonts: { display: string; label: string }): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext("2d")!;
  let img: HTMLImageElement | null = null;

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = h * 0.075;
    ctx.save();
    roundRect(ctx, 0, 0, w, h, r);
    ctx.clip();

    // Dark glass body.
    const body = ctx.createLinearGradient(0, 0, w, h);
    body.addColorStop(0, "#1d170c");
    body.addColorStop(0.55, "#0e0b06");
    body.addColorStop(1, "#16110a");
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, h);

    // The poster, cover-fitted and dimmed, fading out towards the left where the text sits.
    if (img) {
      const s = Math.max(w / img.width, h / img.height);
      const iw = img.width * s;
      const ih = img.height * s;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(img, (w - iw) / 2, (h - ih) * 0.28, iw, ih);
      ctx.globalAlpha = 1;
      const fade = ctx.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, "rgba(10,8,4,0.92)");
      fade.addColorStop(0.55, "rgba(10,8,4,0.55)");
      fade.addColorStop(1, "rgba(10,8,4,0.1)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
    }

    // A fine gold sheen band, like the foil on a card.
    const foil = ctx.createLinearGradient(0, h, w, 0);
    foil.addColorStop(0, "rgba(232,176,75,0)");
    foil.addColorStop(0.5, "rgba(255,241,149,0.07)");
    foil.addColorStop(1, "rgba(232,176,75,0)");
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Gold hairline edge.
    const edge = ctx.createLinearGradient(0, 0, w, h);
    edge.addColorStop(0, "rgba(255,241,149,0.85)");
    edge.addColorStop(0.5, "rgba(232,176,75,0.35)");
    edge.addColorStop(1, "rgba(255,241,149,0.7)");
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = edge;
    roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, r);
    ctx.stroke();

    // A small four-point star where a card's chip would be.
    const cx = w * 0.09;
    const cy = h * 0.2;
    const sr = h * 0.075;
    ctx.fillStyle = "#fff195";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rad = i % 2 === 0 ? sr : sr * 0.28;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();

    // Title: as large as fits on one or two lines.
    const padX = w * 0.08;
    const maxW = w * 0.84;
    const words = card.title.split(/\s+/);
    let lines = [card.title];
    let size = h * 0.2;
    const fit = (text: string, px: number) => {
      ctx.font = `700 ${px}px ${fonts.display}`;
      return ctx.measureText(text).width;
    };
    while (size > h * 0.11 && fit(card.title, size) > maxW) size -= 1;
    if (fit(card.title, size) > maxW && words.length > 1) {
      let best = 1;
      let bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const diff = Math.abs(fit(words.slice(0, i).join(" "), size) - fit(words.slice(i).join(" "), size));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      }
      lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
      size = h * 0.17;
      while (size > h * 0.09 && Math.max(...lines.map((l) => fit(l, size))) > maxW) size -= 1;
    }
    ctx.font = `700 ${size}px ${fonts.display}`;
    ctx.textBaseline = "alphabetic";
    const lineH = size * 1.08;
    const top = h * 0.62 - ((lines.length - 1) * lineH) / 2;
    const gold = ctx.createLinearGradient(0, top - size, 0, top + lines.length * lineH);
    gold.addColorStop(0, "#fff195");
    gold.addColorStop(1, "#e8b04b");
    ctx.fillStyle = gold;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = size * 0.2;
    lines.forEach((l, i) => ctx.fillText(l, padX, top + i * lineH));
    ctx.shadowBlur = 0;

    // Category, small and spaced.
    ctx.font = `600 ${h * 0.058}px ${fonts.label}`;
    ctx.fillStyle = "rgba(255,241,149,0.7)";
    const spaced = card.sub.toUpperCase().split("").join(" ");
    ctx.fillText(spaced, padX, h * 0.9);
  };

  if (card.image) {
    const im = new Image();
    im.onload = () => {
      img = im;
      draw();
    };
    im.src = card.image;
  }
  draw();
  return { canvas, draw };
}

export function FallingTitles({ cards }: { cards: TitleCard[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || cards.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const rootStyle = getComputedStyle(document.documentElement);
    const fonts = {
      display: rootStyle.getPropertyValue("--font-display").trim() || "Georgia, serif",
      label: rootStyle.getPropertyValue("--font-label").trim() || "sans-serif",
    };

    let engine: Matter.Engine;
    let bodies: { body: Matter.Body; sprite: Sprite }[] = [];
    let mouseConstraint: Matter.MouseConstraint | null = null;
    let width = 0;
    let height = 0;
    let cw = 0;
    let ch = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let visible = false;
    let started = false;
    let spawned = 0;
    let spawnTimer = 0;
    let disposed = false;

    function build() {
      if (engine) {
        Matter.World.clear(engine.world, false);
        Matter.Engine.clear(engine);
      }
      const rect = wrap!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      cw = Math.round(Math.min(Math.max(width * 0.2, 170), 290));
      ch = Math.round(cw / RATIO);

      engine = Matter.Engine.create({ gravity: { x: 0, y: 1.1 }, positionIterations: 8, velocityIterations: 6 });
      const t = 200;
      Matter.Composite.add(engine.world, [
        Matter.Bodies.rectangle(width / 2, height + t / 2, width + t * 2, t, { isStatic: true, friction: 0.8 }),
        Matter.Bodies.rectangle(-t / 2, height / 2 - height, t, height * 4, { isStatic: true }),
        Matter.Bodies.rectangle(width + t / 2, height / 2 - height, t, height * 4, { isStatic: true }),
      ]);
      bodies = cards.map((card) => ({
        body: Matter.Bodies.rectangle(0, -9999, cw, ch, {
          chamfer: { radius: ch * 0.07 },
          restitution: 0.18,
          friction: 0.7,
          frictionAir: 0.012,
          density: 0.0015,
          isSleeping: false,
        }),
        sprite: makeSprite(card, cw, ch, dpr, fonts),
      }));
      spawned = 0;

      if (fine && !reduced) {
        const mouse = Matter.Mouse.create(canvas!);
        // Let the page scroll with the wheel; only dragging is ours.
        const m = mouse as unknown as { element: HTMLElement; mousewheel: EventListener };
        m.element.removeEventListener("wheel", m.mousewheel);
        m.element.removeEventListener("mousewheel", m.mousewheel);
        m.element.removeEventListener("DOMMouseScroll", m.mousewheel);
        mouseConstraint = Matter.MouseConstraint.create(engine, {
          mouse,
          constraint: { stiffness: 0.18, damping: 0.1, render: { visible: false } },
        });
        Matter.Composite.add(engine.world, mouseConstraint);
      }
    }

    function drop(i: number) {
      const { body } = bodies[i];
      const margin = cw * 0.7;
      Matter.Body.setPosition(body, { x: margin + Math.random() * (width - margin * 2), y: -ch * 1.5 - Math.random() * ch });
      Matter.Body.setAngle(body, (Math.random() - 0.5) * 1.6);
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 3, y: 2 + Math.random() * 3 });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
      Matter.Composite.add(engine.world, body);
    }

    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (const { body, sprite } of bodies) {
        if (body.position.y < -ch * 2) continue;
        const { x, y } = body.position;
        // Soft contact shadow, stronger the closer the card is to the floor.
        const lift = Math.max(0, Math.min(1, (height - y) / (height * 0.6)));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(body.angle);
        ctx.shadowColor = `rgba(0,0,0,${0.55 - lift * 0.25})`;
        ctx.shadowBlur = 18 + lift * 26;
        ctx.shadowOffsetY = 6 + lift * 18;
        ctx.drawImage(sprite.canvas, -cw / 2, -ch / 2, cw, ch);
        ctx.shadowColor = "transparent";
        // A bright band slides across as the card tilts, so it catches the light.
        const k = Math.sin(body.angle * 2 + 0.6) * 0.5 + 0.5;
        const g = ctx.createLinearGradient(-cw / 2 + cw * k * 0.6, -ch / 2, cw / 2 - cw * (1 - k) * 0.6, ch / 2);
        g.addColorStop(0, "rgba(255,241,149,0)");
        g.addColorStop(0.5, "rgba(255,241,149,0.13)");
        g.addColorStop(1, "rgba(255,241,149,0)");
        ctx.fillStyle = g;
        const r = ch * 0.075;
        ctx.beginPath();
        ctx.moveTo(-cw / 2 + r, -ch / 2);
        ctx.arcTo(cw / 2, -ch / 2, cw / 2, ch / 2, r);
        ctx.arcTo(cw / 2, ch / 2, -cw / 2, ch / 2, r);
        ctx.arcTo(-cw / 2, ch / 2, -cw / 2, -ch / 2, r);
        ctx.arcTo(-cw / 2, -ch / 2, cw / 2, -ch / 2, r);
        ctx.fill();
        ctx.restore();
      }
    }

    function frame(now: number) {
      raf = 0;
      if (disposed || !visible) return;
      acc += Math.min(now - last, 50);
      last = now;
      while (acc >= STEP) {
        Matter.Engine.update(engine, STEP);
        acc -= STEP;
      }
      render();
      raf = requestAnimationFrame(frame);
    }
    function run() {
      if (raf || disposed) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    /** Reduced motion: lay the cards out already fallen, with no animation. */
    function settleNow() {
      for (let i = 0; i < bodies.length; i++) drop(i);
      for (let i = 0; i < 900; i++) Matter.Engine.update(engine, STEP);
      render();
    }

    function start() {
      started = true;
      if (reduced) return settleNow();
      const next = () => {
        if (spawned >= bodies.length || disposed) return;
        drop(spawned++);
        spawnTimer = window.setTimeout(next, 260 + Math.random() * 160);
      };
      next();
    }

    build();
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !started) start();
        if (visible && !reduced) run();
      },
      { threshold: 0.25 },
    );
    io.observe(wrap);

    let resizeTimer = 0;
    let lastWidth = wrap.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const w = wrap.getBoundingClientRect().width;
        if (Math.abs(w - lastWidth) < 2) return;
        lastWidth = w;
        window.clearTimeout(spawnTimer);
        build();
        if (started) {
          // Rebuilt at the new size: the cards simply land again, already settled.
          started = true;
          settleNow();
          if (!reduced && visible) run();
        }
      }, 200);
    });
    ro.observe(wrap);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(spawnTimer);
      window.clearTimeout(resizeTimer);
      io.disconnect();
      ro.disconnect();
      if (mouseConstraint) Matter.Mouse.clearSourceEvents(mouseConstraint.mouse);
      if (engine) {
        Matter.World.clear(engine.world, false);
        Matter.Engine.clear(engine);
      }
    };
  }, [cards]);

  return (
    <div ref={wrapRef} className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <ul className="sr-only">
        {cards.map((c) => (
          <li key={c.title}>
            {c.title} — {c.sub}
          </li>
        ))}
      </ul>
    </div>
  );
}
