export interface WindowRect { x: number; y: number; width: number; height: number }
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Keep the whole window, including its close/restore controls, inside the visible viewport. */
export function constrainWindow(rect: WindowRect, bounds: WindowRect): WindowRect {
  const width = clamp(rect.width, Math.min(320, bounds.width), bounds.width);
  const height = clamp(rect.height, Math.min(180, bounds.height), bounds.height);
  return { width, height, x: clamp(rect.x, bounds.x, bounds.x + bounds.width - width), y: clamp(rect.y, bounds.y, bounds.y + bounds.height - height) };
}

/** Keep the entire title bar and its controls reachable while the window moves. */
export function moveWindow(rect: WindowRect, bounds: WindowRect): WindowRect {
  return constrainWindow(rect, bounds);
}

export function resizeWindow(rect: WindowRect, edge: ResizeEdge, dx: number, dy: number, bounds: WindowRect): WindowRect {
  // Recover a window after a viewport change before applying the resize delta.
  const start = moveWindow(rect, bounds);
  let left = start.x, top = start.y, right = left + start.width, bottom = top + start.height;
  const minWidth = Math.min(320, bounds.width), minHeight = Math.min(180, bounds.height);
  if (edge.includes("w")) left = clamp(left + dx, Math.max(Math.min(start.x, bounds.x), right - bounds.width), right - minWidth);
  if (edge.includes("e")) right = clamp(right + dx, left + minWidth, Math.min(Math.max(right, bounds.x + bounds.width), left + bounds.width));
  if (edge.includes("n")) top = clamp(top + dy, bounds.y, bottom - minHeight);
  if (edge.includes("s")) bottom = clamp(bottom + dy, top + minHeight, bounds.y + bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
