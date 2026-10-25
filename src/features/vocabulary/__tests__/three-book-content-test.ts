import catalog from '../../../../content/vocabulary/three-books/dataset.json';
import { validateVocabularyDataset } from '../repository';
import type { VocabularyDataset } from '../types';

it('keeps only three books, one owner per word, complete resources, and consistent source metadata',()=>{
  const data=validateVocabularyDataset(catalog as VocabularyDataset);
  expect(data.books.map(b=>b.id)).toEqual(['preview','icao4','icao5']);
  const words=data.books.flatMap(b=>b.words);
  expect(new Set(words.map(w=>w.word.toLowerCase())).size).toBe(words.length);
  expect(data.source.sourceRows).toBe(words.length);
  expect(data.source.validRows).toBe(words.length);
  expect(data.source.ignoredRows+data.source.invalidRows).toBe(0);
  for(const w of words){
    expect(w.word).not.toMatch(/[()（）/\r\n]/);
    expect(w.example).toBeTruthy();expect(w.exampleTranslation).toMatch(/[\u4e00-\u9fff]/);
    expect(w.pronunciationText).toBeTruthy();expect(w.frequency?.occurrences).toBeGreaterThanOrEqual(0);
  }
});

it('uses the approved difficulty anchors and complete-expression coverage instead of duplicate component cards',()=>{
  const words=validateVocabularyDataset(catalog as VocabularyDataset).books.flatMap(b=>b.words);
  for(const [term,book] of [['hydroplaning','icao5'],['combustible','icao5'],['pneumatic system','icao5'],['glideslope','icao4'],['runway excursion','icao4']]){
    expect(words.find(w=>w.word===term)?.bookId).toBe(book);
  }
  expect(words.some(w=>w.word==='radar vector')).toBe(true);
  expect(words.find(w=>w.id==='icao4-0129')?.word).toBe('CAT II ILS procedure');
  expect(words.some(w=>['radar','vector','pneumatic'].includes(w.word))).toBe(false);
  // A real English word in the manual source must not be mistaken for a JS placeholder.
  expect(words.find(w=>w.word==='undefined')?.id).toBe('preview-0877');
  expect(words.find(w=>w.word==='put into words')?.id).toBe('preview-0935');
});
