/**
 * DYNAMIC page state — pure, Node-tested, DOM-free (M3, DYNAMIC-SPEC §14;
 * M6 estimator amendments 2026-08-16).
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
 * M6 estimator (estimateCd) is injected the same way, for the same reason:
 * "estimator dormant while parked" is a measurement, not a claim.
 *
 * PARKED STATE (M3 display amendment 2, 2026-08-15): the page loads at
 * speed 0 — dashes, engine not consulted. The engine stays strict (rejects
 * v ≤ 0); parked is a UI-level state. Selections changed while parked
 * (Cd / S / toggles) persist into the first movement — never reset.
 */

/* Canonical Sunship geometry record.
 * WHAT: the M1 measured-geometry record for the Sunship at L = 300 m.
 * WHY: M3 has no shape/length controls (inherited upstream, rulings
 *      2026-08-13); the shell pins the canonical record so the page
 *      reproduces the headless numbers exactly.
 * PROVENANCE: MEASURED 2026-08-13 from Sunship.obj (CalcV2 M1 pipeline,
 *      Phase-A review r5) — frontal 40,522 m², wetted 206,795 m².
 * LIMITATION: the DYNAMIC page shows Sunship aerodynamics regardless of
 *      the shape selected upstream, until per-shape inheritance lands
 *      (M8 FLEET handoff). The M6 estimator rules for shape/orientation
 *      change (reset Cd to the new estimate) therefore have no trigger
 *      on this page yet — they bind the moment inheritance arrives.
 * REPLACEMENT TRIGGER: M8 wires the upstream shape's own measured
 *      record through this seam. */
export const SUNSHIP_GEOMETRY = Object.freeze({
  flightAxis: 'Z', scale: 1, lengthM: 300, units: 'm',
  extents: Object.freeze([249, 237, 300]),
  frontalArea: 40522, wettedArea: 206795, hullArea: 206503, meshArea: 206795,
  wettedOverFrontal: 206795 / 40522, wettedSource: 'mesh',
  warnings: Object.freeze([]),
});

/* Canonical Sunship SECTIONAL proxy record (M6, the estimator's expensive
 * half, precomputed).
 * WHAT: the measureSectionalProxy() record for Sunship.obj flown '+Z' —
 *      the pure-shape pressure proxy; speed-independent by construction.
 * WHY: the hybrid inheritance rule (M6): preset records precomputed at
 *      bake/pin time, uploads measured live. The page calls only the
 *      CHEAP per-speed estimateCd() with this record.
 * PROVENANCE: MEASURED 2026-08-16 (CalcV2 estimator fixtures, corpus
 *      section, guards this value against the live pipeline; the '+Z'
 *      flight direction is the orientation validated throughout the
 *      sectional spike and viewer).
 * LIMITATION: Sunship-only, like the geometry record above.
 * REPLACEMENT TRIGGER: per-shape inheritance (M8) measures uploads live
 *      and precomputes presets at bake time with an asset-hash guard. */
export const SUNSHIP_SECTIONAL = Object.freeze({
  proxy: 0.7697920595614333,
  axis: '+Z',
  quality: Object.freeze({ oddColumns: 0, hitColumns: 16616, solidColumns: 16616, oddFraction: 0 }),
});

/* EAS IDEAL — the one pink button (Display Rulings v1.0, 2026-08-13;
 * scenario chips deleted). Cd 0.043 / S 27% at 100 km/h → 75.8 t LH2 /
 * 379 t fuel system, GREEN and silent. Origin metadata AND provenance
 * labels are both authored explicitly (r5 M3 note: a scenario record
 * must never self-identify as 'user' because someone omitted metadata).
 * SUNSHIP-AUTHORED (M6 amendment #6, r8 #3): the 0.043 and this button
 * never leak onto uploads or other presets. */
export const EAS_IDEAL = Object.freeze({
  airspeedKmh: 100, cd: 0.043, s: 0.27,
  scenario: 'VISION',
  cdSource: 'authored', sSource: 'authored',
  cdLabel: 'EAS IDEAL (ruled 2026-08-13)',
  sLabel: 'EAS IDEAL (ruled 2026-08-13)',
});

/* THE AUTHORED 0.26 IS RETIRED (M6 amendment #3, Toby ratified
 * 2026-08-16): bare geometry is ALWAYS the estimator's — one rule for
 * every shape. Tail OFF now snaps Cd to the live bare-hull ESTIMATE and
 * the slider stays EDITABLE (r10: estimator proposes, slider disposes;
 * forced-and-disabled belonged to the 0.26 era). The sentinel below
 * marks "Cd tracks the estimate": it resolves to the estimator's value
 * at compute time (the estimate drifts gently with speed — its friction
 * term is Re-dependent — so a snapped Cd is live, not frozen) and FIRMS
 * to a number the moment the user drags (source → 'user'). */
export const CD_TRACKS_ESTIMATE = 'estimate';

const ESTIMATED_BARE_LABEL = 'ESTIMATED — bare hull, sectional estimator (M6, 2026-08-16)';

/* Slider ranges (spec §2; parked amendment extends speed to 0). */
export const SPEED_MIN = 0, SPEED_MAX = 140;
export const S_MAX = 0.75;

/* Cd dial fallbacks before any contract/estimate exists (parked load):
 * the pinned Sunship friction floor (§5.1 fixture value) and the pre-M6
 * default top. Once values flow, cdDialRange() takes over. */
const CD_DIAL_BOTTOM_PARKED = 0.009;
const CD_DIAL_TOP_DEFAULT = 0.40;

/** The page's load state: zero of its own variable, both systems ON in
 *  ideal posture — the reveal is REMOVAL (rulings 2026-08-13). */
export function initialState() {
  return {
    airspeedKmh: 0,              // PARKED
    cd: EAS_IDEAL.cd,
    s: EAS_IDEAL.s,
    tailOn: true,
    bliOn: true,
    tailStash: null,             // remembered tail-ON Cd selection while OFF
    scenario: EAS_IDEAL.scenario,
    cdSource: EAS_IDEAL.cdSource, sSource: EAS_IDEAL.sSource,
    cdLabel: EAS_IDEAL.cdLabel, sLabel: EAS_IDEAL.sLabel,
  };
}

export function isParked(state) {
  return !(state.airspeedKmh > 0);
}

/** A user edit: sets one input and re-labels provenance honestly — any
 *  hand-moved slider makes that input 'user' and the scenario CUSTOM.
 *  Speed is scenario-neutral (spec §2: speed is the page's own variable;
 *  provenance labels belong to Cd and S). Persists while parked (r6).
 *  Dragging Cd while it tracks the estimate FIRMS it (M6 amendment #2:
 *  the value firms only when the user drags) — the tail-ON stash is
 *  untouched, so re-enabling the tail still restores the prior tail-on
 *  selection (r10). */
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
 *  BLI OFF forces S = 0 (its own term only, spec §7.1) without destroying
 *  the underlying S selection — re-enabling restores it exactly (bench
 *  ruling cea306a; derivation in effectiveControls).
 *  Tail OFF (M6 amendment #3, r10): STASH the current tail-on Cd
 *  selection and snap Cd to the tracking sentinel — the bare-hull
 *  ESTIMATE, truthfully labelled, slider still editable. Tail ON
 *  restores the stashed selection exactly. Persists while parked like
 *  any selection (r6). */
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
  const stash = state.tailStash ?? { cd: EAS_IDEAL.cd, cdSource: EAS_IDEAL.cdSource, cdLabel: EAS_IDEAL.cdLabel };
  return {
    ...state, tailOn: true, tailStash: null,
    cd: stash.cd, cdSource: stash.cdSource, cdLabel: stash.cdLabel,
  };
}

/** The pink button. Idempotent by construction: applying it twice yields
 *  the same state (r6 fixture). Restores the COMPLETE ruled configuration
 *  — sliders, provenance, both toggles ON, stash cleared (review r7
 *  send-back #1: tail-off → Ideal must yield the 75.8 t / 379 t state,
 *  never a bare-hull value under an Ideal label). */
export function applyIdeal(state) {
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
 *  derivation, shared by compute() and paint()). Three cases for the
 *  tracking sentinel:
 *  - estimate OK → the estimator's value, ESTIMATED label;
 *  - estimate asked and UNAVAILABLE (§5.5) → the stashed prior selection
 *    under the stash's OWN label — an ESTIMATED label may never ride a
 *    non-estimator value;
 *  - no estimate at all (null — estimator dormant, i.e. parked) → cd
 *    null, the PENDING state: the display shows a dash and the snap
 *    resolves on first movement (r6: parked selections carry, never
 *    reset). compute() itself never emits null — see its guard. */
export function resolveCd(state, estimate = null) {
  if (state.cd !== CD_TRACKS_ESTIMATE) {
    return { cd: state.cd, cdSource: state.cdSource, cdLabel: state.cdLabel };
  }
  if (estimate && estimate.status === 'ok' && Number.isFinite(estimate.cdEstimate)) {
    return { cd: estimate.cdEstimate, cdSource: 'estimated', cdLabel: ESTIMATED_BARE_LABEL };
  }
  if (estimate && state.tailStash) {
    return { cd: state.tailStash.cd, cdSource: state.tailStash.cdSource, cdLabel: state.tailStash.cdLabel };
  }
  return { cd: null, cdSource: 'estimated', cdLabel: ESTIMATED_BARE_LABEL };
}

/** The control values IN FORCE (r7 #6). BLI OFF forces S = 0; Cd comes
 *  from resolveCd (pass the freshest estimate you have — compute() uses
 *  the live one, paint may pass the cached marker while parked). */
export function effectiveControls(state, estimate = null) {
  return {
    cd: resolveCd(state, estimate).cd,
    s: state.bliOn ? state.s : 0,
  };
}

const configurationId = (state) =>
  'sunship/' + (state.tailOn ? (state.bliOn ? 'smartTailBLI' : 'smartTail')
                             : (state.bliOn ? 'bodyOnly+BLI' : 'bodyOnly'));

/**
 * The one seam to the engine. Returns null when parked — neither the
 * engine NOR the estimator is consulted (provably: fixtures inject
 * counting wrappers; M6 amendment #5: estimator dormant while parked).
 * At v > 0 returns the untouched §9 contract, with the estimator's
 * frozen-API proposal echoed in contract.estimate (or null when no
 * estimator is wired — pre-M6 behaviour intact).
 *
 * @param {object} state
 * @param {function} computeDynamics  the injected engine
 * @param {object} [geometry]
 * @param {{estimateCd: function, proxyRecord: object}|null} [estimator]
 *        the injected estimator seam: estimateCd(proxyRecord, geometry,
 *        airspeedKmh) → the frozen API object
 */
export function compute(state, computeDynamics, geometry = SUNSHIP_GEOMETRY, estimator = null) {
  if (isParked(state)) return null;
  const estimate = estimator
    ? estimator.estimateCd(estimator.proxyRecord, geometry, state.airspeedKmh)
    : null;
  // Values IN FORCE from the one shared derivation (r7 #6). A forced /
  // snapped value carries its OWN truthful provenance (r7 #2): the
  // bare-hull estimate travels as ESTIMATED, a forced S = 0 is authored —
  // never whatever the idle slider claims.
  const resolution = resolveCd(state, estimate);
  if (resolution.cd == null) {
    // Tracking Cd with no estimator wired (pre-M6 caller): resolve from
    // the stash so the engine always receives a number — the page can
    // never wedge on the estimator's absence (§5.5).
    Object.assign(resolution, state.tailStash
      ?? { cd: EAS_IDEAL.cd, cdSource: EAS_IDEAL.cdSource, cdLabel: EAS_IDEAL.cdLabel });
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
    estimate,
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
};

/**
 * Cd dial range — the §5.3 pinned per-shape rule (r2 #3): bottom = the
 * shape's friction screening estimate (the ENGINE's contract value, never
 * derived here); top = max(0.40, 1.5 × estimate), UNCAPPED — the ×1.5 is
 * what guarantees the ±20% band always fits on the dial. Display
 * geometry, not physics: both inputs are engine-published numbers.
 *
 * NOTE (M6, consequence ruled formula-first): with the bare-Sunship
 * estimate ~0.44, the Sunship dial top becomes ~0.66 — the sphere's 0.47
 * is now dialable. The old "sphere undialable on the Sunship dial"
 * device (§5.3) ends with the 0.26 era: the estimator itself reads the
 * bare hull as sphere-class bluff, and hiding that would be the exact
 * dishonesty the marker exists to prevent.
 */
export function cdDialRange(contract = null, estimate = null) {
  // Both ends CEIL to the slider's 0.001 step grid: the bottom never dips
  // below the friction floor (the dial teaches where the physical world
  // ends) and every dialable value stays a clean 3-decimal number —
  // Sunship: floor 0.0084 → dial bottom 0.009, exactly the pre-M6 value.
  const grid = (x) => Math.ceil(x * 1000 - 1e-9) / 1000;
  const bottom = contract && Number.isFinite(contract.frictionCd)
    ? grid(contract.frictionCd) : CD_DIAL_BOTTOM_PARKED;
  const top = estimate && estimate.status === 'ok' && Number.isFinite(estimate.cdEstimate)
    ? Math.max(CD_DIAL_TOP_DEFAULT, grid(1.5 * estimate.cdEstimate))
    : CD_DIAL_TOP_DEFAULT;
  return { min: bottom, max: top };
}

/**
 * Contract → the ruled display model. Pass the contract from compute()
 * (or null when parked). NEVER recalculates: every number is a contract
 * field formatted — except the (−x%) tag, which is the S SETTING echoed
 * (`selectedS` — the number IS the S setting, amendment 1). Wetted area
 * reads contract.wettedAreaM2 (M6 amendment #4, discharges r7 #5 — the
 * geometry record is no longer consulted here).
 *
 * `marker` is the estimator's proposal for the Cd slider: value + band
 * edges, or null (parked / no estimator / unavailable). The band is
 * DRAWN, never worded (M6 amendment #2: ±20% visual-only — rationale in
 * cdEstimator.js). While parked the page may keep showing its LAST
 * marker as cached presentation (amendment #5) — that cache is the
 * page's, not this model's.
 */
export function renderModel(contract) {
  if (contract === null) {
    return {
      parked: true,
      rows: [
        ['Frontal area', DASH], ['Wetted area', DASH], ['Drag', DASH],
        ['Propulsion power', DASH], ['LH2 / 1,000 km', DASH],
        ['LH2 weight (10,000 km)', DASH], ['LH2 + Storage (10,000 km)', DASH],
      ],
      powerTag: '', warnings: [], marker: null,
    };
  }
  const savingPct = Math.round(contract.selectedS * 100);
  // Statuses are warnings-only (rulings: silence is good news; ORANGE/RED
  // surface, green ticks parked calc-wide or nowhere). MINIMAL WORDS
  // (Toby ruling 2026-08-15, M3 first pass): short labels, no sentences —
  // the engine's long-form warnings stay in the contract for engineers.
  const warnings = [];
  if (contract.aerodynamicStatus === 'ORANGE') warnings.push({ level: 'orange', text: 'Inefficient dynamics' });
  if (contract.aerodynamicStatus === 'RED') warnings.push({ level: 'red', text: 'Critically inefficient' });
  if (contract.fuelMassStatus === 'ORANGE') warnings.push({ level: 'orange', text: 'High fuel weight' });
  if (contract.fuelMassStatus === 'RED') warnings.push({ level: 'red', text: 'Critical fuel weight' });
  for (const w of contract.warnings) {
    if (w.startsWith('cd-below-friction-estimate')) warnings.push({ level: 'red', text: 'Cd below friction floor' });
    else if (w.startsWith('below-screening-floor')) warnings.push({ level: 'red', text: 'Below screening floor' });
    else warnings.push({ level: 'orange', text: w }); // unmapped engine warning: surface raw (draft)
  }
  const est = contract.estimate;
  const marker = est && est.status === 'ok' && Number.isFinite(est.cdEstimate)
    ? { value: est.cdEstimate, lo: est.band[0], hi: est.band[1] }
    : null;
  return {
    parked: false,
    // Fuel trio (Toby ruling 2026-08-15): the proportional RATE, then the
    // reference-trip LH2 and the LH2 + Storage total (the 5× tankage
    // system, spec §3.6) — energy row CUT (it is power in other units).
    // Both weights are contract fields; storage is never subtracted here.
    rows: [
      ['Frontal area', fmt.m2(contract.frontalAreaM2)],
      ['Wetted area', fmt.m2(contract.wettedAreaM2)],
      ['Drag', fmt.mn(contract.dragN)],
      ['Propulsion power', fmt.mw(contract.powerMW)],
      ['LH2 / 1,000 km', fmt.t1(contract.fuelPer1000kmT)],
      ['LH2 weight (10,000 km)', fmt.t1(contract.refTripFuelT)],
      ['LH2 + Storage (10,000 km)', fmt.t0(contract.refTripFuelSystemT)],
    ],
    powerTag: savingPct > 0 ? `(−${savingPct}%)` : '',
    warnings,
    marker,
    // NO provenance copy on the page (Toby ruling 2026-08-15) — the
    // contract's provenance object remains the engineer-facing truth.
  };
}
