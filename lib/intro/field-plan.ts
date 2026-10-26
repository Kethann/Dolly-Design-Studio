import { pickColorIndex } from "./settings";
import { depthSize, type StarLook } from "./choreography";
import type { FieldStar } from "./handoff";
import { CAMERA_Z, FOV } from "./star-scene";

const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180);

/** The lasting stars all sit behind the logo plane (and behind the hero's glass). */
export const FIELD_FRONT_Z = -0.5;

/** Lays out `count` lasting background stars across the view, at the same depths the intro uses for its survivors. */
export function planFieldStars(count: number, aspect: number, look: StarLook): FieldStar[] {
  const range = (min: number, max: number) => min + look.rand() * (max - min);
  return Array.from({ length: count }, () => {
    const z = range(-14 * look.spaceDepth, FIELD_FRONT_Z);
    const halfHeight = (CAMERA_Z - z) * TAN_HALF_FOV;
    const halfWidth = halfHeight * aspect;
    const axis: [number, number, number] = [range(-1, 1), range(-1, 1), range(-1, 1)];
    const length = Math.hypot(...axis) || 1;
    return {
      position: [range(-1.05, 1.05) * halfWidth, range(-1.05, 1.05) * halfHeight, z],
      axis: [axis[0] / length, axis[1] / length, axis[2] / length],
      angle: range(0, Math.PI * 2),
      velocity: [0, 0, 0],
      spin: range(0.25, 0.9) * (look.rand() < 0.5 ? -1 : 1),
      size: range(0.09, 0.17) * depthSize(z) * look.size,
      color: pickColorIndex(look.colorFractions, look.rand()),
      glow: look.rand() < look.glowChance * 1.25,
    };
  });
}
