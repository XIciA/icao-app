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
it.each([[0,'题库原文未检出'],[1,'题库原文 1次'],[9,'题库原文 9次'],[10,'题库原文 10+次'],[49,'题库原文 10+次'],[50,'题库原文 50+次'],[99,'题库原文 50+次'],[100,'题库原文 100+次'],[199,'题库原文 100+次'],[200,'题库原文 200+次'],[499,'题库原文 200+次'],[500,'题库原文 500+次'],[999,'题库原文 500+次'],[1000,'题库原文 1000+次']])('shows a truthful frequency lower bound for %s',(count,label)=>{
  expect(vocabularyFrequencyLabel(frequency(count as number))).toBe(label);
});
it('shows a frequency band only on the new book',async()=>{
  const word={...(core.words[0] as VocabularyWord),frequency:frequency(76)};
  const view=await render(<VocabularyFrequency word={word}/>);
  expect(view.getByText('题库原文 50+次')).toBeTruthy();
  await view.rerender(<VocabularyFrequency word={legacy.books[0]!.words[0] as VocabularyWord}/>);
  expect(view.queryByText('题库原文 50+次')).toBeNull();
});
it('keeps the short study badge accessible and omits absent or zero frequency',async()=>{
  const word={...(core.words[0] as VocabularyWord),frequency:frequency(576)};
  const view=await render(<VocabularyFrequency compact word={word}/>);
  expect(view.getByText('500+')).toBeTruthy();
  expect(view.getByLabelText('题库原文 500+次')).toBeTruthy();
  expect(vocabularyFrequencyBadge(frequency(0))).toBeUndefined();
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
