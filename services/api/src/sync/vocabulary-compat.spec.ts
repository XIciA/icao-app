import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateVocabularyDocument, vocabularyRetiredIds } from '@icao/contracts';
import type { VocabularyBook, VocabularyDataset } from '@icao/contracts';
import { vocabularyPayloadForClient } from './vocabulary-compat';
import { mergeVocabularyDocuments, type VocabularyDocument } from './vocabulary-document';

const read=(name:string)=>JSON.parse(readFileSync(resolve(process.cwd(),'../../content/vocabulary',name),'utf8'));
const legacy=read('dataset.json') as VocabularyDataset,core=read('question-bank-core/book.json') as VocabularyBook,modern=read('three-books/dataset.json') as VocabularyDataset;
const oldWords=[...legacy.books.flatMap((b:{words:{id:string}[]})=>b.words),...core.words] as {id:string}[];
const oldIds=new Set(oldWords.map(w=>w.id));
const at='2026-10-25T00:00:00.000Z',newAt='2026-10-26T00:00:00.000Z';
const state:VocabularyDocument={schemaVersion:1,updatedAt:at,words:Object.fromEntries(oldWords.map((w,i)=>[w.id,{status:i%2?'forgot' as const:'known' as const,favorite:i%3===0,updatedAt:at}]))};

describe('mixed-version vocabulary sync',()=>{
  it('keeps unchanged core-only IDs, despite moving them into one of the three books',()=>{
    const oldAbort=core.words.find(w=>w.word==='abort')!;
    const newAbort=modern.books.flatMap(b=>b.words).find(w=>w.word==='abort')!;
    expect(newAbort.id).toBe(oldAbort.id);
  });
  it('projects canonical progress to real legacy IDs and round-trips without losing retained progress',()=>{
    const canonical=migrateVocabularyDocument(state);
    const projected=vocabularyPayloadForClient({documentKey:'vocabulary',document:canonical},undefined).document;
    expect(Object.keys(projected.words).every(id=>oldIds.has(id))).toBe(true);
    for(const w of oldWords){
      if(vocabularyRetiredIds[w.id]===null)expect(projected.words[w.id]).toBeUndefined();
      else expect(projected.words[w.id]).toBeDefined();
    }
    expect(migrateVocabularyDocument(projected).words).toEqual(canonical.words);
    expect(vocabularyPayloadForClient({documentKey:'vocabulary',document:canonical},'three-books-v3').document).toBe(canonical);
  });
  it('does not lose new-only progress or resurrect deleted cards when the old device returns its snapshot',()=>{
    const fresh=modern.books.flatMap(b=>b.words).find(w=>!oldIds.has(w.id))!;
    const migrated=migrateVocabularyDocument(state);
    const current:VocabularyDocument={...migrated,words:{...migrated.words,[fresh.id]:{status:'wrong',favorite:true,updatedAt:newAt}},updatedAt:newAt};
    const projected=vocabularyPayloadForClient({documentKey:'vocabulary',document:current},undefined).document;
    expect(projected.words[fresh.id]).toBeUndefined();
    const merged=mergeVocabularyDocuments(current,projected);
    expect(merged.words[fresh.id]).toEqual(current.words[fresh.id]);
    for(const [id,target] of Object.entries(vocabularyRetiredIds))if(target===null)expect(merged.words[id]).toBeUndefined();
  });
});
