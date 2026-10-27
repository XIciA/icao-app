import type { QuestionBankCard } from '../types';
import type { AnnotationTextBlockId } from './types';

export function annotationBlockText(card: QuestionBankCard | undefined, blockId: AnnotationTextBlockId): string {
  if (blockId === 'question') return card?.audioText ?? '';
  if (blockId === 'reference') return card?.referenceText ?? '';
  return card?.choices?.[Number(blockId.slice(7))] ?? '';
}
