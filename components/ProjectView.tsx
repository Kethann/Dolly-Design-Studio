"use client";

import Image from "next/image";
import Link from "next/link";
import { useContent } from "@/lib/content/context";
import { edItem, edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { adjustStyle } from "@/lib/content/adjust";
import styles from "@/app/work/[slug]/page.module.css";
import { MediaPlaceholder } from "./MediaPlaceholder";
import { AddContent } from "./PreviewControls";

/**
 * One project's own page. Reads the live content, so a change made in the portal's preview shows as it is made; and
 * every part of it has an Edit button there: the project as a whole, its cover and each further picture.
 */
export function ProjectView({ slug }: { slug: string }) {
  const { projects, projectPage } = useContent();
  const index = projects.findIndex((p) => p.slug === slug);
  const project = projects[index];
  if (!project) return null;

  const sorted = [...projects].sort((a, b) => a.order - b.order);
  const at = sorted.findIndex((p) => p.slug === slug);
  const prev = sorted[(at - 1 + sorted.length) % sorted.length];
  const next = sorted[(at + 1) % sorted.length];
  const [cover, ...rest] = project.images;

  return (
    <article {...edSection("site", "project-page", "Project page wording")}>
      <div className={`container ${styles.hero}`}>
        <Link href="/work" className={styles.backLink} data-cursor="link">
          {projectPage.backLink}
        </Link>

        <div className={styles.layout} {...edItem("projects", index, project.title)}>
          <div className={styles.coverFrame} {...edItem(`projects.${index}.images`, 0, "Cover picture")}>
            {cover?.src ? <Image
              style={adjustStyle(cover, "src")}
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
          <div className={styles.restGrid}>
            {rest.map((img, k) => (
              <div key={`${img.src}-${k}`} className={styles.restFrame} {...edItem(`projects.${index}.images`, k + 1, "Picture")}>
                {img.src ? <Image src={versionedSrc(img.src)} style={adjustStyle(img, "src")} alt={img.alt} fill sizes="auto, (max-width: 520px) 92vw, 440px" quality={90} {...placeholderProps(img.src)} /> : <MediaPlaceholder />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="container">
        <div className={styles.nav}>
          <Link href={`/work/${prev.slug}`} data-cursor="link">
            ← {prev.title}
          </Link>
          <Link href={`/work/${next.slug}`} data-cursor="link">
            {next.title} →
          </Link>
        </div>
      </div>
    </article>
  );
}
