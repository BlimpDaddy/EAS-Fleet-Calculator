/**
 * CO2 DISPLACEMENT MODEL CONFIG — safe to edit by hand (Toby-friendly).
 *
 * WHAT THIS IS
 * The calculator allocates EAS freight work against the two markets it would
 * actually displace, in order of carbon intensity: long-haul air freight first
 * (tiny market, ferociously carbon-intense), then global seaborne freight
 * (enormous market, remarkably carbon-lean). Long-haul air freight emits
 * roughly 66x the direct CO2 of shipping per tonne-km (531 g vs ~8 g), so the
 * first ~0.3% of the freight-work scale contains roughly the first 12% of the
 * combined CO2 opportunity. That front-loading is real, sourced, and the
 * point of the curve's shape.
 *
 * THE PHILOSOPHY (why displacement displays at full strength)
 * Every tonne on an EAS airship was otherwise travelling on a plane or a ship
 * — its emissions are removed. This is an EQUIVALENT-WORK calculation, not a
 * 1-for-1 exact "this parcel would have been on that exact plane" calculation.
 * Maxing the calculator = the complete bounding scenario = 100% of the modelled
 * emissions removed, the same way maxing the market slider has always meant
 * "all of global freight".
 *
 * THE 20% NERF (CREDIT_FRACTION)
 * Carbon REVENUE is discounted to 80% of the displaced CO2, at every market
 * size. This is a single deliberate smudge factor standing in for many complex
 * second-order real-world phenomena — residual premium/speed air routes that
 * keep flying, imperfect route/cargo substitution, crediting-mechanism
 * frictions, additionality haircuts. We chose one honest dial over a false
 * precision of many. The physical displacement figure is NOT discounted; only
 * the money is.
 *
 * SOURCES (all verified against primary documents 2026-08-10; full audit
 * trail in CodeEverything/CO2-DISPLACEMENT-MODEL.md):
 * - Seaborne work: UNCTAD Review of Maritime Transport 2025 — 66,781 billion
 *   tonne-nautical-miles (2024) = ~124 T tonne-km.
 *   https://unctad.org/system/files/official-document/rmt2025ch1_en.pdf
 * - Shipping CO2: IMO Fourth GHG Study — 1,056 Mt total shipping (2018),
 *   rounded down to 1,000.
 * - Air cargo market: ICAO 2023 FTK (258.1B global / 220.2B intl) grown by
 *   IATA's +11.3%/+3.4% (2024/2025) => ~0.30 T global, ~0.257 T intl tonne-km.
 * - Air freight CO2 factor: UK DESNZ/DEFRA 2025 GHG Conversion Factors,
 *   "Freight flights, long-haul/international": 0.5313 kg CO2e per tonne-km —
 *   DIRECT combustion only, excluding radiative forcing (0.899 with RF) and
 *   well-to-tank (+0.135). Using the smallest defensible number on purpose.
 *   0.257 T t-km x 0.5313 kg/t-km = ~137 Mt, rounded DOWN to 135.
 * - 0.33 T threshold: NOT a market statistic — a deliberately conservative
 *   saturation threshold with ~11-28% headroom over the measured market,
 *   because real substitution is never perfectly efficient.
 */

export const AIR_TRANSITION_TTR = 0.33;  // T tonne-km/yr, air-phase saturation threshold
export const AIR_CO2_MT = 135;           // Mt CO2/yr, the long-haul air-freight pool

export const MARINE_WORK_TTR = 124;      // T tonne-km/yr, global seaborne freight work
export const MARINE_CO2_MT = 1000;       // Mt CO2/yr, global shipping direct CO2

export const TOTAL_CO2_MT = AIR_CO2_MT + MARINE_CO2_MT; // 1135 — the whole modelled problem

export const CREDIT_FRACTION = 0.8;      // share of displaced CO2 that earns carbon
                                         // revenue — the 20% nerf described above

// Global fossil CO2 emissions — the denominator for the fleet results
// "Global Total" line (Toby, 2026-08-17). Global Carbon Budget 2024:
// fossil CO2 ~37.4 Gt/yr (fossil + cement, excluding land use — the
// conservative/smaller denominator, consistent with the direct-
// combustion-only stance above). Toby-editable.
export const GLOBAL_FOSSIL_CO2_MT = 37400; // Mt CO2/yr
