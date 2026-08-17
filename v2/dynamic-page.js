/**
 * The DYNAMIC page — M3 shell (DYNAMIC-SPEC §14 step 3; Display Rulings
 * v1.0 2026-08-13; M3 display amendments 2026-08-15; review pins r6;
 * Toby first-pass rulings 2026-08-15).
 *
 * Fifth page of the pipeline, inserted between Ship and Fleet in the nav —
 * the physics order (shape → lift → flight → fleet → economics). NOTE
 * (Toby 2026-08-15, backlog): eventually MUST become a sub-button of the
 * Ship page; top-level link is the M3 draft position. Follows revenue.js's
 * injection pattern: V1's bundle untouched, a nav link + section
 * coexisting with V1's click-only navigation, V1 tokens throughout.
 *
 * LAYOUT (Toby ruling 2026-08-15): HORIZONTAL bands — Properties on top,
 * visualiser reservation centre, Results along the bottom. Different from
 * the other pages' columns on purpose: horizontal = dynamic flow over
 * time; the visualiser will stream L→R across the middle.
 *
 * WHAT THIS IS: the M3 shell (parked load, the pink EAS IDEAL button,
 * three sliders, condensed outputs, warnings-only statuses — MINIMAL
 * WORDS, Toby 2026-08-15 — and the blank centre reservation) PLUS the
 * M4/M5 toggles, pulled forward live on Toby's call 2026-08-15: both ON
 * at load, reveal-by-removal complete. No provenance copy on the page
 * (Toby 2026-08-15:
 * "obviously it's calc using the settings live — that's the point");
 * provenance stays in the contract for engineers and the COPY step later.
 *
 * ALL state logic and display selection lives in dynamic-state.js (pure,
 * Node-tested — test/dynamic-state-fixtures.mjs). This file is DOM only:
 * it may not compute anything, and FLEET never scrapes what it renders.
 */
import { computeDynamics } from '/calcv2/src/dynamicsCore.js';
import { estimateCd, applyGenericTail } from '/calcv2/src/cdEstimator.js';
import { scaleGeometryRecord } from '/calcv2/src/dynamicsGeometry.js';
import { PRESET_DYNAMICS } from '/calcv2/src/presetDynamics.js';
import {
  EAS_IDEAL, SPEED_MIN, SPEED_MAX, S_MAX,
  SUNSHIP_SHAPE, CD_TRACKS_ESTIMATE, isSunship,
  initialState, isParked, setInput, setToggle, setShape, applyIdeal,
  resolveCd, compute, renderModel, cdDialRange,
} from './dynamic-state.js';

// ---------------------------------------------------------------- shape inheritance
// M6 stage 2: the ACTIVE shape comes from the page-1 channel
// (shape-upload.js publishes identity + upload dynamics; preset dynamics
// are the BAKED records). All measurement is engine code — this file
// only selects records and passes them through.
// §4.1: DECLARED, never detected — presets carry AUTHORED default axes
// (Toby's RATIFIED natural-attitude ruling 2026-08-16, pinned in the
// generated records: cigar +Z round-nose-first taper-trailing, bottle
// −Y cap-first, car +Z, lenticular +Z edge-first, washing machine +Y;
// r13 hygiene fix 2026-08-17 — this comment previously described the
// superseded pre-ratification signs); uploads default '+Z' until the
// visualiser's rotate control lands.
const UPLOAD_DEFAULT_AXIS = '+Z';

let activeShape = SUNSHIP_SHAPE;
let activeDynamics = PRESET_DYNAMICS.sunship; // { raw, proxies, defaultAxis, ... }

function readShapeChannel() {
  const pub = window.__v2ActiveShape;
  if (!pub) return false;
  const dyn = pub.kind === 'preset' ? PRESET_DYNAMICS[pub.id] : pub.dynamics;
  if (!dyn) return false; // no measurable geometry — keep the last shape (§5.5: never wedge)
  activeShape = { kind: pub.kind, id: pub.id, name: pub.name };
  activeDynamics = dyn;
  return true;
}

/** Inherited length: V1's Ship-page output is the displayed truth (the
 *  slider itself may hold view units — never trusted directly). */
function readLengthM() {
  // PAGE-2 SPLIT ruling (Toby, 2026-08-17) — DATED REVERSAL of the
  // stage-2 300 m fallback: no displayed length means NO SHIP EXISTS
  // yet. Returning null puts the page in the TEACHING STATE (dashes +
  // "set your ship's size in STATICS first") instead of silently
  // inventing a 300 m vessel the user never built. All-zero-first-load
  // doctrine (v1.6) extended to the inheritance chain.
  const out = parseFloat(document.querySelector('[data-ship="length-output"]')?.textContent);
  return Number.isFinite(out) && out > 0 ? out : null;
}

const activeAxis = () => activeDynamics.defaultAxis ?? UPLOAD_DEFAULT_AXIS; // signed, e.g. '-Z'
const activeGeometry = () => {
  const lengthM = readLengthM();
  if (lengthM === null) return null; // teaching state — no ship exists yet
  return scaleGeometryRecord(activeDynamics.raw, activeAxis()[1], lengthM);
};
const activeProxyRecord = () => {
  const ax = activeAxis();
  const p = activeDynamics.proxies[ax];
  // Graduation 2026-08-16: cls + triggers travel with the proxy — the
  // mechanism class picks the calibration line (records without cls
  // price on the conservative pinned line by engine default).
  return {
    proxy: p.proxy, cls: p.cls ?? null, triggers: p.triggers ?? null,
    axis: ax, quality: { oddFraction: p.oddFraction ?? 0 },
  };
};

// ---------------------------------------------------------------- EAS mode
// The engineer chord (Toby ruling 2026-08-16): holding E+A+S together
// unlocks the system toggles on non-Sunship shapes (their §5.4 generic
// behaviour — truthfully labelled by the state module) and is the
// namespace for future engineer functions. Session-transient, nothing
// persisted, nothing advertised; the chip below self-identifies any
// unlocked state so a screenshot can never pass as the public page.
const easKeys = new Set();
function easHeld() { return easKeys.has('e') && easKeys.has('a') && easKeys.has('s'); }
window.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  if (k === 'e' || k === 'a' || k === 's') {
    const was = easHeld();
    easKeys.add(k);
    if (easHeld() !== was) paint();
  }
});
window.addEventListener('keyup', (e) => {
  const k = (e.key || '').toLowerCase();
  if (easKeys.delete(k)) paint();
});
window.addEventListener('blur', () => { if (easKeys.size) { easKeys.clear(); paint(); } });

// The M6 estimator seam: ENGINE functions behind the state module's
// injection point (same pattern as computeDynamics — this file computes
// nothing). Rebuilt per paint so it always carries the active shape.
const estimatorSeam = () => ({ estimateCd, applyGenericTail, proxyRecord: activeProxyRecord() });

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- styles

// Entirely V1 tokens; horizontal three-band grid, unique to this page.
const style = document.createElement('style');
style.textContent = `
  .section-dynamic {
    display: none;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
    min-height: 0;
    padding: var(--space-base);
    gap: var(--space-base);
  }
  .dyn-panel {
    background-color: var(--color-bg-secondary);
    padding: 0 var(--space-base) var(--space-base) var(--space-base);
    min-height: 0;
    min-width: 0;
  }
  /* Top band: heading + pink button, then the controls in a row. */
  .dyn-controls-panel { padding: 0; }
  .dyn-controls-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-base);
  }
  .dyn-controls-row .fleet-control { flex: 1 1 0; min-width: 160px; }
  .dyn-toggle-col {
    display: flex; flex-direction: column; gap: 0.5em;
    padding: 0 var(--space-base);
    align-self: center;
  }
  /* Centre band: the visualiser reservation — dominant, deliberately
     empty. Flow will run horizontally through here (M7). */
  .dyn-visual-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 32vh;
  }
  .dyn-visual-note {
    color: var(--color-secondary);
    font-size: var(--font-base);
    opacity: 0.5;
    text-align: center;
  }
  /* Bottom band: results as a horizontal strip of stat blocks. */
  .dyn-results-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem var(--space-base);
    justify-content: space-between;
    align-items: stretch;
  }
  .dyn-stat { min-width: 110px; }
  .dyn-stat .fleet-results-data-header { margin: 0; }
  .dyn-stat .fleet-results-data { margin: 0; }
  /* The bare (−x%) tag rides the power value, pink — the number IS the S
     setting (M3 display amendment 1). */
  .dyn-power-tag { color: var(--color-accent-1); margin-left: 0.4em; }
  /* Warnings-only status area: minimal words, silence is good news. */
  .dyn-warnings { display: flex; gap: var(--space-base); flex-wrap: wrap; margin-top: 0.6rem; }
  .dyn-warning { font-size: var(--font-base); font-weight: 600; }
  .dyn-warning.red { color: var(--color-critical, #ff2a2a); }
  .dyn-warning.orange { color: var(--color-accent-2, #ff9900); }
  /* S evidence zoning ON the slider (r6: zoning survives; the floors/status
     box is gone). Subtle segment bar directly under the S slider. */
  .dyn-s-zones {
    display: flex; height: 3px; margin-top: 2px; opacity: 0.55;
  }
  .dyn-s-zones div:nth-child(1) { width: 20%;   background: var(--color-accent-2, #ff9900); }
  .dyn-s-zones div:nth-child(2) { width: 26.7%; background: var(--color-accent-1, #c628a4); }
  .dyn-s-zones div:nth-child(3) { width: 53.3%; background: var(--color-secondary, #888); }
  /* M6: the estimator marker + SILENT ±band on the Cd slider. The band is
     drawn, never worded (ruling 2026-08-16 — rationale in cdEstimator.js);
     the marker carries the one permitted word: ESTIMATED. */
  .dyn-cd-band {
    position: relative; height: 12px; margin-top: 2px;
  }
  .dyn-cd-band .band {
    position: absolute; top: 0; height: 3px;
    background: var(--color-accent-1, #c628a4); opacity: 0.3;
  }
  .dyn-cd-band .tick {
    position: absolute; top: -2px; width: 2px; height: 7px;
    background: var(--color-accent-1, #c628a4);
  }
  .dyn-cd-band .est-label {
    position: absolute; top: 5px; transform: translateX(-50%);
    color: var(--color-accent-1, #c628a4);
    font-size: 0.55em; letter-spacing: 0.08em; white-space: nowrap;
  }
  /* Inert toggles (M3 shell): visible state, no interaction until M4/M5. */
  .dyn-toggle-row {
    display: flex; align-items: center; gap: 0.5em;
    color: var(--color-primary); font-size: var(--font-base);
    white-space: nowrap;
  }
  .dyn-toggle-row input { accent-color: var(--color-accent-1); }
  .dyn-toggle-row .dyn-toggle-note { color: var(--color-secondary); font-size: 0.85em; }
  /* EAS-mode chip: subtle berry tag, self-identifies unlocked states. */
  .dyn-eas-chip {
    align-self: flex-start;
    font-size: 0.6em; font-weight: 700; letter-spacing: 0.12em;
    color: var(--color-accent-1, #c628a4);
    border: 1px solid var(--color-accent-1, #c628a4);
    border-radius: 3px; padding: 1px 5px; opacity: 0.8;
  }
  @media (max-width: 900px) {
    .dyn-controls-row { flex-wrap: wrap; }
    .dyn-visual-panel { min-height: 22vh; }
  }
`;
document.head.appendChild(style);

// ---------------------------------------------------------------- nav link

// Between Ship and Fleet: the physics order. V1's nav presenter selects by
// data-nav attributes, not child order, so inserting mid-row is safe.
// V1's own separator already sits between Ship and Fleet; inserting
// [Dynamic, >] before Fleet reads: Ship > Dynamic > Fleet.
const fleetLink = $('[data-nav="fleet"]');
const sep = document.createElement('span');
sep.className = 'header-nav-separator';
sep.textContent = '>';
const dynLink = document.createElement('a');
dynLink.className = 'header-nav-link';
dynLink.href = '/dynamic';
dynLink.dataset.navV2 = 'dynamic';
dynLink.textContent = 'Dynamic';
fleetLink.before(dynLink, sep);

// ---------------------------------------------------------------- build page

let state = initialState();

const section = document.createElement('section');
section.className = 'section-dynamic';
section.dataset.sectionV2 = 'dynamic';

// --- Band 1 (top): controls ---
const controlsPanel = document.createElement('div');
controlsPanel.className = 'panel-border dyn-panel dyn-controls-panel';
const headingContainer = document.createElement('div');
headingContainer.className = 'fleet-controls-heading-container';
const controlsHeading = document.createElement('h2');
controlsHeading.className = 'fleet-controls-heading';
controlsHeading.textContent = 'Current Properties';
const idealBtn = document.createElement('button');
idealBtn.className = 'fleet-control-preset';
idealBtn.dataset.v2 = 'dynamic-ideal';
idealBtn.title = 'EAS IDEAL — 100 km/h, Cd 0.043, S 27%';
const idealIcon = document.createElement('img');
idealIcon.className = 'fleet-control-preset-icon';
idealIcon.src = '/assets/logo_circles.svg';
idealIcon.alt = 'EAS ideal dynamics';
idealBtn.appendChild(idealIcon);
headingContainer.append(controlsHeading, idealBtn);

function control(labelText, unitText, { min, max, step, value }) {
  const wrap = document.createElement('div');
  wrap.className = 'fleet-control';
  const label = document.createElement('label');
  label.className = 'fleet-control-label';
  label.textContent = labelText;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'fleet-control-slider';
  Object.assign(slider, { min, max, step, value });
  const output = document.createElement('output');
  output.className = 'fleet-control-output';
  const valueSpan = document.createElement('span');
  valueSpan.className = 'fleet-control-output-value';
  const unitSpan = document.createElement('span');
  unitSpan.textContent = ` ${unitText}`;
  output.append(valueSpan, unitSpan);
  wrap.append(label, slider, output);
  return { wrap, slider, valueSpan };
}

// Slider ranges: spec §2 (speed extended to 0 by the parked amendment;
// S 0–75% with evidence zones on the control). The Cd dial is PER-SHAPE
// (§5.3 pinned rule, M6): bottom = the contract's friction floor, top =
// max(0.40, 1.5 × estimate) — cdDialRange() in the state module; the
// values here are only the parked-load defaults.
const speedCtl = control('Airspeed', 'km/hr', { min: SPEED_MIN, max: SPEED_MAX, step: 1, value: 0 });
const cdCtl = control('Drag Coefficient (Cd)', '', { min: 0.009, max: 0.55, step: 0.001, value: EAS_IDEAL.cd });
const sCtl = control('Power Saving (S)', '', { min: 0, max: S_MAX, step: 0.01, value: EAS_IDEAL.s });
// M6: the estimator marker + silent ±band under the Cd slider. Hidden
// until the first movement produces an estimate (dormant while parked);
// afterwards it persists — parking again keeps the last marker as cached
// presentation, zero new calculation (M6 amendment #5).
const cdBand = document.createElement('div');
cdBand.className = 'dyn-cd-band';
cdBand.style.display = 'none';
const bandSeg = document.createElement('div');
bandSeg.className = 'band';
const bandTick = document.createElement('div');
bandTick.className = 'tick';
const bandLabel = document.createElement('div');
bandLabel.className = 'est-label';
bandLabel.textContent = 'ESTIMATED';
cdBand.append(bandSeg, bandTick, bandLabel);
cdCtl.slider.after(cdBand);
// Evidence zones under the S slider (published 0–15 / bound 15–35 / beyond).
const zoneBar = document.createElement('div');
zoneBar.className = 'dyn-s-zones';
zoneBar.title = '0–15% within published BLI results · 15–35% at the current EAS recovery-credit bound · beyond 35% design exploration';
for (let i = 0; i < 3; i++) zoneBar.appendChild(document.createElement('div'));
sCtl.slider.after(zoneBar);

// Live toggles (M4 Smart Tail / M5 BLI — pulled forward, Toby 2026-08-15).
// The reveal is REMOVAL: both load ON; toggling OFF is how users learn.
function toggleRow(labelText) {
  const row = document.createElement('div');
  row.className = 'dyn-toggle-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  const label = document.createElement('span');
  label.textContent = labelText;
  row.append(box, label);
  return { row, box };
}
const tailToggle = toggleRow('Smart Tail');
const bliToggle = toggleRow('BLI');
// EAS-mode chip: self-identifies engineer-unlocked states (visible while
// the chord is held, and while any generic shape has systems ON) — a
// screenshot of an unlocked configuration can never pass as public.
const easChip = document.createElement('div');
easChip.className = 'dyn-eas-chip';
easChip.textContent = 'EAS MODE';
easChip.style.display = 'none';
const toggleCol = document.createElement('div');
toggleCol.className = 'dyn-toggle-col';
toggleCol.append(tailToggle.row, bliToggle.row, easChip);

const controlsRow = document.createElement('div');
controlsRow.className = 'dyn-controls-row';
controlsRow.append(speedCtl.wrap, cdCtl.wrap, sCtl.wrap, toggleCol);
controlsPanel.append(headingContainer, controlsRow);

// --- Band 2 (centre, dominant): the visualiser reservation ---
const visualPanel = document.createElement('div');
visualPanel.className = 'panel-border dyn-panel dyn-visual-panel';
const visualNote = document.createElement('div');
visualNote.className = 'dyn-visual-note';
visualNote.textContent = ' ';
visualPanel.appendChild(visualNote);

// --- Band 3 (bottom): the condensed output strip ---
const resultsPanel = document.createElement('div');
resultsPanel.className = 'panel-border dyn-panel';
const resultsHeading = document.createElement('h2');
resultsHeading.className = 'fleet-results-header';
resultsHeading.textContent = 'Results';
const resultsRow = document.createElement('div');
resultsRow.className = 'dyn-results-row';

const outCells = new Map();
function statBlock(label) {
  const block = document.createElement('div');
  block.className = 'dyn-stat';
  const h = document.createElement('div');
  h.className = 'fleet-results-data-header';
  h.textContent = label;
  const d = document.createElement('div');
  d.className = 'fleet-results-data';
  d.textContent = '—';
  block.append(h, d);
  resultsRow.appendChild(block);
  outCells.set(label, d);
}
for (const label of [
  'Frontal area', 'Wetted area', 'Drag',
  'Drag area (Cd·A)', 'Cd (V^⅔ basis)', // comparison metrics, 2026-08-16
  'Propulsion power',
  'LH2 weight (10,000 km)', 'LH2 + Storage (10,000 km)',
]) statBlock(label);

const warningsBox = document.createElement('div');
warningsBox.className = 'dyn-warnings';
resultsPanel.append(resultsHeading, resultsRow, warningsBox);

section.append(controlsPanel, visualPanel, resultsPanel);
$('[data-section="fleet"]').after(section);

// ---------------------------------------------------------------- render

// The last estimate seen — cached PRESENTATION only (M6 amendment #5):
// parking again keeps the marker without any new calculation; it never
// feeds a computation (compute() always uses its own live call).
let lastEstimate = null;

function paint() {
  // State → engine (UI-level parked gate; estimator dormant too) →
  // ruled display model → DOM. Geometry + estimator seam carry the
  // ACTIVE shape at the INHERITED length, rebuilt each paint.
  // NO-SHIP GATE (Toby ruling 2026-08-17): no displayed Ship length =
  // no ship = N/A everywhere at any speed, no copy — engine and
  // estimator stay DORMANT exactly like parked. Selections made while
  // dashed persist into the first real computation — never reset.
  const geometry = activeGeometry();
  const contract = geometry === null ? null
    : compute(state, computeDynamics, geometry, estimatorSeam());
  if (contract && contract.estimate) lastEstimate = contract.estimate;
  const rm = renderModel(contract);

  // Slider positions always mirror state (the ideal button moves them).
  // Values in force come from the state module's ONE derivation (r7 #6),
  // fed the freshest BARE estimate (live contract echo, else the cache)
  // plus the engine's generic-tail derivation when in force (stage 2).
  // M6 (r10): tail OFF snaps Cd to the bare estimate but the slider
  // STAYS EDITABLE — estimator proposes, slider disposes; only the BLI
  // slider still greys (S = 0 forced, spec §7.1 unchanged).
  const bareEst = contract ? contract.estimate : lastEstimate;
  const tailedEst = state.tailOn && !isSunship(activeShape) && bareEst
    ? applyGenericTail(bareEst) : null;
  const { cd: cdInForce, cdSource } = resolveCd(state, bareEst, tailedEst);
  const sInForce = state.bliOn ? state.s : 0;

  // EAS IDEAL: Sunship-only (preset identity, never filename — ruling
  // 2026-08-16). Greyed, visible, inert elsewhere.
  const sunship = isSunship(activeShape);
  idealBtn.disabled = !sunship;
  idealBtn.style.opacity = sunship ? '' : '0.35';
  idealBtn.title = sunship
    ? 'EAS IDEAL — 100 km/h, Cd 0.043, S 27%'
    : 'EAS IDEAL is the Sunship’s authored configuration';

  // System toggles: Sunship-only in public (Toby ruling 2026-08-16 —
  // the greyed hard limit IS the lesson: these are the Sunship's
  // designs). The E+A+S chord unlocks them for engineer use; the chip
  // self-identifies both the held chord and any unlocked configuration.
  const unlocked = easHeld();
  const toggleLocked = !sunship && !unlocked;
  tailToggle.box.disabled = toggleLocked;
  bliToggle.box.disabled = toggleLocked;
  tailToggle.row.style.opacity = toggleLocked ? '0.4' : '';
  bliToggle.row.style.opacity = toggleLocked ? '0.4' : '';
  const rowTitle = toggleLocked ? 'Smart Tail and BLI are the Sunship’s configuration' : '';
  tailToggle.row.title = rowTitle;
  bliToggle.row.title = rowTitle;
  easChip.style.display = unlocked || (!sunship && (state.tailOn || state.bliOn)) ? '' : 'none';

  // Per-shape Cd dial (§5.3 pinned rule): contract floor + estimate top.
  const dial = cdDialRange(contract, lastEstimate);
  cdCtl.slider.min = dial.min;
  cdCtl.slider.max = dial.max;

  speedCtl.slider.value = state.airspeedKmh;
  if (cdInForce != null) cdCtl.slider.value = cdInForce;
  sCtl.slider.value = sInForce;
  sCtl.slider.disabled = !state.bliOn;
  sCtl.wrap.style.opacity = state.bliOn ? '' : '0.5';
  tailToggle.box.checked = state.tailOn;
  bliToggle.box.checked = state.bliOn;
  speedCtl.valueSpan.textContent = String(state.airspeedKmh);
  // Estimate-tracking Cd leads with the word ESTIMATED and firms only
  // when the user drags (M6 amendment #2). Pending = tail off while
  // parked before any estimate exists: the snap resolves on first
  // movement (r6: parked selections carry, never reset).
  cdCtl.valueSpan.textContent = cdInForce == null ? '—'
    : (state.cd === CD_TRACKS_ESTIMATE && cdSource === 'estimated'
      ? `ESTIMATED ${cdInForce.toFixed(3)}` : cdInForce.toFixed(3));
  sCtl.valueSpan.textContent = `${Math.round(sInForce * 100)}%`;

  // The marker + silent band (live when running; cached while parked).
  const marker = rm.marker
    ?? (lastEstimate && lastEstimate.status === 'ok' && Number.isFinite(lastEstimate.cdEstimate)
      ? { value: lastEstimate.cdEstimate, lo: lastEstimate.band[0], hi: lastEstimate.band[1] }
      : null);
  if (marker) {
    const pct = (x) => `${Math.max(0, Math.min(100, ((x - dial.min) / (dial.max - dial.min)) * 100))}%`;
    cdBand.style.display = '';
    bandSeg.style.left = pct(marker.lo);
    bandSeg.style.width = `calc(${pct(marker.hi)} - ${pct(marker.lo)})`;
    bandTick.style.left = pct(marker.value);
    bandLabel.style.left = pct(marker.value);
  } else {
    cdBand.style.display = 'none';
  }
  for (const [label, value] of rm.rows) {
    const cell = outCells.get(label);
    if (label === 'Propulsion power' && !rm.parked) {
      cell.textContent = value;
      const tag = document.createElement('span');
      tag.className = 'dyn-power-tag';
      tag.textContent = rm.powerTag;
      cell.appendChild(tag);
    } else {
      cell.textContent = value;
    }
  }
  warningsBox.replaceChildren(...rm.warnings.map((w) => {
    const div = document.createElement('div');
    div.className = `dyn-warning ${w.level}`;
    div.textContent = w.text;
    return div;
  }));
}

speedCtl.slider.addEventListener('input', () => { state = setInput(state, 'airspeedKmh', Number(speedCtl.slider.value)); paint(); });
cdCtl.slider.addEventListener('input', () => { state = setInput(state, 'cd', Number(cdCtl.slider.value)); paint(); });
sCtl.slider.addEventListener('input', () => { state = setInput(state, 's', Number(sCtl.slider.value)); paint(); });
tailToggle.box.addEventListener('change', () => { state = setToggle(state, 'tailOn', tailToggle.box.checked); paint(); });
bliToggle.box.addEventListener('change', () => { state = setToggle(state, 'bliOn', bliToggle.box.checked); paint(); });
idealBtn.addEventListener('click', () => { if (isSunship(activeShape)) { state = applyIdeal(state); paint(); } });

// M6 stage 2: shape inheritance. On a page-1 shape change: adopt the new
// records, RESET Cd to the new shape's estimator posture (r8 #4 — the
// state transition owns the semantics), and drop the cached marker (an
// old shape's marker must never decorate a new shape — the estimator
// stays dormant until the next movement, per the ruled dormancy).
window.addEventListener('v2-shape-change', () => {
  if (!readShapeChannel()) return;
  state = setShape(state, activeShape);
  lastEstimate = null;
  paint();
});
// Length inheritance: V1's Ship length slider re-scales the geometry
// live (records are raw mesh units; scaling is engine algebra). A
// user/estimated Cd survives length changes — length is not a shape
// change (r8 #4 covers shape/orientation only).
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && e.target.matches('[data-ship="length"]')) {
    // r13 fix (2026-08-17): capture-phase fires BEFORE V1's own target
    // handler updates the length-output element, so painting inline
    // read the PREVIOUS displayed length. Deferring one macrotask lets
    // V1 finish writing the output first; capture is kept so delivery
    // survives any stopPropagation in the bundle.
    setTimeout(paint, 0);
  }
}, true);

readShapeChannel(); // adopt whatever page 1 already published (boot order safe)
state = initialState(activeShape);
paint(); // loads PARKED: dashes, engine not consulted (fixture-proven)

// ---------------------------------------------------------------- page switching

// Same coexistence contract as revenue.js: V1's state untouched, every
// module hides its own section on any other module's nav click.
const V1_SECTIONS = ['shape', 'ship', 'fleet'].map((id) => $(`[data-section="${id}"]`));
const V1_LINKS = ['shape', 'ship', 'fleet'].map((id) => $(`[data-nav="${id}"]`));
const econLink = $('[data-nav-v2="economics"]');
const econSection = $('[data-section-v2="economics"]');

function showDynamic() {
  for (const s of V1_SECTIONS) s.style.display = 'none';
  for (const l of V1_LINKS) l.classList.remove('current-page');
  if (econSection) econSection.style.display = 'none';
  econLink?.classList.remove('current-page');
  section.style.display = 'grid';
  dynLink.classList.add('current-page');
  paint();
}

dynLink.addEventListener('click', (e) => {
  e.preventDefault();
  showDynamic();
});

// Leaving Dynamic: any V1 nav click restores that section (V1 dedupes
// same-page clicks, so we restore it ourselves — same as revenue.js).
V1_LINKS.forEach((link, i) => {
  link.addEventListener('click', () => {
    section.style.display = 'none';
    dynLink.classList.remove('current-page');
    V1_SECTIONS[i].style.display = 'grid';
    link.classList.add('current-page');
  }, true);
});
// Economics link click hides Dynamic (revenue.js knows nothing about us).
econLink?.addEventListener('click', () => {
  section.style.display = 'none';
  dynLink.classList.remove('current-page');
}, true);
