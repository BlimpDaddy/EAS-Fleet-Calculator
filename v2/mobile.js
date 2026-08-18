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
  .shape-controls { gap: 8px; }
  /* Round 3 (Toby): keep the shorter tiles, fix their two side effects.
     (a) The longest labels — WASHING MACHINE, LENTICULAR (UFO) — wrapped
     to a second line once their ℹ︎ no longer fit beside them, so the
     label type and the ℹ︎ circle both come down a notch.
     (b) The berry logo badge (absolute, top-right, 50px) started
     clipping the Sunship wireframe in the shorter tile: the badge
     shrinks and the artwork is pushed DOWN in its box, which is also
     the "shapes sit a few % lower" Toby asked for. */
  .shape-control-button-label { font-size: 0.78rem; letter-spacing: 0; }
  .has-tooltip { width: 1.05rem; height: 1.05rem; font-size: 0.78rem; border-width: 1.5px; }
  .shape-control-button-icon { max-height: 92px; margin-top: 18px; }
  .shape-button-primary .shape-button-circles { max-width: 32px; padding: 0.3rem; }
  /* UPLOAD .OBJ carries an inline min-height: 4.5rem from
     shape-upload.js — proportionate at desktop type scale, but at
     phone scale its single 15px label left a blank line below (Toby
     round 4). Overridden (inline style needs !important) and the
     label centred so the box hugs its text. */
  .shape-controls .shape-control-button[style*="grid-column"] {
    min-height: 2.5rem !important; justify-content: center;
  }

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
    /* Round 5 (Toby): the pair sat hard against the titles with the
       page blank beneath. Centring the rows in the space below the
       header balances the screen — and because the overlay already
       starts at the header's bottom, "centred" means visually centred
       between the nav and the bottom edge. */
    align-content: center;
    gap: 26px;
    padding: 14px 12px 26px;
  }
  .ship-chooser button:nth-of-type(1) { grid-row: 1; grid-column: 1 / 2; }  /* STATICS  top-left  */
  .ship-chooser button:nth-of-type(2) { grid-row: 2; grid-column: 2 / 3; }  /* DYNAMICS bottom-right */
  .ship-chooser button {
    flex-direction: row; gap: 11px;
    padding: 16px 12px; min-height: 96px; border-radius: 10px;
    text-align: left;
  }
  .ship-chooser .glyph { font-size: 30px; }
  .ship-chooser .title { font-size: 16px; letter-spacing: .06em; }
  .ship-chooser .sub   { font-size: 11.5px; margin-top: 3px; }

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

  /* DYNAMICS interim tidy (2026-08-18) — stop-it-looking-broken ONLY.
     The real phone layout follows the M7 ruling (plan view, top→bottom
     flow) and replaces this wholesale; nothing here is load-bearing.
     Loads after dynamic-page.js, so equal-specificity rules here win
     its base styles AND its own 900px wrap rules. */
  /* Panels stack as three natural-height bands — the 1fr centre row
     otherwise stretches the empty visualiser to fill the viewport.
     THE MISSING-CONTROLS BUG (Toby, phone round 8): auto rows are NOT
     enough on their own. dynamic-page.js sets min-height: 0 on .dyn-panel,
     which removes a grid item's content-based minimum — so when the
     section's height is bounded (body is a grid and the section is
     stretched into its row), the rows are free to shrink BELOW their
     content instead of overflowing. Measured at 375x667: the controls
     row needs 280px but its row collapsed to 175px, so Cd, Power Saving
     and both checkboxes spilled past the panel and the visualiser panel
     — a later sibling with its own background — painted straight over
     them. Only their absolutely-positioned ESTIMATED marker and the
     S-zone bar showed through, which is exactly what the screenshot
     caught. Restoring the content floor makes the section grow and the
     PAGE scroll, which is the right behaviour on a phone. */
  .section-dynamic { grid-template-rows: auto auto auto; height: auto; align-self: start; }
  .section-dynamic .dyn-panel { min-height: auto; }
  /* Controls: one per line, sliders full width; the two toggles share
     one row so they don't burn two more lines.
     NOWRAP IS LOAD-BEARING (Toby, phone round 8): dynamic-page.js sets
     flex-wrap: wrap at its own 900px breakpoint, which is right for a
     ROW but catastrophic once we flip to a COLUMN — a wrapping column
     flex breaks sideways into extra COLUMNS the instant its height is
     bounded, and on a phone shorter than ~800px it is. Measured: the
     four controls jumped to x=36/493/951/1404, so Airspeed stayed put
     and Cd, Power Saving and both checkboxes left the screen entirely
     (their absolutely-positioned ESTIMATED marker and S-zone bar were
     all that bled back into view, over the visualiser panel). */
  .dyn-controls-row { flex-direction: column; flex-wrap: nowrap; align-items: stretch; }
  .dyn-controls-row .fleet-control { min-width: 0; width: 100%; }
  .dyn-controls-row .fleet-control-slider { width: 100%; }
  .dyn-toggle-col {
    flex-direction: row; align-self: flex-start;
    gap: 1.4em; padding: 0;
  }
  /* Visualiser reservation: modest fixed height so it reads as
     reserved space, not a squashed band (32vh/22vh are viewport-tall
     nonsense in portrait). */
  .dyn-visual-panel { min-height: 0; height: 180px; }
  /* Results: 2-column grid instead of 8-across. Selector carries
     .section-dynamic because ship-split.js's desktop one-line-strip
     rules do (0,2,0 — they'd beat a bare .dyn-results-row here). */
  .section-dynamic .dyn-results-row {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0.6rem var(--space-base);
    align-items: start; margin-bottom: 0; padding: 0;
  }
  .section-dynamic .dyn-results-row .dyn-stat { min-width: 0; }
  /* ship-split's 32px nowrap values are one-line-strip sizing; in a
     half-width column they'd overflow the phone. */
  .section-dynamic .fleet-results-data { font-size: 22px; }

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
      let top = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
      // SHIP's two mode dots are its underline and hang BELOW the
      // header box (top: 50% + 19px) — parking the overlay at
      // header.bottom covered their lower half (Toby, phone round 7:
      // dots 83–95px vs overlay top 89px, measured). Park below them.
      const dots = document.querySelector('.ship-mode-dots');
      if (dots) top = Math.max(top, Math.round(dots.getBoundingClientRect().bottom) + 4);
      chooser.style.top = `${Math.max(0, top)}px`;
    }
  };
  new MutationObserver(lock).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', lock);
  lock();

  // Ver-chip re-place (2026-08-18): revenue.js parks its "Ver x.x"
  // chip by MEASURING the logo — and it runs before this file shrinks
  // the logo to 56vw. With the image cached, its load-event re-measure
  // never fires, so the chip kept a desktop-width left (≈446px) and
  // was the sole horizontal-scroll source on phones (scrollWidth 480
  // on a 375 screen — every page, not just DYNAMICS). revenue.js
  // already re-places on resize; one synthetic resize after our styles
  // apply re-measures it. Phone-gated: desktop never sees this event.
  window.dispatchEvent(new Event('resize'));
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
