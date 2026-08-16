/**
 * Cd ESTIMATOR — calibration + the frozen M6 API.
 *
 * Graduated 2026-08-16 (M6 stage 1) from `spike/sectional/calibration.mjs`
 * (calibration vNEXT, RATIFIED by Toby 2026-08-16) after reviews r9-r11
 * and the TN-614 blind exam. Spike record: `spike/sectional/RESULTS.md`;
 * `spike/sectional/tn614.mjs` is the FROZEN historical blind-exam
 * artifact. Implements DYNAMIC-SPEC §5 (M6 amendments 2026-08-16:
 * sectional implementation supersedes §5.1's descriptor wording).
 *
 * THE FROZEN API SEAM (r8, implementation-agnostic — page, contract and
 * fixtures bind HERE; the implementation behind it is swappable):
 *
 *   { cdEstimate, frictionCd, pressureCd, band, status, provenance }
 *
 *   cdEstimate = frictionCd + pressureCd   (frontal basis, like every Cd
 *                                           in the engine)
 *   frictionCd = ITTC-1957 × wetted/frontal at the vehicle's Re
 *                (dynamicsCore's own line — computed, never estimated)
 *   pressureCd = monotone calibration of the sectional geometric proxy
 *   band       = [0.8, 1.2] × cdEstimate — see BAND_FRACTION ruling below
 *   status     = 'ok' | 'unavailable' — estimator failure can never break
 *                the page (§5.5); unavailable means the page falls back
 *                to the manual slider, exactly as before M6
 *   provenance = method + calibration knot provenance + geometry quality
 *
 * Estimator proposes, slider disposes (§5.3, Q8) — nothing here ever
 * forces a value; the page decides what to do with the proposal.
 */

import { measureSections, scoreSections } from './sections.js';
import { ittcCf, NU_M2_S } from './dynamicsCore.js';

/**
 * SCREENING BAND — ±20%, VISUAL-ONLY — 2026-08-16 (FINAL RULING, Toby;
 * supersedes §5.3's ±50% and the interim ±25% convergence of r11)
 * WHAT:  band = [(1 − 0.20), (1 + 0.20)] × cdEstimate, drawn VISUALLY
 *        around the marker on the Cd slider. NO public wording of any
 *        kind — not "screening range", not "accuracy", nothing. The
 *        band claims nothing in language, which is its own defence.
 * WHY:   the estimate is an INITIALIZER for an editable slider, not a
 *        prediction with stated confidence. Evidence under the smooth-
 *        body class: TN-614 blind ordering near-perfect; calibration
 *        vNEXT non-knot family members within 0-3% (within-family
 *        regression, r11 #1). Reviewer counsel of ±25% is ON RECORD
 *        (r11 #7); owner ruled 20 with the no-words form 2026-08-16.
 * PROVENANCE: OWNER RULING 2026-08-16 (rationale lives HERE, in code,
 *        by explicit instruction — never in UI copy).
 * LIMITATION: a declared engineering screen width, NOT a statistical
 *        confidence interval; unvalidated outside the smooth-body class
 *        and the synthetic bluff anchors.
 * REPLACE WHEN: TR-397 (independent exam, rules frozen pre-exam) and
 *        successors justify a dated re-ruling — the band narrowing on
 *        evidence IS the §5.3 promise rendered.
 */
export const BAND_FRACTION = 0.20;

/**
 * MESH-QUALITY GATE — 2026-08-16 (M6 graduation)
 * WHAT:  oddFraction (rays crossing an odd number of surfaces ÷ rays
 *        hitting anything — sections.js quality record) above 0.10 →
 *        status 'unavailable'. Below it, the estimate stands and the
 *        fraction is reported in provenance.
 * WHY:   parity damage means the solid-interval reading is untrustworthy
 *        (r9 #7 / r10 #1: damage is COUNTED, never silently dropped).
 *        Reference points: clean closed meshes ≈ 0.000-0.02; a sphere
 *        with a third of its faces deleted ≈ 0.49; cube + open sheet
 *        ≈ 1.0. The gate sits well clear of clean-mesh noise and well
 *        under demonstrated damage.
 * PROVENANCE: REFERENCE ASSUMPTION (invented screening threshold,
 *        2026-08-16) — not physics, and it doesn't pretend to be.
 * LIMITATION: a mesh can be geometrically wrong yet parity-clean; this
 *        catches broken surfaces, not wrong shapes.
 * REPLACE WHEN: real upload traffic shows where the line should sit.
 */
export const ODD_FRACTION_MAX = 0.10;

/**
 * CALIBRATION KNOTS (proxy → pressure Cd), monotone piecewise-linear,
 * clamped — calibration vNEXT, RATIFIED 2026-08-16.
 *
 * WHAT:  four knots, PINNED at the exact values the frozen generator
 *        code produces (same pin-the-measurement pattern as the Sunship
 *        wetted 206,795 m²). A regeneration fixture rebuilds every knot
 *        from its source mesh and asserts equality — the constants can
 *        never silently drift from the code that defines them.
 * WHY:   production must not depend on spike shape generators, and the
 *        knots ARE data with provenance, not code.
 * KNOT PROVENANCE (each: proxy = compositeV1 of the source mesh;
 *        pressure = published/measured total − ITTC friction for that
 *        same mesh at its declared Re):
 *   [0] TN-614 form 111 — REAL DATA (NACA TN-614, 1937, measured CD_A
 *       0.0401 at effective Re 66e6; frontal basis per its Table III).
 *       The family's sharp-tail extreme. Promoted 2026-08-16.
 *   [1] TN-614 form 332 — REAL DATA (measured CD_A 0.0508, ditto).
 *       Full-tail extreme. Promoted 2026-08-16.
 *   [2] Sphere — textbook 0.47 frontal at the declared reference
 *       condition (100 m body, 100 km/h → Re ≈ 1.85e8). A reference
 *       point, not an invariant (§5.2).
 *   [3] Bluff pooled — cube (1.05) + plate (1.17) aggregated into one
 *       knot (r9 #1: near-coincident knots pool, as isotonic fitting
 *       does; both proxies are exactly 1.0).
 *   RETIRED FOR CAUSE: the synthetic teardrop knot (2026-08-16) — its
 *       textbook total (0.045) hid a regime-fuzzy friction/pressure
 *       split that poisoned the streamlined segment (TN-614 exam 1:
 *       +132/+187% on full tails). A real fineness-3 body now PREDICTS
 *       ≈ 0.024 total at high Re — plausible, not validated (r11 #4).
 * LIMITATION: two real knots from ONE 1937 family + two textbook bluff
 *        anchors; within-family interpolation evidence only (r11 #1).
 * REPLACE WHEN: TR-397 (exam rules frozen pre-exam) or later corpora
 *        justify new real-data knots — by dated ruling.
 */
export const CALIBRATION_KNOTS = [
  [0.017428445146842095, 0.008064854637311485], // TN614-111 (real, 2026-08-16)
  [0.1807885483529704, 0.012339438608540539],   // TN614-332 (real, 2026-08-16)
  [0.8156212975892966, 0.46236007570000226],    // sphere (textbook)
  [1, 1.102057610424577],                        // bluff: cube+plate pooled (textbook)
];

export const CALIBRATION_PROVENANCE = [
  'TN614-111 (real, 2026-08-16)',
  'TN614-332 (real, 2026-08-16)',
  'sphere (textbook)',
  'bluff pooled (textbook)',
];

/**
 * Proxy → pressure Cd. Monotone piecewise-linear over the knots; linear
 * from the origin below the first knot (a proxy of 0 is a perfectly
 * recovered closure — no pressure drag); CLAMPED flat above the top knot
 * (r9 #1: no extrapolation). Non-finite input → NaN: estimate-
 * unavailable, never a plausible bluff Cd (r10 #4).
 */
export function calibratePressure(x) {
  const knots = CALIBRATION_KNOTS;
  if (!Number.isFinite(x)) return NaN;
  if (x <= knots[0][0]) return Math.max(0, knots[0][1] * (x / knots[0][0] || 0));
  for (let i = 0; i + 1 < knots.length; i++) {
    if (x <= knots[i + 1][0]) {
      const t = (x - knots[i][0]) / (knots[i + 1][0] - knots[i][0]);
      return knots[i][1] + t * (knots[i + 1][1] - knots[i][1]);
    }
  }
  return knots[knots.length - 1][1];
}

/**
 * STEP 1 (expensive, cacheable): measure the mesh's sectional proxy.
 *
 * ~50-130 ms/mesh single-threaded on the dev machine (r11 #10 wording) —
 * run once per shape+orientation and cache; the per-speed step below is
 * microseconds. Never throws on bad geometry: a mesh the measurement
 * cannot read returns a non-finite proxy, which estimateCd() maps to
 * status 'unavailable' (§5.5 — the estimator can never break the page).
 *
 * @param {number[][]} verts
 * @param {number[][]} faces
 * @param {object} [opts]
 * @param {string} [opts.axis='+Z']  SIGNED flow direction (sections.js
 *        ruling; '+Z' is the Sunship's validated flight direction and
 *        the upstream default orientation)
 * @returns {{ proxy:number, scores:object|null, quality:object|null,
 *             axis:string, ms:number }}  proxy is NaN when unreadable
 */
export function measureSectionalProxy(verts, faces, { axis = '+Z' } = {}) {
  const t0 = performance.now();
  try {
    if (!Array.isArray(verts) || verts.length < 3 || !Array.isArray(faces) || faces.length === 0) {
      return { proxy: NaN, scores: null, quality: null, axis, ms: performance.now() - t0 };
    }
    const m = measureSections(verts, faces, { axis });
    const scores = scoreSections(m);
    const proxy = m.quality.oddFraction > ODD_FRACTION_MAX ? NaN : scores.compositeV1;
    return { proxy, scores, quality: m.quality, axis, ms: performance.now() - t0 };
  } catch {
    return { proxy: NaN, scores: null, quality: null, axis, ms: performance.now() - t0 };
  }
}

/**
 * STEP 2 (cheap, per-speed): proxy + M1 geometry + speed → the frozen
 * API object. The friction term moves (logarithmically) with speed and
 * length; the pressure term is pure shape — so the marker drifts gently
 * as speed changes, exactly like the slider's friction-floor bottom.
 *
 * @param {{proxy:number, quality:object|null, axis:string}} proxyRecord
 *        from measureSectionalProxy()
 * @param {object} geometry  M1 record from measureDynamicsGeometry() —
 *        units MUST be 'm' (same trust boundary as computeDynamics);
 *        friction uses the record's TRUSTED wetted area (hull-fallback
 *        already applied upstream, never re-derived here)
 * @param {number} airspeedKmh  > 0 — the engine stays strict; parked
 *        dormancy is a UI-level state (M3 seal untouched)
 * @returns {{ cdEstimate:number|null, frictionCd:number,
 *             pressureCd:number|null, band:[number,number]|null,
 *             status:'ok'|'unavailable', provenance:object }}
 */
export function estimateCd(proxyRecord, geometry, airspeedKmh) {
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  if (!geometry || geometry.units !== 'm') {
    throw new Error(`estimateCd: geometry must be in metres (units 'm'), got '${geometry && geometry.units}'`);
  }
  const A = geometry.frontalArea, wetted = geometry.wettedArea, L = geometry.lengthM;
  if (!fin(A) || !(A > 0) || !fin(wetted) || !(wetted > 0) || !fin(L) || !(L > 0)) {
    throw new Error('estimateCd: geometry record needs finite positive frontal/wetted/length');
  }
  if (!fin(airspeedKmh) || !(airspeedKmh > 0)) {
    throw new Error(`estimateCd: airspeedKmh must be a finite number > 0, got ${airspeedKmh}`);
  }

  const v = airspeedKmh / 3.6;
  const re = (v * L) / NU_M2_S;
  const frictionCd = ittcCf(re) * (wetted / A);

  const pressureCd = calibratePressure(proxyRecord ? proxyRecord.proxy : NaN);
  const quality = proxyRecord && proxyRecord.quality ? proxyRecord.quality : null;
  const provenance = {
    label: 'ESTIMATED',
    method: 'low-order sectional geometric screening estimator (M6, 2026-08-16)',
    calibration: CALIBRATION_PROVENANCE,
    axis: proxyRecord ? proxyRecord.axis : null,
    oddFraction: quality ? quality.oddFraction : null,
  };

  if (!Number.isFinite(pressureCd)) {
    // §5.5: the manual-slider fallback state. frictionCd is still real —
    // it is geometry, not estimation — so the dial bottom survives.
    return { cdEstimate: null, frictionCd, pressureCd: null, band: null, status: 'unavailable', provenance };
  }

  const cdEstimate = frictionCd + pressureCd;
  return {
    cdEstimate,
    frictionCd,
    pressureCd,
    band: [cdEstimate * (1 - BAND_FRACTION), cdEstimate * (1 + BAND_FRACTION)],
    status: 'ok',
    provenance,
  };
}
