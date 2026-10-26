"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LOGO_BODY_PATH, LOGO_VIEWBOX } from "@/content/generated/logo-paths";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import { sampleLogoSlots } from "@/lib/intro/sample-points";
import { createFacetedStarGeometry } from "@/lib/intro/star-geometry";
import { createLogoRevealMaterial } from "@/lib/intro/logo-reveal-material";
import { createGlowTexture, createStreakTexture } from "@/lib/intro/fx-textures";
import { buildDustGeometry, createDustMaterial } from "@/lib/intro/dust";
import { bigStarPose, planBigStar, wipeX } from "@/lib/intro/big-star-path";
import { T } from "@/lib/intro/timeline";
import {
  STAR_COLORS,
  bezier,
  clamp01,
  easeInOutCubic,
  easeInQuad,
  easeOutCubic,
  easeOutQuart,
  planAmbient,
  planFormation,
  type Stage,
} from "@/lib/intro/choreography";
import styles from "./StarIntro.module.css";

const PAGE_BACKGROUND = 0x07060a; // --stage in globals.css
const LOGO_GOLD = new THREE.Color("#fff195"); // the flat gold of /images/brand/logo.svg
const FORMATION_COUNT = 700;
const AMBIENT_COUNT = 260;
const CAMERA_Z = 14;
const FOV = 35;

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

export function StarIntro({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const overlay = overlayRef.current;
    const vignette = vignetteRef.current;
    if (!wrap || !overlay) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (err) {
      // No usable WebGL after all — never leave the visitor on a black screen.
      console.warn("[intro] WebGL unavailable, skipping intro", err);
      onReveal();
      onDone();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 1.5);

    // --- renderer, camera, lighting, post-processing ------------------------
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    renderer.setClearColor(PAGE_BACKGROUND, 1);
    // No tone mapping: the 3D logo must render exactly the same gold as the page logo it hands over to.
    // Lights are balanced so metal highlights stay in range; only real glints exceed it and bloom.
    renderer.toneMapping = THREE.NoToneMapping;
    // Skip reading shader logs: faster start-up, and no harmless driver precision warnings in the console.
    renderer.debug.checkShaderErrors = false;
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAGE_BACKGROUND); // same as the page, so the hand-off is invisible
    scene.fog = new THREE.Fog(PAGE_BACKGROUND, 14, 52); // distant stars fade into the dark — part of the depth cue

    const camera = new THREE.PerspectiveCamera(FOV, vw / vh, 0.1, 80);
    camera.position.set(0, 0, CAMERA_Z + 2);

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

    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(dpr);
    composer.setSize(vw, vh);
    composer.addPass(new RenderPass(scene, camera));
    // High threshold: only glowing stars, glitter, glints and the reveal edge bloom — not the logo itself,
    // so it matches the flat page logo it hands over to.
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(vw, vh), 0.55, 0.45, 0.92));
    composer.addPass(new OutputPass());

    // --- stage: map the hero logo's on-screen rect onto the z = 0 plane -----
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
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

    // --- the crisp logo, revealed by the big star's roll ------------------------
    const reveal = createLogoRevealMaterial();
    const u = reveal.material.uniforms;
    const logoGeometry = new THREE.PlaneGeometry(logo.width, logo.height);
    const logoPlane = new THREE.Mesh(logoGeometry, reveal.material);
    logoPlane.position.set(logo.x, logo.y, 0);
    logoPlane.renderOrder = 1;
    scene.add(logoPlane);

    // --- stars ------------------------------------------------------------------------
    const starGeometry = createFacetedStarGeometry();
    const plainMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.88, roughness: 0.3, flatShading: true });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.7,
      roughness: 0.25,
      flatShading: true,
      emissive: 0xffc46b,
      emissiveIntensity: 1.4,
    });

    const slots = sampleLogoSlots(LOGO_BODY_PATH, LOGO_VIEWBOX.width, LOGO_VIEWBOX.height, FORMATION_COUNT);
    const formation = planFormation(stage, slots);
    const ambient = planAmbient(stage, AMBIENT_COUNT);

    const plainCount = formation.filter((s) => !s.glow).length + ambient.filter((s) => !s.glow).length;
    const glowCount = formation.length + ambient.length - plainCount;
    const plainMesh = new THREE.InstancedMesh(starGeometry, plainMaterial, Math.max(1, plainCount));
    const glowMesh = new THREE.InstancedMesh(starGeometry, glowMaterial, Math.max(1, glowCount));
    plainMesh.count = plainCount;
    glowMesh.count = glowCount;
    plainMesh.frustumCulled = glowMesh.frustumCulled = false;
    scene.add(plainMesh, glowMesh);

    let nextPlain = 0;
    let nextGlow = 0;
    const white = new THREE.Color(0xffffff);
    const tint = new THREE.Color();
    function assign(glow: boolean, color: number) {
      const mesh = glow ? glowMesh : plainMesh;
      const index = glow ? nextGlow++ : nextPlain++;
      tint.copy(STAR_COLORS[color]);
      if (glow) tint.lerp(white, 0.35);
      mesh.setColorAt(index, tint);
      return { mesh, index };
    }
    const formationSlots = formation.map((s) => assign(s.glow, s.color));
    const ambientSlots = ambient.map((s) => assign(s.glow, s.color));
    if (plainMesh.instanceColor) plainMesh.instanceColor.needsUpdate = true;
    if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;

    // --- the big star ----------------------------------------------------------------
    const bigPlan = planBigStar(stage, formation.map((s) => s.target));
    // Same proportions as the logo's own star (inner/outer ≈ 0.389), so it matches exactly when it docks.
    const bigStarGeometry = createFacetedStarGeometry({ innerRadius: 0.389 });
    const bigGold = new THREE.Color(0xe8b34a);
    const bigEmber = new THREE.Color(0xff9a3c);
    const black = new THREE.Color(0x000000);
    const bigMaterial = new THREE.MeshStandardMaterial({
      color: bigGold,
      metalness: 1,
      roughness: 0.2,
      flatShading: true,
      emissive: bigEmber,
      emissiveIntensity: 0.3,
      transparent: true,
    });
    const bigStar = new THREE.Mesh(bigStarGeometry, bigMaterial);
    bigStar.visible = false;
    bigStar.renderOrder = 2;
    scene.add(bigStar);
    u.uDirection.value = bigPlan.direction;
    u.uSoftness.value = logo.height * 0.03;

    // --- glitter: flight trails, opening burst, big-star shower ------------------------
    const dustGeometry = buildDustGeometry(stage, formation, bigPlan);
    const dustMaterial = createDustMaterial();
    dustMaterial.uniforms.uProjScale.value = (vh * dpr) / (2 * tanHalfFov);
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.frustumCulled = false;
    dust.renderOrder = 3;
    scene.add(dust);

    // --- light effects: opening glint, flip glint, dock flash ---------------------------
    const glowTexture = createGlowTexture();
    const streakTexture = createStreakTexture();
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
    const sparkGlow = fxSprite(glowTexture);
    const sparkStreak = fxSprite(streakTexture);
    const landGlow = fxSprite(glowTexture);
    const glintStreak = fxSprite(streakTexture);
    const dockGlow = fxSprite(glowTexture);
    const dockStreak = fxSprite(streakTexture);
    const fxSprites = [sparkGlow, sparkStreak, landGlow, glintStreak, dockGlow, dockStreak];
    sparkGlow.position.set(logo.x, logo.y, 0.6);
    sparkStreak.position.copy(sparkGlow.position);
    landGlow.position.set(bigPlan.landing.x, bigPlan.landing.y, bigPlan.landing.z - 0.2);
    glintStreak.position.set(bigPlan.landing.x, bigPlan.landing.y, bigPlan.landing.z + 0.4);
    dockGlow.position.set(bigPlan.glyph.x, bigPlan.glyph.y, 0.6);
    dockStreak.position.copy(dockGlow.position);

    function setFx(sprite: THREE.Sprite, intensity: number, sx: number, sy: number) {
      sprite.visible = intensity > 0.001;
      (sprite.material as THREE.SpriteMaterial).opacity = intensity;
      sprite.scale.set(sx, sy, 1);
    }

    // --- per-frame update: a pure function of time t ------------------------------
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();

    function setInstance(mesh: THREE.InstancedMesh, index: number, size: number) {
      scale.setScalar(Math.max(size, 1e-5));
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);
    }

    function update(t: number) {
      // Camera: slow push-in plus a gentle handheld drift that settles to exactly centred before the hand-off.
      const drift = 1 - clamp01((t - (T.docked - 1.4)) / 1.4);
      camera.position.set(
        Math.sin(t * 0.35) * 0.25 * drift,
        Math.cos(t * 0.27) * 0.15 * drift,
        THREE.MathUtils.lerp(CAMERA_Z + 2, CAMERA_Z, easeInOutCubic(clamp01(t / T.cameraSettle))),
      );

      const wipe = wipeX(bigPlan, t);
      u.uRevealX.value = wipe;
      u.uSheen.value = t >= T.sheenStart && t <= T.sheenEnd ? easeInOutCubic((t - T.sheenStart) / (T.sheenEnd - T.sheenStart)) : -1;
      dustMaterial.uniforms.uTime.value = t;

      // Formation: fly in, tumble, settle and glint — then dissolve as the big star rolls past.
      const dir = bigPlan.direction;
      const rr = bigPlan.rollRadius;
      const lr = bigPlan.landRadius;
      const sinceLanding = t - T.bigStarLanded;
      const rippling = sinceLanding > 0 && sinceLanding < 1.6;
      for (let i = 0; i < formation.length; i++) {
        const s = formation[i];
        const local = clamp01((t - s.delay) / s.duration);
        bezier(pos, s.start, s.control, s.target, easeOutCubic(local));
        if (rippling) {
          // The big star's landing sends a ring outward through the settled stars.
          const dx = pos.x - bigPlan.landing.x;
          const dy = pos.y - bigPlan.landing.y;
          const d = Math.hypot(dx, dy) || 1e-4;
          const phase = 11 * sinceLanding - (d / lr) * 3;
          if (phase > 0) {
            const push = lr * 0.16 * Math.exp(-d / (lr * 1.8)) * Math.exp(-2.8 * sinceLanding) * Math.sin(phase);
            pos.x += (dx / d) * push;
            pos.y += (dy / d) * push;
            pos.z += push * 0.6;
          }
        }
        const settle = easeOutQuart(local);
        const angle = (1 - settle) * s.spinTurns * Math.PI * 2 + settle * Math.sin(t * 1.6 + s.wobblePhase) * 0.35;
        quat.copy(s.rest).multiply(spin.setFromAxisAngle(s.spinAxis, angle));
        const passed = clamp01(((wipe - s.target.x) * dir + rr * 0.1) / (rr * 0.7));
        const { mesh, index } = formationSlots[i];
        setInstance(mesh, index, s.size * (1 - easeInQuad(passed)));
      }

      // Ambient: drift and spin everywhere, at every depth.
      for (let i = 0; i < ambient.length; i++) {
        const s = ambient[i];
        pos.copy(s.velocity).multiplyScalar(t).add(s.origin);
        quat.setFromAxisAngle(s.spinAxis, s.spinSpeed * t);
        const { mesh, index } = ambientSlots[i];
        setInstance(mesh, index, s.size * easeOutCubic(clamp01((t - s.appearAt) / 0.8)));
      }
      plainMesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;

      // Big star.
      const pose = bigStarPose(bigPlan, t, bigStar.position, bigStar.quaternion);
      bigStar.visible = pose.visible;
      const bigScale = Math.max(pose.scale, 1e-5);
      bigStar.scale.set(bigScale, bigScale, bigScale * pose.depthScale);
      // As it docks it turns from polished 3D gold into the logo's flat, unlit gold.
      bigMaterial.color.lerpColors(bigGold, black, pose.morph);
      bigMaterial.emissive.lerpColors(bigEmber, LOGO_GOLD, pose.morph);
      bigMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.3, 1, pose.morph);
      bigMaterial.metalness = 1 - pose.morph;
      bigMaterial.roughness = THREE.MathUtils.lerp(0.2, 1, pose.morph);
      bigMaterial.opacity = 1 - (pose.visible ? pose.dock : 0);
      u.uStarDock.value = pose.dock;

      // Light effects.
      const spark = pulse(t, T.sparkStart, T.sparkPeak, T.sparkEnd);
      setFx(sparkGlow, spark, logo.height * (0.25 + 1.1 * spark), logo.height * (0.25 + 1.1 * spark));
      setFx(sparkStreak, spark, logo.width * 1.4 * spark, logo.height * 0.07);
      const land = pulse(t, T.bigStarLanded - 0.03, T.bigStarLanded + 0.05, T.bigStarLanded + 0.55);
      const landK = clamp01((t - T.bigStarLanded) / 0.55);
      setFx(landGlow, land * 0.8, lr * (1.6 + 3.2 * landK), lr * (1.6 + 3.2 * landK));
      const glint = pulse(t, T.landSettled + 0.05, (T.landSettled + T.glintDone) / 2, T.glintDone + 0.05);
      setFx(glintStreak, glint, logo.width * 0.9 * glint, logo.height * 0.05);
      // A brief, tight kiss of light as it docks — short enough that the spring-settle stays visible.
      const dockK = clamp01((t - (T.docked - 0.05)) / 0.4);
      const dock = pulse(t, T.docked - 0.05, T.docked + 0.03, T.docked + 0.4);
      const dockSize = bigPlan.glyphRadius * (2.2 + 5 * dockK);
      setFx(dockGlow, dock * 0.55, dockSize, dockSize);
      setFx(dockStreak, dock * 0.6, logo.width * 0.85 * dock, logo.height * 0.03);
    }

    // --- loop: driven by real elapsed time so it lasts the same on every machine ----------
    let t = 0;
    let revealed = false;
    let finished = false;
    let raf = 0;
    let last = performance.now();

    function markRevealed() {
      if (revealed) return;
      revealed = true;
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
      t += dt;
      update(t);
      composer.render();

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
      plainMaterial.dispose();
      glowMaterial.dispose();
      bigMaterial.dispose();
      dustMaterial.dispose();
      fxSprites.forEach((s) => s.material.dispose());
      glowTexture.dispose();
      streakTexture.dispose();
      plainMesh.dispose();
      glowMesh.dispose();
      reveal.dispose();
      envTexture.dispose();
      pmrem.dispose();
      room.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the GPU context now, not whenever the GC gets to it
      renderer.domElement.remove();
    };
    // Runs once on mount; onReveal/onDone are stable callbacks from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      <div ref={wrapRef} className={styles.canvasWrap} />
      <div ref={vignetteRef} className={styles.vignette} />
    </div>
  );
}
