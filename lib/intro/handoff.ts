// Passes the few background stars that survive the intro to the lasting star
// field behind the hero, so they carry on exactly where the intro left them.

export interface FieldStar {
  position: [number, number, number];
  axis: [number, number, number];
  angle: number;
  /** Spin speed during the intro, in radians per second. */
  spin: number;
  size: number;
  /** Palette index. */
  color: number;
  glow: boolean;
}

export type Handoff =
  | { status: "waiting" }
  /** The intro ended and passed these stars on. */
  | { status: "ready"; stars: FieldStar[]; key: number }
  /** No intro this time: the field lays out its own stars. */
  | { status: "none"; key: number };

let state: Handoff = { status: "waiting" };
let key = 0;
const listeners = new Set<() => void>();

function set(next: Handoff) {
  state = next;
  listeners.forEach((fn) => fn());
}

export const getHandoff = () => state;

export function subscribeHandoff(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishFieldStars(stars: FieldStar[]) {
  set({ status: "ready", stars, key: ++key });
}

/** The intro finished without passing stars on (skipped, fallback, failed): let the field lay out its own. */
export function settleHandoff() {
  if (state.status === "waiting") set({ status: "none", key: ++key });
}
