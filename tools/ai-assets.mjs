import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = resolve(root, 'services/api/src/ai/assets');
const manifestPath = resolve(assetRoot, 'manifest.json');
const allowedRoots = ['capabilities', 'domain', 'shared'];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.md') ? [path] : [];
  }));
  return files.flat().sort();
}

async function collect() {
  const files = (await Promise.all(allowedRoots.map((name) => walk(resolve(assetRoot, name))))).flat().sort();
  const assets = [];
  const stableIds = [];
  for (const file of files) {
    const content = await readFile(file);
    assets.push({
      path: relative(assetRoot, file),
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
    const text = content.toString('utf8');
    for (const match of text.matchAll(/^- ID: ([A-Z][A-Z0-9]*(?:-[A-Z]+)?-[0-9]{3})\s*$/gm)) {
      stableIds.push({ id: match[1], path: relative(assetRoot, file) });
    }
  }
  const duplicates = stableIds.filter((entry, index) => stableIds.findIndex((candidate) => candidate.id === entry.id) !== index);
  if (duplicates.length) throw new Error(`Duplicate AI asset stable IDs: ${duplicates.map((entry) => entry.id).join(', ')}`);
  const manifest = {
    schemaVersion: 1,
    policy: 'runtime-only; evals excluded',
    assets,
    stableIds: stableIds.sort((left, right) => left.id.localeCompare(right.id)),
  };
  return manifest;
}

async function snapshot() {
  const manifest = await collect();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function check() {
  const expected = JSON.parse(await readFile(manifestPath, 'utf8'));
  const actual = await collect();
  if (JSON.stringify(actual.assets) !== JSON.stringify(expected.assets) || JSON.stringify(actual.stableIds) !== JSON.stringify(expected.stableIds)) {
    throw new Error('AI asset manifest mismatch. Review the asset changes, then run pnpm ai:assets:snapshot.');
  }
  process.stdout.write(`AI assets verified: ${actual.assets.length} files\n`);
}

const command = process.argv[2] ?? 'check';
if (command === 'snapshot') {
  const manifest = await snapshot();
  process.stdout.write(`AI asset snapshot written: ${manifest.assets.length} files\n`);
} else if (command === 'check') {
  await check();
} else {
  throw new Error(`Unknown command: ${command}`);
}
