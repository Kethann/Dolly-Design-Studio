import Image from "next/image";
import { services } from "@/content/services";
import { home } from "@/content/home";
import { placeholderProps, versionedSrc } from "@/lib/images";
import styles from "./Services.module.css";

export function Services() {
  return (
    <section id="services" className={styles.section}>
      <div className="container">
        <span className={styles.label}>{home.services.label}</span>
        <h2 className={styles.title}>{home.services.title}</h2>

        <div className={styles.list}>
          {services.map((s) => {
            return (
              <div key={s.number} className={styles.row} tabIndex={0}>
                <span className={styles.num}>{s.number}</span>
                <div>
                  <h3 className={styles.name}>{s.name}</h3>
                  <p className={styles.desc}>{s.description}</p>
                </div>
                <div className={styles.preview} aria-hidden="true">
                  <Image src={versionedSrc(s.sample)} alt="" fill sizes="100px" {...placeholderProps(s.sample)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
