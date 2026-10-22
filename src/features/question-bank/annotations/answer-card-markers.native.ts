import type { QuestionBankStudyItem } from '../types';
import type { QuestionBankAnnotationStore } from './types';
import { questionBankCardTargetKey } from './card-index.native';
import { annotationToneColors } from './colors.native';
import { contentFingerprint } from './text';

export function answerCardMarkers(items: readonly QuestionBankStudyItem[], store: QuestionBankAnnotationStore) {
  return items.map(item => {
    const entry = store.entries[questionBankCardTargetKey({ bankId: item.dataset.id, categoryId: item.category.id, topicId: item.topic.id, cardId: item.card.id })];
    const tags = (entry?.tagIds ?? []).flatMap(id => {
      const definition = store.tagDefinitions.find(tag => tag.id === id);
      return definition ? [annotationToneColors[definition.color]] : [];
    });
    const highlights = (entry?.highlights ?? []).flatMap(highlight => {
      const source = highlight.blockId === 'question' ? item.card.audioText ?? '' : item.card.referenceText ?? '';
      if (highlight.contentFingerprint !== contentFingerprint(source)) return [];
      const definition = store.highlightDefinitions.find(value => value.id === highlight.colorId);
      return definition ? [annotationToneColors[definition.color]] : [];
    });
    return { tags: [...new Set(tags)], highlights: [...new Set(highlights)] };
  });
}
