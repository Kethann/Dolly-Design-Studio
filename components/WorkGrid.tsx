"use client";

import { useMemo, useState } from "react";
import type { Category, Project } from "@/content/types";
import { CATEGORIES } from "@/content/types";
import { workPage } from "@/content/pages";
import { ProjectCard } from "./ProjectCard";
import styles from "./WorkGrid.module.css";

export function WorkGrid({ projects }: { projects: Project[] }) {
  const [filter, setFilter] = useState<Category | "All">("All");

  const available = useMemo(() => {
    const set = new Set(projects.map((p) => p.category));
    return CATEGORIES.filter((c) => set.has(c));
  }, [projects]);

  const filtered = filter === "All" ? projects : projects.filter((p) => p.category === filter);

  return (
    <div>
      <div className={styles.filters} role="tablist" aria-label="Filter work by category">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "All"}
          data-cursor="link"
          className={`${styles.chip} ${filter === "All" ? styles.chipActive : ""}`}
          onClick={() => setFilter("All")}
        >
          {workPage.allFilter}
        </button>
        {available.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={filter === cat}
            data-cursor="link"
            className={`${styles.chip} ${filter === cat ? styles.chipActive : ""}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length ? (
        <div className={styles.grid}>
          {filtered.map((project, i) => (
            <ProjectCard key={project.slug} project={project} priority={i < 3} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{workPage.emptyCategory}</p>
      )}
    </div>
  );
}
