/**
 * Bakes the shape pipeline (../CalcV2: src, vendor, web) into ./calcv2/ so the
 * deployed static tree is self-contained — Cloudflare Pages has no serve.mjs to
 * route /calcv2/* to a sibling folder.
 *
 * Canonical pipeline development home remains ../CalcV2. Run `node bake-calcv2.mjs`
 * after pipeline changes, before releasing. serve.mjs prefers ./calcv2 when present,
 * so local testing exercises exactly what deploys.
 */
import { cpSync, rmSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* DEV-ONLY files never baked into the deployable tree (ruling 2026-08-15):
 * the DYNAMIC bench is the engineer's console — it exposes engineer-fields
 * (floors, evidence zones, full contract dump) deliberately excluded from
 * the product page, and deploying it would publish a second, unreviewed
 * calculator. It stays in ../CalcV2, run locally via serve.mjs. */
const BAKE_EXCLUDE = new Set(['dynamic-bench.html']);

const here = fileURLToPath(new URL('.', import.meta.url));
const src = new URL('../CalcV2/', import.meta.url);
if (!existsSync(fileURLToPath(src))) throw new Error('../CalcV2 not found');
rmSync(here + 'calcv2', { recursive: true, force: true });
for (const dir of ['src', 'vendor', 'web']) {
  cpSync(fileURLToPath(new URL(dir, src)), `${here}calcv2/${dir}`, {
    recursive: true,
    filter: (from) => !BAKE_EXCLUDE.has(basename(from)),
  });
}
console.log('baked ../CalcV2/{src,vendor,web} -> ./calcv2/ (excluded: ' +
  [...BAKE_EXCLUDE].join(', ') + ')');
