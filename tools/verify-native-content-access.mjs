import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const contracts = readFileSync(resolve(root, 'packages/contracts/src/index.ts'), 'utf8');
const nativeRepository = readFileSync(resolve(root, 'src/features/question-bank/data/repository.native.ts'), 'utf8');
const memberContentCache = readFileSync(resolve(root, 'src/features/question-bank/data/member-content-cache.native.ts'), 'utf8');
const nativeStudyRoute = readFileSync(resolve(root, 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx'), 'utf8');
const credentialVerifier = readFileSync(resolve(root, 'src/features/question-bank/data/content-credential-verifier.native.ts'), 'utf8');
const contentAccessService = readFileSync(resolve(root, 'services/api/src/content-access/content-access.service.ts'), 'utf8');
const databaseSchema = readFileSync(resolve(root, 'services/api/src/database/schema.ts'), 'utf8');
const distributionModule = readFileSync(resolve(root, 'modules/icao-distribution-environment/ios/IcaoDistributionEnvironmentModule.swift'), 'utf8');
const webRepository = readFileSync(resolve(root, 'src/features/question-bank/platform/remote-resource-service.ts'), 'utf8');
const nativeMockExam = readFileSync(resolve(root, 'src/features/mock-exam/build-session.native.ts'), 'utf8');
const nativeRadioCatalog = readFileSync(resolve(root, 'src/features/radio-player/catalog.native.ts'), 'utf8');
const nativeRadioHydration = readFileSync(resolve(root, 'src/features/radio-player/catalog-hydration.native.ts'), 'utf8');
const nativeRadioProvider = readFileSync(resolve(root, 'src/features/radio-player/RadioPlayerProvider.tsx'), 'utf8');
const publicBanks = JSON.parse(readFileSync(resolve(root, 'src/features/question-bank/data/question-bank-public.json'), 'utf8'));
const sourceBanks = JSON.parse(readFileSync(resolve(root, 'src/features/question-bank/data/question-bank.json'), 'utf8'));

const countCards = (banks) => banks.reduce((bankTotal, bank) => bankTotal + bank.categories.reduce(
  (categoryTotal, category) => categoryTotal + category.topics.reduce(
    (topicTotal, topic) => topicTotal + topic.cards.length,
    0,
  ),
  0,
), 0);

assert.match(nativeRepository, /question-bank-public\.json/u);
assert.doesNotMatch(nativeRepository, /from ['"]\.\/question-bank\.json['"]/u);
assert.match(nativeRepository, /\/v1\/question-banks\/\$\{encodeURIComponent\(bankId\)\}\/categories\//u);
assert.match(nativeRepository, /\/v1\/content-access\/credentials/u);
assert.match(nativeRepository, /JSON\.stringify\(\{ scopes: \[scope\] \}\)/u);
assert.doesNotMatch(nativeRepository, /deviceId|getQuestionBankContentDeviceId/u);
assert.match(nativeStudyRoute, /useQuestionBankTopic/u);
assert.match(credentialVerifier, /verifyIcaoEd25519Jws/u);
assert.match(credentialVerifier, /72 \* 60 \* 60/u);
assert.doesNotMatch(credentialVerifier, /\bdid\b|deviceId/u);
assert.match(contracts, /CONTENT_ACCESS_POLICY_VERSION = 'content-access-v2'/u);
assert.doesNotMatch(contracts, /deviceId/u);
assert.match(memberContentCache, /deleteItemAsync\(LEGACY_DEVICE_ID_KEY\)/u);
assert.match(memberContentCache, /LEGACY_CREDENTIAL_INDEX_PREFIX/u);
assert.doesNotMatch(memberContentCache, /randomUUID|setItemAsync\(LEGACY_DEVICE_ID_KEY/u);
assert.doesNotMatch(contentAccessService, /input\.deviceId|deviceDigest|\bdid:/u);
assert.doesNotMatch(databaseSchema, /deviceDigest/u);
assert.match(distributionModule, /sandboxReceipt/u);
assert.match(distributionModule, /Curve25519\.Signing\.PublicKey/u);
assert.doesNotMatch(webRepository, /member-content-cache|COMMERCE_ENVIRONMENT_HEADER/u);
assert.match(nativeMockExam, /hydrateMockExamTopic/u);
assert.match(nativeRadioCatalog, /loadRadioCatalogDatasets/u);
// Directory text expands through the existing authorized repository only after
// the radio session opens; app startup still retrieves public metadata only.
assert.match(nativeRadioCatalog, /if \(!options\.complete\) return scoped/u);
assert.match(nativeRadioCatalog, /hydrateRadioCatalogDatasets\(scoped, assertOwner\)/u);
assert.match(nativeRadioProvider, /complete: sessionVisible/u);
assert.match(nativeRadioHydration, /membershipActive === true/u);
assert.match(nativeRadioHydration, /Math\.min\(3, work\.length\)/u);
assert.match(nativeRadioHydration, /questionBankRepository\.getTopic/u);
assert.match(nativeRadioHydration, /hydrateRadioCatalogTopic/u);
assert.match(nativeRadioHydration, /nextRadioCatalogTopic/u);
assert.doesNotMatch(nativeRadioHydration, /Promise\.all\(datasets|Promise\.all\(category\.topics/u);
assert.match(nativeRadioProvider, /hydrateTrackTopic/u);
assert.match(nativeRadioProvider, /hydrateFollowingTrackTopic/u);
assert.equal(countCards(publicBanks), 1_044);
assert.equal(countCards(sourceBanks), 10_964);
assert.ok(readFileSync(resolve(root, 'src/features/question-bank/data/question-bank-public.json')).byteLength < 1_000_000);

console.log('native_content_access_boundary_ok');
