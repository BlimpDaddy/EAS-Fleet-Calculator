/**
 * ROUTE DATA v7 GENERATOR — the Persian Gulf, at the raised corridor cap.
 *
 * THE PROBLEM. Kuwait City and Umm Qasr had no long-haul routes at all —
 * only short hops to other Gulf ports. They were not orphans (Odesa and
 * Varna were, and v6 fixed those), which is exactly why they went
 * unnoticed: a city with four routes looks connected in a count and is
 * still unreachable from anywhere that matters.
 *
 * THE CAUSE WAS NOT THE CAP, and the diagnosis in the backlog (and mine)
 * was wrong. Raising the corridor cap 2.0 -> 2.3 was expected to fix this
 * and, run on its own, it added exactly ZERO routes. Measured instead:
 * Kuwait City and Umm Qasr cannot reach Hormuz AT ALL — 477 km and 504 km
 * of contiguous land, against a 250 km limit — because this texture
 * leaves the NORTHERN Persian Gulf unpainted. The painted water starts
 * around 29.5N and runs south-east; Kuwait and Umm Qasr sit above it and
 * are, as far as the mask is concerned, inland. Exactly the same failure
 * as the north-west Black Sea in v6, and it needed the same fix:
 * WAYPOINTS THAT FOLLOW THE PAINTED CHANNEL, not a looser cap.
 *
 * THREE new waypoints, all verified to sit ON painted water, prepended to
 * the Gulf spine: N Gulf (29.0, 49.5), Central Gulf (27.5, 51.0), S Gulf
 * (26.0, 53.5). Worst land run per new leg: 0 / 0 / 35 km. Kuwait City
 * reaches N Gulf in 152 km and Umm Qasr in 191 km.
 *
 * The raised cap STAYS — it is what lets the resulting long way round be
 * accepted once the geometry is reachable at all — but it is not the fix,
 * and the header of route-rules.js is corrected to say so.
 *
 * THE SCOPE GUARD. A spine that runs down the Red Sea, through the Med
 * and out past Gibraltar shares most of its waypoints with Suez and
 * Bosphorus, so unguarded it would re-route unrelated pairs the long way
 * round at the looser cap. A v7 route must traverse one of the THREE NEW
 * Gulf waypoints. Same discipline that took the first Bosphorus run from
 * 180 routes to 118 after it emitted Miami-Anchorage via the English
 * Channel.
 *
 * ADDITIVE ONLY: pairs that already have any route are skipped entirely,
 * so nothing Toby has already inspected can move.
 *
 * RUN: from the Fleet page console —
 *   const m = await import('/tools/route-gen-v7.js');
 *   await m.report();
 */
import { haversine, longestLandRunKm, corridorSearch, GULF_DETOUR_CAP, MAX_LAND_RUN_KM } from './route-rules.js';
import { makeSampler } from './route-gen-v6.js';

/** Hormuz and the Oman offing, then the Suez spine from the Arabian Sea
 *  onward. Shared, not duplicated — these are the SAME waypoints the Suez
 *  corridor uses, which is why the Hormuz guard below is load-bearing. */
export const NEW_GATES = [
  ['N Gulf', 29.0, 49.5],
  ['Central Gulf', 27.5, 51.0],
  ['S Gulf', 26.0, 53.5],
];

export const GULF_SPINE_NAMES = [
  'N Gulf', 'Central Gulf', 'S Gulf', 'Hormuz', 'Oman offing', 'Arabian Sea', 'Gulf of Aden', 'Bab-el-Mandeb',
  'Red Sea S', 'Red Sea N', 'Gulf of Suez', 'Suez', 'Ismailia', 'Port Said',
  'Med E', 'Med C', 'Sicily Channel', 'Algeria offing', 'Gibraltar',
  'Portugal offing', 'Biscay W', 'W of Ushant', 'Dover Strait',
];

export async function generate() {
  const { ROUTE_CITIES, ROUTE_PAIRS, ROUTE_GATES, ROUTE_GATED } =
    await import('/v2/route-data.js?v7=' + Math.random());
  const sampler = await makeSampler();

  // The three new waypoints are APPENDED, never inserted — existing GATED
  // entries index ROUTE_GATES by position.
  const gates = [...ROUTE_GATES.map((g) => [...g]), ...NEW_GATES];
  const gi = (n) => {
    const i = gates.findIndex((g) => g[0] === n);
    if (i < 0) throw new Error(`gate not found: ${n}`);
    return i;
  };
  const spine = GULF_SPINE_NAMES.map(gi);
  const newIdx = NEW_GATES.map((g) => gi(g[0]));

  // Audit every leg before the spine is allowed to route anything. These
  // are all pre-existing waypoints, so this should pass by construction —
  // which is exactly why it is worth asserting rather than assuming.
  const audit = [];
  for (let i = 1; i < spine.length; i++) {
    const a = gates[spine[i - 1]], b = gates[spine[i]];
    const land = longestLandRunKm(a[1], a[2], b[1], b[2], sampler, 0, 0);
    audit.push({ leg: `${a[0]} -> ${b[0]}`, km: Math.round(haversine(a[1], a[2], b[1], b[2])),
      landKm: Math.round(land), ok: land <= MAX_LAND_RUN_KM });
  }
  if (audit.some((l) => !l.ok)) {
    throw new Error('GULF spine has an illegal leg — refusing to generate: '
      + JSON.stringify(audit.filter((l) => !l.ok)));
  }

  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const existing = new Set();
  for (const [a, b] of ROUTE_PAIRS) existing.add(key(a, b));
  for (const [a, b] of ROUTE_GATED) existing.add(key(a, b));

  const added = corridorSearch(ROUTE_CITIES, gates, spine, sampler,
    existing, newIdx, GULF_DETOUR_CAP);

  return { ROUTE_CITIES, ROUTE_GATES, ROUTE_GATED, gates, added, audit, spine, newIdx };
}

export async function report() {
  const r = await generate();
  const name = (i) => r.ROUTE_CITIES[i][0];
  const gname = (i) => r.gates[i][0];
  const per = {};
  for (const [a, b] of r.added) { per[name(a)] = (per[name(a)] || 0) + 1; per[name(b)] = (per[name(b)] || 0) + 1; }
  window.__v7 = r;
  return {
    newRoutes: r.added.length,
    routesPerPort: Object.fromEntries(Object.entries(per).sort((x, y) => y[1] - x[1])),
    sample: r.added.slice(0, 6).map(([a, b, km, ch]) =>
      `${name(a)} - ${name(b)}  ${km}km  [${ch.map(gname).join(' > ')}]`),
    longest: r.added.slice(-3).map(([a, b, km, ch]) =>
      `${name(a)} - ${name(b)}  ${km}km  [${ch.map(gname).join(' > ')}]`),
    src: r.added.map((e) => JSON.stringify(e)).join(','),
  };
}
