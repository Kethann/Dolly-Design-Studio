"use client";

import { useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import { statCounter, statText } from "@/lib/content/stat-value";
import { renderFx } from "@/components/fx/render-fx";

export function CountUp({ value, suffix = "" }: { value: number | string; suffix?: string }) {
  const text = statText(value, suffix);
  const counter = statCounter(text);
  const target = counter?.target;
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const { reducedMotion } = useMotion();

  useEffect(() => {
    if (reducedMotion || target === undefined) return;
    const end = target;
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const duration = 1200;
        function tick(now: number) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(t === 1 ? end : eased * end);
          if (t < 1) frame = requestAnimationFrame(tick);
        }
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, [target, reducedMotion]);

  return (
    <span ref={ref}>
      {reducedMotion || !counter || display === target
        ? renderFx(text)
        : `${counter.sign}${Math.abs(display).toFixed(counter.decimals)}${counter.suffix}`}
    </span>
  );
}
