// Derive static-site compatibility icons from the same approved App master.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] }));
const { generateImageAsync } = expoRequire('@expo/image-utils');
const master = resolve(root, 'assets/images/icon-native.png');
const source = await readFile(master);
const digest = createHash('sha256').update(source).digest('hex').slice(0, 12);
const check = process.argv.includes('--check');
async function output(path, data) {
  const file = resolve(root, path);
  const bytes = Buffer.from(data);
  if (check) {
    if (!(await readFile(file)).equals(bytes)) throw new Error(`Static brand asset out of date: ${path}`);
  } else await writeFile(file, bytes);
}
for (const [size, paths] of [
  [32, ['public/promo/icon-light-32x32.png', 'public/promo/icon-dark-32x32.png']],
  [180, ['public/promo/apple-icon.png']],
  [1024, ['official-site/assets/images/icoach-icon.png']],
]) {
  const { source: png } = await generateImageAsync({ projectRoot: root, cacheType: 'static-brand' }, {
    src: master, width: size, height: size, resizeMode: 'contain', name: `logo-${size}.png`,
  });
  for (const path of paths) await output(path, png);
}
// Keep the old SVG URL working without maintaining a second, redrawn logo.
const svgImage = await readFile(resolve(root, 'public/promo/apple-icon.png'));
await output('public/promo/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img" aria-label="听你五个"><image width="180" height="180" href="data:image/png;base64,${svgImage.toString('base64')}"/></svg>\n`);
for (const file of ['public/promo/index.html', 'official-site/index.html', 'official-site/projects/icao/index.html']) {
  let html = await readFile(resolve(root, file), 'utf8');
  // Update both HTML links and serialized Next metadata; hydration must not restore old URLs.
  html = html.replace(/((?:\/promo\/(?:icon-light-32x32\.png|icon-dark-32x32\.png|apple-icon\.png|icon\.svg)|\/assets\/images\/icoach-icon\.png))(?:\?v=[a-f0-9]+)?/gu, `$1?v=${digest}`);
  html = html.replaceAll('v0.app', '听你五个');
  await output(file, html);
}
console.log(`Static brand ${check ? 'verified' : 'generated'}: ${digest}`);
