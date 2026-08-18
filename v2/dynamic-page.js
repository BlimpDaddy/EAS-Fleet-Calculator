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
import { SUNSHIP_TAILED } from '/calcv2/src/sunshipTailed.js';
import {
  EAS_IDEAL, SPEED_MIN, SPEED_MAX, S_MAX,
  SUNSHIP_SHAPE, CD_TRACKS_ESTIMATE, isSunship,
  initialState, isParked, setInput, setToggle, setShape, applyIdeal,
  resolveCd, compute, renderModel, cdDialRange, setTailedBody,
} from './dynamic-state.js?v=1.12';

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
/* THE DEPLOYED-TAIL SEAM. The state module owns WHICH body applies (it
 * holds the tail logic); the page owns HOW to build it. The record it
 * returns is deliberately mixed, and that is the whole point:
 *   lengthM / wettedArea  -> the DEPLOYED body (516 m at a 300 m
 *                            envelope) — what the flow sees, so friction
 *                            gets the right Reynolds number
 *   liftLengthM / liftVolumeM3 -> the ENVELOPE — what actually lifts, so
 *                            gross lift, structure, payload bands and
 *                            Cd_v are never computed from a fairing full
 *                            of ambient air.
 * Getting this wrong is not subtle: feeding the aero length to the
 * buoyancy side inflates (L/300)^3 by 5.09x and claims 28,495 t of lift. */
setTailedBody({
  geometry: (envelopeLengthM) => {
    const deployedM = envelopeLengthM / SUNSHIP_TAILED.envelopeFraction;
    const aero = scaleGeometryRecord(SUNSHIP_TAILED.raw, SUNSHIP_TAILED.defaultAxis[1], deployedM);
    const envelope = scaleGeometryRecord(PRESET_DYNAMICS.sunship.raw, 'Z', envelopeLengthM);
    return { ...aero, liftLengthM: envelopeLengthM, liftVolumeM3: envelope.volume };
  },
  proxyRecord: () => {
    const ax = SUNSHIP_TAILED.defaultAxis;
    const p = SUNSHIP_TAILED.proxies[ax];
    return {
      proxy: p.proxy, cls: p.cls ?? null, triggers: p.triggers ?? null,
      axis: ax, quality: { oddFraction: p.oddFraction ?? 0 },
    };
  },
});

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
    letter-spacing: .25em; /* the COMING SOON placeholder reads as signage (Toby 2026-08-17) */
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
  /* "No Size" is a message, not a measurement — muted so it never reads
     as a computed result (and so the berry key result does not shout it). */
  .dyn-stat .fleet-results-data.dyn-nosize { color: var(--color-secondary); opacity: 0.75; }
  .dyn-stat .fleet-results-data-header { margin: 0; }
  .dyn-stat .fleet-results-data { margin: 0; }
  /* The bare (−x%) tag rides the power value, pink — the number IS the S
     setting (M3 display amendment 1). */
  .dyn-power-tag { color: var(--color-accent-1); margin-left: 0.4em; }
  /* Warnings-only status area: minimal words, silence is good news. */
  .dyn-stat-warnings { display: flex; gap: 6px; justify-content: center; }
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
  /* The marker strip. Height was 12px because the ESTIMATED label sat on
     its own line BELOW the tick, and that 12px is flow — it pushed the Cd
     readout 18px lower than Airspeed's and 9px lower than S's (measured
     2026-08-18, Toby: "the manual entry field is a bit lower than the
     other numbers"). The label now sits ON the tick's line, just clear of
     the band's high edge, so the strip needs only the tick's own height
     and the readout comes back up level with S's. */
  .dyn-cd-band {
    position: relative; height: 3px; margin-top: 2px;
  }
  .dyn-cd-band .band {
    position: absolute; top: 0; height: 3px;
    background: var(--color-accent-1, #c628a4); opacity: 0.3;
  }
  /* The tick is 2px wide and its LEFT used to be set to the marker's
     position, which put its centre a pixel to the right of the value it
     marks. Centred on its own left offset now, like the label — so both
     read against the same point. */
  .dyn-cd-band .tick {
    position: absolute; top: -2px; width: 2px; height: 7px;
    transform: translateX(-50%);
    background: var(--color-accent-1, #c628a4);
  }
  /* Anchored beside the band's HIGH edge, not centred on the marker: the
     tick and the ±20% segment occupy the middle, and a centred label sat
     on top of both. Vertically centred on the 3px band. */
  .dyn-cd-band .est-label {
    position: absolute; top: -3px;
    color: var(--color-accent-1, #c628a4);
    font-size: 0.55em; letter-spacing: 0.08em; white-space: nowrap;
  }
  /* The TYPEABLE Cd readout. Styled to read as text, not as a form field —
     it sits in a row with two plain readouts and must not shout — but it
     carries a dotted underline so the affordance is discoverable, which
     goes solid on focus. Sized in ch so it fits 0.0215 at any font scale. */
  .dyn-cd-input {
    width: 6.5ch; text-align: right;
    background: transparent; color: inherit; font: inherit;
    border: none; border-bottom: 1px dotted var(--color-secondary, #888);
    padding: 0; margin: 0; border-radius: 0;
    -moz-appearance: textfield;
  }
  .dyn-cd-input:focus {
    outline: none;
    border-bottom-color: var(--color-accent-1, #c628a4);
  }
  .dyn-cd-input:disabled { border-bottom-color: transparent; opacity: 1; }
  /* ESTIMATED as its own tag rather than a word inside the number — see
     the note where it is built. Small and grey so the FIGURE still reads
     as the figure. */
  .dyn-cd-est-tag {
    font-size: 0.62em; letter-spacing: 0.08em;
    color: var(--color-accent-1, #c628a4);
    margin-right: 0.45em; vertical-align: middle;
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
// Panel title = the sub-page's NAME (Toby ruling 2026-08-17: 'Current
// Properties' was redundant — the user selected these properties —
// and the tiny mode word under the nav dots retired with it; the
// panel title now does the naming, two problems one fix).
controlsHeading.textContent = 'DYNAMICS';
const idealBtn = document.createElement('button');
idealBtn.className = 'fleet-control-preset';
idealBtn.dataset.v2 = 'dynamic-ideal';
/* Both ideal-button tooltips are DERIVED from EAS_IDEAL, never typed
 * (2026-08-18). The hand-written pair had already gone stale twice over:
 * they still advertised "Cd 0.043" after the authored value was retired,
 * and they would have kept saying 100 km/h through the speed change. The
 * Cd is deliberately absent from the wording now — with the tail deployed
 * it is measured from geometry, so there is no constant to quote. */
const idealTitle = (sunship) => {
  const v = `${EAS_IDEAL.airspeedKmh} km/h`;
  return sunship
    ? `EAS IDEAL — ${v}, Smart Tail deployed, S ${Math.round(EAS_IDEAL.s * 100)}%`
    : `EAS IDEAL — ${v} (Smart Tail and BLI are the Sunship’s designs)`;
};
idealBtn.title = idealTitle(true);
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

/* ---- Cd is TYPEABLE (Toby, 2026-08-18: "very precise changes and a bit
 * tricky to use") ----
 *
 * Cd is the only control here whose interesting range is narrower than
 * the slider can resolve. Airspeed spans 0-140 in whole km/h and S spans
 * 0-75 in whole percent, so a drag reaches any value either of them can
 * hold. The Cd dial spans 0.009-0.55 across roughly 240 px, which makes
 * one pixel worth about 0.0023 — the difference between the Sunship's
 * 0.0215 and a value 10% away from it is a single pixel of travel. The
 * dial is a good instrument for exploring and a bad one for stating a
 * figure, so the readout becomes an input and the number can simply be
 * said.
 *
 * The ESTIMATED word left the number entirely and did NOT get a tag of
 * its own beside it (Toby, 2026-08-18: "we don't need a new 'estimated'
 * now next to the type in Cd field — it already says estimated just above
 * on the little line"). Correct: the marker strip under the slider has
 * carried that word since M6, sitting on the very band it describes, and
 * a second copy an inch away said nothing the first did not. The word
 * could not have stayed INSIDE an editable field either way — a value and
 * a claim about the value cannot share one text box.
 *
 * Typing is exactly a drag as far as the state module is concerned —
 * setInput('cd') — so a typed value FIRMS the tracking sentinel and turns
 * the scenario CUSTOM by the same rule, at which point the marker's own
 * label stops applying to it. */
const cdInput = document.createElement('input');
cdInput.type = 'text';
cdInput.className = 'fleet-control-output-value dyn-cd-input';
cdInput.inputMode = 'decimal';         // numeric keypad on phones
cdInput.autocomplete = 'off';
cdInput.spellcheck = false;
cdInput.setAttribute('aria-label', 'Drag coefficient — type an exact value');
cdInput.title = 'Type an exact Cd and press Enter';
cdCtl.valueSpan.replaceWith(cdInput);
cdCtl.valueSpan = cdInput;             // paint() keeps writing through this handle
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
visualNote.textContent = 'VISUALIZER COMING SOON'; // placeholder (Toby 2026-08-17) until M7
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
const warnCells = new Map(); // 'aero' | 'fuel' -> per-stat warning anchor
function statBlock(label) {
  const block = document.createElement('div');
  block.className = 'dyn-stat';
  const h = document.createElement('div');
  h.className = 'fleet-results-data-header';
  // Two-line titles by construction (Toby, 2026-08-17): the
  // parenthetical qualifier always sits on its own second line, so
  // every block is narrow and the values can be large.
  const parts = label.match(/^(.*?)\s*(\(.*\))$/);
  if (parts) {
    const l1 = document.createElement('span');
    l1.textContent = parts[1];
    const l2 = document.createElement('span');
    l2.textContent = parts[2];
    l2.className = 'dyn-hdr-sub';
    h.append(l1, document.createElement('br'), l2);
  } else {
    h.textContent = label;
  }
  const d = document.createElement('div');
  d.className = 'fleet-results-data';
  d.textContent = '—';
  block.append(h, d);
  // THE key result reads EAS berry (Toby ruling 2026-08-17): the fuel
  // system total is what the page exists to compute.
  if (label.startsWith('LH2 + Storage')) d.classList.add('dyn-key-result');
  // Warning anchors (Toby placement refinement 2026-08-17, supersedes
  // beside-the-title): each ⚠ floats over the result it warns about —
  // aero warnings over Drag (bigger), fuel warnings over the berry
  // LH2 + Storage. Absolutely positioned: zero height impact holds.
  if (label === 'Drag' || label.startsWith('LH2 + Storage')) {
    const wa = document.createElement('div');
    wa.className = `dyn-stat-warnings ${label === 'Drag' ? 'aero' : 'fuel'}`;
    block.appendChild(wa);
    warnCells.set(label === 'Drag' ? 'aero' : 'fuel', wa);
  }
  resultsRow.appendChild(block);
  outCells.set(label, d);
}
for (const label of [
  'Frontal area', 'Wetted area', 'Drag',
  'Drag area (Cd·A)', 'Cd (V^⅔ basis)', // comparison metrics, 2026-08-16
  'Propulsion power',
  'LH2 weight (9,000 km)', 'LH2 + Storage (9,000 km)', // 9,000 km ruling 2026-08-17 — MUST match dynamic-state's row keys exactly (a mismatch crashes paint and kills the page's nav interception)
]) statBlock(label);

// Warnings render into the per-stat anchors (warnCells) — the old
// single warnings box beside the title retired 2026-08-17 (Toby).
resultsPanel.append(resultsHeading, resultsRow);

section.append(controlsPanel, visualPanel, resultsPanel);
$('[data-section="fleet"]').after(section);

// ------------------------------------------------------- airspeed bridge
/**
 * AIRSPEED OWNERSHIP (Toby ruling 2026-08-17): airspeed lives on
 * DYNAMIC now — the Fleet page's own airspeed control is RETIRED
 * (hidden adapter-side; the V1 bundle is untouched and still owns the
 * value and the view→km/h mapping). DYNAMIC pushes its speed through
 * V1's OWN input pathway (set view units, dispatch 'input' — the exact
 * bridge the M3 adapter probe proved), so FLEET always computes at the
 * ship's actual speed. Never visiting DYNAMIC leaves 0 → Fleet's own
 * zero operating gate shows its N/A state (Toby's stated expectation).
 * Mapping verified live 2026-08-17: V1's slider is 0–100 VIEW units =
 * 0–200 km/h linear (view = kmh / 2); Dynamic's dial tops at 140 →
 * view 70, always in range. The sync compares against the DOM (the
 * DOM is the memo) so paints never thrash the bundle — and V1's own
 * fleet preset button, which also writes airspeed (100 km/h), gets a
 * click listener that re-asserts DYNAMIC's speed a macrotask later:
 * ownership survives every mutation path the bundle has.
 */
const fleetAirspeedSlider = $('[data-fleet="airSpeed"]');
const fleetAirspeedBox = fleetAirspeedSlider && fleetAirspeedSlider.closest('.fleet-control');
if (fleetAirspeedBox) fleetAirspeedBox.style.display = 'none';
function syncFleetAirspeed(kmh) {
  if (!fleetAirspeedSlider || !Number.isFinite(kmh)) return;
  const view = kmh / 2;
  if (Number(fleetAirspeedSlider.value) === view) return;
  fleetAirspeedSlider.value = view;
  fleetAirspeedSlider.dispatchEvent(new Event('input', { bubbles: true }));
}
const fleetPresetBtn = $('.section-fleet .fleet-control-preset');
if (fleetPresetBtn) fleetPresetBtn.addEventListener('click', () => setTimeout(() => syncFleetAirspeed(state.airspeedKmh), 0));

// ---------------------------------------------------------------- render

// The last estimate seen — cached PRESENTATION only (M6 amendment #5):
// parking again keeps the marker without any new calculation; it never
// feeds a computation (compute() always uses its own live call).
let lastEstimate = null;

/* WHERE THE THUMB ACTUALLY SITS (fix 2026-08-18, Toby: "the pink marker
 * appears a little before the stopping point of the grey selector").
 *
 * The marker used to be placed at a flat fraction of the band's width,
 * which silently assumed the thumb's CENTRE travels the full 0–100% of
 * the track. It does not: a native range input insets the thumb by half
 * its own width at BOTH ends, so the centre runs from t/2 to W − t/2 and
 * the true position is t/2 + f·(W − t). The old formula therefore ran
 * early on the left half and late on the right, meeting the truth only
 * dead centre — and the Sunship's estimate sits near the BOTTOM of the
 * dial (~0.022 on a 0.009–0.55 range, f ≈ 0.02), which is exactly where
 * the error is at its worst and points the way Toby saw it.
 *
 * Everything the formula needs is MEASURED at paint, never assumed —
 * two separate assumptions were wrong here at once:
 *
 *  1. The thumb width. No API exposes a UA shadow thumb
 *     (getComputedStyle with ::-webkit-slider-thumb just echoes the host
 *     element — checked), but the thumb is a circle and it is the tallest
 *     thing in the control, and nothing sets an explicit height, so the
 *     input's own intrinsic HEIGHT is its diameter. Measured live at 16 px.
 *  2. That the marker strip and the slider share a horizontal box. They
 *     do NOT: Chromium's UA sheet puts `margin: 2px` on a range input, so
 *     the slider sits 2 px right of the strip that is supposed to
 *     annotate it. That was a second, quieter contribution to the same
 *     visible offset, and no amount of percentage arithmetic would have
 *     found it.
 *
 * So the geometry is taken from the two live rects and the answer is
 * plain pixels relative to the strip. The percentage fallback only runs
 * when the rects are degenerate (paint while the section is hidden). */
/* Cd display precision. Three decimals was right while every value came
 * off a 0.001 slider; now that a figure can be TYPED, three places would
 * silently swallow the distinction the typing exists to express — and it
 * already rounded the Sunship's own 0.02145 to "0.021", a number we have
 * never quoted anywhere. Four places, with the fourth shown only when it
 * carries information, so ordinary values look exactly as they did. */
function fmtCd(v) {
  const four = v.toFixed(4);
  return four.endsWith('0') ? four.slice(0, -1) : four;
}

/** The Cd dial in force, republished by each paint so the typed-entry
 *  handler clamps against the same range the slider is showing. */
let lastDial = { min: 0.009, max: 0.55 };

const THUMB_FALLBACK_PX = 16;
const trackFrac = (x, dial) =>
  Math.max(0, Math.min(1, (x - dial.min) / (dial.max - dial.min)));
/** The slider's live track geometry, expressed in the marker strip's own
 *  coordinates: `x0` = where the thumb's centre sits at the dial's
 *  bottom, `span` = how far that centre travels. */
function trackGeometry() {
  const s = cdCtl.slider.getBoundingClientRect();
  const b = cdBand.getBoundingClientRect();
  if (!(s.width > 0) || !(b.width > 0)) return null;   // hidden — no geometry to read
  const t = s.height >= 10 && s.height <= 28 ? s.height : THUMB_FALLBACK_PX;
  return { x0: s.left - b.left + t / 2, span: s.width - t };
}
const trackPos = (x, dial, g) => {
  const f = trackFrac(x, dial);
  return g ? `${(g.x0 + f * g.span).toFixed(2)}px` : `${(f * 100).toFixed(4)}%`;
};
const trackSpan = (lo, hi, dial, g) => {
  const d = Math.max(0, trackFrac(hi, dial) - trackFrac(lo, dial));
  return g ? `${(d * g.span).toFixed(2)}px` : `${(d * 100).toFixed(4)}%`;
};

function paint() {
  // State → engine (UI-level parked gate; estimator dormant too) →
  // ruled display model → DOM. Geometry + estimator seam carry the
  // ACTIVE shape at the INHERITED length, rebuilt each paint.
  // NO-SHIP GATE (Toby ruling 2026-08-17): no displayed Ship length =
  // no ship = N/A everywhere at any speed, no copy — engine and
  // estimator stay DORMANT exactly like parked. Selections made while
  // dashed persist into the first real computation — never reset.
  const geometry = activeGeometry();
  // NO SIZE (Toby 2026-08-18): parked and no-ship both produce a null
  // contract, so the state module — which only ever sees the contract —
  // cannot tell them apart and dashes both. It dashes CORRECTLY for
  // parked (a ship exists, it just is not moving), but a user who opens
  // DYNAMICS first has no ship at all and a row of dashes does not say
  // so; they read it as broken. The page DOES know the difference
  // (geometry === null IS the no-ship gate), so the distinction is drawn
  // here, in the DOM layer, leaving dynamic-state.js and its sealed
  // fixtures untouched — parked still dashes exactly as ruled.
  const noShip = geometry === null;
  const contract = noShip ? null
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
  // Deployed fairing: bareEst is already the estimate OF THE TAILED BODY,
  // because compute() swapped the geometry. No generic 20% assumption.
  const tailedEst = !state.tailOn || !bareEst ? null
    : (isSunship(activeShape) ? bareEst : applyGenericTail(bareEst));
  const { cd: cdInForce, cdSource } = resolveCd(state, bareEst, tailedEst);
  const sInForce = state.bliOn ? state.s : 0;

  // EAS IDEAL (re-ruled 2026-08-17, amending the 2026-08-16 greyed-out
  // ruling): the button is LIVE on every shape — full colour, never
  // greyed — so a user can click the EAS button through every page
  // with no sliding. But its VERB narrows off-Sunship: it sets speed
  // to 100 km/h and NOTHING else — Cd stays the estimator's, the
  // toggles stay locked/grey (Smart Tail + BLI remain the Sunship's
  // designs; the authored 0.043 still never leaks — the identity gate
  // that was the seal's honesty content is untouched).
  const sunship = isSunship(activeShape);
  idealBtn.disabled = false;
  idealBtn.style.opacity = '';
  idealBtn.title = idealTitle(sunship);

  // System toggles: Sunship-only in public (Toby ruling 2026-08-16 —
  // the greyed hard limit IS the lesson: these are the Sunship's
  // designs). The E+A+S chord unlocks them for engineer use; the chip
  // self-identifies both the held chord and any unlocked configuration.
  /* WHICH TAIL IS THIS? (Toby, 2026-08-18, reporting it against an
   * UNRELEASED hull variant: an uploaded near-copy of the Sunship gained
   * almost nothing from the toggle — 0.179 -> 0.145 — while the preset
   * goes 0.178 -> 0.0215. The variant is deliberately unnamed here; this
   * repo is public and it is not.)
   *
   * Not a bug: two genuinely different models sit behind one checkbox.
   * The Sunship gets its OWN fairing geometry, authored and measured, and
   * the estimator scores that body. Everything else gets the §5.4
   * REFERENCE ASSUMPTION — a flat 20% of the pressure term removed —
   * because we have not built a tail for it. Applying the generic rule to
   * the preset Sunship reproduces 0.1443, which is the number Toby saw,
   * so the two shapes agree exactly; it is the MODELS that differ.
   *
   * The difference was invisible: provenance is off the page by the
   * 2026-08-15 ruling, so the toggle looked identical either way. It now
   * says which model it is on hover — the same device the Fleet page's
   * CO2 basis uses (2026-08-17), and no on-page copy. The 20% figure
   * itself is a separate question and a real one: the one tail we have
   * ever measured removes 93% of pressure drag, not 20%. */
  const tailModelTitle = sunship
    ? 'Smart Tail DEPLOYED — the Sunship’s own fairing geometry, measured by the estimator'
    : 'Smart Tail — REFERENCE ASSUMPTION (§5.4): 20% of pressure drag removed. '
      + 'This is NOT a fairing built for this shape, and it is deliberately conservative — '
      + 'the Sunship’s measured fairing removes about 93%.';

  const unlocked = easHeld();
  const toggleLocked = !sunship && !unlocked;
  tailToggle.box.disabled = toggleLocked;
  bliToggle.box.disabled = toggleLocked;
  tailToggle.row.style.opacity = toggleLocked ? '0.4' : '';
  bliToggle.row.style.opacity = toggleLocked ? '0.4' : '';
  const rowTitle = toggleLocked ? 'Smart Tail and BLI are the Sunship’s configuration' : '';
  // The lock message wins while locked (it explains why the box will not
  // move, which is the more urgent question); once unlocked the row says
  // WHICH tail model is in force. One assignment — the first cut set the
  // model text a few lines above and this line silently overwrote it.
  tailToggle.row.title = toggleLocked ? rowTitle : tailModelTitle;
  bliToggle.row.title = rowTitle;
  easChip.style.display = unlocked || (!sunship && (state.tailOn || state.bliOn)) ? '' : 'none';

  // Per-shape Cd dial (§5.3 pinned rule): contract floor + estimate top.
  const dial = cdDialRange(contract, lastEstimate);
  cdCtl.slider.min = dial.min;
  cdCtl.slider.max = dial.max;
  lastDial = dial;   // the typed-entry handler clamps to the live dial

  speedCtl.slider.value = state.airspeedKmh;
  if (cdInForce != null) cdCtl.slider.value = cdInForce;
  sCtl.slider.value = sInForce;
  sCtl.slider.disabled = !state.bliOn;
  sCtl.wrap.style.opacity = state.bliOn ? '' : '0.5';
  tailToggle.box.checked = state.tailOn;
  bliToggle.box.checked = state.bliOn;
  speedCtl.valueSpan.textContent = String(state.airspeedKmh);
  // Estimate-tracking Cd wears the ESTIMATED tag and firms only when the
  // user drags OR TYPES (M6 amendment #2). Pending = tail off while
  // parked before any estimate exists: the snap resolves on first
  // movement (r6: parked selections carry, never reset).
  // NEVER overwrite the field mid-edit: paint() runs on shape changes,
  // resizes and the fleet bridge, any of which can land while the user is
  // halfway through typing a number.
  if (document.activeElement !== cdInput) {
    cdInput.value = cdInForce == null ? '—' : fmtCd(cdInForce);
    cdInput.disabled = cdInForce == null;   // nothing to edit with no ship
  }
  sCtl.valueSpan.textContent = `${Math.round(sInForce * 100)}%`;

  // The marker + silent band (live when running; cached while parked).
  const marker = rm.marker
    ?? (lastEstimate && lastEstimate.status === 'ok' && Number.isFinite(lastEstimate.cdEstimate)
      ? { value: lastEstimate.cdEstimate, lo: lastEstimate.band[0], hi: lastEstimate.band[1] }
      : null);
  if (marker) {
    // display FIRST: a hidden strip has no rect, and trackGeometry needs one.
    cdBand.style.display = '';
    const g = trackGeometry();
    bandSeg.style.left = trackPos(marker.lo, dial, g);
    bandSeg.style.width = trackSpan(marker.lo, marker.hi, dial, g);
    bandTick.style.left = trackPos(marker.value, dial, g);
    // The label rides just past the band's HIGH edge so it never covers
    // the band or the tick. If that would push it off the end of the
    // track it flips to the LOW side instead — the ordinary label-flip.
    // The estimate can reach at most ~2/3 of the dial (the dial's top is
    // max(0.55, 1.5 x estimate)), so the flip is a guard against odd
    // dials rather than a case the Sunship ever hits.
    if (g) {
      const GAP = 6;
      const hiPx = g.x0 + trackFrac(marker.hi, dial) * g.span;
      const loPx = g.x0 + trackFrac(marker.lo, dial) * g.span;
      const w = bandLabel.offsetWidth;
      const room = cdBand.getBoundingClientRect().width;
      const flip = hiPx + GAP + w > room;
      bandLabel.style.left = `${(flip ? Math.max(0, loPx - GAP - w) : hiPx + GAP).toFixed(2)}px`;
    } else {
      // No live geometry (painted while hidden) — the percentage fallback,
      // which cannot do the flip and does not need to: it is replaced by a
      // measured placement the moment the section is shown.
      bandLabel.style.left = trackPos(marker.hi, dial, g);
    }
  } else {
    cdBand.style.display = 'none';
  }
  for (const [label, value] of rm.rows) {
    const cell = outCells.get(label);
    // FAIL-SOFT (lesson of 2026-08-17): a state/page label mismatch
    // once crashed paint and killed the module — taking the nav
    // interception with it. Unknown labels now skip loudly instead.
    if (!cell) { console.warn('dynamic-page: no cell for row label', label); continue; }
    // The muted class is toggled for EVERY cell on EVERY paint, before the
    // branch. Bug fixed 2026-08-18 (Toby: "propulsion power is grey now"):
    // it used to live only in the else-branch, so the Propulsion power cell
    // — which takes the other branch once the ship is moving — acquired
    // .dyn-nosize during the no-ship state and never lost it. A state class
    // set in one branch and cleared in another is always this bug.
    cell.classList.toggle('dyn-nosize', noShip);
    if (label === 'Propulsion power' && !rm.parked) {
      cell.textContent = value;
      const tag = document.createElement('span');
      tag.className = 'dyn-power-tag';
      tag.textContent = rm.powerTag;
      cell.appendChild(tag);
    } else {
      // No ship yet: say so instead of dashing. (noShip implies parked,
      // so the power branch above can never be the one that runs here.)
      cell.textContent = noShip ? 'No Size' : value;
    }
  }
  // Compact form (Toby ruling 2026-08-17): warnings render as ⚠ icons
  // only — full text on hover (native tooltip). Placement refinement
  // same day (supersedes beside-the-title): each icon floats over the
  // result it warns about — kind 'fuel' → the LH2 + Storage anchor,
  // everything else → the Drag anchor. Absolute positioning keeps the
  // zero-height-impact ruling intact.
  const toIcon = (w) => {
    const div = document.createElement('div');
    div.className = `dyn-warning ${w.level}`;
    div.textContent = '⚠';
    div.title = w.text;
    return div;
  };
  warnCells.get('aero').replaceChildren(...rm.warnings.filter((w) => w.kind !== 'fuel').map(toIcon));
  warnCells.get('fuel').replaceChildren(...rm.warnings.filter((w) => w.kind === 'fuel').map(toIcon));

  // Airspeed bridge (ruling 2026-08-17): every paint re-declares the
  // ship's speed to FLEET through V1's own pathway (no-op unless it
  // actually changed — the DOM comparison inside is the memo).
  syncFleetAirspeed(state.airspeedKmh);
}

/* The marker is now placed in PIXELS off a live measurement, which is
 * what makes it land on the thumb — but pixels do not survive a layout
 * change on their own the way the old percentages did (they were wrong at
 * every width, just consistently wrong). Any reflow that moves the slider
 * therefore has to re-place it: a resize, and the phone breakpoint
 * crossing that comes with it. Coalesced to one repaint per burst so a
 * drag of the window edge cannot storm the engine.
 *
 * setTimeout, NOT requestAnimationFrame: rAF does not run in a tab that
 * is not compositing (measured here — a resize left the marker 3.9 px out
 * and the callback never fired), and a backgrounded tab resized by a
 * window-manager change is exactly that case. The delay is long enough
 * to let the ribbon's own .18s width transition settle, so the repaint
 * measures the layout that the user will actually be looking at. */
{
  let queued = false;
  window.addEventListener('resize', () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; paint(); }, 220);
  });
}

speedCtl.slider.addEventListener('input', () => { state = setInput(state, 'airspeedKmh', Number(speedCtl.slider.value)); paint(); });
cdCtl.slider.addEventListener('input', () => { state = setInput(state, 'cd', Number(cdCtl.slider.value)); paint(); });

/* Typed Cd. Commit on Enter or blur, abandon on Escape — the three verbs
 * every editable number in a form has, so nothing has to be explained.
 *
 * A typed value is CLAMPED to the live dial rather than rejected. The
 * dial's own range is a claim (bottom = the contract's friction floor, so
 * anything under it is physically impossible for this body; top = the
 * 0.55 sphere allowance), and clamping states that claim by moving the
 * number in front of the user, which is more informative than refusing
 * the keystroke and says it without any copy. Anything that is not a
 * positive number at all — blank, a word, a minus sign — is simply
 * abandoned, and the repaint restores the value in force.
 *
 * Deliberately setInput('cd'), the identical path a drag takes: typing
 * must firm the tracking sentinel and turn the scenario CUSTOM by exactly
 * the same rule, or the page would have two provenance stories for the
 * same act. */
let abandoningCdEdit = false;
function commitTypedCd() {
  if (abandoningCdEdit) { abandoningCdEdit = false; paint(); return; }
  const v = parseFloat(cdInput.value.replace(/[^\d.eE+-]/g, ''));
  if (Number.isFinite(v) && v > 0) {
    const clamped = Math.min(lastDial.max, Math.max(lastDial.min, v));
    state = setInput(state, 'cd', clamped);
  }
  paint();   // valid or not, the field is re-rendered from the value in force
}
cdInput.addEventListener('change', commitTypedCd);
cdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); cdInput.blur(); }
  else if (e.key === 'Escape') {
    e.preventDefault();
    // Escape must ABANDON, and blurring a modified field fires `change`,
    // which would commit the very edit being cancelled. A flag suppresses
    // that one commit and lets the repaint restore the value in force.
    //
    // The first cut instead put the old TEXT back before blurring, which
    // reads as more direct and is subtly wrong: the remembered string is
    // only refreshed by paints that happen while the field is unfocused,
    // so after any edit committed mid-focus it is stale, and Escape would
    // "restore" a number the ship no longer has. Never cache a rendering
    // of state when you can re-render from the state itself.
    abandoningCdEdit = true;
    cdInput.blur();
    paint();
  }
});
// Selecting the whole value on focus means typing a new one REPLACES it
// rather than appending to it — the field is 6 characters wide and the
// value is always fully overwritten in practice.
cdInput.addEventListener('focus', () => cdInput.select());
sCtl.slider.addEventListener('input', () => { state = setInput(state, 's', Number(sCtl.slider.value)); paint(); });
tailToggle.box.addEventListener('change', () => { state = setToggle(state, 'tailOn', tailToggle.box.checked); paint(); });
bliToggle.box.addEventListener('change', () => { state = setToggle(state, 'bliOn', bliToggle.box.checked); paint(); });
idealBtn.addEventListener('click', () => {
  // Sunship: the full authored configuration (unchanged). Any other
  // shape: SPEED ONLY — the ideal cruise speed through the normal input
  // pathway (ruling 2026-08-17; applyIdeal still throws off-Sunship,
  // unused here by design — the state seal is untouched). Read from
  // EAS_IDEAL, not typed: the literal 100 here silently outlived the
  // 2026-08-18 speed change until it was caught in the same sweep.
  state = isSunship(activeShape) ? applyIdeal(state)
    : setInput(state, 'airspeedKmh', EAS_IDEAL.airspeedKmh);
  paint();
});

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
