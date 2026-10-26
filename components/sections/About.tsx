import { home } from "@/content/home";
import { site } from "@/content/site";
import { CountUp } from "@/components/CountUp";
import styles from "./About.module.css";

const initials = site.founder.name
  .split(/\s+/)
  .map((w) => w[0])
  .join("")
  .slice(0, 2);

export function About() {
  const copy = home.about;
  return (
    <section id="about" className={styles.section}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.story}>
          <span className={styles.label}>{copy.label}</span>
          <h2 className={styles.title}>{copy.title}</h2>
          {copy.paragraphs.map((p) => (
            <p key={p} className={styles.body}>
              {p}
            </p>
          ))}
        </div>

        <aside className={styles.founder} aria-label={copy.founderLabel}>
          <div className={styles.monogram} aria-hidden="true">
            {initials}
          </div>
          <p className={styles.founderLabel}>{copy.founderLabel}</p>
          <p className={styles.founderName}>{site.founder.name}</p>
          <p className={styles.founderRole}>{site.founder.role}</p>
          <p className={styles.founderPlace}>{site.contact.location}</p>
        </aside>

        <div className={styles.stats}>
          {copy.stats.map((s) => (
            <div key={s.label} className={styles.stat}>
              <div className={styles.statValue}>
                <CountUp value={s.value} suffix={s.suffix} />
              </div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
