import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4173);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

if (!existsSync(join(root, 'index.html'))) throw new Error('dist/index.html is missing; run pnpm web:export first');

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  let target = join(root, relative);
  if (!existsSync(target) || statSync(target).isDirectory()) target = join(root, 'index.html');
  response.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
  createReadStream(target).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Web export: http://127.0.0.1:${port}`);
});
