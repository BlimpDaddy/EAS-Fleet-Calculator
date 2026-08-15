/**
 * DYNAMIC page state — pure, Node-tested, DOM-free (M3, DYNAMIC-SPEC §14).
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
 * how "parked load calls the engine ZERO times" (r6 pin) is provable.
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
 *      (M6 estimator / M8 FLEET handoff).
 * REPLACEMENT TRIGGER: M6/M8 wire the upstream shape's own measured
 *      record through this seam. */
export const SUNSHIP_GEOMETRY = Object.freeze({
  flightAxis: 'Z', scale: 1, lengthM: 300, units: 'm',
  extents: Object.freeze([249, 237, 300]),
  frontalArea: 40522, wettedArea: 206795, hullArea: 206503, meshArea: 206795,
  wettedOverFrontal: 206795 / 40522, wettedSource: 'mesh',
  warnings: Object.freeze([]),
});

/* EAS IDEAL — the one pink button (Display Rulings v1.0, 2026-08-13;
 * scenario chips deleted). Cd 0.043 / S 27% at 100 km/h → 75.8 t LH2 /
 * 379 t fuel system, GREEN and silent. Origin metadata AND provenance
 * labels are both authored explicitly (r5 M3 note: a scenario record
 * must never self-identify as 'user' because someone omitted metadata). */
export const EAS_IDEAL = Object.freeze({
  airspeedKmh: 100, cd: 0.043, s: 0.27,
  scenario: 'VISION',
  cdSource: 'authored', sSource: 'authored',
  cdLabel: 'EAS IDEAL (ruled 2026-08-13)',
  sLabel: 'EAS IDEAL (ruled 2026-08-13)',
});

/* Body-only Cd when Smart Tail is OFF (bench ruling 2026-08-13: raised
 * 0.22 → 0.26, Toby). Inert at M3 — toggles become operational at M4/M5
 * (r6: M3 is the shell); the value is pinned here so M4 changes wiring,
 * not numbers. */
export const BODY_ONLY_CD = 0.26;

/* Slider ranges (spec §2; parked amendment extends speed to 0). */
export const SPEED_MIN = 0, SPEED_MAX = 140;
export const S_MAX = 0.75;

/** The page's load state: zero of its own variable, both systems ON in
 *  ideal posture — the reveal is REMOVAL (rulings 2026-08-13). */
export function initialState() {
  return {
    airspeedKmh: 0,              // PARKED
    cd: EAS_IDEAL.cd,
    s: EAS_IDEAL.s,
    tailOn: true,
    bliOn: true,
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
 *  provenance labels belong to Cd and S). Persists while parked (r6). */
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

/** The pink button. Idempotent by construction: applying it twice yields
 *  the same state (r6 fixture). Restores authored provenance. */
export function applyIdeal(state) {
  return {
    ...state,
    airspeedKmh: EAS_IDEAL.airspeedKmh,
    cd: EAS_IDEAL.cd, s: EAS_IDEAL.s,
    scenario: EAS_IDEAL.scenario,
    cdSource: EAS_IDEAL.cdSource, sSource: EAS_IDEAL.sSource,
    cdLabel: EAS_IDEAL.cdLabel, sLabel: EAS_IDEAL.sLabel,
  };
}

const configurationId = (state) =>
  'sunship/' + (state.tailOn ? (state.bliOn ? 'smartTailBLI' : 'smartTail')
                             : (state.bliOn ? 'bodyOnly+BLI' : 'bodyOnly'));

/**
 * The one seam to the engine. Returns null when parked — the engine is
 * NOT consulted (provably: fixtures inject a counting engine). At v > 0
 * returns the untouched §9 contract.
 */
export function compute(state, computeDynamics, geometry = SUNSHIP_GEOMETRY) {
  if (isParked(state)) return null;
  // Toggle semantics (spec §7.1) — wired here so M4/M5 are UI enablement,
  // not new maths. At M3 both toggles are ON (inert controls).
  const cdUsed = state.tailOn ? state.cd : BODY_ONLY_CD;
  const sUsed = state.bliOn ? state.s : 0;
  return computeDynamics(geometry, {
    airspeedKmh: state.airspeedKmh,
    cd: cdUsed,
    s: sUsed,
    scenario: state.scenario,
    configurationId: configurationId(state),
    cdSource: state.tailOn ? state.cdSource : 'authored',
    sSource: state.sSource,
    cdLabel: state.cdLabel, sLabel: state.sLabel,
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
 * Contract → the ruled display model. Pass the contract from compute()
 * (or null when parked). NEVER recalculates: every number is a contract
 * field formatted — except the (−x%) tag, which is the S SETTING echoed
 * (`selectedS` — the number IS the S setting, amendment 1), and wetted
 * area, which is a MEASURED INPUT echoed from the geometry record (the
 * contract carries frontal only).
 */
export function renderModel(contract, geometry = SUNSHIP_GEOMETRY) {
  if (contract === null) {
    return {
      parked: true,
      rows: [
        ['Frontal area', DASH], ['Wetted area', DASH], ['Drag', DASH],
        ['Propulsion power', DASH], ['Energy / 1,000 km', DASH],
        ['LH2 / 1,000 km', DASH], ['Fuel system weight', DASH],
      ],
      powerTag: '', warnings: [],
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
  return {
    parked: false,
    rows: [
      ['Frontal area', fmt.m2(contract.frontalAreaM2)],
      ['Wetted area', fmt.m2(geometry.wettedArea)],
      ['Drag', fmt.mn(contract.dragN)],
      ['Propulsion power', fmt.mw(contract.powerMW)],
      ['Energy / 1,000 km', fmt.mwh(contract.energyPer1000kmMWh)],
      ['LH2 / 1,000 km', fmt.t1(contract.fuelPer1000kmT)],
      ['Fuel system weight', `${fmt.t0(contract.refTripFuelSystemT)} (10,000 km ref)`],
    ],
    powerTag: savingPct > 0 ? `(−${savingPct}%)` : '',
    warnings,
    // NO provenance copy on the page (Toby ruling 2026-08-15) — the
    // contract's provenance object remains the engineer-facing truth.
  };
}
