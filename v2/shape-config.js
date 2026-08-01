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
};
