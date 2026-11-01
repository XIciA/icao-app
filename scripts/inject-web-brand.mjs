import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.ICAO_WEB_BOOT_OUTPUT ?? 'dist');
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] }));
const { generateImageAsync, generateFaviconAsync } = expoRequire('@expo/image-utils');
const manifest = JSON.parse(await readFile(join(root, 'assets/native-brand-manifest.json'), 'utf8'));
const source = join(root, manifest.master.path);
const digest = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 12);
const base = `/brand/${digest}`;
await mkdir(join(output, 'brand', digest), { recursive: true });
for (const size of [48, 180, 192, 512]) {
  const { source: png } = await generateImageAsync({ projectRoot: root, cacheType: 'web-brand' }, {
    src: source, width: size, height: size, resizeMode: 'contain', name: `logo-${size}.png`,
  });
  await writeFile(join(output, `${base}/logo-${size}.png`), png);
}
const ico = await generateFaviconAsync(await readFile(source), [16, 32, 48]);
await writeFile(join(output, `${base}/favicon.ico`), ico);
// Also replace conventional fallback URLs used by browsers and existing bookmarks.
await writeFile(join(output, 'favicon.ico'), ico);
await writeFile(join(output, 'apple-touch-icon.png'), await readFile(join(output, `${base}/logo-180.png`)));
await writeFile(join(output, `${base}/site.webmanifest`), JSON.stringify({
  name: '听你五个', short_name: '听你五个', start_url: '/', display: 'browser',
  background_color: '#FBFAF7', theme_color: '#FBFAF7',
  icons: [192, 512].map(size => ({ src: `${base}/logo-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
}));
const index = join(output, 'index.html');
let html = await readFile(index, 'utf8');
html = html.replace(/<link\b[^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon|manifest)["'][^>]*>/giu, '');
html = html.replace('</head>', `<link rel="icon" href="${base}/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" sizes="48x48" href="${base}/logo-48.png"><link rel="apple-touch-icon" sizes="180x180" href="${base}/logo-180.png"><link rel="manifest" href="${base}/site.webmanifest"></head>`);
await writeFile(index, html);
console.log(`Web brand assets derived from App master: ${digest}`);
