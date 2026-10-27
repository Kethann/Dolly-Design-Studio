import { T } from "./timeline";
import { clamp01, viewHalfExtents, type Stage } from "./choreography";
import type { SweepSettings } from "./settings";

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

/**
 * The world x where the logo starts to show: just behind the star's back edge (its full outer radius, so no part of
 * the star — whatever its turn or tilt — reaches past it). Seen from the camera, so it's projected onto the logo plane.
 */
export function sweepEdge(plan: SweepPlan, t: number, cameraZ: number) {
  const pose = sweepPose(plan, t);
  const toLogoPlane = cameraZ / (cameraZ - plan.z); // the star is nearer the camera, so it covers a wider band
  return (pose.x + plan.dir * pose.scale) * toLogoPlane;
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
