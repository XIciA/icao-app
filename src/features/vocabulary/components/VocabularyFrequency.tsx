import { Tag } from '@/components/ui';
import type { VocabularyWord } from '../types';
import { vocabularyFrequencyLabel } from '../frequency';

export function VocabularyFrequency({ word }: { word: VocabularyWord }) {
  const label = vocabularyFrequencyLabel(word.frequency);
  return label ? <Tag tone="muted">{label}</Tag> : null;
}
