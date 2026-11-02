"use client";

import { useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { Project } from "@/content/types";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { adjustStyle } from "@/lib/content/adjust";
import { edItem } from "@/lib/content/tx";
import styles from "./ProjectCard.module.css";
import { MediaPlaceholder } from "./MediaPlaceholder";
import { ProjectGalleryDialog, type PosterOrigin } from "./ProjectGalleryDialog";
import { ProjectTitleArt } from "./ProjectTitleArt";

export function ProjectCard({ project, index, priority = false, showDetails = true, sizes = "(max-width: 520px) 100vw, (max-width: 900px) 50vw, 400px" }: { project: Project; /** Its place in the content's project list (the Edit button needs it). */ index?: number; priority?: boolean; showDetails?: boolean; sizes?: string }) {
  const cover = project.images[0];
  const trigger = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState<PosterOrigin | null>(null);
  // Sizes typed titles by their longest word, so a word is never split across two lines.
  const longestWord = Math.max(1, ...project.title.split(/\s+/).map((word) => word.length));

  return (
    <>
    <button
      ref={trigger}
      type="button"
      className={styles.card}
      aria-label={`View ${project.title} artwork`}
      aria-haspopup="dialog"
      data-project-poster={project.slug}
      data-cursor="poster"
      data-cursor-label="View artwork"
      onClick={(event) => {
        if (event.defaultPrevented || document.documentElement.dataset.ddsDragged) return;
        const rect = event.currentTarget.querySelector('[data-poster-frame]')!.getBoundingClientRect();
        setOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width });
      }}
      {...(index === undefined ? {} : edItem("projects", index, project.title))}
    >
      <span className={styles.frame} data-poster-frame data-glow="poster">
        <span className={styles.turn}>
        <span className={styles.front}>
        {cover?.src ? <Image
          style={adjustStyle(cover, "src")}
          src={versionedSrc(cover.src)}
          alt={cover.alt}
          fill
          sizes={priority ? sizes : `auto, ${sizes}`}
          quality={90}
          {...placeholderProps(cover.src)}
          priority={priority}
        /> : <MediaPlaceholder />}
        <span className={styles.corner} />
        </span>
        <span className={styles.back} aria-hidden="true" data-has-art={project.titleImage ? true : undefined}>
          <span className={styles.backCategory}>{project.category} · {project.year}</span>
          {project.titleImage
            ? <ProjectTitleArt project={project} className={styles.backArt} />
            : <span className={styles.backTitle} style={{ "--longest-word": longestWord } as CSSProperties}>{project.title}</span>}
          <span className={styles.backAction}>Explore artwork <span>↗</span></span>
        </span>
        </span>
      </span>
      {showDetails && (
      <span className={styles.meta}>
        <span className={styles.title}>{project.title}</span>
        <span className={styles.sub}>
          {project.category} · {project.year}
        </span>
      </span>
      )}
    </button>
    {origin && <ProjectGalleryDialog project={project} origin={origin} onClose={() => {
      setOrigin(null);
      trigger.current?.focus({ preventScroll: true });
    }} />}
    </>
  );
}
