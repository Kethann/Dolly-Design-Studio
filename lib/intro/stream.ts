import * as THREE from "three";
import { createRng } from "./rng";
import { pickColorIndex, colorFractions, type IntroSettings } from "./settings";
import { CAMERA_Z, FOV } from "./star-scene";
import type { StarLayer } from "./field-plan";

// Stars streaming out of a core behind the logo to every side of the screen, like rays: each springs from
// the core small and far, flies outward (mostly toward the corners) while coming toward the camera — so it
// grows — tumbling as it goes and now and then flipping over, then leaves the screen and is born again at
// the core. Every star's pose is a pure function of time, so the intro and the page compute exactly the same
// stream from the same seed and clock: the hand-off between them is seamless, and the screen stays evenly
// filled however long you look or scroll.

const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180);

/** Depths each layer's stream travels through (from the core outward). */
const DEPTHS: Record<StarLayer, [number, number]> = {
  back: [-26, -2], // behind the glass
  front: [0.8, 6], // in front of it, rushing past
};

export interface StreamStar {
  angle: number;
  /** How far past the screen edge it flies before being reborn (1 = the edge). */
  reach: number;
  /** Where it is in its journey at time 0 (0..1). */
  phase: number;
  /** Personal speed variation. */
  pace: number;
  /** Starting distance from the core, as a share of the screen (front stars start further out, clear of the logo). */
  start: number;
  size: number;
  color: number;
  glow: boolean;
  axis: THREE.Vector3;
  spin: number;
  flipAxis: THREE.Vector3;
  flipPhase: number;
}

export function planStream(count: number, layer: StarLayer, settings: IntroSettings, seed: number): StreamStar[] {
  const rand = createRng(seed + (layer === "front" ? 7919 : 0));
  const range = (min: number, max: number) => min + rand() * (max - min);
  const fractions = colorFractions(settings.colors);
  const axis = () => new THREE.Vector3(range(-1, 1), range(-1, 1), range(-1, 1)).normalize();
  const pull = settings.stream.corners;
  return Array.from({ length: count }, (_, i) => {
    // Spread evenly round the circle (stratified), with a pull toward the nearest screen corner.
    const even = ((i + rand()) / Math.max(1, count)) * Math.PI * 2;
    const corner = Math.round((even - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    const angle = even + (corner - even) * pull * 0.75 + range(-0.08, 0.08);
    return {
      angle,
      reach: range(1.1, 1.45),
      phase: (i * 0.61803398875 + rand() * 0.2) % 1, // golden-ratio spacing: births never bunch up
      pace: range(0.8, 1.2),
      start: layer === "front" ? range(0.32, 0.5) : range(0.0, 0.08),
      size: range(0.08, 0.16) * (layer === "front" ? settings.front.size : settings.field.size) * settings.starSize,
      color: pickColorIndex(fractions, rand()),
      glow: rand() < (settings.glowingShare / 100) * 1.25,
      axis: axis(),
      spin: range(0.5, 1.2) * (rand() < 0.5 ? -1 : 1),
      flipAxis: axis(),
      flipPhase: rand(),
    };
  });
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Where a stream star is at time `t` (seconds). Writes position and rotation; returns its visible size
 * (0 while it's being reborn at the core).
 */
export function streamPose(
  s: StreamStar,
  layer: StarLayer,
  t: number,
  settings: IntroSettings,
  aspect: number,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  flip: THREE.Quaternion,
) {
  const { speed, spin, flips } = settings.stream;
  const journey = THREE.MathUtils.lerp(16, 5, speed); // seconds from the core to beyond the edge
  const life = (((s.phase + (t * s.pace) / journey) % 1) + 1) % 1;
  const [zFrom, zTo] = DEPTHS[layer];
  const z = THREE.MathUtils.lerp(zFrom, zTo, life);
  // Accelerates outward, like a warp: slow near the core, rushing at the edges.
  const r = s.start + (s.reach - s.start) * Math.pow(life, 1.5);
  const halfHeight = (CAMERA_Z - z) * TAN_HALF_FOV;
  position.set(Math.cos(s.angle) * r * halfHeight * aspect, Math.sin(s.angle) * r * halfHeight, z);

  // Tumbling all the way, and every so often a full flip.
  quaternion.setFromAxisAngle(s.axis, s.spin * t * (0.3 + 1.7 * spin));
  if (flips > 0) {
    const period = THREE.MathUtils.lerp(14, 3, flips);
    const k = (((t / period + s.flipPhase) % 1) + 1) % 1;
    const window = 0.7 / period; // a flip takes about 0.7s
    if (k < window) quaternion.premultiply(flip.setFromAxisAngle(s.flipAxis, smooth(k / window) * Math.PI * 2));
  }

  // Grows out of the core; gone just before it would pop back.
  const appear = smooth(Math.min(1, life / 0.12));
  const leave = 1 - smooth(Math.max(0, (life - 0.94) / 0.06));
  return s.size * appear * leave;
}
