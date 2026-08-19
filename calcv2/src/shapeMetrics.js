/**
 * Shape metrics: simple VS, VS_inf, VE.
 *
 * JavaScript port of CalcV2.vsve.py. Definitions follow "The Shape-Volume Scalar"
 * (T. Brandenburg, 2026).
 *
 *   VS  = product of a shape's three orthogonal aspect ratios (each >= 1).
 *         Scale-invariant. Sphere = 1; every other shape > 1.
 *   VE  = shape volume / minimum bounding sphere volume, as a percent.
 *
 * All three are computed from the convex hull, matching the paper's treatment of an
 * airship envelope as a compact convex body.
 */

import { convexHull } from './hull.js?v=1.14';
import { miniball } from './miniball.js?v=1.14';
import { makeRng, makeGaussian } from './rng.js?v=1.14';
import { toFlat } from './obj.js?v=1.14';

export const DEFAULT_SAMPLES = 69420; // the sample count used in the reference implementation

/**
 * Simple VS from the axis-aligned extents.
 *
 * Deliberately orientation-dependent: the paper defines simple VS against the shape's
 * *prime* dimension, so an uploaded .obj is assumed to already be oriented as the user
 * intends. That assumption is precisely what makes it "simple". VS_inf, by contrast,
 * is rotation-invariant by construction — a large gap between the two is a useful
 * signal that a model is oddly oriented.
 */
export function simpleVS(points) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
  }
  const [R1, R2, R3] = [maxX - minX, maxY - minY, maxZ - minZ].sort((a, b) => b - a);
  return (R1 / R2) * (R1 / R3) * (R2 / R3);
}

/**
 * VS_inf by Monte-Carlo over random orthonormal frames.
 *
 * Chunked on purpose. Vectorising all 69,420 samples against an 8,000-vertex hull in
 * one shot materialises a ~4.5 GB intermediate — that took 411s in NumPy and would
 * simply kill a browser tab. Chunking also gives free progress reporting, so the UI
 * can show the estimate converging.
 *
 * @param {Float64Array} flat  vertices as [x0,y0,z0, x1,...]
 * @param {object} opts
 * @param {(done:number,total:number,estimate:number)=>void} [opts.onProgress]
 */
export function vsInf(flat, { samples = DEFAULT_SAMPLES, seed = 1, chunk = 512, onProgress } = {}) {
  const n = flat.length / 3;
  const rng = makeRng(seed);
  const gauss = makeGaussian(rng);
  let total = 0;

  for (let done = 0; done < samples; ) {
    const end = Math.min(done + chunk, samples);
    for (; done < end; done++) {
      // --- random orthonormal frame (same construction as the Python reference) ---
      let ax = gauss(), ay = gauss(), az = gauss();
      let inv = 1 / Math.hypot(ax, ay, az);
      ax *= inv; ay *= inv; az *= inv;

      let bx = gauss(), by = gauss(), bz = gauss();
      const d = bx * ax + by * ay + bz * az;
      bx -= d * ax; by -= d * ay; bz -= d * az;
      inv = 1 / Math.hypot(bx, by, bz);
      bx *= inv; by *= inv; bz *= inv;

      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;

      // --- extents along all three axes in a single pass over the vertices ---
      let lo1 = Infinity, hi1 = -Infinity;
      let lo2 = Infinity, hi2 = -Infinity;
      let lo3 = Infinity, hi3 = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = flat[i * 3], y = flat[i * 3 + 1], z = flat[i * 3 + 2];
        const p1 = x * ax + y * ay + z * az;
        const p2 = x * bx + y * by + z * bz;
        const p3 = x * cx + y * cy + z * cz;
        if (p1 < lo1) lo1 = p1; if (p1 > hi1) hi1 = p1;
        if (p2 < lo2) lo2 = p2; if (p2 > hi2) hi2 = p2;
        if (p3 < lo3) lo3 = p3; if (p3 > hi3) hi3 = p3;
      }
      const e1 = hi1 - lo1, e2 = hi2 - lo2, e3 = hi3 - lo3;

      const r1 = e1 > e2 ? e1 / e2 : e2 / e1;
      const r2 = e1 > e3 ? e1 / e3 : e3 / e1;
      const r3 = e2 > e3 ? e2 / e3 : e3 / e2;
      total += r1 * r2 * r3;
    }
    if (onProgress) onProgress(done, samples, total / done);
  }
  return total / samples;
}

/**
 * Full pipeline: vertices -> hull -> miniball -> {simpleVS, vsInf, ve}.
 *
 * @param {number[][]} vertices
 * @returns metrics plus the hull and ball, which the 3D viewer reuses so the
 *          wireframe sphere on screen IS the sphere VE was divided by.
 */
export function computeShapeMetrics(vertices, { samples = DEFAULT_SAMPLES, seed = 1, onProgress } = {}) {
  const hull = convexHull(vertices);
  const ball = miniball(hull.points, { seed });

  const sphereVolume = (4 / 3) * Math.PI * ball.radius ** 3;
  const ve = (100 * hull.volume) / sphereVolume;

  const flatHull = toFlat(hull.points);

  return {
    simpleVS: simpleVS(hull.points),
    vsInf: vsInf(flatHull, { samples, seed, onProgress }),
    ve,
    hullVolume: hull.volume,
    sphereVolume,
    radius: ball.radius,
    centre: ball.centre,
    ballMaxExcess: ball.maxExcess,
    vertexCount: vertices.length,
    hullVertexCount: hull.points.length,
    hullFaceCount: hull.faces.length,
    samples,
    seed,
    hull,
    ball,
  };
}
