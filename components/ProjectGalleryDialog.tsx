"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Project } from "@/content/types";
import { ProjectImageStack } from "./ProjectImageStack";
import { ProjectTitleArt } from "./ProjectTitleArt";
import styles from "./ProjectGalleryDialog.module.css";

export type PosterOrigin = { x: number; y: number; width: number };

export function ProjectGalleryDialog({ project, origin, onClose }: { project: Project; origin: PosterOrigin; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropPress = useRef(false);
  const heading = useId();
  const close = () => {
    const element = dialog.current;
    if (!element || element.dataset.closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    element.dataset.closing = "true";
    closeTimer.current = setTimeout(onClose, 220);
  };
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    delete element.dataset.entering;
    element.showModal();
    document.documentElement.style.overflow = "hidden";
    const card = element.querySelector('[aria-current="true"]')!.getBoundingClientRect();
    const arrival = element.querySelector(`.${styles.arrival}`)!.getBoundingClientRect();
    element.style.setProperty("--poster-dx", `${origin.x - card.left - card.width / 2}px`);
    element.style.setProperty("--poster-dy", `${origin.y - card.top - card.height / 2}px`);
    element.style.setProperty("--poster-scale", String(Math.min(2, Math.max(.1, origin.width / Math.max(1, card.width)))));
    element.style.setProperty("--poster-pivot-y", `${card.top + card.height / 2 - arrival.top}px`);
    element.dataset.entering = "true";
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      element.close();
      delete element.dataset.entering;
      document.documentElement.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [origin]);
  const images = project.images.length ? project.images : [{ src: "", alt: project.title }];
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={heading}
    data-project-gallery={project.slug} data-lenis-prevent
    onCancel={(event) => { event.preventDefault(); close(); }}
    onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
    onClick={(event) => { if (backdropPress.current && event.target === event.currentTarget) close(); }}>
    <div className={styles.panel}>
      <header className={styles.header}>
        <div><p>{project.category} · {project.year}</p><h2 id={heading}>{project.title}</h2></div>
        <button type="button" className={styles.close} onClick={close} autoFocus aria-label="Close project gallery">×</button>
      </header>
      <div className={styles.arrival}>
        <div className={styles.reveal}>
          <div className={styles.titleBack} aria-hidden="true">{project.titleImage ? <ProjectTitleArt project={project} className={styles.titleArt} /> : project.title}</div>
          <div className={styles.artworkFront}><ProjectImageStack key={project.slug} images={images} initialIndex={0} imageOffset={0} compact /></div>
        </div>
      </div>
      <footer className={styles.footer}>
        <span>{images.length > 1 ? "Swipe, select a card, or use the arrows" : "Project artwork"}</span>
        <Link href={`/work/${project.slug}`} onClick={onClose}>View project details ↗</Link>
      </footer>
    </div>
  </dialog>, document.body);
}
