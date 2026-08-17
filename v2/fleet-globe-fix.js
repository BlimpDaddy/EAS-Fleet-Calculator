/**
 * FLEET GLOBE SIZE REPAIR (2026-08-17, Toby's report: Syd/LA endpoint
 * markers visible but no pink trip arc).
 *
 * ROOT CAUSE (read from the bundle, not patched): the globe view's
 * start() observes its canvas with a ResizeObserver that fires ONCE and
 * then disconnects. At boot the Fleet section is hidden, so that one
 * firing measures 0×0 — drawing buffer 0, camera aspect 0/0, and the
 * Line2 fat-line material's `resolution` (0,0). After that, only a real
 * WINDOW resize ever re-runs the bundle's resize(). Consequences by
 * path: no window resize all session → the whole globe is blank; a
 * window resize while Fleet is VISIBLE → everything heals; a resize
 * while Fleet is HIDDEN → broken again. The arc is extra-sensitive:
 * Line2's shader divides by `resolution`, so a stale resolution kills
 * the LINE while the globe mesh and city sprites still render — exactly
 * the "markers but no line" symptom.
 *
 * FIX (adapter doctrine, bundle untouched): V1's router shows/hides
 * sections by writing the section's inline `style` (display none|grid),
 * so a MutationObserver on the Fleet section's style attribute catches
 * every reveal — deliberately NOT ResizeObserver/rAF, which ride the
 * rendering pipeline and never fire in non-compositing panes (the
 * headless-verification trap; MutationObserver is microtask-based and
 * always delivers). On each reveal, if the canvas's drawing buffer
 * disagrees with its CSS box, dispatch one window 'resize' — the
 * bundle's OWN still-attached handler re-runs resize() with real
 * dimensions (buffer + camera + line resolution together).
 * Self-limiting: once the buffer matches, no further dispatch.
 *
 * NOTE the arc can still be honestly absent: its length is the trip-
 * distance slider fraction (view/100) — at the v1.6 all-zero load the
 * line hides while the endpoint markers remain, until the slider moves.
 */
const canvas = document.querySelector('.fleet-distance-canvas');
const fleetSection = document.querySelector('.section-fleet');
if (canvas && fleetSection) {
  const heal = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0 && (Math.abs(canvas.width - w) > 1 || Math.abs(canvas.height - h) > 1)) {
      window.dispatchEvent(new Event('resize'));
    }
  };
  new MutationObserver(() => setTimeout(heal, 0))
    .observe(fleetSection, { attributes: true, attributeFilter: ['style'] });
  setTimeout(heal, 0); // boot-time check (deep-linked /fleet loads visible)
}
