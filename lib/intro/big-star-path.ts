import * as THREE from "three";
import { LOGO_STAR, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { T } from "./timeline";
import {
  clamp01,
  cubicBezier,
  easeInOutCubic,
  easeOutCubic,
  hermiteEase,
  viewHalfExtents,
  type Stage,
} from "./choreography";

// The big star's whole journey as one continuous ride. Each segment hands its
// speed (and spin rate) to the next — swoop in → land with weight → settle →
// flip → lift off and swoop into the logo's edge already moving → roll across
// → carry the momentum up into a loop → descend onto the logo's own star,
// decelerating its spin so the points line up → spring-settle → hand over.

export interface BigStarPlan {
  direction: number; // +1 rolls left → right, -1 right → left
  landRadius: number;
  rollRadius: number;
  glyphRadius: number;
  // swoop in
  entry: THREE.Vector3;
  entryC1: THREE.Vector3;
  entryC2: THREE.Vector3;
  landing: THREE.Vector3;
  // lift off into the edge
  loopC1: THREE.Vector3;
  loopC2: THREE.Vector3;
  edgeStart: THREE.Vector3;
  // roll
  rollEnd: THREE.Vector3;
  rollLength: number;
  rollStartRotation: number;
  // loop up and dock
  dockC1: THREE.Vector3;
  dockC2: THREE.Vector3;
  glyph: THREE.Vector3;
  finalRoll: number;
  dockRotation: number;
  dockSpinSlope: number;
  settleSpinAmplitude: number;
  settleScaleAmplitude: number;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TUMBLE_AXIS = new THREE.Vector3(0.3, 1, 0.2).normalize();
const SNAP = (Math.PI * 2) / 5; // a 5-point star looks identical every 72°

// Speed hand-offs between segments (Hermite slopes; ≤ ~2.5 keeps each segment monotonic).
const ROLL_START_SLOPE = 1.2;
const ROLL_END_SLOPE = 1.1;
const DOCK_START_SLOPE = 1.5;
const DOCK_SPIN_END_SLOPE = 0.25;
const DOCK_SCALE_END_SLOPE = 0.25;
// Spring settle on the logo's star.
const SETTLE_FREQ = 17; // rad/s
const SETTLE_DAMP = 7;

/** Arrives with a little speed left, so the landing has weight. */
const arrive = (k: number) => k * (1.6 - 0.6 * k);
const easeInSine = (k: number) => 1 - Math.cos((k * Math.PI) / 2);

export function planBigStar(stage: Stage, landingSlots: THREE.Vector3[]): BigStarPlan {
  const { logo } = stage;
  const h = logo.height;
  const w = logo.width;

  // Land on a random slot away from the centre; roll toward the far side from the near edge.
  const offCentre = landingSlots.filter((p) => Math.abs(p.x - logo.x) > w * 0.15);
  const pool = offCentre.length ? offCentre : landingSlots;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const landing = pick ? new THREE.Vector3(pick.x, pick.y, 0.8) : new THREE.Vector3(logo.x - w * 0.3, logo.y, 0.8);
  const direction = landing.x < logo.x ? 1 : -1;

  const landRadius = h * 0.32;
  const rollRadius = h * 0.48;
  const glyphRadius = (LOGO_STAR.r / LOGO_VIEWBOX.width) * w;

  // Swoop in from the near side, starting close to the lens (large), descending from above-front.
  const half = viewHalfExtents(stage, 4);
  const entry = new THREE.Vector3(-direction * half.halfWidth * 1.25, (Math.random() - 0.5) * 0.8 * half.halfHeight, 4);
  const entryC1 = entry.clone().add(new THREE.Vector3(direction * half.halfWidth * 0.5, h * 0.8, -0.5));
  const entryC2 = landing.clone().add(new THREE.Vector3(-direction * w * 0.08, h * 0.7, 1.4));

  // Roll geometry.
  const edgeStart = new THREE.Vector3(logo.x - direction * (w / 2), logo.y, 0.8);
  const rollEnd = new THREE.Vector3(logo.x + direction * (w / 2 + rollRadius * 0.25), logo.y, 0.8);
  const rollLength = Math.abs(rollEnd.x - edgeStart.x);
  const rollDur = T.rollDone - T.atEdge;
  const rollStartSpeed = (ROLL_START_SLOPE * rollLength) / rollDur;
  const rollEndSpeed = (ROLL_END_SLOPE * rollLength) / rollDur;

  // Lift-off arc: up from the landing spot, over, and in through the edge horizontally at roll speed.
  const loopDur = T.atEdge - T.glintDone;
  const edgeReach = (rollStartSpeed * loopDur) / (3 * (Math.PI / 2)); // easeInSine ends at slope π/2
  const loopC1 = landing.clone().add(new THREE.Vector3(0, h * 0.95, 1.4));
  const loopC2 = edgeStart.clone().add(new THREE.Vector3(-direction * edgeReach, 0, 0));
  // Spin during the lift-off so it enters the roll already turning at the rolling rate.
  const rollStartRotation = -direction * (rollStartSpeed / rollRadius) * (loopDur / (Math.PI / 2));

  // Dock loop: carry on past the edge, swing up and back, and come down onto the glyph.
  const dockDur = T.docked - T.rollDone;
  const exitReach = (rollEndSpeed * dockDur) / (3 * DOCK_START_SLOPE);
  const glyph = new THREE.Vector3(
    logo.x + (LOGO_STAR.cx / LOGO_VIEWBOX.width - 0.5) * w,
    logo.y - (LOGO_STAR.cy / LOGO_VIEWBOX.height - 0.5) * h,
    0, // exactly on the logo plane, so it lines up with the flat glyph pixel-for-pixel
  );
  const dockC1 = rollEnd.clone().add(new THREE.Vector3(direction * exitReach, 0, 0));
  const dockC2 = glyph.clone().add(new THREE.Vector3(0, h * 0.75, 1.2));

  // Spin: keep rolling at the same rate, then decelerate onto a rotation where the points line up.
  const finalRoll = rollStartRotation - (direction * rollLength) / rollRadius;
  const spinRate = rollEndSpeed / rollRadius; // rad/s, in the -direction sense
  let dockRotation = Math.round((finalRoll - (direction * spinRate * dockDur) / DOCK_START_SLOPE) / SNAP) * SNAP;
  // Keep turning the same way it was rolling, and never a tiny, twitchy turn.
  while ((dockRotation - finalRoll) * -direction < 0.6) dockRotation -= direction * SNAP;
  const dockDelta = Math.abs(dockRotation - finalRoll);
  const dockSpinSlope = Math.min(2.5, (spinRate * dockDur) / dockDelta);

  // Springs continue exactly from the speed the dock segment ends with.
  const settleSpinAmplitude = (dockDelta * DOCK_SPIN_END_SLOPE) / dockDur / SETTLE_FREQ;
  const settleScaleAmplitude = ((rollRadius - glyphRadius) * DOCK_SCALE_END_SLOPE) / dockDur / SETTLE_FREQ / glyphRadius;

  return {
    direction,
    landRadius,
    rollRadius,
    glyphRadius,
    entry,
    entryC1,
    entryC2,
    landing,
    loopC1,
    loopC2,
    edgeStart,
    rollEnd,
    rollLength,
    rollStartRotation,
    dockC1,
    dockC2,
    glyph,
    finalRoll,
    dockRotation,
    dockSpinSlope,
    settleSpinAmplitude: Math.min(0.25, settleSpinAmplitude),
    settleScaleAmplitude: Math.min(0.18, settleScaleAmplitude),
  };
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
}

const tmpQuat = new THREE.Quaternion();

/** x of the star along the roll at time t (inside the roll segment). */
function rollX(p: BigStarPlan, t: number) {
  const k = clamp01((t - T.atEdge) / (T.rollDone - T.atEdge));
  return p.edgeStart.x + p.direction * p.rollLength * hermiteEase(k, ROLL_START_SLOPE, ROLL_END_SLOPE);
}

/** The big star's pose at time t. Writes into `position` and `quaternion`. */
export function bigStarPose(plan: BigStarPlan, t: number, position: THREE.Vector3, quaternion: THREE.Quaternion): BigStarPose {
  const p = plan;
  const hidden: BigStarPose = { visible: false, scale: 0, depthScale: 1, morph: 0, dock: 0 };
  if (t < T.bigStarEnter) return hidden;
  if (t >= T.settled) return { ...hidden, morph: 1, dock: 1 };

  if (t < T.bigStarLanded) {
    // 1. Swoop in, tumbling, and arrive with a little speed left.
    const k = (t - T.bigStarEnter) / (T.bigStarLanded - T.bigStarEnter);
    cubicBezier(position, p.entry, p.entryC1, p.entryC2, p.landing, arrive(k));
    quaternion.setFromAxisAngle(TUMBLE_AXIS, (1 - easeOutCubic(k)) * Math.PI * 5);
    return { visible: true, scale: p.landRadius, depthScale: 1, morph: 0, dock: 0 };
  }

  if (t < T.landSettled) {
    // 2. Land with weight: it absorbs the impact (squash), springs back (stretch) and rocks gently to rest.
    const tau = t - T.bigStarLanded;
    const ramp = 1 - Math.exp(-30 * tau); // build up over the first ~0.1s instead of snapping
    position.copy(p.landing);
    position.y -= p.landRadius * 0.06 * Math.exp(-7 * tau) * Math.sin(16 * tau);
    quaternion.setFromAxisAngle(Z_AXIS, 0.14 * ramp * Math.exp(-6 * tau) * Math.sin(14 * tau));
    const squash = 1 - 0.12 * Math.exp(-6 * tau) * Math.sin(15 * tau);
    return { visible: true, scale: p.landRadius * squash, depthScale: 1, morph: 0, dock: 0 };
  }

  if (t < T.glintDone) {
    // 3. One flip so the facets catch the light.
    const k = (t - T.landSettled) / (T.glintDone - T.landSettled);
    position.copy(p.landing);
    quaternion.setFromAxisAngle(Y_AXIS, easeInOutCubic(k) * Math.PI * 2);
    return { visible: true, scale: p.landRadius, depthScale: 1, morph: 0, dock: 0 };
  }

  if (t < T.atEdge) {
    // 4. Lift off in an arc and swoop into the logo's edge, accelerating, already spinning at the rolling rate.
    const k = (t - T.glintDone) / (T.atEdge - T.glintDone);
    const e = easeInSine(k);
    cubicBezier(position, p.landing, p.loopC1, p.loopC2, p.edgeStart, e);
    quaternion.setFromAxisAngle(Z_AXIS, p.rollStartRotation * e);
    return { visible: true, scale: THREE.MathUtils.lerp(p.landRadius, p.rollRadius, easeInOutCubic(k)), depthScale: 1, morph: 0, dock: 0 };
  }

  if (t < T.rollDone) {
    // 5. Roll across the logo — rotation matches distance travelled, like a real wheel.
    const k = (t - T.atEdge) / (T.rollDone - T.atEdge);
    position.set(rollX(p, t), p.edgeStart.y, p.edgeStart.z);
    const roll = p.rollStartRotation - (p.direction * (position.x - p.edgeStart.x)) / p.rollRadius;
    quaternion.setFromAxisAngle(Z_AXIS, roll).multiply(tmpQuat.setFromAxisAngle(Y_AXIS, Math.sin(k * Math.PI * 2) * 0.25));
    return { visible: true, scale: p.rollRadius, depthScale: 1, morph: 0, dock: 0 };
  }

  // Flatten and shift to the logo's flat gold over the last moments of the descent and the settle.
  const morph = easeInOutCubic(clamp01((t - (T.docked - 0.35)) / 0.6));
  const depthScale = 1 - 0.88 * morph;

  if (t < T.docked) {
    // 6. Carry the momentum up into a loop and descend onto the glyph, spin decelerating into alignment.
    const k = (t - T.rollDone) / (T.docked - T.rollDone);
    cubicBezier(position, p.rollEnd, p.dockC1, p.dockC2, p.glyph, hermiteEase(k, DOCK_START_SLOPE, 0));
    const spin = p.finalRoll + (p.dockRotation - p.finalRoll) * hermiteEase(k, p.dockSpinSlope, DOCK_SPIN_END_SLOPE);
    quaternion.setFromAxisAngle(Z_AXIS, spin).multiply(tmpQuat.setFromAxisAngle(Y_AXIS, Math.sin(k * Math.PI) * 0.45 * (1 - k)));
    const scale = THREE.MathUtils.lerp(p.rollRadius, p.glyphRadius, hermiteEase(k, 0, DOCK_SCALE_END_SLOPE));
    return { visible: true, scale, depthScale, morph, dock: 0 };
  }

  // 7. Spring-settle exactly on the glyph, then hand over to the flat star.
  const tau = t - T.docked;
  const spring = Math.exp(-SETTLE_DAMP * tau) * Math.sin(SETTLE_FREQ * tau);
  position.copy(p.glyph);
  quaternion.setFromAxisAngle(Z_AXIS, p.dockRotation - p.direction * p.settleSpinAmplitude * spring);
  const dock = easeInOutCubic(clamp01((t - T.handoverStart) / (T.settled - T.handoverStart)));
  return { visible: true, scale: p.glyphRadius * (1 - p.settleScaleAmplitude * spring), depthScale, morph, dock };
}

/** World-space x of the reveal wipe at time t (trails just behind the rolling star). */
export function wipeX(plan: BigStarPlan, t: number) {
  if (t < T.atEdge) return -plan.direction * 1e4; // nothing revealed yet
  if (t >= T.rollDone) return plan.direction * 1e4; // fully revealed
  return rollX(plan, t) - plan.direction * plan.rollRadius * 0.2;
}
