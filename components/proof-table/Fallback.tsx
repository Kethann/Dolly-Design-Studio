/* eslint-disable @next/next/no-img-element -- transparent title art, laid out by CSS 3D transforms */
import type { ProofItem } from "@/content/proof-table";
import styles from "./ProofTable.module.css";

/** No WebGL: the final composition in CSS 3D — the lit table tilted in perspective with the titles on it. */
export function ProofTableFallback({ items, children }: { items: ProofItem[]; children: React.ReactNode }) {
  return (
    <div className={`${styles.stage} ${styles.revealed} ${styles.fbStage}`}>
      <div className={styles.fbScene} aria-hidden="true">
        <div className={styles.fbSlab}>
          {items.map((it) => (
            <div key={it.src} className={`${styles.fbPlate} ${it.type === "title-png" ? styles.fbSmoky : ""}`}>
              <img src={it.src} alt="" loading="lazy" decoding="async" />
              <span>
                {it.tag} · {it.film} · {it.year}
              </span>
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
