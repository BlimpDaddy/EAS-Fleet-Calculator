/**
 * Shape-page warning thresholds — TOBY-EDITABLE, numbers and text only, no logic.
 *
 * A warning triangle appears next to a figure when it falls outside [low, high];
 * hovering it shows the text. Same idea as econ-config.js: tune these in Notepad,
 * refresh the page, done. Thresholds are calibrated constants applied identically
 * to every shape — never per-shape rules.
 */

export const VS_WARNINGS = {
  simpleVS: {
    low: 1.4,
    high: 4,
    lowText: 'VS too low!',
    highText: 'VS too high!',
  },
  vsInf: {
    low: 1.2,
    high: 2.5,
    lowText: 'VSinf too low!',
    highText: 'VSinf too high!',
  },
  ve: { // percent, matching the displayed figure
    // Low threshold 35 → 30 (Toby, 2026-08-17): the washing machine
    // (34.5%) now PASSES the volume test and is caught instead by the
    // page-1 directionality filter — the failure lands on the reason
    // that actually disqualifies it.
    low: 30,
    high: 80,
    lowText: 'VE too low!',
    highText: 'VE too high!',
    critical: 10, // below this the triangle turns red
    criticalText: 'VE critically low!',
  },
};
