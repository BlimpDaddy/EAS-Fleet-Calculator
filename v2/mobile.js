/**
 * PHONE LAYOUT + TOUCH BEHAVIOUR (Toby's mobile round, 2026-08-18).
 *
 * SCOPE RULE: every style here is inside `@media (max-width: 768px)`,
 * so tablet and desktop — which Toby signed off as correct — cannot be
 * touched by anything in this file. Behaviour (tap-to-reveal) is gated
 * on `(pointer: coarse)` instead, so a touch laptop behaves sensibly
 * without changing mouse users.
 *
 * WHAT IT FIXES (each from a real device screenshot):
 * 1. "Begins a bit too zoomed in" — V1 declares --font-base 1.5rem /
 *    --font-lg 2rem / --font-xl 3rem and never scales them for phones,
 *    so a 390 px screen renders 48 px nav type and the page overflows
 *    horizontally. The type/space scale is reduced at the phone
 *    breakpoint; everything else follows because V1 sizes off these
 *    variables.
 * 2. Chooser panels were "crazy vertical" — on phones they become
 *    compact horizontal rectangles, STATICS still top-left and
 *    DYNAMICS bottom-right (the diagonal survives), sized so the
 *    screen never scrolls.
 * 3. FLEET GLOBE MISSING — a real bug, not taste: the desktop rule
 *    `.section-fleet { grid-template-rows: 272px 1fr }` (added when the
 *    globe was enlarged) is NOT inside a media query, so it overrode
 *    V1's mobile `repeat(6, auto)`; the globe figure then had no row
 *    height and its `flex: 1 1 0; min-height: 0` canvas collapsed to
 *    zero. Phones restore V1's row flow and give the canvas an
 *    explicit height.
 * 4. The Total Work chart ate the page — capped on phones.
 * 5. Hover has no touch equivalent: every warning (ours) and every ℹ︎
 *    tooltip (V1's) now opens on TAP.
 *
 * TAP MECHANISM, two kinds:
 *  - V1's ℹ︎ tooltips are a bundle-drawn `.tooltip-box` shown on
 *    mouseenter. Rather than duplicate them, a tap SYNTHESISES the
 *    mouse events V1 already listens for, so the real tooltip appears
 *    and the bundle stays untouched.
 *  - Our warnings carry `title`, which touch devices never surface, so
 *    a tap draws our own bubble with that text.
 * Either way a second tap (or a tap elsewhere) dismisses.
 */

const PHONE = '(max-width: 768px)';

/* ------------------------------------------------------------------ */
/* 1–4: layout                                                         */
const css = document.createElement('style');
css.textContent = `
@media ${PHONE} {
  /* 1. Type + space scale. V1's whole layout derives from these. */
  :root {
    --font-base: 1.05rem;   /* was 1.5rem  */
    --font-lg:   1.35rem;   /* was 2rem    */
    --font-xl:   1.6rem;    /* was 3rem    */
    --space-base: 0.6rem;   /* was 1rem    */
    --space-lg:   1rem;     /* was 2rem    */
  }
  /* Nav must never overflow the viewport (it was clipping "Economic"). */
  .header-nav { flex-wrap: wrap; justify-content: center; gap: 0.15em; }
  .header-logo { max-width: 56vw; height: auto; }

  /* SHAPE tiles were tall vertical rectangles (Toby round 2): V1 gives
     the icon height:100%, so the tile grows to whatever the grid row
     allows. Capping the icon shortens every tile without touching the
     grid or the labels. */
  .shape-control-button { padding: 6px; }
  .shape-control-button-icon { max-height: 92px; }
  .shape-controls { gap: 8px; }

  /* ONE tooltip symbol, not two (Toby round 2): the ℹ︎ glyph renders
     as a filled emoji on some phones DESPITE the text-presentation
     selector, which then sits inside V1's own CSS circle — reading as
     two stacked symbols. The glyph is hidden and a single plain 'i' is
     drawn in the circle instead. (All tooltips are due a redesign
     later; this just stops the doubling.) */
  .has-tooltip { position: relative; color: transparent !important; }
  .has-tooltip::after {
    content: 'i'; position: absolute; inset: 0;
    display: grid; place-items: center;
    color: var(--color-secondary); font-family: Georgia, serif;
    font-style: italic; font-size: 0.9em; line-height: 1;
  }

  /* 2. Chooser: compact rectangles, diagonal preserved, no scrolling. */
  .ship-chooser {
    /* FIXED to the viewport, not the (very tall) ship section — while
       the chooser is up the phone must not scroll at all (Toby).
       'top' is set at runtime to the header's bottom edge so the
       Shape > Ship > Fleet > Economic nav stays visible: the first
       cut used inset:0 and swallowed the whole header (Toby round 2). */
    position: fixed; inset: 0; height: auto;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    align-content: start;
    gap: 14px;
    padding: 14px 12px;
  }
  .ship-chooser button:nth-of-type(1) { grid-row: 1; grid-column: 1 / 2; }  /* STATICS  top-left  */
  .ship-chooser button:nth-of-type(2) { grid-row: 2; grid-column: 2 / 3; }  /* DYNAMICS bottom-right */
  .ship-chooser button {
    flex-direction: row; gap: 10px;
    padding: 12px 10px; min-height: 0; border-radius: 10px;
    text-align: left;
  }
  .ship-chooser .glyph { font-size: 26px; }
  .ship-chooser .title { font-size: 15px; letter-spacing: .06em; }
  .ship-chooser .sub   { font-size: 11px; margin-top: 2px; }

  /* 3. FLEET: restore V1's mobile row flow (the desktop 272px/1fr rule
     is unscoped and would otherwise win here), then give the globe a
     real height so its canvas cannot collapse. */
  .section-fleet { grid-template-rows: repeat(6, auto) !important; }
  .section-fleet .fleet-graph-container { display: block; }
  .section-fleet .fleet-routes-canvas {
    height: 260px !important; flex: none; width: 100%;
  }
  /* 4. Total Work chart capped — it was consuming most of the page. */
  .section-fleet figure:has(.fleet-chart-button-container) svg {
    max-height: 210px; width: 100%;
  }

  /* Ribbons: slimmer so they don't eat a narrow screen. */
  .ship-ribbon { width: 26px; }
  [data-section="ship"] .ship-ribbon.rib-right { width: 30px; }
  .section-dynamic { padding-left: 30px; }
  [data-section="ship"] { padding-right: 34px; }
}

/* 5. Tap bubble for our own title-carrying warnings. */
.v2-tapbubble {
  position: absolute; z-index: 999; max-width: 78vw;
  background: #191919; color: #eee; border: 1px solid #474747;
  border-radius: 8px; padding: 8px 11px; font-size: 13px;
  line-height: 1.35; white-space: pre-line; text-transform: none;
  box-shadow: 0 6px 18px rgba(0,0,0,.6);
}
`;
document.head.appendChild(css);

/* ------------------------------------------------------------------ */
/* 2b: while the chooser is up, the phone must not scroll at all.
 * ship-split.js owns the overlay's life, so its presence is observed
 * rather than coupled to; the lock is phone-only and self-clearing. */
if (window.matchMedia(PHONE).matches) {
  const lock = () => {
    const chooser = document.querySelector('.ship-chooser');
    document.documentElement.style.overflow = chooser ? 'hidden' : '';
    document.body.style.overflow = chooser ? 'hidden' : '';
    // Keep the header + nav visible above the chooser: park its top
    // edge at the header's bottom. Measured live because the header's
    // height moves with the wrapped nav and the phone type scale.
    if (chooser) {
      const header = document.querySelector('header.header');
      const top = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
      chooser.style.top = `${Math.max(0, top)}px`;
    }
  };
  new MutationObserver(lock).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', lock);
  lock();
}

/* ------------------------------------------------------------------ */
/* 5: tap-to-reveal (touch pointers only)                              */
const coarse = window.matchMedia('(pointer: coarse)').matches
  || window.matchMedia(PHONE).matches;
if (coarse) {
  // Our warnings: the elements that carry a `title` we author.
  const OURS = '.v2-warn, .dyn-warning, .v2-reqflags .w, .ship-mode-badge';
  let bubble = null;
  let hovered = null; // the V1 tooltip icon currently "hovered" by tap

  const closeBubble = () => { if (bubble) { bubble.remove(); bubble = null; } };
  // MEASURED (2026-08-18): the bundle's tooltip listens for
  // POINTERENTER — mouseover/mouseenter do nothing. Verified by
  // dispatching each in turn and watching for .tooltip-box.
  const clearHover = () => {
    if (!hovered) return;
    hovered.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    hovered.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    hovered = null;
  };

  document.addEventListener('click', (e) => {
    const tip = e.target.closest?.('.has-tooltip');
    const warn = e.target.closest?.(OURS);

    // Tapping the same thing again, or anything else, dismisses first.
    const reTapTip = tip && tip === hovered;
    closeBubble();
    clearHover();
    if (reTapTip) { e.preventDefault(); e.stopPropagation(); return; }

    const show = (anchor, text) => {
      bubble = document.createElement('div');
      bubble.className = 'v2-tapbubble';
      bubble.textContent = text;
      document.body.appendChild(bubble);
      const r = anchor.getBoundingClientRect();
      const bw = bubble.offsetWidth;
      const left = Math.max(8, Math.min(
        window.innerWidth - bw - 8,
        r.left + window.scrollX + r.width / 2 - bw / 2,
      ));
      bubble.style.left = `${left}px`;
      bubble.style.top = `${r.bottom + window.scrollY + 8}px`;
    };

    if (tip) {
      // V1 owns the tooltip TEXT (keyed by data-tooltip, resolved
      // inside the bundle). Rather than depend on the bundle's own
      // fade — which needs rAF and a mousemove to position — we let it
      // build its box, HARVEST the text, dismiss its box, and render
      // the text in our own bubble. One reveal style for every tap,
      // and no reliance on animation we cannot verify.
      e.preventDefault();
      e.stopPropagation();
      hovered = tip;
      const at = { clientX: e.clientX, clientY: e.clientY, bubbles: true };
      tip.dispatchEvent(new PointerEvent('pointerover', at));
      tip.dispatchEvent(new PointerEvent('pointerenter', { ...at, bubbles: false }));
      setTimeout(() => {
        const box = document.querySelector('.tooltip-box');
        const text = (box && box.textContent.trim()) || tip.getAttribute('data-tooltip') || '';
        clearHover();                       // let V1 tidy its own box away
        if (box) box.style.opacity = '0';
        if (text) show(tip, text);
      }, 0);
      return;
    }

    if (warn && warn.title) {
      e.preventDefault();
      e.stopPropagation();
      show(warn, warn.title);
    }
  }, true); // capture: dismiss/route before the page's own handlers run
}
