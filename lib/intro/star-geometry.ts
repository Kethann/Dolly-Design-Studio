import * as THREE from "three";

/**
 * A gem-cut 3D star: a thin polished edge wall, a bevelled rim, a raised crown
 * and a centre apex, with every arm side split in two and folded slightly, so
 * each arm carries six facets per side that catch the light at different
 * angles. Mirrored on the back so it reads correctly while tumbling.
 *
 * Built non-indexed so every triangle keeps its own flat normal — that crisp
 * facet shading is what makes the metal glint as the stars rotate. The outer
 * silhouette is the exact star outline, so a flattened big star lines up with
 * the logo's own star pixel-for-pixel.
 */
export interface StarShape {
  points?: number;
  outerRadius?: number;
  /** Arm width: the inner radius as a fraction of the outer (smaller = thinner, sharper arms). */
  innerRadius?: number;
  /** Height of the apex over the middle of the star. */
  depth?: number;
  /** Half-thickness of the side wall, as a fraction of the depth (the default look is 0.16). */
  edge?: number;
  /** Where the bevelled rim ends and the crown begins, as a fraction of the outline (smaller = a wider bevel). */
  crown?: number;
  /**
   * How pronounced the facets are: 1 is the default gem cut, 0 a flat crown with no ridges and valleys (minimal),
   * above 1 sharper ridges.
   */
  relief?: number;
}

export function createFacetedStarGeometry({
  points = 5,
  outerRadius = 1,
  innerRadius = 0.42,
  depth = 0.42,
  edge: edgeShare = 0.16,
  crown = 0.52,
  relief = 1,
}: StarShape = {}) {
  const n = points * 2;
  const edge = depth * edgeShare; // half-thickness of the side wall
  // Crown heights as fractions of the climb from the rim to the apex: at relief 0 they're all level.
  const level = 0.5;
  const zTip = edge + (depth - edge) * (level + (0.62 - level) * relief); // over the arm tips (the ridges)…
  const zValley = edge + (depth - edge) * (level + (0.4 - level) * relief); // …and over the valleys between arms
  const zFold = edge + (depth - edge) * (level + (0.34 - level) * relief); // the fold halfway along each arm side

  const outline: THREE.Vector2[] = [];
  for (let k = 0; k < n; k++) {
    const angle = Math.PI / 2 + (k * Math.PI) / points;
    const r = k % 2 === 0 ? outerRadius : innerRadius;
    outline.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const v3 = (p: THREE.Vector2, z: number) => new THREE.Vector3(p.x, p.y, z);
  function tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, mirror: boolean) {
    const verts = mirror ? [a, c, b].map((v) => new THREE.Vector3(v.x, v.y, -v.z)) : [a, b, c];
    for (const v of verts) {
      positions.push(v.x, v.y, v.z);
      uvs.push(v.x / (2 * outerRadius) + 0.5, v.y / (2 * outerRadius) + 0.5);
    }
  }
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, mirror: boolean) => {
    tri(a, b, c, mirror);
    tri(a, c, d, mirror);
  };

  const apex = new THREE.Vector3(0, 0, depth);
  for (const mirror of [false, true]) {
    for (let k = 0; k < n; k++) {
      const a = outline[k];
      const b = outline[(k + 1) % n];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const zA = k % 2 === 0 ? zTip : zValley;
      const zB = k % 2 === 0 ? zValley : zTip;
      // Rim: outline (at the top of the edge wall) up to the crown ring, folded at the midpoint.
      const rimA = v3(a, edge);
      const rimM = v3(mid, edge);
      const rimB = v3(b, edge);
      const crA = v3(a.clone().multiplyScalar(crown), zA);
      const crM = v3(mid.clone().multiplyScalar(crown * 0.96), zFold);
      const crB = v3(b.clone().multiplyScalar(crown), zB);
      quad(rimA, rimM, crM, crA, mirror);
      quad(rimM, rimB, crB, crM, mirror);
      // Crown: up to the apex.
      tri(apex, crA, crM, mirror);
      tri(apex, crM, crB, mirror);
    }
  }

  // Side wall: a thin band around the outline, so the star has a real edge when seen side-on.
  for (let k = 0; k < n; k++) {
    const a = outline[k];
    const b = outline[(k + 1) % n];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    for (const [p, q] of [
      [a, mid],
      [mid, b],
    ]) {
      quad(v3(p, -edge), v3(q, -edge), v3(q, edge), v3(p, edge), false);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
