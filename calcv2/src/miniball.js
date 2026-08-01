/**
 * Exact minimum enclosing ball (Welzl's algorithm, 3D).
 *
 * WHY FROM SCRATCH: nearly every JS "bounding sphere" package implements Ritter's
 * algorithm, which is an approximation typically 5-20% oversized. VE divides by r^3,
 * so a 5% radius error understates VE by ~14% — the Sunship would read 46% instead
 * of 53% and nothing would look obviously wrong. Welzl is exact.
 *
 * Equivalent to miniball.get_bounding_ball() in the Python reference.
 *
 * Implemented with the nested-loop (non-recursive) formulation: a 3D ball is fixed
 * by at most 4 boundary points, so four levels of loop replace recursion. Recursion
 * would blow the stack on a hull like sphere.obj's 8,066 vertices.
 */

import { makeRng, shuffled } from './rng.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dist2 = (a, b) => {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
};

const ball1 = (a) => ({ c: [a[0], a[1], a[2]], r2: 0 });

const ball2 = (a, b) => {
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return { c, r2: dist2(c, a) };
};

/** Circumsphere of a triangle: centre lies in the triangle's plane. */
function ball3(a, b, c) {
  const u = sub(b, a), v = sub(c, a);
  const n = cross(u, v);
  const nn = dot(n, n);
  // Degenerate (collinear) — caller falls back to a subset ball.
  if (nn <= 1e-30 * Math.max(dot(u, u) * dot(v, v), 1e-300)) return null;
  const uu = dot(u, u), vv = dot(v, v);
  const t1 = cross(v, n), t2 = cross(n, u);
  const k = 1 / (2 * nn);
  const centre = [
    a[0] + (uu * t1[0] + vv * t2[0]) * k,
    a[1] + (uu * t1[1] + vv * t2[1]) * k,
    a[2] + (uu * t1[2] + vv * t2[2]) * k,
  ];
  return { c: centre, r2: dist2(centre, a) };
}

/** Circumsphere of a tetrahedron. */
function ball4(a, b, c, d) {
  const u = sub(b, a), v = sub(c, a), w = sub(d, a);
  const vw = cross(v, w);
  const den = 2 * dot(u, vw);
  // Degenerate (coplanar) — the four points do not determine a sphere.
  const scale = Math.sqrt(dot(u, u) * dot(v, v) * dot(w, w));
  if (Math.abs(den) <= 1e-14 * Math.max(scale, 1e-300)) return null;
  const wu = cross(w, u), uv = cross(u, v);
  const uu = dot(u, u), vv = dot(v, v), ww = dot(w, w);
  const k = 1 / den;
  const centre = [
    a[0] + (uu * vw[0] + vv * wu[0] + ww * uv[0]) * k,
    a[1] + (uu * vw[1] + vv * wu[1] + ww * uv[1]) * k,
    a[2] + (uu * vw[2] + vv * wu[2] + ww * uv[2]) * k,
  ];
  return { c: centre, r2: dist2(centre, a) };
}

/**
 * Smallest ball through a support set of 1-4 points, by brute force over subsets.
 *
 * Trying every subset rather than assuming the full circumsphere is what makes this
 * robust to near-degenerate supports (collinear triples, coplanar quadruples), which
 * are exactly where naive Welzl implementations produce a wrong radius.
 */
function trivialBall(pts) {
  const n = pts.length;
  if (n === 0) return { c: [0, 0, 0], r2: 0 };
  if (n === 1) return ball1(pts[0]);

  // Each candidate contributes only its CENTRE; the radius is then taken as the true
  // distance to the furthest support point. This is the robustness trick: containment
  // holds by construction, so an ill-conditioned circumsphere (near-collinear triple,
  // near-coplanar quadruple) can never be silently rejected in favour of a subset ball
  // that is genuinely too small. Non-degenerate inputs give the same answer as taking
  // the circumradius directly.
  let best = null;
  const consider = (b) => {
    if (!b) return;
    const c = b.c;
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !Number.isFinite(c[2])) return;
    let r2 = 0;
    for (const p of pts) {
      const d = dist2(c, p);
      if (d > r2) r2 = d;
    }
    if (best === null || r2 < best.r2) best = { c, r2 };
  };

  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) consider(ball2(pts[i], pts[j]));
  if (n >= 3)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) consider(ball3(pts[i], pts[j], pts[k]));
  if (n >= 4)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++)
          for (let l = k + 1; l < n; l++) consider(ball4(pts[i], pts[j], pts[k], pts[l]));

  return best;
}

const inBall = (b, p, tol) => dist2(b.c, p) <= b.r2 * (1 + tol) + tol;

/**
 * @param {number[][]} points
 * @returns {{centre:number[], radius:number, support:number, maxExcess:number}}
 *   maxExcess is (furthest point distance - radius) / radius. It should be ~1e-15.
 *   A large value means the result is NOT the true minimum ball — always check it.
 */
export function miniball(points, { seed = 12345, tol = 1e-13, maxPasses = 16 } = {}) {
  if (points.length === 0) throw new Error('miniball: no points');
  let P = shuffled(points, makeRng(seed));

  let result = null;
  let passes = 0;
  let expanded = false;

  // Welzl is randomised, and on awkward inputs a specific permutation can converge to
  // a ball that is fractionally too small. Observed on an extremely elongated hull
  // (a pencil, simple VS 305): seed 1 settled 1.2e-5 low while every other seed found
  // the true radius. Move-to-front alone can cycle, so each failed pass gets a fresh
  // permutation with the known-difficult point promoted to the front.
  for (let pass = 0; pass < maxPasses; pass++) {
    passes = pass + 1;
    result = onePass(P, tol);
    const radius = Math.sqrt(result.r2);

    let worstD = 0, worstP = null;
    for (const p of points) {
      const d = Math.sqrt(dist2(result.c, p));
      if (d > worstD) { worstD = d; worstP = p; }
    }
    const excess = radius > 0 ? (worstD - radius) / radius : worstD;
    if (excess <= 1e-12) break;

    P = shuffled(points, makeRng(seed * 7919 + pass + 1));
    const wi = P.indexOf(worstP);
    if (wi > 0) P = [P[wi], ...P.slice(0, wi), ...P.slice(wi + 1)];
  }

  // Verification against the ORIGINAL point set — never return an unchecked ball.
  let radius = Math.sqrt(result.r2);
  let worst = 0;
  for (const p of points) worst = Math.max(worst, Math.sqrt(dist2(result.c, p)));
  let maxExcess = radius > 0 ? (worst - radius) / radius : worst;

  // Backstop: if no permutation converged, grow to contain. Slightly larger than the
  // true minimum, but containment is the property VE depends on, and `expanded`
  // makes the compromise visible rather than silent.
  if (maxExcess > 1e-12) {
    radius = worst;
    expanded = true;
    maxExcess = 0;
  }

  return { centre: result.c, radius, support: result.support, passes, maxExcess, expanded };
}

function onePass(P, tol) {
  let support = [];
  let b = ball1(P[0]);

  for (let i = 1; i < P.length; i++) {
    if (inBall(b, P[i], tol)) continue;
    // P[i] must lie on the boundary of the new ball.
    let b1 = trivialBall([P[i]]);
    let s1 = [P[i]];
    for (let j = 0; j < i; j++) {
      if (inBall(b1, P[j], tol)) continue;
      let b2 = trivialBall([P[i], P[j]]);
      let s2 = [P[i], P[j]];
      for (let k = 0; k < j; k++) {
        if (inBall(b2, P[k], tol)) continue;
        let b3 = trivialBall([P[i], P[j], P[k]]);
        let s3 = [P[i], P[j], P[k]];
        for (let l = 0; l < k; l++) {
          if (inBall(b3, P[l], tol)) continue;
          b3 = trivialBall([P[i], P[j], P[k], P[l]]);
          s3 = [P[i], P[j], P[k], P[l]];
        }
        b2 = b3; s2 = s3;
      }
      b1 = b2; s1 = s2;
    }
    b = b1; support = s1;
  }
  return { c: b.c, r2: b.r2, support: support.length };
}
