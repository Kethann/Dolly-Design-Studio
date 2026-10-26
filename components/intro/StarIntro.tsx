"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LOGO_BODY_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import { sampleLogoSlots } from "@/lib/intro/sample-points";
import { createFacetedStarGeometry } from "@/lib/intro/star-geometry";
import { createBrushedMetalTexture, createStarMaterial } from "@/lib/intro/star-material";
import { createLogoRevealMaterial } from "@/lib/intro/logo-reveal-material";
import { createGlowTexture, createRingTexture } from "@/lib/intro/fx-textures";
import { buildDustGeometry, createDustMaterial } from "@/lib/intro/dust";
import { bigStarPose, planBigStar, waveRadius } from "@/lib/intro/big-star-path";
import { createRng, randomSeed } from "@/lib/intro/rng";
import { CAMERA_Z, createStarComposer, createStarInstances, createStarScene } from "@/lib/intro/star-scene";
import { publishFieldStars, type FieldStar } from "@/lib/intro/handoff";
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
import { useIntroSettings } from "@/lib/intro/settings-context";
import styles from "./StarIntro.module.css";

const LOGO_GOLD = new THREE.Color("#fff195"); // the flat gold of /images/brand/logo.svg
const AMBIENT_COUNT = 260;

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
}

export function StarIntro({ onReveal, onDone, startAt = 0, paused = false, seed, onTime }: StarIntroProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const { settings } = useIntroSettings();

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

    const background = new THREE.Color(settings.background); // same as the page, so the hand-off is invisible
    const glow = settings.glow; // 1 = the original intro's glow
    const rand = createRng(seed ?? randomSeed());
    const look = starLook(settings, rand);
    const palette = settings.colors.map((c) => new THREE.Color(c.hex));

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 1.5);

    // --- renderer, camera, lighting, post-processing ------------------------
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    wrap.appendChild(renderer.domElement);
    const starScene = createStarScene(renderer, background, vw / vh);
    const { scene, camera } = starScene;
    camera.position.z = CAMERA_Z + 2;
    const composer = createStarComposer(renderer, scene, camera, vw, vh, dpr, glow);

    // --- stage: map the hero logo's on-screen rect onto the z = 0 plane -----
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH0 = CAMERA_Z * tanHalfFov;
    const halfW0 = halfH0 * (vw / vh);
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
    const formation = planFormation(stage, slots, look);
    const ambient = planAmbient(stage, AMBIENT_COUNT, look);
    const bigPlan = planBigStar(stage, rand);

    // --- the crisp logo, revealed by the wave ----------------------------------------
    const reveal = createLogoRevealMaterial();
    const u = reveal.material.uniforms;
    u.uWaveCenter.value.set(bigPlan.glyph.x, bigPlan.glyph.y);
    u.uWaveBand.value = bigPlan.waveBand;
    u.uSoftness.value = logo.height * 0.03;
    u.uLogoSize.value.set(logo.width, logo.height);
    u.uGlow.value = 0.5 + 0.5 * glow;
    const logoGeometry = new THREE.PlaneGeometry(logo.width, logo.height);
    const logoPlane = new THREE.Mesh(logoGeometry, reveal.material);
    logoPlane.position.set(logo.x, logo.y, 0);
    logoPlane.renderOrder = 1;
    scene.add(logoPlane);

    // --- stars ------------------------------------------------------------------------
    const depth = 0.42 * settings.starDepth;
    const starGeometry = createFacetedStarGeometry({ depth });
    const brush = createBrushedMetalTexture(rand);
    const plain = createStarMaterial(brush, { metalness: 0.9, roughness: 0.28, glow: 0, texture: settings.metallic });
    const glowing = createStarMaterial(brush, { metalness: 0.75, roughness: 0.24, glow: 1.6 * glow, texture: settings.metallic });

    const stars = createStarInstances(starGeometry, plain.material, glowing.material, [...formation, ...ambient], palette);
    scene.add(...stars.meshes);
    const formationSlots = stars.slots.slice(0, formation.length);
    const ambientSlots = stars.slots.slice(formation.length);

    // A few background stars stay with the page after the intro (handed to the hero's star field);
    // the rest drift away near the end. Survivors sit well inside the frame, not right in front of the lens.
    const survivorPool = ambient.map((_, i) => i).filter((i) => ambient[i].origin.z > -14 && ambient[i].origin.z < 0.8);
    for (let i = survivorPool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [survivorPool[i], survivorPool[j]] = [survivorPool[j], survivorPool[i]];
    }
    const survivors = new Set(survivorPool.slice(0, settings.field.count));

    // --- the big star ----------------------------------------------------------------
    // Same proportions as the logo's own star (inner/outer ≈ 0.389), so it matches exactly when it docks.
    const bigStarGeometry = createFacetedStarGeometry({ innerRadius: 0.389, depth });
    const bigGold = new THREE.Color(0xe8b34a);
    const bigEmber = new THREE.Color(0xff9a3c);
    const black = new THREE.Color(0x000000);
    const big = createStarMaterial(brush, { metalness: 1, roughness: 0.2, glow: 0.3, texture: settings.metallic });
    const bigMaterial = big.material;
    bigMaterial.color.copy(bigGold);
    bigMaterial.emissive.copy(bigEmber);
    bigMaterial.transparent = true;
    const bigStar = new THREE.Mesh(bigStarGeometry, bigMaterial);
    bigStar.visible = false;
    bigStar.renderOrder = 2;
    scene.add(bigStar);

    // --- glitter: flight trails, the big star's trail, the wave's sparkle ----------------
    const dustGeometry = buildDustGeometry(stage, formation, bigPlan, palette, rand);
    const dustMaterial = createDustMaterial();
    dustMaterial.uniforms.uProjScale.value = (vh * dpr) / (2 * tanHalfFov);
    dustMaterial.uniforms.uGlow.value = 0.5 + 0.5 * glow;
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.frustumCulled = false;
    dust.renderOrder = 3;
    scene.add(dust);

    // --- light effects: a soft kiss as the star lands, the shiver's glow, the shock-wave ring ----
    const glowTexture = createGlowTexture();
    const ringTexture = createRingTexture();
    function fxSprite(map: THREE.Texture) {
      const material = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      material.color.setRGB(2.2, 1.85, 1.4); // above the bloom threshold, so they flare
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 4;
      sprite.visible = false;
      scene.add(sprite);
      return sprite;
    }
    const dockGlow = fxSprite(glowTexture);
    const shiverGlow = fxSprite(glowTexture);
    const ring = fxSprite(ringTexture);
    const fxSprites = [dockGlow, shiverGlow, ring];
    for (const s of fxSprites) s.position.set(bigPlan.glyph.x, bigPlan.glyph.y, 0.5);

    function setFx(sprite: THREE.Sprite, intensity: number, sx: number, sy = sx) {
      const opacity = intensity * glow;
      sprite.visible = opacity > 0.001;
      (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      sprite.scale.set(Math.max(sx, 1e-5), Math.max(sy, 1e-5), 1);
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

    function update(t: number) {
      // Camera: slow push-in plus a gentle handheld drift that settles to exactly centred before the landing.
      const drift = 1 - clamp01((t - (T.docked - 1.4)) / 1.4);
      camera.position.set(
        Math.sin(t * 0.35) * 0.25 * drift,
        Math.cos(t * 0.27) * 0.15 * drift,
        THREE.MathUtils.lerp(CAMERA_Z + 2, CAMERA_Z, easeInOutCubic(clamp01(t / T.cameraSettle))),
      );

      const wave = waveRadius(bigPlan, t);
      u.uWaveRadius.value = wave;
      u.uSheen.value = t >= T.sheenStart && t <= T.sheenEnd ? easeInOutCubic((t - T.sheenStart) / (T.sheenEnd - T.sheenStart)) : -1;
      dustMaterial.uniforms.uTime.value = t;

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
          pos.x += logo.height * 0.01 * near * Math.sin(t * 160 + i);
          pos.y += logo.height * 0.01 * near * Math.sin(t * 143 + i * 1.7);
        }
        if (wave > 0) {
          const front = (wave - d) / band; // 0 at the wave front, > 0 once it has passed
          const lift = Math.exp(-front * front * 4);
          pos.x += (dx / d) * band * 0.3 * lift;
          pos.y += (dy / d) * band * 0.3 * lift;
          pos.z += band * 0.6 * lift;
          size *= (1 + 0.5 * lift) * (1 - easeInQuad(clamp01((front + 0.1) / 0.9)));
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
      stars.markDirty();

      // Big star.
      const pose = bigStarPose(bigPlan, t, bigStar.position, bigStar.quaternion);
      bigStar.visible = pose.visible;
      const bigScale = Math.max(pose.scale, 1e-5);
      bigStar.scale.set(bigScale, bigScale, bigScale * pose.depthScale);
      // As it docks it turns from polished 3D gold into the logo's flat, unlit, untextured gold.
      bigMaterial.color.lerpColors(bigGold, black, pose.morph);
      bigMaterial.emissive.lerpColors(bigEmber, LOGO_GOLD, pose.morph);
      bigMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.3 + 0.9 * pose.shiver * glow, 1, pose.morph);
      bigMaterial.metalness = 1 - pose.morph;
      bigMaterial.roughness = THREE.MathUtils.lerp(0.2, 1, pose.morph);
      bigMaterial.clearcoat = 0.35 * (1 - pose.morph);
      bigMaterial.bumpScale = 0.35 * settings.metallic * (1 - pose.morph);
      big.uniforms.uTexture.value = settings.metallic * (1 - pose.morph);
      bigMaterial.opacity = 1 - (pose.visible ? pose.dock : 0);
      u.uStarDock.value = pose.dock;

      // Light effects.
      const r = bigPlan.glyphRadius;
      const dockK = clamp01((t - (T.docked - 0.05)) / 0.4);
      setFx(dockGlow, pulse(t, T.docked - 0.05, T.docked + 0.03, T.docked + 0.4) * 0.45, r * (2.2 + 4 * dockK));
      setFx(shiverGlow, pose.shiver * 0.5 * (pose.visible ? 1 : 0), r * (3 + 1.5 * pose.shiver));
      const waveK = clamp01((t - T.waveStart) / (T.waveEnd - T.waveStart));
      setFx(ring, t > T.waveStart ? (1 - easeInQuad(waveK)) * 0.35 : 0, Math.max(wave, r) * 2.1);
    }

    // --- loop: driven by real elapsed time so it lasts the same on every machine ----------
    let t = Math.max(0, startAt);
    let revealed = false;
    let finished = false;
    let raf = 0;
    let last = performance.now();
    let lastReport = 0;

    function markRevealed() {
      if (revealed) return;
      revealed = true;
      const handed: FieldStar[] = [...survivors].map((i) => {
        const s = ambient[i];
        const p = s.velocity.clone().multiplyScalar(t).add(s.origin);
        return {
          position: [p.x, p.y, p.z],
          axis: [s.spinAxis.x, s.spinAxis.y, s.spinAxis.z],
          angle: s.spinSpeed * t,
          spin: s.spinSpeed,
          size: s.size,
          color: s.color,
          glow: s.glow,
        };
      });
      publishFieldStars(handed);
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
      update(t);
      composer.render();
      if (onTime && now - lastReport > 100) {
        lastReport = now;
        onTime(t);
      }

      // The vignette lifts as the logo finishes, so the last frame matches the (vignette-free) page exactly.
      if (vignette) vignette.style.opacity = String(1 - clamp01((t - T.sheenStart) / (T.fadeStart - T.sheenStart)));
      overlay!.style.opacity = String(1 - clamp01((t - T.fadeStart) / (T.end - T.fadeStart)));
      if (t >= T.fadeStart) markRevealed();
      if (t >= T.end) return finish();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Esc jumps straight to the hand-off (keyboard accessibility). No on-screen skip, no accidental skips.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && t < T.fadeStart) t = T.fadeStart;
    }
    // The on-screen layout is baked in at the start; if the window changes size, hand off cleanly.
    function onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (t < T.fadeStart) t = T.fadeStart;
    }
    // If the GPU drops the context mid-show, go straight to the page rather than freezing.
    function onContextLost(e: Event) {
      e.preventDefault();
      finish();
    }

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
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
      glowTexture.dispose();
      ringTexture.dispose();
      brush.dispose();
      stars.dispose();
      reveal.dispose();
      starScene.dispose();
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
