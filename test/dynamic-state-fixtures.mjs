/**
 * M3 UI-boundary fixtures — the r6 pin list, verbatim (NEXT-THREAD.md,
 * Phase B review pins 2026-08-13) + the M3 display amendments 2026-08-15.
 *
 * Runs against v2/dynamic-state.js and the BAKED engine (../calcv2/) —
 * the exact modules the deployed page would load. The engine is injected
 * through a counting wrapper, which is what makes "parked load calls the
 * engine ZERO times" a measurement instead of a claim.
 *
 * Plain node, zero deps: `node test/dynamic-state-fixtures.mjs`.
 */
import { computeDynamics } from '../calcv2/src/dynamicsCore.js';
import {
  SUNSHIP_GEOMETRY, EAS_IDEAL, BODY_ONLY_CD,
  initialState, isParked, setInput, setToggle, applyIdeal, compute, renderModel,
} from '../v2/dynamic-state.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function near(a, b, rel) { return Math.abs(a - b) <= rel * Math.abs(b); }

/** Counting engine: the real baked engine behind a call counter. */
function countingEngine() {
  let calls = 0;
  const engine = (geometry, cfg) => { calls++; return computeDynamics(geometry, cfg); };
  return { engine, calls: () => calls };
}

console.log('\n== r6: parked load calls the engine ZERO times ==');
{
  const { engine, calls } = countingEngine();
  const s0 = initialState();
  check('page loads parked (speed 0)', isParked(s0));
  const contract = compute(s0, engine);
  check('parked compute returns null', contract === null);
  check('engine called zero times', calls() === 0, `calls=${calls()}`);
  const rm = renderModel(contract);
  check('parked render is all dashes', rm.parked && rm.rows.every(([, v]) => v === '—'));
  check('parked render carries no warnings', rm.warnings.length === 0);
  check('load state is ideal posture (Cd 0.043 / S 27% / both ON)',
    s0.cd === EAS_IDEAL.cd && s0.s === EAS_IDEAL.s && s0.tailOn && s0.bliOn);
}

console.log('\n== r6: 0→100 yields exact engine contract values ==');
{
  const { engine, calls } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  const contract = compute(moving, engine);
  check('engine called exactly once', calls() === 1);
  // The ruled ideal cell, pinned: 75.8 t LH2 / 379 t system, GREEN, silent.
  check('ideal 10,000 km LH2 ~ 75.8 t', near(contract.refTripFuelT, 75.8, 0.001), String(contract.refTripFuelT));
  check('ideal fuel system ~ 379 t', near(contract.refTripFuelSystemT, 379.0, 0.001), String(contract.refTripFuelSystemT));
  check('propulsion power ~ 15.16 MW', near(contract.powerMW, 15.158, 0.001), String(contract.powerMW));
  check('all statuses GREEN/OK', contract.aerodynamicStatus === 'GREEN'
    && contract.floorStatus === 'OK' && contract.fuelMassStatus === 'GREEN');
  check('contract carries zero warnings', contract.warnings.length === 0);
  // Render model displays contract values without recalculating (r6):
  const rm = renderModel(contract);
  const row = Object.fromEntries(rm.rows);
  check('GREEN = silence (warnings-only ruling)', rm.warnings.length === 0);
  check('one power figure, labelled Propulsion power', 'Propulsion power' in row && !rm.rows.some(([k]) => /no credit/i.test(k)));
  check('power row formats contract.powerMW', row['Propulsion power'] === `${contract.powerMW.toFixed(1)} MW`);
  check('bare tag is the S SETTING (−27%)', rm.powerTag === '(−27%)', rm.powerTag);
  check('LH2 rate row formats contract.fuelPer1000kmT', row['LH2 / 1,000 km'] === `${contract.fuelPer1000kmT.toFixed(1)} t`);
  check('fuel system row is the 10,000 km reference, labelled',
    row['Fuel system weight'].startsWith('379 t') && row['Fuel system weight'].includes('10,000 km'));
  check('frontal area echoes contract', row['Frontal area'] === '40,522 m²');
  check('wetted area echoes measured record', row['Wetted area'] === '206,795 m²');
  // Provenance is OFF the page (Toby ruling 2026-08-15) but stays the
  // contract's engineer-facing truth — assert at the contract level.
  check('no provenance copy in the display model', !('provenance' in rm));
  check('contract still carries full provenance', contract.provenance.summary.startsWith('CALCULATED from Cd'));
}

console.log('\n== r6: 100→0 dashes without destroying state ==');
{
  const { engine } = countingEngine();
  let st = applyIdeal(initialState());                 // moving at 100
  st = setInput(st, 'cd', 0.10);                       // user changes a lever
  st = setInput(st, 'airspeedKmh', 0);                 // park again
  check('parked again', isParked(st));
  check('compute returns null parked', compute(st, engine) === null);
  check('user Cd selection survives parking', st.cd === 0.10);
  const back = setInput(st, 'airspeedKmh', 90);
  const contract = compute(back, engine);
  check('selection carries into first movement (never reset)', contract.selectedCd === 0.10);
  check('provenance follows the hand that moved it', contract.cdSource === 'user' && contract.scenario === 'CUSTOM');
}

console.log('\n== r6: parked selections persist (changed WHILE parked) ==');
{
  const { engine, calls } = countingEngine();
  let st = initialState();                             // parked
  st = setInput(st, 's', 0.10);                        // adjust S while parked
  st = setInput(st, 'cd', 0.08);                       // adjust Cd while parked
  check('still zero engine calls after parked edits', calls() === 0);
  const contract = compute(setInput(st, 'airspeedKmh', 100), engine);
  check('parked S edit carries into first movement', contract.selectedS === 0.10);
  check('parked Cd edit carries into first movement', contract.selectedCd === 0.08);
}

console.log('\n== r6: Ideal idempotent + authored provenance ==');
{
  const { engine } = countingEngine();
  let st = setInput(setInput(initialState(), 'cd', 0.2), 's', 0.05); // wander off
  const once = applyIdeal(st);
  const twice = applyIdeal(once);
  check('applyIdeal is idempotent', JSON.stringify(once) === JSON.stringify(twice));
  const contract = compute(once, engine);
  check('ideal is authored, never user (r5 M3 note)',
    contract.cdSource === 'authored' && contract.sSource === 'authored');
  check('ideal provenance label names the ruling', contract.provenance.cdLabel.includes('EAS IDEAL'));
  check('ideal scenario self-identifies', contract.scenario === 'VISION');
}

console.log('\n== r6: ORANGE/RED = correct warning (minimal words, Toby 2026-08-15) ==');
{
  const { engine } = countingEngine();
  // ORANGE aero band: Cd 0.18 (GREEN max 0.12, ORANGE max 0.22). At this
  // Cd the reference-trip fuel also goes RED — both must surface, short.
  const orange = compute(setInput(setInput(initialState(), 'cd', 0.18), 'airspeedKmh', 100), engine);
  const rmO = renderModel(orange);
  check('ORANGE Cd → exactly one orange "Inefficient dynamics"',
    rmO.warnings.filter((w) => w.level === 'orange' && w.text === 'Inefficient dynamics').length === 1,
    JSON.stringify(rmO.warnings));
  check('fuel RED → red "Critical fuel weight"',
    rmO.warnings.some((w) => w.level === 'red' && w.text === 'Critical fuel weight'));
  check('warnings are short labels, no sentences',
    rmO.warnings.every((w) => w.text.split(' ').length <= 4), JSON.stringify(rmO.warnings));
  // RED floor breach: Cd below the friction estimate (~0.0084)
  const red = compute(setInput(setInput(initialState(), 'cd', 0.005), 'airspeedKmh', 100), engine);
  const rmR = renderModel(red);
  check('below-floor RED → red "Cd below friction floor"',
    red.floorStatus === 'RED' && rmR.warnings.some((w) => w.level === 'red' && w.text === 'Cd below friction floor'));
  check('warnings never hide outputs (flagged, not hidden)',
    rmR.rows.every(([, v]) => v !== '—'));
}

console.log('\n== M4/M5 toggles LIVE (pulled forward, Toby 2026-08-15) ==');
{
  const { engine } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  const tailOff = compute(setToggle(moving, 'tailOn', false), engine);
  check('tail OFF forces body-only Cd 0.26', tailOff.selectedCd === BODY_ONLY_CD);
  check('tail OFF does not touch S', tailOff.selectedS === moving.s);
  check('tail OFF re-labels Cd as authored (body-only, not a user claim)',
    tailOff.cdSource === 'authored');
  const bliOff = compute(setToggle(moving, 'bliOn', false), engine);
  check('BLI OFF forces S = 0 without touching Cd',
    bliOff.selectedS === 0 && bliOff.selectedCd === moving.cd);
  check('BLI OFF power = exactly the no-credit cubic',
    bliOff.powerMW === bliOff.powerNoCreditMW);
  // Reveal-by-removal round trip: selections survive the excursion.
  const roundTrip = setToggle(setToggle(moving, 'tailOn', false), 'tailOn', true);
  const restored = compute(roundTrip, engine);
  check('re-enabling the tail restores the pre-toggle Cd exactly',
    restored.selectedCd === moving.cd);
  // Both OFF at speed: the naked-body worst case computes, flagged not hidden.
  const naked = compute(setToggle(setToggle(moving, 'tailOn', false), 'bliOn', false), engine);
  check('both OFF = body-only no-credit (0.26, S 0)',
    naked.selectedCd === BODY_ONLY_CD && naked.selectedS === 0);
  // Toggles are selections too: changed while parked, they persist (r6).
  const { engine: e2, calls: c2 } = countingEngine();
  const parkedToggle = setToggle(initialState(), 'bliOn', false);
  check('toggle while parked calls engine zero times', compute(parkedToggle, e2) === null && c2() === 0);
  const firstMove = compute(setInput(parkedToggle, 'airspeedKmh', 100), e2);
  check('parked toggle carries into first movement', firstMove.selectedS === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
