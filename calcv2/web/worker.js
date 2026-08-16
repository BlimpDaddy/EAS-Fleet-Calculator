/**
 * Runs the shape pipeline off the main thread so the page stays responsive.
 * The full 69,420-sample VS_inf takes several seconds on a large hull; without a
 * worker the tab would simply freeze.
 */

import { parseObjVertices, parseObjMesh, facesToEdgeList } from '../src/obj.js';
import { parseGlbVertices } from '../src/glb.js';
import { computeShapeMetrics } from '../src/shapeMetrics.js';
import { measureDynamicsGeometry } from '../src/dynamicsGeometry.js';
import { measureSectionalProxy } from '../src/cdEstimator.js';

function remapFaces(faces, indices) {
  const origToLocal = new Map(indices.map((orig, local) => [orig, local]));
  return faces.map((f) => f.map((i) => origToLocal.get(i)));
}

// The viewer draws the ORIGINAL mesh's edges (the true uploaded shape) alongside the
// hull. Fat-line rendering costs per segment, so enormous meshes are decimated by
// uniform stride — density thins evenly rather than truncating one region.
const MESH_SEGMENT_BUDGET = 50_000;

/**
 * Point-cloud .obj files (vertices, zero faces — e.g. cigar.obj, Bottle.obj) have no
 * original mesh to draw. Drawing hull edges in orange instead proved confusing (the
 * orange looked like a "distorted" shape while actually being the hull). So the true
 * input data — the points themselves — is sent for rendering as dots, and the hull
 * stays entirely magenta.
 */
function pointCloud(verts, centre, radius) {
  const CAP = 50_000;
  const stride = verts.length > CAP ? Math.ceil(verts.length / CAP) : 1;
  const n = Math.ceil(verts.length / stride);
  const out = new Float32Array(n * 3);
  const [cx, cy, cz] = centre;
  let j = 0;
  for (let i = 0; i < verts.length; i += stride) {
    out[j * 3] = (verts[i][0] - cx) / radius;
    out[j * 3 + 1] = (verts[i][1] - cy) / radius;
    out[j * 3 + 2] = (verts[i][2] - cz) / radius;
    j++;
  }
  return out;
}

/** Normalised (unit-measuring-sphere space) flat segment positions for the viewer. */
function meshSegments(verts, faces, lineEdges, centre, radius) {
  // Drawable linework = face boundary edges + explicit `l` polyline edges (Blender
  // wireframe exports have ONLY the latter). Deduped together. Genuinely lineless
  // files return null and meshPoints carries the shape as dots instead.
  let edges = facesToEdgeList(faces);
  if (lineEdges.length) {
    const seen = new Set(edges.map(([a, b]) => (a < b ? a * 16777216 + b : b * 16777216 + a)));
    for (const [a, b] of lineEdges) {
      const key = a < b ? a * 16777216 + b : b * 16777216 + a;
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
    }
  }
  if (!edges.length) return null;
  if (edges.length > MESH_SEGMENT_BUDGET) {
    const stride = Math.ceil(edges.length / MESH_SEGMENT_BUDGET);
    edges = edges.filter((_, i) => i % stride === 0);
  }
  const out = new Float32Array(edges.length * 6);
  const [cx, cy, cz] = centre;
  for (let i = 0; i < edges.length; i++) {
    const a = verts[edges[i][0]], b = verts[edges[i][1]];
    out[i * 6] = (a[0] - cx) / radius;
    out[i * 6 + 1] = (a[1] - cy) / radius;
    out[i * 6 + 2] = (a[2] - cz) / radius;
    out[i * 6 + 3] = (b[0] - cx) / radius;
    out[i * 6 + 4] = (b[1] - cy) / radius;
    out[i * 6 + 5] = (b[2] - cz) / radius;
  }
  return out;
}

self.onmessage = async (e) => {
  // Accepts either { text } (.obj source) or { glb } (ArrayBuffer of a binary glTF).
  const { text, glb, samples, seed } = e.data;
  try {
    const t0 = performance.now();
    let vertices, meshFaces = [], meshLineEdges = [];
    if (glb) {
      vertices = parseGlbVertices(glb);
    } else {
      const mesh = parseObjMesh(text);
      vertices = mesh.verts;
      meshFaces = mesh.faces;
      meshLineEdges = mesh.lineEdges;
    }
    if (vertices.length < 4) throw new Error(`only ${vertices.length} vertices found — is this a valid ${glb ? '.glb' : '.obj'}?`);

    const m = computeShapeMetrics(vertices, {
      samples,
      seed,
      onProgress: (done, total, estimate) =>
        self.postMessage({ type: 'progress', done, total, estimate }),
    });

    const segs = meshSegments(vertices, meshFaces, meshLineEdges, m.centre, m.radius);
    const points = segs ? null : (glb ? null : pointCloud(vertices, m.centre, m.radius));

    // M6 stage 2 (opt-in via payload.dynamics): DYNAMIC's raw geometry +
    // sectional proxies for UPLOADS, measured off the main thread in the
    // same pass that parsed the mesh. Point-cloud/faceless input falls
    // back to the CONVEX HULL faces (the hull is already computed for
    // VS) — a closed manifold the estimator can ray-cast; the source is
    // labelled so provenance never claims skin that was not measured.
    // Preset records never come from here (they are precomputed at bake
    // time — presetDynamics.js); stale results are discarded by the
    // caller's runId guard exactly like every other worker reply.
    let dynamics = null;
    if (e.data.dynamics) {
      // CANONICAL UPLOAD-HULL RULE (graduation 2026-08-16, r18
      // requirement + owner ruling: uploads use the hull, always):
      // ONE convex hull, computed once, is the geometry identity for
      // EVERY downstream measurement — sectional estimator, dynamics
      // areas, volume. No two subsystems ever see different geometry.
      // Rationale: the framework's aero object IS the compact convex
      // envelope (VS/VE, frontal silhouette, volume all measure it);
      // hulling also retires whole classes of mesh-defect ambiguity
      // (open surfaces, inverted caps, inconsistent winding) at the
      // door. The raw mesh remains the DISPLAY object upstream.
      // Presets are different by design: authored aeroHullMesh records
      // precomputed at bake time (presetDynamics.js), never this path.
      const solidFaces = m.hull.faces;
      const geometrySource = 'convex-hull(canonical, graduation 2026-08-16)';
      const per = {};
      for (const ax of ['X', 'Y', 'Z']) per[ax] = measureDynamicsGeometry(vertices, solidFaces, { flightAxis: ax });
      const proxies = {};
      for (const ax of ['+X', '-X', '+Y', '-Y', '+Z', '-Z']) {
        const p = measureSectionalProxy(vertices, solidFaces, { axis: ax });
        proxies[ax] = {
          proxy: p.proxy,
          cls: p.cls,           // mechanism class (graduation 2026-08-16)
          triggers: p.triggers,
          oddFraction: p.quality ? p.quality.oddFraction : null,
        };
      }
      dynamics = {
        geometrySource,
        raw: {
          extents: per.Z.extents,
          frontalRaw: { X: per.X.frontalArea, Y: per.Y.frontalArea, Z: per.Z.frontalArea },
          wettedRaw: per.Z.wettedArea,
          hullRaw: per.Z.hullArea,
          meshRaw: per.Z.meshArea,
          wettedSource: per.Z.wettedSource,
          volumeRaw: per.Z.volume,       // contract amendment 2026-08-16
          volumeSource: per.Z.volumeSource,
          warnings: per.Z.warnings,
        },
        proxies,
      };
    }

    // Structured-clone can't carry the nested hull/ball objects cheaply; send just
    // what the viewer needs, flattened. The mesh segment buffer is transferred.
    self.postMessage({
      type: 'done',
      seconds: (performance.now() - t0) / 1000,
      metrics: {
        simpleVS: m.simpleVS,
        vsInf: m.vsInf,
        ve: m.ve,
        hullVolume: m.hullVolume,
        sphereVolume: m.sphereVolume,
        radius: m.radius,
        centre: m.centre,
        ballMaxExcess: m.ballMaxExcess,
        ballExpanded: !!m.ball.expanded,
        vertexCount: m.vertexCount,
        hullVertexCount: m.hullVertexCount,
        hullFaceCount: m.hullFaceCount,
        samples: m.samples,
      },
      hullPoints: m.hull.points,
      // hull.faces index into the ORIGINAL vertex array; the viewer only receives
      // hull.points (the subset), so remap to local indices or most edges point past
      // the end of the array and silently vanish.
      hullFaces: remapFaces(m.hull.faces, m.hull.indices),
      // Original-mesh edges, normalised into unit-sphere space, ready for
      // LineSegmentsGeometry.setPositions. null for point-cloud files, which get
      // meshPoints (normalised vertex positions for dot rendering) instead.
      meshSegments: segs,
      meshPoints: points,
      dynamics, // M6 stage 2: null unless requested (uploads only)
    }, [segs, points].filter(Boolean).map((b) => b.buffer));
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
