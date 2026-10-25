import { orderQuestionBanks } from '@/features/question-bank/lib/bank-order';
import { contentReleaseOf, sameContentRelease } from '@/features/question-bank/data/content-version.native';
import { getNativeCommerceEnvironmentState } from '@/features/native-commercial-testflight/commerce-environment.native';
import { radioCardContent, radioDuration } from './track-content';
import { hydrateRadioCatalogDatasets } from './catalog-hydration.native';
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
          && topic.cards.length < topic.access.declaredCardCount)),
        bankId: bank.id,
        title: bank.title,
        nameEn: bank.nameEn,
        tracks: bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.flatMap((card) => {
          if (card.retired || card.kind === 'image' || !card.audio) return [];
          const track = {
            id: card.id,
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
        }))),
      };
    })
    // Keep an authorized empty directory selectable while its protected topics
    // are still metadata-only. Otherwise a new bank can never be hydrated.
    .filter((catalog) => catalog.tracks.length > 0 || datasets.find(bank => bank.id === catalog.bankId)?.access?.membershipActive === true);
}

export function getEmbeddedRadioCatalogs(selection?: RadioStudySelection): RadioCatalog[] {
  return deriveRadioCatalogs(getEmbeddedQuestionBanks(), selection).map(catalog => ({ ...catalog, complete: false }));
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
    const dataset = result?.dataset ?? fallback;
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
  // Reuse only this owner's same-release authorized progress. Never carry
  // member text across an entitlement or release change.
  for (const bank of loaded) {
    const previous = options.previousDatasets?.find(item => item.id === bank.id);
    const release = contentReleaseOf(bank);
    if (!previous || !release || !sameContentRelease(previous, release)
      || bank.access?.membershipActive !== true || previous.access?.membershipActive !== true) continue;
    for (const category of bank.categories) {
      const oldCategory = previous.categories.find(item => item.id === category.id);
      category.topics = category.topics.map(topic => {
        const oldTopic = oldCategory?.topics.find(item => item.id === topic.id);
        return oldTopic && oldTopic.cards.length > topic.cards.length
          ? { ...topic, cards: oldTopic.cards, access: topic.access ? { ...topic.access, availableCardCount: oldTopic.cards.length } : undefined }
          : topic;
      });
    }
  }
  const scoped = selection ? loaded.map((bank) => scopeDataset(bank, selection.scope, selection.target)).filter((bank) => bank.declaredCardCount > 0) : loaded;
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
