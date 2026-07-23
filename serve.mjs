/**
 * Local mirror server for the deployed EAS Fleet Calculator (eas-calc.pages.dev).
 * Serves this folder and mimics Cloudflare Pages' SPA fallback: unknown paths
 * (e.g. /shape, /ship, /fleet) get index.html, which is how the nav routing works.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5179;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const full = join(ROOT, normalize(path).replace(/^(\.\.[/\])+/, ''));
  try {
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream' });
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
