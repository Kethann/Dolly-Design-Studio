import Image from "next/image";
import { home } from "@/content/home";
import { stills } from "@/content/bts";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./Making.module.css";

/** BTS / making stills: real behind-the-scenes images from content/bts.ts, in a staggered strip. */
export function Making() {
  const copy = home.making;
  return (
    <section id="making" className={styles.section}>
      <div className="container">
        <span className={styles.label}>{copy.label}</span>
        <h2 className={styles.title}>{copy.title}</h2>
        <p className={styles.intro}>{copy.intro}</p>

        {stills.length > 0 ? (
          <div className={styles.grid}>
            {stills.map((still, i) => (
              <figure key={still.src} className={styles.still} data-tall={i % 3 === 1}>
                <div className={styles.frame}>
                  <Image
                    src={versionedSrc(still.src)}
                    alt={still.alt}
                    fill
                    sizes="(max-width: 700px) 100vw, 33vw"
                    className={styles.image}
                    {...placeholderProps(still.src)}
                  />
                </div>
                {still.caption && <figcaption className={styles.caption}>{still.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>{copy.empty}</p>
        )}
      </div>
    </section>
  );
}
