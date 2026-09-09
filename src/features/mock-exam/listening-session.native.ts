import { LISTENING_EXAM_ITEM_COUNT, type ListeningExamRange } from './listening-exam';
import type { QuestionBankStudyPackage } from '@/features/question-bank/types';

/** The paper is fixed at entry; only an exact contiguous 20-question block is scored. */
export function resolveListeningExamRange(paper?: QuestionBankStudyPackage): ListeningExamRange | undefined {
  if (!paper || paper.record.recordType !== 'mock_exam') return undefined;
  const indexes = paper.items.flatMap((item, index) => item.dataset.id === 'listening' ? [index] : []);
  if (indexes.length !== LISTENING_EXAM_ITEM_COUNT || indexes[19] - indexes[0] !== 19) return undefined;
  return { startIndex: indexes[0], endIndex: indexes[19], items: paper.items.slice(indexes[0], indexes[19] + 1) };
}
