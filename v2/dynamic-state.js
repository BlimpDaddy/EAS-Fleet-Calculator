/**
 * DYNAMIC page state — pure, Node-tested, DOM-free (M3, DYNAMIC-SPEC §14;
 * M6 estimator amendments 2026-08-16; M6 STAGE 2: per-shape inheritance).
 *
 * THE RULE (spec §14 r4, binding): the engine is the ONLY calculator. This
 * module holds state transitions, the parked gate, and DISPLAY SELECTION +
 * formatting of engine contract values. No formulas — nothing here may
 * derive a physical quantity. The (−x%) tag is the S *setting* echoed from
 * the contract, not a computed power ratio (M3 display amendment 1,
 * 2026-08-15).
 *
 * The engine (computeDynamics) is INJECTED, never imported: the page passes
 * /calcv2/src/dynamicsCore.js, fixtures pass a counting wrapper — which is
 * how "parked load calls the engine ZERO times" (r6 pin) is provable. The
 * M6 estimator seam is injected the same way, for the same reason, and at
 * stage 2 carries THREE members: { estimateCd, applyGenericTail,
 * proxyRecord } — both functions are ENGINE code (cdEstimator.js).
 *
 * STAGE 2 SHAPE MODEL (rulings 2026-08-16):
 * - state.shape = { kind: 'preset'|'upload', id, name }. SUNSHIP IDENTITY
 *   is kind === 'preset' && id === 'sunship' — NEVER a filename (an
 *   upload named Sunship.obj is a generic shape, Toby's ruling).
 * - Shape change RESETS Cd to the new geometry's estimate (r8 #4): a
 *   hand-set Cd is a claim about one body and never travels. Speed, S
 *   and the toggles are system/flight settings — they persist.
 * - The Sunship preset with tail ON carries the AUTHORED 0.043 (the EAS
 *   claim). Every other configuration tracks the estimator: tail ON on a
 *   generic shape = the §5.4 generic-tail estimate (engine-derived);
 *   tail OFF anywhere = the bare-hull estimate. Tracking values firm to
 *   'user' the moment the slider is dragged.
 * - EAS IDEAL is Sunship-only (M6 amendment #6): applyIdeal() throws on
 *   any other shape; the page greys the button.
 *
 * PARKED STATE (M3 display amendment 2, 2026-08-15): the page loads at
 * speed 0 — dashes, engine not consulted, estimator dormant. Selections
 * changed while parked persist into the first movement — never reset.
 */

/* Canonical Sunship geometry record (M1, pinned 2026-08-13). STAGE-2
 * NOTE: the live page now builds per-shape geometry from the baked
 * presetDynamics.js records via scaleGeometryRecord() — this pinned
 * record remains as the fixtures' canonical baseline and the
 * no-shape-channel fallback; the records reproduce it to <0.01%
 * (fixture [J] in the engine suite). */
export const SUNSHIP_GEOMETRY = Object.freeze({
  flightAxis: 'Z', scale: 1, lengthM: 300, units: 'm',
  extents: Object.freeze([249, 237, 300]),
  frontalArea: 40522, wettedArea: 206795, hullArea: 206503, meshArea: 206795,
  wettedOverFrontal: 206795 / 40522, wettedSource: 'mesh',
  // Comparison-metrics amendment 2026-08-16: measured mesh volume at
  // 300 m (presetDynamics raw × s³ = 7,992,480.2 — pinned to the same
  // integer grade as the areas). Near-sphere note: V^⅔ ≈ frontal, so
  // the Sunship's Cd_v ≈ its frontal Cd.
  volume: 7992480, volumeSource: 'mesh',
  warnings: Object.freeze([]),
});

/* Canonical Sunship SECTIONAL proxy record (M6, pinned 2026-08-16) —
 * same stage-2 status as the geometry record above (presetDynamics
 * carries the identical proxy, bit-exact, fixture-guarded). */
export const SUNSHIP_SECTIONAL = Object.freeze({
  proxy: 0.7697920595614333,
  axis: '+Z',
  quality: Object.freeze({ oddColumns: 0, hitColumns: 16616, solidColumns: 16616, oddFraction: 0 }),
});

/* EAS IDEAL — the one pink button (Display Rulings v1.0, 2026-08-13).
 * Cd 0.043 / S 27% at 100 km/h → 75.8 t LH2 / 379 t fuel system, GREEN
 * and silent. SUNSHIP-AUTHORED (M6 amendment #6, r8 #3 + Toby ruling
 * 2026-08-16): gated by PRESET IDENTITY, greyed elsewhere, never leaks. */
export const EAS_IDEAL = Object.freeze({
  airspeedKmh: 100, cd: 0.043, s: 0.27,
  scenario: 'VISION',
  cdSource: 'authored', sSource: 'authored',
  cdLabel: 'EAS IDEAL (ruled 2026-08-13)',
  sLabel: 'EAS IDEAL (ruled 2026-08-13)',
});

export const SUNSHIP_SHAPE = Object.freeze({ kind: 'preset', id: 'sunship', name: 'SUNSHIP' });

export const isSunship = (shape) => !!shape && shape.kind === 'preset' && shape.id === 'sunship';

/* Cd tracking sentinel (M6): "Cd follows the estimator for the current
 * configuration" — bare hull when the tail is OFF, the generic-tail
 * estimate when the tail is ON on a non-Sunship shape. Resolves at
 * compute/paint time; FIRMS to a number when the user drags. */
export const CD_TRACKS_ESTIMATE = 'estimate';

const ESTIMATED_BARE_LABEL = 'ESTIMATED — bare hull, sectional estimator (M6, 2026-08-16)';
const ESTIMATED_GENERIC_TAIL_LABEL = 'ESTIMATED — generic Smart Tail, 20% of pressure removed (REFERENCE ASSUMPTION §5.4)';

/* Slider ranges (spec §2; parked amendment extends speed to 0). */
export const SPEED_MIN = 0, SPEED_MAX = 140;
export const S_MAX = 0.75;

/* Cd dial fallbacks before any contract/estimate exists (parked load). */
const CD_DIAL_BOTTOM_PARKED = 0.009;
const CD_DIAL_TOP_DEFAULT = 0.40;

/** The tracking-vs-authored Cd posture for a fresh configuration of a
 *  shape (the ONE derivation of "what does Cd reset to" — used by
 *  initialState, setShape and the tail-ON restore fallback). */
function freshCd(shape, tailOn) {
  if (tailOn && isSunship(shape)) {
    return { cd: EAS_IDEAL.cd, cdSource: EAS_IDEAL.cdSource, cdLabel: EAS_IDEAL.cdLabel };
  }
  return {
    cd: CD_TRACKS_ESTIMATE,
    cdSource: 'estimated',
    cdLabel: tailOn ? ESTIMATED_GENERIC_TAIL_LABEL : ESTIMATED_BARE_LABEL,
  };
}

/** A shape's PUBLIC arrival posture (the one derivation, used by
 *  initialState and setShape). TOGGLE GATING (Toby ruling 2026-08-16,
 *  completing the greyed-Ideal ruling): the EAS systems are Sunship
 *  tech — on any other shape both toggles arrive OFF and the page
 *  LOCKS them (pure state stays operable; the lock is interaction
 *  gating, released by the page's E+A+S engineer chord). The Sunship
 *  arrives both-ON in ideal posture — the reveal is REMOVAL. */
function arrivalPosture(shape) {
  const sun = isSunship(shape);
  const tailOn = sun, bliOn = sun;
  const cd = freshCd(shape, tailOn);
  return { tailOn, bliOn, cd, scenario: sun ? EAS_IDEAL.scenario : 'CUSTOM' };
}

/** The page's load state: zero of its own variable, the shape's public
 *  arrival posture (rulings 2026-08-13 / 2026-08-16). */
export function initialState(shape = SUNSHIP_SHAPE) {
  const p = arrivalPosture(shape);
  return {
    airspeedKmh: 0,              // PARKED
    shape,
    cd: p.cd.cd,
    s: EAS_IDEAL.s,
    tailOn: p.tailOn,
    bliOn: p.bliOn,
    tailStash: null,             // remembered tail-ON Cd selection while OFF
    scenario: p.scenario,
    cdSource: p.cd.cdSource, sSource: EAS_IDEAL.sSource,
    cdLabel: p.cd.cdLabel, sLabel: EAS_IDEAL.sLabel,
  };
}

export function isParked(state) {
  return !(state.airspeedKmh > 0);
}

/** SHAPE CHANGE (M6 stage 2, r8 #4 binding): Cd RESETS to the new
 *  shape's estimator posture — overriding any preset or hand-set value
 *  (a Cd is a claim about one body; carrying it across shapes launders
 *  provenance). The stash dies with the old shape. Speed and the S
 *  SELECTION persist (flight/system settings); the TOGGLES take the
 *  new shape's public arrival posture (Sunship ON/ON, generic OFF/OFF
 *  locked — see arrivalPosture). */
export function setShape(state, shape) {
  const p = arrivalPosture(shape);
  return {
    ...state,
    shape,
    tailOn: p.tailOn, bliOn: p.bliOn,
    cd: p.cd.cd, cdSource: p.cd.cdSource, cdLabel: p.cd.cdLabel,
    tailStash: null,
    scenario: p.scenario,
  };
}

/** A user edit: sets one input and re-labels provenance honestly — any
 *  hand-moved slider makes that input 'user' and the scenario CUSTOM.
 *  Speed is scenario-neutral (spec §2). Persists while parked (r6).
 *  Dragging Cd while it tracks the estimate FIRMS it (M6 #2); the
 *  tail-ON stash is untouched, so re-enabling the tail still restores
 *  the prior tail-on selection (r10). */
export function setInput(state, field, value) {
  const next = { ...state };
  if (field === 'airspeedKmh') {
    next.airspeedKmh = value;
  } else if (field === 'cd') {
    next.cd = value;
    next.cdSource = 'user'; next.cdLabel = 'USER SETTING';
    next.scenario = 'CUSTOM';
  } else if (field === 's') {
    next.s = value;
    next.sSource = 'user'; next.sLabel = 'USER SETTING';
    next.scenario = 'CUSTOM';
  } else {
    throw new Error(`setInput: unknown field '${field}'`);
  }
  return next;
}

/** Toggle a system (M4 Smart Tail / M5 BLI).
 *  BLI OFF forces S = 0 (its own term only, spec §7.1) without
 *  destroying the underlying S selection (bench ruling cea306a).
 *  Tail OFF (M6 #3, r10): STASH the current tail-on Cd selection and
 *  snap Cd to the tracking sentinel — bare-hull ESTIMATED, slider still
 *  editable. Tail ON restores the stashed selection exactly; with no
 *  stash it takes the shape's fresh tail-on posture (authored 0.043 on
 *  the Sunship, the generic-tail estimate elsewhere). */
export function setToggle(state, field, on) {
  if (field === 'bliOn') return { ...state, bliOn: !!on };
  if (field !== 'tailOn') throw new Error(`setToggle: unknown field '${field}'`);
  const want = !!on;
  if (state.tailOn === want) return { ...state };
  if (!want) {
    return {
      ...state, tailOn: false,
      tailStash: { cd: state.cd, cdSource: state.cdSource, cdLabel: state.cdLabel },
      cd: CD_TRACKS_ESTIMATE, cdSource: 'estimated', cdLabel: ESTIMATED_BARE_LABEL,
    };
  }
  const stash = state.tailStash ?? freshCd(state.shape, true);
  // A stashed tracking sentinel re-labels for the tail-ON context (the
  // sentinel means "follow the estimator", whose tail-on meaning is the
  // generic-tail estimate — never a stale bare label).
  const restored = stash.cd === CD_TRACKS_ESTIMATE ? freshCd(state.shape, true) : stash;
  return {
    ...state, tailOn: true, tailStash: null,
    cd: restored.cd, cdSource: restored.cdSource, cdLabel: restored.cdLabel,
  };
}

/** The pink button — SUNSHIP-ONLY (M6 amendment #6; Toby ruling
 *  2026-08-16: greyed elsewhere, gated by preset identity). Idempotent;
 *  restores the COMPLETE ruled configuration (r7 #1). */
export function applyIdeal(state) {
  if (!isSunship(state.shape)) {
    throw new Error('applyIdeal: EAS IDEAL is Sunship-authored and never leaks onto other shapes');
  }
  return {
    ...state,
    airspeedKmh: EAS_IDEAL.airspeedKmh,
    cd: EAS_IDEAL.cd, s: EAS_IDEAL.s,
    tailOn: true, bliOn: true,
    tailStash: null,
    scenario: EAS_IDEAL.scenario,
    cdSource: EAS_IDEAL.cdSource, sSource: EAS_IDEAL.sSource,
    cdLabel: EAS_IDEAL.cdLabel, sLabel: EAS_IDEAL.sLabel,
  };
}

/** Resolve the Cd IN FORCE with its truthful provenance (r7 #2/#6: ONE
 *  derivation, shared by compute() and paint()). Stage 2: the sentinel's
 *  target depends on the configuration — bareEst when the tail is OFF,
 *  tailedEst (engine applyGenericTail) when ON on a generic shape, and
 *  the authored 0.043 defensively if a Sunship tail-ON state ever
 *  carries the sentinel. Fallbacks unchanged from stage 1: estimator
 *  UNAVAILABLE → the stash under its own label (an ESTIMATED label may
 *  never ride a non-estimator value); dormant (no estimate at all) →
 *  cd null, the pending state (resolves on first movement, r6). */
export function resolveCd(state, bareEst = null, tailedEst = null) {
  if (state.cd !== CD_TRACKS_ESTIMATE) {
    return { cd: state.cd, cdSource: state.cdSource, cdLabel: state.cdLabel };
  }
  if (state.tailOn && isSunship(state.shape)) {
    return { cd: EAS_IDEAL.cd, cdSource: EAS_IDEAL.cdSource, cdLabel: EAS_IDEAL.cdLabel };
  }
  const target = state.tailOn ? tailedEst : bareEst;
  const label = state.tailOn ? ESTIMATED_GENERIC_TAIL_LABEL : ESTIMATED_BARE_LABEL;
  if (target && target.status === 'ok' && Number.isFinite(target.cdEstimate)) {
    return { cd: target.cdEstimate, cdSource: 'estimated', cdLabel: label };
  }
  if ((bareEst || tailedEst) && state.tailStash && state.tailStash.cd !== CD_TRACKS_ESTIMATE) {
    return { cd: state.tailStash.cd, cdSource: state.tailStash.cdSource, cdLabel: state.tailStash.cdLabel };
  }
  return { cd: null, cdSource: 'estimated', cdLabel: label };
}

/** The control values IN FORCE (r7 #6). */
export function effectiveControls(state, bareEst = null, tailedEst = null) {
  return {
    cd: resolveCd(state, bareEst, tailedEst).cd,
    s: state.bliOn ? state.s : 0,
  };
}

const shapeKey = (shape) =>
  shape.kind === 'preset' ? shape.id : `upload:${(shape.name || 'unnamed').toLowerCase()}`;

const configurationId = (state) =>
  `${shapeKey(state.shape)}/` + (state.tailOn ? (state.bliOn ? 'smartTailBLI' : 'smartTail')
                                              : (state.bliOn ? 'bodyOnly+BLI' : 'bodyOnly'));

/**
 * The one seam to the engine. Returns null when parked — neither the
 * engine NOR the estimator is consulted. At v > 0 returns the untouched
 * §9 contract; contract.estimate is ALWAYS the BARE-hull estimate (the
 * marker's truth — the generic-tail derivation shows up in selectedCd
 * with its own label, never as the marker).
 *
 * @param {object} state
 * @param {function} computeDynamics  the injected engine
 * @param {object} [geometry]  metres-grade geometry record for the
 *        ACTIVE shape (the page builds it from the baked preset records
 *        or the upload's worker measurement via scaleGeometryRecord)
 * @param {{estimateCd: function, applyGenericTail: function,
 *          proxyRecord: object}|null} [estimator]
 */
export function compute(state, computeDynamics, geometry = SUNSHIP_GEOMETRY, estimator = null) {
  if (isParked(state)) return null;
  const bareEst = estimator
    ? estimator.estimateCd(estimator.proxyRecord, geometry, state.airspeedKmh)
    : null;
  const needTailed = state.tailOn && !isSunship(state.shape);
  const tailedEst = needTailed && estimator && bareEst
    ? estimator.applyGenericTail(bareEst)
    : null;
  const resolution = resolveCd(state, bareEst, tailedEst);
  if (resolution.cd == null) {
    // Tracking Cd with no estimator wired (pre-M6 caller): fall back so
    // the engine always receives a number — the page can never wedge on
    // the estimator's absence (§5.5).
    Object.assign(resolution, state.tailStash && state.tailStash.cd !== CD_TRACKS_ESTIMATE
      ? state.tailStash
      : { cd: EAS_IDEAL.cd, cdSource: EAS_IDEAL.cdSource, cdLabel: EAS_IDEAL.cdLabel });
  }
  const { cd: cdUsed, cdSource, cdLabel } = resolution;
  const sUsed = state.bliOn ? state.s : 0;
  return computeDynamics(geometry, {
    airspeedKmh: state.airspeedKmh,
    cd: cdUsed,
    s: sUsed,
    scenario: state.scenario,
    configurationId: configurationId(state),
    cdSource,
    sSource: state.bliOn ? state.sSource : 'authored',
    cdLabel,
    sLabel: state.bliOn ? state.sLabel : 'BLI OFF — S = 0 (spec §7.1)',
    estimate: bareEst,
  });
}

/* ------------------------------------------------------------------ *
 * Display selection — the ruled condensed box (Display Rulings v1.0).
 * The contract is the full truth; the UI is a selection from it.
 * Formatting only below this line.
 * ------------------------------------------------------------------ */

const DASH = '—';
const fmt = {
  m2: (x) => `${Math.round(x).toLocaleString('en-US')} m²`,
  mn: (x) => `${(x / 1e6).toFixed(2)} MN`,
  mw: (x) => `${x.toFixed(1)} MW`,
  mwh: (x) => `${Math.round(x).toLocaleString('en-US')} MWh`,
  t1: (x) => `${x.toFixed(1)} t`,
  t0: (x) => `${Math.round(x).toLocaleString('en-US')} t`,
  // Comparison metrics (owner request 2026-08-16): Cd_v shown at 3 dp
  // (the airship literature quotes 0.02x-class); null → dash, never
  // invented (contract sends null when the record carries no trusted
  // volume).
  cd3: (x) => (x === null ? DASH : x.toFixed(3)),
};

/**
 * Cd dial range — the §5.3 pinned per-shape rule (r2 #3): bottom = the
 * shape's friction screening estimate (ENGINE contract value); top =
 * max(0.40, 1.5 × estimate), UNCAPPED — ×1.5 guarantees the ±20% band
 * always fits. Both ends CEIL to the slider's 0.001 step grid. (The old
 * "sphere undialable" device ended with the 0.26 era — spec 2a.)
 */
export function cdDialRange(contract = null, estimate = null) {
  const grid = (x) => Math.ceil(x * 1000 - 1e-9) / 1000;
  const bottom = contract && Number.isFinite(contract.frictionCd)
    ? grid(contract.frictionCd) : CD_DIAL_BOTTOM_PARKED;
  const top = estimate && estimate.status === 'ok' && Number.isFinite(estimate.cdEstimate)
    ? Math.max(CD_DIAL_TOP_DEFAULT, grid(1.5 * estimate.cdEstimate))
    : CD_DIAL_TOP_DEFAULT;
  return { min: bottom, max: top };
}

/**
 * Contract → the ruled display model. NEVER recalculates: every number
 * is a contract field formatted — except the (−x%) tag (the S SETTING
 * echoed) — and wetted reads contract.wettedAreaM2 (M6 #4, r7 #5).
 *
 * `marker` is the BARE-hull estimator proposal: value + band edges, or
 * null. The band is DRAWN, never worded (M6 #2). Marker guard checks
 * band SHAPE (r12 #1a defence-in-depth at the old crash site).
 */
export function renderModel(contract) {
  if (contract === null) {
    return {
      parked: true,
      rows: [
        ['Frontal area', DASH], ['Wetted area', DASH], ['Drag', DASH],
        ['Drag area (Cd·A)', DASH], ['Cd (V^⅔ basis)', DASH],
        ['Propulsion power', DASH],
        ['LH2 weight (10,000 km)', DASH], ['LH2 + Storage (10,000 km)', DASH],
      ],
      powerTag: '', warnings: [], marker: null,
    };
  }
  const savingPct = Math.round(contract.selectedS * 100);
  // Warnings-only statuses, MINIMAL WORDS (rulings 2026-08-13/15).
  const warnings = [];
  if (contract.aerodynamicStatus === 'ORANGE') warnings.push({ level: 'orange', text: 'Inefficient dynamics' });
  if (contract.aerodynamicStatus === 'RED') warnings.push({ level: 'red', text: 'Critically inefficient' });
  if (contract.fuelMassStatus === 'ORANGE') warnings.push({ level: 'orange', text: 'High fuel weight' });
  if (contract.fuelMassStatus === 'RED') warnings.push({ level: 'red', text: 'Critical fuel weight' });
  for (const w of contract.warnings) {
    if (w.startsWith('cd-below-friction-estimate')) warnings.push({ level: 'red', text: 'Cd below friction floor' });
    else if (w.startsWith('below-screening-floor')) warnings.push({ level: 'red', text: 'Below screening floor' });
    else if (w.startsWith('wetted-') || w.startsWith('no-faces')) { /* geometry-source notes stay contract-side */ }
    else warnings.push({ level: 'orange', text: w });
  }
  const est = contract.estimate;
  const marker = est && est.status === 'ok' && Number.isFinite(est.cdEstimate)
    && Array.isArray(est.band) && Number.isFinite(est.band[0]) && Number.isFinite(est.band[1])
    ? { value: est.cdEstimate, lo: est.band[0], hi: est.band[1] }
    : null;
  return {
    parked: false,
    // Fuel pair (rulings 2026-08-15/16): reference-trip LH2 + the 5×
    // tankage system total; energy row CUT; the /1,000 km rate row CUT
    // (the §3.6 contract field survives for FLEET at M8).
    rows: [
      ['Frontal area', fmt.m2(contract.frontalAreaM2)],
      ['Wetted area', fmt.m2(contract.wettedAreaM2)],
      ['Drag', fmt.mn(contract.dragN)],
      // Comparison metrics (contract amendment 2026-08-16, owner
      // request): CdA = the absolute drag footprint, immune to
      // reference-area choice; Cd_v = drag priced against carried
      // volume (classic airship basis). Values read from the
      // contract — the page computes nothing (r6 rule).
      ['Drag area (Cd·A)', fmt.m2(contract.dragAreaM2)],
      ['Cd (V^⅔ basis)', fmt.cd3(contract.cdVolumetric)],
      ['Propulsion power', fmt.mw(contract.powerMW)],
      ['LH2 weight (10,000 km)', fmt.t1(contract.refTripFuelT)],
      ['LH2 + Storage (10,000 km)', fmt.t0(contract.refTripFuelSystemT)],
    ],
    powerTag: savingPct > 0 ? `(−${savingPct}%)` : '',
    warnings,
    marker,
    // NO provenance copy on the page (ruling 2026-08-15) — the contract
    // keeps the engineer-facing truth.
  };
}
