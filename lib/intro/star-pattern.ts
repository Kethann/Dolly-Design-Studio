import * as THREE from "three";
import type { PatternBlend, StarPattern } from "./settings";

/**
 * A pattern overlay for the big star, like Photoshop's Pattern Overlay: an uploaded image laid across the star's face
 * (projected flat onto it, so it reads as one continuous pattern over every facet), blended into the polished gold
 * with a blend mode and an amount, scaled, turned, tinted — and optionally pressed into the metal ("relief"), so the
 * pattern catches the light as the star turns. Added to an existing star material; everything updates live.
 */
const BLENDS: PatternBlend[] = ["normal", "multiply", "overlay", "screen", "soft-light"];

export function addStarPattern(material: THREE.MeshPhysicalMaterial) {
  const uniforms = {
    uPattern: { value: null as THREE.Texture | null },
    uPatternOn: { value: 0 },
    uPatternAmount: { value: 0 },
    uPatternScale: { value: 1 },
    uPatternRot: { value: 0 },
    uPatternRelief: { value: 0 },
    uPatternBlend: { value: 2 },
    uPatternTint: { value: new THREE.Color(1, 1, 1) },
    uPatternTintAmount: { value: 0 },
  };
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vPatternUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPatternUv = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        varying vec2 vPatternUv;
        uniform sampler2D uPattern;
        uniform float uPatternOn;
        uniform float uPatternAmount;
        uniform float uPatternScale;
        uniform float uPatternRot;
        uniform float uPatternRelief;
        uniform int uPatternBlend;
        uniform vec3 uPatternTint;
        uniform float uPatternTintAmount;
        // The pattern across the star's face: the star spans -1..1, so at scale 1 one tile covers the whole star.
        vec3 patternSample() {
          float c = cos(uPatternRot);
          float s = sin(uPatternRot);
          vec2 p = vPatternUv / uPatternScale;
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * 0.5 + 0.5;
          return texture2D(uPattern, p).rgb * mix(vec3(1.0), uPatternTint, uPatternTintAmount);
        }
        vec3 patternBlend(vec3 b, vec3 p) {
          if (uPatternBlend == 1) return b * p;                                                   // multiply
          if (uPatternBlend == 2) return mix(2.0 * b * p, 1.0 - 2.0 * (1.0 - b) * (1.0 - p), step(0.5, b)); // overlay
          if (uPatternBlend == 3) return 1.0 - (1.0 - b) * (1.0 - p);                               // screen
          if (uPatternBlend == 4) return (1.0 - 2.0 * p) * b * b + 2.0 * p * b;                    // soft light
          return p;                                                                                 // normal
        }`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        if (uPatternOn > 0.5) {
          diffuseColor.rgb = mix(diffuseColor.rgb, patternBlend(diffuseColor.rgb, patternSample()), uPatternAmount);
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        if (uPatternOn > 0.5 && uPatternRelief > 0.0) {
          // Press the pattern into the metal: its light and dark become raised and sunken, so it catches the light.
          float h = dot(patternSample(), vec3(0.299, 0.587, 0.114));
          normal = normalize(normal - vec3(dFdx(h), dFdy(h), 0.0) * uPatternRelief * 6.0);
        }`,
      );
  };
  material.customProgramCacheKey = () => "dds-star-glint-pattern";
  material.needsUpdate = true;

  let loadedSrc: string | null = null;
  let texture: THREE.Texture | null = null;
  let loading: string | null = null;

  return {
    /** Applies the pattern settings (cheap; call every frame). Loads a new image only when it changes. */
    apply(p: StarPattern, maxAnisotropy: number) {
      if (p.src !== loadedSrc && p.src !== loading) {
        loading = p.src;
        if (!p.src) {
          texture?.dispose();
          texture = null;
          loadedSrc = null;
          loading = null;
        } else {
          const src = p.src;
          new THREE.TextureLoader().load(
            src,
            (tex) => {
              if (loading !== src) return tex.dispose(); // a newer choice arrived meanwhile
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.anisotropy = maxAnisotropy;
              texture?.dispose();
              texture = tex;
              loadedSrc = src;
              loading = null;
            },
            undefined,
            () => {
              if (loading === src) loading = null;
            },
          );
        }
      }
      uniforms.uPattern.value = texture;
      uniforms.uPatternOn.value = texture && p.amount > 0 ? 1 : 0;
      uniforms.uPatternAmount.value = p.amount;
      uniforms.uPatternScale.value = Math.max(0.05, p.scale);
      uniforms.uPatternRot.value = THREE.MathUtils.degToRad(p.rotation);
      uniforms.uPatternRelief.value = p.relief;
      uniforms.uPatternBlend.value = Math.max(0, BLENDS.indexOf(p.blend));
      uniforms.uPatternTint.value.set(p.tint);
      uniforms.uPatternTintAmount.value = p.tintAmount;
    },
    /** Turns the pattern off (the other reveals, or no image). */
    off() {
      uniforms.uPatternOn.value = 0;
    },
    dispose() {
      texture?.dispose();
      texture = null;
    },
  };
}
