import type * as THREE from "three";
import { T } from "./timeline";
import { clamp01, viewHalfExtents, type Stage } from "./choreography";
import type { SweepSettings } from "./settings";
import type { StarShape } from "./star-geometry";

/**
 * The Sweep reveal: at the reveal moment the big star crosses in front of the formed logo — from fully off one side
 * of the screen to fully off the other — turning and growing a little as it goes. The logo's stars slip away under
 * it as its centre passes them, and the finished logo is uncovered just behind its trailing edge (so nothing ever
 * shows around it). Everything is a pure function of time, like the rest of the intro, so the portal can scrub it.
 */
export interface SweepPlan {
  /** Depth of its path: in front of the logo plane, so it passes over the logo. */
  z: number;
  y: number;
  startX: number;
  endX: number;
  /** World radius when it enters (it grows by `grow` as it crosses). */
  radius: number;
  grow: number;
  /** +1: right to left; -1: left to right. */
  dir: 1 | -1;
  start: number;
  duration: number;
  spin: number;
  tilt: number;
  /** World width of the soft edge where the logo appears. */
  feather: number;
}

/** When the crossing starts: at the moment the formation has settled (where the wave/glow reveal would begin). */
const SWEEP_START = T.docked;

export function planSweep(stage: Stage, s: SweepSettings, worldPerPx: number): SweepPlan {
  const { logo } = stage;
  const z = logo.height * 0.4;
  const radius = logo.height * 0.62 * s.size;
  const dir = s.direction === "ltr" ? -1 : 1;
  const { halfWidth } = viewHalfExtents(stage, z);
  const reach = halfWidth + radius * s.grow * 1.1; // fully off screen at both ends, whatever its turn
  return {
    z,
    y: logo.y,
    startX: dir * reach,
    endX: -dir * reach,
    radius,
    grow: s.grow,
    dir,
    // It must be gone before the page takes over, so the crossing is fitted between the formation and the hand-off.
    start: SWEEP_START,
    duration: Math.min(s.duration, T.revealAt - 0.15 - SWEEP_START),
    spin: s.spin,
    tilt: s.tilt,
    feather: s.feather * worldPerPx,
  };
}

/**
 * The star's build, from the portal's shape controls. Every control is clamped away from a degenerate star (a zero-
 * thickness wall or crown would give faces with no area, which shade as black).
 */
export function sweepStarShape(s: Pick<SweepSettings, "depth" | "bevel" | "edge" | "facets" | "arms">): StarShape {
  return {
    innerRadius: 0.28 + 0.27 * s.arms, // 0.389 (the default arms) matches the logo's own star
    depth: 0.03 + 0.9 * s.depth,
    edge: 0.01 + 0.31 * s.edge,
    crown: 0.85 - 0.66 * s.bevel,
    relief: s.facets / 0.6, // the default (0.6) is the original gem cut
  };
}

/** A stable key for the shape, so the geometry is rebuilt only when it really changes. */
export const sweepShapeKey = (s: Pick<SweepSettings, "depth" | "bevel" | "edge" | "facets" | "arms">) =>
  [s.depth, s.bevel, s.edge, s.facets, s.arms].map((v) => v.toFixed(3)).join("|");

/** One-click looks for the star's shape. */
export const SWEEP_SHAPE_PRESETS = {
  minimal: { label: "Minimal", depth: 0.1, bevel: 0.12, edge: 0.06, facets: 0.08, arms: 0.4 },
  gem: { label: "Gem", depth: 0.5, bevel: 0.5, edge: 0.5, facets: 0.6, arms: 0.4 },
  bold: { label: "Bold", depth: 0.85, bevel: 0.75, edge: 0.65, facets: 1, arms: 0.55 },
} as const;

/** power2.inOut: an easy start, a confident middle, an easy exit. */
const easeInOutQuad = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/** 0 before it enters … 1 once it has left. */
export function sweepProgress(plan: SweepPlan, t: number) {
  return easeInOutQuad(clamp01((t - plan.start) / plan.duration));
}

export interface SweepPose {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export function sweepPose(plan: SweepPlan, t: number): SweepPose {
  const p = sweepProgress(plan, t);
  const scale = plan.radius * (1 + (plan.grow - 1) * p);
  return {
    visible: t > plan.start && t < plan.start + plan.duration,
    x: plan.startX + (plan.endX - plan.startX) * p,
    y: plan.y - Math.sin(Math.PI * p) * plan.radius * 0.12,
    z: plan.z,
    scale,
    rotX: plan.tilt * 0.35 * Math.sin(Math.PI * 2 * p),
    rotY: plan.tilt * 0.9 * Math.sin(Math.PI * p) * plan.dir,
    rotZ: plan.dir * plan.spin * Math.PI * 2 * p,
  };
}

/** When the star's centre passes world x on the logo plane (the logo's stars slip away under it then). */
export function sweepTimeAt(plan: SweepPlan, x: number, cameraZ: number) {
  const toLogoPlane = cameraZ / (cameraZ - plan.z);
  let lo = plan.start;
  let hi = plan.start + plan.duration;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    const cx = sweepPose(plan, mid).x * toLogoPlane;
    const passed = plan.dir > 0 ? cx <= x : cx >= x;
    if (passed) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The most star prints the reveal can hold (the shader's array size). */
export const SWEEP_STAMPS = 40;
/** How many star prints the star leaves along its whole crossing. */
const PRINTS = 16;
/** Seconds a print takes to bloom fully open. */
const BLOOM_TIME = 1;

const smooth01 = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/**
 * The star-shaped openings the logo is uncovered through. As it crosses, the star leaves a print of its own shape at
 * regular moments, exactly where it is and turned as it is, projected onto the logo plane. Each print starts at half
 * the star's size and blooms open (by `bloom`), still turning a little, so the logo appears through a run of opening
 * stars behind it — each edge the star's own outline. Returns how many prints are showing, and how far the final
 * clean-up has got (0 until the star has gone, then 1 a moment later, so the logo is always complete).
 */
export function sweepStamps(plan: SweepPlan, t: number, cameraZ: number, bloom: number, out: THREE.Vector4[]) {
  const k = cameraZ / (cameraZ - plan.z);
  const end = plan.start + plan.duration;
  let count = 0;
  for (let i = 0; i < PRINTS && count < out.length; i++) {
    const ti = plan.start + (plan.duration * (i + 0.5)) / PRINTS;
    if (ti > t) break;
    const pose = sweepPose(plan, ti);
    const age = t - ti;
    const open = 0.5 + (0.5 + bloom) * smooth01(age / BLOOM_TIME);
    out[count++].set(pose.x * k, pose.y * k, pose.scale * k * open, pose.rotZ + plan.dir * age * 0.5);
  }
  return { count, done: smooth01((t - end - 0.2) / 0.4) };
}
