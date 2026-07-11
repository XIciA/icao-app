import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('/Users/zhouyide/Desktop/icao设计稿/public');
const port = Number(process.env.ICAO_ASSET_PORT ?? 3100);
const mimeTypes = {
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function sendError(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    sendError(response, 400, 'Bad request');
    return;
  }

  const filePath = resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendError(response, 403, 'Forbidden');
    return;
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    sendError(response, 404, 'Not found');
    return;
  }
  if (!stat.isFile()) {
    sendError(response, 404, 'Not found');
    return;
  }

  const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = stat.size - 1;
  let status = 200;

  if (range) {
    start = range[1] ? Number(range[1]) : 0;
    end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      response.end();
      return;
    }
    status = 206;
  }

  response.writeHead(status, {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': String(end - start + 1),
    'Content-Type': contentType,
    ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  if (request.method !== 'GET') {
    sendError(response, 405, 'Method not allowed');
    return;
  }

  createReadStream(filePath, { start, end })
    .on('error', () => response.destroy())
    .pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Serving canonical read-only design assets with byte-range support at http://0.0.0.0:${port}`);
});
