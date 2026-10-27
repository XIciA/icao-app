import type { VocabularyBook } from './types';

// Client display copy; word content, IDs and saved progress remain owned by the catalog.
const descriptions: Partial<Record<VocabularyBook['id'], string>> = {
  preview: '提前熟悉民航基础词汇，为 ICAO 学习打好基础。',
  icao4: '掌握常见航空词汇与核心表达，夯实 ICAO 4 级备考基础。',
  icao5: '拓展进阶词汇，让航空英语描述更准确、表达更自然。',
  'question-bank-core': '精选题库高频词与短语，重点掌握航空义项和通话表达。单词右上角标注其在题库原文中的出现次数。',
};

export function vocabularyBookDescription(book: Pick<VocabularyBook, 'id' | 'description'>) {
  return descriptions[book.id] ?? book.description;
}
