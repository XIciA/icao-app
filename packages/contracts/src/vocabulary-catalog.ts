import type { VocabularyDataset } from './index';

/** Accept existing cached/legacy catalogs as well as the opt-in expanded catalog. */
export function validateVocabularyCatalog(dataset: VocabularyDataset) {
  const expected: Record<string, number> = { preview: 360, icao4: 372, icao5: 106, 'question-bank-core': 409 };
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.books) || ![3, 4].includes(dataset.books.length)) throw new Error('invalid_vocabulary_dataset');
  const books = new Set<string>(), ids = new Set<string>();
  for (const book of dataset.books) {
    if (books.has(book.id) || expected[book.id] !== book.words?.length) throw new Error(`invalid_vocabulary_book:${book.id}`);
    books.add(book.id);
    if (book.id === 'question-bank-core' && book.assessmentEligible !== false) throw new Error('invalid_vocabulary_assessment');
    for (const word of book.words) {
      if (ids.has(word.id) || word.bookId !== book.id || !word.word?.trim() || !word.meaning?.trim() || !word.example?.trim() || !word.exampleTranslation?.trim()) throw new Error(`invalid_vocabulary_word:${word.id}`);
      ids.add(word.id);
      if (book.id === 'question-bank-core') {
        const f = word.frequency;
        if (!word.pronunciationText?.trim() || !f || f.scope !== 'question-bank-audio-text' || !Number.isInteger(f.occurrences) || f.occurrences < 0
          || !Number.isInteger(f.cardCount) || f.cardCount < 0 || f.cardCount > f.occurrences || !Number.isInteger(f.corpusVersion) || f.corpusVersion < 1
          || !/^[a-f0-9]{64}$/.test(f.corpusChecksum) || !f.byBank || Object.values(f.byBank).some(n => !Number.isInteger(n) || n < 0)
          || Object.values(f.byBank).reduce((sum,n) => sum+n,0) !== f.occurrences) throw new Error(`invalid_vocabulary_frequency:${word.id}`);
      }
    }
  }
  if (!['preview','icao4','icao5'].every(id => books.has(id)) || dataset.books.length === 3 && books.has('question-bank-core')) throw new Error('invalid_vocabulary_dataset');
  return dataset;
}
