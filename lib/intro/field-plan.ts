import { pickColorIndex } from "./settings";
import { depthSize, type StarLook } from "./choreography";
import type { FieldStar } from "./handoff";
import { CAMERA_Z, FOV } from "./star-scene";

const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180);

/** Back stars sit behind the glass (just behind the logo plane)… */
export const FIELD_FRONT_Z = -0.5;
/** …front stars float in front of it, nearer the screen — so they're bigger. */
export const FRONT_LAYER_Z: [number, number] = [0.6, 4];

export type StarLayer = "back" | "front";

type Point = [number, number, number];

/** Which layer a star at depth z belongs to (null: neither, e.g. right in front of the lens). */
export function layerOf(z: number): StarLayer | null {
  if (z < FIELD_FRONT_Z) return "back";
  if (z > FRONT_LAYER_Z[0] && z < FRONT_LAYER_Z[1]) return "front";
  return null;
}

/**
 * How far apart two stars look: their distance on screen (in screen heights) plus a share of their
 * difference in depth — so neighbours on screen tend to sit at different depths (one crisp, one soft)
 * rather than a clump of sharp stars next to a clump of blurred ones.
 */
function apart(a: Point, b: Point, aspect: number) {
  const ha = (CAMERA_Z - a[2]) * TAN_HALF_FOV;
  const hb = (CAMERA_Z - b[2]) * TAN_HALF_FOV;
  const dx = (a[0] / ha - b[0] / hb) * aspect;
  const dy = a[1] / ha - b[1] / hb;
  return Math.hypot(dx, dy) + 0.35 * (Math.abs(a[2] - b[2]) / 14);
}

/**
 * Picks `count` of the candidates, each time taking the one furthest from everything already placed
 * (best-candidate sampling): an even, natural spread with no clusters and no empty side.
 */
export function pickSpread(candidates: Point[], count: number, aspect: number, existing: Point[] = []): number[] {
  const picked: number[] = [];
  const taken = new Set<number>();
  const nearest = candidates.map((c) => existing.reduce((m, p) => Math.min(m, apart(c, p, aspect)), Infinity));
  for (let k = 0; k < count && picked.length < candidates.length; k++) {
    let best = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (taken.has(i)) continue;
      if (best < 0 || nearest[i] > nearest[best]) best = i;
    }
    picked.push(best);
    taken.add(best);
    for (let i = 0; i < candidates.length; i++) nearest[i] = Math.min(nearest[i], apart(candidates[i], candidates[best], aspect));
  }
  return picked;
}

/** A random point for a layer, anywhere in view at a random depth within the layer. */
function randomLayerPoint(layer: StarLayer, aspect: number, spaceDepth: number, rand: () => number): Point {
  const range = (min: number, max: number) => min + rand() * (max - min);
  const z = layer === "back" ? range(-14 * spaceDepth, FIELD_FRONT_Z) : range(...FRONT_LAYER_Z);
  const halfHeight = (CAMERA_Z - z) * TAN_HALF_FOV;
  return [range(-1.05, 1.05) * halfHeight * aspect, range(-1.05, 1.05) * halfHeight, z];
}

/**
 * Lays out `count` lasting stars for a layer, spread evenly around the ones already there
 * (`existing`, e.g. the intro's survivors), at the same depths the intro uses.
 */
export function planFieldStars(count: number, aspect: number, look: StarLook, layer: StarLayer, existing: Point[] = []): FieldStar[] {
  const range = (min: number, max: number) => min + look.rand() * (max - min);
  const candidates = Array.from({ length: count * 8 }, () => randomLayerPoint(layer, aspect, look.spaceDepth, look.rand));
  return pickSpread(candidates, count, aspect, existing).map((i) => {
    const position = candidates[i];
    const axis: Point = [range(-1, 1), range(-1, 1), range(-1, 1)];
    const length = Math.hypot(...axis) || 1;
    return {
      position,
      axis: [axis[0] / length, axis[1] / length, axis[2] / length],
      angle: range(0, Math.PI * 2),
      velocity: [0, 0, 0],
      spin: range(0.25, 0.9) * (look.rand() < 0.5 ? -1 : 1),
      size: range(0.09, 0.17) * depthSize(position[2]) * look.size,
      color: pickColorIndex(look.colorFractions, look.rand()),
      glow: look.rand() < look.glowChance * 1.25,
    };
  });
}
