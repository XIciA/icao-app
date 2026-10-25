/* eslint-disable import/first */
import sourceData from '@/features/question-bank/data/question-bank.json';
import publicData from '@/features/question-bank/data/question-bank-public.json';
import { questionBankRadioEntries } from '@icao/contracts';
import type { QuestionBankDataset } from '@/features/question-bank/types';
const mockGetTopic = jest.fn();
jest.mock('@/features/question-bank/data/repository.native', () => ({ questionBankRepository: { getTopic: (...args: unknown[]) => mockGetTopic(...args) } }));
import { deriveRadioCatalogs, withEmbeddedRadioDirectory } from '../catalog.native';
import { hydrateRadioCatalogTopic, mergeRadioCatalogProgress } from '../catalog-hydration.native';
import publicRelease from '@/features/question-bank/data/question-bank-public-release.json';
const source: QuestionBankDataset[] = sourceData as unknown as QuestionBankDataset[];
const embedded: QuestionBankDataset[] = publicData as unknown as QuestionBankDataset[];
const member = { policyVersion: 'content-access-v2' as const, environment: 'production' as const, membershipActive: true, membershipExpiresAt: null };
const directory = embedded.map(bank => ({ ...bank, access: member, contentRelease: publicRelease.sourceReleases.find(item => item.bankId === bank.id), categories: bank.categories.map(category => ({ ...category, topics: category.topics.map(topic => ({ ...topic, cards: [] })) })) }));

it.each(['all', 'selected', 'crash'] as const)('exposes every playable position before text loads, with exact %s scope counts', scope => {
  const selection = { scope, target: 'icao5-first' as const };
  const full = deriveRadioCatalogs(source, selection);
  const metadata = deriveRadioCatalogs(directory, selection);
  expect(metadata.map(bank => ({ id: bank.bankId, ids: bank.tracks.map(track => track.id) })))
    .toEqual(full.map(bank => ({ id: bank.bankId, ids: bank.tracks.map(track => track.id) })));
  expect(metadata.every(bank => bank.complete && bank.tracks.every(track => track.contentLoaded === false && !track.audioPath && !track.audioText))).toBe(true);
});

it('loads a selected final OPI topic directly without requesting preceding topics or changing totals', async () => {
  mockGetTopic.mockReset();
  const before = deriveRadioCatalogs(directory).find(bank => bank.bankId === 'opi')!;
  const last = before.tracks.at(-1)!;
  const fullTopic = source.find(bank => bank.id === 'opi')!.categories.find(category => category.id === last.categoryId)!.topics.find(topic => topic.id === last.topicId)!;
  mockGetTopic.mockResolvedValue({ ...fullTopic, radioEntries: questionBankRadioEntries(fullTopic), access: { level: 'member', declaredCardCount: fullTopic.cards.length, availableCardCount: fullTopic.cards.length } });
  const loaded = await hydrateRadioCatalogTopic(directory, last.bankId, last.categoryId, last.topicId);
  expect(mockGetTopic).toHaveBeenCalledTimes(1);
  expect(mockGetTopic.mock.calls[0].slice(0, 3)).toEqual(['opi', last.categoryId, last.topicId]);
  const after = deriveRadioCatalogs(loaded).find(bank => bank.bankId === 'opi')!;
  expect(after.tracks.map(track => track.id)).toEqual(before.tracks.map(track => track.id));
  expect(after.tracks.at(-1)).toMatchObject({ id: last.id, contentLoaded: true });
  expect(after.tracks.at(-1)!.audioPath).not.toBe('');
  const merged = mergeRadioCatalogProgress(directory, loaded);
  expect(deriveRadioCatalogs(merged).find(bank => bank.bankId === 'opi')!.tracks.at(-1)!.contentLoaded).toBe(true);
});

it('uses a bundled directory with an older API only when the exact source release matches', () => {
  const bank = directory.find(bank => bank.id === 'opi')!;
  const legacy = { ...bank, categories: bank.categories.map(category => ({ ...category, topics: category.topics.map(({ radioEntries: _entries, ...topic }) => topic) })) };
  const fallback = embedded.find(bank => bank.id === 'opi')!;
  expect(deriveRadioCatalogs([withEmbeddedRadioDirectory(legacy, fallback)])[0].complete).toBe(true);
  expect(withEmbeddedRadioDirectory({ ...legacy, contentRelease: { ...bank.contentRelease!, checksum: '0'.repeat(64) } } as QuestionBankDataset, fallback).categories[0].topics[0].radioEntries).toBeUndefined();
});

it('exposes locked member positions while preserving the same free playable subset', () => {
  const publicOnly = deriveRadioCatalogs(embedded);
  const withIndex = deriveRadioCatalogs(embedded.map(bank => ({ ...bank, categories: bank.categories.map(category => ({ ...category, topics: category.topics.map(({ radioEntries: _entries, ...topic }) => topic) })) })));
  expect(publicOnly.map(bank => bank.tracks.filter(track => !track.requiresMembership).map(track => track.id))).toEqual(withIndex.map(bank => bank.tracks.map(track => track.id)));
});

it('indexes audio cards only and never includes question/answer text or media URLs', () => {
  const cards = [
    { id: 'audio', taskTitle: 'Question 1', audio: '/private.mp3', audioText: 'secret', referenceText: 'answer', audioDurationSeconds: 12 },
    { id: 'retired', audio: '/retired.mp3', retired: true },
    { id: 'image', kind: 'image', image: '/image.jpg' },
    { id: 'text-only', taskTitle: 'No audio' },
  ];
  expect(questionBankRadioEntries({ cards })).toEqual([{ id: 'audio', title: 'Question 1', durationSeconds: 12 }]);
});
