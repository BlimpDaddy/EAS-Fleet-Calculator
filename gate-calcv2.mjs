/**
 * PHASE-B ENTRY GATE — DYNAMIC-SPEC §14 (r5 amendment) + review pins r6.
 * "Boringly mechanical": every check scripted, any failure = STOP.
 *
 * Run from this directory: `node gate-calcv2.mjs`
 *
 * Steps (order is binding):
 *   1. BUNDLE HASH GUARD (pre)  — main.js must match the committed
 *      known-good hash in main.js.sha256. The V1 bundle is NEVER edited
 *      (WORKFLOW.md; the black-site incident): prove it, don't trust it.
 *   2. BAKE                     — run bake-calcv2.mjs (pure copy of
 *      ../CalcV2/{src,vendor,web}, dev-only files excluded).
 *   3. BUNDLE HASH GUARD (post) — main.js byte-identical after the bake.
 *   4. BYTE PARITY SWEEP        — every baked file byte-identical to its
 *      source; no missing files, no strays left in ./calcv2/.
 *   5. BAKED-VS-SOURCE FIXTURES — both DYNAMIC suites (120 fixtures) run
 *      against source AND against the baked engine via
 *      DYNAMICS_ENGINE_ROOT. Identical verdicts required.
 *   6. DIFF RESTRICTION GUARD   — `git status --porcelain` must touch
 *      ONLY calcv2/ paths. Any unexpected file = STOP (r6 pin).
 *
 * NOT scripted here (manual, mandatory before any release — WORKFLOW.md):
 * the PAGE-LOAD smoke test in a real browser. This gate proves the copy;
 * the smoke test proves the boot.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = fileURLToPath(new URL('.', import.meta.url));
const calcV2 = fileURLToPath(new URL('../CalcV2/', import.meta.url));
const BAKED_DIRS = ['src', 'vendor', 'web'];
const BAKE_EXCLUDE = new Set(['dynamic-bench.html']); // keep in sync with bake-calcv2.mjs
const SUITES = ['test/dynamics-fixtures.mjs', 'test/dynamics-core-fixtures.mjs'];

let failures = 0;
const ok = (name, detail = '') => console.log(`  ok  ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail = '') => { failures++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(relative(base, p).replaceAll('\\', '/'));
  }
  return out;
}

/* ---- 1. bundle hash guard (pre-bake) ---- */
console.log('\n[1] bundle hash guard (pre-bake)');
const expected = readFileSync(join(here, 'main.js.sha256'), 'utf8').trim();
const preHash = sha256(join(here, 'main.js'));
preHash === expected
  ? ok('main.js matches committed known-good hash', preHash.slice(0, 12) + '…')
  : fail('main.js DOES NOT match main.js.sha256', `${preHash} != ${expected}`);
if (failures) { console.log('\nSTOP: bundle drifted before the bake even ran.'); process.exit(1); }

/* ---- 2. bake ---- */
console.log('\n[2] bake');
const bake = spawnSync(process.execPath, [join(here, 'bake-calcv2.mjs')], { encoding: 'utf8' });
process.stdout.write(bake.stdout || '');
bake.status === 0 ? ok('bake-calcv2.mjs exited 0') : fail('bake failed', bake.stderr);
if (failures) process.exit(1);

/* ---- 3. bundle hash guard (post-bake) ---- */
console.log('\n[3] bundle hash guard (post-bake)');
sha256(join(here, 'main.js')) === expected
  ? ok('main.js byte-identical after bake')
  : fail('THE BAKE TOUCHED main.js — investigate before anything else');

/* ---- 4. byte parity sweep ---- */
console.log('\n[4] byte parity sweep (source vs baked)');
let compared = 0;
for (const dir of BAKED_DIRS) {
  const srcFiles = listFiles(join(calcV2, dir)).filter((f) => !BAKE_EXCLUDE.has(basename(f)));
  const bakedFiles = listFiles(join(here, 'calcv2', dir));
  const srcSet = new Set(srcFiles), bakedSet = new Set(bakedFiles);
  for (const f of srcFiles) {
    if (!bakedSet.has(f)) { fail(`missing from bake: ${dir}/${f}`); continue; }
    const a = readFileSync(join(calcV2, dir, f)), b = readFileSync(join(here, 'calcv2', dir, f));
    if (!a.equals(b)) fail(`byte mismatch: ${dir}/${f}`);
    compared++;
  }
  for (const f of bakedFiles) {
    if (!srcSet.has(f)) fail(`stray file in bake (not in source): ${dir}/${f}`);
    if (BAKE_EXCLUDE.has(basename(f))) fail(`EXCLUDED file leaked into bake: ${dir}/${f}`);
  }
}
if (!failures) ok(`${compared} files byte-identical, no strays, exclusions held`);

/* ---- 5. baked-vs-source fixtures ---- */
console.log('\n[5] fixture suites: source engine, then baked engine');
const runSuite = (suite, env, label) => {
  const r = spawnSync(process.execPath, [suite], { cwd: calcV2, encoding: 'utf8', env: { ...process.env, ...env } });
  const tail = (r.stdout || '').trim().split('\n').at(-1) || '(no output)';
  r.status === 0 ? ok(`${label} ${suite}`, tail) : fail(`${label} ${suite}`, tail + ' ' + (r.stderr || ''));
};
for (const s of SUITES) runSuite(s, {}, '[source]');
for (const s of SUITES) runSuite(s, { DYNAMICS_ENGINE_ROOT: join(here, 'calcv2', 'src') }, '[baked ]');

/* ---- 6. diff restriction guard ---- */
console.log('\n[6] diff restriction guard (git, r6 pin)');
const git = spawnSync('git', ['status', '--porcelain'], { cwd: here, encoding: 'utf8' });
const lines = (git.stdout || '').split('\n').filter(Boolean);
const offenders = lines.filter((l) => {
  const p = l.slice(3).replaceAll('"', '');
  return !p.startsWith('calcv2/');
});
offenders.length === 0
  ? ok(`working tree touches only calcv2/ (${lines.length} changed path(s))`)
  : offenders.forEach((l) => fail('UNEXPECTED path changed', l.trim()));

/* ---- verdict ---- */
console.log(failures === 0
  ? '\nGATE GREEN — all mechanical checks passed. Remaining manual step: page-load smoke test (WORKFLOW.md).'
  : `\nGATE RED — ${failures} failure(s). STOP. Nothing proceeds until this is clean.`);
process.exit(failures === 0 ? 0 : 1);
