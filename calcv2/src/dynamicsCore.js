/**
 * DYNAMIC physics core: geometry + declared assumptions -> the section-9 contract.
 *
 * Implements DYNAMIC-SPEC.md sections 3 (physics), 8 (statuses), 9 (contract),
 * 11 (constants) — implementation authority, promoted 2026-08-12. Milestone M2:
 * one pure call, no DOM, no I/O; consumes M1's geometry record and returns the
 * complete published result contract. FLEET and the UI see this object and
 * NOTHING else (no renderer, particle or internal state) — and the adapter is
 * a trust boundary that must never re-derive any of these numbers (spec s14,
 * build amendment r4).
 *
 * The whole model, one line each (spec s3):
 *
 *   D        = 0.5 * rho * Cd * A * v^2          drag — a freezeframe force
 *   P_0      = D * v                              no-credit power (ideal cubic)
 *   P        = (1 - S) * P_0                      with the integrated systems
 *   E/1000km = P * (1e6 m / v)                    energy is the film, not the frame
 *   LH2      = E / e_eff                          fuel from the declared chain
 *   system   = 5 * LH2                            the tank is 4x the fuel, on top
 *
 * There is NO reference speed and NO exponent anywhere in this model: S is a
 * flat saving, exact at every speed. Vog exists only as a documentation
 * translation (spec s3.3) and never appears in this module's outputs.
 */

/* ------------------------------------------------------------------ *
 * Declared constants (spec s11). Every one carries the five-field
 * comment because every one is an assumption entering the mathematics.
 * ------------------------------------------------------------------ */

/**
 * AIR DENSITY — 2026-08-12
 * WHAT:  rho = 1.112 kg/m^3, still air at the declared 1,000 m operating
 *        altitude (ISA-ish).
 * WHY:   the Sunship's declared cruise altitude; sea level (1.225) would
 *        overstate drag ~10%.
 * PROVENANCE: REFERENCE ASSUMPTION (Toby; spec s11).
 * LIMITATION: fixed constant — no weather, no altitude slider in Release 1.
 * REPLACE WHEN: altitude becomes a control, or the flight-ops model matures.
 */
export const RHO_KG_M3 = 1.112;

/**
 * KINEMATIC VISCOSITY OF AIR — 2026-08-12
 * WHAT:  nu = 1.5e-5 m^2/s (dynamic viscosity / density, so altitude density
 *        is already baked in). Feeds Reynolds number Re = v * L / nu.
 * WHY:   standard air value at screening grade; Cf depends on Re only
 *        logarithmically, so modest error here moves the friction floor
 *        by very little.
 * PROVENANCE: ENGINEERING INPUT (standard air property).
 * LIMITATION: fixed for temperature/altitude; fine at screening fidelity.
 * REPLACE WHEN: never expected to matter at this model's grade.
 */
export const NU_M2_S = 1.5e-5;

/**
 * FRICTION SCREENING MODEL — ITTC-1957 line — 2026-08-13 (pinned r2 #7)
 * WHAT:  Cf = 0.075 / (log10(Re) - 2)^2, then
 *        Cd_friction = Cf * (wettedArea / frontalArea).
 * WHY:   Release 1 needs a deterministic, very-low-compute lower screening
 *        estimate derived from measurable geometry. This is NOT a CFD
 *        prediction. It sets the Cd slider's bottom per shape (spec s5.3)
 *        and feeds the derived product floor (spec s3.4).
 * SUNSHIP FIXTURE: L = 300 m, v = 100 km/h -> Re ~ 5.6e8 -> Cf ~ 0.00165;
 *        wetted/frontal 5.10 (M1 measured) -> Cd_friction ~ 0.0084 —
 *        inside the spec's declared 0.008–0.012 band.
 * LIMITATION: smooth, fully-turbulent flat-plate analogue. Roughness,
 *        curvature, transition, appendages and real boundary-layer state
 *        are not resolved. Screening-grade only.
 * REPLACE WHEN: CFD / tunnel / flight evidence provides a configuration-
 *        specific skin-friction estimate.
 * PROVENANCE: CALCULATED from geometry + REFERENCE screening correlation.
 */
export function ittcCf(re) {
  return 0.075 / Math.pow(Math.log10(re) - 2, 2);
}

/**
 * RECOVERY-CREDIT BOUND — 2026-08-12 (relabelled r2 #2)
 * WHAT:  S above 0.35 is EXPERIMENTAL; 0.15–0.35 sits at the current EAS
 *        recovery-credit bound; up to 0.15 is within published BLI results.
 *        The product floor derives from the bound's top: friction * (1-0.35).
 * WHY:   a design screen grounded in published full-ingestion axisymmetric
 *        BLI results — NOT a universal ceiling; the recoverable pool is
 *        configuration-dependent and energy dissipated upstream is gone.
 * PROVENANCE: REFERENCE ASSUMPTION (design screen, spec s3.4).
 * LIMITATION: S is claimed for the tail-CONDITIONED wake; Release 1's
 *        toggles are independent, so BLI-on/tail-off is generous (declared
 *        limitation, spec s3.2 — UI-level patch listed if ever wanted).
 * REPLACE WHEN: configuration-specific wake/recovery analysis exists.
 */
export const S_ZONE_PUBLISHED_MAX = 0.15;
export const S_ZONE_BOUND_MAX = 0.35;

/**
 * FUEL CHAIN — 2026-08-12
 * WHAT:  fuel-cell efficiency 0.60 x hydrogen LHV 33.33 kWh/kg
 *        -> e_eff = 19.998 kWh/kg of LH2, applied ONCE, downstream of S.
 * WHY:   the system boundary (spec s3.2, review r1 #9), AMENDED 2026-08-18:
 *        S is now PURELY the BLI / wake-recovery credit its slider zones
 *        always described. It no longer claims to span "everything between
 *        aerodynamic power and electrical demand" — that wording implied a
 *        net-of-losses term while the calibration fed it a gross credit,
 *        and the powertrain losses in that gap were silently worth 100%.
 *        PROPULSION_CHAIN_EFF now holds them explicitly. Nothing may be
 *        applied twice: aero -> [S] -> propulsive -> [chain] -> electrical
 *        -> [fuel cell] -> LH2, each factor appearing exactly once.
 * PROVENANCE: ENGINEERING INPUT (Appendix 2a; published LHV constant).
 * LIMITATION: no charge/boil-off/reserve margins in Release 1.
 * REPLACE WHEN: powertrain engineering supplies real chain figures.
 */
export const FUEL_CELL_EFF = 0.60;
export const H2_LHV_KWH_KG = 33.33;
export const E_EFF_J_PER_KG = FUEL_CELL_EFF * H2_LHV_KWH_KG * 3.6e6; // 71,992,800 J/kg

/**
 * PROPULSION CHAIN EFFICIENCY — 2026-08-18 (owner ruling; external review
 * finding, builder-confirmed)
 * WHAT:  electrical demand -> useful propulsive power (D x v). Inverter x
 *        motor x propulsor, as ONE declared factor. Sits BETWEEN S and the
 *        fuel chain: propulsive = (1-S) x D x v, electrical = propulsive /
 *        PROPULSION_CHAIN_EFF, and only then the 60% fuel cell.
 * WHY:   THE DEFECT THIS FIXES. Until now electrical demand WAS (1-S)Dv,
 *        which silently asserted a 100%-efficient motor, inverter and
 *        propulsor. The 60% fuel-cell figure does NOT cover this — it
 *        converts hydrogen to electricity, a different link entirely, and
 *        the old S comment said so ("the fuel chain sits outside it").
 *        Splitting the two also repairs an epistemic mismatch: S's
 *        definition claimed to span aero power to electrical demand (i.e.
 *        net of losses) while its slider ZONES were pure wake-recovery
 *        credit ("within published BLI results"). A user setting 27% from
 *        the BLI literature was therefore also, invisibly, claiming a
 *        perfect powertrain. S is now purely the BLI/wake term the zones
 *        always described, and its [0,1) validation is CORRECT rather
 *        than a limitation — a pure credit cannot be negative.
 * PROVENANCE: REFERENCE ASSUMPTION. Representative modern figures — motor
 *        ~97%, inverter ~98%, propulsor ~82% -> ~0.78. NOT a measured
 *        Sunship value, and deliberately not optimistic.
 * LIMITATION: a purpose-designed slow-turning large-diameter propulsor
 *        could beat it; duct and BLI installation losses could make it
 *        worse. One scalar cannot express an operating-point-dependent
 *        chain.
 * REPLACE WHEN: powertrain engineering supplies real chain figures — at
 *        which point this becomes an ENGINEERING INPUT by dated ruling.
 */
export const PROPULSION_CHAIN_EFF = 0.78;

/**
 * TANKAGE MASS FACTOR — 2026-08-12 (renamed from "storage efficiency", r1)
 * WHAT:  fuel system TOTAL = 5 x LH2 mass. A mass ratio, NOT an efficiency —
 *        nothing ever divides energy by it. Storage itself is 4x on top.
 * WHY:   "LH2 is great but the storage is what kills" — Appendix 2a anchors
 *        (~70 t LH2 / ~280 t tank).
 * PROVENANCE: REFERENCE ASSUMPTION.
 * LIMITATION: proportional model — a real tank is sized once for the design
 *        mission; a ship flying slower carries the same tank. Declared
 *        screening assumption, stated in the UI copy.
 * REPLACE WHEN: tank engineering provides real mass curves.
 */
export const TANKAGE_FACTOR = 5;

/**
 * REFERENCE TRIP + LIFT BUDGET + FUEL-MASS SCREEN — 2026-08-12/13
 * WHAT:  the fuel-mass PASS/FAIL screen runs at the declared 10,000 km
 *        reference. Budget anchors: gross lift 5,600 t, structure+systems
 *        500 t at 300 m. Bands: GREEN <= 500 t fuel system · ORANGE to
 *        1,000 t · RED above; payload <= 0 is always RED. No design-target
 *        annotation (Toby, 2026-08-13) — instead, the EAS-ideal preset
 *        (VISION 0.04/0.30 at 100 km/h -> ~338 t) simply LANDS near the
 *        published ~350 t figure by construction. Anchors AND bands scale
 *        by (L/300)^3 (r2 #8) so bands mean the same at every length.
 *        Future improvement lever: STORAGE (the tankage factor), not the
 *        fuel — "the fuel weighs what it weighs"; LH2 mass is physics once
 *        the energy is set, the 4x-on-top tank is engineering.
 * WHY:   absolute tonnes (Toby's ruling), not fractions of lift. GREEN
 *        relaxed 350 -> 500 (Toby, 2026-08-13): "technically that's okay —
 *        it's scale, you've got thousands of tons to work with"; both band
 *        edges are deliberately tunable config values.
 * PROVENANCE: REFERENCE ASSUMPTION (Appendix 2a anchors, hardcoded until the
 *        STATIC module provides real budgets; volumetric scaling is a
 *        declared screening assumption — structure will not truly obey L^3).
 * LIMITATION: DYNAMIC itself is distance-independent (rate-based contract);
 *        only this screen uses a distance, and it is labelled.
 * REPLACE WHEN: STATIC lands (budgets) / Toby retunes (RED line).
 */
// 10,000 → 9,000 (Toby ruling 2026-08-17): matched to the FLEET
// page's default trip so the two pages quote the same reference
// journey — pure relabel-and-rescale of the screening cells (the
// contract stays rate-based, §3.6); fuel-status thresholds
// deliberately UNCHANGED per the same ruling.
export const REF_TRIP_KM = 9000;
export const GROSS_LIFT_T_300 = 5600;
export const STRUCTURE_T_300 = 500;
export const FUEL_GREEN_MAX_T_300 = 500;   // relaxed from 350 (Toby, 2026-08-13; no annotation)
export const FUEL_ORANGE_MAX_T_300 = 1000; // tunable by design

/**
 * AERODYNAMIC DESIGN SCREEN — 2026-08-12
 * WHAT:  GREEN Cd <= 0.12 · ORANGE <= 0.22 · RED above. Equality inclusive
 *        on each band's top (0.12 is GREEN, 0.22 is ORANGE) — semantics
 *        frozen here per r4 (boundary fixtures, not inferred later).
 * WHY:   "current EAS aerodynamic design-screen thresholds" — modelling
 *        screens, not universal aerodynamic laws. Wording in the UI:
 *        "passes the current design screen", never "validated".
 * PROVENANCE: REFERENCE ASSUMPTION (set 2026-08, spec s8.1).
 * LIMITATION: judges the ship only; sphere 0.47 sits above the Sunship dial
 *        by design and can never be dialled there.
 * REPLACE WHEN: evidence-based screens exist.
 */
export const CD_GREEN_MAX = 0.12;
export const CD_ORANGE_MAX = 0.22;

/* ------------------------------------------------------------------ *
 * Status classifiers — exported so boundary/equality semantics are
 * directly testable (build amendment r4: "frozen now, not inferred").
 * ------------------------------------------------------------------ */

/** @returns {'GREEN'|'ORANGE'|'RED'} spec s8.1 */
export function aerodynamicStatus(cd) {
  if (cd <= CD_GREEN_MAX) return 'GREEN';
  if (cd <= CD_ORANGE_MAX) return 'ORANGE';
  return 'RED';
}

/** @returns {'published'|'bound'|'experimental'} spec s2 zones (inclusive tops) */
export function sEvidenceZone(s) {
  if (s <= S_ZONE_PUBLISHED_MAX) return 'published';
  if (s <= S_ZONE_BOUND_MAX) return 'bound';
  return 'experimental';
}

/**
 * Fuel-mass screen at the reference trip (spec s8.3, scale rule r2 #8).
 * @param {number} fuelSystemT  LH2 + tankage, tonnes, at the reference trip
 * @param {number} lengthM      ship length (scales budget and bands by (L/300)^3)
 * @returns {{status:'GREEN'|'ORANGE'|'RED', payloadT:number,
 *            greenMaxT:number, orangeMaxT:number}}
 */
export function fuelMassStatus(fuelSystemT, lengthM) {
  const k3 = Math.pow(lengthM / 300, 3);
  const payloadT = (GROSS_LIFT_T_300 - STRUCTURE_T_300) * k3 - fuelSystemT;
  const greenMaxT = FUEL_GREEN_MAX_T_300 * k3;
  const orangeMaxT = FUEL_ORANGE_MAX_T_300 * k3;
  let status = 'GREEN';
  if (payloadT <= 0 || fuelSystemT > orangeMaxT) status = 'RED';
  else if (fuelSystemT > greenMaxT) status = 'ORANGE';
  return { status, payloadT, greenMaxT, orangeMaxT };
}

/* ------------------------------------------------------------------ *
 * The one pure call.
 * ------------------------------------------------------------------ */

/**
 * Geometry + declared assumptions -> the complete section-9 result contract.
 *
 * @param {object} geometry  M1 record from measureDynamicsGeometry() — MUST
 *        carry units 'm' (send-back hardening: mesh-units are rejected so
 *        "17.4 mesh-units^2" can never be consumed as "17.4 m^2").
 * @param {object} cfg
 * @param {number} cfg.airspeedKmh          > 0
 * @param {number} cfg.cd                   active drag coefficient (frontal basis)
 * @param {number} cfg.s                    integrated systems saving, 0 <= s < 1
 * @param {string} [cfg.configurationId]    e.g. 'sunship/smartTailBLI'
 * @param {string} [cfg.scenario]           'CONSERVATIVE'|'REFERENCE'|'VISION'|'CUSTOM'
 * @param {string} [cfg.cdSource='user']    'estimated'|'authored'|'user' (origin, not a label)
 * @param {string} [cfg.sSource='user']     ditto
 * @param {string} [cfg.cdLabel='REFERENCE ASSUMPTION']  provenance label for Cd
 * @param {string} [cfg.sLabel='REFERENCE ASSUMPTION']   provenance label for S
 * @param {object|null} [cfg.estimate=null]  the cdEstimator.js frozen-API
 *        object for THIS geometry at THIS speed (M6 contract amendment,
 *        2026-08-16). Passthrough with shape validation — the engine never
 *        recomputes it here (the estimator is its own engine module) and
 *        the adapter never derives it (trust boundary). null = estimator
 *        dormant (parked) or not run; the page then behaves exactly as
 *        pre-M6. Contents are SEMANTICALLY validated per status (r12
 *        #1a). Identity guard (r12 #1b, honestly scoped): an estimate
 *        carrying provenance.inputs is checked against THIS call's
 *        exact geometry+speed; a foreign estimate without identity
 *        gets a friction-consistency screen only — that is all that
 *        is guaranteed for it.
 * @returns the spec s9 contract object (see shape-frozen snapshot fixture)
 */
export function computeDynamics(geometry, cfg) {
  // --- validation: hard-fail only where the calculation is undefined.
  // Finite-NUMBER checks, not mere > 0: JS coercion would otherwise accept
  // Infinity (nonsense downstream) and numeric strings (M2 send-back #3 —
  // the trust boundary rejects them before a DOM ever exists). ---
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  if (!geometry || geometry.units !== 'm') {
    throw new Error(`computeDynamics: geometry must be in metres (units 'm'), got '${geometry && geometry.units}'`);
  }
  const A = geometry.frontalArea;
  const wetted = geometry.wettedArea;
  const L = geometry.lengthM;
  if (!fin(A) || !(A > 0) || !fin(wetted) || !(wetted > 0) || !fin(L) || !(L > 0)) {
    throw new Error('computeDynamics: geometry record needs finite positive frontal/wetted/length');
  }
  const { airspeedKmh, cd, s } = cfg;
  if (!fin(airspeedKmh) || !(airspeedKmh > 0)) throw new Error(`computeDynamics: airspeedKmh must be a finite number > 0, got ${airspeedKmh}`);
  if (!fin(cd) || !(cd > 0)) throw new Error(`computeDynamics: cd must be a finite number > 0, got ${cd}`);
  if (!fin(s) || !(s >= 0 && s < 1)) throw new Error(`computeDynamics: s must be a finite number in [0, 1), got ${s}`);
  const frontalAreaSource = geometry.frontalAreaSource ?? 'computed';
  if (frontalAreaSource !== 'computed' && frontalAreaSource !== 'authored') {
    throw new Error(`computeDynamics: frontalAreaSource must be 'computed' or 'authored', got '${frontalAreaSource}'`);
  }
  // M6 amendment (2026-08-16, discharges review r7 #5): wetted area enters
  // the PUBLISHED contract — the page must read it here, never from the
  // geometry record directly (FLEET consumes only this object).
  const wettedSource = geometry.wettedSource ?? 'mesh';
  if (wettedSource !== 'mesh' && wettedSource !== 'hull-fallback') {
    throw new Error(`computeDynamics: wettedSource must be 'mesh' or 'hull-fallback', got '${wettedSource}'`);
  }
  // Volume (contract amendment 2026-08-16, owner request — CdA + Cd_v):
  // OPTIONAL, because raw records predating the amendment lack it.
  // When present it must be physical; when absent the volumetric
  // coefficient is null, never invented.
  const volume = geometry.volume ?? null;
  if (volume !== null && (!fin(volume) || !(volume > 0))) {
    throw new Error(`computeDynamics: geometry.volume must be a finite number > 0 or null, got ${volume}`);
  }
  // Owner ruling 2026-08-16 (r17 Part B (h)): volume is ALWAYS the
  // convex envelope's — one meaning, one ruled label. 'mesh' and
  // 'hull-fallback' are rejected so the two meanings can never be
  // silently mixed under one Cd_v number (the reviewer's rule).
  const volumeSource = volume === null ? 'unavailable' : (geometry.volumeSource ?? 'convex-envelope');
  if (volume !== null && volumeSource !== 'convex-envelope') {
    throw new Error(`computeDynamics: volumeSource must be 'convex-envelope' (owner ruling 2026-08-16), got '${volumeSource}'`);
  }
  // M6 amendment: estimator echo — SEMANTIC validation (hardened per
  // review r12 #1a: key-and-status checking alone accepted a six-key
  // object with band:null under status 'ok', which then crashed the
  // renderer — the trust boundary must reject malformed CONTENTS, not
  // just malformed envelopes). For 'ok': finite Cd terms, a two-number
  // finite band bracketing the estimate, sum consistency, provenance
  // object. For 'unavailable': the ruled null pattern with a real
  // friction floor (§5.5 — the dial bottom survives).
  const ESTIMATE_KEYS = '["band","cdEstimate","frictionCd","pressureCd","provenance","status"]';
  const estimate = cfg.estimate ?? null;
  if (estimate !== null) {
    const bad = (why) => { throw new Error(`computeDynamics: cfg.estimate invalid — ${why}`); };
    if (typeof estimate !== 'object' || JSON.stringify(Object.keys(estimate).sort()) !== ESTIMATE_KEYS) {
      bad('must be a cdEstimator frozen-API object (or null)');
    }
    if (typeof estimate.provenance !== 'object' || estimate.provenance === null || Array.isArray(estimate.provenance)) {
      bad('provenance must be a plain object (arrays rejected — r12 re-review)');
    }
    if (estimate.status === 'ok') {
      const { cdEstimate: e, frictionCd: f, pressureCd: p, band } = estimate;
      if (!fin(e) || !fin(f) || !fin(p)) bad("status 'ok' requires finite cdEstimate/frictionCd/pressureCd");
      // Physical domain (r12 re-review residual: finiteness is not
      // physicality — a negative-Cd estimate must die HERE with a clear
      // message, not later as a confusing cd rejection): friction is
      // strictly positive by construction (ITTC × positive areas),
      // pressure is ≥ 0 by the clamped calibration, so their sum is > 0.
      if (!(e > 0) || !(f > 0) || !(p >= 0)) {
        bad("status 'ok' requires cdEstimate > 0, frictionCd > 0, pressureCd >= 0");
      }
      if (!Array.isArray(band) || band.length !== 2 || !fin(band[0]) || !fin(band[1])) {
        bad("status 'ok' requires band = [lo, hi], both finite");
      }
      if (!(band[0] <= e && e <= band[1])) bad('band must bracket cdEstimate');
      if (Math.abs(e - (f + p)) > 1e-9 * Math.max(1, Math.abs(e))) bad('cdEstimate must equal frictionCd + pressureCd');
    } else if (estimate.status === 'unavailable') {
      if (estimate.cdEstimate !== null || estimate.pressureCd !== null || estimate.band !== null) {
        bad("status 'unavailable' requires cdEstimate/pressureCd/band all null");
      }
      if (!fin(estimate.frictionCd) || !(estimate.frictionCd > 0)) {
        bad("status 'unavailable' still requires a finite positive frictionCd (the dial bottom survives)");
      }
    } else {
      bad(`status must be 'ok' or 'unavailable', got '${estimate.status}'`);
    }
  }

  const {
    configurationId = 'custom',
    scenario = 'CUSTOM',
    cdSource = 'user',
    sSource = 'user',
    cdLabel = 'REFERENCE ASSUMPTION',
    sLabel = 'REFERENCE ASSUMPTION',
  } = cfg;

  const warnings = [...(geometry.warnings || [])];

  // --- the physics chain (spec s3) ---
  const v = airspeedKmh / 3.6;                       // m/s
  const dragN = 0.5 * RHO_KG_M3 * cd * A * v * v;    // freezeframe force
  const powerNoCreditW = dragN * v;                  // = 0.5 rho Cd A v^3 exactly
  const powerW = (1 - s) * powerNoCreditW;           // PROPULSIVE power, flat S
  // 2026-08-18: the chain is now explicit. powerW is what the ship needs AT
  // THE PROPULSOR; electricalW is what the busbar must deliver to produce
  // it. Fuel derives from ELECTRICAL, never from propulsive — that
  // conflation is the defect PROPULSION_CHAIN_EFF exists to fix.
  const electricalW = powerW / PROPULSION_CHAIN_EFF;

  const secondsPer1000km = 1e6 / v;
  const energyPer1000kmJ = electricalW * secondsPer1000km;
  const fuelPer1000kmKg = energyPer1000kmJ / E_EFF_J_PER_KG;

  const refTripFuelT = (fuelPer1000kmKg * (REF_TRIP_KM / 1000)) / 1000;
  const refTripFuelSystemT = refTripFuelT * TANKAGE_FACTOR;
  const refTripDays = REF_TRIP_KM / airspeedKmh / 24;

  // --- per-shape floors (spec s3.4, s5.1) ---
  const re = (v * L) / NU_M2_S;
  const frictionCd = ittcCf(re) * (wetted / A);           // Cd slider bottom for this shape
  const productFloor = frictionCd * (1 - S_ZONE_BOUND_MAX); // derived screening floor ~0.006
  // Either floor breach is RED (M2 send-back #1): the authority says Cd may
  // not be CLAIMED below the friction estimate — the RED state is the only
  // home for below-floor states, whichever floor failed. Distinct warnings
  // explain which.
  const product = cd * (1 - s);
  const cdFloorBreach = cd < frictionCd;
  const productFloorBreach = product < productFloor;
  const floorStatus = cdFloorBreach || productFloorBreach ? 'RED' : 'OK';
  if (productFloorBreach) {
    warnings.push('below-screening-floor: Cd x (1-S) is under the derived floor — outputs flagged, not hidden');
  }
  if (cdFloorBreach) {
    warnings.push('cd-below-friction-estimate: claimed Cd is under this shape\'s skin-friction screening estimate');
  }
  // Estimate consistency guard (M6; hardened per review r12 #1b — the
  // friction comparison alone is NOT an identity check: a different
  // geometry with the same length and wetted/frontal ratio produces
  // identical friction and slipped through). Two tiers, honestly
  // scoped: (1) when the estimate carries its input identity
  // (provenance.inputs — the engine's own estimateCd always emits it),
  // the ACTUAL inputs are compared, exactly; (2) without identity, the
  // friction-consistency check is the best available screen and is all
  // that is guaranteed for foreign estimate objects.
  if (estimate !== null) {
    const inputs = estimate.provenance.inputs;
    if (inputs && typeof inputs === 'object') {
      if (inputs.frontalAreaM2 !== A || inputs.wettedAreaM2 !== wetted
        || inputs.lengthM !== L || inputs.airspeedKmh !== airspeedKmh) {
        warnings.push('estimate-identity-mismatch: echoed estimate was computed for different geometry or speed');
      }
    } else if (Number.isFinite(estimate.frictionCd)
      && Math.abs(estimate.frictionCd - frictionCd) > 1e-6 * frictionCd) {
      warnings.push('estimate-friction-mismatch: echoed estimate friction does not match this geometry+speed (no input identity attached — consistency screen only)');
    }
  }

  // --- statuses (spec s8) ---
  const fuel = fuelMassStatus(refTripFuelSystemT, L);

  return {
    // identity — a VISION screenshot must self-identify (r1 #10)
    configurationId,
    scenario,
    // inputs with origin metadata (origin is not a provenance label)
    selectedCd: cd,
    cdBasis: 'convex projected frontal area, declared flow axis',
    cdSource,
    selectedS: s,
    sSource,
    sEvidenceZone: sEvidenceZone(s),
    // geometry echo — orientation drives A drives everything
    orientationAxis: geometry.flightAxis,
    frontalAreaM2: A,
    frontalAreaSource, // passthrough (M2 send-back #2): M1 records are 'computed'; Phase B's preset catalogue augments records with 'authored'
    wettedAreaM2: wetted,   // M6 amendment 2026-08-16 (r7 #5): via the contract, never the raw record
    wettedSource,           // 'mesh' | 'hull-fallback' — the trust decision travels with the number
    // Contract amendment 2026-08-16 (owner request): comparison metrics.
    // dragAreaM2 = Cd × A — the ungameable absolute-drag footprint
    // (proportional to fuel at fixed speed, immune to reference-area
    // choice). cdVolumetric = CdA / V^(2/3) — the classic airship basis
    // (TR-397's 0.02x-class figures), drag priced against carried
    // volume: the aerodynamic sibling of VE. Null when the geometry
    // record carries no trusted volume — never invented.
    volumeM3: volume,
    volumeSource,
    dragAreaM2: cd * A,
    cdVolumetric: volume !== null ? (cd * A) / Math.pow(volume, 2 / 3) : null,
    shipLengthM: L,
    airspeedKmh,
    // the chain
    dragN,
    powerNoCreditMW: powerNoCreditW / 1e6,
    powerMW: powerW / 1e6,
    // NEW 2026-08-18: the busbar figure. powerMW is propulsive (unchanged,
    // so every existing caller and label stays truthful); electricalMW is
    // what the powertrain must actually deliver, and is what fuel derives
    // from. The DYNAMIC page currently displays powerMW under "Propulsion
    // power" — still correct — but electricalMW is the number that sizes
    // the powertrain, and is a candidate for the display (owner ruling).
    electricalMW: electricalW / 1e6,
    propulsionChainEff: PROPULSION_CHAIN_EFF,
    energyPer1000kmMWh: energyPer1000kmJ / 3.6e9,
    fuelPer1000kmT: fuelPer1000kmKg / 1000,
    // reference-trip screen values (labelled: the ONLY distance in DYNAMIC)
    refTripFuelT,
    refTripFuelSystemT,
    refTripDays,
    // per-shape floors — the UI's dial bottom and RED state (spec s5.3, s8.2)
    frictionCd,
    productFloor,
    // the Cd estimator's proposal (M6, 2026-08-16) — frozen API echo or
    // null (dormant/not run). The marker+band the page draws come from
    // HERE; the slider's Cd stays selectedCd (estimator proposes,
    // slider disposes).
    estimate,
    // statuses
    aerodynamicStatus: aerodynamicStatus(cd),
    floorStatus,
    fuelMassStatus: fuel.status,
    payloadT: fuel.payloadT,
    // provenance — a derived value is never CALCULATED alone (spec s10.2)
    provenance: {
      summary: `CALCULATED from Cd [${cdLabel}] and S [${sLabel}]`,
      cdLabel,
      sLabel,
      constants: 'see five-field comments in dynamicsCore.js',
    },
    warnings,
  };
}
