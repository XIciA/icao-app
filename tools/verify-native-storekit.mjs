import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { assertExpoPrebuildCommand } from './release-command-contract.mjs';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const mappingPath = 'src/features/native-commercial-testflight/membership-products.native.ts';
const providerPath = 'src/features/native-commercial-testflight/storekit-commerce-provider.native.ts';
const adapterPath = 'src/features/native-commercial-testflight/react-native-iap-storekit-client.native.ts';
const contractPath = 'src/features/native-commercial-testflight/commerce-provider.native.ts';
const coordinatorPath =
  'src/features/native-commercial-testflight/commerce-transaction-coordinator.native.ts';
const appleProviderPath =
  'src/features/native-commercial-testflight/apple-storekit-commerce-provider.native.ts';
const runtimePath =
  'src/features/native-commercial-testflight/CommerceRuntimeProvider.native.tsx';
const runtimeOperationPath =
  'src/features/native-commercial-testflight/commerce-runtime-operation.native.ts';
const entitlementEventsPath =
  'src/features/native-commercial-testflight/commerce-entitlement-events.ts';
const hotspotInvalidationPath =
  'src/features/content/hotspot/access-invalidation.native.ts';
const appRuntimePath = 'src/platform/AppRuntime.tsx';
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
if (occurrences(mapping, 'recommended: true') !== 1 || !mapping.includes("key: 'membership_31d_v1'")) {
  failures.push('Exactly the 31-day StoreKit product must be recommended.');
}

for (const file of await sourceFiles(path.join(root, 'src'))) {
  await rejectParallelProductMapping(file);
  await rejectProductionCommerceActivation(file);
}

const adapter = await read(adapterPath);
for (const required of [
  'initConnection',
  'fetchProducts',
  'requestPurchase',
  'appAccountToken',
  'andDangerouslyFinishTransactionAutomatically: false',
  'syncIOS',
  'syncPurchases(',
  'getAllTransactionsIOS',
  'getPendingTransactionsIOS',
  'finishTransaction',
  'endConnection',
  'disconnect(',
  'product.type !== APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE',
  'product.typeIOS !== APPLE_NON_RENEWING_SUBSCRIPTION_PRODUCT_TYPE',
]) {
  if (!adapter.includes(required)) failures.push(`${adapterPath} is missing: ${required}`);
}
for (const [constantName, expectedValue] of [
  ['APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE', 'subs'],
  ['APPLE_NON_RENEWING_SUBSCRIPTION_PRODUCT_TYPE', 'non-renewing-subscription'],
]) {
  const stableConstantContract = new RegExp(
    `const\\s+${constantName}\\s*=\\s*['\"]${expectedValue}['\"](?:\\s+as\\s+const)?\\s*;`,
    'u',
  );
  if (!stableConstantContract.test(adapter)) {
    failures.push(`${adapterPath} must declare ${constantName} as ${expectedValue}.`);
  }
}
const adapterProductQuery = adapter.slice(
  adapter.indexOf('async fetchProducts('),
  adapter.indexOf('async requestPurchase('),
);
const adapterPurchaseRequest = adapter.slice(
  adapter.indexOf('async requestPurchase('),
  adapter.indexOf('async getTransactions('),
);
for (const [label, content] of [
  ['product query', adapterProductQuery],
  ['purchase request', adapterPurchaseRequest],
]) {
  if (!content.includes('type: APPLE_NON_RENEWING_SUBSCRIPTION_QUERY_TYPE')) {
    failures.push(`${adapterPath} ${label} must use the OpenIAP subscription query type.`);
  }
  if (content.includes("type: 'in-app'")) {
    failures.push(`${adapterPath} ${label} must reject the incorrect in-app product path.`);
  }
}
const adapterHistoryRead = adapter.slice(
  adapter.indexOf('async getTransactions('),
  adapter.indexOf('async syncPurchases('),
);
if (!adapterHistoryRead.includes('getAllTransactionsIOS()') || adapterHistoryRead.includes('syncIOS()')) {
  failures.push(`${adapterPath} startup history read must use getAllTransactionsIOS without syncIOS.`);
}
for (const [nativeCall, expectedTrackedCalls] of [
  ['initConnection', 1],
  ['fetchProducts', 1],
  ['requestPurchase', 1],
  ['getAllTransactionsIOS', 2],
  ['syncIOS', 1],
  ['getPendingTransactionsIOS', 1],
  ['finishTransaction', 1],
  ['endConnection', 1],
]) {
  const trackedCalls = matches(
    adapter,
    new RegExp(`trackNative\\(\\s*Promise\\.resolve\\(\\s*${nativeCall}\\(`, 'gu'),
  );
  if (trackedCalls !== expectedTrackedCalls) {
    failures.push(
      `${adapterPath} must register every raw ${nativeCall} promise directly with trackNative (${trackedCalls}/${expectedTrackedCalls}).`,
    );
  }
}
for (const required of [
  'const connectionOwners = new Set<symbol>()',
  'let connectionQueue: Promise<void> = Promise.resolve()',
  'return serializeConnection(async () =>',
  'if (!connectionEstablished || connectionOwners.size > 0) return',
]) {
  if (!adapter.includes(required)) {
    failures.push(`${adapterPath} is missing the process-global serialized connection lease: ${required}`);
  }
}

const provider = await read(providerPath);
const contract = await read(contractPath);
const coordinator = await read(coordinatorPath);
const appleProvider = await read(appleProviderPath);
const runtime = await read(runtimePath);
const runtimeOperation = await read(runtimeOperationPath);
const entitlementEvents = await read(entitlementEventsPath);
const hotspotInvalidation = await read(hotspotInvalidationPath);
const appRuntime = await read(appRuntimePath);
for (const [file, content, required] of [
  [providerPath, provider, 'requiresServerVerification: true'],
  [providerPath, provider, 'entitlementGranted: false'],
  [providerPath, provider, 'transactionFinished: false'],
  [providerPath, provider, 'commerce_purchase_timed_out'],
  [providerPath, provider, 'nativeCallTimeoutMs'],
  [providerPath, provider, 'runNativeCall'],
  [contractPath, contract, 'drainTransactionInbox('],
  [contractPath, contract, 'reconcileTransactions('],
  [contractPath, contract, 'markServerVerified('],
  [contractPath, contract, 'finishTransaction('],
  [contractPath, contract, 'dispose('],
]) {
  if (!content.includes(required)) failures.push(`${file} is missing: ${required}`);
}
const startupReconciliation = provider.slice(
  provider.indexOf('async reconcileTransactions('),
  provider.indexOf('async restorePurchases('),
);
if (
  !startupReconciliation.includes('this.client.getTransactions(options)') ||
  startupReconciliation.includes('this.client.syncPurchases(options)')
) {
  failures.push(`${providerPath} startup reconciliation must use only the silent StoreKit read.`);
}
const explicitRestore = provider.slice(
  provider.indexOf('async restorePurchases('),
  provider.indexOf('private reconcileSnapshot('),
);
if (
  !explicitRestore.includes('this.client.syncPurchases(options)') ||
  !explicitRestore.includes('this.client.getTransactions(options)')
) {
  failures.push(`${providerPath} explicit restore must bound StoreKit sync and history separately.`);
}
if (occurrences(provider, 'this.runNativeCall(') < 7) {
  failures.push(`${providerPath} does not bound every critical StoreKit native call.`);
}
for (const required of [
  'options.lifecycle?.trackRaw(nativeCall)',
  'if (options.lifecycle) options.lifecycle.drain(dispatch)',
  'this.client.requestPurchase({',
  '}, options)',
]) {
  if (!provider.includes(required)) {
    failures.push(`${providerPath} does not retain the raw StoreKit lifecycle: ${required}`);
  }
}
for (const required of [
  'NATIVE_COMMERCE_COORDINATOR_READY = true',
  'start(',
  'restorePurchasesFromUserAction(',
  'server-verified',
  'markServerVerified',
  'finishTransaction',
  'DEFAULT_COORDINATION_DEADLINE_MS',
  'DEFAULT_MAX_PAGES',
  'DEFAULT_MAX_TRANSACTIONS',
  'commerce_reconciliation_budget_exceeded',
  'commerce_reconciliation_timed_out',
  'commerce_operation_busy',
  'commerce_operation_cancelled',
]) {
  if (!coordinator.includes(required)) failures.push(`${coordinatorPath} is missing: ${required}`);
}
if (!appleProvider.includes('APPLE_STOREKIT_COMMERCE_RUNTIME_READY = true')) {
  failures.push(`${appleProviderPath} is not explicitly marked as runtime ready.`);
}
for (const required of [
  'createAppleStoreKitCommerceProvider()',
  'new NativeCommerceTransactionCoordinator',
  '/v1/commerce/apple/transactions/verify',
  '/v1/commerce/entitlements/current',
  'applicationAccountToken: controller.accountId',
  'verified.transactionId !== transaction.transactionReference',
  'entitlementChange',
  'beginCommerceEntitlementGeneration',
  'getCommerceEntitlementSnapshot',
  'foreground-reconciliation',
  'pending-reconciliation',
  'COMMERCE_RUNTIME_OPERATION_DEADLINE_MS',
  'operation.wait(',
  'operation.drain(controller.coordinator.whenIdle())',
  'options?.lifecycle?.trackRaw(verificationRequest)',
  'operationGate.whenIdle()',
  'operationGate.abortAndDrain(',
]) {
  if (!runtime.includes(required)) failures.push(`${runtimePath} is missing: ${required}`);
}
for (const required of [
  'CommerceRuntimeOperationGate',
  'CommerceRuntimeOperationDeadlineError',
  'this.pending.size > 0',
  'this.controller.abort()',
  'trackRaw<T>(promise: Promise<T>)',
  'whenIdle(): Promise<void>',
  'abortAndDrain(',
]) {
  if (!runtimeOperation.includes(required)) {
    failures.push(`${runtimeOperationPath} is missing: ${required}`);
  }
}
for (const required of [
  'beginCommerceEntitlementGeneration(',
  'getCommerceEntitlementSnapshot()',
  'change.generation !== activeGeneration',
  'revision += 1',
]) {
  if (!entitlementEvents.includes(required)) {
    failures.push(`${entitlementEventsPath} is missing the replayable monotonic contract: ${required}`);
  }
}
for (const required of [
  'subscribeCommerceEntitlementChanges',
  'commerceEntitlementSnapshotVersion',
]) {
  if (!hotspotInvalidation.includes(required)) {
    failures.push(`${hotspotInvalidationPath} is not wired to commerce entitlement invalidation: ${required}`);
  }
}
if (!appRuntime.includes('<CommerceRuntimeProvider>')) {
  failures.push(`${appRuntimePath} does not mount the authenticated Native commerce runtime.`);
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
  console.log('Native StoreKit products, client boundary, and iOS release gates verified');
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function occurrences(content, fragment) {
  return content.split(fragment).length - 1;
}

function matches(content, pattern) {
  return [...content.matchAll(pattern)].length;
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

async function rejectProductionCommerceActivation(file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (
    relative.includes('/__tests__/') ||
    /-test\.tsx?$/u.test(relative) ||
    relative === coordinatorPath ||
    relative === appleProviderPath ||
    relative === runtimePath
  ) {
    return;
  }

  const content = await readFile(file, 'utf8');
  for (const activationFragment of [
    'apple-storekit-commerce-provider',
    'commerce-transaction-coordinator',
    'storekit-commerce-provider.native',
    'react-native-iap-storekit-client.native',
    'createAppleStoreKitCommerceProvider',
    'NativeCommerceTransactionCoordinator',
  ]) {
    if (content.includes(activationFragment)) {
      failures.push(
        `${relative} activates infrastructure-only native commerce via ${activationFragment}.`,
      );
    }
  }
}
