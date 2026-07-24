/**
 * Sparse "curved" wireframe for uploaded shapes.
 *
 * Drawing every convex-hull edge reads as a blob — a smooth shape like the Sunship
 * hull has ~6,000 short segments pointing in every direction. The preset .glb models
 * look elegant because their baked wireframes are a few smooth contour curves.
 *
 * This reproduces that look from raw hull geometry: slice the hull with meridian
 * planes (through the vertical axis) and parallel planes (horizontal), like latitude
 * and longitude on a globe. A plane section of a convex body is a single convex
 * closed curve, so each slice is one clean loop that follows the surface — the
 * measured geometry rendered as curves, not soup.
 */

/**
 * @param {number[][]} pts    hull vertices (already normalised into the unit sphere)
 * @param {number[][]} edges  unique [a,b] index pairs into pts
 * @returns {number[][][]} closed loops of 3D points
 */
export function contourLoops(pts, edges, { meridians = 10, parallels = 9 } = {}) {
  const loops = [];

  // Parallels: horizontal planes spread across the shape's height (endpoints excluded
  // — slices at the very poles would be dots). Tiny offset avoids cutting exactly
  // through a vertex, which would poke a hole in the loop.
  let ymin = Infinity, ymax = -Infinity;
  for (const p of pts) {
    if (p[1] < ymin) ymin = p[1];
    if (p[1] > ymax) ymax = p[1];
  }
  for (let i = 1; i <= parallels; i++) {
    const y = ymin + ((ymax - ymin) * i) / (parallels + 1) + 1e-7;
    loops.push(planeSlice(pts, edges, [0, 1, 0], y));
  }

  // Meridians: vertical planes through the centre. Each is a full ring over crown and
  // keel, so `meridians` planes read as 2x that many longitude lines.
  for (let i = 0; i < meridians; i++) {
    const th = (Math.PI * i) / meridians + 1e-4;
    loops.push(planeSlice(pts, edges, [Math.cos(th), 0, Math.sin(th)], 0));
  }

  return loops.filter((l) => l.length >= 3).map(simplifyLoop);
}

/** Intersect the hull's edge set with plane dot(n, p) = d -> one convex closed loop. */
function planeSlice(pts, edges, n, d) {
  const hits = [];
  for (const [a, b] of edges) {
    const pa = pts[a], pb = pts[b];
    const da = n[0] * pa[0] + n[1] * pa[1] + n[2] * pa[2] - d;
    const db = n[0] * pb[0] + n[1] * pb[1] + n[2] * pb[2] - d;
    if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) {
      const t = da / (da - db);
      hits.push([
        pa[0] + t * (pb[0] - pa[0]),
        pa[1] + t * (pb[1] - pa[1]),
        pa[2] + t * (pb[2] - pa[2]),
      ]);
    }
  }
  if (hits.length < 3) return [];

  // The section of a convex body is a convex polygon, so sorting the crossing points
  // by angle around their centroid (in a basis lying in the plane) orders the loop
  // correctly — no segment-chaining needed.
  const c = [0, 0, 0];
  for (const h of hits) { c[0] += h[0] / hits.length; c[1] += h[1] / hits.length; c[2] += h[2] / hits.length; }
  let u = Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]);
  u = norm(u);
  const v = cross(n, u);
  return hits
    .map((p) => {
      const r = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      return { p, a: Math.atan2(dot(r, v), dot(r, u)) };
    })
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

/** Drop points that barely change direction — long straight runs collapse to one segment. */
function simplifyLoop(loop, eps = 0.015) {
  if (loop.length < 8) return loop;
  const out = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const bc = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const x = cross(ab, bc);
    const sin2 = dot(x, x) / (dot(ab, ab) * dot(bc, bc) + 1e-30);
    if (sin2 > eps * eps) out.push(b);
  }
  return out.length >= 3 ? out : loop;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
