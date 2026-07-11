import Storage from 'expo-sqlite/kv-store';

import {
  ANNOTATION_STORAGE_KEY,
  createEmptyAnnotationEntry,
  normalizeAnnotationStore,
  readAnnotationStore,
  resetAnnotationStoreCacheForTests,
  setAnnotationEntry,
  updateAnnotationStore,
} from '../annotations/annotation-store';
import { questionBankCardTargetKey } from '../annotations/card-index';
import { sqliteLearningStore } from '../platform/learning-store';

jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      clear: jest.fn(async () => values.clear()),
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    },
  };
});

jest.mock('../data/repository', () => ({
  getEmbeddedQuestionBanks: () => [{
    id: 'listening',
    title: '听力',
    nameEn: 'Listening',
    description: '',
    summary: '',
    enabled: true,
    statusLabel: '',
    icon: 'headphones',
    declaredTopicCount: 1,
    declaredCardCount: 1,
    categoryUnit: '分类',
    topicUnit: '主题',
    cardUnit: '题',
    study: { interaction: 'choices', tools: { recorder: false, choices: true, notes: true, dictionary: true, highlights: true, tags: true }, copy: { transcriptLabel: '原文', referenceLabel: '答案' }, audioTitlePattern: 'card-title', consoleTabs: ['notes'] },
    categories: [{ id: 'category-1', name: '分类', declaredTopicCount: 1, declaredCardCount: 1, topics: [{ id: 'topic-1', name: '主题', declaredCardCount: 1, cards: [{ id: 'card-1', taskTitle: '原题', audioText: 'One two. Three four?', referenceText: 'Reference answer.' }] }] }],
  }],
}));

jest.mock('../platform/learning-store', () => ({
  sqliteLearningStore: { getTopicStates: jest.fn() },
}));

const target = { bankId: 'listening' as const, categoryId: 'category-1', topicId: 'topic-1', cardId: 'card-1' };

describe('annotation store', () => {
  beforeEach(async () => {
    await Storage.clear();
    resetAnnotationStoreCacheForTests();
    jest.mocked(sqliteLearningStore.getTopicStates).mockReset();
  });

  it('imports legacy annotations once and enriches highlight context', async () => {
    jest.mocked(sqliteLearningStore.getTopicStates).mockResolvedValue({
      'card-1': {
        visited: true,
        completed: true,
        tagIds: ['memory'],
        highlights: [{ blockId: 'question', wordIndex: 1, colorId: 'yellow', quote: 'two.' }],
        note: '旧笔记',
        updatedAt: '2026-07-10T00:00:00.000Z',
      },
    });

    const first = await readAnnotationStore();
    const entry = first.entries[questionBankCardTargetKey(target)];
    expect(entry.tagIds).toEqual(['memory']);
    expect(entry.note).toBe('旧笔记');
    expect(entry.highlights[0]).toMatchObject({ quote: 'two.', sentence: 'One two.' });
    expect(entry.highlights[0].contentFingerprint).toBeTruthy();

    resetAnnotationStoreCacheForTests();
    await readAnnotationStore({ force: true });
    expect(sqliteLearningStore.getTopicStates).toHaveBeenCalledTimes(1);
    expect(Storage.setItem).toHaveBeenCalledWith(ANNOTATION_STORAGE_KEY, expect.any(String));
  });

  it('removes an entry after its final annotation is cleared', async () => {
    jest.mocked(sqliteLearningStore.getTopicStates).mockResolvedValue({});
    await readAnnotationStore();
    await updateAnnotationStore((store) => setAnnotationEntry(store, target, { ...createEmptyAnnotationEntry(target), note: '保留' }));
    await updateAnnotationStore((store) => setAnnotationEntry(store, target, createEmptyAnnotationEntry(target)));
    const result = await readAnnotationStore();
    expect(result.entries[questionBankCardTargetKey(target)]).toBeUndefined();
  });

  it('normalizes malformed data and keeps built-in definitions', () => {
    const result = normalizeAnnotationStore({
      legacyImported: true,
      tagDefinitions: [{ id: 'custom', label: 'abcdefghijk', color: 'blue' }, { id: '', label: '', color: 'pink' }],
      entries: { bad: { bankId: 'unknown' } },
    });
    expect(result.tagDefinitions.map((item) => item.id)).toEqual(['good', 'memory', 'confused', 'custom']);
    expect(result.tagDefinitions.at(-1)?.label).toBe('abcdefgh');
    expect(result.entries).toEqual({});
  });

  it('keeps rapid queued updates instead of dropping fields', async () => {
    jest.mocked(sqliteLearningStore.getTopicStates).mockResolvedValue({});
    await readAnnotationStore();
    const first = updateAnnotationStore((store) => setAnnotationEntry(store, target, { ...createEmptyAnnotationEntry(target), note: 'A' }));
    const second = updateAnnotationStore((store) => {
      const entry = store.entries[questionBankCardTargetKey(target)] ?? createEmptyAnnotationEntry(target);
      return setAnnotationEntry(store, target, { ...entry, tagIds: ['good'] });
    });
    await Promise.all([first, second]);
    const result = await readAnnotationStore();
    expect(result.entries[questionBankCardTargetKey(target)]).toMatchObject({ note: 'A', tagIds: ['good'] });
  });
});
