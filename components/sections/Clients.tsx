"use client";

import { useContent, tx } from "@/lib/content/context";
import { edItem } from "@/lib/content/tx";
import { edSection } from "@/lib/content/tx";
import { useDragMarquee } from "./useDragMarquee";
import { adjustStyle } from "@/lib/content/adjust";
import styles from "./Clients.module.css";

interface Item {
  name: string;
  /** A production house's logo. */
  logo?: string;
  /** A person's round photo. */
  photo?: string;
  /** What the picture shows. */
  alt?: string;
}

/** The items repeated so one copy is always wider than a screen. */
const fill = (items: Item[]) => Array.from({ length: Math.max(2, Math.ceil(14 / items.length)) }, () => items).flat();

function Row({ items, label, reverse, shape, size, logoSize, list }: { items: Item[]; label: string; reverse?: boolean; shape?: string; size?: string; logoSize?: string; /** The content list this row shows (clients or collaborators), so each entry can be edited. */ list: string }) {
  const fillItems = fill(items);
  const { viewport, track } = useDragMarquee({ seconds: reverse ? 140 : 120, reverse });
  /** What marks an entry for the portal's Edit button: only the first set of the first copy; repeats are hidden while editing. */
  const mark = (copy: number, i: number) => (copy === 0 && i < items.length ? edItem(list, i, items[i].name) : { "data-ed-dup": "" });
  const hasPictures = items.some((it) => it.logo || it.photo);
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div ref={viewport} className={styles.viewport} data-shape={shape} data-size={size} data-logo={logoSize} aria-hidden="true">
        <div ref={track} className={styles.track}>
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
                          src={(it.logo || it.photo) as string}
                          alt={it.alt || ""}
                          draggable={false}
                          style={it.photo ? adjustStyle(it, "photo") : undefined}
                          className={it.photo ? styles.portrait : styles.logo}
                          loading="lazy"
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
    </div>
  );
}

/** Clients & collaborations: two tracks drifting in opposite directions (hold and drag either one sideways) — production houses, then the people. */
export function Clients() {
  const { home, clients, collaborators, testimonials } = useContent();
  const names = [...clients.map((c) => c.name), ...collaborators.map((c) => c.name)];
  const labels = home.clients.rowLabels;

  return (
    <section id="clients" className={styles.section} {...edSection("home", "clients", "Clients & collaborations")}>
      <div className="container">
        <span className={styles.label} {...tx("home.clients.label")}>{home.clients.label}</span>
        <h2 className={styles.title} {...tx("home.clients.title")}>{home.clients.title}</h2>
      </div>

      <div className={styles.rows}>
        <Row items={clients} list="clients" label={labels.clients} logoSize={home.clients.logoSize} />
        <Row items={collaborators} list="collaborators" label={labels.collaborators} reverse shape={home.clients.portraitShape} size={home.clients.portraitSize} />
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
