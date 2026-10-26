import * as THREE from "three";
import type { Rng } from "./rng";

/**
 * Spun-metal texture: fine concentric machining rings plus grain, centred so
 * every star looks turned on a lathe. Used as a subtle bump and to vary
 * roughness and glow across each facet.
 */
export function createBrushedMetalTexture(rand: Rng): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgb(180,180,180)";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const r = rand() * size * 0.72;
    const shade = 120 + rand() * 135;
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.06 + rand() * 0.16})`;
    ctx.lineWidth = 0.5 + rand() * 1.4;
    ctx.beginPath();
    const start = rand() * Math.PI * 2;
    ctx.arc(size / 2, size / 2, r, start, start + Math.PI * (0.6 + rand() * 1.4));
    ctx.stroke();
  }
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (rand() - 0.5) * 26;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, image.data[i] + grain));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export interface StarMaterialOptions {
  metalness: number;
  roughness: number;
  /** Emissive strength (0 = no glow). The glow takes each star's own colour and lives on its facets. */
  glow: number;
  /** 0..1: how much the brushed-metal texture shows. */
  texture: number;
}

/**
 * Polished metal for the stars. The glow is painted onto the facets — strongest
 * on faces turned toward the viewer, broken up by the metal grain — and tinted
 * by each instance's colour, instead of being a flat halo.
 */
export function createStarMaterial(brush: THREE.Texture, opts: StarMaterialOptions) {
  const uniforms = { uTexture: { value: opts.texture } };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: opts.metalness,
    roughness: opts.roughness,
    clearcoat: 0.35,
    clearcoatRoughness: 0.18,
    emissive: opts.glow > 0 ? 0xffffff : 0x000000,
    emissiveIntensity: opts.glow,
    bumpMap: brush,
    bumpScale: 0.35 * opts.texture,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTexture = uniforms.uTexture;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTexture;")
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
        float brushed = texture2D( bumpMap, vBumpMapUv ).g;
        float roughnessFactor = roughness * mix( 1.0, 0.55 + 0.9 * brushed, uTexture );`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        float facing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
        totalEmissiveRadiance *= ( 0.3 + 0.7 * pow( facing, 1.6 ) ) * mix( 1.0, 0.6 + 0.8 * brushed, uTexture );
        #ifdef USE_COLOR
          totalEmissiveRadiance *= vColor.rgb;
        #endif`,
      );
  };
  // The onBeforeCompile body is the same for every material made here, so they can share one program.
  material.customProgramCacheKey = () => "dds-star";
  return { material, uniforms };
}
