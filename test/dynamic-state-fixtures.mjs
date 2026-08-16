/**
 * M3–M6 UI-boundary fixtures — the r6 pin list, the M3 display amendments
 * 2026-08-15, and the M6 estimator amendments 2026-08-16 (marker + silent
 * band, tail-off snap-to-estimate with editable slider, estimator
 * dormancy, per-shape dial rule, wetted-via-contract).
 *
 * Runs against v2/dynamic-state.js and the BAKED engine (../calcv2/) —
 * the exact modules the deployed page would load. The engine AND the
 * estimator are injected through counting wrappers, which is what makes
 * "parked load calls the engine ZERO times" and "estimator dormant while
 * parked" measurements instead of claims.
 *
 * Plain node, zero deps: `node test/dynamic-state-fixtures.mjs`.
 */
import { computeDynamics } from '../calcv2/src/dynamicsCore.js';
import { estimateCd } from '../calcv2/src/cdEstimator.js';
import {
  SUNSHIP_GEOMETRY, SUNSHIP_SECTIONAL, EAS_IDEAL, CD_TRACKS_ESTIMATE,
  initialState, isParked, setInput, setToggle, applyIdeal,
  resolveCd, effectiveControls, compute, renderModel, cdDialRange,
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
/** Counting estimator: the real baked estimator behind a call counter. */
function countingEstimator() {
  let calls = 0;
  const est = {
    estimateCd: (proxy, geometry, v) => { calls++; return estimateCd(proxy, geometry, v); },
    proxyRecord: SUNSHIP_SECTIONAL,
  };
  return { est, calls: () => calls };
}
/** The real estimator seam, as the page wires it. */
const ESTIMATOR = { estimateCd, proxyRecord: SUNSHIP_SECTIONAL };
/** The live bare-hull estimate at a speed — the value tail-off snaps to. */
const bareEstimateAt = (v) => estimateCd(SUNSHIP_SECTIONAL, SUNSHIP_GEOMETRY, v).cdEstimate;

console.log('\n== r6: parked load calls the engine ZERO times (and the estimator, M6) ==');
{
  const { engine, calls } = countingEngine();
  const { est, calls: estCalls } = countingEstimator();
  const s0 = initialState();
  check('page loads parked (speed 0)', isParked(s0));
  const contract = compute(s0, engine, undefined, est);
  check('parked compute returns null', contract === null);
  check('engine called zero times', calls() === 0, `calls=${calls()}`);
  check('estimator called zero times (dormant while parked, M6 #5)', estCalls() === 0);
  const rm = renderModel(contract);
  check('parked render is all dashes', rm.parked && rm.rows.every(([, v]) => v === '—'));
  check('parked render carries no warnings', rm.warnings.length === 0);
  check('parked render has no marker (page cache is separate)', rm.marker === null);
  check('load state is ideal posture (Cd 0.043 / S 27% / both ON)',
    s0.cd === EAS_IDEAL.cd && s0.s === EAS_IDEAL.s && s0.tailOn && s0.bliOn);
}

console.log('\n== r6: 0→100 yields exact engine contract values ==');
{
  const { engine, calls } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  const contract = compute(moving, engine, undefined, ESTIMATOR);
  check('engine called exactly once', calls() === 1);
  // The ruled ideal cell, pinned: 75.8 t LH2 / 379 t system, GREEN, silent.
  check('ideal 10,000 km LH2 ~ 75.8 t', near(contract.refTripFuelT, 75.8, 0.001), String(contract.refTripFuelT));
  check('ideal fuel system ~ 379 t', near(contract.refTripFuelSystemT, 379.0, 0.001), String(contract.refTripFuelSystemT));
  check('propulsion power ~ 15.16 MW', near(contract.powerMW, 15.158, 0.001), String(contract.powerMW));
  check('all statuses GREEN/OK', contract.aerodynamicStatus === 'GREEN'
    && contract.floorStatus === 'OK' && contract.fuelMassStatus === 'GREEN');
  check('contract carries zero warnings (estimate echo matches — no mismatch flag)',
    contract.warnings.length === 0, contract.warnings.join('; '));
  // Render model displays contract values without recalculating (r6):
  const rm = renderModel(contract);
  const row = Object.fromEntries(rm.rows);
  check('GREEN = silence (warnings-only ruling)', rm.warnings.length === 0);
  check('one power figure, labelled Propulsion power', 'Propulsion power' in row && !rm.rows.some(([k]) => /no credit/i.test(k)));
  check('power row formats contract.powerMW', row['Propulsion power'] === `${contract.powerMW.toFixed(1)} MW`);
  check('bare tag is the S SETTING (−27%)', rm.powerTag === '(−27%)', rm.powerTag);
  // Fuel pair (Toby 2026-08-15 + 2026-08-16): LH2 weight · LH2 + Storage,
  // the reference distance labelled in the headers; energy row CUT; the
  // /1,000 km rate row CUT (repeat of the 10,000 km figure — the rate
  // stays a §3.6 contract field for FLEET).
  check('rate row is CUT from the display (contract field survives)',
    !rm.rows.some(([k]) => /1,000 km/.test(k)) && Number.isFinite(contract.fuelPer1000kmT));
  check('LH2 weight row is the reference-trip LH2 (75.8 t)',
    row['LH2 weight (10,000 km)'] === `${contract.refTripFuelT.toFixed(1)} t`);
  check('LH2 + Storage row is the tankage-system total (379 t)',
    row['LH2 + Storage (10,000 km)'] === '379 t');
  check('energy row is CUT (it is power in other units)',
    !rm.rows.some(([k]) => /energy/i.test(k)));
  check('frontal area echoes contract', row['Frontal area'] === '40,522 m²');
  check('wetted area echoes contract.wettedAreaM2 (M6 #4, r7 #5 discharged)',
    row['Wetted area'] === '206,795 m²' && contract.wettedAreaM2 === 206795);
  check('wettedSource travels in the contract', contract.wettedSource === 'mesh');
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
  check('compute returns null parked', compute(st, engine, undefined, ESTIMATOR) === null);
  check('user Cd selection survives parking', st.cd === 0.10);
  const back = setInput(st, 'airspeedKmh', 90);
  const contract = compute(back, engine, undefined, ESTIMATOR);
  check('selection carries into first movement (never reset)', contract.selectedCd === 0.10);
  check('provenance follows the hand that moved it', contract.cdSource === 'user' && contract.scenario === 'CUSTOM');
}

console.log('\n== r6: parked selections persist (changed WHILE parked) ==');
{
  const { engine, calls } = countingEngine();
  const { est, calls: estCalls } = countingEstimator();
  let st = initialState();                             // parked
  st = setInput(st, 's', 0.10);                        // adjust S while parked
  st = setInput(st, 'cd', 0.08);                       // adjust Cd while parked
  check('still zero engine calls after parked edits', calls() === 0);
  check('still zero estimator calls after parked edits', estCalls() === 0);
  const contract = compute(setInput(st, 'airspeedKmh', 100), engine, undefined, est);
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
  const contract = compute(once, engine, undefined, ESTIMATOR);
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
  const orange = compute(setInput(setInput(initialState(), 'cd', 0.18), 'airspeedKmh', 100), engine, undefined, ESTIMATOR);
  const rmO = renderModel(orange);
  check('ORANGE Cd → exactly one orange "Inefficient dynamics"',
    rmO.warnings.filter((w) => w.level === 'orange' && w.text === 'Inefficient dynamics').length === 1,
    JSON.stringify(rmO.warnings));
  check('fuel RED → red "Critical fuel weight"',
    rmO.warnings.some((w) => w.level === 'red' && w.text === 'Critical fuel weight'));
  check('warnings are short labels, no sentences',
    rmO.warnings.every((w) => w.text.split(' ').length <= 4), JSON.stringify(rmO.warnings));
  // RED floor breach: Cd below the friction estimate (~0.0084)
  const red = compute(setInput(setInput(initialState(), 'cd', 0.005), 'airspeedKmh', 100), engine, undefined, ESTIMATOR);
  const rmR = renderModel(red);
  check('below-floor RED → red "Cd below friction floor"',
    red.floorStatus === 'RED' && rmR.warnings.some((w) => w.level === 'red' && w.text === 'Cd below friction floor'));
  check('warnings never hide outputs (flagged, not hidden)',
    rmR.rows.every(([, v]) => v !== '—'));
}

console.log('\n== M4/M5 toggles under M6 semantics (0.26 RETIRED, r10 snap-editable) ==');
{
  const { engine } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  const bare100 = bareEstimateAt(100);
  const tailOff = compute(setToggle(moving, 'tailOn', false), engine, undefined, ESTIMATOR);
  check('tail OFF snaps Cd to the live bare-hull ESTIMATE (~0.438)',
    tailOff.selectedCd === bare100 && near(tailOff.selectedCd, 0.4383, 0.001), String(tailOff.selectedCd));
  check('tail OFF does not touch S', tailOff.selectedS === moving.s);
  check('tail OFF Cd is ESTIMATED, not authored, not user', tailOff.cdSource === 'estimated');
  check('the reveal is ~10x (bare estimate / 0.043 in [9, 11])',
    tailOff.selectedCd / EAS_IDEAL.cd > 9 && tailOff.selectedCd / EAS_IDEAL.cd < 11);
  check('tail OFF numbers: ~154.5 MW / ~3,863 t, both RED (the new honest reveal)',
    near(tailOff.powerMW, 154.5, 0.002) && near(tailOff.refTripFuelSystemT, 3863, 0.002)
    && tailOff.aerodynamicStatus === 'RED' && tailOff.fuelMassStatus === 'RED',
    `${tailOff.powerMW.toFixed(1)} MW / ${tailOff.refTripFuelSystemT.toFixed(0)} t`);
  const bliOff = compute(setToggle(moving, 'bliOn', false), engine, undefined, ESTIMATOR);
  check('BLI OFF forces S = 0 without touching Cd',
    bliOff.selectedS === 0 && bliOff.selectedCd === moving.cd);
  check('BLI OFF power = exactly the no-credit cubic',
    bliOff.powerMW === bliOff.powerNoCreditMW);
  // Reveal-by-removal round trip: selections survive the excursion (r10:
  // tail ON restores the prior tail-on selection exactly).
  const roundTrip = setToggle(setToggle(moving, 'tailOn', false), 'tailOn', true);
  const restored = compute(roundTrip, engine, undefined, ESTIMATOR);
  check('re-enabling the tail restores the pre-toggle Cd exactly',
    restored.selectedCd === moving.cd && restored.cdSource === 'authored');
  // Both OFF at speed: the naked-body worst case computes, flagged not hidden.
  const naked = compute(setToggle(setToggle(moving, 'tailOn', false), 'bliOn', false), engine, undefined, ESTIMATOR);
  check('both OFF = bare estimate, no credit (~211.6 MW / ~5,292 t)',
    naked.selectedCd === bare100 && naked.selectedS === 0
    && near(naked.powerMW, 211.6, 0.002) && near(naked.refTripFuelSystemT, 5292, 0.002),
    `${naked.powerMW.toFixed(1)} MW / ${naked.refTripFuelSystemT.toFixed(0)} t`);
  // Toggles are selections too: changed while parked, they persist (r6).
  const { engine: e2, calls: c2 } = countingEngine();
  const parkedToggle = setToggle(initialState(), 'bliOn', false);
  check('toggle while parked calls engine zero times', compute(parkedToggle, e2, undefined, ESTIMATOR) === null && c2() === 0);
  const firstMove = compute(setInput(parkedToggle, 'airspeedKmh', 100), e2, undefined, ESTIMATOR);
  check('parked toggle carries into first movement', firstMove.selectedS === 0);
  // Tail OFF while parked: the snap is PENDING (dormant estimator — no
  // number exists yet) and resolves on the first movement (r6 carry rule).
  const parkedTailOff = setToggle(initialState(), 'tailOn', false);
  check('parked tail-off: Cd tracks the estimate (pending, no value yet)',
    parkedTailOff.cd === CD_TRACKS_ESTIMATE
    && resolveCd(parkedTailOff, null).cd === null);
  const resolved = compute(setInput(parkedTailOff, 'airspeedKmh', 100), engine, undefined, ESTIMATOR);
  check('parked tail-off resolves to the estimate on first movement',
    resolved.selectedCd === bare100 && resolved.cdSource === 'estimated');
}

console.log('\n== r7 send-back #1: Ideal restores the COMPLETE ruled configuration ==');
{
  const { engine } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  for (const [name, wrecked] of [
    ['tail-off → Ideal', setToggle(moving, 'tailOn', false)],
    ['BLI-off → Ideal', setToggle(moving, 'bliOn', false)],
    ['both-off → Ideal', setToggle(setToggle(moving, 'tailOn', false), 'bliOn', false)],
  ]) {
    const ideal = applyIdeal(wrecked);
    const contract = compute(ideal, engine, undefined, ESTIMATOR);
    check(`${name}: both toggles back ON`, ideal.tailOn && ideal.bliOn);
    check(`${name}: engine receives Cd 0.043, not the bare estimate`, contract.selectedCd === EAS_IDEAL.cd);
    check(`${name}: the 379 t state exactly`, contract.refTripFuelSystemT.toFixed(0) === '379');
  }
  check('Ideal clears the tail stash (no stale restore target)',
    applyIdeal(setToggle(moving, 'tailOn', false)).tailStash === null);
}

console.log('\n== r7 send-back #2: snapped/forced values carry truthful provenance ==');
{
  const { engine } = countingEngine();
  // Wander to USER, then toggle each system off — the value in force must
  // never travel under the user's (or the Ideal's) label.
  const userState = setInput(setInput(setInput(initialState(), 'airspeedKmh', 100), 'cd', 0.10), 's', 0.20);
  const tailOff = compute(setToggle(userState, 'tailOn', false), engine, undefined, ESTIMATOR);
  check('tail OFF: cdSource estimated (M6 — the bare hull is the estimator\'s)', tailOff.cdSource === 'estimated');
  check('tail OFF: cdLabel leads with ESTIMATED, names the estimator',
    tailOff.provenance.cdLabel.startsWith('ESTIMATED'), tailOff.provenance.cdLabel);
  check('tail OFF: S keeps the user label untouched',
    tailOff.provenance.sLabel === 'USER SETTING');
  const bliOff = compute(setToggle(userState, 'bliOn', false), engine, undefined, ESTIMATOR);
  check('BLI OFF: sSource authored', bliOff.sSource === 'authored');
  check('BLI OFF: sLabel names BLI OFF, not the user',
    bliOff.provenance.sLabel.includes('BLI OFF'), bliOff.provenance.sLabel);
  check('BLI OFF: Cd keeps the user label untouched',
    bliOff.provenance.cdLabel === 'USER SETTING');
  // Ideal-after-Ideal still idempotent with the toggle restore in place.
  check('applyIdeal still idempotent with toggles',
    JSON.stringify(applyIdeal(applyIdeal(userState))) === JSON.stringify(applyIdeal(userState)));
}

console.log('\n== r7 #6: one derivation for values-in-force ==');
{
  const { engine } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  const e100 = estimateCd(SUNSHIP_SECTIONAL, SUNSHIP_GEOMETRY, 100);
  for (const st of [moving, setToggle(moving, 'tailOn', false), setToggle(moving, 'bliOn', false)]) {
    const eff = effectiveControls(st, e100);
    const c = compute(st, engine, undefined, ESTIMATOR);
    check(`effectiveControls matches engine input (tail ${st.tailOn ? 'on' : 'off'}, BLI ${st.bliOn ? 'on' : 'off'})`,
      c.selectedCd === eff.cd && c.selectedS === eff.s);
  }
}

console.log('\n== M6: the estimator on the page — marker, band, dial, firming ==');
{
  const { engine } = countingEngine();
  const moving = setInput(initialState(), 'airspeedKmh', 100);
  const contract = compute(moving, engine, undefined, ESTIMATOR);
  // The contract echo IS the frozen API object for this geometry+speed.
  check('contract.estimate present with status ok', contract.estimate && contract.estimate.status === 'ok');
  check('contract.estimate is the bare-hull ~0.438 with ±20% band exactly',
    near(contract.estimate.cdEstimate, 0.4383, 0.001)
    && contract.estimate.band[0] === contract.estimate.cdEstimate * 0.8
    && contract.estimate.band[1] === contract.estimate.cdEstimate * 1.2);
  // renderModel surfaces it as the marker (value + band edges, no words).
  const rm = renderModel(contract);
  check('marker carries value + band edges for the slider drawing',
    rm.marker && rm.marker.value === contract.estimate.cdEstimate
    && rm.marker.lo === contract.estimate.band[0] && rm.marker.hi === contract.estimate.band[1]);
  check('marker is wordless (no text fields in the model)',
    Object.keys(rm.marker).sort().join(',') === 'hi,lo,value');
  // The §5.3 per-shape dial rule: bottom = contract friction floor; top =
  // max(0.40, 1.5 × estimate) — the ±20% band always fits on the dial.
  const dial = cdDialRange(contract, contract.estimate);
  check('dial bottom is the friction floor ceiled to the 0.001 grid (Sunship: 0.009)',
    dial.min === 0.009 && dial.min >= contract.frictionCd);
  check('dial top = 1.5 × estimate on the grid (~0.658) — the band always fits',
    near(dial.max, 1.5 * contract.estimate.cdEstimate, 0.005) && dial.max > contract.estimate.band[1]);
  check('dial parked defaults hold before any values flow',
    cdDialRange(null, null).min === 0.009 && cdDialRange(null, null).max === 0.40);
  const smallEst = { ...contract.estimate, cdEstimate: 0.05, band: [0.04, 0.06] };
  check('dial top floors at 0.40 for small estimates', cdDialRange(contract, smallEst).max === 0.40);
  // The estimate TRACKS speed while snapped (friction term is Re-dependent).
  const off = setToggle(moving, 'tailOn', false);
  const at50 = compute(setInput(off, 'airspeedKmh', 50), engine, undefined, ESTIMATOR);
  const at140 = compute(setInput(off, 'airspeedKmh', 140), engine, undefined, ESTIMATOR);
  check('snapped Cd tracks the live estimate across speeds',
    at50.selectedCd === bareEstimateAt(50) && at140.selectedCd === bareEstimateAt(140)
    && at50.selectedCd > at140.selectedCd);
  // Firming: a drag while snapped makes it a plain user number (M6 #2) —
  // and the stash still restores the PRIOR tail-on selection (r10).
  const firmed = setInput(off, 'cd', 0.30);
  const firmedContract = compute(firmed, engine, undefined, ESTIMATOR);
  check('dragging while snapped FIRMS the value (user, CUSTOM)',
    firmedContract.selectedCd === 0.30 && firmedContract.cdSource === 'user');
  const restoredAfterFirm = setToggle(firmed, 'tailOn', true);
  check('tail ON after firming still restores the prior tail-on selection',
    restoredAfterFirm.cd === moving.cd && restoredAfterFirm.cdSource === moving.cdSource);
  // §5.5: estimator unavailable can never break the page — the snap falls
  // back to the stashed selection under the stash's own truthful label.
  const brokenEstimator = {
    estimateCd: () => ({ cdEstimate: null, frictionCd: 0.0084, pressureCd: null, band: null, status: 'unavailable', provenance: { label: 'ESTIMATED' } }),
    proxyRecord: SUNSHIP_SECTIONAL,
  };
  const fallback = compute(setToggle(moving, 'tailOn', false), engine, undefined, brokenEstimator);
  check('unavailable estimator: tail-off falls back to the stashed selection',
    fallback.selectedCd === moving.cd);
  check('fallback never wears the ESTIMATED label',
    !fallback.provenance.cdLabel.startsWith('ESTIMATED'), fallback.provenance.cdLabel);
  check('unavailable estimate still echoed in the contract (engineer truth)',
    fallback.estimate.status === 'unavailable');
  // No estimator wired (pre-M6 caller): everything works, estimate null.
  const noEst = compute(moving, engine);
  check('compute without an estimator: contract.estimate null, numbers intact',
    noEst.estimate === null && near(noEst.powerMW, 15.158, 0.001));
  check('renderModel without an estimate: marker null', renderModel(noEst).marker === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
