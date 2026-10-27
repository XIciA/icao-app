import { orderVocabularySession } from '../study-order';
import type { VocabularyState, VocabularyWord } from '../types';

const state: VocabularyState = { schemaVersion: 1, words: {}, updatedAt: '2026-10-26T00:00:00.000Z' };
const word = (id: string, occurrences: number) => ({ id, frequency: { occurrences } } as VocabularyWord);

it('orders by actual frequency inside the existing new/learned groups without changing progress', () => {
  const values = [word('rare', 1),word('known',2000),word('common',19),word('zero',0)];
  const progress: VocabularyState = { ...state, words: { known: {status:'known',favorite:true,updatedAt:state.updatedAt} } };
  const before = JSON.stringify(progress);
  expect(orderVocabularySession(values,progress,'frequency').map(w=>w.id)).toEqual(['common','rare','zero','known']);
  expect(values.map(w=>w.id)).toEqual(['rare','known','common','zero']);
  expect(JSON.stringify(progress)).toBe(before);
});

it('shuffles once, keeps every word exactly once, and preserves the learning-state partition', () => {
  const values = [word('a',1),word('b',2),word('c',3),word('d',4)];
  const progress: VocabularyState = { ...state, words: { d: {status:'forgot',favorite:false,updatedAt:state.updatedAt} } };
  const result = orderVocabularySession([...values,values[0]!],progress,'random',()=>0);
  expect(result.map(w=>w.id)).toEqual(['b','c','a','d']);
  expect(new Set(result.map(w=>w.id)).size).toBe(4);
});
