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
import {
  EAS_IDEAL, BODY_ONLY_CD, SPEED_MIN, SPEED_MAX, S_MAX,
  initialState, isParked, setInput, setToggle, applyIdeal, compute, renderModel,
} from './dynamic-state.js';

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
  /* Inert toggles (M3 shell): visible state, no interaction until M4/M5. */
  .dyn-toggle-row {
    display: flex; align-items: center; gap: 0.5em;
    color: var(--color-primary); font-size: var(--font-base);
    white-space: nowrap;
  }
  .dyn-toggle-row input { accent-color: var(--color-accent-1); }
  .dyn-toggle-row .dyn-toggle-note { color: var(--color-secondary); font-size: 0.85em; }
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
// Sunship Cd dial 0.009–0.40; S 0–75% with evidence zones on the control).
const speedCtl = control('Airspeed', 'km/hr', { min: SPEED_MIN, max: SPEED_MAX, step: 1, value: 0 });
const cdCtl = control('Drag Coefficient (Cd)', '', { min: 0.009, max: 0.40, step: 0.001, value: EAS_IDEAL.cd });
const sCtl = control('Power Saving (S)', '', { min: 0, max: S_MAX, step: 0.01, value: EAS_IDEAL.s });
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
const toggleCol = document.createElement('div');
toggleCol.className = 'dyn-toggle-col';
toggleCol.append(tailToggle.row, bliToggle.row);

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
  'Frontal area', 'Wetted area', 'Drag', 'Propulsion power',
  'LH2 / 1,000 km', 'LH2 weight (10,000 km)', 'LH2 + Storage (10,000 km)',
]) statBlock(label);

const warningsBox = document.createElement('div');
warningsBox.className = 'dyn-warnings';
resultsPanel.append(resultsHeading, resultsRow, warningsBox);

section.append(controlsPanel, visualPanel, resultsPanel);
$('[data-section="fleet"]').after(section);

// ---------------------------------------------------------------- render

function paint() {
  // Slider positions always mirror state (the ideal button moves them).
  // A toggled-off system SNAPS its slider to the forced value and greys
  // it; the underlying selection survives and restores on re-enable
  // (bench ruling cea306a — the value in force is never ambiguous).
  const cdInForce = state.tailOn ? state.cd : BODY_ONLY_CD;
  const sInForce = state.bliOn ? state.s : 0;
  speedCtl.slider.value = state.airspeedKmh;
  cdCtl.slider.value = cdInForce;
  sCtl.slider.value = sInForce;
  cdCtl.slider.disabled = !state.tailOn;
  sCtl.slider.disabled = !state.bliOn;
  cdCtl.wrap.style.opacity = state.tailOn ? '' : '0.5';
  sCtl.wrap.style.opacity = state.bliOn ? '' : '0.5';
  tailToggle.box.checked = state.tailOn;
  bliToggle.box.checked = state.bliOn;
  speedCtl.valueSpan.textContent = String(state.airspeedKmh);
  cdCtl.valueSpan.textContent = cdInForce.toFixed(3);
  sCtl.valueSpan.textContent = `${Math.round(sInForce * 100)}%`;

  // State → engine (UI-level parked gate) → ruled display model → DOM.
  const rm = renderModel(compute(state, computeDynamics));
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
idealBtn.addEventListener('click', () => { state = applyIdeal(state); paint(); });

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
