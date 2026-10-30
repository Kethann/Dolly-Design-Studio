"use client";
import { renderFx, plainFx } from "@/components/fx/render-fx";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { Service } from "@/content/types";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { adjustStyle } from "@/lib/content/adjust";
import { freezeScroll, releaseScroll } from "@/lib/smooth-scroll";
import { goToSection } from "@/lib/section-nav";
import styles from "./Services.module.css";
import { MediaPlaceholder } from "@/components/MediaPlaceholder";
import { AddContent, EditContent } from "@/components/PreviewControls";

/**
 * A service, opened: the full story, what you get, more pictures, and a way to start. Escape, the backdrop or the ✕
 * closes it; the arrows (and ← →) move to the next or previous service without closing it.
 */
export function ServiceDialog({
  services,
  index,
  onIndex,
  onClose,
}: {
  services: Service[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const s = services[index];
  const [shot, setShot] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // A new service starts on its first picture, at the top.
  useEffect(() => {
    setShot(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset when another service is shown
    panel.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    opener.current = document.activeElement;
    freezeScroll();
    panel.current?.focus();
    return () => {
      releaseScroll();
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true }); // back to the card that was opened
    };
  }, []);

  useEffect(() => {
    const last = services.length - 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndex(index >= last ? 0 : index + 1);
      else if (e.key === "ArrowLeft") onIndex(index <= 0 ? last : index - 1);
      else if (e.key === "Tab" && panel.current) {
        // Keep Tab inside the dialog.
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));
        if (!items.length) return;
        const first = items[0];
        const end = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          end.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, services.length, onClose, onIndex]);

  if (!s) return null;
  const pictures = [{ src: s.sample, alt: plainFx(s.name), style: adjustStyle(s, "sample"), item: null }, ...(s.gallery ?? []).map((g, i) => ({ src: g.src, alt: g.alt, style: adjustStyle(g, "src"), item: `services.${index}.gallery.${i}` }))].filter((p) => p.src);
  const current = pictures[Math.min(shot, pictures.length - 1)];
  const contain = current?.src.includes("/proof-table/") || current?.src.includes("/title-designs/");
  const many = services.length > 1;
  const story = (s.details ?? "").trim() || s.description;

  return createPortal(
    <div className={styles.dialogBack} onClick={onClose} role="presentation">
      <div
        ref={panel}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={plainFx(s.name)}
        tabIndex={-1}
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.dialogClose} onClick={onClose} aria-label="Close" data-cursor="link">
          ✕
        </button>

        <div className={styles.dialogMedia}>
          <div className={styles.dialogShot} data-fit={contain ? "contain" : "cover"}>
            {current ? <Image key={current.src} style={current.style} src={versionedSrc(current.src)} alt={current.alt || plainFx(s.name)} fill sizes="(max-width: 860px) 92vw, 520px" quality={90} {...placeholderProps(current.src)} /> : <MediaPlaceholder />}
          </div>
          {current?.item && <EditContent item={current.item} label="Edit this image" />}
          {pictures.length > 1 && (
            <div className={styles.dialogThumbs} role="group" aria-label="Pictures">
              {pictures.map((p, i) => (
                <button key={`${p.src}-${i}`} type="button" data-on={i === shot} aria-label={`Picture ${i + 1} of ${pictures.length}`} aria-pressed={i === shot} onClick={() => setShot(i)} data-cursor="link">
                  <Image src={versionedSrc(p.src)} style={p.style} alt="" fill sizes="72px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.dialogBody}>
          <span className={styles.num}>{s.number}</span>
          <h3 className={styles.dialogTitle}>{renderFx(s.name)}</h3>
          <EditContent item={`services.${index}`} label="Edit this service" />
          <AddContent list={`services.${index}.gallery`} label="Add gallery image" count={s.gallery?.length ?? 0} max={12} />
          <p className={styles.dialogStory}>{renderFx(story)}</p>
          {s.deliverables.length > 0 && (
            <>
              <span className={styles.dialogSub}>What you get</span>
              <ul className={styles.dialogList}>
                {s.deliverables.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.dialogCta}
              data-cursor="link"
              onClick={() => {
                onClose();
                requestAnimationFrame(() => goToSection("contact"));
              }}
            >
              Start this project →
            </button>
            {many && (
              <span className={styles.dialogStep}>
                <button type="button" onClick={() => onIndex(index <= 0 ? services.length - 1 : index - 1)} aria-label="Previous service" data-cursor="link">
                  ‹
                </button>
                <span>
                  {index + 1} / {services.length}
                </span>
                <button type="button" onClick={() => onIndex(index >= services.length - 1 ? 0 : index + 1)} aria-label="Next service" data-cursor="link">
                  ›
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
