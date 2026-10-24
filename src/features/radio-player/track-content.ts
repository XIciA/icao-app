import type { QuestionBankId, QuestionBankTextCard } from '@/features/question-bank/types';
import durationHints from './audio-duration-hints.json';

const hints: Record<string, { checksum: string; duration: number }> = durationHints;

/** Duration hints are generated from checksum-verified source media. A newer
 * content-addressed replacement must supply its own duration instead. */
export function radioDuration(path: string, duration?: number) {
  if (duration && duration > 0) return duration;
  const revision = path.match(/^\/question-bank-assets\/revisions\/[^/]+\/([a-f0-9]{64})\/(.+)$/);
  const entry = hints[revision ? `/question-bank-assets/${revision[2]}` : path];
  return entry && (!revision || entry.checksum === revision[1]) ? entry.duration : 0;
}

export function radioCardContent(bankId: QuestionBankId, card: QuestionBankTextCard) {
  if (bankId === 'sentences900' || bankId === 'storytelling') return {};
  if (bankId === 'listening') {
    const index = card.correctChoiceIndex;
    if (index !== undefined && card.choices?.[index]) return {
      referenceLabel: `正确答案 · ${String.fromCharCode(65 + index)}`,
      referenceText: card.choices[index],
      referenceTextZh: card.choicesZh?.[index],
    };
    return { referenceLabel: '正确答案', referenceText: card.referenceText, referenceTextZh: card.referenceTextZh };
  }
  return { referenceLabel: '参考答案', referenceText: card.referenceText, referenceTextZh: card.referenceTextZh };
}
