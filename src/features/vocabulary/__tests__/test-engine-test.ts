import type { VocabularyBook, VocabularyTestAnswer, VocabularyTestMode } from '../types';
import {
  buildVocabularyTestResult,
  modeForNextQuestion,
  phaseForQuestion,
  selectVocabularyQuestion,
  toVocabularyTestWords,
} from '../test-engine';

function createBook(id: VocabularyBook['id'], count: number): VocabularyBook {
  const level = id === 'preview' ? 1 : id === 'icao4' ? 2 : 3;
  return {
    id,
    level,
    name: id,
    description: id,
    words: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
      bookId: id,
      level,
      word: `${id} word ${index}`,
      meaning: `释义 ${index}`,
      example: `Example ${index}.`,
      exampleTranslation: `例句 ${index}`,
      source: { name: 'test', rowIndex: index, sourceNo: index },
    })),
  };
}

function answer(question: NonNullable<ReturnType<typeof selectVocabularyQuestion>>, questionNo: number, correct: boolean): VocabularyTestAnswer {
  return { ...question.word, wordId: question.word.id, questionNo, mode: question.mode, phase: question.phase, correct };
}

describe('vocabulary adaptive test engine', () => {
  const words = toVocabularyTestWords([createBook('preview', 40), createBook('icao4', 40), createBook('icao5', 40)]);

  it('uses five level-4 calibration questions, then adapts without repeats', () => {
    const answers: VocabularyTestAnswer[] = [];
    const usedIds = new Set<string>();
    let mode: VocabularyTestMode = 'normal';
    for (let questionNo = 1; questionNo <= 30; questionNo += 1) {
      const question = selectVocabularyQuestion({ words, answers, usedIds, mode, questionNo, random: () => questionNo >= 21 ? 0 : 0.99 });
      expect(question).toBeDefined();
      if (!question) throw new Error('missing_question');
      if (questionNo <= 5) expect(question.word.level).toBe(4);
      usedIds.add(question.word.id);
      answers.push(answer(question, questionNo, questionNo <= 10));
      mode = question.mode;
    }
    expect(usedIds.size).toBe(30);
    expect(answers.slice(5).some((item) => item.level === 5)).toBe(true);
    expect(answers.slice(10).some((item) => item.level === 3)).toBe(true);
    expect(phaseForQuestion(1)).toBe('calibration');
    expect(phaseForQuestion(25)).toBe('adaptive');
    expect(phaseForQuestion(26)).toBe('verification');
  });

  it('raises or lowers one mode at each five-answer checkpoint', () => {
    const makeAnswers = (correct: boolean) => Array.from({ length: 5 }, (_, index) => ({
      wordId: `word-${index}`, word: `word-${index}`, meaning: '', bookId: 'icao4' as const, bookName: '', level: 4 as const,
      questionNo: index + 1, mode: 'normal' as const, phase: 'calibration' as const, correct,
    }));
    expect(modeForNextQuestion(makeAnswers(true), 'normal', 6)).toBe('strong');
    expect(modeForNextQuestion(makeAnswers(false), 'normal', 6)).toBe('weak');
    expect(modeForNextQuestion(makeAnswers(true), 'weak', 11)).toBe('normal');
    expect(modeForNextQuestion(makeAnswers(false), 'strong', 11)).toBe('normal');
  });

  it('builds a 30-answer result with level statistics and non-official verdict copy', () => {
    const answers = Array.from({ length: 30 }, (_, index): VocabularyTestAnswer => ({
      wordId: `word-${index}`,
      word: `word-${index}`,
      meaning: `meaning-${index}`,
      bookId: index < 10 ? 'preview' : index < 25 ? 'icao4' : 'icao5',
      bookName: 'book',
      level: index < 10 ? 3 : index < 25 ? 4 : 5,
      questionNo: index + 1,
      mode: 'normal',
      phase: phaseForQuestion(index + 1),
      correct: index < 26,
    }));
    const result = buildVocabularyTestResult(answers, '2026-07-13T00:00:00.000Z');
    expect(result).toMatchObject({ schemaVersion: 1, total: 30, correct: 26, totalRate: 87, completedAt: '2026-07-13T00:00:00.000Z' });
    expect(result.levelStats[3]).toMatchObject({ total: 10, correct: 10, rate: 100 });
    expect(result.levelStats[4]).toMatchObject({ total: 15, correct: 15, rate: 100 });
    expect(result.levelStats[5]).toMatchObject({ total: 5, correct: 1, rate: 20 });
    expect(result.judgment.length).toBeGreaterThan(10);
    expect(result.suggestion.length).toBeGreaterThan(10);
  });
});
