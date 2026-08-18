/**
 * ECONOMICS fixtures — the UNPRICED gate and the zero-stop rate slider
 * (Toby, 2026-08-18), plus the money-nulling rules they sit on top of.
 *
 * Why this file exists: v2/economics.js has carried the whole revenue
 * model since Phase A with no fixtures at all, and the 2026-08-18 change
 * moved its central gate — "when may this module quote money?" — from one
 * condition to two. A gate with two conditions and no tests is the kind
 * of thing that silently starts printing $0 as though it were an answer.
 *
 * Plain node, zero deps: `node test/economics-fixtures.mjs`.
 */
import {
  computeEconomics, logSlider, logSliderZeroStop, fmtRate, fmtMoney,
  RATE,
} from '../v2/economics.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

/** A flying, working fleet — everything the model needs EXCEPT a price. */
const base = {
  marketSizeTtkm: 0.33,
  netLiftT: 5100,
  airSpeedKmh: 120,
  utilisationPct: 70,
  ratePerTkm: 0,          // <- the boot state
  carbonPerT: 80,
  capex: 300e6,
  opexPerShip: 100e6,
  preCapex: 10e9,
};
const MONEY = [
  'freightRevenue', 'carbonRevenue', 'totalRevenue',
  'revenuePerShip', 'marginPerShip', 'paybackYears',
  'fleetOpex', 'fleetProfit', 'breakevenYears',
];

console.log('\n== the zero stop: view 0 is UNPRICED, not a price ==');
{
  const m = logSliderZeroStop(RATE.min, RATE.max);
  check('view 0 maps to exactly 0', m.toValue(0) === 0);
  check('view 0 round-trips', m.toView(0) === 0);
  check('the very next increment is the log minimum, not a fraction of it',
    near(m.toValue(0.0001), RATE.min, 1e-3), String(m.toValue(0.0001)));
  check('view 100 still reaches the maximum', near(m.toValue(100), RATE.max, 1e-12));
  check('the priced range is identical to the plain log map (only 0 differs)',
    [1, 25, 50, 99].every((v) =>
      m.toValue(v) === logSlider(RATE.min, RATE.max).toValue(v)));
  check('a preset round-trips through view space', near(m.toValue(m.toView(0.25)), 0.25, 1e-12));
  check('negative view cannot conjure a price', m.toValue(-5) === 0);
}

console.log('\n== unpriced: every money figure is null, no figure is zero ==');
{
  const e = computeEconomics(base);
  check('all nine money outputs are null',
    MONEY.every((k) => e[k] === null),
    MONEY.filter((k) => e[k] !== null).join(', '));
  check('none of them is 0 (a zero would read as an answer)',
    MONEY.every((k) => e[k] !== 0));
  check('fmtMoney renders them as the page dash', MONEY.every((k) => fmtMoney(e[k]) === '—'));
  // The mission is real before anyone names a price for it.
  check('physical quantities stay LIVE while unpriced',
    e.canFly === true && e.tonKmPerShip > 0 && e.requiredShips > 0 && e.co2AvoidedMt > 0,
    JSON.stringify({ tk: e.tonKmPerShip, ships: e.requiredShips, co2: e.co2AvoidedMt }));
  // Carbon credits do not depend on the freight rate and could be quoted.
  // They are withheld anyway — same call Toby made for canFly on
  // 2026-08-02: a live revenue line beside a dashed total reads as a bug.
  check('carbon credits are withheld even though they are rate-independent',
    e.carbonRevenue === null && base.carbonPerT > 0);
  check('fleet opex is withheld for the same reason', e.fleetOpex === null);
}

console.log('\n== priced: the headline appears, and it is the same model as before ==');
{
  const e = computeEconomics({ ...base, ratePerTkm: RATE.default });
  check('every money output is a finite number once priced',
    MONEY.filter((k) => k !== 'paybackYears' && k !== 'breakevenYears')
      .every((k) => Number.isFinite(e[k])),
    MONEY.map((k) => `${k}=${e[k]}`).join(' '));
  check('freight revenue is market x rate, exactly',
    e.freightRevenue === base.marketSizeTtkm * 1e12 * RATE.default);
  check('total revenue is freight + carbon', near(e.totalRevenue, e.freightRevenue + e.carbonRevenue, 1e-12));
  check('carbon credits reappear with the price', e.carbonRevenue > 0);
  // The gate is the RATE, not the carbon price: a zero carbon price is a
  // real user choice (its slider has always reached 0) and must still quote.
  const noCarbon = computeEconomics({ ...base, ratePerTkm: RATE.default, carbonPerT: 0 });
  check('carbon price 0 is a genuine choice, not an unpriced state',
    noCarbon.carbonRevenue === 0 && Number.isFinite(noCarbon.totalRevenue));
}

console.log('\n== the unfliable gate is unchanged, and composes ==');
{
  const dead = computeEconomics({ ...base, ratePerTkm: RATE.default, netLiftT: 0 });
  check('no lift → every money output null (2026-08-02 ruling intact)',
    MONEY.every((k) => dead[k] === null));
  check('no lift → requiredShips null and co2 null too', dead.requiredShips === null && dead.co2AvoidedMt === null);
  const both = computeEconomics({ ...base, netLiftT: 0 });
  check('unpriced AND unfliable is still just null, never NaN',
    MONEY.every((k) => both[k] === null));
}

console.log('\n== fmtRate never prints a price the user did not set ==');
{
  check('0 renders as the dash, not "0.0¢"', fmtRate(0) === '—');
  check('negative renders as the dash', fmtRate(-1) === '—');
  check('sub-dollar rates stay in cents', fmtRate(0.25) === '25.0¢');
  check('dollar-and-over rates switch to dollars', fmtRate(1.5) === '$1.50');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
