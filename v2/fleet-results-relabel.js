/**
 * FLEET RESULTS RELABEL (Toby's 8-row spec, 2026-08-17):
 *   1 Required:            xx,xxx {Shape}s        (label grey, value berry)
 *   2 Work per {Shape}:    0.xxx Trillion / Ton-km / year
 *   3 Trips per {Shape}:   x.xx
 *   4 Average Ton-km:      x.x Million / per trip (reformatted to millions)
 *   5 Trip time:           x.xx days / per trip
 *   6 Potential CO₂ Displaced: xxx.xx Million / tonnes / year
 *   7 Industry Total:      xx.x %                 (was Total Emissions Eliminated)
 *   8 Global Total:        x.xx %                 (NEW — displaced ÷ world fossil CO₂)
 *
 * {Shape} is the LIVE page-1 selection, pluralised where the spec says
 * so ("10,000 Sunships", "4,200 Washing Machines"); uploads read
 * "Ship"/"Ships". Layout becomes label-left / value-right rows with
 * small grey unit sub-lines, per Toby's sketch.
 *
 * ADAPTER DISCIPLINE: V1's value spans stay the data source — V1 keeps
 * writing raw numbers into them; this module either decorates AROUND
 * them (static unit spans/sub-lines) or, where the spec reformats the
 * number itself (avg ton-km → millions), hides V1's span and renders a
 * display span beside it (V1's raw text stays in the DOM as the
 * source; MutationObservers keep the display true). revenue.js already
 * rewrites the CO₂ Mt + % cells with the two-stage model — this module
 * only decorates those cells, never their text. The new Global Total
 * row is computed FROM the displayed (post-model) Mt.
 * Tooltip ℹ︎ elements are preserved by node (V1 may hold bindings) —
 * labels are rebuilt around them, never over them.
 */
import { GLOBAL_FOSSIL_CO2_MT } from '/v2/co2-config.js';

const $ = (sel) => document.querySelector(sel);
const box = $('.section-fleet .fleet-results');
if (box) {
  /* ---- shape naming ---- */
  const NAMES = {
    sunship: ['Sunship', 'Sunships'],
    bottle: ['Bottle', 'Bottles'],
    cigar: ['Cigar', 'Cigars'],
    car: ['Car', 'Cars'],
    washingmachine: ['Washing Machine', 'Washing Machines'],
    aerosmena: ['Lenticular', 'Lenticulars'], // the LENTICULAR (UFO) preset's internal id
  };
  const shapeName = (plural) => {
    const s = window.__v2ActiveShape;
    const pair = (s && s.kind === 'preset' && NAMES[s.id]) || ['Ship', 'Ships'];
    return pair[plural ? 1 : 0];
  };

  /* ---- styles: label-left / value-right rows ---- */
  const style = document.createElement('style');
  style.textContent = `
    .section-fleet .fleet-results {
      display: grid; grid-template-columns: auto 1fr;
      column-gap: 14px; row-gap: 7px; align-content: start;
      align-items: baseline;
    }
    .section-fleet .fleet-results .fleet-results-header,
    .section-fleet .fleet-results .fleet-results-hr { grid-column: 1 / -1; }
    .section-fleet .fleet-results .fleet-results-data,
    .section-fleet .fleet-results .fleet-results-required-data { text-align: right; }
    .section-fleet .fleet-results-required-header { color: #888; }
    .section-fleet .fleet-results-required-data { color: #c628a4; font-weight: 700; }
    .section-fleet .fleet-results .v2-sub {
      display: block; font-size: 12px; color: #888; line-height: 1.15;
    }
    .section-fleet .fleet-results .v2-unit { white-space: nowrap; }
  `;
  document.head.appendChild(style);

  /* ---- label rebuild (tooltip nodes preserved) ---- */
  const relabel = (el, html) => {
    const tips = [...el.querySelectorAll('.has-tooltip')];
    el.textContent = '';
    el.insertAdjacentHTML('afterbegin', html);
    for (const t of tips) el.appendChild(t);
  };
  const headers = [...box.querySelectorAll('.fleet-results-data-header')];
  const byText = (frag) => headers.find((h) => h.textContent.includes(frag));
  // Capture BEFORE relabelling — byText matches the ORIGINAL texts
  // (first cut crashed here: looked up 'Total Emissions Eliminated'
  // after renaming it).
  const pctHeader = byText('Total Emissions Eliminated');

  relabel(box.querySelector('.fleet-results-required-header'), 'Required: ');
  relabel(byText('Ton-km / year'), 'Work per <span class="v2-shapename">Sunship</span>:');
  relabel(byText('Trips per year'), 'Trips per <span class="v2-shapename">Sunship</span>: ');
  relabel(byText('Average Ton-km per trip'), 'Average Ton-km:');
  relabel(byText('Average days per trip'), 'Trip time:');
  relabel(byText('CO₂ avoided'), 'Potential CO₂ Displaced: ');
  relabel(pctHeader, 'Industry Total:');

  /* ---- value decorations ---- */
  const decorate = (span, unitHtml, subText) => {
    if (unitHtml) span.insertAdjacentHTML('afterend', ` <span class="v2-unit">${unitHtml}</span>`);
    if (subText) {
      const sub = document.createElement('span');
      sub.className = 'v2-sub';
      sub.textContent = subText;
      span.parentElement.appendChild(sub);
    }
  };
  decorate($('[data-fleet="results-carrycapacity"]'), 'Trillion', 'Ton-km / year');
  decorate($('[data-fleet="resuls-averagedayspertrip"]'), 'days', 'per trip');
  decorate($('[data-fleet="resuls-c02reducedamount"]'), 'Million', 'tonnes / year');

  /* Required: value = V1's number + the pluralised shape name (berry). */
  const reqSpan = $('[data-fleet="results-required"]');
  const reqName = document.createElement('span');
  reqName.className = 'v2-reqname';
  reqSpan.insertAdjacentElement('afterend', reqName);
  const syncRequired = () => {
    const t = reqSpan.textContent.trim();
    const n = Number(t.replace(/,/g, ''));
    reqName.textContent = (t === 'N/A' || !Number.isFinite(n)) ? ''
      : ` ${n === 1 ? shapeName(false) : shapeName(true)}`;
  };

  /* ---- LIVE WARNING FLAGS on the key number (Toby, 2026-08-17):
   * any shape carrying a live ORANGE or RED warning anywhere in the
   * calculator gets an asterisk + per-severity ⚠ beside "Required:
   * X Ships"; hover or click lists that colour's short warning texts.
   * Sources scraped from the live adapters' own DOM: the shape page's
   * .v2-warn glyphs (existence = active; red = #FF2A2A fill; the VE
   * overlay is display-toggled) and the dynamics page's .dyn-warning
   * icons (class orange/red, title = the ruled minimal words). The
   * warning state can only change from OTHER pages, so it recomputes
   * on fleet reveal + shape change — never stale while watched. */
  const warnSvg = (fill, mark) => // the shape page's exact triangle (shape-upload.js)
    '<svg viewBox="0 0 24 22" width="0.85em" height="0.85em" aria-label="warning">' +
    `<path d="M12 1 L23 21 H1 Z" fill="${fill}"/>` +
    `<rect x="10.9" y="7.5" width="2.2" height="7" rx="1.1" fill="${mark}"/>` +
    `<circle cx="12" cy="17.5" r="1.4" fill="${mark}"/></svg>`;
  const collectWarnings = () => {
    const list = { orange: [], red: [] };
    for (const w of document.querySelectorAll('.v2-warn')) {
      if (w.classList.contains('v2-warn-ve') && getComputedStyle(w).display === 'none') continue;
      if (!w.title) continue;
      (w.innerHTML.includes('#FF2A2A') ? list.red : list.orange).push(w.title);
    }
    for (const w of document.querySelectorAll('.dyn-stat-warnings .dyn-warning')) {
      if (w.title) (w.classList.contains('red') ? list.red : list.orange).push(w.title);
    }
    list.orange = [...new Set(list.orange)];
    list.red = [...new Set(list.red)];
    return list;
  };
  const reqFlags = document.createElement('span');
  reqFlags.className = 'v2-reqflags';
  reqName.insertAdjacentElement('afterend', reqFlags);
  const flagStyle = document.createElement('style');
  flagStyle.textContent = `
    .v2-reqflags { cursor: help; white-space: nowrap; }
    .v2-reqflags .star { color: #eee; margin: 0 2px 0 1px; }
    .v2-reqflags .w { margin-left: 3px; }
    .v2-reqpop {
      position: absolute; right: 0; z-index: 30; background: #191919;
      border: 1px solid #474747; border-radius: 8px; padding: 8px 12px;
      font-size: 13px; font-weight: 400; color: #eee; text-align: left;
      white-space: nowrap;
    }
    .v2-reqpop li { list-style: none; margin: 2px 0; }
    .v2-reqpop li.red::before { content: '⚠ '; color: #ff2a2a; }
    .v2-reqpop li.orange::before { content: '⚠ '; color: #ff9900; }
  `;
  document.head.appendChild(flagStyle);
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  const syncFlags = () => {
    closePop();
    const w = collectWarnings();
    reqFlags.textContent = '';
    if (!w.orange.length && !w.red.length) return;
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = '*';
    reqFlags.appendChild(star);
    const mkIcon = (level, texts) => {
      if (!texts.length) return;
      const s = document.createElement('span');
      s.className = 'w';
      s.innerHTML = level === 'red' ? warnSvg('#FF2A2A', '#FFFFFF') : warnSvg('#FF9900', '#111111');
      s.title = texts.map((t) => `• ${t}`).join('\n');
      s.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = !!pop;
        closePop();
        if (wasOpen) return;
        pop = document.createElement('ul');
        pop.className = 'v2-reqpop';
        for (const t of texts) {
          const li = document.createElement('li');
          li.className = level;
          li.textContent = t;
          pop.appendChild(li);
        }
        const holder = reqSpan.parentElement;
        holder.style.position = 'relative';
        holder.appendChild(pop);
      });
      reqFlags.appendChild(s);
    };
    mkIcon('orange', w.orange);
    mkIcon('red', w.red);
  };
  document.addEventListener('click', closePop);
  // Recompute on fleet reveal (V1 toggles the section's inline style).
  const fleetSection = $('.section-fleet');
  if (fleetSection) {
    new MutationObserver(() => setTimeout(syncFlags, 0))
      .observe(fleetSection, { attributes: true, attributeFilter: ['style'] });
  }

  /* Average Ton-km → x.x Million (V1's raw span hidden, kept as source). */
  const tonkmSpan = $('[data-fleet="resuls-averagetonkmtrip"]');
  tonkmSpan.style.display = 'none';
  const tonkmShow = document.createElement('span');
  tonkmSpan.insertAdjacentElement('beforebegin', tonkmShow);
  decorate(tonkmShow, null, 'per trip');
  const syncTonkm = () => {
    const raw = Number(tonkmSpan.textContent.replace(/,/g, ''));
    tonkmShow.textContent = !Number.isFinite(raw) || raw <= 0 ? '0'
      : raw >= 1e6 ? `${(raw / 1e6).toFixed(1)} Million`
      : `${Math.round(raw).toLocaleString('en-US')}`;
  };

  /* Global Total (NEW): displaced Mt ÷ world fossil CO₂. */
  const co2Span = $('[data-fleet="resuls-c02reducedamount"]');
  const pctData = pctHeader.nextElementSibling;
  const gHeader = document.createElement('div');
  gHeader.className = 'fleet-results-data-header';
  gHeader.textContent = 'Global Total:';
  const gData = document.createElement('div');
  gData.className = 'fleet-results-data';
  const gVal = document.createElement('span');
  gData.append(gVal, ' %');
  pctData.insertAdjacentElement('afterend', gHeader);
  gHeader.insertAdjacentElement('afterend', gData);
  const syncGlobal = () => {
    const mt = Number(co2Span.textContent.replace(/[^\d.]/g, ''));
    const pct = Number.isFinite(mt) && mt > 0 ? (mt / GLOBAL_FOSSIL_CO2_MT) * 100 : 0;
    gVal.textContent = pct === 0 ? '0' : pct >= 10 ? pct.toFixed(1) : pct.toFixed(2);
  };

  /* Shape name into the two labels (+ required suffix) — live. */
  const syncNames = () => {
    for (const el of box.querySelectorAll('.v2-shapename')) el.textContent = shapeName(false);
    syncRequired();
    syncFlags();
  };
  window.addEventListener('v2-shape-change', syncNames);

  /* Observers keep everything true against V1's writes (and
   * revenue.js's model rewrites); direct initial sync. */
  const watch = (el, fn) => new MutationObserver(fn).observe(el, { childList: true, characterData: true, subtree: true });
  watch(reqSpan, syncRequired);
  watch(tonkmSpan, syncTonkm);
  watch(co2Span, syncGlobal);
  syncNames();
  syncTonkm();
  syncGlobal();
}
