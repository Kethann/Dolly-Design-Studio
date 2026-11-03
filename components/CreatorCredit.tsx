"use client";

import { useState } from "react";
import { creatorCredit, creditLogoSource } from "@/config/creator-credit";
import styles from "./CreatorCredit.module.css";

/** Not connected to the content context or preview edit markers. The studio cannot edit this credit in its portal. */
export function CreatorCredit() {
  const [failedSource, setFailedSource] = useState("");
  const source = creditLogoSource(creatorCredit.logo.src);
  const showLogo = creatorCredit.mode !== "text" && !!source && failedSource !== source;
  const showText = creatorCredit.mode !== "logo" || !showLogo;
  const name = creatorCredit.name.trim() || "Kethan";
  const label = creatorCredit.label?.trim() || "Web developed by";
  return (
    <div className={styles.credit} data-creator-credit>
      <span className={styles.label}>{label} –</span>
      {showLogo && (
        // eslint-disable-next-line @next/next/no-img-element -- Small code-managed brand asset; no portal transformations or uploads.
        <img className={styles.logo} src={source} alt={showText ? "" : name}
          width={creatorCredit.logo.width} height={creatorCredit.logo.height}
          loading="lazy" decoding="async" onError={() => setFailedSource(source)} />
      )}
      {showText && <span className={styles.name}>{name}</span>}
    </div>
  );
}
