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
  computeDisplacement, CREDIT_FRACTION,
} from './economics.js';
import { TOTAL_CO2_MT } from './co2-config.js';

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
    gap: 0 1rem; /* compact rows, matching the Fleet panel */
  }
  /* Controls panel: NO horizontal padding, exactly like V1's .fleet-controls —
     the .fleet-control children carry their own margins. The extra padding was
     shrinking the sliders and shifting the pink ideal button vs pages 2 & 3. */
  .econ-controls-panel {
    padding: 0;
  }
  .econ-note {
    grid-column: 1 / 3;
    font-size: var(--font-base);
    color: var(--color-secondary);
  }
  /* Our preset rows live INSIDE .fleet-control (V1's own live outside it), so
     V1's .fleet-control:focus-within turns a clicked button's text pink — pink
     on pink-hover = invisible. Pin button text to the normal text colour. */
  .section-economics .fleet-chart-button {
    color: var(--color-primary);
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
econLink.textContent = 'Economic';
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
// Shape picture, same device as pages 2 & 3 (reusing V1's own class gets the
// identical centred/dimmed look); src mirrors the Fleet panel's icon, which
// the upload adapter already stamps for non-preset shapes.
const recapIcon = document.createElement('img');
recapIcon.className = 'fleet-selected-icon';
recapIcon.alt = 'selected shape icon';
recapGrid.appendChild(recapIcon);
const recapFields = {};
for (const [key, label] of [
  ['shape', 'Shape:'], ['ve', 'VS/VE:'], ['netLift', 'Net Lift:'],
  ['airSpeed', 'Avg. Airspeed:'], ['util', 'Utilisation:'], ['market', 'Work Performed:'],
]) {
  const h = document.createElement('div');
  h.className = 'fleet-selected-data';
  h.textContent = label;
  const d = document.createElement('div');
  d.className = 'fleet-selected-data'; // grey via the class, matching pages 2 & 3
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
controlsPanel.className = 'panel-border econ-panel econ-controls-panel';
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
const outCarbon = statRow(`Carbon Credits (${Math.round(CREDIT_FRACTION * 100)}% creditable) / year:`);
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

// Template: Toby's v4, 2026-08-10 (sectioned SHAPE/SHIP/FLEET/ECONOMIC; "."
// spacer lines survive copy-paste where blank lines get eaten). Deliberate
// cuts, confirmed in revision: VS-inf, per-ship revenue/margin/payback, the
// capex/opex-per-ship assumptions, and the "(80% creditable)" qualifier.
function buildSummary() {
  const i = readInputs();
  const e = computeEconomics(i);
  const trunc1 = (x) => (Math.floor(x * 10) / 10).toFixed(1);
  const required = e.requiredShips !== null ? Math.round(e.requiredShips).toLocaleString('en-US') : 'N/A';
  const length = $('[data-ship="length-output"]')?.textContent ?? '—';
  const temp = $('[data-ship="temperature-output"]')?.textContent ?? '—';
  const shape = $('[data-shape="shape"]')?.textContent ?? '—';
  const ve = parseFloat($('[data-shape="input-volume-efficiency"]')?.value);
  const vs = $('[data-shape="volume-scalar"]')?.textContent ?? '—';
  const co2Mt = e.co2AvoidedMt; // operating-gated: idle fleet avoids nothing
  const co2Pct = co2Mt !== null ? (100 * co2Mt) / TOTAL_CO2_MT : null;
  return [
    'EAS FLEET CALCULATOR (Ver 1.6)',
    '.',
    `SHAPE: ${shape}`,
    `VS/VE ${vs} / ${Number.isFinite(ve) ? trunc1(ve) : '—'}%`,
    '.',
    'SHIP (Static):',
    `${length}m @ ${temp}°C → Net Lift ${Math.round(i.netLiftT).toLocaleString('en-US')}t`,
    'SHIP (Dynamic):',
    `Airspeed: ${i.airSpeedKmh} km/h`,
    '.',
    'FLEET:',
    `Work Performed: ${i.marketSizeTtkm.toFixed(i.marketSizeTtkm > 0 && i.marketSizeTtkm < 1 ? 3 : 2)} Trillion Ton-km/yr`,
    `Total Airships Required: ${required}`,
    `Utilisation: ${i.utilisationPct}%`,
    `CO2 Avoided: ${co2Mt !== null ? trunc1(co2Mt) : '—'} Million t/yr (${co2Pct !== null ? trunc1(co2Pct) : '—'}% global over-ocean freight)`,
    '.',
    'ECONOMIC:',
    `Total Revenue: ${fmtMoney(e.totalRevenue)}/yr`,
    `Rate: ${fmtRate(i.ratePerTkm)} / Ton-km → Revenue: ${fmtMoney(e.freightRevenue)}/yr`,
    `Carbon Credits: $${i.carbonPerT}/t → Revenue: ${fmtMoney(e.carbonRevenue)}/yr`,
    `Fleet Opex: ${fmtMoney(e.fleetOpex)}/yr`,
    `Fleet Profit: ${fmtMoney(e.fleetProfit)}/yr → Margin: ${e.fleetProfit !== null && e.totalRevenue > 0 ? (100 * e.fleetProfit / e.totalRevenue).toFixed(1) + '%' : '—'}`,
    `Capex Per Sunship: ${fmtMoney(i.capex)}`,
    `Program Pre Capex: ${fmtMoney(i.preCapex)}`,
    `Program Breakeven: ${fmtPayback(e.breakevenYears)} (from completion)`,
    '.',
    '(Design for planet + humanity)',
    '.',
    SUMMARY_LINK,
  ].join('\n').replace(/—/g, '-'); // printout uses plain hyphens (Toby's call);
  // the em-dash placeholders stay as-is in the on-page cells
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

// The user's literally-typed market value, captured on focusout BEFORE V1's
// (later-attached) handler ingests and re-renders it rounded. Highest-precision
// source for tiny beachhead markets: typed 0.001 renders as "0.00" (input, 2dp)
// AND recovers as ~0.0012 (raw Mt cell, 2dp quantised) — only the capture keeps
// the exact figure. Nulled whenever the slider/presets/ideal set the market
// instead (see wiring), so a stale typed value can never override them.
let typedMarket = null;

/** Model-truth market size: the typed capture when it matches the model, else V1's
 * CAPTURED raw CO2 proxy (the Mt cell itself now shows displacement values — see the
 * interception), else the input field — never a rounded-to-zero swallow. */
function readMarketSize() {
  const fromInput = parseDisplay($('[data-fleet="marketsize-output"]')?.value);
  const fromModel = v1Co2RawMt * 122 / 1000;
  if (typedMarket !== null && Math.abs(typedMarket - fromModel) <= 0.02 + 0.01 * fromModel) {
    return typedMarket; // exact figure the user entered, model agrees
  }
  if (!(fromModel > 0)) return fromInput;
  // Input can be V1's 2dp re-render: "0.00" for any market under 0.005 — a
  // rounded-to-zero display must never override a nonzero model.
  if (fromInput === 0) return fromModel;
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
    // Combined VS/VE, 1dp truncated like the Ship/Fleet mirrors (only page 1
    // shows full 3dp); icon mirrors the Fleet panel's current image.
    const veRaw = parseFloat($('[data-shape="input-volume-efficiency"]')?.value);
    const vsRaw = parseFloat($('[data-shape="volume-scalar"]')?.textContent);
    const t1 = (x) => (Math.floor(x * 10) / 10).toFixed(1);
    recapFields.ve.textContent = Number.isFinite(veRaw) && Number.isFinite(vsRaw)
      ? `${t1(vsRaw)} / ${t1(veRaw)}%` : '—';
    const fleetIcon = $('[data-fleet="selected-icon"]');
    if (fleetIcon?.src && recapIcon.src !== fleetIcon.src) recapIcon.src = fleetIcon.src;
    recapFields.netLift.textContent = `${$('[data-ship="netlift-output"]')?.textContent ?? '—'} tonnes`;
    recapFields.airSpeed.textContent = `${inputs.airSpeedKmh} km/hr`;
    recapFields.util.textContent = `${inputs.utilisationPct}%`;
    // Sub-1 markets get a third decimal everywhere — the ultra-small beachhead
    // scenarios (0.001 Ttkm) round to 0.00 at two places.
    const mktDp = inputs.marketSizeTtkm > 0 && inputs.marketSizeTtkm < 1 ? 3 : 2;
    recapFields.market.textContent = `${inputs.marketSizeTtkm.toFixed(mktDp)} Trillion Ton-km / year`;
    // Cosmetic re-render of V1's fleet-page market input to the same precision
    // (V1 renders it 2dp, so 0.001 displays as "0.00"). Model-truth is the
    // recovered value; never touched while the user is typing in it.
    // Correct the field when it's a rounded render of the model — within 2dp
    // rounding, or V1's integer re-render of a typed value (its "type 6.5,
    // see 7" quirk). Precision repair, never a value fight. Re-asserted on a
    // short delay because V1 repaints the input on every fleet render and can
    // land after us.
    const fixMarketField = () => {
      const mktField = $('[data-fleet="marketsize-output"]');
      if (!mktField || document.activeElement === mktField) return;
      const m = inputs.marketSizeTtkm;
      const want = m.toFixed(m > 0 && m < 1 ? 3 : 2);
      const fieldOff = Math.abs(parseDisplay(mktField.value) - m);
      const typedMatch = typedMarket !== null && Math.abs(typedMarket - m) < 1e-9;
      if (mktField.value !== want && (fieldOff < 0.005 || typedMatch)) {
        mktField.value = want;
      }
    };
    fixMarketField();
    setTimeout(fixMarketField, 250);

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
// First-load UX: Toby wants average trip distance to START at 0 like the other
// fleet inputs. V1's boot validator FORBIDS initial state 0 (its assertion
// "initial average distance must equal its configured max" caused the
// 2026-08-10 black-page incident) — but runtime 0 is perfectly legal: the
// slider's own minimum is 0 and every derived formula zero-guards. So V1 boots
// at its mandated 12000, and the moment its first render writes the output
// span, the slider is pushed to 0 through V1's own input pathway. One-shot:
// after that the slider is entirely the user's (and the ideal button's).
{
  const distOut = $('[data-fleet="averagetripdistance-output"]');
  const distSlider = $('[data-fleet="averagedistance"]');
  if (distOut && distSlider) {
    const zeroOnce = new MutationObserver(() => {
      if (distOut.textContent.trim() === '') return; // not V1's render yet
      zeroOnce.disconnect();
      // V1's fleet sliders are 0-100 VIEW units (no min/max attrs; V1 maps to
      // real values internally). View 0 = the domain minimum, which the bundle
      // patch floors at 1,000 km — distance is deliberately never zero: an
      // average trip below ~1,000 km isn't a scenario the calculator argues.
      distSlider.value = '0';
      distSlider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    zeroOnce.observe(distOut, { childList: true, characterData: true, subtree: true });
  }
}

// "Is the fleet actually OPERATING?" — the single gate (Toby, 2026-08-10) for
// the impact displays: net lift > 0 (length and temperature fold into it) AND
// airspeed > 0 AND utilisation > 0. An idle or unfliable fleet avoids nothing,
// so CO2 cells show 0.00 / 0% and Required Sunships shows N/A. Total Work is
// deliberately ungated — the goal is real even while the ship can't chase it.
const isOperating = () =>
  parseDisplay($('[data-ship="netlift-output"]')?.textContent) > 0 &&
  parseDisplay($('[data-fleet="airSpeed-output"]')?.textContent) > 0 &&
  parseDisplay($('[data-fleet="utilisation-output"]')?.textContent) > 0;

const requiredCell = $('[data-fleet="results-required"]');
const guardRequired = () => {
  if (!requiredCell) return;
  if (parseDisplay(requiredCell.textContent) < 0 || !isOperating()) {
    if (requiredCell.textContent !== 'N/A') requiredCell.textContent = 'N/A';
  }
};
if (requiredCell) {
  new MutationObserver(guardRequired).observe(requiredCell, { childList: true, characterData: true, subtree: true });
  guardRequired();
}

// Fleet-page CO2 cells now show the two-stage DISPLACEMENT model (2026-08-10,
// replaced the old 1% display floor — see co2-config.js). V1's bundle still
// writes its linear proxy (market x 1000/122) into the Mt cell; that raw value
// is our most precise source of model-truth market size (V1 rounds the visible
// input), so it's CAPTURED into v1Co2RawMt the moment V1 writes it, and only
// then are both cells rewritten with displacement values. A cell containing
// our own text is recognised and skipped, so the observers settle instead of
// looping; V1's raw and our displaced figures can never coincide in-range.
const co2PctCell = $('[data-fleet="resuls-c02reducedpercent"]');
const co2AmtCell = $('[data-fleet="resuls-c02reducedamount"]');
let v1Co2RawMt = 0; // V1's proxy figure — feeds readMarketSize, never displayed
let ourMtText = null;
let ourPctText = null;
if (co2PctCell && co2AmtCell) {
  // Our writes carry a trailing ZERO-WIDTH SPACE so V1's writes are always
  // distinguishable — comparing displayed numbers is NOT enough: V1's raw for
  // market m2 can exactly equal our displaced text for m1 (e.g. raw(0.05) =
  // "0.41" = displaced(0.001)), which silently broke the capture at small
  // markets. Invisible on screen; parseFloat ignores it.
  const OURS = '​';
  const applyCo2Cells = () => {
    if (!isOperating()) {
      ourMtText = '0.00' + OURS;
      ourPctText = '0' + OURS;
    } else {
      // readMarketSize (not raw directly): folds in the typed-value capture, so
      // a hand-entered 0.001 displaces exactly 0.001's worth, not the raw Mt
      // cell's 2dp-quantised approximation of it.
      const d = computeDisplacement(readMarketSize());
      ourMtText = d.totalCO2Mt.toFixed(2) + OURS;
      ourPctText = String(Math.round(d.percent)) + OURS;
    }
    if (co2AmtCell.textContent !== ourMtText) co2AmtCell.textContent = ourMtText;
    if (co2PctCell.textContent !== ourPctText) co2PctCell.textContent = ourPctText;
  };
  const onCo2Write = () => {
    if (!co2AmtCell.textContent.endsWith(OURS)) {
      v1Co2RawMt = parseDisplay(co2AmtCell.textContent); // V1 wrote — capture raw
    }
    applyCo2Cells(); // reasserts ours on either cell (V1 repaints % separately)
  };
  const obs = new MutationObserver(onCo2Write);
  obs.observe(co2AmtCell, { childList: true, characterData: true, subtree: true });
  obs.observe(co2PctCell, { childList: true, characterData: true, subtree: true });
  onCo2Write();
  // Operating state can change without V1 touching the CO2/required cells
  // (e.g. dragging utilisation to 0) — watch the three viability spans and
  // re-judge both gates whenever any of them move.
  const viaObs = new MutationObserver(() => { applyCo2Cells(); guardRequired(); });
  for (const sel of ['[data-ship="netlift-output"]', '[data-fleet="airSpeed-output"]', '[data-fleet="utilisation-output"]']) {
    const el = $(sel);
    if (el) viaObs.observe(el, { childList: true, characterData: true, subtree: true });
  }
}
const marketInput = $('[data-fleet="marketsize-output"]');
// Capture the raw typed value first (this listener registers before V1's
// late-attached one, so it sees the field pre-rounding) — then recompute.
marketInput?.addEventListener('focusout', () => {
  const v = parseFloat(marketInput.value);
  typedMarket = Number.isFinite(v) && v >= 0 ? v : null;
});
for (const evt of ['input', 'change', 'focusout']) marketInput?.addEventListener(evt, recompute);
for (const sel of ['[data-fleet="marketsize"]', '[data-fleet="marketsize-preset-1"]', '[data-fleet="marketsize-preset-2"]', '[data-fleet="marketsize-preset-3"]', '[data-fleet="ideal-button"]']) {
  const el = $(sel);
  if (!el) continue;
  el.addEventListener('input', () => { typedMarket = null; recompute(); });
  el.addEventListener('click', () => { typedMarket = null; recompute(); });
}

recompute();
