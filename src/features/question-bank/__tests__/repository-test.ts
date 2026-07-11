import { embeddedQuestionBankRepository, getEmbeddedQuestionBankIds } from '../data/repository';
import audioIndex from '../data/audio-index.json';

describe('embeddedQuestionBankRepository', () => {
  it('keeps the canonical five-bank registry intact', () => {
    expect(getEmbeddedQuestionBankIds()).toEqual([
      'listening',
      'sentences900',
      'radiotelephony',
      'opi',
      'storytelling',
    ]);
  });

  it('loads the real listening dataset and canonical audio path', async () => {
    const listening = await embeddedQuestionBankRepository.getDataset('listening');

    expect(listening?.declaredTopicCount).toBe(4);
    expect(listening?.declaredCardCount).toBe(631);
    expect(listening?.categories).toHaveLength(4);
    expect(listening?.categories[0].topics[0].cards[0]).toMatchObject({
      id: 'listening-main-001',
      audio: '/question-bank-assets/audio/listening/main/001.mp3',
      correctChoiceIndex: 1,
    });
    expect(audioIndex.modules.listening.main[0]).toMatchObject({
      file: '/question-bank-assets/audio/listening/main/001.mp3',
      sizeBytes: 152876,
    });
  });

  it('keeps all 4,947 cards and canonical audio references reconcilable', () => {
    const files = new Set<string>();
    const collectFiles = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collectFiles);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      if (typeof object.file === 'string') files.add(object.file);
      Object.values(object).forEach(collectFiles);
    };
    collectFiles(audioIndex.modules);

    const banks = getEmbeddedQuestionBankIds().map((id) => embeddedQuestionBankRepository.getDataset(id));
    return Promise.all(banks).then((datasets) => {
      const cards = datasets.flatMap((dataset) => dataset?.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards)) ?? []);
      expect(datasets.map((dataset) => dataset?.declaredCardCount)).toEqual([631, 900, 1851, 1269, 296]);
      expect(cards).toHaveLength(4947);
      expect(cards.filter((card) => card.audio && !files.has(card.audio))).toEqual([]);
    });
  });
});
