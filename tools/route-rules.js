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
/* Raised 2.0 -> 2.3 (Toby 2026-08-19). The Persian Gulf is the case that
 * forced it: Kuwait City and Umm Qasr had ZERO long-haul routes because
 * escaping the Gulf means Hormuz, then the length of the Arabian Sea,
 * before a route to Europe has even started heading north-west — a real
 * canal-and-strait routing IS long against a line drawn through Iran. */
export const CORRIDOR_DETOUR_CAP = 2.3;

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
