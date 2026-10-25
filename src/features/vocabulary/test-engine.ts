import type {
  VocabularyBook,
  VocabularyBookId,
  VocabularyLevelStats,
  VocabularyTestAnswer,
  VocabularyTestLevel,
  VocabularyTestMode,
  VocabularyTestPhase,
  VocabularyTestResult,
  VocabularyTestVerdict,
} from './types';

export const VOCABULARY_TEST_TOTAL = 30;
export const VOCABULARY_TEST_SECONDS = 10;

export type VocabularyTestWord = {
  id: string;
  word: string;
  meaning: string;
  bookId: VocabularyBookId;
  bookName: string;
  level: VocabularyTestLevel;
};

export type VocabularyTestQuestion = {
  word: VocabularyTestWord;
  mode: VocabularyTestMode;
  phase: VocabularyTestPhase;
};

const levels: VocabularyTestLevel[] = [3, 4, 5];
const levelByBook: Partial<Record<VocabularyBookId, VocabularyTestLevel>> = { preview: 3, icao4: 4, icao5: 5 };
const modeOrder: VocabularyTestMode[] = ['weak', 'normal', 'strong'];
const adaptive: Record<VocabularyTestMode, Partial<Record<VocabularyTestLevel, number>>> = {
  weak: { 3: 60, 4: 40 },
  normal: { 3: 20, 4: 60, 5: 20 },
  strong: { 4: 40, 5: 60 },
};
const verification: Record<VocabularyTestMode, Partial<Record<VocabularyTestLevel, number>>> = {
  weak: { 3: 60, 4: 40 },
  normal: { 4: 80, 5: 20 },
  strong: { 4: 30, 5: 70 },
};

export function toVocabularyTestWords(books: VocabularyBook[]): VocabularyTestWord[] {
  return books.filter(book => book.assessmentEligible !== false && levelByBook[book.id] !== undefined).flatMap((book) => book.words.map((word) => ({
    id: word.id,
    word: word.word,
    meaning: word.meaning,
    bookId: book.id,
    bookName: book.name,
    level: levelByBook[book.id]!,
  })));
}

export function phaseForQuestion(questionNo: number): VocabularyTestPhase {
  if (questionNo <= 5) return 'calibration';
  if (questionNo >= 26) return 'verification';
  return 'adaptive';
}

function answerRate(answers: VocabularyTestAnswer[]) {
  return answers.length ? answers.filter((answer) => answer.correct).length / answers.length : 0;
}

export function modeForNextQuestion(answers: VocabularyTestAnswer[], current: VocabularyTestMode, questionNo: number) {
  if (questionNo <= 5) return 'normal' as const;
  if (questionNo === 6) {
    const correct = answers.slice(0, 5).filter((answer) => answer.correct).length;
    return correct <= 2 ? 'weak' as const : correct === 3 ? 'normal' as const : 'strong' as const;
  }
  if ([11, 16, 21, 26].includes(questionNo)) {
    const rate = answerRate(answers.slice(-5));
    const index = modeOrder.indexOf(current);
    if (rate >= 0.8) return modeOrder[Math.min(index + 1, modeOrder.length - 1)]!;
    if (rate < 0.5) return modeOrder[Math.max(index - 1, 0)]!;
  }
  return current;
}

function weightedLevel(distribution: Partial<Record<VocabularyTestLevel, number>>, random: () => number) {
  const entries = levels.map((level) => ({ level, weight: distribution[level] ?? 0 })).filter((entry) => entry.weight > 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.level;
  }
  return entries.at(-1)?.level ?? 4;
}

function neighbors(level: VocabularyTestLevel): VocabularyTestLevel[] {
  return level === 3 ? [3, 4, 5] : level === 4 ? [4, 3, 5] : [5, 4, 3];
}

export function selectVocabularyQuestion({
  words,
  answers,
  usedIds,
  mode,
  questionNo,
  random = Math.random,
}: {
  words: VocabularyTestWord[];
  answers: VocabularyTestAnswer[];
  usedIds: Set<string>;
  mode: VocabularyTestMode;
  questionNo: number;
  random?: () => number;
}): VocabularyTestQuestion | undefined {
  const nextMode = modeForNextQuestion(answers, mode, questionNo);
  const phase = phaseForQuestion(questionNo);
  const distribution = phase === 'calibration' ? { 4: 100 } : phase === 'verification' ? verification[nextMode] : adaptive[nextMode];
  const preferred = weightedLevel(distribution, random);
  const remaining = words.filter((word) => !usedIds.has(word.id));
  for (const level of neighbors(preferred)) {
    const candidates = remaining.filter((word) => word.level === level);
    if (candidates.length) return { word: candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)]!, mode: nextMode, phase };
  }
  return undefined;
}

function percentage(correct: number, total: number) {
  return total ? Math.round((correct / total) * 100) : null;
}

export function buildLevelStats(answers: VocabularyTestAnswer[]): Record<VocabularyTestLevel, VocabularyLevelStats> {
  return Object.fromEntries(levels.map((level) => {
    const values = answers.filter((answer) => answer.level === level);
    const correct = values.filter((answer) => answer.correct).length;
    return [level, { level, correct, total: values.length, rate: percentage(correct, values.length) }];
  })) as Record<VocabularyTestLevel, VocabularyLevelStats>;
}

export function classifyVocabularyResult(totalRate: number, stats: Record<VocabularyTestLevel, VocabularyLevelStats>): VocabularyTestVerdict {
  const level4 = stats[4].rate ?? totalRate;
  const level5 = stats[5].rate ?? totalRate;
  if (stats[5].total >= 3 && level5 >= 85 && totalRate >= 90) return '5级潜力';
  if (stats[4].total >= 5 && stats[5].total >= 3 && level4 >= 85 && level5 >= 70) return '4级冲刺';
  if ((stats[4].total >= 5 && level4 < 60) || (stats[4].total < 5 && totalRate < 60)) return '2级风险';
  if ((stats[4].total >= 5 && level4 >= 70) || totalRate >= 75) return '3级基础达标';
  return '2级风险';
}

export function vocabularyResultCopy(verdict: VocabularyTestVerdict) {
  if (verdict === '5级潜力') return { judgment: '你的高阶词汇识别速度和稳定性都不错，已经具备接近 ICAO 5 级词汇要求的潜力。', suggestion: '重点复习 ICAO 5 冲刺错词，并把已认识单词放进真实问答表达中巩固。' };
  if (verdict === '4级冲刺') return { judgment: '你的 4 级核心词汇有一定基础，但 5 级冲刺词汇还需要继续巩固。', suggestion: '重点学习 ICAO 5 冲刺错词，同时保留少量 ICAO 4 必会复习。' };
  if (verdict === '3级基础达标') return { judgment: '你的基础词汇已有一定稳定性，但 4 级核心词汇还没有完全扎实。', suggestion: '重点学习 ICAO 4 必会错词，并补充 ICAO 5 冲刺基础词。' };
  return { judgment: '你的基础词汇识别还不够稳定，测试中出现了较多基础词汇不确定或不认识的情况。', suggestion: '先回到考前预习和 ICAO 4 必会高频词，优先清理本次错词。' };
}

export function buildVocabularyTestResult(answers: VocabularyTestAnswer[], completedAt = new Date().toISOString()): VocabularyTestResult {
  const correct = answers.filter((answer) => answer.correct).length;
  const totalRate = percentage(correct, answers.length) ?? 0;
  const levelStats = buildLevelStats(answers);
  const verdict = classifyVocabularyResult(totalRate, levelStats);
  return { schemaVersion: 1, completedAt, total: answers.length, correct, totalRate, verdict, ...vocabularyResultCopy(verdict), levelStats, answers };
}
