import * as THREE from "three";

/** A four-point glint: a hot core with long thin rays — light catching one point of a star, not a halo around it. */
export function createSparkleTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.32);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.35, "rgba(255,250,235,0.55)");
  core.addColorStop(1, "rgba(255,240,210,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";
  for (const [w, h] of [
    [size, 6],
    [6, size],
  ]) {
    const ray = ctx.createRadialGradient(c, c, 0, c, c, c);
    ray.addColorStop(0, "rgba(255,255,255,0.95)");
    ray.addColorStop(0.5, "rgba(255,245,225,0.25)");
    ray.addColorStop(1, "rgba(255,240,210,0)");
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.ellipse(c, c, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}
