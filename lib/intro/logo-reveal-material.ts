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
  varying float vWorldX;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldX = world.x;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform vec3 uEdgeColor;
  uniform float uRevealX;   // world-space x of the wipe (follows the big star)
  uniform float uDirection; // +1: revealed to the left of uRevealX, -1: to the right
  uniform float uSoftness;  // world-space width of the soft wipe edge
  uniform vec2 uStarCenter; // logo star glyph, in uv
  uniform vec2 uStarRadius; // its radius in uv (x, y differ because the logo isn't square)
  uniform float uStarDock;  // 0 = logo's star hidden, 1 = shown (the big star docks into it)
  uniform float uSheen;     // 0..1 position of a diagonal light sweep across the logo (< 0 = off)
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vWorldX;

  void main() {
    float art = texture2D(uMap, vUv).a;
    if (art < 0.01) discard;

    float signed = (uRevealX - vWorldX) * uDirection;      // > 0 once the wipe has passed
    float revealed = smoothstep(-uSoftness, uSoftness, signed);
    float edge = exp(-abs(signed) / (uSoftness * 0.9));     // bright line right at the wipe

    vec2 d = (vUv - uStarCenter) / uStarRadius;
    float inStarGlyph = 1.0 - smoothstep(0.85, 1.05, length(d));
    float glyphVisibility = mix(1.0, uStarDock, inStarGlyph);

    float band = (vUv.x + (1.0 - vUv.y) * 0.35) - mix(-0.35, 1.45, uSheen);
    float sheen = uSheen < 0.0 ? 0.0 : exp(-band * band / 0.0022);

    // A gentle glint travelling across the letters — bright enough to catch the eye, not to blow out.
    vec3 color = uColor + uEdgeColor * edge * revealed * 1.6 + vec3(1.0, 0.94, 0.8) * sheen * 0.45;
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
      uRevealX: { value: -1e4 },
      uDirection: { value: 1 },
      uSoftness: { value: 0.08 },
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
