"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { getHandoff, subscribeHandoff, type FieldStar, type Handoff } from "@/lib/intro/handoff";
import { FIELD_FRONT_Z, planFieldStars, type StarLayer } from "@/lib/intro/field-plan";
import { starLook } from "@/lib/intro/choreography";
import { createRng, randomSeed, type Rng } from "@/lib/intro/rng";
import { createFacetedStarGeometry } from "@/lib/intro/star-geometry";
import { GLINT_STRENGTH, createBrushedMetalTexture, createStarMaterial, createStarMaterials } from "@/lib/intro/star-material";
import {
  CAMERA_Z,
  addDepthBlur,
  createStarComposer,
  createStarInstances,
  createStarScene,
  setBloomGlow,
} from "@/lib/intro/star-scene";
import { backdropFogColor, createBackdropPass } from "@/lib/intro/backdrop-art";
import { createGlassPasses } from "@/lib/intro/glass-pass";
import { createAdaptiveQuality } from "@/lib/intro/adaptive-quality";
import { HERO_LOGO_ID } from "@/lib/dom-ids";
import { planStream, streamPose } from "@/lib/intro/stream";
import { ART_SECTIONS, pageGlowOf, type IntroSettings } from "@/lib/intro/settings";
import styles from "./StarField.module.css";

const WAITING: Handoff = { status: "waiting" };
/** Seconds for the intro's drift and spin to ease into the gentle water motion. */
const SETTLE = 1.8;
const MAX_RIPPLES = 10;
const RIPPLE_SPEED = 320; // px per second
const RIPPLE_WIDTH = 70; // px
/** Seconds for the depth blur and the corner stars to arrive after the hand-off. */
const ARRIVE = 2.4;
/** On-screen speed of the stars relative to the page as you scroll: far ones slow, near ones faster. */
const SCROLL_FAR = 0.08;
const SCROLL_NEAR = 0.4;

/** Large stars half out of frame: corner, depth, radius as a share of the view's half-height, turn speed. */
const CORNER_STARS = [
  { cx: -1, cy: -1, z: -2.5, radius: 0.4, spin: 0.07 },
  { cx: 1, cy: 1, z: -6, radius: 0.3, spin: -0.05 },
];

/** A repeatable 0..1 random number for (star, lap). */
function hash(i: number, lap: number) {
  const x = Math.sin(i * 127.1 + lap * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Ripple {
  x: number;
  y: number;
  time: number;
  strength: number;
}

/** Everything a layer needs that doesn't depend on which stars it shows: built and warmed up before the hand-off. */
interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer | null;
  blur: ReturnType<typeof addDepthBlur> | null;
  tanHalfFov: number;
  geometry: THREE.BufferGeometry;
  depth: number;
  plain: THREE.MeshPhysicalMaterial;
  glowing: THREE.MeshPhysicalMaterial;
  starUniforms: { uTexture: { value: number }; uGlowColor: { value: THREE.Color }; uMatchStar: { value: number } }[];
  fog: THREE.Fog | null;
  cornerGeometry: THREE.BufferGeometry;
  corner: THREE.MeshPhysicalMaterial;
  backdrop: ReturnType<typeof createBackdropPass> | null;
  glass: ReturnType<typeof createGlassPasses> | null;
  pixelRatio: number;
  palette: THREE.Color[];
  rand: Rng;
  dispose: () => void;
}

/** Builds the renderer, scene, post-processing and materials for a layer, and compiles every shader in advance. */
function createEngine(wrap: HTMLDivElement, settings: IntroSettings, back: boolean): Engine | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !back, powerPreference: "high-performance" });
  } catch {
    return null; // no WebGL: the page simply has no background stars
  }
  const width = Math.max(1, wrap.clientWidth);
  const height = Math.max(1, wrap.clientHeight);
  // It runs behind every page, so keep it light. The back layer sits under frosted glass, so 1x is visually the same.
  const dpr = Math.min(window.devicePixelRatio, back ? 1 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  wrap.appendChild(renderer.domElement);

  // The front layer is drawn over the glass, so it's transparent: no background, no fog, no bloom.
  const starScene = createStarScene(renderer, backdropFogColor(settings), width / height, back ? "underlay" : "transparent");
  const { scene, camera } = starScene;
  // The back layer also paints the premium backdrop under its stars (the plain background colour when it's off).
  const backdrop = back ? createBackdropPass(settings, width / height, settings.art.softPage) : null;
  const composer = back
    ? createStarComposer(renderer, scene, camera, width, height, dpr, pageGlowOf(settings), backdrop!.pass)
    : null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Focused just at the nearest background stars, so depth reads from crisp (near) to soft (far).
  // (Also needed when only the intro had blur, so the hand-off can ease out of it.)
  // Focused a little behind the nearest back stars: near and mid stars stay sharp, far ones soften.
  const blur = composer && !reducedMotion ? addDepthBlur(composer, scene, camera, CAMERA_Z - FIELD_FRONT_Z + 4) : null;
  // The tinted, frosted glass over the back stars (the front layer floats above it, untouched).
  const glass = composer ? createGlassPasses(settings) : null;
  if (composer && glass) for (const pass of glass.passes) composer.insertPass(pass, composer.passes.length - 1);

  const rand = createRng(randomSeed());
  const palette = settings.colors.map((c) => new THREE.Color(c.hex));
  const geometry = createFacetedStarGeometry({ depth: 0.42 * settings.starDepth });
  const brush = createBrushedMetalTexture(rand);
  const { plain, glowing } = createStarMaterials(brush, starScene.envTexture, { ...settings, glow: pageGlowOf(settings) });
  const cornerGeometry = createFacetedStarGeometry({ innerRadius: 0.42, depth: 0.42 * settings.starDepth });
  const corner = createStarMaterial(brush, {
    metalness: 0.95,
    roughness: 0.2,
    glow: 0.45 * pageGlowOf(settings),
    texture: settings.metallic,
    envMap: starScene.envTexture,
    envIntensity: 0.5,
    glowColor: settings.glowMatchStar ? null : new THREE.Color(settings.glowColor),
  });
  corner.material.color.copy(palette[0] ?? new THREE.Color(0xd9a43f));

  return {
    renderer,
    scene,
    camera,
    composer,
    blur,
    tanHalfFov: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
    geometry,
    depth: settings.starDepth,
    plain: plain.material,
    glowing: glowing.material,
    starUniforms: [plain.uniforms, glowing.uniforms, corner.uniforms],
    fog: scene.fog as THREE.Fog | null,
    cornerGeometry,
    corner: corner.material,
    backdrop,
    glass,
    pixelRatio: dpr,
    palette,
    rand,
    dispose() {
      this.geometry.dispose();
      this.cornerGeometry.dispose();
      corner.material.dispose();
      brush.dispose();
      plain.material.dispose();
      glowing.material.dispose();
      starScene.dispose();
      backdrop?.dispose();
      glass?.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** Applies the creator's settings to a running layer — no rebuild, no flash. */
function applyLiveSettings(engine: Engine, settings: IntroSettings) {
  // Facet depth: new star shapes for the meshes about to be built (same shaders, so nothing recompiles).
  if (settings.starDepth !== engine.depth) {
    engine.geometry.dispose();
    engine.cornerGeometry.dispose();
    engine.geometry = createFacetedStarGeometry({ depth: 0.42 * settings.starDepth });
    engine.cornerGeometry = createFacetedStarGeometry({ innerRadius: 0.42, depth: 0.42 * settings.starDepth });
    engine.depth = settings.starDepth;
  }
  engine.backdrop?.apply(settings);
  engine.glass?.apply(settings);
  engine.glowing.envMapIntensity = engine.plain.envMapIntensity = 0.55 * settings.shine;
  for (const m of [engine.plain, engine.glowing, engine.corner]) m.bumpScale = 0.35 * settings.metallic;
  for (const su of engine.starUniforms) {
    su.uTexture.value = settings.metallic;
    su.uGlowColor.value.set(settings.glowColor);
    su.uMatchStar.value = settings.glowMatchStar ? 1 : 0;
  }
  engine.palette.splice(0, engine.palette.length, ...settings.colors.map((c) => new THREE.Color(c.hex)));
  engine.corner.color.copy(engine.palette[0] ?? new THREE.Color(0xd9a43f));
  engine.corner.envMapIntensity = 0.5 * settings.bigShine;
  engine.fog?.color.copy(backdropFogColor(settings));
  if (engine.blur) engine.blur.maxblur.value = 0.004 + 0.012 * Math.max(settings.field.depthBlur, settings.introBlur);
}

/** Compiles the exact shader variants the layer will use (instanced, glowing or not, corner stars), off the main thread where supported. */
async function warmUp(engine: Engine) {
  const dummy = createStarInstances(
    engine.geometry,
    engine.plain,
    engine.glowing,
    [
      { glow: false, color: 0 },
      { glow: true, color: 0 },
    ],
    engine.palette,
  );
  const cornerDummy = new THREE.Mesh(engine.cornerGeometry, engine.corner);
  engine.scene.add(...dummy.meshes, cornerDummy);
  // Off the main thread where the browser supports it (never waiting more than a moment); otherwise compile now.
  if (engine.renderer.extensions.has("KHR_parallel_shader_compile")) {
    await Promise.race([engine.renderer.compileAsync(engine.scene, engine.camera), new Promise((r) => setTimeout(r, 1500))]);
  } else {
    engine.renderer.compile(engine.scene, engine.camera);
  }
  engine.scene.remove(...dummy.meshes, cornerDummy);
  dummy.dispose();
  // One render compiles the post-processing (bloom, depth blur) too; nothing is visible yet.
  if (engine.composer) engine.composer.render();
  else engine.renderer.render(engine.scene, engine.camera);
}

/**
 * One layer of the stars that stay behind the whole site after the intro:
 * "back" sits behind the tinted glass (with depth blur and the corner stars),
 * "front" floats in front of it, nearer the screen, crisp unless the creator
 * blurs it. Stars carry on from exactly where the intro left them, then float
 * like stars on water: a slow swell rolls through them, each bobs and rocks at
 * its own pace, and moving the cursor sends soft ripples through them.
 *
 * The renderer and shaders are prepared as soon as the page loads, so taking
 * over from the intro is just placing stars — no stall at the hand-off.
 */
export function StarField({ layer }: { layer: StarLayer }) {
  const { settings } = useIntroSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "/";
  // Each page group can have its own Dots colours.
  const artPage = pathname === "/" ? "home" : pathname === "/work" ? "work" : "project";
  const handoff = useSyncExternalStore(subscribeHandoff, getHandoff, () => WAITING);
  const [engine, setEngine] = useState<Engine | null>(null);
  // Bumped when the browser drops this layer's graphics context, so the layer rebuilds instead of vanishing.
  const [epoch, setEpoch] = useState(0);
  // One layout seed for the life of the layer, so changing a setting never reshuffles the stars.
  const [seed] = useState(randomSeed);

  const back = layer === "back";
  // Only settings that change how the layer is drawn rebuild its renderer and shaders. Everything else
  // (counts, sizes, motion, frost) just re-places the stars, which is cheap and keeps the same canvas.
  const engineKey = ""; // every setting now applies live; the renderer is only built once per layer
  const count = back ? settings.field.count : settings.front.count;
  const needed = count > 0 || (back && settings.field.cornerStars > 0);

  // Engines being replaced stay on screen (showing their last frame) until the new one has drawn — no flicker.
  const [retired] = useState<Engine[]>(() => []); // one list for the layer's lifetime
  const flushRetired = () => retired.splice(0).forEach((e) => e.dispose());

  // 1. Prepare the layer (renderer, materials, compiled shaders) while the intro plays, and again when settings change.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !needed) {
      flushRetired();
      return;
    }
    const built = createEngine(wrap, settings, back);
    if (!built) return;
    let cancelled = false;
    let live = false;
    void warmUp(built).then(() => {
      if (cancelled) return;
      live = true;
      setEngine(built);
    });
    return () => {
      cancelled = true;
      if (live) retired.push(built);
      else built.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flushRetired only touches the stable retire list
  }, [engineKey, back, needed, epoch]);
  // On unmount, dispose whatever is left (runs after the effect above has retired its engine).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  useEffect(() => () => flushRetired(), []);
  const active = needed ? engine : null;

  // 2. Once the intro hands over (or there's no intro), place the stars and bring the layer to life.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !active || handoff.status === "waiting") return;
    const engine = active;
    const { renderer, scene, camera, composer, blur, tanHalfFov } = engine;
    const rand = createRng(seed);
    const { field } = settings;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const motion = reducedMotion ? 0 : field.motion;
    const cursorStrength = reducedMotion || !finePointer ? 0 : field.cursor;
    // Depth blur eases from the intro's (when its stars are handed over) to the page's.
    applyLiveSettings(engine, settings);
    engine.backdrop?.setPage(artPage);
    const blurFrom = (handoff.status === "ready" ? settings.introBlur : 0) * 0.0007;
    const blurTo = field.depthBlur * 0.0007;
    // Stars handed over from the intro keep the intro's glow for a moment, then ease to the page's glow.
    const pageGlow = pageGlowOf(settings);
    const startGlow = handoff.status === "ready" ? settings.glow : pageGlow;
    const layerSize = back ? field.size : settings.front.size;

    let width = Math.max(1, wrap.clientWidth);
    let height = Math.max(1, wrap.clientHeight);

    // --- stars: the intro's survivors for this layer, topped up (or replaced) by our own -----
    const look = starLook(settings, rand);
    // "stream": the same stream the intro showed (same seed, same clock), carrying straight on.
    // "float": the intro's survivors for this layer, topped up (or replaced) by our own.
    // Both kinds of star, blended by scroll: the stream out of the core at the top of the page (riding up
    // with the logo and fading as you scroll on), and drifting stars that answer the scroll further down.
    const streaming = true;
    const streamSeed = handoff.status === "ready" ? handoff.stream.seed : seed;
    const streamList = streaming ? planStream(count, layer, settings, streamSeed) : [];
    const list: FieldStar[] = planFieldStars(count, width / height, look, layer);
    const instances = createStarInstances(
      engine.geometry,
      engine.plain,
      engine.glowing,
      [...streamList, ...list],
      engine.palette,
    );
    const pushes = [...streamList, ...list].map(() => new THREE.Vector3());
    const flip = new THREE.Quaternion();
    scene.add(...instances.meshes);

    // --- corner stars: one or two big, slow-turning stars peeking in from the corners -------
    const cornerStars = CORNER_STARS.slice(0, back ? field.cornerStars : 0).map((c, i) => {
      const mesh = new THREE.Mesh(engine.cornerGeometry, engine.corner);
      const halfHeight = (CAMERA_Z - c.z) * tanHalfFov;
      const home = new THREE.Vector3(c.cx * halfHeight * (width / height) * 0.93, c.cy * halfHeight * 0.9, c.z);
      mesh.scale.setScalar(halfHeight * c.radius * field.cornerSize);
      scene.add(mesh);
      return { ...c, mesh, home, phase: i * 2.1 + rand() * Math.PI, start: rand() * Math.PI * 2 };
    });

    const randomAxis = () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const stars = list.map((s) => ({
      base: new THREE.Vector3(...s.position),
      velocity: new THREE.Vector3(...s.velocity),
      axis: new THREE.Vector3(...s.axis),
      angle: s.angle,
      spin: s.spin,
      size: s.size,
      /** Each star bobs and rocks at its own pace, about its own axis. */
      bob: { freq: 0.5 + rand() * 0.5, phase: rand() * Math.PI * 2 },
      rock: { axis: randomAxis(), freq: 0.35 + rand() * 0.4, phase: rand() * Math.PI * 2, amount: 0.25 + rand() * 0.3 },
    }));

    // Carry on from the moment the intro handed these stars over, even if this frame comes a little later.
    const start = handoff.status === "ready" ? handoff.at : performance.now();

    // --- the cursor: moving it sends ripples out through the stars ----------------------
    const ripples: Ripple[] = [];
    const pointer = { x: 0, y: 0, inside: false };
    let lastRipple = { x: -1e4, y: -1e4, time: -1 };
    function onPointerMove(e: PointerEvent) {
      const rect = wrap!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointer.x = x;
      pointer.y = y;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (!pointer.inside) return;
      const time = (performance.now() - start) / 1000;
      const moved = Math.hypot(x - lastRipple.x, y - lastRipple.y);
      if (moved < 22 || time - lastRipple.time < 0.08) return;
      const speed = moved / Math.max(0.016, time - lastRipple.time);
      ripples.push({ x, y, time, strength: Math.min(1, 0.35 + speed / 1600) });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      lastRipple = { x, y, time };
    }
    function onPointerOut(e: PointerEvent) {
      if (!e.relatedTarget) pointer.inside = false;
    }
    if (cursorStrength > 0) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerout", onPointerOut);
    }

    // --- per-frame update ----------------------------------------------------------------
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const rock = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const tiltAxis = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const target = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    let last = performance.now();
    let presence = 0;
    const mixA = new THREE.Color();
    const mixB = new THREE.Color();
    const tmpColor = new THREE.Color();
    const adapt = createAdaptiveQuality(engine.pixelRatio, (pixelRatio) => {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer?.setPixelRatio(pixelRatio);
      composer?.setSize(width, height);
    });

    function update(frameNow: number) {
      const time = Math.max(0, (frameNow - start) / 1000);
      const dt = Math.min(0.1, Math.max(0, (frameNow - last) / 1000)); // never a negative step
      last = frameNow;
      const ease = 1 - Math.exp(-dt * 5);
      presence += ((pointer.inside ? 1 : 0) - presence) * ease;

      // The intro's drift and spin ease off while the water motion eases in, so nothing ever stops dead.
      const settle = 1 - Math.exp(-time / SETTLE);
      const carried = SETTLE * settle; // ∫ e^(-t/SETTLE) dt
      const water = motion * settle;
      const arrive = 1 - Math.pow(1 - Math.min(1, time / ARRIVE), 3);

      // A whisper of parallax toward the cursor, so the field reads in depth.
      const cursorX = presence > 0.01 ? (pointer.x / width) * 2 - 1 : 0;
      const cursorY = presence > 0.01 ? 1 - (pointer.y / height) * 2 : 0;
      camera.position.x += (cursorX * 0.14 * cursorStrength * presence - camera.position.x) * ease;
      camera.position.y += (cursorY * 0.09 * cursorStrength * presence - camera.position.y) * ease;
      camera.updateMatrixWorld();

      while (ripples.length && time - ripples[0].time > 2.4) ripples.shift();
      const scrolled = reducedMotion ? 0 : window.scrollY;

      // The stream's clock: the intro's time at the hand-off, carried on.
      const streamClock = handoff.status === "ready" ? handoff.stream.time + time : time;
      // 0 at the top of the page (all stream), 1 once you've scrolled about a screen (all drifting stars).
      const scrolledBy = scrolled / height;
      const mix = reducedMotion ? 0 : Math.min(1, Math.max(0, (scrolledBy - 0.15) / 0.75));
      const blend = mix * mix * (3 - 2 * mix);
      const total = streamList.length + stars.length;
      for (let i = 0; i < total; i++) {
        const fromStream = i < streamList.length;
        const s = stars[i - streamList.length];
        let size = 0;
        if (fromStream) {
          // Out of the core to every side, tumbling and flipping; it always fills the screen, so scrolling never empties it.
          size = streamPose(streamList[i], layer, streamClock, settings, width / height, pos, quat, flip) * (1 - blend);
          // The core is behind the logo, so it rides up with the page; its stars keep flying as they fade.
          pos.y += scrolled * ((2 * (CAMERA_Z - pos.z) * tanHalfFov) / height);
        } else {
          // A slow swell rolling diagonally through the field, plus each star's own bob.
          const swell = 0.32 * s.base.x + 0.22 * s.base.y - 0.85 * time;
          const bob = Math.sin(s.bob.freq * time + s.bob.phase);
          pos.set(
            s.base.x + s.velocity.x * carried + water * (0.1 * Math.cos(swell) + 0.04 * bob),
            s.base.y + s.velocity.y * carried + water * (0.22 * Math.sin(swell) + 0.08 * bob),
            s.base.z + s.velocity.z * carried + water * 0.16 * Math.sin(swell * 0.8 + s.bob.phase),
          );
        }

        // Scrolling: the stars drift up past you at depth-dependent speeds and wrap around, so the field never runs out.
        if (!fromStream && scrolled > 0) {
          const halfHeight = (CAMERA_Z - pos.z) * tanHalfFov;
          // Nearer stars pass faster; front-layer stars (in front of the glass) fastest of all.
          const nearness = Math.min(1.4, Math.max(0, (pos.z + 14) / 13.5));
          const rate = SCROLL_FAR + (SCROLL_NEAR - SCROLL_FAR) * nearness;
          const span = halfHeight * 1.15;
          const y = pos.y + scrolled * rate * ((2 * halfHeight) / height);
          const lap = Math.floor((y + span) / (2 * span));
          pos.y = y - lap * 2 * span;
          // Each time a star comes round again it reappears somewhere new across the width — never a visible repeat.
          if (lap !== 0) pos.x += (hash(i, lap) * 2 - 1) * halfHeight * (width / height) * 1.05 - s.base.x;
        }

        // Ripples from the cursor lift the stars they pass and nudge them outward.
        let lift = 0;
        target.set(0, 0, 0);
        if (ripples.length || presence > 0.01) {
          ndc.copy(pos).project(camera);
          const sx = (ndc.x + 1) * 0.5 * width;
          const sy = (1 - ndc.y) * 0.5 * height;
          const worldPerPx = (2 * (CAMERA_Z - pos.z) * tanHalfFov) / height;
          for (const r of ripples) {
            const age = time - r.time;
            const dx = sx - r.x;
            const dy = sy - r.y;
            const d = Math.hypot(dx, dy) || 1;
            const front = (d - (20 + RIPPLE_SPEED * age)) / RIPPLE_WIDTH;
            const wave = Math.exp(-front * front) * Math.exp(-1.5 * age) * r.strength;
            lift += wave;
            target.x += (dx / d) * wave * 18 * worldPerPx;
            target.y -= (dy / d) * wave * 18 * worldPerPx;
          }
          // Right under the cursor, stars lean gently out of the way.
          const dx = sx - pointer.x;
          const dy = sy - pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          const near = Math.max(0, 1 - d / 160) * presence;
          target.x += (dx / d) * near * near * 22 * worldPerPx;
          target.y -= (dy / d) * near * near * 22 * worldPerPx;
          target.multiplyScalar(cursorStrength);
          lift *= cursorStrength;
        }
        const push = pushes[i];
        push.lerp(target, ease);
        pos.add(push);
        pos.z += lift * 0.35;
        pos.y += lift * 0.06;

        if (!fromStream) {
          // Spin carried on from the intro, settling to a slower turn, with a gentle random rocking on top.
          const turn = s.angle + s.spin * (0.3 + 0.4 * motion) * time + s.spin * (0.7 - 0.4 * motion) * carried;
          quat.setFromAxisAngle(s.axis, turn);
          rock.setFromAxisAngle(s.rock.axis, water * s.rock.amount * Math.sin(s.rock.freq * time + s.rock.phase));
          quat.premultiply(rock);
          // Eases from the size it had in the intro to this layer's chosen size, so the hand-off never jumps.
          size = s.size * (1 + (layerSize - 1) * arrive) * blend;
        }
        if (lift > 0.001) {
          tiltAxis.set(-push.y, push.x, 0);
          if (tiltAxis.lengthSq() > 1e-8)
            quat.premultiply(tilt.setFromAxisAngle(tiltAxis.normalize(), Math.min(0.8, lift * 0.7)));
        }

        scale.setScalar(Math.max(size, 1e-5));
        matrix.compose(pos, quat, scale);
        if (size < 1e-4) size = 1e-5;
        const slot = instances.slots[i];
        slot.mesh.setMatrixAt(slot.index, matrix);
      }
      instances.markDirty();

      // Corner stars glide in from just beyond the corner after the hand-off, then turn slowly, rocking on the swell.
      for (const c of cornerStars) {
        const out = (1 - arrive) * c.mesh.scale.x * 1.4;
        c.mesh.position.set(
          c.home.x + c.cx * out,
          c.home.y + c.cy * out + water * 0.12 * Math.sin(0.4 * time + c.phase),
          c.home.z,
        );
        c.mesh.rotation.set(
          water * 0.18 * Math.sin(0.3 * time + c.phase),
          water * 0.22 * Math.sin(0.25 * time + c.phase * 1.3),
          c.start + c.spin * time,
        );
      }
      if (blur) blur.aperture.value = blurFrom + (blurTo - blurFrom) * arrive;
      const glow = startGlow + (pageGlow - startGlow) * arrive;
      engine!.glowing.emissiveIntensity = GLINT_STRENGTH * glow;
      engine!.corner.emissiveIntensity = 0.45 * glow * settings.bigGlow;
      if (composer) setBloomGlow(composer, glow);
      // Home page: each section has its own colour pair; near a boundary the two neighbours blend, so the colours
      // flow from one section into the next with soft edges top and bottom.
      if (artPage === "home" && engine!.backdrop) {
        const mid = height * 0.5;
        const zone = height * 0.4;
        const tops = ART_SECTIONS.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity);
        let current = 0;
        tops.forEach((top, i) => {
          if (top <= mid) current = i;
        });
        const pair = (i: number) => settings.art.sections[ART_SECTIONS[Math.max(0, Math.min(ART_SECTIONS.length - 1, i))]];
        let other = current;
        let w = 0;
        const toNext = (tops[current + 1] ?? Infinity) - mid;
        const fromPrev = mid - tops[current];
        if (toNext < zone) {
          other = current + 1;
          w = 0.5 * (1 - toNext / zone);
        } else if (current > 0 && fromPrev < zone) {
          other = current - 1;
          w = 0.5 * (1 - fromPrev / zone);
        }
        mixA.set(pair(current).a).lerp(tmpColor.set(pair(other).a), w);
        mixB.set(pair(current).b).lerp(tmpColor.set(pair(other).b), w);
        engine!.backdrop.setColors(mixA, mixB);
      }
      // The backdrop's layers scroll and lean with the page at their own depths.
      engine!.backdrop?.update(time, {
        amount: blend,
        softness: settings.art.softPage,
        scroll: scrolledBy,
        pointerX: cursorX * presence,
        pointerY: cursorY * presence,
      });
      const logoRect = document.getElementById(HERO_LOGO_ID)?.getBoundingClientRect();
      engine!.glass?.setDial(logoRect ? 1 - (logoRect.top + logoRect.height / 2) / height : 0.5, logoRect ? 1 : 0);
      // The glass frosts over as the page settles in.
      engine!.glass?.setFrost(settings.glassFrost * arrive, width, height);
      adapt(dt);

      if (composer) composer.render();
      else renderer.render(scene, camera);
      if (retired.length) flushRetired();
    }

    // --- loop: a single still frame for reduced motion ----------------------------------
    let raf = 0;
    let running = true;
    function frame(frameNow: number) {
      update(frameNow);
      raf = running && !reducedMotion ? requestAnimationFrame(frame) : 0;
    }
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => {
      width = Math.max(1, wrap.clientWidth);
      height = Math.max(1, wrap.clientHeight);
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
      engine!.backdrop?.setAspect(width / height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (reducedMotion) update(performance.now());
    });
    ro.observe(wrap);

    function onContextLost(e: Event) {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(raf);
      setTimeout(() => setEpoch((n) => n + 1), 250); // rebuild the layer on a fresh context
    }
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      scene.remove(...instances.meshes, ...cornerStars.map((c) => c.mesh));
      instances.dispose();
    };
    // settings are already baked into the engine (it rebuilds when they change), so it's the engine that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, handoff, settings, artPage]);

  const softness = layer === "front" ? settings.front.blur : 0;
  return (
    <div
      ref={wrapRef}
      className={styles.field}
      style={softness > 0 ? { filter: `blur(${softness}px)` } : undefined}
      aria-hidden="true"
    />
  );
}
