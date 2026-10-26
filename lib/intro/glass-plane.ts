import * as THREE from "three";
import type { IntroSettings } from "./settings";
import { CAMERA_Z } from "./star-scene";
import { DIAL_GLSL } from "./glass-pass";

/** Just behind the logo plane, in front of every lasting background star. */
const GLASS_Z = -0.4;

/**
 * The hero's dark tinted glass, recreated inside the intro so its last frames
 * match the page exactly: the same colour and opacity across the whole view.
 * (The page adds its frost after the hand-off.)
 */
export function createGlassPlane(settings: IntroSettings, width: number, height: number, tanHalfFov: number) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(settings.glassColor) },
      uOpacity: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDialCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uDialRadius: { value: 0 },
      uDialDark: { value: 0 },
      uAspect: { value: width / height },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec2 uRes;
      ${DIAL_GLSL}
      void main() {
        // The tint, plus the core dial (a soft pool of darker glass behind the logo) — the same as the page.
        float dial = dialAt(gl_FragCoord.xy / uRes);
        // Darkens what's behind by (1 - dial), matching the page's glass exactly.
        float a = uOpacity + (1.0 - uOpacity) * dial;
        gl_FragColor = vec4(uColor * uOpacity / max(a, 1e-3), a);
      }
    `,
  });
  // Big enough to cover the view from the camera's starting distance, with room for its drift.
  const span = 2 * (CAMERA_Z + 2 - GLASS_Z) * tanHalfFov * 1.3;
  const geometry = new THREE.PlaneGeometry(span * (width / height), span);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = GLASS_Z;
  mesh.renderOrder = 0;

  return {
    mesh,
    /** `amount` 0..1 fades the glass in; `dial` 0..1 grows the dial out of the core. */
    update(s: IntroSettings, amount: number, dial: number, centerY: number, resolution: THREE.Vector2) {
      const u = material.uniforms;
      (u.uColor.value as THREE.Color).set(s.glassColor);
      u.uOpacity.value = s.glassOpacity * amount;
      u.uDialRadius.value = s.dial.enabled ? s.dial.size * dial : 0;
      u.uDialDark.value = s.dial.darkness;
      (u.uDialCenter.value as THREE.Vector2).set(0.5, centerY);
      (u.uRes.value as THREE.Vector2).copy(resolution);
      mesh.visible = amount > 0 || dial > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
