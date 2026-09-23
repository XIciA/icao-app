import type { QuestionBankId } from '../types';

export type AnnotationToneKey = import('@icao/contracts/annotation-management').ManagedAnnotationTone;
export type AnnotationTextBlockId = 'question' | 'reference';

export type AnnotationDefinition = {
  id: string;
  label: string;
  color: AnnotationToneKey;
  builtIn?: boolean;
};

export type QuestionBankCardTarget = {
  bankId: QuestionBankId;
  categoryId: string;
  topicId: string;
  cardId: string;
};

export type AnnotationHighlight = {
  blockId: AnnotationTextBlockId;
  wordIndex: number;
  colorId: string;
  quote: string;
  sentence: string;
  contentFingerprint: string;
};

export type QuestionAnnotationEntry = QuestionBankCardTarget & {
  tagIds: string[];
  highlights: AnnotationHighlight[];
  note: string;
  updatedAt: string;
};

export type QuestionBankAnnotationStore = {
  version: 1 | 2;
  deletedDefinitions?: import('@icao/contracts/annotation-management').AnnotationDeletions;
  legacyImported: boolean;
  tagDefinitions: AnnotationDefinition[];
  highlightDefinitions: AnnotationDefinition[];
  entries: Record<string, QuestionAnnotationEntry>;
};

export const DEFAULT_ANNOTATION_TAGS: AnnotationDefinition[] = [
  { id: 'good', label: '好题', color: 'green', builtIn: true },
  { id: 'memory', label: '记忆', color: 'yellow', builtIn: true },
  { id: 'confused', label: '不懂', color: 'red', builtIn: true },
];

export const DEFAULT_ANNOTATION_HIGHLIGHTS: AnnotationDefinition[] = [
  { id: 'green', label: '重点', color: 'green', builtIn: true },
  { id: 'yellow', label: '记忆', color: 'yellow', builtIn: true },
  { id: 'red', label: '难点', color: 'red', builtIn: true },
];
