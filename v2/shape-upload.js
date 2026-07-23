/**
 * Calc V2 addition: measure any .obj and feed the result into the V1 app.
 *
 * This file is deliberately an ADAPTER, not a fork. The V1 bundle is untouched; the
 * bridge into it is the app's own volume-efficiency input, whose focusout handler
 * divides the raw string by 100 and pushes it through the model + pubsub — so a
 * computed VE propagates to Ship and Fleet exactly like a hand-typed one. (The string
 * must be a plain number: the handler does `value / 100`, so a "%" would give NaN.)
 *
 * Per Toby: only three numbers surface — simple VS, VS∞, VE. The pipeline's other
 * diagnostics stay internal (the bounding-sphere check logs a console warning if it
 * ever degrades, rather than occupying UI).
 */

const SAMPLES = 69420; // reference figure from the Shape-Volume Scalar paper

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- inject UI

// Upload button, spanning the bottom of the shape-button grid.
const controls = $('.shape-controls');
const uploadBtn = document.createElement('button');
uploadBtn.className = 'shape-control-button shape-button-secondary';
uploadBtn.style.gridColumn = '1 / -1';
uploadBtn.style.minHeight = '4.5rem';
uploadBtn.innerHTML = '<span class="shape-control-button-label">UPLOAD .OBJ</span>';
controls.appendChild(uploadBtn);

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.obj';
fileInput.hidden = true;
document.body.appendChild(fileInput);

// VS∞ row in the results panel, directly after the Simple VS row.
const resultsPanel = $('.shape-results');
const vsInfHeader = document.createElement('div');
vsInfHeader.className = 'shape-results-header';
vsInfHeader.innerHTML = 'VS<sub>∞</sub> :';
const vsInfCell = document.createElement('div');
vsInfCell.className = 'shape-results-data';
vsInfCell.dataset.v2 = 'vs-inf';
vsInfCell.textContent = '—';
const veHeader = [...resultsPanel.querySelectorAll('.shape-results-header')]
  .find((h) => h.textContent.includes('Volume Efficiency'));
resultsPanel.insertBefore(vsInfHeader, veHeader);
resultsPanel.insertBefore(vsInfCell, veHeader);

// Overlay canvas covering the V1 three.js viewer while an uploaded shape is active.
const viewerBox = $('.shape-viewer-container');
const v1Canvas = $('[data-shape="canvas"]');
viewerBox.style.position = 'relative';
const overlay = document.createElement('canvas');
overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;background:var(--color-bg-primary,#111);';
viewerBox.appendChild(overlay);

// ---------------------------------------------------------------- state

let worker = null;
let scene = null;          // {pts, edges} in unit-sphere space
let angle = 0;
let spinning = true;
let overlayActive = false;

// ---------------------------------------------------------------- pipeline

function loadObjText(name, text) {
  vsInfCell.textContent = 'computing…';
  worker?.terminate();
  worker = new Worker('/calcv2/web/worker.js', { type: 'module' });

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      vsInfCell.textContent = m.estimate.toFixed(3);
    } else if (m.type === 'done') {
      applyResult(name, m);
    } else if (m.type === 'error') {
      vsInfCell.textContent = '—';
      $('[data-shape="shape"]').textContent = `Error: ${m.message}`;
    }
  };
  worker.postMessage({ text, samples: SAMPLES, seed: 1 });
}
// Exposed for the automated tests (and any future library wiring).
window.__v2LoadObjText = loadObjText;

function applyResult(name, { metrics, hullPoints, hullFaces }) {
  const displayName = name.replace(/\.obj$/i, '').toUpperCase();

  // The three numbers.
  $('[data-shape="shape"]').textContent = displayName;
  $('[data-shape="volume-scalar"]').textContent = round3(metrics.simpleVS);
  vsInfCell.textContent = metrics.vsInf.toFixed(3);

  // Feed VE through the app's own input pathway so Ship/Fleet recompute.
  const veInput = $('[data-shape="input-volume-efficiency"]');
  veInput.value = metrics.ve.toFixed(3); // plain number — handler does value/100
  veInput.dispatchEvent(new Event('focusout'));
  // The app's renderer ceils the display ("55%"); the model holds the exact value.
  // Re-write the field cosmetically so the shown figure is the measured one.
  veInput.value = `${metrics.ve.toFixed(3)}%`;

  if (metrics.ballExpanded || metrics.ballMaxExcess > 1e-9) {
    console.warn('[v2] bounding sphere check degraded:', metrics);
  }

  buildScene(hullPoints, hullFaces, metrics.centre, metrics.radius);
  showOverlay(true);
}

const round3 = (x) => String(Math.round(x * 1000) / 1000);

// ---------------------------------------------------------------- viewer

function buildScene(points, faces, centre, radius) {
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
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
    }
  }
  const MAX = 5000;
  const stride = Math.ceil(edges.length / MAX);
  scene = { pts, edges: stride > 1 ? edges.filter((_, i) => i % stride === 0) : edges };
}

function showOverlay(on) {
  overlayActive = on;
  overlay.style.display = on ? 'block' : 'none';
  v1Canvas.style.visibility = on ? 'hidden' : 'visible';
  if (on) render();
}

const TILT = 0.35;

// The bounding sphere is the fixed frame of reference: the object spins inside it,
// the sphere itself never moves. `rot` therefore applies to the hull only.
function project(p, w, h, rot) {
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const x = p[0] * ca - p[2] * sa;
  const z = p[0] * sa + p[2] * ca;
  const y = p[1];
  const ct = Math.cos(TILT), st = Math.sin(TILT);
  const y2 = y * ct - z * st;
  const z2 = y * st + z * ct;
  const k = (Math.min(w, h) * 0.36) / (1 - z2 / 4);
  return [w / 2 + x * k, h / 2 - y2 * k, z2];
}

function render() {
  const w = (overlay.width = overlay.clientWidth || 600);
  const h = (overlay.height = overlay.clientHeight || 400);
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!scene) return;

  // Static wireframe sphere.
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  const ring = (fn) => {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const [sx, sy] = project(fn((i / 64) * Math.PI * 2), w, h, 0);
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

  // Spinning hull, V1 accent magenta, depth-faded.
  const proj = scene.pts.map((p) => project(p, w, h, angle));
  for (const [a, b] of scene.edges) {
    const pa = proj[a], pb = proj[b];
    const depth = (pa[2] + pb[2]) / 2;
    ctx.strokeStyle = `rgba(198,40,165,${0.25 + 0.6 * ((depth + 1) / 2)})`;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
}

(function frame() {
  if (overlayActive) {
    render();
    if (spinning) angle += 0.006;
  }
  requestAnimationFrame(frame);
})();

// ---------------------------------------------------------------- wiring

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) f.text().then((t) => loadObjText(f.name, t));
  fileInput.value = '';
});

// V1's pause button drives its own viewer; mirror it for the overlay.
$('[data-shape="animation-button"]').addEventListener('click', () => { spinning = !spinning; });

// Any preset shape click returns control to V1: its handler restores that shape's
// hardcoded VE and shape name itself; we just clear our overlay and VS∞ readout.
for (const btn of document.querySelectorAll('[data-shape-button]')) {
  btn.addEventListener('click', () => {
    vsInfCell.textContent = '—';
    showOverlay(false);
  });
}
