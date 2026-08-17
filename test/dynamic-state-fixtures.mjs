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
import { estimateCd, applyGenericTail, GENERIC_TAIL_PRESSURE_FRACTION } from '../calcv2/src/cdEstimator.js';
import { scaleGeometryRecord } from '../calcv2/src/dynamicsGeometry.js';
import { PRESET_DYNAMICS } from '../calcv2/src/presetDynamics.js';
import {
  SUNSHIP_GEOMETRY, SUNSHIP_SECTIONAL, EAS_IDEAL, CD_TRACKS_ESTIMATE,
  SUNSHIP_SHAPE, isSunship,
  initialState, isParked, setInput, setToggle, setShape, applyIdeal,
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
    applyGenericTail,
    proxyRecord: SUNSHIP_SECTIONAL,
  };
  return { est, calls: () => calls };
}
/** The real estimator seam, as the page wires it (sunship). */
const ESTIMATOR = { estimateCd, applyGenericTail, proxyRecord: SUNSHIP_SECTIONAL };
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
  // GRADUATION 2026-08-16 (r15–r19 sealed): the bare Sunship classifies
  // ROUNDED (aft-dominated) and prices on the high-Re crisis line —
  // ~0.178, replacing the retired subcritical-anchor ~0.438. The
  // reveal becomes ~4× (the owner's preferred story; the authored
  // 0.043 claim itself is unchanged).
  check('tail OFF snaps Cd to the live bare-hull ESTIMATE (~0.178, graduated)',
    tailOff.selectedCd === bare100 && near(tailOff.selectedCd, 0.1785, 0.002), String(tailOff.selectedCd));
  check('tail OFF does not touch S', tailOff.selectedS === moving.s);
  check('tail OFF Cd is ESTIMATED, not authored, not user', tailOff.cdSource === 'estimated');
  check('the reveal is ~4x (bare estimate / 0.043 in [3.5, 5.5], r19-sealed)',
    tailOff.selectedCd / EAS_IDEAL.cd > 3.5 && tailOff.selectedCd / EAS_IDEAL.cd < 5.5);
  check('tail OFF numbers: ~62.9 MW / ~1,573 t, aero ORANGE + fuel RED (the graduated reveal — the honest bare hull is bad, not catastrophic)',
    near(tailOff.powerMW, 62.9, 0.005) && near(tailOff.refTripFuelSystemT, 1573, 0.005)
    && tailOff.aerodynamicStatus === 'ORANGE' && tailOff.fuelMassStatus === 'RED',
    `${tailOff.powerMW.toFixed(1)} MW / ${tailOff.refTripFuelSystemT.toFixed(0)} t / ${tailOff.aerodynamicStatus}`);
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
  check('both OFF = bare estimate, no credit (~86.2 MW / ~2,155 t, graduated)',
    naked.selectedCd === bare100 && naked.selectedS === 0
    && near(naked.powerMW, 86.2, 0.005) && near(naked.refTripFuelSystemT, 2155, 0.005),
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
  check('contract.estimate is the graduated bare-hull ~0.178 with ±20% band exactly',
    near(contract.estimate.cdEstimate, 0.1785, 0.002)
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
  // Graduation: 1.5 × 0.178 ≈ 0.268 < the dial's 0.40 FLOOR — the
  // Floor raised 0.40 → 0.55 (Toby's sphere catch 2026-08-17): the
  // honest high-Re sphere reads ~0.19, but the dial must ALWAYS let a
  // skeptic hand-set the textbook subcritical 0.47. Floor governs
  // here (1.5 × 0.178 ≈ 0.268 sits under it).
  check('dial top = the 0.55 floor — textbook sphere 0.47 always hand-dialable; the band always fits',
    dial.max === 0.55 && dial.max > 0.47 && dial.max > contract.estimate.band[1]);
  check('dial parked defaults hold before any values flow',
    cdDialRange(null, null).min === 0.009 && cdDialRange(null, null).max === 0.55);
  const smallEst = { ...contract.estimate, cdEstimate: 0.05, band: [0.04, 0.06] };
  check('dial top floors at 0.55 for small estimates', cdDialRange(contract, smallEst).max === 0.55);
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
    applyGenericTail,
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

console.log('\n== M6 STAGE 2: per-shape inheritance (r8 #4 reset, gated systems, generic tail, Ideal gating) ==');
{
  const { engine } = countingEngine();
  // The washing machine, exactly as the page builds it: baked record →
  // AUTHORED default axis → engine scaling → engine estimator seam.
  const WM = { kind: 'preset', id: 'washingmachine', name: 'WASHINGMACHINE' };
  const wmDyn = PRESET_DYNAMICS.washingmachine;
  const wmAxis = wmDyn.defaultAxis; // '+Y' (Toby's orientation ruling)
  const wmGeometry = scaleGeometryRecord(wmDyn.raw, wmAxis[1], 100);
  const wmSeam = {
    estimateCd, applyGenericTail,
    proxyRecord: { proxy: wmDyn.proxies[wmAxis].proxy, axis: wmAxis, quality: { oddFraction: wmDyn.proxies[wmAxis].oddFraction ?? 0 } },
  };
  const wmBare = estimateCd(wmSeam.proxyRecord, wmGeometry, 100);
  const wmTailed = applyGenericTail(wmBare);
  check('records carry the authored NATURAL attitudes (cigar +Z pointed-first, bottle -Y cap-first, wm +Y)',
    PRESET_DYNAMICS.bottle.defaultAxis === '-Y' && PRESET_DYNAMICS.cigar.defaultAxis === '+Z'
    && wmAxis === '+Y' && PRESET_DYNAMICS.sunship.defaultAxis === '+Z');

  // Shape change RESETS Cd (r8 #4) — even over a hand-set user value —
  // and the systems arrive OFF: they are the Sunship's designs (Toby
  // ruling 2026-08-16; the greyed hard limit IS the lesson).
  let st = setInput(setInput(initialState(), 'airspeedKmh', 100), 'cd', 0.10); // user claim on the Sunship
  st = setShape(st, WM);
  check('shape change resets Cd to the estimator posture (user claim never travels)',
    st.cd === CD_TRACKS_ESTIMATE && st.cdSource === 'estimated');
  check('generic arrival: BOTH systems OFF (Sunship tech stays home)',
    st.tailOn === false && st.bliOn === false);
  check('shape change clears the stash and drops the authored scenario',
    st.tailStash === null && st.scenario === 'CUSTOM');

  // PUBLIC generic view: bare estimator, no credit, no tail.
  const cPublic = compute(st, engine, wmGeometry, wmSeam);
  check('public generic: selectedCd is the BARE estimate, S forced 0, pure cubic',
    cPublic.selectedCd === wmBare.cdEstimate && cPublic.selectedS === 0
    && cPublic.powerMW === cPublic.powerNoCreditMW);
  check('public generic configurationId says bodyOnly', cPublic.configurationId === 'washingmachine/bodyOnly');

  // EAS-MODE actions (the chord gates the CLICK, page-side; the state
  // transitions stay pure): switch both systems on → §5.4 generic tail.
  const stOn = setToggle(setToggle(st, 'tailOn', true), 'bliOn', true);
  const c = compute(stOn, engine, wmGeometry, wmSeam);
  check('unlocked generic, tail ON: selectedCd is the engine generic-tail estimate',
    c.selectedCd === wmTailed.cdEstimate && c.cdSource === 'estimated');
  check('generic-tail label names the s5.4 REFERENCE ASSUMPTION',
    /generic Smart Tail/.test(c.provenance.cdLabel) && /REFERENCE ASSUMPTION/.test(c.provenance.cdLabel));
  check('contract.estimate stays the BARE hull (the marker never wears the tail)',
    c.estimate.cdEstimate === wmBare.cdEstimate && c.estimate.cdEstimate > c.selectedCd);
  check('generic tail is exactly the 20% pressure trim',
    wmTailed.pressureCd === wmBare.pressureCd * (1 - GENERIC_TAIL_PRESSURE_FRACTION));
  check('identity intact: no estimate- warnings on the generic path',
    !c.warnings.some((w) => w.startsWith('estimate-')));
  check('unlocked configurationId carries the systems', c.configurationId === 'washingmachine/smartTailBLI');

  // Tail OFF again: bare estimate; drag firms; ON restores generic-tail.
  const off = setToggle(stOn, 'tailOn', false);
  check('generic tail OFF: selectedCd back to bare',
    compute(off, engine, wmGeometry, wmSeam).selectedCd === wmBare.cdEstimate);
  const firmed = compute(setInput(off, 'cd', 0.9), engine, wmGeometry, wmSeam);
  check('drag while tracking still FIRMS to user on a generic shape',
    firmed.selectedCd === 0.9 && firmed.cdSource === 'user');
  check('tail ON restores the generic-tail estimate (tracking sentinel re-targets)',
    compute(setToggle(off, 'tailOn', true), engine, wmGeometry, wmSeam).selectedCd === wmTailed.cdEstimate);

  // Ideal is Sunship-only — by PRESET IDENTITY, never filename.
  check('applyIdeal throws on a generic shape', (() => {
    try { applyIdeal(st); return false; } catch { return true; }
  })());
  check('an upload NAMED Sunship is not the Sunship (identity, never filename)',
    !isSunship({ kind: 'upload', id: null, name: 'SUNSHIP' })
    && (() => { try { applyIdeal(setShape(initialState(), { kind: 'upload', id: null, name: 'SUNSHIP' })); return false; } catch { return true; } })());

  // Switching BACK to the Sunship restores the full public posture.
  const home = setShape(st, SUNSHIP_SHAPE);
  check('return to Sunship: both systems ON, authored 0.043, VISION',
    home.tailOn && home.bliOn && home.cd === EAS_IDEAL.cd
    && home.cdSource === 'authored' && home.scenario === 'VISION');
  const cHome = compute(setInput(home, 'airspeedKmh', 100), engine, undefined, ESTIMATOR);
  check('Sunship ideal numbers intact after the round trip (379 t)',
    cHome.refTripFuelSystemT.toFixed(0) === '379');

  // Length inheritance: same shape at another length — record scaling
  // is engine algebra; a user Cd survives (length is not a shape change).
  const wm60 = scaleGeometryRecord(wmDyn.raw, wmAxis[1], 60);
  const cShort = compute(setInput(st, 'cd', 0.5), engine, wm60, wmSeam);
  check('length change re-scales geometry without resetting the user Cd',
    cShort.selectedCd === 0.5 && cShort.shipLengthM === 60
    && cShort.frontalAreaM2 < cPublic.frontalAreaM2);
}

console.log('\n== no-ship gate (page-2 split ruling 2026-08-17) ==');
{
  // Toby's ruling (superseding the same-day amber-line draft): no
  // Ship length = N/A everywhere at any speed, NO copy — the null-
  // contract render serves parked and no-ship identically, silent.
  // (The dated reversal of the stage-2 300 m fallback.)
  const na = renderModel(null);
  check('no-ship/parked: all rows dash, zero warnings, marker null (silent N/A)',
    na.parked === true && na.rows.every(([, v]) => v === '—')
    && na.warnings.length === 0 && na.marker === null);
}

console.log('\n== comparison metrics rows (contract amendment 2026-08-16) ==');
{
  const { engine } = countingEngine();
  const c = compute(setInput(initialState(), 'airspeedKmh', 100), engine, undefined, ESTIMATOR);
  const rm = renderModel(c);
  const row = (label) => rm.rows.find(([l]) => l === label)?.[1];
  check('Drag area row displays the CONTRACT dragAreaM2 (page computes nothing)',
    row('Drag area (Cd·A)') === `${Math.round(c.dragAreaM2).toLocaleString('en-US')} m²`,
    `row ${row('Drag area (Cd·A)')} vs contract ${c.dragAreaM2}`);
  check('Cd_v row displays the CONTRACT cdVolumetric at 3 dp',
    row('Cd (V^⅔ basis)') === c.cdVolumetric.toFixed(3),
    `row ${row('Cd (V^⅔ basis)')} vs contract ${c.cdVolumetric}`);
  check('Sunship ideal Cd_v ≈ frontal Cd (near-sphere: V^⅔ ≈ A)',
    Math.abs(c.cdVolumetric - 0.0436) < 0.001, `got ${c.cdVolumetric}`);
  const parked = renderModel(null);
  check('parked: both comparison rows dash like everything else',
    parked.rows.find(([l]) => l === 'Drag area (Cd·A)')[1] === '—'
    && parked.rows.find(([l]) => l === 'Cd (V^⅔ basis)')[1] === '—');
  const noVol = compute(setInput(initialState(), 'airspeedKmh', 100), engine,
    (() => { const g = { ...SUNSHIP_GEOMETRY, warnings: [] }; delete g.volume; delete g.volumeSource; return g; })(),
    ESTIMATOR);
  check('geometry without volume: Cd_v row dashes, never invented',
    renderModel(noVol).rows.find(([l]) => l === 'Cd (V^⅔ basis)')[1] === '—'
    && noVol.cdVolumetric === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
