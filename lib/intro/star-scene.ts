import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The camera, lighting and bloom shared by the intro and the lasting star
// field behind the hero, so a star looks identical in both and the hand-off
// between them is invisible.

export const CAMERA_Z = 14;
export const FOV = 35;

export function createStarScene(renderer: THREE.WebGLRenderer, background: THREE.Color, aspect: number) {
  // No tone mapping: the 3D logo must render exactly the same gold as the page logo it hands over to.
  // Lights are balanced so metal highlights stay in range; only real glints exceed it and bloom.
  renderer.toneMapping = THREE.NoToneMapping;
  // Skip reading shader logs: faster start-up, and no harmless driver precision warnings in the console.
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(background, 1);

  const scene = new THREE.Scene();
  scene.background = background;
  scene.fog = new THREE.Fog(background, 14, 52); // distant stars fade into the background — part of the depth cue

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

/** Render → bloom → output. High threshold: only glowing stars, glitter and light effects bloom, never the logo. */
export function createStarComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  dpr: number,
  glow: number,
) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.55 * glow, 0.45, 0.92));
  composer.addPass(new OutputPass());
  return composer;
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
