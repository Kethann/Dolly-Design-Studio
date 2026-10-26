import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { IntroSettings } from "./settings";

// The tinted, frosted glass between the back stars and the page, done on the GPU as the last step of the back
// layer: a two-pass gaussian blur (the frost), then the tint and the core dial. Much cheaper than a CSS
// backdrop-filter over an animating canvas.

/**
 * The core dial: a soft pool of darker glass behind the logo, deepest at its centre and fading out with no
 * visible edge, so the background never competes with the logo. Shared by the page's glass pass and the
 * intro's glass plane. Returns how much to darken.
 */
export const DIAL_GLSL = /* glsl */ `
  uniform vec2 uDialCenter; // in 0..1 screen coordinates (y up)
  uniform float uDialRadius; // share of the screen height (0 = no dial)
  uniform float uDialDark;
  uniform float uAspect;
  float dialAt(vec2 uv) {
    if (uDialRadius <= 0.0) return 0.0;
    // A wide oval (the logo is wide), very gently falling off, so it melts into the background.
    float r = length((uv - uDialCenter) * vec2(uAspect / 1.7, 1.0)) / uDialRadius;
    return (1.0 - smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(0.0, 1.0, r)) * uDialDark * 0.7;
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const blur = (finish: boolean) => /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uStep;
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform vec3 uGold;
  ${finish ? DIAL_GLSL : ""}
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv) * 0.2270;
    c += (texture2D(tDiffuse, vUv + uStep) + texture2D(tDiffuse, vUv - uStep)) * 0.1945;
    c += (texture2D(tDiffuse, vUv + 2.0 * uStep) + texture2D(tDiffuse, vUv - 2.0 * uStep)) * 0.1216;
    c += (texture2D(tDiffuse, vUv + 3.0 * uStep) + texture2D(tDiffuse, vUv - 3.0 * uStep)) * 0.0540;
    c += (texture2D(tDiffuse, vUv + 4.0 * uStep) + texture2D(tDiffuse, vUv - 4.0 * uStep)) * 0.0162;
    ${
      finish
        ? `c.rgb = mix(c.rgb, uTint, uOpacity);
    c.rgb *= 1.0 - dialAt(vUv);`
        : ""
    }
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

function blurPass(finish: boolean) {
  return new ShaderPass(
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: blur(finish),
      uniforms: {
        tDiffuse: { value: null },
        uStep: { value: new THREE.Vector2() },
        uTint: { value: new THREE.Color() },
        uOpacity: { value: 0 },
        uGold: { value: new THREE.Color() },
        uDialCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uDialRadius: { value: 0 },
        uDialDark: { value: 0 },
        uAspect: { value: 1 },
      },
    }),
  );
}

export function createGlassPasses(settings: IntroSettings) {
  const horizontal = blurPass(false);
  const vertical = blurPass(true);
  const u = vertical.uniforms;
  const glass = {
    passes: [horizontal, vertical],
    /** Applies the creator's settings live (no rebuild). */
    apply(s: IntroSettings) {
      (u.uTint.value as THREE.Color).set(s.glassColor);
      u.uOpacity.value = s.glassOpacity;
      (u.uGold.value as THREE.Color).set(s.art.gold);
      u.uDialRadius.value = s.dial.enabled ? s.dial.size : 0;
      u.uDialDark.value = s.dial.darkness;
    },
    /** Frost radius in CSS pixels, over a view `width` × `height` CSS pixels. */
    setFrost(px: number, width: number, height: number) {
      (horizontal.uniforms.uStep.value as THREE.Vector2).set(px / 4 / width, 0);
      (vertical.uniforms.uStep.value as THREE.Vector2).set(0, px / 4 / height);
      u.uAspect.value = width / height;
    },
    /** Where the dial sits: it rides up with the logo as the page scrolls. */
    setDial(centerY: number, grow = 1) {
      (u.uDialCenter.value as THREE.Vector2).set(0.5, centerY);
      if (grow < 1) u.uDialRadius.value *= grow;
    },
    dispose() {
      horizontal.dispose();
      vertical.dispose();
      horizontal.material.dispose();
      vertical.material.dispose();
    },
  };
  glass.apply(settings);
  return glass;
}
