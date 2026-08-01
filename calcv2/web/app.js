/**
 * Shape inspector UI: load .obj -> worker -> numbers + wireframe.
 *
 * The renderer is plain canvas 2D on purpose. This is a throwaway diagnostic page,
 * and hand-rolling ~80 lines of projection avoids pulling in three.js for something
 * that gets replaced by the real viewer later.
 */

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

let scene = null;      // { points, edges } already normalised into unit-sphere space
let angle = 0;
let spinning = true;
let worker = null;

// ---------------------------------------------------------------- loading

function runFile(name, text) {
  $('status').className = '';
  $('status').textContent = `Reading ${name}…`;
  $('progress').style.width = '0%';
  scene = null;

  worker?.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      $('progress').style.width = `${(m.done / m.total) * 100}%`;
      // Show VS_inf converging rather than freezing on a blank field.
      $('r-vsi').textContent = m.estimate.toFixed(4);
      $('status').textContent = `Sampling ${m.done.toLocaleString()} / ${m.total.toLocaleString()}…`;
    } else if (m.type === 'done') {
      $('progress').style.width = '100%';
      $('status').textContent = `${name} — done.`;
      showMetrics(m.metrics, m.seconds);
      buildScene(m.hullPoints, m.hullFaces, m.metrics.centre, m.metrics.radius);
    } else if (m.type === 'error') {
      $('status').className = 'err';
      $('status').textContent = `Error: ${m.message}`;
      $('progress').style.width = '0%';
    }
  };

  worker.postMessage({ text, samples: Number($('samples').value), seed: 1 });
}

const fmt = (n, d = 3) =>
  n >= 1e6 || (n !== 0 && Math.abs(n) < 1e-3)
    ? n.toExponential(3)
    : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function showMetrics(m, seconds) {
  $('r-svs').textContent = fmt(m.simpleVS, 4);
  $('r-vsi').textContent = fmt(m.vsInf, 4);
  $('r-ve').textContent = `${m.ve.toFixed(3)}%`;
  $('r-hv').textContent = fmt(m.hullVolume);
  $('r-rad').textContent = fmt(m.radius);
  $('r-sv').textContent = fmt(m.sphereVolume);
  $('r-vc').textContent = `${m.vertexCount.toLocaleString()} / ${m.hullVertexCount.toLocaleString()}`;
  $('r-fc').textContent = m.hullFaceCount.toLocaleString();
  $('r-time').textContent = `${seconds.toFixed(1)} s`;

  // The bounding-sphere check is the one number that says whether VE can be trusted:
  // every hull vertex must sit inside the ball VE divided by.
  const ball = $('r-ball');
  if (m.ballExpanded) {
    ball.textContent = 'grown to fit (not minimal)';
    ball.className = 'warn';
  } else if (m.ballMaxExcess === 0) {
    ball.textContent = 'exact ✓';
    ball.className = 'ok';
  } else {
    ball.textContent = `excess ${m.ballMaxExcess.toExponential(1)}`;
    ball.className = m.ballMaxExcess > 1e-9 ? 'warn' : 'ok';
  }
}

// ---------------------------------------------------------------- geometry

function buildScene(points, faces, centre, radius) {
  // Normalise into unit-sphere space so every shape renders at the same size and the
  // bounding sphere is always the unit sphere.
  const pts = points.map((p) => [
    (p[0] - centre[0]) / radius,
    (p[1] - centre[1]) / radius,
    (p[2] - centre[2]) / radius,
  ]);

  const seen = new Set();
  const edges = [];
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }

  // Dense hulls (sphere.obj is ~24k edges) would crawl in canvas 2D; thin them out.
  const MAX = 5000;
  const stride = Math.ceil(edges.length / MAX);
  scene = { pts, edges: stride > 1 ? edges.filter((_, i) => i % stride === 0) : edges };

  // Draw once directly. requestAnimationFrame is paused while the tab is hidden, so
  // without this a background tab would still show an empty canvas after computing.
  render();
}

// ---------------------------------------------------------------- rendering

const TILT = 0.35;

// `rot` is the spin applied to the hull. The bounding sphere is the fixed frame of
// reference — the object turns inside it, never the sphere itself — so drawSphere
// always projects with rot = 0 and only the fixed viewing TILT applies to it.
function project(p, size, rot = angle) {
  const ca = Math.cos(rot), sa = Math.sin(rot);
  let x = p[0] * ca - p[2] * sa;
  let z = p[0] * sa + p[2] * ca;
  let y = p[1];
  const ct = Math.cos(TILT), st = Math.sin(TILT);
  const y2 = y * ct - z * st;
  const z2 = y * st + z * ct;

  const d = 4;
  const f = size * 0.36;
  const k = f / (1 - z2 / d);
  return [size / 2 + x * k, size / 2 - y2 * k, z2];
}

function drawSphere(size) {
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  const ring = (fn) => {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const [sx, sy] = project(fn((i / 64) * Math.PI * 2), size, 0);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    }
    ctx.stroke();
  };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    ring((t) => [Math.cos(t) * Math.cos(a), Math.sin(t), Math.cos(t) * Math.sin(a)]);
  }
  for (let k = 1; k < 6; k++) {
    const phi = (k / 6) * Math.PI - Math.PI / 2;
    const r = Math.cos(phi), y = Math.sin(phi);
    ring((t) => [Math.cos(t) * r, y, Math.sin(t) * r]);
  }
}

function drawHull(size) {
  const { pts, edges } = scene;
  const proj = pts.map((p) => project(p, size));
  ctx.lineWidth = 1;
  for (const [a, b] of edges) {
    const pa = proj[a], pb = proj[b];
    // Fade edges on the far side so the form reads three-dimensionally.
    const depth = (pa[2] + pb[2]) / 2;
    ctx.strokeStyle = `rgba(198,40,165,${0.25 + 0.6 * ((depth + 1) / 2)})`;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
}

function render() {
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  if (!scene) {
    ctx.fillStyle = '#555';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No shape loaded', size / 2, size / 2);
    return;
  }
  if ($('showSphere').checked) drawSphere(size);
  if ($('showHull').checked) drawHull(size);
}

function frame() {
  render();
  if (spinning) angle += 0.006;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Redraw immediately on toggle, so the checkboxes respond even when paused.
$('showSphere').onchange = render;
$('showHull').onchange = render;

// ---------------------------------------------------------------- wiring

$('spin').onclick = () => {
  spinning = !spinning;
  $('spin').textContent = spinning ? 'Pause' : 'Spin';
};

$('drop').onclick = () => $('file').click();
$('file').onchange = (e) => {
  const f = e.target.files[0];
  if (f) f.text().then((t) => runFile(f.name, t));
};

const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) f.text().then((t) => runFile(f.name, t));
});

$('library').onchange = async (e) => {
  const name = e.target.value;
  if (!name) return;
  const text = await (await fetch(`/objs/${encodeURIComponent(name)}`)).text();
  runFile(name, text);
};

// Populate the library dropdown from the neighbouring 3D OBJ folder.
fetch('/objs-list')
  .then((r) => r.json())
  .then((names) => {
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n.replace(/\.obj$/i, '');
      $('library').appendChild(o);
    }
    $('status').textContent = `Ready — ${names.length} shapes in the library.`;
  })
  .catch(() => {});
