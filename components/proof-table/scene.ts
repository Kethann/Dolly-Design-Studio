import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ProofItem } from "@/content/proof-table";
import { STAGES } from "./stages";

/**
 * "The Proof Table": a crumpled foil test print is ironed flat, becomes a backlit proofing table, the title designs
 * drop onto it as glass-mounted proofs, and the camera leans in low while the table slides right.
 *
 * Everything is a pure function of the scroll progress `p` (0..1), so scrubbing back plays it back exactly.
 *   0.00–0.10  press floor (printer's marks)        0.30–0.50  slab extrudes, lightbox powers on
 *   0.10–0.30  crumpled foil sheet irons flat       0.50–0.75  proofs drop in, one by one
 *                                                    0.75–1.00  camera swings low, table slides right
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

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The floor: dark stage-tinted paper with a fine dot grid, printer's marks and press labels, fading out at the edges. */
function floorTexture(stage: THREE.Color, labels: { proof: string; bleed: string; reg: string }, count: number) {
  const S = 2048;
  const U = S / 24; // px per world unit (the floor plane is 24 units wide)
  return canvasTexture(S, S, (ctx) => {
    const c = (x: number) => S / 2 + x * U;
    const base = stage.clone().lerp(new THREE.Color("#0b0806"), 0.55);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, `#${base.getHexString()}`);
    g.addColorStop(0.62, `#${base.getHexString()}e0`);
    g.addColorStop(1, `#${base.getHexString()}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // Dot grid, fading radially.
    for (let y = -11.5; y <= 11.5; y += 0.25) {
      for (let x = -11.5; x <= 11.5; x += 0.25) {
        const a = Math.max(0, 1 - Math.hypot(x, y) / 10.5) * 0.32;
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(244,237,225,${a})`;
        ctx.beginPath();
        ctx.arc(c(x), c(y), 1.3, 0, Math.PI * 2);
        ctx.fill();
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
    // Registration targets in the middle of each side.
    const reg = (x: number, y: number) => {
      const r = 0.2 * U;
      ctx.beginPath();
      ctx.arc(c(x), c(y), r, 0, Math.PI * 2);
      ctx.moveTo(c(x) - r * 1.6, c(y));
      ctx.lineTo(c(x) + r * 1.6, c(y));
      ctx.moveTo(c(x), c(y) - r * 1.6);
      ctx.lineTo(c(x), c(y) + r * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c(x), c(y), r * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    };
    reg(0, -hd - 0.55);
    reg(0, hd + 0.55);
    reg(-hw - 0.55, 0);
    reg(hw + 0.55, 0);
    // CMYK + tint colour bar along the front edge.
    const bar = ["#00a3e0", "#e6007e", "#ffed00", "#1a1a1a", "#7fd1f0", "#f27fbe", "#fff67f", "#8c8c8c"];
    bar.forEach((col, i) => {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = col;
      ctx.fillRect(c(-hw + 1.2 + i * 0.32), c(hd + 0.3), 0.3 * U, 0.18 * U);
    });
    ctx.globalAlpha = 1;
    // Press labels.
    ctx.fillStyle = "rgba(244,237,225,0.5)";
    ctx.font = `500 ${0.15 * U}px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.fillText(labels.proof, c(-hw), c(-hd - 0.35));
    ctx.fillText(labels.bleed, c(hw - 1.2), c(-hd - 0.35));
    ctx.fillText(labels.reg, c(hw - 0.6), c(hd + 0.4));
    ctx.fillText(`${String(count).padStart(3, "0")} PROOFS`, c(-hw + 4), c(hd + 0.4));
  });
}

/** The foil sheet's printed face: a strip of film perforations down one edge. */
function sheetTexture() {
  return canvasTexture(1024, 720, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1024, 720);
    ctx.fillStyle = "#2a2318";
    for (let y = 18; y < 700; y += 34) {
      rr(ctx, 16, y, 26, 18, 4);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(42,35,24,0.25)";
    ctx.fillRect(56, 0, 2, 720);
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
          data.data[k] = data.data[k + 1] = data.data[k + 2] = 255;
          data.data[k + 3] = Math.round(a * a * 255);
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
      const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.75, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
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

/** Crumpled-paper displacement in the vertex shader, ironed flat by a sweep from left to right. */
const CRUMPLE_GLSL = /* glsl */ `
  uniform float uIron;
  uniform vec2 uSize;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  // Ridged noise gives the sharp creases of crumpled foil.
  float crumple(vec2 p) {
    float h = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      h += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0));
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return h;
  }
  vec3 displaced(vec3 pos) {
    float xn = pos.x / uSize.x + 0.5;
    float sweep = uIron * 1.5 - 0.25;
    float k = smoothstep(sweep - 0.18, sweep + 0.18, xn); // 1 = still crumpled
    float crest = 0.07 * exp(-pow((xn - sweep) / 0.05, 2.0)) * step(uIron, 0.999) * step(0.001, uIron);
    vec3 q = pos;
    q.xz *= 1.0 - 0.14 * k; // a crumpled sheet is smaller
    q.y += (crumple(pos.xz * 0.9) - 0.45) * 0.55 * k + crest;
    return q;
  }
`;

export interface ProofScene {
  update: (p: number, dt: number) => void;
  resize: (w: number, h: number) => void;
  /** Pointer in CSS pixels relative to the canvas, or null when it leaves. Returns the hovered item index. */
  pointer: (x: number | null, y: number) => number;
  dispose: () => void;
  ready: Promise<void>;
}

export function createProofScene(
  canvas: HTMLCanvasElement,
  opts: { items: ProofItem[]; labels: { proof: string; bleed: string; reg: string }; mobile: boolean; stage: string },
): ProofScene {
  const { items, mobile } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x1a0c08, 0.5));
  const key = new THREE.DirectionalLight(0xffeccc, 1.6);
  key.position.set(-5, 9, 4);
  scene.add(key);

  const disposables: { dispose: () => void }[] = [envRT];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const stageColor = new THREE.Color(opts.stage);

  // --- Floor -------------------------------------------------------------------------------------
  const floorTex = track(floorTexture(stageColor, opts.labels, items.length));
  floorTex.anisotropy = maxAniso;
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2)),
    track(new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, roughness: 0.95, depthWrite: false })),
  );
  floor.renderOrder = -2;
  scene.add(floor);

  // Soft contact shadow under the slab.
  const shadowTex = track(softRect(0.74, 0.12));
  const slabShadow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W * 1.22, D * 1.3).rotateX(-Math.PI / 2)),
    track(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, depthWrite: false, opacity: 0 })),
  );
  slabShadow.position.y = 0.004;
  slabShadow.renderOrder = -1;
  scene.add(slabShadow);

  // --- Crumpled foil sheet ---------------------------------------------------------------------
  const sheetUniforms = { uIron: { value: 0 }, uSize: { value: new THREE.Vector2(W - 0.2, D - 0.2) } };
  const sheetMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#e3c27a"),
      map: track(sheetTexture()),
      metalness: 1,
      roughness: 0.14,
      side: THREE.DoubleSide,
      transparent: true,
      envMapIntensity: 1.3,
    }),
  );
  sheetMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sheetUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${CRUMPLE_GLSL}`)
      .replace(
        "#include <beginnormal_vertex>",
        `float e = 0.03;
        vec3 c0 = displaced(position);
        vec3 tx = displaced(position + vec3(e, 0.0, 0.0)) - displaced(position - vec3(e, 0.0, 0.0));
        vec3 tz = displaced(position + vec3(0.0, 0.0, e)) - displaced(position - vec3(0.0, 0.0, e));
        vec3 objectNormal = normalize(cross(tz, tx));`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = c0;");
  };
  const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(W - 0.2, D - 0.2, mobile ? 120 : 200, mobile ? 84 : 140).rotateX(-Math.PI / 2)), sheetMat);
  scene.add(sheet);

  // --- Lightbox slab ---------------------------------------------------------------------------
  const slab = new THREE.Mesh(
    track(new RoundedBoxGeometry(W, T, D, 6, 0.16)),
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
  scene.add(slab);

  const pw = W - INSET * 2;
  const pd = D - INSET * 2;
  // A bevelled gold frame around the lit panel.
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
      new THREE.ExtrudeGeometry(frameShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.03, bevelSegments: 3 }).rotateX(
        -Math.PI / 2,
      ),
    ),
    track(new THREE.MeshPhysicalMaterial({ color: "#9c7434", metalness: 0.9, roughness: 0.32, envMapIntensity: 1.1 })),
  );
  scene.add(frame);

  const panelMat = track(
    new THREE.MeshBasicMaterial({ map: track(panelTexture(pw, pd)), toneMapped: false, transparent: true, opacity: 1, color: 0x000000 }),
  );
  const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2)), panelMat);
  scene.add(panel);

  // Light bleeding out around the panel's edge.
  const bleed = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W + 2.4, D + 2.4).rotateX(-Math.PI / 2)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0xfff1d0,
        alphaMap: track(softRect(0.7, 0.14)),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      }),
    ),
  );
  scene.add(bleed);

  // --- Proofs ----------------------------------------------------------------------------------
  interface Plate {
    group: THREE.Group;
    inner: THREE.Group;
    shadow: THREE.Mesh;
    ripple: THREE.Mesh;
    sheen: THREE.Mesh;
    glass: THREE.Mesh;
    mats: THREE.Material[];
    x: number;
    z: number;
    rot: number;
    w: number;
    d: number;
    tilt: THREE.Vector2;
    hover: number;
    local: THREE.Vector2;
  }
  const plates: Plate[] = [];
  const shadowGeo = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const plateShadowTex = track(softRect(0.8, 0.1));
  const rippleTex = track(rippleTexture());
  const sheenTex = track(sheenTexture());
  const smokyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#0c0806",
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.86,
      envMapIntensity: 0.7,
    }),
  );
  const clearMat = track(smokyMat.clone());
  clearMat.opacity = 0.92;

  const loader = new THREE.TextureLoader();
  const ready = Promise.all(
    items.map(
      (it) =>
        new Promise<THREE.Texture | null>((resolve) =>
          loader.load(
            it.src,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = maxAniso;
              resolve(track(tex));
            },
            undefined,
            () => resolve(null),
          ),
        ),
    ),
  ).then((textures) => {
    if (disposed) return;
    // A loose editorial grid: 2–3 columns, each item into the shortest column, then scaled to fit the panel.
    const cols = mobile || items.length <= 6 ? 2 : 3;
    const gap = 0.32;
    const colW = (pw - 0.5 - gap * (cols - 1)) / cols;
    const heights = new Array(cols).fill(0);
    const placed = items.map((it, i) => {
      const img = textures[i]?.image as { width: number; height: number } | undefined;
      const aspect = Math.min(4.5, Math.max(0.6, img ? img.width / img.height : 2.4));
      const w = colW;
      const imgW = w * 0.82;
      const imgD = imgW / aspect;
      const d = imgD + 0.42; // room for the corner tag
      const col = heights.indexOf(Math.min(...heights));
      const z = heights[col] + d / 2;
      heights[col] += d + gap;
      return { col, z, w, d, imgW, imgD };
    });
    const total = Math.max(...heights) - gap;
    const s = Math.min(1, (pd - 0.4) / total);
    placed.forEach((pl, i) => {
      const it = items[i];
      const tex = textures[i];
      const rand = Math.sin(i * 91.7) * 0.5;
      const w = pl.w * s;
      const d = pl.d * s;
      const x = (-(cols - 1) / 2 + pl.col) * (colW + gap) * s + rand * 0.12;
      const z = (pl.z - (heights[pl.col] - gap) / 2) * s + Math.cos(i * 37.1) * 0.06;

      const group = new THREE.Group();
      const inner = new THREE.Group();
      group.add(inner);
      const glassMat = track((it.type === "title-png" ? smokyMat : clearMat).clone());
      glassMat.userData.base = glassMat.opacity;
      const glass = new THREE.Mesh(track(new RoundedBoxGeometry(w, PLATE_T, d, 3, 0.03)), glassMat);
      glass.renderOrder = 1;
      inner.add(glass);
      const mats: THREE.Material[] = [];
      if (tex) {
        const m = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
        mats.push(m);
        const art = new THREE.Mesh(track(new THREE.PlaneGeometry(pl.imgW * s, pl.imgD * s).rotateX(-Math.PI / 2)), m);
        art.position.set(0, PLATE_T / 2 + 0.002, -0.1 * s);
        art.renderOrder = 2;
        inner.add(art);
      }
      const tagM = track(
        new THREE.MeshBasicMaterial({ map: track(tagTexture(`${it.tag} · ${it.film} · ${it.year}`)), transparent: true, depthWrite: false }),
      );
      mats.push(tagM);
      const tag = new THREE.Mesh(track(new THREE.PlaneGeometry(w * 0.9, w * 0.9 * (64 / 1024)).rotateX(-Math.PI / 2)), tagM);
      tag.position.set(0, PLATE_T / 2 + 0.002, d / 2 - 0.14 * s);
      tag.renderOrder = 2;
      inner.add(tag);
      const sheenM = track(
        new THREE.MeshBasicMaterial({ map: track(Object.assign(sheenTex.clone(), { needsUpdate: true })), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const sheen = new THREE.Mesh(track(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), sheenM);
      sheen.position.y = PLATE_T / 2 + 0.004;
      sheen.renderOrder = 3;
      inner.add(sheen);

      const shadow = new THREE.Mesh(
        shadowGeo,
        track(new THREE.MeshBasicMaterial({ color: 0x2a1a08, alphaMap: plateShadowTex, transparent: true, opacity: 0, depthWrite: false })),
      );
      const ripple = new THREE.Mesh(
        shadowGeo,
        track(
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
      scene.add(group, shadow, ripple);
      plates.push({
        group,
        inner,
        shadow,
        ripple,
        sheen,
        glass,
        mats: [glass.material as THREE.Material, ...mats],
        x,
        z,
        rot: rand * 0.07,
        w,
        d,
        tilt: new THREE.Vector2(),
        hover: 0,
        local: new THREE.Vector2(),
      });
    });
  });

  // --- Per-frame -----------------------------------------------------------------------------
  let width = 1;
  let height = 1;
  let disposed = false;
  let lastP = 0;
  const target = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = -1;
  let interactive = false;

  function update(p: number, dt: number) {
    lastP = p;
    // Sheet: appears, then is ironed flat (chrome → satin), then rises with the slab and fades as the light comes on.
    const sheetIn = smooth(range(p, STAGES.sheetIn));
    const iron = smooth(range(p, STAGES.iron));
    const grow = smooth(range(p, STAGES.slab));
    const power = smooth(range(p, STAGES.power));
    const slabH = lerp(0.02, T, grow);
    const top = slabH;
    sheetUniforms.uIron.value = iron;
    sheetMat.roughness = lerp(0.12, 0.42, iron);
    sheetMat.metalness = lerp(1, 0.82, iron);
    sheetMat.opacity = sheetIn * (1 - power);
    sheet.visible = sheetMat.opacity > 0.002;
    sheet.position.y = top + 0.01 + (1 - sheetIn) * 1.2 + (1 - iron) * 0.35;

    slab.visible = grow > 0.001;
    slab.scale.y = slabH / T;
    slab.position.y = slabH / 2;
    frame.visible = slab.visible;
    frame.position.y = top - 0.005;
    panel.visible = grow > 0.98;
    panel.position.y = top + 0.001;
    panelMat.color.setScalar(lerp(0.05, 0.86, power));
    bleed.position.y = top + 0.002;
    (bleed.material as THREE.MeshBasicMaterial).opacity = power * 0.22;
    (slabShadow.material as THREE.MeshBasicMaterial).opacity = grow * 0.55;

    // Proofs: staggered drops with weight — a fall, a small bounce and a settling wobble, then the shadow tightens.
    const n = plates.length;
    const [d0, d1] = STAGES.drops;
    const span = (d1 - d0) * 0.72;
    interactive = p > 0.965;
    plates.forEach((pl, i) => {
      const start = d0 + (n > 1 ? (i / (n - 1)) * span : 0);
      const t = clamp01((p - start) / ((d1 - d0) * 0.28));
      const rest = top + 0.003 + PLATE_T / 2;
      let y: number;
      let tiltX = 0;
      let tiltZ = 0;
      let u = 0;
      const sign = i % 2 ? 1 : -1;
      if (t < 0.55) {
        const s = t / 0.55;
        y = rest + 6 * (1 - s * s);
        tiltX = 0.5 * sign * (1 - s);
        tiltZ = -0.35 * sign * (1 - s);
      } else {
        u = (t - 0.55) / 0.45;
        y = rest + 0.22 * Math.exp(-4 * u) * Math.abs(Math.sin(2.5 * Math.PI * u)) * (1 - u);
        tiltX = 0.06 * sign * Math.exp(-5 * u) * Math.sin(6 * Math.PI * u) * (1 - u);
      }
      const shown = t > 0;
      pl.group.visible = shown;
      const fade = smooth(clamp01(t / 0.12));
      for (const m of pl.mats) m.opacity = ((m.userData.base as number | undefined) ?? 1) * fade;

      // Hover (only at the end): the plate lifts and tilts toward the cursor, with a specular sweep.
      const k = 1 - Math.exp(-dt * 10);
      pl.hover += ((interactive && hovered === i ? 1 : 0) - pl.hover) * k;
      pl.tilt.x += (-pl.local.y * 0.28 * (hovered === i ? 1 : 0) - pl.tilt.x) * k;
      pl.tilt.y += (pl.local.x * 0.28 * (hovered === i ? 1 : 0) - pl.tilt.y) * k;
      pl.group.position.set(pl.x, y + pl.hover * 0.12, pl.z);
      pl.group.rotation.set(tiltX + pl.tilt.x, pl.rot, tiltZ + pl.tilt.y);
      const sm = pl.sheen.material as THREE.MeshBasicMaterial;
      sm.opacity = pl.hover * 0.55;
      sm.map!.offset.x = -pl.local.x * 0.6;

      const lift = Math.max(0, y - rest) + pl.hover * 0.12;
      pl.shadow.visible = shown;
      pl.shadow.position.set(pl.x + lift * 0.12, top + 0.004, pl.z + lift * 0.1);
      pl.shadow.rotation.y = pl.rot;
      pl.shadow.scale.set(pl.w * (1.15 + lift * 0.25), 1, pl.d * (1.25 + lift * 0.25));
      (pl.shadow.material as THREE.MeshBasicMaterial).opacity = fade * 0.5 * Math.max(0, 1 - lift / 4) * power;

      const rippling = u > 0 && u < 1;
      pl.ripple.visible = rippling;
      if (rippling) {
        const r = pl.w * (0.6 + u * 1.6);
        pl.ripple.position.set(pl.x, top + 0.006, pl.z);
        pl.ripple.scale.set(r, 1, r);
        (pl.ripple.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (1 - u) * 0.5;
      }
    });

    // Camera: overhead three-quarter view, then it swings low and close while the table slides right.
    const insp = smooth(range(p, STAGES.inspect));
    const push = smooth(range(p, [0, 0.3]));
    const aspect = width / height;
    const fit = 9.6 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * Math.max(1, 1.5 / aspect);
    const radius = fit * lerp(lerp(1.22, 1.05, push), mobile ? 0.66 : 0.74, insp);
    const elev = THREE.MathUtils.degToRad(lerp(55, mobile ? 34 : 24, insp));
    const yaw = THREE.MathUtils.degToRad(lerp(35, mobile ? 20 : 14, insp));
    target.set(lerp(0, mobile ? 0 : 0.6, insp), lerp(0.2, 0.35, insp), lerp(0, mobile ? 0 : 0.4, insp));
    camera.position.set(
      target.x + radius * Math.cos(elev) * Math.sin(yaw),
      target.y + radius * Math.sin(elev),
      target.z + radius * Math.cos(elev) * Math.cos(yaw),
    );
    camera.lookAt(target);
    // Slide the composition: right on desktop, down on phones (the headline sits above).
    camera.setViewOffset(width, height, mobile ? 0 : -width * 0.3 * insp, mobile ? -height * 0.22 * insp : 0, width, height);

    renderer.render(scene, camera);
  }

  function resize(w: number, h: number) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    update(lastP, 0);
  }

  function pointer(x: number | null, y: number) {
    if (x === null || !interactive) {
      hovered = -1;
      return -1;
    }
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(
      plates.map((pl) => pl.glass),
      false,
    );
    hovered = hits.length ? plates.findIndex((pl) => pl.glass === hits[0].object) : -1;
    if (hovered >= 0) {
      const pl = plates[hovered];
      const local = pl.group.worldToLocal(hits[0].point.clone());
      pl.local.set(THREE.MathUtils.clamp(local.x / (pl.w / 2), -1, 1), THREE.MathUtils.clamp(local.z / (pl.d / 2), -1, 1));
    }
    return hovered;
  }

  function dispose() {
    disposed = true;
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { update, resize, pointer, dispose, ready: ready.then(() => undefined) };
}
