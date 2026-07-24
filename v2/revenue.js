/**
 * Phase A adapter: the Economics strip on the Fleet page.
 *
 * All maths lives in economics.js (pure, Node-tested); this file only reads V1's
 * displayed primitives, renders, and re-renders on change. V1's bundle is untouched.
 *
 * Inputs are read from V1's own labelled outputs rather than its closed model:
 * net lift from the Ship page's span (present in the DOM even while hidden),
 * airspeed/utilisation from their fleet labels, market size from its text input.
 * Derived-and-rounded values (tonKm/ship, CO2) are deliberately NOT read — they are
 * recomputed from primitives so rounding in V1's display never compounds.
 */

import {
  computeEconomics, logSlider,
  RATE, CARBON, CAPEX, RATE_PRESETS, CARBON_PRESETS,
  fmtMoney, fmtRate, fmtPayback, parseDisplay,
} from './economics.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- styles

// One small style block, entirely in V1's tokens. The strip takes an implicit third
// row of the fleet grid (full width); his 1200/768 breakpoints inherit it as-is.
const style = document.createElement('style');
style.textContent = `
  .fleet-econ {
    grid-column: 1 / -1;
    background-color: var(--color-bg-secondary);
    padding: 0 var(--space-base) var(--space-base) var(--space-base);
    display: grid;
    gap: var(--space-base);
  }
  .fleet-econ-controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-base);
    align-items: start;
  }
  .fleet-econ-results {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    gap: var(--space-base);
    text-align: center;
  }
  .fleet-econ-note {
    font-size: var(--font-base);
    color: var(--color-secondary);
    text-align: right;
  }
  @media (max-width: 768px) {
    .fleet-econ-controls { grid-template-columns: 1fr; }
  }
`;
document.head.appendChild(style);

// ---------------------------------------------------------------- build UI

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

function stat(headerText) {
  const box = document.createElement('div');
  const h = document.createElement('div');
  h.className = 'fleet-results-data-header';
  h.textContent = headerText;
  const d = document.createElement('div');
  d.className = 'fleet-results-data';
  d.textContent = '—';
  box.append(h, d);
  return { box, d };
}

const panel = document.createElement('div');
panel.className = 'panel-border fleet-econ';
panel.dataset.v2 = 'economics';

const heading = document.createElement('h2');
heading.className = 'fleet-results-header';
heading.textContent = 'Economics';
panel.appendChild(heading);

const controls = document.createElement('div');
controls.className = 'fleet-econ-controls';

// Freight rate (log slider in view units 0-100) + its preset buttons.
const rateCtl = control('Freight Rate', '/ Ton-km', { min: 0, max: 100, step: 'any', value: rateMap.toView(RATE.default) });
const ratePresetRow = document.createElement('div');
ratePresetRow.className = 'fleet-chart-button-container';
for (const p of RATE_PRESETS) {
  const b = document.createElement('button');
  b.className = 'fleet-chart-button';
  b.textContent = p.label;
  b.addEventListener('click', () => {
    rateCtl.slider.value = rateMap.toView(p.value);
    recompute();
  });
  ratePresetRow.appendChild(b);
}
rateCtl.wrap.appendChild(ratePresetRow);

const carbonCtl = control('Carbon Price', '/ Tonne CO₂', { min: CARBON.min, max: CARBON.max, step: 1, value: CARBON.default });
// Same preset treatment as the rate slider: the carbon anchors ARE the policy story
// (junk-vs-credible VCM, EU compliance, IMO's 2028 penalty tiers) — one click each.
const carbonPresetRow = document.createElement('div');
carbonPresetRow.className = 'fleet-chart-button-container';
for (const p of CARBON_PRESETS) {
  const b = document.createElement('button');
  b.className = 'fleet-chart-button';
  b.textContent = p.label;
  b.addEventListener('click', () => {
    carbonCtl.slider.value = p.value;
    recompute();
  });
  carbonPresetRow.appendChild(b);
}
carbonCtl.wrap.appendChild(carbonPresetRow);
const capexCtl = control('Capex per Sunship', '', { min: 0, max: 100, step: 'any', value: capexMap.toView(CAPEX.default) });

controls.append(rateCtl.wrap, carbonCtl.wrap, capexCtl.wrap);
panel.appendChild(controls);

const results = document.createElement('div');
results.className = 'fleet-econ-results';
const outFreight = stat('Freight Revenue / year:');
const outCarbon = stat('Carbon Credits / year:');
const outTotal = stat('Total Revenue / year:');
const outPerShip = stat('Revenue per Sunship / year:');
const outPayback = stat('Simple Payback:');
// Total gets V1's emphasis styling (accent, larger) — mirrors "Required Sunships".
outTotal.d.className = 'fleet-results-required-data';
results.append(outFreight.box, outCarbon.box, outTotal.box, outPerShip.box, outPayback.box);
panel.appendChild(results);

const note = document.createElement('div');
note.className = 'fleet-econ-note';
note.textContent = 'Payback is before operating costs — fuel & opex arrive with the aerodynamics module.';
panel.appendChild(note);

$('[data-section="fleet"]').appendChild(panel);

// ---------------------------------------------------------------- recompute

/**
 * Market size needs care: V1 can re-render its text input ROUNDED (type 6.5, it may
 * display "7") while the model keeps the exact value. Its CO2 span is model-derived
 * (co2 = market/122*1000), so market recovered from it is model-truth to 2dp. Use the
 * input's higher precision only when the two agree within display rounding.
 */
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

    outFreight.d.textContent = fmtMoney(e.freightRevenue);
    outCarbon.d.textContent = fmtMoney(e.carbonRevenue);
    outTotal.d.textContent = fmtMoney(e.totalRevenue);
    outPerShip.d.textContent = fmtMoney(e.revenuePerShip);
    outPayback.d.textContent = fmtPayback(e.paybackYears);
  }, 0);
}
window.__v2Econ = { readInputs, recompute, computeEconomics }; // for automated tests

// ---------------------------------------------------------------- wiring

// Our own sliders.
for (const s of [rateCtl.slider, carbonCtl.slider, capexCtl.slider]) {
  s.addEventListener('input', recompute);
}

// V1-driven changes. The labelled outputs are spans, so one MutationObserver covers
// slider drags, preset buttons, ideal buttons and upstream Shape/Ship changes alike
// (V1 re-renders them all through pubsub). The market-size input is a text input —
// .value changes are invisible to MutationObserver — so its events and every button
// that sets it programmatically are wired explicitly.
const observer = new MutationObserver(recompute);
for (const sel of ['[data-ship="netlift-output"]', '[data-fleet="airSpeed-output"]', '[data-fleet="utilisation-output"]', '[data-fleet="resuls-c02reducedamount"]']) {
  const el = $(sel);
  if (el) observer.observe(el, { childList: true, characterData: true, subtree: true });
}
const marketInput = $('[data-fleet="marketsize-output"]');
marketInput?.addEventListener('input', recompute);
marketInput?.addEventListener('change', recompute);
// V1 ingests typed values on focusout (its usual pattern) and may normalise them —
// recompute then too, so we always reflect what V1 actually accepted.
marketInput?.addEventListener('focusout', recompute);
for (const sel of ['[data-fleet="marketsize"]', '[data-fleet="marketsize-preset-1"]', '[data-fleet="marketsize-preset-2"]', '[data-fleet="marketsize-preset-3"]', '[data-fleet="ideal-button"]']) {
  const el = $(sel);
  if (!el) continue;
  el.addEventListener('input', recompute);
  el.addEventListener('click', recompute);
}

recompute();
