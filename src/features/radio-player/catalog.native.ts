import { getNativeCommerceEnvironmentState } from '@/features/native-commercial-testflight/commerce-environment.native';
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

export function deriveRadioCatalogs(datasets: QuestionBankDataset[], selection?: RadioStudySelection): RadioCatalog[] {
  return (selection ? datasets.map((bank) => scopeDataset(bank, selection.scope, selection.target)) : datasets)
    .filter((bank) => bank.capabilities?.radioEligible)
    .map((bank) => {
      let stableIndex = 0;
      return {
        bankId: bank.id,
        title: bank.title,
        nameEn: bank.nameEn,
        tracks: bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.flatMap((card) => {
          if (card.kind === 'image' || !card.audio) return [];
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
            audioPath: card.audio,
            durationSeconds: card.audioDurationSeconds ?? 0,
            stableIndex,
          };
          stableIndex += 1;
          return [track];
        }))),
      };
    })
    .filter((catalog) => catalog.tracks.length > 0);
}

export function getEmbeddedRadioCatalogs(selection?: RadioStudySelection) {
  return deriveRadioCatalogs(getEmbeddedQuestionBanks(), selection);
}

export async function loadRadioCatalogDatasets(selection?: RadioStudySelection, options: { complete?: boolean } = {}) {
  const owner = getNativeCommerceEnvironmentState();
  const assertOwner = () => {
    const current = getNativeCommerceEnvironmentState();
    if (current.accountId !== owner.accountId || current.generation !== owner.generation) throw new Error('content_account_changed');
  };
  const embedded = getEmbeddedQuestionBanks();
  const eligible = embedded.filter((bank) => bank.capabilities?.radioEligible);
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
  const scoped = selection ? loaded.map((bank) => scopeDataset(bank, selection.scope, selection.target)).filter((bank) => bank.declaredCardCount > 0) : loaded;
  // App startup uses metadata only. Expand authorized text when the radio session opens.
  if (!options.complete) return scoped;
  const hydrated = await hydrateRadioCatalogDatasets(scoped, assertOwner);
  return selection ? hydrated.map((bank) => scopeDataset(bank, selection.scope, selection.target)) : hydrated;
}

export async function loadRadioCatalogs() {
  return deriveRadioCatalogs(await loadRadioCatalogDatasets());
}
