"use client";

import { useState } from "react";
import { plainFx } from "@/lib/content/text-effects";
import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection, edList } from "@/lib/content/tx";
import { ServiceDialog } from "./ServiceDialog";
import { ServiceIcon } from "./ServiceIcon";
import { renderFx } from "@/components/fx/render-fx";
import { AddContent } from "@/components/PreviewControls";
import styles from "./Services.module.css";

/** Spacious service panels; full details and uploaded work stay in the dialog. */
export function Services() {
  const { home, services } = useContent();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const openIndex = openAt !== null && openAt < services.length ? openAt : null;
  return (
    <section id="services" className={styles.section} {...edSection("home", "services", "Our services")}>
      <div className="container">
        <span className={styles.label} {...tx("home.services.label")}>{renderFx(home.services.label)}</span>
        <h2 className={styles.title} {...tx("home.services.title")}>{renderFx(home.services.title)}</h2>
        <AddContent list="services" label="Add service card" count={services.length} max={10} />
        <div className={styles.cards} {...edList("services", "service", 10)}>
          {services.map((s, i) => (
            <article
              key={s.number}
              className={styles.card}
              tabIndex={0}
              role="button"
              aria-haspopup="dialog"
              aria-label={plainFx(s.name) + ": view details"}
              data-cursor="link"
              data-glow-card
              onClick={() => setOpenAt(i)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setOpenAt(i);
                }
              }}
              {...edItem("services", i, "Service")}
            >
              <ServiceIcon name={plainFx(s.name)} />
              <div className={styles.body}>
                <span className={styles.num} aria-hidden="true">{s.number}</span>
                <h3 className={styles.name} {...tx("services.name")}>{renderFx(s.name)}</h3>
                <p className={styles.description} {...tx("services.description")}>{renderFx(s.description)}</p>
              </div>
              <span className={styles.more} aria-hidden="true">
                <span>View details</span>
                <span className={styles.moreArrow}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </span>
              </span>
            </article>
          ))}
        </div>
        {openIndex !== null && <ServiceDialog services={services} index={openIndex} onIndex={setOpenAt} onClose={() => setOpenAt(null)} />}
      </div>
    </section>
  );
}
