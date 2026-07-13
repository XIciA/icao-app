import type { VocabularyBook, VocabularyDataset } from '../types';
import { validateVocabularyDataset } from '../repository';

function createBook(id: VocabularyBook['id'], count: number): VocabularyBook {
  const level = id === 'preview' ? 1 : id === 'icao4' ? 2 : 3;
  return {
    id,
    level,
    name: id,
    description: id,
    words: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
      bookId: id,
      level,
      word: `word ${index}`,
      meaning: `meaning ${index}`,
      example: `Example ${index}.`,
      exampleTranslation: `例句 ${index}`,
      source: { name: 'test', rowIndex: index, sourceNo: index },
    })),
  };
}

function dataset(): VocabularyDataset {
  return {
    schemaVersion: 1,
    version: 1,
    source: { name: 'test', generatedAt: '2026-07-13T00:00:00.000Z', sourceRows: 838, validRows: 838, ignoredRows: 0, invalidRows: 0 },
    books: [createBook('preview', 360), createBook('icao4', 372), createBook('icao5', 106)],
  };
}

describe('vocabulary resource validation', () => {
  it('accepts the frozen three-book 838-word shape', () => {
    expect(validateVocabularyDataset(dataset()).books.map((book) => book.words.length)).toEqual([360, 372, 106]);
  });

  it('rejects missing examples and duplicate identifiers', () => {
    const missingExample = dataset();
    missingExample.books[0]!.words[0]!.example = '';
    expect(() => validateVocabularyDataset(missingExample)).toThrow('invalid_vocabulary_word');

    const duplicate = dataset();
    duplicate.books[1]!.words[0]!.id = duplicate.books[0]!.words[0]!.id;
    expect(() => validateVocabularyDataset(duplicate)).toThrow('invalid_vocabulary_word');
  });
});
