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
  /* THE RIBBON (Toby refinement 2026-08-17): the OTHER section,
     squished into a thin edge strip — bottom of STATICS holds
     DYNAMICS, top of DYNAMICS holds STATICS (the same vertical order
     the chooser taught). Press → it swipes open. */
  .ship-ribbon {
    position: sticky; z-index: 30; display: flex; align-items: center;
    justify-content: center; gap: 10px; width: 100%; height: 30px;
    grid-column: 1 / -1; align-self: stretch; box-sizing: border-box; left: 0;
    /* squished-page stripes in ORANGE + berry words (Toby, 2026-08-17:
       "no way to miss") */
    background: repeating-linear-gradient(180deg, rgba(255,153,0,.28) 0 2px, #161616 2px 5px);
    border: 1px solid #ff9900; border-left: none; border-right: none;
    color: #c628a4; font-size: 12px; font-weight: 600;
    letter-spacing: .14em; cursor: pointer;
    user-select: none; transition: height .18s ease, filter .18s ease;
    overflow: hidden;
  }
  .ship-ribbon:hover { height: 40px; filter: brightness(1.35); }
  .ship-ribbon .chev { font-size: 14px; color: #ff9900; }
  .ship-ribbon.rib-bottom { bottom: 0; margin-top: 14px; }
  .ship-ribbon.rib-top { top: 0; margin-bottom: 14px; }
  .ship-ribbon.opening { height: 34vh; color: #ff9900; transition: height .35s ease-in, color .2s ease; }
  /* ACCORDION UNFOLD (Toby refinement #2, 2026-08-17): the incoming
     page visibly STRETCHES open from the edge it was squished into —
     scaleY from ribbon-thin to full, contents un-squashing with it. */
  @keyframes ship-unfold-up { from { transform: scaleY(0.04); opacity: .35; } 60% { opacity: 1; } to { transform: scaleY(1); } }
  @keyframes ship-unfold-down { from { transform: scaleY(0.04); opacity: .35; } 60% { opacity: 1; } to { transform: scaleY(1); } }
  .ship-enter-up { animation: ship-unfold-up .8s cubic-bezier(.2,.7,.3,1); transform-origin: bottom center; }
  .ship-enter-down { animation: ship-unfold-down .8s cubic-bezier(.2,.7,.3,1); transform-origin: top center; }
`;
document.head.appendChild(style);

/* ---- the ribbons: the other section squished into an edge strip ----
 * STATICS carries DYNAMICS along its BOTTOM (press: it swipes UP into
 * view); DYNAMICS carries STATICS along its TOP (press: it swipes
 * DOWN). Chevron points the travel direction; the striped background
 * is the "squished page" hint. */
function makeRibbon(side, targetKey, targetLabel, nav, enterClass) {
  const rib = document.createElement('div');
  rib.className = `ship-ribbon rib-${side}`;
  rib.setAttribute('role', 'button');
  rib.title = `Open ${targetLabel}`;
  const chev = document.createElement('span');
  chev.className = 'chev';
  chev.textContent = side === 'bottom' ? '︿' : '﹀';
  const label = document.createElement('span');
  label.textContent = targetLabel;
  rib.append(chev, label, chev.cloneNode(true));
  rib.addEventListener('click', () => {
    setMode(targetKey);
    rib.classList.add('opening'); // the squished page starts expanding…
    setTimeout(() => {
      nav()?.click(); // …then V1 routes; the target UNFOLDS from its edge
      rib.classList.remove('opening');
      const target = targetKey === 'dynamics'
        ? [...document.querySelectorAll('section')].find((s) => s.querySelector('.dyn-eas-chip'))
        : $('[data-section="ship"]');
      if (target) {
        target.classList.add(enterClass);
        setTimeout(() => target.classList.remove(enterClass), 900);
      }
    }, 350); // ribbon-grow hands off into the page unfold (~1.15s total)
  });
  return rib;
}

function ensureSwitchers() {
  const ship = $('[data-section="ship"]');
  if (ship && !ship.querySelector('.ship-ribbon')) {
    ship.appendChild(makeRibbon('bottom', 'dynamics', 'DYNAMICS', navDynamic, 'ship-enter-up'));
  }
  const dyn = [...document.querySelectorAll('section')].find((s) => s.querySelector('.dyn-eas-chip'));
  if (dyn && !dyn.querySelector('.ship-ribbon')) {
    dyn.prepend(makeRibbon('top', 'statics', 'STATICS', navShip, 'ship-enter-down'));
  }
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
