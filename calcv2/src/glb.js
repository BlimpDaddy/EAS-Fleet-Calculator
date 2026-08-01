/**
 * Minimal GLB (binary glTF 2.0) vertex extractor.
 *
 * Purpose: measure the exact geometry the V1 viewer displays. The preset shapes are
 * shipped as .glb files with the wireframe baked in as line primitives; running the
 * pipeline on the .glb's own POSITION data guarantees the number and the picture are
 * the same object, with no faith needed in an .obj ↔ .glb mapping.
 *
 * Handles: GLB container, node hierarchy with matrix/TRS transforms, float32 VEC3
 * POSITION accessors, byteStride. Node transforms matter — a rotation changes the
 * axis-aligned extents and therefore simple VS. Rejects Draco/sparse (not present in
 * these files, not worth the code).
 */

// ---- 4x4 column-major matrix helpers (glTF convention) ----

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function matMul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

/** Compose T * R * S from glTF node fields (rotation is an xyzw quaternion). */
function trsToMat(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function applyMat(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ---- GLB container ----

/** @param {ArrayBuffer|Uint8Array} data @returns {number[][]} [x,y,z] vertices */
export function parseGlbVertices(data) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  if (dv.getUint32(4, true) !== 2) throw new Error('unsupported glTF version');

  let json = null;
  let bin = null;
  let off = 12;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)); // 'JSON'
    else if (type === 0x004e4942) bin = chunk;                                    // 'BIN\0'
    off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
  }
  if (!json) throw new Error('GLB has no JSON chunk');

  const verts = [];

  function readPositions(accIdx, world) {
    const acc = json.accessors[accIdx];
    if (acc.sparse) throw new Error('sparse accessors not supported');
    if (acc.componentType !== 5126 || acc.type !== 'VEC3')
      throw new Error(`unsupported POSITION accessor (${acc.componentType}/${acc.type})`);
    const bv = json.bufferViews[acc.bufferView];
    if (!bin) throw new Error('accessor references missing BIN chunk');
    const stride = bv.byteStride ?? 12;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const f = new DataView(bin.buffer, bin.byteOffset + base);
    const identity = world === IDENT;
    for (let i = 0; i < acc.count; i++) {
      const x = f.getFloat32(i * stride, true);
      const y = f.getFloat32(i * stride + 4, true);
      const z = f.getFloat32(i * stride + 8, true);
      verts.push(identity ? [x, y, z] : applyMat(world, x, y, z));
    }
  }

  function walk(nodeIdx, parent) {
    const node = json.nodes[nodeIdx];
    const local = node.matrix ?? trsToMat(node.translation, node.rotation, node.scale);
    const world = parent === IDENT && local === IDENT ? IDENT : matMul(parent, local);
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.extensions?.KHR_draco_mesh_compression) throw new Error('Draco not supported');
        if (prim.attributes?.POSITION !== undefined) readPositions(prim.attributes.POSITION, world);
      }
    }
    for (const c of node.children ?? []) walk(c, world);
  }

  const sceneNodes = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  for (const n of sceneNodes) walk(n, IDENT);
  // Fallback: some exporters omit the scene graph entirely.
  if (verts.length === 0 && json.nodes) for (let i = 0; i < json.nodes.length; i++) walk(i, IDENT);

  return verts;
}
