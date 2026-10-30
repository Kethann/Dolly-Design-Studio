"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useContent } from "@/lib/content/context";
import { edItem, edList, edSection } from "@/lib/content/tx";
import { MAX_PROCESS_ITEMS, extraOf, type ProcessItem } from "@/lib/content/process";
import { versionedSrc } from "@/lib/images";
import { freezeScroll, releaseScroll } from "@/lib/smooth-scroll";
import styles from "./ProcessView.module.css";

/** How a picture sits in its frame: filled or whole, zoomed, and moved (all set per card in the portal). */
const pictureStyle = (it: ProcessItem): React.CSSProperties => ({
  objectFit: it.fit,
  objectPosition: `${it.imageX}% ${it.imageY}%`,
  transformOrigin: `${it.imageX}% ${it.imageY}%`,
  transform: it.imageZoom !== 1 ? `scale(${it.imageZoom})` : undefined,
});

/** A picture opened large: the whole of it, with arrows (and ← →) to the next, and Escape to close. */
function Lightbox({ items, at, onAt, onClose }: { items: { it: ProcessItem; index: number }[]; at: number; onAt: (i: number) => void; onClose: () => void }) {
  const cur = items[at];
  useEffect(() => {
    freezeScroll();
    return () => releaseScroll();
  }, []);
  useEffect(() => {
    const last = items.length - 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onAt(at >= last ? 0 : at + 1);
      else if (e.key === "ArrowLeft") onAt(at <= 0 ? last : at - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, items.length, onAt, onClose]);
  if (!cur) return null;
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={cur.it.title || "Picture"} onClick={onClose}>
      <button type="button" className={styles.lbClose} onClick={onClose} aria-label="Close" data-cursor="link">
        ✕
      </button>
      {items.length > 1 && (
        <button
          type="button"
          className={`${styles.lbStep} ${styles.lbPrev}`}
          aria-label="Previous picture"
          data-cursor="link"
          onClick={(e) => {
            e.stopPropagation();
            onAt(at <= 0 ? items.length - 1 : at - 1);
          }}
        >
          ‹
        </button>
      )}
      <figure className={styles.lbFigure} onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- any picture format, shown whole */}
        <img src={versionedSrc(cur.it.image)} alt={cur.it.title || ""} />
        {(cur.it.title || cur.it.note) && (
          <figcaption>
            {cur.it.title && <strong>{cur.it.title}</strong>}
            {cur.it.note && <span>{cur.it.note}</span>}
          </figcaption>
        )}
      </figure>
      {items.length > 1 && (
        <button
          type="button"
          className={`${styles.lbStep} ${styles.lbNext}`}
          aria-label="Next picture"
          data-cursor="link"
          onClick={(e) => {
            e.stopPropagation();
            onAt(at >= items.length - 1 ? 0 : at + 1);
          }}
        >
          ›
        </button>
      )}
    </div>
  );
}

/**
 * The inside of a "How we work" card: its own page, with the cards the studio has put in it. Reads the live content, so the
 * portal's preview shows every change as it is made; the page itself and each card have an Edit button there, and the
 * list has a "＋ Add" button, even when it is empty.
 */
export function ProcessView({ slug }: { slug: string }) {
  const { home } = useContent();
  const cards = home.process.cards;
  const pages = cards.map((c) => extraOf(c));
  const index = pages.findIndex((p) => p.slug === slug);
  const [open, setOpen] = useState<number | null>(null);

  if (index < 0) {
    return (
      <section className={styles.page}>
        <div className="container">
          <Link href="/#process" className={styles.back} data-cursor="link">
            ← How we work
          </Link>
          <p className={styles.emptyText}>This page isn’t available any more.</p>
        </div>
      </section>
    );
  }

  const card = cards[index];
  const page = pages[index];
  const listPath = `home.process.cards.${index}.items`;
  const withPictures = page.items.map((it, i) => ({ it, index: i })).filter((x) => x.it.image);
  const next = pages[(index + 1) % pages.length];
  const prev = pages[(index - 1 + pages.length) % pages.length];
  const intro = page.pageIntro.trim() || card.body;

  return (
    <article className={styles.page} {...edSection("home", "process", "How we work")}>
      <div className="container">
        <Link href="/#process" className={styles.back} data-cursor="link">
          ← {home.process.label}
        </Link>

        <header className={styles.head} {...edItem("home.process.cards", index, "This page")}>
          <span className={styles.eyebrow}>
            {String(index + 1).padStart(2, "0")} · {card.note}
          </span>
          <h1 className={styles.title}>{card.title}</h1>
          {intro && <p className={styles.intro}>{intro}</p>}
        </header>

        <ul className={styles.grid} data-cols={page.cols} data-shape={page.shape} {...edList(listPath, "card", MAX_PROCESS_ITEMS)}>
          {page.items.length === 0 && (
            <li className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                ＋
              </span>
              <strong>Nothing here yet</strong>
              <span>Cards added to “{card.title}” will appear on this page.</span>
            </li>
          )}
          {page.items.map((it, j) => {
            const shown = withPictures.findIndex((x) => x.index === j);
            const body = (
              <>
                <span className={styles.frame} data-fit={it.fit}>
                  {it.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- any picture format, not only the ones Next can resize
                    <img src={versionedSrc(it.image)} alt={it.title || ""} loading="lazy" decoding="async" style={pictureStyle(it)} />
                  ) : (
                    <span className={styles.blank}>{it.title || "No picture yet"}</span>
                  )}
                </span>
                {(it.title || it.note) && (
                  <span className={styles.caption}>
                    {it.title && <strong>{it.title}</strong>}
                    {it.note && <span>{it.note}</span>}
                  </span>
                )}
              </>
            );
            return (
              <li key={j} className={styles.item} {...edItem(listPath, j, it.title || "Card")}>
                {it.image ? (
                  <button type="button" className={styles.itemButton} onClick={() => setOpen(shown)} data-cursor="link" aria-label={`Open ${it.title || "picture"} large`}>
                    {body}
                  </button>
                ) : (
                  <div className={styles.itemButton}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>

        {pages.length > 1 && (
          <nav className={styles.more} aria-label="More from How we work">
            <Link href={`/process/${prev.slug}`} data-cursor="link">
              ← {cards[(index - 1 + pages.length) % pages.length].title}
            </Link>
            <Link href={`/process/${next.slug}`} data-cursor="link">
              {cards[(index + 1) % pages.length].title} →
            </Link>
          </nav>
        )}
      </div>

      {open !== null && withPictures[open] && <Lightbox items={withPictures} at={open} onAt={setOpen} onClose={() => setOpen(null)} />}
    </article>
  );
}
