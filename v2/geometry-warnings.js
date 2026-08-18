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
import { PRESET_DYNAMICS } from '/calcv2/src/presetDynamics.js?v=1.13'  // engine cache stamp — see dynamic-page.js;

const $ = (s) => document.querySelector(s);
// r21 #1 FIX: box-fill ALONE cannot mean "rectilinear" — a perfectly
// smooth circular cylinder has box-fill π/4 ≈ 0.785 and would have
// tripped the old ≥0.75 test with no rectilinear geometry at all
// (reviewer's counterexample, confirmed). Rectilinear now requires
// BOTH: the bulk fills its box (≥0.75) AND *every* axis silhouette is
// near-rectangular (≥0.80) — a box is a rectangle from all three
// sides; a cylinder is a circle from one (0.785, so it escapes).
// Measured: washing machine 0.972/0.972 flags · car 0.819/0.822 flags
// (Toby's ruling that a 300 m car deserves a red) · cigar 0.568/0.783,
// bottle 0.560/0.735, lenticular 0.464/0.752, Sunship 0.458/0.689 all
// pass. DECLARED LIMIT: the cylinder's margin is 0.785 vs 0.80 (~2%),
// and a deliberately squared-off smooth body (high-exponent
// superellipsoid) can still trip it — it would also look box-like.
const RECT_FILL = 0.75, RECT_SIL = 0.80;
// r21 #2 FIX: the old test compared DERIVED extent RATIOS pairwise,
// which false-positives on genuinely directional bodies — a 4:2:1 hull
// yields ratios 2/4/2, and the first and third match below 3
// (reviewer's counterexample, confirmed). The physical question is
// axis ambiguity, so it now tests the EXTENTS themselves: two of the
// three within ±2% (a square cross-section) AND overall slenderness
// (longest ÷ shortest) below 3 — nothing long enough to point.
// Verified: lenticular 1.99/1.99/0.86 → equal pair, slenderness 2.31
// → FLAGS (owner-confirmed: it wants to spin) · cigar (5.00) and
// bottle (3.50) escape on slenderness · Sunship has no equal pair
// (0.811 vs 0.772 = 5%) · 4:2:1 now correctly passes.
const EXT_TOL = 0.02, SLENDER_MIN = 3;
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
  const f = d.raw.frontalRaw;
  if (!f || ![f.X, f.Y, f.Z].every(Number.isFinite)) return false;
  const boxFill = d.raw.volumeRaw / (x * y * z);
  // Each axis silhouette ÷ the rectangle of the other two extents.
  const minSil = Math.min(f.X / (y * z), f.Y / (x * z), f.Z / (x * y));
  return boxFill >= RECT_FILL && minSil >= RECT_SIL;
};
const poorDir = (d, id) => {
  if (id === 'washingmachine') return true; // RIGGED (see header)
  if (!d || !d.raw) return false;
  const s = [...d.raw.extents].sort((a, b) => b - a);
  if (!(s[2] > 0)) return false;
  const equalPair = Math.abs(s[0] - s[1]) / s[1] <= EXT_TOL
    || Math.abs(s[1] - s[2]) / s[2] <= EXT_TOL
    || Math.abs(s[0] - s[2]) / s[2] <= EXT_TOL;
  return equalPair && s[0] / s[2] < SLENDER_MIN;
};

// ICON-ONLY (Toby refinement 2026-08-17): the same amber triangle the
// shape page uses (shape-upload.js), text on hover only — the long
// inline text was reflowing boxes.
const warnSvg = (fill, mark) =>
  '<svg viewBox="0 0 24 22" width="0.85em" height="0.85em" aria-label="warning">' +
  `<path d="M12 1 L23 21 H1 Z" fill="${fill}"/>` +
  `<rect x="10.9" y="7.5" width="2.2" height="7" rx="1.1" fill="${mark}"/>` +
  `<circle cx="12" cy="17.5" r="1.4" fill="${mark}"/></svg>`;
const WARN_SVG = warnSvg('#FF9900', '#111111');
const WARN_SVG_RED = warnSvg('#FF2A2A', '#FFFFFF');
const style = document.createElement('style');
style.textContent = '.v2-warn-geom { margin-left: .35em; cursor: help; display: inline-block; line-height: 1; vertical-align: baseline; }';
document.head.appendChild(style);

const mkSpan = (extraClass) => {
  const s = document.createElement('span');
  s.className = `v2-warn v2-warn-geom ${extraClass}`;
  return s;
};
const setWarn = (span, on, text, level = 'orange') => {
  span.innerHTML = on ? (level === 'red' ? WARN_SVG_RED : WARN_SVG) : '';
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
    const berry = Number.isFinite(v) && v > 500 ? '#c628a4' : '';
    netliftOut.style.color = berry;
    const unit = document.querySelector('[data-ship="netlift-unit"]');
    if (unit) unit.style.color = berry; // 'tonnes' goes berry with the number (Toby)
  };
  new MutationObserver(syncLift).observe(netliftOut, { childList: true, characterData: true, subtree: true });
  syncLift();
}

const sync = () => {
  const { id, dyn } = activeDyn();
  // Rectilinear severity by size (Toby 2026-08-17): 50–150 m ORANGE,
  // 150 m+ RED — structural scaling bites harder the bigger the brick
  // (the car at 300 m earns its red). Below 50 m: silent.
  const metres = Number(String(lengthOut?.textContent ?? '').replace(/[^\d.]/g, ''));
  setWarn(rectSpan, isRect(dyn) && metres >= 50, RECT_TEXT, metres >= 150 ? 'red' : 'orange');
  setWarn(dirSpan, poorDir(dyn, id), DIR_TEXT);
};
window.addEventListener('v2-shape-change', sync);
if (lengthOut) new MutationObserver(sync).observe(lengthOut, { childList: true, characterData: true, subtree: true });
sync();
