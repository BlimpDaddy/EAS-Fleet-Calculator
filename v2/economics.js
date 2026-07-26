/**
 * Phase A economics — PURE logic, no DOM. See V2-ROADMAP.md.
 *
 * Principle: physics gives quantities, sliders give prices, this module only
 * multiplies. Fuel is deliberately NOT modelled separately (a fixed fuel figure is
 * only true for the standard Sunship and would be silently wrong for anything else —
 * it arrives with the aerodynamics module); until then it lives inside the user's
 * all-in opex assumption. Payback is real (capex against margin, after opex);
 * fleet/programme figures are steady-state — they assume the full fleet built and
 * operating, with no ramp model.
 *
 * Kept DOM-free so the logic can be verified in Node against hand calculations.
 */

/**
 * @param {object} i
 * @param {number} i.marketSizeTtkm   fleet market size, trillion tonne-km / year
 * @param {number} i.netLiftT         per-ship net lift, tonnes (from V1's model)
 * @param {number} i.airSpeedKmh
 * @param {number} i.utilisationPct   0–100
 * @param {number} i.ratePerTkm      $ per tonne-km
 * @param {number} i.carbonPerT      $ per tonne CO2
 * @param {number} i.capex           $ per Sunship
 * @param {number} i.opexPerShip     $ per Sunship per year, ALL-IN (crew, fuel,
 *                                    maintenance, insurance, and its share of ground
 *                                    infrastructure — barges/crews/heating scale with
 *                                    the network, and the network scales with ships,
 *                                    so per-ship is the correct allocation)
 * @param {number} i.preCapex        $ one-off programme cost (R&D, testing, approval —
 *                                    including corporate burn during the pre-revenue
 *                                    decade; the truly fixed post-revenue overhead is
 *                                    negligible against any operating fleet's revenue)
 */
export function computeEconomics(i) {
  // Work one Sunship performs per year. Same formula as V1's tonKmPerYear
  // (netLift × speed × utilisation × hours-in-year). Negative net lift means the
  // ship cannot fly, let alone earn — clamp to zero rather than print nonsense.
  const tonKmPerShip = Math.max(0, i.netLiftT) * i.airSpeedKmh * (i.utilisationPct / 100) * 8760;

  // Fleet size needed to serve the market — V1's own formula, computed here (exact,
  // unrounded) rather than read from its display. null = the ship cannot fly.
  const requiredShips = tonKmPerShip > 0 ? (i.marketSizeTtkm * 1e12) / tonKmPerShip : null;

  const freightRevenue = i.marketSizeTtkm * 1e12 * i.ratePerTkm;

  // CO2 avoided: V1's own linear proxy (1000 Mt per 122 Ttkm), recomputed here from
  // the raw market size for precision. Inherited deliberately — refining the
  // emissions model is future work (see roadmap).
  const co2AvoidedMt = i.marketSizeTtkm * (1000 / 122);
  const carbonRevenue = co2AvoidedMt * 1e6 * i.carbonPerT;
  const totalRevenue = freightRevenue + carbonRevenue;

  const revenuePerShip = tonKmPerShip * i.ratePerTkm;
  const marginPerShip = revenuePerShip - i.opexPerShip;

  // REAL payback per ship: capex against margin, not revenue. null = never pays back
  // (ship can't fly, or opex eats the revenue) — callers print "—", never negatives.
  const paybackYears = revenuePerShip > 0 && marginPerShip > 0 ? i.capex / marginPerShip : null;

  // Fleet- and programme-level figures. Steady-state by design: they assume the full
  // fleet is built and operating (no ramp model — see the on-page note).
  const fleetOpex = requiredShips !== null ? requiredShips * i.opexPerShip : null;
  const fleetProfit = fleetOpex !== null ? totalRevenue - fleetOpex : null;
  const programmeCost = requiredShips !== null ? i.preCapex + requiredShips * i.capex : null;
  const breakevenYears =
    programmeCost !== null && fleetProfit !== null && fleetProfit > 0
      ? programmeCost / fleetProfit
      : null;

  return {
    tonKmPerShip,
    requiredShips,
    co2AvoidedMt,
    freightRevenue,
    carbonRevenue,
    totalRevenue,
    revenuePerShip,
    marginPerShip,
    paybackYears,
    fleetOpex,
    fleetProfit,
    programmeCost,
    breakevenYears,
  };
}

// ---------------------------------------------------------------- log sliders

/**
 * V1 range inputs run 0–100 in view units; prices spanning orders of magnitude
 * (rate 0.5¢–$2, capex $10M–$1B) need a log mapping or the slider wastes all its
 * travel at the top end.
 */
export const logSlider = (min, max) => ({
  toValue: (view) => min * Math.pow(max / min, view / 100),
  toView: (value) => (100 * Math.log(value / min)) / Math.log(max / min),
});

// Defaults are the EAS "ideal" scenario (Toby, 2026-07-24) — the page loads on them,
// and the pink EAS button on the Economics page returns to them after any changes:
//   rate 28¢ — a solid undercut of ~40¢ air freight for the beachhead segment
//   carbon $80 — EU-ETS-class pricing
//   capex $150M, opex $80M all-in, pre-capex $10B programme
export const RATE = { min: 0.005, max: 2.0, default: 0.28 };       // $/tonne-km
export const CARBON = { min: 0, max: 400, default: 80 };           // $/tonne CO2
export const CAPEX = { min: 10e6, max: 1e9, default: 150e6 };      // $/Sunship
export const OPEX = { min: 10e6, max: 200e6, default: 80e6 };      // $/Sunship/yr, all-in (linear — only a 20x span)
export const PRECAPEX = { min: 100e6, max: 20e9, default: 10e9 };  // $ one-off programme (log — 200x span)

export const RATE_PRESETS = [
  { label: 'Ocean', value: 0.01 },
  { label: 'EAS Target', value: 0.10 },
  { label: 'Air Freight', value: 0.40 },
];

// Carbon anchors, researched July 2026 (see V2-ROADMAP / chat notes):
//   VCM      — credible voluntary-market avoidance credits trade ~$10–30/t today
//              (the $1–5 headlines are the junk tier). Conservative default: $20.
//   EU ETS   — allowances ~€80–82 (≈$85) in July 2026; shipping is already covered
//              on EU-touching voyages, so this is a customer's avoided cost there.
//   IMO Tier 2 — the Net-Zero Framework's higher remedial-unit price, $380/tCO2e
//              fixed for 2028–2030; over-performing ships EARN tradeable surplus
//              units, which is precisely EAS's position. Adoption re-vote Oct 2026.
export const CARBON_PRESETS = [
  { label: 'VCM', value: 15 },
  { label: 'EU ETS', value: 85 },
  { label: 'IMO Tier 2', value: 380 },
];


// ---------------------------------------------------------------- formatting

/** "$650.00B", "$10.00T", "$418.7M", "−$50.0M" — one tier, sign out front, never NaN. */
export function fmtMoney(v) {
  if (v === null || !Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

/** Rate shown in cents: "10.0¢" (sub-$1 territory is where all the anchors live). */
export function fmtRate(v) {
  const cents = v * 100;
  return cents >= 100 ? `$${v.toFixed(2)}` : `${cents.toFixed(1)}¢`;
}

export function fmtPayback(years) {
  if (years === null || !Number.isFinite(years)) return '—';
  if (years > 999) return '>999 yrs';
  if (years > 0 && years < 0.05) return '<0.1 yrs'; // beachhead pricing can pay back in weeks — "0.0 yrs" reads broken
  return `${years.toFixed(1)} yrs`;
}

/** Parse a V1 display value: strips locale commas; empty/garbage -> 0. */
export function parseDisplay(text) {
  const n = parseFloat(String(text ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
