export type MediaSort = "oldest" | "newest" | "name-asc" | "name-desc";

/** Uploads sort by their real storage date; bundled artwork without a date follows them. */
export function sortMediaImages(images: readonly string[], uploadedAt: Readonly<Record<string, number>>, order: MediaSort): string[] {
  return [...images].sort((a, b) => {
    if (order === "name-asc") return a.localeCompare(b, undefined, { numeric: true });
    if (order === "name-desc") return b.localeCompare(a, undefined, { numeric: true });
    const aTime = uploadedAt[a] || 0;
    const bTime = uploadedAt[b] || 0;
    if (!aTime || !bTime) return Number(!aTime) - Number(!bTime) || a.localeCompare(b, undefined, { numeric: true });
    return (order === "oldest" ? aTime - bTime : bTime - aTime) || a.localeCompare(b, undefined, { numeric: true });
  });
}
