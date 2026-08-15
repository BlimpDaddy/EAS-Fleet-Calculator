/**
 * Adapter compatibility probe — M3, DYNAMIC-SPEC §14 r4 sequencing
 * amendment: "a tiny harness proving DYNAMIC state can push through V1's
 * input/event pathways with the bundle behaving normally — without
 * changing FLEET behaviour yet. Discover the bridge early; cross it late."
 *
 * The bridge under test is the one M8 will cross: FLEET's airspeed control
 * (`[data-fleet="airSpeed"]`), which DYNAMIC will eventually own. The probe
 * pushes a value through V1's OWN event pathway (set .value, dispatch
 * 'input' — exactly how a user drag reaches the bundle), asserts the
 * bundle re-rendered its output, then restores the original value through
 * the same pathway and asserts the output restored.
 *
 * V1 LESSON APPLIED (WORKFLOW.md): fleet sliders are 0–100 VIEW units and
 * the bundle owns the mapping — the probe never assumes km/h, it only
 * moves the slider and watches the bundle's output cell.
 *
 * ON DEMAND ONLY (r6: "adapter probe changes nothing about current
 * FLEET"): nothing runs at load; call `__dynamicAdapterProbe()` from the
 * console with the Fleet page visible. Restores state whatever happens.
 */
export function runAdapterProbe() {
  const slider = document.querySelector('[data-fleet="airSpeed"]');
  const output = document.querySelector('[data-fleet="airSpeed-output"]');
  if (!slider || !output) return { pass: false, log: ['probe: airspeed slider/output not found'] };

  const log = [];
  const original = slider.value;
  const originalText = output.textContent;
  const push = (value) => {
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  try {
    // Nudge in VIEW units: pick the far half of the dial so the display must change.
    const nudged = Number(original) < 50 ? 75 : 25;
    push(nudged);
    const changed = output.textContent !== originalText;
    log.push(`push ${original} -> ${nudged} (view units): output "${originalText}" -> "${output.textContent}" — ${changed ? 'bundle responded' : 'NO RESPONSE'}`);

    push(original);
    const restored = output.textContent === originalText;
    log.push(`restore -> ${original}: output "${output.textContent}" — ${restored ? 'exact' : 'NOT RESTORED'}`);

    const pass = changed && restored;
    log.push(pass ? 'PROBE PASS: DYNAMIC state can drive V1\'s input pathway; FLEET unchanged.'
                  : 'PROBE FAIL: see above — do NOT proceed to M8 wiring.');
    return { pass, log };
  } catch (err) {
    push(original); // whatever happened, leave FLEET as we found it
    return { pass: false, log: [...log, `probe threw: ${err.message}`] };
  }
}

// Console handle; deliberately not wired to any UI.
window.__dynamicAdapterProbe = () => {
  const { pass, log } = runAdapterProbe();
  for (const line of log) console.log(`[dynamic-probe] ${line}`);
  return pass;
};
