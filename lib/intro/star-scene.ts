import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import type { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The camera, lighting and bloom shared by the intro and the lasting star
// field behind the hero, so a star looks identical in both and the hand-off
// between them is invisible.

export const CAMERA_Z = 14;
export const FOV = 35;

/**
 * `mode`:
 * - "underlay": stars on a clear background (with fog toward `background`), for the backdrop pass to paint under;
 * - "transparent": no background or fog, for a layer drawn over other layers (the renderer needs `alpha: true`).
 */
export function createStarScene(
  renderer: THREE.WebGLRenderer,
  background: THREE.Color,
  aspect: number,
  mode: "underlay" | "transparent",
) {
  // No tone mapping: the 3D logo must render exactly the same gold as the page logo it hands over to.
  // Lights are balanced so metal highlights stay in range; only real glints exceed it and bloom.
  renderer.toneMapping = THREE.NoToneMapping;
  // Skip reading shader logs: faster start-up, and no harmless driver precision warnings in the console.
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // Distant stars fade into the backdrop — part of the depth cue.
  if (mode === "underlay") scene.fog = new THREE.Fog(background, 14, 52);

  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 80);
  camera.position.set(0, 0, CAMERA_Z);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x0b0b14, 0.3));
  const key = new THREE.DirectionalLight(0xffd9a0, 2.1);
  key.position.set(-4, 6, 8);
  const rim = new THREE.DirectionalLight(0x9fb7ff, 1.1);
  rim.position.set(6, 2, 3);
  scene.add(key, rim);

  return {
    scene,
    camera,
    envTexture,
    dispose() {
      envTexture.dispose();
      pmrem.dispose();
      room.dispose();
    },
  };
}

/**
 * Render → bloom → output. The threshold sits just above the logo's flat gold (luminance ≈ 0.93), so only
 * glints, glitter and light effects bloom — never the logo, which must match the flat page logo exactly.
 */
export function createStarComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  dpr: number,
  glow: number,
  /** Painted under the stars (the backdrop), after any depth blur. */
  underlay?: Pass,
) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  if (underlay) composer.addPass(underlay);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), bloomStrength(glow), 0.45, 0.96));
  composer.addPass(new OutputPass());
  return composer;
}

/**
 * Depth of field, focused just behind the logo plane: the nearest background stars stay crisp and the
 * farther ones go soft. Inserted before bloom. Start `aperture` at 0 and raise it to fade the blur in.
 */
export function addDepthBlur(composer: EffectComposer, scene: THREE.Scene, camera: THREE.Camera, focus: number) {
  const pass = new BokehPass(scene, camera, { focus, aperture: 0, maxblur: 0.012 });
  // Keep the stars' transparency through the blur, so the backdrop can be painted underneath afterwards.
  pass.materialBokeh.fragmentShader = pass.materialBokeh.fragmentShader.replace("gl_FragColor.a = 1.0;", "");
  composer.insertPass(pass, 1);
  return pass.uniforms as { aperture: { value: number }; maxblur: { value: number }; focus: { value: number } };
}

const bloomStrength = (glow: number) => 0.55 * glow;

/** Changes how much the glints bloom (glow: 1 = the original intro). */
export function setBloomGlow(composer: EffectComposer, glow: number) {
  for (const pass of composer.passes) if (pass instanceof UnrealBloomPass) pass.strength = bloomStrength(glow);
}

export interface StarSlot {
  mesh: THREE.InstancedMesh;
  index: number;
}

/**
 * Two instanced meshes (plain metal and glowing) holding every star, each
 * tinted from the palette — glowing ones a little paler so their glow reads.
 */
export function createStarInstances(
  geometry: THREE.BufferGeometry,
  plainMaterial: THREE.Material,
  glowMaterial: THREE.Material,
  stars: { glow: boolean; color: number }[],
  palette: THREE.Color[],
) {
  const glowCount = stars.filter((s) => s.glow).length;
  const plainCount = stars.length - glowCount;
  const plainMesh = new THREE.InstancedMesh(geometry, plainMaterial, Math.max(1, plainCount));
  const glowMesh = new THREE.InstancedMesh(geometry, glowMaterial, Math.max(1, glowCount));
  plainMesh.count = plainCount;
  glowMesh.count = glowCount;
  plainMesh.frustumCulled = glowMesh.frustumCulled = false;

  let nextPlain = 0;
  let nextGlow = 0;
  const white = new THREE.Color(0xffffff);
  const tint = new THREE.Color();
  const slots: StarSlot[] = stars.map((s) => {
    const mesh = s.glow ? glowMesh : plainMesh;
    const index = s.glow ? nextGlow++ : nextPlain++;
    tint.copy(palette[s.color] ?? white);
    if (s.glow) tint.lerp(white, 0.35);
    mesh.setColorAt(index, tint);
    return { mesh, index };
  });
  if (plainMesh.instanceColor) plainMesh.instanceColor.needsUpdate = true;
  if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;

  return {
    meshes: [plainMesh, glowMesh],
    slots,
    markDirty() {
      plainMesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      plainMesh.dispose();
      glowMesh.dispose();
    },
  };
}
