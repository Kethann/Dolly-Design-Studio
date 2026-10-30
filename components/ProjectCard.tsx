import Link from "next/link";
import Image from "next/image";
import type { Project } from "@/content/types";
import { sharedLabels } from "@/content/pages";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { adjustStyle } from "@/lib/content/adjust";
import { edItem } from "@/lib/content/tx";
import styles from "./ProjectCard.module.css";
import { MediaPlaceholder } from "./MediaPlaceholder";

export function ProjectCard({ project, index, priority = false, showDetails = true, sizes = "(max-width: 520px) 100vw, (max-width: 900px) 50vw, 400px" }: { project: Project; /** Its place in the content's project list (the Edit button needs it). */ index?: number; priority?: boolean; showDetails?: boolean; sizes?: string }) {
  const cover = project.images[0];

  return (
    <Link
      href={`/work/${project.slug}`}
      className={styles.card}
      data-cursor="poster"
      data-cursor-label={sharedLabels.posterHover}
      {...(index === undefined ? {} : edItem("projects", index, project.title))}
    >
      <div className={styles.frame} data-glow="poster">
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
      </div>
      {showDetails && (
      <div className={styles.meta}>
        <h3 className={styles.title}>{project.title}</h3>
        <p className={styles.sub}>
          {project.category} · {project.year}
        </p>
      </div>
      )}
    </Link>
  );
}
