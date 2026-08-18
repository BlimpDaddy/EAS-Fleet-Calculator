/**
 * ROUTE DATA v6 GENERATOR — Bosphorus corridor + raised corridor cap.
 *
 * ADDITIVE ONLY, and that is the point. ROUTE_PAIRS and every existing
 * ROUTE_GATED entry are carried through UNTOUCHED; this only computes
 * pairs that have no route at all today. So the diff is provably
 * additions, and the 5,939 routes Toby has already inspected cannot
 * silently move because a reimplementation rounded differently.
 *
 * Runs in the browser because the mask is the calculator's own earth.jpg
 * (route legality is visually self-consistent by construction). The
 * RULES live in ./route-rules.js and are pure — see that file for why
 * they are now committed instead of "living in the session record".
 *
 * WHAT v6 ADDS
 *  1. BOSPHORUS corridor (5 new gates). Odesa and Varna were the only two
 *     cities in the whole set with ZERO routes. Every Black Sea port
 *     samples as LAND in the texture — the sea is painted thin and
 *     patchy — so Constanta and Istanbul only ever escaped because the
 *     coastal grace skipped their neighbourhood. Odesa sits too deep in
 *     the north-west corner for that to reach open water.
 *     Measured on the live texture: Black Sea SW -> Bosphorus N 0 km of
 *     land, Bosphorus N -> Marmara 134 km, Marmara -> N Aegean 170 km,
 *     N Aegean -> Aegean S 20 km, Aegean S -> Med C 0 km. The two real
 *     strait crossings sit inside the 250 km ruling exactly as Suez's
 *     canal legs do. Aegean S is load-bearing, not decorative: skipping
 *     it (N Aegean -> Med C direct) fails at 269 km.
 *     West of the Aegean the spine REUSES the Suez spine's own western
 *     half rather than duplicating it.
 *  2. CORRIDOR DETOUR CAP 2.0 -> 2.3 (Toby 2026-08-19). Kuwait City and
 *     Umm Qasr had zero long-haul routes: escaping the Gulf means Hormuz
 *     and then the length of the Arabian Sea before a route to Europe has
 *     even started heading north-west, which the 2.0 cap refused.
 *
 * RUN: from the Fleet page console —
 *   const { report } = await import('/tools/route-gen-v6.js');
 *   await report();
 * It prints a summary and leaves the emitted source on window.__v6.
 */
import {
  haversine, legPasses, chainKm, chainPasses, portGrace, longestLandRunKm,
  GATE_DETOUR_CAP, CORRIDOR_DETOUR_CAP, MAX_LAND_RUN_KM,
} from './route-rules.js';

/** The five new waypoints that open the Black Sea. Appended, never
 *  inserted — every existing ROUTE_GATED entry indexes into ROUTE_GATES
 *  by position, so inserting would silently re-route the whole file. */
export const NEW_GATES = [
  ['Black Sea SW', 42.0, 29.25],
  ['Bosphorus N', 41.75, 29.0],
  ['Marmara', 40.75, 28.0],
  ['N Aegean', 40.0, 25.5],
  ['Aegean S', 36.5, 25.0],
];

/** Build the mask sampler from the calculator's own earth texture. */
export async function makeSampler() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => {
    img.onload = res; img.onerror = rej;
    img.src = '/assets/charts/average-distance-chart/earth.jpg';
  });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  return (lat, lon) => {
    const x = Math.round(((((lon + 180) % 360) + 360) % 360) / 360 * c.width) % c.width;
    let y = Math.round((90 - lat) / 180 * c.height);
    if (y < 0) y = 0; else if (y >= c.height) y = c.height - 1;
    const i = (y * c.width + x) * 4;
    return px[i + 2] > px[i] + 20;   // ocean = blue beats red (two-tone texture)
  };
}

export async function generate() {
  const data = await import('/v2/route-data.js?v6=' + Math.random());
  const { ROUTE_CITIES, ROUTE_PAIRS, ROUTE_GATES, ROUTE_GATED } = data;
  const sampler = await makeSampler();

  const gates = [...ROUTE_GATES.map((g) => [...g]), ...NEW_GATES];
  const gi = (name) => gates.findIndex((g) => g[0] === name);

  // The Bosphorus spine: five new waypoints, then the Suez spine's own
  // western half (shared, not duplicated).
  const BOSPHORUS = ['Black Sea SW', 'Bosphorus N', 'Marmara', 'N Aegean', 'Aegean S',
    'Med C', 'Sicily Channel', 'Algeria offing', 'Gibraltar', 'Portugal offing',
    'Biscay W', 'W of Ushant', 'Dover Strait'].map(gi);

  // Validate the spine before it is allowed to route anything.
  const spineAudit = [];
  for (let i = 1; i < BOSPHORUS.length; i++) {
    const a = gates[BOSPHORUS[i - 1]], b = gates[BOSPHORUS[i]];
    const land = longestLandRunKm(a[1], a[2], b[1], b[2], sampler, 0, 0);
    spineAudit.push({ leg: `${a[0]} -> ${b[0]}`, km: Math.round(haversine(a[1], a[2], b[1], b[2])),
      landKm: Math.round(land), ok: land <= MAX_LAND_RUN_KM });
  }
  if (spineAudit.some((l) => !l.ok)) {
    throw new Error('BOSPHORUS spine has an illegal leg — refusing to generate: '
      + JSON.stringify(spineAudit.filter((l) => !l.ok)));
  }

  // Which pairs already have ANY route? Those are untouchable.
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const existing = new Set();
  for (const [a, b] of ROUTE_PAIRS) existing.add(key(a, b));
  for (const [a, b] of ROUTE_GATED) existing.add(key(a, b));

  // Precompute port -> spine-waypoint legs (the expensive part, done once).
  const N = ROUTE_CITIES.length;
  const portToSpine = new Map();
  for (let c = 0; c < N; c++) {
    const [, la, lo] = ROUTE_CITIES[c];
    for (const g of BOSPHORUS) {
      const [, gla, glo] = gates[g];
      const km = haversine(la, lo, gla, glo);
      if (legPasses(la, lo, gla, glo, sampler, true, false)) portToSpine.set(`${c}:${g}`, km);
    }
  }

  // A corridor route: enter at the nearest reachable waypoint, leave at
  // the nearest reachable one, travel the spine between them.
  const cumulative = [0];
  for (let i = 1; i < BOSPHORUS.length; i++) {
    const a = gates[BOSPHORUS[i - 1]], b = gates[BOSPHORUS[i]];
    cumulative.push(cumulative[i - 1] + haversine(a[1], a[2], b[1], b[2]));
  }
  const added = [];
  for (let a = 0; a < N; a++) {
    for (let b = a + 1; b < N; b++) {
      if (existing.has(key(a, b))) continue;
      const direct = haversine(ROUTE_CITIES[a][1], ROUTE_CITIES[a][2],
        ROUTE_CITIES[b][1], ROUTE_CITIES[b][2]);
      let best = null;
      for (let i = 0; i < BOSPHORUS.length; i++) {
        const inKm = portToSpine.get(`${a}:${BOSPHORUS[i]}`);
        if (inKm === undefined) continue;
        for (let j = 0; j < BOSPHORUS.length; j++) {
          if (i === j) continue;
          const outKm = portToSpine.get(`${b}:${BOSPHORUS[j]}`);
          if (outKm === undefined) continue;
          const total = inKm + Math.abs(cumulative[j] - cumulative[i]) + outKm;
          if (total > direct * CORRIDOR_DETOUR_CAP) continue;
          if (total < 800 || total > 14900) continue;
          const lo = Math.min(i, j), hi = Math.max(i, j);
          const chain = BOSPHORUS.slice(lo, hi + 1);
          // SCOPE GUARD: this is the BOSPHORUS corridor, so a route must
          // actually traverse one of its five new waypoints. Without this
          // the spine's shared western half (Med C -> ... -> Dover, which
          // it borrows from Suez rather than duplicating) becomes a
          // general-purpose Atlantic router at the new 2.3x cap, and the
          // first run produced exactly that: "Miami - Anchorage 14,797 km
          // via W of Ushant", i.e. Florida to Alaska through the English
          // Channel. Geographically absurd, and it would have been drawn
          // on the globe as a real route. Reaching the Atlantic at a
          // looser cap is a SEPARATE question from opening the Black Sea;
          // conflating them here was the bug.
          if (!chain.some((g) => g >= ROUTE_GATES.length)) continue;
          if (!best || total < best.km) {
            best = { km: total, chain: i <= j ? chain : [...chain].reverse() };
          }
        }
      }
      if (best) added.push([a, b, Math.round(best.km), best.chain]);
    }
  }
  added.sort((x, y) => x[2] - y[2]);
  return { ROUTE_CITIES, ROUTE_GATES, ROUTE_GATED, gates, added, spineAudit, BOSPHORUS };
}

export async function report() {
  const r = await generate();
  const name = (i) => r.ROUTE_CITIES[i][0];
  const gname = (i) => r.gates[i][0];
  const touched = new Set();
  for (const [a, b] of r.added) { touched.add(a); touched.add(b); }
  console.log('=== BOSPHORUS SPINE AUDIT ===');
  console.table(r.spineAudit);
  console.log(`=== ${r.added.length} NEW ROUTES (additive; ${r.ROUTE_GATED.length} existing untouched) ===`);
  console.log('cities newly connected:', [...touched].map(name).sort().join(', '));
  console.log('shortest 10:');
  for (const [a, b, km, ch] of r.added.slice(0, 10)) {
    console.log(`  ${name(a)} - ${name(b)}  ${km} km  via [${ch.map(gname).join(' > ')}]`);
  }
  window.__v6 = r;
  return { newRoutes: r.added.length, newGates: 5,
    citiesConnected: [...touched].map(name).sort(),
    orphansFixed: ['Odesa', 'Varna'].filter((n) =>
      [...touched].some((i) => name(i) === n)) };
}
