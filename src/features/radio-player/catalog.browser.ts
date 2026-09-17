import { deriveRadioCatalogs, getEmbeddedRadioCatalogs, loadRadioCatalogDatasets } from './catalog.native';
import { questionBankRepository } from '@/features/question-bank/data/repository.native';
import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
import { getNativeCommerceEnvironmentState } from '@/features/native-commercial-testflight/commerce-environment.native';

export { deriveRadioCatalogs, getEmbeddedRadioCatalogs };

/** Catalog endpoints deliberately omit protected cards; retrieve the authorized
 * topic content before building a member's web listening queue. Bounded workers
 * keep this small set of topic requests from competing with audio playback. */
export async function loadRadioCatalogs() {
  const owner = getNativeCommerceEnvironmentState();
  const assertOwner = () => {
    const current = getNativeCommerceEnvironmentState();
    if (current.accountId !== owner.accountId || current.generation !== owner.generation) throw new Error('content_account_changed');
  };
  const datasets = await loadRadioCatalogDatasets();
  assertOwner();
  const work = datasets.flatMap(dataset => dataset.access?.membershipActive
    ? dataset.categories.flatMap(category => category.topics.flatMap((topic, index) =>
      topic.access?.level === 'member' && topic.cards.length < topic.access.declaredCardCount
        ? [{ dataset, category, topic, index }] : [])) : []);
  let next = 0;
  const worker = async () => {
    while (next < work.length) {
      const item = work[next++];
      assertOwner();
      const topic = await questionBankRepository.getTopic(item.dataset.id, item.category.id, item.topic.id, contentReleaseOf(item.dataset));
      assertOwner();
      if (!topic) throw new Error('radio_topic_unavailable');
      item.category.topics[item.index] = topic;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, work.length) }, worker));
  assertOwner();
  return deriveRadioCatalogs(datasets);
}
