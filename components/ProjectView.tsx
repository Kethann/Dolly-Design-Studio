"use client";

import Image from "next/image";
import Link from "next/link";
import { useContent } from "@/lib/content/context";
import { edItem, edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { workImageStyle } from "@/lib/content/adjust";
import styles from "@/app/work/[slug]/page.module.css";
import { MediaPlaceholder } from "./MediaPlaceholder";
import { AddContent } from "./PreviewControls";
import { NavigationTrail } from "./NavigationTrail";
import { ProjectImageStack } from "./ProjectImageStack";

/**
 * One project's own page. Reads the live content, so a change made in the portal's preview shows as it is made; and
 * every part of it has an Edit button there: the project as a whole, its cover and each further picture.
 */
export function ProjectView({ slug }: { slug: string }) {
  const { projects, projectPage } = useContent();
  const index = projects.findIndex((p) => p.slug === slug);
  const project = projects[index];
  if (!project) return null;

  // The legacy title collection keeps its own URL, but is not a poster in the project sequence.
  const sorted = projects.filter((item) => item.slug !== "title-designs").sort((a, b) => a.order - b.order);
  const at = sorted.findIndex((p) => p.slug === slug);
  const prev = sorted.length ? sorted[at < 0 ? sorted.length - 1 : (at - 1 + sorted.length) % sorted.length] : null;
  const next = sorted.length ? sorted[at < 0 ? 0 : (at + 1) % sorted.length] : null;
  const [cover, ...rest] = project.images;

  return (
    <article {...edSection("site", "project-page", "Project page wording")}>
      <div className={`container ${styles.hero}`}>
        <NavigationTrail />

        <div className={styles.layout} {...edItem("projects", index, project.title)}>
          <div className={styles.coverFrame} {...edItem(`projects.${index}.images`, 0, "Cover picture")}>
            {cover?.src ? <Image
              style={workImageStyle(cover)}
              src={versionedSrc(cover.src)}
              alt={cover.alt}
              fill
              sizes="(max-width: 899px) 92vw, (max-width: 1360px) 45vw, 600px"
              quality={95}
              {...placeholderProps(cover.src)}
              priority
            /> : <MediaPlaceholder />}
          </div>

          <div className={styles.meta}>
            <span className={styles.category}>{project.category}</span>
            <h1 className={styles.title}>{project.title}</h1>
            <p className={styles.film}>
              {project.film} · {project.year}
            </p>
            <p className={styles.brief}>{project.brief}</p>

            <div className={styles.credits}>
              <div className={styles.creditRow}>
                <span className={styles.creditLabel}>{projectPage.clientLabel}</span>
                <span>{project.client}</span>
              </div>
              <div className={styles.creditRow}>
                <span className={styles.creditLabel}>{projectPage.roleLabel}</span>
                <span>{project.role}</span>
              </div>
              {project.credits?.map((c) => (
                <div key={c.label} className={styles.creditRow}>
                  <span className={styles.creditLabel}>{c.label}</span>
                  <span>{c.value}</span>
                </div>
              ))}
            </div>

            <div className={styles.deliverables}>
              {project.deliverables.map((d) => (
                <span key={d} className={styles.chip}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <AddContent list={`projects.${index}.images`} label="Add image card" count={project.images.length} />
      </div>
      {rest.length > 0 && (
        <div className="container">
          <ProjectImageStack key={slug} images={rest} projectIndex={index} />
        </div>
      )}

      {prev && next && <div className="container">
        <div className={styles.nav}>
          <Link href={`/work/${prev.slug}`} data-cursor="link">
            ← {prev.title}
          </Link>
          <Link href={`/work/${next.slug}`} data-cursor="link">
            {next.title} →
          </Link>
        </div>
      </div>}
    </article>
  );
}
