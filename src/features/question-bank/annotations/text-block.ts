import type { QuestionBankCard } from '../types';
import type { AnnotationTextBlockId } from './types';

export function annotationBlockText(card: QuestionBankCard | undefined, blockId: AnnotationTextBlockId): string {
  if (blockId === 'question') return card?.audioText ?? '';
  if (blockId === 'reference') return card?.referenceText ?? '';
  return card?.choices?.[Number(blockId.slice(7))] ?? '';
}

export function annotationCardTextBlocks(card: QuestionBankCard): AnnotationTextBlockId[] {
  return ['question', 'reference', ...(card.choices ?? []).map((_, index) => `choice-${index}`)] as AnnotationTextBlockId[];
}
