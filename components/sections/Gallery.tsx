"use client";

import Link from "next/link";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { WorkGrid } from "@/components/WorkGrid";
import { Magnetic } from "@/components/Magnetic";
import styles from "./Gallery.module.css";
import { renderFx } from "@/components/fx/render-fx";

export function Gallery() {
  const { home, projects } = useContent();
  const all = [...projects].sort((a, b) => a.order - b.order);

  return (
    <section id="work" className={styles.section} {...edSection("home", "gallery", "Project gallery")}>
      <div className="container">
        <div className={styles.head}>
          <div>
            <span className={styles.label} {...tx("home.gallery.label")}>{renderFx(home.gallery.label)}</span>
            <h2 className={styles.title} {...tx("home.gallery.title")}>{renderFx(home.gallery.title)}</h2>
            <p className={styles.intro} {...tx("home.gallery.intro")}>{renderFx(home.gallery.intro)}</p>
          </div>
          <Magnetic>
            <Link href="/work" className={styles.viewAll} data-cursor="link">
              {home.gallery.viewAllLink}
            </Link>
          </Magnetic>
        </div>
        <WorkGrid projects={all} />
      </div>
    </section>
  );
}
