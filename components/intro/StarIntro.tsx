"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LOGO_BODY_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import { sampleLogoSlots } from "@/lib/intro/sample-points";
import { createFacetedStarGeometry } from "@/lib/intro/star-geometry";
import { GLINT_STRENGTH, createBrushedMetalTexture, createStarMaterial, createStarMaterials } from "@/lib/intro/star-material";
import { createLogoRevealMaterial } from "@/lib/intro/logo-reveal-material";
import { createSparkleTexture } from "@/lib/intro/fx-textures";
import { buildDustGeometry, createDustMaterial } from "@/lib/intro/dust";
import { bigStarPose, planBigStar, revealTimeAt, waveRadius } from "@/lib/intro/big-star-path";
import { createRng, randomSeed } from "@/lib/intro/rng";
import {
  CAMERA_Z,
  addDepthBlur,
  createStarComposer,
  createStarInstances,
  createStarScene,
  lightStarScene,
  setBloomGlow,
} from "@/lib/intro/star-scene";
import { backdropFogColor, createBackdropPass } from "@/lib/intro/backdrop-art";
import { publishFieldStars, type FieldStar } from "@/lib/intro/handoff";
import { layerOf, pickSpread } from "@/lib/intro/field-plan";
import { createGlassPlane } from "@/lib/intro/glass-plane";
import { createAdaptiveQuality } from "@/lib/intro/adaptive-quality";
import { planStream, streamPose } from "@/lib/intro/stream";
import { T } from "@/lib/intro/timeline";
import {
  bezier,
  clamp01,
  easeInOutCubic,
  easeInQuad,
  easeOutCubic,
  easeOutQuart,
  planAmbient,
  planFormation,
  starLook,
  type Stage,
} from "@/lib/intro/choreography";
import { reportIntroProgress } from "@/lib/intro/loading";
import { useIntroSettings } from "@/lib/intro/settings-context";
import styles from "./StarIntro.module.css";

const LOGO_GOLD = new THREE.Color("#fff195"); // the flat gold of /images/brand/logo.svg

/** Where the hero logo is on screen (falls back to a centred rectangle if it isn't in view). */
function measureLogoRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = document.getElementById(HERO_LOGO_ID)?.getBoundingClientRect();
  if (rect && rect.width > 50 && rect.top > -rect.height * 0.25 && rect.bottom < vh + rect.height * 0.25) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  const width = Math.min(880, vw * 0.86);
  const height = (width * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

/** 0 → 1 → 0 pulse over [start, end], peaking at `peak`. */
function pulse(t: number, start: number, peak: number, end: number) {
  if (t <= start || t >= end) return 0;
  return t < peak ? easeOutCubic((t - start) / (peak - start)) : 1 - easeInQuad((t - peak) / (end - peak));
}

// Scroll stays locked while any intro is on screen (in the portal preview a new run overlaps the old one briefly).
let scrollLocks = 0;
let unlockedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) unlockedOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
}
function unlockScroll() {
  if (--scrollLocks === 0) {
    document.documentElement.style.overflow = unlockedOverflow;
    // The intro pins the page to the top while it plays; afterwards the browser remembers scroll positions again,
    // so Back from a project returns to the exact spot.
    if ("scrollRestoration" in history) history.scrollRestoration = "auto";
  }
}

export interface StarIntroProps {
  onReveal: () => void;
  onDone: () => void;
  /** Seconds into the intro to start from (portal preview). */
  startAt?: number;
  /** Hold the `startAt` frame instead of playing on (portal preview). */
  paused?: boolean;
  /** Fixed seed for a repeatable star layout (portal preview); random otherwise. */
  seed?: number;
  /** Reports the playhead a few times a second (portal preview). */
  onTime?: (t: number) => void;
  /** Called once the first frame is on screen (the preview then removes the run it replaces, without a flash). */
  onFirstFrame?: () => void;
}

/** How long the intro takes to fade to the page when the visitor scrolls during it. */
const SKIP_FADE_MS = 600;

export function StarIntro({ onReveal, onDone, startAt = 0, paused = false, seed, onTime, onFirstFrame }: StarIntroProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const { settings } = useIntroSettings();
  // The latest settings, read every frame, so portal changes show instantly without restarting the intro.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const overlay = overlayRef.current;
    const vignette = vignetteRef.current;
    if (!wrap || !overlay) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (err) {
      // No usable WebGL after all — never leave the visitor on a blank screen.
      console.warn("[intro] WebGL unavailable, skipping intro", err);
      onReveal();
      onDone();
      return;
    }

    const glow = settings.glow; // 1 = the original intro's glow
    const rand = createRng(seed ?? randomSeed());
    const look = starLook(settings, rand);
    const palette = settings.colors.map((c) => new THREE.Color(c.hex));
    const glowColor = new THREE.Color(settings.glowColor);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 1.5);

    // --- renderer, camera, lighting, post-processing ------------------------
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    wrap.appendChild(renderer.domElement);
    const starScene = createStarScene(renderer, backdropFogColor(settings), vw / vh, "underlay");
    const { scene, camera } = starScene;
    camera.position.z = CAMERA_Z + 2;
    // The premium backdrop eases in under the stars from the start; by the end it matches the page exactly.
    const backdrop = createBackdropPass(settings, vw / vh, settings.art.softIntro);
    // Two scenes: the stars (which can take depth blur), and a sharp layer drawn over them — the logo,
    // the big star, the glitter and the glints — so the hero of the show is always in focus.
    const front = new THREE.Scene();
    lightStarScene(front, starScene.envTexture);
    const composer = createStarComposer(renderer, scene, camera, vw, vh, dpr, glow, backdrop.pass, front);

    // --- stage: map the hero logo's on-screen rect onto the z = 0 plane -----
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH0 = CAMERA_Z * tanHalfFov;
    const halfW0 = halfH0 * (vw / vh);
    // The intro lines its logo up with the page's logo, so the page must be at the top (not a restored scroll).
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    const px = measureLogoRect();
    const stage: Stage = {
      cameraZ: CAMERA_Z,
      tanHalfFov,
      aspect: vw / vh,
      logo: {
        x: ((px.left + px.width / 2) / vw - 0.5) * 2 * halfW0,
        y: (0.5 - (px.top + px.height / 2) / vh) * 2 * halfH0,
        width: (px.width / vw) * 2 * halfW0,
        height: (px.height / vh) * 2 * halfH0,
      },
    };
    const { logo } = stage;

    // --- planning (all random choices come from one seeded source) ------------
    const slots = sampleLogoSlots(LOGO_BODY_PATH, LOGO_VIEWBOX.width, LOGO_VIEWBOX.height, settings.formationCount, rand);
    const formation = planFormation(stage, slots, { ...look, size: look.size * settings.introStarSize });
    // Background stars: in "stream" mode they pour out of a core behind the logo (the same stream the page
    // carries on with); in "float" mode they drift, and a few survivors are handed to the page.
    // The intro's background stars are the stream out of the core (no drifting extras).
    const streaming = true;
    const ambient = planAmbient(stage, 0, look);
    const streamSeed = Math.floor(rand() * 1e9);
    const streamBack = streaming ? planStream(settings.field.count, "back", settings, streamSeed) : [];
    const streamFront = streaming ? planStream(settings.front.count, "front", settings, streamSeed) : [];
    const bigPlan = planBigStar(stage, rand);
    // When the reveal reaches each logo star (it turns to dust at that moment).
    const revealTimes = formation.map((s) =>
      revealTimeAt(bigPlan, Math.hypot(s.target.x - bigPlan.glyph.x, s.target.y - bigPlan.glyph.y), settings.revealStyle),
    );

    // --- the crisp logo, revealed by the wave ----------------------------------------
    const reveal = createLogoRevealMaterial();
    const u = reveal.material.uniforms;
    u.uWaveCenter.value.set(bigPlan.glyph.x, bigPlan.glyph.y);
    u.uMode.value = settings.revealStyle === "glow" ? 1 : 0;
    u.uRevealStart.value = T.waveStart;
    u.uRevealDur.value = T.waveEnd - T.waveStart;
    u.uReach.value = bigPlan.waveReach;
    u.uWaveBand.value = bigPlan.waveBand;
    u.uSoftness.value = logo.height * 0.03;
    u.uGlow.value = 0.5 + 0.5 * glow;
    u.uEdgeColor.value.copy(glowColor);
    const logoGeometry = new THREE.PlaneGeometry(logo.width, logo.height);
    const logoPlane = new THREE.Mesh(logoGeometry, reveal.material);
    logoPlane.position.set(logo.x, logo.y, 0);
    logoPlane.renderOrder = 1;
    front.add(logoPlane);

    // --- the dark tinted glass behind the logo (the same glass the page has) ------------------
    const glass = createGlassPlane(settings, vw, vh, tanHalfFov);
    scene.add(glass.mesh);

    // Depth of field, focused on the logo plane: far and very near stars soften, the logo's stars stay crisp.
    const blur = settings.introBlur > 0 ? addDepthBlur(composer, scene, camera, CAMERA_Z + 2, [glass.mesh]) : null;
    if (blur) {
      blur.aperture.value = settings.introBlur * 0.0007;
      blur.maxblur.value = 0.004 + 0.012 * settings.introBlur;
    }

    // --- stars ------------------------------------------------------------------------
    const depth = 0.42 * settings.starDepth;
    let starGeometry = createFacetedStarGeometry({ depth });
    const brush = createBrushedMetalTexture(rand);
    // The intro's stars have their own texture and shine (the page's stars use the Look settings).
    const { plain, glowing } = createStarMaterials(brush, starScene.envTexture, {
      ...settings,
      metallic: settings.introMetallic,
      shine: settings.introShine,
    });

    const stars = createStarInstances(
      starGeometry,
      plain.material,
      glowing.material,
      [...formation, ...ambient, ...streamBack, ...streamFront],
      palette,
    );
    scene.add(...stars.meshes);
    const formationSlots = stars.slots.slice(0, formation.length);
    const ambientSlots = stars.slots.slice(formation.length, formation.length + ambient.length);
    const streamSlots = stars.slots.slice(formation.length + ambient.length);
    const stream = [
      ...streamBack.map((s) => ({ s, layer: "back" as const })),
      ...streamFront.map((s) => ({ s, layer: "front" as const })),
    ];
    const flip = new THREE.Quaternion();

    // A few background stars stay with the page after the intro, handed to the page's two star layers —
    // behind the glass and in front of it; the rest drift away near the end.
    // Chosen for an even spread across the screen and through depth, so the page never opens on a clump.
    function pickSurvivors(layer: "back" | "front", count: number) {
      const at = (i: number) => ambient[i].velocity.clone().multiplyScalar(T.revealAt).add(ambient[i].origin);
      const pool = ambient.map((_, i) => i).filter((i) => at(i).z > -14 && layerOf(at(i).z) === layer);
      const points = pool.map((i) => at(i).toArray() as [number, number, number]);
      return pickSpread(points, count, vw / vh).map((k) => pool[k]);
    }
    const survivors = new Set([...pickSurvivors("back", settings.field.count), ...pickSurvivors("front", settings.front.count)]);

    // --- the big star ----------------------------------------------------------------
    // Same proportions as the logo's own star (inner/outer ≈ 0.389), so it matches exactly when it docks.
    let bigStarGeometry = createFacetedStarGeometry({ innerRadius: 0.389, depth });
    const bigGold = new THREE.Color(0xd9a440);
    const bigEmber = new THREE.Color(0xff9a3c);
    const black = new THREE.Color(0x000000);
    // Crisp polished gold: softer reflections and only a faint ember, so it never blooms into a blob —
    // light catches a few facets at a time, and its glow only builds while it shivers.
    const big = createStarMaterial(brush, {
      metalness: 1,
      roughness: 0.32,
      glow: 0,
      texture: settings.metallic,
      envMap: starScene.envTexture,
      envIntensity: 0.42,
      glowColor: null,
    });
    const bigMaterial = big.material;
    bigMaterial.color.copy(bigGold);
    bigMaterial.emissive.copy(bigEmber);
    bigMaterial.transparent = true;
    const bigStar = new THREE.Mesh(bigStarGeometry, bigMaterial);
    bigStar.visible = false;
    bigStar.renderOrder = 2;
    front.add(bigStar);

    // --- glitter: flight trails, the big star's trail, the wave's sparkle ----------------
    const dustGeometry = buildDustGeometry(stage, formation, bigPlan, palette, glowColor, rand, settings.revealStyle);
    const dustMaterial = createDustMaterial();
    dustMaterial.uniforms.uProjScale.value = (vh * dpr) / (2 * tanHalfFov);
    dustMaterial.uniforms.uGlow.value = 0.5 + 0.5 * glow;
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.frustumCulled = false;
    dust.renderOrder = 3;
    front.add(dust);

    // --- light effects: small glints catching the big star's points as it lands and shivers ----
    const sparkleTexture = createSparkleTexture();
    function fxSprite() {
      const material = new THREE.SpriteMaterial({
        map: sparkleTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      material.color
        .copy(glowColor)
        .lerp(new THREE.Color(1, 1, 1), 0.4)
        .multiplyScalar(2); // above the bloom threshold
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 4;
      sprite.visible = false;
      front.add(sprite);
      return sprite;
    }
    const dockGlint = fxSprite();
    const shiverGlint = fxSprite();
    const fxSprites = [dockGlint, shiverGlint];
    // On two of the star's points: the top one and the upper-right one.
    const tip = (angle: number) =>
      new THREE.Vector3(
        bigPlan.glyph.x + Math.cos(angle) * bigPlan.glyphRadius * 0.92,
        bigPlan.glyph.y + Math.sin(angle) * bigPlan.glyphRadius * 0.92,
        0.4,
      );
    dockGlint.position.copy(tip(Math.PI / 2 - (2 * Math.PI) / 5));
    shiverGlint.position.copy(tip(Math.PI / 2));

    function setFx(sprite: THREE.Sprite, intensity: number, size: number, rotation = 0) {
      const opacity = intensity * glow;
      sprite.visible = opacity > 0.001;
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = opacity;
      material.rotation = rotation;
      sprite.scale.set(Math.max(size, 1e-5), Math.max(size, 1e-5), 1);
    }

    // --- per-frame update: a pure function of time t ------------------------------
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const gx = bigPlan.glyph.x;
    const gy = bigPlan.glyph.y;
    const band = bigPlan.waveBand;

    function setInstance(mesh: THREE.InstancedMesh, index: number, size: number) {
      scale.setScalar(Math.max(size, 1e-5));
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);
    }

    const dialCenterY = 1 - (px.top + px.height / 2) / vh;
    const glowTint = new THREE.Color();
    let glowTintDirty = false;
    const smoothstepJs = (a: number, b: number, x: number) => {
      const k = clamp01((x - a) / (b - a));
      return k * k * (3 - 2 * k);
    };
    const resolution = new THREE.Vector2();
    // Settings that can change while the portal preview is open apply live, without rebuilding the scene.
    let live = settings;
    function applyLive(s: typeof settings) {
      // Facet depth: swap the star shape in place (same shaders, so no rebuild and no flash).
      if (s.starDepth !== live.starDepth) {
        const d = 0.42 * s.starDepth;
        const nextStar = createFacetedStarGeometry({ depth: d });
        const nextBig = createFacetedStarGeometry({ innerRadius: 0.389, depth: d });
        for (const mesh of stars.meshes) mesh.geometry = nextStar;
        bigStar.geometry = nextBig;
        starGeometry.dispose();
        bigStarGeometry.dispose();
        starGeometry = nextStar;
        bigStarGeometry = nextBig;
      }
      live = s;
      backdrop.apply(s);
      setBloomGlow(composer, s.glow);
      glowing.material.emissiveIntensity = GLINT_STRENGTH * s.glow;
      for (const m of [plain, glowing]) {
        m.material.envMapIntensity = 0.55 * s.introShine;
        m.material.bumpScale = 0.35 * s.introMetallic;
        m.uniforms.uTexture.value = s.introMetallic;
        (m.uniforms.uGlowColor.value as THREE.Color).set(s.glowColor);
        m.uniforms.uMatchStar.value = s.glowMatchStar ? 1 : 0;
      }
      u.uGlow.value = 0.5 + 0.5 * s.glow;
      u.uEdgeColor.value.set(s.glowColor);
      dustMaterial.uniforms.uGlow.value = 0.5 + 0.5 * s.glow;
      bigMaterial.envMapIntensity = 0.42 * s.bigShine;
      (scene.fog as THREE.Fog).color.copy(backdropFogColor(s));
    }

    function update(t: number) {
      if (settingsRef.current !== live) applyLive(settingsRef.current);
      // Camera: slow push-in plus a gentle handheld drift that settles to exactly centred before the landing.
      const drift = 1 - clamp01((t - (T.docked - 1.4)) / 1.4);
      camera.position.set(
        Math.sin(t * 0.35) * 0.25 * drift,
        Math.cos(t * 0.27) * 0.15 * drift,
        THREE.MathUtils.lerp(CAMERA_Z + 2, CAMERA_Z, easeInOutCubic(clamp01(t / T.cameraSettle))),
      );
      if (blur) blur.focus.value = camera.position.z; // the logo plane is at z = 0

      const wave = waveRadius(bigPlan, t);
      u.uWaveRadius.value = wave;
      u.uTime.value = t;
      u.uWaveFade.value = 1 - easeInOutCubic(clamp01((t - (T.waveEnd - 0.1)) / 0.7));
      u.uSheen.value =
        t >= T.sheenStart && t <= T.sheenEnd ? easeInOutCubic((t - T.sheenStart) / (T.sheenEnd - T.sheenStart)) : -1;
      dustMaterial.uniforms.uTime.value = t;
      const settling = easeInOutCubic(clamp01((t - T.glassStart) / (T.revealAt - T.glassStart)));
      // The glass settles over the stars as the logo appears; the dial grows out of the core from the start.
      // No backdrop design in the intro — just the plain colour — so nothing competes with the logo.
      glass.update(
        live,
        Math.max(settling, easeOutCubic(clamp01(t / 1.2))),
        easeOutCubic(clamp01(t / 1.6)),
        dialCenterY,
        resolution.set(vw, vh).multiplyScalar(renderer.getPixelRatio()),
      );
      backdrop.update(t, { amount: 0 });

      // Formation: fly in, tumble, settle and glint — tremble with the big star's shiver — then ride the wave and dissolve.
      const shiverK = t > T.shiverStart && t < T.waveStart ? easeInQuad((t - T.shiverStart) / (T.waveStart - T.shiverStart)) : 0;
      for (let i = 0; i < formation.length; i++) {
        const s = formation[i];
        const local = clamp01((t - s.delay) / s.duration);
        bezier(pos, s.start, s.control, s.target, easeOutCubic(local));
        const dx = s.target.x - gx;
        const dy = s.target.y - gy;
        const d = Math.hypot(dx, dy) || 1e-4;
        let size = s.size;
        if (shiverK > 0) {
          const near = shiverK * Math.exp(-d / (logo.height * 0.9));
          // Only a faint sympathetic shimmer: a stronger one read as the whole logo shaking.
          pos.x += logo.height * 0.002 * near * Math.sin(t * 40 + i);
          pos.y += logo.height * 0.002 * near * Math.sin(t * 36 + i * 1.7);
        }
        // The reveal reaches this star: it lifts a touch (wave) and turns to dust right there.
        const since = t - revealTimes[i];
        if (since > -0.2) {
          const lift = settings.revealStyle === "wave" ? Math.exp(-((since / 0.12) ** 2)) : 0;
          pos.x += (dx / d) * band * 0.12 * lift;
          pos.y += (dy / d) * band * 0.12 * lift;
          pos.z += band * 0.35 * lift;
          // Wave: gone the moment its dust appears. Glow: melts away into its own glow as the logo emerges.
          size *=
            settings.revealStyle === "wave"
              ? (1 + 0.2 * lift) * (1 - easeInQuad(clamp01((since + 0.04) / 0.2)))
              : 1 - easeInOutCubic(clamp01((since - 0.25) / 0.65));
          if (settings.revealStyle === "glow") {
            // The star itself brightens in its own colour, peaks, then fades with it.
            const g = smoothstepJs(-0.15, 0.2, since) * (1 - smoothstepJs(0.25, 0.9, since));
            glowTint.copy(palette[s.color] ?? glowTint.set(1, 1, 1)).multiplyScalar(1 + 2.5 * g);
            const { mesh, index } = formationSlots[i];
            mesh.setColorAt(index, glowTint);
            glowTintDirty = true;
          }
        }
        const settle = easeOutQuart(local);
        const angle = (1 - settle) * s.spinTurns * Math.PI * 2 + settle * Math.sin(t * 1.6 + s.wobblePhase) * 0.35;
        quat.copy(s.rest).multiply(spin.setFromAxisAngle(s.spinAxis, angle));
        const { mesh, index } = formationSlots[i];
        setInstance(mesh, index, size);
      }

      // Ambient: drift and spin everywhere, at every depth — then all but the survivors drift away.
      const thin = easeInOutCubic(clamp01((t - T.thinStart) / (T.thinEnd - T.thinStart)));
      for (let i = 0; i < ambient.length; i++) {
        const s = ambient[i];
        pos.copy(s.velocity).multiplyScalar(t).add(s.origin);
        quat.setFromAxisAngle(s.spinAxis, s.spinSpeed * t);
        const { mesh, index } = ambientSlots[i];
        const keep = survivors.has(i) ? 1 : 1 - thin;
        setInstance(mesh, index, s.size * keep * easeOutCubic(clamp01((t - s.appearAt) / 0.8)));
      }
      // The stream out of the core, easing in over the first second.
      const streamIn = easeOutCubic(clamp01(t / 1.2));
      for (let i = 0; i < stream.length; i++) {
        const { s, layer } = stream[i];
        const size = streamPose(s, layer, t, settings, vw / vh, pos, quat, flip);
        const { mesh, index } = streamSlots[i];
        setInstance(mesh, index, size * streamIn);
      }
      if (glowTintDirty) for (const mesh of stars.meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      glowTintDirty = false;
      stars.markDirty();

      // Big star.
      const pose = bigStarPose(bigPlan, t, bigStar.position, bigStar.quaternion);
      bigStar.visible = pose.visible;
      const bigScale = Math.max(pose.scale, 1e-5);
      bigStar.scale.set(bigScale, bigScale, bigScale * pose.depthScale);
      // As it docks it turns from polished 3D gold into the logo's flat, unlit, untextured gold.
      bigMaterial.color.lerpColors(bigGold, black, pose.morph);
      bigMaterial.emissive.lerpColors(bigEmber, LOGO_GOLD, pose.morph);
      bigMaterial.emissiveIntensity = THREE.MathUtils.lerp(1.4 * pose.shiver * glow * live.bigGlow, 1, pose.morph);
      bigMaterial.metalness = 1 - pose.morph;
      bigMaterial.roughness = THREE.MathUtils.lerp(0.32, 1, pose.morph);
      bigMaterial.clearcoat = 0; // a clear-coat layer turns whole facets white under the key light
      bigMaterial.bumpScale = 0.35 * settings.metallic * (1 - pose.morph);
      big.uniforms.uTexture.value = settings.metallic * (1 - pose.morph);
      big.uniforms.uGlint.value = 1 - pose.morph; // glints on a few facets in flight, an even flat gold once docked
      bigMaterial.opacity = 1 - (pose.visible ? pose.dock : 0);
      u.uStarDock.value = pose.dock;

      // Light effects: a glint flicks across a point as it lands, and another builds on its top point as it shivers.
      const r = bigPlan.glyphRadius;
      const landing = pulse(t, T.docked - 0.03, T.docked + 0.06, T.docked + 0.45);
      setFx(dockGlint, landing * 0.9, r * (1.2 + 1.6 * landing), landing * 0.4);
      const release = t >= T.waveStart ? Math.max(0, 1 - (t - T.waveStart) / 0.35) : 0;
      const shiverLight = pose.visible ? Math.max(pose.shiver, release) : 0;
      setFx(shiverGlint, shiverLight * 0.85, r * (1 + 2.2 * shiverLight), t * 0.8);
    }

    // --- loop: driven by real elapsed time so it lasts the same on every machine ----------
    let t = Math.max(0, startAt);
    let revealed = false;
    let finished = false;
    let raf = 0;
    let last = performance.now();
    let lastReport = 0;
    let firstFrameShown = false;
    // Never below full resolution: a softer render would blur the stars as they form the logo.
    const adapt = createAdaptiveQuality(
      dpr,
      (pixelRatio) => {
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(vw, vh, false);
        composer.setPixelRatio(pixelRatio);
        composer.setSize(vw, vh);
        dustMaterial.uniforms.uProjScale.value = (vh * pixelRatio) / (2 * tanHalfFov);
      },
      Math.min(1, dpr),
    );

    function markRevealed() {
      if (revealed) return;
      revealed = true;
      const handed: FieldStar[] = [...survivors].map((i) => {
        const s = ambient[i];
        const p = s.velocity.clone().multiplyScalar(t).add(s.origin);
        return {
          position: [p.x, p.y, p.z],
          velocity: [s.velocity.x, s.velocity.y, s.velocity.z],
          axis: [s.spinAxis.x, s.spinAxis.y, s.spinAxis.z],
          angle: s.spinSpeed * t,
          spin: s.spinSpeed,
          size: s.size,
          color: s.color,
          glow: s.glow,
        };
      });
      publishFieldStars(handed, performance.now(), { seed: streamSeed, time: t });
      onReveal();
    }
    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      markRevealed();
      onDone();
    }

    function frame(now: number) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt < 0 || dt > 0.25) dt = 1 / 60; // tab was hidden or stalled: don't jump the show forward
      if (!paused) t += dt;
      adapt(dt);
      update(t);
      composer.render();
      if (!firstFrameShown) {
        firstFrameShown = true;
        reportIntroProgress(1); // on screen: the loader fades away as the stars come in
        onFirstFrame?.();
      }
      if (onTime && now - lastReport > 100) {
        lastReport = now;
        onTime(t);
      }

      // The vignette lifts as the logo finishes, so the last frame matches the (vignette-free) page exactly.
      if (vignette) vignette.style.opacity = String(1 - clamp01((t - T.sheenStart) / (T.fadeStart - T.sheenStart)));
      if (skippedAt !== null) {
        // Skipped by scrolling: a quick fade to the page, then done.
        const k = clamp01((now - skippedAt) / SKIP_FADE_MS);
        overlay!.style.opacity = String(1 - easeInOutCubic(k));
        if (k >= 1) return finish();
        raf = requestAnimationFrame(frame);
        return;
      }
      overlay!.style.opacity = String(1 - easeInOutCubic(clamp01((t - T.fadeStart) / (T.end - T.fadeStart))));
      if (t >= T.revealAt) markRevealed();
      if (t >= T.end) return finish();
      raf = requestAnimationFrame(frame);
    }
    // Compile every shader up front — including the big star, glints and glass that only appear later —
    // so nothing stutters mid-show while the GPU builds a program.
    reportIntroProgress(0.75); // the scene is built
    const appearLater = [bigStar, glass.mesh, ...fxSprites].filter((o) => !o.visible);
    appearLater.forEach((o) => (o.visible = true));
    renderer.compile(scene, camera);
    renderer.compile(front, camera);
    appearLater.forEach((o) => (o.visible = false));
    reportIntroProgress(0.92); // shaders compiled
    raf = requestAnimationFrame(frame);

    // Esc jumps straight to the hand-off (keyboard accessibility). No on-screen skip, no accidental skips.
    // Scrolling (wheel, swipe, or the scroll keys) during the show skips it gracefully: the page is released at
    // once, the stars are handed to the page, and the intro fades away over a moment — the scroll carries on.
    // (Not in the portal's preview, which plays the intro on purpose.)
    let skippedAt: number | null = null;
    let scrollLocked = true;
    function skipToPage() {
      if (skippedAt !== null || finished || paused || onTime) return;
      skippedAt = performance.now();
      markRevealed();
      overlay!.style.pointerEvents = "none";
      if (scrollLocked) {
        scrollLocked = false;
        unlockScroll();
      }
    }
    const SCROLL_KEYS = new Set(["ArrowDown", "PageDown", "End", " ", "Spacebar"]);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && t < T.fadeStart) t = T.fadeStart;
      else if (SCROLL_KEYS.has(e.key)) skipToPage();
    }
    function onWheel(e: WheelEvent) {
      if (e.deltaY > 0) skipToPage();
    }
    let touchY = 0;
    function onTouchStart(e: TouchEvent) {
      touchY = e.touches[0]?.clientY ?? 0;
    }
    function onTouchMove(e: TouchEvent) {
      if (touchY - (e.touches[0]?.clientY ?? touchY) > 24) skipToPage(); // a swipe up = scrolling down
    }
    // The on-screen layout is baked in at the start; if the window changes size, hand off cleanly.
    function onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      backdrop.setAspect(w / h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (t < T.fadeStart) t = T.fadeStart;
    }
    // If the GPU drops the context mid-show, go straight to the page rather than freezing.
    function onContextLost(e: Event) {
      e.preventDefault();
      finish();
    }

    lockScroll();
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    return () => {
      cancelAnimationFrame(raf);
      if (scrollLocked) unlockScroll();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      starGeometry.dispose();
      bigStarGeometry.dispose();
      logoGeometry.dispose();
      dustGeometry.dispose();
      plain.material.dispose();
      glowing.material.dispose();
      bigMaterial.dispose();
      dustMaterial.dispose();
      fxSprites.forEach((s) => s.material.dispose());
      sparkleTexture.dispose();
      brush.dispose();
      stars.dispose();
      reveal.dispose();
      glass.dispose();
      starScene.dispose();
      backdrop.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the GPU context now, not whenever the GC gets to it
      renderer.domElement.remove();
    };
    // Runs once per mount; the preview remounts it (new key) to apply new settings or a new start time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      <div ref={wrapRef} className={styles.canvasWrap} />
      <div ref={vignetteRef} className={styles.vignette} />
    </div>
  );
}
