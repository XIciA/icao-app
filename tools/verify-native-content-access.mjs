import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const nativeRepository = readFileSync(resolve(root, 'src/features/question-bank/data/repository.native.ts'), 'utf8');
const nativeStudyRoute = readFileSync(resolve(root, 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx'), 'utf8');
const credentialVerifier = readFileSync(resolve(root, 'src/features/question-bank/data/content-credential-verifier.native.ts'), 'utf8');
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
assert.match(nativeStudyRoute, /useQuestionBankTopic/u);
assert.match(credentialVerifier, /verifyIcaoEd25519Jws/u);
assert.match(credentialVerifier, /72 \* 60 \* 60/u);
assert.match(distributionModule, /sandboxReceipt/u);
assert.match(distributionModule, /Curve25519\.Signing\.PublicKey/u);
assert.doesNotMatch(webRepository, /member-content-cache|COMMERCE_ENVIRONMENT_HEADER/u);
assert.match(nativeMockExam, /hydrateMockExamTopic/u);
assert.match(nativeRadioCatalog, /loadRadioCatalogDatasets/u);
assert.doesNotMatch(nativeRadioCatalog, /hydrateRadioCatalog/u);
assert.match(nativeRadioHydration, /hydrateRadioCatalogTopic/u);
assert.match(nativeRadioHydration, /nextRadioCatalogTopic/u);
assert.doesNotMatch(nativeRadioHydration, /Promise\.all\(datasets|Promise\.all\(category\.topics/u);
assert.match(nativeRadioProvider, /hydrateTrackTopic/u);
assert.match(nativeRadioProvider, /hydrateFollowingTrackTopic/u);
assert.equal(countCards(publicBanks), 1_044);
assert.equal(countCards(sourceBanks), 6_865);
assert.ok(readFileSync(resolve(root, 'src/features/question-bank/data/question-bank-public.json')).byteLength < 1_000_000);

console.log('native_content_access_boundary_ok');
