"use client";

import { useContent, tx } from "@/lib/content/context";
import { CountUp } from "@/components/CountUp";
import styles from "./Stats.module.css";

/** Years of experience · projects · clients, right under the agency statement. */
export function Stats() {
  const { home } = useContent();
  return (
    <section className={styles.section} aria-label="Studio in numbers">
      <div className={`container ${styles.row}`}>
        {home.stats.map((s) => (
          <div key={s.label} className={styles.stat}>
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
