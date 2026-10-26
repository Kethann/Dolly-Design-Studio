import * as THREE from "three";

/**
 * A faceted 3D star, like a stamped metal star ornament: the centre is raised
 * and a ridge runs out to every point, so each arm has one facet catching the
 * light and one in shadow (the "bevel inside" look). Mirrored on the back so
 * it reads correctly while tumbling.
 *
 * Built non-indexed so every triangle gets its own flat normal — that crisp
 * facet shading is what makes the metal glint as the stars rotate.
 */
export function createFacetedStarGeometry({
  points = 5,
  outerRadius = 1,
  innerRadius = 0.42,
  depth = 0.34,
}: { points?: number; outerRadius?: number; innerRadius?: number; depth?: number } = {}) {
  const outline: THREE.Vector3[] = [];
  for (let k = 0; k < points * 2; k++) {
    const angle = Math.PI / 2 + (k * Math.PI) / points;
    const r = k % 2 === 0 ? outerRadius : innerRadius;
    outline.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
  }

  const front = new THREE.Vector3(0, 0, depth);
  const back = new THREE.Vector3(0, 0, -depth);
  const positions: number[] = [];
  const push = (...vs: THREE.Vector3[]) => vs.forEach((v) => positions.push(v.x, v.y, v.z));

  for (let k = 0; k < outline.length; k++) {
    const a = outline[k];
    const b = outline[(k + 1) % outline.length];
    push(front, a, b); // counter-clockwise from +z → faces the camera
    push(back, b, a);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
