"use client";

import dynamic from "next/dynamic";
import styles from "./Backdrop.module.css";

// three.js loads on its own, after the page, so it never delays the content.
const StarField = dynamic(() => import("@/components/StarField").then((m) => m.StarField), { ssr: false });

/**
 * The site's layered background, fixed behind every page so the whole site feels like one space.
 * Back to front: the premium backdrop, the back stars and the tinted glass (all drawn by the back layer),
 * then the front stars, then the page content.
 */
export function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <StarField layer="back" />
      <StarField layer="front" />
    </div>
  );
}
