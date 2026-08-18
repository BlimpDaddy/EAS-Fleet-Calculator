/**
 * ROUTE GENERATION RULES — the single committed definition.
 *
 * WHY THIS FILE EXISTS (2026-08-19): route-data.js has been regenerated
 * three times (v1 ocean-clean, v2 straits, v3 polar, v4 gates, v5
 * corridors) and the generator has never been committed once. It "lives
 * in the session record", so every regeneration re-derived it from prose
 * — and the prose drifted: fleet-routes.js's REGENERATING note still
 * describes the RETIRED v1 rule ("reject any land run > 2 samples")
 * which the 250 km kilometre-based rule replaced on 2026-08-17. A rule
 * nobody can run is a rule nobody can check.
 *
 * Everything here is PURE and takes a `sampler` — a function
 * (lat, lon) -> true when that pixel is ocean. The pixels come from the
 * calculator's OWN earth texture, which is why route legality is
 * visually self-consistent: the mask IS the displayed picture. Only the
 * pixel fetch needs a browser; every rule below is testable in Node
 * against a synthetic sampler.
 *
 * THE RULES, as shipped (see route-data.js's header for the rulings):
 *   - ocean when blue > red + 20 (two-tone texture; the sampler owns this)
 *   - 200 samples per arc, great-circle interpolated
 *   - |lat| >= 57 is FLYABLE regardless of the mask (polar ruling)
 *   - a leg passes when no CONTIGUOUS LAND RUN exceeds 250 km
 *   - endpoint grace: 3% of each end skipped for a direct pair; a gated
 *     leg gets min(40%, max(3%, 350km/legKm)) but ONLY at a true port end
 *   - detour caps: 1.45x direct for gate hops, 2.3x for corridors
 */

export const SAMPLES = 200;
export const MAX_LAND_RUN_KM = 250;
export const POLAR_EXEMPT_LAT = 57;
export const DIRECT_SKIP_FRAC = 0.03;
export const PORT_GRACE_KM = 350;
export const PORT_GRACE_MAX_FRAC = 0.40;
export const GATE_DETOUR_CAP = 1.45;
/* Raised 2.0 -> 2.3 (Toby 2026-08-19), for the Persian Gulf: escaping it
 * means Hormuz, then the length of the Arabian Sea, before a route to
 * Europe has even started heading north-west — a real strait routing IS
 * long against a line drawn through Iran.
 * HONEST CORRECTION (measured the same day): the cap was NOT what was
 * blocking Kuwait City and Umm Qasr. Raised on its own it added exactly
 * ZERO routes — those two ports could not reach Hormuz at all, on 477 km
 * and 504 km of land, because the texture leaves the northern Gulf
 * unpainted. Waypoints fixed that (see route-gen-v7.js); the cap only
 * decides whether the resulting long way round is then ACCEPTED. Kept
 * because it is defensible on its own terms, not because it was the fix. */
export const CORRIDOR_DETOUR_CAP = 2.3;
/* PER-CORRIDOR OVERRIDE. Escaping a near-landlocked sea costs more than
 * any single global cap can express: Kuwait City -> Rotterdam is 4,346 km
 * direct (straight over Iraq, Turkey and Germany) against 13,153 km by
 * the only water route there is — a 3.03x detour. Real Kuwait-Rotterdam
 * shipping is ~11,000 km, so the ratio is honest, not an artifact.
 * Safe to raise ONLY because corridorSearch's scope guard confines this
 * to routes through the three new Gulf waypoints; a global 3.2 would
 * re-open exactly the Miami-Anchorage class of nonsense.
 * RULED: Toby approved 2.0 -> 2.3 believing that was the blocker. It was
 * not (see the correction above), and when shown that the Gulf actually
 * needs 3.2 he approved that too (2026-08-19). The GLOBAL corridor cap
 * stays at 2.3 — only the Gulf gets 3.2, and only behind the guard. */
export const GULF_DETOUR_CAP = 3.2;

const R_EARTH = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversine(latA, lonA, latB, lonB) {
  const dLat = rad(latB - latA), dLon = rad(lonB - lonA);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point at fraction f along the great circle A->B (slerp on the sphere). */
export function interpolate(latA, lonA, latB, lonB, f) {
  const φ1 = rad(latA), λ1 = rad(lonA), φ2 = rad(latB), λ2 = rad(lonB);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [latA, lonA];
  const a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
  const z = a * Math.sin(φ1) + b * Math.sin(φ2);
  return [Math.atan2(z, Math.hypot(x, y)) / rad(1), Math.atan2(y, x) / rad(1)];
}

/**
 * The longest contiguous LAND RUN along a leg, in km.
 * `skipStart`/`skipEnd` are fractions of the leg exempted at each end —
 * the coastal allowance, applied only where a leg actually touches a port.
 */
export function longestLandRunKm(latA, lonA, latB, lonB, sampler, skipStart, skipEnd) {
  const legKm = haversine(latA, lonA, latB, lonB);
  const stepKm = legKm / (SAMPLES - 1);
  let run = 0, worst = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const f = i / (SAMPLES - 1);
    if (f < skipStart || f > 1 - skipEnd) continue;
    const [lat, lon] = interpolate(latA, lonA, latB, lonB, f);
    // POLAR RULING: the ice caps and the sub-polar band are overflyable,
    // so they never count as land however the texture paints them.
    const flyable = Math.abs(lat) >= POLAR_EXEMPT_LAT || sampler(lat, lon);
    if (flyable) { run = 0; } else { run += stepKm; if (run > worst) worst = run; }
  }
  return worst;
}

/** The coastal allowance for one end of a leg: generous on long legs,
 *  capped so it can never swallow a short one. */
export const portGrace = (legKm) =>
  Math.min(PORT_GRACE_MAX_FRAC, Math.max(DIRECT_SKIP_FRAC, PORT_GRACE_KM / legKm));

/** Does a single leg pass? `portStart`/`portEnd` say whether that end is a
 *  real port (grace) rather than a gate/waypoint (no grace). */
export function legPasses(latA, lonA, latB, lonB, sampler, portStart, portEnd) {
  const legKm = haversine(latA, lonA, latB, lonB);
  if (legKm === 0) return true;
  const g = portGrace(legKm);
  return longestLandRunKm(latA, lonA, latB, lonB, sampler,
    portStart ? g : 0, portEnd ? g : 0) <= MAX_LAND_RUN_KM;
}

/** A direct port-to-port great circle under the original v1-v3 rule
 *  (flat 3% at both ends — NOT the gated grace). */
export function directPasses(latA, lonA, latB, lonB, sampler) {
  return longestLandRunKm(latA, lonA, latB, lonB, sampler,
    DIRECT_SKIP_FRAC, DIRECT_SKIP_FRAC) <= MAX_LAND_RUN_KM;
}

/** Total length of a waypoint chain [[lat,lon], ...] in km. */
export function chainKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return km;
}

/** Does every leg of a chain pass? Only the two OUTER ends are ports. */
export function chainPasses(points, sampler) {
  for (let i = 1; i < points.length; i++) {
    if (!legPasses(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1],
      sampler, i === 1, i === points.length - 1)) return false;
  }
  return true;
}

/**
 * THE CORRIDOR SEARCH, shared by every spine.
 *
 * A port enters the spine at whichever waypoint it can actually reach,
 * travels along it, and leaves at whichever waypoint is nearest its
 * destination — shortest total wins. Extracted here (2026-08-19) so the
 * Bosphorus and Gulf generators cannot drift apart the way the prose
 * descriptions of the rules did.
 *
 * `requireAnyOf` is the SCOPE GUARD and it is not optional decoration.
 * Spines share waypoints — the Bosphorus and Gulf spines both run down
 * the Med and out through Gibraltar — so without it a spine becomes a
 * general-purpose router for every pair that happens to have no route
 * yet, at whatever cap it was given. That is not hypothetical: the first
 * Bosphorus run emitted Miami–Anchorage via the English Channel. A route
 * must traverse the waypoint that DEFINES the corridor, or it is not a
 * route through that corridor.
 *
 * It takes a SET, not one waypoint. The first cut took a single index and
 * was demonstrably wrong: re-running the Bosphorus spine through it
 * reproduced 109 of the known-good 118, because nine routes enter at
 * Aegean S and never touch Marmara. A corridor is defined by its
 * exclusive waypoints collectively, not by any one of them.
 *
 * @param {object[]} cities   [name, lat, lon]
 * @param {object[]} gates    [name, lat, lon]
 * @param {number[]} spine    gate indices, in order along the corridor
 * @param {function} sampler  (lat, lon) -> true when ocean
 * @param {Set<string>} existing  "a,b" keys that already have a route
 * @param {number[]} requireAnyOf  the corridor's EXCLUSIVE waypoints; a
 *        route must traverse at least one
 * @param {number} cap        detour cap, multiple of the direct great circle
 */
export function corridorSearch(cities, gates, spine, sampler, existing, requireAnyOf, cap) {
  const defining = new Set(requireAnyOf);
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  // Port -> spine-waypoint legs, precomputed once. Testing legs inside the
  // pair loops instead is what made an earlier attempt hang the tab.
  const reach = new Map();
  for (let c = 0; c < cities.length; c++) {
    const [, la, lo] = cities[c];
    for (const g of spine) {
      const [, gla, glo] = gates[g];
      if (legPasses(la, lo, gla, glo, sampler, true, false)) {
        reach.set(`${c}:${g}`, haversine(la, lo, gla, glo));
      }
    }
  }
  const cum = [0];
  for (let i = 1; i < spine.length; i++) {
    const a = gates[spine[i - 1]], b = gates[spine[i]];
    cum.push(cum[i - 1] + haversine(a[1], a[2], b[1], b[2]));
  }
  const out = [];
  for (let a = 0; a < cities.length; a++) {
    for (let b = a + 1; b < cities.length; b++) {
      if (existing.has(key(a, b))) continue;
      const direct = haversine(cities[a][1], cities[a][2], cities[b][1], cities[b][2]);
      let best = null;
      for (let i = 0; i < spine.length; i++) {
        const inKm = reach.get(`${a}:${spine[i]}`);
        if (inKm === undefined) continue;
        for (let j = 0; j < spine.length; j++) {
          if (i === j) continue;
          const outKm = reach.get(`${b}:${spine[j]}`);
          if (outKm === undefined) continue;
          const total = inKm + Math.abs(cum[j] - cum[i]) + outKm;
          if (total > direct * cap || total < 800 || total > 14900) continue;
          const lo = Math.min(i, j), hi = Math.max(i, j);
          const chain = spine.slice(lo, hi + 1);
          if (!chain.some((g) => defining.has(g))) continue;   // THE SCOPE GUARD
          if (!best || total < best.km) {
            best = { km: total, chain: i <= j ? chain : [...chain].reverse() };
          }
        }
      }
      if (best) out.push([a, b, Math.round(best.km), best.chain]);
    }
  }
  return out.sort((x, y) => x[2] - y[2]);
}
