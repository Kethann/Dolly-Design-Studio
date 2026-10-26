import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { createRng } from "./rng";
import { ART_STYLES, type IntroSettings } from "./settings";

/**
 * The premium backdrop, painted *under* the stars after they're rendered (and
 * after any depth blur), so its fine gold lines stay crisp while the far stars
 * go soft. The stars are rendered on a transparent background; this pass lays
 * the backdrop wherever they leave room: out = stars + backdrop × (1 − stars' alpha).
 *
 * Every style starts from a deep diagonal gradient of the background colour
 * toward the second colour, keeps the centre calm and dark so text reads
 * clearly, and adds its own shapes:
 * - waves: raised sweeping panels with gold edges, a gold ribbon and a band of fine lines;
 * - silk: broad diagonal folds with a soft sheen and a few fine lines;
 * - halo: a pool of light in one corner with fine concentric gold arcs;
 * - minimal: the gradient and a single gold edge.
 * The arrangement (positions, curves, phases) comes from a seed, so it can be reshuffled.
 */
const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 uBase;
  uniform vec3 uTone;
  uniform vec3 uGold;
  uniform float uLines;
  uniform float uDepth;
  uniform float uStyle;
  uniform float uTime;
  uniform float uAspect;
  uniform float uAmount; // 0 = plain background colour, 1 = the full backdrop
  uniform vec4 uA;       // arrangement: panel 1 (height, swing, frequency, phase)
  uniform vec4 uB;       // panel 2 (height, swing, frequency, phase)
  uniform vec4 uC;       // line band (height, swing, frequency, phase)
  uniform vec4 uD;       // light / glint spots (x1, y1, x2, flip)
  varying vec2 vUv;

  float line(float d, float width) {
    float w = fwidth(d) * width;
    return 1.0 - smoothstep(0.0, w, abs(d));
  }

  float glint(vec2 p, vec2 at, float phase) {
    vec2 d = (p - at) * vec2(uAspect, 1.0);
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.3 + phase);
    float rays = exp(-abs(d.x) * 260.0) * exp(-abs(d.y) * 16.0) + exp(-abs(d.y) * 260.0) * exp(-abs(d.x) * 16.0);
    return (rays * 0.8 + exp(-dot(d, d) * 9000.0)) * twinkle;
  }

  // A sweeping curve across the screen: y at x.
  float curve(vec4 c, float x, float speed) {
    return c.x + c.y * sin(x * c.z + c.w + uTime * speed);
  }

  void main() {
    vec4 stars = texture2D(tDiffuse, vUv);
    float x = uD.w > 0.5 ? 1.0 - vUv.x : vUv.x; // some arrangements mirror left/right
    float y = vUv.y;
    float t = uTime;
    int style = int(uStyle + 0.5);

    vec3 deep = uBase * mix(0.62, 0.3, uDepth);
    vec3 lifted = mix(uBase, uTone, 0.45);
    vec3 col = mix(deep, lifted, smoothstep(-0.1, 1.2, 0.6 * x + 0.5 * y));
    float gold = 0.0;
    float sparkle = 0.0;

    if (style == 0 || style == 3) {
      // Raised panel at the top: everything above the curve, casting a soft shadow beneath it.
      float c1 = curve(uA, x, 0.05) - 0.05 * x;
      float above = smoothstep(c1 - 0.002, c1 + 0.002, y);
      vec3 panel = mix(mix(uBase, uTone, 0.55), uTone * 1.05, clamp((y - c1) * 4.0, 0.0, 1.0));
      col *= 1.0 - (0.2 + 0.4 * uDepth) * (1.0 - above) * exp(-max(c1 - y, 0.0) * 16.0);
      col = mix(col, panel, above);
      gold += line(y - c1, 1.4) * 0.95;
      sparkle += glint(vec2(x, y), vec2(uD.x, curve(uA, uD.x, 0.05) - 0.05 * uD.x), 0.0);
    }
    if (style == 0) {
      // Raised panel along the bottom, with a slim gold ribbon tucked under its edge.
      float c2 = curve(uB, x, 0.04) + 0.1 * x;
      float below = 1.0 - smoothstep(c2 - 0.002, c2 + 0.002, y);
      vec3 panel = mix(mix(uBase, uTone, 0.6), uBase * 0.7, clamp((c2 - y) * 5.0, 0.0, 1.0));
      col *= 1.0 - (0.2 + 0.35 * uDepth) * (1.0 - below) * exp(-max(y - c2, 0.0) * 14.0);
      col = mix(col, panel, below);
      float c3 = c2 - 0.012 - 0.05 * (1.0 - x) * (1.0 - x);
      float ribbon = below * smoothstep(c3 - 0.002, c3 + 0.002, y);
      col = mix(col, uGold * mix(0.55, 1.15, clamp((y - c3) / max(c2 - c3, 1e-3), 0.0, 1.0)), ribbon * uLines * 0.9);
      gold += line(y - c2, 1.6) * 0.85;
      sparkle += glint(vec2(x, y), vec2(uD.z, curve(uB, uD.z, 0.04) + 0.1 * uD.z), 2.1);
    }
    if (style == 1) {
      // Silk: broad diagonal folds, each shaded from shadow to sheen.
      for (int k = 0; k < 4; k++) {
        float fk = float(k);
        float centre = -0.35 + fk * 0.42 + 0.06 * sin(fk * 2.3 + uA.w);
        float d = (y - 0.55 * x) - centre - 0.05 * sin(x * uA.z + fk + t * 0.05);
        float fold = sin(clamp(d / 0.42, 0.0, 1.0) * 3.14159);
        col *= 1.0 + (fold - 0.5) * (0.25 + 0.45 * uDepth) * step(0.0, d) * step(d, 0.42);
        col = mix(col, mix(uBase, uTone, 0.7), pow(max(fold, 0.0), 6.0) * 0.35 * step(0.0, d) * step(d, 0.42));
        if (k == 1) gold += line(d - 0.21, 1.2) * 0.7;
      }
      sparkle += glint(vec2(x, y), vec2(uD.x, 0.55 * uD.x - 0.35 + 0.42 + 0.21), 1.0);
    }
    if (style == 2) {
      // Halo: a pool of light in one corner with fine concentric arcs of gold.
      vec2 at = vec2(uD.x * 0.4 + 0.6, uD.y * 0.3 + 0.7);
      float r = length((vec2(x, y) - at) * vec2(uAspect, 1.0));
      col = mix(col, mix(uBase, uTone, 0.8) * 1.15, exp(-r * (2.2 - 1.2 * uDepth)) * 0.85);
      col *= 1.0 - 0.35 * uDepth * smoothstep(0.4, 1.6, r);
      for (int k = 0; k < 9; k++) {
        float rk = 0.28 + float(k) * (0.09 + 0.02 * uC.y) + 0.01 * sin(t * 0.2 + float(k));
        gold += line(r - rk, 1.0) * (0.55 - float(k) * 0.045);
      }
      sparkle += glint(vec2(x, y), at + vec2(-0.32 / uAspect, -0.05), 0.5);
    }

    // A band of fine gold lines waving across the screen (waves and silk), quieter where the main text sits.
    if (style <= 1) {
      float lines = 0.0;
      int count = style == 0 ? 26 : 12;
      for (int i = 0; i < 26; i++) {
        if (i >= count) break;
        float f = float(i) / float(count - 1);
        float wave = sin(x * uC.z - 0.7 + f * 1.5 + uC.w + t * 0.12) * (0.07 + 0.11 * f) * uC.y * (0.65 + 0.35 * sin(x * 1.4 + f * 2.0));
        float yy = uC.x + wave + (f - 0.5) * 0.05 * sin(x * 2.0 + 1.1);
        lines += line(y - yy, 1.1) * (0.4 + 0.6 * f);
      }
      float calm = 1.0 - 0.7 * exp(-pow((x - 0.5) / 0.26, 2.0)) * exp(-pow((y - 0.5) / 0.28, 2.0));
      gold += lines * 0.11 * calm * smoothstep(0.0, 0.2, x);
      sparkle += glint(vec2(x, y), vec2(0.86, uC.x + 0.05), 4.2) * 0.6;
    }

    col += uGold * (gold + sparkle * 1.6) * uLines;

    // Soft vignette, so the edges fall away and the middle holds the eye.
    float vig = smoothstep(1.2, 0.3, length((vUv - 0.5) * vec2(1.15, 1.0)));
    col *= mix(1.0 - 0.45 * uDepth, 1.0, vig);

    vec3 backdrop = mix(uBase, col, uAmount);
    gl_FragColor = vec4(stars.rgb + backdrop * (1.0 - stars.a), 1.0);
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Roughly the backdrop's average colour: what distant stars fade toward, so they sink into it. */
export function backdropFogColor(settings: IntroSettings) {
  const base = new THREE.Color(settings.background);
  if (!settings.art.enabled) return base;
  const deep = base.clone().multiplyScalar(0.62 - 0.32 * settings.art.depth);
  const lifted = base.clone().lerp(new THREE.Color(settings.art.tone), 0.45);
  return deep.lerp(lifted, 0.5);
}

/** The arrangement for a seed: where the curves sit, how they swing, where the light falls. */
function arrangement(seed: number) {
  const r = createRng(seed);
  const range = (min: number, max: number) => min + r() * (max - min);
  return {
    a: new THREE.Vector4(range(0.76, 0.88), range(0.07, 0.14), range(1.6, 3.0), range(0, Math.PI * 2)),
    b: new THREE.Vector4(range(0.08, 0.18), range(0.05, 0.11), range(1.3, 2.4), range(0, Math.PI * 2)),
    c: new THREE.Vector4(range(0.42, 0.62), range(0.75, 1.25), range(2.4, 3.8), range(0, Math.PI * 2)),
    d: new THREE.Vector4(range(0.18, 0.4), range(0, 1), range(0.62, 0.86), r() < 0.5 ? 1 : 0),
  };
}

export function createBackdropPass(settings: IntroSettings, aspect: number) {
  const { art } = settings;
  const layout = arrangement(art.seed);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tDiffuse: { value: null },
      uBase: { value: new THREE.Color(settings.background) },
      uTone: { value: new THREE.Color(art.tone) },
      uGold: { value: new THREE.Color(art.gold) },
      uLines: { value: art.lines },
      uDepth: { value: art.depth },
      uStyle: { value: Math.max(0, ART_STYLES.indexOf(art.style)) },
      uTime: { value: 0 },
      uAspect: { value: aspect },
      uAmount: { value: art.enabled ? 1 : 0 },
      uA: { value: layout.a },
      uB: { value: layout.b },
      uC: { value: layout.c },
      uD: { value: layout.d },
    },
  });
  const pass = new ShaderPass(material);
  return {
    pass,
    /** `amount`: 0..1 how much of the backdrop shows (the intro fades it in); time in seconds. */
    update(time: number, amount = 1) {
      material.uniforms.uTime.value = time * art.motion * 2.5;
      material.uniforms.uAmount.value = art.enabled ? amount : 0;
    },
    setAspect(value: number) {
      material.uniforms.uAspect.value = value;
    },
    dispose() {
      pass.dispose();
      material.dispose();
    },
  };
}
