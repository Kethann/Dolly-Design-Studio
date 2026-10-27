import * as THREE from "three";
import { LOGO_STAR, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { T } from "./timeline";
import { clamp01, cubicBezier, easeInOutCubic, easeInQuad, easeOutCubic, viewHalfExtents, type Stage } from "./choreography";
import type { Rng } from "./rng";

// The big star's journey: out of deep space, straight down onto the logo's
// own star, a spring to rest, a building shiver, then a release that sends a
// wave across the logo — and it flattens into the flat star glyph.

export interface BigStarPlan {
  /** World position of the logo's star glyph (where the big star lands). */
  glyph: THREE.Vector3;
  glyphRadius: number;
  entry: THREE.Vector3;
  c1: THREE.Vector3;
  c2: THREE.Vector3;
  /** Which side it comes in from (+1 right, -1 left). */
  side: number;
  /** World radius the reveal wave must reach to cover the whole logo. */
  waveReach: number;
  /** World width of the wave's bright front. */
  waveBand: number;
}

export interface BigStarPose {
  visible: boolean;
  scale: number;
  /** 1 = full faceted depth, smaller = flattened toward the flat logo glyph. */
  depthScale: number;
  /** 0..1: material blend from polished 3D gold to the logo's flat gold. */
  morph: number;
  /** 0..1: hand-over to the flat star glyph (big star fades out as the glyph fades in). */
  dock: number;
  /** 0..1: how hard it is shivering right now. */
  shiver: number;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SNAP = (Math.PI * 2) / 5; // a 5-point star looks identical every 72°
const ENTRY_SCALE = 5.5; // in flight it's the biggest star on screen, this many times the glyph's size
const SETTLE_FREQ = 17; // rad/s
const SETTLE_DAMP = 7;

export function planBigStar(stage: Stage, rand: Rng): BigStarPlan {
  const { logo } = stage;
  const w = logo.width;
  const h = logo.height;
  const glyph = new THREE.Vector3(
    logo.x + (LOGO_STAR.cx / LOGO_VIEWBOX.width - 0.5) * w,
    logo.y - (LOGO_STAR.cy / LOGO_VIEWBOX.height - 0.5) * h,
    0, // exactly on the logo plane, so it lines up with the flat glyph pixel-for-pixel
  );
  const side = rand() < 0.5 ? -1 : 1;
  const far = viewHalfExtents(stage, -28);
  const entry = new THREE.Vector3(glyph.x + side * far.halfWidth * 0.55, glyph.y + far.halfHeight * 0.45, -28);
  // Forward past the logo plane toward the lens, then straight down onto its spot.
  const c1 = new THREE.Vector3(glyph.x + side * w * 0.3, glyph.y + h * 1.4, 3.4);
  const c2 = new THREE.Vector3(glyph.x, glyph.y + h * 0.5, 1.8);

  const corners = [
    [logo.x - w / 2, logo.y - h / 2],
    [logo.x + w / 2, logo.y - h / 2],
    [logo.x - w / 2, logo.y + h / 2],
    [logo.x + w / 2, logo.y + h / 2],
  ];
  const waveReach = Math.max(...corners.map(([x, y]) => Math.hypot(x - glyph.x, y - glyph.y))) * 1.06;

  return {
    glyph,
    glyphRadius: (LOGO_STAR.r / LOGO_VIEWBOX.width) * w,
    entry,
    c1,
    c2,
    side,
    waveReach,
    waveBand: h * 0.22,
  };
}

/**
 * World radius of the reveal wave at time t: it slows as it spreads, like a real ripple, but never
 * stops — past the logo's edge it keeps going, so its trailing rings leave the artwork cleanly.
 */
export function waveRadius(plan: BigStarPlan, t: number) {
  if (t <= T.waveStart) return 0;
  const k = (t - T.waveStart) / (T.waveEnd - T.waveStart);
  return plan.waveReach * (k <= 1 ? k * (1.6 - 0.6 * k) : 1 + 0.4 * (k - 1));
}

/** When the wave reaches distance d from the glyph (d within the logo). */
export function waveTimeAt(plan: BigStarPlan, d: number) {
  const x = Math.min(1, d / plan.waveReach);
  const k = (1.6 - Math.sqrt(2.56 - 2.4 * x)) / 1.2;
  return T.waveStart + k * (T.waveEnd - T.waveStart);
}

/** When the reveal (in either style) reaches distance d from the glyph. Stars and their dust follow this. */
export function revealTimeAt(plan: BigStarPlan, d: number, style: "wave" | "glow" | "sweep") {
  if (style === "wave") return waveTimeAt(plan, d);
  // The glow lights the whole logo at once; the stars turn to dust together (a hair's stagger keeps it organic).
  return T.waveStart + 0.04 + 0.06 * Math.min(1, d / plan.waveReach);
}

const tmpQuat = new THREE.Quaternion();

/** The big star's pose at time t. Writes into `position` and `quaternion`. */
export function bigStarPose(plan: BigStarPlan, t: number, position: THREE.Vector3, quaternion: THREE.Quaternion): BigStarPose {
  const p = plan;
  const r = p.glyphRadius;
  const hidden: BigStarPose = { visible: false, scale: 0, depthScale: 1, morph: 0, dock: 0, shiver: 0 };
  if (t < T.bigStarEnter) return hidden;
  if (t >= T.settled) return { ...hidden, morph: 1, dock: 1 };

  if (t < T.docked) {
    // 1. Fly in out of deep space, tumbling, and decelerate onto the glyph with the points lined up.
    const k = (t - T.bigStarEnter) / (T.docked - T.bigStarEnter);
    const e = easeOutCubic(k);
    cubicBezier(position, p.entry, p.c1, p.c2, p.glyph, e);
    const unwind = 1 - easeOutCubic(k);
    quaternion.setFromAxisAngle(Z_AXIS, -p.side * SNAP * 3 * unwind).multiply(tmpQuat.setFromAxisAngle(Y_AXIS, unwind * Math.PI * 4));
    // Big all the way in, then it gathers itself down to the glyph's size over the last stretch.
    const scale = THREE.MathUtils.lerp(r * ENTRY_SCALE, r, easeInOutCubic(clamp01((k - 0.35) / 0.65)));
    return { visible: true, scale, depthScale: 1, morph: 0, dock: 0, shiver: 0 };
  }

  position.copy(p.glyph);

  if (t < T.shiverStart) {
    // 2. Set down with a little weight: a damped spring in scale and rotation.
    const tau = t - T.docked;
    const spring = Math.exp(-SETTLE_DAMP * tau) * Math.sin(SETTLE_FREQ * tau);
    quaternion.setFromAxisAngle(Z_AXIS, p.side * 0.12 * spring);
    return { visible: true, scale: r * (1 - 0.14 * spring), depthScale: 1, morph: 0, dock: 0, shiver: 0 };
  }

  if (t < T.waveStart) {
    // 3. Shiver: a fast tremble that builds while it gathers itself (a slight inhale in scale).
    const tau = t - T.shiverStart;
    const a = easeInQuad(tau / (T.waveStart - T.shiverStart));
    // A smooth shimmer rather than a shake: small, and slow enough to read as energy building.
    position.x += r * 0.012 * a * Math.sin(tau * 60);
    position.y += r * 0.012 * a * Math.sin(tau * 53 + 1.3);
    quaternion.setFromAxisAngle(Z_AXIS, 0.035 * a * Math.sin(tau * 48));
    return { visible: true, scale: r * (1 - 0.07 * a), depthScale: 1, morph: 0, dock: 0, shiver: a };
  }

  // 4. Release: a quick pop as the wave leaves, then it flattens into the flat star and hands over.
  const tau = t - T.waveStart;
  const pop = Math.exp(-9 * tau) * Math.sin(Math.min(tau * 14, Math.PI * 3));
  quaternion.setFromAxisAngle(Z_AXIS, -0.05 * pop);
  const morph = easeInOutCubic(clamp01((t - T.waveStart) / (T.settled - T.waveStart)));
  const dock = easeInOutCubic(clamp01((t - T.handoverStart) / (T.settled - T.handoverStart)));
  const shiver = Math.max(0, 1 - tau / 0.12);
  const inhale = 0.07 * Math.exp(-30 * tau); // let go of the shiver's inhale smoothly
  return { visible: true, scale: r * (1 - inhale + 0.16 * pop), depthScale: 1 - 0.88 * morph, morph, dock, shiver };
}
