/** Browser toolbar height changes are not a new layout; rotation/large resizing is. */
export function introLayoutChanged(width: number, height: number, nextWidth: number, nextHeight: number) {
  return Math.abs(nextWidth - width) > 2 || Math.abs(nextHeight - height) > Math.max(120, height * 0.2);
}
