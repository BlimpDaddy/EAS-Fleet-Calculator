/**
 * Convex hull + hull volume.
 *
 * Uses quickhull3d, the same algorithm family as Qhull (which scipy.spatial.ConvexHull
 * wraps), so results should track the Python reference.
 *
 * The library is vendored in ../vendor/ rather than imported from node_modules: its
 * own dist/index.js uses extensionless relative imports that Node's ESM resolver
 * rejects, and a relative path means the browser and Web Worker can load it with no
 * bundler, no import map, and no npm install. If it's ever swapped out, only this
 * file and vendor/ should need to change.
 */

import quickhull from '../vendor/quickhull3d.js?v=1.14';

/**
 * @param {number[][]} vertices
 * @returns {{faces:number[][], indices:number[], points:number[][], volume:number}}
 */
export function convexHull(vertices) {
  if (vertices.length < 4) {
    throw new Error(`convexHull: need at least 4 points, got ${vertices.length}`);
  }
  const faces = quickhull(vertices);

  // Unique hull vertex indices — the equivalent of scipy's hull.vertices.
  const seen = new Set();
  for (const f of faces) for (const i of f) seen.add(i);
  const indices = [...seen].sort((a, b) => a - b);
  const points = indices.map((i) => vertices[i]);

  return { faces, indices, points, volume: hullVolume(vertices, faces) };
}

/**
 * Signed volume by the divergence theorem: sum of tetrahedra from the origin to each
 * face. Exact for a closed triangulated surface regardless of where the origin sits.
 * Absolute value guards against inverted winding.
 */
export function hullVolume(vertices, faces) {
  let six = 0;
  for (const f of faces) {
    // quickhull3d can emit non-triangular faces when triangulation is skipped;
    // fan-triangulate to be safe.
    for (let i = 1; i + 1 < f.length; i++) {
      const a = vertices[f[0]], b = vertices[f[i]], c = vertices[f[i + 1]];
      six +=
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return Math.abs(six) / 6;
}
