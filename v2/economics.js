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
// ---------------------------------------------------------------- displacement

import {
  AIR_TRANSITION_TTR, AIR_CO2_MT, MARINE_WORK_TTR, MARINE_CO2_MT,
  TOTAL_CO2_MT, CREDIT_FRACTION,
} from './co2-config.js?v=1.8';

/**
 * Two-stage CO2 displacement: EAS freight work fills the long-haul air-freight
 * pool first (0 -> 0.33 TTr releases 135 Mt), then global seaborne freight
 * (the remaining ~124 TTr releases 1,000 Mt). Pool-fraction allocation, so the
 * model can never claim more avoidance than a pool contains. See co2-config.js
 * for the philosophy, the 20% revenue nerf, and every source.
 */
export function computeDisplacement(marketSizeTtkm) {
  const m = Math.max(0, marketSizeTtkm);
  const airWork = Math.min(m, AIR_TRANSITION_TTR);
  const airCO2Mt = (airWork / AIR_TRANSITION_TTR) * AIR_CO2_MT;
  const marineWork = Math.max(0, Math.min(m - AIR_TRANSITION_TTR, MARINE_WORK_TTR));
  const marineCO2Mt = (marineWork / MARINE_WORK_TTR) * MARINE_CO2_MT;
  const totalCO2Mt = airCO2Mt + marineCO2Mt;
  return { airCO2Mt, marineCO2Mt, totalCO2Mt, percent: (100 * totalCO2Mt) / TOTAL_CO2_MT };
}

export { CREDIT_FRACTION };

export function computeEconomics(i) {
  // An unfliable ship (net lift <= 0) earns nothing and serves nothing: EVERY output
  // goes null so callers print "—" across the board. The revenue lines used to keep
  // showing the market-level opportunity regardless (documented as intentional at the
  // V1.3 audit) — Toby reversed that 2026-08-02: a dead ship beside a live profit
  // figure reads as a bug, not an opportunity.
  const canFly = i.netLiftT > 0;

  // UNPRICED FREIGHT (Toby, 2026-08-18): the page now boots with the rate
  // slider on its zero stop, so Economics greets you blank like every other
  // page — Ship at 0 m, Dynamics parked — and the pink EAS button (or any
  // drag of the rate slider) is what produces the headline.
  //
  // Rate 0 is read as "not priced yet", NOT as "priced at zero", so EVERY
  // money figure goes null and callers print "—". That includes the carbon
  // credits, which don't depend on the rate at all: this is the same call
  // Toby made for canFly on 2026-08-02 — a live revenue figure sitting
  // beside a dashed total reads as a bug, not as extra information. The
  // physical quantities (work performed, ships required, CO2 displaced) are
  // NOT money and stay live throughout: the mission is real before anyone
  // has named a price for it.
  const isPriced = i.ratePerTkm > 0;
  const quotable = canFly && isPriced;

  // Work one Sunship performs per year. Same formula as V1's tonKmPerYear
  // (netLift × speed × utilisation × hours-in-year).
  const tonKmPerShip = canFly ? i.netLiftT * i.airSpeedKmh * (i.utilisationPct / 100) * 8760 : 0;

  // Fleet size needed to serve the market — V1's own formula, computed here (exact,
  // unrounded) rather than read from its display. null = the ship cannot fly.
  const requiredShips = tonKmPerShip > 0 ? (i.marketSizeTtkm * 1e12) / tonKmPerShip : null;

  const freightRevenue = quotable ? i.marketSizeTtkm * 1e12 * i.ratePerTkm : null;

  // CO2 avoided: the two-stage displacement model (air freight first, then
  // marine — see computeDisplacement/co2-config.js; replaced V1's linear
  // 1000-per-122 proxy 2026-08-10). Carbon revenue takes the 20% nerf:
  // displaced CO2 displays at full strength, only the money is discounted.
  // An IDLE fleet (fliable ship but zero airspeed/utilisation) avoids nothing:
  // 0, not null — the ship works, it just isn't flying yet.
  const co2AvoidedMt = !canFly ? null : tonKmPerShip > 0 ? computeDisplacement(i.marketSizeTtkm).totalCO2Mt : 0;
  const carbonRevenue = co2AvoidedMt === null || !isPriced
    ? null : co2AvoidedMt * 1e6 * i.carbonPerT * CREDIT_FRACTION;
  const totalRevenue = quotable ? freightRevenue + carbonRevenue : null;

  const revenuePerShip = quotable ? tonKmPerShip * i.ratePerTkm : null;
  const marginPerShip = quotable ? revenuePerShip - i.opexPerShip : null;

  // REAL payback per ship: capex against margin, not revenue. null = never pays back
  // (ship can't fly, or opex eats the revenue) — callers print "—", never negatives.
  const paybackYears = revenuePerShip > 0 && marginPerShip > 0 ? i.capex / marginPerShip : null;

  // Fleet- and programme-level figures. Steady-state by design: they assume the full
  // fleet is built and operating (no ramp model — see the on-page note).
  // Fleet opex is rate-INDEPENDENT and perfectly computable while unpriced —
  // it is nulled anyway, deliberately. The whole Results panel is one
  // financial statement; publishing its cost line while its revenue lines
  // are blank invites exactly the misreading (a fleet that only costs).
  const fleetOpex = quotable && requiredShips !== null ? requiredShips * i.opexPerShip : null;
  const fleetProfit = fleetOpex !== null ? totalRevenue - fleetOpex : null;
  const programmeCost = requiredShips !== null ? i.preCapex + requiredShips * i.capex : null;
  const breakevenYears =
    programmeCost !== null && fleetProfit !== null && fleetProfit > 0
      ? programmeCost / fleetProfit
      : null;

  return {
    canFly,
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

/**
 * A log slider with a HARD ZERO STOP at its far-left endpoint (Toby,
 * 2026-08-18, for the freight rate). A log map can never reach zero — its
 * whole point is that it never does — so zero is not part of the curve: it
 * is a detent one notch below `min`, exactly like the Airspeed slider's
 * parked 0 and the Ship page's 0 m.
 *
 * View 0 means UNPRICED, and the very next increment is `min`. The jump
 * from "no rate" to 0.5¢ is deliberate and honest: 0.5¢ already IS the
 * lowest rate the model will quote, so there is nothing in between to
 * represent. Callers must read view 0 as "the user hasn't answered yet",
 * never as "the user chose zero" — computeEconomics does exactly that.
 */
export const logSliderZeroStop = (min, max) => ({
  toValue: (view) => (view > 0 ? min * Math.pow(max / min, view / 100) : 0),
  toView: (value) => (value > 0 ? (100 * Math.log(value / min)) / Math.log(max / min) : 0),
});

// All slider ranges, defaults (= the EAS scenario the pink button restores), preset
// buttons and the summary link live in econ-config.js — a hand-editable file with no
// logic in it, so Toby can tune presets without touching code. Re-exported here so
// the rest of the app keeps importing everything from one module.
export {
  RATE, CARBON, CAPEX, OPEX, PRECAPEX,
  RATE_PRESETS, CARBON_PRESETS, SUMMARY_LINK,
} from './econ-config.js?v=1.11';


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

/** Rate shown in cents: "10.0¢" (sub-$1 territory is where all the anchors live).
 *  Zero is the slider's UNPRICED stop, not a price — it must never render as
 *  "0.0¢", which would read as a decision the user hasn't made. */
export function fmtRate(v) {
  if (!(v > 0)) return '—';
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
