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
import { VS_WARNINGS } from './shape-config.js?v=1.8';

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

// (The CURVES/MESH style toggle is gone — per Toby, the viewer now always shows the
// original mesh in orange with the measured hull as a faint magenta bubble.)

// ---------------------------------------------------------------- compute

let worker = null;
let runId = 0;
const presetCache = new Map(); // shapeId -> metrics (deterministic: fixed seed)

function compute(payload, transfer, onDone) {
  const id = ++runId;
  vsInfCell.textContent = 'computing…';
  worker?.terminate();
  worker = new Worker('/calcv2/web/worker.js?v=1.14', { type: 'module' })  // engine cache stamp — see dynamic-page.js;
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

// ---------------------------------------------------------------- warnings
// Threshold flags (shape-config.js). The glyph is an amber warning triangle drawn
// with paths only — no SVG text nodes — so the cell's textContent stays exactly the
// number and the guard observer's string comparison is unaffected.

const warnFor = (value, t) => (value < t.low ? t.lowText : value > t.high ? t.highText : null);

const warnSvg = (fill, mark) =>
  '<svg viewBox="0 0 24 22" width="0.85em" height="0.85em" aria-label="warning">' +
  `<path d="M12 1 L23 21 H1 Z" fill="${fill}"/>` +
  `<rect x="10.9" y="7.5" width="2.2" height="7" rx="1.1" fill="${mark}"/>` +
  `<circle cx="12" cy="17.5" r="1.4" fill="${mark}"/></svg>`;

function warnGlyph(text) {
  const s = document.createElement('span');
  s.className = 'v2-warn';
  s.title = text;
  s.innerHTML = warnSvg('#FF9900', '#111111');
  return s;
}

/** Set a results cell to a value, with an optional trailing warning triangle. */
function writeCell(cell, valueText, warning) {
  cell.textContent = valueText;
  if (warning) cell.appendChild(warnGlyph(warning));
}

const warnStyle = document.createElement('style');
warnStyle.textContent =
  '.v2-warn{margin-left:.35em;cursor:help;display:inline-block;vertical-align:baseline;line-height:1;}' +
  '.v2-warn svg{display:inline-block;vertical-align:-0.05em;}' +
  '.v2-warn-ve{position:absolute;margin:0;display:none;}' +
  // Cap the VE field's width so its right-edge glyph lines up under the VS glyphs
  // (the input otherwise stretches across the whole grid column).
  'input.shape-ve-input{width:7em;min-width:0;justify-self:start;}';
document.head.appendChild(warnStyle);

// VE's figure lives in V1's input field (deliberately editable — the quick-override
// easter egg), and an input can't hold child elements. The glyph is instead an
// absolutely-positioned overlay pinned to the field's right edge: as an abs-positioned
// child of the results grid it takes no grid cell, so the layout never shifts.
const veInputEl = $('[data-shape="input-volume-efficiency"]');
resultsPanel.style.position = 'relative';
const veWarnEl = warnGlyph('');
veWarnEl.classList.add('v2-warn-ve');
resultsPanel.appendChild(veWarnEl);

const veMeasure = document.createElement('canvas').getContext('2d');
function setVeWarning(vePercent) {
  fixVeMirrors(); // every VE change (computed or typed) re-syncs the Ship/Fleet mirrors
  const t = VS_WARNINGS.ve;
  const critical = Number.isFinite(vePercent) && vePercent < t.critical;
  const w = !Number.isFinite(vePercent) ? null
    : critical ? t.criticalText
    : warnFor(vePercent, t);
  if (!w) { veWarnEl.style.display = 'none'; return; }
  veWarnEl.title = w;
  veWarnEl.innerHTML = critical ? warnSvg('#FF2A2A', '#FFFFFF') : warnSvg('#FF9900', '#111111');
  veWarnEl.style.display = 'inline-block';
  const cs = getComputedStyle(veInputEl);
  veWarnEl.style.fontSize = cs.fontSize; // match sibling glyphs
  // Hug the number like the VS glyphs do: measure the field's text and sit just
  // after it (clamped inside the field's right edge).
  veMeasure.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const textW = veMeasure.measureText(veInputEl.value).width;
  const afterText = veInputEl.offsetLeft + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + textW + 8;
  const maxLeft = veInputEl.offsetLeft + veInputEl.offsetWidth - veWarnEl.offsetWidth - 6;
  veWarnEl.style.left = `${Math.min(afterText, maxLeft)}px`;
  veWarnEl.style.top = `${veInputEl.offsetTop + (veInputEl.offsetHeight - veWarnEl.offsetHeight) / 2}px`;
}
window.addEventListener('resize', () => {
  if (veWarnEl.style.display !== 'none') setVeWarning(parseFloat(veInputEl.value));
});
// Ship & Fleet "Previous Properties" now share one combined device — "VS/VE:
// 1.6 / 54.3%" (Toby's 2026-08-10 recap redesign) — written into the Ship
// panel's VS cell and the Fleet panel's (relabelled) VE cell. Both truncated
// to 1dp, never rounded up; page 1 keeps full 3dp. This also retires the old
// three-pages-three-answers bug: V1 CEIL'd its model on Ship ("55") and
// rendered the stale preset CONFIG on Fleet (0.5297 -> "53"). V1 still writes
// its own values into these cells (and into the now-hidden Ship VE cell); the
// observers rewrite them on sight. Source of truth: the computed VS cell and
// the VE input, which carry presets, uploads, and manual overrides alike.
const veMirrors = ['[data-ship="selected-volumescalar"]', '[data-fleet="selected-volumeefficiency"]']
  .map((s) => $(s)).filter(Boolean);
const trunc1 = (x) => (Math.floor(x * 10) / 10).toFixed(1);
function fixVeMirrors() {
  const ve = parseFloat(veInputEl.value);
  const vs = parseFloat($('[data-shape="volume-scalar"]')?.textContent);
  if (!Number.isFinite(ve) || !Number.isFinite(vs)) return;
  const want = `${trunc1(vs)} / ${trunc1(ve)}%`;
  for (const el of veMirrors) if (el.textContent !== want) el.textContent = want;
}
const veMirrorObs = new MutationObserver(fixVeMirrors);
for (const el of veMirrors) veMirrorObs.observe(el, { childList: true, characterData: true, subtree: true });

// Manual override typed into the field: V1's focusout handler ingests value/100 and
// re-renders the field ceil'd — with float noise, so a typed "7" (0.07*100 =
// 7.000000000000001) displays as "8%". Grab the raw typed value FIRST (capture-phase
// listeners on the target run before V1's bubble listener), then after V1 has
// ingested, restore the typed figure and judge the warning against it — the same
// cosmetic rewrite applyNumbers already does for computed figures.
veInputEl.addEventListener('focusout', () => {
  const typed = parseFloat(veInputEl.value);
  // Defer past V1's handler — its listener attaches LATER than ours (V1's init is
  // async), so a synchronous rewrite here would hand V1 "7%" and NaN its model.
  setTimeout(() => {
    if (Number.isFinite(typed)) veInputEl.value = `${typed}%`;
    setVeWarning(typed);
  }, 0);
});
// Long-standing V1 trap: the field displays "54.394%" but V1's focusout parser can't
// digest the "%" (Number("54.394%") is NaN, and the whole chain freaks out). Strip it
// the moment the field gains focus, so editing always starts from a clean number.
veInputEl.addEventListener('focusin', () => {
  veInputEl.value = veInputEl.value.replace(/[%\s]/g, '');
});

/** Write the three figures and push VE through V1's own input pathway. */
function applyNumbers(metrics) {
  writeCell($('[data-shape="volume-scalar"]'), round3(metrics.simpleVS),
    warnFor(metrics.simpleVS, VS_WARNINGS.simpleVS));
  writeCell(vsInfCell, metrics.vsInf.toFixed(3),
    warnFor(metrics.vsInf, VS_WARNINGS.vsInf));
  // VS∞ row on the Ship page's Previous Properties pane (a V2 addition to the
  // static HTML) — ours alone, so this single write covers presets AND uploads.
  const shipVsInf = $('[data-v2="ship-vs-inf"]');
  if (shipVsInf) shipVsInf.textContent = metrics.vsInf.toFixed(3);

  const veInput = $('[data-shape="input-volume-efficiency"]');
  veInput.value = metrics.ve.toFixed(3); // plain number — V1's handler does value/100
  veInput.dispatchEvent(new Event('focusout'));
  // V1 re-renders the field ceil'd ("55%"); show the measured figure instead.
  veInput.value = `${metrics.ve.toFixed(3)}%`;
  setVeWarning(metrics.ve);

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

// ---------------------------------------------------------------- shape channel
// M6 stage 2: publish the ACTIVE shape identity for the DYNAMIC page.
// Presets carry identity only (their dynamics records are precomputed —
// /calcv2/src/presetDynamics.js — resolved by the consumer); uploads
// carry the worker's live-measured dynamics payload. Revisions make
// stale async completions detectable downstream (the ruled
// stale-completion-discard), on top of this file's own runId guard.
// IDENTITY RULE (Toby ruling 2026-08-16): kind 'preset' + id is the
// ONLY Sunship credential — an upload named Sunship.obj is kind
// 'upload', full stop (preset identity, never filename).
let shapeRevision = 0;
function publishShape(shape) {
  window.__v2ActiveShape = { revision: ++shapeRevision, ...shape };
  window.dispatchEvent(new CustomEvent('v2-shape-change'));
}

async function computePreset(shapeId) {
  showOverlay(false); // presets render in V1's own viewer
  currentPreset = shapeId;
  publishShape({ kind: 'preset', id: shapeId, name: shapeId.toUpperCase(), dynamics: null });
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
  const cell = $('[data-shape="volume-scalar"]');
  // A V1 repaint replaces the cell's content wholesale, which also strips our
  // warning glyph — so check both the number AND the glyph, not just the text
  // (V1 could write the identical numeric string and the glyph would vanish).
  const glyphOk = (cell.querySelector('.v2-warn')?.title ?? null)
    === warnFor(m.simpleVS, VS_WARNINGS.simpleVS);
  if (cell.textContent !== round3(m.simpleVS) || !glyphOk) {
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
  compute({ text, dynamics: true }, null, (m) => {
    $('[data-shape="shape"]').textContent = name.replace(/\.obj$/i, '').toUpperCase();
    applyNumbers(m.metrics);
    publishShape({
      kind: 'upload',
      id: null,
      name: $('[data-shape="shape"]').textContent,
      dynamics: m.dynamics ?? null, // worker-measured (hull fallback labelled)
    });
    replica.setShape(m.meshSegments, m.meshPoints, m.hullPoints, facesToEdges(m.hullFaces), m.hullFaces, m.metrics.centre, m.metrics.radius);
    showOverlay(true);
    // V1 renders the Ship/Fleet "Previous Properties" panes (icon, shape name, VS)
    // from its preset config on its own "shape" event, which uploads never fire — so
    // all three go stale, showing whatever preset was last active. Stamp the uploaded
    // shape's freeze-frame, name, and computed VS directly; any later preset click
    // re-publishes V1's own values over them.
    const icon = replica.snapshot();
    const displayName = $('[data-shape="shape"]').textContent;
    for (const sel of ['[data-ship="selected-icon"]', '[data-fleet="selected-icon"]']) {
      const el = $(sel);
      if (el) el.src = icon;
    }
    for (const sel of ['[data-ship="selected-shape"]', '[data-fleet="selected-shape"]']) {
      const el = $(sel);
      if (el) el.textContent = displayName;
    }
    const vsPane = $('[data-ship="selected-volumescalar"]');
    if (vsPane) vsPane.textContent = $('[data-shape="volume-scalar"]').textContent;
    // ...and the Scale Reference chart, which V1 only ever repaints on a
    // preset click. A later preset click calls V1's own loadFGShape and
    // replaces this outline, so ownership hands back cleanly.
    drawUploadSilhouette(m.hullPoints);
  });
}
window.__v2LoadObjText = loadObjText; // used by automated tests
window.__v2Replica = replica;         // used by automated tests

/* ------------------------------------------------------------------ *
 * SCALE REFERENCE for uploads (Toby, 2026-08-18: the chart "does NOT
 * change... it was stuck on the bottle which was my previous selection
 * though i was using" an uploaded hull of his own).
 *
 * V1 owns that chart and draws it from a fixed set of authored
 * silhouettes in assets/charts/scale-ruler-chart/foreground_shapes.svg,
 * selected by preset id. Its loadFGShape() only ever runs on a preset
 * button click, so an upload left the previous preset's outline standing
 * next to the man and the container ship — the one panel on the page
 * whose entire job is "how big is YOUR ship" was showing someone else's.
 *
 * The SVG does carry a spare generic 'ship' outline, which would have
 * been a one-line fix and the wrong one: swapping one shape the user did
 * not upload for another shape the user did not upload. The uploaded
 * geometry is right here, so the chart gets ITS silhouette.
 *
 * The outline is the CONVEX HULL's profile, not the mesh's. That is a
 * real simplification — a concave waist reads as straight — but it is the
 * same body VS and VE are computed from, so the picture and the numbers
 * describe one object, and the hull silhouette is exactly the 2D hull of
 * the projected hull vertices, which is cheap and exact rather than an
 * approximation of an outline.
 *
 * Convention matched to V1's authored art, measured from it: each shape
 * fills the 100x100 box on its LARGER dimension, is centred
 * horizontally, and sits on the floor at y=100 (bottle 28.3x99 upright,
 * cigar 99.1x19 flat — the art keeps each object's natural attitude, and
 * so does this, by drawing the model in its own axes with Y up). The
 * background man and container ship do the scaling; the foreground shape
 * is always full-size.
 */
function hull2d(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (src) => {
    const out = [];
    for (const q of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return half(p).concat(half(p.slice().reverse()));
}

function uploadSilhouettePath(hullPoints) {
  if (!Array.isArray(hullPoints) || hullPoints.length < 3) return null;
  // Horizontal = whichever of X/Z the model is longer in; vertical = Y.
  // Y-up is all but universal in .obj, and it keeps this outline agreeing
  // with the 3D replica the user is looking at two panels away — the least
  // surprising result, and the only one we can honestly infer.
  const ext = (i) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of hullPoints) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
    return [lo, hi];
  };
  const [x0, x1] = ext(0), [z0, z1] = ext(2);
  const hAxis = (x1 - x0) >= (z1 - z0) ? 0 : 2;
  const flat = hull2d(hullPoints.map((v) => [v[hAxis], v[1]]));
  if (flat.length < 3) return null;
  let hLo = Infinity, hHi = -Infinity, vLo = Infinity, vHi = -Infinity;
  for (const [h, v] of flat) {
    if (h < hLo) hLo = h; if (h > hHi) hHi = h;
    if (v < vLo) vLo = v; if (v > vHi) vHi = v;
  }
  const span = Math.max(hHi - hLo, vHi - vLo);
  if (!(span > 0)) return null;
  const k = 100 / span;
  const hMid = (hLo + hHi) / 2;
  // SVG y grows DOWN and the model's grows up, hence 100 - (...).
  const pt = ([h, v]) => `${(50 + (h - hMid) * k).toFixed(3)},${(100 - (v - vLo) * k).toFixed(3)}`;
  return `M${flat.map(pt).join('L')}Z`;
}

function drawUploadSilhouette(hullPoints) {
  const fg = $("[data-chart-sr='fg-group']");
  if (!fg) return;
  const d = uploadSilhouettePath(hullPoints);
  if (!d) return;   // unmeasurable — leave whatever is there rather than blank the panel
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  // V1's own foreground styling, copied exactly so an upload does not read
  // as a different KIND of thing from a preset.
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#FF9900');
  path.setAttribute('stroke-width', '0.05rem');
  path.dataset.chartSr = 'v2-upload';
  fg.replaceChildren(path);
}
window.__v2UploadSilhouettePath = uploadSilhouettePath; // used by automated tests

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
