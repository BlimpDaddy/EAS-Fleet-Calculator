/**
 * Phase A economics — PURE logic, no DOM. See V2-ROADMAP.md.
 *
 * Principle: physics gives quantities, sliders give prices, this module only
 * multiplies. Deliberately absent: fuel and any operating cost (a fixed fuel figure
 * is only true for the standard Sunship and would be silently wrong for anything
 * else — it arrives with the aerodynamics module). Hence payback here is SIMPLE
 * payback, labelled "before operating costs".
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
 */
export function computeEconomics(i) {
  // Work one Sunship performs per year. Same formula as V1's tonKmPerYear
  // (netLift × speed × utilisation × hours-in-year). Negative net lift means the
  // ship cannot fly, let alone earn — clamp to zero rather than print nonsense.
  const tonKmPerShip = Math.max(0, i.netLiftT) * i.airSpeedKmh * (i.utilisationPct / 100) * 8760;

  const freightRevenue = i.marketSizeTtkm * 1e12 * i.ratePerTkm;

  // CO2 avoided: V1's own linear proxy (1000 Mt per 122 Ttkm), recomputed here from
  // the raw market size for precision. Inherited deliberately — refining the
  // emissions model is future work (see roadmap).
  const co2AvoidedMt = i.marketSizeTtkm * (1000 / 122);
  const carbonRevenue = co2AvoidedMt * 1e6 * i.carbonPerT;

  const revenuePerShip = tonKmPerShip * i.ratePerTkm;

  // Simple payback, before operating costs. null = not meaningful (ship earns nothing).
  const paybackYears = revenuePerShip > 0 ? i.capex / revenuePerShip : null;

  return {
    tonKmPerShip,
    co2AvoidedMt,
    freightRevenue,
    carbonRevenue,
    totalRevenue: freightRevenue + carbonRevenue,
    revenuePerShip,
    paybackYears,
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

export const RATE = { min: 0.005, max: 2.0, default: 0.10 };       // $/tonne-km
export const CARBON = { min: 0, max: 400, default: 20 };           // $/tonne CO2
export const CAPEX = { min: 10e6, max: 1e9, default: 150e6 };      // $/Sunship

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

/** "$650.00B", "$10.00T", "$418.7M" — one tier, two/one decimals, never NaN. */
export function fmtMoney(v) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** Rate shown in cents: "10.0¢" (sub-$1 territory is where all the anchors live). */
export function fmtRate(v) {
  const cents = v * 100;
  return cents >= 100 ? `$${v.toFixed(2)}` : `${cents.toFixed(1)}¢`;
}

export function fmtPayback(years) {
  if (years === null || !Number.isFinite(years)) return '—';
  if (years > 999) return '>999 yrs';
  return `${years.toFixed(1)} yrs`;
}

/** Parse a V1 display value: strips locale commas; empty/garbage -> 0. */
export function parseDisplay(text) {
  const n = parseFloat(String(text ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
