import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/store";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./page.module.css";

export async function generateStaticParams() {
  const { projects } = await getContent();
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = (await getContent()).projects.find((p) => p.slug === slug);
  if (!project) return {};
  return {
    title: project.title,
    description: project.brief,
    openGraph: { title: project.title, description: project.brief, images: [{ url: versionedSrc(project.images[0].src) }] },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projects, site, projectPage } = await getContent();
  const sorted = [...projects].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((p) => p.slug === slug);
  const project = sorted[index];
  if (!project) notFound();

  const prev = sorted[(index - 1 + sorted.length) % sorted.length];
  const next = sorted[(index + 1) % sorted.length];
  const [cover, ...rest] = project.images;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    about: project.film,
    creator: { "@type": "Organization", name: site.name },
    datePublished: String(project.year),
    image: project.images.map((i) => versionedSrc(i.src)),
    description: project.brief,
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className={`container ${styles.hero}`}>
        <Link href="/work" className={styles.backLink} data-cursor="link">
          {projectPage.backLink}
        </Link>

        <div className={styles.layout}>
          <div className={styles.coverFrame}>
            <Image
              src={versionedSrc(cover.src)}
              alt={cover.alt}
              fill
              sizes="(max-width: 900px) 92vw, 46vw"
              quality={95}
              {...placeholderProps(cover.src)}
              priority
            />
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

      {rest.length > 0 && (
        <div className="container">
          <div className={styles.restGrid}>
            {rest.map((img) => {
              return (
                <div key={img.src} className={styles.restFrame}>
                  <Image
                    src={versionedSrc(img.src)}
                    alt={img.alt}
                    fill
                    sizes="(max-width: 700px) 92vw, 30vw"
                    quality={90}
                    {...placeholderProps(img.src)}
                  />
                </div>
              );
            })}
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
