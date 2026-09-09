import type { QuestionBankDataset, QuestionBankTopic } from '../types';
export type ContentReleaseReference = { bankId: string; version: number; checksum: string };
export function contentReleaseOf(value: unknown): ContentReleaseReference | undefined {
  const ref = (value as { contentRelease?: ContentReleaseReference } | undefined)?.contentRelease;
  return ref && typeof ref.bankId === 'string' && Number.isSafeInteger(ref.version) && ref.version > 0 && /^[a-f0-9]{64}$/.test(ref.checksum) ? ref : undefined;
}
export function withContentRelease<T extends QuestionBankDataset | QuestionBankTopic>(value: T, ref: ContentReleaseReference): T {
  return { ...value, contentRelease: ref };
}
export function sameContentRelease(value: unknown, expected?: ContentReleaseReference) {
  if (!expected) return true;
  const actual = contentReleaseOf(value);
  return actual?.bankId === expected.bankId && actual.version === expected.version && actual.checksum === expected.checksum;
}
