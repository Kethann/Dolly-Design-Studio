/** Selection follows file identity, including when search changes or files leave the library. */
export function librarySelection(images: string[], removable: string[], picked: string[], filter: string) {
  const available = new Set(images);
  const allowed = new Set(removable);
  const query = filter.trim().toLowerCase();
  const shown = images.filter((src) => src.toLowerCase().includes(query));
  const shownRemovable = shown.filter((src) => allowed.has(src));
  const selected = [...new Set(picked)].filter((src) => available.has(src) && allowed.has(src));
  const selectedSet = new Set(selected);
  const visible = new Set(shown);
  return {
    shown,
    shownRemovable,
    selected,
    allShownSelected: shownRemovable.length > 0 && shownRemovable.every((src) => selectedSet.has(src)),
    hiddenSelected: selected.filter((src) => !visible.has(src)).length,
  };
}
