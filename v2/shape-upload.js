/**
 * Calc V2 adapter: every shape on the Shape page — the six presets AND any uploaded
 * .obj — is measured in real time by the V2 pipeline. Nothing displays a hardcoded
 * VS or VE any more.
 *
 * - Presets: the pipeline runs on the very .glb geometry the V1 viewer displays, so
 *   the number and the picture are the same object. V1's own viewer keeps rendering
 *   them (untouched); only the three figures are overwritten once computed.
 * - Uploads: rendered in ReplicaViewer (v2/viewer3d.js), a parameter-for-parameter
 *   copy of the V1 viewer — fat orange lines, cursor-drag spin — with the measuring
 *   sphere being the actual miniball VE divided by.
 *
 * The bridge into V1 is its own volume-efficiency input: its focusout handler does
 * `value / 100`, so a plain number string is set and focusout dispatched, and the
 * whole Ship/Fleet chain recomputes. V1's renderer ceils the displayed VE, so the
 * field is re-written cosmetically afterwards with the measured figure.
 *
 * Per Toby: only simple VS, VS∞ and VE surface in the UI.
 */

import { ReplicaViewer } from './viewer3d.js';

const SAMPLES = 69420; // reference figure from the Shape-Volume Scalar paper
const PRESETS = ['sunship', 'cigar', 'bottle', 'car', 'washingmachine', 'aerosmena'];

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- inject UI

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

// Overlay canvas over the V1 viewer, used only while an uploaded shape is active.
// Stacking (bottom→top): V1 canvas (z auto) < overlay (z 1) < pause button (z 2).
// The overlay must sit above V1's canvas to show the upload, but BELOW the pause
// button — the button lives inside this same container, so without the z-index the
// overlay would cover it and swallow real mouse clicks (scripted .click() bypasses
// hit-testing, which is why this hid during automated testing). The overlay still
// receives OrbitControls drag everywhere the button isn't.
const viewerBox = $('.shape-viewer-container');
const v1Canvas = $('[data-shape="canvas"]');
viewerBox.style.position = 'relative';
$('[data-shape="animation-button"]').style.zIndex = '2';
const overlayCanvas = document.createElement('canvas');
overlayCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;z-index:1;';
viewerBox.appendChild(overlayCanvas);
const replica = new ReplicaViewer(overlayCanvas);

// ---------------------------------------------------------------- compute

let worker = null;
let runId = 0;
const presetCache = new Map(); // shapeId -> metrics (deterministic: fixed seed)

function compute(payload, transfer, onDone) {
  const id = ++runId;
  vsInfCell.textContent = 'computing…';
  worker?.terminate();
  worker = new Worker('/calcv2/web/worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    if (id !== runId) return; // superseded by a newer request
    const m = e.data;
    if (m.type === 'progress') {
      vsInfCell.textContent = m.estimate.toFixed(3);
    } else if (m.type === 'done') {
      onDone(m);
    } else if (m.type === 'error') {
      vsInfCell.textContent = '—';
      $('[data-shape="shape"]').textContent = `Error: ${m.message}`;
    }
  };
  worker.postMessage({ samples: SAMPLES, seed: 1, ...payload }, transfer ?? []);
}

/** Write the three figures and push VE through V1's own input pathway. */
function applyNumbers(metrics) {
  $('[data-shape="volume-scalar"]').textContent = round3(metrics.simpleVS);
  vsInfCell.textContent = metrics.vsInf.toFixed(3);

  const veInput = $('[data-shape="input-volume-efficiency"]');
  veInput.value = metrics.ve.toFixed(3); // plain number — V1's handler does value/100
  veInput.dispatchEvent(new Event('focusout'));
  // V1 re-renders the field ceil'd ("55%"); show the measured figure instead.
  veInput.value = `${metrics.ve.toFixed(3)}%`;

  if (metrics.ballExpanded || metrics.ballMaxExcess > 1e-9) {
    console.warn('[v2] bounding sphere check degraded:', metrics);
  }
}

const round3 = (x) => String(Math.round(x * 1000) / 1000);

// ---------------------------------------------------------------- presets

async function computePreset(shapeId) {
  showOverlay(false); // presets render in V1's own viewer
  const cached = presetCache.get(shapeId);
  if (cached) {
    const id = ++runId; // cancel any in-flight run so it can't overwrite these numbers
    worker?.terminate();
    // V1's own click handler runs AFTER this one (its listeners attach late, once its
    // async GLTF loading finishes) and re-renders the hardcoded config values. Applying
    // synchronously would be overwritten — defer past it.
    setTimeout(() => { if (id === runId) applyNumbers(cached); }, 50);
    return;
  }
  const buf = await (await fetch(`/assets/shape-models/${shapeId}.glb`)).arrayBuffer();
  compute({ glb: buf }, [buf], (m) => {
    presetCache.set(shapeId, m.metrics);
    applyNumbers(m.metrics);
  });
}

for (const id of PRESETS) {
  $(`[data-shape-button="${id}"]`)?.addEventListener('click', () => computePreset(id));
}

// The app starts on the sunship preset showing hardcoded figures — replace them with
// computed ones immediately.
computePreset('sunship');

// ---------------------------------------------------------------- uploads

function loadObjText(name, text) {
  compute({ text }, null, (m) => {
    $('[data-shape="shape"]').textContent = name.replace(/\.obj$/i, '').toUpperCase();
    applyNumbers(m.metrics);
    replica.setShape(m.hullPoints, facesToEdges(m.hullFaces), m.metrics.centre, m.metrics.radius);
    showOverlay(true);
  });
}
window.__v2LoadObjText = loadObjText; // used by automated tests
window.__v2Replica = replica;         // used by automated tests

function facesToEdges(faces) {
  const seen = new Set();
  const edges = [];
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
    }
  }
  return edges;
}

// The V1 pause button's icon is the single source of truth for spin state: V1 sets
// ⏸ while playing, ▶ while paused, and always keeps it correct. Reading it (rather
// than keeping a second independent boolean) is what prevents the two viewers drifting.
const animBtn = $('[data-shape="animation-button"]');
const buttonWantsSpin = () => animBtn.textContent.includes('⏸');

function showOverlay(on) {
  overlayCanvas.style.display = on ? 'block' : 'none';
  v1Canvas.style.visibility = on ? 'hidden' : 'visible';
  if (on) {
    replica.isSpinning = buttonWantsSpin(); // adopt whatever the button currently shows
    replica.start();
  } else {
    replica.stop();
  }
}

// ---------------------------------------------------------------- wiring

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) f.text().then((t) => loadObjText(f.name, t));
  fileInput.value = '';
});

// V1's pause button drives its own viewer; mirror its resulting state onto the replica.
// The mirror is deferred to a microtask so V1's (synchronous) click handler has already
// flipped the button icon — we read the truth rather than guessing a toggle direction.
animBtn.addEventListener('click', () => {
  queueMicrotask(() => { replica.isSpinning = buttonWantsSpin(); });
});
