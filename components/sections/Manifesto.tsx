"use client";

import { Fragment, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { useMotion } from "@/lib/motion";
import styles from "./Manifesto.module.css";
import { renderFx } from "@/components/fx/render-fx";
import { ParticleText } from "@/components/fx/ParticleText";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

function renderStatement(statement: string) {
  // "*word word*" segments are set in gold italic; everything else is lit word-by-word.
  const segments = statement.split(/\*(.+?)\*/g);
  let wordIndex = 0;
  return segments.map((seg, i) => {
    if (i % 2 === 1) {
      wordIndex += 1;
      return (
        <span key={i} className={styles.gold}>
          {seg}
        </span>
      );
    }
    return (
      <Fragment key={i}>
        {seg.split(" ").map((w, j) => {
          if (!w) return null;
          // A [[word]] keeps its place in the line as the particle word (it is always lit; the rest light up as you scroll).
          const fx = /^\[\[(.+)\]\]([.,!?;:]*)$/.exec(w);
          if (fx) {
            return (
              <Fragment key={j}>
                <ParticleText>{fx[1]}</ParticleText>
                {fx[2]}{" "}
              </Fragment>
            );
          }
          wordIndex += 1;
          return (
            <Fragment key={j}>
              <span className={styles.word} data-word={wordIndex}>
                {w}
              </span>{" "}
            </Fragment>
          );
        })}
      </Fragment>
    );
  });
}

export function Manifesto() {
  const { home } = useContent();
  const { reducedMotion } = useMotion();
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const words = ref.current?.querySelectorAll<HTMLElement>("[data-word]");
    if (!words || !words.length) return;

    if (reducedMotion) {
      words.forEach((w) => w.classList.add(styles.wordLit));
      return;
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ref.current,
        start: "top 75%",
        end: "bottom 55%",
        scrub: 0.4,
      },
    });
    tl.to(words, { color: "var(--ivory)", stagger: 0.08, ease: "none" });

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [reducedMotion, home.manifesto.statement]);

  return (
    <section id="agency" className={styles.section} {...edSection("home", "agency", "About the agency")}>
      <div className={`container ${styles.inner}`}>
        <span className={styles.label} {...tx("home.manifesto.label")}>{renderFx(home.manifesto.label)}</span>
        <p ref={ref} className={styles.statement} {...tx("home.manifesto.statement")}>
          {renderStatement(home.manifesto.statement)}
        </p>
        <p className={styles.body} {...tx("home.manifesto.body")}>{renderFx(home.manifesto.body)}</p>
      </div>
    </section>
  );
}
