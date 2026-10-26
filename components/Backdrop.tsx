"use client";

import dynamic from "next/dynamic";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { glassFill } from "@/lib/intro/glass";
import styles from "./Backdrop.module.css";

// three.js loads on its own, after the page, so it never delays the content.
const StarField = dynamic(() => import("@/components/StarField").then((m) => m.StarField), { ssr: false });

/** The lasting stars and the dark tinted glass, fixed behind every page so the whole site feels like one space. */
export function Backdrop({ revealed }: { revealed: boolean }) {
  const { settings } = useIntroSettings();
  return (
    <div className={styles.backdrop} data-revealed={revealed} aria-hidden="true">
      <StarField />
      <div
        className={styles.glass}
        style={{ backgroundColor: glassFill(settings), "--glass-frost": `${settings.glassFrost}px` } as React.CSSProperties}
      />
    </div>
  );
}
