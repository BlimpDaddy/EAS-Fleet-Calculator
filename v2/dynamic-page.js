/**
 * The DYNAMIC page — M3 shell (DYNAMIC-SPEC §14 step 3; Display Rulings
 * v1.0 2026-08-13; M3 display amendments 2026-08-15; review pins r6).
 *
 * Fifth page of the pipeline, inserted between Ship and Fleet in the nav —
 * the physics order (shape → lift → flight → fleet → economics); FLEET
 * consumes DYNAMIC's rate at M8. Follows revenue.js's injection pattern:
 * V1's bundle untouched, a nav link + section coexisting with V1's
 * click-only navigation, all styling in V1's own tokens.
 *
 * WHAT THE SHELL IS (r6: "M3 does not consume M4/M5"): parked load, the
 * pink EAS IDEAL button, three sliders, condensed outputs, provenance,
 * warnings-only statuses, a blank centre reservation for the visualiser
 * (its own major job, NOT this phase). Toggles are rendered but INERT —
 * they become operational at M4 (tail) / M5 (BLI).
 *
 * ALL state logic and display selection lives in dynamic-state.js (pure,
 * Node-tested — test/dynamic-state-fixtures.mjs). This file is DOM only:
 * it may not compute anything, and FLEET never scrapes what it renders.
 */
import { computeDynamics } from '/calcv2/src/dynamicsCore.js';
import {
  EAS_IDEAL, SPEED_MIN, SPEED_MAX, S_MAX,
  initialState, isParked, setInput, applyIdeal, compute, renderModel,
} from './dynamic-state.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- styles

// Entirely V1 tokens; grid mirrors .section-economics / .section-fleet.
const style = document.createElement('style');
style.textContent = `
  .section-dynamic {
    display: none;
    grid-template-columns: 1fr 1.5fr 1fr;
    grid-template-rows: 1fr auto;
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
  /* Controls: no horizontal padding, exactly like V1's .fleet-controls. */
  .dyn-controls-panel { padding: 0; }
  /* The visualiser reservation: centre-page, dominant, deliberately empty.
     (M7 fills it; M3 only holds the ground — rulings 2026-08-13.) */
  .dyn-visual-panel {
    grid-row: 1 / 3;
    grid-column: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dyn-visual-note {
    color: var(--color-secondary);
    font-size: var(--font-base);
    opacity: 0.5;
    text-align: center;
  }
  .dyn-results-panel {
    grid-column: 3;
    grid-row: 1 / 3;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: min-content;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  /* The bare (−x%) tag rides the power value, pink — the number IS the S
     setting (M3 display amendment 1). */
  .dyn-power-tag { color: var(--color-accent-1); margin-left: 0.4em; }
  /* Warnings-only status area: silence is good news. */
  .dyn-warnings { grid-column: 1 / 3; }
  .dyn-warning { color: var(--color-critical, #ff2a2a); font-size: var(--font-base); margin-top: 0.5rem; }
  .dyn-warning.orange { color: var(--color-accent-2, #ff9900); }
  .dyn-provenance {
    grid-column: 1 / 3;
    color: var(--color-secondary);
    font-size: calc(var(--font-base) * 0.85);
    margin-top: 1rem;
  }
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
    margin: 0.6rem var(--space-base) 0 var(--space-base);
    color: var(--color-primary); font-size: var(--font-base);
  }
  .dyn-toggle-row input { accent-color: var(--color-accent-1); }
  .dyn-toggle-row .dyn-toggle-note { color: var(--color-secondary); font-size: 0.85em; }
  @media (max-width: 1200px) {
    .section-dynamic { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, auto); min-height: auto; }
    .dyn-visual-panel { grid-column: 1 / 3; grid-row: auto; min-height: 30vh; }
    .dyn-results-panel { grid-column: 1 / 3; grid-row: auto; }
  }
  @media (max-width: 768px) {
    .section-dynamic { grid-template-columns: auto; }
    .dyn-visual-panel, .dyn-results-panel { grid-column: auto; }
  }
`;
document.head.appendChild(style);

// ---------------------------------------------------------------- nav link

// Between Ship and Fleet: the physics order. V1's nav presenter selects by
// data-nav attributes, not child order, so inserting mid-row is safe.
const fleetLink = $('[data-nav="fleet"]');
const sep = document.createElement('span');
sep.className = 'header-nav-separator';
sep.textContent = '>';
const dynLink = document.createElement('a');
dynLink.className = 'header-nav-link';
dynLink.href = '/dynamic';
dynLink.dataset.navV2 = 'dynamic';
dynLink.textContent = 'Dynamic';
// V1's own separator already sits between Ship and Fleet; inserting
// [Dynamic, >] before Fleet reads: Ship > Dynamic > Fleet.
fleetLink.before(dynLink, sep);

// ---------------------------------------------------------------- build page

let state = initialState();

const section = document.createElement('section');
section.className = 'section-dynamic';
section.dataset.sectionV2 = 'dynamic';

// --- Panel 1: controls ("Current Properties" + the one pink button) ---
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

// Inert toggles — the shell renders the ON state; M4/M5 wire them live.
function toggleRow(labelText, note) {
  const row = document.createElement('div');
  row.className = 'dyn-toggle-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  box.disabled = true; // M3 shell: present, inert (r6)
  const label = document.createElement('span');
  label.textContent = labelText;
  const noteSpan = document.createElement('span');
  noteSpan.className = 'dyn-toggle-note';
  noteSpan.textContent = note;
  row.append(box, label, noteSpan);
  return row;
}
const tailRow = toggleRow('Smart Tail', 'ON');
const bliRow = toggleRow('BLI', 'ON');

controlsPanel.append(headingContainer, speedCtl.wrap, cdCtl.wrap, sCtl.wrap, tailRow, bliRow);

// --- Panel 2 (centre, dominant): the visualiser reservation ---
const visualPanel = document.createElement('div');
visualPanel.className = 'panel-border dyn-panel dyn-visual-panel';
const visualNote = document.createElement('div');
visualNote.className = 'dyn-visual-note';
visualNote.textContent = ' ';
visualPanel.appendChild(visualNote);

// --- Panel 3: the condensed output box ---
const resultsPanel = document.createElement('div');
resultsPanel.className = 'panel-border dyn-panel dyn-results-panel';
const resultsHeading = document.createElement('h2');
resultsHeading.className = 'fleet-results-header';
resultsHeading.textContent = 'Results';
resultsPanel.appendChild(resultsHeading);

const outCells = new Map();
function resultRow(label) {
  const h = document.createElement('div');
  h.className = 'fleet-results-data-header';
  h.textContent = `${label}:`;
  const d = document.createElement('div');
  d.className = 'fleet-results-data';
  d.textContent = '—';
  resultsPanel.append(h, d);
  outCells.set(label, d);
}
for (const label of [
  'Frontal area', 'Wetted area', 'Drag', 'Propulsion power',
  'Energy / 1,000 km', 'LH2 / 1,000 km', 'Fuel system weight',
]) resultRow(label);

const warningsBox = document.createElement('div');
warningsBox.className = 'dyn-warnings';
const provLine = document.createElement('div');
provLine.className = 'dyn-provenance';
resultsPanel.append(warningsBox, provLine);

section.append(controlsPanel, visualPanel, resultsPanel);
$('[data-section="fleet"]').after(section);

// ---------------------------------------------------------------- render

function paint() {
  // Slider positions always mirror state (the ideal button moves them).
  speedCtl.slider.value = state.airspeedKmh;
  cdCtl.slider.value = state.cd;
  sCtl.slider.value = state.s;
  speedCtl.valueSpan.textContent = String(state.airspeedKmh);
  cdCtl.valueSpan.textContent = state.cd.toFixed(3);
  sCtl.valueSpan.textContent = `${Math.round(state.s * 100)}%`;

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
    div.className = 'dyn-warning' + (/ORANGE/.test(w) ? ' orange' : '');
    div.textContent = w;
    return div;
  }));
  provLine.textContent = rm.parked ? '' : rm.provenance;
}

speedCtl.slider.addEventListener('input', () => { state = setInput(state, 'airspeedKmh', Number(speedCtl.slider.value)); paint(); });
cdCtl.slider.addEventListener('input', () => { state = setInput(state, 'cd', Number(cdCtl.slider.value)); paint(); });
sCtl.slider.addEventListener('input', () => { state = setInput(state, 's', Number(sCtl.slider.value)); paint(); });
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
