import type { ContentAccessCredential, ContentAccessScope } from '@icao/contracts';

import type { QuestionBankTopic } from '../types';

export function currentQuestionBankContentAccountId() {
  return undefined;
}

export function questionBankContentAccountGeneration() {
  return 0;
}

export async function activateQuestionBankContentAccount(_accountId: string | undefined) {}

export async function writeMemberTopicCache(
  _accountId: string,
  _scope: ContentAccessScope,
  _topic: QuestionBankTopic,
  _credential: ContentAccessCredential,
) {}

export async function readMemberTopicCache(_accountId: string, _scope: ContentAccessScope) {
  return undefined;
}

export async function inspectOfflineMemberTopicAccess(
  _scope: ContentAccessScope,
  _now = Date.now(),
): Promise<'missing' | 'valid' | 'expired' | 'invalid'> {
  return 'missing' as const;
}

export async function cacheMemberResource(_publicPath: string, _url: string) {
  return undefined;
}

export async function resolveOfflineMemberResource(_publicPath: string) {
  return undefined;
}

export async function clearQuestionBankMemberContent(_accountId: string) {}

export async function clearAllQuestionBankMemberContent() {}
