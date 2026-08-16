/**
 * PAGE-2 SPLIT — the SHIP chooser + STATICS ⇄ DYNAMICS switcher
 * (Toby's design ruling 2026-08-17; discharges the backlogged
 * "Dynamic becomes a sub-button of Ship" ruling of 2026-08-15).
 *
 * WHAT:
 *  - The top-nav DYNAMIC link is hidden (the ROUTE stays alive — V1
 *    routes by attribute, deep links to /dynamic keep working; the
 *    bundle is never edited).
 *  - First entry to SHIP each session: a full-section CHOOSER overlay —
 *    two STACKED buttons, STATICS on top, DYNAMICS beneath (vertical
 *    order teaches the dependency order; art slots carry placeholder
 *    glyphs until the real diagrams land).
 *  - The choice is a ONE-WAY DOOR per session (sessionStorage): the
 *    chosen section swipes in and the both-buttons greeting never
 *    reappears that session; a compact switcher chip on BOTH sections
 *    handles all later movement. A fresh session greets again — the
 *    pedagogy is for first sight, not a toll gate.
 *  - Entering /dynamic directly counts as choosing DYNAMICS.
 *
 * Pure adapter: selects and augments DOM, computes nothing (r6 rule);
 * navigation happens through V1's own nav anchors.
 */

const MODE_KEY = 'eas-ship-mode'; // 'statics' | 'dynamics' — session-scoped

const $ = (sel) => document.querySelector(sel);
const navShip = () => $('nav a[href="/ship"]');
const navDynamic = () => $('nav a[href="/dynamic"]');

function getMode() {
  try { return sessionStorage.getItem(MODE_KEY); } catch { return null; }
}
function setMode(m) {
  try { sessionStorage.setItem(MODE_KEY, m); } catch { /* private mode: greeting simply reappears */ }
}

/* ---- styles (V1 tokens: #111 bg, #eee text, #ff9900 orange, #c628a4 pink) ---- */
const style = document.createElement('style');
style.textContent = `
  nav a[href="/dynamic"] { display: none; } /* sub-section now — reached via SHIP */
  .ship-chooser {
    position: absolute; inset: 0; z-index: 40; display: flex;
    flex-direction: column; gap: 18px; align-items: center;
    justify-content: center; background: #111;
    transition: transform .45s ease, opacity .45s ease;
  }
  .ship-chooser.swipe-out { transform: translateX(-100%); opacity: 0; pointer-events: none; }
  .ship-chooser button {
    width: min(520px, 80%); padding: 26px 22px; background: #191919;
    border: 1px solid #474747; border-radius: 10px; color: #eee;
    font: inherit; cursor: pointer; text-align: left;
    display: flex; align-items: center; gap: 18px;
    transition: border-color .15s ease, transform .15s ease;
  }
  .ship-chooser button:hover { border-color: #ff9900; transform: translateY(-2px); }
  .ship-chooser .glyph { font-size: 30px; width: 56px; text-align: center; flex: none; }
  .ship-chooser .title { font-size: 19px; letter-spacing: .06em; color: #ff9900; }
  .ship-chooser .sub { font-size: 13px; color: #888; margin-top: 4px; }
  .ship-chooser .order-hint { font-size: 12px; color: #666; letter-spacing: .04em; }
  .ship-switch {
    display: inline-flex; gap: 0; margin: 0 0 10px 0; border: 1px solid #474747;
    border-radius: 6px; overflow: hidden; font-size: 12px; letter-spacing: .06em;
  }
  .ship-switch button {
    background: #191919; color: #888; border: none; padding: 6px 14px;
    font: inherit; font-size: 12px; cursor: pointer;
  }
  .ship-switch button.active { background: #2a2115; color: #ff9900; }
`;
document.head.appendChild(style);

/* ---- the switcher chip (one per section, same behaviour) ---- */
function makeSwitcher(active) {
  const wrap = document.createElement('div');
  wrap.className = 'ship-switch';
  for (const [key, label, nav] of [['statics', 'STATICS', navShip], ['dynamics', 'DYNAMICS', navDynamic]]) {
    const b = document.createElement('button');
    b.textContent = label;
    if (key === active) b.classList.add('active');
    else b.addEventListener('click', () => { setMode(key); nav()?.click(); });
    wrap.appendChild(b);
  }
  return wrap;
}

function ensureSwitchers() {
  const ship = $('[data-section="ship"]');
  if (ship && !ship.querySelector('.ship-switch')) ship.prepend(makeSwitcher('statics'));
  const dyn = [...document.querySelectorAll('section')].find((s) => s.querySelector('.dyn-eas-chip'));
  if (dyn && !dyn.querySelector('.ship-switch')) dyn.prepend(makeSwitcher('dynamics'));
}

/* ---- the chooser overlay (first SHIP entry per session) ---- */
function buildChooser(shipSection) {
  const overlay = document.createElement('div');
  overlay.className = 'ship-chooser';
  const hint = document.createElement('div');
  hint.className = 'order-hint';
  hint.textContent = 'TWO QUESTIONS, IN ORDER';
  const mk = (glyph, title, sub, onPick) => {
    const b = document.createElement('button');
    const g = document.createElement('span'); g.className = 'glyph'; g.textContent = glyph;
    const tx = document.createElement('span');
    const t = document.createElement('div'); t.className = 'title'; t.textContent = title;
    const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub;
    tx.append(t, s);
    b.append(g, tx);
    b.addEventListener('click', onPick);
    return b;
  };
  // Placeholder glyphs — the aerostatics / aerodynamics diagram art
  // replaces these later (Toby, 2026-08-17).
  const statics = mk('☁︎↺', 'STATICS', 'Can it lift? Size, buoyancy, net lift.', () => {
    setMode('statics');
    overlay.classList.add('swipe-out');
    setTimeout(() => overlay.remove(), 500);
  });
  const dynamics = mk('≋→', 'DYNAMICS', 'Can it fly? Drag, power, fuel.', () => {
    setMode('dynamics');
    overlay.classList.add('swipe-out');
    setTimeout(() => { overlay.remove(); navDynamic()?.click(); }, 380);
  });
  overlay.append(hint, statics, dynamics);
  const pos = getComputedStyle(shipSection).position;
  if (pos === 'static' || !pos) shipSection.style.position = 'relative';
  shipSection.appendChild(overlay);
}

/* ---- wiring ---- */
function boot() {
  ensureSwitchers();
  // Direct /dynamic entry = the DYNAMICS choice, recorded.
  if (location.pathname === '/dynamic' && !getMode()) setMode('dynamics');
  // First SHIP entry per session gets the greeting.
  navShip()?.addEventListener('click', () => {
    if (getMode()) return;
    const ship = $('[data-section="ship"]');
    if (ship && !ship.querySelector('.ship-chooser')) buildChooser(ship);
  });
  // Landing directly on /ship pristine also greets.
  if (location.pathname === '/ship' && !getMode()) {
    const ship = $('[data-section="ship"]');
    if (ship) buildChooser(ship);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
