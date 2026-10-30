// How much memory and graphics work the visitor's own device is asked to take on. The 3D layers draw into canvases whose
// memory grows with the screen's pixel density, so weaker devices (little memory, few cores, data saver on) get lighter
// canvases; strong ones keep the full look. Nothing changes in what is shown, only in how sharp the 3D layers are drawn.
export interface DeviceBudget {
  level: "low" | "mid" | "high";
  /** The most pixels per screen pixel the star layer in front of the page (the back one is always 1), the slate and the opening scene are drawn at. */
  dprFront: number;
  dprScene: number;
  dprIntro: number;
}

let cached: DeviceBudget | null = null;

export function deviceBudget(): DeviceBudget {
  if (cached) return cached;
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = nav.deviceMemory ?? 8; // (only Chromium says; others count as having enough)
  const cores = nav.hardwareConcurrency ?? 8;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const low = !!nav.connection?.saveData || memory <= 4 || cores <= 4;
  const mid = !low && (memory <= 6 || coarse);
  cached = low
    ? { level: "low", dprFront: 1, dprScene: 1, dprIntro: 1.25 }
    : mid
      ? { level: "mid", dprFront: 1.25, dprScene: 1.5, dprIntro: 1.5 }
      : { level: "high", dprFront: 1.75, dprScene: 2, dprIntro: 2 };
  return cached;
}
