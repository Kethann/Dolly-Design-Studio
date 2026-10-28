"use client";

import { usePathname } from "next/navigation";
import { useContent } from "@/lib/content/context";
import { pageKeyOf } from "@/lib/content/page-key";
import { versionedSrc } from "@/lib/images";
import styles from "./Backdrop.module.css";

/** A picture behind a page's content (set per page in the portal), softened by the page's background colour. */
export function PageBackdrop() {
  const pathname = usePathname();
  const { pages } = useContent();
  const look = pages[pageKeyOf(pathname)];
  if (!look.backdrop) return null;
  return (
    <div className={styles.pagePicture} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- one full-screen picture, sized by CSS */}
      <img src={versionedSrc(look.backdrop)} alt="" decoding="async" />
      <div className={styles.pageDim} style={{ opacity: look.backdropDim }} />
    </div>
  );
}
