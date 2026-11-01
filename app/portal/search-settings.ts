export interface SearchableSetting {
  label: string;
  sub: string;
  keywords: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/colours?/g, "color").replace(/[&/–—-]/g, " ");

/** Match all words, accepting common spelling and punctuation variants. */
export function searchSettings<T extends SearchableSetting>(entries: T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return entries.slice(0, 40);
  return entries.map(entry => {
    const label = normalize(entry.label), sub = normalize(entry.sub);
    const hay = `${label} ${sub} ${normalize(entry.keywords)}`;
    if (!words.every(word => hay.includes(word))) return null;
    return { entry, score: words.reduce((sum, word) => sum + (label.includes(word) ? 3 : sub.includes(word) ? 2 : 1), 0) };
  }).filter((result): result is { entry: T; score: number } => result !== null)
    .sort((a, b) => b.score - a.score).slice(0, 40).map(result => result.entry);
}
