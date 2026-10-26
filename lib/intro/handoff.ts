// Passes the few background stars that survive the intro to the lasting star
// field behind the hero, so they carry on exactly where the intro left them.

export interface FieldStar {
  position: [number, number, number];
  /** Drift during the intro, in world units per second — the field carries it on and lets it settle. */
  velocity: [number, number, number];
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
  | { status: "ready"; stars: FieldStar[]; key: number; at: number }
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

/** `at` is the performance.now() moment the positions describe, so the field can carry on from exactly then. */
export function publishFieldStars(stars: FieldStar[], at: number) {
  set({ status: "ready", stars, key: ++key, at });
}

/** The intro finished without passing stars on (skipped, fallback, failed): let the field lay out its own. */
export function settleHandoff() {
  if (state.status === "waiting") set({ status: "none", key: ++key });
}
