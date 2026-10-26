import * as THREE from "three";
import type { IntroSettings } from "./settings";
import { CAMERA_Z } from "./star-scene";

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
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
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
    /** 0 = no glass yet, 1 = the page's glass. */
    setAmount(amount: number) {
      material.uniforms.uOpacity.value = settings.glassOpacity * amount;
      mesh.visible = amount > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
