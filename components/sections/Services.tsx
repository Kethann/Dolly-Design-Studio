"use client";
import { plainFx } from "@/lib/content/text-effects";

import { useState } from "react";
import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection, edList } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import { adjustStyle } from "@/lib/content/adjust";
import { ServiceDialog } from "./ServiceDialog";
import styles from "./Services.module.css";
import { renderFx } from "@/components/fx/render-fx";
import { MediaPlaceholder } from "@/components/MediaPlaceholder";
import { AddContent } from "@/components/PreviewControls";

/** Lightweight line icons for each service category. */
function Icon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 48 48" className={styles.icon} aria-hidden="true" {...common}>
      {n.includes("ott") || n.includes("television") ? (
        <>
          <rect x="7" y="10" width="34" height="25" rx="4" />
          <path d="m21 17 10 6-10 6zM18 41h12M24 35v6" />
        </>
      ) : n.includes("film") ? (
        <>
          <rect x="9" y="8" width="30" height="32" rx="3" />
          <path d="M16 8v32M32 8v32M9 16h7M9 24h7M9 32h7M32 16h7M32 24h7M32 32h7m-18-14 8 6-8 6z" />
        </>
      ) : n.includes("music") ? (
        <>
          <path d="M20 33V13l18-4v20M20 19l18-4" />
          <ellipse cx="15" cy="34" rx="5" ry="4" />
          <ellipse cx="33" cy="30" rx="5" ry="4" />
        </>
      ) : n.includes("poster") ? (
        <>
          <path d="M24 8 L30 24 L24 34 L18 24 Z" />
          <circle cx="24" cy="24" r="1.6" />
          <path d="M24 34 V40" />
          <path d="M8 22 C12 12 18 12 24 8 C30 12 36 12 40 22" />
          <circle cx="8" cy="22" r="2" />
          <circle cx="40" cy="22" r="2" />
        </>
      ) : n.includes("title") ? (
        <>
          <rect x="10" y="10" width="28" height="28" />
          <path d="M18 18 H30 M24 18 V31" />
          {[
            [10, 10],
            [38, 10],
            [10, 38],
            [38, 38],
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="var(--icon-bg, #12060a)" />
          ))}
        </>
      ) : n.includes("typo") ? (
        <>
          <rect x="8" y="14" width="32" height="20" />
          <path d="M17 21 H27 M22 21 V29" />
          <path d="M34 11 V37 M31 11 H37 M31 37 H37" />
        </>
      ) : n.includes("logo") ? (
        <>
          <circle cx="24" cy="24" r="14" />
          <circle cx="24" cy="24" r="8" />
          <path d="M20 24 H28" />
          <circle cx="10" cy="24" r="2" />
          <circle cx="38" cy="24" r="2" />
        </>
      ) : (
        <path d="M24 8 L28 20 L40 24 L28 28 L24 40 L20 28 L8 24 L20 20 Z" />
      )}
    </svg>
  );
}

export function Services() {
  const { home, services } = useContent();
  /** The service whose card is open (null = none). Clamped, so deleting a service in the portal can never leave it pointing at nothing. */
  const [openAt, setOpenAt] = useState<number | null>(null);
  const openIndex = openAt !== null && openAt < services.length ? openAt : null;
  return (
    <section id="services" className={styles.section} {...edSection("home", "services", "Our services")}>
      <div className="container">
        <span className={styles.label} {...tx("home.services.label")}>
          {renderFx(home.services.label)}
        </span>
        <h2 className={styles.title} {...tx("home.services.title")}>
          {renderFx(home.services.title)}
        </h2>

        <AddContent list="services" label="Add service card" count={services.length} max={10} />
        <div className={styles.cards} {...edList("services", "service", 10)}>
          {services.map((s, i) => (
            <article
              key={s.number}
              className={styles.card}
              tabIndex={0}
              role="button"
              aria-haspopup="dialog"
              aria-label={`${plainFx(s.name)}: open`}
              data-cursor="link"
              onClick={() => setOpenAt(i)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setOpenAt(i);
                }
              }}
              {...edItem("services", i, "Service")}
            >
              <div className={styles.media} data-fit={s.sample.includes("/proof-table/") || s.sample.includes("/title-designs/") ? "contain" : "cover"}>
                {s.sample ? <Image
                  style={adjustStyle(s, "sample")}
                  src={versionedSrc(s.sample)}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 24vw"
                  quality={90}
                  {...placeholderProps(s.sample)}
                /> : <MediaPlaceholder />}
                <span className={styles.badge}>
                  <Icon name={plainFx(s.name)} />
                </span>
              </div>
              <div className={styles.body}>
                <span className={styles.num}>{s.number}</span>
                <h3 className={styles.name} {...tx("services.name")}>
                  {renderFx(s.name)}
                </h3>
                <p className={styles.desc} {...tx("services.description")}>
                  {renderFx(s.description)}
                </p>
                {s.deliverables.length > 0 && (
                  <ul className={styles.chips}>
                    {s.deliverables.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
                <span className={styles.more} aria-hidden="true">
                  <span>Explore service</span>
                  <span className={styles.moreArrow}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14m-6-6 6 6-6 6" />
                    </svg>
                  </span>
                </span>
              </div>
            </article>
          ))}
        </div>
        {openIndex !== null && <ServiceDialog services={services} index={openIndex} onIndex={setOpenAt} onClose={() => setOpenAt(null)} />}
      </div>
    </section>
  );
}
