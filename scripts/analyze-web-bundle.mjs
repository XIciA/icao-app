import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const reportFlag = args.indexOf('--report');
const reportPath = reportFlag >= 0 ? resolve(args[reportFlag + 1]) : undefined;
const positional = args.filter((value, index) => (
  !value.startsWith('--') && (reportFlag < 0 || index !== reportFlag + 1)
));
const outputDirectory = resolve(positional[0] ?? join(root, '.generated/web-bundle-analysis'));
const baseline = JSON.parse(await readFile(join(root, 'scripts/web-bundle-baseline.json'), 'utf8'));

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function packageVersion(source) {
  const match = source.match(/^\/node_modules\/.pnpm\/((?:@[^+]+\+)?[^@/]+)@([^_/]+)[^/]*\/node_modules\//u);
  if (!match) return undefined;
  return { name: match[1].replace('+', '/'), version: match[2] };
}

const files = await walk(outputDirectory);
const mainJavaScriptFiles = files.filter((path) => (
  /\/_expo\/static\/js\/web\/index-[^/]+\.js$/u.test(path)
  && !path.endsWith('.js.map')
));
assert(mainJavaScriptFiles.length === 1, `web_bundle_main_count_invalid:${mainJavaScriptFiles.length}`);

const mainPath = mainJavaScriptFiles[0];
const mainBytes = await readFile(mainPath);
const sourceMapPath = `${mainPath}.map`;
const hasSourceMap = await stat(sourceMapPath).then(() => true, () => false);
const sources = hasSourceMap
  ? JSON.parse(await readFile(sourceMapPath, 'utf8')).sources ?? []
  : [];

const versionsByPackage = new Map();
for (const source of sources) {
  const dependency = packageVersion(source);
  if (!dependency) continue;
  const versions = versionsByPackage.get(dependency.name) ?? new Set();
  versions.add(dependency.version);
  versionsByPackage.set(dependency.name, versions);
}
const duplicatePackages = [...versionsByPackage.entries()]
  .filter(([, versions]) => versions.size > 1)
  .map(([name, versions]) => ({ name, versions: [...versions].sort() }))
  .sort((left, right) => left.name.localeCompare(right.name));

const lucideIconSources = sources.filter((source) => (
  source.includes('/lucide-react-native/') && source.includes('/icons/')
));
const lucideRootSources = sources.filter((source) => source.endsWith('/dist/esm/lucide-react-native.mjs'));
const forbiddenPlatformSources = sources.filter((source) => (
  /\.(?:native|ios|android)\.[cm]?[jt]sx?$/u.test(source)
  || source.endsWith('/src/features/radio-player/native-queue.ts')
  || source.includes('/react-native-track-player@')
));
const silenceAssets = files.filter((path) => basename(path).startsWith('radio-interval-silence-30s'));
const criticalEmbeddedSources = [
  '/src/features/question-bank/data/question-bank.json',
  '/src/features/question-bank/static-word-lookup/data/dataset.json',
];
const unexpectedDuplicatePackages = duplicatePackages.filter(({ name, versions }) => {
  const allowedVersions = baseline.allowedDuplicatePackages[name];
  return !allowedVersions || versions.some((version) => !allowedVersions.includes(version));
});
const projectBundlerConfiguration = await Promise.all([
  join(root, 'package.json'),
  join(root, 'metro.config.js'),
  join(root, 'babel.config.js'),
].map(async (path) => stat(path).then(
  () => readFile(path, 'utf8'),
  () => '',
)));
const forbiddenExperimentalSettings = [
  'EXPO_UNSTABLE_TREE_SHAKING',
  'EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH',
  'inlineRequires',
].filter((setting) => projectBundlerConfiguration.some((source) => source.includes(setting)));

const report = {
  schemaVersion: 1,
  outputDirectory: relative(root, outputDirectory) || '.',
  mainBundle: {
    path: relative(outputDirectory, mainPath),
    rawBytes: mainBytes.length,
    gzipBytes: gzipSync(mainBytes, { level: 9 }).length,
    brotliQ6Bytes: brotliCompressSync(mainBytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
    }).length,
  },
  modules: {
    total: sources.length,
    lucideIcons: lucideIconSources.length,
    lucideRoot: lucideRootSources,
    forbiddenPlatform: forbiddenPlatformSources,
    criticalEmbedded: criticalEmbeddedSources.filter((source) => sources.includes(source)),
    duplicatePackages,
    forbiddenExperimentalSettings,
  },
  assets: {
    totalFiles: files.filter((path) => !path.endsWith('.map')).length,
    radioIntervalSilence: silenceAssets.map((path) => relative(outputDirectory, path)),
  },
};

if (check) {
  assert(hasSourceMap, 'web_bundle_source_map_required');
  assert(
    report.mainBundle.rawBytes
      <= baseline.mainBundle.rawBytes - baseline.limits.minimumRawReductionBytes,
    `web_bundle_raw_not_reduced:${report.mainBundle.rawBytes}:${baseline.mainBundle.rawBytes}`,
  );
  assert(
    report.mainBundle.gzipBytes
      <= baseline.mainBundle.gzipBytes - baseline.limits.minimumGzipReductionBytes,
    `web_bundle_gzip_not_reduced:${report.mainBundle.gzipBytes}:${baseline.mainBundle.gzipBytes}`,
  );
  assert(
    report.mainBundle.brotliQ6Bytes
      <= baseline.mainBundle.brotliQ6Bytes - baseline.limits.minimumBrotliQ6ReductionBytes,
    `web_bundle_brotli_not_reduced:${report.mainBundle.brotliQ6Bytes}:${baseline.mainBundle.brotliQ6Bytes}`,
  );
  assert(
    mainJavaScriptFiles.length <= baseline.limits.mainJavaScriptFiles,
    `web_bundle_javascript_split_forbidden:${mainJavaScriptFiles.length}`,
  );
  assert(lucideRootSources.length === 0, `web_bundle_lucide_root_present:${lucideRootSources.length}`);
  assert(
    lucideIconSources.length <= baseline.limits.lucideIconModules,
    `web_bundle_lucide_icons_exceeded:${lucideIconSources.length}`,
  );
  assert(forbiddenPlatformSources.length === 0, `web_bundle_platform_leak:${forbiddenPlatformSources.join(',')}`);
  assert(silenceAssets.length === 0, `web_bundle_native_silence_asset:${silenceAssets.join(',')}`);
  assert(
    report.modules.criticalEmbedded.length === criticalEmbeddedSources.length,
    `web_bundle_embedded_data_missing:${report.modules.criticalEmbedded.join(',')}`,
  );
  assert(
    unexpectedDuplicatePackages.length === 0,
    `web_bundle_duplicate_dependency_added:${unexpectedDuplicatePackages.map(({ name }) => name).join(',')}`,
  );
  assert(
    forbiddenExperimentalSettings.length === 0,
    `web_bundle_experimental_setting_forbidden:${forbiddenExperimentalSettings.join(',')}`,
  );
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, serialized, 'utf8');
process.stdout.write(serialized);
