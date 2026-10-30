import type { ContentAccessCredential, ContentAccessScope } from '@icao/contracts';
import type { QuestionBankTopic } from '../types';

// Web streams member resources after server authorization. It does not reuse
// native encrypted-file caches or grant offline access to protected content.
let accountId: string | undefined;
let generation = 0;
export function currentQuestionBankContentAccountId() { return accountId; }
export function questionBankContentAccountGeneration() { return generation; }
export async function activateQuestionBankContentAccount(next: string | undefined) {
  if (accountId !== next) { accountId = next; generation += 1; }
}
export async function writeMemberTopicCache(_accountId: string, _scope: ContentAccessScope, _topic: QuestionBankTopic, _credential: ContentAccessCredential) {}
export async function readMemberTopicCache(_accountId: string, _scope: ContentAccessScope): Promise<QuestionBankTopic | undefined> { return undefined; }
export type OfflineMemberTopicAccess = 'missing' | 'valid' | 'expired' | 'invalid';
export async function inspectOfflineMemberTopicAccess(_scope: ContentAccessScope, _now = Date.now()): Promise<OfflineMemberTopicAccess> { return 'missing'; }
export async function clearQuestionBankMemberContent(_accountId?: string) {
  // No persisted protected files; account switches own the context generation.
}
export async function clearAllQuestionBankMemberContent() { generation += 1; }
export async function resolveOfflineMemberResource(_path: string): Promise<string | undefined> { return undefined; }
export async function hasValidOfflineMemberResourceAccess(_path: string) { return false; }
export async function cacheMemberResource(_path: string, _url: string,
  _expected?: { checksum: string; sizeBytes: number },
  _options: { temporary?: boolean; isCurrent?: () => boolean } = {}): Promise<string | undefined> { return undefined; }

export async function suspendQuestionBankMemberAccess(_accountId: string) {}
export async function invalidateOfflineTopic(_scope: ContentAccessScope) {}

export async function isOfflineTopicInvalid(_scope: ContentAccessScope) { return false; }
