/**
 * Phase A: the ECONOMICS page — fourth stage of the pipeline (Shape > Ship > Fleet >
 * Economics), matching V1's page pattern: recap upstream state, add this layer.
 *
 * Why a page and not a panel: V1's section grids are height-locked to the viewport
 * (1fr rows), so injected extra rows overflow and paint over the page bottom. A page
 * gives the module real estate and room for Phase C (costs) later.
 *
 * All maths lives in economics.js (pure, Node-tested). V1's bundle is untouched; its
 * nav presenter only ever manages its own three links/sections, so a fourth link and
 * section coexist safely: V1 clicks re-activate its pages idempotently (restoring
 * them when leaving Economics), and a capture listener hides Economics on any V1 nav.
 * V1 ignores URL paths entirely (navigation is click-only) — Economics matches.
 *
 * Inputs are read from V1's displayed primitives, never its rounded derivatives.
 * Market size is special: V1 re-renders its text input ROUNDED (type 6.5 -> shows 7)
 * while the model keeps 6.5; the CO2 span is model-derived, so model-truth market
 * size is recovered from it and the input is only trusted when the two agree.
 */

import {
  computeEconomics, logSlider,
  RATE, CARBON, CAPEX, OPEX, PRECAPEX, RATE_PRESETS, CARBON_PRESETS, SUMMARY_LINK,
  fmtMoney, fmtRate, fmtPayback, parseDisplay,
} from './economics.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- styles

// Entirely in V1's tokens; grid + breakpoints mirror .section-fleet's structure.
const style = document.createElement('style');
style.textContent = `
  .section-economics {
    display: none;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: 1fr auto;
    min-height: 0;
    padding: var(--space-base);
    gap: var(--space-base);
  }
  .econ-panel {
    background-color: var(--color-bg-secondary);
    padding: 0 var(--space-base) var(--space-base) var(--space-base);
    min-height: 0;
    min-width: 0;
  }
  .econ-results-panel {
    grid-column: 3;
    grid-row: 1 / 3;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: min-content;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .econ-recap {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-content: start;
    gap: 0.5rem 1rem;
  }
  .econ-note {
    grid-column: 1 / 3;
    font-size: var(--font-base);
    color: var(--color-secondary);
  }
  @media (max-width: 1200px) {
    .section-economics { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, auto); min-height: auto; }
    .econ-results-panel { grid-column: 1 / 3; grid-row: auto; }
  }
  @media (max-width: 768px) {
    .section-economics { grid-template-columns: auto; grid-template-rows: repeat(3, auto); }
    .econ-results-panel { grid-column: auto; }
  }
`;
document.head.appendChild(style);

// ---------------------------------------------------------------- nav link

const nav = $('.header-nav');
const sep = document.createElement('span');
sep.className = 'header-nav-separator';
sep.textContent = '>';
const econLink = document.createElement('a');
econLink.className = 'header-nav-link';
econLink.href = '/economics';
econLink.dataset.navV2 = 'economics';
econLink.textContent = 'Economics';
nav.append(sep, econLink);

// ---------------------------------------------------------------- build page

const rateMap = logSlider(RATE.min, RATE.max);
const capexMap = logSlider(CAPEX.min, CAPEX.max);

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

function presetRow(ctl, presets, apply) {
  const row = document.createElement('div');
  row.className = 'fleet-chart-button-container';
  for (const p of presets) {
    const b = document.createElement('button');
    b.className = 'fleet-chart-button';
    b.textContent = p.label;
    b.addEventListener('click', () => { apply(p.value); recompute(); });
    row.appendChild(b);
  }
  ctl.wrap.appendChild(row);
}

const section = document.createElement('section');
section.className = 'section-economics';
section.dataset.sectionV2 = 'economics';

// --- Panel 1: recap of upstream state (V1's "Previous Properties" pattern) ---
const recapPanel = document.createElement('div');
recapPanel.className = 'panel-border econ-panel';
const recapHeading = document.createElement('h2');
recapHeading.className = 'fleet-selected-heading';
recapHeading.style.cssText = 'display:block;text-align:center;';
recapHeading.textContent = 'Previous Properties';
const recapGrid = document.createElement('div');
recapGrid.className = 'econ-recap';
const recapFields = {};
for (const [key, label] of [
  ['shape', 'Shape:'], ['ve', 'Volume Efficiency (VE%):'], ['netLift', 'Net Lift:'],
  ['airSpeed', 'Airspeed:'], ['util', 'Utilisation:'], ['market', 'Market Size:'],
]) {
  const h = document.createElement('div');
  h.className = 'fleet-selected-data';
  h.textContent = label;
  const d = document.createElement('div');
  d.className = 'fleet-selected-data';
  d.style.color = 'var(--color-primary)';
  d.textContent = '—';
  recapGrid.append(h, d);
  recapFields[key] = d;
}
recapPanel.append(recapHeading, recapGrid);

// --- Panel 2: the five price controls ---
// (Capex benchmark markers from the roadmap — Handmer $10M / container ship ~$150M /
// 747-8F ~$400M — are deliberately NOT buttons: a third preset row would push the
// page past small viewports. The anchors live in the roadmap and chat notes.)
const controlsPanel = document.createElement('div');
controlsPanel.className = 'panel-border econ-panel';
// Heading + pink EAS ideal button, exactly V1's fleet-page pattern. The defaults ARE
// the EAS scenario, so the button is simply "return to defaults" after any changes.
const headingContainer = document.createElement('div');
headingContainer.className = 'fleet-controls-heading-container';
const controlsHeading = document.createElement('h2');
controlsHeading.className = 'fleet-controls-heading';
controlsHeading.textContent = 'Current Properties';
const idealBtn = document.createElement('button');
idealBtn.className = 'fleet-control-preset';
idealBtn.dataset.v2 = 'econ-ideal';
const idealIcon = document.createElement('img');
idealIcon.className = 'fleet-control-preset-icon';
idealIcon.src = '/assets/logo_circles.svg';
idealIcon.alt = 'EAS ideal economics';
idealBtn.appendChild(idealIcon);
headingContainer.append(controlsHeading, idealBtn);

const rateCtl = control('Freight Rate', '/ Ton-km', { min: 0, max: 100, step: 'any', value: rateMap.toView(RATE.default) });
presetRow(rateCtl, RATE_PRESETS, (v) => { rateCtl.slider.value = rateMap.toView(v); });

const carbonCtl = control('Carbon Price', '/ Tonne CO₂', { min: CARBON.min, max: CARBON.max, step: 1, value: CARBON.default });
presetRow(carbonCtl, CARBON_PRESETS, (v) => { carbonCtl.slider.value = v; });

const capexCtl = control('Capex per Sunship', '', { min: 0, max: 100, step: 'any', value: capexMap.toView(CAPEX.default) });

// Opex is ALL-IN per ship (crew, fuel, maintenance, insurance, share of ground
// infrastructure) — linear slider, the range spans only 20x. Pre-capex is the one-off
// programme cost (R&D, testing, approval, pre-revenue burn) — log, spans 200x.
const preMap = logSlider(PRECAPEX.min, PRECAPEX.max);
const opexCtl = control('Opex per Sunship (all-in)', '/ year', { min: OPEX.min, max: OPEX.max, step: 1e6, value: OPEX.default });
const preCtl = control('Program Pre-Capex', 'one-off', { min: 0, max: 100, step: 'any', value: preMap.toView(PRECAPEX.default) });

controlsPanel.append(headingContainer, rateCtl.wrap, carbonCtl.wrap, capexCtl.wrap, opexCtl.wrap, preCtl.wrap);

idealBtn.addEventListener('click', () => {
  rateCtl.slider.value = rateMap.toView(RATE.default);
  carbonCtl.slider.value = CARBON.default;
  capexCtl.slider.value = capexMap.toView(CAPEX.default);
  opexCtl.slider.value = OPEX.default;
  preCtl.slider.value = preMap.toView(PRECAPEX.default);
  recompute();
});

// --- Panel 3: results (V1's fleet-results pattern, spanning both rows) ---
const resultsPanel = document.createElement('div');
resultsPanel.className = 'panel-border econ-panel econ-results-panel';
const resultsHeading = document.createElement('h2');
resultsHeading.className = 'fleet-results-header';
resultsHeading.textContent = 'Results';
resultsPanel.appendChild(resultsHeading);

function statRow(headerText, { emphasis = false } = {}) {
  const h = document.createElement('div');
  h.className = emphasis ? 'fleet-results-required-header' : 'fleet-results-data-header';
  h.textContent = headerText;
  const d = document.createElement('div');
  d.className = emphasis ? 'fleet-results-required-data' : 'fleet-results-data';
  d.textContent = '—';
  resultsPanel.append(h, d);
  return d;
}
const addRule = () => {
  const hr = document.createElement('div');
  hr.className = 'fleet-results-hr';
  resultsPanel.appendChild(hr);
};
const outTotal = statRow('Total Revenue / year:', { emphasis: true });
addRule();
const outFreight = statRow('Freight Revenue / year:');
const outCarbon = statRow('Carbon Credits / year:');
const outFleetOpex = statRow('Fleet Opex / year:');
const outFleetProfit = statRow('Fleet Profit / year:');
addRule();
const outPerShip = statRow('Revenue per Sunship / year:');
const outMargin = statRow('Margin per Sunship / year:');
const outPayback = statRow('Payback per Sunship:');
const outBreakeven = statRow('Program Breakeven:');
// No on-page caveat note by Toby's call — the COPY SUMMARY text still carries the
// steady-state caveat inline on its breakeven line, so shared numbers keep their
// context even though the page lets viewers interpret freely.

// Share: copy the whole scenario — numbers AND the assumptions that produced them —
// as plain text for chats/socials. Assumptions travel with results on purpose: a
// revenue figure without its rate is noise; with it, it's an argument.
// Lives in the LEFT column (under the recap) where there's spare height — keeping it
// in the results column pushed the page past small viewports and hid the button.
const shareRow = document.createElement('div');
shareRow.className = 'fleet-chart-button-container';
const shareBtn = document.createElement('button');
shareBtn.className = 'fleet-chart-button';
shareBtn.textContent = 'COPY SUMMARY';
shareRow.appendChild(shareBtn);
recapPanel.appendChild(shareRow);

function buildSummary() {
  const i = readInputs();
  const e = computeEconomics(i);
  const required = e.requiredShips !== null ? Math.round(e.requiredShips).toLocaleString('en-US') : '—';
  const length = $('[data-ship="length-output"]')?.textContent ?? '—';
  const temp = $('[data-ship="temperature-output"]')?.textContent ?? '—';
  const shape = $('[data-shape="shape"]')?.textContent ?? '—';
  const ve = $('[data-shape="input-volume-efficiency"]')?.value ?? '—';
  return [
    'EAS FLEET CALCULATOR',
    `Shape: ${shape} (VE ${ve})`,
    `Ship: ${length}m @ ${temp}°C → Net Lift ${Math.round(i.netLiftT).toLocaleString('en-US')} tonnes`,
    `Airspeed: ${i.airSpeedKmh} km/h · Utilisation: ${i.utilisationPct}%`,
    `Market: ${i.marketSizeTtkm.toFixed(2)} Trillion Ton-km/yr`,
    `Total Airships Required: ${required}`,
    `Assumptions: ${fmtRate(i.ratePerTkm)}/ton-km · Carbon $${i.carbonPerT}/t · Capex ${fmtMoney(i.capex)}/ship · Opex ${fmtMoney(i.opexPerShip)}/ship/yr · Pre-Capex ${fmtMoney(i.preCapex)}`,
    `TOTAL REVENUE: ${fmtMoney(e.totalRevenue)}/yr`,
    `— Freight: ${fmtMoney(e.freightRevenue)}/yr`,
    `— Carbon Credits: ${fmtMoney(e.carbonRevenue)}/yr`,
    `Fleet Opex: ${fmtMoney(e.fleetOpex)}/yr → FLEET PROFIT: ${fmtMoney(e.fleetProfit)}/yr`,
    `Per Sunship: ${fmtMoney(e.revenuePerShip)}/yr revenue · ${fmtMoney(e.marginPerShip)}/yr margin · Payback ${fmtPayback(e.paybackYears)}`,
    `PROGRAM BREAKEVEN: ${fmtPayback(e.breakevenYears)} (repays pre-capex + full fleet capex, steady state)`,
    SUMMARY_LINK,
  ].join('\n');
}

shareBtn.addEventListener('click', async () => {
  const text = buildSummary();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API can be blocked (non-secure context, permissions) — textarea fallback.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const old = shareBtn.textContent;
  shareBtn.textContent = 'COPIED ✓';
  setTimeout(() => { shareBtn.textContent = old; }, 1500);
});

section.append(recapPanel, controlsPanel, resultsPanel);
$('[data-section="fleet"]').after(section);

// ---------------------------------------------------------------- page switching

const V1_SECTIONS = ['shape', 'ship', 'fleet'].map((id) => $(`[data-section="${id}"]`));
const V1_LINKS = ['shape', 'ship', 'fleet'].map((id) => $(`[data-nav="${id}"]`));

function showEconomics() {
  // Hide whichever V1 section is showing and take its nav highlight. V1's own state
  // is untouched — its next nav click re-activates idempotently.
  for (const s of V1_SECTIONS) s.style.display = 'none';
  for (const l of V1_LINKS) l.classList.remove('current-page');
  section.style.display = 'grid';
  econLink.classList.add('current-page');
  recompute();
}

econLink.addEventListener('click', (e) => {
  e.preventDefault();
  showEconomics();
});

// Any V1 nav click leaves Economics. V1 DEDUPES same-page navigation (clicking Fleet
// while its model already says "fleet" re-activates nothing), so the section the user
// clicked is restored HERE, not left to V1 — idempotent with V1's own activation on
// genuine page changes.
V1_LINKS.forEach((link, i) => {
  link.addEventListener('click', () => {
    section.style.display = 'none';
    econLink.classList.remove('current-page');
    V1_SECTIONS[i].style.display = 'grid';
    link.classList.add('current-page');
  }, true);
});

// ---------------------------------------------------------------- recompute

/** See module doc: model-truth market size via the CO2 span, input only when they agree. */
function readMarketSize() {
  const fromInput = parseDisplay($('[data-fleet="marketsize-output"]')?.value);
  const co2 = parseDisplay($('[data-fleet="resuls-c02reducedamount"]')?.textContent);
  const fromModel = co2 * 122 / 1000;
  if (!(fromModel > 0)) return fromInput;
  return Math.abs(fromInput - fromModel) <= 0.02 + 0.001 * fromModel ? fromInput : fromModel;
}

function readInputs() {
  return {
    marketSizeTtkm: readMarketSize(),
    netLiftT: parseDisplay($('[data-ship="netlift-output"]')?.textContent),
    airSpeedKmh: parseDisplay($('[data-fleet="airSpeed-output"]')?.textContent),
    utilisationPct: parseDisplay($('[data-fleet="utilisation-output"]')?.textContent),
    ratePerTkm: rateMap.toValue(Number(rateCtl.slider.value)),
    carbonPerT: Number(carbonCtl.slider.value),
    capex: capexMap.toValue(Number(capexCtl.slider.value)),
    opexPerShip: Number(opexCtl.slider.value),
    preCapex: preMap.toValue(Number(preCtl.slider.value)),
  };
}

let pending = false;
function recompute() {
  if (pending) return; // coalesce bursts (slider drags, pubsub cascades)
  pending = true;
  setTimeout(() => {
    pending = false;
    const inputs = readInputs();
    const e = computeEconomics(inputs);

    rateCtl.valueSpan.textContent = fmtRate(inputs.ratePerTkm);
    carbonCtl.valueSpan.textContent = `$${inputs.carbonPerT}`;
    capexCtl.valueSpan.textContent = fmtMoney(inputs.capex);
    opexCtl.valueSpan.textContent = fmtMoney(inputs.opexPerShip);
    preCtl.valueSpan.textContent = fmtMoney(inputs.preCapex);

    recapFields.shape.textContent = $('[data-shape="shape"]')?.textContent || '—';
    recapFields.ve.textContent = $('[data-shape="input-volume-efficiency"]')?.value || '—';
    recapFields.netLift.textContent = `${$('[data-ship="netlift-output"]')?.textContent ?? '—'} tonnes`;
    recapFields.airSpeed.textContent = `${inputs.airSpeedKmh} km/hr`;
    recapFields.util.textContent = `${inputs.utilisationPct}%`;
    recapFields.market.textContent = `${inputs.marketSizeTtkm.toFixed(2)} Trillion Ton-km / year`;

    outFreight.textContent = fmtMoney(e.freightRevenue);
    outCarbon.textContent = fmtMoney(e.carbonRevenue);
    outTotal.textContent = fmtMoney(e.totalRevenue);
    outFleetOpex.textContent = fmtMoney(e.fleetOpex);
    outFleetProfit.textContent = fmtMoney(e.fleetProfit);
    outPerShip.textContent = fmtMoney(e.revenuePerShip);
    outMargin.textContent = fmtMoney(e.marginPerShip);
    outPayback.textContent = fmtPayback(e.paybackYears);
    outBreakeven.textContent = fmtPayback(e.breakevenYears);
  }, 0);
}
window.__v2Econ = { readInputs, recompute, computeEconomics, showEconomics, buildSummary }; // for automated tests

// ---------------------------------------------------------------- wiring

for (const s of [rateCtl.slider, carbonCtl.slider, capexCtl.slider, opexCtl.slider, preCtl.slider]) {
  s.addEventListener('input', recompute);
}

// V1-driven changes: labelled outputs are spans (one MutationObserver covers sliders,
// presets, ideal buttons and upstream Shape/Ship changes alike). The market-size text
// input's .value changes are invisible to observers, so its events and every button
// that sets it programmatically are wired explicitly; V1 ingests typed values on
// focusout and may re-render them rounded, so recompute then too.
const observer = new MutationObserver(recompute);
for (const sel of ['[data-ship="netlift-output"]', '[data-fleet="airSpeed-output"]', '[data-fleet="utilisation-output"]', '[data-fleet="resuls-c02reducedamount"]']) {
  const el = $(sel);
  if (el) observer.observe(el, { childList: true, characterData: true, subtree: true });
}

// V1's own Fleet page prints a NEGATIVE Required Sunships figure when the ship can't
// fly (pre-existing bundle behaviour). Rewrite it to N/A whenever it goes negative —
// the rewrite re-fires the observer, which then parses "N/A" as NaN and stops, so
// there's no loop.
const requiredCell = $('[data-fleet="results-required"]');
if (requiredCell) {
  const guardRequired = () => {
    if (parseDisplay(requiredCell.textContent) < 0) requiredCell.textContent = 'N/A';
  };
  new MutationObserver(guardRequired).observe(requiredCell, { childList: true, characterData: true, subtree: true });
  guardRequired();
}
const marketInput = $('[data-fleet="marketsize-output"]');
for (const evt of ['input', 'change', 'focusout']) marketInput?.addEventListener(evt, recompute);
for (const sel of ['[data-fleet="marketsize"]', '[data-fleet="marketsize-preset-1"]', '[data-fleet="marketsize-preset-2"]', '[data-fleet="marketsize-preset-3"]', '[data-fleet="ideal-button"]']) {
  const el = $(sel);
  if (!el) continue;
  el.addEventListener('input', recompute);
  el.addEventListener('click', recompute);
}

recompute();
