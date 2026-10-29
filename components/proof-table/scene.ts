import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ProofItem } from "@/content/proof-table";
import { DEFAULT_GLASS } from "@/lib/content/types";
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
const T = 0.1; // slab thickness: a slim pane of glass
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
  const S = 1536;
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
        star(c(jx), c(jy), ((bright ? 5.5 : 3) + rand() * 2.5) * (S / 2048), rand() * Math.PI);
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

/** The guides printed on the glass: faint white column lines, a safe area and a title-safe rectangle. */
function panelTexture(pw: number, pd: number) {
  const S = 1024;
  const h = Math.round((S * pd) / pw);
  return canvasTexture(S, h, (ctx) => {
    ctx.clearRect(0, 0, S, h);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 12; i++) {
      const x = (S * i) / 12;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(S * 0.05, h * 0.05, S * 0.9, h * 0.9);
    ctx.setLineDash([]);
    ctx.strokeRect(S * 0.1, h * 0.1, S * 0.8, h * 0.8);
  });
}

/** Points tracing a rounded rectangle lying flat at height y (for the glass rims). */
function roundedRectPoints(w: number, d: number, r: number, y: number, seg = 6) {
  const pts: THREE.Vector3[] = [];
  const hw = w / 2 - r;
  const hd = d / 2 - r;
  const corners: [number, number, number][] = [
    [hw, hd, 0],
    [-hw, hd, Math.PI / 2],
    [-hw, -hd, Math.PI],
    [hw, -hd, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  }
  return pts;
}

/** Soft diagonal streaks of light, like a reflection sliding across a pane of glass. */
function glassSheenTexture() {
  const W2 = 1024;
  const H2 = 512;
  return canvasTexture(
    W2,
    H2,
    (ctx) => {
      ctx.clearRect(0, 0, W2, H2);
      ctx.transform(1, 0, 0.6, 1, -0.6 * (H2 / 2), 0); // slants the bands
      const g = ctx.createLinearGradient(0, 0, W2, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.18, "rgba(255,255,255,0)");
      g.addColorStop(0.3, "rgba(255,255,255,0.55)");
      g.addColorStop(0.4, "rgba(255,255,255,0)");
      g.addColorStop(0.56, "rgba(255,255,255,0)");
      g.addColorStop(0.62, "rgba(255,255,255,0.32)");
      g.addColorStop(0.66, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-400, 0, W2 + 800, H2);
    },
    false,
  );
}

/** A soft rounded rectangle (alpha): `inner` is the solid part (0..1 of the texture), `feather` how far it fades. */
function softRect(inner: number, feather: number) {
  const S = 256; // a soft blur: smooth at this size, and quick to build
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

export interface SlabLook {
  color: string;
  /** 0..1: how see-through the slab is (1 = solid). */
  opacity: number;
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
  setSlab: (slab: SlabLook) => void;
  /** Uploads textures and compiles shaders in idle moments, before the section is on screen. */
  warmUp: () => Promise<void>;
  dispose: () => void;
}

/**
 * The colour glow on a card: the card holds a Gemini-style mesh of the site's glass colours (each card arranges them in
 * its own places), seen only where the cursor is on it, as a soft light. Added to the card as light.
 */
const AURA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const AURA_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColors[6];
  uniform vec2 uPos[6];
  uniform vec2 uPoint;
  uniform float uOn;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uSeed;
  void main() {
    vec3 col = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < 6; i++) {
      vec2 d = vUv - uPos[i];
      d.x *= uAspect;
      float w = 1.0 / (0.015 + dot(d, d));
      w *= w;
      col += uColors[i] * w;
      total += w;
    }
    col /= total;
    vec2 q = vUv - uPoint;
    q.x *= uAspect;
    float r = length(q * vec2(0.85, 1.15));
    float a = smoothstep(uRadius, 0.0, r);
    a = a * a * uOn;
    gl_FragColor = vec4(col, a * 0.95);
    #include <colorspace_fragment>
  }
`;

/** A soft pool of light on the slab: it takes the colour of the glow on the card that is being looked at, as a reflection. */
const POOL_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOn;
  void main() {
    float r = length((vUv - 0.5) * 2.0);
    float a = smoothstep(1.0, 0.0, r);
    a = a * a * uOn;
    gl_FragColor = vec4(uColor, a * 0.85);
    #include <colorspace_fragment>
  }
`;

/** The six glass colours (the site's, from the portal), shuffled into a new order. */
function auraColours(): THREE.Color[] {
  const root = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const list = DEFAULT_GLASS.colors.map((d, i) => {
    const v = root?.getPropertyValue(`--glass-${i + 1}`).trim();
    return new THREE.Color(v && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  });
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Six places on a card, one in each tile of a 3 × 2 grid, nudged off centre. */
function auraPlaces(): THREE.Vector2[] {
  return Array.from({ length: 6 }, (_, t) => new THREE.Vector2(((t % 3) + 0.5) / 3 + (Math.random() - 0.5) * 0.2, (Math.floor(t / 3) + 0.5) / 2 + (Math.random() - 0.5) * 0.25));
}

interface Plate {
  /** The colour glow under the cursor, its target spot (on the card, 0–1) and how lit it is. */
  aura: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  auraTarget: THREE.Vector2;
  auraOn: number;
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
    slab: SlabLook;
    mobile: boolean;
    stage: string;
  },
): ProofScene {
  const { mobile } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  // Checking each shader right after compiling makes the browser wait for it; in production let them compile in the
  // background instead (they're checked during development).
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
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
  slabShadow.material.opacity = 0.22;
  scene.add(slabShadow);

  // The slab's tint also colours its polished edge and the frosted border, so the glass reads as one coloured pane.
  const edgeTint = (hex: string) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.4);

  // --- Glass slab: a slim clear pane, tinted from the portal, with a bright polished edge -------------------
  const slabGeo = track(new RoundedBoxGeometry(W, T, D, 4, 0.045));
  const slab = new THREE.Mesh(
    slabGeo,
    track(
      new THREE.MeshPhysicalMaterial({
        color: opts.slab.color,
        transparent: true,
        opacity: opts.slab.opacity,
        roughness: 0.03,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        ior: 1.52,
        specularIntensity: 1,
        envMapIntensity: 2.2,
        iridescence: 0.3,
        iridescenceIOR: 1.35,
        depthWrite: false,
      }),
    ),
  );
  slab.position.y = T / 2;
  slab.renderOrder = -1;
  scene.add(slab);
  // Polished rims show the pane's thickness: a bright line along the top edge, a softer one along the bottom, and
  // short lines down the corners.
  const rimTop = track(new THREE.LineBasicMaterial({ color: edgeTint(opts.slab.color), transparent: true, opacity: 0.98, depthWrite: false }));
  const rimLow = track(new THREE.LineBasicMaterial({ color: edgeTint(opts.slab.color), transparent: true, opacity: 0.5, depthWrite: false }));
  const edge = new THREE.Group();
  const loop = (y: number, m: THREE.LineBasicMaterial) =>
    new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(roundedRectPoints(W - 0.02, D - 0.02, 0.06, y))), m);
  edge.add(loop(T, rimTop), loop(0.002, rimLow));
  const cornerPts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cornerPts.push(new THREE.Vector3(sx * (W / 2 - 0.05), 0.002, sz * (D / 2 - 0.05)), new THREE.Vector3(sx * (W / 2 - 0.05), T, sz * (D / 2 - 0.05)));
  edge.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(cornerPts)), rimLow));
  scene.add(edge);

  // A reflection that slides across the glass as the camera moves.
  const slabSheenTex = track(glassSheenTexture());
  slabSheenTex.wrapS = THREE.RepeatWrapping;
  slabSheenTex.repeat.x = 0.5;
  const slabSheenMat = track(
    new THREE.MeshBasicMaterial({
      map: slabSheenTex,
      color: edgeTint(opts.slab.color),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const slabSheen = new THREE.Mesh(track(new THREE.PlaneGeometry(W - 0.12, D - 0.12).rotateX(-Math.PI / 2)), slabSheenMat);
  slabSheen.position.y = T + 0.005;
  slabSheen.renderOrder = 0;
  scene.add(slabSheen);

  const pw = W - INSET * 2;
  const pd = D - INSET * 2;
  // A frosted band around the printed area, like a sandblasted border on the pane.
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
    track(new THREE.ShapeGeometry(frameShape).rotateX(-Math.PI / 2)),
    track(new THREE.MeshBasicMaterial({ color: opts.slab.color, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false })),
  );
  frame.position.y = T + 0.002;
  scene.add(frame);

  // The printed guides, on the glass.
  const panelMat = track(
    new THREE.MeshBasicMaterial({ map: track(panelTexture(pw, pd)), toneMapped: false, transparent: true, depthWrite: false }),
  );
  const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2)), panelMat);
  panel.position.y = T + 0.003;
  scene.add(panel);

  // The glow of the cards reflected on the glass slab: one soft pool under the card that is lit, in that card's colour.
  const poolMat = track(
    new THREE.ShaderMaterial({
      vertexShader: AURA_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uOn: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), poolMat);
  pool.renderOrder = 1;
  pool.visible = false;
  scene.add(pool);
  let poolOn = 0;
  const poolAt = new THREE.Vector3();

  // --- Proofs ----------------------------------------------------------------------------------
  const shadowGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const plateShadowTex = track(softRect(0.8, 0.1));
  const rippleTex = track(rippleTexture());
  const sheenTex = track(sheenTexture());
  // Titles are decoded off the main thread (ImageBitmap) and capped at 2048px wide: sharp on the cards at any size
  // they're shown, a quarter of the upload work of the full files, and no decode stall while scrolling.
  const textures = new Map<string, Promise<THREE.Texture | null>>();
  const loadTexture = (src: string) => {
    if (!textures.has(src))
      textures.set(
        src,
        fetch(src)
          .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
          .then(async (blob) => {
            const probe = await createImageBitmap(blob);
            const width = Math.min(2048, probe.width);
            probe.close();
            return createImageBitmap(blob, {
              imageOrientation: "flipY",
              premultiplyAlpha: "none",
              resizeWidth: width,
              resizeQuality: "high",
            });
          })
          .then((bitmap) => {
            const tex = new THREE.Texture(bitmap);
            tex.flipY = false; // already flipped while decoding
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = maxAniso;
            tex.needsUpdate = true;
            return track(tex);
          })
          .catch(() => null),
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
    m.userData.clearcoat = glass.reflection;
    // The studio environment has very bright light panels: kept low, so the glass shines without mirroring them white.
    m.userData.env = 0.02 + glass.reflection * 0.4;
    m.userData.roughness = m.roughness;
    // The key light's mirror highlight: what turned a card facing the camera white. Follows the Reflection setting.
    m.userData.specular = 0.15 + glass.reflection * 0.85;
    m.specularIntensity = m.userData.specular;
    m.clearcoat = m.userData.clearcoat;
    m.envMapIntensity = m.userData.env;
    const transmission = glass.frost > 0.01 ? 1 : 0;
    if (m.transmission !== transmission) {
      m.transmission = transmission; // frosted: the lightbox shows through, blurred by the roughness
      m.needsUpdate = true;
    }
  }

  let plates: Plate[] = [];
  let itemsVersion = 0;

  /** Cards are never squarer or longer than this (width : depth). */
  const ASPECT_MIN = 1.3;
  const ASPECT_MAX = 2.5;

  function buildPlates(items: ProofItem[], cardSize: number, texs: (THREE.Texture | null)[]): Plate[] {
    // The cards use the whole glass: try every grid shape, stretch the cards to fill their cells (within sensible
    // proportions) and keep the grid with the most card area. Only a thin margin is left at the edges, like a frame.
    // More cards → a finer grid → smaller cards, and the glass stays full.
    const n = Math.max(1, items.length);
    const gap = 0.14;
    const availW = pw - 0.3;
    const availD = pd - 0.3;
    let best = { cols: 1, rows: n, w: 0, d: 0 };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      let w = (availW - gap * (c - 1)) / c;
      let d = (availD - gap * (r - 1)) / r;
      if (w / d > ASPECT_MAX) w = d * ASPECT_MAX;
      else if (w / d < ASPECT_MIN) d = w / ASPECT_MIN;
      if (w * d > best.w * best.d) best = { cols: c, rows: r, w, d };
    }
    const { cols, rows } = best;
    // "Card size" shrinks the cards inside their cells (100% = as big as the glass allows).
    const colW = best.w * cardSize;
    const d0 = best.d * cardSize;
    const pitchX = Math.min(best.w + gap, (availW + gap) / cols);
    const pitchZ = Math.min(best.d + gap, (availD + gap) / rows);
    const s = 1;
    const placed = items.map((_, i) => {
      const img = texs[i]?.image as { width: number; height: number } | undefined;
      const aspect = Math.min(4.5, Math.max(0.6, img ? img.width / img.height : 2.4));
      // Every card is the same size; the title is fitted inside it, whatever its shape.
      const boxW = colW * 0.86;
      const boxD = d0 * 0.72;
      const imgW = Math.min(boxW, boxD * aspect);
      const imgD = imgW / aspect;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = row === rows - 1 ? n - row * cols : cols; // a short last row sits in the middle
      return { px: (col - (inRow - 1) / 2) * pitchX, pz: (row - (rows - 1) / 2) * pitchZ, imgW, imgD };
    });
    return placed.map((pl, i) => {
      const it = items[i];
      const tex = texs[i];
      const own: { dispose: () => void }[] = [];
      const mine = <X extends { dispose: () => void }>(x: X) => (own.push(x), x);
      const rand = Math.sin(i * 91.7 + 3.1) * 0.5;
      const w = colW;
      const d = d0;
      const x = pl.px + rand * 0.02;
      const z = pl.pz + Math.cos(i * 37.1) * 0.01;

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
      const rimM = mine(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
      rimM.userData.base = 0.6;
      fading.push(rimM);
      const rim = new THREE.LineLoop(mine(new THREE.BufferGeometry().setFromPoints(roundedRectPoints(w, d, 0.03, PLATE_T / 2 + 0.002, 4))), rimM);
      rim.renderOrder = 2;
      inner.add(rim);
      if (tex) {
        const m = mine(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
        fading.push(m);
        const art = new THREE.Mesh(mine(new THREE.PlaneGeometry(pl.imgW * s, pl.imgD * s).rotateX(-Math.PI / 2)), m);
        art.position.set(0, PLATE_T / 2 + 0.003, -d * 0.06);
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
      tag.position.set(0, PLATE_T / 2 + 0.003, d / 2 - d * 0.11);
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
      const aura = new THREE.Mesh(
        mine(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
        mine(
          new THREE.ShaderMaterial({
            vertexShader: AURA_VERTEX,
            fragmentShader: AURA_FRAGMENT,
            uniforms: {
              uColors: { value: auraColours() },
              uPos: { value: auraPlaces() },
              uPoint: { value: new THREE.Vector2(0.5, 0.5) },
              uOn: { value: 0 },
              uAspect: { value: w / d },
              uRadius: { value: 0.55 },
              uSeed: { value: Math.random() * 100 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      aura.position.y = PLATE_T / 2 + 0.006;
      aura.renderOrder = 4;
      inner.add(aura);

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
        aura,
        auraTarget: new THREE.Vector2(0.5, 0.5),
        auraOn: 0,
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

  let itemsReady: Promise<void> = Promise.resolve();
  function setItems(items: ProofItem[], cardSize: number) {
    const version = ++itemsVersion;
    itemsReady = Promise.all(items.map((it) => loadTexture(it.src))).then((texs) => {
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

  /**
   * Gets the GPU ready before the section is on screen: uploads every texture one per idle moment, then compiles the
   * shaders (in parallel where the browser supports it). So nothing stalls when you scroll into the table.
   */
  async function warmUp() {
    await itemsReady;
    const idle = () =>
      new Promise<void>((done) =>
        "requestIdleCallback" in window ? requestIdleCallback(() => done(), { timeout: 250 }) : setTimeout(done, 20),
      );
    const texs = new Set<THREE.Texture>();
    scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        const mm = m as THREE.MeshBasicMaterial;
        if (mm.map) texs.add(mm.map);
        if (mm.alphaMap) texs.add(mm.alphaMap);
      }
    });
    for (const t of texs) {
      if (disposed) return;
      await idle();
      renderer.initTexture(t);
    }
    if (disposed) return;
    await idle();
    // Compile with every card visible (they start hidden until they drop), then let update() set visibility again.
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((done) => setTimeout(done, 3000))]);
    } catch {
      // A failed warm-up only means the first frame compiles instead.
    }
    for (const o of hidden) o.visible = false;
    dirty = true;
  }

  function setSlab(next: SlabLook) {
    const m = slab.material as THREE.MeshPhysicalMaterial;
    m.color.set(next.color);
    m.opacity = next.opacity;
    rimTop.color.copy(edgeTint(next.color));
    rimLow.color.copy(edgeTint(next.color));
    slabSheenMat.color.copy(edgeTint(next.color));
    (frame.material as THREE.MeshBasicMaterial).color.set(next.color);
    dirty = true;
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
      const pl = plates[hit];
      // A card arranges its colours afresh each time the cursor comes to it.
      if (hovered !== hit) {
        pl.aura.material.uniforms.uColors.value = auraColours();
        pl.aura.material.uniforms.uPos.value = auraPlaces();
      }
      const local = pl.inner.worldToLocal(hits[0].point.clone());
      pl.auraTarget.set(local.x / pl.w + 0.5, 0.5 - local.z / pl.d);
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
    slabSheenTex.offset.x = 0.2 + (camYaw - 0.3) * 0.5 + push * 0.12 + insp * 0.1;
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
      const gm = pl.glass.material;
      gm.opacity = lerp(glassBase, Math.max(glassBase, 0.6), st) * fade;
      // Facing the camera, the glass would mirror the bright room: its reflections fade out as it stands.
      gm.clearcoat = (gm.userData.clearcoat as number) * (1 - 0.97 * st);
      gm.specularIntensity = (gm.userData.specular as number) * (1 - st);
      gm.envMapIntensity = (gm.userData.env as number) * (1 - 0.95 * st);
      gm.roughness = (gm.userData.roughness as number) + st * 0.3; // any reflection left is soft, never a hot spot
      pl.sheen.material.opacity = st * 0.14;
      // The colour glow: it fades in where the cursor is on the card, follows it smoothly, and fades out when it leaves.
      const auraGoal = interactive && hovered === i ? 1 : 0;
      const ae = 1 - Math.exp(-dt * 7);
      pl.auraOn += (auraGoal - pl.auraOn) * ae;
      if (Math.abs(auraGoal - pl.auraOn) < 0.002) pl.auraOn = auraGoal;
      else busy = true;
      const au = pl.aura.material.uniforms;
      const pt = au.uPoint.value as THREE.Vector2;
      if (pt.distanceTo(pl.auraTarget) > 0.001) {
        pt.lerp(pl.auraTarget, 1 - Math.exp(-dt * 10));
        busy = true;
      }
      au.uOn.value = pl.auraOn * fade;
      pl.aura.visible = false; // no colour glow on the cards themselves (the slab keeps its soft reflection)
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

    // The slab's reflection of the glow: under the card being looked at, in the colour of the glow on it.
    let lit = -1;
    plates.forEach((pl, i) => {
      if (pl.auraOn > 0.002 && (lit < 0 || pl.auraOn > plates[lit].auraOn)) lit = i;
    });
    if (lit >= 0) {
      const pl = plates[lit];
      const cols = pl.aura.material.uniforms.uColors.value as THREE.Color[];
      const pos = pl.aura.material.uniforms.uPos.value as THREE.Vector2[];
      let best = 0;
      let bestD = Infinity;
      pos.forEach((q, j) => {
        const dx = (q.x - pl.auraTarget.x) * pl.w;
        const dz = (q.y - pl.auraTarget.y) * pl.d;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      (poolMat.uniforms.uColor.value as THREE.Color).lerp(cols[best], 1 - Math.exp(-dt * 6));
      poolAt.set(pl.x, top + 0.012, pl.z);
      pool.position.copy(poolAt);
      pool.scale.set(pl.w * 2.1, 1, pl.d * 2.4);
    }
    const poolGoal = lit >= 0 ? plates[lit].auraOn : 0;
    poolOn += (poolGoal - poolOn) * (1 - Math.exp(-dt * 8));
    if (Math.abs(poolGoal - poolOn) < 0.002) poolOn = poolGoal;
    else busy = true;
    poolMat.uniforms.uOn.value = poolOn;
    pool.visible = poolOn > 0.002;

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
  return { update, resize, pointer, hovered: () => hovered, setItems, setGlass, setSlab, warmUp, dispose };
}
