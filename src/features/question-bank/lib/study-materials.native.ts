import type { QuestionBankImageCard, QuestionBankStudyItem } from '../types';

// OPI images are context for the questions in their source topic. Keep those
// references when a package contains only some questions from that topic.
export function withStudyMaterials(item: QuestionBankStudyItem): QuestionBankStudyItem {
  if (item.materials || item.dataset.id !== 'opi' || item.card.kind === 'image') return item;
  const materials = item.topic.cards.filter((card): card is QuestionBankImageCard => card.kind === 'image');
  return materials.length ? { ...item, materials } : item;
}
