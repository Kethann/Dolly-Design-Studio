"use client";

import { useMemo, useState } from "react";
import type { Category, Project } from "@/content/types";
import { CATEGORIES } from "@/content/types";
import { useContent } from "@/lib/content/context";
import { ProjectCard } from "./ProjectCard";
import styles from "./WorkGrid.module.css";

/** Projects with a type filter (Film Publicity, Re-release…). */
export function WorkGrid({ projects }: { projects: Project[] }) {
  const { work: workPage, galleryLayout: layout } = useContent();
  const [filter, setFilter] = useState<Category | "All">("All");

  // Only offer the types that exist.
  const available = useMemo(() => {
    const set = new Set(projects.map((p) => p.category));
    return CATEGORIES.filter((c) => set.has(c));
  }, [projects]);
  const category = filter !== "All" && !available.includes(filter) ? "All" : filter;
  const filtered = category === "All" ? projects : projects.filter((p) => p.category === category);

  return (
    <div>
      {layout.showFilters && (
      <div className={styles.filters} role="tablist" aria-label="Filter work by category">
        <button
          type="button"
          role="tab"
          aria-selected={category === "All"}
          data-cursor="link"
          className={`${styles.chip} ${category === "All" ? styles.chipActive : ""}`}
          onClick={() => setFilter("All")}
        >
          {workPage.allFilter}
        </button>
        {available.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={category === cat}
            data-cursor="link"
            className={`${styles.chip} ${category === cat ? styles.chipActive : ""}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      )}

      {filtered.length ? (
        <div
          className={styles.grid}
          style={
            {
              // "Auto" fits as many as there is room for; a number fixes the posters per row (fewer on small screens).
              "--cols": layout.columns === "Auto" ? "repeat(auto-fill, minmax(230px, 1fr))" : `repeat(${layout.columns}, minmax(0, 1fr))`,
              "--card-ratio": layout.shape === "Square" ? "1 / 1" : layout.shape === "Landscape" ? "3 / 2" : "2 / 3",
            } as React.CSSProperties
          }
        >
          {filtered.map((project, i) => (
            <ProjectCard key={project.slug} project={project} priority={i < 3} showDetails={layout.showDetails} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{workPage.emptyCategory}</p>
      )}
    </div>
  );
}
