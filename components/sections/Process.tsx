"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import { projects } from "@/content/projects";
import { home } from "@/content/home";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { useMotion } from "@/lib/motion";
import styles from "./Process.module.css";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const copy = home.process;
// Falls back to the first project if the showcase slug in content/home.ts doesn't match one.
const showcase = projects.find((p) => p.slug === copy.showcaseSlug) ?? projects[0];

export function Process() {
  const { reducedMotion } = useMotion();
  const ref = useRef<HTMLDivElement>(null);

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
  }, [reducedMotion]);

  return (
    <section id="process" className={styles.section}>
      <div className="container">
        <div className={styles.head}>
          <span className={styles.label}>{copy.label}</span>
          <h2 className={styles.title}>{copy.title}</h2>
          <p className={styles.body}>
            {copy.introBefore} <strong>{showcase.title}</strong> {copy.introAfter}
          </p>
        </div>

        <div className={styles.steps} ref={ref}>
          {copy.stages.map((stage, i) => {
            const img = showcase.images[i] ?? showcase.images[0];
            return (
              <div key={stage.title} className={styles.step} data-step style={reducedMotion ? { opacity: 1, transform: "none" } : undefined}>
                <div className={styles.frame}>
                  <Image
                    src={versionedSrc(img.src)}
                    alt={img.alt}
                    fill
                    sizes="(max-width: 700px) 45vw, 23vw"
                    {...placeholderProps(img.src)}
                  />
                </div>
                <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className={styles.stepTitle}>{stage.title}</h3>
                <p className={styles.stepBody}>{stage.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
