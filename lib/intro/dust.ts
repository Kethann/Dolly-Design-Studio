import * as THREE from "three";
import { T } from "./timeline";
import { bezier, bezierTangent, type FormationStar, type Stage } from "./choreography";
import { bigStarPose, type BigStarPlan } from "./big-star-path";
import type { Rng } from "./rng";

// Fine glitter left behind in the stars' flight paths. Every particle is
// planned up front (spawn point, birth time, lifetime, drift) and animated
// entirely in the vertex shader, so thousands of them cost almost nothing.

let random: Rng = Math.random;
const rand = (min: number, max: number) => min + random() * (max - min);
const WARM_WHITE = new THREE.Color("#fff4dc");
const GOLD = new THREE.Color("#ffc65c");

function randomUnit(out: THREE.Vector3, zScale = 1) {
  out.set(rand(-1, 1), rand(-1, 1), rand(-1, 1) * zScale);
  return out.lengthSq() > 1e-6 ? out.normalize() : out.set(1, 0, 0);
}

class DustBuffers {
  position: number[] = [];
  velocity: number[] = [];
  birth: number[] = [];
  life: number[] = [];
  size: number[] = [];
  seed: number[] = [];
  color: number[] = [];
  intensity: number[] = [];

  add(p: THREE.Vector3, v: THREE.Vector3, birth: number, life: number, size: number, color: THREE.Color, intensity: number) {
    this.position.push(p.x, p.y, p.z);
    this.velocity.push(v.x, v.y, v.z);
    this.birth.push(birth);
    this.life.push(life);
    this.size.push(size);
    this.seed.push(random());
    this.color.push(color.r, color.g, color.b);
    this.intensity.push(intensity);
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute("aVelocity", new THREE.Float32BufferAttribute(this.velocity, 3));
    g.setAttribute("aBirth", new THREE.Float32BufferAttribute(this.birth, 1));
    g.setAttribute("aLife", new THREE.Float32BufferAttribute(this.life, 1));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute("aColor", new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute("aIntensity", new THREE.Float32BufferAttribute(this.intensity, 1));
    return g;
  }
}

/** Builds every glitter particle for one playthrough: flight trails, the opening burst, and the big star's shower. */
export function buildDustGeometry(
  stage: Stage,
  formation: FormationStar[],
  bigStar: BigStarPlan,
  palette: THREE.Color[],
  rng: Rng,
  perStar = 8,
  bigStarCount = 1400,
) {
  random = rng;
  const dust = new DustBuffers();
  const base = stage.logo.height * 0.006;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const tint = new THREE.Color();

  // 1. Trails: each flying star sheds glitter along its path as it passes.
  for (const s of formation) {
    tint.copy(palette[s.color]).lerp(WARM_WHITE, 0.45);
    for (let k = 0; k < perStar; k++) {
      const progress = rand(0.06, 0.9); // eased progress along the path
      const local = 1 - Math.cbrt(1 - progress); // invert easeOutCubic → when the star is there
      const birth = s.delay + s.duration * local;
      bezier(p, s.start, s.control, s.target, progress).add(randomUnit(jitter).multiplyScalar(s.size * 0.7));
      bezierTangent(tangent, s.start, s.control, s.target, progress).normalize();
      v.copy(tangent).multiplyScalar(-rand(0.05, 0.25)).add(randomUnit(jitter).multiplyScalar(rand(0.03, 0.12)));
      // Mostly faint glitter; one in ten catches the light hard enough to bloom.
      const bright = random() < 0.1;
      dust.add(p, v, birth, rand(0.6, 1.4), base * rand(0.5, 1.2), tint, bright ? rand(1.4, 1.9) : rand(0.35, 0.8));
    }
  }

  // 2. Opening burst: a ring of glitter blooms out of the first glint.
  const centre = new THREE.Vector3(stage.logo.x, stage.logo.y, 0.5);
  for (let k = 0; k < 320; k++) {
    randomUnit(v, 0.35).multiplyScalar(rand(1.2, 3.2));
    dust.add(centre, v, T.sparkPeak + rand(0, 0.12), rand(0.7, 1.5), base * rand(0.8, 1.6), random() < 0.5 ? GOLD : WARM_WHITE, rand(1, 2));
  }

  // 3. Landing splash: glitter kicked out sideways and up where the big star lands.
  for (let k = 0; k < 220; k++) {
    const angle = rand(0, Math.PI * 2);
    p.copy(bigStar.landing).add(jitter.set(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(bigStar.landRadius * rand(0.2, 0.6)));
    v.set(Math.cos(angle) * rand(0.8, 2.2), Math.abs(Math.sin(angle)) * rand(0.4, 1.4) + 0.3, rand(-0.2, 0.6));
    dust.add(p, v, T.bigStarLanded + rand(0, 0.06), rand(0.6, 1.2), base * rand(0.9, 1.9), random() < 0.6 ? GOLD : WARM_WHITE, rand(1, 2));
  }

  // 4. The big star's shower — denser while it rolls across the logo.
  const quat = new THREE.Quaternion();
  for (let k = 0; k < bigStarCount; k++) {
    const rolling = random() < 0.4;
    const t = rolling ? rand(T.atEdge, T.rollDone) : rand(T.bigStarEnter, T.docked);
    const pose = bigStarPose(bigStar, t, p, quat);
    if (!pose.visible) continue;
    const angle = rand(0, Math.PI * 2);
    const r = Math.sqrt(random()) * pose.scale * 0.55;
    p.x += Math.cos(angle) * r;
    p.y += Math.sin(angle) * r;
    p.z -= rand(0, pose.scale * 0.3);
    randomUnit(v).multiplyScalar(rand(0.15, 0.6)).add(jitter.set(0, -0.35, 0));
    if (rolling) v.x -= bigStar.direction * rand(0.1, 0.4); // left behind as it rolls on
    const bright = random() < 0.3;
    dust.add(p, v, t, rand(0.8, 1.9), base * rand(1, 2.2), bright ? GOLD : WARM_WHITE, bright ? rand(1.5, 2.2) : rand(0.5, 1));
  }

  return dust.toGeometry();
}

const vertexShader = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  attribute float aIntensity;

  uniform float uTime;
  uniform float uProjScale; // pixels per world unit at distance 1
  uniform float uFade;
  uniform float uGlow;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRays;

  void main() {
    float age = uTime - aBirth;
    if (age < 0.0 || age > aLife) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off-screen, not yet born or already gone
      gl_PointSize = 0.0;
      return;
    }
    float life = age / aLife;

    // Drift, a slow fall, and a slight flutter.
    vec3 p = position + aVelocity * age + vec3(0.0, -0.18 * age * age, 0.0);
    p.x += sin(uTime * 2.0 + aSeed * 20.0) * 0.02 * age;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float twinkle = 0.55 + 0.45 * sin(uTime * (8.0 + aSeed * 10.0) + aSeed * 40.0);
    float fadeIn = smoothstep(0.0, 0.08, life);
    float fadeOut = pow(1.0 - life, 1.5);
    vAlpha = fadeIn * fadeOut * twinkle * uFade;
    vColor = aColor * aIntensity * uGlow;
    vRays = step(0.72, aSeed); // a few particles flash as tiny 4-ray sparkles

    gl_PointSize = max(1.0, aSize * uProjScale / -mv.z * (0.6 + 0.4 * twinkle) * (1.0 + vRays));
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRays;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float core = exp(-dot(uv, uv) * 8.0);
    float rays = exp(-abs(uv.x) * 14.0) * exp(-abs(uv.y) * 2.5) + exp(-abs(uv.y) * 14.0) * exp(-abs(uv.x) * 2.5);
    float a = (core + rays * 0.6 * vRays) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export function createDustMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProjScale: { value: 1 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
    },
  });
}
