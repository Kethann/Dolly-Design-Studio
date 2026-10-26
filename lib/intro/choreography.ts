import * as THREE from "three";
import type { LogoSlot } from "./sample-points";
import { colorFractions, pickColorIndex, type IntroSettings } from "./settings";
import type { Rng } from "./rng";

// Pure planning for the star intro: where every star starts, the curve it
// flies along, where it settles, and how it tumbles. No rendering here.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeInQuad = (x: number) => x * x;

/** The camera and the on-screen logo rectangle, both in world units (the logo sits on the z = 0 plane). */
export interface Stage {
  cameraZ: number;
  tanHalfFov: number;
  aspect: number;
  logo: { x: number; y: number; width: number; height: number };
}

/** Half the visible height/width of the view at depth z. */
export function viewHalfExtents(stage: Stage, z: number) {
  const halfHeight = (stage.cameraZ - z) * stage.tanHalfFov;
  return { halfWidth: halfHeight * stage.aspect, halfHeight };
}

/** What every planner needs to know about the creator's chosen look, plus the random source. */
export interface StarLook {
  rand: Rng;
  size: number;
  spaceDepth: number;
  glowChance: number;
  colorFractions: number[];
  scatter: number;
  disperse: number;
}

export function starLook(settings: IntroSettings, rand: Rng): StarLook {
  return {
    rand,
    size: settings.starSize,
    spaceDepth: settings.spaceDepth,
    glowChance: settings.glowingShare / 100,
    colorFractions: colorFractions(settings.colors),
    scatter: settings.scatter,
    disperse: settings.disperse,
  };
}

const range = (look: StarLook, min: number, max: number) => min + look.rand() * (max - min);

/** Background stars nearer the screen are bigger, farther ones smaller (on top of perspective), for a deep field. */
export const depthSize = (z: number) => 0.5 + 0.75 * clamp01((z + 24) / 24);

function randomAxis(look: StarLook) {
  return new THREE.Vector3(range(look, -1, 1), range(look, -1, 1), range(look, -1, 1)).normalize();
}

/** A depth for a star to start from: a mix of far behind, mid-field, and close in front of the camera. */
function randomStartDepth(look: StarLook) {
  const r = look.rand();
  const d = look.spaceDepth;
  if (r < 0.35) return range(look, -30, -8) * d; // far behind — tiny, fading out of the fog
  if (r < 0.75) return range(look, -8 * d, 2); // mid-field
  return range(look, 2, 2 + 5 * Math.min(1, d)); // close to the camera — big, sweeping past
}

/** A point just outside the frame, mostly at the corners, sometimes along an edge (normalized -1..1 screen space). */
function randomOffscreenPoint(look: StarLook) {
  const sign = () => (look.rand() < 0.5 ? -1 : 1);
  if (look.rand() < 0.65) {
    const sx = sign();
    const sy = sign();
    // 0.9–1.3: some begin just inside the frame so there's motion from the very first frame.
    return { x: sx * range(look, 0.9, 1.3) + range(look, -0.25, 0.25) * -sx, y: sy * range(look, 0.9, 1.3) + range(look, -0.25, 0.25) * -sy };
  }
  const along = range(look, -1, 1);
  const out = sign() * range(look, 0.95, 1.3);
  return look.rand() < 0.5 ? { x: out, y: along } : { x: along, y: out };
}

export interface FormationStar {
  start: THREE.Vector3;
  control: THREE.Vector3;
  target: THREE.Vector3;
  delay: number;
  duration: number;
  size: number;
  color: number;
  glow: boolean;
  spinAxis: THREE.Vector3;
  spinTurns: number;
  rest: THREE.Quaternion;
  wobblePhase: number;
}

/** Stars that fly in from the corners/edges and settle into random slots of the logo. */
export function planFormation(stage: Stage, slots: LogoSlot[], look: StarLook): FormationStar[] {
  const { logo } = stage;
  const baseSize = logo.height * 0.03 * look.size;
  const rand = (min: number, max: number) => range(look, min, max);

  return slots.map((slot) => {
    // Disperse: how loosely the stars settle around the artwork.
    const loose = logo.height * 0.08 * look.disperse;
    const target = new THREE.Vector3(
      logo.x + (slot.u - 0.5) * logo.width + rand(-1, 1) * loose,
      logo.y - (slot.v - 0.5) * logo.height + rand(-1, 1) * loose,
      rand(0.05, 0.45) + rand(0, 1.2) * look.disperse, // just in front of the logo plane (z = 0) so they cover it until the sweep
    );

    const z = randomStartDepth(look);
    const { halfWidth, halfHeight } = viewHalfExtents(stage, z);
    const p = randomOffscreenPoint(look);
    const start = new THREE.Vector3(p.x * halfWidth, p.y * halfHeight, z);

    // Bend the path with a control point pushed off the straight line, so stars arc in.
    const mid = start.clone().lerp(target, 0.5);
    const span = start.distanceTo(target);
    // Scatter: how wide the arcs swing (0 = nearly straight lines in).
    const swing = 0.7 * look.scatter;
    const control = mid.add(new THREE.Vector3(rand(-swing, swing) * span, rand(-swing, swing) * span, rand(-1, 2) * 2 * look.scatter));

    return {
      start,
      control,
      target,
      delay: rand(0, 0.4 + 1.2 * look.scatter), // the first stars are already streaming in on the very first frame
      duration: rand(1.4, 2.1),
      size: baseSize * rand(0.6, 1.3),
      color: pickColorIndex(look.colorFractions, look.rand()),
      glow: look.rand() < look.glowChance,
      spinAxis: randomAxis(look),
      spinTurns: rand(1, 3.5),
      rest: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(0, Math.PI * 2))),
      wobblePhase: rand(0, Math.PI * 2),
    };
  });
}

export interface AmbientStar {
  origin: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  color: number;
  glow: boolean;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  appearAt: number;
}

/** Free-floating stars filling the whole view at every depth — the atmosphere around the logo. */
export function planAmbient(stage: Stage, count: number, look: StarLook): AmbientStar[] {
  const rand = (min: number, max: number) => range(look, min, max);
  return Array.from({ length: count }, () => {
    const z = look.rand() < 0.8 ? rand(-30 * look.spaceDepth, 1) : rand(1, 6);
    const { halfWidth, halfHeight } = viewHalfExtents(stage, z);
    return {
      origin: new THREE.Vector3(rand(-1.1, 1.1) * halfWidth, rand(-1.1, 1.1) * halfHeight, z),
      velocity: new THREE.Vector3(rand(-0.12, 0.12), rand(-0.1, 0.06), rand(-0.05, 0.15)),
      size: rand(0.09, 0.17) * depthSize(z) * look.size,
      color: pickColorIndex(look.colorFractions, look.rand()),
      // No glowing stars right in front of the lens — they bloom into big blobs that haze the frame.
      glow: z < 1.5 && look.rand() < look.glowChance * 1.25,
      spinAxis: randomAxis(look),
      spinSpeed: rand(0.25, 0.9) * (look.rand() < 0.5 ? -1 : 1),
      appearAt: rand(0, 1.6),
    };
  });
}

/** Point on a cubic Bézier curve. Writes into `out`. */
export function cubicBezier(
  out: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  t: number,
) {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  out.set(
    w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x,
    w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y,
    w0 * a.z + w1 * b.z + w2 * c.z + w3 * d.z,
  );
  return out;
}

/**
 * Cubic Hermite easing from 0 to 1 with chosen start/end slopes. Lets one
 * motion segment hand its speed to the next, so there are no dead stops.
 */
export function hermiteEase(t: number, startSlope: number, endSlope: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (t3 - 2 * t2 + t) * startSlope + (-2 * t3 + 3 * t2) + (t3 - t2) * endSlope;
}

/** Direction of travel along a quadratic Bézier curve (unnormalized derivative). Writes into `out`. */
export function bezierTangent(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) {
  out.set(
    2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x),
    2 * (1 - t) * (b.y - a.y) + 2 * t * (c.y - b.y),
    2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z),
  );
  return out;
}

/** Point on a quadratic Bézier curve. Writes into `out`. */
export function bezier(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) {
  const u = 1 - t;
  out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
  return out;
}
