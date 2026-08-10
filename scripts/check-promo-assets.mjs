#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const promoRoot = join(repositoryRoot, 'public', 'promo');
const entryPath = 'index.html';
const readableExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg']);
const referencedAssetExtensions = [
  'avif',
  'css',
  'gif',
  'html',
  'ico',
  'jpeg',
  'jpg',
  'js',
  'json',
  'mjs',
  'otf',
  'png',
  'svg',
  'ttf',
  'webmanifest',
  'webp',
  'woff',
  'woff2',
].join('|');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath);
    return [absolutePath];
  }));
  return nestedFiles.flat();
}

function toPromoRelative(absolutePath) {
  return relative(promoRoot, absolutePath).split(sep).join('/');
}

function stripUrlSuffix(value) {
  return value
    .replaceAll('\\/', '/')
    .replace(/&(?:amp|quot|#39);/gu, '')
    .split(/[?#]/u, 1)[0]
    .replace(/[),;]+$/u, '');
}

function resolveReference(rawReference, sourcePath) {
  const reference = stripUrlSuffix(rawReference.trim());
  if (!reference || /^(?:#|data:|blob:|mailto:|tel:|https?:|\/\/)/iu.test(reference)) return null;

  let target;
  if (reference === '/promo' || reference === '/promo/') return null;
  if (reference.startsWith('/promo/')) {
    target = reference.slice('/promo/'.length);
  } else if (reference.startsWith('/')) {
    return null;
  } else if (reference.startsWith('legacy/')) {
    target = reference;
  } else if (reference.startsWith('static/') && sourcePath.startsWith('legacy/')) {
    target = `legacy/${reference}`;
  } else {
    target = posix.join(posix.dirname(sourcePath), reference);
  }

  const normalized = posix.normalize(target).replace(/^\.\//u, '');
  if (normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function extractPathReferences(source) {
  const references = new Set();
  const patterns = [
    /(?:^|["'(=\s])(\/promo\/[A-Za-z0-9@._~!$&'*+,;=:%/-]+)/gu,
    new RegExp(`(?:src|href|poster)\\s*=\\s*["']([^"']+\\.(?:${referencedAssetExtensions})(?:[?#][^"']*)?)["']`, 'giu'),
    /url\(\s*["']?([^"')\s]+)["']?\s*\)/giu,
    new RegExp(`["']((?:\\.\\.?/|legacy/|static/)[^"']+\\.(?:${referencedAssetExtensions})(?:[?#][^"']*)?)["']`, 'giu'),
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) references.add(match[1] ?? match[0]);
  }
  return references;
}

const absoluteFiles = await listFiles(promoRoot);
const allFiles = absoluteFiles.map(toPromoRelative).sort();
const legacyFiles = allFiles.filter((filePath) => filePath.startsWith('legacy/'));
const fileSet = new Set(allFiles);
const fileSizes = new Map(await Promise.all(absoluteFiles.map(async (absolutePath) => (
  [toPromoRelative(absolutePath), (await stat(absolutePath)).size]
))));

if (!fileSet.has(entryPath)) throw new Error(`promo_entry_missing:${entryPath}`);

const reachable = new Set();
const pending = [entryPath];
const missingReferences = new Map();

function enqueue(target) {
  if (reachable.has(target) || pending.includes(target)) return;
  pending.push(target);
}

while (pending.length > 0) {
  const sourcePath = pending.shift();
  reachable.add(sourcePath);

  if (!readableExtensions.has(extname(sourcePath))) continue;
  const source = await readFile(join(promoRoot, sourcePath), 'utf8');

  for (const rawReference of extractPathReferences(source)) {
    const target = resolveReference(rawReference, sourcePath);
    if (!target) continue;
    if (fileSet.has(target)) {
      enqueue(target);
    } else if (new RegExp(`\\.(?:${referencedAssetExtensions})$`, 'iu').test(target)) {
      const sources = missingReferences.get(target) ?? new Set();
      sources.add(sourcePath);
      missingReferences.set(target, sources);
    }
  }

  // Match exact emitted filenames as a conservative fallback for minified manifests.
  for (const candidate of allFiles) {
    if (reachable.has(candidate)) continue;
    const variants = [`/promo/${candidate}`, candidate];
    if (candidate.startsWith('legacy/')) variants.push(candidate.slice('legacy/'.length));
    if (variants.some((variant) => source.includes(variant))) enqueue(candidate);
  }

  // A non-empty Webpack runtime loader can synthesize filenames. When one is present,
  // retain every possible dynamic chunk rather than risk classifying it as an orphan.
  const isWebpackRuntime = posix.basename(sourcePath).startsWith('webpack-');
  if (isWebpackRuntime && source.includes('.u=') && !/\.u\s*=\s*[$\w]+\s*=>\s*\{\s*\}/u.test(source)) {
    for (const candidate of allFiles) {
      if (candidate.startsWith('legacy/static/chunks/') && candidate.endsWith('.js')) enqueue(candidate);
    }
  }
  if (isWebpackRuntime && source.includes('.miniCssF=') && !/\.miniCssF\s*=\s*[$\w]+\s*=>\s*\{\s*\}/u.test(source)) {
    for (const candidate of allFiles) {
      if (candidate.startsWith('legacy/static/css/') && candidate.endsWith('.css')) enqueue(candidate);
    }
  }
}

const orphans = legacyFiles.filter((filePath) => !reachable.has(filePath));
const orphanBytes = orphans.reduce((sum, filePath) => sum + fileSizes.get(filePath), 0);

for (const [target, sources] of [...missingReferences].sort(([left], [right]) => left.localeCompare(right))) {
  console.error(`promo_asset_missing target=${target} referenced_by=${[...sources].sort().join(',')}`);
}
for (const filePath of orphans) {
  console.log(`promo_asset_orphan bytes=${fileSizes.get(filePath)} path=${filePath}`);
}

if (missingReferences.size > 0 || orphans.length > 0) {
  console.error(
    `promo_asset_check_failed reachable=${reachable.size} missing=${missingReferences.size} `
      + `orphans=${orphans.length} orphan_bytes=${orphanBytes}`,
  );
  process.exitCode = 1;
} else {
  console.log(`promo_asset_check_ok reachable=${reachable.size} legacy_files=${legacyFiles.length}`);
}
