import { orderQuestionBanks } from '@/features/question-bank/lib/bank-order';
import embeddedRelease from '@/features/question-bank/data/question-bank-public-release.json';
import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
import { getNativeCommerceEnvironmentState } from '@/features/native-commercial-testflight/commerce-environment.native';
import { radioCardContent, radioDuration } from './track-content';
import { hydrateRadioCatalogDatasets, mergeRadioCatalogProgress } from './catalog-hydration.native';
import {
  getEmbeddedQuestionBanks,
  loadQuestionBank,
} from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';

import type { RadioCatalog } from './types';
import { scopeDataset } from '@/features/question-bank/lib/study-scope';
import type { StudyScope } from '@icao/contracts';
import type { ExamGoal } from '@/features/account/profile-model';
export type RadioStudySelection = { scope: StudyScope; target: ExamGoal };

// Formal app policy includes every enabled bank. The legacy radioEligible flag
// remains unchanged in the frozen Web content contract.
export function deriveRadioCatalogs(datasets: QuestionBankDataset[], selection?: RadioStudySelection): RadioCatalog[] {
  return orderQuestionBanks(selection ? datasets.map((bank) => scopeDataset(bank, selection.scope, selection.target)) : datasets)
    .filter((bank) => bank.enabled && bank.declaredCardCount > 0)
    .map((bank) => {
      let stableIndex = 0;
      return {
        complete: !bank.categories.some(category => category.topics.some(topic =>
          bank.access?.membershipActive === true && topic.access?.level === 'member'
          && !topic.radioEntries && topic.cards.length < topic.access.declaredCardCount)),
        bankId: bank.id,
        title: bank.title,
        nameEn: bank.nameEn,
        tracks: bank.categories.flatMap((category) => category.topics.flatMap((topic) => {
          const cards = new Map(topic.cards.map(card => [card.id, card]));
          const entries = topic.radioEntries
            ? topic.radioEntries : topic.cards.flatMap(card => card.retired || card.kind === 'image' || !card.audio ? [] : [{ id: card.id, title: card.taskTitle, durationSeconds: card.audioDurationSeconds ?? 0 }]);
          return entries.flatMap((entry) => {
            const card = cards.get(entry.id);
            if (!card) {
              return [{ id: entry.id, bankId: bank.id, bankTitle: bank.title, categoryId: category.id, categoryTitle: category.name,
                topicId: topic.id, topicTitle: topic.name, title: entry.title || `${topic.name}-${stableIndex + 1}`,
                audioText: '', audioPath: '', durationSeconds: entry.durationSeconds, stableIndex: stableIndex++, contentLoaded: false, requiresMembership: !topic.access?.freeCardIds?.includes(entry.id) }];
            }
            if (card.retired || card.kind === 'image' || !card.audio) return [];
            const track = {
              id: card.id,
              contentLoaded: true,
              requiresMembership: topic.access ? !topic.access.freeCardIds?.includes(card.id) : false,
              bankId: bank.id,
              bankTitle: bank.title,
              categoryId: category.id,
              categoryTitle: category.name,
              topicId: topic.id,
              topicTitle: topic.name,
              title: card.taskTitle,
              audioText: card.audioText,
              audioTextZh: card.audioTextZh,
              ...radioCardContent(bank.id, card),
              materials: bank.id === 'opi' ? topic.cards.flatMap((material) => material.kind === 'image' && !material.retired ? [{ image: material.image, imageAlt: material.imageAlt }] : []) : undefined,
              audioPath: card.audio,
              durationSeconds: radioDuration(card.audio, card.audioDurationSeconds),
              stableIndex,
            };
            stableIndex += 1;
            return [track];
          });
        })),
      };
    })
    // Keep an authorized empty directory selectable while its protected topics
    // are still metadata-only. Otherwise a new bank can never be hydrated.
    .filter((catalog) => catalog.tracks.length > 0 || datasets.find(bank => bank.id === catalog.bankId)?.access?.membershipActive === true);
}

export function getEmbeddedRadioCatalogs(selection?: RadioStudySelection): RadioCatalog[] {
  return deriveRadioCatalogs(getEmbeddedQuestionBanks(), selection);
}


/** Older APIs can use the bundled index only for the exact same release.
 * Never guess totals from topic counts or from a different content version. */
export function withEmbeddedRadioDirectory(dataset: QuestionBankDataset, embedded: QuestionBankDataset): QuestionBankDataset {
  const release = contentReleaseOf(dataset);
  if (!release || !embeddedRelease.sourceReleases.some(item => item.bankId === dataset.id && item.version === release.version && item.checksum === release.checksum)) return dataset;
  return { ...dataset, categories: dataset.categories.map(category => ({
    ...category, topics: category.topics.map(topic => ({
      ...topic, radioEntries: topic.radioEntries ?? embedded.categories.find(item => item.id === category.id)?.topics.find(item => item.id === topic.id)?.radioEntries,
    })),
  })) };
}

export async function loadRadioCatalogDatasets(selection?: RadioStudySelection, options: { complete?: boolean; bankId?: RadioCatalog['bankId']; getPriorityBankId?: () => RadioCatalog['bankId']; previousDatasets?: QuestionBankDataset[]; isCurrent?: () => boolean; onProgress?: (datasets: QuestionBankDataset[]) => void } = {}) {
  const owner = getNativeCommerceEnvironmentState();
  const assertOwner = () => {
    if (options.isCurrent && !options.isCurrent()) throw new Error('content_request_cancelled');
    const current = getNativeCommerceEnvironmentState();
    if (current.accountId !== owner.accountId || current.generation !== owner.generation) throw new Error('content_account_changed');
  };
  const embedded = getEmbeddedQuestionBanks();
  const eligible = embedded.filter((bank) => bank.enabled);
  const durationByAudio = new Map(
    eligible.flatMap((bank) => bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.flatMap((card) => (
      card.kind !== 'image' && card.audio && card.audioDurationSeconds ? [[card.audio, card.audioDurationSeconds] as const] : []
    ))))),
  );
  const loaded = await Promise.all(eligible.map(async (fallback) => {
    const result = await loadQuestionBank(fallback.id);
    const dataset = result?.dataset ? withEmbeddedRadioDirectory(result.dataset, fallback) : fallback;
    return {
      ...dataset,
      capabilities: dataset.capabilities ?? fallback.capabilities,
      categories: dataset.categories.map((category) => ({
        ...category,
        topics: category.topics.map((topic) => ({
          ...topic,
          cards: topic.cards.map((card) => card.kind !== 'image' && card.audio && !card.audioDurationSeconds
            ? { ...card, audioDurationSeconds: durationByAudio.get(card.audio) }
            : card),
        })),
      })),
    } satisfies QuestionBankDataset;
  }));
  assertOwner();
  const resumed = mergeRadioCatalogProgress(loaded, options.previousDatasets ?? []);
  const scoped = selection ? resumed.map((bank) => scopeDataset(bank, selection.scope, selection.target)).filter((bank) => bank.declaredCardCount > 0) : resumed;
  // App startup uses metadata only. Expand authorized text when the radio session opens.
  if (!options.complete) return scoped;
  const publish = (datasets: QuestionBankDataset[]) => {
    assertOwner();
    options.onProgress?.(selection ? datasets.map(bank => scopeDataset(bank, selection.scope, selection.target)) : datasets);
  };
  publish(scoped);
  const hydrated = await hydrateRadioCatalogDatasets(scoped, assertOwner, publish, options.getPriorityBankId ?? options.bankId);
  return selection ? hydrated.map((bank) => scopeDataset(bank, selection.scope, selection.target)) : hydrated;
}

export async function loadRadioCatalogs() {
  return deriveRadioCatalogs(await loadRadioCatalogDatasets());
}
