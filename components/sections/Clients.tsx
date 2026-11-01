"use client";

import { useContent, tx } from "@/lib/content/context";
import { edItem } from "@/lib/content/tx";
import { edSection } from "@/lib/content/tx";
import { useDragMarquee } from "./useDragMarquee";
import { adjustStyle } from "@/lib/content/adjust";
import styles from "./Clients.module.css";
import { renderFx } from "@/components/fx/render-fx";
import { resizedSrc, srcSetFor } from "@/lib/images";
import { AddContent, EditSectionContent } from "@/components/PreviewControls";

interface Item {
  name: string;
  /** A production house's logo. */
  logo?: string;
  /** A person's round photo. */
  photo?: string;
  /** What the picture shows. */
  alt?: string;
}

type RowProps = { items: Item[]; label: string; reverse?: boolean; speed?: string; shape?: string; size?: string; logoSize?: string; list: string };

function MarqueeTrack({ items, label, reverse, speed, shape, size, logoSize, list, secondary = false }: RowProps & { secondary?: boolean }) {
  const pixelsPerSecond = speed === "slow" ? 18 : speed === "fast" ? 48 : list === "collaborators" ? 24 : 32;
  const { viewport, track, repeats } = useDragMarquee({ pixelsPerSecond, reverse, itemCount: items.length });
  const fillItems = Array.from({ length: repeats }, () => items).flat();
  /** Each saved list has its own controls; only visual loop repeats are hidden in the portal. */
  const mark = (copy: number, i: number) => (copy === 0 && i < items.length ? edItem(list, i, items[i].name) : { "data-ed-dup": "" });
  const hasPictures = items.some((it) => it.logo || it.photo);
  return (
      <div ref={viewport} className={`${styles.viewport}${secondary ? ` ${styles.secondaryTrack}` : ""}`} data-marquee={list} data-direction={reverse ? "right" : "left"} data-shape={shape} data-size={size} data-logo={logoSize} tabIndex={0} role="region" aria-label={`${label}${secondary ? ", second track" : ""}. Hold and drag sideways, or use the left and right arrow keys.`}>
        <div ref={track} className={styles.track} aria-hidden="true">
          {[0, 1].map((copy) => (
            <div key={copy} className={styles.half}>
              {fillItems.map((it, i) =>
                hasPictures ? (
                  // A picture row: a logo (it speaks for itself) or a round photo with the name underneath, a star between.
                  <span key={i} className={styles.item} {...mark(copy, i)}>
                    <span className={styles.media}>
                      {it.logo || it.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- logos and portraits, sized by CSS
                        <img
                          src={resizedSrc((it.logo || it.photo) as string, it.photo ? 384 : 640)}
                          srcSet={srcSetFor((it.logo || it.photo) as string, [160, 320, 640, 1080])}
                          sizes={it.photo ? size === "xxlarge" ? "360px" : size === "xlarge" ? "270px" : "180px" : logoSize === "xxlarge" ? "320px" : logoSize === "xlarge" ? "240px" : "160px"}
                          alt={it.alt || ""}
                          draggable={false}
                          style={it.photo ? adjustStyle(it, "photo") : undefined}
                          className={it.photo ? styles.portrait : styles.logo}
                          loading="eager"
                          decoding="async"
                        />
                      ) : (
                        <span className={styles.textMark}>{it.name}</span>
                      )}
                    </span>
                    {it.photo && <span className={styles.caption}>{it.name}</span>}
                    <i className={styles.star} />
                  </span>
                ) : (
                  <span key={i} className={styles.name} {...mark(copy, i)}>
                    {it.name}
                    <i className={styles.star} />
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
  );
}

function Row(props: RowProps & { secondaryItems?: Item[]; secondaryReverse?: boolean; secondarySpeed?: string }) {
  return (
    <div className={styles.row} data-row={props.list}>
      <span className={styles.rowLabel}><span>{props.label}</span><span className={styles.dragHint} aria-hidden="true">Hold & drag ↔</span></span>
      {props.list === "clients" && <EditSectionContent section="home:clients" label={`Row 1 · ${props.items.length} logos · ${props.reverse ? "Right →" : "← Left"} · Manage row`} />}
      {props.list === "collaborators" && <EditSectionContent section="home:clients" label="Filmmakers & actors · Track size & settings" />}
      <AddContent list={props.list} label={props.list === "clients" ? "Add to production track 1" : "Add collaborator"} count={props.items.length} />
      {props.items.length > 0 && <MarqueeTrack {...props} />}
      {props.secondaryItems && <>
        <EditSectionContent section="home:clients" label={`Row 2 · ${props.secondaryItems.length} logos · ${props.secondaryReverse ? "Right →" : "← Left"} · Manage row`} />
        <AddContent list="clientsSecond" label="Add to production track 2" count={props.secondaryItems.length} />
        {props.secondaryItems.length > 0 && <MarqueeTrack {...props} items={props.secondaryItems} list="clientsSecond" speed={props.secondarySpeed} reverse={props.secondaryReverse ?? true} secondary />}
      </>}
    </div>
  );
}

/** Three independently directed tracks, each with its own editable content. */
export function Clients() {
  const { home, clients, clientsSecond, collaborators, testimonials } = useContent();
  const names = [...new Set([...clients, ...clientsSecond, ...collaborators].map((c) => c.name))];
  const labels = home.clients.rowLabels;

  return (
    <section id="clients" className={styles.section} {...edSection("home", "clients", "Clients & collaborations")}>
      <div className="container">
        <span className={styles.label} {...tx("home.clients.label")}>{renderFx(home.clients.label)}</span>
        <h2 className={styles.title} {...tx("home.clients.title")}>{renderFx(home.clients.title)}</h2>
      </div>

      <div className={styles.rows}>
        <Row items={clients} list="clients" label={labels.clients} logoSize={home.clients.logoSize} speed={home.clients.productionSpeed} secondarySpeed={home.clients.productionSecondSpeed} reverse={home.clients.productionDirection === "right"} secondaryReverse={home.clients.productionSecondDirection !== "left"} secondaryItems={clientsSecond} />
        <Row items={collaborators} list="collaborators" label={labels.collaborators} shape={home.clients.portraitShape} size={home.clients.portraitSize} reverse={home.clients.filmmakersDirection === "right"} />
      </div>
      <p className="sr-only">
        {home.clients.screenReaderIntro} {names.join(", ")}.
      </p>

      {testimonials.length > 0 && (
        <div className="container">
          <blockquote className={styles.quote}>
            <p>“{testimonials[0].quote}”</p>
            <footer>
              {testimonials[0].name} · {testimonials[0].role}
            </footer>
          </blockquote>
        </div>
      )}
    </section>
  );
}
