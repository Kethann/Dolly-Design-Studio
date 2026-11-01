export interface WindowRect { x: number; y: number; width: number; height: number }
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Keep the whole window, including its close/restore controls, inside the visible viewport. */
export function constrainWindow(rect: WindowRect, bounds: WindowRect): WindowRect {
  const width = clamp(rect.width, Math.min(320, bounds.width), bounds.width);
  const height = clamp(rect.height, Math.min(180, bounds.height), bounds.height);
  return { width, height, x: clamp(rect.x, bounds.x, bounds.x + bounds.width - width), y: clamp(rect.y, bounds.y, bounds.y + bounds.height - height) };
}

/** A wide floating window may cross a side edge, but its title bar stays reachable.
 * Resizing/viewport changes still use constrainWindow to bring the whole window back. */
export function moveWindow(rect: WindowRect, bounds: WindowRect): WindowRect {
  const sized = constrainWindow(rect, bounds);
  const visibleWidth = Math.min(220, sized.width);
  const visibleHeight = Math.min(96, sized.height);
  return { ...sized,
    x: clamp(rect.x, bounds.x - sized.width + visibleWidth, bounds.x + bounds.width - visibleWidth),
    y: clamp(rect.y, bounds.y, bounds.y + bounds.height - visibleHeight),
  };
}

export function resizeWindow(rect: WindowRect, edge: ResizeEdge, dx: number, dy: number, bounds: WindowRect): WindowRect {
  const start = constrainWindow(rect, bounds);
  let left = start.x, top = start.y, right = left + start.width, bottom = top + start.height;
  const minWidth = Math.min(320, bounds.width), minHeight = Math.min(180, bounds.height);
  if (edge.includes("w")) left = clamp(left + dx, bounds.x, right - minWidth);
  if (edge.includes("e")) right = clamp(right + dx, left + minWidth, bounds.x + bounds.width);
  if (edge.includes("n")) top = clamp(top + dy, bounds.y, bottom - minHeight);
  if (edge.includes("s")) bottom = clamp(bottom + dy, top + minHeight, bounds.y + bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
