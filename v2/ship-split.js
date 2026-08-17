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

// 'statics' | 'dynamics' — PER PAGE LOAD (Toby final ruling
// 2026-08-17: a hard refresh starts fresh, so the next SHIP press
// greets with the choice page again; within one loaded page, SHIP
// returns to the last-used sub-section). Deliberately NOT
// sessionStorage — that survived refreshes, which felt sticky-wrong.
let shipMode = null;

const $ = (sel) => document.querySelector(sel);
const navShip = () => $('nav a[href="/ship"]');
const navDynamic = () => $('nav a[href="/dynamic"]');

function getMode() { return shipMode; }
function setMode(m) { shipMode = m; }

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
    color: #eee; /* result titles WHITE (Toby 2026-08-17) — brackets stay grey below */
  }
  .section-dynamic .dyn-hdr-sub { font-size: 12px; color: #777; }
  .section-dynamic .fleet-results-data { font-size: 32px; white-space: nowrap; }
  /* WIDER ribbons (Toby, 2026-08-17: "slightly more obnoxious") — the
     page content steps clear of them; the statics page's ribbon grows
     widest since no text competes there. */
  .section-dynamic { padding-left: 52px; box-sizing: border-box; }
  [data-section="ship"] { padding-right: 64px; box-sizing: border-box; }
  .section-dynamic .ship-ribbon.rib-left { width: 44px; }
  /* Results numbers sit lower — reclaim the dead strip under them for
     the visualiser (Toby's red ellipse). */
  .section-dynamic .dyn-results-row { margin-bottom: -12px; }
  .section-dynamic .ship-ribbon.rib-left:hover { width: 58px; }
  [data-section="ship"] .ship-ribbon.rib-right { width: 56px; font-size: 23px; }
  [data-section="ship"] .ship-ribbon.rib-right:hover { width: 72px; }
  .section-dynamic .dyn-key-result { color: #c628a4; font-weight: 700; }
  /* Fleet: the Work Performed readout on ONE line (Toby 2026-08-17 —
     'x Trillion Ton-km / year' wrapped to two): the 222px value input
     shrinks to fit its digits, the unit drops to 14px, nothing wraps. */
  .section-fleet .fleet-control-output { white-space: nowrap; }
  .section-fleet .marketsize-input { width: 2.6em; }
  .section-fleet [data-fleet="marketsize-unit"] { font-size: 14px; }
  /* Dynamics: Smart Tail + BLI checkboxes DOUBLED (Toby 2026-08-17)
     — same place, same text, twice the box. */
  .section-dynamic .dyn-toggle-row input[type="checkbox"] { width: 26px; height: 26px; }
  /* Warnings as hover ⚠ icons, zero height impact (Toby ruling
     2026-08-17). Placement v2 same day (Toby, supersedes beside-the-
     title): each icon floats OVER the result it warns about — the
     aero warning above the Drag stat (bigger), the fuel warning
     centred over the berry LH2 + Storage stat. Anchors are absolute
     inside each stat block; taste knobs = the top/font-size lines. */
  .section-dynamic .dyn-stat { position: relative; }
  .section-dynamic .dyn-stat-warnings {
    position: absolute; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px;
  }
  .section-dynamic .dyn-stat-warnings.aero { top: -36px; font-size: 28px; }
  .section-dynamic .dyn-stat-warnings.fuel { top: -30px; font-size: 20px; }
  .section-dynamic .dyn-stat-warnings .dyn-warning { font-size: inherit; }
  .section-dynamic .dyn-warning { cursor: help; line-height: 1; }
  .section-dynamic .dyn-warning.orange { color: #ff9900; }
  .section-dynamic .dyn-warning.red { color: #ff2a2a; }
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
  /* THE RIBBON — CHEVRONS ONLY (Toby re-ruling 2026-08-17 evening,
     supersedes the worded ribbons: the giant vertical word was the
     OTHER page's title, which read as if each page were mistitled).
     Now: a column of chevrons pointing OUT through their own edge —
     statics' right ribbon points RIGHT (that's the way to DYNAMICS),
     dynamics' left ribbon points LEFT (back to STATICS). Page names
     moved to the mode title (word + two dots) at each section's top.
     Chevron visibility fix, same ruling ("chevrons behind the
     background"): they were orange on orange stripes — camouflage.
     Stripes dimmed, chevrons brighter + shadowed so they sit ON TOP. */
  .ship-ribbon {
    position: fixed; z-index: 30; top: 110px; bottom: 24px; width: 30px;
    display: flex; flex-direction: column; align-items: center;
    justify-content: space-evenly; box-sizing: border-box;
    background: repeating-linear-gradient(90deg, rgba(255,153,0,.12) 0 2px, #161616 2px 5px);
    border: 1px solid #ff9900; border-top: none; border-bottom: none;
    cursor: pointer; user-select: none;
    transition: width .18s ease, filter .18s ease; overflow: hidden;
  }
  .ship-ribbon:hover { width: 44px; filter: brightness(1.35); }
  .ship-ribbon .chev {
    font-size: 20px; font-weight: 700; color: #ffb340; line-height: 1;
    text-shadow: 0 0 6px rgba(0,0,0,.9);
  }
  /* Gentle life (Toby 2026-08-17: "leave the main ones as they are"):
     the seven main chevrons stay static; SMALLER, WARMER chevrons
     interleaved between them breathe on a slow 3s fade, each a beat
     behind the last — a quiet wave down the ribbon so the buttons are
     never missed or forgotten. Knobs: the warm colour, the 12px, the
     3s, the .45s stagger, the .85 peak opacity. */
  .ship-ribbon .chev-soft {
    font-size: 20px; /* same size as the mains (Toby, 2026-08-17, on sight) */
    font-weight: 700; color: #ff7300; line-height: 1;
    text-shadow: 0 0 6px rgba(0,0,0,.9); opacity: 0;
    animation: ship-chev-breathe 3s ease-in-out infinite alternate;
  }
  @keyframes ship-chev-breathe {
    from { opacity: 0; }
    to   { opacity: .85; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ship-ribbon .chev-soft { animation: none; opacity: .5; }
  }
  .ship-ribbon.rib-left { left: 0; border-left: none; }
  .ship-ribbon.rib-right { right: 0; border-right: none; }
  /* MODE BADGE (Toby direction 2026-08-17 evening — his own sketch:
     dots under the word SHIP in the nav, plus the name written).
     In-section titles were tried first and collided with V1's own
     panel headings on BOTH pages (no free band), so the badge hangs
     under the nav Ship link in the ~16px gap before sections begin:
     two dots (berry = where you are; statics first, the chooser's
     order) + the current sub-page's name. Hidden off the ship pages.
     Taste knobs: font-size, dot size, gap, top offset. */
  /* TWO FAT DOTS (Toby re-ruling 2026-08-17, retiring the split-orbit
     experiment on sight): the dots ARE Ship's underline — V1 underlines
     the current nav word (text-decoration on .current-page), but SHIP
     never underlines; on its pages it wears two fat dots at the
     underline's own height instead, centred under the word. Statics =
     first dot (chooser order); berry live, grey not; both grey on the
     chooser; gone off the ship pages. Taste knobs: dot size, gap, the
     50%+19px underline height. */
  nav a[href="/ship"] { text-decoration: none !important; }
  /* SHIP is only ever GREY or BERRY (Toby final 2026-08-17: white at
     NO stage) — berry on any ship state incl. the chooser. Covering
     V1's own current-page class too means even the transient between
     V1 routing and our sync can never paint white. */
  nav a[href="/ship"].ship-live,
  nav a[href="/ship"].current-page { color: #c628a4 !important; }
  .ship-mode-dots {
    position: absolute; top: calc(50% + 19px); left: 50%;
    transform: translateX(-50%);
    display: flex; gap: 8px; pointer-events: none;
  }
  .ship-mode-dots i {
    width: 12px; height: 12px; border-radius: 50%; display: block;
    background: #555;
  }
  .ship-mode-dots i.on { background: #c628a4; }
  .ship-ribbon.opening { width: 34vw; color: #ff9900; transition: width .35s ease-in, color .2s ease; }
  /* Accordion unfold, now horizontal: the incoming page stretches open
     from the edge it was squished into. */
  @keyframes ship-unfold-x { from { transform: scaleX(0.04); opacity: .35; } 60% { opacity: 1; } to { transform: scaleX(1); } }
  .ship-enter-left { animation: ship-unfold-x .8s cubic-bezier(.2,.7,.3,1); transform-origin: left center; }
  .ship-enter-right { animation: ship-unfold-x .8s cubic-bezier(.2,.7,.3,1); transform-origin: right center; }
`;
document.head.appendChild(style);

/* ---- the ribbons: chevron columns through the page edges ----
 * (Toby re-ruling 2026-08-17 evening: NO words — the giant vertical
 * word was the OTHER page's title and read as a mistitle. Arrows point
 * OUT through their own edge: on STATICS the right ribbon points right
 * — that's the way to DYNAMICS; on DYNAMICS the left ribbon points
 * left — back to STATICS. The striped background stays as the
 * "squished page" hint; hover tooltip carries the target's name.) */
function makeRibbon(side, targetKey, targetLabel, nav, enterClass) {
  const rib = document.createElement('div');
  rib.className = `ship-ribbon rib-${side}`;
  rib.setAttribute('role', 'button');
  rib.title = `Open ${targetLabel}`;
  // Direction re-ruled (Toby, 2026-08-17, on sight): arrows gesture
  // DRAGGING THE NEW PAGE INTO THE SCREEN — the right ribbon pulls
  // leftward '❮', the left ribbon pulls rightward '❯' (opposite of
  // the first pointing-out version). Between the seven static mains:
  // six smaller, warmer BREATHING chevrons (3s fade, staggered — the
  // quiet wave; delays inline because the mains are spans too).
  const glyph = side === 'right' ? '❮' : '❯';
  for (let i = 0; i < 7; i++) {
    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.textContent = glyph;
    rib.appendChild(chev);
    if (i < 6) {
      const soft = document.createElement('span');
      soft.className = 'chev-soft';
      soft.textContent = glyph;
      soft.style.animationDelay = `${(i * 0.45).toFixed(2)}s`;
      rib.appendChild(soft);
    }
  }
  rib.addEventListener('click', () => {
    setMode(targetKey);
    rib.classList.add('opening'); // the squished page starts expanding…
    setTimeout(() => {
      // Flag scoped EXACTLY to this nav click (2026-08-17 fix: setting
      // it early left it stale after DYNAMICS-ribbon presses — navShip
      // never fired to consume it, and the NEXT Ship press ate it,
      // skipping the last-used bounce and landing on statics).
      viaRibbon = true;
      nav()?.click(); // …then V1 routes; the target UNFOLDS from its edge
      viaRibbon = false;
      rib.classList.remove('opening');
      syncModeBadge(); // direct — observers are backstop only (2026-08-17)
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

/* Two fat dots at Ship's underline height (statics = first dot, the
 * chooser's order). Kept true by syncModeBadge(). The tiny mode word
 * below the dots retired 2026-08-17 (Toby) — the sub-page's own panel
 * title ('STATICS' / 'DYNAMICS', replacing the redundant 'Current
 * Properties') does the naming now. (The split-orbit logo-halves
 * experiment lived here for an hour the same day — see git.) */
let dotsEl = null;
function ensureModeBadge() {
  const anchor = navShip();
  if (!anchor || dotsEl) return;
  anchor.style.position = 'relative';
  dotsEl = document.createElement('span');
  dotsEl.className = 'ship-mode-dots';
  dotsEl.append(document.createElement('i'), document.createElement('i'));
  anchor.appendChild(dotsEl);
}
function syncModeBadge() {
  if (!dotsEl) return;
  const ship = $('[data-section="ship"]');
  const dyn = [...document.querySelectorAll('section')].find((s) => s.querySelector('.dyn-eas-chip'));
  const shipRouted = ship && getComputedStyle(ship).display !== 'none';
  const shipShown = shipRouted && !ship.querySelector('.ship-chooser');
  const dynShown = dyn && getComputedStyle(dyn).display !== 'none';
  // NAV TRUTH (Toby catch 2026-08-17: SHIP went white on statics but
  // stayed grey on dynamics): V1 gives `current-page` to the ROUTED
  // link, which on dynamics is the hidden /dynamic anchor. SHIP is
  // the visible parent of both sub-pages, so it reads current
  // whenever either is on screen (chooser included).
  navShip()?.classList.toggle('current-page', !!(shipRouted || dynShown));
  const current = dynShown ? 'dynamics' : (shipShown ? 'statics' : null);
  // Grey or berry ONLY (Toby final 2026-08-17 — white at no stage):
  // berry on any ship state, chooser included.
  navShip()?.classList.toggle('ship-live', !!(shipRouted || dynShown));
  // The dots are PART OF THE TITLE, at ALL times on ALL pages (Toby
  // final 2026-08-17, reversing the earlier hide-off-ship): both grey
  // when no sub-page is selected; the live one lights berry.
  const [d1, d2] = dotsEl.querySelectorAll('i');
  d1.classList.toggle('on', current === 'statics');
  d2.classList.toggle('on', current === 'dynamics');
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
  // Badge truth: V1's router toggles section inline style; the chooser
  // overlay appears/disappears as ship children — observe both
  // (MutationObserver: fires regardless of compositing, the same
  // reasoning as the fleet-globe repair).
  ensureModeBadge();
  if (ship) {
    new MutationObserver(() => setTimeout(syncModeBadge, 0))
      .observe(ship, { attributes: true, attributeFilter: ['style'], childList: true });
  }
  if (dyn) {
    new MutationObserver(() => setTimeout(syncModeBadge, 0))
      .observe(dyn, { attributes: true, attributeFilter: ['style'] });
  }
  setTimeout(syncModeBadge, 0);
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
  // Direct syncModeBadge() calls after each transition we cause —
  // the observers alone proved lazy on the chooser path (dots stayed
  // grey ~1s after the pick; caught 2026-08-17).
  const statics = mk('☁︎↺', 'STATICS', 'Can it lift? Size, buoyancy, net lift.', () => {
    setMode('statics');
    overlay.classList.add('swipe-out');
    setTimeout(() => { overlay.remove(); syncModeBadge(); }, 500);
  });
  const dynamics = mk('≋→', 'DYNAMICS', 'Can it fly? Drag, power, fuel.', () => {
    setMode('dynamics');
    overlay.classList.add('swipe-out');
    setTimeout(() => { overlay.remove(); navDynamic()?.click(); syncModeBadge(); }, 380);
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
  // Deep-link/refresh at /dynamic RESTORES THE VIEW but records NO
  // choice (Toby 2026-08-17: a hard refresh must never swallow the
  // choice screen — the next SHIP press greets fresh; only explicit
  // picks — chooser buttons or ribbons — set the mode).
  // The SHIP title is the way BACK to the choice screen (Toby ruling
  // 2026-08-17, amending the one-way door): every top-nav Ship click
  // re-presents the chooser — it's the hub, and once the diagram art
  // lands it's worth revisiting. Ribbons still flow straight between
  // sections without it.
  // SHIP nav = LAST-USED sub-section (Toby ruling 2026-08-17, final,
  // superseding the same-day chooser-hub idea): returning from Fleet/
  // Economics lands you where you were — statics stays, dynamics
  // bounces straight through. The chooser greets only when no choice
  // exists yet this session.
  navShip()?.addEventListener('click', () => {
    if (viaRibbon) { viaRibbon = false; return; }
    const m = getMode();
    if (m === 'dynamics') {
      // Bounce through WITHOUT the one-frame statics flash (Toby,
      // 2026-08-17): curtain the ship section synchronously so it
      // never paints, then route and lift the curtain.
      const ship = $('[data-section="ship"]');
      if (ship) ship.style.visibility = 'hidden';
      setTimeout(() => {
        navDynamic()?.click();
        if (ship) ship.style.visibility = '';
        syncModeBadge(); // direct — observers are backstop only
      }, 0);
      return;
    }
    if (m === 'statics') return; // V1 already routed here
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
