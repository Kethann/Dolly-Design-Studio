"use client";

import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection, edList } from "@/lib/content/tx";
import { CountUp } from "@/components/CountUp";
import styles from "./Stats.module.css";
import { renderFx } from "@/components/fx/render-fx";
import { AddContent } from "@/components/PreviewControls";

/** Years of experience · projects · clients, right under the agency statement. */
export function Stats() {
  const { home } = useContent();
  return (
    <section className={styles.section} aria-label="Studio in numbers" {...edSection("home", "numbers", "The numbers")}>
      <div className="container"><AddContent list="home.stats" label="Add number card" count={home.stats.length} max={6} /></div>
      <div className={`container ${styles.row}`} {...edList("home.stats", "number", 6)}>
        {home.stats.map((s, i) => (
          <div key={s.label} className={`glass-panel ${styles.stat}`} {...edItem("home.stats", i, "Number")}>
            <div className={styles.value} {...tx("home.stats.value")}>
              <CountUp key={`${s.value}:${s.suffix}`} value={s.value} suffix={s.suffix} />
            </div>
            <div className={styles.label} {...tx("home.stats.label")}>{renderFx(s.label)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
