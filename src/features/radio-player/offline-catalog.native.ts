import { currentQuestionBankContentAccountId, readMemberTopicCache, offlineResourcePrepared, inspectOfflineMemberTopicAccess } from '@/features/question-bank/data/member-content-cache.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';

/** Only explicit package contents enter an offline queue, including verified partial packages. */
export async function offlineRadioDatasets(datasets: QuestionBankDataset[], assertCurrent: () => void) {
  const { prepareDownloads, downloadSnapshot } = require('@/features/question-bank/downloads/download-manager.native') as typeof import('@/features/question-bank/downloads/download-manager.native');
  await prepareDownloads(); assertCurrent();
  const account = currentQuestionBankContentAccountId();
  const packages = downloadSnapshot();
  let authorizationRequired = false;
  const result = await Promise.all(datasets.map(async bank => {
    const item = packages[bank.id];
    const manifests = [item?.saved, item?.target].filter(value => Boolean(value));
    const resources = new Map(manifests.flatMap(manifest => manifest!.resources.map(resource => [resource.publicPath, resource] as const)));
    const available = new Map<string, boolean>();
    const categories = await Promise.all(bank.categories.map(async category => ({ ...category,
      topics: await Promise.all(category.topics.map(async topic => {
        const descriptors = manifests.flatMap(manifest => manifest!.topics.filter(descriptor => descriptor.categoryId === category.id && descriptor.topicId === topic.id));
        const ids = new Set(descriptors.flatMap(descriptor => descriptor.cardIds));
        const local = account && ids.size ? await readMemberTopicCache(account, { bankId: bank.id, categoryId: category.id, topicId: topic.id }) : undefined;
        assertCurrent();
        if (account && ids.size && !local) {
          const access = await inspectOfflineMemberTopicAccess({ bankId: bank.id, categoryId: category.id, topicId: topic.id });
          if (access === 'expired' || access === 'invalid') authorizationRequired = true;
        }
        const cards = [];
        for (const card of local?.cards ?? []) {
          if (card.retired || card.kind === 'image' || !card.audio || !ids.has(card.id)) continue;
          const resource = resources.get(card.audio);
          if (!resource) continue;
          if (!available.has(card.audio)) available.set(card.audio, await offlineResourcePrepared(card.audio, resource));
          assertCurrent();
          if (available.get(card.audio)) cards.push(card);
        }
        return { ...topic, cards, radioEntries: undefined, declaredCardCount: cards.length,
          access: topic.access ? { ...topic.access, declaredCardCount: cards.length, availableCardCount: cards.length } : undefined };
      })),
    })));
    return { ...bank, offlineProjection: true, categories, declaredCardCount: categories.reduce((sum, category) => sum + category.topics.reduce((count, topic) => count + topic.cards.length, 0), 0) };
  }));
  assertCurrent();
  if (authorizationRequired && !result.some(bank => bank.declaredCardCount > 0)) throw Object.assign(new Error('offline_authorization_required'), { code: 'offline_authorization_required' });
  return result;
}
