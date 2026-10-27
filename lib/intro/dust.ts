import * as THREE from "three";
import { T } from "./timeline";
import { bezier, bezierTangent, type FormationStar, type Stage } from "./choreography";
import { bigStarPose, revealTimeAt, type BigStarPlan } from "./big-star-path";
import type { Rng } from "./rng";

// Fine glitter left behind in the stars' flight paths. Every particle is
// planned up front (spawn point, birth time, lifetime, drift) and animated
// entirely in the vertex shader, so thousands of them cost almost nothing.

const WARM_WHITE = new THREE.Color("#fff4dc");

class DustBuffers {
  position: number[] = [];
  velocity: number[] = [];
  birth: number[] = [];
  life: number[] = [];
  size: number[] = [];
  seed: number[] = [];
  color: number[] = [];
  intensity: number[] = [];

  constructor(private rand: Rng) {}

  add(p: THREE.Vector3, v: THREE.Vector3, birth: number, life: number, size: number, color: THREE.Color, intensity: number) {
    this.position.push(p.x, p.y, p.z);
    this.velocity.push(v.x, v.y, v.z);
    this.birth.push(birth);
    this.life.push(life);
    this.size.push(size);
    this.seed.push(this.rand());
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

/** Builds every glitter particle for one playthrough: flight trails, the big star's trail, and the wave's sparkle. */
export function buildDustGeometry(
  stage: Stage,
  formation: FormationStar[],
  bigStar: BigStarPlan,
  palette: THREE.Color[],
  glowColor: THREE.Color,
  rand: Rng,
  revealStyle: "wave" | "glow" | "sweep" = "wave",
  /** Sweep reveal: when the big star passes world x (the sweep is timed across the logo, not out from its star). */
  sweepTimeAt?: (x: number) => number,
) {
  const timeAt = (p: THREE.Vector3, d: number) =>
    revealStyle === "sweep" && sweepTimeAt ? sweepTimeAt(p.x) : revealTimeAt(bigStar, d, revealStyle);
  const GOLD = glowColor;
  const range = (min: number, max: number) => min + rand() * (max - min);
  function randomUnit(out: THREE.Vector3, zScale = 1) {
    out.set(range(-1, 1), range(-1, 1), range(-1, 1) * zScale);
    return out.lengthSq() > 1e-6 ? out.normalize() : out.set(1, 0, 0);
  }

  const dust = new DustBuffers(rand);
  const { logo } = stage;
  const base = logo.height * 0.006;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const tint = new THREE.Color();

  // 1. Trails: each flying star sheds glitter along its path as it passes.
  for (const s of formation) {
    tint.copy(palette[s.color]).lerp(WARM_WHITE, 0.45);
    for (let k = 0; k < 8; k++) {
      const progress = range(0.06, 0.9); // eased progress along the path
      const local = 1 - Math.cbrt(1 - progress); // invert easeOutCubic → when the star is there
      const birth = s.delay + s.duration * local;
      bezier(p, s.start, s.control, s.target, progress).add(randomUnit(jitter).multiplyScalar(s.size * 0.7));
      bezierTangent(tangent, s.start, s.control, s.target, progress).normalize();
      v.copy(tangent)
        .multiplyScalar(-range(0.05, 0.25))
        .add(randomUnit(jitter).multiplyScalar(range(0.03, 0.12)));
      // Mostly faint glitter; one in ten catches the light hard enough to bloom.
      const bright = rand() < 0.1;
      dust.add(p, v, birth, range(0.6, 1.4), base * range(0.5, 1.2), tint, bright ? range(1.4, 1.9) : range(0.35, 0.8));
    }
  }

  // 2. The big star's trail as it comes in out of deep space (the wave and glow reveals; the sweep has no fly-in).
  const quat = new THREE.Quaternion();
  for (let k = 0; k < (revealStyle === "sweep" ? 0 : 700); k++) {
    const t = range(T.bigStarEnter + 0.1, T.docked);
    const pose = bigStarPose(bigStar, t, p, quat);
    if (!pose.visible) continue;
    p.add(randomUnit(jitter).multiplyScalar(pose.scale * Math.sqrt(rand()) * 0.6));
    randomUnit(v)
      .multiplyScalar(range(0.1, 0.45))
      .add(jitter.set(0, -0.3, 0));
    const bright = rand() < 0.3;
    dust.add(p, v, t, range(0.7, 1.6), base * range(1, 2), bright ? GOLD : WARM_WHITE, bright ? range(1.4, 2) : range(0.5, 1));
  }

  // 3. The wave: glitter lifts off the artwork itself (never the empty space around it) as the front passes.
  for (let k = 0; k < 900 && formation.length; k++) {
    const s = formation[Math.floor(rand() * formation.length)];
    p.copy(s.target).add(randomUnit(jitter, 0.2).multiplyScalar(s.size * 0.8));
    p.z = range(0.05, 0.25);
    const d = Math.hypot(p.x - bigStar.glyph.x, p.y - bigStar.glyph.y);
    v.set(p.x - bigStar.glyph.x, p.y - bigStar.glyph.y, 0)
      .normalize()
      .multiplyScalar(range(0.08, 0.35))
      .add(jitter.set(0, range(0, 0.2), range(0.05, 0.35)));
    const bright = rand() < 0.35;
    dust.add(
      p,
      v,
      timeAt(p, d),
      range(0.5, 1.1),
      base * range(0.6, 1.4),
      bright ? GOLD : WARM_WHITE,
      bright ? range(1.1, 1.7) : range(0.4, 0.85),
    );
  }

  // 4a. Glow reveal: every formation star blooms into a soft halo of light in its own colour, which then eases
  //     away — the logo emerges through it.
  if (revealStyle === "glow") {
    for (const s of formation) {
      const d = Math.hypot(s.target.x - bigStar.glyph.x, s.target.y - bigStar.glyph.y);
      tint.copy(palette[s.color]).lerp(GOLD, 0.45).lerp(WARM_WHITE, 0.2);
      dust.add(
        s.target,
        v.set(0, 0.03, 0),
        revealTimeAt(bigStar, d, revealStyle) - 0.08,
        range(1.3, 1.6),
        s.size * range(3, 4),
        tint,
        range(1.3, 1.7),
      );
    }
  }

  // 4. As the wave reaches it, every formation star breaks into a puff of glitter in its own colour, spread over
  //    the star's own size, drifting outward and up as it fades — the stars turn into dust as the crisp logo appears.
  for (const s of formation) {
    const d = Math.hypot(s.target.x - bigStar.glyph.x, s.target.y - bigStar.glyph.y);
    const away = jitter
      .set(s.target.x - stage.logo.x, s.target.y - stage.logo.y, 0)
      .normalize()
      .clone();
    tint.copy(palette[s.color]).lerp(WARM_WHITE, 0.25);
    for (let k = 0; k < 4; k++) {
      p.copy(s.target).add(randomUnit(v, 0.3).multiplyScalar(s.size * range(0.1, 0.9)));
      v.copy(away)
        .multiplyScalar(range(0.05, 0.25))
        .add(randomUnit(jitter, 0.5).multiplyScalar(range(0.05, 0.22)))
        .add(jitter.set(0, range(0.05, 0.2), 0));
      dust.add(p, v, timeAt(s.target, d) + range(0, 0.1), range(0.7, 1.5), base * range(0.9, 1.8), tint, range(1.1, 1.9));
    }
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
