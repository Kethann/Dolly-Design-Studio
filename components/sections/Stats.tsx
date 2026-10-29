"use client";

import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection } from "@/lib/content/tx";
import { CountUp } from "@/components/CountUp";
import styles from "./Stats.module.css";

/** Years of experience · projects · clients, right under the agency statement. */
export function Stats() {
  const { home } = useContent();
  return (
    <section className={styles.section} aria-label="Studio in numbers" {...edSection("home", "numbers", "The numbers")}>
      <div className={`container ${styles.row}`}>
        {home.stats.map((s, i) => (
          <div key={s.label} className={`glass-panel ${styles.stat}`} {...edItem("home.stats", i, "Number")}>
            <div className={styles.value} {...tx("home.stats.value")}>
              <CountUp value={s.value} suffix={s.suffix} />
            </div>
            <div className={styles.label} {...tx("home.stats.label")}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
