/**
 * Runs the shape pipeline off the main thread so the page stays responsive.
 * The full 69,420-sample VS_inf takes several seconds on a large hull; without a
 * worker the tab would simply freeze.
 */

import { parseObjVertices, parseObjMesh, facesToEdgeList } from '../src/obj.js';
import { parseGlbVertices } from '../src/glb.js';
import { computeShapeMetrics } from '../src/shapeMetrics.js';

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
    }, [segs, points].filter(Boolean).map((b) => b.buffer));
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
