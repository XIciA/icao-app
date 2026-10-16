import { ApiClientError } from '@/platform/api-client';
import { commerceEntitlementSnapshotVersion } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { nativeCommerceEnvironmentSnapshot } from '@/features/native-commercial-testflight/commerce-environment.native';
import { createCardDirectory, directoryHasCompleteBank, type CardLocation } from './card-directory';
import { contentReleaseOf } from './content-version.native';
import { loadQuestionBank, questionBankRepository } from './repository.native';
import type { QuestionBankCardTarget } from '../annotations/types';

export type CardReference = {
  status: 'ready' | 'membership-required' | 'unavailable' | 'not-found';
  location?: CardLocation;
  message?: string;
};
export const cardIdentityKey = (target: Pick<QuestionBankCardTarget, 'bankId' | 'cardId'>) => `${target.bankId}:${target.cardId}`;
export const referenceOwner = () => `${nativeCommerceEnvironmentSnapshot()}:${commerceEntitlementSnapshotVersion()}`;

/** A request-local projection of the existing repository; no second content cache. */
export async function resolveCardReferences(targets: readonly QuestionBankCardTarget[]) {
  const owner = referenceOwner();
  const assertOwner = () => { if (owner !== referenceOwner()) throw new Error('content_account_changed'); };
  const result = new Map<string, CardReference>();
  const bankIds = [...new Set(targets.map(target => target.bankId))];
  for (const bankId of bankIds) {
    const requested = targets.filter(target => target.bankId === bankId);
    try {
      const loaded = await loadQuestionBank(bankId); assertOwner();
      if (!loaded) throw new Error('question_bank_unavailable');
      const directory = createCardDirectory([loaded.dataset]);
      const topics = new Map<string, CardLocation[]>();
      for (const target of requested) {
        const key = cardIdentityKey(target);
        const location = directory.get(target);
        if (!location) {
          const confirmed = loaded.source === 'remote' && directoryHasCompleteBank(loaded.dataset);
          result.set(key, { status: confirmed ? 'not-found' : 'unavailable', message: confirmed
            ? '当前题库已无此题，标注仍保留。' : '尚未确认原题，请联网后重试。' });
        } else if (location.card) result.set(key, { status: 'ready', location });
        else if (loaded.source === 'remote' && loaded.dataset.access?.membershipActive === false) {
          result.set(key, { status: 'membership-required', location, message: '原题属于会员内容，标注仍保留。' });
        } else {
          const topicKey = `${location.categoryId}:${location.topicId}`;
          topics.set(topicKey, [...(topics.get(topicKey) ?? []), location]);
        }
      }
      // Bound concurrency and share each topic request among its annotations.
      const groups = [...topics.values()];
      for (let i = 0; i < groups.length; i += 4) await Promise.all(groups.slice(i, i + 4).map(async locations => {
        const first = locations[0];
        try {
          const topic = await questionBankRepository.getTopic(bankId, first.categoryId, first.topicId, contentReleaseOf(loaded.dataset));
          assertOwner();
          for (const location of locations) {
            const card = topic?.cards.find(card => card.id === location.cardId);
            result.set(cardIdentityKey(location), card ? { status: 'ready', location: { ...location, card } }
              : { status: 'unavailable', location, message: '原题内容暂未加载完整，请重试。' });
          }
        } catch (error) {
          assertOwner();
          const locked = error instanceof ApiClientError && error.code === 'membership_required';
          for (const location of locations) result.set(cardIdentityKey(location), {
            status: locked ? 'membership-required' : 'unavailable', location,
            message: locked ? '原题属于会员内容，标注仍保留。' : '原题加载未完成，请联网后重试。',
          });
        }
      }));
    } catch {
      assertOwner();
      for (const target of requested) result.set(cardIdentityKey(target), { status: 'unavailable', message: '原题加载未完成，请联网后重试。' });
    }
  }
  assertOwner();
  return result;
}
