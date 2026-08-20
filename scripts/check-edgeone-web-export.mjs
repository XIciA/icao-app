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

if (!index.includes('/_expo/static/js/web/')) throw new Error('edgeone_export_boot_script_missing');

const totalBytes = (await Promise.all(outputFiles.map(async (path) => (await stat(path)).size)))
  .reduce((total, size) => total + size, 0);
if (totalBytes > 100 * 1024 * 1024) throw new Error(`edgeone_export_too_large:${totalBytes}`);

console.log(`EdgeOne Web export verified: ${outputFiles.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB.`);
