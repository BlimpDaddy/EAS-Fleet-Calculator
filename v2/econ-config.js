/**
 * ECONOMICS PAGE CONFIG — safe to edit by hand (Toby-friendly).
 *
 * Change the numbers, save, refresh the browser. That's it.
 * Keep the commas and braces exactly as they are — if the page stops working
 * after an edit, undo your change (or ask Claude to `git checkout` this file).
 *
 * Underscores in numbers are just thousand-separators: 150_000_000 = $150 million.
 *
 * NOT in this file (they live inside V1's compiled bundle, ask Claude to change):
 * ship page defaults (0m / 0°C), fleet ideal button (0.33 Ttkm), fleet market
 * preset buttons (Air Freight / Container / Global Maritime).
 */

// Each slider: minimum, maximum, and default. The DEFAULTS are also what the pink
// EAS button on the Economics page restores — defaults ARE the EAS scenario.

export const RATE = {                 // Freight rate, $ per tonne-km
  min: 0.005,                         //   0.5¢  (the lowest PRICED rate)
  max: 2.0,                           //   $2.00
  default: 0.25,                      //   25¢ — solid undercut of ~40¢ air freight
  // The slider ALSO has a hard zero stop at its far left, one notch below
  // min: "freight not priced yet". That is where the page BOOTS (Toby,
  // 2026-08-18), so Economics greets you the way every other page does —
  // Ship at 0 m, Dynamics parked at 0 km/h — with the headline blank until
  // you either press the pink EAS button or move the slider yourself.
  // Unpriced is not "priced at zero": every money figure reads "—".
};

export const CARBON = {               // Carbon price, $ per tonne CO2
  min: 0,
  max: 400,
  default: 80,                        //   EU-ETS-class
};

export const CAPEX = {                // Build cost, $ per Sunship
  min: 10_000_000,                    //   $10M
  max: 1_000_000_000,                 //   $1B
  default: 300_000_000,               //   $300M
};

export const OPEX = {                 // Operating cost, $ per Sunship per year, all-in
  min: 10_000_000,                    //   $10M
  max: 200_000_000,                   //   $200M
  default: 100_000_000,               //   $100M
};

export const PRECAPEX = {             // One-off programme cost (R&D, testing, approval)
  min: 100_000_000,                   //   $100M
  max: 20_000_000_000,                //   $20B
  default: 10_000_000_000,            //   $10B
};

// Preset buttons under the Freight Rate slider (label shown on the button, value in $/tkm)
export const RATE_PRESETS = [
  { label: 'Ocean', value: 0.02 },          // 2¢
  { label: 'Middle Option', value: 0.20 },  // 20¢
  { label: 'Air Freight', value: 0.40 },    // ~40¢
];

// Preset buttons under the Carbon Price slider (researched July 2026:
// VCM = credible voluntary credits; EU ETS = ~€80-82 allowances, shipping already
// covered on EU voyages; IMO Tier 2 = Net-Zero Framework remedial units 2028-2030,
// adoption re-vote Oct 2026 — over-performing ships EARN tradeable surplus units)
export const CARBON_PRESETS = [
  { label: 'VCM', value: 15 },
  { label: 'EU ETS', value: 85 },
  { label: 'IMO Tier 2', value: 380 },
];

// The link at the bottom of the COPY SUMMARY text
export const SUMMARY_LINK = 'calc.electricairshipping.com';
