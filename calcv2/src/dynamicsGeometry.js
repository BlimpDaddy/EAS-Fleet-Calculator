/**
 * DYNAMIC geometry: projected frontal area, wetted area, orientation semantics.
 *
 * Implements DYNAMIC-SPEC.md §4.2 and §5.1's geometry recipe (implementation
 * authority, promoted 2026-08-12). Milestone M1 of the build order: pure
 * functions, no DOM, additive to the pipeline — nothing existing is modified.
 *
 * Orientation is DECLARED, never detected (spec §4.1, Q2): the flight axis is
 * one of the file's own cardinal axes, chosen by the user (default: as
 * exported). ±v project the same silhouette and roll cannot change it, so a
 * mesh has exactly three possible frontal areas. Subtle mis-orientation is
 * structurally impossible at this API: `flightAxis` is 'X' | 'Y' | 'Z'.
 */

import { convexHull } from './hull.js';

export const FLIGHT_AXES = ['X', 'Y', 'Z'];

const AXIS_INDEX = { X: 0, Y: 1, Z: 2 };

/** Axis-aligned extents [ex, ey, ez] in mesh units. */
export function axisExtents(verts) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of verts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
  }
  return [maxX - minX, maxY - minY, maxZ - minZ];
}

/**
 * FRONTAL AREA — convex projected silhouette on the declared flow axis.
 *
 * WHAT:  project ALL vertices onto the plane normal to `flightAxis`, take the
 *        2D convex hull (monotone chain), measure it (shoelace). The 2D hull
 *        of the projection equals the projection of the 3D hull, so no 3D
 *        hull is needed.
 * WHY:   the convex hull is the object the VS paper measures and what VS/VE
 *        already use. For concave uploads this OVERESTIMATES the silhouette —
 *        erring toward more drag, never flattering the shape.
 * SUNSHIP FIXTURE: Z-forward, scaled to L = 300 m -> ~40,522 m^2
 *        (measured 2026-08-12; supersedes the 60,000 m^2 sphere-derived guess).
 * LIMITATION: "convex projected frontal area, declared flow axis" — NOT
 *        maximised over orientation, NOT the true silhouette of a concave body.
 * REPLACE WHEN: never expected to — this is a definition, not an estimate.
 * PROVENANCE: CALCULATED from geometry.
 *
 * @param {number[][]} verts  mesh vertices
 * @param {'X'|'Y'|'Z'} flightAxis
 * @returns {number} area in (mesh units)^2 — 0 if fewer than 3 distinct points
 */
export function projectedFrontalArea(verts, flightAxis) {
  const a = AXIS_INDEX[flightAxis];
  if (a === undefined) throw new Error(`projectedFrontalArea: bad axis ${flightAxis}`);
  const u = (a + 1) % 3, v = (a + 2) % 3;

  // Projected points, sorted for the monotone chain.
  const pts = verts.map((p) => [p[u], p[v]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return 0;

  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull2d = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull2d.length < 3) return 0; // collinear cloud has no silhouette

  let twice = 0;
  for (let i = 0; i < hull2d.length; i++) {
    const [x1, y1] = hull2d[i];
    const [x2, y2] = hull2d[(i + 1) % hull2d.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/**
 * Sum of face areas over a face list, by per-face vector area (Newell's
 * method): area = |Σ v_i × v_{i+1}| / 2 around each face's boundary.
 *
 * Exact for planar polygons INCLUDING concave ones — a naive fan-from-v0
 * absolute sum overcounts concave faces badly (a U-shaped planar 8-gon of
 * true area 7 fans to 11; M1 review send-back #2). For triangles Newell is
 * identical to the cross-product formula. For non-planar ngons it returns
 * the magnitude of the vector area — a mild undercount for folded faces,
 * acceptable at screening grade since exporters emit near-planar faces.
 * Degenerate faces contribute exactly 0 — junk can never propagate NaN.
 *
 * @param {number[][]} verts
 * @param {number[][]} faces  index arrays into `verts` (ngons allowed)
 * @returns {number} area in (mesh units)^2
 */
export function faceAreaSum(verts, faces) {
  let total = 0;
  for (const f of faces) {
    if (f.length < 3) continue;
    let nx = 0, ny = 0, nz = 0, ok = true;
    for (let i = 0; i < f.length; i++) {
      const p = verts[f[i]], q = verts[f[(i + 1) % f.length]];
      if (!p || !q) { ok = false; break; }
      nx += p[1] * q[2] - p[2] * q[1];
      ny += p[2] * q[0] - p[0] * q[2];
      nz += p[0] * q[1] - p[1] * q[0];
    }
    if (ok) total += Math.hypot(nx, ny, nz) / 2;
  }
  return total;
}

/** Hull surface area — the junk-mesh sanity reference and the no-faces fallback. */
export function hullSurfaceArea(verts) {
  const hull = convexHull(verts);
  return faceAreaSum(verts, hull.faces);
}

/**
 * ENCLOSED VOLUME — signed tetrahedron sum (divergence theorem), ngons
 * fan-triangulated. Exact for watertight meshes; meaningless for open
 * ones — which is why the TRUST DECISION below never returns a mesh
 * volume once the mesh was judged untrustworthy for wetted area.
 * Degenerate faces contribute exactly 0.
 *
 * WHY (contract amendment 2026-08-16, owner request): drag area
 * CdA = Cd × A and the volumetric coefficient Cd_v = CdA / V^(2/3)
 * (the classic airship basis — TR-397's 0.02x-class numbers) need an
 * enclosed volume measured from the SAME geometry record as the areas.
 * PROVENANCE: CALCULATED from geometry.
 */
export function meshVolume(verts, faces) {
  let six = 0;
  for (const f of faces) {
    if (f.length < 3) continue;
    const a = verts[f[0]];
    if (!a) continue;
    for (let i = 1; i + 1 < f.length; i++) {
      const b = verts[f[i]], c = verts[f[i + 1]];
      if (!b || !c) continue;
      six += a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return Math.abs(six) / 6;
}

/** Hull volume — the volume fallback twin of hullSurfaceArea. */
export function hullVolume(verts) {
  const hull = convexHull(verts);
  return meshVolume(verts, hull.faces);
}

/**
 * WETTED AREA — how much skin there is.
 *
 * WHAT:  sum of the mesh's own triangle areas; the convex hull's surface area
 *        computed alongside as a sanity reference.
 * WHY:   skin friction depends only on wetted area and Reynolds number
 *        (DYNAMIC-SPEC §5.1, §12.3) — separation never enters it, which is why
 *        a bare .obj with no tail suffices.
 * LIMITATION: junk meshes (internal faces, duplicated geometry) inflate the
 *        sum; open meshes / point clouds deflate or lack it. Policy (M1
 *        review send-back #1): once the mesh sum is judged untrustworthy it
 *        is NEVER returned as the wetted area — warn AND substitute the hull
 *        surface area, with `wettedSource: 'hull-fallback'` and the raw mesh
 *        sum preserved in `meshArea` for diagnostics. Hard failure is
 *        reserved for geometry that cannot define the calculation at all
 *        (empty/non-finite input, zero flight-axis extent, hull failure).
 * REPLACE WHEN: a cleaned, authored wetted area exists for a preset.
 * PROVENANCE: CALCULATED from geometry.
 */

/**
 * Mesh-quality screening thresholds.
 *
 * WHAT:  a mesh triangle sum above JUNK x hull area, or below OPEN x hull
 *        area, is judged untrustworthy and replaced by the hull surface area.
 * WHY:   cheap Release-1 corruption detectors. A closed mesh enclosing its
 *        hull cannot have less surface than the hull (below OPEN => holes /
 *        point-cloud-ish); several times the hull's surface implies internal
 *        or duplicated faces (above JUNK). Deliberately permissive — these
 *        catch garbage, not subtle flaws.
 * PROVENANCE: REFERENCE ASSUMPTION (invented screening thresholds,
 *        2026-08-13) — not physics, and they don't pretend to be.
 * LIMITATION: a genuinely ornate concave surface with >3x hull area would be
 *        falsely flagged (and conservatively floored to its hull area).
 * REPLACE WHEN: explicit mesh-integrity checks (manifoldness, duplicate
 *        detection) are worth their weight; or per-preset authored values.
 */
const WETTED_JUNK_FACTOR = 3;
const WETTED_OPEN_FACTOR = 0.98;

/**
 * Full M1 measurement: geometry + declared orientation -> areas.
 *
 * This is the pure headless half of orientation (build amendment r4): the
 * click-drag snap GESTURE binds to `flightAxis` in Phase B; here the axis is
 * simply a declared value.
 *
 * @param {number[][]} verts
 * @param {number[][]} faces        may be empty (point cloud / wireframe)
 * @param {object} opts
 * @param {'X'|'Y'|'Z'} [opts.flightAxis='Z']  the declared direction of travel
 * @param {number|null} [opts.lengthM=null]    physical length along the flight
 *        axis; when given, outputs are in metres / m^2, else raw mesh units
 * @returns {{
 *   flightAxis:string, scale:number, lengthM:number|null,
 *   units:'m'|'mesh-units',
 *   extents:number[], frontalArea:number, wettedArea:number,
 *   hullArea:number, meshArea:number, wettedOverFrontal:number,
 *   wettedSource:'mesh'|'hull-fallback', warnings:string[]
 * }} areas in units^2; `wettedArea` is always a TRUSTED value (mesh sum or
 *    hull fallback); `meshArea` is the raw sum, diagnostics only
 */
/**
 * Raw (mesh-units) measurement record → the metres-grade M1 geometry
 * record, without touching the mesh (M6 stage 2 — the hybrid geometry
 * inheritance rule: preset records are PRECOMPUTED at bake time; only
 * the cheap scaling runs at page time; live length changes re-scale).
 *
 * The raw record is produced by tools/gen-preset-dynamics.mjs from the
 * same measureDynamicsGeometry() below — this function is ONLY the
 * scaling algebra factored out (areas × scale², extents × scale), so a
 * scaled record is identical to measuring the mesh at that length
 * directly (parity fixture in the estimator suite). The wetted TRUST
 * DECISION (mesh vs hull-fallback) was made at measurement time and
 * travels in the raw record — scaling never re-decides it.
 *
 * @param {{extents:number[], frontalRaw:{X:number,Y:number,Z:number},
 *          wettedRaw:number, hullRaw:number, meshRaw:number,
 *          wettedSource:string, warnings:string[]}} raw
 * @param {'X'|'Y'|'Z'} flightAxis
 * @param {number} lengthM  physical length along the flight axis, > 0
 */
export function scaleGeometryRecord(raw, flightAxis, lengthM) {
  if (!FLIGHT_AXES.includes(flightAxis)) {
    throw new Error(`scaleGeometryRecord: flightAxis must be X, Y or Z, got ${flightAxis}`);
  }
  if (!(typeof lengthM === 'number' && Number.isFinite(lengthM) && lengthM > 0)) {
    throw new Error(`scaleGeometryRecord: lengthM must be a finite number > 0, got ${lengthM}`);
  }
  const alongFlight = raw.extents[AXIS_INDEX[flightAxis]];
  if (!(alongFlight > 0)) throw new Error('scaleGeometryRecord: zero extent along flight axis');
  const frontalRaw = raw.frontalRaw[flightAxis];
  if (!Number.isFinite(frontalRaw) || !Number.isFinite(raw.wettedRaw)) {
    throw new Error('scaleGeometryRecord: raw record needs finite frontal/wetted');
  }
  const scale = lengthM / alongFlight;
  const s2 = scale * scale;
  // Volume (contract amendment 2026-08-16): scales as s³; the trust
  // decision travels in the raw record like wetted's. Raw records
  // predating the amendment lack it — scaled record says so honestly.
  const hasVolume = typeof raw.volumeRaw === 'number' && Number.isFinite(raw.volumeRaw) && raw.volumeRaw > 0;
  return {
    flightAxis,
    scale,
    lengthM,
    units: 'm',
    extents: raw.extents.map((e) => e * scale),
    frontalArea: frontalRaw * s2,
    wettedArea: raw.wettedRaw * s2,
    hullArea: raw.hullRaw * s2,
    meshArea: raw.meshRaw * s2,
    wettedOverFrontal: frontalRaw > 0 ? raw.wettedRaw / frontalRaw : NaN,
    wettedSource: raw.wettedSource,
    volume: hasVolume ? raw.volumeRaw * s2 * scale : null,
    volumeSource: hasVolume ? (raw.volumeSource ?? 'convex-envelope') : 'unavailable',
    warnings: [...(raw.warnings || [])],
  };
}

export function measureDynamicsGeometry(verts, faces, { flightAxis = 'Z', lengthM = null } = {}) {
  if (!FLIGHT_AXES.includes(flightAxis)) {
    throw new Error(`measureDynamicsGeometry: flightAxis must be X, Y or Z, got ${flightAxis}`);
  }
  const warnings = [];
  const rawExtents = axisExtents(verts);
  const alongFlight = rawExtents[AXIS_INDEX[flightAxis]];
  if (!(alongFlight > 0)) throw new Error('measureDynamicsGeometry: zero extent along flight axis');

  const scale = lengthM != null ? lengthM / alongFlight : 1;
  const s2 = scale * scale;

  const frontalRaw = projectedFrontalArea(verts, flightAxis);
  if (frontalRaw === 0) warnings.push('degenerate-silhouette');

  const hullRaw = hullSurfaceArea(verts);
  const meshRaw = faces.length ? faceAreaSum(verts, faces) : 0;

  // Trust decision: the returned wetted area is either the mesh sum or the
  // hull surface — never a value already judged suspect (send-back #1).
  let wettedRaw = meshRaw;
  let wettedSource = 'mesh';
  if (!faces.length || meshRaw === 0) {
    wettedRaw = hullRaw;
    wettedSource = 'hull-fallback';
    warnings.push('no-faces: wetted area falls back to hull surface area');
  } else if (meshRaw < hullRaw * WETTED_OPEN_FACTOR) {
    wettedRaw = hullRaw;
    wettedSource = 'hull-fallback';
    warnings.push('wetted-below-hull: mesh looks open/incomplete — using hull surface area instead');
  } else if (meshRaw > hullRaw * WETTED_JUNK_FACTOR) {
    wettedRaw = hullRaw;
    wettedSource = 'hull-fallback';
    warnings.push('wetted-junk-suspect: mesh area far exceeds hull area (internal/duplicated faces likely) — using hull surface area instead');
  }

  // VOLUME — CONVEX-ENVELOPE SEMANTICS (owner ruling 2026-08-16,
  // r17 Part B (h): "an airship envelope is a compact convex hull in
  // the framework — so hull volume"). The volume is ALWAYS the convex
  // hull's, for every input — watertight, holed, wrong-winding, or a
  // bare point cloud — one meaning, one label, never silently mixed
  // (the reviewer's rule). This retires the r17 winding attack by
  // construction (a flipped-winding cube's SIGNED mesh sum lied at
  // 0.667 while passing every area screen; the hull cannot lie).
  // Consistent with the calculator's whole philosophy: VS/VE and the
  // frontal silhouette already measure the convex envelope; concavity
  // is deliberately discarded upstream, not "recovered" here.
  const volumeRaw = hullVolume(verts);
  const volumeSource = 'convex-envelope';

  return {
    flightAxis,
    scale,
    lengthM,
    units: lengthM != null ? 'm' : 'mesh-units', // M2 must require 'm' (send-back hardening)
    extents: rawExtents.map((e) => e * scale),
    frontalArea: frontalRaw * s2,
    wettedArea: wettedRaw * s2,
    hullArea: hullRaw * s2,
    meshArea: meshRaw * s2, // raw mesh sum, diagnostics only — may be untrusted
    wettedOverFrontal: frontalRaw > 0 ? wettedRaw / frontalRaw : NaN,
    wettedSource,
    volume: volumeRaw * s2 * scale, // s³ — a volume
    volumeSource,
    warnings,
  };
}
