"use client";

import Image from "next/image";
import Link from "next/link";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { useContent } from "@/lib/content/context";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./TitleDesignTrack.module.css";

type TrackItem = { src: string; label: string; alt: string; slug?: string };

/** Titles are managed in the slate, not as a poster project. Legacy project images are a safe fallback. */
export function TitleDesignTrack() {
  const { settings } = useIntroSettings();
  const { projects } = useContent();
  const legacy = projects.find((project) => project.slug === "title-designs");
  const projectSlugs = new Set(projects.map((project) => project.slug));
  const projectArt = (legacy?.images ?? []).filter((image) => image.src).map((image) => ({
    src: image.src, label: image.alt.split(/[\u2014,]/)[0], alt: image.alt, slug: legacy!.slug,
  }));
  const slateArt = settings.proofTable.items.map((item) => ({
    src: item.src, label: item.film, alt: item.alt || `${item.film} title design`, slug: item.slug,
  }));
  // A new site may have no title uploads yet. Its saved title names still make the track usable.
  const uploaded = slateArt.filter((item) => item.src);
  const items: TrackItem[] = uploaded.length ? uploaded : projectArt.length ? projectArt : slateArt.length ? slateArt : [{ src: "", label: "Title Designs", alt: "Title Designs" }];
  const repeated = Array.from({ length: Math.ceil(6 / items.length) }, () => items).flat();

  const cards = (duplicate: boolean) => repeated.map((item, i) => {
    const decorative = duplicate || i >= items.length;
    const content = <>
      <span className={styles.art}>
        {item.src ? <Image src={versionedSrc(item.src)} alt={decorative ? "" : item.alt} fill sizes="(max-width: 600px) 220px, 300px" quality={85} {...placeholderProps(item.src)} />
          : <span className={styles.fallback}>{item.label}</span>}
      </span>
      <span className={styles.caption}>{item.label}</span>
    </>;
    const key = `${duplicate ? "copy" : "original"}-${i}`;
    return !decorative && item.slug && projectSlugs.has(item.slug)
      ? <Link className={styles.card} key={key} href={`/work/${item.slug}`} aria-label={`View ${item.label} artwork`} data-cursor="link">{content}</Link>
      : <span className={styles.card} key={key} aria-hidden={decorative ? "true" : undefined}>{content}</span>;
  });

  return (
    <section id="title-designs" className={styles.section} aria-label="Title designs">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>The art of the name</span>
          <h2>Title Designs</h2>
        </div>
      </div>
      <div className={styles.viewport}>
        <div className={styles.track}>
          <div className={styles.group}>{cards(false)}</div>
          <div className={styles.group} aria-hidden="true">{cards(true)}</div>
        </div>
      </div>
    </section>
  );
}
