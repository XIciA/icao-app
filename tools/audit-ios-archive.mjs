import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const appPathArgument = process.argv[2];
const outputPathArgument = process.argv[3];

if (!appPathArgument || !outputPathArgument) {
  throw new Error('Usage: node tools/audit-ios-archive.mjs <App.app> <evidence.json>');
}

const appPath = await realpath(appPathArgument);
const outputPath = path.resolve(outputPathArgument);
const evidenceRoot = path.resolve(root, '.generated/testflight');
if (!outputPath.startsWith(`${evidenceRoot}${path.sep}`)) {
  throw new Error('iOS archive audit evidence must stay under .generated/testflight.');
}
if (!(await stat(appPath)).isDirectory() || path.extname(appPath) !== '.app') {
  throw new Error('The iOS archive audit target must be an App.app directory.');
}

function run(command, args, failure) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(failure);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function plistJson(file) {
  return JSON.parse(run(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', file],
    `The iOS archive contains an invalid plist: ${path.relative(appPath, file)}`,
  ));
}

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    output.push({ absolute, entry });
    if (entry.isDirectory()) await walk(absolute, output);
  }
  return output;
}

function relative(file) {
  const value = path.relative(appPath, file);
  return value || '.';
}

function sha256(file) {
  return readFile(file).then((source) => createHash('sha256').update(source).digest('hex'));
}

function versionParts(value) {
  const parts = String(value ?? '').split('.').map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part) || part < 0)) return undefined;
  return parts;
}

function versionAtLeast(actualValue, requiredValue) {
  const actual = versionParts(actualValue);
  const required = versionParts(requiredValue);
  if (!actual || !required) return false;
  const length = Math.max(actual.length, required.length);
  for (let index = 0; index < length; index += 1) {
    const left = actual[index] ?? 0;
    const right = required[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

const appConfig = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
const infoPlistPath = path.join(appPath, 'Info.plist');
const info = plistJson(infoPlistPath);
if (info.CFBundleIdentifier !== appConfig.expo.ios.bundleIdentifier
  || info.CFBundleShortVersionString !== appConfig.expo.version
  || String(info.CFBundleVersion) !== String(appConfig.expo.ios.buildNumber)) {
  throw new Error('The iOS archive identity does not match app.json.');
}
if (!versionAtLeast(info.MinimumOSVersion, '15.1')) {
  throw new Error('The iOS archive minimum operating-system version is below 15.1.');
}

const allowedUsageDescriptions = new Set([
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSPhotoLibraryUsageDescription',
]);
const usageDescriptions = Object.keys(info)
  .filter((key) => /^NS.+UsageDescription$/u.test(key))
  .sort();
const unexpectedUsageDescriptions = usageDescriptions.filter((key) => !allowedUsageDescriptions.has(key));
if (unexpectedUsageDescriptions.length > 0) {
  throw new Error(`The iOS archive contains undeclared privacy permissions: ${unexpectedUsageDescriptions.join(', ')}`);
}
if (typeof info.NSMicrophoneUsageDescription !== 'string' || !info.NSMicrophoneUsageDescription.trim()) {
  throw new Error('The iOS archive is missing its required microphone permission explanation.');
}

run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], 'The iOS app code signature is invalid.');

const entries = await walk(appPath);
const manifestPaths = entries
  .filter(({ entry }) => entry.isFile() && entry.name.endsWith('.xcprivacy'))
  .map(({ absolute }) => absolute)
  .sort();
if (manifestPaths.length === 0) throw new Error('The iOS archive contains no privacy manifests.');

const accessedApiReasons = new Map();
const manifests = [];
for (const manifestPath of manifestPaths) {
  const manifest = plistJson(manifestPath);
  if (typeof manifest.NSPrivacyTracking !== 'boolean') {
    throw new Error(`Privacy manifest is missing NSPrivacyTracking: ${relative(manifestPath)}`);
  }
  const accessedTypes = manifest.NSPrivacyAccessedAPITypes ?? [];
  const collectedTypes = manifest.NSPrivacyCollectedDataTypes ?? [];
  const trackingDomains = manifest.NSPrivacyTrackingDomains ?? [];
  if (!Array.isArray(accessedTypes) || !Array.isArray(collectedTypes) || !Array.isArray(trackingDomains)) {
    throw new Error(`Privacy manifest uses an invalid top-level structure: ${relative(manifestPath)}`);
  }
  for (const item of accessedTypes) {
    const apiType = item?.NSPrivacyAccessedAPIType;
    const reasons = item?.NSPrivacyAccessedAPITypeReasons;
    if (typeof apiType !== 'string' || !Array.isArray(reasons) || reasons.length === 0
      || reasons.some((reason) => typeof reason !== 'string' || !reason.trim())) {
      throw new Error(`Privacy manifest has an incomplete required-reason API declaration: ${relative(manifestPath)}`);
    }
    const aggregate = accessedApiReasons.get(apiType) ?? new Set();
    reasons.forEach((reason) => aggregate.add(reason));
    accessedApiReasons.set(apiType, aggregate);
  }
  manifests.push({
    path: relative(manifestPath),
    sha256: await sha256(manifestPath),
    tracking: manifest.NSPrivacyTracking,
    trackingDomainCount: trackingDomains.length,
    collectedDataTypeCount: collectedTypes.length,
    accessedApiTypeCount: accessedTypes.length,
  });
}
if (accessedApiReasons.size === 0) {
  throw new Error('The iOS archive privacy manifests contain no required-reason API declarations.');
}

const embeddedCodePaths = entries
  .filter(({ absolute, entry }) => (
    (entry.isDirectory() && (entry.name.endsWith('.framework') || entry.name.endsWith('.appex')))
    || (entry.isFile() && entry.name.endsWith('.dylib'))
  ) && absolute !== appPath)
  .map(({ absolute }) => absolute)
  .sort();
if (embeddedCodePaths.length === 0) throw new Error('The iOS archive contains no auditable embedded SDK code.');

const embeddedCode = embeddedCodePaths.map((codePath) => {
  run('/usr/bin/codesign', ['--verify', '--strict', codePath], `Embedded SDK signature is invalid: ${relative(codePath)}`);
  const details = run('/usr/bin/codesign', ['-d', '--verbose=4', codePath], `Embedded SDK signature details are unavailable: ${relative(codePath)}`);
  const identifier = details.match(/^Identifier=(.+)$/mu)?.[1];
  const teamIdentifier = details.match(/^TeamIdentifier=(.+)$/mu)?.[1];
  if (!identifier) throw new Error(`Embedded SDK signature has no identifier: ${relative(codePath)}`);
  return { path: relative(codePath), identifier, teamIdentifier: teamIdentifier ?? null };
});

const evidence = {
  schemaVersion: 1,
  bundleIdentifier: info.CFBundleIdentifier,
  marketingVersion: info.CFBundleShortVersionString,
  buildNumber: String(info.CFBundleVersion),
  minimumOSVersion: String(info.MinimumOSVersion),
  usageDescriptions,
  privacyManifests: manifests,
  requiredReasonAPIs: [...accessedApiReasons.entries()]
    .map(([apiType, reasons]) => ({ apiType, reasons: [...reasons].sort() }))
    .sort((left, right) => left.apiType.localeCompare(right.apiType)),
  embeddedCode,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(
  `iOS archive privacy and SDK audit passed: manifests=${manifests.length}, embeddedCode=${embeddedCode.length}.`,
);
