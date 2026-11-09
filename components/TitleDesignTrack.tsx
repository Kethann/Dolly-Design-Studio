"use client";

import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { renderFx } from "@/components/fx/render-fx";
import { AddContent, EditSectionContent } from "./PreviewControls";
import styles from "./TitleDesignTrack.module.css";

/**
 * The "Title Designs" strip under the project gallery. Its titles are a list of their own (content.titleDesigns), edited in
 * the portal's "Title designs strip" window: adding, editing or deleting one never touches the projects or the slate.
 */
export function TitleDesignTrack() {
  const { home, titleDesigns } = useContent();
  const items = titleDesigns.filter((item) => item.image || item.name);
  // Enough copies for a seamless loop on a wide screen.
  const repeated = items.length ? Array.from({ length: Math.ceil(6 / items.length) }, () => items).flat() : [];

  const cards = (duplicate: boolean) => repeated.map((item, i) => {
    const original = !duplicate && i < items.length;
    // Only the first copy of each title carries its portal controls; the loop's repeats are hidden while editing.
    const mark = original ? edItem("titleDesigns", titleDesigns.indexOf(item), item.name || "Title") : { "data-ed-dup": "" };
    return (
      <span className={styles.card} key={`${duplicate ? "copy" : "original"}-${i}`} aria-hidden={original ? undefined : "true"} {...mark}>
        <span className={styles.art}>
          {item.image ? <Image src={versionedSrc(item.image)} alt={original ? item.alt || `${item.name} title design` : ""} fill sizes="(max-width: 600px) 220px, 300px" quality={85} draggable={false} {...placeholderProps(item.image)} />
            : <span className={styles.fallback}>{item.name}</span>}
        </span>
        <span className={styles.caption}>{item.name}</span>
      </span>
    );
  });

  return (
    <section id="title-designs" className={styles.section} data-empty={items.length ? undefined : ""} aria-label={home.titleDesigns.title || "Title designs"} {...edSection("home", "titleDesigns", "Title designs strip")}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow} {...tx("home.titleDesigns.label")}>{renderFx(home.titleDesigns.label)}</span>
          <h2 {...tx("home.titleDesigns.title")}>{renderFx(home.titleDesigns.title)}</h2>
        </div>
      </div>
      <div className={styles.controls}>
        <EditSectionContent section="home:titleDesigns" label={`Title designs strip · ${items.length} titles · Manage`} />
        <AddContent list="titleDesigns" label="Add a title to the strip" count={titleDesigns.length} max={100} />
      </div>
      {items.length > 0 && (
        <div className={styles.viewport}>
          <div className={styles.track} style={{ animationDuration: `${repeated.length * 6}s` }}>
            <div className={styles.group}>{cards(false)}</div>
            <div className={styles.group} aria-hidden="true">{cards(true)}</div>
          </div>
        </div>
      )}
    </section>
  );
}
