import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { createRng } from "./rng";
import { ART_STYLES, type ArtPage, type IntroSettings } from "./settings";

/**
 * The premium backdrop, painted *under* the stars after they're rendered (and
 * after any depth blur), so its fine gold lines stay crisp while the far stars
 * go soft. The stars are rendered on a transparent background; this pass lays
 * the backdrop wherever they leave room: out = stars + backdrop × (1 − stars' alpha).
 *
 * It's built in depth layers, not as a picture: a still, deep gradient at the
 * back, then raised bands, a gold ribbon and a band of fine lines in front,
 * each drifting at its own speed as the page scrolls (and leaning a touch with
 * the cursor), so it reads as real space. Each layer repeats down the page with
 * a fresh curve every time, so it never runs out and never visibly repeats.
 *
 * Styles: waves (bands, ribbon, lines), silk (flowing diagonal folds), halo
 * (a pool of light with arcs that ripple outward as you scroll), minimal (one
 * band and its gold edge). The centre stays calm and dark so text reads clearly.
 */
const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTone;
  uniform vec3 uShadow;
  uniform vec3 uGold;
  uniform float uLines;
  uniform float uDepth;
  uniform float uSoft;     // 0 = crisp, 1 = very soft (a blur of the lines and edges)
  uniform float uStyle;
  uniform float uTime;
  uniform float uAspect;
  uniform float uAmount;   // 0 = plain background colour, 1 = the full backdrop
  uniform float uScroll;   // page scroll, in screen heights
  uniform vec2 uPointer;   // cursor, -1..1 (eased)
  uniform vec2 uRot;       // cos, sin of the design's rotation
  uniform vec4 uA;         // arrangement: band (height, swing, frequency, phase)
  uniform vec4 uB;         // gold ribbon (height, swing, frequency, phase)
  uniform vec4 uC;         // line band (height, swing, frequency, phase)
  uniform vec4 uD;         // glint spots (x1, y1, x2, mirror)
  uniform vec3 uDotsA;     // dots style: gradient colours (left → right)
  uniform vec3 uDotsB;
  uniform vec2 uBubbles;   // bubbles: (count 0..1, size)
  uniform vec2 uDotGrid;   // dots: (density, dot size)
  varying vec2 vUv;

  // A thin line where d = 0. 'fw' is the screen-space rate of change of a *continuous* coordinate: taking
  // fwidth of d itself would blow up where a repeating layer wraps round, drawing a stray line at the seam.
  float edge(float d, float fw) {
    float w = fw * (1.2 + 16.0 * uSoft);
    return (1.0 - smoothstep(0.0, w, abs(d))) / (1.0 + 2.5 * uSoft);
  }

  float fill(float d) {
    float w = 0.002 + 0.03 * uSoft;
    return smoothstep(-w, w, d);
  }

  vec3 hash3(vec2 p) {
    return fract(sin(vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)))) * 43758.5453);
  }

  float glint(vec2 p, vec2 at, float phase) {
    vec2 d = (p - at) * vec2(uAspect, 1.0);
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.3 + phase);
    float spread = 1.0 + 6.0 * uSoft;
    float rays = exp(-abs(d.x) * 260.0 / spread) * exp(-abs(d.y) * 16.0) + exp(-abs(d.y) * 260.0 / spread) * exp(-abs(d.x) * 16.0);
    float core = exp(-dot(d, d) * 9000.0 / (spread * spread));
    return (rays * 0.8 + core) * twinkle / spread;
  }

  // Where a layer at depth k sits: it scrolls up with the page (deeper layers slower) and leans with the cursor.
  vec2 layer(vec2 p, float k) {
    return vec2(p.x - uPointer.x * 0.02 * k, p.y - uScroll * k - uPointer.y * 0.015 * k);
  }

  void main() {
    // Rotate the design about the centre (keeping it round on a wide screen).
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    q = vec2(uRot.x * q.x - uRot.y * q.y, uRot.y * q.x + uRot.x * q.y);
    vec2 p = q / vec2(uAspect, 1.0) + 0.5;
    if (uD.w > 0.5) p.x = 1.0 - p.x;
    float t = uTime;
    int style = int(uStyle + 0.5);

    // The still back layer: a deep diagonal gradient from the shadow colour, through the background, to the tone.
    float g = smoothstep(-0.15, 1.2, 0.6 * p.x + 0.5 * (p.y - uScroll * 0.04));
    vec3 col = mix(mix(uShadow, uBase, smoothstep(0.0, 0.55, g)), mix(uBase, uTone, 0.45), smoothstep(0.45, 1.0, g));
    float gold = 0.0;
    float sparkle = 0.0;

    if (style == 0 || style == 3) {
      // A raised band with curved edges, casting a soft shadow beneath it.
      vec2 a = layer(p, 0.35);
      float fw = fwidth(a.y) * 1.6;
      float tile = floor(a.y / 1.1);
      float y = a.y - tile * 1.1;
      float ph = uA.w + tile * 2.17;
      float lo = uA.x - 0.25 + uA.y * sin(a.x * uA.z + ph + t * 0.05);
      float hi = lo + 0.2 + 0.06 * sin(a.x * 1.7 + ph * 1.3 + t * 0.04);
      float inside = fill(y - lo) * (1.0 - fill(y - hi));
      vec3 band = mix(mix(uBase, uTone, 0.5), uTone * 1.06, clamp((y - lo) / max(hi - lo, 1e-3), 0.0, 1.0));
      col *= 1.0 - (0.18 + 0.42 * uDepth) * (1.0 - inside) * step(y, lo) * exp(-max(lo - y, 0.0) * 16.0);
      col = mix(col, band, inside);
      gold += edge(y - lo, fw) * 0.95 + edge(y - hi, fw) * 0.35;
      float loAt = uA.x - 0.25 + uA.y * sin(uD.x * uA.z + ph + t * 0.05);
      sparkle += glint(vec2(a.x, y), vec2(uD.x, loAt), tile);
    }
    if (style == 0) {
      // A slim, tapering gold ribbon on a nearer layer.
      vec2 b = layer(p, 0.55);
      float fw = fwidth(b.y) * 1.6;
      float tile = floor(b.y / 1.35);
      float y = b.y - tile * 1.35;
      float c = 0.25 + uB.y * sin(b.x * uB.z + uB.w + tile * 1.9 + t * 0.04) + 0.12 * (b.x - 0.5);
      float w = 0.012 + 0.03 * (1.0 - b.x) * (1.0 - b.x);
      float inside = fill(y - (c - w)) * (1.0 - fill(y - c));
      col *= 1.0 - (0.15 + 0.3 * uDepth) * step(y, c - w) * exp(-max(c - w - y, 0.0) * 22.0);
      col = mix(col, uGold * mix(0.55, 1.15, clamp((y - c + w) / w, 0.0, 1.0)), inside * uLines * 0.9);
      gold += edge(y - c, fw) * 0.6;
      float cAt = 0.25 + uB.y * sin(uD.z * uB.z + uB.w + tile * 1.9 + t * 0.04) + 0.12 * (uD.z - 0.5);
      sparkle += glint(vec2(b.x, y), vec2(uD.z, cAt), 2.1 + tile);
    }
    if (style == 1) {
      // Silk: diagonal folds flowing past as you scroll, each shaded from shadow to sheen.
      vec2 s = layer(p, 0.3);
      float u = (s.y - 0.55 * s.x) + 0.05 * sin(s.x * uA.z + uA.w + t * 0.05);
      float fw = fwidth(u);
      float seg = u / 0.42;
      float fold = sin(fract(seg) * 3.14159);
      float k = floor(seg);
      col *= 1.0 + (fold - 0.5) * (0.25 + 0.45 * uDepth);
      col = mix(col, mix(uBase, uTone, 0.7), pow(fold, 6.0) * 0.35);
      if (mod(k, 2.0) < 0.5) gold += edge((fract(seg) - 0.5) * 0.42, fw) * 0.7;
    }
    if (style == 2) {
      // Halo: a pool of light in a corner; its fine arcs ripple outward as you scroll.
      vec2 h = layer(p, 0.08);
      vec2 at = vec2(uD.x * 0.4 + 0.6, uD.y * 0.3 + 0.7);
      float r = length((h - at) * vec2(uAspect, 1.0));
      col = mix(col, mix(uBase, uTone, 0.8) * 1.15, exp(-r * (2.2 - 1.2 * uDepth)) * 0.85);
      col *= 1.0 - 0.35 * uDepth * smoothstep(0.4, 1.6, r);
      float spacing = 0.09 + 0.02 * uC.y;
      float rr = (r - 0.25 - uScroll * 0.3 - t * 0.01) / spacing;
      gold += edge((fract(rr) - 0.5) * spacing, fwidth(r)) * 0.55 * exp(-r * 0.9) * smoothstep(0.2, 0.3, r);
      sparkle += glint(h, at + vec2(-0.32 / uAspect, -0.05), 0.5);
    }

    if (style == 4) {
      // Dots: wave sheets made of a fine halftone dot grid, in two layers of depth, over soft colour glows.
      col = uBase * mix(0.95, 0.55, uDepth);
      vec2 ga = (p - vec2(0.05, 0.8)) * vec2(1.3, 1.0);
      vec2 gb = (p - vec2(0.95, 0.62)) * vec2(1.3, 1.0);
      col += uDotsA * 0.3 * exp(-dot(ga, ga) * 3.0) + uDotsB * 0.38 * exp(-dot(gb, gb) * 3.2);
      for (int k = 0; k < 2; k++) {
        float kf = float(k);
        vec2 a = layer(p, 0.22 + 0.28 * kf); // the far sheet drifts slower than the near one
        float tile = floor(a.y / 1.25);
        float y = a.y - tile * 1.25;
        float ph = uA.w + tile * 1.9 + kf * 2.3;
        float c = 0.62 + 0.16 * sin(a.x * (2.0 + 0.6 * kf) + ph + t * 0.08) - 0.06 * a.x;
        float halfW = 0.2 + 0.06 * sin(a.x * 1.3 + ph);
        float s = (y - c) / halfW; // -1 (near edge) .. 1 (far edge) across the sheet
        if (abs(s) < 1.2) {
          float near = clamp(0.5 - 0.5 * s, 0.0, 1.0);
          // A grid that bends with the sheet: rows follow the wave, columns run across the screen.
          float colW = (0.0115 + 0.003 * kf) / uDotGrid.x;
          float rowH = 2.0 * halfW / (18.0 * uDotGrid.x);
          vec2 cell = fract(vec2(a.x * uAspect / colW, (s + 1.0) * 9.0 * uDotGrid.x)) - 0.5;
          float d = length(cell * vec2(colW, rowH));
          float r = mix(0.0011, 0.0034, near) * (0.75 + 0.25 * kf) * uDotGrid.y / uDotGrid.x; // nearer: bigger dots
          float aa = 0.0007 + 0.003 * uSoft;
          float dotMask = 1.0 - smoothstep(r - aa, r + aa, d);
          float fade = 1.0 - smoothstep(0.65, 1.15, abs(s));
          vec3 dc = mix(uDotsA, uDotsB, smoothstep(0.1, 0.95, p.x));
          float hot = exp(-pow((p.x - 0.9) * 3.0, 2.0)) * near;
          col += (dc * (1.0 + 0.8 * hot) + vec3(hot * 0.35)) * dotMask * fade * (0.3 + 0.7 * near) * (0.5 + 0.5 * kf) * (0.6 + 0.8 * uLines);
        }
      }
    }

    if (style == 5) {
      // Bubbles: spheres textured with halftone dots (bigger where the light falls), on three layers of depth —
      // small, dim and soft far away; large and crisp up close — generated endlessly as the page scrolls.
      col = uBase * mix(0.95, 0.55, uDepth);
      vec2 ga = (p - vec2(0.05, 0.8)) * vec2(1.3, 1.0);
      vec2 gb = (p - vec2(0.95, 0.62)) * vec2(1.3, 1.0);
      col += uDotsA * 0.28 * exp(-dot(ga, ga) * 3.0) + uDotsB * 0.34 * exp(-dot(gb, gb) * 3.2);
      float calm = 1.0 - 0.45 * exp(-pow((vUv.x - 0.5) / 0.28, 2.0)) * exp(-pow((vUv.y - 0.5) / 0.3, 2.0));
      vec3 light = normalize(vec3(-0.5, 0.6, 0.65));
      for (int k = 0; k < 3; k++) {
        float kf = float(k); // 0 = far, 2 = near
        vec2 a = layer(p, 0.1 + 0.2 * kf);
        vec2 q = vec2(a.x * uAspect, a.y);
        float cellSize = 0.28 + 0.16 * kf;
        vec2 cellId = floor(q / cellSize);
        float soft = (2.0 - kf) * 0.5 + uSoft * 2.0; // far bubbles are softer
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 id = cellId + vec2(float(i), float(j));
            vec3 h = hash3(id + vec2(kf * 17.31, uA.w * 3.7));
            if (h.z > uBubbles.x) continue; // not every cell has a bubble
            vec3 h2 = hash3(id.yx + vec2(5.1 + kf, 9.7));
            float radius = min(cellSize * mix(0.16, 0.42, h2.x) * uBubbles.y, cellSize * 0.95);
            vec2 centre = (id + 0.25 + 0.5 * h.xy) * cellSize + vec2(0.0, 0.015 * sin(t * 0.35 + h2.y * 6.28));
            vec2 rel = (q - centre) / radius;
            float dd = dot(rel, rel);
            if (dd > 1.0) continue;
            vec3 n = vec3(rel, sqrt(1.0 - dd));
            float lit = clamp(dot(n, light), 0.0, 1.0);
            // Halftone texture across the sphere: dot size follows the light.
            float pitch = radius / 7.0;
            vec2 cell = fract((q - centre) / pitch) - 0.5;
            float dotR = 0.12 + 0.36 * lit;
            float aa = 0.06 + 0.1 * soft;
            float dots = 1.0 - smoothstep(dotR - aa, dotR + aa, length(cell));
            float rim = pow(1.0 - n.z, 3.0);
            float edge = 1.0 - smoothstep(0.92, 1.0, sqrt(dd));
            vec3 bc = mix(uDotsA, uDotsB, clamp(h2.z * 0.6 + p.x * 0.6 - 0.1, 0.0, 1.0));
            float bright = (0.35 + 0.35 * kf) * calm * (0.6 + 0.8 * uLines);
            col += bc * (dots * (0.25 + 0.75 * lit) + rim * 0.55 + 0.05) * edge * bright;
          }
        }
      }
    }

    // A band of fine gold lines on the nearest layer (waves and silk), quieter where the main text sits.
    if (style <= 1) {
      vec2 l = layer(p, 0.45);
      float fw = fwidth(l.y) * 1.3;
      float tile = floor(l.y / 1.25);
      float y = l.y - tile * 1.25;
      float ph = uC.w + tile * 1.37;
      float lines = 0.0;
      int count = style == 0 ? 26 : 12;
      for (int i = 0; i < 26; i++) {
        if (i >= count) break;
        float f = float(i) / float(count - 1);
        float wave = sin(l.x * uC.z - 0.7 + f * 1.5 + ph + t * 0.12) * (0.07 + 0.11 * f) * uC.y * (0.65 + 0.35 * sin(l.x * 1.4 + f * 2.0));
        lines += edge(y - (0.62 + wave + (f - 0.5) * 0.05 * sin(l.x * 2.0 + 1.1)), fw) * (0.4 + 0.6 * f);
      }
      float calm = 1.0 - 0.7 * exp(-pow((vUv.x - 0.5) / 0.26, 2.0)) * exp(-pow((vUv.y - 0.5) / 0.28, 2.0));
      gold += lines * 0.11 * calm * smoothstep(0.0, 0.2, l.x);
    }

    col += uGold * (gold + sparkle * 1.6) * uLines;

    // Soft vignette, so the edges fall away and the middle holds the eye.
    float vig = smoothstep(1.2, 0.3, length((vUv - 0.5) * vec2(1.15, 1.0)));
    col *= mix(1.0 - 0.45 * uDepth, 1.0, vig);

    vec3 backdrop = mix(uBase, col, uAmount);
    gl_FragColor = vec4(backdrop, 1.0);
  }
`;

/** Lays the (lower-resolution) backdrop under the stars: out = stars + backdrop × (1 − stars' alpha). */
const compositeShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tArt;
  varying vec2 vUv;
  void main() {
    vec4 stars = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(stars.rgb + texture2D(tArt, vUv).rgb * (1.0 - stars.a), 1.0);
  }
`;

/**
 * The backdrop is drawn into its own buffer at a reduced resolution, then laid under the stars. It's soft by nature
 * (and usually under frosted glass), so this looks the same while costing a fraction: the patterns (bubbles, dots,
 * line bands) are the heaviest full-screen work on the page.
 */
class BackdropPass extends Pass {
  scale = 1;
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private artQuad: FullScreenQuad;
  private composite: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private size = new THREE.Vector2(1, 1);

  constructor(art: THREE.ShaderMaterial) {
    super();
    this.artQuad = new FullScreenQuad(art);
    this.composite = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: compositeShader,
      uniforms: { tDiffuse: { value: null }, tArt: { value: this.target.texture } },
    });
    this.quad = new FullScreenQuad(this.composite);
  }

  setScale(scale: number) {
    if (scale === this.scale) return;
    this.scale = scale;
    this.setSize(this.size.x, this.size.y);
  }

  setSize(width: number, height: number) {
    this.size.set(width, height);
    this.target.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target);
    this.artQuad.render(renderer);
    this.composite.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.artQuad.dispose();
    this.quad.dispose();
    this.composite.dispose();
  }
}

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
  return new THREE.Color(settings.art.shadow).lerp(base, 0.5).lerp(new THREE.Color(settings.art.tone), 0.2);
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

export function createBackdropPass(settings: IntroSettings, aspect: number, softness: number) {
  let art = settings.art;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uBase: { value: new THREE.Color() },
      uTone: { value: new THREE.Color() },
      uShadow: { value: new THREE.Color() },
      uGold: { value: new THREE.Color() },
      uLines: { value: 0 },
      uDepth: { value: 0 },
      uSoft: { value: softness },
      uStyle: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: aspect },
      uAmount: { value: 0 },
      uScroll: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      uRot: { value: new THREE.Vector2() },
      uA: { value: new THREE.Vector4() },
      uB: { value: new THREE.Vector4() },
      uC: { value: new THREE.Vector4() },
      uD: { value: new THREE.Vector4() },
      uDotsA: { value: new THREE.Color() },
      uDotsB: { value: new THREE.Color() },
      uBubbles: { value: new THREE.Vector2(0.45, 1) },
      uDotGrid: { value: new THREE.Vector2(1, 1) },
    },
  });
  const pass = new BackdropPass(material);
  const u = material.uniforms;
  let seed = -1;
  /** Applies the creator's settings live (no rebuild, no flash). */
  let page: ArtPage = "home";
  function applyDots() {
    (u.uDotsA.value as THREE.Color).set(art.dots[page].a);
    (u.uDotsB.value as THREE.Color).set(art.dots[page].b);
  }
  function apply(s: IntroSettings) {
    art = s.art;
    (u.uBase.value as THREE.Color).set(s.background);
    (u.uTone.value as THREE.Color).set(art.tone);
    (u.uShadow.value as THREE.Color).set(art.shadow);
    (u.uGold.value as THREE.Color).set(art.gold);
    u.uLines.value = art.lines;
    u.uDepth.value = art.depth;
    u.uStyle.value = Math.max(0, ART_STYLES.indexOf(art.style));
    applyDots();
    (u.uBubbles.value as THREE.Vector2).set(art.bubbles.count, art.bubbles.size);
    (u.uDotGrid.value as THREE.Vector2).set(art.dotGrid.density, art.dotGrid.size);
    // Under frosted glass nothing fine survives anyway: a lighter buffer. Crisp line styles keep full detail otherwise.
    pass.setScale(s.glassFrost >= 2 ? 0.6 : art.style === "bubbles" || art.style === "dots" ? 0.75 : 1);
    const angle = THREE.MathUtils.degToRad(art.rotation);
    (u.uRot.value as THREE.Vector2).set(Math.cos(angle), Math.sin(angle));
    if (art.seed !== seed) {
      seed = art.seed;
      const layout = arrangement(seed);
      (u.uA.value as THREE.Vector4).copy(layout.a);
      (u.uB.value as THREE.Vector4).copy(layout.b);
      (u.uC.value as THREE.Vector4).copy(layout.c);
      (u.uD.value as THREE.Vector4).copy(layout.d);
    }
  }
  apply(settings);
  return {
    pass,
    apply,
    /** Sets the Dots / Bubbles colours directly (the home page blends its sections' colours as you scroll). */
    setColors(a: THREE.Color, b: THREE.Color) {
      (u.uDotsA.value as THREE.Color).copy(a);
      (u.uDotsB.value as THREE.Color).copy(b);
    },
    /** Which page group's Dots colours to use. */
    setPage(next: ArtPage) {
      if (next === page) return;
      page = next;
      applyDots();
    },
    /**
     * `amount`: 0..1 how much of the backdrop shows (the intro eases it in); `softness`: 0..1;
     * `scroll` in screen heights; `pointerX/Y` in -1..1.
     */
    update(
      time: number,
      {
        amount = 1,
        softness,
        scroll = 0,
        pointerX = 0,
        pointerY = 0,
      }: { amount?: number; softness?: number; scroll?: number; pointerX?: number; pointerY?: number } = {},
    ) {
      u.uTime.value = time * art.motion * 2.5;
      u.uAmount.value = art.enabled ? amount : 0;
      if (softness !== undefined) u.uSoft.value = softness;
      u.uScroll.value = scroll;
      u.uPointer.value.set(pointerX, pointerY);
    },
    setAspect(value: number) {
      u.uAspect.value = value;
    },
    dispose() {
      pass.dispose();
      material.dispose();
    },
  };
}
