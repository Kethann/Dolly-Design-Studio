import * as THREE from "three";
import type { Rng } from "./rng";

/**
 * Spun-metal texture: fine concentric machining rings plus grain, centred so
 * every star looks turned on a lathe. Used as a subtle bump and to vary
 * roughness and glints across each facet.
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
  /** Emissive strength of the glints (0 = no glow). */
  glow: number;
  /** 0..1: how much the brushed-metal texture shows. */
  texture: number;
  /** Reflections, with their own strength so metal never washes out to a flat white. */
  envMap: THREE.Texture;
  envIntensity: number;
  /** Glint colour; null = each star glints in its own colour. */
  glowColor: THREE.Color | null;
}

/**
 * Polished, faceted metal. The glow is not a wash over the whole star: only the
 * facets turned toward the light catch a glint (with a little sparkle from the
 * metal grain), so as a star turns, its facets light up one after another.
 */
export function createStarMaterial(brush: THREE.Texture, opts: StarMaterialOptions) {
  const uniforms = {
    uTexture: { value: opts.texture },
    /** 1 = glow only on facets catching the light; 0 = even glow (the big star's flat hand-off). */
    uGlint: { value: 1 },
    uGlowColor: { value: (opts.glowColor ?? new THREE.Color(1, 1, 1)).clone() },
    uMatchStar: { value: opts.glowColor ? 0 : 1 },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: opts.metalness,
    roughness: opts.roughness,
    clearcoat: 0.35,
    clearcoatRoughness: 0.12,
    emissive: opts.glow > 0 ? 0xffffff : 0x000000,
    emissiveIntensity: opts.glow,
    envMap: opts.envMap,
    envMapIntensity: opts.envIntensity,
    bumpMap: brush,
    bumpScale: 0.35 * opts.texture,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTexture;\nuniform float uGlint;\nuniform vec3 uGlowColor;\nuniform float uMatchStar;",
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
        float brushed = texture2D( bumpMap, vBumpMapUv ).g;
        float roughnessFactor = roughness * mix( 1.0, 0.55 + 0.9 * brushed, uTexture );`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        // A facet glints when it faces the key light (upper left, toward the viewer).
        float catchLight = pow( max( dot( normal, normalize( vec3( -0.45, 0.6, 0.66 ) ) ), 0.0 ), 9.0 );
        float sparkle = smoothstep( 0.62, 0.95, brushed ) * uTexture;
        float glintMask = catchLight * ( 1.7 + 1.2 * sparkle );
        vec3 glowTint = uGlowColor;
        #ifdef USE_COLOR
          glowTint = mix( uGlowColor, vColor.rgb, uMatchStar );
        #endif
        totalEmissiveRadiance *= glowTint * mix( 1.0, glintMask, uGlint ) * mix( 1.0, 0.6 + 0.8 * brushed, uTexture );`,
      );
  };
  // The onBeforeCompile body is the same for every material made here, so they can share one program.
  material.customProgramCacheKey = () => "dds-star-glint";
  return { material, uniforms };
}

/** The two star finishes used everywhere (plain metal and glinting), built from the creator's settings. */
export function createStarMaterials(
  brush: THREE.Texture,
  envMap: THREE.Texture,
  settings: { glow: number; metallic: number; glowColor: string; glowMatchStar: boolean },
) {
  const glowColor = settings.glowMatchStar ? null : new THREE.Color(settings.glowColor);
  const common = { texture: settings.metallic, envMap, envIntensity: 0.55, glowColor };
  return {
    plain: createStarMaterial(brush, { ...common, metalness: 0.92, roughness: 0.16, glow: 0 }),
    glowing: createStarMaterial(brush, { ...common, metalness: 0.8, roughness: 0.16, glow: 2.4 * settings.glow }),
  };
}
