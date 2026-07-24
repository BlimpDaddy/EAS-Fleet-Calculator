/**
 * Local mirror server for the deployed EAS Fleet Calculator (eas-calc.pages.dev).
 * Serves this folder and mimics Cloudflare Pages' SPA fallback: unknown paths
 * (e.g. /shape, /ship, /fleet) get index.html, which is how the nav routing works.
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// V2 additions: the shape pipeline is served from its own folder (single source of
// truth — no copies), and the neighbouring OBJ library is exposed read-only.
const CALCV2 = fileURLToPath(new URL('../CalcV2/', import.meta.url));
const OBJ_DIR = fileURLToPath(new URL('../3D OBJ/', import.meta.url));
const PORT = Number(process.env.PORT) || 5179;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
};

const safe = (base, rel) => {
  const full = join(base, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  return full.startsWith(base) ? full : null;
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';

  // V2 routes — must precede the SPA fallback or a missing file comes back as HTML.
  if (path.startsWith('/calcv2/')) {
    const full = safe(CALCV2, path.slice('/calcv2/'.length));
    try {
      const body = await readFile(full);
      res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(body);
    } catch { res.writeHead(404); return res.end('not found'); }
  }
  if (path === '/objs-list') {
    let names = [];
    try { names = (await readdir(OBJ_DIR)).filter((f) => f.toLowerCase().endsWith('.obj')).sort(); } catch {}
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(names));
  }
  if (path.startsWith('/objs/')) {
    const full = safe(OBJ_DIR, path.slice('/objs/'.length));
    try {
      const body = await readFile(full);
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(body);
    } catch { res.writeHead(404); return res.end('not found'); }
  }

  const full = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    // SPA fallback, as Cloudflare Pages does
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(join(ROOT, 'index.html')));
  }
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  EAS Fleet Calculator (local mirror) at  ${url}\n  Close this window to stop it.\n`);
  if (!process.env.NO_OPEN) spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
});
