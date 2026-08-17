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
  nav a[href="/dynamic"] + .header-nav-separator { display: none; } /* its orphaned ">" too */
  /* Results strip: 8 blocks must fit ONE line (Toby 2026-08-17) —
     compact type + flexible blocks; the key result reads EAS berry. */
  /* One row of blocks; titles may WRAP to two lines so the values can
     be big and the blocks close (Toby, 2026-08-17). */
  .section-dynamic .dyn-results-row {
    flex-wrap: nowrap; display: flex; gap: 26px; align-items: end;
    justify-content: space-between; /* content-hugging blocks, edge to edge — no dead margins */
    padding: 0 6px;
  }
  /* Blocks hug their content (no stretched empty columns — Toby's
     red circles, 2026-08-17); the row spreads edge to edge and the
     recovered space goes into TYPE SIZE. */
  .section-dynamic .dyn-results-row > div { min-width: 0; flex: 0 1 auto; }
  .section-dynamic .fleet-results-data-header {
    font-size: 14px; letter-spacing: .02em; line-height: 1.25;
    white-space: nowrap;
  }
  .section-dynamic .dyn-hdr-sub { font-size: 12px; color: #777; }
  .section-dynamic .fleet-results-data { font-size: 32px; white-space: nowrap; }
  /* WIDER ribbons (Toby, 2026-08-17: "slightly more obnoxious") — the
     page content steps clear of them; the statics page's ribbon grows
     widest since no text competes there. */
  .section-dynamic { padding-left: 52px; box-sizing: border-box; }
  [data-section="ship"] { padding-right: 64px; box-sizing: border-box; }
  .section-dynamic .ship-ribbon.rib-left { width: 44px; }
  /* STATICS reads BOTTOM-TO-TOP (Toby, 2026-08-17) — mirrored against
     the other ribbon; chevrons keep their true direction. */
  .section-dynamic .ship-ribbon.rib-left span:not(.chev) { transform: rotate(180deg); }
  /* Results numbers sit lower — reclaim the dead strip under them for
     the visualiser (Toby's red ellipse). */
  .section-dynamic .dyn-results-row { margin-bottom: -12px; }
  .section-dynamic .ship-ribbon.rib-left:hover { width: 58px; }
  [data-section="ship"] .ship-ribbon.rib-right { width: 56px; font-size: 19px; }
  [data-section="ship"] .ship-ribbon.rib-right:hover { width: 72px; }
  .section-dynamic .dyn-key-result { color: #c628a4; font-weight: 700; }
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
  /* VERTICAL edge ribbons (Toby refinement #3, 2026-08-17: "L and R is
     what i'd always imagined") — STATICS collapses to the LEFT edge
     (arrows point right: press and it sweeps in rightward); DYNAMICS
     collapses to the RIGHT edge (arrows point left). Fixed to the
     viewport edge so they can't be missed or scrolled away. */
  .ship-ribbon {
    position: fixed; z-index: 30; top: 110px; bottom: 24px; width: 30px;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; box-sizing: border-box;
    background: repeating-linear-gradient(90deg, rgba(255,153,0,.28) 0 2px, #161616 2px 5px);
    border: 1px solid #ff9900; border-top: none; border-bottom: none;
    color: #c628a4; font-size: 17px; font-weight: 700;
    letter-spacing: .22em; cursor: pointer; user-select: none;
    writing-mode: vertical-rl; text-orientation: mixed;
    transition: width .18s ease, filter .18s ease; overflow: hidden;
  }
  .ship-ribbon:hover { width: 44px; filter: brightness(1.35); }
  .ship-ribbon .chev { font-size: 14px; color: #ff9900; writing-mode: horizontal-tb; }
  .ship-ribbon.rib-left { left: 0; border-left: none; }
  .ship-ribbon.rib-right { right: 0; border-right: none; }
  .ship-ribbon.opening { width: 34vw; color: #ff9900; transition: width .35s ease-in, color .2s ease; }
  /* Accordion unfold, now horizontal: the incoming page stretches open
     from the edge it was squished into. */
  @keyframes ship-unfold-x { from { transform: scaleX(0.04); opacity: .35; } 60% { opacity: 1; } to { transform: scaleX(1); } }
  .ship-enter-left { animation: ship-unfold-x .8s cubic-bezier(.2,.7,.3,1); transform-origin: left center; }
  .ship-enter-right { animation: ship-unfold-x .8s cubic-bezier(.2,.7,.3,1); transform-origin: right center; }
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
  // Arrows point the direction the page will sweep: STATICS (left
  // edge) sweeps rightward '❯'; DYNAMICS (right edge) sweeps left '❮'.
  chev.textContent = side === 'left' ? '❯' : '❮';
  const label = document.createElement('span');
  label.textContent = targetLabel;
  rib.append(chev, label, chev.cloneNode(true));
  rib.addEventListener('click', () => {
    viaRibbon = true; // ribbons flow straight between sections — no chooser
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
  // STATICS lives squished on the LEFT of DYNAMICS; DYNAMICS lives
  // squished on the RIGHT of STATICS (Toby's L/R mental model).
  const ship = $('[data-section="ship"]');
  if (ship && !ship.querySelector('.ship-ribbon')) {
    ship.appendChild(makeRibbon('right', 'dynamics', 'DYNAMICS', navDynamic, 'ship-enter-right'));
  }
  const dyn = [...document.querySelectorAll('section')].find((s) => s.querySelector('.dyn-eas-chip'));
  if (dyn && !dyn.querySelector('.ship-ribbon')) {
    dyn.prepend(makeRibbon('left', 'statics', 'STATICS', navShip, 'ship-enter-left'));
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
let viaRibbon = false; // ribbon navigations bypass the chooser
function boot() {
  ensureSwitchers();
  // Direct /dynamic entry = the DYNAMICS choice, recorded.
  if (location.pathname === '/dynamic' && !getMode()) setMode('dynamics');
  // The SHIP title is the way BACK to the choice screen (Toby ruling
  // 2026-08-17, amending the one-way door): every top-nav Ship click
  // re-presents the chooser — it's the hub, and once the diagram art
  // lands it's worth revisiting. Ribbons still flow straight between
  // sections without it.
  navShip()?.addEventListener('click', () => {
    if (viaRibbon) { viaRibbon = false; return; }
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
