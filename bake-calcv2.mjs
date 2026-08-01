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
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const src = new URL('../CalcV2/', import.meta.url);
if (!existsSync(fileURLToPath(src))) throw new Error('../CalcV2 not found');
rmSync(here + 'calcv2', { recursive: true, force: true });
for (const dir of ['src', 'vendor', 'web']) {
  cpSync(fileURLToPath(new URL(dir, src)), `${here}calcv2/${dir}`, { recursive: true });
}
console.log('baked ../CalcV2/{src,vendor,web} -> ./calcv2/');
