"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { ProofItem } from "@/content/proof-table";
import type { Project } from "@/content/types";
import { resizedSrc } from "@/lib/images";
import { freezeScroll, releaseScroll } from "@/lib/smooth-scroll";
import styles from "./DiscHero.module.css";

/** One DOM card, not another WebGL scene. Native dialog traps focus and handles Escape. */
export function DiscDetailCard({ item, project, suffix, origin, onClose }: {
  item: ProofItem; project?: Project; suffix: string;
  origin: { x: number; y: number }; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef(onClose);
  const backdropPress = useRef(false);
  const [closing, setClosing] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    freezeScroll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      element.close();
      releaseScroll();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const close = () => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(() => closeRef.current(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  };
  const style = { "--card-x": `${origin.x}px`, "--card-y": `${origin.y}px` } as CSSProperties;
  const outsideCard = (x: number, y: number) => {
    const rect = dialog.current!.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  };
  const meta = [item.tag, item.year || null].filter(Boolean).join(" · ");
  return <dialog ref={dialog} className={styles.detailDialog} data-closing={closing || undefined}
    style={style} aria-labelledby="disc-detail-title" data-lenis-prevent
    onCancel={e => { e.preventDefault(); close(); }}
    onPointerDown={e => { backdropPress.current = e.target === e.currentTarget && outsideCard(e.clientX, e.clientY); }}
    onClick={e => { if (e.target === e.currentTarget && backdropPress.current && outsideCard(e.clientX, e.clientY)) close(); }}>
    <article className={styles.detailCard}>
      <button type="button" autoFocus className={styles.detailClose} onClick={close} aria-label="Close title preview">×</button>
      <div className={styles.detailArtwork}>
        {item.src && !failed
          // eslint-disable-next-line @next/next/no-img-element -- bounded CDN asset; one image loaded only while open
          ? <img src={resizedSrc(item.src, 1024)} alt={item.alt || item.film} decoding="async" onError={() => setFailed(true)} />
          : <span className={styles.detailPlaceholder} aria-hidden="true">{item.film}</span>}
      </div>
      <div className={styles.detailInfo}>
        {meta && <p className={styles.detailMeta}>{meta}</p>}
        <h3 id="disc-detail-title">{item.film}</h3>
        {project && <>
          <dl>{[["Category", project.category], ["Client", project.client], ["Role", project.role]].filter(([, value]) => value?.trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {project.brief && <p className={styles.detailBrief}>{project.brief}</p>}
          <Link href={`/work/${project.slug}${suffix}`} className={styles.cta}>Open project <span aria-hidden="true">↗</span></Link>
        </>}
      </div>
    </article>
  </dialog>;
}
