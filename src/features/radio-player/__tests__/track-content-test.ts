import banks from '@/features/question-bank/data/question-bank.json';
import type { QuestionBankDataset, QuestionBankTextCard } from '@/features/question-bank/types';
import { deriveRadioCatalogs } from '../catalog.native';
import { radioCardContent, radioDuration } from '../track-content';

const datasets = banks as QuestionBankDataset[];

it('includes all five banks and all 10809 audio questions, with measured durations', () => {
  const catalogs = deriveRadioCatalogs(datasets);
  expect(catalogs.map(bank => bank.bankId)).toEqual(['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling']);
  expect(catalogs.flatMap(bank => bank.tracks)).toHaveLength(10809);
  expect(catalogs.flatMap(bank => bank.tracks).every(track => track.durationSeconds > 0)).toBe(true);
  expect(catalogs.find(bank => bank.bankId === 'opi')?.tracks.filter(track => track.materials?.length)).toHaveLength(450);
});

it('uses the correct listening option and its Chinese translation', () => {
  const card: QuestionBankTextCard = { id: 'q', taskTitle: 'Q', audioText: 'Question', referenceText: 'Legacy answer', choices: ['Wrong', 'Correct'], choicesZh: ['错误', '正确'], correctChoiceIndex: 1 };
  expect(radioCardContent('listening', card)).toEqual({ referenceLabel: '正确答案 · B', referenceText: 'Correct', referenceTextZh: '正确' });
  expect(radioCardContent('opi', card).referenceText).toBe('Legacy answer');
  expect(radioCardContent('sentences900', card)).toEqual({});
  expect(radioCardContent('storytelling', card)).toEqual({});
});

it('does not reuse an old duration hint for replaced audio', () => {
  const path = '/question-bank-assets/audio/radiotelephony/main/001.mp3';
  expect(radioDuration(path)).toBeGreaterThan(0);
  expect(radioDuration(`/question-bank-assets/revisions/radiotelephony/${'0'.repeat(64)}/audio/radiotelephony/main/001.mp3`)).toBe(0);
  expect(radioDuration(path, 15)).toBe(15);
});

it('excludes retired cards and keeps the source topic and card identities', () => {
  const bank = datasets[0];
  const category = bank.categories[0];
  const topic = category.topics[0];
  const card = topic.cards[0];
  const result = deriveRadioCatalogs([{ ...bank, categories: [{ ...category, topics: [{ ...topic, cards: [{ ...card, retired: true }, { ...card, id: 'active' }] }] }] }]);
  expect(result[0].tracks.map(track => track.id)).toEqual(['active']);
  expect(result[0].tracks[0]).toMatchObject({ categoryId: category.id, topicId: topic.id, stableIndex: 0 });
});

it.each(['selected', 'crash'] as const)('keeps picture context for OPI questions in the %s scope', scope => {
  const complete = deriveRadioCatalogs(datasets).find(bank => bank.bankId === 'opi')!;
  const pictures = new Set(complete.tracks.filter(track => track.materials?.length).map(track => track.id));
  const selected = deriveRadioCatalogs(datasets, { scope, target: 'icao4-first' }).find(bank => bank.bankId === 'opi')!;
  const selectedPictures = selected.tracks.filter(track => pictures.has(track.id));
  expect(selectedPictures.length).toBeGreaterThan(0);
  expect(selectedPictures.every(track => track.materials?.length)).toBe(true);
});

it('keeps a member bank selectable before its protected questions have loaded', () => {
  const bank = datasets.find(bank => bank.id === 'radiotelephony')!;
  const memberDirectory = { ...bank, categories: bank.categories.map(category => ({ ...category, topics: category.topics.map(topic => ({ ...topic, cards: [] })) })), access: { policyVersion: 'content-access-v2' as const, environment: 'production' as const, membershipActive: true, membershipExpiresAt: null } };
  expect(deriveRadioCatalogs([memberDirectory]).map(catalog => [catalog.bankId, catalog.tracks.length])).toEqual([['radiotelephony', 0]]);
  expect(deriveRadioCatalogs([{ ...memberDirectory, access: { ...memberDirectory.access, membershipActive: false } }])).toEqual([]);
});
