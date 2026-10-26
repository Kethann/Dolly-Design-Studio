import Link from "next/link";
import { projects } from "@/content/projects";
import { home } from "@/content/home";
import { WorkGrid } from "@/components/WorkGrid";
import { Magnetic } from "@/components/Magnetic";
import styles from "./Gallery.module.css";

export function Gallery() {
  const featured = [...projects].sort((a, b) => a.order - b.order).filter((p) => p.featured);

  return (
    <section id="work" className={styles.section}>
      <div className="container">
        <div className={styles.head}>
          <div>
            <span className={styles.label}>{home.gallery.label}</span>
            <h2 className={styles.title}>{home.gallery.title}</h2>
          </div>
          <Magnetic>
            <Link href="/work" className={styles.viewAll} data-cursor="link">
              {home.gallery.viewAllLink}
            </Link>
          </Magnetic>
        </div>
        <WorkGrid projects={featured} />
      </div>
    </section>
  );
}
