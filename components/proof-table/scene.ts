import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ProofItem } from "@/content/proof-table";
import { STAGES } from "./stages";

/**
 * "The Proof Table": the title designs drop onto a backlit proofing table as glass-mounted proofs, then the camera
 * leans in low while the table slides right and the cards can be picked up (hover) and opened (click).
 *
 * Everything is a pure function of the scroll progress `p` (0..1); the section decides how p moves (see ProofTable).
 *   drops    the cards drop in, one by one, with weight
 *   inspect  the camera swings low and close, the table slides right
 */

const W = 8; // slab width (x)
const D = 5.6; // slab depth (z)
const T = 0.42; // slab thickness
const INSET = 0.32; // frame around the lit panel
const PLATE_T = 0.05;
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const range = (p: number, [a, b]: readonly [number, number]) => clamp01((p - a) / (b - a));
const smooth = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The floor: dark stage-tinted paper with a fine dot grid, printer's marks and press labels, fading out at the edges. */
/** The clear sheet under the table: gold stars and fine crop marks only (no text, so nothing busy to scroll past). */
function floorTexture() {
  const S = 2048;
  const U = S / 24; // px per world unit (the floor plane is 24 units wide)
  return canvasTexture(S, S, (ctx) => {
    const c = (x: number) => S / 2 + x * U;
    // No paper fill: the sheet is clear, so the site's own background (set in the portal) shows through.
    // Instead of a dot grid, small gold stars are printed across it, fading out towards the edges.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const star = (x: number, y: number, r: number, turn: number) => {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = turn + (k * Math.PI) / 5 - Math.PI / 2;
        const rad = k % 2 === 0 ? r : r * 0.42;
        ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
    };
    for (let y = -11; y <= 11; y += 0.42) {
      for (let x = -11; x <= 11; x += 0.42) {
        const jx = x + (rand() - 0.5) * 0.3;
        const jy = y + (rand() - 0.5) * 0.3;
        const fade = Math.max(0, 1 - Math.hypot(jx, jy) / 10);
        const bright = rand() < 0.12;
        const a = fade * (bright ? 0.75 : 0.32);
        if (a <= 0.02) continue;
        ctx.fillStyle = bright ? `rgba(255,241,149,${a})` : `rgba(232,176,75,${a})`;
        star(c(jx), c(jy), (bright ? 5.5 : 3) + rand() * 2.5, rand() * Math.PI);
      }
    }

    ctx.strokeStyle = "rgba(244,237,225,0.38)";
    ctx.fillStyle = "rgba(244,237,225,0.42)";
    ctx.lineWidth = 1.5;
    const hw = W / 2 + 0.5;
    const hd = D / 2 + 0.5;
    // Crop marks at the four corners of the work area.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(c(sx * hw), c(sz * (hd + 0.15)));
        ctx.lineTo(c(sx * hw), c(sz * (hd + 0.75)));
        ctx.moveTo(c(sx * (hw + 0.15)), c(sz * hd));
        ctx.lineTo(c(sx * (hw + 0.75)), c(sz * hd));
        ctx.stroke();
      }
  });
}

/** The lit panel: warm white with column guides, a safe area and a title-safe rectangle. */
function panelTexture(pw: number, pd: number) {
  const S = 1024;
  const h = Math.round((S * pd) / pw);
  return canvasTexture(S, h, (ctx) => {
    const g = ctx.createRadialGradient(S / 2, h / 2, 0, S / 2, h / 2, S * 0.7);
    g.addColorStop(0, "#fffaf0");
    g.addColorStop(1, "#efe3c8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, h);
    ctx.strokeStyle = "rgba(185,133,58,0.35)";
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 12; i++) {
      const x = (S * i) / 12;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(185,133,58,0.55)";
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(S * 0.05, h * 0.05, S * 0.9, h * 0.9);
    ctx.setLineDash([]);
    ctx.strokeRect(S * 0.1, h * 0.1, S * 0.8, h * 0.8);
  });
}

/** A soft rounded rectangle (alpha): `inner` is the solid part (0..1 of the texture), `feather` how far it fades. */
function softRect(inner: number, feather: number) {
  const S = 512;
  return canvasTexture(
    S,
    S,
    (ctx) => {
      const data = ctx.createImageData(S, S);
      const h = inner / 2;
      const rad = 0.05;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const qx = Math.abs((x + 0.5) / S - 0.5) - (h - rad);
          const qy = Math.abs((y + 0.5) / S - 0.5) - (h - rad);
          const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
          const t = Math.min(1, Math.max(0, d / feather));
          const a = 1 - t * t * (3 - 2 * t);
          const k = (y * S + x) * 4;
          data.data[k] = data.data[k + 1] = data.data[k + 2] = Math.round(a * a * 255);
          data.data[k + 3] = 255;
        }
      ctx.putImageData(data, 0, 0);
    },
    false,
  );
}

/** A soft glow hugging a rounded rectangle's edge (alpha): strongest on the edge, fading both ways. */
function softRing(inner: number, feather: number) {
  const S = 512;
  return canvasTexture(
    S,
    S,
    (ctx) => {
      const data = ctx.createImageData(S, S);
      const h = inner / 2;
      const rad = 0.06;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const qx = Math.abs((x + 0.5) / S - 0.5) - (h - rad);
          const qy = Math.abs((y + 0.5) / S - 0.5) - (h - rad);
          const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
          const a = Math.exp(-((d / (d > 0 ? feather : feather * 0.35)) ** 2));
          const k = (y * S + x) * 4;
          data.data[k] = data.data[k + 1] = data.data[k + 2] = Math.round(a * 255);
          data.data[k + 3] = 255;
        }
      ctx.putImageData(data, 0, 0);
    },
    false,
  );
}

function rippleTexture() {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      // Grey levels on black: alpha maps read the colour, not the transparency.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 256, 256);
      const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
      g.addColorStop(0, "#000");
      g.addColorStop(0.75, "#e6e6e6");
      g.addColorStop(1, "#000");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    },
    false,
  );
}

function sheenTexture() {
  return canvasTexture(
    512,
    64,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 512, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.42, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,1)");
      g.addColorStop(0.58, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 64);
    },
    false,
  );
}

function tagTexture(text: string) {
  return canvasTexture(1024, 64, (ctx) => {
    ctx.fillStyle = "rgba(244,237,225,0.78)";
    ctx.font = `500 30px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase().split("").join(" "), 4, 34);
  });
}

export interface GlassLook {
  color: string;
  /** 0..1: how strongly the glass mirrors the room (clear-coat shine and reflections). */
  reflection: number;
  /** 0..1, 1 = solid. */
  opacity: number;
  /** 0..1 frosted blur. */
  frost: number;
}

export interface ProofScene {
  /** Draws the scene at scroll progress p. Returns true while something is still animating (hover springs, ripples). */
  update: (p: number, dt: number) => boolean;
  resize: (w: number, h: number) => void;
  /** Pointer in CSS pixels relative to the canvas, or null when it leaves. */
  pointer: (x: number | null, y: number) => void;
  /** The card under the cursor (index into the items), or -1. */
  hovered: () => number;
  /** Swap the cards (new slots, removed slots, a new size) without flicker: the new set replaces the old once loaded. */
  setItems: (items: ProofItem[], cardSize: number) => void;
  setGlass: (glass: GlassLook) => void;
  dispose: () => void;
}

interface Plate {
  pivot: THREE.Group; // sits on the card's front edge, so it can stand up on it
  inner: THREE.Group;
  glass: THREE.Mesh<RoundedBoxGeometry, THREE.MeshPhysicalMaterial>;
  fading: THREE.Material[];
  sheen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  ripple: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  own: { dispose: () => void }[];
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  // Hover spring (0 = lying flat, 1 = standing) and the small follow-the-cursor sway.
  stand: number;
  standV: number;
  sway: THREE.Vector2;
}

export function createProofScene(
  canvas: HTMLCanvasElement,
  opts: {
    items: ProofItem[];
    cardSize: number;
    glass: GlassLook;
    mobile: boolean;
    stage: string;
  },
): ProofScene {
  const { mobile } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // A near plane well away from the camera keeps depth precise at grazing angles (no shimmering edges).
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 120);
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x1a0c08, 0.5));
  const key = new THREE.DirectionalLight(0xffeccc, 1.6);
  key.position.set(-5, 9, 4);
  scene.add(key);

  const disposables: { dispose: () => void }[] = [envRT];
  const track = <X extends { dispose: () => void }>(x: X) => (disposables.push(x), x);
  const stageColor = new THREE.Color(opts.stage);

  // --- Floor -------------------------------------------------------------------------------------
  const floorTex = track(floorTexture());
  floorTex.anisotropy = maxAniso;
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2)),
    track(new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, toneMapped: false })),
  );
  floor.renderOrder = -3;
  scene.add(floor);

  const slabShadow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W * 1.22, D * 1.3).rotateX(-Math.PI / 2)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        alphaMap: track(softRect(0.74, 0.12)),
        transparent: true,
        depthWrite: false,
        polygonOffset: true, // lies on the floor without fighting it
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
        opacity: 0.55,
      }),
    ),
  );
  slabShadow.renderOrder = -2;
  slabShadow.material.opacity = 0.55;
  scene.add(slabShadow);

  // --- Lightbox slab ---------------------------------------------------------------------------
  const slab = new THREE.Mesh(
    track(new RoundedBoxGeometry(W, T, D, 5, 0.16)),
    track(
      new THREE.MeshPhysicalMaterial({
        color: stageColor.clone().lerp(new THREE.Color("#120d0a"), 0.7),
        roughness: 0.38,
        metalness: 0.25,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25,
      }),
    ),
  );
  slab.position.y = T / 2;
  scene.add(slab);

  const pw = W - INSET * 2;
  const pd = D - INSET * 2;
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-W / 2 + 0.12, -D / 2 + 0.12);
  frameShape.lineTo(W / 2 - 0.12, -D / 2 + 0.12);
  frameShape.lineTo(W / 2 - 0.12, D / 2 - 0.12);
  frameShape.lineTo(-W / 2 + 0.12, D / 2 - 0.12);
  const hole = new THREE.Path();
  hole.moveTo(-pw / 2, -pd / 2);
  hole.lineTo(-pw / 2, pd / 2);
  hole.lineTo(pw / 2, pd / 2);
  hole.lineTo(pw / 2, -pd / 2);
  frameShape.holes.push(hole);
  const frame = new THREE.Mesh(
    track(
      new THREE.ExtrudeGeometry(frameShape, {
        depth: 0.02,
        bevelEnabled: true,
        bevelSize: 0.035,
        bevelThickness: 0.03,
        bevelSegments: 3,
      }).rotateX(-Math.PI / 2),
    ),
    track(new THREE.MeshPhysicalMaterial({ color: "#9c7434", metalness: 0.9, roughness: 0.32, envMapIntensity: 1.1 })),
  );
  frame.position.y = T - 0.005;
  scene.add(frame);

  // Opaque, so frosted glass can see (and blur) it.
  const panelMat = track(new THREE.MeshBasicMaterial({ map: track(panelTexture(pw, pd)), toneMapped: false, color: 0x000000 }));
  panelMat.color.setScalar(0.86);
  const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2)), panelMat);
  panel.position.y = T + 0.001;
  scene.add(panel);

  // Light bleeding out around the panel: a soft ring floating just above the frame (above every slab surface, so
  // it can't depth-fight with the rounded edge), brightest at the panel's rim.
  const bleed = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W + 2, D + 2).rotateX(-Math.PI / 2)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0xfff1d0,
        alphaMap: track(softRing(pw / (W + 2), 0.07)),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      }),
    ),
  );
  bleed.renderOrder = 0;
  bleed.position.y = T + 0.07;
  bleed.material.opacity = 0.3;
  scene.add(bleed);

  // --- Proofs ----------------------------------------------------------------------------------
  const shadowGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const plateShadowTex = track(softRect(0.8, 0.1));
  const rippleTex = track(rippleTexture());
  const sheenTex = track(sheenTexture());
  const loader = new THREE.TextureLoader();
  const textures = new Map<string, Promise<THREE.Texture | null>>();
  const loadTexture = (src: string) => {
    if (!textures.has(src))
      textures.set(
        src,
        new Promise((resolve) =>
          loader.load(
            src,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = maxAniso;
              resolve(track(tex));
            },
            undefined,
            () => resolve(null),
          ),
        ),
      );
    return textures.get(src)!;
  };

  let glass: GlassLook = opts.glass;
  const glassMaterial = (tint?: string) => {
    const m = new THREE.MeshPhysicalMaterial({
      clearcoatRoughness: 0.06,
      metalness: 0,
      transparent: true,
      ior: 1.45,
      thickness: PLATE_T,
    });
    m.userData.tint = tint;
    styleGlass(m);
    return m;
  };
  function styleGlass(m: THREE.MeshPhysicalMaterial) {
    m.color.set((m.userData.tint as string | undefined) ?? glass.color);
    m.userData.base = glass.opacity;
    m.roughness = 0.06 + glass.frost * 0.55;
    m.clearcoat = glass.reflection;
    m.envMapIntensity = 0.05 + glass.reflection * 1.1;
    const transmission = glass.frost > 0.01 ? 1 : 0;
    if (m.transmission !== transmission) {
      m.transmission = transmission; // frosted: the lightbox shows through, blurred by the roughness
      m.needsUpdate = true;
    }
  }

  let plates: Plate[] = [];
  let itemsVersion = 0;

  function buildPlates(items: ProofItem[], cardSize: number, texs: (THREE.Texture | null)[]): Plate[] {
    const cols = mobile || items.length <= 4 ? 2 : items.length <= 9 ? 3 : 4;
    const gap = 0.3;
    const colW = ((pw - 0.5 - gap * (cols - 1)) / cols) * cardSize;
    const heights = new Array(cols).fill(0);
    const placed = items.map((_, i) => {
      const img = texs[i]?.image as { width: number; height: number } | undefined;
      const aspect = Math.min(4.5, Math.max(0.6, img ? img.width / img.height : 2.4));
      const imgW = colW * 0.82;
      const imgD = imgW / aspect;
      const d = imgD + 0.42 * cardSize;
      const col = heights.indexOf(Math.min(...heights));
      const z = heights[col] + d / 2;
      heights[col] += d + gap;
      return { col, z, d, imgW, imgD };
    });
    const total = Math.max(0, ...heights) - gap;
    const s = Math.min(1, (pd - 0.4) / Math.max(total, 0.01));
    return placed.map((pl, i) => {
      const it = items[i];
      const tex = texs[i];
      const own: { dispose: () => void }[] = [];
      const mine = <X extends { dispose: () => void }>(x: X) => (own.push(x), x);
      const rand = Math.sin(i * 91.7 + 3.1) * 0.5;
      const w = colW * s;
      const d = pl.d * s;
      const x = (-(cols - 1) / 2 + pl.col) * (colW + gap) * s + rand * 0.1;
      const z = (pl.z - (heights[pl.col] - gap) / 2) * s + Math.cos(i * 37.1) * 0.05;

      const pivot = new THREE.Group();
      pivot.rotation.order = "YXZ";
      const inner = new THREE.Group();
      inner.position.z = -d / 2; // the pivot is the front edge
      pivot.add(inner);
      const glassM = mine(glassMaterial(it.tint));
      const glassMesh = new THREE.Mesh(mine(new RoundedBoxGeometry(w, PLATE_T, d, 3, 0.03)), glassM);
      glassMesh.renderOrder = 1;
      inner.add(glassMesh);
      const fading: THREE.Material[] = [glassM];
      if (tex) {
        const m = mine(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
        fading.push(m);
        const art = new THREE.Mesh(mine(new THREE.PlaneGeometry(pl.imgW * s, pl.imgD * s).rotateX(-Math.PI / 2)), m);
        art.position.set(0, PLATE_T / 2 + 0.003, -0.1 * s * cardSize);
        art.renderOrder = 2;
        inner.add(art);
      }
      const tagM = mine(
        new THREE.MeshBasicMaterial({
          map: mine(tagTexture(`${it.tag} · ${it.film} · ${it.year}`)),
          transparent: true,
          depthWrite: false,
        }),
      );
      fading.push(tagM);
      const tag = new THREE.Mesh(mine(new THREE.PlaneGeometry(w * 0.9, w * 0.9 * (64 / 1024)).rotateX(-Math.PI / 2)), tagM);
      tag.position.set(0, PLATE_T / 2 + 0.003, d / 2 - 0.14 * s * cardSize);
      tag.renderOrder = 2;
      inner.add(tag);
      const sheenMap = mine(Object.assign(sheenTex.clone(), { needsUpdate: true }));
      const sheen = new THREE.Mesh(
        mine(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
        mine(
          new THREE.MeshBasicMaterial({
            map: sheenMap,
            color: 0xffd98a,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      sheen.position.y = PLATE_T / 2 + 0.005;
      sheen.renderOrder = 3;
      inner.add(sheen);

      const shadow = new THREE.Mesh(
        shadowGeo,
        mine(
          new THREE.MeshBasicMaterial({
            color: 0x2a1a08,
            alphaMap: plateShadowTex,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        ),
      );
      shadow.renderOrder = 0;
      const ripple = new THREE.Mesh(
        shadowGeo,
        mine(
          new THREE.MeshBasicMaterial({
            color: 0xffe2a8,
            alphaMap: rippleTex,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      return {
        pivot,
        inner,
        glass: glassMesh,
        fading,
        sheen,
        shadow,
        ripple,
        own,
        x,
        z,
        rot: rand * 0.07,
        w,
        d,
        stand: 0,
        standV: 0,
        sway: new THREE.Vector2(),
      };
    });
  }

  function setItems(items: ProofItem[], cardSize: number) {
    const version = ++itemsVersion;
    Promise.all(items.map((it) => loadTexture(it.src))).then((texs) => {
      if (disposed || version !== itemsVersion) return;
      const next = buildPlates(items, cardSize, texs);
      // Swap in one go, after everything is ready: no empty frame, no flicker.
      for (const pl of plates) {
        scene.remove(pl.pivot, pl.shadow, pl.ripple);
        for (const o of pl.own) o.dispose();
      }
      plates = next;
      for (const pl of plates) scene.add(pl.pivot, pl.shadow, pl.ripple);
      dirty = true;
    });
  }

  function setGlass(next: GlassLook) {
    glass = next;
    for (const pl of plates) styleGlass(pl.glass.material);
    dirty = true;
  }

  // --- Per-frame -----------------------------------------------------------------------------
  let width = 1;
  let height = 1;
  let disposed = false;
  let dirty = true;
  let lastP = -1;
  const target = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  let pointerIn = false;
  let hovered = -1;
  let hoverLostAt = 0;
  let camYaw = 0;
  let interactive = false;

  function pick(now: number) {
    if (!interactive || !pointerIn || plates.length === 0) {
      hovered = -1;
      return;
    }
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(
      plates.map((pl) => pl.glass),
      false,
    );
    const hit = hits.length ? plates.findIndex((pl) => pl.glass === hits[0].object) : -1;
    if (hit >= 0) {
      hovered = hit;
      hoverLostAt = 0;
    } else if (hovered >= 0) {
      // A short grace period: the card moves as it stands up, so the cursor can slip off its edge for a moment.
      if (!hoverLostAt) hoverLostAt = now;
      if (now - hoverLostAt > 160) hovered = -1;
    }
  }

  function update(p: number, dt: number) {
    const now = performance.now();
    pick(now);
    let busy = false;

    const top = T;
    const power = 1;

    // Camera first (the cards turn to face it when they stand up).
    const insp = smooth(range(p, STAGES.inspect));
    const push = smooth(range(p, [0, STAGES.drops[1]]));
    const aspect = width / height;
    const fit = (9.6 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * Math.max(1, 1.5 / aspect);
    const radius = fit * lerp(lerp(1.18, 1.05, push), mobile ? 0.66 : 0.74, insp);
    const elev = THREE.MathUtils.degToRad(lerp(55, mobile ? 34 : 24, insp));
    camYaw = THREE.MathUtils.degToRad(lerp(35, mobile ? 20 : 14, insp));
    target.set(lerp(0, mobile ? 0 : 0.6, insp), lerp(0.2, 0.35, insp), lerp(0, mobile ? 0 : 0.4, insp));
    camera.position.set(
      target.x + radius * Math.cos(elev) * Math.sin(camYaw),
      target.y + radius * Math.sin(elev),
      target.z + radius * Math.cos(elev) * Math.cos(camYaw),
    );
    camera.lookAt(target);
    camera.setViewOffset(width, height, mobile ? 0 : -width * 0.3 * insp, mobile ? -height * 0.22 * insp : 0, width, height);
    // Standing up, a card faces the camera: tilted back by the camera's elevation.
    const standAngle = Math.PI / 2 - elev;

    // Proofs: staggered drops with weight — a fall, a small bounce and a settling wobble.
    const n = plates.length;
    const [d0, d1] = STAGES.drops;
    const span = (d1 - d0) * 0.7;
    interactive = p > STAGES.inspect[1] - 0.04;
    const k = Math.min(dt, 1 / 30);
    plates.forEach((pl, i) => {
      const start = d0 + (n > 1 ? (i / (n - 1)) * span : 0);
      const t = clamp01((p - start) / ((d1 - d0) * 0.3));
      const rest = top + 0.003;
      let y: number;
      let tiltX = 0;
      let tiltZ = 0;
      let u = 0;
      const sign = i % 2 ? 1 : -1;
      if (t < 0.55) {
        const s = t / 0.55;
        y = rest + 5 * (1 - s * s);
        tiltX = 0.45 * sign * (1 - s);
        tiltZ = -0.3 * sign * (1 - s);
      } else {
        u = (t - 0.55) / 0.45;
        y = rest + 0.2 * Math.exp(-4 * u) * Math.abs(Math.sin(2.5 * Math.PI * u)) * (1 - u);
        tiltX = 0.05 * sign * Math.exp(-5 * u) * Math.sin(6 * Math.PI * u) * (1 - u);
      }
      const shown = t > 0;
      pl.pivot.visible = shown;
      const fade = smooth(clamp01(t / 0.12));
      for (const m of pl.fading) m.opacity = ((m.userData.base as number | undefined) ?? 1) * fade;

      // Hover: a springy stand-up onto the front edge, with a slight overshoot so it feels weighty…
      const goal = interactive && hovered === i ? 1 : 0;
      const acc = 170 * (goal - pl.stand) - 17 * pl.standV;
      pl.standV += acc * k;
      pl.stand += pl.standV * k;
      if (Math.abs(goal - pl.stand) < 0.0005 && Math.abs(pl.standV) < 0.0005) {
        pl.stand = goal;
        pl.standV = 0;
      } else busy = true;
      // …and while standing, it sways gently after the cursor.
      let swayX = 0;
      let swayY = 0;
      if (pl.stand > 0.01 && pointerIn) {
        tmp.set(pl.x, top + pl.d * 0.4, pl.z).project(camera);
        swayY = THREE.MathUtils.clamp(ndc.x - tmp.x, -0.5, 0.5) * 0.5;
        swayX = THREE.MathUtils.clamp(ndc.y - tmp.y, -0.5, 0.5) * -0.3;
      }
      const sk = 1 - Math.exp(-dt * 8);
      const sx = pl.sway.x + (swayX * pl.stand - pl.sway.x) * sk;
      const sy = pl.sway.y + (swayY * pl.stand - pl.sway.y) * sk;
      if (Math.abs(sx - pl.sway.x) + Math.abs(sy - pl.sway.y) > 1e-5) busy = true;
      pl.sway.set(sx, sy);
      const st = Math.max(0, pl.stand);

      const frontX = pl.x + Math.sin(pl.rot) * (pl.d / 2);
      const frontZ = pl.z + Math.cos(pl.rot) * (pl.d / 2);
      pl.pivot.position.set(frontX, y + PLATE_T / 2 + st * 0.02, frontZ);
      pl.pivot.rotation.set(tiltX + pl.stand * standAngle + pl.sway.x, lerp(pl.rot, camYaw, st) + pl.sway.y, tiltZ);
      // Standing up, the card has the bright lightbox right behind it: its glass turns (nearly) solid in its own tint,
      // so the light can't wash through it and the title stays readable. The sweep is a soft gold glint, not white.
      const glassBase = (pl.glass.material.userData.base as number | undefined) ?? 1;
      pl.glass.material.opacity = lerp(glassBase, Math.max(glassBase, 0.96), st) * fade;
      pl.sheen.material.opacity = st * 0.22;
      pl.sheen.material.map!.offset.x = -(ndc.x * 0.6 + pl.sway.y);

      // Shadow: a soft pool when lying flat, a tight strip at its foot when standing.
      const lift = Math.max(0, y - rest);
      pl.shadow.visible = shown;
      pl.shadow.position.set(
        lerp(pl.x, frontX, st * 0.85) + lift * 0.12,
        top + 0.004,
        lerp(pl.z, frontZ - 0.08, st * 0.85) + lift * 0.1,
      );
      pl.shadow.rotation.y = pl.rot;
      pl.shadow.scale.set(pl.w * (1.15 + lift * 0.25), 1, lerp(pl.d * (1.25 + lift * 0.25), 0.35, st));
      pl.shadow.material.opacity = fade * Math.max(0, 1 - lift / 4) * power * lerp(0.5, 0.7, st);

      const rippling = u > 0 && u < 1;
      pl.ripple.visible = rippling;
      if (rippling) {
        const r = pl.w * (0.6 + u * 1.6);
        pl.ripple.position.set(pl.x, top + 0.006, pl.z);
        pl.ripple.scale.set(r, 1, r);
        pl.ripple.material.opacity = (1 - u) * (1 - u) * 0.5;
      }
    });

    // Only draw when something changed: scrolling, a spring still settling, or new cards / glass.
    if (busy || dirty || p !== lastP) renderer.render(scene, camera);
    dirty = false;
    lastP = p;
    return busy;
  }

  function resize(w: number, h: number) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  function pointer(x: number | null, y: number) {
    pointerIn = x !== null;
    if (x !== null) ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    dirty = true;
  }

  function dispose() {
    disposed = true;
    for (const pl of plates) for (const o of pl.own) o.dispose();
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  setItems(opts.items, opts.cardSize);
  return { update, resize, pointer, hovered: () => hovered, setItems, setGlass, dispose };
}
