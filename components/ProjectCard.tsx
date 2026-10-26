import Link from "next/link";
import Image from "next/image";
import type { Project } from "@/content/types";
import { sharedLabels } from "@/content/pages";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./ProjectCard.module.css";

export function ProjectCard({ project, priority = false }: { project: Project; priority?: boolean }) {
  const cover = project.images[0];

  return (
    <Link
      href={`/work/${project.slug}`}
      className={styles.card}
      data-cursor="poster"
      data-cursor-label={sharedLabels.posterHover}
    >
      <div className={styles.frame}>
        <Image
          src={versionedSrc(cover.src)}
          alt={cover.alt}
          fill
          sizes="(max-width: 700px) 92vw, (max-width: 1100px) 44vw, 28vw"
          {...placeholderProps(cover.src)}
          priority={priority}
        />
        <span className={styles.corner} />
      </div>
      <div className={styles.meta}>
        <h3 className={styles.title}>{project.title}</h3>
        <p className={styles.sub}>
          {project.category} · {project.year}
        </p>
      </div>
    </Link>
  );
}
