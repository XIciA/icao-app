import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { assertExpoPrebuildCommand } from './release-command-contract.mjs';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const mappingPath = 'src/features/native-commercial-testflight/membership-products.native.ts';
const releaseHelperPath = 'scripts/lib/ios-release-product.sh';
const iosCngGatePath = 'tools/verify-ios-cng-product.mjs';
const appStoreConnectIapPath = 'tools/app-store-connect-iap.mjs';
const appStoreConnectIapAvailabilityPath =
  'tools/lib/app-store-connect-iap-availability.mjs';
const appStoreConnectIapAvailabilityTestsPath =
  'tools/app-store-connect-iap-availability-tests.mjs';
const appStoreConnectApiPath = 'tools/lib/app-store-connect-api.mjs';
const gatedReleaseScripts = [
  'scripts/archive-ios-testflight.sh',
  'scripts/build-standalone-ios.sh',
  'scripts/release-ios-testflight.sh',
];
const expectedProducts = Object.freeze({
  membership_7d_v1: 'com.readyoufife.ios.membership.7d.v1',
  membership_15d_v1: 'com.readyoufife.ios.membership.15d.v1',
  membership_31d_v1: 'com.readyoufife.ios.membership.31d.v1',
  membership_62d_v1: 'com.readyoufife.ios.membership.62d.v1',
  membership_93d_v1: 'com.readyoufife.ios.membership.93d.v1',
});
const failures = [];

if (packageJson.dependencies?.['react-native-iap'] !== '16.3.2') {
  failures.push('react-native-iap must be pinned exactly to the CNG-verified version 16.3.2.');
}
if (packageJson.dependencies?.['react-native-nitro-modules'] !== '0.36.5') {
  failures.push('react-native-nitro-modules must be pinned exactly to the CNG-verified version 0.36.5.');
}

const mapping = await read(mappingPath);
for (const [businessKey, productId] of Object.entries(expectedProducts)) {
  if (occurrences(mapping, `'${businessKey}'`) !== 1) {
    failures.push(`${mappingPath} must map the business key exactly once: ${businessKey}`);
  }
  if (occurrences(mapping, `'${productId}'`) !== 1) {
    failures.push(`${mappingPath} must map the Apple product ID exactly once: ${productId}`);
  }
}
if (occurrences(mapping, 'recommended: true') !== 1 || !mapping.includes("key: 'membership_31d_v1'")) {
  failures.push('Exactly the 31-day StoreKit product must be recommended.');
}
for (const file of await sourceFiles(path.join(root, 'src'))) {
  await rejectParallelProductMapping(file);
}

const appStoreConnectIap = await read(appStoreConnectIapPath);
const appStoreConnectIapAvailability = await read(appStoreConnectIapAvailabilityPath);
const appStoreConnectApi = await read(appStoreConnectApiPath);
for (const required of [
  '<!-- iap-products:start -->',
  'result.links?.next',
  'candidate.value <= targetPriceCny',
  "inAppPurchaseType: 'NON_RENEWING_SUBSCRIPTION'",
  'createChinaMainlandAvailabilityBody(current.id)',
  'matchesChinaMainlandAvailability(',
  "process.env.ICAO_APP_STORE_CONNECT_WRITE !== '1'",
  'existingPrice !== selected.value',
  "existingBaseTerritory !== 'CHN'",
  'filter%5Bterritory%5D=CHN',
  'territoryIds: [CHINA_MAINLAND_TERRITORY_ID]',
  'price.attributes?.startDate == null',
  'included.id === pricePointId',
  "subscriptionStatusUrlVersion: 'V2'",
  "subscriptionStatusUrlVersionForSandbox: 'V2'",
]) {
  if (!appStoreConnectIap.includes(required)) {
    failures.push(`${appStoreConnectIapPath} is missing: ${required}`);
  }
}
for (const required of [
  "CHINA_MAINLAND_TERRITORY_ID = 'CHN'",
  'availableInNewTerritories: false',
  'availableTerritories.length === 1',
]) {
  if (!appStoreConnectIapAvailability.includes(required)) {
    failures.push(`${appStoreConnectIapAvailabilityPath} is missing: ${required}`);
  }
}
for (const [file, content] of [
  [appStoreConnectIapPath, appStoreConnectIap],
  [appStoreConnectIapAvailabilityPath, appStoreConnectIapAvailability],
]) {
  if (content.includes('availableInNewTerritories: true')) {
    failures.push(`${file} must not opt IAP products into future territories.`);
  }
}
if (!appStoreConnectApi.includes('acceptedStatuses.includes(response.status)')) {
  failures.push(`${appStoreConnectApiPath} must explicitly handle accepted non-success statuses.`);
}

const releaseHelper = await read(releaseHelperPath);
for (const required of [
  'verify_ios_storekit_dependencies()',
  'configure_ios_cng_product()',
  'verify-ios-cng-product.mjs',
  'Release iOS product overrides are forbidden',
  'NitroIap (16.3.2)',
  'NitroModules (0.36.5)',
  'openiap (3.2.1)',
]) {
  if (!releaseHelper.includes(required)) failures.push(`${releaseHelperPath} is missing: ${required}`);
}
for (const releaseScript of gatedReleaseScripts) {
  const content = await read(releaseScript);
  if (!content.includes('configure_ios_cng_product "$PROJECT_ROOT/ios"')) {
    failures.push(`${releaseScript} does not validate the generated Expo CNG iOS product identity.`);
  }
  if (!content.includes('-workspace "$IOS_WORKSPACE"') || !content.includes('-scheme "$IOS_SCHEME"')) {
    failures.push(`${releaseScript} does not build the configured Expo CNG workspace and scheme.`);
  }
  if (!content.includes('verify_ios_storekit_dependencies "$PROJECT_ROOT/ios/Podfile.lock"')) {
    failures.push(`${releaseScript} does not reject an archive without the pinned StoreKit native pods.`);
  }
  try {
    assertExpoPrebuildCommand(content, {
      label: releaseScript,
      platform: 'ios',
      requireClean: true,
      requireNoInstall: true,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (content.indexOf('configure_ios_cng_product') < content.indexOf('pod install')) {
    failures.push(`${releaseScript} validates the CNG product before CocoaPods creates the workspace.`);
  }
  for (const forbidden of ['ios/ICAO.xcworkspace', 'ICAO_IOS_SCHEME:-ICAO']) {
    if (content.includes(forbidden)) {
      failures.push(`${releaseScript} still contains the legacy iOS product identity: ${forbidden}`);
    }
  }
}

const iosCngSelfTest = spawnSync(process.execPath, [path.join(root, iosCngGatePath), '--self-test'], {
  encoding: 'utf8',
});
if (iosCngSelfTest.status !== 0) {
  failures.push(
    `${iosCngGatePath} did not reject a reproducible stale ignored iOS workspace/project: ${iosCngSelfTest.stderr.trim()}`,
  );
}

const availabilityTest = spawnSync(
  process.execPath,
  ['--test', path.join(root, appStoreConnectIapAvailabilityTestsPath)],
  { encoding: 'utf8' },
);
if (availabilityTest.status !== 0) {
  failures.push(
    `${appStoreConnectIapAvailabilityTestsPath} failed: ${availabilityTest.stderr.trim()}`,
  );
}

if (failures.length) {
  console.error('Native StoreKit verification failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Native StoreKit dependencies, product mapping, and iOS CNG release gates verified');
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function occurrences(content, fragment) {
  return content.split(fragment).length - 1;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [absolute] : [];
  }));
  return nested.flat();
}

async function rejectParallelProductMapping(file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (relative === mappingPath || relative.includes('/__tests__/') || /-test\.tsx?$/u.test(relative)) return;

  const content = await readFile(file, 'utf8');
  const productId = content.match(/com\.readyoufife\.ios\.membership\.(?:7|15|31|62|93)d\.v1/u)?.[0];
  if (productId) failures.push(`${relative} duplicates the Apple product mapping for ${productId}.`);
}
