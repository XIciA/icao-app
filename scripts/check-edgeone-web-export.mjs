import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'dist');

async function files(directory) {
  const entries = await readdir(directory);
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry);
    return (await stat(path)).isDirectory() ? files(path) : [path];
  }))).flat();
}

const outputFiles = await files(output);
const index = await readFile(join(output, 'index.html'), 'utf8');
const uploadConfig = JSON.parse(await readFile(join(output, 'edgeone.json'), 'utf8'));
const javascript = (await Promise.all(
  outputFiles.filter((path) => path.endsWith('.js')).map((path) => readFile(path, 'utf8')),
)).join('\n');

const required = [
  'https://api.readyoufife.com',
  'https://cloud.readyoufife.com',
  'edgeone-production',
];
for (const marker of required) {
  if (!javascript.includes(marker)) throw new Error(`edgeone_export_marker_missing:${marker}`);
}

// Browser identity must follow the same immutable App master as runtime artwork.
const brand = JSON.parse(await readFile('assets/native-brand-manifest.json', 'utf8'));
const brandDigest = createHash('sha256').update(await readFile(brand.master.path)).digest('hex').slice(0, 12);
const brandBase = `/brand/${brandDigest}`;
for (const suffix of ['favicon.ico', 'logo-48.png', 'logo-180.png', 'site.webmanifest']) {
  if (!index.includes(`href="${brandBase}/${suffix}"`)) throw new Error(`web_brand_link_missing:${suffix}`);
}
for (const size of [48, 180, 192, 512]) {
  const png = await readFile(join(output, `${brandBase}/logo-${size}.png`));
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`web_brand_size_invalid:${size}`);
}
const webManifest = JSON.parse(await readFile(join(output, `${brandBase}/site.webmanifest`), 'utf8'));
if (webManifest.icons.length !== 2 || !webManifest.icons.every(icon => icon.src.startsWith(brandBase + '/'))) {
  throw new Error('web_brand_manifest_invalid');
}
if (!index.includes('/_expo/static/js/web/')) throw new Error('edgeone_export_boot_script_missing');

for (const forbidden of ['buildCommand', 'installCommand', 'name', 'outputDirectory']) {
  if (uploadConfig[forbidden] !== undefined) throw new Error(`edgeone_upload_config_forbidden:${forbidden}`);
}
if (!Array.isArray(uploadConfig.rewrites) || !Array.isArray(uploadConfig.headers)) {
  throw new Error('edgeone_upload_config_runtime_rules_missing');
}
if (!uploadConfig.redirects?.some((redirect) => (
  redirect.source === '$wwwhost'
  && redirect.destination === '$host'
  && redirect.statusCode === 301
))) {
  throw new Error('edgeone_upload_config_www_redirect_missing');
}

const totalBytes = (await Promise.all(outputFiles.map(async (path) => (await stat(path)).size)))
  .reduce((total, size) => total + size, 0);
if (totalBytes > 100 * 1024 * 1024) throw new Error(`edgeone_export_too_large:${totalBytes}`);

console.log(`EdgeOne Web export verified: ${outputFiles.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB.`);
