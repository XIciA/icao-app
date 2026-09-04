import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

export function exactPhoneBindingFlowFailures(service, phoneAuth) {
  const failures = [];
  const verifyCall = 'const verified = await this.phoneAuth.verifyBindingChallenge(';
  const bindingCall = 'const binding = await this.attachNewPhoneIdentity(';
  const verifyCallAt = service.indexOf(verifyCall);
  const bindingCallAt = service.indexOf(bindingCall);
  if (verifyCallAt < 0) failures.push('binding must verify and consume an exact purpose-bound challenge');
  if (bindingCallAt < 0) failures.push('binding transaction entry is missing');
  if (verifyCallAt >= 0 && bindingCallAt >= 0 && verifyCallAt >= bindingCallAt) {
    failures.push('the exact binding challenge must be consumed before the binding transaction');
  }

  const bindingMethodStart = phoneAuth.indexOf('async verifyBindingChallenge(');
  const bindingMethodEnd = phoneAuth.indexOf('async consumeOtpIntent(', bindingMethodStart);
  const bindingMethod = bindingMethodStart >= 0 && bindingMethodEnd > bindingMethodStart
    ? phoneAuth.slice(bindingMethodStart, bindingMethodEnd)
    : '';
  if (!bindingMethod.includes('return this.verifyChallenge(') || !bindingMethod.includes("'phone_binding'")) {
    failures.push('binding verification must delegate to the phone_binding exact-challenge state machine');
  }

  const verificationStart = phoneAuth.indexOf('private async verifyChallenge(');
  const verificationEnd = phoneAuth.indexOf('private async verifyWithHardTimeout', verificationStart);
  const verificationMethod = verificationStart >= 0 && verificationEnd > verificationStart
    ? phoneAuth.slice(verificationStart, verificationEnd)
    : '';
  const consumeAt = verificationMethod.indexOf('const consumed = await this.consumeVerification(');
  const returnAt = verificationMethod.indexOf('return {\n      accessToken:');
  if (consumeAt < 0 || returnAt < 0 || consumeAt >= returnAt) {
    failures.push('verified binding OTPs must be atomically consumed before session tokens are returned');
  }
  return failures;
}

function run() {
  const service = read('services/api/src/account/account.service.ts');
  const phoneAuth = read('services/api/src/auth/phone-auth.service.ts');
  const controller = read('services/api/src/account/account.controller.ts');
  const contracts = read('packages/contracts/src/index.ts');
  const nativeAuth = read('src/features/auth/auth-service.ts');
  const accountScreen = read('src/features/account/AccountScreen.tsx');

  const failures = exactPhoneBindingFlowFailures(service, phoneAuth);
  const requireText = (source, text, message) => {
    if (!source.includes(text)) failures.push(message);
  };
  const forbidText = (source, text, message) => {
    if (source.includes(text)) failures.push(message);
  };

  requireText(service, 'async bindPhoneWithOtp(', 'API must expose bind-only phone verification');
  requireText(service, "throw new ConflictException('phone_already_registered')", 'occupied phones must use the stable 409 conflict');
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
    process.exitCode = 1;
    return;
  }

  console.log('account-binding-freeze: ok');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
