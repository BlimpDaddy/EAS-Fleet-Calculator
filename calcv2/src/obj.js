/**
 * Minimal Wavefront .obj vertex reader.
 *
 * Only `v` lines matter for shape metrics — VS, VS_inf and VE are all derived
 * from the convex hull, so faces, normals and materials are irrelevant.
 * Mirrors load_obj_vertices() in CalcV2.vsve.py.
 */

/** @returns {number[][]} array of [x, y, z] */
export function parseObjVertices(text) {
  const verts = [];
  // Split on any newline style; .obj files in the wild use all three.
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.charCodeAt(0) !== 118 /* 'v' */) continue;
    if (line[1] !== ' ' && line[1] !== '\t') continue; // skip vt / vn / vp
    const p = line.trim().split(/\s+/);
    // p[0] is 'v'. Anything past index 3 is vertex colour — ignored.
    const x = +p[1], y = +p[2], z = +p[3];
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      verts.push([x, y, z]);
    }
  }
  return verts;
}

/**
 * Full mesh read: vertices AND faces. Used by the viewer to draw the ORIGINAL
 * object (the measurement pipeline itself only ever needs vertices — the hull
 * doesn't care about faces). Handles `f v/vt/vn` syntax and negative (relative)
 * indices, resolved against the vertex count at the line where they appear, as the
 * OBJ spec requires. Faces are 0-based index arrays; ngons are kept as-is (the
 * consumer fans or walks the boundary as it pleases). Point-cloud files simply
 * return an empty faces array.
 */
export function parseObjMesh(text) {
  const verts = [];
  const faces = [];
  const lineEdges = []; // from `l` polyline statements — e.g. Blender wireframe exports
  const resolve = (t) => {
    const raw = parseInt(t, 10); // parseInt stops at '/', so v/vt syntax works free
    if (!Number.isFinite(raw) || raw === 0) return -1;
    const idx = raw > 0 ? raw - 1 : verts.length + raw; // negative = relative
    return idx >= 0 && idx < verts.length ? idx : -1;
  };
  for (const line of text.split(/\r\n|\r|\n/)) {
    const c = line.charCodeAt(0);
    if (c !== 118 /* v */ && c !== 102 /* f */ && c !== 108 /* l */) continue;
    if (line[1] !== ' ' && line[1] !== '\t') continue; // skips vt/vn/etc.
    if (line[0] === 'v') {
      const p = line.trim().split(/\s+/);
      const x = +p[1], y = +p[2], z = +p[3];
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) verts.push([x, y, z]);
    } else if (line[0] === 'f') {
      const face = line.trim().split(/\s+/).slice(1).map(resolve).filter((i) => i >= 0);
      if (face.length >= 3) faces.push(face);
    } else {
      // `l a b c ...` — a polyline: each consecutive pair is an edge. This is how
      // Blender exports pure wireframes (cigar.obj's object is named "cigar_min_wire"),
      // which look like point clouds to a faces-only parser.
      const pts = line.trim().split(/\s+/).slice(1).map(resolve).filter((i) => i >= 0);
      for (let i = 0; i + 1 < pts.length; i++) {
        if (pts[i] !== pts[i + 1]) lineEdges.push([pts[i], pts[i + 1]]);
      }
    }
  }
  return { verts, faces, lineEdges };
}

/** Unique undirected edges [a,b] from a face list (polygon boundaries, ngons included). */
export function facesToEdgeList(faces) {
  const seen = new Set();
  const edges = [];
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      if (a === b) continue;
      const key = a < b ? a * 16777216 + b : b * 16777216 + a; // fast numeric key
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
    }
  }
  return edges;
}

/** Flat Float64Array [x0,y0,z0, x1,y1,z1, ...] — the layout the hot loops want. */
export function toFlat(verts) {
  const out = new Float64Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    out[i * 3] = verts[i][0];
    out[i * 3 + 1] = verts[i][1];
    out[i * 3 + 2] = verts[i][2];
  }
  return out;
}
