"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useContent, tx } from "@/lib/content/context";
import { edItem, edList, edSection } from "@/lib/content/tx";
import { useMotion } from "@/lib/motion";
import styles from "./Process.module.css";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const ICON_ORDER = ["sketch", "camera", "pipeline", "layers"];

/** A two-tone line illustration for each step: the strokes in gold, soft fills for depth. */
function StepIcon({ name }: { name: string }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const soft = { fill: "currentColor", fillOpacity: 0.14, stroke: "none" } as const;
  return (
    <svg viewBox="0 0 64 64" className={styles.icon} aria-hidden="true">
      {name === "sketch" ? (
        <g {...line}>
          {/* a sketchboard with construction lines, and a pencil drawing across it */}
          <rect x="8" y="10" width="40" height="34" rx="3" {...soft} />
          <rect x="8" y="10" width="40" height="34" rx="3" />
          <path d="M14 36c5-12 9-14 14-8s9 2 14-10" strokeDasharray="2.5 3" opacity="0.7" />
          <path d="M14 18h8M14 23h5" opacity="0.55" />
          <path d="M34 50l2-8 18-18a3 3 0 0 1 4.2 0l1.8 1.8a3 3 0 0 1 0 4.2L42 48z" fill="#1a1115" />
          <path d="M34 50l2-8 18-18a3 3 0 0 1 4.2 0l1.8 1.8a3 3 0 0 1 0 4.2L42 48z" />
          <path d="M52 26l6 6M36 42l6 6" />
          <path d="M34 50l3.5-1" />
        </g>
      ) : name === "camera" ? (
        <g {...line}>
          {/* a camera, with a lens, a viewfinder and a flash */}
          <path d="M8 22h10l4-6h20l4 6h10a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V24a2 2 0 0 1 2-2z" {...soft} />
          <path d="M8 22h10l4-6h20l4 6h10a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V24a2 2 0 0 1 2-2z" />
          <circle cx="32" cy="37" r="11" />
          <circle cx="32" cy="37" r="7" opacity="0.8" />
          <circle cx="32" cy="37" r="3" fill="currentColor" fillOpacity="0.35" />
          <path d="M28 33a6 6 0 0 1 5-2" opacity="0.7" />
          <path d="M48 28h4" />
          <path d="M12 28h4" opacity="0.6" />
          <path d="M50 8l-2 6M56 10l-4 4M44 7l1 5" opacity="0.85" />
        </g>
      ) : name === "pipeline" ? (
        <g {...line}>
          {/* three stages joined by arrows, the last one completed */}
          <rect x="5" y="22" width="14" height="20" rx="3" {...soft} />
          <rect x="5" y="22" width="14" height="20" rx="3" />
          <rect x="25" y="22" width="14" height="20" rx="3" {...soft} />
          <rect x="25" y="22" width="14" height="20" rx="3" />
          <rect x="45" y="22" width="14" height="20" rx="3" {...soft} />
          <rect x="45" y="22" width="14" height="20" rx="3" />
          <path d="M19 32h6M39 32h6" />
          <path d="m22.5 29.5 2.5 2.5-2.5 2.5M42.5 29.5l2.5 2.5-2.5 2.5" />
          <path d="M9 28h6M9 32h6M9 36h3" opacity="0.6" />
          <path d="M29 28h6M29 32h6M29 36h3" opacity="0.6" />
          <path d="m49 32 3 3 5-6" strokeWidth="2" />
          <path d="M12 14v5M32 14v5M52 14v5M12 45v5M32 45v5M52 45v5" opacity="0.4" strokeDasharray="1 3" />
        </g>
      ) : name === "layers" ? (
        <g {...line}>
          {/* layers of art, with a play button on the top one */}
          <path d="m32 46 24-12-24-12-24 12z" {...soft} />
          <path d="m8 40 24 12 24-12" opacity="0.7" />
          <path d="m8 34 24 12 24-12" opacity="0.85" />
          <path d="m32 34 24-12-24-12-24 12z" fill="#1a1115" />
          <path d="m32 34 24-12-24-12-24 12z" />
          <path d="m29 17.5 8 4-8 4z" fill="currentColor" stroke="none" />
        </g>
      ) : (
        <g {...line}>
          <path d="M32 8l5.6 16.4L54 30l-16.4 5.6L32 52l-5.6-16.4L10 30l16.4-5.6z" {...soft} />
          <path d="M32 8l5.6 16.4L54 30l-16.4 5.6L32 52l-5.6-16.4L10 30l16.4-5.6z" />
        </g>
      )}
    </svg>
  );
}

export function Process() {
  const { home, breakdowns } = useContent();
  const copy = home.process;
  const router = useRouter();
  const { reducedMotion } = useMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Each icon's own lines, as a mask: the glass colours are shown through it, so on hover the icon itself lights up in the
  // colours at the cursor (the same effect as the corner logo), and nothing around its lines does.
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>("[data-icon-tile]").forEach((tile) => {
      const svg = tile.querySelector("svg");
      if (!svg) return;
      const copyOfIcon = svg.cloneNode(true) as SVGElement;
      copyOfIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      copyOfIcon.setAttribute("width", "64");
      copyOfIcon.setAttribute("height", "64");
      // Only the icon's lines go in the mask, not its solid insides: the shapes' fills (the dark body of the pencil, the soft
      // tints) would otherwise be covered by the colour completely. (The small filled play triangle is kept.)
      copyOfIcon.querySelectorAll("[fill]").forEach((el) => {
        const f = el.getAttribute("fill");
        const keep = f === "currentColor" && el.getAttribute("stroke") === "none" && !el.hasAttribute("fill-opacity");
        if (f !== "none" && !keep) el.setAttribute("fill", "none");
      });
      tile.style.setProperty("--logo-mask", `url("data:image/svg+xml,${encodeURIComponent(copyOfIcon.outerHTML.replace(/currentColor/g, "#000"))}")`);
    });
  }, [copy.cards]);

  useEffect(() => {
    if (reducedMotion || !ref.current) return;
    const steps = ref.current.querySelectorAll<HTMLElement>("[data-step]");
    const triggers = Array.from(steps).map((step, i) =>
      gsap.to(step, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        delay: i * 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: step, start: "top 85%" },
      }),
    );
    return () => triggers.forEach((t) => t.scrollTrigger?.kill());
  }, [reducedMotion, copy.cards.length]);

  return (
    <section id="process" className={styles.section} {...edSection("home", "process", "How we work")}>
      <div className="container">
        <div className={styles.head}>
          <span className={styles.label} {...tx("home.process.label")}>{copy.label}</span>
          <h2 className={styles.title} {...tx("home.process.title")}>{copy.title}</h2>
          <p className={styles.body} {...tx("home.process.intro")}>{copy.intro}</p>
        </div>

        <div className={styles.steps} ref={ref} {...edList("home.process.cards", "card", 8)}>
          {copy.cards.map((card, i) => {
            // A card can open the Breakdowns page (once there is something to show on it).
            const opens = (card as { opensBreakdowns?: boolean }).opensBreakdowns === true && breakdowns.length > 0;
            return (
              <div
                key={i}
                {...edItem("home.process.cards", i, "Card")}
                className={styles.step}
                data-step
                data-opens={opens}
                style={reducedMotion ? { opacity: 1, transform: "none" } : undefined}
                {...(opens
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "data-cursor": "link",
                      onClick: () => router.push("/breakdowns"),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push("/breakdowns");
                        }
                      },
                    }
                  : {})}
              >
                <span className={`${styles.tile} glass-glow`} data-icon-tile>
                  <StepIcon name={(card as { icon?: string }).icon ?? ICON_ORDER[i] ?? "star"} />
                </span>
                <h3 className={styles.stepTitle} {...tx("home.process.cards.title")}>
                  {card.title}
                </h3>
                <div className={styles.headRow}>
                  <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
                  <p className={styles.note} {...tx("home.process.cards.note")}>
                    {card.note}
                  </p>
                </div>
                <p className={styles.stepBody} {...tx("home.process.cards.body")}>
                  {card.body}
                </p>
                {opens && <span className={styles.cta}>See the breakdowns →</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
