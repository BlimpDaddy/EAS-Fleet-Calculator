/**
 * GEOMETRY WARNINGS (Toby, 2026-08-17, two rulings squeezed pre-1.88):
 *
 * 1. RECTILINEAR — statics page, orange, after the metres output:
 *    "Rectilinear Detected. Poor Structural Scaling". Test: BOX-FILL
 *    fraction (volume ÷ bounding box) ≥ 0.75 — a brick fills its box,
 *    a hull doesn't. Measured: washingmachine 0.972, car 0.819 flag;
 *    everything else ≤ 0.568. (The 90°-dihedral scan proper is the
 *    backlogged structural screen; box-fill is its honest cheap proxy
 *    — the shoulder trigger was tried and fires too broadly.)
 *
 * 2. POOR DIRECTIONALITY — shape page, orange, after the shape name:
 *    "Poor 'Inherent Directionality' Detected". Test: any two of the
 *    three pairwise extent ratios equal (±2%) AND both < 3 — a square
 *    cross-section with nothing long enough to point somewhere. The
 *    cigar (5/5) and bottle (3.5/3.5) escape via the <3 condition by
 *    construction of the rule; the Sunship escapes on tolerance
 *    (1.21 vs 1.27). RIGGED per Toby: washingmachine always flags —
 *    its lip breaks the exact-box ratios; model update later.
 *
 * Both spans carry class v2-warn + title, so the fleet Required-line
 * flags and the copy-summary collectors pick them up with zero extra
 * wiring (title emptied when inactive — collectors skip untitled).
 */
import { PRESET_DYNAMICS } from '/calcv2/src/presetDynamics.js';

const $ = (s) => document.querySelector(s);
const RECT_FILL = 0.75, RATIO_TOL = 0.02, RATIO_MAX = 3;
const RECT_TEXT = 'Rectilinear Structural Scaling!';
const DIR_TEXT = "Poor 'Inherent Directionality' Detected!";

const activeDyn = () => {
  const s = window.__v2ActiveShape;
  if (!s) return { id: 'sunship', dyn: PRESET_DYNAMICS.sunship };
  return s.kind === 'preset'
    ? { id: s.id, dyn: PRESET_DYNAMICS[s.id] }
    : { id: null, dyn: s.dynamics };
};
const isRect = (d) => {
  if (!d || !d.raw || !Number.isFinite(d.raw.volumeRaw)) return false;
  const [x, y, z] = d.raw.extents;
  return d.raw.volumeRaw / (x * y * z) >= RECT_FILL;
};
const poorDir = (d, id) => {
  if (id === 'washingmachine') return true; // RIGGED (see header)
  if (!d || !d.raw) return false;
  const s = [...d.raw.extents].sort((a, b) => b - a);
  const r = [s[0] / s[1], s[0] / s[2], s[1] / s[2]];
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (Math.abs(r[i] - r[j]) / r[j] <= RATIO_TOL && r[i] < RATIO_MAX && r[j] < RATIO_MAX) return true;
  }
  return false;
};

// ICON-ONLY (Toby refinement 2026-08-17): the same amber triangle the
// shape page uses (shape-upload.js), text on hover only — the long
// inline text was reflowing boxes.
const WARN_SVG =
  '<svg viewBox="0 0 24 22" width="0.85em" height="0.85em" aria-label="warning">' +
  '<path d="M12 1 L23 21 H1 Z" fill="#FF9900"/>' +
  '<rect x="10.9" y="7.5" width="2.2" height="7" rx="1.1" fill="#111111"/>' +
  '<circle cx="12" cy="17.5" r="1.4" fill="#111111"/></svg>';
const style = document.createElement('style');
style.textContent = '.v2-warn-geom { margin-left: .35em; cursor: help; display: inline-block; line-height: 1; vertical-align: baseline; }';
document.head.appendChild(style);

const mkSpan = (extraClass) => {
  const s = document.createElement('span');
  s.className = `v2-warn v2-warn-geom ${extraClass}`;
  return s;
};
const setWarn = (span, on, text) => {
  span.innerHTML = on ? WARN_SVG : '';
  span.title = on ? text : '';
  span.style.display = on ? '' : 'none';
};

// Statics: after the metres output value.
const lengthOut = $('[data-ship="length-output"]');
const rectSpan = mkSpan('v2-warn-static');
if (lengthOut) lengthOut.closest('.ship-control-output')?.appendChild(rectSpan);

// Shape page: INSIDE the shape name cell, inline after the name
// (Toby alignment fix 2026-08-17: a sibling span became its own grid
// item and wrapped to a new line, throwing the results grid off — the
// VS warning glyphs live inside their cells, so does this one). V1
// rewrites the cell's textContent on shape change, nuking children —
// the observer below re-appends (childList only, no subtree, and the
// append is guarded so it can't loop).
const nameCell = $('[data-shape="shape"]');
const dirSpan = mkSpan('v2-warn-dir');
if (nameCell) {
  nameCell.appendChild(dirSpan);
  new MutationObserver(() => {
    if (dirSpan.parentElement !== nameCell) { nameCell.appendChild(dirSpan); sync(); }
  }).observe(nameCell, { childList: true });
}

// NET LIFT (Toby 2026-08-17): strictly negative — "not exactly 0,
// just under" — shows a single ⚠ 'No Lift!' beside the tonnes (the
// v2-warn-static class feeds the copy summary + fleet flags free);
// and the VALUE reads BERRY above 500 t, plain white otherwise.
const netliftOut = $('[data-ship="netlift-output"]');
const liftSpan = mkSpan('v2-warn-static');
if (netliftOut) {
  netliftOut.parentElement.appendChild(liftSpan);
  const syncLift = () => {
    const v = Number(netliftOut.textContent.replace(/[^\d.-]/g, ''));
    setWarn(liftSpan, Number.isFinite(v) && v < 0, 'No Lift!');
    netliftOut.style.color = Number.isFinite(v) && v > 500 ? '#c628a4' : '';
  };
  new MutationObserver(syncLift).observe(netliftOut, { childList: true, characterData: true, subtree: true });
  syncLift();
}

const sync = () => {
  const { id, dyn } = activeDyn();
  // Rectilinear shows only at 100 m and above (Toby 2026-08-17) —
  // structural scaling is a big-ship complaint.
  const metres = Number(String(lengthOut?.textContent ?? '').replace(/[^\d.]/g, ''));
  setWarn(rectSpan, isRect(dyn) && metres >= 100, RECT_TEXT);
  setWarn(dirSpan, poorDir(dyn, id), DIR_TEXT);
};
window.addEventListener('v2-shape-change', sync);
if (lengthOut) new MutationObserver(sync).observe(lengthOut, { childList: true, characterData: true, subtree: true });
sync();
