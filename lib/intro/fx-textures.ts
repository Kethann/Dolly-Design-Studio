import * as THREE from "three";

/** Soft round glow, used for light bursts. */
export function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,236,190,0.8)");
  g.addColorStop(0.45, "rgba(255,190,90,0.22)");
  g.addColorStop(1, "rgba(255,170,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/** A thin horizontal anamorphic streak — the classic lens glint on a highlight. */
export function createStreakTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const horizontal = ctx.createLinearGradient(0, 0, 512, 0);
  horizontal.addColorStop(0, "rgba(255,220,160,0)");
  horizontal.addColorStop(0.5, "rgba(255,255,255,1)");
  horizontal.addColorStop(1, "rgba(255,220,160,0)");
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, 512, 64);
  ctx.globalCompositeOperation = "destination-in";
  const vertical = ctx.createLinearGradient(0, 0, 0, 64);
  vertical.addColorStop(0, "rgba(0,0,0,0)");
  vertical.addColorStop(0.5, "rgba(0,0,0,1)");
  vertical.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 512, 64);
  return new THREE.CanvasTexture(canvas);
}
