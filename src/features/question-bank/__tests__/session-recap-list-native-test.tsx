import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SessionRecapList, type SessionRecapViewState } from '../components/SessionRecapList.native';
import { AnnotationText } from '../components/AnnotationText';
import { contentFingerprint } from '../annotations/text';
import { questionBankCardTargetKey } from '../annotations/card-index.native';
import { DEFAULT_ANNOTATION_HIGHLIGHTS as mockHighlightDefinitions, DEFAULT_ANNOTATION_TAGS as mockTagDefinitions, type QuestionAnnotationEntry } from '../annotations/types';
import type { LearningRecord, QuestionBankDataset, QuestionBankStudyItem } from '../types';
import data from '../data/question-bank.json';

let mockEntries: Record<string, QuestionAnnotationEntry> = {};
let mockFavorites: Record<string, boolean> = {};
const mockPersistFavorite = jest.fn(async () => undefined);
jest.mock('../annotations/use-question-annotations-with-save.native', () => ({ useQuestionAnnotations: () => ({
  hydrated: true, store: { entries: mockEntries }, tagDefinitions: mockTagDefinitions, highlightDefinitions: mockHighlightDefinitions,
}) }));
jest.mock('@/features/vocabulary/progress-store.native', () => ({ useWordFavorites: () => {
  const { useState } = jest.requireActual('react');
  const [favorites, setFavorites] = useState(mockFavorites);
  return { ready: true, isFavorite: ({ word }: { word: string }) => !!favorites[word], setFavorite: async ({ word }: { word: string }, value: boolean) => {
    await mockPersistFavorite(); setFavorites((current: Record<string, boolean>) => ({ ...current, [word]: value }));
  } };
} }));
jest.mock('@/features/sync/learning-sync.native', () => ({ captureLearningWriteContext: () => ({}), assertLearningWriteContext: () => undefined }));
jest.mock('../components/LookupPronunciation', () => ({ LookupPronunciation: () => null }));

const dataset = data.find(bank => bank.id === 'sentences900') as QuestionBankDataset;
const category = dataset.categories[0], topic = category.topics[0];
const card = { ...topic.cards[0], id: 'recap-card', taskTitle: 'Sentence647', audioText: 'Request diversion to suitable terrain.', referenceText: 'Use a suitable airport.', choices: ['Hold position.', 'Request diversion.'] };
const item = { id: card.id, dataset, category, topic, card } as QuestionBankStudyItem;
const makeRecord = (items: QuestionBankStudyItem[] = [item]): LearningRecord => ({
  id: 'recap', bankId: dataset.id, bankTitle: dataset.title, categoryTitle: category.name, topicTitle: topic.name,
  completedCount: 1, totalCount: 1, correctCount: 0, reason: 'complete', durationSeconds: 30, createdAt: '2026-11-04',
  sessionRecap: { annotatedCardIds: [card.id], words: [{ word: 'terrain', favorited: false }, { word: 'diversion', favorited: true }] },
  studyReview: { schemaVersion: 1, items, states: {}, answers: {} },
});
const definitions = new Map(mockHighlightDefinitions.map(d => [d.id, d]));
beforeEach(() => { mockEntries = {}; mockFavorites = { terrain: true, diversion: false }; mockPersistFavorite.mockReset().mockResolvedValue(undefined); });

it('merges a question once with original-text highlights, tags and its note, including marked options', async () => {
  const entry: QuestionAnnotationEntry = { bankId: dataset.id, categoryId: category.id, topicId: topic.id, cardId: card.id, tagIds: ['memory', 'confused'], note: '注意备降表达', updatedAt: '2026-11-04', highlights: [
    { blockId: 'question', wordIndex: 1, colorId: 'green', quote: 'diversion', sentence: card.audioText, contentFingerprint: contentFingerprint(card.audioText) },
    { blockId: 'choice-1', wordIndex: 0, colorId: 'yellow', quote: 'Request', sentence: 'Request diversion.', contentFingerprint: contentFingerprint('Request diversion.') },
  ] };
  mockEntries[questionBankCardTargetKey(entry)] = entry;
  const open = jest.fn();
  const screen = await render(<SessionRecapList kind="annotations" record={makeRecord([item, { ...item, id: 'repeated' }])} onBack={jest.fn()} onOpen={open} />);
  expect(screen.getAllByLabelText('查看标注题目 Sentence647')).toHaveLength(1);
  expect(screen.getByLabelText('已添加2个标签：记忆、不懂')).toBeTruthy();
  expect(screen.getByLabelText('高亮词：diversion')).toBeTruthy();
  expect(screen.getByLabelText('高亮词：Request')).toBeTruthy();
  expect(screen.getByText('选项 B')).toBeTruthy(); expect(screen.getByText('注意备降表达')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('查看标注题目 Sentence647')); expect(open).toHaveBeenCalledWith('repeated');
});

it('never paints old text positions or a highlight from another block onto current text', async () => {
  const text = 'Request diversion.';
  const screen = await render(<AnnotationText sourceText={text} blockId="question" definitions={definitions} highlights={[
    { blockId: 'question', wordIndex: 0, colorId: 'green', contentFingerprint: contentFingerprint('Old question.'), quote: 'Old', sentence: 'Old question.' },
    { blockId: 'reference', wordIndex: 1, colorId: 'yellow', contentFingerprint: contentFingerprint(text), quote: 'diversion.', sentence: text },
  ]} />);
  expect(screen.queryAllByLabelText(/高亮词/)).toHaveLength(0);
  expect(screen.getByText('Request')).toBeTruthy();
});

it('filters by current favorites, toggles in-place, and retains the view state for source return', async () => {
  const remember = jest.fn(), open = jest.fn();
  const initial: SessionRecapViewState = { onlyFavorites: true, scrollY: 85 };
  const screen = await render(<SessionRecapList kind="words" record={makeRecord()} onBack={jest.fn()} onOpen={open} initialViewState={initial} onViewStateChange={remember} />);
  expect(screen.getByText('terrain')).toBeTruthy(); expect(screen.queryByText('diversion')).toBeNull();
  expect(screen.queryByText('全部查词')).toBeNull(); expect(screen.queryByText('查词与收藏')).toBeNull();
  await fireEvent.press(screen.getByLabelText('查看来源 Sentence647')); expect(open).toHaveBeenCalledWith(card.id);
  await fireEvent.press(screen.getByLabelText('取消收藏 terrain'));
  await waitFor(() => expect(screen.getByText('本次查词中还没有已收藏的单词')).toBeTruthy());
  await fireEvent.press(screen.getByText('查看本次查词'));
  expect(screen.getByText('diversion')).toBeTruthy();
  expect(remember).toHaveBeenLastCalledWith(expect.objectContaining({ onlyFavorites: false, scrollY: 85 }));
  await fireEvent.press(screen.getByLabelText('收藏 diversion'));
  await waitFor(() => expect(screen.getByLabelText('取消收藏 diversion')).toBeTruthy());
});

it('keeps a failed favorite write retryable without showing a false saved state', async () => {
  mockPersistFavorite.mockRejectedValueOnce(new Error('storage full'));
  const screen = await render(<SessionRecapList kind="words" record={makeRecord()} onBack={jest.fn()} onOpen={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('收藏 diversion'));
  await waitFor(() => expect(screen.getByText('保存尚未完成')).toBeTruthy());
  expect(screen.queryByLabelText('取消收藏 diversion')).toBeNull();
  await fireEvent.press(screen.getByText('重试保存'));
  await waitFor(() => expect(screen.getByLabelText('取消收藏 diversion')).toBeTruthy());
});

it('collapses multiple matching sources and includes words found in options', async () => {
  const second = { ...item, id: 'second', card: { ...card, id: 'second', taskTitle: 'Sentence748', audioText: 'Hold position.', referenceText: '', choices: ['diversion terrain'] } } as QuestionBankStudyItem;
  const open = jest.fn();
  const screen = await render(<SessionRecapList kind="words" record={makeRecord([item, second])} onBack={jest.fn()} onOpen={open} />);
  expect(screen.queryByLabelText('查看来源 Sentence748')).toBeNull();
  await fireEvent.press(screen.getAllByText('来源：Sentence647 等 2 题')[0]);
  await fireEvent.press(screen.getByLabelText('查看来源 Sentence748'));
  expect(open).toHaveBeenCalledWith('second');
});
