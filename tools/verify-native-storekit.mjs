import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const mappingPath = 'src/features/native-commercial-testflight/membership-products.native.ts';
const providerPath = 'src/features/native-commercial-testflight/storekit-commerce-provider.native.ts';
const adapterPath = 'src/features/native-commercial-testflight/react-native-iap-storekit-client.native.ts';
const contractPath = 'src/features/native-commercial-testflight/commerce-provider.native.ts';
const releaseHelperPath = 'scripts/lib/ios-release-product.sh';
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
if (!packageJson.scripts?.['check:ios:testflight']?.includes('pnpm check:ios:storekit')) {
  failures.push('The TestFlight verifier must run the Native StoreKit contract check.');
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

const adapter = await read(adapterPath);
for (const required of [
  'initConnection',
  'fetchProducts',
  'requestPurchase',
  'appAccountToken',
  'andDangerouslyFinishTransactionAutomatically: false',
  'syncIOS',
  'getAllTransactionsIOS',
  'getPendingTransactionsIOS',
  'finishTransaction',
  'endConnection',
  'disconnect()',
]) {
  if (!adapter.includes(required)) failures.push(`${adapterPath} is missing: ${required}`);
}

const provider = await read(providerPath);
const contract = await read(contractPath);
for (const [file, content, required] of [
  [providerPath, provider, 'requiresServerVerification: true'],
  [providerPath, provider, 'entitlementGranted: false'],
  [providerPath, provider, 'transactionFinished: false'],
  [providerPath, provider, 'commerce_purchase_timed_out'],
  [contractPath, contract, 'drainTransactionInbox()'],
  [contractPath, contract, 'reconcileTransactions()'],
  [contractPath, contract, 'markServerVerified('],
  [contractPath, contract, 'finishTransaction('],
  [contractPath, contract, 'dispose()'],
]) {
  if (!content.includes(required)) failures.push(`${file} is missing: ${required}`);
}

const releaseHelper = await read(releaseHelperPath);
for (const required of [
  'verify_ios_storekit_dependencies()',
  'configure_ios_cng_product()',
  'IOS_WORKSPACE=${ICAO_IOS_WORKSPACE:-$ios_root/app.xcworkspace}',
  'IOS_SCHEME=${ICAO_IOS_SCHEME:-app}',
  'IOS_PRODUCT_NAME=${ICAO_IOS_PRODUCT_NAME:-app}',
  'NitroIap (16.3.2)',
  'NitroModules (0.36.5)',
  'openiap (3.2.1)',
]) {
  if (!releaseHelper.includes(required)) failures.push(`${releaseHelperPath} is missing: ${required}`);
}
for (const releaseScript of gatedReleaseScripts) {
  const content = await read(releaseScript);
  if (!content.includes('configure_ios_cng_product "$PROJECT_ROOT/ios"')) {
    failures.push(`${releaseScript} does not load the canonical Expo CNG iOS product identity.`);
  }
  if (!content.includes('-workspace "$IOS_WORKSPACE"') || !content.includes('-scheme "$IOS_SCHEME"')) {
    failures.push(`${releaseScript} does not build the configured Expo CNG workspace and scheme.`);
  }
  if (!content.includes('verify_ios_storekit_dependencies "$PROJECT_ROOT/ios/Podfile.lock"')) {
    failures.push(`${releaseScript} does not reject an archive without the pinned StoreKit native pods.`);
  }
  for (const forbidden of ['ios/ICAO.xcworkspace', 'ICAO_IOS_SCHEME:-ICAO']) {
    if (content.includes(forbidden)) {
      failures.push(`${releaseScript} still contains the legacy iOS product identity: ${forbidden}`);
    }
  }
}

if (failures.length) {
  console.error('Native StoreKit verification failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Native StoreKit products, client boundary, and iOS release gates verified');
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
