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
  const memory = nav.deviceMemory ?? 8; // (only Chromium says, in steps of 0.25, 0.5, 1, 2, 4 and 8; others count as having enough)
  const cores = nav.hardwareConcurrency ?? 8;
  // iPhones and iPads (an iPad asking for the desktop site says "Macintosh" but has a touch screen) have strong graphics,
  // and Safari reports neither memory nor the real core count, so they are never marked down on those.
  const apple = /iPhone|iPad|iPod/.test(nav.userAgent ?? "") || (/Macintosh/.test(nav.userAgent ?? "") && (nav.maxTouchPoints ?? 0) > 1);
  // A touch screen alone says nothing about the device: only what it reports about itself counts.
  const low = !!nav.connection?.saveData || (!apple && (memory <= 2 || cores <= 2));
  const mid = !low && !apple && (memory <= 4 || cores <= 4);
  cached = low
    ? { level: "low", dprFront: 1, dprScene: 1, dprIntro: 1.25 }
    : mid
      ? { level: "mid", dprFront: 1.25, dprScene: 1.5, dprIntro: 1.5 }
      : // The slate is the showpiece: on a 3x phone screen the best devices draw it at 2.5 (it steps down by itself, never below
        // 1.5, should a device not keep up; see scene.ts). Computers and tablets are 2x or less, so they get their full sharpness.
        { level: "high", dprFront: 1.75, dprScene: 2.5, dprIntro: 2 };
  return cached;
}
