"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { EFFECT_CONTROLS, cleanEffectOptions, type TextEffectOptions } from "@/lib/content/text-effects";
import styles from "./FilterText.module.css";

type FilterEffect = "liquify" | "neon" | "bubble";

const setting = (effect: FilterEffect, options: TextEffectOptions, key: "fxAmount" | "fxSize" | "fxSpeed") =>
  options[key] ?? EFFECT_CONTROLS[effect]?.sliders.find((slider) => slider.key === key)?.value ?? 1;

/**
 * Words drawn through an SVG filter: melting liquid, neon, or bubble glass.
 * The real text stays in place for layout, search and screen readers. The filtered copy only
 * exists while it shows, so a resting word costs nothing, and the filter is sized from the word's own font.
 */
export function FilterText({ effect, options: raw, style, children }: { effect: FilterEffect; options: TextEffectOptions; style: CSSProperties; children: string }) {
  const options = cleanEffectOptions(raw);
  const id = `fx${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const host = useRef<HTMLSpanElement>(null), turbulence = useRef<SVGFETurbulenceElement>(null), displacement = useRef<SVGFEDisplacementMapElement>(null);
  const [fontSize, setFontSize] = useState(32);
  const [hovering, setHovering] = useState(false);
  const always = options.glowMode === "always";
  const on = always || hovering;
  const amount = setting(effect, options, "fxAmount"), size = setting(effect, options, "fxSize"), speed = setting(effect, options, "fxSpeed");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setFontSize(Math.max(8, parseFloat(getComputedStyle(element).fontSize) || 32));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Liquid moves only while it shows and is on screen, then eases back to still, sharp letters.
  useEffect(() => {
    const element = host.current, map = displacement.current, noise = turbulence.current;
    if (!element || !map || !noise || effect === "bubble") return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const full = amount * fontSize * (effect === "neon" ? .28 : .42);
    const base = 1.1 / (fontSize * size);
    const stretch = effect === "neon" ? .35 : 1;
    if (reduced.matches) { map.setAttribute("scale", String(on ? full * .5 : 0)); noise.setAttribute("baseFrequency", `${base * stretch} ${base}`); return; }
    let frame = 0, last = 0, level = 0, time = 0, visible = true;
    const step = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now; time += dt * speed;
      level += ((on ? 1 : 0) - level) * (1 - Math.exp(-dt * 5));
      if (!on && level < .01) level = 0;
      map.setAttribute("scale", (full * level * (.82 + .18 * Math.sin(time * 1.3))).toFixed(2));
      noise.setAttribute("baseFrequency", `${(base * stretch * (1 + .2 * Math.sin(time * .9))).toFixed(5)} ${(base * (1 + .2 * Math.cos(time * .7))).toFixed(5)}`);
      if (visible && (on || level > 0)) frame = requestAnimationFrame(step);
    };
    const wake = () => { if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(step); } };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); }, { rootMargin: "60px" });
    io.observe(element);
    const onVisibility = () => { if (!document.hidden) wake(); };
    document.addEventListener("visibilitychange", onVisibility);
    wake();
    return () => { cancelAnimationFrame(frame); io.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [on, effect, amount, size, speed, fontSize]);

  // A finger has no hover: a tap stirs the word, and it settles a moment later.
  const touchTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(touchTimer.current), []);
  const events = {
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== "touch") setHovering(true); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType !== "touch") setHovering(false); },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      setHovering(true); window.clearTimeout(touchTimer.current);
      touchTimer.current = window.setTimeout(() => setHovering(false), 1600);
    },
  };

  const unit = fontSize / 40; // Every filter size below is designed at a 40px word.
  const round = 1.4 * unit * size;
  const neonGlow = fontSize * .1 * size;
  const paintStyle = {
    filter: effect === "neon"
      ? `url(#${id}) drop-shadow(0 0 ${neonGlow.toFixed(1)}px var(--fx-a, #ff4fb4)) drop-shadow(0 ${(neonGlow * .4).toFixed(1)}px ${(neonGlow * 1.4).toFixed(1)}px var(--fx-c, #35d6ff))`
      : `url(#${id})`,
  } as CSSProperties;

  return (
    <span ref={host} className={styles.word} style={style} data-text-effect={effect} data-fx-effect={effect} data-fx-trigger={options.glowMode} data-on={on} {...events}>
      <span className={styles.base}>{children}</span>
      <span aria-hidden="true" className={styles.paint} style={paintStyle}>{children}</span>
      <svg className={styles.defs} width="0" height="0" aria-hidden="true" focusable="false">
        <filter id={id} x="-15%" y="-40%" width="130%" height="180%" colorInterpolationFilters="sRGB">
          {effect === "bubble" ? <>
            {/* Fatten and round a regular font, then light its edges like a blown glass skin. */}
            <feMorphology in="SourceAlpha" operator="dilate" radius={round} result="fat" />
            <feGaussianBlur in="fat" stdDeviation={round * 1.15} result="soft" />
            <feComponentTransfer in="soft" result="shape"><feFuncA type="linear" slope="9" intercept="-3.6" /></feComponentTransfer>
            <feMorphology in="SourceGraphic" operator="dilate" radius={round * 1.7} result="fatColour" />
            <feGaussianBlur in="fatColour" stdDeviation={round * 1.3} result="softColour" />
            <feComposite in="softColour" in2="shape" operator="in" result="tinted" />
            <feColorMatrix in="tinted" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .58 0" result="body" />
            <feMorphology in="shape" operator="erode" radius={Math.max(.5, 1.1 * unit)} result="inner" />
            <feComposite in="shape" in2="inner" operator="out" result="rimShape" />
            <feFlood floodColor="#ffffff" floodOpacity=".82" />
            <feComposite in2="rimShape" operator="in" result="rim" />
            <feGaussianBlur in="shape" stdDeviation={2.2 * unit} result="height" />
            <feSpecularLighting in="height" surfaceScale={5 * unit} specularConstant={.5 + amount * 1.1} specularExponent={32} lightingColor="#ffffff" result="light">
              <feDistantLight azimuth="235" elevation="50" />
            </feSpecularLighting>
            <feComposite in="light" in2="shape" operator="in" result="gloss" />
            <feMerge><feMergeNode in="body" /><feMergeNode in="rim" /><feMergeNode in="gloss" /></feMerge>
          </> : <>
            <feTurbulence ref={turbulence} type="fractalNoise" baseFrequency={1.1 / (fontSize * size)} numOctaves={2} seed={4} result="noise" />
            <feDisplacementMap ref={displacement} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
          </>}
        </filter>
      </svg>
    </span>
  );
}
