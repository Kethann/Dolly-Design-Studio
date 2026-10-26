"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { getHandoff, subscribeHandoff, type FieldStar, type Handoff } from "@/lib/intro/handoff";
import { planFieldStars } from "@/lib/intro/field-plan";
import { starLook } from "@/lib/intro/choreography";
import { createRng, randomSeed } from "@/lib/intro/rng";
import { createFacetedStarGeometry } from "@/lib/intro/star-geometry";
import { createBrushedMetalTexture, createStarMaterial, createStarMaterials } from "@/lib/intro/star-material";
import { CAMERA_Z, addDepthBlur, createStarComposer, createStarInstances, createStarScene } from "@/lib/intro/star-scene";
import { FIELD_FRONT_Z } from "@/lib/intro/field-plan";
import styles from "./StarField.module.css";

const WAITING: Handoff = { status: "waiting" };
/** Seconds for the intro's drift and spin to ease into the gentle water motion. */
const SETTLE = 1.8;
const MAX_RIPPLES = 10;
const RIPPLE_SPEED = 320; // px per second
const RIPPLE_WIDTH = 70; // px
/** Seconds for the depth blur and the corner stars to arrive after the hand-off. */
const ARRIVE = 2.4;

/** Large stars half out of frame: [corner x, corner y, depth, radius as a share of the view's half-height, turn speed]. */
const CORNER_STARS = [
  { cx: -1, cy: -1, z: -2.5, radius: 0.4, spin: 0.07 },
  { cx: 1, cy: 1, z: -6, radius: 0.3, spin: -0.05 },
];

interface Ripple {
  x: number;
  y: number;
  time: number;
  strength: number;
}

/**
 * The few stars that stay behind the hero after the intro. They carry on from
 * exactly where the intro left them, then float like stars on water: a slow
 * swell rolls through them, each bobs and rocks at its own pace, and moving
 * the cursor sends soft ripples through them.
 */
export function StarField() {
  const { settings } = useIntroSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const handoff = useSyncExternalStore(subscribeHandoff, getHandoff, () => WAITING);

  useEffect(() => {
    const wrap = wrapRef.current;
    const { field } = settings;
    if (!wrap || handoff.status === "waiting" || field.count === 0) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL: the page simply has no background stars
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const motion = reducedMotion ? 0 : field.motion;
    const cursorStrength = reducedMotion || !finePointer ? 0 : field.cursor;

    let width = Math.max(1, wrap.clientWidth);
    let height = Math.max(1, wrap.clientHeight);
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    wrap.appendChild(renderer.domElement);

    const background = new THREE.Color(settings.background);
    const starScene = createStarScene(renderer, background, width / height);
    const { scene, camera } = starScene;
    const composer = createStarComposer(renderer, scene, camera, width, height, dpr, settings.glow);
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Focused just at the nearest background stars, so depth reads from crisp (near) to soft (far).
    const blur = field.depthBlur > 0 && !reducedMotion ? addDepthBlur(composer, scene, camera, CAMERA_Z - FIELD_FRONT_Z) : null;
    const blurAperture = field.depthBlur * 0.0007;
    if (blur) blur.maxblur.value = 0.004 + 0.012 * field.depthBlur;

    // --- stars: the intro's survivors, topped up (or replaced) by our own -----------------
    const rand = createRng(randomSeed());
    const look = starLook(settings, rand);
    const handed = handoff.status === "ready" ? handoff.stars.slice(0, field.count) : [];
    const list: FieldStar[] = [...handed, ...planFieldStars(field.count - handed.length, width / height, look)];
    const palette = settings.colors.map((c) => new THREE.Color(c.hex));

    const geometry = createFacetedStarGeometry({ depth: 0.42 * settings.starDepth });
    const brush = createBrushedMetalTexture(rand);
    const { plain, glowing } = createStarMaterials(brush, starScene.envTexture, settings);
    const instances = createStarInstances(geometry, plain.material, glowing.material, list, palette);
    scene.add(...instances.meshes);

    // --- corner stars: one or two big, slow-turning stars peeking in from the corners -------
    const cornerGeometry = createFacetedStarGeometry({ innerRadius: 0.42, depth: 0.42 * settings.starDepth });
    const corner = createStarMaterial(brush, {
      metalness: 0.95,
      roughness: 0.2,
      glow: 0.45 * settings.glow,
      texture: settings.metallic,
      envMap: starScene.envTexture,
      envIntensity: 0.5,
      glowColor: settings.glowMatchStar ? null : new THREE.Color(settings.glowColor),
    });
    corner.material.color.copy(palette[0] ?? new THREE.Color(0xd9a43f));
    const cornerStars = CORNER_STARS.slice(0, field.cornerStars).map((c, i) => {
      const mesh = new THREE.Mesh(cornerGeometry, corner.material);
      const halfHeight = (CAMERA_Z - c.z) * tanHalfFov;
      const home = new THREE.Vector3(c.cx * halfHeight * (width / height) * 0.93, c.cy * halfHeight * 0.9, c.z);
      mesh.scale.setScalar(halfHeight * c.radius);
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
      push: new THREE.Vector3(),
    }));

    // --- the cursor: moving it sends ripples out through the stars ----------------------
    const ripples: Ripple[] = [];
    const pointer = { x: 0, y: 0, inside: false };
    let lastRipple = { x: -1e4, y: -1e4, time: -1 };
    function now() {
      return (performance.now() - start) / 1000;
    }
    function onPointerMove(e: PointerEvent) {
      const rect = wrap!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointer.x = x;
      pointer.y = y;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (!pointer.inside) return;
      const time = now();
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
    // Carry on from the moment the intro handed these stars over, even if this frame comes a little later.
    const start = handoff.status === "ready" ? handoff.at : performance.now();
    let last = performance.now();
    let presence = 0;

    function update(frameNow: number) {
      const time = Math.max(0, (frameNow - start) / 1000);
      const dt = Math.min(0.1, (frameNow - last) / 1000);
      last = frameNow;
      const ease = 1 - Math.exp(-dt * 5);
      presence += ((pointer.inside ? 1 : 0) - presence) * ease;

      // The intro's drift and spin ease off while the water motion eases in, so nothing ever stops dead.
      const settle = 1 - Math.exp(-time / SETTLE);
      const carried = SETTLE * settle; // ∫ e^(-t/SETTLE) dt
      const water = motion * settle;

      // A whisper of parallax toward the cursor, so the field reads in depth.
      const cursorX = presence > 0.01 ? (pointer.x / width) * 2 - 1 : 0;
      const cursorY = presence > 0.01 ? 1 - (pointer.y / height) * 2 : 0;
      camera.position.x += (cursorX * 0.14 * cursorStrength * presence - camera.position.x) * ease;
      camera.position.y += (cursorY * 0.09 * cursorStrength * presence - camera.position.y) * ease;
      camera.updateMatrixWorld();

      while (ripples.length && time - ripples[0].time > 2.4) ripples.shift();

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        // A slow swell rolling diagonally through the field, plus each star's own bob.
        const swell = 0.32 * s.base.x + 0.22 * s.base.y - 0.85 * time;
        const bob = Math.sin(s.bob.freq * time + s.bob.phase);
        pos.set(
          s.base.x + s.velocity.x * carried + water * (0.1 * Math.cos(swell) + 0.04 * bob),
          s.base.y + s.velocity.y * carried + water * (0.22 * Math.sin(swell) + 0.08 * bob),
          s.base.z + s.velocity.z * carried + water * 0.16 * Math.sin(swell * 0.8 + s.bob.phase),
        );

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
        s.push.lerp(target, ease);
        pos.add(s.push);
        pos.z += lift * 0.35;
        pos.y += lift * 0.06;

        // Spin carried on from the intro, settling to a slower turn, with a gentle random rocking on top.
        const turn = s.angle + s.spin * (0.3 + 0.4 * motion) * time + s.spin * (0.7 - 0.4 * motion) * carried;
        quat.setFromAxisAngle(s.axis, turn);
        rock.setFromAxisAngle(s.rock.axis, water * s.rock.amount * Math.sin(s.rock.freq * time + s.rock.phase));
        quat.premultiply(rock);
        if (lift > 0.001) {
          tiltAxis.set(-s.push.y, s.push.x, 0);
          if (tiltAxis.lengthSq() > 1e-8) quat.premultiply(tilt.setFromAxisAngle(tiltAxis.normalize(), Math.min(0.8, lift * 0.7)));
        }

        scale.setScalar(s.size);
        matrix.compose(pos, quat, scale);
        const slot = instances.slots[i];
        slot.mesh.setMatrixAt(slot.index, matrix);
      }
      instances.markDirty();

      // Corner stars glide in from just beyond the corner after the hand-off, then turn slowly, rocking on the swell.
      const arrive = 1 - Math.pow(1 - Math.min(1, time / ARRIVE), 3);
      for (const c of cornerStars) {
        const out = (1 - arrive) * c.mesh.scale.x * 1.4;
        c.mesh.position.set(c.home.x + c.cx * out, c.home.y + c.cy * out + water * 0.12 * Math.sin(0.4 * time + c.phase), c.home.z);
        c.mesh.rotation.set(
          water * 0.18 * Math.sin(0.3 * time + c.phase),
          water * 0.22 * Math.sin(0.25 * time + c.phase * 1.3),
          c.start + c.spin * time,
        );
      }
      if (blur) blur.aperture.value = blurAperture * arrive;

      composer.render();
    }

    // --- loop: only while the hero is on screen; a single still frame for reduced motion ----
    let raf = 0;
    let visible = true;
    function frame(frameNow: number) {
      update(frameNow);
      raf = visible && !reducedMotion ? requestAnimationFrame(frame) : 0;
    }
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && !reducedMotion) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(wrap);

    const ro = new ResizeObserver(() => {
      width = Math.max(1, wrap.clientWidth);
      height = Math.max(1, wrap.clientHeight);
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (reducedMotion) update(performance.now());
    });
    ro.observe(wrap);

    function onContextLost(e: Event) {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      visible = false;
    }
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      geometry.dispose();
      cornerGeometry.dispose();
      corner.material.dispose();
      brush.dispose();
      plain.material.dispose();
      glowing.material.dispose();
      instances.dispose();
      starScene.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [handoff, settings]);

  return <div ref={wrapRef} className={styles.field} aria-hidden="true" />;
}
