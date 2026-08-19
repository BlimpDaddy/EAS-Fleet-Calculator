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
 *   frictionCd = (ITTC-1957 smooth line + ITTC-1978 roughness allowance)
 *                × wetted/frontal at the vehicle's Re
 *                (dynamicsCore's own skinFrictionCd — computed, never
 *                estimated). AMENDED 2026-08-19: the roughness allowance
 *                is new; before it, this seam modelled a perfectly smooth
 *                skin by omission.
 *
 *   CONSEQUENCE OF THE ALLOWANCE, and it is NOT a bug — read before
 *   "fixing" it: the pressure knots are derived as (measured total
 *   − SMOOTH ITTC friction at the measurement Re), from polished
 *   wind-tunnel models. They are unchanged and stay internally
 *   consistent. But frictionCd now carries a real-skin term the models
 *   did not have, so the estimator deliberately returns MORE than the
 *   measured smooth total for an anchor body — e.g. the sphere-HR anchor
 *   at its 100 m / 100 km/h reference condition estimates ~0.1% above
 *   Achenbach's 0.19. A real 100 m sphere with a 0.43 mm skin genuinely
 *   does have more drag than a polished tunnel model. The knot is the
 *   PRESSURE anchor; the allowance is the SKIN. Both are pinned by
 *   fixtures.
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

/* The ?v= on engine-internal imports is the CACHE STAMP (2026-08-18).
 * Relative imports do NOT inherit the importer's query string, so a
 * stamped entry point alone still lets a returning browser pair fresh
 * callers with a stale './dynamicsCore.js' — which shipped, and read
 * 58.4 t of LH2 instead of 74.9 t (exactly the 0.78 chain efficiency
 * the cached engine predated). Delivery metadata in physics source is
 * ugly and was accepted with eyes open: the alternative (_headers) was
 * deployed and Cloudflare Pages ignored it. RULE: bump the stamp in
 * EVERY engine file on any release that changes any engine file. */
import { measureSections, scoreSections } from './sections.js?v=1.14';
import { skinFrictionCd, NU_M2_S } from './dynamicsCore.js?v=1.14';

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
 * TWO-LINE MECHANISM-AWARE CALIBRATION — GRADUATED 2026-08-16 from
 * spike/sectional/calibration-hr2..hr4.mjs after reviews r15–r19
 * (r19: PASS-CONDITIONAL, conditions applied same day; reviewer's
 * closing words: "The estimator chapter can close"). Full science
 * record: spike/sectional/RESULTS.md.
 *
 * WHAT:  bodies are CLASSIFIED by separation mechanism, then priced on
 *        one of two monotone lines sharing the streamlined pair:
 *        - ROUNDED (drag-crisis class — smooth aft closure): TN-614
 *          pair + sphere-HR knot (Achenbach 1972 smooth-sphere
 *          transcritical 0.19, literature grade, smooth-equivalent
 *          reference at the declared Re ≈ 1.85e8) + CLAMP above.
 *        - PINNED (fixed separation — faces, flat bases, re-expansion,
 *          sharp aft shoulders): the vNEXT map above, VERBATIM. No
 *          crisis rescue; conservative screening; can never flatter.
 *        Invariant (fixtured): rounded ≤ pinned everywhere — the
 *        branch only ever WITHHOLDS the discount.
 * WHY:   r15/r16 established the old single line mixed subcritical
 *        bluff anchors into a high-Re map (sphere 0.47 is the
 *        marble-scale value; at vehicle Re a smooth sphere is ~0.19)
 *        and that one scalar cannot identify the mechanism (r16's
 *        flat-front 0.778 vs Sunship 0.770 — same proxy, opposite
 *        physics).
 * PROVENANCE: knots pinned from the frozen candidate generators
 *        (regeneration fixture asserts equality, as vNEXT's does).
 * LIMITATION: the middle of the rounded line is interpolation between
 *        validated-ish endpoints (declared screening); the pinned
 *        line's middle is conservative screening (unchanged since
 *        vNEXT). See the classifier's declared detection limit below.
 * REPLACE WHEN: regime-consistent high-Re rounded-body data arrives —
 *        by dated ruling (parked at r19).
 */
export const ROUNDED_KNOTS = [
  [0.017428445146842095, 0.008064854637311485], // TN614-111 (real, shared)
  [0.1807885483529704, 0.012339438608540539],   // TN614-332 (real, shared)
  [0.8156212975892966, 0.18236007570000232],    // sphere-HR (Achenbach 1972 transcritical 0.19 − ITTC friction @ REF; literature grade)
];
export const ROUNDED_PROVENANCE = [
  'TN614-111 (real, 2026-08-16)',
  'TN614-332 (real, 2026-08-16)',
  'sphere-HR (Achenbach 1972 transcritical 0.19, literature grade)',
  'clamped above the sphere knot (declared; E2 oblate markers within ~10–20%)',
];

/**
 * vRE — Re-AWARE ROUNDED-CLASS PRESSURE (owner order 2026-08-17:
 * "it's supposed to estimate the shape at the size at the speed").
 * Completes the reserved pressure(proxy, Re) seam (r16/r19) with the
 * evidence the reviewers demanded — every knot below is MEASURED:
 *
 * The rounded class is the only one whose pressure moves with Re (the
 * drag crisis). Its Cd(Re) family = subcritical plateau → crisis →
 * transcritical level, so the model is a BLEND between two measured
 * maps, not per-shape curves:
 *  - SUBCRITICAL line (small/slow — Re_d below the crisis):
 *    streamlined pair (shared; streamlined bodies have no crisis —
 *    the lines converge below proxy ~0.18, declared) · E2 prolate
 *    1923 measured subcritical total 0.269 at Re_d 44k (pressure =
 *    total − ITTC at its measurement Re — the ledger's standard knot
 *    method; ITTC is turbulent-line at transitional Re, declared) ·
 *    SPHERE SUBCRITICAL — the ORIGINAL vNEXT knot (0.462 pressure
 *    from textbook 0.47), which was never wrong, only mis-regimed;
 *    it returns here as the measured subcritical anchor · E2 oblate
 *    plateau 0.58 at proxy 0.894. Clamped above.
 *  - HIGH line: the graduated ROUNDED_KNOTS above (unchanged).
 *  - BLEND: smoothstep in log10(Re_d) across the DECLARED window
 *    [2.5e5, 8e5] on the body's EQUIVALENT DIAMETER
 *    (D_eq = √(4·frontal/π)) — centred on Achenbach's measured
 *    sphere crisis (3.7e5), width ~half a decade. One declared
 *    knob pair; per-shape crisis location is the documented
 *    limitation (bluffer/rougher bodies transition earlier — the
 *    window is the class reference, the transition zone is the
 *    lowest-confidence region).
 * PINNED class: Re-flat (edges fix separation) — untouched.
 * STREAMLINED: friction already carries their Re — untouched.
 * PENDING: external review (r20) — built on owner order, honest
 * fixtures below; the sealed high-Re validation is unchanged (at
 * vehicle Re the blend is exactly the high line, fixtured).
 */
export const SUBCRITICAL_ROUNDED_KNOTS = [
  [0.017428445146842095, 0.008064854637311485], // TN614-111 (shared)
  [0.1807885483529704, 0.012339438608540539],   // TN614-332 (shared)
  [0.597, 0.213],                                // E2 prolate subcritical (1923 measured 0.269 @ Re_d 44k − ITTC)
  [0.8156212975892966, 0.46236007570000226],    // sphere SUBCRITICAL — the original vNEXT knot, re-regimed home
  [0.894, 0.559],                                // E2 oblate subcritical plateau (0.58 − ITTC)
];
export const CRISIS_WINDOW_RED = [2.5e5, 8e5]; // equivalent-diameter Re, declared (Achenbach centre 3.7e5)

function lineAt(knots, x) {
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

/** Crisis blend factor: 0 = fully subcritical, 1 = fully high-Re. */
export function crisisBlend(reD) {
  if (!Number.isFinite(reD) || reD <= 0) return 1; // no diameter info → high line (the pre-vRE behaviour)
  const [lo, hi] = CRISIS_WINDOW_RED;
  const t = (Math.log10(reD) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c); // smoothstep
}

/**
 * MECHANISM CLASSIFIER — four scorer-native triggers, any → 'pinned'
 * (r16 finding #3 through r19; each threshold sits in a measured gap):
 *  (a) fore-dominance (softFore > softAft): face-like front.
 *  (b) terminal base > TAU at the last OCCUPIED station: chopped/flat
 *      aft (TAU 0.05 — smooth closers ≤0.008, mildest chopped 0.181;
 *      first draft 0.20 sat inside the population, caught by fixtures,
 *      moved on record).
 *  (c) re-expansion (softAftRaw/softAft > REEXPANSION 1.15): a wake
 *      trapped mid-body (the r9 neck adversary; smooth bodies = 1.000
 *      exactly).
 *  (d) aft shoulder (shoulderAngleScore > SHOULDER_ANGLE_MAX 0.13):
 *      tangent-angle jump × affected-area fraction on the aft
 *      envelope, at the PINNED metrology configuration below.
 * DECLARED DETECTION LIMIT (r19 ACCEPTED): validated catch region =
 *      ~26° or sharper abrupt aft breaks at ≥~70% of max radius at
 *      these settings; detection improves with severity/radius but
 *      deeper corners are NOT guaranteed (the smooth-body floor is
 *      dominated by real mesh faceting — a coarse mesh genuinely
 *      contains corners; raster resolution contributes a smaller
 *      residual). Residual risk declared, not quantified
 *      aerodynamically. The limit belongs to THIS configuration —
 *      metrology-pin fixture in the battery.
 */
export const CLASSIFIER_TAU = 0.05;
export const CLASSIFIER_REEXPANSION = 1.15;
export const SHOULDER_ANGLE_MAX = 0.13;
export const SHOULDER_OPTS = Object.freeze({ kFrac: 48, smoothW: 3 });

/** Angle-based shoulder score (vHR4, r18-prescribed, r19-accepted). */
export function shoulderAngleScore(m, { kFrac, smoothW } = SHOULDER_OPTS) {
  const { A, L, cell } = m;
  const N = A.length, dx = L / N;
  const r = Array.from(A, (a) => Math.sqrt(Math.max(a, 0) * cell * cell / Math.PI));
  const rMax = Math.max(...r);
  if (!(rMax > 0)) return 0;
  const iMax = r.indexOf(rMax);
  const env = r.slice();
  for (let i = N - 2; i >= iMax; i--) env[i] = Math.max(env[i], env[i + 1]);
  const sm = env.slice();
  if (smoothW >= 3) {
    const h = Math.floor(smoothW / 2);
    for (let i = Math.max(iMax, h); i < N - h; i++) {
      let s = 0;
      for (let d = -h; d <= h; d++) s += env[i + d];
      sm[i] = s / (2 * h + 1);
    }
  }
  const k = Math.max(2, Math.round(N / kFrac));
  let score = 0;
  for (let j = iMax; j + 2 * k < N; j++) {
    const th1 = Math.atan((sm[j] - sm[j + k]) / (k * dx));
    const th2 = Math.atan((sm[j + k] - sm[j + 2 * k]) / (k * dx));
    const jump = th2 - th1;
    if (jump <= 0) continue;
    const w = (sm[j + k] / rMax) ** 2;
    if (jump * w > score) score = jump * w;
  }
  return score;
}

/**
 * Proxy → pressure Cd. Monotone piecewise-linear over the knots; linear
 * from the origin below the first knot (a proxy of 0 is a perfectly
 * recovered closure — no pressure drag); CLAMPED flat above the top knot
 * (r9 #1: no extrapolation). Non-finite input → NaN: estimate-
 * unavailable, never a plausible bluff Cd (r10 #4).
 */
export function calibratePressure(x, cls = 'pinned', reD = undefined) {
  // Graduation 2026-08-16: two lines; default 'pinned' = the vNEXT map
  // VERBATIM — every pre-graduation caller gets identical behaviour.
  // vRE 2026-08-17: for the ROUNDED (drag-crisis) class, an optional
  // equivalent-diameter Reynolds number blends the SUBCRITICAL and
  // HIGH-Re measured maps across the declared crisis window. Omitted
  // reD (or non-rounded class) → the high line exactly, so every
  // pre-vRE caller and the whole sealed battery are unchanged.
  if (!Number.isFinite(x)) return NaN;
  if (cls !== 'rounded') return lineAt(CALIBRATION_KNOTS, x);
  const hi = lineAt(ROUNDED_KNOTS, x);
  if (reD === undefined) return hi;
  const t = crisisBlend(reD);
  if (t >= 1) return hi;
  const sub = lineAt(SUBCRITICAL_ROUNDED_KNOTS, x);
  return sub + t * (hi - sub);
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
/**
 * MECHANISM CLASSIFIER, extracted 2026-08-18 — behaviour identical, it
 * simply now has ONE implementation instead of being inlined.
 *
 * WHY THE EXTRACTION: lab/tail-lab.mjs was calling calibratePressure()
 * with no class, so it silently priced everything on the PINNED line
 * while production classified the same Sunship as ROUNDED — 0.438 in
 * the lab against 0.179 shipped, and nothing caught it because there
 * was no shared entry point to disagree with. Any tool scoring a
 * profile must be able to reach the same four triggers the engine uses.
 *
 * @param {{A:Float64Array|number[], L:number, cell:number}} m
 *        a measureSections()-shaped record (the tail lab builds these
 *        from bare radius profiles, which is legitimate — the scorer
 *        consumes only A(x))
 * @param {{softFore:number, softAft:number, softAftRaw:number}} scores
 * @returns {{cls:'pinned'|'rounded', triggers:object}}
 */
export function classifySections(m, scores) {
  const aMax = Math.max(...m.A);
  let last = m.A.length - 1;
  while (last > 0 && m.A[last] <= 1e-4 * aMax) last--;
  const terminalBaseFrac = aMax > 0 ? m.A[last] / aMax : 1;
  const rawRatio = scores.softAft > 1e-9 ? scores.softAftRaw / scores.softAft : 1;
  const shoulder = shoulderAngleScore(m);
  const triggers = {
    softFore: scores.softFore, softAft: scores.softAft,
    terminalBaseFrac, rawRatio, shoulder,
  };
  const cls = (scores.softFore > scores.softAft || terminalBaseFrac > CLASSIFIER_TAU
    || rawRatio > CLASSIFIER_REEXPANSION || shoulder > SHOULDER_ANGLE_MAX)
    ? 'pinned' : 'rounded';
  return { cls, triggers };
}

export function measureSectionalProxy(verts, faces, { axis = '+Z' } = {}) {
  const t0 = performance.now();
  try {
    if (!Array.isArray(verts) || verts.length < 3 || !Array.isArray(faces) || faces.length === 0) {
      return { proxy: NaN, scores: null, quality: null, axis, ms: performance.now() - t0 };
    }
    const m = measureSections(verts, faces, { axis });
    const scores = scoreSections(m);
    const proxy = m.quality.oddFraction > ODD_FRACTION_MAX ? NaN : scores.compositeV1;
    // MECHANISM CLASSIFICATION (graduation 2026-08-16) — computed in
    // the expensive cacheable step alongside the proxy; travels with
    // the record so the per-speed step never re-measures.
    let cls = null, triggers = null;
    if (Number.isFinite(proxy)) {
      ({ cls, triggers } = classifySections(m, scores));
    }
    return { proxy, cls, triggers, scores, quality: m.quality, axis, ms: performance.now() - t0 };
  } catch {
    return { proxy: NaN, cls: null, triggers: null, scores: null, quality: null, axis, ms: performance.now() - t0 };
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
  const frictionCd = skinFrictionCd(re, L, wetted, A);

  // Graduation 2026-08-16: class travels in the proxy record (computed
  // once with the proxy). Records predating the graduation carry no
  // cls — they price on the PINNED (vNEXT-verbatim) line: conservative,
  // never flattering, exactly the pre-graduation behaviour.
  const cls = (proxyRecord && proxyRecord.cls) || 'pinned';
  // vRE (2026-08-17): the rounded class blends across the drag crisis
  // on the EQUIVALENT-DIAMETER Reynolds number — size and speed now
  // reach the pressure term, not just friction. D_eq from the same
  // trusted geometry record as everything else.
  const dEq = Math.sqrt((4 * A) / Math.PI);
  const reD = (v * dEq) / NU_M2_S;
  const pressureCd = calibratePressure(proxyRecord ? proxyRecord.proxy : NaN, cls, reD);
  const quality = proxyRecord && proxyRecord.quality ? proxyRecord.quality : null;
  const provenance = {
    label: 'ESTIMATED',
    method: 'low-order sectional geometric screening estimator (M6, 2026-08-16; mechanism-aware two-line calibration, graduated 2026-08-16 after r15–r19)',
    calibration: cls === 'rounded' ? ROUNDED_PROVENANCE : CALIBRATION_PROVENANCE,
    class: cls,
    triggers: (proxyRecord && proxyRecord.triggers) || null,
    metrology: { stations: 128, kFrac: SHOULDER_OPTS.kFrac, smoothW: SHOULDER_OPTS.smoothW, shoulderMax: SHOULDER_ANGLE_MAX },
    // vRE: the regime this estimate was computed in (rounded class
    // only carries a meaningful blend; 1 = fully high-Re).
    regime: { reD, crisisBlend: cls === 'rounded' ? crisisBlend(reD) : 1, windowReD: CRISIS_WINDOW_RED },
    axis: proxyRecord ? proxyRecord.axis : null,
    oddFraction: quality ? quality.oddFraction : null,
    // INPUT IDENTITY (r12 send-back #1b, 2026-08-16): the exact inputs
    // this estimate was computed FROM, echoed so computeDynamics can
    // verify an echoed estimate belongs to the geometry+speed of the
    // call consuming it — a genuine identity check, not the friction
    // proxy (which a same-ratio, same-length geometry can fool).
    inputs: { frontalAreaM2: A, wettedAreaM2: wetted, lengthM: L, airspeedKmh },
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

/**
 * GENERIC TAIL FRACTION — 2026-08-16 (M6 stage 2; spec §5.4, ruled
 * 2026-08-12 and corrected by external review r2 #2)
 * WHAT:  a generic Smart Tail removes 20% of the estimator's PRESSURE
 *        term. Friction is never touched.
 * WHY:   the scenario-graded fractions (up to ~87% of the avoidable
 *        pool) are SUNSHIP-AUTHORED data — applying them to a cube's
 *        ~1.0 pressure term would collapse it toward ~0.17, the largest
 *        absolute gift to the worst shapes, physically ungrounded.
 *        Generic shapes get one fixed, modest, CONSERVATIVE-grade
 *        fraction: "some effect, not heaps" — enforced, not hoped for.
 *        A tail cannot streamline a sharp-edged box.
 * PROVENANCE: REFERENCE ASSUMPTION (spec §5.4).
 * LIMITATION: shape-graded fractions (keyed to the estimator's own
 *        aft-closure descriptors) are a future refinement, not this.
 * REPLACE WHEN: configuration-specific tail analysis exists for
 *        non-Sunship shapes — by dated ruling.
 */
export const GENERIC_TAIL_PRESSURE_FRACTION = 0.20;

/**
 * The generic Smart-Tail estimate for a NON-Sunship shape (M6 stage 2):
 * a DERIVED frozen-API object — pressure trimmed by the §5.4 generic
 * fraction, friction untouched, band re-drawn at ±BAND_FRACTION around
 * the new total, provenance extended (the input identity is carried
 * unchanged: same geometry, same speed). 'unavailable' passes through
 * untouched — no tail can rescue an estimate that does not exist
 * (§5.5). The Sunship's authored with-tail 0.043 NEVER routes through
 * here (it is a claim, not an estimate — spec §5.4 / M6 amendment #6).
 */
export function applyGenericTail(estimate) {
  if (!estimate || estimate.status !== 'ok') return estimate;
  const pressureCd = estimate.pressureCd * (1 - GENERIC_TAIL_PRESSURE_FRACTION);
  const cdEstimate = estimate.frictionCd + pressureCd;
  return {
    cdEstimate,
    frictionCd: estimate.frictionCd,
    pressureCd,
    band: [cdEstimate * (1 - BAND_FRACTION), cdEstimate * (1 + BAND_FRACTION)],
    status: 'ok',
    provenance: {
      ...estimate.provenance,
      label: 'ESTIMATED',
      genericTail: `generic Smart Tail — ${GENERIC_TAIL_PRESSURE_FRACTION * 100}% of pressure term removed (REFERENCE ASSUMPTION, spec §5.4)`,
    },
  };
}
