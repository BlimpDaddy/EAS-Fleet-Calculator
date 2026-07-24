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

// Style toggle for uploads only — flips between sparse smoothed curves and the full
// thin-line hull mesh. Bottom-left, mirroring V1's pause button bottom-right, reusing
// its class so it inherits Frazer's styling. Label shows the CURRENT style.
const styleBtn = document.createElement('button');
styleBtn.className = 'shape-viewer-button';
styleBtn.style.cssText = 'left:1rem;right:auto;width:auto;z-index:2;display:none;';
styleBtn.textContent = 'CURVES';
viewerBox.appendChild(styleBtn);
styleBtn.addEventListener('click', () => {
  const next = replica.style === 'curves' ? 'mesh' : 'curves';
  replica.setStyle(next);
  styleBtn.textContent = next.toUpperCase();
});

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

// Preset metrics are deterministic (fixed sample count and seed on a fixed .glb), so
// they persist across visits: a returning user's first paint shows accurate figures
// instantly instead of the hardcoded ones for a second. Keyed by pipeline parameters
// so a change to either invalidates automatically.
const LS_KEY = `v2-preset-metrics:s${SAMPLES}:seed1`;
try {
  const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  for (const [k, v] of Object.entries(stored)) presetCache.set(k, v);
} catch { /* corrupt storage — recompute from scratch */ }

function persistPresetCache() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(presetCache)));
  } catch { /* storage full/blocked — cache stays in-memory only */ }
}

// Which preset's computed figures should currently be on screen (null = upload mode).
let currentPreset = null;

async function computePreset(shapeId) {
  showOverlay(false); // presets render in V1's own viewer
  currentPreset = shapeId;
  const cached = presetCache.get(shapeId);
  if (cached) {
    const id = ++runId; // cancel any in-flight run so it can't overwrite these numbers
    worker?.terminate();
    // V1's own click handler runs AFTER this one (its listeners attach late, once its
    // async GLTF loading finishes) and re-renders the hardcoded config values. Applying
    // synchronously would be overwritten — defer past it (the guard observer below
    // also catches any later repaint).
    setTimeout(() => { if (id === runId) applyNumbers(cached); }, 50);
    return;
  }
  const buf = await (await fetch(`/assets/shape-models/${shapeId}.glb`)).arrayBuffer();
  compute({ glb: buf }, [buf], (m) => {
    presetCache.set(shapeId, m.metrics);
    persistPresetCache();
    if (currentPreset === shapeId) applyNumbers(m.metrics);
  });
}

for (const id of PRESETS) {
  $(`[data-shape-button="${id}"]`)?.addEventListener('click', () => computePreset(id));
}

// Guard against V1 repainting hardcoded figures over computed ones. V1's init is
// async (it loads six .glb files), so on a cold start its onInit can fire AFTER our
// first compute lands and rewrite the VS cell / VE field with config values — the
// user's first landing would show the old numbers. V1's re-renders always rewrite the
// VS cell, so watch it: whenever it no longer shows the computed value for the active
// preset, reassert. Re-applying writes the expected value, so the observer settles.
const vsCellGuard = new MutationObserver(() => {
  if (!currentPreset) return;
  const m = presetCache.get(currentPreset);
  if (!m) return;
  if ($('[data-shape="volume-scalar"]').textContent !== round3(m.simpleVS)) {
    const expect = currentPreset;
    setTimeout(() => { if (currentPreset === expect) applyNumbers(m); }, 0);
  }
});
vsCellGuard.observe($('[data-shape="volume-scalar"]'), { childList: true, characterData: true, subtree: true });

// NOTE: the initial computePreset call lives at the END of this file. Calling it here
// would run showOverlay() before the pause-ownership bindings below it are initialised
// (TDZ ReferenceError) — and being async, that throw disappears into an unhandled
// rejection, silently breaking load-time computation. Learned the hard way.

// ---------------------------------------------------------------- uploads

function loadObjText(name, text) {
  currentPreset = null; // upload mode — release the preset repaint guard
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

// Spin/pause control. The pause button is shared between two viewers that are never
// visible at the same time, so it has two owners depending on mode:
//   • preset mode  — V1 owns it: its own click handler toggles its viewer AND the icon.
//   • upload mode  — this adapter owns it: we toggle the replica and set the icon
//                    ourselves, and block V1's handler so the two can't fight.
// This avoids relying on any ordering between V1's handler and ours (a real-click race
// that produced an inverted, one-step-lagged button). We track V1's own spin state by
// watching its clicks in preset mode, so the icon can be restored correctly when an
// upload closes and V1's viewer takes over again.
const ICON_PLAY = '⏸';   // shown while spinning (click to pause)
const ICON_PAUSE = '▶';  // shown while paused (click to play)
const animBtn = $('[data-shape="animation-button"]');
let overlayActive = false;
let v1Spinning = animBtn.textContent.includes(ICON_PLAY); // V1 starts spinning

function showOverlay(on) {
  overlayActive = on;
  overlayCanvas.style.display = on ? 'block' : 'none';
  styleBtn.style.display = on ? 'block' : 'none';
  v1Canvas.style.visibility = on ? 'hidden' : 'visible';
  if (on) {
    replica.isSpinning = true;              // uploads always start spinning
    animBtn.textContent = ICON_PLAY;
    replica.start();
  } else {
    replica.stop();
    // Returning to a preset: V1's viewer resumes at its own (untouched) spin state,
    // so restore the icon to match it — we may have changed the icon during upload mode.
    animBtn.textContent = v1Spinning ? ICON_PLAY : ICON_PAUSE;
  }
}

// ---------------------------------------------------------------- wiring

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) f.text().then((t) => loadObjText(f.name, t));
  fileInput.value = '';
});

// Intercept clicks on the pause button in the CAPTURE phase, on an ancestor (the viewer
// container), so this runs BEFORE the button's own listeners regardless of the order
// V1 and this adapter attached them.
//   • upload mode: we own it — toggle the replica, set the icon, and stopPropagation so
//     V1's handler on the button never fires (V1's viewer + state stay frozen).
//   • preset mode: let V1's handler run, and mirror the resulting icon into v1Spinning
//     so we always know V1's state for the icon restore in showOverlay().
viewerBox.addEventListener('click', (e) => {
  if (!e.target.closest('[data-shape="animation-button"]')) return;
  if (overlayActive) {
    e.stopPropagation(); // capture-phase on ancestor: prevents V1's button listener
    replica.isSpinning = !replica.isSpinning;
    animBtn.textContent = replica.isSpinning ? ICON_PLAY : ICON_PAUSE;
  } else {
    // V1's (bubble-phase) handler will toggle its viewer and icon; record the result.
    queueMicrotask(() => { v1Spinning = animBtn.textContent.includes(ICON_PLAY); });
  }
}, true);

// ---------------------------------------------------------------- boot

// The app starts on the sunship preset — the first landing must show computed
// figures. This runs LAST, after every binding above is initialised (see the note
// in the presets section for why calling it earlier silently breaks).
computePreset('sunship');
