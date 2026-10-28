"use client";

import { useContent, tx } from "@/lib/content/context";
import styles from "./Clients.module.css";

interface Item {
  name: string;
  /** A production house's logo. */
  logo?: string;
  /** A person's round photo. */
  photo?: string;
}

/** The items repeated so one copy is always wider than a screen. */
const fill = (items: Item[]) => Array.from({ length: Math.max(2, Math.ceil(14 / items.length)) }, () => items).flat();

function Row({ items, label, reverse }: { items: Item[]; label: string; reverse?: boolean }) {
  const list = fill(items);
  const hasPictures = items.some((it) => it.logo || it.photo);
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.viewport} aria-hidden="true">
        <div className={`${styles.track} ${reverse ? styles.reverse : ""}`}>
          {[0, 1].map((copy) => (
            <div key={copy} className={styles.half}>
              {list.map((it, i) =>
                hasPictures ? (
                  // A picture row: a logo (it speaks for itself) or a round photo with the name underneath, a star between.
                  <span key={i} className={styles.item}>
                    <span className={styles.media}>
                      {it.logo || it.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- logos and portraits, sized by CSS
                        <img
                          src={(it.logo || it.photo) as string}
                          alt=""
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
                  <span key={i} className={styles.name}>
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

/** Clients & collaborations: two marquee rows drifting in opposite directions — production houses, then the people. */
export function Clients() {
  const { home, clients, collaborators, testimonials } = useContent();
  const names = [...clients.map((c) => c.name), ...collaborators.map((c) => c.name)];
  const labels = home.clients.rowLabels;

  return (
    <section id="clients" className={styles.section}>
      <div className="container">
        <span className={styles.label} {...tx("home.clients.label")}>{home.clients.label}</span>
        <h2 className={styles.title} {...tx("home.clients.title")}>{home.clients.title}</h2>
      </div>

      <div className={styles.rows}>
        <Row items={clients} label={labels.clients} />
        <Row items={collaborators} label={labels.collaborators} reverse />
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
