"use client";

import { useState } from "react";
import type { Project } from "@/content/types";
import { useContent } from "@/lib/content/context";
import { edList } from "@/lib/content/tx";
import { ProjectCard } from "./ProjectCard";
import { AddContent } from "./PreviewControls";
import { galleryImageSizes } from "@/lib/images";
import styles from "./WorkGrid.module.css";

/** Projects with a type filter (Film Publicity, Re-release…). */
export function WorkGrid({ projects }: { projects: Project[] }) {
  const allProjects = useContent().projects;
  const { work: workPage, galleryLayout: layout, categories } = useContent();
  const [filter, setFilter] = useState<string>("All");

  // Every project type is offered, whether or not it has projects yet (an empty one says so).
  const available = categories;
  const category = filter !== "All" && !available.includes(filter) ? "All" : filter;
  const filtered = category === "All" ? projects : projects.filter((p) => p.category === category);
  // Match the portal's column choice; two wide columns need sharper sources than four small ones.
  const imageSizes = galleryImageSizes(layout.columns);

  return (
    <div>
      {layout.showFilters && (
      <div className={styles.filters} role="group" aria-label="Filter work by category">
        <button
          type="button"
          aria-pressed={category === "All"}
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
            aria-pressed={category === cat}
            data-cursor="link"
            className={`${styles.chip} ${category === cat ? styles.chipActive : ""}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      )}

      <AddContent list="projects" label="Add project card" count={allProjects.length} max={100} />
      {filtered.length ? (
        <div
          className={styles.grid}
          {...edList("projects", "project", 100)}
          style={
            {
              // "Auto" fits as many as there is room for; a number fixes the posters per row (fewer on small screens).
              "--cols": layout.columns === "Auto" ? "repeat(auto-fill, minmax(min(100%, 230px), 1fr))" : `repeat(${layout.columns}, minmax(0, 1fr))`,
              "--card-ratio": layout.shape === "Square" ? "1 / 1" : layout.shape === "Landscape" ? "3 / 2" : "2 / 3",
            } as React.CSSProperties
          }
        >
          {filtered.map((project, i) => (
            <ProjectCard key={project.slug} project={project} index={allProjects.findIndex((p) => p.slug === project.slug)} priority={i < 3} showDetails={layout.showDetails} sizes={imageSizes} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{workPage.emptyCategory}</p>
      )}
    </div>
  );
}
