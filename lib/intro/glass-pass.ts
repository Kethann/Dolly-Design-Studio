import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { IntroSettings } from "./settings";

// The tinted, frosted glass between the back stars and the page, done on the GPU as the last step of the back
// layer: a two-pass gaussian blur (the frost), then the tint. Much cheaper than a CSS backdrop-filter over an
// animating canvas, which the browser has to recompute every frame.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const blur = (tint: boolean) => /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uStep;
  uniform vec3 uTint;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv) * 0.2270;
    c += (texture2D(tDiffuse, vUv + uStep) + texture2D(tDiffuse, vUv - uStep)) * 0.1945;
    c += (texture2D(tDiffuse, vUv + 2.0 * uStep) + texture2D(tDiffuse, vUv - 2.0 * uStep)) * 0.1216;
    c += (texture2D(tDiffuse, vUv + 3.0 * uStep) + texture2D(tDiffuse, vUv - 3.0 * uStep)) * 0.0540;
    c += (texture2D(tDiffuse, vUv + 4.0 * uStep) + texture2D(tDiffuse, vUv - 4.0 * uStep)) * 0.0162;
    ${tint ? "c.rgb = mix(c.rgb, uTint, uOpacity);" : ""}
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

function blurPass(tint: boolean, settings: IntroSettings) {
  return new ShaderPass(
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: blur(tint),
      uniforms: {
        tDiffuse: { value: null },
        uStep: { value: new THREE.Vector2() },
        uTint: { value: new THREE.Color(settings.glassColor) },
        uOpacity: { value: settings.glassOpacity },
      },
    }),
  );
}

export function createGlassPasses(settings: IntroSettings) {
  const horizontal = blurPass(false, settings);
  const vertical = blurPass(true, settings);
  return {
    passes: [horizontal, vertical],
    /** Frost radius in CSS pixels, over a view `width` × `height` CSS pixels. */
    setFrost(px: number, width: number, height: number) {
      (horizontal.uniforms.uStep.value as THREE.Vector2).set(px / 4 / width, 0);
      (vertical.uniforms.uStep.value as THREE.Vector2).set(0, px / 4 / height);
    },
    dispose() {
      horizontal.dispose();
      vertical.dispose();
      horizontal.material.dispose();
      vertical.material.dispose();
    },
  };
}
