"use client";

import Image from "next/image";
import { useContent, tx } from "@/lib/content/context";
import { edItem, edSection } from "@/lib/content/tx";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./Services.module.css";

/** The line icons from the portfolio: pen nib (posters), framed T (titles), text box (typography), round logo. */
function Icon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 48 48" className={styles.icon} aria-hidden="true" {...common}>
      {n.includes("poster") ? (
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
  return (
    <section id="services" className={styles.section} {...edSection("home", "services", "Our services")}>
      <div className="container">
        <span className={styles.label} {...tx("home.services.label")}>
          {home.services.label}
        </span>
        <h2 className={styles.title} {...tx("home.services.title")}>
          {home.services.title}
        </h2>

        <div className={styles.cards}>
          {services.map((s, i) => (
            <article key={s.number} className={styles.card} tabIndex={0} {...edItem("services", i, "Service")}>
              <div className={styles.media} data-fit={s.sample.includes("/proof-table/") || s.sample.includes("/title-designs/") ? "contain" : "cover"}>
                <Image
                  src={versionedSrc(s.sample)}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 24vw"
                  quality={90}
                  {...placeholderProps(s.sample)}
                />
                <span className={styles.badge}>
                  <Icon name={s.name} />
                </span>
              </div>
              <div className={styles.body}>
                <span className={styles.num}>{s.number}</span>
                <h3 className={styles.name} {...tx("services.name")}>
                  {s.name}
                </h3>
                <p className={styles.desc} {...tx("services.description")}>
                  {s.description}
                </p>
                {s.deliverables.length > 0 && (
                  <ul className={styles.chips}>
                    {s.deliverables.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
