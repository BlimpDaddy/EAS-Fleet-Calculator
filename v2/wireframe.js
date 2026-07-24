/**
 * Sparse "design-line" wireframe for uploaded shapes.
 *
 * The preset models' baked linework is hand-authored (the sunship.glb contains 122
 * artist-drawn strokes), so it cannot be copied literally for arbitrary geometry.
 * This generates the nearest procedural equivalent, oriented the way an airship
 * reads: rings ("stations") perpendicular to the shape's PRIME axis — its longest
 * extent — plus longitudinal curves through that axis, converging at nose and tail.
 * A plane section of a convex body is a single closed convex curve, so every line
 * follows the measured surface exactly.
 *
 * Loops are then smoothed with a Catmull-Rom pass so coarse hulls read as curves
 * rather than polygons — EXCEPT across genuine creases (sharp turns like the flat
 * keel's edge), which are detected and kept sharp. Smoothed points are clamped to
 * the unit measuring sphere so presentation never pokes outside the mathematics.
 */

/**
 * @param {number[][]} pts    hull vertices, normalised into the unit sphere
 * @param {number[][]} edges  unique [a,b] index pairs into pts
 * @returns {number[][][]} closed loops of 3D points
 */
export function contourLoops(pts, edges, { stations = 7, longitudinals = 6 } = {}) {
  // Prime axis = the axis-aligned direction of greatest extent (the .obj is assumed
  // oriented as the user intends — same convention as simple VS).
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const prime = ext.indexOf(Math.max(...ext));
  const axis = [0, 0, 0]; axis[prime] = 1;
  // The two directions orthogonal to the prime axis.
  const o1 = [0, 0, 0]; o1[(prime + 1) % 3] = 1;
  const o2 = [0, 0, 0]; o2[(prime + 2) % 3] = 1;

  const loops = [];

  // Stations: rings perpendicular to the prime axis, spread along it (tips excluded).
  for (let i = 1; i <= stations; i++) {
    const d = lo[prime] + (ext[prime] * i) / (stations + 1) + 1e-7;
    loops.push(planeSlice(pts, edges, axis, d));
  }

  // Longitudinals: planes containing the prime axis, fanned around it. Each is a
  // full nose-to-tail loop over both sides, so `longitudinals` planes read as 2x
  // that many surface curves.
  for (let i = 0; i < longitudinals; i++) {
    const th = (Math.PI * i) / longitudinals + 1e-4;
    const n = [
      o1[0] * Math.cos(th) + o2[0] * Math.sin(th),
      o1[1] * Math.cos(th) + o2[1] * Math.sin(th),
      o1[2] * Math.cos(th) + o2[2] * Math.sin(th),
    ];
    loops.push(planeSlice(pts, edges, n, 0));
  }

  return loops
    .filter((l) => l.length >= 3)
    .map((l) => smoothLoop(simplifyLoop(l)));
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

  // A section of a convex body is a convex polygon: angular sort around the centroid
  // (in an in-plane basis) orders the loop with no segment-chaining.
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
function simplifyLoop(loop, eps = 0.02) {
  if (loop.length < 8) return loop;
  const out = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
    const ab = sub(b, a), bc = sub(c, b);
    const x = cross(ab, bc);
    const sin2 = dot(x, x) / (dot(ab, ab) * dot(bc, bc) + 1e-30);
    if (sin2 > eps * eps) out.push(b);
  }
  return out.length >= 3 ? out : loop;
}

/**
 * Closed Catmull-Rom smoothing with crease preservation: vertices where the polyline
 * turns sharply (> ~40°) are treated as corners and pinned, so the flat keel keeps a
 * crisp edge while genuinely curved runs become smooth. Points are clamped inside
 * the unit measuring sphere.
 */
function smoothLoop(loop, { subdiv = 4, creaseDeg = 40 } = {}) {
  const n = loop.length;
  if (n < 4) return loop;

  const creaseCos = Math.cos((creaseDeg * Math.PI) / 180);
  const isCorner = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
    const ab = norm(sub(b, a)), bc = norm(sub(c, b));
    isCorner[i] = dot(ab, bc) < creaseCos; // large turn -> keep sharp
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const p1 = loop[i], p2 = loop[(i + 1) % n];
    // Phantom neighbours: reflect across a corner so the spline doesn't smear it.
    const p0 = isCorner[i] ? mirror(p2, p1) : loop[(i - 1 + n) % n];
    const p3 = isCorner[(i + 1) % n] ? mirror(p1, p2) : loop[(i + 2) % n];
    for (let s = 0; s < subdiv; s++) {
      const t = s / subdiv;
      out.push(clampUnit(catmullRom(p0, p1, p2, p3, t)));
    }
  }
  return out;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const o = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    o[k] = 0.5 * (
      2 * p1[k] +
      (-p0[k] + p2[k]) * t +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
    );
  }
  return o;
}

const mirror = (a, about) => [2 * about[0] - a[0], 2 * about[1] - a[1], 2 * about[2] - a[2]];
const clampUnit = (p) => {
  const l = Math.hypot(p[0], p[1], p[2]);
  return l > 1 ? [p[0] / l, p[1] / l, p[2] / l] : p;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
