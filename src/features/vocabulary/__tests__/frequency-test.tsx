import { render } from '@testing-library/react-native';
import type { VocabularyFrequency as Frequency } from '@icao/contracts';
import core from '../../../../content/vocabulary/question-bank-core/book.json';
import legacy from '../../../../content/vocabulary/dataset.json';
import { vocabularyFrequencyBadge, vocabularyFrequencyLabel } from '../frequency';
import { VocabularyFrequency } from '../components/VocabularyFrequency';
import { validateVocabularyDataset } from '../repository';
import { toVocabularyTestWords } from '../test-engine';
import type { VocabularyBook, VocabularyDataset, VocabularyWord } from '../types';

const frequency=(occurrences:number):Frequency=>({scope:'question-bank-audio-text',occurrences,cardCount:occurrences,byBank:{listening:occurrences},corpusVersion:26,corpusChecksum:'a'.repeat(64)});
it.each([[0,5],[1,5],[9,5],[10,10],[19,10],[20,20],[29,20],[30,30],[49,40],[50,50],[99,50],[100,100],[199,100],[200,200],[300,300],[499,300],[500,500],[999,500],[1000,1000],[2000,2000]])('shows the product frequency tier for %s',(count,band)=>{
  expect(vocabularyFrequencyLabel(frequency(count!))).toBe(`词频档位 ${band}+`);
});
it('shows a frequency band only on the new book',async()=>{
  const word={...(core.words[0] as VocabularyWord),frequency:frequency(76)};
  const view=await render(<VocabularyFrequency word={word}/>);
  expect(view.getByText('词频档位 50+')).toBeTruthy();
  await view.rerender(<VocabularyFrequency word={legacy.books[0]!.words[0] as VocabularyWord}/>);
  expect(view.queryByText('词频档位 50+')).toBeNull();
});
it('keeps the short study badge accessible, includes zero in the lowest tier and omits absent frequency',async()=>{
  const word={...(core.words[0] as VocabularyWord),frequency:frequency(576)};
  const view=await render(<VocabularyFrequency compact word={word}/>);
  expect(view.getByText('500+')).toBeTruthy();
  expect(view.getByLabelText('词频档位 500+')).toBeTruthy();
  expect(vocabularyFrequencyBadge(frequency(0))).toBe('5+');
  await view.rerender(<VocabularyFrequency compact word={legacy.books[0]!.words[0] as VocabularyWord}/>);
  expect(view.queryByText('500+')).toBeNull();
});
it('validates both catalog generations, preserves old books and keeps ungraded core entries out of level assessment',()=>{
  const old=legacy as VocabularyDataset;
  const expanded={...old,version:2,books:[...old.books,core as VocabularyBook]};
  expect(validateVocabularyDataset(old)).toBe(old);
  expect(validateVocabularyDataset(expanded).books.slice(0,3)).toEqual(old.books);
  expect(toVocabularyTestWords(expanded.books)).toEqual(toVocabularyTestWords(old.books));
  const bad=JSON.parse(JSON.stringify(expanded)) as VocabularyDataset;
  bad.books[3]!.words[0]!.frequency!.occurrences=-1;
  expect(()=>validateVocabularyDataset(bad)).toThrow('invalid_vocabulary_frequency');
});
