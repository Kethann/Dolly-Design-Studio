"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { proofTable } from "@/content/proof-table";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { ProofTableFallback } from "./Fallback";
import type { ProofScene } from "./scene";
import { STAGES } from "./stages";
import { jumpTo } from "@/lib/smooth-scroll";
import styles from "./ProofTable.module.css";

type Mode = "pinned" | "static" | "fallback";
const FRAMES = 240;
const MOBILE_ITEMS = 6;

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
 * CSS 3D version. The cards, their glass and the scroll length come from the portal and update live.
 * The scene is only created once the section is near the viewport, and only draws when something changes.
 */
export function ProofTable() {
  const router = useRouter();
  const { settings } = useIntroSettings();
  const pt = settings.proofTable;
  const [mode, setMode] = useState<Mode>("pinned");
  const [mobile, setMobile] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<ProofScene | null>(null);
  const items = mobile ? pt.items.slice(0, MOBILE_ITEMS) : pt.items;
  const itemsRef = useRef(items);
  const lookRef = useRef(pt);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability check
    setMobile(window.matchMedia("(max-width: 767px)").matches);
    setMode(!hasWebGL() ? "fallback" : reduced ? "static" : "pinned");
  }, []);

  // Live from the portal: new / removed slots and card size swap the cards; the glass restyles in place.
  const itemsKey = JSON.stringify(items);
  useEffect(() => {
    itemsRef.current = items;
    lookRef.current = pt;
    sceneRef.current?.setItems(items, pt.cardSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the items' content, not their identity
  }, [itemsKey, pt.cardSize]);
  useEffect(() => {
    lookRef.current = pt;
    sceneRef.current?.setGlass({ color: pt.glassColor, opacity: pt.glassOpacity, frost: pt.frost, reflection: pt.reflection });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pt.glassColor, pt.glassOpacity, pt.frost, pt.reflection]);

  useEffect(() => {
    if (mode === "fallback" || !pt.enabled) return;
    const section = sectionRef.current!;
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    let scene: ProofScene | null = null;
    let raf = 0;
    let visible = false;
    let shown = 0; // smoothed progress
    let held = 0; // the furthest the story has played on this pass: it only moves forward
    let lastTarget = 0;
    let upMove = 0;
    let last = performance.now();
    let disposed = false;
    let loading = false;

    const progress = () => {
      if (mode === "static") return 1;
      const r = section.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    };

    let lastVars = -1;
    function setVars(p: number) {
      if (p === lastVars) return;
      lastVars = p;
      const insp = Math.min(1, Math.max(0, (p - STAGES.inspect[0]) / (STAGES.inspect[1] - STAGES.inspect[0])));
      stage.style.setProperty("--hud", (1 - insp * 0.7).toFixed(3));
      // Headline lines appear one after another as the camera settles.
      const from = STAGES.inspect[0] + (STAGES.inspect[1] - STAGES.inspect[0]) * 0.55;
      for (let i = 0; i < 5; i++) {
        const r = Math.min(1, Math.max(0, (p - (from + i * 0.03)) / 0.08));
        stage.style.setProperty(`--r${i}`, (r * r * (3 - 2 * r)).toFixed(3));
      }
      if (counterRef.current)
        counterRef.current.textContent = `${String(1 + Math.round(p * (FRAMES - 1))).padStart(3, "0")} / ${FRAMES}`;
    }

    function frame(now: number) {
      raf = 0;
      if (disposed || !scene || !visible) return;
      // A frame's timestamp can be a hair earlier than the clock read when the loop started: never a negative step.
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      // The story plays only while scrolling down. Scrolling back up leaves everything where it landed; once the
      // section is left behind above (it sits fully below the screen), the next time down plays it again.
      if (mode === "pinned" && section.getBoundingClientRect().top >= window.innerHeight) held = shown = 0;
      const target = progress();
      // Scrolling back up doesn't replay anything, so there's nothing to scroll through: one clear move up jumps to
      // the start of the pinned stretch. The view there is identical (same held frame), so the jump is invisible, and
      // the very next scroll up continues to the section above.
      upMove = target < lastTarget ? upMove + (lastTarget - target) : 0;
      lastTarget = target;
      if (mode === "pinned" && target > 0.002 && upMove > 0.012) {
        upMove = 0;
        lastTarget = 0;
        jumpTo(section.getBoundingClientRect().top + window.scrollY);
      }
      held = Math.max(held, target);
      shown += (held - shown) * (1 - Math.exp(-dt * 9));
      if (Math.abs(held - shown) < 0.0004) shown = held;
      shown = Math.min(1, Math.max(0, shown));
      setVars(shown);
      scene.update(shown, dt);
      canvas.style.cursor = scene.hovered() >= 0 ? "pointer" : "";
      raf = requestAnimationFrame(frame);
    }
    const run = () => {
      if (!raf && scene && visible && !disposed) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    async function init() {
      if (loading) return;
      loading = true;
      const { createProofScene } = await import("./scene");
      if (disposed) return;
      const look = lookRef.current;
      scene = createProofScene(canvas, {
        items: itemsRef.current,
        cardSize: look.cardSize,
        glass: { color: look.glassColor, opacity: look.glassOpacity, frost: look.frost, reflection: look.reflection },
        mobile,
        stage: getComputedStyle(document.documentElement).getPropertyValue("--stage").trim() || "#410000",
      });
      sceneRef.current = scene;
      const r = canvas.getBoundingClientRect();
      scene.resize(r.width, r.height);
      shown = held = progress();
      setVars(shown);
      // Off screen: don't draw yet (that would upload everything at once); warm the GPU up in idle moments instead.
      if (visible) scene.update(shown, 0);
      else void scene.warmUp();
      run();
    }

    const near = new IntersectionObserver(([e]) => e.isIntersecting && init(), { rootMargin: "250% 0px" });
    near.observe(section);
    const inView = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      // Left behind above (scrolled back up past its start): rewind, so coming down again replays the drop.
      if (!visible && mode === "pinned" && e.boundingClientRect.top > 0) held = shown = 0;
      run();
    });
    inView.observe(section);
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(r.width, r.height);
    });
    ro.observe(canvas);

    // At the end the cards can be touched: hover stands a card up and it follows the cursor; click opens it.
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      scene?.pointer(e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = () => scene?.pointer(null, 0);
    const onClick = () => {
      const i = scene ? scene.hovered() : -1;
      if (i >= 0 && itemsRef.current[i]) router.push(`/work/${itemsRef.current[i].slug}`);
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
      sceneRef.current = null;
    };
  }, [mode, mobile, router, pt.enabled]);

  if (!pt.enabled) return null;

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
      <Link
        href={proofTable.cta.href}
        className={styles.cta}
        data-cursor="link"
        style={{ "--r": "var(--r4)" } as React.CSSProperties}
      >
        {proofTable.cta.label} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );

  if (mode === "fallback") {
    return (
      <section id={proofTable.id} className={styles.section}>
        <ProofTableFallback items={items}>{copy}</ProofTableFallback>
      </section>
    );
  }

  // Pinned for `length` screens of scrolling (a bit shorter on phones).
  const pinned = mode === "pinned" ? { height: `${Math.round((1 + pt.length * (mobile ? 0.75 : 1)) * 100)}vh` } : undefined;
  return (
    <section
      id={proofTable.id}
      ref={sectionRef}
      className={`${styles.section} ${mode === "static" ? styles.still : ""}`}
      style={pinned}
    >
      <div ref={stageRef} className={`${styles.stage} ${mode === "static" ? styles.revealed : ""}`}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <div className={styles.hud} aria-hidden="true">
          <span>{proofTable.labels.proof}</span>
          <span ref={counterRef}>001 / {FRAMES}</span>
        </div>
        {copy}
        <ul className="sr-only">
          {items.map((it, i) => (
            <li key={`${it.src}-${i}`}>
              <Link href={`/work/${it.slug}`}>{it.alt}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
