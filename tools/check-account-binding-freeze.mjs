import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const service = read('services/api/src/account/account.service.ts');
const controller = read('services/api/src/account/account.controller.ts');
const contracts = read('packages/contracts/src/index.ts');
const nativeAuth = read('src/features/auth/auth-service.ts');
const accountScreen = read('src/features/account/AccountScreen.tsx');

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const forbidText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(service, 'async bindPhoneWithOtp(', 'API must expose bind-only phone verification');
requireText(service, "throw new ConflictException('phone_already_registered')", 'occupied phones must use the stable 409 conflict');
requireText(service, "consumeOtpIntent(phoneSession, 'phone_binding'", 'verified binding OTPs must be consumed before the binding transaction');
requireText(controller, "@Post(['phone-binding/start', 'merge/phone/start'])", 'canonical and legacy start routes must share one handler');
requireText(controller, "@Post(['phone-binding/verify', 'merge/phone'])", 'canonical and legacy verify routes must share one bind-only handler');
requireText(controller, 'this.account.bindPhoneWithOtp(', 'all verification routes must call the bind-only service');
requireText(contracts, 'export type BindPhoneRequest', 'phone binding request contract is missing');
requireText(contracts, 'export type BindPhoneResponse', 'phone binding response contract is missing');
requireText(nativeAuth, "'/v1/account/phone-binding/start'", 'Native must use the canonical phone-binding start route');
requireText(nativeAuth, "'/v1/account/phone-binding/verify'", 'Native must use the canonical phone-binding verify route');
requireText(accountScreen, '该手机号已有账号，请退出后使用手机号登录', 'Native occupied-phone guidance is missing');

for (const forbidden of [
  'mergeWithPhoneOtp',
  'mergeAccounts',
  'accountMerges',
  "status: 'merging'",
  "status: 'merged'",
  'mergedIntoAccountId',
  'user_card_states',
  'learning_records',
  'sync_mutations',
  'user_documents',
  'ai_consents',
  'ai_usage_logs',
  'ai_quota_buckets',
  'ai_word_cache',
  'feedback_tickets',
]) {
  forbidText(service, forbidden, `phone binding runtime still contains account-transfer behavior: ${forbidden}`);
}

forbidText(contracts, 'MergePhoneAccount', 'shared contracts must use bind-only naming');
forbidText(nativeAuth, '/v1/account/merge/phone', 'Native must not call legacy merge-named routes');

if (failures.length > 0) {
  for (const failure of failures) console.error(`account-binding-freeze: ${failure}`);
  process.exit(1);
}

console.log('account-binding-freeze: ok');
