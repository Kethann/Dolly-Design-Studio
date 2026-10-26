"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { useIntroSettings } from "@/lib/intro/settings-context";
import { getHandoff, subscribeHandoff, type FieldStar, type Handoff } from "@/lib/intro/handoff";
import { planFieldStars } from "@/lib/intro/field-plan";
import { starLook } from "@/lib/intro/choreography";
import { createRng, randomSeed } from "@/lib/intro/rng";
import { createFacetedStarGeometry } from "@/lib/intro/star-geometry";
import { createBrushedMetalTexture, createStarMaterial } from "@/lib/intro/star-material";
import { CAMERA_Z, createStarComposer, createStarInstances, createStarScene } from "@/lib/intro/star-scene";
import styles from "./StarField.module.css";

const WAITING: Handoff = { status: "waiting" };
const MAX_LINKS = 4;
const LINK_COLOR = new THREE.Color("#ffd27a");

/**
 * The few stars that stay behind the hero after the intro: they barely float,
 * lean away from the cursor, and faintly link to it when it comes close.
 * Picks up exactly where the intro left its surviving stars.
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

    // --- stars: the intro's survivors, topped up (or replaced) by our own -----------------
    const rand = createRng(randomSeed());
    const look = starLook(settings, rand);
    const handed = handoff.status === "ready" ? handoff.stars.slice(0, field.count) : [];
    const list: FieldStar[] = [...handed, ...planFieldStars(field.count - handed.length, width / height, look)];
    const palette = settings.colors.map((c) => new THREE.Color(c.hex));

    const geometry = createFacetedStarGeometry({ depth: 0.42 * settings.starDepth });
    const brush = createBrushedMetalTexture(rand);
    const plain = createStarMaterial(brush, { metalness: 0.9, roughness: 0.28, glow: 0, texture: settings.metallic });
    const glowing = createStarMaterial(brush, { metalness: 0.75, roughness: 0.24, glow: 1.6 * settings.glow, texture: settings.metallic });
    const instances = createStarInstances(geometry, plain.material, glowing.material, list, palette);
    scene.add(...instances.meshes);

    const stars = list.map((s) => ({
      base: new THREE.Vector3(...s.position),
      axis: new THREE.Vector3(...s.axis),
      angle: s.angle,
      spin: s.spin,
      size: s.size,
      offset: new THREE.Vector3(),
      freq: [0.2 + rand() * 0.25, 0.15 + rand() * 0.25, 0.1 + rand() * 0.2],
      phase: [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2],
      screen: new THREE.Vector2(),
      reach: 0,
    }));

    // --- faint lines from the cursor to the nearest stars --------------------------------
    const linkPositions = new Float32Array(MAX_LINKS * 2 * 3);
    const linkColors = new Float32Array(MAX_LINKS * 2 * 3);
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3));
    linkGeometry.setAttribute("color", new THREE.BufferAttribute(linkColors, 3));
    const linkMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const links = new THREE.LineSegments(linkGeometry, linkMaterial);
    links.frustumCulled = false;
    links.visible = field.lines && cursorStrength > 0;
    scene.add(links);

    // --- cursor -----------------------------------------------------------------------
    const pointer = { x: 0, y: 0, inside: false };
    let presence = 0; // eases in/out as the cursor enters/leaves
    function onPointerMove(e: PointerEvent) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
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
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const target = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    const cursorWorld = new THREE.Vector3();
    const ray = new THREE.Vector3();
    const linkColor = new THREE.Color();
    const start = performance.now();
    let last = start;

    function update(now: number) {
      const time = (now - start) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ease = 1 - Math.exp(-dt * 6);

      const rect = wrap!.getBoundingClientRect();
      const px = pointer.x - rect.left;
      const py = pointer.y - rect.top;
      const over = pointer.inside && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;
      presence += ((over ? 1 : 0) - presence) * ease;
      const cursorNdcX = (px / width) * 2 - 1;
      const cursorNdcY = 1 - (py / height) * 2;

      // A whisper of parallax: the view leans a touch toward the cursor.
      camera.position.x += (cursorNdcX * 0.16 * cursorStrength * presence - camera.position.x) * ease;
      camera.position.y += (cursorNdcY * 0.1 * cursorStrength * presence - camera.position.y) * ease;
      camera.updateMatrixWorld();

      const radius = 130 + 110 * cursorStrength; // px
      const amp = 0.18 * motion;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        pos.set(
          s.base.x + amp * (Math.sin(s.freq[0] * time + s.phase[0]) - Math.sin(s.phase[0])),
          s.base.y + amp * (Math.sin(s.freq[1] * time + s.phase[1]) - Math.sin(s.phase[1])),
          s.base.z + amp * 0.5 * (Math.sin(s.freq[2] * time + s.phase[2]) - Math.sin(s.phase[2])),
        );

        // Lean away from the cursor, springing back once it moves on.
        target.set(0, 0, 0);
        ndc.copy(pos).project(camera);
        s.screen.set((ndc.x + 1) * 0.5 * width, (1 - ndc.y) * 0.5 * height);
        const dx = s.screen.x - px;
        const dy = s.screen.y - py;
        const d = Math.hypot(dx, dy);
        s.reach = presence > 0.01 && ndc.z < 1 ? Math.max(0, 1 - d / radius) : 0;
        if (s.reach > 0 && d > 1e-3) {
          const worldPerPx = (2 * (CAMERA_Z - pos.z) * tanHalfFov) / height;
          const push = 46 * cursorStrength * s.reach * s.reach * presence * worldPerPx;
          target.set((dx / d) * push, (-dy / d) * push, 0);
        }
        s.offset.lerp(target, ease);
        pos.add(s.offset);

        quat.setFromAxisAngle(s.axis, s.angle + s.spin * motion * 0.5 * time + s.offset.length() * 3);
        scale.setScalar(s.size);
        matrix.compose(pos, quat, scale);
        const slot = instances.slots[i];
        slot.mesh.setMatrixAt(slot.index, matrix);
      }
      instances.markDirty();

      if (links.visible) {
        // Where the cursor sits just in front of the logo plane.
        ray.set(cursorNdcX, cursorNdcY, 0.5).unproject(camera).sub(camera.position).normalize();
        cursorWorld.copy(camera.position).addScaledVector(ray, (0.5 - camera.position.z) / ray.z);
        const nearest = stars
          .map((s, i) => ({ i, reach: s.reach }))
          .filter((n) => n.reach > 0)
          .sort((a, b) => b.reach - a.reach)
          .slice(0, MAX_LINKS);
        linkColors.fill(0);
        for (let k = 0; k < MAX_LINKS; k++) {
          const n = nearest[k];
          const o = k * 6;
          if (!n) {
            linkPositions.fill(0, o, o + 6);
            continue;
          }
          instances.slots[n.i].mesh.getMatrixAt(instances.slots[n.i].index, matrix);
          pos.setFromMatrixPosition(matrix);
          linkPositions.set([cursorWorld.x, cursorWorld.y, cursorWorld.z, pos.x, pos.y, pos.z], o);
          const strength = n.reach * presence * 0.55;
          linkColor.copy(LINK_COLOR).multiplyScalar(strength * 0.25);
          linkColors.set([linkColor.r, linkColor.g, linkColor.b], o);
          linkColor.copy(LINK_COLOR).multiplyScalar(strength);
          linkColors.set([linkColor.r, linkColor.g, linkColor.b], o + 3);
        }
        linkGeometry.attributes.position.needsUpdate = true;
        linkGeometry.attributes.color.needsUpdate = true;
      }

      composer.render();
    }

    // --- loop: only while the hero is on screen; a single still frame for reduced motion ----
    let raf = 0;
    let visible = true;
    function frame(now: number) {
      update(now);
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
      brush.dispose();
      plain.material.dispose();
      glowing.material.dispose();
      instances.dispose();
      linkGeometry.dispose();
      linkMaterial.dispose();
      starScene.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [handoff, settings]);

  return <div ref={wrapRef} className={styles.field} aria-hidden="true" />;
}
