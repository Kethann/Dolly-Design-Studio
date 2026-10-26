"use client";

import { useMemo, useState } from "react";
import type { Category, Language, Project } from "@/content/types";
import { CATEGORIES, LANGUAGES } from "@/content/types";
import { workPage } from "@/content/pages";
import { ProjectCard } from "./ProjectCard";
import styles from "./WorkGrid.module.css";

/** Projects with two filters that combine: language (Telugu / Kannada) and type (Film Publicity, Re-release…). */
export function WorkGrid({ projects }: { projects: Project[] }) {
  const [language, setLanguage] = useState<Language | "All">("All");
  const [filter, setFilter] = useState<Category | "All">("All");

  const languages = useMemo(() => LANGUAGES.filter((l) => projects.some((p) => p.languages.includes(l))), [projects]);
  const inLanguage = language === "All" ? projects : projects.filter((p) => p.languages.includes(language));
  // Only offer the types that exist in the chosen language.
  const available = useMemo(() => {
    const set = new Set(inLanguage.map((p) => p.category));
    return CATEGORIES.filter((c) => set.has(c));
  }, [inLanguage]);
  const category = filter !== "All" && !available.includes(filter) ? "All" : filter;
  const filtered = category === "All" ? inLanguage : inLanguage.filter((p) => p.category === category);

  return (
    <div>
      {languages.length > 1 && (
        <div className={styles.languages} role="tablist" aria-label="Filter work by language">
          {(["All", ...languages] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={language === l}
              data-cursor="link"
              className={`${styles.language} ${language === l ? styles.languageActive : ""}`}
              onClick={() => setLanguage(l)}
            >
              {l === "All" ? workPage.allLanguages : l}
              <span className={styles.languageCount}>
                {l === "All" ? projects.length : projects.filter((p) => p.languages.includes(l)).length}
              </span>
            </button>
          ))}
        </div>
      )}

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
