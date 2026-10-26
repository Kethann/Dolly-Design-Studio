import * as THREE from "three";
import { LOGO_BODY_PATH, LOGO_STAR, LOGO_STAR_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";

/** Renders the logo silhouette into an alpha texture: white where the artwork is, transparent elsewhere. */
function createLogoTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = Math.round((width * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(width / LOGO_VIEWBOX.width, height / LOGO_VIEWBOX.height);
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D(LOGO_BODY_PATH), "evenodd");
  ctx.fill(new Path2D(LOGO_STAR_PATH));
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform vec3 uEdgeColor;
  uniform vec2 uWaveCenter;  // world-space centre of the reveal wave (the logo's star)
  uniform float uWaveRadius; // world-space radius the wave has reached
  uniform float uWaveBand;   // world-space spacing of the light rings that follow the front
  uniform float uSoftness;   // world-space width of the soft front edge
  uniform float uWaveFade;   // 1 while the wave crosses the logo, fading to 0 once it has left
  uniform float uGlow;       // 1 = original brightness of the light
  uniform vec2 uStarCenter;  // logo star glyph, in uv
  uniform vec2 uStarRadius;  // its radius in uv (x, y differ because the logo isn't square)
  uniform float uStarDock;   // 0 = logo's star hidden, 1 = shown (the big star docks into it)
  uniform float uSheen;      // 0..1 position of a diagonal light sweep across the logo (< 0 = off)
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec2 vWorld;

  // A soft line of light centred \`offset\` behind the wave front.
  float ring(float behind, float offset, float width) {
    float x = (behind - offset) / width;
    return exp(-x * x);
  }

  void main() {
    // The artwork is never distorted: the wave is light travelling through it, so it stays inside the letters.
    float art = texture2D(uMap, vUv).a;
    if (art < 0.01) discard;

    float behind = uWaveRadius - length(vWorld - uWaveCenter); // > 0 once the wave has passed this point
    float revealed = smoothstep(-uSoftness, uSoftness, behind);

    // A bright liquid-gold crest just inside the front, with a white-hot core…
    float crest = ring(behind, uSoftness * 0.8, uSoftness * 1.1);
    // …and two fainter echoes rippling behind it, settling as they spread.
    float echoes = ring(behind, uWaveBand * 0.55, uSoftness * 1.3) * 0.5 + ring(behind, uWaveBand * 1.05, uSoftness * 1.5) * 0.25;
    float light = (crest * 1.25 + echoes) * revealed * uWaveFade * uGlow;

    vec2 d = (vUv - uStarCenter) / uStarRadius;
    float inStarGlyph = 1.0 - smoothstep(0.85, 1.05, length(d));
    float glyphVisibility = mix(1.0, uStarDock, inStarGlyph);

    float band = (vUv.x + (1.0 - vUv.y) * 0.35) - mix(-0.35, 1.45, uSheen);
    float sheen = uSheen < 0.0 ? 0.0 : exp(-band * band / 0.0022);

    vec3 color = uColor
      + uEdgeColor * light
      + vec3(1.0, 0.97, 0.9) * pow(crest, 3.0) * 0.35 * revealed * uWaveFade * uGlow
      + vec3(1.0, 0.94, 0.8) * sheen * 0.45 * uGlow;
    float alpha = art * revealed * glyphVisibility * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface LogoRevealMaterial {
  material: THREE.ShaderMaterial;
  dispose: () => void;
}

export function createLogoRevealMaterial(): LogoRevealMaterial {
  const map = createLogoTexture();
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: map },
      uColor: { value: new THREE.Color("#fff195") }, // same flat gold as /images/brand/logo.svg, so the hand-off is seamless
      uEdgeColor: { value: new THREE.Color("#ffb547") },
      uWaveCenter: { value: new THREE.Vector2() },
      uWaveRadius: { value: 0 },
      uWaveBand: { value: 1 },
      uSoftness: { value: 0.08 },
      uWaveFade: { value: 1 },
      uGlow: { value: 1 },
      uStarCenter: {
        value: new THREE.Vector2(LOGO_STAR.cx / LOGO_VIEWBOX.width, 1 - LOGO_STAR.cy / LOGO_VIEWBOX.height),
      },
      uStarRadius: {
        value: new THREE.Vector2((LOGO_STAR.r * 1.15) / LOGO_VIEWBOX.width, (LOGO_STAR.r * 1.15) / LOGO_VIEWBOX.height),
      },
      uStarDock: { value: 0 },
      uSheen: { value: -1 },
      uOpacity: { value: 1 },
    },
  });
  return {
    material,
    dispose: () => {
      map.dispose();
      material.dispose();
    },
  };
}
