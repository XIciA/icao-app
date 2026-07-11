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
});
